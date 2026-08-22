# Reward materializer runtime identity CI evidence — 20.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к unattended materializer path:
`GUEST_GAME_REWARD_MATERIALIZER`.

До этого reward materializer уже проходил background policy admission, но
scheduler ещё не доказывал отдельную tenant-store system identity перед
materialization claim/effect. Новый слой делает store identity явной и
tenant-local: каждый tenant получает runtime store только из своих активных
`backgroundExecutionEnabled` stores.

Этот evidence не является production deployment, не выдаёт внешний owner
invite и не меняет текущую сеть `Tenant A/A1..A4`.

## Что изменено

- `GuestGameRewardMaterializerPolicy` получил optional
  `GUEST_GAME_REWARD_MATERIALIZER_STORE_ID` для explicit single-tenant store
  binding.
- `GuestGameRewardMaterializerSchedulerService` выбирает active
  `backgroundExecutionEnabled` store внутри каждого tenant и проверяет
  `evaluateTenantBackgroundRuntimeIdentity` с actor kind
  `TENANT_STORE_SYSTEM`, exact `tenantId` и selected `storeId`.
- При `allowAllTenants` scheduler не переиспользует один global store id между
  tenant: store выбирается отдельно внутри каждого tenant scope.
- Missing store identity возвращает deterministic skipped tenant result с
  reason `BACKGROUND_STORE_ID_REQUIRED` до materialization claim/effect.
- Synthetic background actor для scheduled materializer теперь создаётся как
  `STORES` + `[runtimeStoreId]`, а не tenant-wide `NETWORK`.
- Manual `runTenantOnce()` намеренно не изменён этим slice: это scoped
  unattended scheduler hardening, не изменение интерактивного/manual
  materializer entrypoint.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/guest-gamification/guest-game-reward-materializer-policy.spec.ts src/guest-gamification/guest-game-reward-materializer-scheduler.service.spec.ts
# 2/2 suites, 34/34 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 797/797 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1002/1002 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

pnpm --filter api exec prettier --check src/guest-gamification/guest-game-reward-materializer-policy.ts src/guest-gamification/guest-game-reward-materializer-policy.spec.ts src/guest-gamification/guest-game-reward-materializer-scheduler.service.ts src/guest-gamification/guest-game-reward-materializer-scheduler.service.spec.ts
# PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `419faa5819823fa9d71c2b8697b066e488a3910d` принят GitHub Actions
run
[`32328300134`](https://github.com/boozik3412/leetplus/actions/runs/32328300134)
как `4/4 SUCCESS`:

- `Authority root trust gate` — success;
- `PostgreSQL migration smoke` — success;
- `Application checks` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Третий background call-site переведён с foundation-only контракта на
job-specific runtime identity enforcement:

```text
GUEST_GAME_REWARD_MATERIALIZER policy allowed
→ active/background-enabled tenant-local store selected
→ exact TENANT_STORE_SYSTEM runtime actor required
→ synthetic actor scoped to STORES/[runtimeStoreId]
→ missing store identity skips before claim/materialization effects
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить runtime gates к delivery dispatch/bot pull reward-delivery paths;
2. подключить tenant/store-scoped gates к retention/recovery/activity jobs;
3. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
4. затем возвращаться к Gate 1MT/Gate 2 и controlled owner invite.
