# Validation — 2026-09-27 (MDT)

Completed locally with Node 24.19.0 and the published, lockfile-pinned Pulse 1.0.0-beta.5 packages.

| Check | Result |
| --- | --- |
| `npm run doctor` | Native project compilation and Fastly profile accepted |
| `npm run typecheck` | Passed |
| `node --check public/app.js` | Passed |
| `npm test` | 17/17 focused Pulse cases passed |
| `npm run build` | Direct Fastly host-ABI Wasm built successfully |
| Native HTTP smoke | Passed using Viceroy 0.21.1 |
| Browser interaction | Passed using headless Chromium 133 and Playwright against the compiled Wasm in Viceroy |
| Visual inspection | Desktop 1440×1000 and mobile 390×844; chat, conversation, and admin layouts reviewed |

## Native artifact

- `dist/bin/main.wasm`: **189,031 bytes** (about 184.6 KiB), including the UI.
- SHA-256: `e173d90e21462793fbf66118d96f013312b2e2ba3fc76e340c40b2c87a4fbf49`.
- Imports are limited to `fastly_http_body`, `fastly_http_resp`, `fastly_secret_store`, `fastly_kv_store`, `fastly_http_req`, `fastly_config_store`, and `fastly_abi`.
- No Fastly JavaScript runtime, `pulse_host`, or WASI imports.
- Generated artifacts are ignored; reproduce using `npm ci --ignore-scripts` and `npm run build`.

The native smoke checks exact static asset bytes, missing/incorrect admin authorization, settings persistence across requests, public key redaction, outgoing bearer credentials and escaped JSON body, response passthrough, and denial after disabling a key. Its upstream is a controlled local HTTP fixture, **not** the live ARC service.

```sh
npm run build
VICEROY_BIN=/absolute/path/to/viceroy npm run test:native
```

The browser exercise completed a conversation, switched users and restored isolated history, checked incorrect/correct admin login, created/updated/deleted users, virtual keys, and models, confirmed that key values are masked in the table, locked admin, and checked mobile horizontal overflow. No JavaScript page errors were observed.

## Issue found and handled

The first Viceroy run exposed a Pulse beta.5 missing-header behavior: reading a nonexistent `Authorization` with `ctx.req.header()` produced a hostcall error and an empty response. Valid and incorrect supplied credentials behaved correctly; no admin data was returned without credentials. The app now reads the bounded header snapshot, which returns a deliberate 401 when authorization is missing. The native smoke verifies this path. Pulse itself was not modified.

Initial project setup also required generated asset **routes**, rather than imported runtime string constants, to satisfy Native module linking. The checked-in asset generator now produces that supported shape.

## Remaining external setup

- No Fastly service was provisioned, deployed, or activated.
- No live ARC/provider request was made. Confirm your account's full OpenAI-compatible endpoint and exact model IDs before enabling live mode.
- ARC session attribution is not claimed; the account's session field/header needs confirmation.
- CRUD registers keys in this app. Key issuance/revocation, routing and budget policy remain in Fastly ARC.

Screenshots are captured from the local preview running through compiled Native Wasm.
