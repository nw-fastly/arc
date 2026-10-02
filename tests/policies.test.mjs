import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuthoringApp } from './helpers/authoring-app.mjs'
const path = '/api/admin/keys/key-1', endpoint = 'https://api.fastly.com/ai-runtime-control/v1/keys/key-1'
const failover = { targets: [{ provider_connection_id: 'second' }, { provider_connection_id: 'first' }], timeout_enabled: true, rate_limit_429_enabled: false, server_error_5xx_enabled: true }
test('all policy routes inherit admin authentication before contacting ARC', async () => {
  const app = createAuthoringApp()
  for (const [method, suffix] of [['GET', 'policy'], ['PATCH', 'policy'], ['GET', 'failover'], ['PUT', 'failover']]) assert.equal((await app.dispatch({ method, path: `${path}/${suffix}`, headers: {} })).status, 401)
  assert.equal(app.seen.length, 0)
})
test('PATCH preserves omission, explicit null, false, and UTC expiry without KV writes', async () => {
  const app = createAuthoringApp(), body = { rpm_limit: null, security_enabled: false, spend_limit_enabled: true, expires_at: '2027-01-01T12:30:00.000Z' }
  assert.equal((await app.dispatch({ method: 'PATCH', path: path + '/policy', body })).status, 200)
  assert.deepEqual(app.seen, [{ url: endpoint, method: 'PATCH', headers: { 'Fastly-Key': 'test-management' }, json: body, schema: 'arc.PolicyPatch', timeoutMs: 15000 }])
  assert.equal('tpm_limit' in app.seen[0].json, false); assert.deepEqual(app.writes, [])
})
test('invalid numeric limits are rejected before dispatch', async () => {
  const app = createAuthoringApp()
  for (const rpm_limit of [0, -1, 1.2, 9007199254740992]) assert.equal((await app.dispatch({ method: 'PATCH', path: path + '/policy', body: { rpm_limit } })).status, 400)
  assert.equal(app.seen.length, 0)
})
test('failover replaces the complete policy preserving target order and all triggers', async () => {
  const app = createAuthoringApp()
  assert.equal((await app.dispatch({ method: 'PUT', path: path + '/failover', body: failover })).status, 200)
  assert.deepEqual(app.seen[0], { url: endpoint + '/failover', method: 'PUT', headers: { 'Fastly-Key': 'test-management' }, json: failover, schema: 'arc.Failover', timeoutMs: 15000 })
  const empty = { ...failover, targets: [] }; assert.equal((await app.dispatch({ method: 'PUT', path: path + '/failover', body: empty })).status, 200); assert.deepEqual(app.seen[1].json.targets, [])
})
test('failover rejects duplicate, empty, oversized target lists', async () => {
  const app = createAuthoringApp()
  for (const targets of [[{ provider_connection_id: '' }], [{ provider_connection_id: 'same' }, { provider_connection_id: 'same' }], Array.from({ length: 26 }, (_, i) => ({ provider_connection_id: 'id-' + i }))]) assert.equal((await app.dispatch({ method: 'PUT', path: path + '/failover', body: { ...failover, targets } })).status, 400)
  assert.equal(app.seen.length, 0)
})
test('failover 404 stays distinct from authentication, throttling, and service errors', async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    const app = createAuthoringApp({ upstream: async () => ({ status, json: { error: 'upstream detail' } }) })
    for (const method of ['GET', 'PUT']) { const result = await app.dispatch({ method, path: path + '/failover', body: failover }); assert.equal(result.status, status); if (status === 404) assert.match(result.json.error, /unavailable.*or.*key/); assert.ok(!result.json.error.includes('upstream detail')) }
  }
})
test('key-policy success is retained when the independent failover save fails', async () => {
  const app = createAuthoringApp({ upstream: async r => ({ status: r.url.endsWith('/failover') ? 503 : 200, json: {} }) })
  assert.equal((await app.dispatch({ method: 'PATCH', path: path + '/policy', body: { tpm_limit: 4000 } })).status, 200)
  assert.equal((await app.dispatch({ method: 'PUT', path: path + '/failover', body: failover })).status, 503)
  assert.equal(app.seen.length, 2); assert.deepEqual(app.writes, [])
})
test('timeout is uncertain, sanitized, and never automatically retried', async () => {
  const app = createAuthoringApp({ upstream: async () => { throw Error('test-management transport failure') } })
  const result = await app.dispatch({ method: 'PATCH', path: path + '/policy', body: { spend_limit_enabled: false } })
  assert.equal(result.status, 502); assert.match(result.json.error, /may already have processed/); assert.ok(!JSON.stringify(result).includes('test-management')); assert.equal(app.seen.length, 1)
})
test('preview writes and malformed key paths do not contact ARC', async () => {
  const preview = createAuthoringApp({ config: { ARC_MODE: 'preview' } })
  for (const [method, suffix, body] of [['PATCH', 'policy', { rpm_limit: 1 }], ['PUT', 'failover', failover]]) assert.equal((await preview.dispatch({ method, path: `${path}/${suffix}`, body })).status, 409)
  assert.equal(preview.seen.length, 0)
  const app = createAuthoringApp(); assert.equal((await app.dispatch({ path: '/api/admin/keys/%3F/policy' })).status, 400); assert.equal(app.seen.length, 0)
})
test('spend toggle is update-only; key creation still sends only name/provider/model', async () => {
  const app = createAuthoringApp({ upstream: async () => ({ status: 201, json: { id: 'new', name: 'New', provider: 'demo', model: 'fast', access_token: 'never-public' } }) })
  const result = await app.dispatch({ method: 'POST', path: '/api/admin/keys', body: { name: 'New', provider: 'demo', model: 'fast' } })
  assert.equal(result.status, 201); assert.equal('spend_limit_enabled' in app.seen[0].json, false); assert.ok(!JSON.stringify(result).includes('never-public'))
})
