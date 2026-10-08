mock_provider "azurerm" {
  override_during = plan

  mock_resource "azurerm_resource_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod" }
  }
  mock_resource "azurerm_container_registry" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.ContainerRegistry/registries/weatherxacr"
      login_server = "weatherxacr.azurecr.io"
    }
  }
  mock_resource "azurerm_key_vault" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.KeyVault/vaults/weatherx-kv"
      vault_uri = "https://weatherx-kv.vault.azure.net/"
    }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.ManagedIdentity/userAssignedIdentities/workload"
      client_id    = "00000000-0000-0000-0000-000000000002"
      principal_id = "00000000-0000-0000-0000-000000000003"
    }
  }
  mock_resource "azurerm_virtual_network" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Network/virtualNetworks/weatherx-vnet" }
  }
  mock_resource "azurerm_subnet" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Network/virtualNetworks/weatherx-vnet/subnets/mock" }
  }
  mock_resource "azurerm_private_dns_zone" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Network/privateDnsZones/weatherx-private.postgres.database.azure.com" }
  }
  mock_resource "azurerm_network_security_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Network/networkSecurityGroups/weatherx-postgresql-nsg" }
  }
  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = {
      id   = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.DBforPostgreSQL/flexibleServers/weatherx-postgres"
      fqdn = "weatherx-postgres.postgres.database.azure.com"
    }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.OperationalInsights/workspaces/weatherx-logs" }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id             = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.App/managedEnvironments/weatherx-environment"
      default_domain = "sample.swedencentral.azurecontainerapps.io"
    }
  }
  mock_resource "azurerm_storage_account" {
    defaults = {
      id               = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Storage/storageAccounts/weatherxweb"
      primary_web_host = "weatherxweb.z1.web.core.windows.net"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_profile" {
    defaults = {
      id            = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Cdn/profiles/weatherx-frontdoor"
      resource_guid = "00000000-0000-0000-0000-000000000004"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_endpoint" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Cdn/profiles/weatherx-frontdoor/afdEndpoints/weatherx-public"
      host_name = "weatherx-public-generated.z01.azurefd.net"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_origin_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Cdn/profiles/weatherx-frontdoor/originGroups/mock" }
  }
  mock_resource "azurerm_cdn_frontdoor_origin" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Cdn/profiles/weatherx-frontdoor/originGroups/mock/origins/mock" }
  }
  mock_resource "azurerm_cdn_frontdoor_rule_set" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Cdn/profiles/weatherx-frontdoor/ruleSets/mock" }
  }
  mock_resource "azurerm_monitor_action_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/weatherx-prod/providers/Microsoft.Insights/actionGroups/weatherx-operations" }
  }
}

variables {
  subscription_id                     = "00000000-0000-0000-0000-000000000001"
  tenant_id                           = "00000000-0000-0000-0000-000000000005"
  name                                = "weatherx"
  ci_principal_id                     = "00000000-0000-0000-0000-000000000006"
  entra_admin_object_id               = "00000000-0000-0000-0000-000000000007"
  entra_admin_name                    = "human@example.test"
  alert_email                         = "human@example.test"
  frontdoor_backend_ipv4              = ["192.0.2.0/24"]
  frontdoor_service_tag_change_number = "1"
}

run "core_without_application_or_secret" {
  command = plan

  assert {
    condition     = length(azurerm_container_app.api) == 0 && length(azurerm_role_assignment.weather_secret) == 0
    error_message = "Core bootstrap must not require an API image or an existing Key Vault secret."
  }
  assert {
    condition     = output.public_url == "https://weatherx-public-generated.z01.azurefd.net"
    error_message = "The generated HTTPS endpoint must be the public URL."
  }
  assert {
    condition     = alltrue([for route in azurerm_cdn_frontdoor_route.route : route.link_to_default_domain && route.cdn_frontdoor_custom_domain_ids == null])
    error_message = "Every route must use the default endpoint without custom-domain dependencies."
  }
  assert {
    condition     = azurerm_container_app_job.migrate.template[0].container[0].image == local.migration_seed_image
    error_message = "An idle Job must be provisionable before an application artifact exists."
  }
}

run "api_from_prepared_digest" {
  command = plan
  variables {
    bootstrap_image = "weatherxacr.azurecr.io/weather-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }

  assert {
    condition     = length(azurerm_container_app.api) == 1 && length(azurerm_role_assignment.weather_secret) == 1
    error_message = "The prepared digest must enable the actual API and its scoped secret grant."
  }
  assert {
    condition     = azurerm_container_app.api[0].template[0].min_replicas == 2 && azurerm_container_app.api[0].template[0].container[0].readiness_probe[0].port == 3001
    error_message = "Bootstrap must preserve accepted redundancy and actual readiness port."
  }
  assert {
    condition     = local.api_env.ALLOWED_ORIGINS == output.public_url && azurerm_postgresql_flexible_server.database.high_availability[0].mode == "ZoneRedundant"
    error_message = "Bootstrap must preserve the generated allowed origin and PostgreSQL cross-AZ HA."
  }
}

run "first_apply_compatibility" {
  command = plan

  assert {
    condition     = azurerm_monitor_scheduled_query_rules_alert_v2.revisions.skip_query_validation
    error_message = "The revision alert must be creatable before the Container Apps system logs table exists."
  }
  assert {
    condition = trimspace(azurerm_monitor_scheduled_query_rules_alert_v2.revisions.criteria[0].query) == trimspace(<<-KQL
      ContainerAppSystemLogs_CL
      | where Type_s == "Warning" or Log_s has_any ("ErrImagePull", "ImagePullBackOff", "Failed", "Unhealthy")
      | summarize Failures = count()
    KQL
    )
    error_message = "Skipping first-deployment query validation must not change the existing revision alert query or table."
  }
  assert {
    condition = toset(keys(azurerm_network_security_rule.database)) == toset([
      "workload_sql", "ha_sql_in", "deny_private_in", "ha_sql_out", "storage", "entra", "deny_other_out"
      ]) && alltrue([
      for rule in azurerm_network_security_rule.database : rule.destination_address_prefix != "AzurePlatformDNS"
    ])
    error_message = "Remove the explicit AzurePlatformDNS allow rule without adding a replacement or changing other rule names."
  }
  assert {
    condition = alltrue([
      for name in ["deny_private_in", "deny_other_out"] :
      azurerm_network_security_rule.database[name].destination_port_range == "*" &&
      azurerm_network_security_rule.database[name].destination_port_ranges == null
    ])
    error_message = "All-port deny rules must use the singular wildcard port field, not a wildcard array."
  }
  assert {
    condition = alltrue([
      for name, expected in {
        workload_sql = {
          priority = 100, direction = "Inbound", protocol = "Tcp",
          source   = "10.42.0.0/23", destination = "10.42.2.0/27", ports = ["5432", "6432"], access = "Allow"
        }
        ha_sql_in = {
          priority = 110, direction = "Inbound", protocol = "Tcp",
          source   = "10.42.2.0/27", destination = "10.42.2.0/27", ports = ["5432"], access = "Allow"
        }
        deny_private_in = {
          priority = 200, direction = "Inbound", protocol = "*",
          source   = "*", destination = "10.42.2.0/27", ports = ["*"], access = "Deny"
        }
        ha_sql_out = {
          priority = 100, direction = "Outbound", protocol = "Tcp",
          source   = "10.42.2.0/27", destination = "10.42.2.0/27", ports = ["5432"], access = "Allow"
        }
        storage = {
          priority = 110, direction = "Outbound", protocol = "Tcp",
          source   = "10.42.2.0/27", destination = "Storage.SwedenCentral", ports = ["443"], access = "Allow"
        }
        entra = {
          priority = 120, direction = "Outbound", protocol = "Tcp",
          source   = "10.42.2.0/27", destination = "AzureActiveDirectory", ports = ["443"], access = "Allow"
        }
        deny_other_out = {
          priority = 200, direction = "Outbound", protocol = "*",
          source   = "10.42.2.0/27", destination = "*", ports = ["*"], access = "Deny"
        }
      } :
      azurerm_network_security_rule.database[name].priority == expected.priority &&
      azurerm_network_security_rule.database[name].direction == expected.direction &&
      azurerm_network_security_rule.database[name].access == expected.access &&
      azurerm_network_security_rule.database[name].protocol == expected.protocol &&
      azurerm_network_security_rule.database[name].source_address_prefix == expected.source &&
      azurerm_network_security_rule.database[name].destination_address_prefix == expected.destination &&
      azurerm_network_security_rule.database[name].source_port_range == "*" &&
      (contains(expected.ports, "*") ?
        azurerm_network_security_rule.database[name].destination_port_range == "*" &&
        azurerm_network_security_rule.database[name].destination_port_ranges == null :
        azurerm_network_security_rule.database[name].destination_port_range == null &&
        toset(azurerm_network_security_rule.database[name].destination_port_ranges) == toset(expected.ports)
      )
    ])
    error_message = "Every remaining database NSG rule must retain its priority, direction, access, protocol, prefixes and port semantics."
  }
}
