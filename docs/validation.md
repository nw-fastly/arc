# ARC validation

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

General key metadata editing/deletion remain pass 1 follow-ups. Activity remains pass 3. Existing root `fastly.toml`, deploy command, and static backend configuration are retained.

## Boundaries

No live ARC account request, deployment, provisioning, merge, or repository settings change. Supplied private API documents were used locally and are not committed. Policy behavior is verified against controlled responses matching those documents, not account-specific entitlements.

KV remains deliberately eventually consistent and last-write-wins for the demo. The new policy routes do not write KV. Key mutation outage behavior from pass 1 has not been fault-injected against real Fastly storage.
