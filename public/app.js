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
  if (!response.ok || body?.error) {
    const error = new Error(body?.error?.message || (typeof body?.error === 'string' ? body.error : `Request failed (${response.status}). Please try again.`))
    error.status = response.status; throw error
  }
  return body ?? text
}
function requireList(body, property, path) {
  if (!body || !Array.isArray(body[property])) throw new Error(`Unexpected response from ${path}: expected a ${property} list. Restart the local server and reload.`)
  return body
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
  main.closest('.shell').classList.add('chat-shell')
  main.innerHTML = `<div class="session-bar"><span class="status" id="connection"><span class="status-dot"></span>Connecting…</span><button class="text-button" id="new-chat" type="button">New conversation</button></div><div class="conversation-scroll" id="conversation-scroll" tabindex="0" role="region" aria-label="Chat history"><section class="welcome" id="welcome"><div class="eyebrow">HOW IT WORKS</div><h1>Your request, end to end.</h1><ol class="overview-flow" aria-label="Request flow"><li><strong>Chat</strong><span>Your message</span></li><li><strong>Fastly Compute</strong><span>Pulse app</span></li><li class="flow-arc"><strong>ARC</strong><span>Virtual key · Limits<br>Routing · Failover</span></li><li><strong>AI provider</strong><span>Model response</span></li></ol><div class="suggestions" id="suggestions" role="group" aria-label="Suggested prompts"></div></section><section class="messages" id="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" hidden></section></div><div id="chat-errors"></div><div class="composer-wrap"><form class="composer" id="chat-form"><label class="sr-only" for="prompt">Message</label><textarea id="prompt" rows="2" maxlength="8000" placeholder="What's on your mind?" required></textarea><div class="composer-bottom"><div class="model-wrap"><span class="model-dot"></span><label class="sr-only" for="model">Model</label><select id="model" disabled><option>Loading models…</option></select></div><button class="send" id="send" type="submit" disabled>Send message</button></div></form><div class="composer-footer"><span class="hint">Enter to send · Shift + Enter for a new line</span><span class="powered">Powered by <strong>Fastly</strong> · Built with Pulse</span></div></div>`
  $('#new-chat').prepend(icon('plus', 13)); $('#send').append(icon('arrow'))
  const prompts = [['pen', 'Write something', 'Help me write a warm welcome note for a new teammate.'], ['spark', 'Explore an idea', 'Explain an interesting idea I can learn in two minutes.'], ['code', 'Build something', 'Show me a small, useful JavaScript function and explain how it works.']]
  for (const [symbol, title, prompt] of prompts) { const button = node('button', 'suggestion', title); button.type = 'button'; button.prepend(icon(symbol, 13)); button.onclick = () => { $('#prompt').value = prompt; $('#prompt').focus() }; $('#suggestions').append(button) }
  const viewport = $('#conversation-scroll'), messages = $('#messages'), prompt = $('#prompt')
  const nearBottom = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80
  function revealReply(turn) {
    requestAnimationFrame(() => {
      if (!turn.isConnected) return
      const top = viewport.scrollTop + turn.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16
      viewport.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
  }
  let catalog, userId = '', history, busy = false
  const userSelect = node('select'); userSelect.id = 'user'; userSelect.setAttribute('aria-label', 'Demo user'); const avatar = node('span', 'avatar', '…'); const picker = node('div', 'user-picker'); picker.append(avatar, userSelect); $('#header-control').append(picker)
  const setBusy = value => { busy = value; $('#send').disabled = value || !userId || !$('#model').value; $('#model').disabled = value || !$('#model').options.length; userSelect.disabled = value; $('#new-chat').disabled = value; $('#suggestions').querySelectorAll('button').forEach(button => { button.disabled = value }) }
  function createTurn(message, restored = false) {
    const turn = node('article', `turn ${message.role}${restored ? ' restored' : ''}`)
    const a = node('div', 'avatar', message.role === 'user' ? initials(catalog.users.find(u => u.id === userId)?.name || 'You') : '')
    if (message.role === 'assistant') a.append(icon('spark', 15))
    const bubble = node('div', 'bubble')
    if (message.role === 'assistant') markdown(bubble, message.content)
    else bubble.append(node('p', '', message.content))
    if (message.meta) bubble.append(node('div', 'turn-meta', message.meta))
    turn.append(a, bubble)
    return turn
  }
  function renderHistory() {
    messages.replaceChildren(); messages.hidden = !history.messages.length; $('#welcome').hidden = !!history.messages.length
    for (const message of history.messages) messages.append(createTurn(message, true))
    viewport.scrollTop = viewport.scrollHeight
  }
  function switchUser() { userId = userSelect.value; $('#model').replaceChildren(); for (const key of catalog.users.find(u => u.id === userId)?.models || []) { const option = node('option', '', `${key.model} · ${key.name}`); option.value = key.id; $('#model').append(option) }; history = loadHistory(userId); avatar.textContent = initials(catalog.users.find(u => u.id === userId)?.name || ''); $('#chat-errors').replaceChildren(); renderHistory(); if (!$('#model').options.length) showError($('#chat-errors'), 'Assign a ready virtual key to this user in Admin.'); setBusy(false) }
  try {
    catalog = requireList(await api('/api/bootstrap'), 'users', '/api/bootstrap'); $('#connection').replaceChildren(node('span', 'status-dot'), document.createTextNode(catalog.mode === 'preview' ? 'Local preview · simulated responses' : 'ARC connection · live mode'))
    for (const user of catalog.users) { const option = node('option', '', user.name); option.value = user.id; userSelect.append(option) }
    switchUser()
  } catch (error) { showError($('#chat-errors'), error.message); $('#connection').textContent = 'Connection unavailable' }
  userSelect.onchange = switchUser
  $('#new-chat').onclick = () => { if (history?.messages.length && !confirm('Clear this user’s conversation in this browser tab?')) return; history = { sessionId: crypto.randomUUID(), messages: [] }; saveHistory(userId, history); $('#chat-errors').replaceChildren(); renderHistory(); prompt.focus({ preventScroll: true }) }
  $('#prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && !$('#send').disabled) $('#chat-form').requestSubmit() } })
  $('#chat-form').onsubmit = async event => {
    event.preventDefault(); const content = $('#prompt').value.trim(); if (busy || !content || !userId) return
    $('#chat-errors').replaceChildren(); const keyId = $('#model').value; const model = catalog.users.find(u => u.id === userId)?.models.find(k => k.id === keyId)?.model || ''; const prior = history.messages.slice(-18).map(({ role, content }) => ({ role, content })); const outgoing = [...prior, { role: 'user', content }]
    if (outgoing.reduce((n, m) => n + m.content.length, 0) > 24000) { showError($('#chat-errors'), 'This conversation is full. Start a new conversation to continue.'); return }
    setBusy(true); history.messages.push({ role: 'user', content }); messages.hidden = false; $('#welcome').hidden = true
    const userTurn = createTurn(history.messages.at(-1)); messages.append(userTurn); prompt.value = ''
    const loading = node('div', 'turn assistant'); loading.setAttribute('role', 'status'); loading.setAttribute('aria-label', 'Waiting for response'); const dots = node('div', 'typing'); dots.append(node('span'), node('span'), node('span')); loading.append(node('div', 'avatar', '·'), dots); messages.append(loading); messages.setAttribute('aria-busy', 'true'); viewport.scrollTop = viewport.scrollHeight; const start = performance.now()
    try {
      const response = await api('/api/chat', { method: 'POST', body: JSON.stringify({ userId, keyId, messages: outgoing, sessionId: history.sessionId }), signal: AbortSignal.timeout(30000) })
      const answer = response?.choices?.[0]?.message?.content
      if (typeof answer !== 'string' || !answer) throw new Error('The endpoint did not return a chat-completions response. Check its URL and model configuration.')
      const parts = [response.preview ? 'Simulated response' : (response.model || model), `${((performance.now() - start) / 1000).toFixed(1)}s`]
      if (response.usage && Number.isFinite(response.usage.total_tokens)) parts.push(`${response.usage.total_tokens} tokens`)
      const message = { role: 'assistant', content: answer, meta: parts.join(' · ') }; history.messages.push(message); saveHistory(userId, history)
      const follow = nearBottom(), reply = createTurn(message); loading.replaceWith(reply)
      if (follow) revealReply(reply)
    } catch (error) {
      history.messages.pop(); userTurn.remove(); loading.remove(); messages.hidden = !history.messages.length; $('#welcome').hidden = !!history.messages.length
      if (!prompt.value) prompt.value = content
      showError($('#chat-errors'), error.name === 'TimeoutError' ? 'The request timed out. You can try again; ARC may already have processed it.' : error.message)
    } finally { loading.remove(); messages.setAttribute('aria-busy', 'false'); setBusy(false) }
  }
}
let adminPassword = '', settings = { users: [] }, keys = [], catalog = { providers: [], connections: [] }, activeTab = 'users', nextCursor = '', adminBusy = false
const adminApi = (path, options = {}) => api(`/api/admin/${path}`, { ...options, headers: { authorization: `Bearer ${adminPassword}` } })
async function loadKeys(cursor = '') {
  const page = requireList(await adminApi('keys/list', { method: 'POST', body: JSON.stringify({ cursor: encodeURIComponent(cursor) }) }), 'keys', '/api/admin/keys/list')
  keys = cursor ? [...keys, ...page.keys.filter(key => !keys.some(k => k.id === key.id))] : page.keys
  nextCursor = page.nextCursor
}
async function refreshAdmin() {
  settings = requireList(await adminApi('users'), 'users', '/api/admin/users')
  await loadKeys()
  catalog = requireList(requireList(await adminApi('catalog'), 'providers', '/api/admin/catalog'), 'connections', '/api/admin/catalog')
}
async function startAdmin() {
  main.className = 'admin-main'
  main.innerHTML = `<section class="login"><div class="eyebrow">PLAYGROUND ADMIN</div><h1>Admin</h1><p class="subtext">Demo users and ARC virtual keys.</p><form id="login-form"><label class="field">Admin password<input type="password" id="password" autocomplete="current-password" required></label><div id="login-errors"></div><button class="primary" type="submit">Open admin</button></form></section>`
  $('#login-form').onsubmit = async event => {
    event.preventDefault(); const button = $('#login-form button'); button.disabled = true; adminPassword = $('#password').value
    try { settings = requireList(await adminApi('users'), 'users', '/api/admin/users'); renderAdmin(); await reload() }
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
const tabInfo = { users: ['Users', 'Local demo personas and their assigned model keys.', 'user'], keys: ['Virtual keys', 'Each ARC key selects one provider and one model.', 'virtual key'], activity: ['Activity', 'Usage and session logs from ARC.', ''] }
function renderAdmin() {
  main.innerHTML = `<div class="admin-heading"><div><div class="eyebrow">ARC PLAYGROUND</div><h1>Admin</h1><p class="subtext">Users, virtual keys and activity</p></div><div class="row-actions"><button class="secondary" id="refresh">Refresh</button><button class="secondary" id="logout">Lock admin</button></div></div><div class="admin-layout"><nav class="tabs" aria-label="Admin sections" id="tabs"></nav><section><div id="admin-errors"></div><div class="panel"><div class="panel-top"><div><h2 id="panel-title"></h2><p id="panel-sub"></p></div><button class="primary" id="add-item"></button></div><div class="table-wrap" id="table"></div><button class="text-button" id="more" hidden>Load more keys</button></div><p class="admin-note" id="admin-note"></p><div class="notice" id="notice" role="status"></div></section></div><dialog class="modal" id="editor"></dialog>`
  $('#logout').onclick = () => { adminPassword = ''; settings = { users: [] }; keys = []; catalog = { providers: [], connections: [] }; activeTab = 'users'; startAdmin() }
  $('#refresh').onclick = reload
  for (const [tab, info] of Object.entries(tabInfo)) { const button = node('button', `tab ${tab === activeTab ? 'active' : ''}`, info[0]); button.onclick = () => { activeTab = tab; renderAdmin() }; $('#tabs').append(button) }
  const [title, sub, noun] = tabInfo[activeTab]
  $('#panel-title').textContent = title; $('#panel-sub').textContent = sub; $('#add-item').textContent = `+ Add ${noun}`; $('#add-item').onclick = () => editItem()
  if (activeTab === 'activity') { $('#add-item').hidden = true; renderActivity(); return }
  $('#add-item').dataset.unavailable = String(activeTab === 'users' ? settings.users.length >= 30 : !catalog.providers.length && !catalog.connections.length)
  $('#add-item').disabled = $('#add-item').dataset.unavailable === 'true'
  $('#admin-note').textContent = activeTab === 'users' ? 'Users are demo personas, not sign-in accounts. Assign up to 10 ready keys per user. Disabling a user stops new chat requests after KV propagation.' : 'Credentials stay on the server. Rotate an existing key to make it available here; rotation also invalidates its token in other applications. Open Policies for limits, expiry, firewall, spend control, and failover. Key metadata editing and deletion currently require Fastly.'
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
        const policy = node('button', '', 'Policies'); policy.setAttribute('aria-label', `Policies for ${item.name}`); policy.onclick = () => editPolicies(item); buttons.append(policy)
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
    form.append(node('p', 'subtext', 'Uses existing ARC providers and connections. Configure connections in Fastly. Choose a model that supports chat completions. After creation, open Policies to configure limits, expiry, firewall, spend control, and failover.'))
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


async function editPolicies(item) {
  const dialog = $('#editor'); dialog.classList.add('policy-modal'); dialog.replaceChildren()
  const heading = node('div', 'policy-heading'), title = node('div'), close = node('button', 'secondary', 'Close')
  title.append(node('h2', '', item.name), node('p', 'subtext', `${item.provider} / ${item.model}`)); heading.append(title, close); dialog.append(heading)
  const help = node('p', 'subtext', 'Key policy and failover save independently. Changes affect every application using this key.'); dialog.append(help)
  const cards = node('div', 'policy-cards'); dialog.append(cards)
  let pending = 0, policyDirty = () => false, failoverDirty = () => false
  const dismiss = () => { if (!pending && (!(policyDirty() || failoverDirty()) || confirm('Discard unsaved policy changes?'))) dialog.close() }
  close.onclick = dismiss; dialog.oncancel = event => { event.preventDefault(); dismiss() }
  dialog.onclose = () => { dialog.classList.remove('policy-modal'); dialog.onclose = null }
  const busy = change => { pending += change; close.disabled = pending > 0 }
  const path = `keys/${encodeURIComponent(item.id)}`
  function section(label) {
    const card = node('section', 'policy-card'), heading = node('div', 'policy-card-heading'), reload = node('button', 'text-button', 'Reload'), errors = node('div'), contents = node('div'), status = node('p', 'notice')
    reload.type = 'button'; reload.setAttribute('aria-label', `Reload ${label.toLowerCase()}`); heading.append(node('h3', '', label), reload); status.setAttribute('role', 'status'); card.append(heading, errors, contents, status); cards.append(card)
    return { card, reload, errors, contents, status }
  }
  const policy = section('Key policy'), failover = section('Failover')
  function toggle(form, label, name, checked) { const wrapper = node('label', 'check-field'), input = node('input'); input.type = 'checkbox'; input.name = name; input.checked = checked; wrapper.append(input, document.createTextNode(label)); form.append(wrapper); return input }
  function statusError(section, error) { showError(section.errors, error.message); section.status.textContent = 'No successful save was confirmed. Reload this section to check ARC before retrying.' }
  async function loadPolicy() {
    if (policyDirty() && !confirm('Discard unsaved key policy changes and reload?')) return
    busy(1); policy.reload.disabled = true; policy.contents.replaceChildren(node('p', 'subtext', 'Loading key policy…')); policy.errors.replaceChildren(); policy.status.textContent = ''; policyDirty = () => false
    try {
      const initial = await adminApi(`${path}/policy`)
      if (initial?.id !== item.id || typeof initial !== 'object') throw new Error('ARC returned an unexpected key. Policy editing is unavailable until reload succeeds.')
      for (const name of ['rpm_limit', 'tpm_limit']) if (initial[name] != null && (!Number.isSafeInteger(initial[name]) || initial[name] < 1)) throw new Error('ARC returned an invalid rate limit. Reload before editing.')
      for (const name of ['security_enabled', 'spend_limit_enabled']) if (initial[name] !== undefined && typeof initial[name] !== 'boolean') throw new Error('ARC returned an invalid policy flag. Reload before editing.')
      if (initial.security_action !== undefined && !['log', 'block', 'replace'].includes(initial.security_action)) throw new Error('ARC returned an unknown firewall action. Reload before editing.')
      const form = node('form'); form.setAttribute('aria-label', 'Key policy'); policy.contents.replaceChildren(form)
      const fields = node('div', 'policy-fields'); form.append(fields)
      for (const [label, name] of [['Requests per minute', 'rpm_limit'], ['Tokens per minute', 'tpm_limit']]) {
        const input = addField(fields, label, name, initial[name] ?? ''); input.type = 'number'; input.min = '1'; input.step = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.required = false; input.placeholder = 'Unlimited'; input.setAttribute('aria-label', label)
      }
      form.append(node('p', 'subtext', 'Leave a limit blank to remove it. Unchanged fields are preserved.'))
      const expiry = addField(form, 'Expires at (UTC)', 'expires_at', '', 40); expiry.type = 'datetime-local'; expiry.step = '0.001'; expiry.max = '9999-12-31T23:59:59.999'; expiry.required = false
      if (initial.expires_at) { const date = new Date(initial.expires_at); if (!Number.isFinite(date.getTime())) throw new Error('ARC returned an invalid expiry. Reload before editing.'); expiry.value = date.toISOString().slice(0, -1) }
      form.append(node('p', 'subtext', 'UTC time. Leave blank for no expiry.'))
      const firewall = toggle(form, 'Enable AI Firewall', 'security_enabled', initial.security_enabled ?? false)
      const action = selectField(form, 'Firewall action', 'security_action'); for (const value of ['log', 'block', 'replace']) option(action, value[0].toUpperCase() + value.slice(1), value); action.value = initial.security_action ?? 'log'; action.disabled = !firewall.checked; firewall.onchange = () => { action.disabled = !firewall.checked }
      toggle(form, 'Enable ARC spend limit', 'spend_limit_enabled', initial.spend_limit_enabled ?? false)
      form.append(node('p', 'subtext', 'This toggles ARC’s spend-limit flag. The API does not expose a budget amount or reset period.'))
      const read = () => ({ rpm_limit: form.elements.rpm_limit.value, tpm_limit: form.elements.tpm_limit.value, expires_at: expiry.value, security_enabled: firewall.checked, security_action: action.value, spend_limit_enabled: form.elements.spend_limit_enabled.checked })
      let baseline = read()
      const patch = () => { const current = read(), body = {}; for (const name of Object.keys(current)) if (current[name] !== baseline[name]) { body[name] = ['rpm_limit', 'tpm_limit'].includes(name) ? current[name] === '' ? null : Number(current[name]) : name === 'expires_at' ? current[name] ? new Date(current[name] + 'Z').toISOString() : null : current[name] }; return body }
      policyDirty = () => JSON.stringify(read()) !== JSON.stringify(baseline)
      const save = node('button', 'primary', 'Save key policy'); save.type = 'submit'; form.append(save)
      if (initial.preview) { for (const control of form.elements) control.disabled = true; policy.status.textContent = 'Preview policy · connect ARC to save changes.' }
      form.onsubmit = async event => {
        event.preventDefault(); const body = patch(); policy.errors.replaceChildren()
        if (!Object.keys(body).length) { policy.status.textContent = 'No key policy changes.'; return }
        for (const name of ['rpm_limit', 'tpm_limit']) if (body[name] != null && (!Number.isSafeInteger(body[name]) || body[name] < 1)) { showError(policy.errors, 'Limits must be positive whole numbers.'); return }
        const controls = [...form.elements]; controls.forEach(control => control.disabled = true); policy.reload.disabled = true; busy(1); policy.status.textContent = 'Saving key policy…'
        try { await adminApi(`${path}/policy`, { method: 'PATCH', body: JSON.stringify(body) }); baseline = read(); policy.status.textContent = 'Key policy saved. Failover is saved separately.' }
        catch (error) { statusError(policy, error) }
        finally { controls.forEach(control => control.disabled = false); action.disabled = !firewall.checked; policy.reload.disabled = false; busy(-1) }
      }
    } catch (error) { policy.contents.replaceChildren(); showError(policy.errors, error.message) }
    finally { policy.reload.disabled = false; busy(-1) }
  }
  async function loadFailover() {
    if (failoverDirty() && !confirm('Discard unsaved failover changes and reload?')) return
    busy(1); failover.reload.disabled = true; failover.contents.replaceChildren(node('p', 'subtext', 'Loading failover…')); failover.errors.replaceChildren(); failover.status.textContent = ''; failoverDirty = () => false
    try {
      const initial = await adminApi(`${path}/failover`)
      if (!Array.isArray(initial?.targets) || initial.targets.length > 25 || initial.targets.some(t => typeof t.provider_connection_id !== 'string' || !t.provider_connection_id) || ['timeout_enabled', 'rate_limit_429_enabled', 'server_error_5xx_enabled'].some(name => typeof initial[name] !== 'boolean')) throw new Error('ARC returned an incomplete failover policy. Saving is disabled until reload succeeds.')
      let targets = initial.targets.map(t => t.provider_connection_id)
      const form = node('form'); form.setAttribute('aria-label', 'Failover'); failover.contents.replaceChildren(form)
      form.append(node('p', 'subtext', 'Provider connections are tried in this order after a primary failure. Targets reuse this key’s model; no replacement model is configured here.'))
      const rows = node('ol', 'failover-targets'); form.append(rows)
      const add = node('button', 'secondary', '+ Add target'); add.type = 'button'; form.append(add)
      function renderTargets() {
        rows.replaceChildren()
        targets.forEach((id, index) => {
          const row = node('li', 'failover-target'), select = node('select'); select.required = true; select.setAttribute('aria-label', `Failover target ${index + 1}`)
          option(select, 'Choose a provider connection', '')
          for (const connection of catalog.connections) option(select, `${connection.name}${connection.models.includes(item.model) ? '' : ' (model not listed)'}`, connection.id)
          if (id && !catalog.connections.some(c => c.id === id)) option(select, `${id} (existing target; connection unavailable)`, id)
          select.value = id; select.onchange = () => { targets[index] = select.value }
          const up = node('button', 'secondary', '↑'), down = node('button', 'secondary', '↓'), remove = node('button', 'secondary', 'Remove')
          for (const button of [up, down, remove]) button.type = 'button'
          up.setAttribute('aria-label', `Move target ${index + 1} up`); down.setAttribute('aria-label', `Move target ${index + 1} down`); remove.setAttribute('aria-label', `Remove target ${index + 1}`)
          up.disabled = index === 0; down.disabled = index === targets.length - 1
          up.onclick = () => { [targets[index - 1], targets[index]] = [targets[index], targets[index - 1]]; renderTargets() }
          down.onclick = () => { [targets[index], targets[index + 1]] = [targets[index + 1], targets[index]]; renderTargets() }
          remove.onclick = () => { targets.splice(index, 1); renderTargets() }; row.append(node('span', 'target-order', `Target ${index + 1}`), select, up, down, remove); rows.append(row)
        })
        add.disabled = targets.length >= 25 || !catalog.connections.length
      }
      add.onclick = () => { targets.push(''); renderTargets() }; renderTargets()
      toggle(form, 'Retry on timeout', 'timeout_enabled', initial.timeout_enabled)
      toggle(form, 'Retry on provider 429', 'rate_limit_429_enabled', initial.rate_limit_429_enabled)
      toggle(form, 'Retry on provider 5xx', 'server_error_5xx_enabled', initial.server_error_5xx_enabled)
      form.append(node('p', 'subtext', '429 refers to the upstream provider’s rate limit. An empty target list removes failover targets.'))
      const read = () => ({ targets: targets.map(provider_connection_id => ({ provider_connection_id })), timeout_enabled: form.elements.timeout_enabled.checked, rate_limit_429_enabled: form.elements.rate_limit_429_enabled.checked, server_error_5xx_enabled: form.elements.server_error_5xx_enabled.checked })
      let baseline = read(); failoverDirty = () => JSON.stringify(read()) !== JSON.stringify(baseline)
      const save = node('button', 'primary', 'Save failover'); save.type = 'submit'; form.append(save)
      const preview = catalog.preview === true
      if (preview) { for (const control of form.elements) control.disabled = true; failover.status.textContent = 'Preview policy · connect ARC to save changes.' }
      form.onsubmit = async event => {
        event.preventDefault(); const body = read(); failover.errors.replaceChildren()
        if (!failoverDirty()) { failover.status.textContent = 'No failover changes.'; return }
        if (targets.some(id => !id) || new Set(targets).size !== targets.length) { showError(failover.errors, 'Select a different connection for each target.'); return }
        if (baseline.targets.length && !targets.length && !confirm('Remove all failover targets for this key?')) return
        const controls = [...form.elements]; controls.forEach(control => control.disabled = true); failover.reload.disabled = true; busy(1); failover.status.textContent = 'Saving failover…'
        try { await adminApi(`${path}/failover`, { method: 'PUT', body: JSON.stringify(body) }); baseline = read(); failover.status.textContent = 'Failover saved. Key policy is saved separately.' }
        catch (error) { statusError(failover, error) }
        finally { controls.forEach(control => control.disabled = false); renderTargets(); failover.reload.disabled = false; busy(-1) }
      }
    } catch (error) { failover.contents.replaceChildren(); showError(failover.errors, error.message) }
    finally { failover.reload.disabled = false; busy(-1) }
  }
  policy.reload.onclick = loadPolicy; failover.reload.onclick = loadFailover
  dialog.showModal(); await Promise.allSettled([loadPolicy(), loadFailover()])
}
if (isAdmin) startAdmin(); else startChat()


function renderActivity() {
  const root = $('#table'); root.className = 'activity'
  root.innerHTML = `<form class="activity-filters" id="activity-filters"><label class="field">Time range<select name="range"><option value="1">Last hour</option><option value="24" selected>Last 24 hours</option><option value="168">Last 7 days</option></select></label><label class="field">Virtual key<input name="key" list="activity-keys" placeholder="All keys" maxlength="100" pattern="[A-Za-z0-9_-]*"><datalist id="activity-keys"></datalist></label><button class="primary" type="submit">Refresh activity</button></form><p class="minor" id="activity-range" role="status"></p><section aria-label="Usage metrics"><h3>Usage</h3><div id="activity-metrics" aria-live="polite"></div></section><section aria-label="Session logs"><h3>Recent sessions</h3><div id="activity-sessions" aria-live="polite"></div><div class="row-actions" id="activity-pages"></div></section>`
  for (const key of keys) { const option = node('option'); option.value = key.id; option.label = key.name; $('#activity-keys', root).append(option) }
  $('#admin-note').textContent = 'Activity belongs to ARC virtual keys, not local users or browser conversations. Logs may contain prompts and responses. They are shown only in this admin view and are not saved by the playground. Refresh manually for new data.'
  const form = $('#activity-filters', root), metrics = $('#activity-metrics', root), sessions = $('#activity-sessions', root), pages = $('#activity-pages', root)
  let generation = 0, sessionGeneration = 0, filters, controller
  const number = value => Number.isSafeInteger(value) && value >= 0
  const format = value => value.toLocaleString()
  const message = (target, text) => target.replaceChildren(node('p', 'empty', text))
  const validPage = page => page && Array.isArray(page.data) && page.meta && typeof page.meta === 'object'
  async function read(resource, cursor = '') {
    return adminApi(`activity/${resource}`, { method: 'POST', body: JSON.stringify({ ...filters, cursor: encodeURIComponent(cursor) }), signal: controller.signal })
  }
  async function loadMetrics(version) {
    message(metrics, 'Loading usage…')
    try {
      const page = await read('usage-metrics')
      if (!root.isConnected || version !== generation) return
      if (!validPage(page)) throw Error('ARC returned an unreadable usage response. Refresh to try again.')
      if (page.preview === true) { message(metrics, 'Local preview · usage is available after connecting to ARC.'); return }
      const totals = { requests: 0, sessions: 0, input_tokens: 0, output_tokens: 0 }
      for (const row of page.data) {
        if (!row || !Object.hasOwn(totals, row.usage_type) || !number(row.quantity)) throw Error('ARC returned invalid usage values. Totals are unavailable.')
        totals[row.usage_type] += row.quantity
        if (!number(totals[row.usage_type])) throw Error('Usage totals exceed the supported numeric range.')
      }
      if (number(page.meta.total) && page.meta.total > page.data.length) throw Error('ARC returned incomplete usage results. Choose a shorter time range or a specific key.')
      metrics.replaceChildren()
      const cards = node('div', 'metric-cards')
      for (const [key, label] of Object.entries({ requests: 'Requests', sessions: 'Sessions', input_tokens: 'Input tokens', output_tokens: 'Output tokens' })) {
        const card = node('div', 'metric-card'); card.append(node('span', 'minor', label), node('strong', '', format(totals[key]))); cards.append(card)
      }
      metrics.append(cards)
      if (!page.data.length) metrics.append(node('p', 'minor', 'No usage recorded in this range.'))
    } catch (error) { if (root.isConnected && version === generation && error.name !== 'AbortError') showError(metrics, error.message) }
  }
  function sessionCard(item) {
    const card = node('details', 'session-card'), summary = node('summary'), heading = node('div', 'session-heading')
    heading.append(node('strong', '', item.virtual_key_name || item.virtual_key_id), node('span', 'minor', `${item.model} · ${new Date(item.created_at).toLocaleString()}`))
    const status = !item.firewall_enabled ? 'Firewall disabled' : Object.hasOwn(item, 'firewall_outcome') ? `Firewall: ${item.firewall_outcome === '' ? '(empty outcome)' : item.firewall_outcome}` : 'Firewall enabled · no outcome recorded'
    summary.append(heading, node('span', 'badge', status)); card.append(summary)
    const detail = node('div', 'session-detail')
    detail.append(node('p', 'minor', `Session ${item.id}`), node('p', '', `Key: ${item.virtual_key_id}`), node('p', '', `Served by: ${item.provider}`))
    if (item.primary_provider !== undefined) detail.append(node('p', '', `Originally requested: ${item.primary_provider}`))
    detail.append(node('p', '', `${format(item.requests)} requests · ${format(item.input_tokens)} input tokens · ${format(item.output_tokens)} output tokens · ${format(item.violations)} violations`))
    // Absence differs from an explicitly empty firewall value.
    for (const [key, label] of Object.entries({ firewall_outcome: 'Outcome', firewall_stage: 'Stage', firewall_policy: 'Policy', firewall_incomplete_reason: 'Incomplete reason' })) {
      if (Object.hasOwn(item, key)) detail.append(node('p', 'minor', `${label}: ${item[key] === '' ? '(empty)' : item[key]}`))
    }
    if (!item.logs.length) detail.append(node('p', 'minor', 'No request/response logs recorded.'))
    item.logs.forEach((log, index) => {
      const entry = node('details', 'log-entry'); entry.append(node('summary', '', `Request / response ${index + 1}`))
      for (const [key, label] of Object.entries({ request: 'Request', response: 'Response', attrs: 'Attributes' })) {
        if (!Object.hasOwn(log, key)) continue
        entry.append(node('h4', '', label), node('pre', '', typeof log[key] === 'string' ? log[key] : JSON.stringify(log[key], null, 2)))
      }
      detail.append(entry)
    })
    card.append(detail); return card
  }
  async function loadSessions(version, cursor = '') {
    const requestVersion = ++sessionGeneration
    message(sessions, 'Loading sessions…'); pages.replaceChildren()
    try {
      const page = await read('sessions', cursor)
      if (!root.isConnected || version !== generation || requestVersion !== sessionGeneration) return
      if (!validPage(page) || page.data.length > 25 || ['next_cursor', 'prev_cursor'].some(key => page.meta[key] != null && (typeof page.meta[key] !== 'string' || encodeURIComponent(page.meta[key]).length > 1024))) throw Error('ARC returned an unreadable session page. Refresh to restart pagination.')
      if (page.preview === true) { message(sessions, 'Local preview · session logs are available after connecting to ARC.'); return }
      for (const item of page.data) {
        if (!item || ['id', 'virtual_key_id', 'model', 'provider', 'created_at'].some(key => typeof item[key] !== 'string') || !Number.isFinite(Date.parse(item.created_at)) || ['requests', 'input_tokens', 'output_tokens', 'violations'].some(key => !number(item[key])) || typeof item.firewall_enabled !== 'boolean' || !Array.isArray(item.logs) || item.logs.some(log => !log || typeof log !== 'object')) throw Error('ARC returned an invalid session record. Refresh to try again.')
      }
      sessions.replaceChildren(...page.data.map(sessionCard))
      if (!page.data.length) message(sessions, 'No sessions recorded in this range.')
      for (const [key, label] of [['prev_cursor', 'Previous page'], ['next_cursor', 'Next page']]) {
        const button = node('button', 'secondary', label); button.disabled = !page.meta[key]; button.onclick = () => loadSessions(version, page.meta[key]); pages.append(button)
      }
      pages.append(node('span', 'minor', `${page.data.length} sessions on this page${number(page.meta.total) ? ` · ${format(page.meta.total)} matching` : ''}`))
    } catch (error) { if (root.isConnected && version === generation && requestVersion === sessionGeneration && error.name !== 'AbortError') showError(sessions, error.message) }
  }
  function refresh() {
    if (!form.reportValidity()) return
    controller?.abort(); controller = new AbortController(); const version = ++generation
    const to = new Date(), from = new Date(to.getTime() - Number(form.elements.range.value) * 3600000)
    filters = { key: form.elements.key.value.trim(), from: from.toISOString(), to: to.toISOString() }
    $('#activity-range', root).textContent = `${filters.from} — ${filters.to} · UTC${filters.key ? ` · key ${filters.key}` : ' · all keys'}`
    loadMetrics(version); loadSessions(version)
  }
  form.onsubmit = event => { event.preventDefault(); refresh() }
  $('#refresh').onclick = refresh
  refresh()
}
