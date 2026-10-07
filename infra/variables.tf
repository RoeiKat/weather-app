variable "subscription_id" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "name" {
  description = "Globally unique lowercase alphanumeric prefix, 6-16 characters."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{5,15}$", var.name))
    error_message = "Use 6-16 lowercase alphanumeric characters, starting with a letter."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "bootstrap_image" {
  description = "Null for the initial core-infrastructure apply; set the prepared backend digest to create the API."
  type        = string
  default     = null
  validation {
    condition     = var.bootstrap_image == null || can(regex("^[a-z0-9]+\\.azurecr\\.io/weather-backend@sha256:[a-f0-9]{64}$", var.bootstrap_image))
    error_message = "Supply null or an ACR weather-backend image with its immutable sha256 digest."
  }
}

variable "frontdoor_backend_ipv4" {
  description = "Reviewed complete global AzureFrontDoor.Backend IPv4 set; never an empty fallback."
  type        = set(string)
  validation {
    condition = length(var.frontdoor_backend_ipv4) > 0 && alltrue([
      for prefix in var.frontdoor_backend_ipv4 :
      can(cidrnetmask(prefix)) && try(tonumber(split("/", prefix)[1]) >= 8, false)
    ])
    error_message = "Supply a nonempty reviewed IPv4 CIDR set; broad default routes are forbidden."
  }
}

variable "frontdoor_service_tag_change_number" {
  description = "Reviewed Microsoft service-tag change number, retained as deployment evidence."
  type        = string
  validation {
    condition     = can(regex("^[0-9]+$", var.frontdoor_service_tag_change_number))
    error_message = "Supply the reviewed service-tag change number."
  }
}

variable "entra_admin_object_id" {
  description = "Approved human Entra administrator object ID, not a workload/CI identity."
  type        = string
}

variable "entra_admin_name" {
  type = string
}

variable "entra_admin_type" {
  description = "A single human user is sufficient for the assignment; a human admin group is also supported."
  type        = string
  default     = "User"
  validation {
    condition     = contains(["User", "Group"], var.entra_admin_type)
    error_message = "The SQL administrator must be a human User or Group."
  }
}

variable "ci_principal_id" {
  description = "Object ID (not client ID) of the one GitHub OIDC service principal."
  type        = string
}

variable "api_cpu" {
  type    = number
  default = 0.5
  validation {
    condition     = contains([0.5, 1, 1.5, 2], var.api_cpu)
    error_message = "Use an approved Consumption allocation: 0.5, 1, 1.5 or 2 vCPU."
  }
}

variable "max_replicas" {
  type    = number
  default = 4
  validation {
    condition     = var.max_replicas >= 2 && var.max_replicas <= 10 && floor(var.max_replicas) == var.max_replicas
    error_message = "Use an integer between 2 and 10; load/connection budgets require approval."
  }
}

variable "alert_email" {
  description = "Human-approved incident recipient."
  type        = string
}

variable "waf_requests_per_minute" {
  description = "Initial detection-mode edge limit; tune and approve before prevention."
  type        = number
  default     = 100
}

variable "waf_mode" {
  type    = string
  default = "Detection"
  validation {
    condition     = contains(["Detection", "Prevention"], var.waf_mode)
    error_message = "Use Detection or Prevention after reviewed tuning."
  }
}
