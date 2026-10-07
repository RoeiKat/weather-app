locals {
  location = "swedencentral"
  tags     = merge(var.tags, { application = "weather", environment = "production", managed_by = "terraform" })
}

resource "azurerm_resource_group" "app" {
  name     = "${var.name}-prod"
  location = local.location
  tags     = local.tags
}
