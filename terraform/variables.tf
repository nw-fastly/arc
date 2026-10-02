variable "name" {
  description = "Name prefix for the Compute service and account-level stores."
  type        = string
  default     = "arc-playground"
  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_-]{0,49}$", var.name))
    error_message = "Use 1–50 letters, digits, underscores or hyphens, starting with a letter."
  }
}

variable "domain" {
  description = "Hostname routed to this service. DNS and downstream TLS must be configured separately."
  type        = string
  validation {
    condition     = length(var.domain) <= 253 && can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\\.[a-z]{2,}$", var.domain))
    error_message = "Enter a lowercase hostname, without scheme, port or path."
  }
}
