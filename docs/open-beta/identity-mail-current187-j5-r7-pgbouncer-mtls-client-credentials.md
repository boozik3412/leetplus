# CURRENT187-J5-R7: PgBouncer client mTLS credentials

Дата фиксации: 12.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / NO PRODUCTION EFFECT / NOT DEPLOYABLE`.

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

Exact SHA `5f2b529af8d957909806252edf122c04058a40a2` принят GitHub Actions run
`31617615666`: все `3/3` jobs завершены `SUCCESS`. Artifact ID `9150250522`,
digest `sha256:77b3e24a6590e8b3e24b9c37755df948be6b304141db649b40b49030ea360b0a`.
Полная фиксация: [R7 CI evidence](./identity-mail-current187-j5-r7-ci-evidence-2026-08-12.md).

## Что остаётся до следующего gate

R8 сначала обязан принять actual J4 connection через disposable PostgreSQL,
PgBouncer и client CA/certificate/key, используя public collector и strict
production-origin brand. После этого отдельный co-located topology run в одном
процессе через public actual collectors собирает strict J1/J2 для четырёх
service purpose, J3 и J4, а production runner выполняет положительные проверки
и всю negative matrix. До этого R7 не считается production-like topology
evidence.

Далее отдельно обязательны protected production signer/key/root, canonical
ledger/runtime roles, restored-copy apply/rollback/zero-diff и независимая
приёмка. Production, текущая сеть из четырёх клубов, внешний tenant/tester,
invites и providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.
