# CURRENT187-J3/J4: HBA/reload and PgBouncer control-plane collectors

Дата фиксации: 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL READ-ONLY CONTROL-PLANE I/O / DENY-ONLY / NOT DEPLOYABLE`.

## CURRENT187-J3 — PostgreSQL HBA file and reload clock

J3 выполняет capability-bearing read-only PostgreSQL transaction и читает:

- exact control database/role name+OID и `application_name`;
- `pg_hba_file_rules` в `rule_number` order;
- `pg_conf_load_time()` и `pg_postmaster_start_time()`.

Коллектор запрещает parse errors, `trust`, `host`/`hostnossl`, MD5/plaintext и
внешние auth providers, wildcard/same-role/regex/group selectors, identity maps
и wildcard remote address. Exact file catalog сравнивается с заранее
зафиксированным SHA-256, reload clock обязан быть свежее challenge boundary.

Критическая граница: PostgreSQL документирует, что `pg_hba_file_rules`
показывает текущие bytes файлов, а не конфигурацию, последней загруженную
сервером. Поэтому J3 намеренно оставляет
`hbaCatalogLoadedAttested=false`, `hbaCatalogEffectiveAttested=false`,
`reloadEpochAttested=false` и `hbaRuleMatched=false`. Effective rule сможет
доказать только отдельная матрица реальных positive/negative connection probes.

J3 acceptance:

- adversarial unit `8/8 PASS`;
- actual PostgreSQL integration подключён к CI и допускает два честных исхода:
  narrow catalog receipt либо fail-closed отказ unsafe disposable fixture;
- exact SHA `ceed72398959a2ae22b0266557143e5e63c1817a`, CI
  `31586755130` — `3/3 SUCCESS`, actual HBA step `SUCCESS`, artifact
  `sha256:faf8c3e279c1388c38672a9fbdfd557771aa441d5a3c5d25e4440db48abaa283`;
- source не вызывает `pg_reload_conf()` и не изменяет HBA/configuration.

## CURRENT187-J4 — PgBouncer admin control plane

J4 использует отдельный закреплённый `pg@8.16.3`, потому что PgBouncer admin
console поддерживает только PostgreSQL simple query protocol. Коллектор выполняет
только:

- `SHOW VERSION`;
- `SHOW STATE`;
- `SHOW CONFIG`;
- `SHOW DATABASES`;
- `SHOW USERS`;
- `SHOW POOLS`;
- `SHOW SERVERS`.

Проверяются active state, global/database/user/runtime transaction pool mode,
SCRAM/HBA auth type, client/server verify-full TLS в production, exact backend
database/host/address/port, отсутствие `force_user`, отсутствие paused/disabled
database и `close_needed` server, exact application database/user pair и
нулевые named prepared statements для transaction pooling.

J4 acceptance:

- adversarial unit `7/7 PASS`;
- общий CURRENT187 gate с J1–J4 `78/78 PASS`;
- database typecheck `PASS`;
- collector candidate принят тем же exact-SHA CI `31586755130`;
- protocol-accurate disposable PgBouncer `stats_users` fixture реализуется
  следующим отдельным candidate, потому что в принятом SHA actual pooler
  process ещё отсутствует.

## Authority boundary

Оба receipt secret-free и branded только process-local WeakSet. Оба оставляют
`productionRootEnrolled=false`, `productionRuntimeAttested=false`,
`negativeProbePerformed=false`, `authorization=false`, `canMutate=false`,
`canSend=false`, `testAccessAuthorized=false`, `sharedBetaAccess=false`.

J3/J4 ещё не имеют независимого production signer/root, persisted one-time
consumption/revocation или lost-response reconciliation и не композируются в
CURRENT187-F/deploy authority.

## Оставшийся P0-путь

1. Принять protocol-accurate disposable PgBouncer admin-console integration.
2. Выполнить четыре production J1/J2 runs и отдельные J3/J4 control runs.
3. Принять positive/negative connection matrix для exact HBA rule, wrong
   role/database, plaintext, wrong CA/hostname, stale reload, wrong pool mode и
   user collapse.
4. Добавить independent production signer/root, freshness, persisted one-time
   consumption/revocation и reconciliation.
5. Связать только полный signed J receipt с CURRENT187-F/deploy authority и
   выполнить independent latest-byte review + restored-copy rehearsal.

Production, текущие четыре клуба, внешний tenant/tester, invites и providers не
изменялись. Внешний доступ остаётся `NO-GO`.
