const $ = (selector, root = document) => root.querySelector(selector)
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el }
const icon = (name, size = 16) => {
  const paths = { arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>', settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>', code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-11-2 12"/>', pen: '<path d="m15 4 5 5-11 11H4v-5ZM12 7l5 5"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>' }
  const wrap = document.createElement('span'); wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`; return wrap.firstChild
}
const initials = name => name.split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase()
const app = $('#app')
const isAdmin = location.pathname === '/admin'
app.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="ARC playground home"><svg class="brand-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6 31V20a14 14 0 0 1 28 0v11" stroke="#30362a" stroke-width="5"/><path d="M15 31V20a5 5 0 0 1 10 0v11" stroke="#8b9b71" stroke-width="5"/></svg><span class="brand-word">arc</span><span class="brand-divider"></span><span class="brand-sub">The playground</span></a><div class="top-right"><a class="nav-link" href="${isAdmin ? '/' : '/admin'}" id="nav-link">${isAdmin ? 'Back to chat' : 'Admin'}</a><div id="header-control"></div></div></header><main id="main"></main></div>`
$('#nav-link').prepend(icon(isAdmin ? 'arrow' : 'settings', 13))
const main = $('#main')
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'content-type': 'application/json', ...options.headers } })
  const text = await response.text()
  let body; try { body = JSON.parse(text) } catch { body = null }
  if (!response.ok) {
    const error = new Error(body?.error?.message || (typeof body?.error === 'string' ? body.error : `Request failed (${response.status}). Please try again.`))
    error.status = response.status; throw error
  }
  return body ?? text
}
function showError(target, message) { target.replaceChildren(); const box = node('div', 'error'); box.setAttribute('role', 'alert'); box.append(node('span', '', message)); const close = node('button', '', 'Dismiss'); close.type = 'button'; close.onclick = () => target.replaceChildren(); box.append(close); target.append(box) }
function inlineText(el, text) {
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (part.startsWith('**') && part.endsWith('**')) el.append(node('strong', '', part.slice(2, -2)))
    else if (part.startsWith('`') && part.endsWith('`')) el.append(node('code', '', part.slice(1, -1)))
    else el.append(document.createTextNode(part))
  }
}
function markdown(el, text) {
  const parts = text.split('```')
  parts.forEach((part, i) => {
    if (i % 2) { const pre = node('pre'); pre.append(node('code', '', part.replace(/^[\w+-]*\n/, '').trim())); el.append(pre); return }
    let list = null
    for (const line of part.trim().split('\n')) {
      if (!line.trim()) { list = null; continue }
      const heading = line.match(/^#{1,3}\s+(.+)/); const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.+)/)
      if (bullet) { if (!list) { list = node('ul'); el.append(list) }; const item = node('li'); inlineText(item, bullet[1]); list.append(item) }
      else { list = null; const p = node(heading ? 'h3' : 'p'); inlineText(p, heading ? heading[1] : line); el.append(p) }
    }
  })
}
function loadHistory(id) { try { const v = JSON.parse(sessionStorage.getItem(`arc.chat.${id}`)); if (v?.messages?.every(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')) return v } catch {} return { sessionId: crypto.randomUUID(), messages: [] } }
function saveHistory(id, history) { try { sessionStorage.setItem(`arc.chat.${id}`, JSON.stringify(history)) } catch {} }
async function startChat() {
  main.className = 'chat-main'
  main.innerHTML = `<div class="session-bar"><span class="status" id="connection"><span class="status-dot"></span>Connecting…</span><button class="text-button" id="new-chat" type="button">New conversation</button></div><section class="welcome" id="welcome"><div class="orbit" aria-hidden="true"><div class="orb small" id="orb-small"></div><div class="orb main" id="orb-main"></div><div class="orb tiny"></div><div class="orb-dot"></div></div><div class="eyebrow">SPACE TO EXPLORE</div><h1>A little curiosity.<br><em>A lot of possibility.</em></h1><p>Choose a model. Bring an idea.<br>See where the conversation takes you.</p><div class="suggestions" id="suggestions"></div><div class="rotating" id="rotating" aria-hidden="true">One conversation. A world of models.</div></section><section class="messages" id="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" hidden></section><div id="chat-errors"></div><div class="composer-wrap"><form class="composer" id="chat-form"><label class="sr-only" for="prompt">Message</label><textarea id="prompt" rows="2" maxlength="8000" placeholder="What's on your mind?" required></textarea><div class="composer-bottom"><div class="model-wrap"><span class="model-dot"></span><label class="sr-only" for="model">Model</label><select id="model" disabled><option>Loading models…</option></select></div><button class="send" id="send" type="submit" disabled>Send message</button></div></form><div class="composer-footer"><span class="hint">Enter to send · Shift + Enter for a new line</span><span class="powered">Powered by <strong>Fastly</strong> · Built with Pulse</span></div></div>`
  $('#new-chat').prepend(icon('plus', 13)); $('#send').append(icon('arrow')); $('#orb-main').append(icon('spark', 31)); $('#orb-small').append(icon('code', 14))
  const prompts = [['pen', 'Write something', 'Help me write a warm welcome note for a new teammate.'], ['spark', 'Explore an idea', 'Explain an interesting idea I can learn in two minutes.'], ['code', 'Build something', 'Show me a small, useful JavaScript function and explain how it works.']]
  for (const [symbol, title, prompt] of prompts) { const button = node('button', 'suggestion', title); button.type = 'button'; button.prepend(icon(symbol, 13)); button.onclick = () => { $('#prompt').value = prompt; $('#prompt').focus() }; $('#suggestions').append(button) }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { let i = 0; const phrases = ['One conversation. A world of models.', 'A new perspective is a question away.', 'Your next idea starts here.']; setInterval(() => { if (!$('#welcome').hidden && !document.hidden) $('#rotating').textContent = phrases[++i % phrases.length] }, 4500) }
  let catalog, userId = '', history, busy = false
  const userSelect = node('select'); userSelect.id = 'user'; userSelect.setAttribute('aria-label', 'Demo user'); const avatar = node('span', 'avatar', '…'); const picker = node('div', 'user-picker'); picker.append(avatar, userSelect); $('#header-control').append(picker)
  const setBusy = value => { busy = value; $('#send').disabled = value || !userId || !$('#model').value; $('#model').disabled = value || !catalog?.models.length; userSelect.disabled = value; $('#new-chat').disabled = value; $('#prompt').disabled = value }
  function appendTurn(message) { const turn = node('article', `turn ${message.role}`); const a = node('div', 'avatar', message.role === 'user' ? initials(catalog.users.find(u => u.id === userId)?.name || 'You') : ''); if (message.role === 'assistant') a.append(icon('spark', 15)); const bubble = node('div', 'bubble'); if (message.role === 'assistant') markdown(bubble, message.content); else bubble.append(node('p', '', message.content)); if (message.meta) bubble.append(node('div', 'turn-meta', message.meta)); turn.append(a, bubble); $('#messages').append(turn) }
  function renderHistory() { $('#messages').replaceChildren(); $('#messages').hidden = !history.messages.length; $('#welcome').hidden = !!history.messages.length; for (const message of history.messages) appendTurn(message) }
  function switchUser() { userId = userSelect.value; history = loadHistory(userId); avatar.textContent = initials(catalog.users.find(u => u.id === userId)?.name || ''); $('#chat-errors').replaceChildren(); renderHistory(); setBusy(false) }
  try {
    catalog = await api('/api/bootstrap'); $('#connection').replaceChildren(node('span', 'status-dot'), document.createTextNode(catalog.mode === 'preview' ? 'Local preview · simulated responses' : 'ARC connection · live mode'))
    for (const user of catalog.users) { const option = node('option', '', user.name); option.value = user.id; userSelect.append(option) }
    $('#model').replaceChildren(); for (const model of catalog.models) { const option = node('option', '', `${model.label} · ${model.provider}`); option.value = model.id; $('#model').append(option) }
    if (!catalog.users.length || !catalog.models.length) showError($('#chat-errors'), 'Your playground is almost ready. Add a user, virtual key, and model in Admin.')
    switchUser()
  } catch (error) { showError($('#chat-errors'), error.message); $('#connection').textContent = 'Connection unavailable' }
  userSelect.onchange = switchUser
  $('#new-chat').onclick = () => { if (history?.messages.length && !confirm('Clear this user’s conversation in this browser tab?')) return; history = { sessionId: crypto.randomUUID(), messages: [] }; saveHistory(userId, history); renderHistory(); $('#prompt').focus() }
  $('#prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && !$('#send').disabled) $('#chat-form').requestSubmit() } })
  $('#chat-form').onsubmit = async event => {
    event.preventDefault(); const content = $('#prompt').value.trim(); if (busy || !content || !userId) return
    $('#chat-errors').replaceChildren(); const model = $('#model').value; const prior = history.messages.slice(-18).map(({ role, content }) => ({ role, content })); const outgoing = [...prior, { role: 'user', content }]
    if (outgoing.reduce((n, m) => n + m.content.length, 0) > 24000) { showError($('#chat-errors'), 'This conversation is full. Start a new conversation to continue.'); return }
    setBusy(true); history.messages.push({ role: 'user', content }); renderHistory(); $('#prompt').value = ''
    const loading = node('div', 'turn assistant'); loading.setAttribute('role', 'status'); loading.setAttribute('aria-label', 'Waiting for response'); const dots = node('div', 'typing'); dots.append(node('span'), node('span'), node('span')); loading.append(node('div', 'avatar', '·'), dots); $('#messages').append(loading); loading.scrollIntoView({ block: 'nearest' }); const start = performance.now()
    try {
      const response = await api('/api/chat', { method: 'POST', body: JSON.stringify({ userId, model, messages: outgoing, sessionId: history.sessionId }), signal: AbortSignal.timeout(30000) })
      const answer = response?.choices?.[0]?.message?.content
      if (typeof answer !== 'string' || !answer) throw new Error('The endpoint did not return a chat-completions response. Check its URL and model configuration.')
      const parts = [response.preview ? 'Simulated response' : (response.model || model), `${((performance.now() - start) / 1000).toFixed(1)}s`]
      if (response.usage && Number.isFinite(response.usage.total_tokens)) parts.push(`${response.usage.total_tokens} tokens`)
      const message = { role: 'assistant', content: answer, meta: parts.join(' · ') }; history.messages.push(message); saveHistory(userId, history); loading.remove(); appendTurn(message)
    } catch (error) { history.messages.pop(); renderHistory(); $('#prompt').value = content; showError($('#chat-errors'), error.name === 'TimeoutError' ? 'The request timed out. You can try again; ARC may already have processed it.' : error.message) }
    finally { loading.remove(); setBusy(false); $('#prompt').focus() }
  }
}
let adminPassword = '', settings = null, activeTab = 'users'
async function startAdmin() {
  main.className = 'admin-main'
  main.innerHTML = `<section class="login"><div class="eyebrow">PLAYGROUND ADMIN</div><h1>A little housekeeping.</h1><p class="subtext">Manage your demo users, virtual keys, and model choices.</p><form id="login-form"><label class="field">Admin password<input type="password" id="password" autocomplete="current-password" required></label><div id="login-errors"></div><button class="primary" type="submit">Open admin</button></form></section>`
  $('#login-form').onsubmit = async event => { event.preventDefault(); const button = $('#login-form button'); button.disabled = true; const candidate = $('#password').value; try { const data = await api('/api/admin/settings', { headers: { authorization: `Bearer ${candidate}` } }); adminPassword = candidate; settings = data; renderAdmin() } catch (error) { showError($('#login-errors'), error.message) } finally { button.disabled = false } }
}
const tabInfo = { users: ['Users', 'Choose who is using the playground.', 'user'], tokens: ['Virtual keys', 'Connect ARC-issued keys to your demo users.', 'virtual key'], models: ['Models', 'Use the exact model IDs enabled in your ARC account.', 'model'] }
function renderAdmin() {
  main.innerHTML = `<div class="admin-heading"><div><div class="eyebrow">BEHIND THE CONVERSATION</div><h1>Your playground, arranged.</h1><p class="subtext">A few simple controls. Room to experiment.</p></div><button class="secondary" id="logout">Lock admin</button></div><div class="admin-layout"><nav class="tabs" aria-label="Admin sections" id="tabs"></nav><section><div id="admin-errors"></div><div class="panel"><div class="panel-top"><div><h2 id="panel-title"></h2><p id="panel-sub"></p></div><button class="primary" id="add-item"></button></div><div class="table-wrap" id="table"></div></div><p class="admin-note" id="admin-note"></p><div class="notice" id="notice" role="status"></div></section></div><dialog class="modal" id="editor"></dialog>`
  $('#logout').onclick = () => { adminPassword = ''; settings = null; startAdmin() }
  for (const [key, info] of Object.entries(tabInfo)) { const b = node('button', `tab ${key === activeTab ? 'active' : ''}`, info[0]); b.append(node('span', '', String(settings[key].length))); b.onclick = () => { activeTab = key; renderAdmin() }; $('#tabs').append(b) }
  const [title, sub, noun] = tabInfo[activeTab]; $('#panel-title').textContent = title; $('#panel-sub').textContent = sub; $('#add-item').textContent = `+ Add ${noun}`; $('#add-item').disabled = settings[activeTab].length >= 30; $('#add-item').onclick = () => editItem()
  $('#admin-note').textContent = activeTab === 'tokens' ? 'Paste an existing ARC virtual key. Removing a key here removes its demo assignment; revoke it in Fastly to revoke the ARC credential.' : activeTab === 'users' ? 'Users are demo personas. The chat selector switches persona; it is not a sign-in system.' : 'Model availability, provider routing, and limits remain controlled by ARC.'
  if (!settings[activeTab].length) { $('#table').append(node('div', 'empty', `No ${title.toLowerCase()} yet. Add your first ${noun} to get started.`)); return }
  const table = node('table'); const head = node('tr'); for (const text of [activeTab === 'tokens' ? 'Key' : activeTab === 'models' ? 'Model' : 'Name', activeTab === 'users' ? 'Virtual key' : activeTab === 'models' ? 'Provider' : 'Credential', 'Status', 'Actions']) head.append(node('th', '', text)); const thead = node('thead'); thead.append(head); table.append(thead); const body = node('tbody')
  for (const item of settings[activeTab]) {
    const row = node('tr'), name = node('td', '', item.name || item.label); name.append(node('span', 'minor', item.id)); row.append(name)
    row.append(node('td', '', activeTab === 'users' ? settings.tokens.find(t => t.id === item.tokenId)?.label || 'Not assigned' : activeTab === 'models' ? item.provider : item.value ? '••••••••••••' : 'Not configured'))
    const status = node('td'); status.append(node('span', `badge ${item.active ? '' : 'off'}`, item.active ? 'Active' : 'Disabled')); row.append(status)
    const actions = node('td'), buttons = node('div', 'row-actions'); const edit = node('button', '', 'Edit'); edit.setAttribute('aria-label', `Edit ${item.name || item.label}`); edit.onclick = () => editItem(item); const remove = node('button', 'danger', 'Delete'); remove.setAttribute('aria-label', `Delete ${item.name || item.label}`); remove.onclick = () => deleteItem(item); buttons.append(edit, remove); actions.append(buttons); row.append(actions); body.append(row)
  }
  table.append(body); $('#table').append(table)
}
async function persist(next) { await api('/api/admin/settings', { method: 'PUT', headers: { authorization: `Bearer ${adminPassword}` }, body: JSON.stringify(next) }); settings = next }
function addField(form, label, name, value = '', { type = 'text', required = true, max = 100, help = '' } = {}) { const wrapper = node('label', 'field', label); const input = node('input'); input.name = name; input.setAttribute('aria-label', label); input.type = type; input.value = value; input.required = required; input.maxLength = max; if (type === 'password') input.autocomplete = 'new-password'; wrapper.append(input); if (help) wrapper.append(node('small', '', help)); form.append(wrapper); return input }
function editItem(item) {
  const kind = activeTab, [, , noun] = tabInfo[kind], dialog = $('#editor'); dialog.replaceChildren(); const form = node('form'); form.append(node('h2', '', `${item ? 'Edit' : 'Add'} ${noun}`)); dialog.append(form)
  if (kind === 'models') { const input = addField(form, 'Model ID', 'id', item?.id, { max: 150, help: 'Exact ID from your ARC provider configuration.' }); input.readOnly = !!item }
  addField(form, kind === 'users' ? 'Full name' : 'Label', 'label', item?.name || item?.label)
  if (kind === 'users') { const field = node('label', 'field', 'Virtual key'); const select = node('select'); select.name = 'tokenId'; select.setAttribute('aria-label', 'Virtual key'); const empty = node('option', '', 'Not assigned'); empty.value = ''; select.append(empty); for (const token of settings.tokens) { const option = node('option', '', token.label + (token.active ? '' : ' (disabled)')); option.value = token.id; select.append(option) }; select.value = item?.tokenId || ''; field.append(select); form.append(field) }
  if (kind === 'tokens') addField(form, 'Virtual key value', 'value', '', { type: 'password', required: !item?.value, max: 4096, help: item?.value ? 'Leave blank to keep the existing key. Paste a new key to rotate it here.' : 'Paste the ARC virtual key, not a provider API key.' })
  if (kind === 'models') addField(form, 'Provider label', 'provider', item?.provider, { help: 'Display label, such as OpenAI or Anthropic.' })
  const active = node('label', 'check-field'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = 'active'; checkbox.checked = item?.active ?? true; active.append(checkbox, document.createTextNode('Active')); form.append(active)
  const errors = node('div'); form.append(errors); const actions = node('div', 'modal-actions'); const cancel = node('button', 'secondary', 'Cancel'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); const save = node('button', 'primary', 'Save changes'); save.type = 'submit'; actions.append(cancel, save); form.append(actions)
  form.onsubmit = async event => { event.preventDefault(); save.disabled = true; cancel.disabled = true; const data = new FormData(form); const id = item?.id || (kind === 'models' ? String(data.get('id')).trim() : crypto.randomUUID()); const value = { id, active: data.has('active') }; if (kind === 'users') Object.assign(value, { name: String(data.get('label')).trim(), tokenId: data.get('tokenId') }); else if (kind === 'models') Object.assign(value, { label: String(data.get('label')).trim(), provider: String(data.get('provider')).trim() }); else Object.assign(value, { label: String(data.get('label')).trim(), value: String(data.get('value')).trim() || item?.value || '' }); if (!item && settings[kind].some(x => x.id === id)) { showError(errors, 'That ID already exists.'); save.disabled = false; cancel.disabled = false; return }; const next = structuredClone(settings); next[kind] = item ? next[kind].map(x => x.id === item.id ? value : x) : [...next[kind], value]; try { await persist(next); dialog.close(); renderAdmin(); $('#notice').textContent = 'Changes saved.' } catch (error) { showError(errors, error.message); save.disabled = false; cancel.disabled = false } }
  dialog.showModal()
}
async function deleteItem(item) {
  const kind = activeTab, name = item.name || item.label; if (!confirm(`Delete ${name}?${kind === 'tokens' ? ' Assigned users will have no virtual key.' : ''}`)) return
  const next = structuredClone(settings); next[kind] = next[kind].filter(x => x.id !== item.id); if (kind === 'tokens') next.users = next.users.map(u => u.tokenId === item.id ? { ...u, tokenId: '' } : u)
  $('#table').querySelectorAll('button').forEach(b => b.disabled = true)
  try { await persist(next); renderAdmin(); $('#notice').textContent = 'Deleted.' } catch (error) { showError($('#admin-errors'), error.message); $('#table').querySelectorAll('button').forEach(b => b.disabled = false) }
}
if (isAdmin) startAdmin(); else startChat()
