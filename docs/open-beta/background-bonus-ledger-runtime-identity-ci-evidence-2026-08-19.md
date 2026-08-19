# Bonus ledger runtime identity CI evidence — 19.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation ко второму real background effect path:
`GUEST_BONUS_LEDGER_LANGAME`.

До этого bonus ledger уже проходил tenant execution admission и background
policy admission. Новый слой доказывает, что live Langame balance effect
исполняется только как store-scoped system actor, а batch без exact `storeId`
не может auto-queue, claim или вызвать provider.

Этот evidence не является production deployment, не выдаёт внешний owner invite
и не меняет текущую сеть `Tenant A/A1..A4`.

## Что изменено

- `GuestBonusLedgerService.dispatch` после tenant execution permit и
  background policy проверяет `evaluateTenantBackgroundRuntimeIdentity` с actor
  kind `TENANT_STORE_SYSTEM`, exact `tenantId` и explicit `storeId` из request
  config.
- Если live dispatch не несёт `storeId`, service возвращает blocked summary до
  `queueApprovedRewards`, `claimReadyEntries` и Langame/provider effect.
- `processClaimedEntry` повторяет runtime identity check после `DISPATCHING`,
  fresh source/credential resolution, fresh permit evaluation и fresh
  background policy, но до `adjustGuestBalanceByPhone`.
- Если ledger entry потеряла store identity, запись возвращается в `PENDING` с
  `BACKGROUND_RUNTIME_IDENTITY_NOT_ACCEPTED`; Langame не вызывается.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-bonus-ledger.service.spec.ts
# 1/1 suite, 61/61 tests PASS

pnpm --filter api exec prettier --check src/guest-gamification/guest-bonus-ledger.service.ts src/guest-gamification/guest-bonus-ledger.service.spec.ts
# PASS

pnpm --filter api test:ci:background-execution
# PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1002/1002 tests PASS

pnpm --filter api typecheck
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `cdb1a619f1d3d646cfc62a3250b106b32b081b36` принят GitHub Actions
run
[`32283610426`](https://github.com/boozik3412/leetplus/actions/runs/32283610426)
как `4/4 SUCCESS`:

- `Application checks` — success;
- `PostgreSQL migration smoke` — success;
- `Authority root trust gate` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Второй `REVISION_FENCED` background call-site переведён с foundation-only
контракта на job-specific runtime identity enforcement:

```text
GUEST_BONUS_LEDGER_LANGAME policy allowed
→ exact TENANT_STORE_SYSTEM runtime actor required
→ explicit storeId required before batch claim/queue
→ fresh store identity recheck before Langame balance write
→ missing store runtime identity returns ledger to PENDING before provider effect
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить store-scoped runtime gates к delivery/reward/materializer jobs;
2. подключить tenant/store-scoped gates к retention/recovery/activity jobs;
3. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
4. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
