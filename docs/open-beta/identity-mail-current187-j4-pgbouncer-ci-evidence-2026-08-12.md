# CURRENT187-J4 actual PgBouncer exact-SHA CI evidence — 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL DISPOSABLE PGBOUNCER / DENY-ONLY / NOT DEPLOYABLE`.

## Принятый candidate

- exact commit SHA: `b9296430ffb5876e3db79c37215de414dbf05799`;
- GitHub Actions run: `31591848857` (`run #127`);
- Authority root trust gate: `SUCCESS`;
- Application checks: `SUCCESS`;
- PostgreSQL migration smoke: `SUCCESS`;
- `Install disposable CURRENT187 PgBouncer fixture`: `SUCCESS`;
- `Verify CURRENT187 actual PgBouncer stats-only control plane`: `SUCCESS`;
- release artifact: `leetplus-release-b9296430ffb5876e3db79c37215de414dbf05799`;
- artifact ID: `9139703278`;
- artifact digest:
  `sha256:01f3aba16faf57a24308bbffd0a839aff65aa9691b21969a1e284c004922d776`.

## Что доказано

CI устанавливает exact Ubuntu package `pgbouncer=1.22.0-1build4`, поднимает
одноразовый loopback-only process и проверяет реальным PostgreSQL simple query
protocol:

- `SHOW VERSION`, `SHOW STATE`, `SHOW CONFIG`, `SHOW DATABASES`, `SHOW USERS`,
  `SHOW POOLS` и `SHOW SERVERS`;
- exact `SHOW STATE` projection `active=yes`, `paused=no`, `suspended=no`;
- SCRAM-аутентификацию stats-only observer и application identity;
- global/database/user/runtime transaction pool mode;
- отсутствие `force_user`, disabled/paused database и stale `close_needed`
  server mapping;
- exact application database/user/backend address/port mapping;
- успешный application `SELECT` через pooler;
- отказ application identity во входе в PgBouncer admin database.

Локальный aggregate CURRENT187 gate для принятого source: `79/79 PASS`; J4
unit: `8/8 PASS`; actual process integration: `2/2 PASS`. Fixture удаляется
trap-обработчиком и не пишет секреты в release artifact или receipt.

## Ограничение доказательства

Fixture является synthetic CI topology: loopback, TLS отключён, test-only
credentials и `stats_users`. Он подтверждает protocol/runtime совместимость J4,
но не production topology. Receipt остаётся unsigned process-local brand и
сохраняет `productionRootEnrolled=false`, `productionRuntimeAttested=false`,
`negativeProbePerformed=false`, `authorization=false`, `canMutate=false`,
`canSend=false`, `testAccessAuthorized=false`, `sharedBetaAccess=false`.

До production acceptance остаются четыре production J1/J2 service runs,
отдельные J3/J4 control runs, independently signed positive/negative connection
matrix, production root/signer и persisted consumption/revocation, binding в
CURRENT187-F/deploy authority, independent latest-byte review и restored-copy
rehearsal. Production, текущая сеть из четырёх клубов, внешний tenant/tester,
invites и providers этим run не изменялись.
