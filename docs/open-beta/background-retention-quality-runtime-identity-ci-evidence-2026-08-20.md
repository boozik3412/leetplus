# Retention and quality runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к tenant-wide guest-data background
paths:

- `GUEST_GAME_DATA_RETENTION`;
- `GUEST_GAME_QUALITY_MONITORING`.

Оба job kind остаются `EXTERNAL_DENY` для внешних tenant. Этот срез не
включает external unattended execution, не выдаёт owner invite и не меняет
текущую сеть `Tenant A/A1..A4`.

## Что изменено

- `GuestGameDataRetentionService.runAll()` строит executable tenant list
  только после двух fail-closed проверок:
  - background execution policy для `GUEST_GAME_DATA_RETENTION`;
  - `evaluateTenantBackgroundRuntimeIdentity()` с actor kind
    `TENANT_SYSTEM` и exact `tenantId`.
- Runtime-denied tenant не попадает в global wallet cleanup/recovery,
  retention policy lookup и tenant retention run.
- `GuestGameQualityMonitoringService.runAll()` проверяет
  `TENANT_SYSTEM + tenantId` runtime identity до `collectTenant()`.
- Missing tenant identity возвращает deterministic `SKIPPED` с reason
  `BACKGROUND_TENANT_ID_REQUIRED` до wallet cleanup, policy lookup, quality
  snapshot или alert writes.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-game-quality-monitoring.service.spec.ts src/guest-gamification/guest-game-data-retention.service.spec.ts
# 2/2 suites, 30/30 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 801/801 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

node_modules/.pnpm/node_modules/.bin/prettier.CMD --check apps/api/src/guest-gamification/guest-game-quality-monitoring.service.ts apps/api/src/guest-gamification/guest-game-quality-monitoring.service.spec.ts apps/api/src/guest-gamification/guest-game-data-retention.service.ts apps/api/src/guest-gamification/guest-game-data-retention.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `c58952f798090b2baed89d894b413e71c55c2882` принят GitHub Actions
run
[`32333272180`](https://github.com/boozik3412/leetplus/actions/runs/32333272180)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Два tenant-wide guest-data background call-site переведены с
foundation-only контракта на job-specific runtime identity enforcement:

```text
GUEST_GAME_DATA_RETENTION policy allowed
→ exact TENANT_SYSTEM runtime actor required
→ executable tenant list accepts only runtime-accepted tenants
→ global wallet cleanup/recovery and retention policy lookup scoped to accepted tenants
→ missing tenant identity skips before cleanup/retention effects

GUEST_GAME_QUALITY_MONITORING policy allowed
→ exact TENANT_SYSTEM runtime actor required
→ collectTenant runs only for runtime-accepted tenants
→ missing tenant identity skips before snapshot/alert effects
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить runtime gates к `GUEST_ACTIVITY_LEDGER_SYNC`;
2. подключить runtime gates к `GUEST_GAME_LEDGER_FALLBACK`;
3. подключить runtime gates к `GUEST_GAME_LOOT_BOX_RECOVERY`;
4. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
5. отдельно проектировать durable delivery coordinator, claim/finalize/reaper,
   provider mark/complete lost-response reconciliation и Telegram/MAX
   outbound `GO`;
6. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
