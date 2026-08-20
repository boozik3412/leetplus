# Ledger fallback runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к store-bound guest-game ledger fallback
background path:

- `GUEST_GAME_LEDGER_FALLBACK`.

Job kind остаётся `EXTERNAL_DENY` для внешних tenant. Этот срез не включает
external unattended execution, не выдаёт owner invite и не меняет текущую сеть
`Tenant A/A1..A4`.

## Что изменено

- `GuestGameLedgerFallbackService.runScheduled()` выбирает runtime store
  identity только из активных `backgroundExecutionEnabled` stores текущего
  tenant.
- После background policy admission и actor check scheduler требует
  `evaluateTenantBackgroundRuntimeIdentity()` с actor kind
  `TENANT_STORE_SYSTEM`, exact `tenantId` и exact `storeId`.
- Runtime-denied tenant получает deterministic `SKIPPED` с reason
  `BACKGROUND_STORE_ID_REQUIRED` до чтения ledger/activity данных, origin
  receipt claim, dry-run, rule-decision записи или `processEvent()`.
- Fallback execution запускается как synthetic actor со scope `STORES` и
  `allowedStoreIds=[runtimeStoreId]`, а не как tenant-wide `NETWORK` actor.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-game-ledger-fallback.service.spec.ts
# 1/1 suite, 85/85 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 804/804 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

node_modules/.pnpm/node_modules/.bin/prettier.CMD --check apps/api/src/guest-gamification/guest-game-ledger-fallback.service.ts apps/api/src/guest-gamification/guest-game-ledger-fallback.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `6f8008a2551d4a96962c65e58a385e86e7b2f471` принят GitHub Actions
run
[`32338344266`](https://github.com/boozik3412/leetplus/actions/runs/32338344266)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

CI warning: GitHub Actions показал non-blocking Node.js 20 deprecation notice
для hosted actions runtime; checkout/setup-node/pnpm action выполнялись на
Node 24. Это не является admission blocker для этого exact SHA.

## Что это закрывает

Ledger fallback background path переведён с foundation-only контракта на
job-specific runtime identity enforcement:

```text
GUEST_GAME_LEDGER_FALLBACK policy allowed
→ tenant-local active background-enabled Store selected
→ exact TENANT_STORE_SYSTEM runtime actor required
→ fallback actor runs as STORES/[runtimeStoreId]
→ missing store identity skips before reads, claims, dry-run and processEvent
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить runtime gates к `GUEST_GAME_LOOT_BOX_RECOVERY`;
2. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
3. отдельно проектировать durable delivery coordinator, claim/finalize/reaper,
   provider mark/complete lost-response reconciliation и Telegram/MAX
   outbound `GO`;
4. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
