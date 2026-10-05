import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync('public/app.js', 'utf8')
// Exercise the actual browser response boundary without a DOM or host mocks.
function client(response) {
  const context = vm.createContext({ fetch: async () => response, Error, Array, JSON })
  vm.runInContext(source.slice(source.indexOf('async function api('), source.indexOf('function showError(')), context)
  return context
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) })
test('valid empty and populated user lists stay usable', async () => {
  for (const users of [[], [{ id: 'alex', name: 'Alex' }]]) {
    const c = client(response({ users })), body = await c.api('/api/bootstrap')
    assert.equal(c.requireList(body, 'users', '/api/bootstrap'), body)
    assert.equal(body.users.length, users.length)
  }
})
test('wrong-shape and HTML responses cannot become editable user settings', async () => {
  for (const body of [{}, { users: null }, { users: {} }, '<html>Wrong server</html>']) {
    const c = client(response(body)), result = await c.api('/api/admin/users')
    assert.throws(() => c.requireList(result, 'users', '/api/admin/users'), /Unexpected response.*expected a users list/)
  }
})
test('an error payload is surfaced even if the local runner reports HTTP 200', async () => {
  const c = client(response({ error: 'Local state could not be read.' }))
  await assert.rejects(c.api('/api/bootstrap'), /Local state could not be read/)
})
test('successful text acknowledgements and HTTP errors keep their behavior', async () => {
  assert.equal(await client(response('Saved')).api('/api/admin/users'), 'Saved')
  await assert.rejects(client(response({ error: 'Admin password required.' }, 401)).api('/api/admin/users'), /Admin password required/)
})
