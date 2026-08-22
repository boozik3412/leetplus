# CURRENT187-J1 — exact-SHA CI evidence

Дата приёмки: 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL POSTGRESQL SESSION / DENY-ONLY / NO-GO`.

## Принятый checkpoint

- Кодовое исправление: `299a3a3abd03f45a207800768947c5662943e037`.
- Exact CI head: `a9513c69048a6840dad846c2a19843f3ded516e6`.
- GitHub Actions run: `31577001152`.
- Результат: `3/3 SUCCESS`:
  - `Authority root trust gate` — `SUCCESS`;
  - `Application checks` — `SUCCESS`;
  - `PostgreSQL migration smoke` — `SUCCESS`.
- PostgreSQL step
  `Verify CURRENT187 actual Prisma PostgreSQL backend session identity` —
  `SUCCESS` на фактической Prisma backend-сессии одноразовой PostgreSQL CI базы.
- Release artifact:
  `leetplus-release-a9513c69048a6840dad846c2a19843f3ded516e6`.
- Artifact ID: `9133854973`.
- Artifact digest:
  `sha256:8e0c26f50a13eb00b0ebe69d0ed061271ffd862573d802cabe60ba3c60e4d334`.

## Исправления перед приёмкой

Два предыдущих run не являются evidence:

- `31508562165` на `9ea82c478b65bb43851a4ae88c154a1e8ad6909d`
  отклонил SQL alias `current_role`, конфликтующий с PostgreSQL expression;
- `31511448453` на `890f0baf2a20e5f2aadda4c9c44578c23672d11f`
  прошёл исправленный alias, но J1 fail-closed остановился на неверном имени
  поля `pg_stat_ssl.serial`.

Принятый код использует exact PostgreSQL поле `pg_stat_ssl.client_serial`,
закрепляет его unit-регрессией и проверяет отсутствие database credential,
database name и role name только среди значений receipt. Это исключает ложное
совпадение секрета `postgres` с именем ключа `postgresSessionReceiptDigest`.

Локальная проверка перед push:

- CURRENT187 acquisition/semantic/policy gate: `53/53 PASS`;
- database typecheck: `PASS`;
- Prettier: `PASS`;
- `git diff --check`: `PASS`.

## Граница доказательства

Этот checkpoint доказывает только capability-bearing read-only сбор фактов
фактической PostgreSQL backend-сессии через Prisma: database/role identity,
application name, backend/network coordinates, read-only state, negotiated
backend TLS facts, role policy и положительный `SELECT` probe.

Он не доказывает client-side endpoint identity, TLS peer hostname/CA, exact
matched HBA rule, PgBouncer identity/pool mode, отрицательные probes или
разделение четырёх production service identities. Поэтому все поля
`endpointIdentityAttested`, `hbaRuleMatched`, `poolerIdentityObserved`,
`negativeProbePerformed`, `productionRuntimeAttested`, `authorization`,
`testAccessAuthorized` и `sharedBetaAccess` остаются `false`.

Production, `Tenant A/A1..A4`, внешний tenant, tester account, invite и
providers не изменялись. Этот CI не является deployment GO; внешний тестовый
доступ остаётся `NO-GO`.
