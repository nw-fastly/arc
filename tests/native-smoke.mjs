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
export const demoSettings = {
  users: [{ id: 'alex', name: 'Alex Morgan', tokenId: 'team', active: true }, { id: 'sam', name: 'Sam Rivera', tokenId: 'team', active: true }],
  tokens: [{ id: 'team', label: 'Demo team', value: 'native-test-key', active: true }],
  models: [{ id: 'demo-fast', label: 'Quick thinker', provider: 'Preview', active: true }, { id: 'demo-reasoning', label: 'Deep thinker', provider: 'Preview', active: true }],
}
export async function withNativeServer(callback, { mode = 'live', seed = false } = {}) {
  if (!process.env.VICEROY_BIN) throw new Error('Set VICEROY_BIN to your Viceroy executable. Build first with npm run build.')
  const folder = await mkdtemp(join(tmpdir(), 'arc-native-'))
  let seen = [], logs = ''
  const origin = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    if (!body) { res.writeHead(404); res.end('No body for ' + req.method + ' ' + req.url); return }
    seen.push({ headers: req.headers, body: JSON.parse(body) })
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ model: 'demo-fast', choices: [{ message: { role: 'assistant', content: '**Hello from ARC.**\n\nThis is a controlled upstream fixture.' } }], usage: { total_tokens: 24 } }))
  })
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve))
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve)); const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve))
  const config = renderFastlyLocalConfig({
    configStores: { arc_config: { ARC_MODE: mode, ARC_URL: 'https://arc.example.invalid/v1/chat/completions' } },
    secretStores: { arc_secrets: { ADMIN_PASSWORD: 'local-admin-only' } },
    kvStores: { arc_state: seed ? { settings: demoSettings } : {} },
    backends: { arc_backend: { url: `http://127.0.0.1:${origin.address().port}` } },
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
    const get = path => fetch(base + path)
    assert.equal(await (await get('/health')).text(), 'ok')
    for (const [path, source] of [['/', 'index.html'], ['/admin', 'index.html'], ['/app.css', 'app.css'], ['/app.js', 'app.js']]) {
      const response = await get(path); assert.equal(response.status, 200); assert.equal(await response.text(), await readFile(`public/${source}`, 'utf8'))
    }
    assert.equal((await get('/api/admin/settings')).status, 401)
    assert.equal((await fetch(base + '/api/admin/settings', { method: 'PUT', headers: auth, body: JSON.stringify(demoSettings) })).status, 200)
    const read = await (await fetch(base + '/api/admin/settings', { headers: auth })).json(); assert.deepEqual(read, demoSettings)
    const catalog = await (await get('/api/bootstrap')).json(); assert.equal(catalog.users.length, 2); assert.equal(JSON.stringify(catalog).includes('native-test-key'), false)
    const chat = { userId: 'alex', model: 'demo-fast', messages: [{ role: 'user', content: 'Hello "world"\nUnicode: café' }], sessionId: 'native-session' }
    const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) })
    assert.equal(response.status, 200); assert.equal((await response.json()).usage.total_tokens, 24)
    assert.equal(seen.length, 1); assert.equal(seen[0].headers.authorization, 'Bearer native-test-key'); assert.deepEqual(seen[0].body, { model: 'demo-fast', messages: chat.messages, stream: false })
    const disabled = structuredClone(demoSettings); disabled.tokens[0].active = false
    assert.equal((await fetch(base + '/api/admin/settings', { method: 'PUT', headers: auth, body: JSON.stringify(disabled) })).status, 200)
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) })).status, 403); assert.equal(seen.length, 1)
    console.log('Native Viceroy smoke passed: assets, auth, KV persistence, public redaction, outbound key/body, and disabled-key denial.')
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await smoke()
