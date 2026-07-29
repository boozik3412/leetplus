# Staff task integrity: aggregate reconciliation plan runbook

| Поле                  | Значение                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| Статус                | `IMPLEMENTED_CANDIDATE`; schema target CURRENT_166; last accepted exact-head `be8c94c4...` / run #29; all engineering provider-write P1 closed; не deployed |
| Версия                | 1.13.0                                                                     |
| Дата                  | 29.07.2026                                                                 |
| Backlog               | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                       |
| Schema target         | `CURRENT_166`                                                              |
| Prior merge-ref baseline | PR-head-associated merge-ref `bbef153a...` / CI `30443837684`; not exact-SHA |
| Previous accepted exact-head | `d525b736...` / CI `30447467729` (`run #28`); `3/3 PASS`             |
| Last accepted checkpoint | exact-head `be8c94c4...` / CI `30449026506` (`run #29`); `3/3 PASS`      |
| Current operational gate | non-owner runtime/app DB role admission and explicit `EXECUTE`; provider activation `NO-GO` |
| Historical remote     | `CURRENT_165`: `4bd6a036...` / `30428288353`; `7c20adec...` / `30429463161` |
| Historical planner    | `2c74c663780b3f183be708a01431c22efe57a723`; не current evidence            |
| Historical dry-run    | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; SYNTHETIC, не current evidence |
| Report schema version | 1                                                                          |
| Admission schema      | 2                                                                          |
| Protected prefix      | 162; latest `20260727131000_staff_task_integrity_expand`                   |
| Требуемая current DB  | `CURRENT_166`; latest `20260729160000_guest_game_delivery_claim_fence`     |
| Обязательный допуск   | [Snapshot admission](./staff-task-integrity-snapshot-admission-runbook.md) |
| Предыдущий этап       | [Integrity inventory](./staff-task-integrity-inventory-runbook.md)         |
| Связанный EXPAND      | [StaffTask integrity EXPAND](./staff-task-integrity-expand-runbook.md)     |

Этот runbook описывает агрегированный план классификации результатов
StaffTask integrity inventory. Planner помогает оценить объём будущей
reconciliation и распределить классы работы, но не выводит идентификаторы
строк, не исправляет данные и не разрешает apply.

Наличие слова `proposal` в отчёте не является разрешением на изменение данных.
В candidate отсутствуют `--apply`, DML, row-level plan и любой путь мутации.
Production-like planner разрешено запускать только после успешного Git-bound
snapshot admission в состоянии `CURRENT_166`. StaffTask authority при этом
остаётся привязана к reviewed immutable prefix `EXPAND_162`; migrations
`163..166` принимаются только как exact allowlisted additive tail, не меняющий
protected `StaffTask*` relations.

## 1. Зафиксированный контекст

- четыре текущих клуба остаются четырьмя `Store` одной сети внутри одного
  существующего `Tenant`;
- текущий `tenantId` сохраняется;
- каждая независимая внешняя сеть получает отдельный `Tenant`;
- первая внешняя invite-only когорта после Gate 2 получает полные
  геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
  users/roles только внутри своего tenant и разрешённых Store;
- production-like inventory/planner/proposal dry-run, standalone dry-run,
  apply, `VALIDATE`, `CONTRACT`, deployment и внешний beta-доступ остаются
  `PENDING / NO-GO`.

## 2. Команда и обязательный runtime contract

Каноническая команда:

```text
pnpm --filter database db:plan:staff-task-integrity-reconciliation -- --pretty
```

Обязательные параметры окружения:

```text
DATABASE_URL=<protected PostgreSQL URL>
RELEASE_SHA=<exact 40-character lowercase hexadecimal commit>
STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET=development|staging|production
STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM=run-staff-task-integrity-reconciliation-plan
STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY=<32..4096 UTF-8 bytes>
STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE=<exact database name>
```

Для production дополнительно требуется точная attestation, которую оператор
берёт из `--help`:

```text
STAFF_TASK_INTEGRITY_RECONCILIATION_PRODUCTION_ATTESTATION=<exact value from --help>
```

Fail-closed contract:

- target должен быть одним из трёх разрешённых значений;
- `NODE_ENV=production` требует `target=production`;
- production target требует отдельную точную attestation;
- `RELEASE_SHA` принимает только 40 lowercase hex-символов;
- HMAC key обязателен, имеет длину от 32 до 4096 UTF-8 bytes и никогда не
  выводится;
- expected database name обязателен, проверяется на соответствие выбранному
  target и внутри snapshot сравнивается с фактическим `current_database()`;
  ни ожидаемое, ни фактическое имя БД в report не выводится;
- наружу попадают только `databaseIdentityMatched` и HMAC
  `databaseIdentityDigest`; digest вычисляется из фактических
  `current_database()`, PostgreSQL `system_identifier` и database OID, но ни
  одно из этих исходных значений не выводится;
- `--help` и `--self-test` не читают БД и не требуют credentials;
- неизвестный CLI argument, включая `--apply`, отклоняется.

## 3. Read-only и privacy contract

Planner:

- использует ровно одно PostgreSQL-соединение;
- добавляет `default_transaction_read_only=on` в datasource options;
- выполняет inventory, snapshot, migration и catalog queries в одной
  `READ ONLY REPEATABLE READ` transaction;
- внутри transaction проверяет фактические `transaction_read_only=on` и
  `repeatable read`;
- использует bounded lock, statement, transaction и candidate-count limits;
- возвращает только стабильные reason codes и aggregate counts;
- не возвращает UUID, tenant/store/user names, email, телефоны, database URL,
  database name, PostgreSQL `system_identifier`, database OID, credentials или
  свободный текст строк;
- не выполняет `INSERT`, `UPDATE`, `DELETE`, DDL, backfill или auto-fix.

Любая будущая row-level диагностика или apply-команда должна быть отдельным
reviewed инструментом с собственной авторизацией, журналом и идемпотентностью.
Расширять этот aggregate planner до скрытого apply path запрещено.

## 4. Точный каталог из 43 reason codes

Planner принимает только полный манифест из 43 кодов с точной severity и
классификацией. Неизвестный, повторный, отсутствующий или переклассифицированный
код приводит к contract failure.

### 4.1. `proposal` — 8 кодов

- `TEMPLATE_CREATOR_CROSS_TENANT`;
- `RULE_TEMPLATE_CROSS_TENANT`;
- `RULE_CREATOR_CROSS_TENANT`;
- `RULE_LAST_TASK_CROSS_TENANT`;
- `TASK_TEMPLATE_CROSS_TENANT`;
- `TASK_RULE_CROSS_TENANT`;
- `TASK_CREATOR_CROSS_TENANT`;
- `RULE_LAST_TASK_SOURCE_MISMATCH`.

Это потенциально детерминированные кандидаты для проектирования будущего
reconciliation dry-run. Классификация не выбирает row, не задаёт новое
значение, не подтверждает business intent и не является authorization.

### 4.2. `operator` — 29 кодов

- cross-tenant/store/source: `TEMPLATE_STORE_CROSS_TENANT`,
  `RULE_STORE_CROSS_TENANT`, `RULE_ASSIGNEE_CROSS_TENANT`,
  `RUN_RULE_CROSS_TENANT`, `RUN_TASK_CROSS_TENANT`,
  `TASK_STORE_CROSS_TENANT`, `TASK_ASSIGNEE_CROSS_TENANT`,
  `RULE_TEMPLATE_STORE_MISMATCH`, `RUN_TASK_SOURCE_MISMATCH`;
- active lifecycle/schedule:
  `ACTIVE_RULE_NULL_STORE`, `ACTIVE_RULE_NULL_NEXT_RUN_AT`,
  `ACTIVE_RULE_STORE_TIMEZONE_MISSING`,
  `ACTIVE_RULE_STORE_TIMEZONE_INVALID`, `ACTIVE_RULE_INACTIVE_STORE`,
  `ACTIVE_RULE_INACTIVE_TEMPLATE`, `ACTIVE_TEMPLATE_INACTIVE_STORE`,
  `ACTIVE_RULE_INACTIVE_TENANT`;
- Rule assignee:
  `RULE_ASSIGNEE_PLATFORM`, `RULE_ASSIGNEE_INACTIVE`,
  `RULE_ASSIGNEE_SCOPE_INVALID`, `RULE_ASSIGNEE_OUT_OF_STORE`,
  `RULE_ASSIGNEE_GLOBAL_SCOPE_INVALID`;
- Task assignee:
  `TASK_ASSIGNEE_PLATFORM`, `TASK_ASSIGNEE_INACTIVE`,
  `TASK_ASSIGNEE_SCOPE_INVALID`, `TASK_ASSIGNEE_OUT_OF_STORE`,
  `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID`;
- journal: `STALE_STARTED_RUN`, `REPEATED_FAILED_RUN`.

`TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` является `BLOCKING`: незавершённая
tenant-global Task не может оставаться назначенной пользователю со
`STORES`-scope.

### 4.3. `review` — 6 кодов

- `TASK_TEMPLATE_STORE_MISMATCH`;
- `TASK_RULE_STORE_MISMATCH`;
- `ACTIVE_TEMPLATE_NULL_STORE`;
- `TASK_STORE_SET_NULL_CANDIDATE`;
- `TEMPLATE_STORE_SET_NULL_CANDIDATE`;
- `RULE_STORE_SET_NULL_CANDIDATE`.

Review-only counts требуют owner и решения, но не входят в actionable cap.
Они входят в `observedOccurrences` и `reviewTotal`.

## 5. Protected prefix и current schema gate

Два состояния намеренно не смешиваются:

- `EXPAND_162` — frozen reviewed StaffTask prefix и его отдельный protected
  authority/admission evidence;
- `CURRENT_166` — фактическая БД current implementation candidate: тот же exact
  prefix плюс
  allowlisted tail
  `20260728120000_tenant_execution_control_plane_expand` и
  `20260728150000_tenant_execution_revision_fence` и
  `20260729120000_store_background_execution_fence` и
  `20260729160000_guest_game_delivery_claim_fence`.

Наличие `EXPAND_162` evidence не разрешает planner на БД из 162 migrations
после появления current tail. И наоборот, `CURRENT_166` не переписывает
исторический StaffTask prefix evidence: новый current envelope/marker/admission
добавляется поверх него.

Planner сначала выполняет schema-first gate и запускает 43 inventory queries
только после одновременного точного совпадения:

```text
currentSchemaIsPublic                    = true
databaseIdentityMatched                 = true
migrationCount                           = 166
latestMigration                          = 20260729160000_guest_game_delivery_claim_fence
unfinishedMigrationCount                 = 0
compositeContractMatchCount              = 14
simpleContractMatchCount                 = 14
foreignKeyContractMismatchCount          = 0
unexpectedProtectedForeignKeyCount       = 0
parentIndexContractMatchCount            = 5
parentIndexContractMismatchCount         = 0
```

Отклонение любого значения даёт `SCHEMA_MISMATCH` и exit `3`. Planner не
выполняет inventory при mismatch и не используется как доказательство для
pre-EXPAND, exact-prefix-only 162, partially migrated, unknown additive tail,
post-VALIDATE или post-CONTRACT schema; для
следующей schema-фазы contract должен быть явно обновлён и повторно reviewed.
Exact match проверяет не только количество объектов, но и полный FK/index
contract. Лишний protected FK, отсутствующий объект или неверное определение
увеличивает соответствующий mismatch count. Migration state читается только
из `public._prisma_migrations`: URL с `schema=pg_catalog` не меняет authority
gate, даёт `SCHEMA_MISMATCH`/exit `3`, и inventory не запускается.

Дополнительный fail-closed invariant требует
`summary.inventoryExecuted === schema.ready`. Готовая schema без выполненного
inventory и неготовая schema с выполненным inventory отклоняются с
`INVENTORY_EXECUTION_STATE_INVALID` и exit `1`; такой report нельзя принимать
как evidence. Обычный schema mismatch сохраняет согласованное состояние
`schema.ready=false`, `inventoryExecuted=false`, не запускает inventory и
возвращает `SCHEMA_MISMATCH`/exit `3`.

## 6. Counts, cap и решения

`candidateOccurrences` — сумма только `proposal + operator`. Review-only
counts из cap исключены. `observedOccurrences` включает все три класса.

Default `maxCandidates=10000`, допустимый диапазон — `1..1000000`. Превышение
actionable cap даёт `CAP_EXCEEDED` и exit `3`; оператор не повышает limit без
оценки времени, row-level evidence channel и rollback design.

Решения и exit codes:

| Exit | Decision                           | Значение                                                   |
| ---- | ---------------------------------- | ---------------------------------------------------------- |
| `0`  | `PASS` / `REVIEW`                  | Schema готова, cap соблюдён, blocking findings отсутствуют |
| `1`  | `ERROR`                            | CLI/env/safety-contract/database failure                   |
| `2`  | `FINDINGS`                         | Schema готова, но есть хотя бы одно blocking состояние     |
| `3`  | `CAP_EXCEEDED` / `SCHEMA_MISMATCH` | Нужна остановка и отдельное решение оператора              |

Exit `0` с review findings не означает готовность к `VALIDATE` или beta.

## 7. HMAC database identity, content и execution digests

`databaseIdentityDigest` — domain-separated HMAC-SHA256 над фактическими
`current_database()`, PostgreSQL `system_identifier` и database OID. Он
различает одноимённые БД в разных кластерах и разные БД одного кластера, но не
раскрывает исходные identity values. Digest включён в стабильную часть report
и тем самым в `contentDigest`.

`contentDigest` — HMAC-SHA256 в отдельном domain над канонической стабильной
aggregate-частью report.
В неё входят target, release SHA, `databaseIdentityDigest`, safety contract,
thresholds, limits, exact schema state, summary и 43 aggregate finding counts;
`generatedAt` исключён. Поэтому одинаковое содержание из той же БД при другом
времени запуска сохраняет тот же `contentDigest`; смена БД или PostgreSQL
cluster меняет его.

`executionDigest` — HMAC-SHA256 в отдельном execution-domain над парой
`{ contentDigest, generatedAt }`. Он привязывает evidence к конкретному
snapshot timestamp и меняется при новом запуске, даже если агрегированное
содержание не изменилось. HMAC key не попадает в output.

Оба digest нужны только для evidence и намеренно:

- не row-stable: другой набор строк с теми же counts может дать тот же digest;
- не является checksum production rows;
- не является compare-and-swap token;
- не авторизует reconciliation или apply;
- не заменяет повторный inventory внутри будущей write transaction;
- не переносится между releases, targets, thresholds или secret rotations как
  доказательство идентичности данных.

В git можно сохранять `databaseIdentityDigest`, `contentDigest`,
`executionDigest`, exact SHA, aggregate counts и ссылку на защищённое evidence.
HMAC key, URL, database names, PostgreSQL `system_identifier`, database OID и
row identifiers в git запрещены.

## 8. Безопасная последовательность

1. Зафиксировать exact release/planner SHA и зелёные CI checks.
2. Считать public-only `LOCAL PASS` на `2341b999...` historical evidence.
   Создать exact current candidate SHA, повторить pinned-path/current-state
   проверки и до production-like запуска получить remote CI evidence для
   current SHA. Экспериментальный Node 22 module mock остаётся P2. Отдельным
   security change выполнить P0 reviewed
   Ed25519 root enrollment и ввести P0 operational signer/approved
   acquisition/marker/evidence controls. Пока production roots пусты,
   остановить процесс в состоянии `NO-GO`.
3. Отдельно приобрести и восстановить свежий production-like snapshot в
   изолированную loopback БД на exact `BASELINE_156`.
4. По
   [snapshot admission runbook](./staff-task-integrity-snapshot-admission-runbook.md)
   получить отдельный signed authority envelope/DB marker и `ADMITTED` для
   `BASELINE_156`; сохранить state-specific protected evidence.
5. Применить только exact migrations `157..162` из того же committed release
   artifact.
6. Для той же БД, release SHA и approved acquisition lineage получить новый
   `EXPAND_162` authority envelope с новым nonce-bound binding, заменить DB
   marker его digest и только затем получить `ADMITTED` для `EXPAND_162`.
   Baseline envelope/marker не переиспользовать. Без обоих admission и
   protected marker-rotation attestation остановить процесс.
7. Применить только exact allowlisted additive tail migrations
   `20260728120000_tenant_execution_control_plane_expand`,
   `20260728150000_tenant_execution_revision_fence`,
   `20260729120000_store_background_execution_fence` и
   `20260729160000_guest_game_delivery_claim_fence`. Они не должны изменять
   protected `StaffTask*` tables, FK, indexes или triggers.
8. Для той же БД, release SHA и acquisition lineage получить третий
   state-bound `CURRENT_166` authority envelope с новым nonce-bound binding,
   заменить DB marker и пройти `admission(CURRENT_166)`. `EXPAND_162`
   envelope/marker не переиспользовать.
9. Проверить `databaseIdentityMatched=true` и current schema-first gate:
   `166/latest/unfinished 0`, `14 composite exact`, `14 simple exact`,
   `0 expected-FK mismatch`, `0 unexpected protected FK`, `5 indexes exact`,
   `0 index mismatch`. Убедиться, что `inventoryExecuted === schema.ready`, а
   evidence содержит HMAC `databaseIdentityDigest` без raw identity.
10. Запустить исходный read-only inventory и этот planner с одинаковыми
   thresholds; сохранить aggregate evidence и exit code.
11. Для каждого non-zero кода назначить owner. `proposal` проходит такой же
   review, как `operator`, и ничего не применяет автоматически.
12. Не переносить `SYNTHETIC` proposal dry-run в production-like контур: его
    HMAC provenance остаётся harness-only и формирует предложения без apply
    authority.
13. До получения production-like row evidence реализовать и утвердить
    отдельный read-only row dry-run workflow с immutable binding, protected
    output и owner decisions.
14. Выполнить production-like row dry-run в защищённом контуре и утвердить
    решение по каждой строке; raw identifiers не переносить в git.
15. Отдельным reviewed change реализовать idempotent apply workflow с immutable
    input evidence, row locks/recheck, audit и rollback; затем отдельным
    approval выполнить apply и повторный zero-diff dry-run.
16. Повторить inventory и planner; blocking должен быть `0`, review findings
    должны иметь owner и принятое решение.
17. Только после этого отдельно репетировать `VALIDATE`; `CONTRACT` и deploy
    остаются следующими независимыми release phases.

Production запуск требует отдельного operational approval, backup/restore
evidence и change window. Этот candidate production не запускал.

## 9. Implementation evidence

Для candidate `2c74c663780b3f183be708a01431c22efe57a723` подтверждено:

- syntax/help/self-test — `PASS`; planner contract unit suite — `11/11`;
- CI запускает отдельный planner contract check;
- clean real PostgreSQL schema со всеми 162 миграциями прошла planner с
  `PASS`, exact schema-first contract
  `162 / latest / 0 / 14 / 14 / 0 / 0 / 5 / 0` и exit `0`;
- source-safety tests подтверждают aggregate read-only SQL и отсутствие
  секретов, UUID, row identifiers и raw database identity в report;
- `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` проверен как `BLOCKING`;
- review-only counts не расходуют actionable cap;
- `databaseIdentityDigest` имеет HMAC-формат, включён в `contentDigest` и
  меняется при смене database OID/name либо PostgreSQL `system_identifier`, не
  раскрывая исходные значения;
- `contentDigest` стабилен при изменении только `generatedAt`, а
  `executionDigest` привязан к timestamp; оба меняются при изменении stable
  aggregate plan;
- invariant `inventoryExecuted === schema.ready` проверен в обе стороны;
  нарушение отклоняется с `INVENTORY_EXECUTION_STATE_INVALID`;
- adversarial PostgreSQL smoke клонирует только локальную/CI БД в disposable
  database, сохраняет все 28 expected FK, добавляет дополнительный
  конфликтующий FK с другим именем и отдельно подменяет порядок колонок parent
  index. Оба сценария получают `SCHEMA_MISMATCH`/exit `3`, не запускают
  inventory и удаляют clone в `finally`; source database не изменяется;
- отдельный contract test с URL `schema=pg_catalog` подтверждает
  `currentSchemaIsPublic=false`, чтение migration state из `public` и
  fail-closed exit `3` до inventory.

EXPAND rehearsal дополнительно усилена: populated legacy baseline содержит
ровно 156 миграций, затем на заполненных parent-таблицах по порядку применяются
ровно шесть migration `157..162`. Пять concurrent indexes действительно
строятся на populated `Store`, `User`, `StaffTaskTemplate`,
`StaffTaskRecurringRule` и `StaffTask`; после EXPAND сохраняются 14 legacy
violations и проходят все прежние проверки 14 composite + 14 simple
compatibility FK, invalid writes, delete policies, immutable parent IDs/tenant
ownership и Prisma drift.

Snapshot admission/proposal candidate
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` использует admission report schema
`2`; planner и proposal report schemas остаются `1`. Exact logical boundary
состоит из девяти relations: table-level `SELECT` к восьми таблицам и только
пять колонок `User` (`id`, `tenantId`, `isPlatformAdmin`, `isActive`,
`accessScope`). Замороженный порядок получает восемь table locks через
`LOCK TABLE`, а lock `User` — no-row запросом
`SELECT "id" FROM ONLY ... WHERE false`.

Integrated disposable PostgreSQL 16.13 smoke прошёл `23` scenarios. Fixture
matrix покрывает все восемь proposal codes: восемь proposal occurrences
образуют семь уникальных cases, потому что две last-task причины coalesce.
Подтверждены aggregate/row parity (`10 blocking occurrences =
8 proposal + 2 operator`, `2 review`), cap boundary (`9` отклоняет, `10`
допускает findings), privacy, unlinkability, privilege/RLS/tamper/advisory-lock
guards и cleanup.

Independent verify-only Ed25519 authority verifier и database marker binding
реализованы, но pinned roots намеренно пусты. Synthetic HMAC provenance
остаётся только disposable harness evidence и не заменяет Gate 2 authority.
До reviewed root enrollment, независимого signer и approved snapshot
acquisition production-like admission/dry-run fail-closed запрещены.

Отдельный test evidence
`2341b99937e54cc50d1763a0a794d975816c72ce` подтверждает authority `9/9`,
admission `19/19` и public-only pre-signed pinned-path `LOCAL PASS` в isolated
child. Historical `CURRENT_165` engineering CI
`4bd6a036...` / `30428288353` и documentation/evidence successor
`7c20adec...` / `30429463161` прошли как historical prerequisite. Schema
target — `CURRENT_166`. Prior engineering baseline связан с PR head
`bbef153a288bfdf1c3573eb704f27c013cc0e856` / CI `30443837684`
(`run #23`), выполненным через merge-ref; это не exact-SHA checkout evidence.
Baseline — `3/3 PASS`; PostgreSQL подтвердил
`immutableMutationsRejected=7` и
`finalStateAndEvidenceUnchanged=true`. `c1fee42c...` / `30442286822`
сохраняется как historical precursor до legacy quarantine
delivery-row/lifecycle freeze. Run #26 и run #27 rejected. Previous accepted
exact-head `d525b736d03162a2c58de17cbf7679ba6f515096` / CI `30447467729`
(`run #28`) завершился `3/3 PASS`. Last accepted exact-head
`be8c94c4ea9106a31055a0aff577ffbd62b67e7c` / CI `30449026506`
(`run #29`) завершился `3/3 PASS`: Application `90566337085`, Authority
checks `90566337062`, PostgreSQL major `16` job `90566337060`. Authority
checks не выполняли root enrollment; roots `{}`. Structured evidence включает
`populatedLegacyDeliveries=10`, `canonicalStoreBackfills=1`,
`legacyQuarantines=6`, `preservedFailClosedStores=3`,
`committedTransitions=4`, `runtimeBoundaryNegatives=9`,
`immutableMutationsRejected=7`, `finalStateAndEvidenceUnchanged=true`,
`sourceDatabaseMigrationsApplied=0`; source migration state не изменён,
source application data не затронуты. Lock evidence включает
`rewardDeliveryLockOrderEvidence={restrictedRuntimeScopeChecks:true,disposableOwnerDmlSessions:2,missingRewardRejected:true,crossTenantRewardRejected:true,waiterObservedOnAdvisoryLock:true,deliveryDeferredTriggerCommitted:true,rewardDeferredTriggerCommitted:true,holderAndWaiterCommitted:true,rawDeadlockOrLockTimeoutErrors:0,stateAndEvidenceUnchanged:true}`
и `privateSecurityInvokerLockBoundaries=1`. Private `SECURITY INVOKER`
`guest_game_reward_delivery_lock_v1` задаёт canonical advisory seed `166` →
same-tenant `Reward FOR UPDATE` → `VERIFIED` `TELEGRAM/MAX` Deliveries
`ORDER BY id FOR UPDATE`; оба deferred trigger делегируют, application writers
adopt boundary до первого DML. Все четыре engineering provider-write P1
закрыты; bounded whole-transaction retry остаётся defense-in-depth.
Actual non-owner runtime/app DB role ещё требует admission и explicit
`EXECUTE` при revoked `PUBLIC`; batch/rebind/future writers fail-closed,
interactive actor boundary и retention pending. Experimental Node 22 module
mock — P2.
Production root enrollment, operational signer и approved acquisition
остаются P0.

Production-like inventory/planner/proposal dry-run, standalone dry-run,
reconciliation apply,
`VALIDATE`, `CONTRACT`, deployment и production cutover не выполнялись.
Release decision остаётся `NO-GO`.

## 10. Evidence template

```text
release_sha:
schema_target:
last_accepted_context_sha:
last_accepted_context_ci_run:
last_accepted_checkout_mode: exact_head | merge_ref
current_candidate_sha:
current_candidate_ci_run:
current_candidate_status: PENDING | PASS | FAILED | REJECTED
target:
executed_at:
current_release_sha:
historical_snapshot_admission_sha: 044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c
historical_pinned_path_test_sha: 2341b99937e54cc50d1763a0a794d975816c72ce
admission_report_schema_version: 2
planner_report_schema_version: 1
proposal_report_schema_version: 1
baseline_authority_evidence_ref:
baseline_marker_install_attestation_ref:
baseline_admission_decision:
baseline_admission_database_identity_digest:
baseline_admission_content_digest:
baseline_admission_execution_digest:
expand_authority_evidence_ref:
expand_marker_rotation_attestation_ref:
expand_admission_decision:
expand_admission_database_identity_digest:
expand_admission_content_digest:
expand_admission_execution_digest:
current_authority_evidence_ref:
current_marker_rotation_attestation_ref:
current_admission_decision:
current_admission_database_identity_digest:
current_admission_content_digest:
current_admission_execution_digest:
database_revision:
currentSchemaIsPublic: true
databaseIdentityMatched: true
databaseIdentityDigest:
migrationCount: 166
latestMigration: 20260729160000_guest_game_delivery_claim_fence
unfinishedMigrationCount: 0
compositeContractMatchCount: 14
simpleContractMatchCount: 14
foreignKeyContractMismatchCount: 0
unexpectedProtectedForeignKeyCount: 0
parentIndexContractMatchCount: 5
parentIndexContractMismatchCount: 0
schema.ready: true
summary.inventoryExecuted: true
planner_exit_code:
decision:
candidate_occurrences:
observed_occurrences:
blocking_total:
review_total:
proposal_catalog_codes: 8
operator_catalog_codes: 29
review_catalog_codes: 6
cap_exceeded:
contentDigest:
executionDigest:
operator:
evidence_location:
release_decision: NO-GO | RECONCILE | READY_FOR_VALIDATE_REHEARSAL
```

## 11. Changelog

- `1.13.0`, 29.07.2026 — единая retroactive evidence correction:
  schema target — `CURRENT_166`; previous accepted PR-head-associated merge-ref
  baseline `bbef153a...` / CI `30443837684` (`run #23`) завершился `3/3
  PASS`, но не является exact-SHA evidence;
  PostgreSQL evidence:
  `immutableMutationsRejected=7`,
  `finalStateAndEvidenceUnchanged=true`. `c1fee42c...` остаётся historical
  precursor. Legacy quarantine delivery-row/lifecycle P1 закрыт. Run #26 и
  run #27 rejected. Previous accepted exact-head `d525b736...` / CI
  `30447467729` (`run #28`) — `3/3 PASS`. Last accepted exact-head
  `be8c94c4...` / CI `30449026506` (`run #29`) — `3/3 PASS`: Application
  `90566337085`, Authority checks `90566337062`, PostgreSQL major `16`
  `90566337060`; checks не выполняли enrollment, roots `{}`. Structured
  lock-order evidence закрыл последний engineering provider-write P1; все
  четыре закрыты. Non-owner runtime role admission и explicit `EXECUTE`,
  interactive boundary, retention, roots/acquisition, production-like planner,
  row dry-run/apply/deploy и внешний beta остаются `NO-GO`.
- `1.12.0`, 29.07.2026 — exact-SHA engineering evidence `CURRENT_166`
  принято на `c1fee42c...` / CI `30442286822`; PostgreSQL major `16` rehearsal
  `165 → 166` зелёный. Production-like planner, row dry-run/apply/deploy и
  внешний beta остаются `NO-GO`.
- `1.11.0`, 29.07.2026 — operational planner/admission target переведён на
  implementation candidate `CURRENT_166`: allowlisted tail `163..166`, count
  `166`, latest `20260729160000_guest_game_delivery_claim_fence`. Remote
  exact-SHA/`165 → 166` pending; `CURRENT_165`
  `4bd6a036...`/`7c20adec...` остаётся historical evidence.
  Production-like planner/apply — `NO-GO`.
- `1.10.0`, 29.07.2026 — historical `CURRENT_165`
  planner/catalog/admission
  engineering gates прошли remote CI `4bd6a036...` / `30428288353`;
  production-like planner/apply остаются `NO-GO`.
- `1.9.0`, 29.07.2026 — then-current planner gate расширен до `CURRENT_165` с
  allowlisted migrations `163..165`; count `165`, latest
  `20260729120000_store_background_execution_fence`. Frozen StaffTask
  authority остаётся `EXPAND_162`.
- `1.8.0`, 28.07.2026 — current planner gate расширен до `CURRENT_164` с
  allowlisted migrations `163..164`; frozen StaffTask authority остаётся
  `EXPAND_162`.
- `1.7.0`, 28.07.2026 — frozen StaffTask evidence оставлен на exact
  `EXPAND_162`, а current planner gate переведён на `CURRENT_163`: 163
  migrations, latest
  `20260728120000_tenant_execution_control_plane_expand`. Зафиксированы
  allowlisted additive tail, отдельный third state-bound envelope/marker/
  admission и запрет считать historical SHA current candidate evidence.
- `1.6.0`, 28.07.2026 — runtime candidate сохранён на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, test evidence вынесен в
  `2341b99937e54cc50d1763a0a794d975816c72ce`: authority `9/9`, admission
  `19/19`, public-only pre-signed pinned-path `LOCAL PASS` в isolated child.
  Remote CI pending, experimental Node 22 module mock — P2. Production roots
  пусты; root enrollment/signer/acquisition остаются P0, production-like
  reconciliation — `NO-GO`. Отдельные state-bound envelopes и marker rotation
  между `BASELINE_156` и `EXPAND_162` сохранены.
- `1.5.0`, 28.07.2026 — synthetic candidate
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` прошёл PostgreSQL 16.13 smoke
  `23` scenarios: все `8` proposal codes/occurrences, `7` unique cases,
  last-task coalescing, exact aggregate/row parity (`10 blocking`, `2 review`),
  cap boundary `9/10`, privacy и unlinkability. Admission schema повышена до
  `2`, planner/proposal schemas сохранены на `1`; authority boundary использует
  exact eight-table + five-column `User` ACL, frozen relation lock order и
  verify-only Ed25519/marker foundation. Pinned roots пусты; root
  enrollment/signer/acquisition, production-like dry-run,
  apply/rollback/zero-diff,
  `VALIDATE`/`CONTRACT`/deploy/external beta остаются `NO-GO`.
- `1.4.0`, 27.07.2026 — добавлен строго SYNTHETIC proposal dry-run candidate
  `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`: signed disposable harness
  provenance, exact 8 proposal codes, aggregate-only 29 operator + 6 review,
  read-only/HMAC/coalescing contract и no-apply boundary. Пройдены self-test
  20, unit 14/14 и первоначальный integrated PostgreSQL major `16` smoke.
  Production-like/standalone/apply/`VALIDATE`/`CONTRACT`/deploy/external beta
  остаются `NO-GO`.
- `1.3.0`, 27.07.2026 — Git-bound snapshot admission `EXPAND_162` сделан
  обязательным prerequisite planner; зафиксирован synthetic candidate
  `7d67333b22f171c6e79f723190647cdd2454b128` с `16` unit, `34` offline и `9`
  PostgreSQL 16 smoke-сценариями. Production-like запуск не выполнялся.
- `1.2.0`, 27.07.2026 — добавлен HMAC `databaseIdentityDigest` из
  `current_database()`, PostgreSQL `system_identifier` и database OID; raw
  identity не выводится, digest включён в `contentDigest` и различает
  БД/кластеры. Invariant `inventoryExecuted === schema.ready` теперь
  fail-closed отклоняется с `INVENTORY_EXECUTION_STATE_INVALID`; planner
  contract unit suite проходит `11/11`.
- `1.1.0`, 27.07.2026 — schema-first gate усилен exact contract до
  `162/latest/unfinished 0`, `14 composite exact`, `14 simple exact`,
  `0 expected-FK mismatch`, `0 unexpected protected FK`, `5 indexes exact` и
  `0 index mismatch`; добавлены скрытая expected/actual database identity
  binding, квалифицированная `public._prisma_migrations`, стабильный
  `contentDigest`, timestamp-bound `executionDigest` и adversarial
  disposable-clone smoke для extra FK/wrong index contract. Output остаётся
  aggregate-only, apply и authorization отсутствуют.
- `1.0.0`, 27.07.2026 — создан guarded aggregate-only reconciliation planner:
  43 кода классифицированы как `8 proposal + 29 operator + 6 review`,
  добавлены exact schema gate, HMAC aggregate evidence,
  actionable cap и exits `0/1/2/3`; apply отсутствует, production-like
  reconciliation и внешний beta остаются `NO-GO`.
