# Background execution identity metadata CI evidence — 19.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Закрепить registry-level контракт для background execution перед открытым
тестом: каждый известный background job kind должен явно объявлять, от чьего
имени он исполняется, а общий `SYNC_SERVICE_TOKEN` не должен считаться worker
identity.

Этот evidence не является production deployment и не выдаёт внешний доступ. Он
не меняет production, текущий Tenant A/A1–A4, Telegram, SMTP или внешнего
tester.

## Что изменено

В `apps/api/src/tenancy/tenant-background-execution-policy.ts` добавлен
`TENANT_BACKGROUND_JOB_EXECUTION_METADATA` для всех 17 background job kinds.
Каждая запись содержит:

- `systemIdentity`: `TENANT_SYSTEM_IDENTITY`,
  `TENANT_STORE_SYSTEM_IDENTITY` или `TENANT_OR_STORE_SYSTEM_IDENTITY`;
- `sharedServiceTokenAllowed: false`.

Policy decision теперь возвращает `systemIdentity` и
`sharedServiceTokenAllowed` как часть результата admission, включая deny paths.
Для неизвестных job kinds `systemIdentity=null`, а
`sharedServiceTokenAllowed=false`.

## Локальная проверка

```text
pnpm --filter api test:ci:background-execution  # 16/16 suites, 788/788 tests PASS
pnpm --filter api test:ci:tenant-execution      # 18/18 suites, 998/998 tests PASS
pnpm --filter api lint:ci:tenant-execution      # PASS
pnpm --filter api typecheck                     # PASS
git diff --check                                # PASS
```

## GitHub Actions acceptance

Exact SHA `3b1531d2a103304368d46781ebf76627eee1b2a6` принят GitHub Actions
run
[`32267735326`](https://github.com/boozik3412/leetplus/actions/runs/32267735326)
как `4/4 SUCCESS`:

- `Application checks` — success, включая background execution containment,
  tenant execution admission, API typecheck/build, web lint/typecheck/build и
  deterministic release artifact;
- `PostgreSQL migration smoke` — success, включая shared beta / Gate 1MT /
  CURRENT18x-CURRENT19x rehearsal lanes;
- `Authority root trust gate` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Закрыт registry-level admission blocker:

```text
known background job kind
→ explicit tenant/store system identity requirement
→ shared service token is not worker identity
→ CI blocks unreviewed metadata drift
```

Новый background job kind теперь не может быть принят registry tests без явного
identity requirement.

## Что остаётся

Это не полноценный durable worker plane. Для внешнего beta доступа ещё нужны:

- runtime roles/grants и фактическое исполнение legacy scheduler paths под
  tenant/store-scoped actor;
- distributed lease / suspend-drain для all-tenant jobs;
- tenant-aware Telegram/public guest binding;
- controlled outbound;
- production-like restored-copy evidence и отдельный protected
  `SHARED BETA GO`.
