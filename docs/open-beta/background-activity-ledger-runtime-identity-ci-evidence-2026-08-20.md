# Activity ledger runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к tenant-wide activity background path:

- `GUEST_ACTIVITY_LEDGER_SYNC`.

Job kind остаётся `EXTERNAL_DENY` для внешних tenant. Этот срез не включает
external unattended execution, не выдаёт owner invite и не меняет текущую сеть
`Tenant A/A1..A4`.

## Что изменено

- `GuestActivityLedgerService.enqueueDueRecoverySyncs()` после background
  policy admission требует `evaluateTenantBackgroundRuntimeIdentity()` с actor
  kind `TENANT_SYSTEM` и exact `tenantId`.
- Runtime-denied recovery state не доходит до `STALE_BINDING` mutation и не
  вызывает `enqueueProfileSync()`.
- `GuestActivityLedgerService.claimNextSyncJob()` требует такой же
  `TENANT_SYSTEM + tenantId` runtime identity до `GuestActivitySyncJob.updateMany`
  claim/lock mutation.
- Runtime-denied queued job не claim-ится и не вызывает `syncProfile()`.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-activity-ledger.service.spec.ts
# 1/1 suite, 51/51 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 803/803 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

node_modules/.pnpm/node_modules/.bin/prettier.CMD --check apps/api/src/guest-gamification/guest-activity-ledger.service.ts apps/api/src/guest-gamification/guest-activity-ledger.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `6c485d6e63c8fcae2130fd33b51771073b1f9a2d` принят GitHub Actions
run
[`32335635308`](https://github.com/boozik3412/leetplus/actions/runs/32335635308)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Activity ledger background path переведён с foundation-only контракта на
job-specific runtime identity enforcement:

```text
GUEST_ACTIVITY_LEDGER_SYNC recovery policy allowed
→ exact TENANT_SYSTEM runtime actor required
→ stale binding mutation / recovery enqueue only for runtime-accepted tenant
→ missing tenant identity skips before mutation/enqueue

GUEST_ACTIVITY_LEDGER_SYNC queued claim policy allowed
→ exact TENANT_SYSTEM runtime actor required
→ claim/lock updateMany only for runtime-accepted tenant
→ missing tenant identity skips before claim/syncProfile
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить runtime gates к `GUEST_GAME_LEDGER_FALLBACK`;
2. подключить runtime gates к `GUEST_GAME_LOOT_BOX_RECOVERY`;
3. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
4. отдельно проектировать durable delivery coordinator, claim/finalize/reaper,
   provider mark/complete lost-response reconciliation и Telegram/MAX
   outbound `GO`;
5. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
