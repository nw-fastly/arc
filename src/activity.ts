import { Router } from '@pulse-compute/runtime'
import type { ActivityInput } from './schemas.js'

const activity = new Router()
// Mounted after admin authentication. POST carries bounded filter input; every
// upstream operation is a read. No logs, metrics or prompts are persisted in KV.
activity.post('/:resource', async (ctx) => {
  const resource = ctx.param('resource') || ''
  if (resource !== 'usage-metrics' && resource !== 'sessions') return ctx.json({ error: 'Unknown activity resource.' }, { status: 404, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const input = await ctx.req.json<ActivityInput>('arc.ActivityInput')
  let invalid = input.key.length > 100 || input.cursor.length > 1024 || input.from.length !== 24 || input.to.length !== 24 || input.from >= input.to
  for (let i = 0; i < 100 && i < input.key.length; i++) {
    const c = input.key[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalid = true
  }
  // Browser supplies canonical UTC ISO timestamps. Fixed punctuation and digits
  // keep the query safe; ARC remains responsible for calendar validation.
  for (let i = 0; i < 24; i++) {
    let separator = ''
    if (i === 4 || i === 7) separator = '-'
    if (i === 10) separator = 'T'
    if (i === 13 || i === 16) separator = ':'
    if (i === 19) separator = '.'
    if (i === 23) separator = 'Z'
    const a = input.from[i], b = input.to[i]
    if (separator) { if (a !== separator || b !== separator) invalid = true }
    else if (!(a >= '0' && a <= '9' && b >= '0' && b <= '9')) invalid = true
  }
  // Opaque cursor is percent-encoded by the browser, as on the key list route.
  for (let i = 0; i < 1024 && i < input.cursor.length; i++) {
    const c = input.cursor[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_' || c === '.' || c === '~' || c === '%')) invalid = true
  }
  if (invalid) return ctx.json({ error: 'Invalid activity filters. Refresh the time range and try again.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.text('{"data":[],"meta":{"total":0,"next_cursor":null,"prev_cursor":null},"preview":true}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN to read ARC activity.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  let keyFilter = ''
  if (input.key) keyFilter = `&key=${input.key}`
  let suffix = '&granularity=hourly&sort=-date'
  if (resource === 'sessions') suffix = `&limit=25&sort=-created_at&cursor=${input.cursor}`
  // Preserve the upstream body, including optional firewall fields and arbitrary
  // log attrs. Native owns the opaque response; the browser validates its shape.
  const result = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/${resource}?from=${input.from}&to=${input.to}${keyFilter}${suffix}`, { method: 'GET', headers: { 'Fastly-Key': token, 'cache-control': 'no-store' }, timeoutMs: 15000 })
  if (result.status === 401 || result.status === 403) return ctx.json({ error: 'ARC activity access was denied. Check the management token and account entitlement.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  if (result.status === 429) return ctx.json({ error: 'ARC activity is rate limited. Wait before refreshing.' }, { status: 429, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  if (result.status < 200 || result.status >= 300) return ctx.json({ error: 'Could not load ARC activity. Refresh to restart pagination if a cursor expired.' }, { status: result.status, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return result
})
export default activity
