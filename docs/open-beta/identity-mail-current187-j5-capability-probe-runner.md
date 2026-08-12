# CURRENT187-J5-R1: capability-bearing connection-probe runner

Дата фиксации: 12.08.2026

Статус: `ENGINEERING ACCEPTED LOCALLY / SYNTHETIC CAPABILITIES / DENY-ONLY / NOT DEPLOYABLE`.

## Назначение

R1 соединяет J1–J4 evidence с J5 signed-matrix contract. Production entry
принимает только process-branded J1 PostgreSQL session, J2 endpoint/TLS, J3
HBA/reload и J4 PgBouncer receipts одного exact release/cluster/database
universe. До первой новой сетевой попытки проверяются:

- четыре service purpose в порядке `APPLICATION`, `COORDINATOR`, `MIGRATION`,
  `WORKER`;
- `POOLER/TRANSACTION` только для application и `DIRECT_DATABASE/SESSION` для
  остальных purpose;
- `VERIFY_FULL`, безопасный HBA method, actual source DB/network I/O в J1/J2;
- связность J1↔J2 и J3↔J4 receipts;
- pairwise-distinct application name, backend identity, secret reference и
  pooler mapping.

## Выполняемая матрица

Runner связывает четыре уже выполненных положительных J1/J2 probes и выполняет
20 отрицательных PostgreSQL connection attempts — по пять на каждый service
purpose:

1. wrong role;
2. wrong database;
3. plaintext transport;
4. wrong CA;
5. wrong hostname.

Успешное соединение, неизвестный код отказа, exception без классифицированного
результата или ошибка закрытия соединения приводят к fail-closed. В receipt не
копируются connection URL, логин, пароль, CA, hostname, database name или текст
ошибки; остаются только purpose/scenario/outcome и domain-separated digests.

Оставшиеся 12 negative outcomes — stale HBA, wrong pool mode и pooler/service
identity collapse для каждого purpose — проверяются как детерминированные
control-policy candidates относительно branded J3/J4 и pairwise-distinct J1
state. Runner намеренно не редактирует production `pg_hba.conf` или PgBouncer
configuration ради отрицательного теста.

Итог: 4 positive bindings + 20 actual negative connection attempts + 12
control-policy negative evaluations = 36 probe outcomes.

## Capability boundary

- production runner имеет только `pg.Client` connection capability;
- signer, private key, filesystem, child process, Prisma и ambient env
  capability отсутствуют;
- test dependency injection требует отдельный exact CI context;
- production path отклоняет plain/cloned synthetic receipts до network I/O;
- receipt process-local branded, deep-frozen и secret-free;
- все effect/access flags остаются false.

Runner формирует `probeTranscriptDigest` и структуру `services`, пригодную для
передачи независимому signer J5. Сам runner ничего не подписывает и не может
объявить production runtime принятым.

## Локальная приёмка

- runner adversarial tests: `9/9 PASS`;
- J5 verifier + runner: `19/19 PASS`;
- aggregate CURRENT187 gate: `98/98 PASS`;
- database typecheck: `PASS`;
- syntax и Prettier: `PASS`.

## Что ещё требуется

1. actual disposable TLS/HBA/PgBouncer integration fixture для всех 20 network
   negative attempts и 12 control-policy candidates;
2. затем production-like четыре-service execution;
3. отдельный protected signer/HSM и production public-root enrollment;
4. persisted one-time consumption/revocation с replay/expiry/lost-response;
5. branded J5 verification receipt в CURRENT187-F/deploy authority;
6. independent latest-byte review и restored-copy rehearsal.

Production, `Tenant A/A1..A4`, внешний tenant/tester, invites и providers не
изменялись. Внешний доступ остаётся `NO-GO`.
