// Optional browser evidence using actual handlers with recorded test effects.
// This is not a Pulse Native or live ARC test. Playwright is supplied externally.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createAuthoringApp } from './helpers/authoring-app.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const key = { id: 'key-1', name: 'Demo key', provider: 'fixture', model: 'fixture-fast' }
let policy = { ...key, rpm_limit: 60, tpm_limit: 10000, expires_at: '2027-01-01T12:30:00.000Z', security_enabled: true, security_action: 'block', spend_limit_enabled: true }
let failover = { targets: [{ provider_connection_id: 'conn-1' }, { provider_connection_id: 'conn-2' }, { provider_connection_id: 'missing-connection' }], timeout_enabled: true, rate_limit_429_enabled: false, server_error_5xx_enabled: true }
let failoverReadStatus = 200, failoverWriteStatus = 200
const management = 'https://api.fastly.com/ai-runtime-control/v1'
const app = createAuthoringApp({ state: { 'credentials-v2': { keys: [{ ...key, value: 'fixture-only-secret' }] }, 'users-v2': { users: [] } }, upstream: async ({ url, method, json }) => {
  if (url === management + '/providers') return { status: 200, json: { data: [{ id: 'fixture', display_name: 'Fixture', models: [{ id: 'fixture-fast', display_name: 'Fast', provider_id: 'fixture' }] }] } }
  if (url === management + '/provider-connections') return { status: 200, json: { data: [{ id: 'conn-1', name: 'Primary backup', models: ['fixture-fast'], auth_type: 'api-key' }, { id: 'conn-2', name: 'Secondary backup', models: ['fixture-fast'], auth_type: 'api-key' }] } }
  if (url.startsWith(management + '/keys?')) return { status: 200, json: { data: [key], meta: { next_cursor: null } } }
  if (url.endsWith('/failover')) {
    if (method === 'GET') return { status: failoverReadStatus, json: structuredClone(failover) }
    if (failoverWriteStatus === 200) failover = structuredClone(json)
    return { status: failoverWriteStatus, json: failover }
  }
  if (url === management + '/keys/key-1') { if (method === 'PATCH') policy = { ...policy, ...json }; return { status: 200, json: structuredClone(policy) } }
  return { status: 404, json: {} }
} })
const server = createServer(async (req, res) => {
  try {
    if (!req.url.startsWith('/api/')) {
      const files = { '/admin': 'index.html', '/': 'index.html', '/app.js': 'app.js', '/app.css': 'app.css' }, file = files[req.url]
      if (!file) { res.writeHead(404); res.end(); return }
      res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await readFile('public/' + file)); return
    }
    let raw = ''; for await (const chunk of req) raw += chunk
    const result = await app.dispatch({ path: req.url, method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : undefined })
    res.writeHead(result.status, { 'content-type': result.json === undefined ? 'text/plain' : 'application/json', ...result.headers }); res.end(result.json === undefined ? result.text || '' : JSON.stringify(result.json))
  } catch (error) { res.writeHead(500); res.end(error.message) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, timezoneId: 'America/Denver' }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/admin`); await page.locator('#password').fill('test-admin'); await page.getByRole('button', { name: 'Open admin' }).click()
  await page.getByRole('button', { name: 'Virtual keys', exact: true }).click(); await page.getByRole('button', { name: 'Policies for Demo key' }).click()
  const policyForm = page.getByRole('form', { name: 'Key policy', exact: true }), failoverForm = page.getByRole('form', { name: 'Failover', exact: true })
  await policyForm.getByRole('button', { name: 'Save key policy' }).waitFor(); await failoverForm.getByRole('button', { name: 'Save failover' }).waitFor()
  assert.equal(await policyForm.locator('[name=expires_at]').inputValue(), '2027-01-01T12:30')
  assert.match(await failoverForm.getByLabel('Failover target 3').textContent(), /existing target/)
  await page.screenshot({ path: 'docs/screenshots/policies.png', fullPage: true })
  const mutations = () => app.seen.filter(r => ['PATCH', 'PUT'].includes(r.method))
  await policyForm.getByRole('button', { name: 'Save key policy' }).click(); assert.equal(mutations().length, 0)
  await policyForm.getByLabel('Requests per minute', { exact: true }).fill(''); await policyForm.getByLabel('Enable AI Firewall', { exact: true }).uncheck(); await policyForm.getByLabel('Enable ARC spend limit', { exact: true }).uncheck()
  await policyForm.getByRole('button', { name: 'Save key policy' }).click(); await page.getByText('Key policy saved. Failover is saved separately.', { exact: true }).waitFor()
  assert.deepEqual(mutations()[0].json, { rpm_limit: null, security_enabled: false, spend_limit_enabled: false })
  await policyForm.locator('[name=expires_at]').fill('2027-02-03T06:07')
  await policyForm.getByRole('button', { name: 'Save key policy' }).click(); await page.getByText('Key policy saved. Failover is saved separately.', { exact: true }).waitFor()
  assert.deepEqual(mutations().at(-1).json, { expires_at: '2027-02-03T06:07:00.000Z' })
  await policyForm.locator('[name=expires_at]').fill('')
  await policyForm.getByRole('button', { name: 'Save key policy' }).click(); await page.getByText('Key policy saved. Failover is saved separately.', { exact: true }).waitFor()
  assert.deepEqual(mutations().at(-1).json, { expires_at: null })
  await failoverForm.getByRole('button', { name: 'Move target 2 up', exact: true }).click(); await failoverForm.getByLabel('Retry on provider 429', { exact: true }).check()
  failoverWriteStatus = 503
  await failoverForm.getByRole('button', { name: 'Save failover' }).click(); await page.getByText('No successful save was confirmed.', { exact: false }).waitFor()
  assert.equal(mutations().length, 4); assert.deepEqual(mutations()[3].json.targets.map(t => t.provider_connection_id), ['conn-2', 'conn-1', 'missing-connection']); assert.equal(mutations()[3].json.rate_limit_429_enabled, true)
  assert.equal(await page.getByText('Key policy saved. Failover is saved separately.', { exact: true }).isVisible(), true)
  failoverWriteStatus = 200; await failoverForm.getByRole('button', { name: 'Save failover' }).click(); await page.getByText('Failover saved. Key policy is saved separately.', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#editor').scrollWidth <= document.querySelector('#editor').clientWidth), 'mobile modal must not overflow horizontally')
  await page.screenshot({ path: 'docs/screenshots/policies-mobile.png', fullPage: true })
  // A duplicate target never issues a write.
  await failoverForm.getByLabel('Failover target 2').selectOption('conn-2'); const count = mutations().length; await failoverForm.getByRole('button', { name: 'Save failover' }).click(); await page.getByText('Select a different connection for each target.').waitFor(); assert.equal(mutations().length, count)
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload failover', exact: true }).click(); await failoverForm.getByRole('button', { name: 'Save failover' }).waitFor()
  // Removing the final target is an explicit complete replacement.
  for (let i = 0; i < 3; i++) await failoverForm.getByRole('button', { name: 'Remove target 1', exact: true }).click()
  page.once('dialog', dialog => dialog.accept()); await failoverForm.getByRole('button', { name: 'Save failover' }).click(); await page.getByText('Failover saved. Key policy is saved separately.', { exact: true }).waitFor(); assert.deepEqual(mutations().at(-1).json.targets, [])
  await page.getByRole('button', { name: 'Close', exact: true }).click(); failoverReadStatus = 404
  await page.getByRole('button', { name: 'Policies for Demo key' }).click(); await page.getByText('Failover is unavailable for this account', { exact: false }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Save failover', exact: true }).count(), 0); assert.equal(await page.getByRole('button', { name: 'Save key policy', exact: true }).isVisible(), true)
  assert.deepEqual(errors, []); console.log('Policy browser checks passed: partial PATCH, UTC, spend toggle, failover order/removal, missing connection preservation, independent failures, gated feature, and mobile layout.')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
