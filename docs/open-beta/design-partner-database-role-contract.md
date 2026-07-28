# Design partner: PostgreSQL runtime-role contract

| Поле                | Значение                                           |
| ------------------- | -------------------------------------------------- |
| Статус              | CI evidence candidate; не production provisioning  |
| Контур              | Только отдельная PostgreSQL БД Tenant D / Store D1 |
| Проверка            | PostgreSQL 16 migration-smoke                      |
| Production Tenant A | Не изменяется и не используется                    |

Этот контракт отделяет migration/provisioning identity от API runtime identity.
Он не заменяет физическую изоляцию БД и не разрешает выдачу credentials.

> Важно: текущий CI smoke является только DML-совместимым baseline и выдаёт
> broad DML на application tables. Его нельзя копировать в deployment как
> финальный grant script. До Gate 1DP обязательны table/column/row invariants,
> которые делают Tenant lifecycle и bootstrap OWNER override read-only,
> provisioning receipts append-only, а signed invite token hash неизменяемым.
> Это зафиксировано как `BETA-DP-012`; пока задача не закрыта, статус `NO-GO`.

## Обязательная роль runtime

Runtime login-role должна иметь:

- `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
NOBYPASSRLS`;
- `CONNECT` к отдельной partner database, проверяемой этим контрактом;
- `USAGE` на schema `public`;
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` на application tables;
- только `SELECT` на `public."_prisma_migrations"` для API readiness;
- `USAGE`, `SELECT` на application sequences.

Runtime login-role не должна:

- владеть database, schema, table, view, sequence или function;
- состоять в другой роли либо иметь участников;
- иметь database/schema `CREATE`, database `TEMPORARY`, table `TRUNCATE`,
  `REFERENCES`, `TRIGGER`, sequence `UPDATE` или любой DDL;
- иметь grant option;
- изменять `public."_prisma_migrations"` либо получать к ней любое право,
  кроме readiness-only `SELECT`;
- иметь credentials, route или membership к PostgreSQL текущей сети Tenant A.

PostgreSQL role является cluster-wide, а `PUBLIC CONNECT` к служебным databases
зависит от конфигурации кластера. Поэтому этот smoke доказывает exact boundary
только для текущей partner database. Отсутствие иных полезных database targets,
network route и production data обеспечивается отдельным dedicated
cluster/network и остаётся обязательным deployment gate.

Миграции выполняются отдельной временной identity. После каждой миграции exact
runtime grants должны быть повторно применены и проверены до переключения API
на новый release. API `DATABASE_URL` содержит только restricted runtime-role;
migration/provisioning URL отсутствует в environment API, web и standalone
processes.

## Что проверяет CI smoke

Скрипт
[`design-partner-runtime-role-smoke.mjs`](../../packages/database/scripts/design-partner-runtime-role-smoke.mjs)
запускается после всех Prisma migrations на реальном PostgreSQL 16 и:

1. допускает только loopback PostgreSQL, отдельную БД с суффиксом `_ci`,
   `schema=public`, non-production process и точную confirmation phrase;
2. создаёт случайную disposable runtime-role и owned-by-admin fixture table;
3. выдаёт exact grants на текущий migrated catalog, исключая
   `"_prisma_migrations"`;
4. проверяет role attributes, отсутствие ownership/membership/grant option,
   exact DML coverage, read-only `_prisma_migrations` и запрет лишних
   table/sequence privileges;
5. через отдельное соединение runtime-role читает migration readiness и
   выполняет `INSERT → SELECT → UPDATE → DELETE`;
6. доказывает отказ `CREATE TABLE`, `CREATE TEMP TABLE`, `CREATE SCHEMA`,
   `ALTER`, `TRUNCATE`, `DROP`, `SET ROLE postgres` и `CREATE ROLE`;
7. удаляет fixture и role и восстанавливает исходные `PUBLIC`
   database/schema privileges.

Smoke не создаёт production role, не меняет deployment и не доказывает
cross-database либо network isolation. Его зелёный результат является только
bounded evidence для пункта database-role в Gate 1DP.

## Команды

Статическая проверка без PostgreSQL:

```bash
pnpm --filter database check:design-partner-runtime-role
```

Disposable real-PostgreSQL smoke:

```bash
DESIGN_PARTNER_RUNTIME_ROLE_SMOKE_CONFIRM=run-design-partner-runtime-role-smoke \
pnpm --filter database db:smoke:design-partner-runtime-role
```

`DATABASE_URL` передаётся через защищённый process environment и должен
указывать только на disposable loopback `*_ci` database. URL и пароль не
передаются в аргументах и не выводятся в evidence.

## Gate 1DP evidence

Перед выдачей доступа сохранить:

- exact candidate SHA и CI run URL;
- PostgreSQL major version;
- зелёный migration-smoke и runtime-role smoke;
- вне CI — identity digest фактической partner runtime-role и проверку exact
  grants после последней migration;
- отдельное доказательство dedicated cluster/database topology и отсутствия
  иных useful database targets, network route и credentials к Tenant A;
- approver, время проверки и rollback owner.

До проверки фактической deployment-role пункт B launch checklist остаётся
неотмеченным, даже если synthetic CI smoke зелёный.
