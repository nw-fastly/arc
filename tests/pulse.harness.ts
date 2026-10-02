const user = { id: 'alex', name: 'Alex Morgan', keyIds: ['key-1'], active: true }
const key = { id: 'key-1', name: 'Fast model', provider: 'test-provider', model: 'test-fast', value: 'secret-virtual-key' }
const users = { users: [user] }
const state = { 'users-v2': users, 'credentials-v2': { keys: [key] } }
const auth = { authorization: 'Bearer test-admin', 'content-type': 'application/json' }
const secrets = { ADMIN_PASSWORD: 'test-admin', FASTLY_API_TOKEN: 'secret-management-token' }
const chat = { userId: 'alex', keyId: 'key-1', messages: [{ role: 'user', content: 'Hello' }], sessionId: 'local-only' }
const management = 'https://api.fastly.com/ai-runtime-control/v1'
const created = { id: 'key-2', name: 'Second key', provider: 'test-provider', model: 'test-other', access_token: 'new-virtual-secret' }
const keyInput = { name: created.name, provider: created.provider, model: created.model }
const keyList = { data: [{ id: key.id, name: key.name, provider: key.provider, model: key.model }, { id: created.id, name: created.name, provider: created.provider, model: created.model }], meta: { next_cursor: 'next==' } }
const request = (path, body, method = 'POST') => ({ path, method, headers: auth, body: JSON.stringify(body) })
export default { cases: [
  { name: 'health', request: { path: '/health' }, expect: { status: 200, text: 'ok' } },
  { name: 'public-catalog-redacts-all-credentials', request: { path: '/api/bootstrap' }, kv: { state }, config: { ARC_MODE: 'preview' }, expect: { status: 200, json: { users: [{ id: user.id, name: user.name, models: [{ id: key.id, name: key.name, provider: key.provider, model: key.model }] }], mode: 'preview' } } },
  { name: 'empty-public-catalog', request: { path: '/api/bootstrap' }, kv: { state: {} }, expect: { status: 200, json: { users: [], mode: 'live' } } },
  { name: 'admin-auth-required', request: { path: '/api/admin/users' }, secrets, expect: { status: 401 } },
  { name: 'missing-admin-secret-fails-closed', request: { path: '/api/admin/users', headers: auth }, expect: { status: 401 } },
  { name: 'admin-users-have-no-secrets', request: { path: '/api/admin/users', headers: auth }, secrets, kv: { state }, expect: { status: 200, json: users } },
  { name: 'old-settings-route-retired', request: { path: '/api/admin/settings', headers: auth }, secrets, expect: { status: 404 } },
  { name: 'save-users', request: request('/api/admin/users', users, 'PUT'), secrets, kv: { state }, expect: { status: 200 } },
  { name: 'duplicate-users-rejected', request: request('/api/admin/users', { users: [user, user] }, 'PUT'), secrets, kv: { state }, expect: { status: 400 } },
  { name: 'dangling-key-rejected', request: request('/api/admin/users', { users: [{ ...user, keyIds: ['missing'] }] }, 'PUT'), secrets, kv: { state }, expect: { status: 400 } },
  { name: 'duplicate-key-assignments-rejected', request: request('/api/admin/users', { users: [{ ...user, keyIds: ['key-1', 'key-1'] }] }, 'PUT'), secrets, kv: { state }, expect: { status: 400 } },
  { name: 'unknown-user-denied', request: request('/api/chat', { ...chat, userId: 'missing' }), kv: { state }, expect: { status: 403 } },
  { name: 'unassigned-key-denied', request: request('/api/chat', { ...chat, keyId: 'missing' }), kv: { state }, expect: { status: 403 } },
  { name: 'disabled-user-denied', request: request('/api/chat', chat), kv: { state: { ...state, 'users-v2': { users: [{ ...user, active: false }] } } }, expect: { status: 403 } },
  { name: 'unavailable-credential-denied', request: request('/api/chat', chat), kv: { state: { ...state, 'credentials-v2': { keys: [{ ...key, value: '' }] } } }, expect: { status: 409 } },
  { name: 'empty-message-rejected', request: request('/api/chat', { ...chat, messages: [] }), kv: { state }, expect: { status: 400 } },
  { name: 'blank-message-rejected', request: request('/api/chat', { ...chat, messages: [{ role: 'user', content: '  ' }] }), kv: { state }, expect: { status: 400 } },
  { name: 'live-response', request: request('/api/chat', chat), kv: { state }, fetches: { 'POST https://arc.fastly.app/v1/chat/completions': { status: 200, headers: { 'content-type': 'application/json' }, json: { choices: [{ message: { content: 'Hello' } }] } } }, expect: { status: 200 } },
  { name: 'rate-limit-preserved', request: request('/api/chat', chat), kv: { state }, fetches: { 'POST https://arc.fastly.app/v1/chat/completions': { status: 429, headers: { 'content-type': 'application/json' }, json: { error: { message: 'Rate limited' } } } }, expect: { status: 429 } },
  { name: 'management-secret-required', request: request('/api/admin/keys', keyInput), secrets: { ADMIN_PASSWORD: 'test-admin' }, expect: { status: 503 } },
  { name: 'create-key-redacts-token', request: request('/api/admin/keys', keyInput), secrets, kv: { state }, fetches: { [`POST ${management}/keys`]: { status: 201, headers: { 'content-type': 'application/json' }, json: created } }, expect: { status: 201, text: 'Key created and stored.' } },
  { name: 'create-error-is-not-success', request: request('/api/admin/keys', keyInput), secrets, kv: { state }, fetches: { [`POST ${management}/keys`]: { status: 403, headers: { 'content-type': 'application/json' }, json: { error: 'denied' } } }, expect: { status: 502 } },
  { name: 'rotate-key-redacts-token', request: request('/api/admin/keys/key-1/rotate', {}), secrets, kv: { state }, fetches: { [`POST ${management}/keys/key-1/rotate`]: { status: 201, headers: { 'content-type': 'application/json' }, json: { ...created, id: 'key-1' } } }, expect: { status: 200, text: 'Key rotated and stored.' } },
  { name: 'mismatched-rotation-id-rejected', request: request('/api/admin/keys/key-1/rotate', {}), secrets, kv: { state }, fetches: { [`POST ${management}/keys/key-1/rotate`]: { status: 201, headers: { 'content-type': 'application/json' }, json: created } }, expect: { status: 502 } },
  { name: 'key-list-redacts-and-marks-unavailable', request: request('/api/admin/keys/list', { cursor: '' }), secrets, kv: { state }, fetches: { [`GET ${management}/keys?limit=100&cursor=`]: { status: 200, headers: { 'content-type': 'application/json' }, json: keyList } }, expect: { status: 200, json: { keys: [{ ...keyList.data[0], ready: true }, { ...keyList.data[1], ready: false }], nextCursor: 'next==' } } },
  { name: 'opaque-cursor-page', request: request('/api/admin/keys/list', { cursor: 'next%3D%3D' }), secrets, kv: { state }, fetches: { [`GET ${management}/keys?limit=100&cursor=next%3D%3D`]: { status: 200, headers: { 'content-type': 'application/json' }, json: { data: [], meta: { next_cursor: null } } } }, expect: { status: 200, json: { keys: [], nextCursor: '' } } },
  { name: 'cursor-query-injection-rejected', request: request('/api/admin/keys/list', { cursor: '&include_deleted=true' }), secrets, expect: { status: 400 } },
  { name: 'discovery-read-only', request: { path: '/api/admin/catalog', headers: auth }, secrets, fetches: { [`GET ${management}/providers`]: { status: 200, headers: { 'content-type': 'application/json' }, json: { data: [{ id: 'test', display_name: 'Test', models: [{ id: 'test-fast', display_name: 'Fast', provider_id: 'test' }] }] } }, [`GET ${management}/provider-connections`]: { status: 200, headers: { 'content-type': 'application/json' }, json: { data: [{ id: 'connection', name: 'custom', models: ['test-fast'], auth_type: 'api-key', secret_id: 'never-return' }] } } }, expect: { status: 200, json: { providers: [{ id: 'test', display_name: 'Test', models: [{ id: 'test-fast', display_name: 'Fast', provider_id: 'test' }] }], connections: [{ id: 'connection', name: 'custom', models: ['test-fast'], auth_type: 'api-key' }], preview: false } } },
  { name: 'preview-does-not-create-real-keys', request: request('/api/admin/keys', keyInput), secrets, config: { ARC_MODE: 'preview' }, expect: { status: 409 } },
  { name: 'policy-read-auth-required', request: { path: '/api/admin/keys/key-1/policy' }, secrets, expect: { status: 401 } },
  { name: 'policy-null-and-false-update', request: request('/api/admin/keys/key-1/policy', { rpm_limit: null, security_enabled: false }, 'PATCH'), secrets, fetches: { [`PATCH ${management}/keys/key-1`]: { status: 200, json: { id: 'key-1' } } }, expect: { status: 200, text: 'Key policy saved.' } },
  { name: 'policy-zero-limit-rejected', request: request('/api/admin/keys/key-1/policy', { rpm_limit: 0 }, 'PATCH'), secrets, expect: { status: 400 } },
  { name: 'policy-fraction-limit-rejected', request: request('/api/admin/keys/key-1/policy', { tpm_limit: 1.5 }, 'PATCH'), secrets, expect: { status: 400 } },
  { name: 'policy-invalid-action-rejected', request: request('/api/admin/keys/key-1/policy', { security_action: 'allow' }, 'PATCH'), secrets, expect: { status: 502 } },
  { name: 'policy-preview-readonly', request: request('/api/admin/keys/key-1/policy', { rpm_limit: 60 }, 'PATCH'), secrets, config: { ARC_MODE: 'preview' }, expect: { status: 409 } },
  { name: 'failover-account-feature-unavailable', request: { path: '/api/admin/keys/key-1/failover', headers: auth }, secrets, fetches: { [`GET ${management}/keys/key-1/failover`]: { status: 404, json: { error: 'not found' } } }, expect: { status: 404 } },
  { name: 'failover-replace-with-empty', request: request('/api/admin/keys/key-1/failover', { targets: [], timeout_enabled: false, rate_limit_429_enabled: false, server_error_5xx_enabled: false }, 'PUT'), secrets, fetches: { [`PUT ${management}/keys/key-1/failover`]: { status: 200, json: {} } }, expect: { status: 200, text: 'Failover policy saved.' } },
  { name: 'failover-duplicate-target-rejected', request: request('/api/admin/keys/key-1/failover', { targets: [{ provider_connection_id: 'same' }, { provider_connection_id: 'same' }], timeout_enabled: true, rate_limit_429_enabled: false, server_error_5xx_enabled: true }, 'PUT'), secrets, expect: { status: 400 } },
  { name: 'failover-missing-triggers-rejected', request: request('/api/admin/keys/key-1/failover', { targets: [] }, 'PUT'), secrets, expect: { status: 502 } },
] }
