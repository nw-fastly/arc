terraform {
  required_version = ">= 1.7.0, < 2.0.0"
  required_providers {
    fastly = {
      source  = "fastly/fastly"
      version = "= 9.6.0"
    }
  }
}

# Authenticates with FASTLY_API_KEY. Do not put credentials in tfvars.
provider "fastly" {}

resource "fastly_configstore" "config" {
  name = "${var.name}-config"
}

resource "fastly_configstore_entries" "config" {
  store_id       = fastly_configstore.config.id
  manage_entries = true
  entries = {
    ARC_MODE = "live"
  }
}

resource "fastly_secretstore" "secrets" {
  name = "${var.name}-secrets"
}

resource "fastly_kvstore" "state" {
  name = "${var.name}-state"
}

resource "fastly_service_compute" "arc" {
  name    = var.name
  comment = "ARC playground infrastructure managed by Terraform; Wasm published by Fastly CLI"

  # Bootstrap configuration only. The CLI uploads the package and activates it.
  activate = false

  domain {
    name = var.domain
  }

  backend {
    name                  = "arc_gateway"
    address               = "arc.fastly.app"
    port                  = 443
    use_ssl               = true
    ssl_check_cert        = true
    ssl_cert_hostname     = "arc.fastly.app"
    ssl_sni_hostname      = "arc.fastly.app"
    override_host         = "arc.fastly.app"
    first_byte_timeout    = 30000
    between_bytes_timeout = 30000
  }

  backend {
    name              = "fastly_api"
    address           = "api.fastly.com"
    port              = 443
    use_ssl           = true
    ssl_check_cert    = true
    ssl_cert_hostname = "api.fastly.com"
    ssl_sni_hostname  = "api.fastly.com"
    override_host     = "api.fastly.com"
  }

  # Link names, rather than account-level store names, are the runtime bindings.
  resource_link {
    name        = "arc_config"
    resource_id = fastly_configstore.config.id
  }
  resource_link {
    name        = "arc_secrets"
    resource_id = fastly_secretstore.secrets.id
  }
  resource_link {
    name        = "arc_state"
    resource_id = fastly_kvstore.state.id
  }

  lifecycle {
    # A CLI publication must not become a Terraform package removal/update.
    ignore_changes = [package]
  }
}
