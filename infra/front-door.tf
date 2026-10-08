resource "azurerm_cdn_frontdoor_profile" "app" {
  name                = "${var.name}-frontdoor"
  resource_group_name = azurerm_resource_group.app.name
  sku_name            = "Standard_AzureFrontDoor"
  tags                = local.tags

  lifecycle {
    ignore_changes = [
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}

resource "azurerm_cdn_frontdoor_endpoint" "app" {
  name                     = "${var.name}-public"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
  tags                     = local.tags

  lifecycle {
    ignore_changes = [
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}

resource "azurerm_cdn_frontdoor_origin_group" "origin" {
  for_each                 = toset(["api", "candidate", "frontend"])
  name                     = each.key
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
  session_affinity_enabled = false
  health_probe {
    interval_in_seconds = 60
    path                = each.key == "frontend" ? "/index.html" : "/api/v1/health"
    protocol            = "Https"
    request_type        = "GET"
  }
  load_balancing {
    sample_size                 = 4
    successful_samples_required = 3
  }
}

locals {
  api_origin_host = var.bootstrap_image == null ? "${var.name}-api.${azurerm_container_app_environment.app.default_domain}" : azurerm_container_app.api[0].ingress[0].fqdn
  origin_hosts = {
    api       = local.api_origin_host
    candidate = "${var.name}-api---candidate.${azurerm_container_app_environment.app.default_domain}"
    frontend  = azurerm_storage_account.frontend.primary_web_host
  }
}

resource "azurerm_cdn_frontdoor_origin" "origin" {
  for_each                       = local.origin_hosts
  name                           = each.key
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.origin[each.key].id
  enabled                        = true
  host_name                      = each.value
  origin_host_header             = each.value
  http_port                      = 80
  https_port                     = 443
  certificate_name_check_enabled = true
  priority                       = 1
  weight                         = 1000
}

resource "azurerm_cdn_frontdoor_rule_set" "frontend" {
  name                     = "Frontend"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
}

resource "azurerm_cdn_frontdoor_rule_set" "navigation" {
  name                     = "Navigation"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
}

resource "azurerm_cdn_frontdoor_rule_set" "candidate" {
  name                     = "Candidate"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
}

resource "azurerm_cdn_frontdoor_rule" "frontend_headers" {
  name                      = "SecurityAndPrivacy"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.frontend.id
  order                     = 1
  actions {
    dynamic "modify_request_header" {
      for_each = toset(["Cookie", "Authorization", "X-CSRF-Token"])
      content {
        header_name = modify_request_header.value
        operator    = "Delete"
      }
    }
    modify_response_header {
      header_name  = "Content-Security-Policy"
      operator     = "Overwrite"
      header_value = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
    }
    modify_response_header {
      header_name  = "X-Content-Type-Options"
      operator     = "Overwrite"
      header_value = "nosniff"
    }
  }
  depends_on = [azurerm_cdn_frontdoor_origin.origin]
}

resource "azurerm_cdn_frontdoor_rule" "frontend_headers_more" {
  name                      = "TransportAndPrivacy"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.frontend.id
  order                     = 2
  actions {
    modify_response_header {
      header_name  = "Strict-Transport-Security"
      operator     = "Overwrite"
      header_value = "max-age=31536000"
    }
    modify_response_header {
      header_name  = "Referrer-Policy"
      operator     = "Overwrite"
      header_value = "no-referrer"
    }
    modify_response_header {
      header_name  = "Permissions-Policy"
      operator     = "Overwrite"
      header_value = "geolocation=(), camera=(), microphone=()"
    }
    modify_response_header {
      header_name  = "X-Frame-Options"
      operator     = "Overwrite"
      header_value = "DENY"
    }
  }
  depends_on = [azurerm_cdn_frontdoor_origin.origin]
}

resource "azurerm_cdn_frontdoor_rule" "navigation_cache" {
  name                      = "NoStore"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.navigation.id
  order                     = 1
  actions {
    modify_response_header {
      header_name  = "Cache-Control"
      operator     = "Overwrite"
      header_value = "no-store"
    }
  }
  depends_on = [azurerm_cdn_frontdoor_origin.origin]
}

resource "azurerm_cdn_frontdoor_rule" "spa" {
  name                      = "KnownNavigationOnly"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.navigation.id
  order                     = 2
  conditions {
    request_path {
      operator = "Equal"
      values   = ["/", "/login", "/login/", "/register", "/register/"]
    }
    request_method {
      operator = "Equal"
      values   = ["GET", "HEAD"]
    }
  }
  actions {
    url_rewrite {
      source_pattern                  = "/"
      destination_path                = "/index.html"
      preserve_unmatched_path_enabled = false
    }
  }
  depends_on = [azurerm_cdn_frontdoor_origin.origin]
}

# Only two anonymous, bounded smoke endpoints select the candidate label.
resource "azurerm_cdn_frontdoor_rule" "candidate" {
  name                      = "CandidateChecks"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.candidate.id
  order                     = 1
  conditions {
    request_header {
      name     = "X-Weather-Release-Target"
      operator = "Equal"
      values   = ["candidate"]
    }
    request_path {
      operator = "Equal"
      values   = ["/api/v1/health", "/api/v1/auth/session"]
    }
    request_method {
      operator = "Equal"
      values   = ["GET"]
    }
  }
  actions {
    route_configuration_override {
      origin_group {
        cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.origin["candidate"].id
        forwarding_protocol           = "HttpsOnly"
      }
      caching {
        behaviour = "Disabled"
      }
    }
    modify_request_header {
      header_name = "X-Weather-Release-Target"
      operator    = "Delete"
    }
    modify_response_header {
      header_name  = "X-Weather-Release-Target"
      operator     = "Overwrite"
      header_value = "candidate"
    }
  }
  depends_on = [azurerm_cdn_frontdoor_origin.origin]
}

resource "azurerm_cdn_frontdoor_route" "route" {
  for_each = {
    api        = { origin = "api", patterns = ["/api", "/api/*"], rules = [azurerm_cdn_frontdoor_rule_set.candidate.id] }
    assets     = { origin = "frontend", patterns = ["/assets/*"], rules = [azurerm_cdn_frontdoor_rule_set.frontend.id] }
    navigation = { origin = "frontend", patterns = ["/*"], rules = [azurerm_cdn_frontdoor_rule_set.frontend.id, azurerm_cdn_frontdoor_rule_set.navigation.id] }
  }
  name                          = each.key
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.app.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.origin[each.value.origin].id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.origin[each.value.origin].id]
  cdn_frontdoor_rule_set_ids    = each.value.rules
  patterns_to_match             = each.value.patterns
  supported_protocols           = ["Http", "Https"]
  forwarding_protocol           = "HttpsOnly"
  https_redirect_enabled        = true
  link_to_default_domain        = true
  dynamic "cache" {
    for_each = each.key == "assets" ? [1] : []
    content {
      query_string_caching_behavior = "UseQueryString"
      compression_enabled           = true
      content_types_to_compress     = ["text/css", "text/javascript", "application/javascript", "image/svg+xml"]
    }
  }
  depends_on = [
    azurerm_cdn_frontdoor_rule.frontend_headers,
    azurerm_cdn_frontdoor_rule.frontend_headers_more,
    azurerm_cdn_frontdoor_rule.navigation_cache,
    azurerm_cdn_frontdoor_rule.spa,
    azurerm_cdn_frontdoor_rule.candidate
  ]
}

resource "azurerm_cdn_frontdoor_firewall_policy" "app" {
  name                = "${var.name}waf"
  resource_group_name = azurerm_resource_group.app.name
  sku_name            = "Standard_AzureFrontDoor"
  enabled             = true
  mode                = var.waf_mode
  custom_rule {
    name     = "UnsupportedMethods"
    priority = 5
    type     = "MatchRule"
    action   = "Block"
    match_condition {
      match_variable     = "RequestMethod"
      operator           = "Equal"
      negation_condition = true
      match_values       = ["GET", "HEAD", "POST", "DELETE", "OPTIONS"]
    }
  }
  custom_rule {
    name                           = "SensitiveApiRateLimit"
    priority                       = 10
    type                           = "RateLimitRule"
    action                         = "Block"
    rate_limit_duration_in_minutes = 1
    rate_limit_threshold           = var.waf_requests_per_minute
    match_condition {
      match_variable = "RequestUri"
      operator       = "BeginsWith"
      match_values   = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/weather"]
    }
    match_condition {
      match_variable = "SocketAddr"
      operator       = "IPMatch"
      match_values   = ["0.0.0.0/0", "::/0"]
    }
  }
  tags = local.tags

  lifecycle {
    ignore_changes = [
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}

resource "azurerm_cdn_frontdoor_security_policy" "app" {
  name                     = "public-security"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.app.id
  security_policies {
    firewall {
      cdn_frontdoor_firewall_policy_id = azurerm_cdn_frontdoor_firewall_policy.app.id
      association {
        domain {
          cdn_frontdoor_domain_id = azurerm_cdn_frontdoor_endpoint.app.id
        }
        patterns_to_match = ["/*"]
      }
    }
  }
}
