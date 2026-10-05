# ARC validation

## Pass 3: Activity

Read-only Activity adds time/key filters, request/session/input/output totals and paginated session logs with provider and firewall metadata. Refresh fixes a new UTC window and resets pagination. Raw logs render as text, are not persisted, and leave the DOM when admin is locked. Metrics and sessions have separate loading, empty and error states; preview is explicit. Successful bodies and headers pass through from ARC, preserving optional firewall fields and arbitrary log attributes.

Executed checks:

- Typecheck and Native Fastly build passed.
- **48/48 Native harness cases passed**, including activity authentication, preview, invalid filters, missing token, resource allowlist, live metrics, encoded cursors and access denial.
- **6/6 focused handler tests passed** for fixed GET endpoints, exact filters, injection rejection, independent/sanitized failures, preview and no KV writes.
- Viceroy smoke passed with the compiled artifact, actual outgoing activity GETs, filter/cursor forwarding, response cache-header preservation and existing chat/key/policy checks.
- Chromium against that **Native artifact** passed totals aggregation, stable-range pagination, refresh reset, key filtering, absent versus empty firewall outcomes, inert HTML in logs, independent 403/429 failures, malformed metrics, empty and preview states, mobile overflow and lock cleanup.

Reproduce with `npm run test:activity`, `npm run typecheck`, `npm test`, `npm run build`, then `VICEROY_BIN=/path/to/viceroy npm run test:native`. Optional browser evidence: `VICEROY_BIN=/path/to/viceroy PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/activity.browser.mjs`.

No live ARC account calls or deployment. Activity responses follow the supplied API contracts; account entitlement, data retention and real-world logging availability remain upstream concerns.

## Pass 2: key policies

Implemented an authenticated policy router and a two-section admin editor:

- Partial PATCH for RPM/TPM, nullable expiry, firewall enabled/action, and the update-only ARC spend-limit flag.
- Full PUT for ordered provider-connection failover targets and all three triggers.
- Independent read/save states and errors. Unavailable or malformed failover reads never become editable empty defaults.
- Explicit UTC input, duplicate-target validation, target reordering, preservation of undiscovered existing connections, and confirmation before removing all targets.
- Read-only preview controls; no policy writes to local KV or credentials.

### Executed checks

- **39/39 Pulse Native fixture harness cases passed.** Coverage includes the original pass 1 cases plus policy auth, nullable/false updates, numeric validation, schema rejection, read-only preview, feature 404, empty failover replacement, and duplicate targets. Schema decode failures use the app's existing sanitized 502 error boundary; domain validation returns 400.
- **10/10 authoring tests passed**, executing the actual TypeScript handlers with recorded effects. These additionally assert exact outgoing methods, URLs, bodies and headers; omission versus null/false; target order; independent failures; no KV mutation; no automatic retries; and update-only spend control. The test adapter is not a production runtime or a substitute for Pulse schema decoding.
- **Native Fastly build passed.** The app remains `host: fastly`, `target: native`.
- **Viceroy 0.21.0 smoke passed** against a controlled local origin. It verifies actual outgoing PATCH and PUT, policy readback, target order, a failing failover save after a successful key-policy update, and continued use of the rotated credential. Pass 1 asset/auth/discovery/create/rotate/chat assertions also pass.
- **Chromium policy checks passed** against the authoring fixture server: unchanged fields omitted, explicit removal, UTC conversion with browser timezone America/Denver, spend toggle, firewall disabling, ordered failover, missing-connection preservation, failed save isolation, duplicate target rejection, full removal, unavailable feature, and 390px layout. No page errors or horizontal overflow. Updated policy screenshots are committed.
- JavaScript syntax and whitespace checks passed.

### Native fetch typing compatibility

The pinned `@pulse-compute/runtime@1.0.0-beta.5` fetch declaration only lists `GET | HEAD | POST`, although the Native compiler and generated Fastly artifact execute PATCH/PUT successfully. `src/pulse-native-fetch.d.ts` adds an overload limited to schema-backed JSON PATCH/PUT requests. It retains the upstream header, timeout, body-exclusion and effect return types; the original fetch signature remains available. There are no suppressed errors, runtime casts, dependency patches or disabled checks.

`npm run typecheck` passes with this compatibility declaration. This is specific to ARC's Native target, not a claim of JavaScript runtime support. Remove the declaration when the upstream fetch types support these verbs, updating the direct Pulse packages and lockfile together and rerunning typecheck, harness, build and Viceroy.

### Reproduce

```sh
npm run test:policies
npm test
npm run build
VICEROY_BIN=/path/to/viceroy npm run test:native
npm run typecheck
```

Optional browser check (Playwright and Chromium supplied separately):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/policies.browser.mjs
```

## Pass 1 baseline

PR #3 introduced local personas and multi-key assignments, discovery, paginated key listing, ARC key creation/rotation, credential separation, and the chat overview. Its 29-case harness, typecheck, Native build, Viceroy, and chat/admin browser checks passed at that point. Pass 2 expands the same harness and Native smoke.

General key metadata editing/deletion remain pass 1 follow-ups. Activity is covered by pass 3 above. Existing root `fastly.toml`, deploy command, and static backend configuration are retained.

## Boundaries

No live ARC account request, deployment, provisioning, merge, or repository settings change. Supplied private API documents were used locally and are not committed. Policy behavior is verified against controlled responses matching those documents, not account-specific entitlements.

KV remains deliberately eventually consistent and last-write-wins for the demo. The new policy routes do not write KV. Key mutation outage behavior from pass 1 has not been fault-injected against real Fastly storage.

## Terraform infrastructure

Added a separate infrastructure root with pinned Fastly provider 9.6.0, Compute
service, TLS backends, linked Config/Secret/KV Stores and `ARC_MODE=live`.
Terraform leaves service versions inactive; the existing CLI deploy owns the
package and activation. Secret values and app state are not Terraform inputs.

`terraform fmt -check` passed. The provider archive was downloaded and its SHA256
verified against the registry metadata; the lockfile includes official release
ZIP checksums for other platforms. Provider initialization via a local mirror
succeeded after the normal registry checksum fetch timed out. Local
`terraform validate` could not load the provider because this execution
environment forbids its Unix socket (`operation not permitted`). A credential-free
GitHub workflow runs fmt, init and validate. No account plan, apply or deployment
was run; DNS and downstream TLS are explicitly outside this configuration.

## Stateful local preview and Domain Management — 2026-10-05

- On beta.6, the diagnostic `pulse dev` runner returned the seeded users but
  discarded a successful user PUT before the next GET. The exact browser
  iterable errors were not reproduced on a clean Linux checkout.
- `npm run dev` now builds and launches Fastly Wasm with the Fastly CLI/Viceroy,
  using the existing preview seeds and bindings from `.pulse/config.ts`. User
  changes survive requests/refreshes and reset on process restart. No live ARC
  requests are enabled. Code changes require a restart.
- The browser rejects missing/non-array user, key, and catalog lists, and
  surfaces error payloads even with HTTP 200. It does not silently replace
  malformed user data with an empty editable list.
- Passed: typecheck, 48 Pulse harness cases, four browser API-boundary cases,
  native build, the stateful local-preview CRUD/chat test, and the existing
  Native Viceroy smoke test (Viceroy 0.21.1).
- Terraform replaces the classic nested domain block with `fastly_domain`,
  supported by the pinned provider 9.6.0. Formatting passed. The official
  Linux provider archive matched a checksum already in the lockfile. Local
  schema validation could not start its plugin because this workspace denies
  Unix sockets; the Terraform CI workflow performs provider validation.
- No browser automation, account plan/apply, provisioning, or deployment was
  performed. Partial-apply recovery and existing-domain import are documented
  in `terraform/README.md`.

## Empty live ARC lists — 2026-10-05

- The user reported a key-list response with `data: null` and
  `meta: { limit: 100, sort: "created_at", total: 0 }`. The previous native
  build reproduced the misleading key-list 502 against that exact payload.
- Nullable key/provider/connection list schemas now preserve explicit null,
  and handlers normalize it to empty arrays. Missing data remains an error.
  The first key-list request also omits the empty cursor parameter.
- Passed: typecheck, 52 Pulse harness cases, native build, and Native Viceroy
  smoke (0.21.1), including the reported null payload, empty catalog lists,
  missing-list rejection, and existing nonempty key CRUD/chat behavior.
- Native checks used controlled upstream fixtures. No live account request,
  browser automation, or deployment was performed for this fix.

## Gateway model routing — 2026-10-05

- Chat sent the raw stored model ID, while the live gateway reported that the
  model must include a provider prefix. A native fixture enforcing that rule
  reproduced the old build's HTTP 400.
- Chat now qualifies the model as `provider/model` using the selected key's
  stored metadata. It preserves an existing matching provider prefix and
  prefixes raw model IDs with their own namespace slash. Management metadata,
  credentials, and preview behavior are unchanged; no KV migration is needed.
- Passed: typecheck, 52 Pulse harness cases, native build, and Native Viceroy
  smoke (0.21.1). Native checks assert outbound model formatting for plain,
  already qualified, and namespaced model IDs and ignore a browser model
  override while retaining credential/assignment checks.
- This uses the current native string contract's bounded character comparison;
  `String.startsWith` is not supported by beta.6 lowering. Native validation
  used controlled upstream responses; no live call or deployment was performed.
