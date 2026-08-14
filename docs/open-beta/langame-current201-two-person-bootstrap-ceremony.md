# CURRENT201: two-person bootstrap key ceremony

| Поле                           | Значение                          |
| ------------------------------ | --------------------------------- |
| Статус                         | `IMPLEMENTED / DENY-ONLY / NO-GO` |
| Дата                           | 14.08.2026                        |
| Production root                | отсутствует                       |
| Private-key authority          | отсутствует в приложении и CLI    |
| Production / Tenant A / tester | не изменялись                     |

CURRENT201 закрывает программную часть двухконтрольной церемонии добавления,
ротации или отзыва public bootstrap root. Он связывает один branded CURRENT200
candidate с двумя разными участниками:

- `OPERATOR`;
- `INDEPENDENT_REVIEWER`.

Участники обязаны иметь разные идентификаторы и разные канонические Ed25519
public SPKI. Каждый подписывает свой role-specific canonical payload. Оба
payload содержат один и тот же ceremony UUID, operation UUID/digest, reason
digest и exact current/candidate CURRENT198 registry digests. Поэтому подписи
нельзя переставить местами или перенести на другой candidate.

## Граница безопасности

CURRENT201:

- не генерирует и не читает private keys;
- не пишет repository, CURRENT198 registry, БД или production;
- не использует сеть, process environment, Prisma или shell execution;
- descriptor-bound читает только public `.pem` и detached base64url `.sig`;
- ограничивает ceremony window 24 часами;
- отклоняет один participant/key, clone, proxy/accessor, forged/swapped
  signatures, timeline и candidate drift;
- всегда возвращает `authorization=false`, `canApply=false`,
  `canEnrollProductionRoots=false`, `productionExecutionAllowed=false`,
  `productionRootEnrolled=false`, `sharedBetaAccess=false` и
  `testAccessAuthorized=false`.

Verified receipt подтверждает только целостность двух публичных подписей. Он не
доказывает организационную независимость людей сам по себе и не является
`PRODUCTION DEPLOY GO` или `SHARED BETA GO`.

## Операторская последовательность

### 1. Подготовить candidate и signing payloads

Оператор выполняет CLI в `prepare` mode. Кроме параметров CURRENT200 нужны:

```text
--mode prepare
--ceremony-id <uuid>
--ceremony-created-at <canonical-iso>
--ceremony-expires-at <canonical-iso, <=24h>
--operator-id <id>
--operator-public-key <operator-public.pem>
--reviewer-id <different-id>
--reviewer-public-key <reviewer-public.pem>
--confirm prepare-current201-two-person-public-bootstrap-ceremony
```

Полная справка:

```powershell
pnpm --filter database langame-runtime-trust:prepare-bootstrap-ceremony -- --help
```

CLI печатает JSON с `candidateCanonicalJson`, точными digest и двумя полями:

- `operatorPayloadCanonicalJson`;
- `reviewerPayloadCanonicalJson`.

Их необходимо сохранить byte-for-byte без завершающего перевода строки. Каждый
участник отдельно сравнивает ceremony/candidate digests с review ticket.

### 2. Подписать offline

Private keys остаются на независимых offline-носителях. LeetPlus CLI получает
только public SPKI и готовую detached Ed25519 signature. Пример криптографической
операции на offline workstation:

```text
openssl pkeyutl -sign -rawin -inkey <private-key> -in <exact-payload> -out <signature.bin>
```

Binary signature преобразуется в canonical base64url без padding и сохраняется
в отдельный `.sig`. Operator и reviewer не обмениваются private material.

### 3. Проверить обе подписи

Повторяется тот же полный набор CURRENT200/CURRENT201 аргументов, но с:

```text
--mode verify
--operator-signature <operator.sig>
--reviewer-signature <reviewer.sig>
```

Успех возвращает
`TWO_PERSON_PUBLIC_REVIEW_EVIDENCE_VERIFIED_DENY_ONLY` и
`reviewEvidenceDigest`, а также полный переносимый public-only receipt с exact
payload, `approvedAt/effectiveAt/keyId`, public SPKI и двумя
base64url-подписями. Persisted verifier детерминированно воспроизводит CURRENT200
operation и требует тот же candidate/operation digest. Любое изменение
candidate, metadata или подписи завершает команду ошибкой.

## Reviewed CURRENT198 transition

После verified CURRENT201 receipt отдельный PR должен одновременно:

- заменить canonical JSON literal в
  `packages/database/scripts/langame-runtime-trust-bootstrap-registry-current198.mjs`
  на exact `candidateCanonicalJson`;
- сохранить полный receipt одной canonical JSON-строкой с завершающим LF в
  `packages/database/trust-evidence/langame-current198-bootstrap-review-current201.json`.

Обязательные проверки:

1. PR связывает `reviewEvidenceDigest`, operation digest и оба public approver
   fingerprints.
2. Private keys, raw signing workspaces и raw binary signatures в repository
   не добавляются. Public SPKI и detached signatures входят только в
   канонический public evidence JSON.
3. CURRENT198 transition gate проверяет каждый Git parent, immutable history,
   clean HEAD-копию evidence, обе подписи, ceremony window и exact равенство
   signed candidate реестру:

   ```powershell
   pnpm --filter database check:langame-runtime-trust-bootstrap-registry-current198
   ```

4. Отсутствующий, неканонический, просроченный, неподписанный или относящийся к
   другому candidate evidence останавливает CI fail-closed.
5. Независимый reviewer подтверждает, что repository literal byte-for-byte
   соответствует signed `candidateCanonicalJson`.
6. Merge не означает production enrollment: после него отдельно выполняются
   production-origin CURRENT196–199 acquisition/registration и persisted
   registration acceptance.

Focused CURRENT201/CURRENT198 review matrix: `16/16`.

## Production-like rehearsal после registry review

Только после принятого public root и production-origin registration на
восстановленной из production backup изолированной копии выполняются:

1. read-only CURRENT187 cluster/application inventory;
2. CURRENT186 runtime role/controller/ACL apply;
3. CURRENT193 execute-only Langame runtime role attestation;
4. CURRENT194 register/consume/revoke и separated Prisma clients;
5. apply → repeat → rollback/emergency → zero-diff;
6. проверка отсутствия rehearsal DB/role/filesystem residue;
7. отдельный human-reviewed rehearsal report с exact release SHA/artifact,
   database/role OID, TLS peer pins, rollback owner и RPO/RTO.

Engineering gates для этих контуров уже находятся в CI, но CI не подменяет
restore production backup, production topology или независимый операционный
отчёт.

## Что останется после CURRENT201

- фактически провести offline ceremony двумя независимыми людьми;
- принять reviewed CURRENT198 registry PR;
- получить production-origin CURRENT196–199 receipt;
- выполнить restored-copy production-like rehearsal;
- принять Gate 1MT, Gate 2 и отдельный persisted `SHARED BETA GO`;
- только затем включить штатный owner activation route.
