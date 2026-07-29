# StaffTask production-like snapshot authority operations

| Поле          | Значение                                                             |
| ------------- | -------------------------------------------------------------------- |
| Статус        | `IMPLEMENTED_CANDIDATE`; production root не enrolled                 |
| Версия        | `1.0.0`                                                              |
| Дата          | `29.07.2026`                                                         |
| Решение       | Detached Ed25519 signing; LeetPlus не читает private key             |
| Scope         | Только production-like StaffTask rehearsal на loopback PostgreSQL 16 |
| External beta | `NO-GO`                                                              |

Этот runbook описывает границу между acquisition evidence, offline signer и
read-only snapshot admission. Он не разрешает backup, restore, migration,
reconciliation apply, deployment или внешний доступ.

Исторический SHA `d77c74393c510b688f9f2a5c43eaa908390450b5` имеет зелёный
remote CI, но не содержит authority-operations candidate. Для operational
production-like церемонии принимается только exact clean PR/release SHA с
отдельным review и зелёным CI evidence.

## 1. Trust boundary

LeetPlus выполняет только две операции:

1. `prepare` строит exact payload из защищённого acquisition request;
2. `finalize` заново читает тот же canonical acquisition request, пересчитывает
   всю binding chain, проверяет внешнюю detached Ed25519 signature закреплённым
   public root и выпускает envelope/receipt.

LeetPlus не принимает и не читает:

- private key, seed или encrypted private-key file;
- passphrase, HSM PIN, KMS credential или signing secret;
- private-key env, argv, stdin или repository path;
- произвольный caller-selected signing key.

Payload подписывается отдельным approved offline signer/HSM. Signature file
содержит ровно 64 raw bytes. Base64, PEM, JSON и текстовая подпись не
принимаются.

## 2. Acquisition evidence

Защищённый canonical JSON request имеет schema `1` и exact поля:

```text
schemaVersion
kind
purpose
classification
profile
isolationProfile
releaseSha
expectedState
snapshotArtifactDigest
databaseIdentity
timeline
actors
controls
references
```

`databaseIdentity` содержит exact restored database name, PostgreSQL
`system_identifier` и database OID. Эти raw значения не попадают в signing
package, envelope, receipt или admission report.

`actors` содержит четыре разных opaque reference:

- source/data owner;
- acquisition operator;
- security/operations approver;
- destruction owner.

Email, URL, credentials и свободный текст запрещены. `controls` обязан
буквально подтвердить:

- `STAFF_TASK_NINE_RELATION_TOKENIZED_V1`;
- encryption in transit и at rest;
- disposable destination;
- no egress;
- disabled application workloads;
- removed production credentials;
- scheduled destruction.

Timeline: `acquiredAt <= restoredAt < expiresAt`; acquisition contract требует
`expiresAt - acquiredAt <= 72 часа`, а admission отдельно требует
`expiresAt - restoredAt <= 72 часа`. Оба ограничения обязательны.
Поддерживаются только `BASELINE_156`, `EXPAND_162` и `CURRENT_164`.

Request обязан быть canonical UTF-8 JSON без BOM, newline, duplicate, missing
или extra keys. Digest:

```text
SHA256(
  "staff-task-snapshot-acquisition-evidence-v1\0" + canonicalRequest
)
```

Production-like approval alias вычисляется только так:

```text
acquisition-v1:<requestDigest>
```

Произвольный `security-approval:*`, legacy HMAC и `synthetic:*` не проходят
production-like admission.

### 2.1. Exact nested contract

Все значения `databaseIdentity`, `actors`, `references` — строки, а не числа,
boolean или объекты. Число `123` и строка `"123"` не могут считаться разными
actor. Exact shape:

```text
databaseIdentity:
  clusterSystemIdentifier
  currentDatabase
  databaseOid

timeline:
  acquiredAt
  expiresAt
  restoredAt

actors:
  acquisitionOperatorReference
  destructionOwnerReference
  securityApproverReference
  sourceOwnerReference

controls:
  applicationWorkloadsDisabled = true
  dataMinimizationProfile = STAFF_TASK_NINE_RELATION_TOKENIZED_V1
  destructionScheduled = true
  disposableDestination = true
  encryptedAtRest = true
  encryptedInTransit = true
  noEgress = true
  productionCredentialsRemoved = true

references:
  changeRecordReference
  destinationReference
  destructionProcedureReference
  incidentContactReference
```

`currentDatabase` имеет 3–63 символа из `[A-Za-z0-9_.-]`, начинается с
alphanumeric и содержит отдельный `_`/`-`-bounded marker
`snapshot|rehearsal|preprod|staging|stage|test`. Например,
`leetplus_snapshot_rehearsal` допустим, а `leetplus_contest` — нет.
`clusterSystemIdentifier` и `databaseOid` — непустые decimal strings.

Порядок ключей и отсутствие whitespace проверяются canonical serializer:
ручной pretty JSON не является input. `prepare` является fail-closed
validator, а `finalize` обязательно перечитывает этот же request и повторно
сверяет request digest, approval alias, DB identity digest, state, artifact,
release и timeline.

## 3. Root registry

Canonical registry находится в
`packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json`;
`staff-task-integrity-snapshot-authority-roots.mjs` только загружает и
deep-freeze этот data source. До отдельного enrollment change JSON равен `{}`,
поэтому `prepare` и production-like admission завершаются fail-closed.

Одна root-запись содержит:

```text
keyId
algorithm = Ed25519
classification = PRODUCTION_LIKE
profile = STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1
purpose = STAFF_TASK_INTEGRITY_RECONCILIATION
publicKeyPem
publicKeyFingerprint
notBefore
notAfter
status = ACTIVE | RETIRED | REVOKED
supersedesKeyId
retiredAt
revokedAt
```

Инварианты:

- максимум один `ACTIVE` root;
- только `ACTIVE` root может подготовить или проверить новый envelope;
- fingerprints уникальны и пересчитываются из canonical Ed25519 SPKI DER;
- уже non-active historical roots не удаляются и не переписываются;
- rotation добавляет один новый `ACTIVE` root, который ссылается на прежний;
- текущий `ACTIVE` может совершить ровно один lifecycle transition и атомарно
  становится `RETIRED` либо `REVOKED`;
- emergency revoke-to-zero разрешён как fail-closed release; последующее
  восстановление добавляет новый `ACTIVE`, superseding ранее revoked root;
- supersession graph не содержит unknown key, self-reference или cycle.

Root enrollment/rotation/revocation выполняется отдельным reviewed commit.
Private key создаётся и остаётся во внешнем signer/HSM. В repository попадает
только public record. Emergency revocation также требует нового release и
запрета запуска старого SHA: старый checkout продолжает доверять своему
registry.

CI делает actual parent→HEAD transition check canonical JSON для каждого Git
parent:

```powershell
pnpm --filter database db:check:staff-task-integrity-authority-root-transition
```

Удаление/перезапись history, неканонический JSON, multiple active roots,
rotation без supersession и recovery не от revoked root дают non-zero exit.
После любого enrollment/rotation/revocation нужен зелёный remote CI exact SHA
до acquisition.

## 4. Prepare

Выполнять только из exact clean checkout принятого release SHA. Ceremony
сравнивает свои runtime/root/acquisition bytes с Git blobs exact SHA до и после
вычисления. Все input и output paths должны находиться вне repository в
защищённом evidence storage. Два output одной фазы обязаны находиться в одном
каталоге; каталоги prepare и finalize могут различаться. NTFS ADS/colon stream
paths запрещены. Existing files не перезаписываются.

Каждый файл открывается exclusive, регистрируется для cleanup сразу после
создания, полностью пишется и проходит `fsync`; при пойманной ошибке все
созданные текущим вызовом пути удаляются. Это не является directory-level
crash-atomic transaction: после crash/power loss operator обязан заново
проверить или удалить незавершённый set. Consumer использует readiness rule и
всегда валидирует непустой readiness file вместе с companion:

- `prepare`: package пишется первым, payload — последним; без payload signer не
  запускается;
- `finalize`: receipt пишется первым, envelope — последним; без envelope
  admission не запускается.

POSIX `0600` не заменяет filesystem ACL. На Windows protected directory ACL,
backup/restore сохранность и доступ operator/signer проверяются отдельно.

```powershell
pnpm --filter database db:authority:staff-task-integrity-snapshot -- prepare `
  --request-file <protected-acquisition-request.json> `
  --package-file <new-signing-package.json> `
  --payload-file <new-signing-payload.bin> `
  --confirm prepare-reviewed-production-like-authority-payload
```

`prepare`:

- проверяет `HEAD === request.releaseSha` и пустой worktree;
- выбирает единственный `ACTIVE` root без caller override;
- создаёт случайный 256-bit nonce;
- задаёт `issuedAt` по текущим часам;
- вычисляет nonce-bound database/approval digests;
- записывает canonical signing package и raw signing payload;
- не подключается к БД или сети.

Stdout содержит только:

```json
{ "status": "PREPARED" }
```

## 5. External signature

Approved offline signer/HSM получает по защищённому каналу три связанных
артефакта: canonical acquisition request, signing package и raw signing
payload. Signer/operator обязан пересчитать request digest, проверить
`acquisition-v1:<digest>`, payload digest, change record, actors/controls и
physical approval. Только после этого signer возвращает ровно 64 raw Ed25519
signature bytes.

Конкретная HSM/KMS/OS-keystore команда не входит в LeetPlus repository и не
может быть заменена test key, CI secret или developer PEM.

## 6. Finalize

```powershell
pnpm --filter database db:authority:staff-task-integrity-snapshot -- finalize `
  --request-file <same-protected-acquisition-request.json> `
  --package-file <protected-signing-package.json> `
  --signature-file <raw-signature-64-bytes.bin> `
  --envelope-file <new-authority-envelope.txt> `
  --receipt-file <new-signing-receipt.json> `
  --confirm finalize-reviewed-production-like-authority-envelope
```

`finalize` повторно проверяет:

- exact clean release SHA;
- тот же canonical acquisition request и его current validity;
- package schema и canonical form;
- acquisition digest → approval alias → envelope binding;
- DB identity/state/artifact/release/timeline request → package parity;
- единственный active root, key ID и fingerprint;
- payload digest;
- detached signature;
- state, snapshot digest, nonce, timeline и root validity.

Stdout содержит только:

```json
{ "status": "FINALIZED" }
```

Envelope, marker, digests, DB identity, paths и operational references в
stdout/stderr не выводятся. Receipt сохраняется только в protected evidence
storage и записывается раньше envelope; наличие envelope означает, что receipt
уже был flushed. Receipt без envelope после аварии не разрешает admission и
удаляется оператором по incident procedure.

## 7. Три независимых authority checkpoint

Для одного restored snapshot выполняются три отдельные церемонии:

1. `BASELINE_156`: новый request, nonce, signature, envelope и DB marker;
2. после exact migrations `157..162` — `EXPAND_162` с новым request/nonce и
   обязательной marker rotation;
3. после exact migrations `163..164` — `CURRENT_164` с третьим request/nonce и
   второй marker rotation.

Ни один envelope, signature, marker или approval не переиспользуется между
state. Каждый admission должен завершиться exit `0`. Только после третьего
admission разрешены отдельные read-only inventory и aggregate planner.

## 8. Stop conditions

Немедленный `NO-GO`:

- registry пуст, содержит несколько active roots или invalid transition;
- dirty checkout, SHA mismatch или expired root/request;
- private-key material обнаружен в LeetPlus process, repo, env, argv, log,
  snapshot или CI;
- actor references совпадают;
- control не равен `true`;
- request/package/payload/signature изменён либо не canonical;
- marker не соответствует exact envelope digest;
- output уже существует, pair находится в разных каталогах, используется ADS
  path либо readiness file отсутствует;
- snapshot невозможно доказуемо уничтожить в TTL.

Этот candidate закрывает только подготовку безопасной signing ceremony.
Enrollment реального public root, acquisition/restore, marker installation,
reader-role lifecycle и первый production-like admission остаются отдельными
P0-решениями.
