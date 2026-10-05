import assert from 'node:assert/strict'
import { startLocalPreview } from '../scripts/dev-native.mjs'
const server = await startLocalPreview({ port: 0 })
try {
  const call = async (path, body, method = 'GET') => {
    const response = await fetch(server.baseUrl + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer local-admin-only' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const text = await response.text()
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text }
  }
  assert.equal((await call('/')).status, 200)
  const bootstrap = (await call('/api/bootstrap')).body
  assert.equal(bootstrap.mode, 'preview'); assert.equal(bootstrap.users.length, 2)
  const users = (await call('/api/admin/users')).body.users
  const added = { id: 'local-test', name: 'Local Test', active: true, keyIds: ['demo-fast-key'] }
  assert.equal((await call('/api/admin/users', { users: [...users, added] }, 'PUT')).status, 200)
  assert.deepEqual((await call('/api/admin/users')).body.users, [...users, added], 'user additions must survive another request')
  assert.equal((await call('/api/bootstrap')).body.users.find(u => u.id === added.id).models[0].id, 'demo-fast-key')
  const chat = { userId: added.id, keyId: 'demo-fast-key', messages: [{ role: 'user', content: 'Hello' }], sessionId: 'local-test' }
  const completion = await call('/api/chat', chat, 'POST')
  assert.equal(completion.status, 200); assert.equal(completion.body.preview, true)
  assert.match(completion.body.choices[0].message.content, /Local preview/)
  assert.equal((await call('/api/admin/users', { users: [...users, { ...added, active: false }] }, 'PUT')).status, 200)
  assert.equal((await call('/api/chat', chat, 'POST')).status, 403, 'disabling a user must affect the next request')
  assert.equal((await call('/api/admin/users', { users }, 'PUT')).status, 200)
  assert.deepEqual((await call('/api/admin/users')).body.users, users, 'deleting a user must survive refresh')
  assert.equal((await call('/api/admin/keys/list', { cursor: '' }, 'POST')).body.keys.length, 2)
  console.log('Local preview passed: bootstrap, stateful user CRUD/assignments, simulated chat, and disabled-user enforcement.')
} finally { await server.stop() }
