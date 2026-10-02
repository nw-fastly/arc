# ARC infrastructure

Terraform creates a Compute service, its two TLS backends, an empty KV Store,
a Secret Store, and a Config Store containing `ARC_MODE=live`. Resource links
match `.pulse/config.ts`: `arc_state`, `arc_secrets`, and `arc_config`.
Account-level store names use the configurable service-name prefix.

The Fastly provider is pinned to 9.6.0. Terraform 1.7+ is required. Terraform
owns infrastructure; the existing `npm run deploy` owns the Wasm package and
activation. No package is built or published by Terraform, and no secret values
are accepted as Terraform variables. Provider credentials come from
`FASTLY_API_KEY`; the Fastly CLI uses `FASTLY_API_TOKEN` or its saved profile.

## Create and deploy

Run from the repository root, with Terraform and the Fastly CLI installed:

```sh
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit name and domain. Configure FASTLY_API_KEY in your shell/secret manager.
terraform -chdir=terraform init
terraform -chdir=terraform plan -out=arc.tfplan
terraform -chdir=terraform apply arc.tfplan
```

Use a hostname you control, or a Fastly-provided hostname assigned to your
service. This configuration does not allocate a test hostname, create DNS
records or obtain a downstream TLS certificate. Configure DNS/TLS in Fastly
before testing HTTPS; backend TLS is already configured here.

Populate the Secret Store using the Fastly control panel or CLI's interactive
secret entry flow. Add **ADMIN_PASSWORD** and **FASTLY_API_TOKEN** (an ARC-enabled
management token). Do not place their values in tfvars, command arguments or
Terraform state. The CLI prompts for each value:

```sh
fastly secret-store-entry create --name ADMIN_PASSWORD \
  --store-id "$(terraform -chdir=terraform output -raw secret_store_id)"
fastly secret-store-entry create --name FASTLY_API_TOKEN \
  --store-id "$(terraform -chdir=terraform output -raw secret_store_id)"
```

Then publish from the repository root:

```sh
npm ci --ignore-scripts
npm run deploy -- \
  --service-id "$(terraform -chdir=terraform output -raw service_id)" \
  --version "$(terraform -chdir=terraform output -raw service_version)" \
  --no-default-domain
```

This uses the existing manifest build hook and publishes/activates the version
containing Terraform's backends and resource links. It does not require editing
`fastly.toml`. On subsequent **code-only** deployments use the same service ID
and `--version active`. After an **infrastructure change**, review/apply the
Terraform plan first, then publish with the freshly output `service_version`.
Do not deploy against an unrelated draft or run concurrent Terraform/CLI edits.
`activate = false` leaves versioned infrastructure changes pending until publish;
Config Store entries and other versionless resources take effect immediately.
Terraform ignores package changes so it does not replace CLI-published Wasm.

Open `/admin`, create or rotate a virtual key, and assign it to a local user.
Terraform does not seed users, credentials or ARC provider connections.

## Existing services and state

This root configuration creates new resources by default. To adopt existing
resources, import the service and each store by ID before planning:

```sh
terraform -chdir=terraform import fastly_service_compute.arc SERVICE_ID
terraform -chdir=terraform import fastly_configstore.config CONFIG_STORE_ID
terraform -chdir=terraform import fastly_secretstore.secrets SECRET_STORE_ID
terraform -chdir=terraform import fastly_kvstore.state KV_STORE_ID
```

Match names/domain to the existing resources and review the complete plan before
applying. The Config Store entries resource owns its contents, including removal
of other entries; only adopt a dedicated ARC store. KV data and secret values
remain managed by the app/Fastly, never by Terraform.

Local state, tfvars and saved plans are ignored by git. Keep state durable and
private, or configure your team's remote backend before first apply. Retain the
provider lockfile in git. Never lose the state and reapply expecting adoption.

For deliberate teardown, unlink stores from the service and apply first, then
deactivate the service before destroying resources. Fastly store-link deletion
requires two steps; deleting the Secret Store deletes its secrets, and nonempty
KV/Config stores may need their contents removed separately. No force-destroy
flags are enabled.

## Validation and references

```sh
terraform -chdir=terraform fmt -check
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
```

These checks do not provision resources. An authenticated account plan/apply is
still required to verify entitlement, domain availability and live deployment.

- [Compute service resource](https://registry.terraform.io/providers/fastly/fastly/9.6.0/docs/resources/service_compute)
- [Config Store entries](https://registry.terraform.io/providers/fastly/fastly/9.6.0/docs/resources/configstore_entries)
- [Secret Store](https://registry.terraform.io/providers/fastly/fastly/9.6.0/docs/resources/secretstore)
- [Fastly publish command](https://www.fastly.com/documentation/reference/cli/compute/publish/)
