# CURRENT196 — trust-enrollment proposal для Langame runtime

## Статус

`EXACT-SHA CI ACCEPTED / NONAUTHORIZING / PRODUCTION ROOTS EMPTY / EXTERNAL BETA NO-GO`

Дата: 13.08.2026.

CURRENT196 — следующий fail-closed слой после принятого CURRENT195 lifecycle.
Он определяет точный подписанный proposal для будущей operations-церемонии
enrollment, но намеренно не умеет:

- записывать или изменять production roots;
- читать ключи, secrets, env или filesystem;
- подключаться к Langame, PostgreSQL либо другому endpoint;
- подписывать proposal;
- выдавать deployment, tenant, test-access или shared-beta authority.

Текущая сеть `Tenant A / A1..A4`, production и внешний тестер не изменены.

## Реализованный контракт

Source:
`packages/database/scripts/langame-runtime-trust-enrollment-current196.mjs`.

Контракт принимает только exact Ed25519 envelope, подписанный отдельной offline
bootstrap authority. Enroll-кандидаты не могут подписать собственное первичное
enrollment. В signed payload связаны:

- CURRENT193/CURRENT194/CURRENT195 contracts и exact CURRENT195 migration
  SHA-256 `ecb9e9a8f8a2cefff482331ec7b122af081b6175a8cc931fe594339c549183ac`;
- release SHA, immutable release artifact, verifier artifact и runtime config
  digests;
- cluster identity, database `name + OID`, owner и runtime role `name + OID`;
- одноразовый challenge, ceremony transcript, initial revocation state;
- две разные opaque approval-ссылки;
- initial generation `1` и `priorEnrollmentDigest=null`;
- отдельный CURRENT193 runtime-attestation public root;
- отдельный CURRENT195 revoke-intent public root;
- exact TLS endpoint host/port/serverName, CA certificate SHA-256, leaf
  certificate SHA-256, leaf SPKI SHA-256, validity window, minimum TLS protocol
  и обязательный `rejectUnauthorized=true`.

Runtime-attestation, revoke-intent и bootstrap authorities принадлежат разным
purpose/trust domains. Совпадение key ID/fingerprint между enroll-кандидатами
либо с bootstrap authority отклоняется.

## Fail-closed граница

`PINNED_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_BOOTSTRAP_ROOTS` — exact
frozen `{}`. Production entry не принимает caller-provided roots и всегда
возвращает `CURRENT196_TRUST_ENROLLMENT_PRODUCTION_ROOTS_EMPTY`.

Synthetic verifier доступен только для `environment=ci`, loopback hostname,
database с суффиксом `_ci` и точной confirmation phrase. Его branded receipt
имеет:

- `authorization=false`;
- `canEnrollProductionRoots=false`;
- `canConnectNetwork=false`;
- `canMutate=false`;
- `productionExecutionAllowed=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

Receipt не содержит PEM candidate roots, bootstrap public key либо полный
candidate bundle.

## Локальное evidence

Focused suite: `12/12 PASS`.

Проверены positive exact envelope, frozen-empty production entry, synthetic
isolation, untrusted/expired/wrong-purpose bootstrap roots, signature drift,
release/cluster/OID/bundle binding, two-control approvals, purpose separation,
TLS wildcard/port/CA-SPKI failures, timeline expiry, Proxy/accessor rejection и
отсутствие filesystem/process/network/signer authority.

Exact implementation commit:
`00540013d5b264072f5fd54d8694e4d568e78687`.

GitHub Actions run
[`31721014759`](https://github.com/boozik3412/leetplus/actions/runs/31721014759)
завершён `3/3 SUCCESS`:

- Application checks — `SUCCESS`, включая обязательный CURRENT196 gate;
- Authority root trust gate — `SUCCESS`;
- PostgreSQL migration smoke — `SUCCESS`.

SHA-bound release artifact: ID `9189642476`, имя
`leetplus-release-00540013d5b264072f5fd54d8694e4d568e78687`, digest
`sha256:9d14a6eddd7b98544034e00a4cd97a08d36d3938256c48324bd050c186e56213`.

## Что осталось до реального enrollment

CURRENT196 foundation сам по себе не снимает ни один production/open-beta gate.
До первой операции enrollment обязательны отдельные reviewed slices:

1. protected acquisition receipt для фактических public roots и live TLS peer
   evidence с verify-full hostname/CA/SPKI;
2. immutable bootstrap root registry как отдельное reviewed release изменение;
3. one-time append-only enrollment ledger с replay, rotation, revocation и
   emergency-retirement semantics;
4. signer isolation: private keys вне caller/env/database/target process;
5. exact-SHA independent review и CI acceptance;
6. только затем — отдельный `PRODUCTION ROOT ENROLLMENT GO` и operations
   ceremony; он всё ещё не является deployment/cutover/test-access GO.

После enrollment остаются canonical restored-copy apply/repeat/rollback/
zero-diff, production-like admission, cutover текущей сети и отдельный Gate 2
для первого внешнего tenant.
