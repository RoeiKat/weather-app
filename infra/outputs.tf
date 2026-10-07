output "deployment" {
  value = {
    resource_group     = azurerm_resource_group.app.name
    registry_name      = azurerm_container_registry.backend.name
    registry_host      = azurerm_container_registry.backend.login_server
    api_name           = "${var.name}-api"
    api_id             = local.api_id
    api_created        = var.bootstrap_image != null
    migration_job      = azurerm_container_app_job.migrate.name
    public_url         = "https://${azurerm_cdn_frontdoor_endpoint.app.host_name}"
    frontend_account   = azurerm_storage_account.frontend.name
    frontdoor_profile  = azurerm_cdn_frontdoor_profile.app.name
    frontdoor_endpoint = azurerm_cdn_frontdoor_endpoint.app.name
    frontdoor_id       = azurerm_cdn_frontdoor_profile.app.resource_guid
  }
}

output "public_url" {
  value = "https://${azurerm_cdn_frontdoor_endpoint.app.host_name}"
}

output "database_bootstrap" {
  value = {
    fqdn                = azurerm_postgresql_flexible_server.database.fqdn
    database            = azurerm_postgresql_flexible_server_database.weather.name
    api_role            = azurerm_user_assigned_identity.api.name
    api_object_id       = azurerm_user_assigned_identity.api.principal_id
    migration_role      = azurerm_user_assigned_identity.migration.name
    migration_object_id = azurerm_user_assigned_identity.migration.principal_id
    vault_uri           = azurerm_key_vault.app.vault_uri
  }
}
