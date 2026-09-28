import { Pulse } from '@pulse-compute/pulse'
import type { Settings, Chat, User, Model } from './schemas.js'
import assets from './assets.generated.js'
const app = new Pulse({ auto: true })
app.mount('/', assets)
app.get('/health', async (ctx) => ctx.text('ok'))
app.get('/api/bootstrap', async (ctx) => {
  const settings = await ctx.kv<Settings>('state').get('settings')
  const mode = await ctx.config.get('ARC_MODE')
  if (settings === undefined) return ctx.json({ users: [], models: [], mode: mode === 'preview' ? 'preview' : 'live' }, { schema: 'arc.Bootstrap', headers: { 'cache-control': 'no-store' } })
  const users: User[] = []
  const models: Model[] = []
  for (let i = 0; i < 30 && i < settings.users.length; i++) {
    if (settings.users[i].active) users[users.length] = { id: settings.users[i].id, name: settings.users[i].name, tokenId: '', active: true }
  }
  for (let i = 0; i < 30 && i < settings.models.length; i++) {
    if (settings.models[i].active) models[models.length] = settings.models[i]
  }
  return ctx.json({ users, models, mode: mode === 'preview' ? 'preview' : 'live' }, { schema: 'arc.Bootstrap', headers: { 'cache-control': 'no-store' } })
})
app.use('/api/admin/*', async (ctx, next) => {
  const password = await ctx.secret.get('ADMIN_PASSWORD')
  // The Native header snapshot normalizes names. Reading it also handles absent
  // Authorization without the beta.5 single-header hostcall's missing-value edge.
  const headers = ctx.req.headers
  let authorization = ''
  for (let i = 0; i < 256 && i < headers.length; i++) {
    if (headers[i][0] === 'authorization' || headers[i][0] === 'Authorization') authorization = headers[i][1]
  }
  if (!password || authorization !== `Bearer ${password}`) return ctx.json({ error: 'Admin password required.' }, { status: 401, schema: 'arc.Error', headers: { 'cache-control': 'no-store' } })
  return next()
})
app.get('/api/admin/settings', async (ctx) => {
  const settings = await ctx.kv<Settings>('state').get('settings')
  return ctx.json(settings === undefined ? { users: [], tokens: [], models: [] } : settings, { schema: 'arc.Settings', headers: { 'cache-control': 'no-store' } })
})
app.put('/api/admin/settings', async (ctx) => {
  const settings = await ctx.req.json<Settings>('arc.Settings')
  let invalid = settings.users.length > 30 || settings.tokens.length > 30 || settings.models.length > 30
  for (let i = 0; i < 30 && i < settings.users.length; i++) {
    const item = settings.users[i]
    if (!item.id.trim() || item.id.length > 80 || !item.name.trim() || item.name.length > 100) invalid = true
    let found = item.tokenId === ''
    for (let j = 0; j < 30 && j < settings.tokens.length; j++) { if (settings.tokens[j].id === item.tokenId) found = true }
    if (!found) invalid = true
    for (let j = 0; j < 30 && j < i; j++) { if (settings.users[j].id === item.id) invalid = true }
  }
  for (let i = 0; i < 30 && i < settings.tokens.length; i++) {
    const item = settings.tokens[i]
    if (!item.id.trim() || item.id.length > 80 || !item.label.trim() || item.label.length > 100 || item.value.length > 4096) invalid = true
    for (let j = 0; j < 30 && j < i; j++) { if (settings.tokens[j].id === item.id) invalid = true }
  }
  for (let i = 0; i < 30 && i < settings.models.length; i++) {
    const item = settings.models[i]
    if (!item.id.trim() || item.id.length > 150 || !item.label.trim() || item.label.length > 100 || item.provider.length > 100) invalid = true
    for (let j = 0; j < 30 && j < i; j++) { if (settings.models[j].id === item.id) invalid = true }
  }
  if (invalid) return ctx.json({ error: 'Check IDs, required fields, token assignments, and the 30-item limit.' }, { status: 400, schema: 'arc.Error' })
  const saved = await ctx.kv<Settings>('state').put('settings', settings)
  if (!saved) return ctx.json({ error: 'Settings could not be saved. Please retry.' }, { status: 503, schema: 'arc.Error' })
  return ctx.text('Saved', { headers: { 'cache-control': 'no-store' } })
})
app.post('/api/chat', async (ctx) => {
  const input = await ctx.req.json<Chat>('arc.Chat')
  const settings = await ctx.kv<Settings>('state').get('settings')
  if (settings === undefined) return ctx.json({ error: 'Add a user, virtual key, and model in Admin first.' }, { status: 409, schema: 'arc.Error' })
  let tokenId = ''
  let key = ''
  let modelAllowed = false
  for (let i = 0; i < 30 && i < settings.users.length; i++) {
    if (settings.users[i].id === input.userId && settings.users[i].active) tokenId = settings.users[i].tokenId
  }
  for (let i = 0; i < 30 && i < settings.tokens.length; i++) {
    if (settings.tokens[i].id === tokenId && settings.tokens[i].active) key = settings.tokens[i].value
  }
  for (let i = 0; i < 30 && i < settings.models.length; i++) {
    if (settings.models[i].id === input.model && settings.models[i].active) modelAllowed = true
  }
  if (!key || !modelAllowed) return ctx.json({ error: 'This user needs an active virtual key and model.' }, { status: 403, schema: 'arc.Error' })
  let invalid = input.messages.length < 1 || input.messages.length > 20 || input.sessionId.length > 100
  let size = 0
  for (let i = 0; i < 20 && i < input.messages.length; i++) {
    size += input.messages[i].content.length
    if (!input.messages[i].content.trim() || input.messages[i].content.length > 8000) invalid = true
  }
  if (invalid || size > 24000 || input.messages[input.messages.length - 1].role !== 'user') return ctx.json({ error: 'Keep a conversation to 20 messages and each message below 8,000 characters.' }, { status: 400, schema: 'arc.Error' })
  const mode = await ctx.config.get('ARC_MODE')
  if (mode === 'preview') return ctx.text('{"choices":[{"message":{"role":"assistant","content":"**You’re connected to the playground.**\\n\\nThis is a local preview response. Switch users, try a different model, or open Admin to manage your virtual keys.\\n\\nWhen you connect your ARC endpoint, real model responses will appear here."}}],"preview":true}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  const url = await ctx.config.get('ARC_URL')
  if (!url) return ctx.json({ error: 'Set ARC_URL to your ARC chat-completions endpoint.' }, { status: 503, schema: 'arc.Error' })
  // OpenAI-compatible, non-streaming transport. ARC owns routing and provider policy.
  // Session correlation is local until the account-specific ARC header is confirmed.
  return ctx.fetch(url, { method: 'POST', timeoutMs: 25000, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, json: { model: input.model, messages: input.messages, stream: false }, schema: 'arc.Completion' })
})
export default app
