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
  main.innerHTML = `<div class="session-bar"><span class="status" id="connection"><span class="status-dot"></span>Connecting…</span><button class="text-button" id="new-chat" type="button">New conversation</button></div><section class="welcome" id="welcome"><div class="eyebrow">HOW IT WORKS</div><h1>Your request, end to end.</h1><ol class="overview-flow" aria-label="Request flow"><li><strong>Chat</strong><span>Your message</span></li><li><strong>Fastly Compute</strong><span>Pulse app</span></li><li class="flow-arc"><strong>ARC</strong><span>Virtual key · Limits<br>Routing · Failover</span></li><li><strong>AI provider</strong><span>Model response</span></li></ol></section><section class="messages" id="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" hidden></section><div id="chat-errors"></div><div class="composer-wrap"><form class="composer" id="chat-form"><label class="sr-only" for="prompt">Message</label><textarea id="prompt" rows="2" maxlength="8000" placeholder="What's on your mind?" required></textarea><div class="composer-bottom"><div class="model-wrap"><span class="model-dot"></span><label class="sr-only" for="model">Model</label><select id="model" disabled><option>Loading models…</option></select></div><button class="send" id="send" type="submit" disabled>Send message</button></div></form><div class="composer-footer"><span class="hint">Enter to send · Shift + Enter for a new line</span><span class="powered">Powered by <strong>Fastly</strong> · Built with Pulse</span></div></div>`
  $('#new-chat').prepend(icon('plus', 13)); $('#send').append(icon('arrow'))
  let catalog, userId = '', history, busy = false
  const userSelect = node('select'); userSelect.id = 'user'; userSelect.setAttribute('aria-label', 'Demo user'); const avatar = node('span', 'avatar', '…'); const picker = node('div', 'user-picker'); picker.append(avatar, userSelect); $('#header-control').append(picker)
  const setBusy = value => { busy = value; $('#send').disabled = value || !userId || !$('#model').value; $('#model').disabled = value || !$('#model').options.length; userSelect.disabled = value; $('#new-chat').disabled = value; $('#prompt').disabled = value }
  function appendTurn(message) { const turn = node('article', `turn ${message.role}`); const a = node('div', 'avatar', message.role === 'user' ? initials(catalog.users.find(u => u.id === userId)?.name || 'You') : ''); if (message.role === 'assistant') a.append(icon('spark', 15)); const bubble = node('div', 'bubble'); if (message.role === 'assistant') markdown(bubble, message.content); else bubble.append(node('p', '', message.content)); if (message.meta) bubble.append(node('div', 'turn-meta', message.meta)); turn.append(a, bubble); $('#messages').append(turn) }
  function renderHistory() { $('#messages').replaceChildren(); $('#messages').hidden = !history.messages.length; $('#welcome').hidden = !!history.messages.length; for (const message of history.messages) appendTurn(message) }
  function switchUser() { userId = userSelect.value; $('#model').replaceChildren(); for (const key of catalog.users.find(u => u.id === userId)?.models || []) { const option = node('option', '', `${key.model} · ${key.name}`); option.value = key.id; $('#model').append(option) }; history = loadHistory(userId); avatar.textContent = initials(catalog.users.find(u => u.id === userId)?.name || ''); $('#chat-errors').replaceChildren(); renderHistory(); if (!$('#model').options.length) showError($('#chat-errors'), 'Assign a ready virtual key to this user in Admin.'); setBusy(false) }
  try {
    catalog = await api('/api/bootstrap'); $('#connection').replaceChildren(node('span', 'status-dot'), document.createTextNode(catalog.mode === 'preview' ? 'Local preview · simulated responses' : 'ARC connection · live mode'))
    for (const user of catalog.users) { const option = node('option', '', user.name); option.value = user.id; userSelect.append(option) }
    switchUser()
  } catch (error) { showError($('#chat-errors'), error.message); $('#connection').textContent = 'Connection unavailable' }
  userSelect.onchange = switchUser
  $('#new-chat').onclick = () => { if (history?.messages.length && !confirm('Clear this user’s conversation in this browser tab?')) return; history = { sessionId: crypto.randomUUID(), messages: [] }; saveHistory(userId, history); renderHistory(); $('#prompt').focus() }
  $('#prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && !$('#send').disabled) $('#chat-form').requestSubmit() } })
  $('#chat-form').onsubmit = async event => {
    event.preventDefault(); const content = $('#prompt').value.trim(); if (busy || !content || !userId) return
    $('#chat-errors').replaceChildren(); const keyId = $('#model').value; const model = catalog.users.find(u => u.id === userId)?.models.find(k => k.id === keyId)?.model || ''; const prior = history.messages.slice(-18).map(({ role, content }) => ({ role, content })); const outgoing = [...prior, { role: 'user', content }]
    if (outgoing.reduce((n, m) => n + m.content.length, 0) > 24000) { showError($('#chat-errors'), 'This conversation is full. Start a new conversation to continue.'); return }
    setBusy(true); history.messages.push({ role: 'user', content }); renderHistory(); $('#prompt').value = ''
    const loading = node('div', 'turn assistant'); loading.setAttribute('role', 'status'); loading.setAttribute('aria-label', 'Waiting for response'); const dots = node('div', 'typing'); dots.append(node('span'), node('span'), node('span')); loading.append(node('div', 'avatar', '·'), dots); $('#messages').append(loading); loading.scrollIntoView({ block: 'nearest' }); const start = performance.now()
    try {
      const response = await api('/api/chat', { method: 'POST', body: JSON.stringify({ userId, keyId, messages: outgoing, sessionId: history.sessionId }), signal: AbortSignal.timeout(30000) })
      const answer = response?.choices?.[0]?.message?.content
      if (typeof answer !== 'string' || !answer) throw new Error('The endpoint did not return a chat-completions response. Check its URL and model configuration.')
      const parts = [response.preview ? 'Simulated response' : (response.model || model), `${((performance.now() - start) / 1000).toFixed(1)}s`]
      if (response.usage && Number.isFinite(response.usage.total_tokens)) parts.push(`${response.usage.total_tokens} tokens`)
      const message = { role: 'assistant', content: answer, meta: parts.join(' · ') }; history.messages.push(message); saveHistory(userId, history); loading.remove(); appendTurn(message)
    } catch (error) { history.messages.pop(); renderHistory(); $('#prompt').value = content; showError($('#chat-errors'), error.name === 'TimeoutError' ? 'The request timed out. You can try again; ARC may already have processed it.' : error.message) }
    finally { loading.remove(); setBusy(false); $('#prompt').focus() }
  }
}
let adminPassword = '', settings = { users: [] }, keys = [], catalog = { providers: [], connections: [] }, activeTab = 'users', nextCursor = '', adminBusy = false
const adminApi = (path, options = {}) => api(`/api/admin/${path}`, { ...options, headers: { authorization: `Bearer ${adminPassword}` } })
async function loadKeys(cursor = '') {
  const page = await adminApi('keys/list', { method: 'POST', body: JSON.stringify({ cursor: encodeURIComponent(cursor) }) })
  keys = cursor ? [...keys, ...page.keys.filter(key => !keys.some(k => k.id === key.id))] : page.keys
  nextCursor = page.nextCursor
}
async function refreshAdmin() {
  settings = await adminApi('users')
  await loadKeys()
  catalog = await adminApi('catalog')
}
async function startAdmin() {
  main.className = 'admin-main'
  main.innerHTML = `<section class="login"><div class="eyebrow">PLAYGROUND ADMIN</div><h1>Admin</h1><p class="subtext">Demo users and ARC virtual keys.</p><form id="login-form"><label class="field">Admin password<input type="password" id="password" autocomplete="current-password" required></label><div id="login-errors"></div><button class="primary" type="submit">Open admin</button></form></section>`
  $('#login-form').onsubmit = async event => {
    event.preventDefault(); const button = $('#login-form button'); button.disabled = true; adminPassword = $('#password').value
    try { settings = await adminApi('users'); renderAdmin(); await reload() }
    catch (error) { adminPassword = ''; showError($('#login-errors'), error.message) }
    finally { button.disabled = false }
  }
}
async function reload() {
  if (adminBusy) return
  adminBusy = true; setAdminBusy(true)
  try { await refreshAdmin(); renderAdmin() }
  catch (error) { showError($('#admin-errors'), error.message) }
  finally { adminBusy = false; setAdminBusy(false) }
}
function setAdminBusy(busy) { main.querySelectorAll('button').forEach(button => { button.disabled = busy || button.dataset.unavailable === 'true' }) }
const tabInfo = { users: ['Users', 'Local demo personas and their assigned model keys.', 'user'], keys: ['Virtual keys', 'Each ARC key selects one provider and one model.', 'virtual key'] }
function renderAdmin() {
  main.innerHTML = `<div class="admin-heading"><div><div class="eyebrow">ARC PLAYGROUND</div><h1>Admin</h1><p class="subtext">Users and virtual keys</p></div><div class="row-actions"><button class="secondary" id="refresh">Refresh</button><button class="secondary" id="logout">Lock admin</button></div></div><div class="admin-layout"><nav class="tabs" aria-label="Admin sections" id="tabs"></nav><section><div id="admin-errors"></div><div class="panel"><div class="panel-top"><div><h2 id="panel-title"></h2><p id="panel-sub"></p></div><button class="primary" id="add-item"></button></div><div class="table-wrap" id="table"></div><button class="text-button" id="more" hidden>Load more keys</button></div><p class="admin-note" id="admin-note"></p><div class="notice" id="notice" role="status"></div></section></div><dialog class="modal" id="editor"></dialog>`
  $('#logout').onclick = () => { adminPassword = ''; settings = { users: [] }; keys = []; catalog = { providers: [], connections: [] }; startAdmin() }
  $('#refresh').onclick = reload
  for (const [tab, info] of Object.entries(tabInfo)) { const button = node('button', `tab ${tab === activeTab ? 'active' : ''}`, info[0]); button.onclick = () => { activeTab = tab; renderAdmin() }; $('#tabs').append(button) }
  const [title, sub, noun] = tabInfo[activeTab]
  $('#panel-title').textContent = title; $('#panel-sub').textContent = sub; $('#add-item').textContent = `+ Add ${noun}`; $('#add-item').onclick = () => editItem()
  $('#add-item').dataset.unavailable = String(activeTab === 'users' ? settings.users.length >= 30 : !catalog.providers.length && !catalog.connections.length)
  $('#add-item').disabled = $('#add-item').dataset.unavailable === 'true'
  $('#admin-note').textContent = activeTab === 'users' ? 'Users are demo personas, not sign-in accounts. Assign up to 10 ready keys per user. Disabling a user stops new chat requests after KV propagation.' : 'Credentials stay on the server. Rotate an existing key to make it available here; rotation also invalidates its token in other applications. Key editing and deletion currently require Fastly. Policies and Activity follow in later passes.'
  const items = activeTab === 'users' ? settings.users : keys
  if (!items.length) $('#table').append(node('div', 'empty', `No ${title.toLowerCase()} yet.`))
  else {
    const table = node('table'), head = node('tr'), thead = node('thead'), body = node('tbody')
    for (const title of ['Name', activeTab === 'users' ? 'Assigned models' : 'Provider / model', 'Status', 'Actions']) head.append(node('th', '', title))
    thead.append(head); table.append(thead)
    for (const item of items) {
      const row = node('tr'), name = node('td', '', item.name); name.append(node('span', 'minor', item.id)); row.append(name)
      row.append(node('td', '', activeTab === 'users' ? item.keyIds.map(id => { const key = keys.find(k => k.id === id); return key ? key.model : id }).join(', ') || 'Not assigned' : `${item.provider} / ${item.model}`))
      const status = node('td'), ready = activeTab === 'users' ? item.active : item.ready
      status.append(node('span', `badge ${ready ? '' : 'off'}`, activeTab === 'users' ? ready ? 'Active' : 'Disabled' : ready ? 'Ready' : 'Needs rotation')); row.append(status)
      const actions = node('td'), buttons = node('div', 'row-actions')
      if (activeTab === 'users') {
        const edit = node('button', '', 'Edit'); edit.setAttribute('aria-label', `Edit ${item.name}`); edit.onclick = () => editItem(item)
        const remove = node('button', 'danger', 'Delete'); remove.setAttribute('aria-label', `Delete ${item.name}`); remove.onclick = () => deleteUser(item); buttons.append(edit, remove)
      } else {
        const rotate = node('button', '', 'Rotate key'); rotate.setAttribute('aria-label', `Rotate ${item.name}`); rotate.onclick = () => rotateKey(item); buttons.append(rotate)
      }
      actions.append(buttons); row.append(actions); body.append(row)
    }
    table.append(body); $('#table').append(table)
  }
  if (activeTab === 'keys' && nextCursor) {
    $('#more').hidden = false; $('#more').onclick = async () => { setAdminBusy(true); try { await loadKeys(nextCursor); renderAdmin() } catch (error) { showError($('#admin-errors'), error.message) } finally { setAdminBusy(false) } }
  }
}
function addField(form, label, name, value = '', max = 100) {
  const wrapper = node('label', 'field', label), input = node('input'); input.name = name; input.value = value; input.required = true; input.maxLength = max; wrapper.append(input); form.append(wrapper); return input
}
function selectField(form, label, name) { const wrapper = node('label', 'field', label), select = node('select'); select.name = name; select.setAttribute('aria-label', label); select.required = true; wrapper.append(select); form.append(wrapper); return select }
function option(select, label, value) { const item = node('option', '', label); item.value = value; select.append(item) }
function editItem(item) {
  const kind = activeTab, dialog = $('#editor'), form = node('form'); dialog.replaceChildren(form); form.append(node('h2', '', `${item ? 'Edit' : 'Add'} ${kind === 'users' ? 'user' : 'virtual key'}`)); addField(form, 'Name', 'name', item?.name)
  if (kind === 'users') {
    const group = node('fieldset', 'key-choices'); group.append(node('legend', '', 'Assigned virtual keys'))
    const available = [...keys.filter(k => k.ready)]
    for (const id of item?.keyIds || []) if (!available.some(k => k.id === id)) available.push({ id, name: `${id} (not loaded or unavailable)`, model: '' })
    for (const key of available) { const label = node('label', 'check-field'), box = node('input'); box.type = 'checkbox'; box.name = 'keyIds'; box.value = key.id; box.checked = item?.keyIds.includes(key.id) || false; label.append(box, document.createTextNode(`${key.name}${key.model ? ' · ' + key.model : ''}`)); group.append(label) }
    if (!available.length) group.append(node('p', 'subtext', 'Create or rotate a key first. You can save this user without an assignment.'))
    form.append(group)
    const label = node('label', 'check-field'), box = node('input'); box.type = 'checkbox'; box.name = 'active'; box.checked = item?.active ?? true; label.append(box, document.createTextNode('Active')); form.append(label)
  } else {
    const provider = selectField(form, 'Provider', 'provider'), model = selectField(form, 'Model', 'model')
    const choices = catalog.providers.map(p => ({ id: p.id, name: p.display_name, models: p.models.map(m => ({ id: m.id, name: m.display_name })) }))
    for (const connection of catalog.connections) if (!choices.some(p => p.id === connection.name)) choices.push({ id: connection.name, name: `${connection.name} (connection)`, models: connection.models.map(id => ({ id, name: id })) })
    for (const p of choices) option(provider, p.name, p.id)
    const models = () => { model.replaceChildren(); for (const m of choices.find(p => p.id === provider.value)?.models || []) option(model, `${m.name} · ${m.id}`, m.id) }; provider.onchange = models; models()
    form.append(node('p', 'subtext', 'Uses existing ARC providers and connections. Configure connections in Fastly. Choose a model that supports chat completions.'))
  }
  const errors = node('div'), actions = node('div', 'modal-actions'), cancel = node('button', 'secondary', 'Cancel'), save = node('button', 'primary', kind === 'users' ? 'Save user' : 'Create key'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); save.type = 'submit'; actions.append(cancel, save); form.append(errors, actions)
  let saving = false; dialog.oncancel = event => { if (saving) event.preventDefault() }
  form.onsubmit = async event => {
    event.preventDefault(); if (saving) return; saving = true; save.disabled = true; cancel.disabled = true
    const data = new FormData(form)
    try {
      if (kind === 'users') {
        const user = { id: item?.id || crypto.randomUUID(), name: String(data.get('name')).trim(), keyIds: data.getAll('keyIds'), active: data.has('active') }
        if (user.keyIds.length > 10) throw new Error('Assign at most 10 keys per user.')
        const users = item ? settings.users.map(u => u.id === item.id ? user : u) : [...settings.users, user]
        await adminApi('users', { method: 'PUT', body: JSON.stringify({ users }) }); settings = { users }
      } else {
        await adminApi('keys', { method: 'POST', body: JSON.stringify({ name: String(data.get('name')).trim(), provider: data.get('provider'), model: data.get('model') }) })
      }
      dialog.close(); renderAdmin(); $('#notice').textContent = kind === 'users' ? 'User saved.' : 'Key created. Refreshing the list…'
      if (kind === 'keys') await reload()
    } catch (error) { showError(errors, error.message) }
    finally { saving = false; save.disabled = false; cancel.disabled = false }
  }
  dialog.showModal()
}
async function deleteUser(item) {
  if (!confirm(`Delete demo user ${item.name}? Their ARC keys will remain available.`)) return
  setAdminBusy(true)
  try { const users = settings.users.filter(u => u.id !== item.id); await adminApi('users', { method: 'PUT', body: JSON.stringify({ users }) }); settings = { users }; renderAdmin(); $('#notice').textContent = 'User deleted.' }
  catch (error) { showError($('#admin-errors'), error.message) } finally { setAdminBusy(false) }
}
async function rotateKey(item) {
  if (!confirm(`Rotate ${item.name}? ARC immediately invalidates the old token everywhere it is used. Assigned demo users will use the replacement after KV propagation.`)) return
  setAdminBusy(true)
  let result = ''
  try { result = await adminApi(`keys/${encodeURIComponent(item.id)}/rotate`, { method: 'POST' }) }
  catch (error) { result = error.message }
  try { await loadKeys(); renderAdmin(); $('#notice').textContent = result }
  catch (error) { showError($('#admin-errors'), `${result} Refresh failed: ${error.message}`) }
  finally { setAdminBusy(false) }
}
if (isAdmin) startAdmin(); else startChat()
