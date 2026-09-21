# Battle Pass BALANCE_TOPUP replay — local gate journal

## E01 — direct TypeScript executable is unavailable in the new worktree

- Observed: `pnpm.cmd --filter api exec tsc --noEmit -p tsconfig.build.json`
  stopped before source compilation: `tsc is not recognized`.
- Cause: this clean isolated worktree does not expose a direct `tsc` binary to
  `pnpm exec`; no source, fixture, database, provider, or production state was
  changed by the failed local gate.
- Changed condition: inspect the API package's declared scripts and use its
  repository-owned typecheck/build entry point rather than installing a new
  dependency or retrying the unavailable binary.

## E02 — offline frozen install did not produce local executables

- Observed: the repository-standard `pnpm install --offline --frozen-lockfile`
  used the existing v10 store with zero downloads and exited successfully, but
  the subsequent declared API Jest command still reports that local
  `node_modules` and `jest` are missing.
- Cause: the isolated worktree install state is incomplete despite the
  dependency-resolution success output. No source, fixture, database, provider,
  or production state changed.
- Changed condition: inspect the local `.pnpm`/`node_modules` layout and the
  pnpm configuration before any install retry. Do not create symlinks or use a
  dependency tree from another worktree.

## E03 — focused Jest stopped before tests because Prisma Client is ungenerated

- Observed: after the offline dependency links became available, focused Jest
  loaded the suite but stopped at `@prisma/client` with `Cannot find module
  .prisma/client/default`.
- Cause: the isolated worktree does not yet have generated Prisma Client
  artifacts. This is a local package setup condition, not a source-test result;
  no production or fixture database was contacted.
- Changed condition: inspect the database workspace package and run only its
  repository-owned Prisma generate script, then retry the same focused suite.

## E04 — focused top-up apply test mock omitted the post-materialization intent

- Observed: after repository-owned Prisma generation, the focused replay suite
  ran 69 tests; 68 passed. The new top-up apply case stopped at the canonical
  postcondition because its test double still returned no reward intent after
  `processEvent`.
- Cause: the production path correctly re-reads the canonical intent after
  materialization. The fixture modeled only the two pre-effect absence checks.
  No source behavior, database, provider, or production state changed.
- Changed condition: make the test double return the expected single APPLIED
  rule-scoped intent only on the post-materialization lookup, then rerun the
  same focused suite.

## E05 — top-up fixture shadows the existing-intent factory

- Observed: the focused suite reached all new tests, but six stopped before
  service execution with `TypeError: existingIntent is not a function`.
- Cause: a local race-state variable in `createBalanceTopupService` shadows
  the existing reusable fixture factory when building the post-apply mock.
  This is test-only and caused no source/runtime effect.
- Changed condition: rename the local race-state variable, retaining the
  factory for the post-materialization APPLIED intent, then rerun the focused
  replay suite.

## E06 — post-apply intent fixture has an incompatible canonical plan

- Observed: after the fixture-name correction, focused Jest ran 69 tests with
  68 passing. The top-up apply assertion stopped because
  `assertExistingIntent` rejected the mock as an incompatible claim-key plan.
- Cause: the post-materialization mock did not preserve every canonical
  step-3 plan field that the production idempotency validator checks. Source
  validation is behaving as intended.
- Changed condition: inspect that validator and change only the test fixture
  to its exact expected plan shape, then rerun the same focused suite.

## E07 — post-apply fixture omitted the APPLIED intent status

- Observed: after aligning the plan and exact BALANCE_TOPUP event type, the
  same apply test stopped at the validator's supported-status check.
- Cause: the reconstructed fixture omitted `status: APPLIED`; the production
  validator correctly rejects an undefined status.
- Changed condition: add only the canonical APPLIED status to the post-apply
  mock and rerun the focused suite.

## E08 — API typecheck found two replay result-shape mismatches

- Observed: declared API typecheck reached source and rejected two locations:
  one exact canonicalization result lacked the newly required `amount` field,
  and one public replay result still declared `durationMinutes` non-null.
- Cause: the narrow top-up extension made replay fact metadata support both
  amount and duration, but two adjacent result projections retained the former
  play-time-only shape. No runtime or production effect occurred.
- Changed condition: update only those type/result projections to represent a
  nullable duration and optional amount consistently, then rerun typecheck.

## E09 — targeted lint found CRLF drift in patched TypeScript files

- Observed: broader gamification tests passed, but targeted ESLint reported
  only Prettier `Insert CRLF` errors throughout the two patched TypeScript
  files.
- Cause: patch application wrote LF lines into a CRLF-formatted repository
  file. This is formatting drift, not a semantic lint failure.
- Changed condition: run the repository-owned Prettier formatter only on the
  two changed TypeScript files, then rerun targeted lint and diff checks.

## B01 — strict lint baseline separated from changed-line validation

- After CRLF normalization, targeted ESLint left two newly introduced
  Prettier findings in the new fixture block and 34 strict TypeScript findings
  at unchanged legacy locations in the large replay spec. The two fixture
  findings were corrected without changing production behavior.
- The remaining 34 are outside the zero-context diff hunks against
  `ee2dcf3a2c8ee123de6189fa05966c425604c5a0`; they are recorded as existing
  lint debt and are not refactored in this narrow repair.
- Changed-code gates are Prettier check on both modified files, API typecheck,
  focused and broader replay/gamification tests, plus `git diff --check`.

## E10 — attestation hardening left one obsolete request-hash helper

- Observed: final changed-service lint found only `requiredSha256` unused in
  the replay service after client-supplied attestation hashes were removed.
- Cause: the server-derived attestation replacement made that helper dead.
  No runtime, fixture, provider, or production effect occurred.
- Changed condition: remove the unused helper, then rerun changed-service lint
  and whitespace checks before amending the local commit.
