// Optional browser regression check for the public UI with controlled API replies.
// Supply PLAYWRIGHT_MODULE and optionally CHROMIUM_BIN/CHROMIUM_ARGS.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
let pending
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store')
  if (req.url === '/api/bootstrap') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ mode: 'live', users: [{ id: 'alex', name: 'Alex Morgan', models: [{ id: 'key-1', model: 'test-fast', name: 'Fast' }] }] }))
  }
  if (req.url === '/api/chat') {
    let body = ''; for await (const part of req) body += part
    pending = { res, body: JSON.parse(body) }
    return
  }
  const file = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/app.css': ['app.css', 'text/css'] }[req.url]
  if (!file) { res.statusCode = 404; return res.end() }
  res.setHeader('content-type', file[1]); res.end(await readFile(new URL(`../public/${file[0]}`, import.meta.url)))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN || undefined, args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'] })
const context = await browser.newContext()
const answer = Array.from({ length: 65 }, (_, i) => `Response paragraph ${i + 1}: a longer answer should begin here, above the composer.`).join('\n\n')
function finish(body, status = 200) {
  assert.ok(pending, 'a chat request must be waiting')
  pending.res.statusCode = status; pending.res.setHeader('content-type', 'application/json'); pending.res.end(JSON.stringify(body)); pending = undefined
}
try {
  for (const [viewport, reducedMotion] of [[{ width: 1280, height: 900 }, 'no-preference'], [{ width: 390, height: 844 }, 'no-preference'], [{ width: 1280, height: 900 }, 'reduce']]) {
    const page = await context.newPage(), errors = []
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://fonts.googleapis.com/**', route => route.abort())
    await page.addInitScript(() => {
      const messages = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Earlier turn ${i + 1}\n\n` + 'A previous message stays in place while new replies arrive.\n\n'.repeat(7) }))
      sessionStorage.setItem('arc.chat.alex', JSON.stringify({ sessionId: 'browser-test', messages }))
    })
    await page.goto(base); await page.locator('#send:not(:disabled)').waitFor()
    const prompt = page.locator('#prompt'), conversation = page.locator('#conversation-scroll')
    const composerBefore = await page.locator('.composer-wrap').boundingBox()
    await page.evaluate(() => { window.firstTurn = document.querySelector('#messages').firstElementChild })
    await prompt.fill('First question'); await prompt.press('Enter')
    await page.getByRole('status', { name: 'Waiting for response' }).waitFor()
    assert.equal(pending.body.messages.at(-1).content, 'First question')
    await prompt.fill('My next draft')
    finish({ model: 'test/test-fast', choices: [{ message: { content: answer } }] })
    await page.locator('#send:not(:disabled)').waitFor()
    await page.waitForFunction(() => {
      const reply = document.querySelector('#messages article:last-child'), viewport = document.querySelector('#conversation-scroll')
      return Math.abs(reply.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16) < 2
    })
    assert.equal(await prompt.inputValue(), 'My next draft')
    assert.equal(await page.evaluate(() => window.firstTurn === document.querySelector('#messages').firstElementChild), true)
    assert.equal(await page.locator('#messages article:first-child').evaluate(el => getComputedStyle(el).animationName), 'none')
    const composerAfter = await page.locator('.composer-wrap').boundingBox()
    assert.ok(Math.abs(composerAfter.y - composerBefore.y) < 1, 'composer must not move as a long answer arrives')
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth), false)
    if (process.env.CHAT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHAT_SCREENSHOT_DIR}/chat-${viewport.width}-${reducedMotion}.png` })
    await conversation.focus(); await page.keyboard.press('Home')
    await page.waitForFunction(() => document.querySelector('#conversation-scroll').scrollTop < 2)
    await prompt.fill('Second question'); await prompt.press('Enter')
    await page.getByRole('status', { name: 'Waiting for response' }).waitFor()
    await conversation.evaluate(el => { el.scrollTop = 40 })
    await page.locator('#nav-link').focus()
    const readingPosition = await conversation.evaluate(el => el.scrollTop)
    finish({ choices: [{ message: { content: answer } }] })
    await page.locator('#send:not(:disabled)').waitFor()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.ok(Math.abs(await conversation.evaluate(el => el.scrollTop) - readingPosition) < 1, 'reply must not interrupt reading older turns')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'nav-link', 'response must not steal focus')
    await prompt.fill('Failed question'); await prompt.press('Enter')
    await page.getByRole('status', { name: 'Waiting for response' }).waitFor()
    finish({ error: 'Controlled failure' }, 502)
    await page.getByRole('alert').waitFor()
    assert.equal(await prompt.inputValue(), 'Failed question')
    assert.equal(await page.evaluate(() => window.firstTurn === document.querySelector('#messages').firstElementChild), true)
    assert.equal(await page.getByRole('status', { name: 'Waiting for response' }).count(), 0)
    assert.equal(await page.locator('#messages').getAttribute('aria-busy'), 'false')
    page.on('dialog', dialog => dialog.accept())
    await page.locator('#new-chat').click()
    assert.equal(await page.locator('#welcome').isVisible(), true)
    assert.equal(await page.locator('#messages article').count(), 0)
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`Chat browser checks passed: ${viewport.width}px, motion ${reducedMotion}.`)
  }
} finally {
  if (pending) { pending.res.end(); pending = undefined }
  await browser.close(); await new Promise(resolve => server.close(resolve))
}
