# Reward materializer: production rollout

This runbook covers migrations `20260718150000_guest_game_origin_fallback`, `20260718180000_guest_game_effect_postings`, and `20260718190000_guest_game_reward_effect_outbox`.

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
  '20260718180000_guest_game_effect_postings',
  '20260718190000_guest_game_reward_effect_outbox'
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
    ('effect_ready_index', to_regclass('public.guest_game_reward_effect_ready_partial_idx'))
) AS objects(name, object_oid);

SELECT relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_relation_size(relid)) AS heap_size,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN (
  'GuestGameEvent', 'GuestGameReward', 'GuestGameRuleDecision',
  'GuestGameEntitlement', 'GuestActivityRawRecord', 'GuestActivityFact',
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

Do not migrate while long or `idle in transaction` sessions touch the target tables. The migrations use `CREATE INDEX CONCURRENTLY` for indexes on existing hot tables; nullable column additions still require a short `ACCESS EXCLUSIVE` lock.

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

Postflight database checks:

```sql
SELECT ci.relname AS index_name, i.indisready, i.indisvalid, i.indislive
FROM pg_index i
JOIN pg_class ci ON ci.oid = i.indexrelid
WHERE ci.relname IN (
  'guest_game_event_origin_uidx',
  'guest_game_reward_idempotency_uidx',
  'staff_chat_message_tenant_dedupe_unique',
  'guest_game_xp_posting_idempotency_uidx',
  'guest_game_reward_intent_idempotency_uidx',
  'guest_game_reward_effect_idempotency_uidx',
  'guest_game_reward_intent_ready_partial_idx',
  'guest_game_reward_effect_ready_partial_idx'
)
ORDER BY ci.relname;

SELECT status, COUNT(*) FROM "GuestGameRewardIntent" GROUP BY status ORDER BY status;
SELECT status, COUNT(*) FROM "GuestGameRewardEffect" GROUP BY status ORDER BY status;
```

All listed indexes must be ready, valid, and live. Unexpected `PROCESSING`, growing `FAILED`, or any `DEAD_LETTER` rows block canary.

With an authenticated `OWNER`, `ADMIN`, or `MANAGER` session, also call:

```text
GET /guests/gamification/reward-materializer/status
```

The response is tenant-scoped. Verify `runtime.backgroundReady`, `runtime.inlineClaimsAllowed`, the configured scope, the latest run outcome, ready/processing counts, expired leases, dead letters, and oldest ready age. This endpoint performs database-backed queue reads and is the required API smoke check after the migrations; the public `/health` endpoint alone is not sufficient.

## Tenant canary

1. Keep `ALLOW_ALL_TENANTS=false` and select exactly one tenant.
2. Confirm `GET /guests/gamification/reward-materializer/status` reports the intended scope and no dead letters or expired leases.
3. Set `ENABLED=true`, keep `KILL_SWITCH=false`, and restart only API.
4. Verify exactly one event, XP posting, reward intent, reward, effect, and bonus-ledger entry for the controlled fact.
5. Replay the same fact and restart API; no second XP or reward may appear.
6. If lag, retries, stale finalizations, or dead letters grow, set `KILL_SWITCH=true`, restart API, and investigate without deleting queue rows.
