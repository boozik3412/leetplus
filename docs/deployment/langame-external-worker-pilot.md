# Langame external daily worker: EZ GAME LIVE candidate

Status: application source candidate, **not scheduled or deployed**. The existing `langame-daily-worker`
grant, secret profile, container, timer and application code continue to serve
only the INTERNAL `demo` tenant. This candidate adds an independently
authorized daily path for the exact external tenant `set-1` / EZ GAME. The
operator must not retarget the existing INTERNAL grant or enable an API
scheduler to make the external run happen.

## Required behavior

The candidate updates permitted Langame business facts, catalog goods, current inventory and
guest foundation for the exact tenant and its persisted Store bindings.
The external child CATALOG/QUICK/INVENTORY jobs never advance the shared
IntegrationSource full cursor. One final daily FULL job summarizes all three:
its status is PARTIAL/FAILED if any component is unavailable, and it is
SUCCESS with one cursor advance only when all required reads are complete.
The settings projection excludes child QUICK/INVENTORY from EZ GAME's latest
fully successful source status.
Categories and club product configuration remain unavailable. A permission
denial on an individual data endpoint leaves other reads running; it is
reported as PARTIAL, not an empty SUCCESS. Unavailable data cannot certify
dependent snapshots, while independent permitted data remain stored and
visible with their actual date/coverage. Internal tenant and public guest
workers are not part of this pilot.

## Authority and scope

1. Dedicated external worker identity and timer, secret profile, signed grant,
   singleton lock and accepted active-release binding. The grant pins host,
   release, generation, exact tenant slug, profile hash, issue/expiry and mode.
   Its profile pins tenant ID, LIVE stage, profile/execution/Store revisions
   and exact source/Store IDs. Native control injects one UUID run ID and one
   frozen business date outside the signed static profile. A new grant is
   needed after application cutover. No
   wildcard tenant, all-active scan or shared service token is accepted.
2. A `CANARY` uses one explicit business date and never runs reward, activity
   recovery, retention or other game maintenance. That date limits dated sales,
   revenue and guest events; catalog, balances and inventory are current
   observations in both CANARY and TIMER. External inventory is always read
   under the once-only day intent, so a historical date cannot omit it and
   contradict the daily FULL aggregate/terminal. `TIMER` uses the previous
   completed business day, has bounded time and does not keep an explicit date
   in the static profile. A durable unique intent in the tenant audit table
   owns the exact tenant/source/Store/business-day, followed by one terminal
   result. Intent-only is ambiguous and forbids retry; a replayed terminal
   returns NO_NEW_EFFECT (exit75) with its original run ID. No TTL or blind retry.
   The same tenant/source/Store session-scoped PostgreSQL advisory lock is
   acquired before this intent and surrounds the entire worker tick. Manual
   business and guest import paths acquire that identical lock. Nested daily
   child calls inherit it; another process fails before provider work. The
   lock holds one verified TLS DB session without holding a transaction over
   provider calls. External worker Prisma pool is one connection, plus this
   lock session: total two. A lost session fails current authority checks.
3. Before and during each data scope, tenant execution admission is evaluated
   against current profile/execution revisions. Only `INTEGRATIONS`,
   `ASSORTMENT` and `STAFF` require `OUTBOUND`; `GAMIFICATION` requires `WRITE`
   for imported facts but stays `OUTBOUND=false` so the bonus-ledger path does
   not gain provider authority. The dedicated worker requires `ACTIVE + LIVE` and exact persisted
   source/Store bindings. Fresh Langame club discovery must still validate
   those bindings; a failed scope check stops before provider data writes.
   Source/Store ownership is never inferred from the INTERNAL `demo` tenant.
   Langame club discovery and source/Store mutations also recheck the exact
   authority. Computer count writes require the exact active Store/source/
   revision and ignore foreign club IDs. The signed tenant transition locks
   tenant, source and Store rows before checking the plan preimage.
4. Each tenant result is isolated. The worker records terminal SUCCESS,
   PARTIAL or FAILED per scope/day. It keeps provider and DB errors separate,
   never advances full-source cursors on a partial read, and never marks a
   dependent snapshot complete when its inputs are incomplete.
5. Timer activation is a separate native, signed production operation after
   exact-source CI, independent review, restored-copy rehearsal, canary and
   fresh backup. No production effect is authorized by this document, a PR,
   local tests or an earlier GO.

## Checkpoints

- Read-only production check 27.09 09:16 UTC: EZ GAME is `ACTIVE/PILOT` but
  onboarding is still `ONBOARDING`, its trial expired 26.09, and `OUTBOUND`
  is disabled for every current module entitlement. `executionRevision=2`.
  Its one active Store is bound to club `1`; a second unbound Store is inactive.
  The existing signed daily grant remains `demo`, generation `10`. The owner
  selected the LIVE stage. The current generic entitlement-profile endpoint
  rejects both stage transitions and any outbound enablement. This source
  candidate adds a dedicated, audited tenant/Store-scoped prepare/apply/revoke
  workflow for the exact network; it is not installed or authorized in prod.
  It must be reviewed and separately authorized before this worker
  can pass its first admission check. No tenant data was changed by this read.

- Current installed Compose control recognizes exactly two worker grants and
  only one `langame-daily-worker` tenant slug. The application worker entrypoint
  in this candidate is dormant: there is no Compose service, signed external
  grant, independent timer, or continuation contract for it yet. A new external
  timer/container requires a versioned controller grant/worker-continuation successor. Merely
  changing `LANGAME_DAILY_WORKER_TENANT_SLUG` would stop INTERNAL daily sync
  and fail its signed grant; changing app policy alone does not schedule a job.
- The external tenant must have current outbound module entitlements and a
  valid execution revision. Failure to prove either is a HOLD, not a reason to
  reuse the INTERNAL permit.
- Acceptance needs exact read-only pre/post counts, dates and Store bindings
  for `1171.langame.ru`; one bounded live canary and a later natural timer tick
  must show the same tenant, no cross-tenant writes, no duplicate facts, and
  separate PARTIAL coverage for denied sections.

## Source candidate limits

The dedicated CLI pins one LIVE tenant and Store binding, checks profile,
execution and Store revisions, and disables unrelated maintenance. It uses the existing daily facts,
guest foundation and snapshot services. A partial catalog read retains goods,
then guest reads still run; dependent snapshots are skipped. The current daily
coverage enum has no PARTIAL value, so an incomplete source is recorded as
`FAILED` with detailed source counts/summary, and the worker exits nonzero after
available scopes complete if there was a real failed source or execution error.
Provider PARTIAL results carry `partial=true`, preserve their diagnostics, and
finish with aggregate `decision=PARTIAL` without throwing after the available
reads. They do not count as full daily coverage or permit dependent snapshots.
The separate controller successor and production installation/acceptance of
the tenant workflow remain required before a real timer is installed. The
source-only platform-admin workflow uses a reviewed exact set-1/source/Store
preimage digest, serializable CAS, complete module-profile replacement and
audit with request replay. It clears the expired trial fields on LIVE
activation and leaves Store background game execution disabled. Revoke turns
only the three worker outbound modules off; it remains available if the
Langame source or Store was deactivated.
[Exact LIVE/outbound preparation and signed operation](langame-external-worker-tenant-change.md).

## Production coordination

The owner routed this operation to Codex task `01a0d256-4519-7911-8ac4-b5c5f020d5ff`
(Диспетчер продакшна LeetPlus). It registered queue revision154:

- `INTAKE-LANGAME-EXTERNAL-WORKER-SET1-20260927`: source-only VALIDATING;
- `CONTROL-LANGAME-EXTERNAL-WORKER-SUCCESSOR-20260927`: BLOCKED prerequisite;
- `TENANT-LANGAME-SET1-LIVE-OUTBOUND-20260927`: BLOCKED prerequisite.

The dispatcher reports the accepted serving controller as A `b0cbf3a4`
(controller-only acceptance 25.09), application GREEN `f97`/generation10 and
data399/CURRENT191. Its report supersedes the older controller checkpoint in
the security document but is not a fresh installed-state proof for this
candidate. This source task owns no production effect. Before mutation the
dispatcher must prepare and verify fresh exact baseline, plan/GO and receipts.
Worker/provider/control changes use the full release path, not L1_APP_ONLY.
