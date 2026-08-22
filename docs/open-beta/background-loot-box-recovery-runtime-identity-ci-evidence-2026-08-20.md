# Loot-box recovery runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к store-bound loot-box session recovery
background path:

- `GUEST_GAME_LOOT_BOX_RECOVERY`.

Job kind остаётся `EXTERNAL_DENY` для внешних tenant. Этот срез не включает
external unattended execution, не выдаёт owner invite и не меняет текущую сеть
`Tenant A/A1..A4`.

## Что изменено

- `GuestGameLootBoxSessionRecoveryService.runScheduled()` выбирает runtime
  store identity только из активных `backgroundExecutionEnabled` stores
  текущего tenant.
- После background policy admission и actor check scheduler требует
  `evaluateTenantBackgroundRuntimeIdentity()` с actor kind
  `TENANT_STORE_SYSTEM`, exact `tenantId` и exact `storeId`.
- Runtime-denied tenant получает deterministic `SKIPPED` с reason
  `BACKGROUND_STORE_ID_REQUIRED` до loot-box reads, activity fact reads, origin
  receipt reads/claims, dry-run, rule-decision записи или event processing.
- Recovery execution запускается как synthetic actor со scope `STORES` и
  `allowedStoreIds=[runtimeStoreId]`, а не как tenant-wide `NETWORK` actor.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-game-loot-box-session-recovery.service.spec.ts
# 1/1 suite, 48/48 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 805/805 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

node_modules/.pnpm/node_modules/.bin/prettier.CMD --check apps/api/src/guest-gamification/guest-game-loot-box-session-recovery.service.ts apps/api/src/guest-gamification/guest-game-loot-box-session-recovery.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `3bde6641ce67407f513de13606d8b3428a893fc2` принят GitHub Actions
run
[`32340721320`](https://github.com/boozik3412/leetplus/actions/runs/32340721320)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Loot-box recovery background path переведён с foundation-only контракта на
job-specific runtime identity enforcement:

```text
GUEST_GAME_LOOT_BOX_RECOVERY policy allowed
→ tenant-local active background-enabled Store selected
→ exact TENANT_STORE_SYSTEM runtime actor required
→ recovery actor runs as STORES/[runtimeStoreId]
→ missing store identity skips before reads, origin receipt claims, dry-run and event processing
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
2. отдельно проектировать durable delivery coordinator, claim/finalize/reaper,
   provider mark/complete lost-response reconciliation и Telegram/MAX
   outbound `GO`;
3. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
