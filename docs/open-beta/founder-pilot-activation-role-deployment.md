# Founder pilot: restored-copy activation role deployment

Статус:
`ENGINEERING IMPLEMENTED / UNIT 6/6 + SYNTHETIC PG FULL LIFECYCLE PASS / PRODUCTION NO-GO`.

Контракт `FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_V1` управляет только
dedicated ролью `leetplus_founder_beta_activation_runtime` на изолированной
restored copy. Он не является production deploy authority и не включает owner
route, mail worker или внешний tenant.

## Режимы

- `plan` — fresh branded restored-copy preflight и secret-free exact plan;
- `apply` — transactional apply с advisory lock, fresh catalog recheck и
  обязательным receipt;
- `check` — read-only live attestation роли, ACL, marker и target identity;
- `rollback` — exact receipt-bound удаление роли и восстановление исходных
  `PUBLIC TEMPORARY`/`public CREATE` значений.

Повторный `apply` после commit/lost response возвращает
`ACTIVATION_ROLE_APPLY_RECONCILED`. Повторный `rollback` возвращает
`ACTIVATION_ROLE_ROLLBACK_RECONCILED`. Неизвестная роль, marker mismatch,
catalog drift, active session или receipt conflict дают `BLOCKED_MANUAL` без
blind repair.

## Exact authority

После apply роль обязана иметь:

- `LOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOREPLICATION`, `NOBYPASSRLS`;
- connection limit `4` и `VALID UNTIL`, равный deadline restored copy;
- zero memberships, role settings, default ACL, ownership, cross-database
  dependency и direct privilege на любой другой database;
- ровно один direct `CONNECT` к target database;
- ровно один direct `USAGE` к `public`;
- ровно один direct `EXECUTE` без grant option на
  `founder_operator_beta_tenant_activate_v2`;
- zero relation/type privileges и ровно один effective application
  `SECURITY DEFINER`;
- zero runtime/other target sessions во время apply/check/rollback;
- exact JSON role comment marker, привязанный к release SHA, restored-copy
  manifest, migration digest, operation ID, preflight evidence и catalog
  digest.

Owner connection заново доказывает superuser, loopback/non-5432 target,
PostgreSQL system identifier, database/owner identity, exact migration state и
wrapper posture.

## Пароль

Raw role password передаётся только через
`FOUNDER_PILOT_ACTIVATION_ROLE_SECRET` и обязан быть base64url-строкой длиной
`32..128`. Controller локально вычисляет PostgreSQL SCRAM-SHA-256 verifier с
новой 128-bit salt. В SQL попадает verifier, а не raw password. Receipt, role
marker и CLI output содержат только SHA-256 verifier digest.

Пример apply:

```powershell
$env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL = 'postgresql://postgres:<owner-secret>@127.0.0.1:55439/leetplus_restored_founder_a1'
$env:FOUNDER_PILOT_ACTIVATION_ROLE_SECRET = '<32-128 base64url characters>'
pnpm --filter database founder-pilot:activation-role-deployment -- `
  --mode apply `
  --manifest 'C:\absolute\path\manifest.json' `
  --operation-id '<uuid-v4>' `
  --receipt-out 'C:\absolute\protected\activation-role-receipt.json'
Remove-Item Env:FOUNDER_PILOT_ACTIVATION_ROLE_SECRET
Remove-Item Env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL
```

Receipt secret-free, но остаётся recovery authority и хранится вне Git/logs.
Rollback требует тот же manifest, operation ID и receipt.

## Synthetic PostgreSQL evidence 17.08.2026

На отдельном PostgreSQL 16.14 (`127.0.0.1:55439`) и clone локальной CI DB с
`183` migrations принята последовательность:

```text
ACTIVATION_ROLE_DEPLOYMENT_PLAN
  → ACTIVATION_ROLE_APPLIED
  → ACTIVATION_ROLE_ATTESTED
  → ACTIVATION_ROLE_APPLY_RECONCILED
  → ACTIVATION_ROLE_ROLLED_BACK
  → ACTIVATION_ROLE_ROLLBACK_RECONCILED
```

Принятые digests:

- catalog:
  `4e5cb79125fa3c99983132e5356332cd93ff8c9096aedc9b99f7919bf31cbe4d`;
- apply receipt:
  `f46e03418541c318aa39742143a9e7ddd22e757a3701a1509c3b3fbe4caa66ac`.

После rollback роль отсутствовала; исходные `PUBLIC TEMPORARY=true` и
`public CREATE=false` восстановлены. Synthetic DB, manifest, dump, archive,
receipt и log удалены; отдельный cluster остановлен, сохранённый data directory
не удалялся.

Fixture использовал local `trust` HBA, поэтому реальный password handshake ещё
не принят. Криптографическое соответствие raw secret ↔ stored SCRAM verifier
проверено controller, но production-like HBA/TLS/SCRAM login, pool URL и live
API call остаются следующим обязательным этапом.

Сам grant на target database не отменяет возможный унаследованный
`PUBLIC CONNECT` к другим базам того же PostgreSQL cluster. До readiness HBA
обязан разрешать этой роли подключение только к exact restored target database,
а live acceptance обязан отдельно доказать отказ для другой database и успешный
SCRAM-login только по dedicated pool URL. Текущий synthetic lifecycle этого не
доказывает.

## Что ещё не разрешено

- production role/secret/grant;
- production backup restore или migration;
- `FOUNDER_OPERATOR_BETA_MODE=ACTIVE`;
- owner invite и SMTP send;
- внешний `Tenant B/Store B1` или tester account.
