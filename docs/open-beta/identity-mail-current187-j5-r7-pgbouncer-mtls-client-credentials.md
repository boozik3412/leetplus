# CURRENT187-J5-R7: PgBouncer client mTLS credentials

Дата фиксации: 12.08.2026.

Статус: `ENGINEERING ACCEPTED LOCALLY / NO PRODUCTION EFFECT / NOT DEPLOYABLE`.

## Закрытый разрыв

Production J4 проверяет `client_tls_sslmode=verify-full`, но до R7 actual
collector передавал PgBouncer только CA, server name и пароль. Такой вход не
мог пройти topology, где PgBouncer действительно требует client certificate.
Согласно [официальной TLS-конфигурации PgBouncer](https://www.pgbouncer.org/config#client_tls_sslmode),
`verify-ca` и `verify-full` требуют от клиента валидный сертификат.

R7 добавляет в exact production input:

- `clientCertificatePem` и его exact SHA-256;
- `clientPrivateKeyPem` в PKCS#8 `PRIVATE KEY` и его exact SHA-256;
- bounded размер и строгую однозначную PEM-форму;
- отдельный domain-separated aggregate binding digest.

Synthetic input обязан передать exact `null` во всех четырёх полях. Отсутствие,
лишний перевод строки, digest drift, другой PEM kind и любая частичная
конфигурация отклоняются до подключения.

## Граница секретов

Certificate и private key передаются только в `pg.Client.ssl` вместе с CA,
`rejectUnauthorized=true` и exact `servername`. Public receipt содержит только
`clientCredentialBindingDigest` и не содержит:

- PEM certificate/private key;
- исходные certificate/private-key SHA-256;
- пароль из admin URL;
- detail исключения TLS/driver.

Парсинг certificate/key и доказательство совпадения пары окончательно
выполняются TLS stack при actual public-collector connection. Dependency-backed
test seam не получает strict production-origin brand после R6 и не может
подменить такой actual I/O результат.

## Локальная приёмка

- J4 unit/contract: `9/9 PASS`;
- aggregate CURRENT187: `125/125 PASS`;
- actual disposable wire/TLS runner integration: `2/2 PASS` без skip;
- database typecheck: `PASS`;
- secret projection assertions: PEM и два raw SHA-256 отсутствуют в receipt;
- production-origin fence: dependency-backed production-mode receipts остаются
  non-admissible до network I/O.

Это локальная инженерная приёмка. Exact commit SHA, GitHub Actions run и
SHA-bound artifact фиксируются только после push и полного завершения CI.

## Что остаётся до следующего gate

Следующий этап создаёт disposable/restored co-located topology с настоящими
PostgreSQL, PgBouncer и client CA/certificate/key. В одном процессе через public
actual collectors должны быть собраны strict J1/J2 для четырёх service purpose,
J3 и J4, после чего production runner выполняет положительные проверки и всю
negative matrix. До этого R7 не считается production-like topology evidence.

Далее отдельно обязательны protected production signer/key/root, canonical
ledger/runtime roles, restored-copy apply/rollback/zero-diff и независимая
приёмка. Production, текущая сеть из четырёх клубов, внешний tenant/tester,
invites и providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.
