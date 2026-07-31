# Reward materializer: production rollout

This runbook covers the additive reward-materializer migration series from
`20260718150000_guest_game_origin_fallback` through
the expand migration `20260731090000_guest_game_case_reward_lifecycle` and its
separate contract migration
`20260731110000_guest_game_case_reward_contract`. Indexes on populated tables
are deliberately isolated into one-statement migrations so PostgreSQL can run
each `CREATE INDEX CONCURRENTLY` outside an implicit multi-statement transaction.

## Runtime semantics

- `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false` disables only the autonomous recovery scheduler. Inline LIVE reward processing remains enabled so the existing game pipeline does not stop during an OFF-first deploy.
- `GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH=true` is the global emergency stop. It prevents both inline and scheduled intent/effect claims while preserving queued rows for later recovery.
- Background processing is fail-closed unless one tenant is selected by `...TENANT_ID` or `...TENANT_SLUG`. `...ALLOW_ALL_TENANTS=true` is not permitted during canary.
- A rollback never deletes posting, intent, or effect rows. Disable the scheduler or enable the kill switch, revert the application, and fix forward.

Safe initial values:

```dotenv
GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false
GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH=false
GUEST_GAME_REWARD_MATERIALIZER_TENANT_ID=
GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG=
GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS=false
```

Use `KILL_SWITCH=true` only when pausing all new reward claims is intended.

## Before deployment

1. Stop the deployment timer and confirm that no deployment service is running.
2. Take a current database/VDS snapshot and confirm the restore owner.
3. Inspect `leetplus-api.service` with `systemctl show -p WorkingDirectory -p EnvironmentFiles -p ExecStart`. Do not print the complete environment.
4. Confirm the real deployment script builds API and web sequentially. Never run the root `pnpm build` on the VDS.
5. Build the API before applying migrations.
6. Treat the case lifecycle as two deployments. Apply the expand migration and replace every API process before creating or applying its contract migration.

```bash
pnpm install --frozen-lockfile
pnpm --filter database db:generate
pnpm --filter api build
pnpm --filter database exec prisma migrate status
```

## Database preflight

The expected state is: all earlier migrations are completed, the rollout migrations are pending, and there are no unfinished Prisma migrations. Any object that exists without the corresponding completed Prisma migration is partial drift and blocks deployment.

Run the versioned, read-only gate from the repository. It exits non-zero on an
unfinished migration, partial drift, replica connection, long/idle transaction,
or waiting lock on one of the rollout tables:

```bash
sudo -u postgres psql -d leetplus -v ON_ERROR_STOP=1 \
  -f packages/database/prisma/preflight/guest-game-reward-materializer.sql
```

The detailed statements below are retained for manual inspection when the gate
stops the rollout.

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260718150000_guest_game_origin_fallback',
  '20260718150100_guest_game_event_origin_index',
  '20260718150200_guest_game_reward_idempotency_index',
  '20260718150300_guest_game_reward_origin_index',
  '20260718150400_guest_game_rule_decision_origin_index',
  '20260718150500_guest_game_entitlement_origin_index',
  '20260718150600_guest_activity_raw_external_source_index',
  '20260718150700_guest_activity_fact_external_source_index',
  '20260718150800_guest_activity_fact_fallback_queue_index',
  '20260718180000_guest_game_effect_postings',
  '20260718190000_guest_game_reward_effect_outbox',
  '20260718190100_staff_chat_message_dedupe_index',
  '20260731090000_guest_game_case_reward_lifecycle',
  '20260731110000_guest_game_case_reward_contract'
)
   OR (finished_at IS NULL AND rolled_back_at IS NULL)
ORDER BY started_at;

SELECT *
FROM (
  VALUES
    ('xp_table', to_regclass('public."GuestGameXpPosting"')),
    ('intent_table', to_regclass('public."GuestGameRewardIntent"')),
    ('effect_table', to_regclass('public."GuestGameRewardEffect"')),
    ('chat_dedupe_index', to_regclass('public.staff_chat_message_tenant_dedupe_unique')),
    ('intent_ready_index', to_regclass('public.guest_game_reward_intent_ready_partial_idx')),
    ('effect_ready_index', to_regclass('public.guest_game_reward_effect_ready_partial_idx')),
    ('case_source_reward_index', to_regclass('public.guest_game_entitlement_source_reward_uidx'))
) AS objects(name, object_oid);

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'GuestGameEntitlement'
  AND column_name = 'sourceRewardId';

SELECT conname, contype, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN (
  'GuestGameEntitlement_sourceRewardId_fkey',
  'GuestGameEntitlement_sourceOutcome_distinct_check'
)
ORDER BY conname;

SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'GuestGameReward_guard_case_parent_claim',
    'GuestGameEntitlement_capture_legacy_source_reward'
  )
ORDER BY trigger_name;

SELECT COUNT(*) AS legacy_source_outcome_aliases
FROM "GuestGameEntitlement"
WHERE "sourceRewardId" IS NOT NULL
  AND "rewardId" = "sourceRewardId";

SELECT relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_relation_size(relid)) AS heap_size,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN (
  'GuestGameEvent', 'GuestGameReward', 'GuestGameRuleDecision',
  'GuestGameEntitlement', 'GuestGameRewardWalletItem',
  'GuestGameRewardEffect', 'GuestActivityRawRecord', 'GuestActivityFact',
  'StaffChatMessage'
)
ORDER BY pg_total_relation_size(relid) DESC;

SELECT pid, application_name, state, wait_event_type, wait_event,
       now() - xact_start AS transaction_age,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND xact_start IS NOT NULL
  AND now() - xact_start > interval '30 seconds'
ORDER BY xact_start;
```

Do not migrate while long or `idle in transaction` sessions touch the target tables. Each index on an existing hot table has its own single-statement `CREATE INDEX CONCURRENTLY` migration; do not merge those files. Nullable column additions still require a short `ACCESS EXCLUSIVE` lock.

The case-lifecycle expand migration additionally takes `SHARE ROW EXCLUSIVE`
locks on reward, wallet, and effect in the legacy write order. This serializes
its frozen repair set with an in-flight old claim. After commit, compatibility
triggers normalize supported old-binary case-parent writes and reject a stale
ordinary claim atomically. Those guards stay installed until the separate
contract deployment has confirmed that every old API process was replaced.

The contract migration is deliberately a later deployment. It takes
`SHARE ROW EXCLUSIVE` locks in the application write order, stops if a consumed
entitlement still aliases its source reward, clears only the temporary
non-consumed `rewardId = sourceRewardId` aliases, removes both compatibility
triggers/functions, and validates a database check that source and outcome
reward IDs must differ. Apply it only after the new API contract has been
observed on every process. The migration sets a 5-second lock timeout and a
30-second per-statement timeout so contention or an unexpectedly long
validation rolls the whole transaction back instead of holding production
indefinitely.

## Apply and verify

Use a short lock timeout so deployment fails instead of waiting indefinitely. A timeout is a stop condition: inspect `_prisma_migrations` and real objects before retrying or using `prisma migrate resolve`.

```bash
PGOPTIONS='-c lock_timeout=5000' pnpm --filter database db:deploy
pnpm --filter database exec prisma migrate status
sudo systemctl restart leetplus-api.service
curl --fail --silent --show-error http://127.0.0.1:4000/health
```

After the API is stable, build and restart web separately:

```bash
pnpm --filter web build
sudo systemctl restart leetplus-web.service
```

For the contract wave, repeat the preflight and the same sequential API-then-web
deployment. Do not apply `20260731110000_guest_game_case_reward_contract` until
the expand-capable API has replaced every old process. Confirm the entitlement
table size and active transactions from the preflight, and do not start a manual
or background materializer pass while the migration is running. A failed lock
acquisition, statement timeout, or consumed-alias guard is a stop condition;
leave the transaction rolled back, inspect the evidence, and fix forward.
Prisma can retain a failed migration-history row even though PostgreSQL rolled
the explicit transaction back. Before retrying, prove that the database is
still in the complete expand-only state (both normal-write triggers, no
source/outcome check, no partial contract objects), then mark only this failed
attempt rolled back and rerun the preflight:

```bash
pnpm --filter database exec prisma migrate resolve \
  --rolled-back 20260731110000_guest_game_case_reward_contract
```

Never use `--applied` after a timeout or guard failure.

Postflight database checks:

```sql
SELECT ci.relname AS index_name, i.indisready, i.indisvalid, i.indislive
FROM pg_index i
JOIN pg_class ci ON ci.oid = i.indexrelid
WHERE ci.relname IN (
  'guest_game_event_origin_uidx',
  'guest_game_reward_idempotency_uidx',
  'guest_game_reward_origin_idx',
  'guest_game_rule_decision_origin_idx',
  'guest_game_entitlement_origin_idx',
  'guest_activity_raw_external_source_idx',
  'guest_activity_fact_external_source_idx',
  'guest_activity_fact_fallback_queue_idx',
  'staff_chat_message_tenant_dedupe_unique',
  'guest_game_xp_posting_idempotency_uidx',
  'guest_game_reward_intent_idempotency_uidx',
  'guest_game_entitlement_source_reward_uidx',
  'guest_game_reward_effect_idempotency_uidx',
  'guest_game_reward_intent_ready_partial_idx',
  'guest_game_reward_effect_ready_partial_idx'
)
ORDER BY ci.relname;

SELECT status, COUNT(*) FROM "GuestGameRewardIntent" GROUP BY status ORDER BY status;
SELECT status, COUNT(*) FROM "GuestGameRewardEffect" GROUP BY status ORDER BY status;
```

All listed indexes must be ready, valid, and live. Unexpected `PROCESSING`, growing `FAILED`, or any `DEAD_LETTER` rows block canary.

For the expand wave, also confirm the `sourceRewardId` column, its FK, and both
compatibility triggers with the catalog queries above. Do not clear the legacy
`rewardId = sourceRewardId` alias or remove either trigger in the same deployment
that first adds them.

For the contract wave, confirm the source/outcome check is validated, the alias
count is zero, and both compatibility triggers are absent.

With an authenticated `OWNER`, `ADMIN`, or `MANAGER` session, call:

```text
GET /guests/gamification/reward-materializer/status
```

The response is tenant-scoped. Verify `runtime.backgroundReady`,
`runtime.scope.appliesToViewerTenant`, `runtime.inlineClaimsAllowed`, the latest
run outcome, ready/processing counts, expired leases, dead letters, and oldest
ready age. A tenant viewer cannot see another tenant's configured scope or last
run details. This endpoint performs database-backed queue reads and is the
required API smoke check after the migrations; the public `/health` endpoint
alone is not sufficient.

When the autonomous scheduler is intentionally disabled but a known tenant queue
must be drained, an authenticated `OWNER` or `ADMIN` can run one bounded pass:

```text
POST /guests/gamification/reward-materializer/run
Content-Type: application/json

{"limit": 100}
```

This command ignores only the autonomous scheduler's enable/scope selection. It
always honors the global kill switch, processes only the authenticated actor's
tenant, uses the same intent-then-effect claim/lease/fencing pipeline, and
returns aggregate counts without reward identifiers. Concurrent runs in the
same API process are skipped. Repeating the command is safe: already finalized
intents/effects are not applied twice.

## Tenant canary

1. Keep `ALLOW_ALL_TENANTS=false` and select exactly one tenant.
2. Confirm `GET /guests/gamification/reward-materializer/status` reports the intended scope and no dead letters or expired leases.
3. Either run one explicit tenant-scoped pass as `OWNER`/`ADMIN`, or set `ENABLED=true`, keep `KILL_SWITCH=false`, and restart only API.
4. Verify exactly one event, XP posting, reward intent, reward, effect, and bonus-ledger entry for the controlled fact.
5. Replay the same fact and rerun the same processing path; no second XP, reward, effect, entitlement, or bonus posting may appear.
6. If lag, retries, stale finalizations, or dead letters grow, set `KILL_SWITCH=true`, restart API, and investigate without deleting queue rows.
