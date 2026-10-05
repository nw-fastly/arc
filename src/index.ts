import { Pulse } from '@pulse-compute/pulse'
import type { Users, Credentials, Credential, KeyResult, KeyPage, KeyView, KeyInput, PageInput, Providers, Connections, PublicUser, Key, Chat } from './schemas.js'
import assets from './assets.generated.js'
import policies from './policies.js'
import activity from './activity.js'
const app = new Pulse({ auto: true })
app.mount('/', assets)
app.get('/health', async (ctx) => ctx.text('ok'))
app.get('/api/bootstrap', async (ctx) => {
  const stored = await ctx.kv<Users>('state').get('users-v2')
  const mode = await ctx.config.get('ARC_MODE')
  const vault = await ctx.kv<Credentials>('state').get('credentials-v2')
  const credentials: Credential[] = vault === undefined ? [] : vault.keys
  const users: PublicUser[] = []
  if (stored !== undefined) {
    for (let i = 0; i < 30 && i < stored.users.length; i++) {
      const user = stored.users[i]
      if (user.active) {
        const models: Key[] = []
        for (let j = 0; j < 10 && j < user.keyIds.length; j++) {
          for (let k = 0; k < 100 && k < credentials.length; k++) {
            const key = credentials[k]
            if (key.id === user.keyIds[j] && key.value) models[models.length] = { id: key.id, name: key.name, provider: key.provider, model: key.model }
          }
        }
        users[users.length] = { id: user.id, name: user.name, models }
      }
    }
  }
  return ctx.json({ users, mode: mode === 'preview' ? 'preview' : 'live' }, { schema: 'arc.Bootstrap', headers: { 'cache-control': 'no-store' } })
})
app.use('/api/admin/*', async (ctx, next) => {
  const password = await ctx.secret.get('ADMIN_PASSWORD')
  const headers = ctx.req.headers
  let authorization = ''
  for (let i = 0; i < 256 && i < headers.length; i++) {
    if (headers[i][0] === 'authorization' || headers[i][0] === 'Authorization') authorization = headers[i][1]
  }
  if (!password || authorization !== `Bearer ${password}`) return ctx.json({ error: 'Admin password required.' }, { status: 401, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return next()
})
app.mount('/api/admin/keys', policies)
app.mount('/api/admin/activity', activity)
app.get('/api/admin/users', async (ctx) => {
  const stored = await ctx.kv<Users>('state').get('users-v2')
  return ctx.json(stored === undefined ? { users: [] } : stored, { schema: 'arc.Users', headers: { 'cache-control': 'no-store' } })
})
// This snapshot contains only personas and assignments, never key credentials.
app.put('/api/admin/users', async (ctx) => {
  const input = await ctx.req.json<Users>('arc.Users')
  const vault = await ctx.kv<Credentials>('state').get('credentials-v2')
  const credentials: Credential[] = vault === undefined ? [] : vault.keys
  let invalid = input.users.length > 30
  for (let i = 0; i < 30 && i < input.users.length; i++) {
    const user = input.users[i]
    if (!user.id.trim() || user.id.length > 80 || !user.name.trim() || user.name.length > 100 || user.keyIds.length > 10) invalid = true
    for (let j = 0; j < 30 && j < i; j++) { if (input.users[j].id === user.id) invalid = true }
    for (let j = 0; j < 10 && j < user.keyIds.length; j++) {
      const id = user.keyIds[j]
      if (!id || id.length > 100) invalid = true
      for (let k = 0; k < 10 && k < j; k++) { if (user.keyIds[k] === id) invalid = true }
      let ready = false
      for (let k = 0; k < 100 && k < credentials.length; k++) { if (credentials[k].id === id && credentials[k].value) ready = true }
      if (!ready) invalid = true
    }
  }
  if (invalid) return ctx.json({ error: 'Check names, duplicate IDs, and ready key assignments. Limit: 30 users and 10 keys per user.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const saved = await ctx.kv<Users>('state').put('users-v2', input)
  if (!saved) return ctx.json({ error: 'Users could not be saved. Please retry.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.text('Saved', { headers: { 'cache-control': 'no-store' } })
})
app.get('/api/admin/catalog', async (ctx) => {
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ providers: [{ id: 'preview', display_name: 'Preview', models: [{ id: 'demo-fast', display_name: 'Demo fast', provider_id: 'preview' }, { id: 'demo-reasoning', display_name: 'Demo reasoning', provider_id: 'preview' }] }], connections: [], preview: true }, { schema: 'arc.Catalog', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const providers = await ctx.fetch('https://api.fastly.com/ai-runtime-control/v1/providers', { method: 'GET', headers: { 'Fastly-Key': token }, timeoutMs: 15000 }).json<Providers>('arc.Providers')
  const connections = await ctx.fetch('https://api.fastly.com/ai-runtime-control/v1/provider-connections', { method: 'GET', headers: { 'Fastly-Key': token }, timeoutMs: 15000 }).json<Connections>('arc.Connections')
  if (providers.data === undefined || connections.data === undefined) return ctx.json({ error: 'ARC discovery failed. Check the management token and account access.' }, { status: 502, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.json({ providers: providers.data === null ? [] : providers.data, connections: connections.data === null ? [] : connections.data, preview: false }, { schema: 'arc.Catalog', headers: { 'cache-control': 'no-store' } })
})
app.post('/api/admin/keys/list', async (ctx) => {
  const input = await ctx.req.json<PageInput>('arc.PageInput')
  // The browser percent-encodes opaque cursors; accept only query-safe characters.
  let invalidCursor = input.cursor.length > 1024
  for (let i = 0; i < 1024 && i < input.cursor.length; i++) {
    const c = input.cursor[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_' || c === '.' || c === '~' || c === '%')) invalidCursor = true
  }
  if (invalidCursor) return ctx.json({ error: 'Invalid cursor.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  const vault = await ctx.kv<Credentials>('state').get('credentials-v2')
  const credentials: Credential[] = vault === undefined ? [] : vault.keys
  if (mode === 'preview') {
    const keys: KeyView[] = []
    for (let i = 0; i < 100 && i < credentials.length; i++) {
      const key = credentials[i]
      keys[keys.length] = { id: key.id, name: key.name, provider: key.provider, model: key.model, ready: !!key.value }
    }
    return ctx.json({ keys, nextCursor: '' }, { schema: 'arc.Keys', headers: { 'cache-control': 'no-store' } })
  }
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const cursorQuery = input.cursor ? `&cursor=${input.cursor}` : ''
  const page = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys?limit=100${cursorQuery}`, { method: 'GET', headers: { 'Fastly-Key': token }, timeoutMs: 15000 }).json<KeyPage>('arc.KeyPage')
  if (page.data === undefined) return ctx.json({ error: 'ARC key listing failed: the response did not contain a usable list.' }, { status: 502, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  // ARC returns data: null for an empty account; missing data still means failure.
  const items: Key[] = page.data === null ? [] : page.data
  const keys: KeyView[] = []
  for (let i = 0; i < 100 && i < items.length; i++) {
    const item = items[i]
    let ready = false
    for (let j = 0; j < 100 && j < credentials.length; j++) {
      const key = credentials[j]
      if (key.id === item.id && key.value && key.model === item.model && key.provider === item.provider) ready = true
    }
    keys[keys.length] = { id: item.id, name: item.name, provider: item.provider, model: item.model, ready }
  }
  return ctx.json({ keys, nextCursor: page.meta === undefined ? '' : page.meta.next_cursor || '' }, { schema: 'arc.Keys', headers: { 'cache-control': 'no-store' } })
})
// Create and rotate are deliberately separate commands. No browser snapshot can
// overwrite a credential, and no management response containing one is forwarded.
app.post('/api/admin/keys', async (ctx) => {
  const input = await ctx.req.json<KeyInput>('arc.KeyInput')
  if (!input.name.trim() || input.name.length > 100 || !input.provider.trim() || input.provider.length > 150 || !input.model.trim() || input.model.length > 200) return ctx.json({ error: 'Name, provider, and model are required.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ error: 'Preview uses seeded keys. Create and rotate are available after connecting ARC.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const before = await ctx.kv<Credentials>('state').get('credentials-v2')
  if (before !== undefined && before.keys.length >= 100) return ctx.json({ error: 'This demo stores at most 100 credentials.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const created = await ctx.fetch('https://api.fastly.com/ai-runtime-control/v1/keys', { method: 'POST', headers: { 'Fastly-Key': token }, json: input, schema: 'arc.KeyInput', timeoutMs: 15000 }).json<KeyResult>('arc.KeyResult')
  if (!created.id || !created.name || !created.provider || !created.model || !created.access_token) return ctx.json({ error: 'ARC did not return a usable key. Refresh the list before retrying; creation may have succeeded.' }, { status: 502, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const latest = await ctx.kv<Credentials>('state').get('credentials-v2')
  const keys: Credential[] = latest === undefined ? [] : latest.keys
  keys[keys.length] = { id: created.id, name: created.name, provider: created.provider, model: created.model, value: created.access_token }
  const saved = await ctx.kv<Credentials>('state').put('credentials-v2', { keys })
  if (!saved) return ctx.json({ error: `ARC created key ${created.id}, but the credential could not be saved. Refresh the key list and rotate this key to recover. Do not create another copy.` }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.text('Key created and stored.', { status: 201, headers: { 'cache-control': 'no-store' } })
})
app.post('/api/admin/keys/:id/rotate', async (ctx) => {
  const id = ctx.param('id') || ''
  let invalidId = !id || id.length > 100
  for (let i = 0; i < 100 && i < id.length; i++) {
    const c = id[i]
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === '_')) invalidId = true
  }
  if (invalidId) return ctx.json({ error: 'Invalid key ID.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.json({ error: 'Preview uses seeded keys. Create and rotate are available after connecting ARC.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const token = await ctx.secret.get('FASTLY_API_TOKEN')
  if (!token) return ctx.json({ error: 'Configure FASTLY_API_TOKEN in the service Secret Store.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  // ARC immediately invalidates the old token. Clear the local copy first so a
  // failed remote call or local save cannot leave a credential presented as ready.
  const vault = await ctx.kv<Credentials>('state').get('credentials-v2')
  const pending: Credential[] = vault === undefined ? [] : vault.keys
  let found = false
  for (let i = 0; i < 100 && i < pending.length; i++) { if (pending[i].id === id) { pending[i].value = ''; found = true } }
  if (!found && pending.length >= 100) return ctx.json({ error: 'This demo stores at most 100 credentials.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const cleared = await ctx.kv<Credentials>('state').put('credentials-v2', { keys: pending })
  if (!cleared) return ctx.json({ error: 'Could not prepare rotation. ARC was not called.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const rotated = await ctx.fetch(`https://api.fastly.com/ai-runtime-control/v1/keys/${id}/rotate`, { method: 'POST', headers: { 'Fastly-Key': token, 'content-type': 'application/json' }, body: '{}', timeoutMs: 15000 }).json<KeyResult>('arc.KeyResult')
  if (rotated.id !== id || !rotated.name || !rotated.provider || !rotated.model || !rotated.access_token) return ctx.json({ error: 'Rotation did not return a usable credential. This key is unavailable locally. Refresh and rotate again to recover.' }, { status: 502, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const latest = await ctx.kv<Credentials>('state').get('credentials-v2')
  const keys: Credential[] = latest === undefined ? [] : latest.keys
  let replaced = false
  for (let i = 0; i < 100 && i < keys.length; i++) {
    if (keys[i].id === id) { keys[i] = { id, name: rotated.name, provider: rotated.provider, model: rotated.model, value: rotated.access_token }; replaced = true }
  }
  if (!replaced) keys[keys.length] = { id, name: rotated.name, provider: rotated.provider, model: rotated.model, value: rotated.access_token }
  const saved = await ctx.kv<Credentials>('state').put('credentials-v2', { keys })
  if (!saved) return ctx.json({ error: 'ARC rotated the key but local storage failed. The old token is invalid. Rotate this key again to recover.' }, { status: 503, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return ctx.text('Key rotated and stored.', { headers: { 'cache-control': 'no-store' } })
})
app.post('/api/chat', async (ctx) => {
  const input = await ctx.req.json<Chat>('arc.Chat')
  const stored = await ctx.kv<Users>('state').get('users-v2')
  let allowed = false
  if (stored !== undefined) {
    for (let i = 0; i < 30 && i < stored.users.length; i++) {
      const user = stored.users[i]
      if (user.id === input.userId && user.active) {
        for (let j = 0; j < 10 && j < user.keyIds.length; j++) { if (user.keyIds[j] === input.keyId) allowed = true }
      }
    }
  }
  if (!allowed) return ctx.json({ error: 'This user is not assigned to that virtual key. Refresh chat after admin changes.' }, { status: 403, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const vault = await ctx.kv<Credentials>('state').get('credentials-v2')
  let value = ''
  let model = ''
  let provider = ''
  if (vault !== undefined) {
    for (let i = 0; i < 100 && i < vault.keys.length; i++) { if (vault.keys[i].id === input.keyId) { value = vault.keys[i].value; model = vault.keys[i].model; provider = vault.keys[i].provider } }
  }
  if (!value) return ctx.json({ error: 'This key needs to be created or rotated in Admin before use.' }, { status: 409, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  let invalid = input.messages.length < 1 || input.messages.length > 20 || input.sessionId.length > 100
  let size = 0
  for (let i = 0; i < 20 && i < input.messages.length; i++) {
    size += input.messages[i].content.length
    if (!input.messages[i].content.trim() || input.messages[i].content.length > 8000) invalid = true
  }
  if (invalid || size > 24000 || input.messages[input.messages.length - 1].role !== 'user') return ctx.json({ error: 'Keep a conversation to 20 messages and each message below 8,000 characters.' }, { status: 400, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.text('{"choices":[{"message":{"role":"assistant","content":"**Local preview.**\\n\\nYour selected user and virtual key determine the model. Connect ARC to receive live responses."}}],"preview":true}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  // Model and credential come from server storage, never a browser-supplied model.
  // The local session UUID is not sent; messages carry conversation context.
  // Gateway routing requires provider/model; management stores them separately.
  const prefix = `${provider}/`
  // Key creation limits provider IDs to 150 characters. Compare explicitly
  // because the native Pulse contract does not support String.startsWith.
  let prefixed = prefix.length <= 151 && model.length >= prefix.length
  for (let i = 0; i < 151 && i < prefix.length; i++) {
    if (model[i] !== prefix[i]) prefixed = false
  }
  model = prefixed ? model : `${prefix}${model}`
  return ctx.fetch('https://arc.fastly.app/v1/chat/completions', { method: 'POST', timeoutMs: 25000, headers: { authorization: `Bearer ${value}`, 'content-type': 'application/json' }, json: { model, messages: input.messages, stream: false }, schema: 'arc.Completion' })
})
app.error(async (error, ctx, next) => ctx.json({ error: 'The request could not be completed. Reload the affected key or policy before retrying; ARC may already have processed the change.' }, { status: 502, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } }))
export default app
