# Pulse report workflow validation

This private project consumes the public `pulse-compute/report-action` reusable
workflows at reviewed commit `0408c9c4393f9ba889c5f371ea803105535d31a5`. The
Pulse dependency baseline is beta.10. This is validation of report automation;
there is no consumer release tag or provider deployment.

## Installation

- `.github/workflows/pulse-reports.yml` discovers tracked Pulse projects on PRs
  and captures approved `main` pushes for future exact-baseline reuse. The
  Fastly Native profile uses the existing npm lockfile and ignored asset generator.
- `.github/workflows/pulse-report-publisher.yml` runs from the default branch
  after capture completes. Installation began with `dry_run: true`. The follow-up
  enablement PR proposes `dry_run: false`; until that PR is merged, the trusted
  default-branch workflow continues to validate without posting a PR comment.
- `.github/pulse-report-publisher.json` binds the expected profile, provider,
  dependency recipe, toolchain and exact capture-tooling revision. The capture
  workflow pins Node 24.18.0; its actual Node/npm identity must match this policy.
- Capture has only contents/actions read permissions. Publisher alone requests
  PR write permission. No additional secrets or cross-repository token are used.
- Comparison explicitly opts into the pinned internal beta.10 adapter for
  validation while the supported public interface in Pulse #503 awaits release.

Capture executed on the installation PR before merge. The publisher workflow
and policy are now installed on the default branch. The enablement PR is also
the fresh dry-run qualification input: the publisher reads its mode and policy
from the trusted default branch, so the PR cannot enable its own comment write.
Review the completed dry-run admission before merging enablement; live
bot-comment delivery still requires a subsequent completed PR capture.

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

These automation/documentation changes do not qualify application runtime
behavior or performance. Fresh approved-push retention, default-branch publisher
dry-run admission, offline browser interaction and live bot-comment delivery
remain to be verified. Broader RA-04 cases, including pnpm, monorepos, external
forks and stale-completion races, remain separate qualification obligations.
