terraform {
  required_version = "= 1.16.5"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.8.0"
    }
  }
}

provider "azurerm" {
  features {}
  storage_use_azuread             = true
  resource_provider_registrations = "none"
}

variable "name" {
  description = "Globally unique state account prefix, lowercase alphanumeric, 6-16 characters."
  type        = string
}

variable "ci_principal_id" {
  description = "Object ID of the single GitHub OIDC principal; optional until it is created."
  type        = string
  default     = null
}

data "azurerm_client_config" "operator" {}

resource "azurerm_resource_group" "state" {
  name     = "${var.name}-state"
  location = "swedencentral"
}

resource "azurerm_storage_account" "state" {
  name                            = "${var.name}state"
  resource_group_name             = azurerm_resource_group.state.name
  location                        = azurerm_resource_group.state.location
  account_tier                    = "Standard"
  account_replication_type        = "ZRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  https_traffic_only_enabled      = true
  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "protected" {
  for_each              = toset(["tfstate", "tfplans", "tfdiagnostics"])
  name                  = each.key
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
  depends_on            = [azurerm_role_assignment.operator]
}

resource "azurerm_role_assignment" "operator" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.operator.object_id
  principal_type       = "User"
}

resource "azurerm_role_assignment" "state" {
  for_each             = var.ci_principal_id == null ? toset([]) : toset(["tfstate", "tfplans", "tfdiagnostics"])
  scope                = azurerm_storage_container.protected[each.key].id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.ci_principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_definition" "discovery" {
  count             = var.ci_principal_id == null ? 0 : 1
  name              = "${var.name}-assignment-discovery"
  scope             = "/subscriptions/${data.azurerm_client_config.operator.subscription_id}"
  assignable_scopes = ["/subscriptions/${data.azurerm_client_config.operator.subscription_id}"]
  permissions {
    actions = [
      "Microsoft.Resources/subscriptions/read",
      "Microsoft.Resources/subscriptions/locations/read",
      "Microsoft.Resources/subscriptions/providers/read",
      "Microsoft.Network/locations/serviceTags/read",
      "Microsoft.Authorization/roleDefinitions/read"
    ]
  }
}

resource "azurerm_role_assignment" "discovery" {
  count              = var.ci_principal_id == null ? 0 : 1
  scope              = azurerm_role_definition.discovery[0].scope
  role_definition_id = azurerm_role_definition.discovery[0].role_definition_resource_id
  principal_id       = var.ci_principal_id
  principal_type     = "ServicePrincipal"
}

output "backend" {
  value = {
    storage_account_name = azurerm_storage_account.state.name
    resource_group_name  = azurerm_resource_group.state.name
    container_name       = "tfstate"
    key                  = "production.tfstate"
  }
}
