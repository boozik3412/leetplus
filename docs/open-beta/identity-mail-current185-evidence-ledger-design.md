# CURRENT185 identity-mail evidence ledger V2: database design

| Поле | Значение |
| --- | --- |
| Candidate | `20260802030000_identity_mail_enrollment_evidence_ledger_v2` |
| Ordinal | `185` |
| Predecessor | exact dormant CURRENT184 |
| Статус | `IMPLEMENTED_CANDIDATE / NONCANONICAL / NOT_DEPLOYABLE` |
| Production target | неизменно `CURRENT179/179` |
| Scope | immutable evidence ledger + owner-only two-TEXT importer |
| Excluded | four-TEXT driver, runtime roles/grants, worker activation, SMTP |
| SQL SHA-256 | `2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6` |

## Цель

Application verifier уже умеет доказать две независимые Ed25519 подписи,
exact grants snapshot и создать process-local composed brand. Database не
может повторить эту проверку. CURRENT185 должен атомарно сохранить уже
проверенный canonical bundle так, чтобы последующий coordinator видел только
typed immutable rows и DB-enforced equality, а не доверял повторной передаче
JSON из runtime.

Candidate остаётся вне `prisma/migrations`, требует exact disposable rehearsal
database, explicit confirmation и unfinished Prisma receipt с точным checksum.
Ни production apply, ни создание реальных ролей не входят в этот этап.

## Модель данных

### Manifest evidence

Append-only `IdentityMailDutyRoleManifestEvidenceV2` хранит:

- payload digest как primary identity и unique `(manifestId, revision)`;
- canonical payload bytes, signature algorithm/key/fingerprint/signature;
- contract/profile/trust-domain/purpose и validity window;
- database name/OID/identity, deployment marker id/digest, actual context;
- coordinator и worker role name/OID;
- exact grants profile/digest и normalized grants projection;
- CURRENT184 predecessor digest и application contract/release/artifact;
- imported transaction/time и immutable import receipt digest.

Отдельный append-only `IdentityMailDutyRoleManifestRevocationV2` связывается с
payload digest и хранит только reason/evidence digest, revocation time и txid.
Manifest evidence не обновляется при отзыве.

### Command V2/69

Поскольку CURRENT180 command ledger hard-coded на V1/52 и остаётся пустым под
dormant statement guard, CURRENT185 version-expands его до V2/69. Все V1
transition/revision/configuration/rollback invariants сохраняются; добавляются
17 duty binding fields, composition/bundle digests и original import receipt
metadata.

Command должен иметь DB-enforced composite FK к manifest evidence. Если предел
PostgreSQL в 32 колонки мешает одной связи, equality делится на несколько
overlapping unique/FK keys с общей `(manifestPayloadDigest, manifestId,
manifestRevision)` identity. В совокупности FK обязаны покрыть:

- database/deployment/actual-context identity;
- manifest contract/profile/id/revision/digest/key/fingerprint;
- coordinator и worker name/OID;
- grants profile/digest;
- predecessor digest;
- application contract/release/artifact.

Ни одно из 17 duty fields не остаётся application-only соглашением.

## Owner-only importer

Единственная write-функция этапа:

```sql
identity_mail_tenant_enrollment_import_evidence_v2(TEXT, TEXT) RETURNS JSONB
```

Она обязана быть `SECURITY DEFINER`, `VOLATILE`, `PARALLEL UNSAFE`, иметь
`SET search_path = pg_catalog`, полностью квалифицировать application objects,
не использовать dynamic SQL и иметь `REVOKE ALL ... FROM PUBLIC`. На candidate
этапе функцию может выполнить только её exact owner; coordinator, worker,
application runtime и любые relation/column roles отсутствуют.

Алгоритм одной transaction:

1. проверить byte bounds, canonical bundle digest domain и exact top-level
   discriminators без relation read;
2. извлечь tenant/command/manifest identities и exact 69 arguments;
3. взять tenant advisory transaction lock, затем bundle/manifest locks в
   фиксированном порядке;
4. найти exact ранее импортированную command identity;
5. если полные bundle bytes/digest и все typed identities совпадают, вернуть
   `IMPORT_REPLAY` с original receipt даже после expiry;
6. любое совпадение command/request/envelope/manifest identity с byte drift
   отклонить typed conflict без изменений;
7. только для первого import проверить live command + manifest windows,
   отсутствие revocation, current database name/OID, deployment marker и
   actual context;
8. reuse manifest только после полного equality всех typed/canonical/signature
   полей, иначе конфликт;
9. атомарно вставить command и original `IMPORTED` receipt;
10. вернуть versioned receipt с `importReceiptDigest`, `importedAtEpochMs` и
    `importedTransactionId`.

`ON CONFLICT DO NOTHING` без полного equality запрещён. Replay-after-expiry
допустим только для уже сохранённого exact bundle и нужен для восстановления
потерянного commit response.

## Immutable DML boundary

CURRENT180 statement-dormant INSERT guard заменяется только в части,
необходимой importer. UPDATE/DELETE/TRUNCATE command, manifest и revocation
rows запрещены immutable guards. Все relations, sequences и guard functions
остаются owner-only. Transaction-local importer-context trigger блокирует
случайный прямой INSERT, но не считается authorization boundary: текущий
database owner технически может выставить custom GUC или изменить owned schema.
Поэтому следующий role/grants slice обязан передать tables/functions отдельному
`NOLOGIN` owner и оставить runtime/coordinator без прямого relation DML.

## Lock order и будущий driver

CURRENT185 не создаёт `drive_command_v2`. Он лишь готовит immutable input для
следующего этапа. Будущий driver будет принимать четыре reference TEXT и после
того же tenant lock повторно проверит command/manifest FK, current context,
`SESSION_USER` name/OID, non-revocation и свежий grants digest под общей
ACL-attestation epoch/lock.

Manifest должен быть live/non-revoked при первом import и первой mutation.
После persisted `BEGIN_DRAIN` expiry/revocation блокирует новые команды, но не
settlement-only `WAIT/FINALIZE`; иначе tenant можно навсегда оставить в
`DRAINING`.

## PostgreSQL acceptance текущего slice

- first import, exact replay, byte/identity conflict и fault rollback;
- commit+lost-response exact retry с одним command/original receipt;
- stale/expired first import и replay-after-expiry/revocation;
- DB/context/marker freshness, 17-duty composite FK и manifest reuse;
- direct INSERT anti-accident fence, UPDATE/DELETE/TRUNCATE immutability и
  PUBLIC/app denial;
- exact owner/search_path/function/table/column ACL postcondition;
- duplicate same command, same/different tenants in parallel и управляемый
  manifest reuse/revocation waiter с zero `40P01`;
- no raw email/token/ciphertext/Message-ID/provider payload;
- disposable DB/role cleanup и zero residue.

Signed rollback FK/inverse/rollback-once/wrong-tenant semantics, coordinator и
worker denial под реальными ролями, fresh grants attestation и phase transitions
относятся к следующему four-TEXT driver + role/grants slice: CURRENT185 importer
их не исполняет и не заявляет.

## Evidence

- normalized `migration.sql` SHA-256:
  `2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6`;
- exact foundation checker: `--check COMPLIANT`, self-test `24/24`, tests
  `21/21 PASS`;
- fail-closed catalog postcondition pin-ит exact `86/36/5` column manifests,
  exact source/target/ordered columns/actions/deferrability/validation matrix
  всех восьми FK, отсутствие importer и tenant-lock overload/default/variadic
  surface, tenant-lock owner-only ACL и body SHA/owner/ACL/metadata шести
  retained CURRENT184 RPC;
- actual two-signer branded PII-free fixture: `3/3 PASS`;
- PostgreSQL 16 acceptance: `7/7 PASS`, включая deterministic
  revocation-first и importer-first advisory waiters, concurrent double-revoke,
  independent-tenant progress и zero new `40P01`;
- CURRENT184 PostgreSQL regression: `3/3 PASS`;
- API/database production typecheck и targeted ESLint: `PASS`.

Это engineering evidence candidate, а не production admission. Exact
implementation `0688b6ef7b3f3e595f2a76e6ce91848c52a237fa` и historical
inventory compatibility head
`23cd1470c330da027fcd259a9186d77870e9e7d6` приняты GitHub Actions
[`30765750662`](https://github.com/boozik3412/leetplus/actions/runs/30765750662)
(`run #92`): Application checks, PostgreSQL migration smoke и Authority root
trust gate — `3/3 green`. Предыдущий `run #91` отклонён как release evidence:
он корректно выявил отсутствующий CURRENT185 successor в exact inventories
исторических CURRENT180/181/183/184 foundation gates; исправление не меняет
SQL SHA или исторические predecessor manifests.

## Запрет на promotion

Даже зелёный CURRENT185 importer не разрешает production apply. До promotion
остаются отдельный `NOLOGIN` owner, four-TEXT phaseful driver, shared ACL
epoch/lock, exact runtime roles и expanded attestation, provider mark/complete
lost-response, producer/activation v2, zero-secret/zero-inflight, PostgreSQL
cross-path races, backfill и подписанная production-like
apply/rollback/zero-diff rehearsal с отдельными `PRODUCTION DEPLOY GO` и
`SHARED BETA GO`.
