# Pulse report workflow validation

This private project consumes the public `pulse-compute/report-action` reusable
workflows at reviewed commit `1859f9d749d9702fb0597e2b1eedda9b9bcedb57`. The
Pulse dependency baseline is beta.10. This is validation of report automation;
there is no consumer release tag or provider deployment.

## Installation

- `.github/workflows/pulse-reports.yml` discovers tracked Pulse projects on PRs
  and captures approved `main` pushes for future exact-baseline reuse. The
  Fastly Native profile uses the existing npm lockfile and ignored asset generator.
- `.github/workflows/pulse-report-publisher.yml` runs from the default branch
  after capture completes. Installation began with `dry_run: true`. After a
  successful default-branch dry run and human-reviewed enablement merge, it now
  uses `dry_run: false` to maintain the verified bot-owned PR comment.
- `.github/pulse-report-publisher.json` binds the expected profile, provider,
  dependency recipe, toolchain and exact capture-tooling revision. The capture
  workflow pins Node 24.18.0; its actual Node/npm identity must match this policy.
- Capture has only contents/actions read permissions. Publisher alone requests
  PR write permission. No additional secrets or cross-repository token are used.
- Comparison explicitly opts into the pinned internal beta.10 adapter for
  validation while the supported public interface in Pulse #503 awaits release.

Capture executed on the installation PR before merge. The publisher workflow
and policy are installed on the default branch. The enablement PR qualified
the trusted dry-run path before its merge: PR source could not enable its own
comment write. Live create/update behavior at the prior tooling pin passed
through a separate documentation-only PR after enablement.

## Standalone HTML download upgrade

The capture caller, publisher caller and trusted policy are updated together to
`1859f9d749d9702fb0597e2b1eedda9b9bcedb57`, the merged report-action download ergonomics
change. The PR presentation supplies separate `report.html`, `compare.html` and
`evidence.zip` links. HTML copies use GitHub's single-file unarchived upload;
the evidence ZIP retains JSON/HTML, checksums, capture metadata and the comparison
validation receipt. Full project/recipe/run/attempt identity in filenames avoids
matrix collisions. Publisher admission checks the raw HTML bytes against the
verified evidence manifest before linking them.

The source change passed 56 core tests, six installed-consumer integration cases
and all ten hosted CI jobs, including four actual standalone HTML downloads.
The reviewed merge has the same qualified source tree. Capture/publisher pins
and policy must agree; permission, setup, profile and Node/npm settings remain
the same. The changed tooling revision can require an exact baseline rebuild.

Before this PR is merged, the default-branch publisher still enforces its old
trusted capture revision. A PR capture using the new pin can therefore succeed
while that publisher rejects the revision mismatch. This is the expected upgrade
boundary, not authority for PR source to replace its own trusted policy. A fresh
completed capture after human merge activates the new comment presentation.

## Evidence and privacy

Retain source revisions, PR/run/attempt identity, artifact IDs, archive/file
hashes and raw logs only in this private repository or its private Actions
artifacts. Downloaded HTML may contain application details. Do not copy reports,
source, screenshots, raw logs, repository identifiers, URLs or consumer commit
SHAs into report-action's public qualification record. Shared results must be
anonymized and distinguish real hosted results from local or unrun checks.

Report/comparison artifacts and binding receipts expire after 30 days; capture
plans after 14 days. Downloads require access to this repository. Expired or
missing baseline evidence is rebuilt at the exact merge-base; integrity errors
must remain failures. This installation does not create permanent archives or
public report hosting.

## Upgrade and rollback

Review and update both workflow SHA pins and the publisher policy's capture SHA
together, confirm the actual capture toolchain, and qualify fresh evidence.
Changing the recipe or tooling SHA can require an exact baseline rebuild. Replace
the internal comparison adapter only after a supported Pulse release is tested.

To roll back, revert the installation commit or restore previously reviewed
workflow/policy pins together. Disable comment delivery by setting the publisher
back to `dry_run: true`; capture remains read-only. Do not mutate repository
settings or deploy/provision anything as part of report validation.

## Qualification status

The installation is merged. Its PR capture and comparison completed successfully
in [run 39912072721](https://github.com/nw/arc/actions/runs/39912072721), attempt 1,
for head `97445869b6e94c5eef1c28dad6f8593a964a81d9` and exact merge-base
`3c5eba8a68c31b6272908f5f634d807fe8268440`. Existing application checks also passed.

- Head artifact `12483296703`, archive SHA-256
  `ea8fa3290cd600fa546c73275163586dc2b7ef98f4ca720c63704cf2ea5f1117`.
- Comparison artifact `12483825227`, archive SHA-256
  `0aaa4d956f843066a37595e58b591a4df5eec4fd84ae887159cb8ef0804d6c5b`.
- Downloaded archives passed digest checks, bounded extraction, file inventories,
  exact source/run/attempt/recipe checks and comparison receipt admission. The
  comparison is compatible and binds seven evidence files. It rebuilt the exact
  baseline because no approved-push capture existed at that point.
- Actual capture Node `v24.18.0` and npm `11.16.0` match the trusted publisher
  policy. A deliberate comparison-file byte mutation was rejected; original
  bytes were restored and reverified.

## Retained baseline and default-branch dry run

The fresh [PR #15](https://github.com/nw/arc/pull/15) capture passed in
[run 39913114310](https://github.com/nw/arc/actions/runs/39913114310), attempt 1,
for head `6ccf54bc582e02d44f047fcbb47d5cdb8e191b33` and exact merge-base
`7cc43a5542fe41c15c4ffde10116673bc84e0244`. It reused the exact retained baseline
from [approved-push run 39912728042](https://github.com/nw/arc/actions/runs/39912728042),
attempt 1, instead of rebuilding. Comparison compatibility was `compatible`.

| Evidence | Artifact ID | Archive SHA-256 |
| --- | --- | --- |
| Head report | 12482779826 | `9820279ca509061ffd3b3450a45ee9b9e335ab9b3f553e4034b121a2de036458` |
| Comparison | 12483657520 | `1de4abdb391fadcb5d102fe21a13f2f02611025ccc6282c121474427d24b058c` |
| Retained baseline | 12483906018 | `c90e0c9bdc357f3c7d45c4b4bf2aef9aae19c3fc4e195513bbff36a19351b3b2` |

All three archives passed authenticated size/digest checks, bounded extraction
and production admission. Checks included file hashes, exact source/run/attempt
and recipe identity, comparison receipt, retained producer origin/current attempt,
and equality of retained baseline JSON/HTML to the comparison's base files.

The real default-branch publisher passed in
[run 39913315803](https://github.com/nw/arc/actions/runs/39913315803/job/120281062742)
from `7cc43a5542fe41c15c4ffde10116673bc84e0244`. Logs explicitly recorded
`REPORT_DRY_RUN: true` and `{"status":"dry-run","pullRequest":15}`; no PR
comment was created. Its proposed enablement could not affect that run's mode.
The enablement was subsequently merged by the owner.

## Live publisher checkpoint

The first documentation-only head in [PR #16](https://github.com/nw/arc/pull/16),
`1fafa4ac64105fefeaa9c4caf280c98445b40ec6`, passed capture/comparison in
[run 39915502052](https://github.com/nw/arc/actions/runs/39915502052), attempt 1,
against exact merge-base `3251432f6b07755e720ab24828037d8e4b2c4bc1`.

The enabled default-branch publisher passed in
[run 39915718681](https://github.com/nw/arc/actions/runs/39915718681/job/120288744770).
Its logs explicitly show `REPORT_DRY_RUN: false` and
`{"status":"created","pullRequest":16,"commentId":6359496509}`.
Authenticated PR comment state confirms exactly one owned comment from GitHub's
`github-actions[bot]` identity (ID 41898282, type Bot), with the correct head,
run/attempt, exact merge-base and separate head/comparison archive links.
Its evidence state is `validation comparison: compatible`.

| Evidence | Artifact ID | Archive SHA-256 from GitHub |
| --- | --- | --- |
| Head report | 12485260795 | `714a1085a0daa3ecdbe6bc21561aa2645516ff30a1d0109f8c22f2f8a9288858` |
| Comparison | 12485016121 | `90278eac4d33cd3b8f95877b435034db10978df16ef32b2a555a5daceb2de7a3` |

The bot comment was created with ID `6359496509` at `2026-10-23T07:07:23Z`.
These raw bindings stay here and are not copied into the public qualification
record. The second documentation head `a84a8b79714c80c736a40b7ea559520adcd5e3ce`
passed [capture run 39915900553](https://github.com/nw/arc/actions/runs/39915900553),
attempt 1. [Publisher run 39916178402](https://github.com/nw/arc/actions/runs/39916178402/job/120290143901)
completed successfully with `{"status":"updated","pullRequest":16,"commentId":6359496509}`.
Authenticated comment state confirmed the same ID/creation timestamp and an
updated timestamp of `2026-10-23T07:11:53Z`, the new head/run/attempt and matching
report/comparison artifact links. Exactly one owned comment remained. Both
comparison states were compatible. This proves prior-pin live creation/update;
it does not claim activation of the standalone download upgrade before merge.

## Remaining qualification

These automation/documentation changes do not qualify application runtime
behavior or performance. Prior-pin live bot-comment creation/update is confirmed.
The current checkpoint is the standalone-download pin upgrade and its subsequent
default-branch publication. Offline browser interaction remains unverified: this workspace had
no Chromium executable and its attempted browser download failed. Broader RA-04
cases, including pnpm, monorepos, external forks and stale-completion races,
remain separate qualification obligations. A supported Pulse #503 release is
still required before replacing the validation shim and releasing the action.
