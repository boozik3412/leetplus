# CURRENT187-J: network/runtime attestation foundation

Дата фиксации: 10.08.2026
Статус: `EXACT-HEAD CI ACCEPTED / SYNTHETIC-CI-ONLY / DENY-ONLY / NOT DEPLOYABLE`

## Зачем нужен этот слой

CURRENT187-F–I связывают cluster catalog, semantic allowlist и persisted
consumption/revocation, но сами по себе не доказывают, по какому фактическому
сетевому пути подключаются application, migration, coordinator и worker.
CURRENT187-J фиксирует точный контракт для следующих обязательных production
доказательств:

- endpoint identity фактического соединения;
- TLS `verify-full` и identity peer;
- matched HBA rule без `trust` и wildcard client policy;
- pooler mapping и безопасный pooling mode;
- отдельная service-account identity для каждого назначения;
- положительный probe разрешённого пути и отрицательный probe запрещённого;
- внешнее host/control-plane evidence, которое независимо связывает probe с
  конфигурацией HBA, TLS, pooler и service-account policy.

## Реализованная граница

Код:

- `packages/database/scripts/identity-mail-cluster-network-runtime-attestation-current187.mjs`;
- `packages/database/scripts/identity-mail-cluster-network-runtime-attestation-current187.test.mjs`.

Foundation принимает две разные branded receipts:

1. synthetic network probe по точному набору `APPLICATION`, `COORDINATOR`,
   `MIGRATION`, `WORKER`;
2. synthetic host/control-plane attestation, привязанный к exact probe digest,
   release SHA, cluster identity, database universe и challenge.

При совпадении он детерминированно формирует пять digest-полей, уже
предусмотренных production deployment envelope:

- `networkEndpointDigest`;
- `tlsDigest`;
- `hbaDigest`;
- `poolerDigest`;
- `serviceAccountMappingDigest`.

Для advisory-lock и migration путей закреплён `SESSION` pooling; для обычного
application пути допускается `TRANSACTION`. Для всех путей обязательны
`VERIFY_FULL`, безопасный HBA auth method (`scram-sha-256` либо `cert`) и обе
probe-стороны. Backend identity, pooler mapping, secret reference и
`application_name` обязаны быть попарно различны между четырьмя назначениями.

## Security свойства

- Все входы exact-shape, data-only, без accessors, symbols, sparse arrays и
  Proxy.
- В receipts отсутствуют URL, пароли, PEM, email и сырые role/secret names;
  разрешены только non-zero SHA-256 bindings и exact release SHA.
- Plain-object clone не пересекает ни network, ни host-control brand boundary.
- `trust`, неполный TLS, wildcard HBA, collapsed pooler user, collapsed service
  account, неверный pool mode и отсутствующий negative probe fail closed.
- Модуль не импортирует filesystem, process, environment, network, Prisma или
  provider capability.
- Все результаты имеют:
  `authorization=false`, `canMutate=false`, `canSend=false`,
  `productionRootEnrolled=false`, `productionRuntimeAttested=false`,
  `testAccessAuthorized=false`, `sharedBetaAccess=false`.

## Принятое evidence

- standalone syntax + unit: `10/10`;
- обязательный CURRENT187 acquisition/semantic/policy gate после включения J:
  `42/42`, `0` failures;
- Prettier: green;
- exact candidate commit: `04ffff278f944423228d9f39cdf396d5e9ffec5c`;
- GitHub CI run `31420665364`: `3/3 SUCCESS` — authority root trust gate,
  PostgreSQL migration smoke `60/60` и Application checks `122/122`;
- artifact `leetplus-release-04ffff278f944423228d9f39cdf396d5e9ffec5c`,
  ID `9075501569`, digest
  `sha256:0cb6ac6ebeaa0fd03e249cbda84d12fe2dc937bc6db065b0b9648b12738bd337`;
- production, `Tenant A/A1..A4` и внешний tester не изменялись.

## Что J пока намеренно не делает

CURRENT187-J не выдаёт production attestation и не должен подменять его:

- обе входные receipts создаются только функциями с явным суффиксом
  `ForTestOnly` и принимают только `environment=ci`;
- нет реального TCP connection, TLS handshake, backend PID/session identity,
  HBA rule acquisition или pooler control-plane query;
- нет независимого production signer, pinned root, persisted replay/revocation
  ledger и freshness/reload epoch acquisition;
- J5-R4 переносит persisted probe digests в отдельный synthetic deny-only
  successor receipt, но F ещё не принимает его как production runtime evidence;
- CURRENT187-I всё ещё требует независимого latest-byte review;
- canonical promotion и restored-copy apply/rollback/zero-diff не выполнены.

## Следующий этап

1. Реализовать capability-bearing read-only collectors отдельно для каждого из
   четырёх service identities и независимо подписанный host/control-plane
   collector.
2. Добавить bounded timeline, nonce/challenge, persisted one-time consumption,
   revoke/reload epoch и lost-response handling.
3. Выполнить actual PostgreSQL/PgBouncer hostile matrix: wrong CA/hostname,
   plaintext, `trust`, wildcard, user collapse, wrong database/role, pool-mode
   mismatch, stale HBA reload и cross-release replay.
4. Сделать R4 обязательным branded successor-policy input после CURRENT187-F;
   production вариант должен принимать только canonical ledger и enrolled root,
   не изменяя frozen deploy authority задним числом.
5. После independent latest-byte review выполнить canonical promotion и
   restored-copy rehearsal. До этого внешний доступ остаётся `NO-GO`.
