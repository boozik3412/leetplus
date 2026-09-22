# Release-critical checks for Variant A

Status: source-only CI contract at base revision
`4136da468183c20e504ac8fdcf88edd9547f0ca5`. This document does not claim a
GitHub run, branch-protection update, admission, preparation, or production
change.

Variant A moves the three observed late-failure classes into identical Fast
and Full jobs. Pull requests receive them through `Fast CI`; the exact main
merge SHA receives them again through both existing main-push workflows. The
main admission remains authoritative: PR success is never reused as proof for
a different merge SHA.

## Canonical command contracts

[`scripts/ci/release-critical.mjs`](../../scripts/ci/release-critical.mjs) is
the sole workflow owner of these commands:

```text
application
  pnpm --filter database db:generate
  pnpm --filter api lint:ci:pilot-http-surface
  pnpm --filter api test:ci:pilot-http-surface

postgresql-assortment
  pnpm --filter database db:validate
  pnpm --filter database db:generate
  pnpm --filter database db:deploy
  pnpm --filter api test:integration:pilot-assortment-store-scope:pg
```

The PostgreSQL contract runs in its own parallel job against the pinned
PostgreSQL 16.14 service image and a clean `leetplus_ci` database. It keeps the
existing `PILOT_ASSORTMENT_SCOPE_PG_CONFIRM` acknowledgement and bounded
PostgreSQL lock and statement timeouts. Full `migration-smoke` retains every
other migration, ACL, role and Gate 1MT PostgreSQL check; only this exact
assortment command moves to the parallel job.

The application job generates the Prisma client before type-aware ESLint and
Jest. This prerequisite was previously inherited from the larger Full job;
installing dependencies alone does not generate it. Its failure blocks both
dependent checks, while a lint failure still permits the HTTP test to run and
report its own result.

The two application commands are independent. The helper runs both in one
bounded batch and reports every failure from that pass. PostgreSQL setup stays
ordered and stops after a failed prerequisite because later results would not
be meaningful. Every command writes separate stdout, stderr and exit JSON,
plus one aggregate summary. An `always()` upload preserves those receipts for
successful, failed and docs-only jobs under a workflow/run/SHA-bound artifact
name.

Both workflows expose the same stable check names:

- `Release critical pilot HTTP and fresh store scope`
- `Release critical PostgreSQL assortment isolation`

Each job checks out and verifies `CI_RELEASE_SHA`. For exact `L0_DOCS`, the
jobs return an explicit successful docs-only result without installing project
dependencies or running application/database commands. GitHub still starts the
declared PostgreSQL service before a job's steps, so the docs-only database
check has a small runner startup cost but no migration or test effect.

The Full release candidate keeps all former dependencies. Both critical jobs
are additional prerequisites of `Production-control candidate` and `Admitted
runtime and production-control handoff`; no critical failure can publish an
exact-main handoff. Existing `Release impact classification`, authority,
application, migration and artifact dependencies remain unchanged.

## Branch-protection proposal

Do not remove or rename the current requirements:

- `Release impact classification`
- `Fast authority root trust`
- `Fast application checks`

After a fresh pull-request run has produced successful checks at its exact head
SHA, add the two stable names above as GitHub Actions app-bound required checks.
Keep strict mode and administrator enforcement enabled and preserve every
existing context, app binding, review rule, push restriction and repository
ruleset.

The offline proposal helper accepts complete, freshly read protection and
check-run responses and writes a reviewable proposal only:

```text
node scripts/ci/propose-required-checks.mjs input.json new-proposal.json
```

`input.json` must contain the complete current protection response, every page
of check runs for the exact head SHA, and these additions:

```json
{
  "additions": [
    "Release critical pilot HTTP and fresh store scope",
    "Release critical PostgreSQL assortment isolation"
  ]
}
```

The helper requires the latest exact-head check for each name to be completed,
successful, and owned by the GitHub Actions app. Its result is
`PROPOSED_NOT_APPLIED`, preserves the current `strict` value and app bindings,
and includes a baseline digest. Immediately before any later update, re-read
the complete protection state and abort if that digest or any other protection
field changed. The coordinator owns the external GitHub proposal and any
eventual mutation.

## Verification and rollback

Run the local static contract before publishing a branch:

```text
node --check scripts/ci/release-critical.mjs
node --test scripts/ci/release-critical.test.mjs
node .github/scripts/test-release-impact-workflow.mjs
node .github/scripts/test-release-candidate-workflow.mjs
```

The test pins command order, exact checkout, docs-only success, the identical
Fast/Full job bodies, the clean PostgreSQL setup, and both additional Full
admission dependencies. It also rejects a return of the critical commands to
ad hoc workflow steps.

Rollback is a source revert of the two new jobs, their downstream dependency
edges, the shared helper/tests and this document. If branch protection has
already been updated, first land and verify that revert on an exact head SHA;
then use a separate reviewed protection proposal to remove only these two
checks. Never remove the checks while main still requires jobs that no longer
exist, and never weaken the retained legacy requirements to make a rollback
mergeable.
