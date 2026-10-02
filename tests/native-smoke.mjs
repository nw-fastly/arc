import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { renderFastlyLocalConfig } = require('@pulse-compute/provider-fastly/testing/fastly-cli')
export const demoUsers = { users: [{ id: 'alex', name: 'Alex Morgan', keyIds: ['key-1'], active: true }, { id: 'sam', name: 'Sam Rivera', keyIds: [], active: true }] }
export const demoKey = { id: 'key-1', name: 'Fast model', provider: 'fixture', model: 'fixture-fast', value: 'native-test-key' }
export async function withNativeServer(callback, { mode = 'live', seed = false } = {}) {
  if (!process.env.VICEROY_BIN) throw new Error('Set VICEROY_BIN to your Viceroy executable. Build first with npm run build.')
  const folder = await mkdtemp(join(tmpdir(), 'arc-native-'))
  let seen = [], logs = ''
  const remoteKeys = [{ id: demoKey.id, name: demoKey.name, provider: demoKey.provider, model: demoKey.model }]
  let rotations = 0
  const origin = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    const input = body ? JSON.parse(body) : null
    seen.push({ method: req.method, path: req.url, headers: req.headers, body: input })
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    const base = '/ai-runtime-control/v1'
    if (req.url === base + '/providers') return res.end(JSON.stringify({ data: [{ id: 'fixture', display_name: 'Fixture provider', models: [{ id: 'fixture-fast', display_name: 'Fast', provider_id: 'fixture' }, { id: 'fixture-other', display_name: 'Other', provider_id: 'fixture' }] }] }))
    if (req.url === base + '/provider-connections') return res.end(JSON.stringify({ data: [{ id: 'conn-1', name: 'custom', models: ['custom-fast'], auth_type: 'api-key', secret_id: 'hidden' }] }))
    if (req.method === 'GET' && req.url.startsWith(base + '/keys?')) return res.end(JSON.stringify({ data: remoteKeys, meta: { next_cursor: null } }))
    if (req.method === 'POST' && req.url === base + '/keys') {
      const key = { id: 'key-' + (remoteKeys.length + 1), ...input }; remoteKeys.push(key); res.statusCode = 201
      return res.end(JSON.stringify({ ...key, access_token: 'created-native-secret' }))
    }
    if (req.method === 'POST' && req.url.endsWith('/rotate')) {
      const key = remoteKeys.find(key => req.url === base + '/keys/' + key.id + '/rotate')
      if (!key) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'missing key' })) }
      res.statusCode = 201
      return res.end(JSON.stringify({ ...key, access_token: 'rotated-native-secret-' + ++rotations }))
    }
    if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ model: input.model, choices: [{ message: { role: 'assistant', content: '**Hello from ARC.**\n\nThis is a controlled upstream fixture.' } }], usage: { total_tokens: 24 } }))
    res.statusCode = 404; res.end(JSON.stringify({ error: 'missing route' }))
  })
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve))
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve)); const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve))
  const config = renderFastlyLocalConfig({
    configStores: { arc_config: { ARC_MODE: mode } },
    secretStores: { arc_secrets: { ADMIN_PASSWORD: 'local-admin-only', FASTLY_API_TOKEN: 'native-management-secret' } },
    kvStores: { arc_state: seed ? { 'users-v2': demoUsers, 'credentials-v2': { keys: [demoKey] } } : {} },
    backends: { arc_gateway: { url: `http://127.0.0.1:${origin.address().port}` }, fastly_api: { url: `http://127.0.0.1:${origin.address().port}` } },
  })
  await writeFile(join(folder, 'fastly.toml'), config)
  const processHandle = spawn(resolve(process.env.VICEROY_BIN), ['--addr', `127.0.0.1:${port}`, '-C', join(folder, 'fastly.toml'), resolve('dist/bin/main.wasm')], { stdio: ['ignore', 'pipe', 'pipe'] })
  processHandle.stdout.on('data', data => { logs = (logs + data).slice(-8000) }); processHandle.stderr.on('data', data => { logs = (logs + data).slice(-8000) })
  let startupError; processHandle.on('error', error => { startupError = error })
  const base = `http://127.0.0.1:${port}`
  try {
    let ready = false
    for (let i = 0; i < 200; i++) {
      if (startupError) throw startupError
      if (processHandle.exitCode !== null) throw new Error(`Viceroy exited: ${logs}`)
      try { const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!ready) throw new Error(`Viceroy startup timed out: ${logs}`)
    return await callback({ base, seen })
  } catch (error) { console.error(logs); throw error } finally {
    processHandle.kill('SIGTERM')
    await new Promise(resolve => { if (processHandle.exitCode !== null) return resolve(); processHandle.once('exit', resolve); const timer = setTimeout(() => { processHandle.kill('SIGKILL'); resolve() }, 2000); timer.unref() })
    await new Promise(resolve => origin.close(resolve)); await rm(folder, { recursive: true, force: true })
  }
}
async function smoke() {
  await withNativeServer(async ({ base, seen }) => {
    const auth = { authorization: 'Bearer local-admin-only', 'content-type': 'application/json' }
    const call = async (path, body, method = 'POST') => fetch(base + path, { method, headers: auth, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const read = async response => { const text = await response.text(); assert.ok(!text.includes('native-secret') && !text.includes('native-test-key') && !text.includes('native-management-secret'), 'response must redact credentials'); return JSON.parse(text) }
    assert.equal(await (await fetch(base + '/health')).text(), 'ok')
    for (const [path, source] of [['/', 'index.html'], ['/admin', 'index.html'], ['/app.css', 'app.css'], ['/app.js', 'app.js']]) {
      const response = await fetch(base + path); assert.equal(response.status, 200); assert.equal(await response.text(), await readFile(`public/${source}`, 'utf8'))
    }
    assert.equal((await fetch(base + '/api/admin/users')).status, 401)
    const discovery = await read(await call('/api/admin/catalog', undefined, 'GET'))
    assert.equal(discovery.providers[0].id, 'fixture'); assert.equal(JSON.stringify(discovery).includes('hidden'), false)
    const input = { name: 'New key', provider: 'fixture', model: 'fixture-other' }
    const creation = await call('/api/admin/keys', input); assert.equal(creation.status, 201); assert.equal(await creation.text(), 'Key created and stored.')
    const listed = await read(await call('/api/admin/keys/list', { cursor: '' })); assert.equal(listed.keys.find(k => k.id === 'key-2').ready, true)
    assert.equal(seen.find(r => r.method === 'POST' && r.path.endsWith('/keys')).headers['fastly-key'], 'native-management-secret')
    const users = { users: [{ ...demoUsers.users[0], keyIds: ['key-1', 'key-2'] }, demoUsers.users[1]] }
    assert.equal((await call('/api/admin/users', users, 'PUT')).status, 200)
    const bootstrap = await read(await fetch(base + '/api/bootstrap')); assert.equal(bootstrap.users[0].models.length, 2); assert.equal(bootstrap.users[1].models.length, 0)
    const chat = { userId: 'alex', keyId: 'key-2', model: 'untrusted-browser-model', messages: [{ role: 'user', content: 'Hello "world"\nUnicode: café' }], sessionId: 'local-session' }
    assert.equal((await call('/api/chat', chat)).status, 200)
    let outbound = seen.filter(r => r.path === '/v1/chat/completions').at(-1)
    assert.equal(outbound.headers.authorization, 'Bearer created-native-secret'); assert.deepEqual(outbound.body, { model: 'fixture-other', messages: chat.messages, stream: false })
    assert.equal(outbound.headers['fastly-key'], undefined)
    const rotation = await call('/api/admin/keys/key-2/rotate', {}); assert.equal(rotation.status, 200); assert.equal(await rotation.text(), 'Key rotated and stored.')
    // A stale user snapshot cannot restore the pre-rotation credential.
    assert.equal((await call('/api/admin/users', users, 'PUT')).status, 200)
    assert.equal((await call('/api/chat', chat)).status, 200)
    outbound = seen.filter(r => r.path === '/v1/chat/completions').at(-1)
    assert.equal(outbound.headers.authorization, 'Bearer rotated-native-secret-1')
    const before = seen.length
    assert.equal((await call('/api/chat', { ...chat, userId: 'sam' })).status, 403); assert.equal(seen.length, before)
    const disabled = { users: users.users.map(u => ({ ...u, active: false })) }
    assert.equal((await call('/api/admin/users', disabled, 'PUT')).status, 200)
    assert.equal((await call('/api/chat', chat)).status, 403)
    console.log('Native Viceroy smoke passed: assets, auth, discovery, key creation/rotation, secret redaction, assignments, server-selected model, and stale-user-save isolation.')
  }, { seed: true })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await smoke()
