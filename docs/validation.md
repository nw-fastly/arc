# Pass 1 validation

## Implemented

- Local persona CRUD and multiple key assignments, separate from credential storage.
- Read-only provider/model/connection discovery; cursor-based ARC key listing.
- ARC key creation and rotation with server-side credential capture and explicit recovery messages.
- Server-selected model and token; assignment checks on every chat request.
- Empty-chat overview, replacing the orbit/taglines and prompt suggestions.
- Existing root `fastly.toml` and `npm run deploy` retained; two static backends configured.

## Dependency blocker

`@pulse-compute/runtime@1.0.0-beta.5` restricts `PulseFetchInitBase.method` to `GET | HEAD | POST`. The same restriction is enforced by its runtime fetch validator and the Fastly provider contract. The latest npm release and upstream main inspected on 2026-10-02 still have this restriction.

ARC key PATCH and DELETE cannot be implemented within that contract. This draft PR leaves remote editing/deletion to Fastly, and remains incomplete against the original pass 1 scope. No method-override header, dependency patch, JavaScript fallback, or second backend has been introduced. Pass 2 will also require outbound PUT for failover policy replacement.

## Executed checks

- TypeScript typecheck.
- 29 focused Pulse Native fixture tests: authentication, old API retirement, redaction, user validation, assignment enforcement, unavailable credentials, message bounds, gateway status, management token requirement, create/rotate, mismatched rotation IDs, pagination, cursor validation, discovery, and preview behavior.
- Native Fastly build (`host: fastly`, `target: native`).
- Viceroy 0.21.0 against a controlled local HTTP origin: static assets, auth, discovery, creation, rotation, public/admin secret redaction, assignments, outbound management header, server-selected model/body, isolation of management and gateway credentials, stale user save after rotation, and inactive/unassigned user denial.

The harness uses the Fastly Native fixture ABI's `json` response field. The earlier `value` fixture spelling yields an empty origin body and is not evidence of successful structured response decoding.

- Chromium browser check against the compiled Wasm in Viceroy: four-step overview, per-user model selector, chat response, key creation and rotation, assignment changes, and 390px mobile layout. No browser page errors or horizontal overflow; screenshots updated.

## Boundaries

No live ARC account request, deployment, provisioning, merge, or repository settings change. The provided API documents were used locally and are not committed. Management authentication uses Fastly's documented `Fastly-Key` convention; account-specific access must be checked when connected.

KV is deliberately eventually consistent with last-write-wins documents. User writes cannot overwrite credentials, but simultaneous key mutations can race with one another; use one admin operator. Key mutation recovery paths are explicit in code; real Fastly KV outage behavior has not been fault-injected.
