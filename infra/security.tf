resource "azurerm_user_assigned_identity" "api" {
  name                = "${var.name}-api"
  location            = local.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "migration" {
  name                = "${var.name}-migration"
  location            = local.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

resource "azurerm_container_registry" "backend" {
  name                          = "${var.name}acr"
  location                      = local.location
  resource_group_name           = azurerm_resource_group.app.name
  sku                           = "Basic"
  role_assignment_mode          = "LegacyRegistryPermissions"
  admin_enabled                 = false
  public_network_access_enabled = true
  tags                          = local.tags
}

resource "azurerm_role_assignment" "pull" {
  for_each = {
    api       = azurerm_user_assigned_identity.api.principal_id
    migration = azurerm_user_assigned_identity.migration.principal_id
  }
  scope                = azurerm_container_registry.backend.id
  role_definition_name = "AcrPull"
  principal_id         = each.value
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "push" {
  scope                = azurerm_container_registry.backend.id
  role_definition_name = "AcrPush"
  principal_id         = var.ci_principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_key_vault" "app" {
  name                          = "${var.name}-kv"
  location                      = local.location
  resource_group_name           = azurerm_resource_group.app.name
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = false
  soft_delete_retention_days    = 7
  public_network_access_enabled = true
  tags                          = local.tags
}

resource "azurerm_role_assignment" "weather_secret" {
  count                = var.bootstrap_image == null ? 0 : 1
  scope                = "${azurerm_key_vault.app.id}/secrets/openweather"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
  principal_type       = "ServicePrincipal"
}
