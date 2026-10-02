// Authoring tests only. Executes the actual TypeScript handlers with recorded
// effects, without claiming Pulse compilation or Fastly Native conformance.
// Schema decoding is intentionally left to the real Pulse Native harness.
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
class TestPulse {
  entries = []
  get(path, handler) { this.entries.push({ method: 'GET', path, handler }); return this }
  post(path, handler) { this.entries.push({ method: 'POST', path, handler }); return this }
  put(path, handler) { this.entries.push({ method: 'PUT', path, handler }); return this }
  patch(path, handler) { this.entries.push({ method: 'PATCH', path, handler }); return this }
  use(path, handler) { this.entries.push({ path, handler, middleware: true }); return this }
  mount(path, app) { for (const e of app.entries) this.entries.push({ ...e, path: (path === '/' ? '' : path) + e.path }); return this }
  error(handler) { this.onError = handler; return this }
}
function load(file) {
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const require = name => {
    if (name === '@pulse-compute/pulse') return { Pulse: TestPulse }
    if (name === '@pulse-compute/runtime') return { Router: TestPulse }
    if (name === './assets.generated.js') return { default: new TestPulse() }
    if (name.startsWith('.')) return load(resolve(dirname(file), name.replace(/\.js$/, '.ts')))
    throw new Error('Unexpected test import: ' + name)
  }
  vm.runInNewContext(js, { exports, require }, { filename: file }); return exports
}
export function createAuthoringApp({ state = {}, config = {}, secrets = { ADMIN_PASSWORD: 'test-admin', FASTLY_API_TOKEN: 'test-management' }, upstream = async () => ({ status: 200, json: {} }) } = {}) {
  const app = load(resolve('src/index.ts')).default, seen = [], writes = []
  async function dispatch({ path, method = 'GET', body, headers = { authorization: 'Bearer test-admin' } }) {
    let params = {}
    const ctx = {
      req: { headers: Object.entries(headers), json: async () => structuredClone(body) },
      param: name => params[name], config: { get: async name => config[name] }, secret: { get: async name => secrets[name] },
      kv: () => ({ get: async name => structuredClone(state[name]), put: async (name, value) => { writes.push({ name, value: structuredClone(value) }); state[name] = structuredClone(value); return true } }),
      json: (json, options = {}) => ({ status: options.status || 200, json: structuredClone(json), headers: options.headers || {} }),
      text: (text, options = {}) => ({ status: options.status || 200, text, headers: options.headers || {} }),
      fetch: (url, init = {}) => {
        const request = { url, ...structuredClone(init) }; seen.push(request)
        const operation = Promise.resolve().then(() => upstream(request)).then(r => ({ ...r, ok: r.status >= 200 && r.status < 300 }))
        operation.json = async () => structuredClone((await operation).json)
        return operation
      },
    }
    async function next(start = 0) {
      for (let i = start; i < app.entries.length; i++) {
        const e = app.entries[i], names = [], expression = e.path.split('/').map(part => { if (part === '*') return '.*'; if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)' }; return part }).join('/')
        const match = path.match(new RegExp('^' + expression + '$'))
        if (!match || e.method && e.method !== method) continue
        params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]))
        return await e.handler(ctx, () => next(i + 1))
      }
      return { status: 404, text: 'Not found' }
    }
    try { return await next() } catch (error) { if (app.onError) return app.onError(error, ctx, () => { throw error }); throw error }
  }
  return { dispatch, seen, writes, state }
}
