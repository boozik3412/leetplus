# Staff task integrity: snapshot admission runbook

| Поле                  | Значение                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| Статус                | `IMPLEMENTED_CANDIDATE`; SYNTHETIC real-PG `PASS`; PRODUCTION_LIKE NOT EXECUTED |
| Версия                | 0.3.0                                                                           |
| Дата                  | 27.07.2026                                                                      |
| Backlog               | `BETA-MOD-STAFF-003`, `BETA-OPS-002`, `BETA-OPS-006`, `BETA-CUT-001`            |
| Candidate code SHA    | `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`                                      |
| Report schema version | 1                                                                               |
| PostgreSQL            | Только major version `16`                                                       |
| Разрешённая schema    | Только `public`                                                                 |

Этот документ описывает реализованный fail-closed admission candidate для
изолированного StaffTask snapshot. Candidate только проверяет runtime, exact
release manifest, database identity, schema/catalog state и полномочия
специальной read-only роли. Он не получает snapshot, не восстанавливает БД, не
выполняет migration и не изменяет данные.

Production-like acquisition, restore и запуск admission не выполнялись.
Remote target, production process, reconciliation apply, `VALIDATE`,
`CONTRACT`, deployment, production cutover и внешний beta-доступ остаются
`NO-GO`.

## 1. Зафиксированный контекст и release decision

- четыре текущих клуба остаются четырьмя `Store` одной сети в одном
  существующем `Tenant`;
- текущий `tenantId` сохраняется;
- каждая независимая внешняя сеть получает отдельный `Tenant`;
- snapshot допускается только как временная non-production копия на loopback;
- `PRODUCTION_LIKE` означает класс защищённого snapshot, а не production
  target;
- успешный admission не означает clean data, zero-diff, Gate 2 или `GO`;
- доступ внешней beta-когорте остаётся `NO-GO` до полного Gate 2.

## 2. Реализованная граница candidate

Candidate:

- принимает только `SYNTHETIC` или `PRODUCTION_LIKE`;
- принимает только `BASELINE_156` или `EXPAND_162`;
- разрешает PostgreSQL только на `127.0.0.1`, `localhost` или `::1`;
- отвергает `NODE_ENV=production`;
- использует exact committed `RELEASE_SHA`, а не содержимое mutable worktree;
- сверяет exact migration names и SHA-256 checksums;
- использует ровно одно DB-соединение и одну
  `READ ONLY REPEATABLE READ` transaction;
- проверяет exact SELECT-only role contract;
- создаёт aggregate privacy-safe report и HMAC evidence;
- не имеет restore, migrate, export, row-level, apply, `VALIDATE`, destroy или
  auto-fix path.

Текущий статус verification:

```text
implementation candidate               = IMPLEMENTED_CANDIDATE
unit contract                           = PASS (16/16)
offline source/safety contract          = PASS (36 checks)
SYNTHETIC real PostgreSQL verification = PASS (14 scenarios; PostgreSQL 16.14)
PRODUCTION_LIKE acquisition/restore/run = NOT EXECUTED
remote admission                        = NO-GO
production apply/VALIDATE/deploy        = NO-GO
external beta                           = NO-GO
```

Независимый security rereview exact candidate не обнаружил оставшихся P0/P1.
Оставшиеся ограничения сохраняются как P2/operational `NO-GO`:

- восстановление `PUBLIC CONNECT` выполняется smoke-процессом и при аварийной
  остановке не гарантируется, поэтому smoke допустим только в одноразовом
  изолированном CI-кластере;
- encryption, no-egress, подлинность acquisition/restore timestamps и
  уничтожение snapshot подтверждаются отдельной operational evidence, а не
  только DB-gate;
- loopback URL сам по себе не исключает локальный tunnel/proxy; фактически
  remote источник запрещён независимо от URL.

## 3. Классификация snapshot

Классификация задаётся явно до запуска:

| Класс             | Назначение                                                                                     | Release authority                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `SYNTHETIC`       | Локальные/CI fixtures без production rows, PII, operational IDs и действующих integration keys | Только engineering evidence                                         |
| `PRODUCTION_LIKE` | Отдельно одобренная защищённая копия, сохраняющая необходимые связи и распределение данных     | Только production-like rehearsal после acquisition/restore approval |

Правила:

- класс не выводится из имени БД, hostname, количества строк или похожести
  данных;
- `SYNTHETIC` нельзя переименовать или задним числом объявить
  `PRODUCTION_LIKE`;
- synthetic evidence никогда не удовлетворяет Gate 2;
- synthetic run не заменяет production-like inventory, planner,
  reconciliation или owner decisions;
- masked/tokenized данные всё равно требуют classification, isolation, TTL и
  destruction;
- production-like classification не разрешает production или remote
  connection.

Имена локальных БД дополнительно имеют fail-closed marker:

- `SYNTHETIC`: `ci|test|testing|local`;
- `PRODUCTION_LIKE`: `snapshot|rehearsal|preprod|staging|stage|test`.

Marker не заменяет classification или approval.

## 4. Exact release authority

`RELEASE_SHA` — обязательный 40-character lowercase Git SHA. Candidate:

1. находит repository root из фактического runtime path;
2. требует `HEAD === RELEASE_SHA`;
3. требует clean status для admission script, inventory/planner sources и
   `packages/database/prisma/migrations`;
4. читает migration paths и `migration.sql` blobs через Git из exact
   `RELEASE_SHA`;
5. требует, чтобы release manifest содержал ровно 162 canonical migration
   directories;
6. для выбранного state строит expected manifest из первых 156 либо всех 162
   migration blobs и сравнивает exact names/checksums с
   `public._prisma_migrations`.

Незакоммиченный, untracked или изменённый authority source не используется.
Mutable worktree не является источником migration truth. Отсутствующий Git
object, другой HEAD, dirty authority path или неверный manifest дают contract
error/exit `1`.

## 5. Exact schema states

Оба состояния требуют:

```text
postgresqlMajor         = 16
currentSchemaIsPublic   = true
databaseNameMatched     = true
migrationManifest.ready = true
privileges.ready        = true
```

Каждый expected FK в обоих состояниях обязан иметь ровно четыре внутренних
PostgreSQL enforcement trigger, и все четыре должны иметь
`tgenabled = 'O'`. Disabled, missing или лишний trigger исключает FK из exact
match и отклоняет catalog.

### 5.1. `BASELINE_156`

```text
migrationCount                         = 156
latestMigration                        = 20260727120000_staff_task_catalog_audit_expand
unfinishedMigrationCount               = 0
baseline foreignKeyMatchCount          = 14
baseline foreignKeyMismatchCount       = 0
unexpectedProtectedForeignKeyCount     = 0
protectedCompositePresentCount         = 0
protectedParentIndexPresentCount       = 0
enforcement triggers per expected FK   = 4 enabled
```

Expected catalog содержит 14 exact legacy simple FK. Миграции `157..162`, 14
protected composite FK и пять managed parent indexes ещё отсутствуют.

### 5.2. `EXPAND_162`

```text
migrationCount                         = 162
latestMigration                        = 20260727131000_staff_task_integrity_expand
unfinishedMigrationCount               = 0
compositeContractMatchCount             = 14
simpleContractMatchCount                = 14
foreignKeyContractMismatchCount         = 0
unexpectedProtectedForeignKeyCount      = 0
parentIndexContractMatchCount            = 5
parentIndexContractMismatchCount         = 0
enforcement triggers per expected FK    = 4 enabled
```

Пять parent indexes должны быть exact unique/valid/ready/live indexes по
`(tenantId, id)`. Все 14 composite и 14 simple compatibility FK должны точно
соответствовать EXPAND contract и оставаться `NOT VALID`. Admission не
выполняет `VALIDATE`.

State 157–161, post-`VALIDATE`, post-`CONTRACT`, иной PostgreSQL major, другая
schema, лишний protected FK или altered/disabled FK trigger получают
`REJECTED`/exit `3`.

## 6. Acquisition, restore и operational approval

### 6.1. До acquisition

Для будущего `PRODUCTION_LIKE` acquisition нужна защищённая операционная
запись:

- purpose: StaffTask integrity rehearsal;
- source/data owner, operator и отдельный operations/security approver;
- минимально необходимый состав данных;
- snapshot timestamp и freshness requirement;
- exact disposable destination;
- classification, TTL, destruction owner и destruction procedure;
- SHA-256 encrypted snapshot artifact;
- encryption/no-egress/isolation controls;
- stop conditions, incident contact и change record.

Runbook, code SHA, confirmation phrase и зелёный CI не заменяют acquisition или
restore approval. Candidate не выполняет эти действия и не проверяет права
оператора на source.

### 6.2. Encryption и data minimization

- snapshot содержит только необходимые для StaffTask rehearsal relations;
- неиспользуемые PII и свободный текст удаляются либо tokenized утверждённым
  процессом без разрушения ссылочной целостности;
- production credentials, sessions, invite tokens, integration keys и
  signing/encryption secrets не переносятся в действующем виде;
- artifact шифруется при передаче и хранении;
- encryption key не попадает в argv, environment evidence, report или logs;
- raw dump, decrypted pages и row exports не помещаются в git, CI artifacts,
  issue tracker, chat или общий workspace.

### 6.3. Isolation и no-egress

Future `PRODUCTION_LIKE` restore выполняется в отдельный disposable PostgreSQL
16 cluster/volume. Admission разрешает только loopback DB target; remote
hostname полностью запрещён.

API, web, Telegram edge, worker, scheduler и application cron не запускаются.
Outbound network/DNS, integration environment и external delivery должны быть
выключены. Production source не используется admission role.

Точная обязательная attestation:

```text
I_ATTEST_THIS_IS_AN_ISOLATED_ENCRYPTED_NO_EGRESS_NON_PRODUCTION_SNAPSHOT
```

Важно: candidate технически проверяет loopback target и DB privileges, но не
может подтвердить acquisition approval, storage encryption, host firewall,
DNS policy, отсутствие внешнего копирования или будущее уничтожение. Exact
attestation и opaque approval reference — заявления оператора, а не
техническое доказательство этих свойств. Их ложное использование является
security incident.

## 7. TTL и уничтожение

Обязательны три canonical ISO-8601 timestamp:

```text
ACQUIRED_AT <= RESTORED_AT
EXPIRES_AT > current time
```

Допускается clock skew не более пяти минут для acquisition/restore. TTL
считается строго от `RESTORED_AT`, а не от acquisition или admission:

- `SYNTHETIC`: не более 7 дней;
- `PRODUCTION_LIKE`: не более 72 часов.

Продление требует нового approval до expiry. Expired либо превышающий лимит
snapshot получает contract error/exit `1`.

Уничтожение остаётся операционной обязанностью, а не функцией admission.
После завершения, rejection или expiry оператор:

1. прекращает новые соединения и завершает sessions;
2. отзывает login admission role;
3. удаляет exact disposable DB/cluster и volume;
4. удаляет encrypted artifact, decrypted temporary files, caches и
   snapshot-specific keys;
5. проверяет отсутствие snapshot в backup schedule, CI artifacts и общих
   storage;
6. сохраняет privacy-safe destruction evidence.

Admission report не содержит `destroyedAt` и не доказывает уничтожение.

## 8. Exact dedicated database role

Admission выполняется отдельной `LOGIN NOINHERIT` ролью. Она не является DB,
schema, relation или function owner, не состоит в других ролях и не совпадает с
restore owner, migration role, application role либо operator.

Единственный application SELECT allowlist:

1. `public._prisma_migrations`;
2. `public.Tenant`;
3. `public.Store`;
4. `public.User`;
5. `public.UserStoreAccess`;
6. `public.StaffTaskTemplate`;
7. `public.StaffTaskRecurringRule`;
8. `public.StaffTaskRecurringRuleRun`;
9. `public.StaffTask`.

Role contract:

```text
session_user unchanged              = true
transaction_read_only               = true
repeatable_read                      = true
LOGIN                                = true
INHERIT                              = false
SUPERUSER/CREATEROLE/CREATEDB        = false
REPLICATION/BYPASSRLS                = false
database/schema/relation/function owner counts = 0
role membership count               = 0
CONNECT current database            = true
CREATE/TEMP database privilege       = false
USAGE public                         = true
CREATE public                        = false
required SELECT missing count        = 0
excess application SELECT count      = 0
other database CONNECT count         = 0
non-public schema USAGE count        = 0
writable relation count              = 0
SELECT/write sequence counts         = 0
executable user function count       = 0
foreign server USAGE count           = 0
large-object privilege count         = 0
```

Системный catalog read, необходимый для inspection, не расширяет allowlist на
другие user/application relations. Любой другой SELECT, sequence privilege,
user-function execution, foreign-server usage, large-object privilege,
other-database CONNECT, non-public schema usage, membership, ownership или
write authority отклоняет role с `LEAST_PRIVILEGE_ROLE_REQUIRED`.

`default_transaction_read_only=on` добавляется к connection options, но не
заменяет фактическую privilege inspection.

## 9. CLI contract

Каноническая package-команда:

```text
pnpm --filter database db:admit:staff-task-integrity-snapshot -- --pretty
```

Эквивалентный direct entry point:

```text
node packages/database/scripts/staff-task-integrity-snapshot-admission.mjs --pretty
```

Обязательное окружение:

```text
DATABASE_URL=<loopback PostgreSQL URL with schema=public>
RELEASE_SHA=<exact 40-character lowercase Git SHA>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION=SYNTHETIC|PRODUCTION_LIKE
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE=BASELINE_156|EXPAND_162
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE=<exact restored DB name>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM=run-staff-task-integrity-snapshot-admission
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION=I_ATTEST_THIS_IS_AN_ISOLATED_ENCRYPTED_NO_EGRESS_NON_PRODUCTION_SNAPSHOT
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY=<32..4096 UTF-8 bytes>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST=<64 lowercase hex>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE=<opaque 3..128 character alias>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT=<canonical ISO-8601>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT=<canonical ISO-8601>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT=<canonical ISO-8601>
```

Только для `PRODUCTION_LIKE`:

```text
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST=<64 lowercase hex>
```

Это pre-approved HMAC database identity, полученный out-of-band на exact
isolated restore. Для synthetic он не является Gate 2 authority.

Опциональные bounded timeouts:

```text
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_LOCK_TIMEOUT_MS=100..5000
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_STATEMENT_TIMEOUT_MS=1000..120000
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_TRANSACTION_TIMEOUT_MS=5000..600000
```

Defaults: `500`, `30000`, `120000`; обязательно
`lock <= statement <= transaction`.

CLI принимает только `--pretty`, `--help` или `--self-test`. Неизвестный
argument, включая `--apply`, `--restore`, `--migrate`, `--validate`,
`--destroy`, raw output path или remote override, отклоняется.

`--help` и `--self-test` не подключаются к DB. `NODE_ENV=production`, remote
hostname, неверный DB marker, schema не `public`, URL/expected DB mismatch,
неверные timestamps или отсутствие exact attestation отклоняются до normal
report.

## 10. Read-only execution contract

Normal admission:

- создаёт Prisma client с `connection_limit=1`;
- фиксирует `application_name=leetplus_staff_task_snapshot_admission`;
- добавляет `default_transaction_read_only=on`, bounded lock/statement/idle
  transaction timeouts;
- выполняет inspection в одной `READ ONLY REPEATABLE READ` transaction;
- проверяет фактические read-only/isolation/session-role flags;
- выполняет только reviewed `SELECT` catalog/identity/privilege/migration
  queries;
- не выполняет DML, DDL, `LOCK TABLE`, temp objects, restore, migration,
  `VALIDATE`, `ANALYZE`, backfill или auto-fix;
- сохраняет `summary.inventoryExecuted=false` и
  `summary.plannerExecuted=false`;
- закрывает соединение после report/error.

Candidate не обещает ранний short-circuit между отдельными read-only queries.
Catalog/privilege queries могут быть выполнены до формирования итогового
`REJECTED`; безопасность обеспечивается read-only transaction, exact role,
bounded timeouts и финальным fail-closed gate. Нельзя интерпретировать порядок
queries как отдельную гарантию admission.

## 11. Database identity и HMAC evidence

Expected database сначала сравнивается с DB name в `DATABASE_URL`, затем
`databaseNameMatched` сравнивает его с фактическим `current_database()` внутри
snapshot transaction. Database names в report не выводятся.

`databaseIdentityDigest` — domain-separated HMAC-SHA256 только над:

- фактическим `current_database()`;
- PostgreSQL `system_identifier`;
- database OID.

Classification и expected state не входят в `databaseIdentityDigest`. Они
входят в stable admission report и поэтому защищены отдельным
`contentDigest`.

Для `PRODUCTION_LIKE` фактический `databaseIdentityDigest` обязан точно
совпасть с
`STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST`. Raw DB
identity и expected digest не сериализуются отдельно.

Дополнительные evidence:

- `approvalReferenceDigest` — HMAC opaque approval/provenance alias;
- `contentDigest` — domain-separated HMAC stable report, включая
  classification, expected state, release SHA, timestamps, snapshot digest,
  database identity, safety/limits и все aggregate gates;
- `executionDigest` — отдельный HMAC над `{contentDigest, generatedAt}`.

Перед выдачей exit code candidate заново вычисляет и сравнивает
`contentDigest` и `executionDigest`. Любая post-build подмена report или
несогласованность decision/gates даёт exit `1`.

Ни один digest не является row-level checksum, CAS token, approval signature
или разрешением на reconcile/migrate/validate/deploy. HMAC key и raw database
identity не выводятся.

## 12. Decision и exit codes

| Exit | Decision   | Значение                                                                          |
| ---- | ---------- | --------------------------------------------------------------------------------- |
| `0`  | `ADMITTED` | Exact DB, release manifest, state, catalog и privilege gates согласованы          |
| `1`  | `ERROR`    | CLI/env/Git/runtime/connection/evidence-HMAC/internal contract failure            |
| `3`  | `REJECTED` | DB identity, PostgreSQL, migration manifest/state, catalog или role gate rejected |

Admission никогда не возвращает exit `2`: этот код принадлежит downstream
inventory/planner findings.

`ADMITTED` требует одновременно:

- public schema, matched database identity и PostgreSQL 16;
- detected migration state равен expected state;
- exact migration manifest, catalog и privilege gates `ready=true`;
- no-write/no-apply/no-remote safety flags;
- release artifact binding, exact SELECT allowlist и FK trigger enforcement;
- пустой `summary.rejectionCodes`;
- internally verified content/execution HMAC.

Exit `0` не означает Gate 2, clean inventory, approved reconciliation или
готовность к `VALIDATE`.

## 13. Фактический report contract

Privacy-safe JSON имеет следующую форму:

```json
{
  "script": "staff-task-integrity-snapshot-admission",
  "reportSchemaVersion": 1,
  "classification": "SYNTHETIC",
  "expectedState": "BASELINE_156",
  "releaseSha": "<40 lowercase hex>",
  "acquiredAt": "<ISO-8601>",
  "restoredAt": "<ISO-8601>",
  "expiresAt": "<ISO-8601>",
  "snapshotArtifactDigest": "<64 lowercase hex>",
  "approvalReferenceDigest": "<HMAC-SHA256>",
  "databaseIdentityDigest": "<HMAC-SHA256>",
  "safety": {
    "databaseWrites": false,
    "admissionOnly": true,
    "applySupported": false,
    "productionProcessAllowed": false,
    "remoteTargetAllowed": false,
    "connectionLimit": 1,
    "transactionReadOnly": true,
    "isolationLevel": "REPEATABLE READ",
    "leastPrivilegeRoleRequired": true,
    "exactSelectAllowlistRequired": true,
    "releaseArtifactBound": true,
    "enforcementTriggersRequired": true,
    "outputContainsDatabaseName": false,
    "outputContainsRoleName": false,
    "outputContainsRowIdentifiers": false,
    "evidenceAuthorizesReconciliation": false
  },
  "limits": {
    "lockTimeoutMs": 500,
    "statementTimeoutMs": 30000,
    "transactionTimeoutMs": 120000
  },
  "database": {
    "currentSchemaIsPublic": true,
    "databaseNameMatched": true,
    "databaseIdentityDigestRequired": false,
    "databaseIdentityDigestMatched": true,
    "postgresqlMajor": 16,
    "postgresqlMajorSupported": true,
    "migrations": {
      "detectedState": "BASELINE_156",
      "migrationCount": 156,
      "unfinishedMigrationCount": 0,
      "latestMigrationMatchesExpectedState": true
    },
    "migrationManifest": {
      "ready": true,
      "expectedCount": 156,
      "actualCount": 156,
      "manifestDigest": "<SHA-256>"
    },
    "catalog": {
      "ready": true,
      "expected": {
        "foreignKeyMatchCount": 14,
        "foreignKeyMismatchCount": 0,
        "unexpectedProtectedForeignKeyCount": 0,
        "protectedCompositePresentCount": 0,
        "protectedParentIndexPresentCount": 0
      },
      "actual": {
        "foreignKeyMatchCount": 14,
        "foreignKeyMismatchCount": 0,
        "unexpectedProtectedForeignKeyCount": 0,
        "protectedCompositePresentCount": 0,
        "protectedParentIndexPresentCount": 0
      }
    },
    "privileges": {
      "ready": true,
      "actual": {
        "sessionRoleUnchanged": true,
        "transactionReadOnly": true,
        "repeatableRead": true,
        "roleCanLogin": true,
        "roleInherits": false,
        "roleSuperuser": false,
        "roleCanCreateRole": false,
        "roleCanCreateDatabase": false,
        "roleReplication": false,
        "roleBypassRls": false,
        "databaseOwner": false,
        "publicSchemaOwner": false,
        "currentDatabaseConnectPrivilege": true,
        "databaseCreatePrivilege": false,
        "databaseTempPrivilege": false,
        "publicSchemaUsagePrivilege": true,
        "publicSchemaCreatePrivilege": false,
        "roleMembershipCount": 0,
        "ownedDatabaseCount": 0,
        "ownedSchemaCount": 0,
        "ownedRelationCount": 0,
        "ownedFunctionCount": 0,
        "otherDatabaseConnectCount": 0,
        "nonPublicSchemaUsageCount": 0,
        "writableRelationCount": 0,
        "excessSelectRelationCount": 0,
        "writableSequenceCount": 0,
        "selectableSequenceCount": 0,
        "executableUserFunctionCount": 0,
        "foreignServerUsageCount": 0,
        "largeObjectPrivilegeCount": 0,
        "requiredSelectMissingCount": 0
      }
    }
  },
  "summary": {
    "decision": "ADMITTED",
    "rejectionCodes": [],
    "inventoryExecuted": false,
    "plannerExecuted": false
  },
  "generatedAt": "<database snapshot ISO-8601>",
  "contentDigest": "<HMAC-SHA256>",
  "executionDigest": "<HMAC-SHA256>"
}
```

Для `EXPAND_162` поля `database.catalog.expected` и
`database.catalog.actual` имеют точную форму:

```json
{
  "compositeContractMatchCount": 14,
  "simpleContractMatchCount": 14,
  "foreignKeyContractMismatchCount": 0,
  "unexpectedProtectedForeignKeyCount": 0,
  "parentIndexContractMatchCount": 5,
  "parentIndexContractMismatchCount": 0
}
```

Для `PRODUCTION_LIKE`
`database.databaseIdentityDigestRequired=true`. Candidate SHA, raw approval
reference, DB/role names, `system_identifier`, database OID, row IDs, PII,
credentials, HMAC key, isolation verification и destruction result не входят
в report.

CLI exit code сохраняется рядом с report в protected evidence, но не является
JSON field.

## 14. Evidence privacy

Разрешено сохранять:

- exact candidate/release SHA и report schema version;
- classification/expected state;
- migration counts, state, manifest digest и aggregate catalog/role checks;
- snapshot artifact digest;
- `approvalReferenceDigest`, `databaseIdentityDigest`, `contentDigest`,
  `executionDigest`;
- acquisition/restore/expiry/generated timestamps;
- decision, rejection codes и фактический CLI exit;
- opaque protected evidence location.

Запрещено сохранять в git/stdout/CI artifacts:

- database hostname/name/URL, system identifier, database OID и role name;
- tenant/store/user/template/rule/task/run IDs;
- email, phone, names, free text, attachments и row samples;
- approval reference в raw виде;
- credentials, HMAC/encryption keys, tokens и decrypted snapshot path;
- raw SQL result rows.

Snapshot isolation, encryption, no-egress и destruction подтверждаются
отдельной protected operational evidence. Admission attestation не превращает
их в технически проверенные JSON fields.

## 15. Обязательная последовательность

```text
acquisition approval
  → encrypted snapshot acquisition
  → isolated PostgreSQL 16 loopback restore
  → admission(BASELINE_156)
  → populated baseline 156 evidence
  → exact migrations 157..162
  → admission(EXPAND_162)
  → read-only integrity inventory
  → aggregate reconciliation planner
  → owner decision for every non-zero code
  → protected row-level reconciliation dry-run
  → separate approved apply
  → zero-diff dry-run
  → repeat inventory/planner
```

Для `SYNTHETIC` эта последовательность является только engineering/CI
rehearsal и никогда не удовлетворяет Gate 2.

Реализованный
[proposal dry-run](./staff-task-integrity-reconciliation-proposal-dry-run-runbook.md)
покрывает только `SYNTHETIC EXPAND_162` disposable harness с подписанной
provenance. Он не является будущим production-like шагом из схемы выше:
standalone target отклоняется, предложения не авторизуют apply, а 29 operator
и 6 review кодов остаются aggregate-only.

Для будущего `PRODUCTION_LIKE` каждый переход требует отдельного operational
approval/evidence. Нельзя:

- пропускать `BASELINE_156` admission;
- применять `157..162` до baseline evidence;
- запускать inventory/planner на partially migrated state;
- считать HMAC/proposal owner decision или apply authorization;
- выполнять apply до protected row-level dry-run и отдельного approval;
- выполнять `VALIDATE` до zero-diff и повторного inventory/planner.

Production-like acquisition/restore/admission, production apply, `VALIDATE`,
`CONTRACT`, deployment, production cutover и external beta остаются `NO-GO`.

## 16. Stop conditions

Работа останавливается при:

- отсутствии approval, encryption, TTL, destruction owner или artifact digest;
- remote/production endpoint либо `NODE_ENV=production`;
- egress path, запущенном application/worker/scheduler или действующем
  integration secret;
- Git HEAD/source/manifest mismatch;
- PostgreSQL/schema/state/catalog/FK-trigger mismatch;
- database identity mismatch;
- admission role membership, ownership, лишнем SELECT/EXECUTE/USAGE/CONNECT
  либо любом write privilege;
- invalid timeline или expired snapshot;
- report HMAC mismatch;
- появлении raw identity, row ID, PII или secret в report/log;
- попытке использовать synthetic evidence для Gate 2;
- попытке использовать admission digest как row-level CAS/apply authorization;
- невозможности подтвердить уничтожение snapshot.

После stop condition release decision остаётся `NO-GO`. Нельзя ослаблять
проверки, повышать timeout сверх contract или менять classification на ходу.

## 17. Оставшиеся gates

До повышения operational статуса остаются:

1. получить clean remote CI evidence для exact SHA;
2. отдельно одобрить acquisition/restore production-like snapshot;
3. получить out-of-band expected database identity digest;
4. выполнить первый `PRODUCTION_LIKE` admission только на loopback disposable
   cluster;
5. уничтожить snapshot по TTL и сохранить destruction evidence.
6. расширить synthetic PostgreSQL rehearsal proposal dry-run: кроме уже
   проверенного одного positive predicate покрыть оставшиеся семь proposal
   predicates и coalescing; это P1 test evidence, а не разрешение
   production-like запуска.

Ни один из этих пунктов сам по себе не разрешает apply, `VALIDATE`, deploy или
внешний beta-доступ.

## 18. Changelog

- `0.3.0`, 27.07.2026 — release authority обновлена до exact candidate
  `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`; admission сохраняет 16/16 unit,
  offline contract расширен до 36 checks, integrated disposable PostgreSQL
  16.14 smoke — до 14 scenarios. Добавлен downstream proposal dry-run, строго
  ограниченный подписанной `SYNTHETIC EXPAND_162` harness provenance;
  production-like/standalone/apply/`VALIDATE`/`CONTRACT`/deploy/external beta
  остаются `NO-GO`.
- `0.2.2`, 27.07.2026 — зафиксирован финальный security rereview без P0/P1 и
  оставшиеся P2: in-process ACL cleanup только для disposable CI, operational
  attestation границы и запрет loopback tunnel/proxy к remote target.
- `0.2.1`, 27.07.2026 — candidate привязан к
  `7d67333b22f171c6e79f723190647cdd2454b128`; SYNTHETIC PostgreSQL 16
  rehearsal прошёл 9 сценариев: admission `BASELINE_156`, exact migrations
  `157..162`, admission `EXPAND_162`, privilege/FK-trigger/tamper negative
  checks, planner exits, privacy, source fingerprint и полный cleanup.
  Production-like запуск и внешний beta остаются `NO-GO`.
- `0.2.0`, 27.07.2026 — runbook синхронизирован с реализованным candidate:
  exact clean Git `RELEASE_SHA`, loopback-only target, `EXPECTED_STATE`,
  acquisition/restore timeline, production-like identity digest, exact
  nine-table SELECT allowlist, NOINHERIT/no-membership/no-ownership role,
  per-FK enabled trigger contract, internally verified HMAC report и
  фактическая JSON shape.
- `0.1.0`, 27.07.2026 — создан draft-контракт snapshot admission.
