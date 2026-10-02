import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthoringApp } from './helpers/authoring-app.mjs'
const filters = { key: 'key-1', from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', cursor: '' }
const call = (app, resource = 'sessions', body = filters, headers) => app.dispatch({ method: 'POST', path: '/api/admin/activity/' + resource, body, ...(headers ? { headers } : {}) })
test('activity requires admin authentication before contacting ARC', async () => {
  const app = createAuthoringApp()
  assert.equal((await call(app, 'sessions', filters, {})).status, 401)
  assert.equal(app.seen.length, 0)
})
test('activity uses fixed read-only endpoints, bounded pagination and exact filters', async () => {
  const app = createAuthoringApp()
  await call(app, 'sessions', { ...filters, cursor: 'next%2F%2B%3D' })
  await call(app, 'usage-metrics')
  assert.deepEqual(app.seen.map(r => r.url), [
    'https://api.fastly.com/ai-runtime-control/v1/sessions?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z&key=key-1&limit=25&sort=-created_at&cursor=next%2F%2B%3D',
    'https://api.fastly.com/ai-runtime-control/v1/usage-metrics?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z&key=key-1&granularity=hourly&sort=-date',
  ])
  for (const request of app.seen) { assert.equal(request.method, 'GET'); assert.equal(request.headers['Fastly-Key'], 'test-management') }
  assert.deepEqual(app.writes, [])
})
test('rejects query injection, invalid ranges, oversized input and unknown resources', async () => {
  const app = createAuthoringApp()
  for (const patch of [{ key: 'x&provider=y' }, { cursor: '&limit=1000' }, { cursor: 'x'.repeat(1025) }, { from: filters.to }, { from: '2026-10-01T00:00:00.000&' }, { to: 'short' }]) assert.equal((await call(app, 'sessions', { ...filters, ...patch })).status, 400)
  assert.equal((await call(app, 'keys')).status, 404)
  assert.equal(app.seen.length, 0)
})
test('preview is explicit, empty and never contacts ARC', async () => {
  const app = createAuthoringApp({ config: { ARC_MODE: 'preview' } })
  for (const resource of ['sessions', 'usage-metrics']) { const result = await call(app, resource); assert.equal(JSON.parse(result.text).preview, true); assert.equal(result.headers['cache-control'], 'no-store') }
  assert.equal(app.seen.length, 0)
})
test('upstream failures stay independent, sanitized and are not retried', async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const app = createAuthoringApp({ upstream: async r => ({ status: r.url.includes('/sessions?') ? status : 200, json: { secret: 'upstream-sensitive-error' } }) })
    const result = await call(app)
    assert.equal(result.status, status); assert.ok(!JSON.stringify(result).includes('upstream-sensitive-error'))
    assert.equal((await call(app, 'usage-metrics')).status, 200); assert.equal(app.seen.length, 2)
  }
})
test('passes session logs and absent/empty firewall fields without persisting them', async () => {
  const data = { data: [{ id: 's1', firewall_enabled: true, logs: [{ request: '<script>alert(1)</script>', attrs: { arbitrary: 'value' } }] }, { id: 's2', firewall_enabled: true, firewall_outcome: '', logs: [] }], meta: { next_cursor: 'next==' } }
  const app = createAuthoringApp({ upstream: async () => ({ status: 200, json: data }) })
  const result = await call(app); assert.deepEqual(result.json, data); assert.deepEqual(app.writes, [])
})
