# Report digest runtime identity CI evidence — 19.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Подключить runtime identity foundation к первому реальному background job path:
`REPORT_DIGEST_SMTP`.

До этого `REPORT_DIGEST_SMTP` уже проходил tenant execution admission и
background policy admission. Новый слой доказывает, что scheduled SMTP effect
исполняется только как tenant-scoped system actor, а общий service token не
становится worker identity.

Этот evidence не является production deployment, не выдаёт внешний owner invite
и не меняет текущую сеть `Tenant A/A1..A4`.

## Что изменено

- `ReportsDigestSchedulerService` перед запуском digest generation проверяет
  `evaluateTenantBackgroundRuntimeIdentity` с actor kind `TENANT_SYSTEM` и exact
  `tenant.id`.
- `ReportsDigestService` повторяет runtime identity check на последней границе
  перед SMTP effect после fresh permit evaluation и fresh recipient/capability
  recheck.
- Runtime-deny сохраняется как deterministic `SKIPPED` с reason code
  `BACKGROUND_TENANT_ID_REQUIRED` и не вызывает SMTP/provider effect.

## Локальная проверка

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/reports/reports-digest-scheduler.service.spec.ts src/reports/reports-digest.service.spec.ts
# 2/2 suites, 16/16 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 794/794 tests PASS

pnpm --filter api lint:ci:tenant-execution
# PASS

pnpm --filter api typecheck
# PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1000/1000 tests PASS

git diff --check
# PASS
```

## GitHub Actions acceptance

Exact SHA `1fa0806363dffbdb43ba62e2c5f2056b100aa248` принят GitHub Actions
run
[`32278267729`](https://github.com/boozik3412/leetplus/actions/runs/32278267729)
attempt `2` как `4/4 SUCCESS`:

- `Application checks` — success;
- `PostgreSQL migration smoke` — success;
- `Authority root trust gate` — success;
- `Release artifact API child process` — success.

Attempt `1` был вручную отменён во время подозрения на known external CI hang
на `Install disposable CURRENT187 PgBouncer fixture`; он не считается accepted
evidence.

## Что это закрывает

Первый реальный background call-site переведён с foundation-only контракта на
job-specific runtime identity enforcement:

```text
REPORT_DIGEST_SMTP policy allowed
→ exact TENANT_SYSTEM runtime actor required
→ fresh SMTP boundary rechecks runtime identity
→ missing/invalid tenant runtime identity skips before provider effect
```

## Что остаётся

Это не полное переключение worker plane. Следующие bounded slices:

1. подключить runtime identity gate к `GUEST_BONUS_LEDGER_LANGAME`
   — закрыто successor evidence
   `background-bonus-ledger-runtime-identity-ci-evidence-2026-08-19`;
2. подключить store-scoped gates к delivery/reward/materializer jobs;
3. подключить tenant/store-scoped gates к retention/recovery/activity jobs;
4. закрыть `STAFF_TASK_RECURRING_RULES` как отдельный staff worker path;
5. после полного worker-plane adoption возвращаться к Gate 1MT/Gate 2 и
   controlled owner invite.
