import { defineConfig } from '@pulse-compute/pulse'
export default defineConfig((_scope) => ({
  pulse: { entry: 'src/index.ts', schema: 'src/schemas.ts', tests: 'tests/pulse.harness.ts', defaultProfile: 'fastly', strict: true },
  fastly: {
    host: 'fastly', target: 'native', outDir: 'dist',
    schemas: { maxBytes: 65536, contentTypePolicy: 'require-json' },
    dev: {
      port: 8787, networkFetch: false,
      config: { ARC_MODE: 'preview' },
      secrets: { ADMIN_PASSWORD: 'local-admin-only' },
      kv: { state: {
        'users-v2': { users: [{ id: 'alex', name: 'Alex Morgan', keyIds: ['demo-fast-key', 'demo-reasoning-key'], active: true }, { id: 'sam', name: 'Sam Rivera', keyIds: ['demo-fast-key'], active: true }] },
        'credentials-v2': { keys: [
          { id: 'demo-fast-key', name: 'Demo fast', provider: 'preview', model: 'demo-fast', value: 'preview-only' },
          { id: 'demo-reasoning-key', name: 'Demo reasoning', provider: 'preview', model: 'demo-reasoning', value: 'preview-only' },
        ] },
      } },
    },
    fastly: {
      bindings: { configStore: 'arc_config', secretStore: 'arc_secrets', kv: { state: 'arc_state' }, backends: { 'https://arc.fastly.app': 'arc_gateway', 'https://api.fastly.com': 'fastly_api' }, dynamicBackends: false },
      build: { name: 'arc-playground', description: 'ARC chat demo on Pulse Native' },
    },
  },
}))

