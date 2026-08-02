# Enrollment authority V2: manifest-bound command boundary

| Поле | Значение |
| --- | --- |
| Статус | `DORMANT_VERIFIER / NOT_DEPLOYABLE` |
| Domain | `IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2` |
| Contract | `PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2` |
| Profile | `IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2` |
| Purpose | `PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2` |
| Ожидаемый manifest | successor `IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2` |
| Application contract | `IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2` |
| Production roots | пусты |
| SQL / DB / DI / CLI / runtime wiring | отсутствуют |

## Решение по versioning

Authority V1 остаётся byte-stable. Его domain, contract, root history, exact
52-column mapping и CURRENT180 database constraints нельзя расширять полями V2.
Authority V2 является новым verifier с отдельным trust domain, отдельным frozen
empty production root registry и отдельными process-local brands для `PINNED`
и `SYNTHETIC` результатов.

V2 не может ссылаться на duty-role manifest V1: V1 pin-ит старый CURRENT185
coordinator artifact. Будущий manifest-bound bridge является новым application
boundary, поэтому authority V2 ожидает successor manifest contract/profile.
Successor manifest создаётся только после принятия exact authority/bridge
artifact и pin-ит его release SHA и SHA-256.

Чтобы не создать циклическую зависимость, verifier фиксирует новый application
contract, но release SHA и artifact SHA-256 принимает как корректно
отформатированные подписанные значения. Полномочие возникает только при
композиции двух независимо `PINNED` доказательств, где command и successor
manifest имеют exact одинаковые application release/artifact значения.

## Exact duty-role binding

Одинаковый nested `dutyRoleBinding` входит и в proposal, и в подписанный
authorization envelope. Он связывает:

- successor manifest contract/profile, id, revision и payload digest;
- manifest signing key id и public-key fingerprint;
- coordinator и worker role name/OID;
- exact grants profile/digest;
- CURRENT184 predecessor manifest digest;
- manifest-bound V2 application contract, release SHA и artifact SHA-256.

Proposal worker identity, target configuration worker identity и duty binding
обязаны совпасть. Proposal/envelope release обязан совпасть с application
release внутри binding. Command отклоняет равный manifest/command fingerprint
как очевидную ошибку конфигурации, но одно неравенство строк ещё не доказывает
независимого signer.

## Граница standalone verifier

Authority V2 проверяет только подпись enrollment command и подписанные внутри
неё manifest-binding scalars. Он намеренно не импортирует duty-manifest verifier
и не выдаёт authorizing/import brand. Enrollment signer технически может
заявить произвольные manifest digest/fingerprint/role/grants значения; сами по
себе они не являются полномочием.

Независимость двух signers и root histories доказывает следующий pure
composition boundary: он принимает только `PINNED` brands command и successor
manifest из их exact module instances, запрещает одинаковый fingerprint и
сравнивает database name/OID/identity, deployment marker, actual context,
roles/OID, grants, predecessor и application release/artifact. До этой
композиции любой результат authority V2 остаётся `authorization=false`,
`canMutate=false`, `canSend=false` и не может попасть в importer.

## Persistable output

Только exact `PINNED` brand того же module instance раскрывает:

1. frozen normalized payload;
2. expanded database-argument mapping V2, включающий все V1 semantics и duty
   binding;
3. frozen canonical proposal/envelope и signature evidence для будущего
   owner-only immutable importer.

`SYNTHETIC` brand допустим только с exact loopback-CI context и не имеет
payload/database/evidence extractor. Plain object, clone, prototype forgery,
transparent/revoked Proxy, accessor, symbol и cross-module brand отклоняются.

## Сохранённые transition invariants

V2 сохраняет V1 правила `ENABLE / ROTATE / DISABLE`, `FORWARD / ROLLBACK`,
revision math, policy/configuration digest, previous/target configuration,
database/deployment/actual-context identity, bounded canonical timeline и
domain-separated Ed25519 signature. Rollback остаётся отдельной signed command
с `rollbackOfCommandId`, а не runtime flag.

## Evidence

- authority V2: `14/14 PASS`;
- verifier artifact SHA-256:
  `622caa883a383301ce19f00517b46f412ad29c12538e6dc6b31ff2df116a9ba8`;
- exact ordered mapping: неизменный 52-field V1 prefix + 17-field duty tail,
  все 17 destination-to-source bindings проверяются;
- unknown key и resigned fingerprint substitution отклоняются;
- independent scoped reviews: `PASS`, P0/P1 для standalone verifier нет;
- обязательный package/CI gate добавлен; exact remote evidence фиксируется
  после push неизменного commit.

## Что этот slice не разрешает

Verifier не является coordinator, signer, importer или runtime credential. Он
не создаёт root, SQL candidate, table, role, grant, tenant, account, invite и не
отправляет email. После его принятия всё ещё обязательны:

1. successor signed duty-role manifest, pin-ящий exact V2 artifact/release;
2. pure `PINNED command + PINNED manifest + normalized grants` composition;
3. owner-only immutable evidence importer;
4. four-text coordinator driver и phaseful lost-response protocol;
5. PostgreSQL concurrency/ACL acceptance, runtime attestation и
   production-like apply/rollback/zero-diff rehearsal.

Production остаётся `CURRENT179/179`; текущие четыре клуба, внешний tenant,
tester account/invite и SMTP этим boundary не изменяются.
