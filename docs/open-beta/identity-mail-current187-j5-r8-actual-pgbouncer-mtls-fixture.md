# CURRENT187-J5-R8: actual PgBouncer mTLS fixture

Дата фиксации: 12.08.2026.

Статус: `IMPLEMENTED LOCALLY / EXACT-SHA CI PENDING / NO PRODUCTION EFFECT`.

## Цель

R7 ввёл exact client certificate/private-key input, но production path оставался
проверенным только dependency-backed unit seam. R8 заменяет прежний plaintext
synthetic PgBouncer CI fixture на actual двусторонний TLS-контур и вызывает
public collector, который единственный может выдать strict production-origin
J4 receipt.

[Официальная конфигурация PgBouncer](https://www.pgbouncer.org/config#client_tls_sslmode)
определяет `client_tls_sslmode=verify-full` как обязательный TLS с валидным
client certificate. `server_tls_sslmode=verify-full` дополнительно требует
валидный PostgreSQL server certificate и совпадение hostname.

## Disposable topology

Fixture в GitHub PostgreSQL job:

1. Создаёт одноразовый RSA CA в `RUNNER_TEMP`.
2. Выпускает server certificate с `serverAuth` и SAN для `127.0.0.1`/`localhost`.
3. Выпускает отдельный client certificate с `clientAuth` и PKCS#8 private key.
4. Копирует server trust material в service container, включает PostgreSQL SSL
   через `ALTER SYSTEM`, перезапускает disposable container и доказывает TLS
   через `pg_stat_ssl`.
5. Запускает PgBouncer с `client_tls_sslmode=verify-full` и
   `server_tls_sslmode=verify-full`.
6. Проверяет готовность PgBouncer только через client CA/certificate/key.
7. Передаёт integration test только три временных path; fixture root удаляется
   trap после завершения.

## Acceptance contract

Integration test:

- выполняет application query через mTLS, чтобы появился active backend pool;
- читает actual `SHOW VERSION/STATE/CONFIG/DATABASES/USERS/POOLS/SERVERS`;
- вычисляет baseline digest из actual rows;
- вызывает `collectCurrent187PgBouncerControlPlaneEvidence()` без dependency
  injection;
- требует generic и strict production-origin brands;
- требует transaction mode, active TLS backend mapping и deny-only flags;
- доказывает отсутствие client PEM, raw certificate/key SHA-256, usernames,
  passwords и database name в receipt;
- доказывает, что application login не получает PgBouncer admin console.
- доказывает, что TLS client без client certificate отклоняется.

## Текущая приёмка

- integration source `node --check`: `PASS`;
- fixture `bash -n` через Git for Windows: `PASS`;
- workflow/integration scoped Prettier: `PASS`;
- `git diff --check`: `PASS`.

Actual TLS/PostgreSQL/PgBouncer execution доступен только в Ubuntu CI job с
service container. До полного exact-SHA CI success этот документ не заявляет,
что mTLS fixture исполнен или принят.

Первый exact-SHA run `31619118015` на `cae1a205…` принят как отрицательная
диагностика, не как R8 evidence: CA/certificates, PostgreSQL TLS и PgBouncer
успешно поднялись, но readiness `psql` унаследовал глобальный CI `PGOPTIONS` с
`lock_timeout`; PgBouncer 1.22 fail closed отклонил unsupported startup option
до запуска integration tests. Successor явно удаляет `PGOPTIONS` только на
PgBouncer client boundary и сохраняет его для остальных PostgreSQL gates.

Второй run `31620377877` на `bdddabcd…` доказал actual TLS 1.3 на обоих
направлениях, application admin deny и missing-client-certificate deny (`2/3`
tests pass, `0` skip). Первый test остановился после actual `SHOW` rows только
на exact arity guard: mode-aware baseline helper требует явный третий аргумент
`syntheticOnly=false`. Successor добавляет этот data-only аргумент; runtime и
TLS-контракт не ослабляются.

Третий run `31621608778` на `eabcae29…` снова подтвердил actual TLS и оба deny,
но production collector корректно отверг loopback literal в admin URL. Successor
не ослабляет этот guard: fixture временно связывает выделенное имя
`pool.current187.invalid` с `127.0.0.1`, включает его в server SAN и
восстанавливает исходный `/etc/hosts` в trap.

## Ограничение результата

R8 закрывает только actual J4 mTLS evidence. Он ещё не собирает в одном процессе
strict J1/J2 receipts для четырёх service purpose, J3 и J4 и не запускает через
них production connection-probe runner. Следующий gate — такой co-located
public-collector topology run, затем protected signer/key/root, canonical
ledger/runtime roles и restored-copy apply/rollback/zero-diff.

Production, текущая сеть из четырёх клубов, внешний tenant/tester, invites и
providers не изменяются. Внешний тестовый доступ остаётся `NO-GO`.
