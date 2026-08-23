# Founder-operator beta activation runtime v1

| Поле | Значение |
| --- | --- |
| Статус | `ENGINEERING IMPLEMENTED / PRODUCTION NOT ENROLLED` |
| Migration | `20260817030000_founder_operator_beta_activation_runtime_v1` |
| Runtime role | `leetplus_founder_beta_activation_runtime` |
| Application pool | отдельный, только для activation RPC |
| Production | не изменён |

## Назначение

Обычный API database pool больше не является authority для активации внешнего
tenant. `FounderOperatorBetaActivationService` получает отдельный lazy Prisma
pool через `FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL`. URL обязан:

- использовать только роль `leetplus_founder_beta_activation_runtime`;
- иметь отдельный сильный password;
- содержать exact bounded options
  `schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5`;
- не совпадать ролью с primary `DATABASE_URL`;
- опционально использовать только `sslmode=require|verify-full`.

При `FOUNDER_OPERATOR_BETA_MODE=DISABLED|PREPARE` pool не создаётся и соединение
не открывается. В production `ACTIVE` без корректного dedicated URL startup
validation завершается ошибкой.

## Database boundary

Migration переименовывает фактическую v2 implementation в private entrypoint и
создаёт исходный public-name wrapper. `PUBLIC EXECUTE` отозван с wrapper,
private implementation и runtime assertion. Prisma migration не создаёт
cluster role и никому не выдаёт `EXECUTE`.

Перед каждым эффектом wrapper проверяет свежий `session_user`:

- exact role name и OID;
- `LOGIN + NOINHERIT`, без superuser/create role/create DB/replication/bypass
  RLS и без role settings;
- zero memberships и grantor-memberships;
- zero owned relations/routines/types/schemas;
- zero direct relation/sequence ACL;
- database `CONNECT`, но без `CREATE/TEMPORARY`;
- schema `USAGE`, но без `CREATE`;
- ровно один direct routine `EXECUTE`, без grant option;
- `PUBLIC` не имеет `EXECUTE` на wrapper;
- ровно один effective `SECURITY DEFINER` в schema `public` — сам wrapper.

Любой drift возвращает SQLSTATE `42501`, application преобразует его в
`FOUNDER_OPERATOR_BETA_ACTIVATION_BOUNDARY_NOT_ENROLLED`, а tenant/GO/invite/
outbox не меняются.

## Production enrollment — ещё не выполнен

Этот шаг выполняется только после clean SHA/CI artifact и restored-copy
rehearsal:

1. В server-side secret manager создать отдельный случайный password; не
   записывать его в Git, backlog, task или shell history.
2. Cluster administrator создаёт exact роль с
   `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
   NOBYPASSRLS`.
3. На exact target DB подтвердить отсутствие `PUBLIC TEMPORARY`, schema CREATE,
   memberships/settings/ownership и лишних effective security-definer
   entrypoints.
4. Выдать роли только `USAGE ON SCHEMA public` и `EXECUTE` на exact wrapper
   signature; table/sequence/private-function grants запрещены.
5. Сохранить dedicated URL только в production secret storage, выполнить
   readiness под самой ролью и зафиксировать PII-free catalog digest.
6. Сначала deploy с `FOUNDER_OPERATOR_BETA_MODE=PREPARE`; `ACTIVE` включается
   отдельно на один заранее созданный Tenant B только после SMTP/readiness GO.

Пример формы grant, не готовая production-команда:

```sql
GRANT USAGE ON SCHEMA public
TO leetplus_founder_beta_activation_runtime;

GRANT EXECUTE ON FUNCTION
  public."founder_operator_beta_tenant_activate_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
TO leetplus_founder_beta_activation_runtime;
```

Команды нельзя применять, пока preflight не доказал все live invariants выше.

## Rollback

Порядок rollback:

1. вернуть mode в `PREPARE` или `DISABLED` и перезапустить API;
2. дождаться zero activation transactions и закрыть dedicated pool;
3. `REVOKE EXECUTE` exact wrapper у dedicated role;
4. повторно доказать отсутствие active GO/частичных activation effects;
5. password rotation или `DROP ROLE` выполнять только после отсутствия
   dependencies и с отдельным catalog check.

## Локальное evidence 17.08.2026

- config/database/service focused — `3 suites / 59 tests PASS`;
- identity-mail/onboarding — `18 suites / 477 tests PASS`;
- clean PostgreSQL 16 deploy — `183` migrations;
- restricted-role activation/replay/immutability — `1/1 PASS`;
- owner/superuser runtime assertion — denied;
- invalid business authority после успешного runtime assertion — denied;
- `INHERIT` drift и случайный `PUBLIC EXECUTE` — denied до activation effect;
- после восстановления exact ACL replay снова `REPLAYED`;
- роль видит ровно один effective public-schema `SECURITY DEFINER`;
- disposable DB и cluster role после каждого fixture удаляются без residue.

Это engineering acceptance, а не production enrollment и не разрешение
внешнего tester invite.
