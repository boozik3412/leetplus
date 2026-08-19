# Background runtime identity foundation CI evidence — 19.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Закрепить foundation для следующего worker-plane этапа: даже если background
job разрешён policy, он не должен исполняться под общим service token. Runtime
должен отдельно подтвердить tenant/store-scoped system actor.

Этот evidence не является production deployment, не включает scheduler
call-sites автоматически и не выдаёт внешний доступ.

## Что изменено

В `apps/api/src/tenancy/tenant-background-execution-policy.ts` добавлен
`evaluateTenantBackgroundRuntimeIdentity`.

Он принимает policy decision и фактический runtime actor:

- `SHARED_SERVICE_TOKEN` всегда отклоняется как worker identity;
- `TENANT_SYSTEM_IDENTITY` требует actor kind `TENANT_SYSTEM`;
- `TENANT_STORE_SYSTEM_IDENTITY` требует actor kind `TENANT_STORE_SYSTEM` и
  non-empty `storeId`;
- `TENANT_OR_STORE_SYSTEM_IDENTITY` допускает tenant actor либо store actor со
  `storeId`;
- policy-deny имеет приоритет над любым actor.

## Локальная проверка

```text
pnpm --filter api test:ci:background-execution  # 16/16 suites, 792/792 tests PASS
pnpm --filter api test:ci:tenant-execution      # 18/18 suites, 998/998 tests PASS
pnpm --filter api lint:ci:tenant-execution      # PASS
pnpm --filter api typecheck                     # PASS
git diff --check                                # PASS
```

## GitHub Actions acceptance

Exact SHA `9a247695da70fafca9232972de4b42bcda8eb421` принят GitHub Actions
run
[`32271915712`](https://github.com/boozik3412/leetplus/actions/runs/32271915712)
attempt `2` как `4/4 SUCCESS`:

- `Application checks` — success;
- `PostgreSQL migration smoke` — success;
- `Authority root trust gate` — success;
- `Release artifact API child process` — success.

Attempt `1` был отменён вручную из-за внешнего CI hang на
`Install disposable CURRENT187 PgBouncer fixture`; это не принятое evidence.

## Что это закрывает

Закрыт foundation-level runtime identity blocker:

```text
policy decision accepted
→ shared service token still rejected as worker identity
→ exact tenant/store actor requirement
→ CI prevents runtime identity contract regression
```

## Что остаётся

Это не полное переключение worker plane. Следующий этап — подключать helper к
конкретным scheduler/job call-sites bounded-патчами и подтверждать job-specific
tests: report digest, bonus ledger, reward materializer, activity sync,
retention/recovery и staff recurring rules.
