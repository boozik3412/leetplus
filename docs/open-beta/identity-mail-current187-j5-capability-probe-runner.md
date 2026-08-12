# CURRENT187-J5-R1: capability-bearing connection-probe runner

Дата фиксации: 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL DISPOSABLE WIRE+TLS FIXTURE / DENY-ONLY / NOT DEPLOYABLE`.

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

- runner adversarial tests: `10/10 PASS`;
- J5 verifier + runner: `20/20 PASS`;
- actual disposable PostgreSQL wire/TLS integration: `1/1 PASS`;
- integration counters: 20 TCP attempts, 4 plaintext rejects, 16 PostgreSQL
  SSLRequest/TLS attempts и 8 post-handshake PostgreSQL error responses;
- aggregate CURRENT187 gate: `99/99 PASS`;
- database typecheck: `PASS`;
- syntax и Prettier: `PASS`.

Exact-SHA candidate
`e4789e29e1072fe81d43d31543a53bb88afb7d7d` принят GitHub Actions run
`31597872402`: все `3/3` job завершены `SUCCESS`, обязательный actual negative
connection probe step — `SUCCESS`. Release artifact ID `9142149284`, digest
`sha256:1fb76259ee66dd9b45219a6d8651ec0c1853dfb7583e3fd29a9d1731f3fdd85f`.
Полная фиксация: [J5-R1 CI evidence](./identity-mail-current187-j5-r1-ci-evidence-2026-08-12.md).

R6 локально добавляет отдельный production-origin fence. Dependency-backed
production-mode J1–J4 receipts больше не получают strict brands, которые
потребляет production runner. Второй integration scenario строит все четыре
J1/J2 receipts и J3/J4 chain через test seams и доказывает их отказ до network
I/O с zero counters. Integration теперь `2/2 PASS`; actual co-located topology
остаётся обязательной.

## Что ещё требуется

1. production-like четыре-service execution, которое объединяет actual branded
   J1–J4 receipts с этим runner; текущий wire/TLS harness не является actual
   HBA/PgBouncer topology;
2. file-backed signer boundary реализован J5-R2; остаются external key ceremony,
   OS ACL или HSM/KMS и reviewed production public-root enrollment;
3. J5-R3 contract реализован локально; остаются PostgreSQL append-only/FORCE
   RLS/execute-only RPC и hostile replay/expiry/race/lost-response acceptance;
4. branded J5 verification receipt в CURRENT187-F/deploy authority;
5. independent latest-byte review и restored-copy rehearsal.

Production, `Tenant A/A1..A4`, внешний tenant/tester, invites и providers не
изменялись. Внешний доступ остаётся `NO-GO`.
