# ARC demo

This is a deliberately small Pulse app, targeting native Fastly Compute.

- Keep `host: fastly`, `target: native`. Do not add a JavaScript fallback.
- Pulse owns requests, KV, secrets, config and fetch effects. Do not use ambient host APIs in handlers.
- `public/` is the frontend source; `scripts/embed-assets.mjs` generates route code. Do not edit generated assets.
- ARC owns provider keys, policies, metering and failover. This app is a demo client, not another ARC control plane.
- Preserve the distinction between local simulated responses and live ARC requests.
- Keep checks bounded: typecheck, the focused Pulse harness and a native build. Record separately any browser, Viceroy or live deployment checks actually performed.
- Open PRs for human review. Do not merge, deploy, provision resources, or change repository settings without explicit user direction.
