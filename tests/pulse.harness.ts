const user = { id: 'alex', name: 'Alex Morgan', tokenId: 'team', active: true }
const token = { id: 'team', label: 'Demo team', value: 'test-virtual-key', active: true }
const model = { id: 'demo-fast', label: 'Quick thinker', provider: 'Preview', active: true }
const settings = { users: [user], tokens: [token], models: [model] }
const auth = { authorization: 'Bearer test-admin', 'content-type': 'application/json' }
const secrets = { ADMIN_PASSWORD: 'test-admin' }
const chat = { userId: 'alex', model: 'demo-fast', messages: [{ role: 'user', content: 'Hello' }], sessionId: 'session-1' }
export default { cases: [
  { name: 'health', request: { path: '/health' }, expect: { status: 200, text: 'ok' } },
  { name: 'public-catalog-excludes-keys', request: { path: '/api/bootstrap' }, kv: { state: { settings } }, config: { ARC_MODE: 'preview' }, expect: { status: 200, json: { users: [{ ...user, tokenId: '' }], models: [model], mode: 'preview' } } },
  { name: 'uninitialized-catalog', request: { path: '/api/bootstrap' }, kv: { state: {} }, expect: { status: 200, json: { users: [], models: [], mode: 'live' } } },
  { name: 'admin-denied', request: { path: '/api/admin/settings' }, secrets, expect: { status: 401 } },
  { name: 'admin-missing-secret-fails-closed', request: { path: '/api/admin/settings', headers: auth }, expect: { status: 401 } },
  { name: 'admin-read', request: { path: '/api/admin/settings', headers: auth }, secrets, kv: { state: { settings } }, expect: { status: 200, json: settings } },
  { name: 'admin-write', request: { method: 'PUT', path: '/api/admin/settings', headers: auth, body: JSON.stringify(settings) }, secrets, kv: { state: {} }, expect: { status: 200 } },
  { name: 'admin-write-denied', request: { method: 'PUT', path: '/api/admin/settings', body: JSON.stringify(settings) }, secrets, expect: { status: 401 } },
  { name: 'admin-rejects-dangling-token', request: { method: 'PUT', path: '/api/admin/settings', headers: auth, body: JSON.stringify({ ...settings, tokens: [] }) }, secrets, expect: { status: 400 } },
  { name: 'admin-rejects-duplicate-user', request: { method: 'PUT', path: '/api/admin/settings', headers: auth, body: JSON.stringify({ ...settings, users: [user, user] }) }, secrets, expect: { status: 400 } },
  { name: 'unknown-user-denied', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...chat, userId: 'missing' }) }, kv: { state: { settings } }, expect: { status: 403 } },
  { name: 'disabled-token-denied', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) }, kv: { state: { settings: { ...settings, tokens: [{ ...token, active: false }] } } }, expect: { status: 403 } },
  { name: 'unknown-model-denied', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...chat, model: 'unavailable' }) }, kv: { state: { settings } }, expect: { status: 403 } },
  { name: 'empty-message-denied', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...chat, messages: [{ role: 'user', content: '   ' }] }) }, kv: { state: { settings } }, expect: { status: 400 } },
  { name: 'live-needs-endpoint', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) }, kv: { state: { settings } }, expect: { status: 503 } },
  { name: 'live-response', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) }, config: { ARC_MODE: 'live', ARC_URL: 'https://arc.example.invalid/v1/chat/completions' }, kv: { state: { settings } }, fetches: { 'POST https://arc.example.invalid/v1/chat/completions': { status: 200, value: { choices: [{ message: { role: 'assistant', content: 'Hello from the upstream.' } }] } } }, expect: { status: 200 } },
  { name: 'arc-rate-limit-passes-through', request: { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat) }, config: { ARC_MODE: 'live', ARC_URL: 'https://arc.example.invalid/v1/chat/completions' }, kv: { state: { settings } }, fetches: { 'POST https://arc.example.invalid/v1/chat/completions': { status: 429, value: { error: { message: 'Budget exceeded' } } } }, expect: { status: 429 } },
] }
