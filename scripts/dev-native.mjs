// Stateful local preview of the built Fastly Wasm. No real ARC calls.
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { resolveProject } = require('@pulse-compute/cli/project-config')
const { renderFastlyLocalConfig, inspectFastlyComputeLauncher, startFastlyComputeServe } = require('@pulse-compute/provider-fastly/testing/fastly-cli')

export async function startLocalPreview({ cwd = process.cwd(), port } = {}) {
  const project = resolveProject({ cwd })
  if (project.provider !== 'fastly' || project.target !== 'native' || project.dev.config.ARC_MODE !== 'preview') throw new Error('Local preview requires Fastly Native and ARC_MODE=preview in .pulse/config.ts.')
  const launcher = inspectFastlyComputeLauncher({ viceroyBinary: process.env.VICEROY_BIN || process.env.PULSE_VICEROY_BIN })
  const bindings = project.providerConfig.bindings
  const kvStores = Object.fromEntries(Object.entries(bindings.kv).map(([logical, physical]) => [physical, project.dev.kv[logical] || {}]))
  const folder = await mkdtemp(join(tmpdir(), 'arc-preview-'))
  try {
    await writeFile(join(folder, 'fastly.toml'), renderFastlyLocalConfig({
      configStores: { [bindings.configStore]: project.dev.config },
      secretStores: { [bindings.secretStore]: project.dev.secrets },
      kvStores,
    }), { mode: 0o600 })
    const server = await startFastlyComputeServe({ launcher, packageRoot: folder, wasmFile: resolve(project.outDir, 'bin/main.wasm'), host: '127.0.0.1', port: port ?? project.dev.port })
    let stopped = false
    return { ...server, stop: async () => { if (stopped) return; stopped = true; await server.stop(); await rm(folder, { recursive: true, force: true }) } }
  } catch (error) { await rm(folder, { recursive: true, force: true }); throw error }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startLocalPreview()
    console.log(`ARC local preview: ${server.baseUrl}\nSimulated responses. User changes persist until restart. Restart npm run dev after code changes.`)
    const stop = async () => { await server.stop() }
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    server.child.once('exit', async code => { await server.stop(); process.exitCode = code || 0 })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
