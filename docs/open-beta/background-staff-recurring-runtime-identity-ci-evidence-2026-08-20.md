# Staff recurring rules runtime identity evidence — 20.08.2026

| Поле             | Значение                                   |
| ---------------- | ------------------------------------------ |
| Статус           | Accepted code evidence; не deployed        |
| Release decision | `NO-GO` для внешнего owner invite          |
| Job kind         | `STAFF_TASK_RECURRING_RULES`               |
| Required actor   | `TENANT_STORE_SYSTEM + storeId`            |
| Exact SHA        | `8fc5725b67170cd8d3263ebc6679d1f3c4de4af9` |
| CI run           | `32343189662` — `4/4 SUCCESS`              |

## Что изменено

`StaffTaskRecurringRulesService.runDueRulesForTenant()` больше не выполняет
tenant-wide recurring-rule sweep напрямую. Scheduled path теперь:

1. загружает tenant вместе с active `backgroundExecutionEnabled` stores;
2. требует active tenant;
3. применяет `STAFF_TASK_RECURRING_RULES` через
   `evaluateTenantBackgroundExecutionPolicy`;
4. для каждого store требует accepted runtime identity
   `TENANT_STORE_SYSTEM + storeId`;
5. запускает recurring-rule work только с exact `storeId` predicate.

`runDueRulesForAllTenants()` агрегирует результат через тот же tenant entrypoint
и больше не обходит store runtime identity.

## Fail-closed свойства

- `PILOT/BETA/LIVE` tenant не доходит до recurring-rule reads, потому что job
  остаётся `EXTERNAL_DENY`.
- Active tenant без active/background-enabled store возвращает пустой результат
  до `StaffTaskRecurringRule` reads, run creation, task creation и transaction.
- Internal scheduled work выполняется только по конкретному store, а не как
  network-wide service-token sweep.
- Interactive owner/user routes не менялись: они продолжают использовать
  persisted `NETWORK | STORES` user scope и fresh mutation checks.

## Локальные проверки

```text
pnpm --filter api test -- --runInBand --runTestsByPath src/staff/staff-task-recurring-rules.service.spec.ts
# 1/1 suite, 26/26 tests PASS

pnpm --filter api test:ci:background-execution
# 16/16 suites, 805/805 tests PASS

pnpm --filter api test:ci:tenant-execution
# 18/18 suites, 1004/1004 tests PASS

pnpm --dir apps/api exec eslint --rule "prettier/prettier: off" src/staff/staff-task-recurring-rules.service.ts src/staff/staff-task-recurring-rules.service.spec.ts
pnpm --filter api typecheck
pnpm --dir apps/api exec prettier --check src/staff/staff-task-recurring-rules.service.ts src/staff/staff-task-recurring-rules.service.spec.ts
git diff --check
```

## CI acceptance

GitHub Actions run:
`https://github.com/boozik3412/leetplus/actions/runs/32343189662`

Result:

- Authority root trust gate — `success`;
- Application checks — `success`;
- PostgreSQL migration smoke — `success`;
- Release artifact API child process — `success`.

## Остаток до открытого теста

Этот срез закрывает последний известный background runtime-identity call-site
из текущего registry adoption списка. Он не означает готовность внешнего
доступа: Gate 1MT всё ещё требует public guest/Telegram/outbound matrix,
production-build attachment archive/delete/orphan journey, controlled
production admission, Gate 2 на `Tenant A/A1..A4` и отдельный
`SHARED BETA GO`.
