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
  after capture completes. It begins with `dry_run: true`; it validates evidence
  and writes a job summary without posting a PR comment.
- `.github/pulse-report-publisher.json` binds the expected profile, provider,
  dependency recipe, toolchain and exact capture-tooling revision. The capture
  workflow pins Node 24.18.0; its actual Node/npm identity must match this policy.
- Capture has only contents/actions read permissions. Publisher alone requests
  PR write permission. No additional secrets or cross-repository token are used.
- Comparison explicitly opts into the pinned internal beta.10 adapter for
  validation while the supported public interface in Pulse #503 awaits release.

Capture should execute on the installation PR before merge. The publisher can
only execute once its workflow and policy are on the default branch. After human
merge, use a fresh PR to check dry-run admission, then review a separate change
to `dry_run: false` before claiming live bot-comment delivery.

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

Installation prepared; hosted capture and comparison validation are pending.
Default-branch publisher admission and live bot-comment delivery are not yet
qualified. Broader RA-04 cases, including pnpm, monorepos, external forks and
stale-completion races, remain separate qualification obligations.
