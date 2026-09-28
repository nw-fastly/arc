import { defineConfig } from '@pulse-compute/pulse'
export default defineConfig((_scope) => ({
  pulse: { entry: 'src/index.ts', schema: 'src/schemas.ts', tests: 'tests/pulse.harness.ts', defaultProfile: 'fastly', strict: true },
  fastly: {
    host: 'fastly', target: 'native', outDir: 'dist',
    schemas: { maxBytes: 65536, contentTypePolicy: 'require-json' },
    dev: {
      port: 8787, networkFetch: false,
      config: { ARC_MODE: 'preview', ARC_URL: 'https://arc.example.invalid/v1/chat/completions' },
      secrets: { ADMIN_PASSWORD: 'local-admin-only' },
      kv: { state: { settings: {
        users: [{ id: 'alex', name: 'Alex Morgan', tokenId: 'team', active: true }, { id: 'sam', name: 'Sam Rivera', tokenId: 'team', active: true }],
        tokens: [{ id: 'team', label: 'Demo team', value: 'preview-key', active: true }],
        models: [{ id: 'demo-fast', label: 'Quick thinker', provider: 'Preview', active: true }, { id: 'demo-reasoning', label: 'Deep thinker', provider: 'Preview', active: true }],
      } } },
    },
    fastly: {
      bindings: { configStore: 'arc_config', secretStore: 'arc_secrets', kv: { state: 'arc_state' }, backends: { 'https://arc.example.invalid': 'arc_backend' }, dynamicBackends: false },
      build: { name: 'arc-playground', description: 'ARC chat demo on Pulse Native' },
    },
  },
}))
