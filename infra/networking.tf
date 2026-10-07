locals {
  aca_cidr = "10.42.0.0/23"
  db_cidr  = "10.42.2.0/27"
}

resource "azurerm_virtual_network" "app" {
  name                = "${var.name}-vnet"
  location            = local.location
  resource_group_name = azurerm_resource_group.app.name
  address_space       = ["10.42.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "aca" {
  name                 = "container-apps"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = [local.aca_cidr]
  delegation {
    name = "container-apps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "database" {
  name                 = "postgresql"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = [local.db_cidr]
  service_endpoint {
    service = "Microsoft.Storage"
  }
  delegation {
    name = "postgresql"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_private_dns_zone" "database" {
  name                = "${var.name}-private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "database" {
  name                = "weather"
  private_dns_zone_id = azurerm_private_dns_zone.database.id
  virtual_network_id  = azurerm_virtual_network.app.id
}

resource "azurerm_network_security_group" "database" {
  name                = "${var.name}-postgresql-nsg"
  location            = local.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

locals {
  database_rules = {
    workload_sql = {
      priority = 100, direction = "Inbound", protocol = "Tcp",
      source   = local.aca_cidr, destination = local.db_cidr, ports = ["5432", "6432"], access = "Allow"
    }
    ha_sql_in = {
      priority = 110, direction = "Inbound", protocol = "Tcp",
      source   = local.db_cidr, destination = local.db_cidr, ports = ["5432"], access = "Allow"
    }
    deny_private_in = {
      priority = 200, direction = "Inbound", protocol = "*",
      source   = "*", destination = local.db_cidr, ports = ["*"], access = "Deny"
    }
    ha_sql_out = {
      priority = 100, direction = "Outbound", protocol = "Tcp",
      source   = local.db_cidr, destination = local.db_cidr, ports = ["5432"], access = "Allow"
    }
    storage = {
      priority = 110, direction = "Outbound", protocol = "Tcp",
      source   = local.db_cidr, destination = "Storage.SwedenCentral", ports = ["443"], access = "Allow"
    }
    entra = {
      priority = 120, direction = "Outbound", protocol = "Tcp",
      source   = local.db_cidr, destination = "AzureActiveDirectory", ports = ["443"], access = "Allow"
    }
    dns = {
      priority = 130, direction = "Outbound", protocol = "*",
      source   = local.db_cidr, destination = "AzurePlatformDNS", ports = ["53"], access = "Allow"
    }
    deny_other_out = {
      priority = 200, direction = "Outbound", protocol = "*",
      source   = local.db_cidr, destination = "*", ports = ["*"], access = "Deny"
    }
  }
}

resource "azurerm_network_security_rule" "database" {
  for_each                    = local.database_rules
  name                        = each.key
  resource_group_name         = azurerm_resource_group.app.name
  network_security_group_name = azurerm_network_security_group.database.name
  priority                    = each.value.priority
  direction                   = each.value.direction
  access                      = each.value.access
  protocol                    = each.value.protocol
  source_port_range           = "*"
  destination_port_ranges     = each.value.ports
  source_address_prefix       = each.value.source
  destination_address_prefix  = each.value.destination
}

resource "azurerm_subnet_network_security_group_association" "database" {
  subnet_id                 = azurerm_subnet.database.id
  network_security_group_id = azurerm_network_security_group.database.id
}
