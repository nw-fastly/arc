output "service_id" {
  description = "Pass to npm run deploy -- --service-id."
  value       = fastly_service_compute.arc.id
}
output "service_version" {
  description = "Terraform-managed service version; publish this version after applying infrastructure changes."
  value       = fastly_service_compute.arc.cloned_version
}
output "secret_store_id" {
  description = "Populate ADMIN_PASSWORD and FASTLY_API_TOKEN using Fastly CLI."
  value       = fastly_secretstore.secrets.id
}
output "config_store_id" {
  value = fastly_configstore.config.id
}
output "kv_store_id" {
  value = fastly_kvstore.state.id
}
output "domain" {
  value = var.domain
}
