# ARC playground

A small chat demo built with **Pulse Native on Fastly Compute**. ARC owns provider credentials, model routing, policy enforcement, metering, and failover.

- Chat with a top persona selector, a bottom model selector, and formatted responses.
- A simple empty-chat overview: Chat → Fastly Compute → ARC → AI provider.
- Local demo users with up to 10 assigned virtual keys each. Each key selects one provider and one model; the server resolves both the model and credential.
- Password-protected admin for user CRUD, read-only provider/model/connection discovery, paginated ARC key listing, key creation, and key rotation.
- Per-key policy editor for RPM/TPM, UTC expiry, AI Firewall, ARC spend-limit flag, and ordered failover, with independent saves.
- Virtual credentials remain server-side. Neither public nor authenticated admin responses return their values.
- The same native Compute service serves the UI and API.

**Release preparation:** Pass 2 adds the policy editor and PATCH/PUT routes ahead of the next Pulse release. Packages remain pinned to `1.0.0-beta.5`; its public TypeScript fetch signature rejects these two verbs. This draft must receive the synchronized Pulse dependency update and pass all gates before merge. General key metadata editing and deletion remain pass 1 follow-ups; Activity remains pass 3.

![ARC chat playground](docs/screenshots/chat.png)

[Admin screenshot](docs/screenshots/admin.png) · [Mobile screenshot](docs/screenshots/mobile.png)

## Try locally

Requires Node 22.14+ on the 22.x line or Node 24.x.

```sh
npm ci --ignore-scripts
npm run doctor
npm test
npm run dev
```

Open `http://127.0.0.1:8787`, then `/admin` with **`local-admin-only`**. Local fixtures include two users and two model-scoped keys. Alex can use both; Sam starts with one. Preview chat responses are visibly simulated. User CRUD and assignments work locally. Key creation and rotation return a clear setup message in preview mode and never call ARC. Restarting the dev process restores the fixture state.

## Connect ARC and deploy

1. Configure provider connections in Fastly ARC. This app discovers existing providers, models, and connections; it does not create them. Choose a model supporting the gateway's OpenAI-compatible chat-completions API.
2. Link these resources to your Compute service. Names must match `.pulse/config.ts`:

   | Resource | Name | Contents / destination |
   | --- | --- | --- |
   | Config Store | `arc_config` | `ARC_MODE=live` |
   | Secret Store | `arc_secrets` | `ADMIN_PASSWORD` and `FASTLY_API_TOKEN` |
   | KV Store | `arc_state` | Initially empty |
   | Backend | `arc_gateway` | `https://arc.fastly.app` |
   | Backend | `fastly_api` | `https://api.fastly.com` |

   Set TLS, SNI, and host override to each backend's hostname. Dynamic backends are disabled. Management requests use `Fastly-Key` with the server's API token, following [Fastly API authentication](https://www.fastly.com/documentation/reference/api/#authentication). The token needs access to ARC in the account. Gateway requests use the selected virtual key as a Bearer token. Provider API keys stay in ARC.

3. Run `npm run build` to produce `dist/bin/main.wasm`. To deploy, install/authenticate the Fastly CLI, set `service_id` in the root `fastly.toml` for your service, and run `npm run deploy`. The manifest builds and stages the Wasm; it does not provision or link stores and backends. `npm run build` does not deploy.
4. Open Admin. Create a virtual key using the discovered provider/model choices, or rotate an existing ARC key to capture its new credential. ARC returns the token only on creation/rotation. Rotation invalidates its previous token everywhere it is used.
5. Add a local user and assign ready keys. Return to chat and select that user. The model selector contains only that user's locally available keys.

The gateway URL is fixed to `https://arc.fastly.app/v1/chat/completions`; the management base is `https://api.fastly.com/ai-runtime-control/v1`. `ARC_URL` is no longer used. Live requests never fall back to a simulated answer. No live-account or deployment validation has been performed.

## Key policies

Open **Virtual keys → Policies** for an existing key. Key creation stays small; all policy controls, including the update-only spend-limit flag, are configured after creation.

- RPM and TPM accept positive whole numbers. Clearing a limit sends `null`; unchanged fields are omitted from PATCH.
- Expiry is explicitly entered in UTC. Clearing it removes expiration. ARC validates the RFC 3339 timestamp.
- AI Firewall has an enabled flag and `log`, `block`, or `replace` action. Disabling it preserves the configured action unless changed explicitly.
- Spend control exposes only ARC's boolean flag. The supplied API has no dollar amount, currency, or reset-period fields.
- Failover uses existing provider connection IDs in displayed retry order. Move targets up/down, add/remove them, and choose timeout, upstream-provider 429, and provider 5xx triggers. There is no replacement-model field.

**Save key policy** sends a partial PATCH; **Save failover** sends a complete PUT containing the ordered targets and all trigger flags. Each section reports its own result. A successful key policy save remains successful if failover fails. Failed requests are never automatically retried; reload the affected section to resolve an uncertain outcome.

Failover 404 means the feature is unavailable for the account **or** the key was not found. A failed or incomplete policy read exposes no save form, so it cannot accidentally replace an unknown policy with empty defaults. Existing targets whose connections are missing from discovery remain visible and preserved. Saving an empty target list requires confirmation when replacing existing targets.

Preview reads are illustrative and writes are disabled. Policies live in ARC, and these endpoints never modify KV credentials or user assignments. The browser requests all metadata without caching; successful policy reads pass through ARC's metadata-only response and its headers.

[Policy editor](docs/screenshots/policies.png) · [Mobile policy editor](docs/screenshots/policies-mobile.png)

## State and key lifecycle

KV contains two independent documents:

- `users-v2`: local personas with name, active flag, and assigned ARC key IDs. Only this document is replaced by user CRUD.
- `credentials-v2`: server-owned key metadata and credentials. Only key creation/rotation writes it. There is no credential-read or whole-settings-write endpoint.

The former `settings` document is deliberately ignored: its manually entered tokens cannot be safely mapped to ARC resource IDs or model scopes. Recreate personas and create/rotate the desired ARC keys after upgrading. The old document can then be removed using Fastly's KV tooling. The old `/api/admin/settings` API is retired.

Credentials are stored in KV for this demo, with up to 100 local entries. User state is bounded to 30 personas and 10 assignments each. Writes are last-write-wins and KV is eventually consistent; use one admin operator. Requests already in flight may complete using an older credential. The app checks assignments again for every chat request.

Before rotating, the app clears the local credential and saves that state. If preparing rotation fails, it does not call ARC. If ARC or the subsequent save fails, the key is unavailable locally; refresh and rotate again to recover. If creation succeeds remotely but storage fails, the error names the key ID and instructs rotation, avoiding duplicate creation. Mutations are never automatically retried.

Key list metadata comes from ARC, with a local readiness flag. Existing ARC keys whose credentials were never captured require rotation. A model/provider mismatch against stored metadata also shows as needing rotation. Changes made outside the demo can make cached chat metadata stale; ARC remains authoritative and may reject the request. Refresh and rotate to synchronize it. Local user deletion or disabling does not revoke an ARC key.

The admin password lives only in page memory. App-generated admin and public metadata responses use `no-store`; successful policy reads preserve ARC’s response headers. The public user selector is demo impersonation, not authentication; chat is available to anyone who can reach the service.

## Chat behavior

Conversation history is stored per user in browser-tab `sessionStorage`. Up to 20 messages, 8,000 characters each, and 24,000 characters total are forwarded. New conversation resets that user's context. The local session UUID is not forwarded; ARC session attribution remains deferred and does not block chat.

Requests are buffered, non-streaming, with a 25-second upstream timeout. The adapter sends `{ model, messages, stream: false }` and expects text in `choices[0].message.content`. It does not assume every provider supports that wire format. Responses show model, elapsed time, and token usage only when returned. Markdown renders as a safe subset without raw HTML.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /`, `GET /admin`, `GET /app.css`, `GET /app.js` | Embedded UI |
| `GET /health` | Health response |
| `GET /api/bootstrap` | Active users and their assigned, locally available model keys |
| `POST /api/chat` | Authorize assignment, resolve credential/model, call ARC |
| `GET/PUT /api/admin/users` | Read/replace local users and assignments |
| `GET /api/admin/catalog` | Discover ARC providers, models, and connections |
| `POST /api/admin/keys/list` | List keys with local readiness and next cursor |
| `POST /api/admin/keys` | Create an ARC key and save its credential |
| `POST /api/admin/keys/:id/rotate` | Rotate an ARC key and save its replacement |
| `GET/PATCH /api/admin/keys/:id/policy` | Read key metadata / update policy fields |
| `GET/PUT /api/admin/keys/:id/failover` | Read / replace ordered failover policy |

All admin routes require `Authorization: Bearer <ADMIN_PASSWORD>`. Key listing accepts `{ cursor: "" }` for the first page; subsequent cursors must be percent-encoded by the caller. Key credentials and the management token are never part of these response contracts.

## Checks

```sh
npm run assets
npm run typecheck
npm test
npm run test:policies
npm run build
VICEROY_BIN=/path/to/viceroy npm run test:native
```

Pulse packages remain pinned to the published `1.0.0-beta.5` release. `public/` is frontend source; `scripts/embed-assets.mjs` generates static routes. Edit source assets, not generated files. See [validation](docs/validation.md) for executed checks and the pending release gate.
