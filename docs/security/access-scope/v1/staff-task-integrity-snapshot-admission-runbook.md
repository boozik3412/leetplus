# Staff task integrity: snapshot admission runbook

| Поле                    | Значение                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| Статус                  | `IMPLEMENTED_CANDIDATE`; SYNTHETIC real-PG `PASS`; PRODUCTION_LIKE `NO-GO` |
| Версия                  | 0.13.0                                                                     |
| Дата                    | 29.07.2026                                                                 |
| Backlog                 | `BETA-MOD-STAFF-003`, `BETA-OPS-002`, `BETA-OPS-006`, `BETA-CUT-001`       |
| Current candidate SHA   | Exact PR/release SHA; принимается только с green remote CI evidence        |
| Current operational     | `CURRENT_166`; exact-SHA remote CI и populated `165 → 166` pending         |
| Historical green remote | `CURRENT_165`: `4bd6a036...` / `30428288353`; `7c20adec...` / `30429463161` |
| Historical runtime SHA  | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; не current evidence            |
| Historical test SHA     | `2341b99937e54cc50d1763a0a794d975816c72ce`; не current evidence            |
| Report schema version   | 2                                                                          |
| PostgreSQL              | Только major version `16`                                                  |
| Разрешённая schema      | Только `public`                                                            |

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
- принимает только `BASELINE_156`, `EXPAND_162` или `CURRENT_166`;
- разрешает PostgreSQL только на `127.0.0.1`, `localhost` или `::1`;
- отвергает `NODE_ENV=production`;
- использует exact committed `RELEASE_SHA`, а не содержимое mutable worktree;
- сверяет exact migration names, SHA-256 checksums и runtime source с Git
  blobs exact release;
- использует ровно одно DB-соединение и одну
  `READ ONLY REPEATABLE READ` transaction;
- проверяет exact column-scoped SELECT-only role contract;
- для `PRODUCTION_LIKE` требует независимый Ed25519 authority manifest,
  подписанный root из exact release, и nonce-bound DB/approval binding;
- создаёт aggregate privacy-safe report; HMAC используется только для
  integrity и pseudonymization;
- не имеет restore, migrate, export, row-level, apply, `VALIDATE`, destroy или
  auto-fix path.

Текущий статус verification:

```text
implementation candidate               = IMPLEMENTED_CANDIDATE
admission contract tests               = LOCAL PASS (21/21)
authority/acquisition/detached tests    = LOCAL PASS (40/40; positive E2E; CURRENT_164/CURRENT_165 rejected)
public-only positive pinned path        = LOCAL PASS (isolated test-only child)
test evidence commit                      = 2341b99937e54cc50d1763a0a794d975816c72ce
offline/integrated smoke self-test       = PASS (48 checks)
SYNTHETIC real PostgreSQL verification = PASS (23 scenarios; PostgreSQL 16.13)
PRODUCTION_LIKE acquisition/restore/run = NOT EXECUTED
production-like authority roots         = {} / EMPTY; FAIL-CLOSED
remote CURRENT_164 prerequisite          = PASS / 37f8cc88... / CI 30423839760
historical CURRENT_165 engineering       = PASS / 4bd6a036... / CI 30428288353
historical CURRENT_165 docs successor    = PASS / 7c20adec... / CI 30429463161
current CURRENT_166 remote/PG evidence   = PENDING
main protection/ruleset/CODEOWNERS       = ABSENT
exact current authority-candidate CI     = PENDING
Node 22 experimental module mocks        = P2 TEST-INFRA RISK
remote admission                        = NO-GO
production apply/VALIDATE/deploy        = NO-GO
external beta                           = NO-GO
```

Этот verification slice закрывает synthetic fixture matrix и техническую
column-scoped/authority verification boundary. Public-only pre-signed fixture
локально подтверждает положительный путь
`pinned wrapper → marker/identity matching → private same-process report
evidence`, отрицательные marker/expiry/detached-report сценарии и запрет
preload. Fixture исполняется отдельным test-only child process с direct-entry
realpath guard, не содержит private signing material и не изменяет пустой
production root registry. Это test evidence, а не production-like operational
trust или root enrollment. Strict acquisition contract, root lifecycle и
detached `prepare → external sign → finalize` реализованы отдельным candidate:
finalize re-hash исходный request, actual root history проходит parent→HEAD CI
gate, runtime bytes сверяются с Git blobs exact SHA, а payload/envelope
публикуются последними readiness files. LeetPlus не читает private key,
passphrase или HSM credential. External signer/HSM, separation of duties,
protected transport и enrollment production-like public root остаются P0
перед первым rehearsal; remote CI для exact authority candidate ещё не
получен. Использование
экспериментального Node 22 `--experimental-test-module-mocks` остаётся P2
риском тестовой инфраструктуры.

Дополнительные operational ограничения сохраняют `NO-GO`:

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

- класс не доказывается именем БД, hostname, количеством строк или похожестью
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

Для `SYNTHETIC` действуют exact harness markers:

- database name: `lp_snapshot_admission_ci_<16 lowercase hex>`;
- approval reference начинается с `synthetic:`.

Это доверенная декларация harness/оператора, а не автоматическое доказательство
происхождения данных, absence of PII или соответствия Gate 2. Для
`PRODUCTION_LIKE` имя содержит отдельный
`snapshot|rehearsal|preprod|staging|stage|test` marker, но оно также не
заменяет classification, signed authority или approval.

## 4. Exact release authority

`RELEASE_SHA` — обязательный 40-character lowercase Git SHA. Candidate:

1. находит repository root из фактического runtime path;
2. требует `HEAD === RELEASE_SHA`;
3. читает через `git cat-file` exact release blobs admission, smoke, authority,
   authority roots/root lifecycle, acquisition contract, detached ceremony и
   inventory/planner/proposal runtime;
4. требует, чтобы фактический runtime content этих файлов совпадал с Git blobs
   exact release после нормализации UTF-8/LF;
5. требует clean status для всех этих runtime sources и
   `packages/database/prisma/migrations`;
6. читает migration paths и `migration.sql` blobs через Git из exact
   `RELEASE_SHA`;
7. требует, чтобы release manifest содержал ровно 162 canonical migration
   directories;
8. для выбранного state строит expected manifest из первых 156 либо всех 162
   migration blobs и сравнивает exact names/checksums с
   `public._prisma_migrations`.

Незакоммиченный, untracked или изменённый authority source не используется.
`assume-unchanged`/`skip-worktree` не позволяют подменить проверяемые runtime
bytes: content всё равно сравнивается с exact Git blob. Mutable worktree не
является источником migration truth. Отсутствующий Git object, другой HEAD,
dirty authority path, runtime/blob mismatch или неверный manifest дают
contract error/exit `1`.

### 4.1. Независимый production-like authority

Для `PRODUCTION_LIKE` caller-supplied HMAC не является authority. Admission
принимает только canonical JSON envelope, целиком закодированный canonical
base64url и подписанный Ed25519-ключом, public root которого закреплён в exact
release. Envelope строго связывает:

- purpose, classification, profile и isolation profile;
- `signingKeyId`, exact `releaseSha` и expected schema state;
- digest encrypted snapshot artifact;
- одноразовый `creationNonce`;
- nonce-bound digests database identity и approval reference;
- acquisition, restore, issue и expiry timestamps.

Nonce-bound database identity вычисляется над
`current_database() + system_identifier + database OID + creationNonce`.
Approval digest отдельно связывает opaque approval reference с тем же nonce.
В comment exact restored database должен находиться marker
`LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_V2:<authority-envelope-digest>`;
admission читает и сверяет его внутри той же snapshot transaction.

Pinned root также ограничен exact algorithm/classification/profile/purpose,
fingerprint и интервалом действия. Freshness проверяется при разборе
конфигурации, по DB `generatedAt` при создании report и повторно по текущему
времени перед exit. Просроченный manifest/report не может получить exit `0`.

Admission runtime остаётся только verifier: в нём нет signing/private-key API,
получения snapshot или restore. Detached authority CLI формирует payload и
проверяет внешнюю signature, но также не принимает private key, seed,
passphrase, HSM PIN или signing secret через file/env/argv/stdin. Acquisition
request целиком связан с envelope через
`acquisition-v1:<requestDigest>` и nonce-bound approval digest.

Canonical
`staff-task-integrity-snapshot-authority-roots.json` содержит намеренно пустой
registry `{}`, а `staff-task-integrity-snapshot-authority-roots.mjs` только
загружает и deep-freeze data. Actual parent→HEAD transition проверяется
отдельным CI gate. Поэтому любой `PRODUCTION_LIKE` prepare/admission
завершается fail-closed `PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED`. До отдельного
external signer/key-custody approval, protected transport,
security-reviewed public root enrollment и зелёного CI exact enrolled-root SHA
статус production-like остаётся P0/`NO-GO`.

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

### 5.3. `CURRENT_166`

```text
migrationCount                         = 166
latestMigration                        = 20260729160000_guest_game_delivery_claim_fence
unfinishedMigrationCount               = 0
compositeContractMatchCount             = 14
simpleContractMatchCount                = 14
foreignKeyContractMismatchCount         = 0
unexpectedProtectedForeignKeyCount      = 0
parentIndexContractMatchCount            = 5
parentIndexContractMismatchCount         = 0
enforcement triggers per expected FK    = 4 enabled
```

`CURRENT_166` содержит exact frozen StaffTask prefix `EXPAND_162` плюс ровно
четыре allowlisted additive tail migrations:
`20260728120000_tenant_execution_control_plane_expand` и
`20260728150000_tenant_execution_revision_fence` и
`20260729120000_store_background_execution_fence` и
`20260729160000_guest_game_delivery_claim_fence`. Migration `165` добавляет
fail-closed Store background-execution fence, migration `166` — delivery
claim/attempt/transition fence как implementation candidate. Ни один Store не
активируется, outbound остаётся `OFF`. Tail не может менять protected
`StaffTask*` relations, FK, indexes или triggers. Иная migration в tail,
дополнительная migration либо изменённый prefix получают
`REJECTED`/exit `3`.

`CURRENT_165` сохраняется только как historical accepted engineering evidence
на `4bd6a036...`/`30428288353` и
`7c20adec...`/`30429463161`; current admission его не принимает. Remote
exact-SHA и populated PostgreSQL `165 → 166` для `CURRENT_166` ещё pending.

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

Допускается clock skew не более пяти минут для acquisition/restore. Runtime
admission считает свой лимит от `RESTORED_AT`:

- `SYNTHETIC`: не более 7 дней;
- `PRODUCTION_LIKE`: не более 72 часов.

Дополнительно canonical production-like acquisition request требует полный
интервал `EXPIRES_AT - ACQUIRED_AT <= 72 часа`. Оба ограничения обязательны;
эффективный deadline выбирается более ранним. Поэтому acquisition request не
может продлить срок за счёт позднего restore.

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

Логический application allowlist содержит девять relations. Восемь из них
требуют table-level `SELECT`:

1. `public._prisma_migrations`;
2. `public.Tenant`;
3. `public.Store`;
4. `public.UserStoreAccess`;
5. `public.StaffTaskTemplate`;
6. `public.StaffTaskRecurringRule`;
7. `public.StaffTaskRecurringRuleRun`;
8. `public.StaffTask`.

Для девятой relation, `public.User`, table-level `SELECT` запрещён. Разрешены
ровно пять column grants:

```text
id
tenantId
isPlatformAdmin
isActive
accessScope
```

Следовательно, `SELECT * FROM public."User"` и чтение любой другой `User`
колонки должны завершаться отказом PostgreSQL.

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
SELECT grant-option relation count   = 0
column-scoped table SELECT count     = 0
excess User SELECT column count      = 0
SELECT grant-option column count     = 0
PUBLIC SELECT relation count         = 0
other database CONNECT count         = 0
non-public schema USAGE count        = 0
writable relation count              = 0
SELECT/write sequence counts         = 0
executable user function count       = 0
foreign server USAGE count           = 0
large-object privilege count         = 0
```

Системный catalog read, необходимый для inspection, не расширяет allowlist на
другие user/application relations. Role отклоняется с
`LEAST_PRIVILEGE_ROLE_REQUIRED` при table-wide `User` SELECT, missing/extra или
renamed required column, table/column grant option, любом table/column SELECT
через `PUBLIC`, любом другом SELECT, sequence privilege, user-function
execution, foreign-server usage, large-object privilege, other-database
CONNECT, non-public schema usage, membership, ownership или write authority.
Physical rename `accessScope` не маскируется ordinal fallback и также
fail-closed отклоняется.

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
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE=BASELINE_156|EXPAND_162|CURRENT_166
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE=<exact restored DB name>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM=run-staff-task-integrity-snapshot-admission
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION=I_ATTEST_THIS_IS_AN_ISOLATED_ENCRYPTED_NO_EGRESS_NON_PRODUCTION_SNAPSHOT
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY=<32..4096 UTF-8 bytes>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST=<64 lowercase hex>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE=<synthetic:* for SYNTHETIC; acquisition-v1:<64 lowercase hex> for PRODUCTION_LIKE>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT=<canonical ISO-8601>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT=<canonical ISO-8601>
STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT=<canonical ISO-8601>
```

Только для `PRODUCTION_LIKE`:

```text
STAFF_TASK_INTEGRITY_SNAPSHOT_AUTHORITY_MANIFEST=<canonical base64url envelope>
```

Envelope должен иметь canonical JSON/base64url форму, Ed25519 signature и
`signingKeyId`, существующий в pinned root registry exact release. Private key
или public-key override через environment не поддерживаются.

Legacy
`STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST` запрещён
для `PRODUCTION_LIKE`: даже корректный caller-supplied HMAC вызывает
`LEGACY_PRODUCTION_LIKE_AUTHORITY_PROHIBITED`. Для synthetic optional identity
digest остаётся только harness-check и никогда не является Gate 2 authority.

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
hostname, неверный DB-name marker, schema не `public`, URL/expected DB
mismatch, неверные timestamps, отсутствие exact attestation или невалидный
authority manifest отклоняются до normal report. При текущем пустом root
registry любой production-like manifest отклоняется до DB connection.

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

## 11. Database identity, authority и HMAC evidence

Expected database сначала сравнивается с DB name в `DATABASE_URL`, затем
`databaseNameMatched` сравнивает его с фактическим `current_database()` внутри
snapshot transaction. Database names в report не выводятся.

Сериализуемый `databaseIdentityDigest` — domain-separated HMAC-SHA256 только
над:

- фактическим `current_database()`;
- PostgreSQL `system_identifier`;
- database OID.

Classification и expected state не входят в `databaseIdentityDigest`. Они
входят в stable admission report и поэтому защищены отдельным
`contentDigest`.

Для `PRODUCTION_LIKE` этот HMAC не участвует в authority decision. Вместо него
admission независимо вычисляет nonce-bound SHA-256 database identity из
фактических DB identity fields и `creationNonce` signed envelope, сравнивает
его с подписанным `databaseIdentityDigest` manifest и отдельно сверяет DB
comment marker с digest того же envelope. Authority digest, raw DB identity и
raw marker не сериализуются.

Дополнительные evidence:

- `approvalReferenceDigest` — HMAC opaque approval/provenance alias;
- `contentDigest` — domain-separated HMAC v2 stable report, включая
  classification, expected state, release SHA, timestamps, snapshot digest,
  database identity, safety/limits и все aggregate gates;
- `executionDigest` — отдельный HMAC v2 над
  `{contentDigest, generatedAt}`.

Перед выдачей exit code candidate заново вычисляет и сравнивает
`contentDigest`/`executionDigest`, проверяет непросроченный `expiresAt` по
текущему времени и согласованность decision/gates. Любая post-build подмена
report, expiry между generation и exit либо несогласованность даёт exit `1`.

HMAC key контролируется caller и используется только для privacy-safe
pseudonymization и integrity внутри текущего процесса. HMAC не доказывает
классификацию, approval или происхождение snapshot и не может заменить
Ed25519 authority.

Положительный production-like report дополнительно получает приватное
same-process evidence, которое не сериализуется и должно совпасть с
`contentDigest` перед exit `0`. Поэтому повторно загруженный JSON, даже с
валидным HMAC, не является самостоятельно переносимым audit proof и не может
повторно пройти production-like gate. Для аудита report сопоставляется с
protected signed authority manifest, release SHA, фактическим CLI exit и
операционной acquisition/restore evidence.

Ни один digest или report не является row-level checksum, CAS token, owner
decision, approval signature либо разрешением на
reconcile/migrate/validate/deploy. HMAC key, raw database identity и signed
manifest не выводятся в обычный report.

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
- release artifact/runtime binding, exact table/column SELECT allowlist и FK
  trigger enforcement;
- для `PRODUCTION_LIKE`: pinned-root Ed25519 authority, nonce-bound
  DB/approval binding, exact DB comment marker, freshness и private
  same-process report evidence;
- для `SYNTHETIC`: authority flags остаются `false`, exact harness DB/reference
  markers не трактуются как Gate 2;
- пустой `summary.rejectionCodes`;
- internally verified content/execution HMAC.

Exit `0` не означает Gate 2, clean inventory, approved reconciliation или
готовность к `VALIDATE`.

## 13. Фактический report contract

Privacy-safe JSON имеет следующую форму:

```json
{
  "script": "staff-task-integrity-snapshot-admission",
  "reportSchemaVersion": 2,
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
    "independentProductionLikeAuthorityRequired": true,
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
    "snapshotNotExpiredAtGeneration": true,
    "databaseIdentityDigestRequired": false,
    "databaseIdentityDigestMatched": true,
    "productionLikeAuthorityVerified": false,
    "productionLikeAuthorityDatabaseMarkerMatched": false,
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
        "selectGrantOptionRelationCount": 0,
        "columnScopedTableSelectCount": 0,
        "excessSelectColumnCount": 0,
        "selectGrantOptionColumnCount": 0,
        "publicSelectRelationCount": 0,
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

Для `PRODUCTION_LIKE` поля
`database.databaseIdentityDigestRequired`,
`database.productionLikeAuthorityVerified` и
`database.productionLikeAuthorityDatabaseMarkerMatched` обязаны быть `true`.
Для `SYNTHETIC` последние два поля обязаны оставаться `false`. Candidate SHA,
raw approval reference, signed authority manifest, DB comment marker, DB/role
names, `system_identifier`, database OID, row IDs, PII, credentials, HMAC key,
isolation verification и destruction result не входят в report.

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

Только в защищённом access-controlled evidence bundle для будущего
`PRODUCTION_LIKE` сохраняются signed authority manifest, signing key
fingerprint/key id, acquisition/restore approvals и доказательство установки
exact DB marker. Они коррелируются с report/release SHA, но не копируются в
обычный JSON/stdout.

`BASELINE_156`, `EXPAND_162` и `CURRENT_166` используют три разных state-bound
authority envelope. После migrations `157..162` повторная detached ceremony
`prepare → external sign → finalize` выпускает `EXPAND_162` envelope с новым
nonce-bound binding; после exact allowlisted migrations `163..166` третья
ceremony выпускает `CURRENT_166` envelope с ещё одним новым binding.
DB `COMMENT` marker заменяется digest соответствующего envelope до каждого
следующего admission. Protected evidence хранит все три authority bundle,
первоначальную установку marker и обе ротации. Raw marker или manifest в
git/stdout не попадают.

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
reviewed public-root enrollment → green CI exact enrolled-root SHA
acquisition approval
  → encrypted snapshot acquisition
  → isolated PostgreSQL 16 loopback restore
  → create LOGIN NOINHERIT reader role → exact grants → negative ACL gate
  → canonical BASELINE_156 request → prepare package/payload
  → approved external signer/HSM verifies request+package+payload → finalize envelope
  → install exact BASELINE_156 signed-envelope DB comment marker
  → admission(BASELINE_156)
  → populated baseline 156 evidence
  → exact migrations 157..162
  → new EXPAND_162 request → prepare → external signer/HSM → finalize
  → replace DB comment marker with exact EXPAND_162 envelope digest
  → admission(EXPAND_162)
  → exact allowlisted migration 20260728120000_tenant_execution_control_plane_expand
  → exact allowlisted migration 20260728150000_tenant_execution_revision_fence
  → exact allowlisted migration 20260729120000_store_background_execution_fence
  → exact allowlisted migration 20260729160000_guest_game_delivery_claim_fence
  → new CURRENT_166 request → prepare → external signer/HSM → finalize
  → replace DB comment marker with exact CURRENT_166 envelope digest
  → admission(CURRENT_166)
  → read-only integrity inventory
  → aggregate reconciliation planner
  → owner decision for every non-zero code
  → protected row-level reconciliation dry-run
  → separate approved apply
  → zero-diff dry-run
  → repeat inventory/planner
  → revoke login → terminate sessions → drop reader role
  → destroy snapshot/artifact/temp files → save destruction evidence
```

Для `SYNTHETIC` эта последовательность является только engineering/CI
rehearsal и никогда не удовлетворяет Gate 2.

Реализованный
[proposal dry-run](./staff-task-integrity-reconciliation-proposal-dry-run-runbook.md)
покрывает только `SYNTHETIC EXPAND_162` disposable harness с явной
harness provenance. Exact DB-name/`synthetic:` markers являются доверенной
декларацией тестового контура, а не доказательством production-like
происхождения. Этот dry-run не является будущим production-like шагом из схемы
выше:
standalone target отклоняется, предложения не авторизуют apply, а 29 operator
и 6 review кодов остаются aggregate-only.

Для будущего `PRODUCTION_LIKE` каждый переход требует отдельного operational
approval/evidence. Нельзя:

- пропускать `BASELINE_156` admission;
- использовать caller HMAC/legacy identity digest вместо signed authority;
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
- production-like signer/root не enrolled, signature/binding/root validity,
  DB comment marker или private report evidence не подтверждены;
- admission role membership, ownership, table-wide/extra/missing/renamed
  `User` SELECT, grant option, `PUBLIC` SELECT, лишнем
  SELECT/EXECUTE/USAGE/CONNECT либо любом write privilege;
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

1. P0: независимо проверить detached signer/acquisition/root-lifecycle
   candidate; утвердить внешний signer/HSM, separation of duties, key custody
   и защищённый acquisition-to-signature transport;
2. считать `37f8cc88...` historical prerequisite `CURRENT_164`, а
   `4bd6a036...` / CI `30428288353` и
   `7c20adec...` / CI `30429463161` — historical `CURRENT_165` engineering
   evidence; ни одно из них не является current `CURRENT_166` или
   production-like evidence;
3. P2: зафиксировать поддерживаемую Node 22 версию для test-only
   `--experimental-test-module-mocks` и отслеживать/заменить experimental API,
   если он изменится;
4. P0: сначала включить защищённый approval path: сейчас `main` без branch
   protection/ruleset/CODEOWNERS, поэтому необходим независимый reviewer;
   затем отдельным reviewed release enroll хотя бы один production-like
   Ed25519 public root с exact fingerprint, profile/purpose и validity window;
   private key не должен попадать в admission runtime, environment или repo;
5. P0: одобрить acquisition/restore workflow, три state-bound nonce-signed
   envelope (`BASELINE_156`, `EXPAND_162`, `CURRENT_166`), первоначальную
   установку и две обязательные ротации exact DB comment marker, а также
   protected evidence storage;
6. получить clean remote CI evidence для exact enrolled-root SHA;
7. выполнить первый `PRODUCTION_LIKE` admission только на loopback disposable
   PostgreSQL 16 cluster и сопоставить same-process report с protected signed
   manifest/acquisition evidence;
8. уничтожить snapshot по TTL и сохранить destruction evidence.

Synthetic coverage для всех восьми proposal codes и coalescing двух last-task
причин подтверждён real PostgreSQL smoke, но это только engineering evidence.
Он не закрывает ни один production-like gate.

Ни один из перечисленных пунктов сам по себе не разрешает apply, `VALIDATE`,
deploy или внешний beta-доступ. После production-like admission всё ещё
обязательны отдельные inventory/planner, protected row-level dry-run, approved
apply/rollback, zero-diff и повторные проверки.

## 18. Changelog

- `0.13.0`, 29.07.2026 — current admission contract переведён на
  implementation candidate `CURRENT_166`: count `166`, latest
  `20260729160000_guest_game_delivery_claim_fence`, exact allowlisted tail
  `163..166`. Remote exact-SHA и populated `165 → 166` pending; production
  roots остаются `{}` и все production-like/external действия — `NO-GO`.
  `4bd6a036...`/`30428288353` и `7c20adec...`/`30429463161` сохранены как
  historical `CURRENT_165` evidence.
- `0.12.0`, 29.07.2026 — historical exact `CURRENT_165` remote engineering
  candidate
  `4bd6a036...` прошёл CI `30428288353`: все три job, real PostgreSQL
  `164 → 165`, admission/application/authority gates зелёные.
  Production-like acquisition/admission, root enrollment, deploy и внешний
  beta остаются `NO-GO`.
- `0.11.0`, 29.07.2026 — then-current admission contract переведён в
  `CURRENT_165`: `migrationCount=165`, latest
  `20260729120000_store_background_execution_fence`, exact allowlisted tail
  `163..165`. Remote `CURRENT_164` prerequisite прошёл на `37f8cc88...`, CI
  `30423839760`. Authority suite теперь 40/40 с child-process positive
  ceremony E2E и rejection промежуточного `CURRENT_164`, но root registry
  остаётся `{}`. `main` не защищён
  branch protection/ruleset/CODEOWNERS; независимый reviewer обязателен до
  root enrollment. Production-like/deploy/external beta остаются `NO-GO`.
- `0.10.0`, 29.07.2026 — exact-release boundary дополнена
  dependency-free canonical JSON runtime; ceremony closure больше не
  импортирует Prisma/inventory. Readiness pair проходит explicit
  open/write/`fsync`/close cleanup, parent-root registry считается пустым
  только при доказанно отсутствующем Git blob. Local authority bundle —
  38/38, admission — 21/21; production-like/external beta остаются `NO-GO`.

- `0.9.0`, 29.07.2026 — security review findings закрыты в candidate:
  `finalize` повторно читает canonical acquisition request и сверяет всю
  binding chain; string-only actors устраняют type-confusion; DB-name contract
  общий с admission; canonical root JSON защищён actual parent→HEAD CI gate с
  emergency revoke-to-zero/recovery; ceremony сверяет runtime с exact Git
  blobs до publication; ADS paths запрещены; receipt/package пишутся первыми,
  а envelope/payload — последними readiness files с flush. Local authority
  bundle — 35/35, admission — 20/20. Registry остаётся пустым,
  production-like/external beta — `NO-GO`.

- `0.8.0`, 29.07.2026 — добавлены strict canonical acquisition evidence и
  derived `acquisition-v1:<digest>` approval authority, lifecycle root registry
  `ACTIVE/RETIRED/REVOKED` с rotation/revocation transition guards и detached
  ceremony `prepare → external Ed25519 sign → finalize`. LeetPlus source не
  импортирует private-key/signing API, не принимает signing secrets через
  env/argv/stdin и пишет package/payload/envelope/receipt только во внешнее
  protected storage без overwrite и удаляет созданную часть набора при
  невозможности записать весь pair. Local authority bundle — 30/30, admission
  — 20/20. Production registry остаётся пустым; external signer, root
  enrollment, acquisition/restore и remote exact-SHA CI — P0/PENDING.

- `0.7.0`, 28.07.2026 — current admission синхронизирован с
  `CURRENT_164`: exact additive tail теперь состоит из reviewed migrations
  163 и 164, а третий state-bound envelope/marker/admission выпускается только
  после обеих migrations.
- `0.6.0`, 28.07.2026 — admission contract синхронизирован с frozen
  StaffTask prefix `EXPAND_162` и current DB state `CURRENT_163`; добавлены
  exact allowlisted migration 163, третий state-bound envelope/marker
  rotation/admission и явная маркировка прежних SHA как historical evidence.
- `0.5.0`, 28.07.2026 — runtime admission candidate сохранён на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, а отдельное test evidence
  привязано к `2341b99937e54cc50d1763a0a794d975816c72ce`. Public-only
  pre-signed fixture без private signing material локально прошла полный
  positive pinned path в изолированном test-only child: pinned wrapper,
  marker/nonce-bound identity, private same-process report evidence, negative
  marker/expiry, detached-report и preload cases. Admission tests — 19/19,
  authority — 9/9. Production root registry остаётся пустым,
  `PRODUCTION_LIKE` — fail-closed `NO-GO`; signer/acquisition/root enrollment —
  P0, remote CI pending. Experimental Node 22 module mocks зафиксированы как P2
  test-infra risk. Два state-bound envelope и обязательная marker rotation
  остаются неизменной operational границей.
- `0.4.0`, 28.07.2026 — candidate привязан к
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, report schema повышена до v2.
  Exact role contract сужен до table `SELECT` на восьми relations и пяти
  колонок `User`; table-wide/extra/missing/renamed/grant-option/`PUBLIC`
  grants и `SELECT *` отклоняются. Добавлен verify-only production-like
  authority: canonical base64url Ed25519 manifest, exact-release pinned roots,
  nonce-bound DB/approval digests, DB comment marker, mandatory freshness,
  runtime-content/Git-blob binding и private same-process report evidence.
  Legacy production-like HMAC identity запрещён; HMAC оставлен только для
  integrity/pseudonymization. Admission tests 18/18, authority tests 9/9,
  smoke self-test 46 и disposable PostgreSQL 16.13 smoke 23 scenarios прошли,
  включая все восемь proposal fixtures и coalescing. Root registry остаётся
  пустым; signer/acquisition/root enrollment — P0, поэтому production-like и
  внешний beta остаются `NO-GO`.
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
