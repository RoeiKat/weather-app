resource "azurerm_postgresql_flexible_server" "database" {
  name                          = "${var.name}-postgres"
  location                      = local.location
  resource_group_name           = azurerm_resource_group.app.name
  version                       = "17"
  sku_name                      = "GP_Standard_D2ds_v5"
  storage_type                  = "PremiumV2_LRS"
  storage_mb                    = 32768
  storage_iops                  = 3000
  storage_throughput            = 125
  auto_grow_enabled             = false
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.database.id
  private_dns_zone_id           = azurerm_private_dns_zone.database.id
  zone                          = "1"
  tags                          = local.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = var.tenant_id
  }
  high_availability {
    mode                      = "ZoneRedundant"
    standby_availability_zone = "2"
  }

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.database,
    azurerm_subnet_network_security_group_association.database,
    azurerm_network_security_rule.database
  ]

  lifecycle {
    ignore_changes = [
      zone,
      high_availability[0].standby_availability_zone,
      tags["created_By"],
      tags["created_Date"],
    ]
  }
}

resource "azurerm_postgresql_flexible_server_active_directory_administrator" "human" {
  server_name         = azurerm_postgresql_flexible_server.database.name
  resource_group_name = azurerm_resource_group.app.name
  tenant_id           = var.tenant_id
  object_id           = var.entra_admin_object_id
  principal_name      = var.entra_admin_name
  principal_type      = var.entra_admin_type
}

resource "azurerm_postgresql_flexible_server_database" "weather" {
  name      = "weather"
  server_id = azurerm_postgresql_flexible_server.database.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_configuration" "database" {
  for_each = {
    "require_secure_transport"            = "on"
    "ssl_min_protocol_version"            = "TLSv1.2"
    "pgbouncer.enabled"                   = "true"
    "pgbouncer.ignore_startup_parameters" = "statement_timeout,lock_timeout,idle_in_transaction_session_timeout"
    # PgBouncer rejects these startup fields. Enforce identical server defaults,
    # rather than merely ignoring the client's protections.
    "statement_timeout"                   = "5000"
    "lock_timeout"                        = "3000"
    "idle_in_transaction_session_timeout" = "10000"
  }
  name      = each.key
  server_id = azurerm_postgresql_flexible_server.database.id
  value     = each.value
}
