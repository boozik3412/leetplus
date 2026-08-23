# Delivery runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к legacy reward-delivery background
paths:

- `GUEST_GAME_DELIVERY_DISPATCH`;
- `GUEST_GAME_DELIVERY_BOT_PULL`.

Этот срез не включает Telegram/MAX real-send для внешних tenant. Он добавляет
fail-closed tenant-store runtime identity и store-scoped outbox reads поверх
существующих policy/protocol deny gates.

Этот evidence не является production deployment, не выдаёт внешний owner
invite и не меняет текущую сеть `Tenant A/A1..A4`.

## Что изменено

- `runDeliveryDispatchScheduled()` выбирает active
  `backgroundExecutionEnabled` store внутри каждого tenant.
- Scheduled dispatch проверяет `evaluateTenantBackgroundRuntimeIdentity` с
  actor kind `TENANT_STORE_SYSTEM`, exact `tenantId` и selected `storeId` до
  `dispatchDeliveries`.
- Synthetic scheduled dispatcher actor теперь создаётся как
  `accessScope=STORES` и `allowedStoreIds=[runtimeStoreId]`.
- `pullBotDeliveries()` получает tenant-local store identity через scheduled
  actor resolver и возвращает deterministic empty result при missing runtime
  store до `GuestGameDelivery` query или payload serialization.
- `GuestGameDelivery` reads в `getDeliveries()`, `dispatchDeliveries()` и
  `pullBotDeliveries()` для `STORES` actor ограничены
  `storeId IN allowedStoreIds`.
- Existing legacy delivery protocol gate остаётся fail-closed: срез не
  разблокирует provider send или bot payload.
- Registry status для external tenant остаётся `EXTERNAL_DENY`: внешний tenant
  всё ещё получает deterministic skip до runtime identity acceptance/outbound.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-gamification.service.spec.ts
# 1/1 suite, 431/431 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 799/799 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

pnpm --filter api exec prettier --check src/guest-gamification/guest-gamification.service.ts src/guest-gamification/guest-gamification.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `ee1f59e05c8abcb5359ad1f171b3c9b62eefe349` принят GitHub Actions
run
[`32330878860`](https://github.com/boozik3412/leetplus/actions/runs/32330878860)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Legacy delivery background paths больше не могут исполняться как tenant-wide
`NETWORK` actor в scheduled/bot-pull runtime:

```text
GUEST_GAME_DELIVERY_DISPATCH policy allowed
→ active/background-enabled tenant-local store selected
→ exact TENANT_STORE_SYSTEM runtime actor required
→ synthetic dispatcher actor scoped to STORES/[runtimeStoreId]
→ delivery reads constrained by storeId

GUEST_GAME_DELIVERY_BOT_PULL policy allowed
→ exact TENANT_STORE_SYSTEM runtime actor required
→ missing store identity returns empty deterministic result
→ delivery reads constrained by storeId
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить tenant/store-scoped gates к retention/recovery/activity jobs;
2. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
3. отдельно проектировать durable delivery coordinator, claim/finalize/reaper,
   provider mark/complete lost-response reconciliation и Telegram/MAX
   outbound `GO`;
4. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
