# CURRENT187-J2: endpoint and TLS peer collector

Дата фиксации: 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL TCP + POSTGRESQL SSLREQUEST + TLS PEER / DENY-ONLY / NOT DEPLOYABLE`.

## Назначение

CURRENT187-J2 закрывает следующий наблюдаемый слой после J1: не server-side
координаты уже аутентифицированной PostgreSQL сессии, а фактический client-side
маршрут к endpoint и TLS peer до отправки startup/auth packet.

Код:

- `packages/database/scripts/identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs`;
- `packages/database/scripts/identity-mail-cluster-endpoint-tls-peer-collector-current187.test.mjs`;
- `packages/database/scripts/identity-mail-cluster-endpoint-tls-peer-collector-current187.integration.test.mjs`.

## Исполняемый протокол

Production entrypoint принимает только exact data-only input и выполняет
bounded последовательность:

1. Резолвит lowercase DNS hostname через `dns.lookup(all=true, verbatim=true)`.
2. Канонизирует IPv4/IPv6, запрещает duplicate и требует exact equality с
   заранее зафиксированным множеством адресов.
3. Подключается к первому адресу в canonical order по exact IP/family/port, а
   не повторяет hostname lookup внутри socket connector.
4. Отправляет ровно восьмибайтовый PostgreSQL `SSLRequest` с code `80877103`.
5. Принимает только единственный byte `S`; plaintext/reject/extra bytes и
   timeout отклоняются.
6. Оборачивает тот же TCP socket в TLS `1.2..1.3` с
   `rejectUnauthorized=true`, Node `checkServerIdentity`, exact `servername` и
   bounded CA PEM, привязанным SHA-256.
7. Проверяет exact remote IP/port, leaf DER SHA-256, leaf SPKI SHA-256,
   certificate lifetime, protocol, cipher, отсутствие ALPN и успешную
   CA/hostname authorization.
8. Закрывает socket, не отправляя PostgreSQL startup packet, credentials или
   SQL.

Production hostname обязан быть DNS name и не может быть IP/localhost.
Synthetic entrypoint допускает только `localhost`. Purpose фиксирует ожидаемый
endpoint class:

- `APPLICATION` → `POOLER`;
- `COORDINATOR`, `MIGRATION`, `WORKER` → `DIRECT_DATABASE`.

Это ожидаемый binding, а не доказательство фактического PgBouncer pool mode.

## Receipt и граница authority

Receipt secret-free и содержит только scoped digest, release/environment/
purpose binding и булевы наблюдения. Успешный collector выставляет:

- `sourceNetworkIoPerformed=true`;
- `dnsResolutionMatched=true`;
- `selectedAddressMatched=true`;
- `postgresSslRequestAccepted=true`;
- `endpointIdentityObserved=true`;
- `tlsPeerIdentityObserved=true`;
- `tlsCaVerified=true`;
- `tlsHostnameVerified=true`.

Но J2 не имеет независимого signer/root и persisted one-time consumption.
Поэтому он намеренно сохраняет:

- `endpointIdentityAttested=false`;
- `tlsPeerIdentityAttested=false`;
- `hbaRuleMatched=false`;
- `poolerIdentityObserved=false`;
- `negativeProbePerformed=false`;
- `productionRootEnrolled=false`;
- `productionRuntimeAttested=false`;
- `authorization=false`;
- `canMutate=false`;
- `canSend=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

J2 receipt связан с exact J1 `postgresSessionReceiptDigest`, но ещё не
композируется в CURRENT187-F или deploy authority.

## Приёмка

- J2 adversarial unit: `10/10 PASS`;
- общий CURRENT187 acquisition/semantic/policy/J1/J2 gate: `63/63 PASS`;
- protocol-accurate integration: `1/1 PASS`;
- database typecheck: `PASS`;
- Prettier и `git diff --check`: `PASS`.
- exact commit `d386dfa2534a546245169dc30e68b36bc195daa1`;
- GitHub Actions `31584476362`: `3/3 SUCCESS`;
- exact J2 protocol step: `SUCCESS`;
- artifact digest:
  `sha256:722f77c2e974db9f203fb34d01fc3029a5afc7a7a26bb497ba74ac9fbe9bf495`;
- подробное evidence:
  [CURRENT187-J2 exact-SHA CI](./identity-mail-current187-j2-ci-evidence-2026-08-12.md).

Integration создаёт в отдельном OS temp root временные CA/server/wrong-CA keys
через OpenSSL, поднимает TCP harness, принимает exact PostgreSQL SSLRequest и
переходит на реальный TLS. Valid CA/hostname/leaf/SPKI даёт branded deny-only
receipt; unrelated CA после второго SSLRequest отклоняется fail-closed. Temp
root удаляется в `finally`; fixture keys не попадают в repository или logs.

## Оставшийся P0-путь CURRENT187-J

1. Запустить J1+J2 отдельно для production identities `APPLICATION`,
   `COORDINATOR`, `MIGRATION`, `WORKER` и доказать pairwise distinct
   endpoint/session/secret/application binding.
2. Принять exact-SHA CI для
   [J3/J4 control-plane collectors](./identity-mail-current187-j3-j4-control-plane-collectors.md)
   и добавить actual PgBouncer fixture.
3. Реализовать положительные и отрицательные probes для wrong role/database,
   plaintext, wrong CA/hostname, `trust`, wildcard, stale reload и wrong pool
   mode.
4. Добавить production signer/root, freshness, persisted one-time consumption,
   revocation и lost-response reconciliation.
5. Только полный branded production J receipt связать с CURRENT187-F и deploy
   authority; затем выполнить independent review, canonical promotion и
   restored-copy rehearsal.

Production, `Tenant A/A1..A4`, внешний tenant, tester account, invite и
providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.
