resource "azurerm_log_analytics_workspace" "app" {
  name                = "${var.name}-logs"
  location            = local.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 1
  tags                = local.tags
}

resource "azurerm_monitor_diagnostic_setting" "frontdoor" {
  name                       = "origin-health"
  target_resource_id         = azurerm_cdn_frontdoor_profile.app.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
  enabled_log {
    category = "FrontDoorHealthProbeLog"
  }
  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "vault" {
  name                       = "audit"
  target_resource_id         = azurerm_key_vault.app.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
  enabled_log {
    category = "AuditEvent"
  }
}

resource "azurerm_monitor_diagnostic_setting" "database" {
  name                       = "platform-metrics"
  target_resource_id         = azurerm_postgresql_flexible_server.database.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_action_group" "operations" {
  name                = "${var.name}-operations"
  resource_group_name = azurerm_resource_group.app.name
  short_name          = "weather"
  email_receiver {
    name          = "incident-owner"
    email_address = var.alert_email
  }
  tags = local.tags
}

resource "azurerm_monitor_metric_alert" "metric" {
  for_each = {
    database_storage = { scope = azurerm_postgresql_flexible_server.database.id, namespace = "Microsoft.DBforPostgreSQL/flexibleServers", metric = "storage_percent", operator = "GreaterThan", threshold = 75 }
    database_cpu     = { scope = azurerm_postgresql_flexible_server.database.id, namespace = "Microsoft.DBforPostgreSQL/flexibleServers", metric = "cpu_percent", operator = "GreaterThan", threshold = 85 }
    origin_health    = { scope = azurerm_cdn_frontdoor_profile.app.id, namespace = "Microsoft.Cdn/profiles", metric = "OriginHealthPercentage", operator = "LessThan", threshold = 90 }
  }
  name                = "${var.name}-${each.key}"
  resource_group_name = azurerm_resource_group.app.name
  scopes              = [each.value.scope]
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  criteria {
    metric_namespace = each.value.namespace
    metric_name      = each.value.metric
    aggregation      = "Average"
    operator         = each.value.operator
    threshold        = each.value.threshold
  }
  action {
    action_group_id = azurerm_monitor_action_group.operations.id
  }
  tags = local.tags
}

resource "azurerm_monitor_activity_log_alert" "database_health" {
  name                = "${var.name}-database-health"
  resource_group_name = azurerm_resource_group.app.name
  location            = "global"
  scopes              = [azurerm_postgresql_flexible_server.database.id]
  criteria {
    category = "ResourceHealth"
    resource_health {
      current = ["Degraded", "Unavailable"]
    }
  }
  action {
    action_group_id = azurerm_monitor_action_group.operations.id
  }
  tags = local.tags
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "revisions" {
  name                  = "${var.name}-revision-failures"
  resource_group_name   = azurerm_resource_group.app.name
  location              = local.location
  scopes                = [azurerm_log_analytics_workspace.app.id]
  severity              = 2
  evaluation_frequency  = "PT5M"
  window_duration       = "PT5M"
  skip_query_validation = true
  criteria {
    query                   = <<-KQL
      ContainerAppSystemLogs_CL
      | where Type_s == "Warning" or Log_s has_any ("ErrImagePull", "ImagePullBackOff", "Failed", "Unhealthy")
      | summarize Failures = count()
    KQL
    time_aggregation_method = "Total"
    metric_measure_column   = "Failures"
    operator                = "GreaterThan"
    threshold               = 0
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }
  action {
    action_groups = [azurerm_monitor_action_group.operations.id]
  }
  tags = local.tags
}
