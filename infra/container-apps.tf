resource "azurerm_container_app_environment" "app" {
  name                           = "${var.name}-environment"
  location                       = local.location
  resource_group_name            = azurerm_resource_group.app.name
  infrastructure_subnet_id       = azurerm_subnet.aca.id
  internal_load_balancer_enabled = false
  public_network_access          = "Enabled"
  zone_redundancy_enabled        = true
  logs_destination               = "log-analytics"
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.app.id
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
  tags = local.tags

  lifecycle {
    ignore_changes = [
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}

locals {
  api_id = "${azurerm_resource_group.app.id}/providers/Microsoft.App/containerApps/${var.name}-api"
  # The idle Job is provisionable before ACR contains an application artifact.
  migration_seed_image = "docker.io/library/node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20"
  database_env = {
    NODE_ENV     = "production"
    DB_AUTH_MODE = "entra"
    PGHOST       = azurerm_postgresql_flexible_server.database.fqdn
    PGDATABASE   = azurerm_postgresql_flexible_server_database.weather.name
    PGSSL        = "true"
  }
  api_env = merge(local.database_env, {
    PGPORT          = "6432"
    PGUSER          = azurerm_user_assigned_identity.api.name
    AZURE_CLIENT_ID = azurerm_user_assigned_identity.api.client_id
    DB_POOL_MAX     = "5"
    PORT            = "3000"
    PROBE_PORT      = "3001"
    ALLOWED_ORIGINS = "https://${azurerm_cdn_frontdoor_endpoint.app.host_name}"
    FRONT_DOOR_ID   = azurerm_cdn_frontdoor_profile.app.resource_guid
  })
  migration_env = merge(local.database_env, {
    PGPORT          = "5432"
    PGUSER          = azurerm_user_assigned_identity.migration.name
    AZURE_CLIENT_ID = azurerm_user_assigned_identity.migration.client_id
    DB_POOL_MAX     = "1"
  })
}

resource "azurerm_container_app" "api" {
  count                        = var.bootstrap_image == null ? 0 : 1
  name                         = "${var.name}-api"
  resource_group_name          = azurerm_resource_group.app.name
  container_app_environment_id = azurerm_container_app_environment.app.id
  workload_profile_name        = "Consumption"
  revision_mode                = "Multiple"
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }
  registry {
    server   = azurerm_container_registry.backend.login_server
    identity = azurerm_user_assigned_identity.api.id
  }
  secret {
    name                = "openweather"
    identity            = azurerm_user_assigned_identity.api.id
    key_vault_secret_id = "${azurerm_key_vault.app.vault_uri}secrets/openweather"
  }
  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = 3000
    transport                  = "http"
    dynamic "ip_security_restriction" {
      for_each = { for prefix in var.frontdoor_backend_ipv4 : replace(replace(prefix, ".", "-"), "/", "-") => prefix }
      content {
        name             = "afd-${ip_security_restriction.key}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
        description      = "AzureFrontDoor.Backend change ${var.frontdoor_service_tag_change_number}"
      }
    }
    traffic_weight {
      percentage      = 100
      latest_revision = false
      revision_suffix = "bootstrap"
    }
  }
  template {
    revision_suffix                  = "bootstrap"
    min_replicas                     = 2
    max_replicas                     = var.max_replicas
    termination_grace_period_seconds = 20
    container {
      name   = "api"
      image  = var.bootstrap_image
      cpu    = var.api_cpu
      memory = "${var.api_cpu * 2}Gi"
      dynamic "env" {
        for_each = local.api_env
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name        = "OPENWEATHER_API_KEY"
        secret_name = "openweather"
      }
      startup_probe {
        transport               = "TCP"
        port                    = 3000
        interval_seconds        = 5
        timeout                 = 2
        failure_count_threshold = 60
      }
      liveness_probe {
        transport               = "TCP"
        port                    = 3000
        interval_seconds        = 10
        timeout                 = 2
        failure_count_threshold = 3
      }
      readiness_probe {
        transport               = "TCP"
        port                    = 3001
        interval_seconds        = 5
        timeout                 = 2
        failure_count_threshold = 3
        success_count_threshold = 1
      }
    }
    http_scale_rule {
      name                = "http"
      concurrent_requests = "20"
    }
  }
  tags       = local.tags
  depends_on = [azurerm_role_assignment.pull, azurerm_role_assignment.weather_secret]

  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      template[0].revision_suffix,
      ingress[0].traffic_weight,
      tags["created_By"],
      tags["created_Date"],
    ]
    precondition {
      condition     = startswith(var.bootstrap_image, "${azurerm_container_registry.backend.login_server}/")
      error_message = "The bootstrap digest must be in this deployment's ACR."
    }
  }
}

resource "azurerm_container_app_job" "migrate" {
  name                         = "${var.name}-migrate"
  location                     = local.location
  resource_group_name          = azurerm_resource_group.app.name
  container_app_environment_id = azurerm_container_app_environment.app.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 0
  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.migration.id]
  }
  registry {
    server   = azurerm_container_registry.backend.login_server
    identity = azurerm_user_assigned_identity.migration.id
  }
  template {
    container {
      name    = "migration"
      image   = coalesce(var.bootstrap_image, local.migration_seed_image)
      cpu     = 0.5
      memory  = "1Gi"
      command = ["npm"]
      args    = ["run", "migrate"]
      dynamic "env" {
        for_each = local.migration_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
  tags       = local.tags
  depends_on = [azurerm_role_assignment.pull]
  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}
