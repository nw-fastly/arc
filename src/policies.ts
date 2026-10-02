import { Router } from '@pulse-compute/runtime'
import type { PolicyPatch, FailoverPolicy } from './schemas.js'

// Mounted after the parent admin auth middleware. Policies remain ARC-owned:
// no policy values or credentials are written to local KV by these routes.
const policies = new Router()
policies.get('/:id/policy', async (ctx) => {
  const id = ctx.param('id') || ''
  let invalid = !id || id.length > 100
  for (let i = 0; i < 100 && i < id.length; i++) {
    const c = id[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalid = true
  }
  if (invalid) return ctx.json({ error: 'Invalid key ID.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ id, rpm_limit: null, tpm_limit: null, expires_at: null, security_enabled: false, security_action: 'log', spend_limit_enabled: false, preview: true }, { schema: 'arc.PolicyPreview', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const result = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys/${id}`, { method: 'GET', headers: { 'Fastly-Key': token }, timeoutMs: 15000 })
  if (result.status === 404) return ctx.json({ error: 'This ARC key was not found. Refresh the key list.' }, { status: 404, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  if (result.status < 200 || result.status >= 300) return ctx.json({ error: 'Could not read the key policy. Check ARC access and try again.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  // GET key returns metadata only, never access_token. Preserve the response;
  // the browser reads just the documented policy fields.
  return result
})
policies.patch('/:id/policy', async (ctx) => {
  const id = ctx.param('id') || ''
  let invalid = !id || id.length > 100
  for (let i = 0; i < 100 && i < id.length; i++) {
    const c = id[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalid = true
  }
  const input = await ctx.req.json<PolicyPatch>('arc.PolicyPatch')
  if (input.rpm_limit !== undefined && input.rpm_limit !== null && (input.rpm_limit < 1 || input.rpm_limit > 9007199254740991 || input.rpm_limit % 1 !== 0)) invalid = true
  if (input.tpm_limit !== undefined && input.tpm_limit !== null && (input.tpm_limit < 1 || input.tpm_limit > 9007199254740991 || input.tpm_limit % 1 !== 0)) invalid = true
  if (input.expires_at !== undefined && input.expires_at !== null && (!input.expires_at.trim() || input.expires_at.length < 20 || input.expires_at.length > 40)) invalid = true
  if (invalid) return ctx.json({ error: 'Use positive whole-number limits, null to remove a limit or expiry, and an RFC 3339 expiry timestamp.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ error: 'Policy changes require a live ARC connection. Preview is read-only.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  // Forward the schema-projected partial object: omission means unchanged,
  // null removes a limit/expiry, false explicitly disables a boolean flag.
  const result = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys/${id}`, { method: 'PATCH', headers: { 'Fastly-Key': token }, json: input, schema: 'arc.PolicyPatch', timeoutMs: 15000 })
  if (result.status < 200 || result.status >= 300) return ctx.json({ error: 'ARC did not accept the policy update. Check the values and account access. Reload the policy before retrying if the result is uncertain.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.text('Key policy saved.', { headers: { 'cache-control': 'no-store' } })
})
policies.get('/:id/failover', async (ctx) => {
  const id = ctx.param('id') || ''
  let invalid = !id || id.length > 100
  for (let i = 0; i < 100 && i < id.length; i++) {
    const c = id[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalid = true
  }
  if (invalid) return ctx.json({ error: 'Invalid key ID.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ targets: [], timeout_enabled: false, rate_limit_429_enabled: false, server_error_5xx_enabled: false }, { schema: 'arc.Failover', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const result = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys/${id}/failover`, { method: 'GET', headers: { 'Fastly-Key': token }, timeoutMs: 15000 })
  if (result.status === 404) return ctx.json({ error: 'Failover is unavailable for this account, or this key no longer exists. Key limits and firewall can still be managed separately.' }, { status: 404, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  if (result.status < 200 || result.status >= 300) return ctx.json({ error: 'Could not read failover. Existing targets have not been loaded; saving is disabled until a successful reload.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return result
})
policies.put('/:id/failover', async (ctx) => {
  const id = ctx.param('id') || ''
  let invalid = !id || id.length > 100
  for (let i = 0; i < 100 && i < id.length; i++) {
    const c = id[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalid = true
  }
  const input = await ctx.req.json<FailoverPolicy>('arc.Failover')
  if (input.targets.length > 25) invalid = true
  for (let i = 0; i < 25 && i < input.targets.length; i++) {
    const target = input.targets[i].provider_connection_id
    if (!target.trim() || target.length > 100) invalid = true
    for (let j = 0; j < 25 && j < i; j++) { if (input.targets[j].provider_connection_id === target) invalid = true }
  }
  if (invalid) return ctx.json({ error: 'Choose up to 25 different provider connections in retry order.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ error: 'Failover changes require a live ARC connection. Preview is read-only.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  // PUT replaces the complete policy, including target order and all triggers.
  const result = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys/${id}/failover`, { method: 'PUT', headers: { 'Fastly-Key': token }, json: input, schema: 'arc.Failover', timeoutMs: 15000 })
  if (result.status === 404) return ctx.json({ error: 'Failover is unavailable for this account, or this key no longer exists. Key policy changes are independent of this operation.' }, { status: 404, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  if (result.status < 200 || result.status >= 300) return ctx.json({ error: 'ARC did not accept the failover policy. Reload failover before retrying if the result is uncertain. Key policy changes are independent of this operation.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.text('Failover policy saved.', { headers: { 'cache-control': 'no-store' } })
})
export default policies
