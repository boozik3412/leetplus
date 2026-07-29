# Staff task integrity EXPAND: rollout и validation runbook

| Поле                    | Значение                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Статус                  | `IMPLEMENTED_CANDIDATE`; local EXPAND и remote CURRENT_165 engineering rehearsal пройдены; не deployed                                                        |
| Версия                  | 1.9.0                                                                                                                                                        |
| Дата                    | 29.07.2026                                                                                                                                                   |
| Backlog                 | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                                                                                                         |
| Migration count         | 162                                                                                                                                                          |
| Latest migration        | `20260727131000_staff_task_integrity_expand`                                                                                                                 |
| DB-native guard         | 28 FK: 14 composite + 14 simple compatibility                                                                                                                |
| Compatibility catalog   | 14 simple `NOT VALID`: 11 non-Store + 3 Store                                                                                                                |
| Historical EXPAND SHA   | `dc26568d94d76b886f1d1b79c36b1bd9f00ac401`; frozen prefix evidence                                                                                           |
| Historical admission    | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; не current evidence                                                                                              |
| Входной gate            | [Snapshot admission](./staff-task-integrity-snapshot-admission-runbook.md) `BASELINE_156`                                                                    |
| После EXPAND            | `EXPAND_162` admission → allowlisted migrations `163..165` → `CURRENT_165` admission → [inventory](./staff-task-integrity-inventory-runbook.md)              |
| Следующий этап          | [Aggregate reconciliation plan](./staff-task-integrity-reconciliation-plan-runbook.md)                                                                       |
| Связанный adoption plan | [Templates и recurring rules](./staff-task-catalog-adoption-plan.md)                                                                                         |

Документ описывает schema-only фазу `EXPAND` для same-tenant ссылок
`StaffTaskTemplate`, `StaffTaskRecurringRule`, `StaffTaskRecurringRuleRun` и
`StaffTask`. Он нужен для повторяемой проверки миграций, дальнейшего
`VALIDATE` и безопасной эксплуатации политики archive-first для `Store`.

Этот runbook не является разрешением применять миграции в production,
исправлять production-данные, включать scheduler или выдавать внешний доступ.
Production-like inventory, reconciliation, `VALIDATE`, deployment и
операционный rollback drill остаются отдельными обязательными шагами.
До production-like inventory/planner обязательны три Git-bound admission:
`BASELINE_156` до EXPAND, frozen-prefix `EXPAND_162` после exact migrations
`157..162` и `CURRENT_165` после трёх allowlisted additive migrations
`20260728120000_tenant_execution_control_plane_expand` и
`20260728150000_tenant_execution_revision_fence` и
`20260729120000_store_background_execution_fence`. Третий state не
изменяет reviewed StaffTask prefix и не переиспользует его envelope/marker.

## 1. Зафиксированный контекст запуска

- четыре текущих клуба являются четырьмя `Store` одной сети внутри одного
  существующего `Tenant`;
- текущий `tenantId` сохраняется, а сеть не разделяется на четыре tenant;
- каждая независимая внешняя сеть получает отдельный `Tenant`;
- первая внешняя invite-only когорта после Gate 2 получает полную
  геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
  users/roles только внутри своего tenant и разрешённых Store;
- внешний beta-доступ остаётся `NO-GO` до полного Gate 2.

## 2. Состав EXPAND

### 2.1. Parent keys

Пять parent keys создаются пятью отдельными однооператорными миграциями через
`CREATE UNIQUE INDEX CONCURRENTLY`. Они намеренно не объединены в транзакцию:

| Migration                                             | Index                                | Parent key                             |
| ----------------------------------------------------- | ------------------------------------ | -------------------------------------- |
| `20260727130100_staff_task_store_tenant_key`          | `store_tenant_id_uidx`               | `Store(tenantId, id)`                  |
| `20260727130200_staff_task_user_tenant_key`           | `user_tenant_id_uidx`                | `User(tenantId, id)`                   |
| `20260727130300_staff_task_template_tenant_key`       | `staff_task_template_tenant_id_uidx` | `StaffTaskTemplate(tenantId, id)`      |
| `20260727130400_staff_task_recurring_rule_tenant_key` | `staff_task_rule_tenant_id_uidx`     | `StaffTaskRecurringRule(tenantId, id)` |
| `20260727130500_staff_task_tenant_key`                | `staff_task_tenant_id_uidx`          | `StaffTask(tenantId, id)`              |

Каждый индекс должен существовать в ожидаемой schema, быть unique, valid,
ready и иметь точный порядок колонок. Invalid concurrent index нельзя
маскировать повторным `IF NOT EXISTS`: оператор сначала фиксирует состояние,
удаляет только точный invalid index согласованной командой и повторяет ровно
его миграцию.

### 2.2. Composite foreign keys

Финальная миграция `20260727131000_staff_task_integrity_expand` в одной
короткой транзакции:

- задаёт `lock_timeout=5s` и `statement_timeout=2min`;
- в детерминированном порядке блокирует `Store`, `User`,
  `StaffTaskTemplate`, `StaffTaskRecurringRule`,
  `StaffTaskRecurringRuleRun` и `StaffTask`;
- добавляет 14 composite FK как `NOT VALID`;
- заменяет три legacy Store `SET NULL` FK временными simple Store
  `RESTRICT/RESTRICT NOT VALID` под прежними именами;
- swap/re-add’ит под прежними именами 11 non-Store simple FK как
  `NOT VALID`, сохраняя их прежний `ON DELETE` — 10 `SET NULL` и один
  `CASCADE`;
- использует `ON UPDATE RESTRICT` для всех 28 FK;
- сразу отклоняет новые cross-tenant writes, но оставляет legacy rows для
  отдельного reconciliation и `VALIDATE`.

| Child                       | Reference                     | Delete policy            |
| --------------------------- | ----------------------------- | ------------------------ |
| `StaffTaskTemplate`         | `(tenantId, storeId) → Store` | `RESTRICT`               |
| `StaffTaskTemplate`         | creator → User                | null только reference ID |
| `StaffTaskRecurringRule`    | template → Template           | null только reference ID |
| `StaffTaskRecurringRule`    | `(tenantId, storeId) → Store` | `RESTRICT`               |
| `StaffTaskRecurringRule`    | creator → User                | null только reference ID |
| `StaffTaskRecurringRule`    | assignee → User               | null только reference ID |
| `StaffTaskRecurringRule`    | last created task → Task      | null только reference ID |
| `StaffTaskRecurringRuleRun` | rule → Rule                   | `CASCADE`                |
| `StaffTaskRecurringRuleRun` | created task → Task           | null только reference ID |
| `StaffTask`                 | `(tenantId, storeId) → Store` | `RESTRICT`               |
| `StaffTask`                 | source template → Template    | null только reference ID |
| `StaffTask`                 | source recurring rule → Rule  | null только reference ID |
| `StaffTask`                 | creator → User                | null только reference ID |
| `StaffTask`                 | assignee → User               | null только reference ID |

PostgreSQL 15+ column-list semantics `ON DELETE SET NULL ("referenceId")`
сохраняют `tenantId` и очищают только nullable reference ID. Поддерживаемый
контур и CI используют PostgreSQL 16.

## 3. N/N-1 compatibility и Store deletion

В фазе `EXPAND` рядом с новыми composite FK остаются 11 соответствующих
legacy FK по одному non-Store reference ID:

- Template creator — 1;
- Rule template/creator/assignee/last-created-task — 4;
- Run rule/created-task — 2;
- Task source-template/source-rule/creator/assignee — 4.

Все 11 non-Store FK атомарно swap/re-add’ятся как `NOT VALID`. Их delete
семантика остаётся прежней — 10 `SET NULL`, один `Run → Rule CASCADE` — но
`ON UPDATE` меняется с `CASCADE` на `RESTRICT`. Старый update cascade мог
изменить child reference ID в обход composite same-tenant `RESTRICT`.
Идентификаторы пяти parent-классов считаются immutable.

Три legacy `Store ... ON DELETE SET NULL` FK под прежними именами атомарно
пересоздаются как временные simple
`Store(id) RESTRICT/RESTRICT NOT VALID` и работают параллельно с тремя
composite same-tenant `RESTRICT`:

- composite FK запрещает новые cross-tenant references;
- simple FK сохраняет global-existence защиту для legacy cross-tenant rows,
  которые composite `NOT VALID` ещё не покрывает;
- обе защиты блокируют физическое удаление связанного Store;
- прежняя опасная семантика `SET NULL` полностью отсутствует.

Итого на EXPAND сохраняются 14 simple compatibility FK, и все они
`NOT VALID`: 11 non-Store и три Store. Их нельзя удалять до отдельной фазы
`CONTRACT` после reconciliation, composite `VALIDATE`, staging/canary evidence
и завершения окна rollback. Штатный lifecycle-путь Store —
deactivate/archive.

N-1 compatibility относится к штатным runtime reads/writes по неизменяемым
ID. Она не разрешает обновление parent identifiers, запуск старого seed или
schema synchronization через `db push`.

## 4. Prisma contract и осознанный manual SQL drift

В Prisma schema представлены:

- пять composite unique parent keys;
- три composite Store relations с `Restrict/Restrict`;
- все 11 simple non-Store relations с явным `onUpdate: Restrict`;
- `Run → Rule` остаётся simple `[ruleId]` relation, чтобы N-1/current reader
  мог читать legacy cross-tenant Run до reconciliation.

Prisma 6.19 не умеет полностью выразить используемые PostgreSQL column-list
`ON DELETE SET NULL`, `NOT VALID` и сосуществование compatibility FK. Поэтому
manual SQL drift включает 11 non-Store composite security links:

- 10 nullable partial-`SET NULL` constraints очищают только reference ID,
  сохраняя `tenantId`;
- composite `Run → Rule` использует `ON DELETE CASCADE` и
  `ON UPDATE RESTRICT`.

Все 14 simple compatibility FK остаются DB-native и `NOT VALID`. Их delete
actions и `onUpdate: Restrict` для 11 non-Store relations отражены в Prisma.
Сам `NOT VALID`/coexistence contract, включая три temporary simple Store FK,
остаётся операционным DB contract.

Exact `prisma migrate diff` на свежей schema со 162 migrations предлагает
ровно 14 destructive security DROP:

- 11 non-Store composite `tenantId_*` FK, включая composite `Run → Rule`;
- три temporary simple Store compatibility FK.

Diff больше не предлагает изменить или удалить 11 simple non-Store FK:
`onUpdate: Restrict` согласован со schema, а `convalidated` Prisma datamodel не
представляет. Консервативный future-migration guard всё равно защищает все 28
DB-native FK: 14 composite и 14 simple compatibility constraints.
Существующий unrelated ADD/index-rename drift не относится к этому security
slice и учитывается отдельно.

Staged smoke запускает exact diff через `--from-schema-datasource` и scoped
environment. Database URL и пароль не передаются в command-line arguments.
Smoke фиксирует `prismaDriftDrops=14`, проверяет точный allowlist security DROP
и не считает unrelated pre-existing ADD/index-rename drift частью этого
security contract.

Такой drift допустим только пока он:

1. перечислен в этом runbook;
2. проверяется catalog smoke по точным child table, constraint, parent table,
   parent index, колонкам и actions;
3. не исчезает после `prisma generate` или последующей migration;
4. повторно рассматривается перед `CONTRACT` или обновлением Prisma.

Для этой области действует create-only policy: новая Prisma migration сначала
генерируется без применения, SQL проходит ручной review и только затем
добавляется в migration chain. `prisma db push` запрещён: schema diff не
представляет manual constraints полностью и может предложить удалить защиту.
Offline self-test сканирует все последующие migration SQL и падает при попытке
`DROP CONSTRAINT`, `RENAME CONSTRAINT` или `ALTER CONSTRAINT` любого из 28
DB-native FK. Guard также запрещает:

- `DROP TABLE`, rename protected table и `DROP COLUMN` на шести участвующих
  таблицах;
- `DROP NOT NULL` обязательных contract-колонок, `DISABLE TRIGGER` и
  `session_replication_role`;
- `DROP INDEX` или `ALTER INDEX` для пяти parent indexes;
- `DROP SCHEMA`;
- migration directories с неожиданным именем вне frozen naming contract.

Exact artifact contract дополнительно требует:

- migrations `157..161` содержат ровно по одному executable
  `CREATE UNIQUE INDEX CONCURRENTLY` с точным именем, parent table и
  `(tenantId, id)`;
- migration `162` остаётся одной explicit transaction с `lock_timeout=5s`,
  `statement_timeout=2min`, фиксированным lock order, ровно 28 ожидаемыми
  `ADD CONSTRAINT`, 14 compatibility `DROP CONSTRAINT` и 28 `NOT VALID`.

## 5. Локальная и CI rehearsal

Guarded staged smoke запускается только против локальной CI/test database:

```text
STAFF_TASK_INTEGRITY_EXPAND_SMOKE_CONFIRM=run-staff-task-integrity-expand-fixtures
pnpm --filter database db:smoke:staff-task-integrity-expand
```

Application CI отдельно выполняет syntax/offline self-test, включая safety
target, migration partition и static future-migration DROP guard для всех 28
DB-native FK. PostgreSQL job запускает staged smoke после обычных migration
checks. Smoke обязан работать в собственной случайной schema и удалить её
после завершения.

Подтверждённый локальный contract:

- populated legacy baseline из 156 migrations применяется отдельно, затем
  по порядку накатываются ровно шесть migrations `157..162`; полный clean path
  содержит 162/162 migration;
- до migration 157 создаётся заполненный graph и 14 контролируемых legacy
  violations;
- пять concurrent indexes действительно строятся на populated parent-таблицах
  `Store`, `User`, `StaffTaskTemplate`, `StaffTaskRecurringRule` и
  `StaffTask`;
- после EXPAND все 14 legacy invalid rows проходят benign non-FK update и
  остаются на месте;
- все пять parent indexes имеют точный key contract;
- все 14 composite constraints существуют как `NOT VALID`;
- все 14 simple compatibility FK существуют как `NOT VALID`: три Store
  `RESTRICT`, десять non-Store `SET NULL` и один `Run → Rule CASCADE`;
- попытка `VALIDATE` каждого из 14 composite ограничений ожидаемо
  обнаруживает его legacy fixture;
- 14 новых invalid writes отклоняются уже в фазе `NOT VALID`;
- валидный Template → Rule → Task → Run graph создаётся;
- три физические операции удаления Store с валидными same-tenant links
  блокируются одним из согласованных simple/composite `RESTRICT`; порядок
  PostgreSQL RI-trigger не является частью contract, archive/deactivate
  остаётся рабочим путём;
- три удаления Store с legacy cross-tenant links отдельно блокируются
  временными simple Store FK и не оставляют dangling `storeId`;
- пять попыток обновить parent UUID отклоняются; identifier
  immutability не зависит от порядка срабатывания simple/composite FK,
  output `parentIdentifierUpdatesRejected=5`;
- пять попыток переместить parent через update `tenantId` также отклоняются,
  output `parentTenantUpdatesRejected=5`;
- partial `SET NULL` и `Run → Rule CASCADE` соответствуют contract;
- clean seed reset на заполненном Template → Rule → Task → Run graph проходит
  с archive-first delete order;
- database smoke, catalog audit и read-only integrity inventory проходят на
  clean schema; inventory возвращает 43 reason code и zero blocking/review.
- exact scoped Prisma drift check возвращает `prismaDriftDrops=14`; URL и
  credentials не попадают в argv.
- aggregate planner проходит schema-first exact gate
  `162/latest/unfinished 0 + 14 composite exact + 14 simple exact +
0 expected-FK mismatch + 0 unexpected protected FK + 5 indexes exact +
0 index mismatch`; migration state читается из
  `public._prisma_migrations`.
- adversarial catalog smoke на disposable local/CI clone сохраняет все 28
  expected FK, добавляет дополнительный конфликтующий FK с другим именем и
  отдельно создаёт parent index с неверным порядком колонок; оба сценария
  отклоняются с `SCHEMA_MISMATCH`/exit `3` до inventory, source database не
  меняется, clone удаляется.

Проверка намеренно доказывает свойства migration contract, а не качество
production-данных.

## 6. Production-like preflight

Перед любым staging/production применением оператор обязан:

1. зафиксировать exact release SHA, зелёные CI checks, migration count `162`,
   latest migration и отношение к канонической ветке;
2. учитывать public-only pre-signed pinned-path `LOCAL PASS` на historical test
   evidence `2341b99937e54cc50d1763a0a794d975816c72ce` только как прежний
   boundary и до production-like запуска получить clean remote CI evidence
   для exact current candidate SHA.
   Экспериментальный Node 22 module mock остаётся P2. Отдельным security change
   выполнить P0 reviewed Ed25519 root enrollment и ввести P0 operational
   signer/approved acquisition/marker/evidence controls; при пустом production
   root registry остановиться с `NO-GO`;
3. отдельно приобрести и восстановить свежий production-like snapshot в
   изолированную loopback БД;
4. по
   [snapshot admission runbook](./staff-task-integrity-snapshot-admission-runbook.md)
   получить отдельный подписанный `BASELINE_156` authority envelope, установить
   его exact DB marker и подтвердить admission, exact committed Git artifact,
   TTL/attestations, database identity и least-privilege роль;
5. применить в изолированной копии только exact six migrations `157..162` по
   утверждённому rehearsal;
6. получить новый state-bound `EXPAND_162` authority envelope с новым
   nonce-bound binding, заменить DB marker его digest и только затем повторно
   пройти snapshot admission; baseline envelope/marker не переиспользовать;
7. применить только exact allowlisted additive migrations
   `20260728120000_tenant_execution_control_plane_expand`,
   `20260728150000_tenant_execution_revision_fence` и
   `20260729120000_store_background_execution_fence`; подтвердить, что
   protected `StaffTask*` relations не изменились;
8. получить отдельный `CURRENT_165` authority envelope с новым nonce-bound
   binding, повторно заменить DB marker и пройти третий admission;
9. выполнить guarded read-only inventory и сохранить только aggregate
   evidence;
10. на exact current schema `CURRENT_165` выполнить
   [aggregate reconciliation planner](./staff-task-integrity-reconciliation-plan-runbook.md):
   migration count `165`, latest Store background-execution fence, unfinished `0`,
   14 composite exact, 14 simple exact,
   `0` expected-FK mismatch, `0` unexpected protected FK, 5 indexes exact,
   `0` index mismatch, hidden expected/actual database identity,
   domain-separated HMAC `databaseIdentityDigest`,
   `inventoryExecuted === schema.ready`,
   classification `8 proposal + 29 operator + 6 review`, actionable cap и exit
   contract;
11. назначить owner всем review/operator/proposal findings и получить
   `blockingTotal=0`; proposal, `contentDigest` и `executionDigest` не считать
   authorization;
12. отдельно реализовать и утвердить production-like row dry-run, затем
    получить protected row evidence; synthetic proposal evidence не
    засчитывать;
13. отдельным reviewed change реализовать idempotent explicit apply с
    locks/recheck, audit и rollback; отдельным approval выполнить apply и
    повторный zero-diff dry-run;
14. проверить backup restore, long transactions, свободное место, replication
    health и change window;
15. отдельно повторить populated synthetic baseline
    `156 → exact six migrations 157..162` и N/N-1 application compatibility;
16. измерить concurrent index duration и metadata lock duration;
17. проверить abort/retry и application rollback без удаления принятых
    constraints;
18. доказать, что N-1 rollback не запускает старый seed: предыдущий seed не
    знает нового archive-first delete order и не является rollback-шагом;
19. получить явное решение `GO` для schema-only release.

Ни один шаг не выполняется автоматически из этого документа.

## 7. APPLY и post-apply evidence

После отдельного operational approval:

1. убедиться, что application version совместима с N и N-1;
2. применить пять concurrent index migrations по порядку;
3. после каждой проверить index `valid/ready/unique` и отсутствие failed
   migration row;
4. применить финальную EXPAND migration;
5. проверить наличие 14 composite и 14 simple compatibility `NOT VALID` FK;
6. повторить inventory; любое новое blocking finding останавливает rollout;
7. проверить Store archive-first, valid write и deliberate invalid write;
8. сохранить exact SHA, timings, migration state, aggregate inventory и
   решение оператора в защищённом release evidence.

Если финальная transaction не получает lock за 5 секунд, это штатный abort:
не увеличивать timeout на ходу, найти блокирующую transaction и повторить в
новом согласованном окне.

## 8. VALIDATE и CONTRACT

`VALIDATE` не входит в текущий candidate. Он разрешён только после
production-like и staging zero-blocking reconciliation:

- валидировать 14 constraints отдельным управляемым шагом;
- после каждого шага проверять lock duration, database health и фактический
  `convalidated=true`;
- повторить negative writes, Store deletion и application N/N-1 smoke;
- не объединять validation с application deployment.

`CONTRACT` выполняется позже и отдельным reviewed release. Simple
compatibility FK не требуется валидировать перед удалением, если 14 composite
FK уже validated, reconciliation имеет zero diff и N-1 rollback window закрыт:

- удалить все 14 simple compatibility FK только после завершения N-1 rollback
  window;
- в том же reviewed CONTRACT изменить guard manifest с 28 на 14 surviving
  composite FK; до этого любой DROP остаётся ошибкой CI;
- удалить только явно признанные временными indexes/code paths;
- повторно проверить Prisma drift;
- сохранить archive-first Store policy.

Rollback приложения не требует отката EXPAND. Destructive reverse migration
для production не предоставляется: откат schema возможен только отдельным
reviewed change после анализа данных и зависимостей. При N-1 rollback нельзя
запускать старую версию seed или `db push`.

## 9. Осознанно не входит в этот slice

- `StaffTask.shiftId` и DB equality `Task.storeId ↔ Shift.storeId`;
- DB equality Store между Rule и Template;
- provenance equality для `Run.createdTask` и source Rule;
- динамические требования к assignee: active, non-platform и
  `UserStoreAccess`;
- tenant lifecycle, staff entitlement, persisted timezone для tenant-global
  Rule;
- scheduler identity, lease/fencing, heartbeat и stale reclaim;
- production-like inventory/reconciliation, `VALIDATE`, `CONTRACT`,
  deployment и production cutover.

Эти пункты остаются P0/P1 launch work. Наличие EXPAND candidate не повышает
Staff-модуль до `VERIFIED` и не меняет общий release decision `NO-GO`.

## 10. Evidence template

```text
release_sha:
target:
executed_at:
current_release_sha:
historical_snapshot_admission_sha: 044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c
historical_pinned_path_test_sha: 2341b99937e54cc50d1763a0a794d975816c72ce
snapshot_admission_report_schema_version: 2
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
database_revision_before:
database_revision_after:
migration_count:
parent_indexes_valid_ready: 0/5
composite_constraints_present: 0/14
composite_constraints_validated: 0/14
simple_compatibility_fk_present: 0/14
simple_compatibility_fk_not_valid: 0/14
legacy_store_set_null_behavior_present: 0/3
db_native_constraints_guarded: 0/28
prismaDriftDrops: 0/14
unrelated_add_index_rename_drift_classified:
legacy_benign_non_fk_updates: 0/14
inventory_blocking_total:
inventory_review_total:
reconciliation_planner_sha:
reconciliation_planner_exit:
reconciliation_candidate_occurrences:
databaseIdentityMatched: true
databaseIdentityDigest:
reconciliation_inventoryExecuted: true
compositeContractMatchCount: 0/14
simpleContractMatchCount: 0/14
foreignKeyContractMismatchCount: 0
unexpectedProtectedForeignKeyCount: 0
parentIndexContractMatchCount: 0/5
parentIndexContractMismatchCount: 0
reconciliation_contentDigest:
reconciliation_executionDigest:
proposal_is_authorization: false
store_delete_restrict_checks: 0/3
legacy_store_delete_protection_checks: 0/3
parentIdentifierUpdatesRejected: 0/5
parentTenantUpdatesRejected: 0/5
n_minus_one_smoke:
lock_duration:
operator:
evidence_location:
decision: NO-GO | RECONCILE | READY_FOR_VALIDATE | GO
```

В git сохраняются только aliases, counts, timings, exact SHA и ссылки на
защищённые evidence. Production ID, database URLs, credentials и raw rows
запрещены.

## 11. Changelog

- `1.9.0`, 29.07.2026 — exact `CURRENT_165` additive-tail/EXPAND engineering
  gates и populated `164 → 165` прошли remote CI
  `4bd6a036...` / `30428288353`; production apply остаётся `NO-GO`.
- `1.8.0`, 29.07.2026 — current additive tail расширен migration `165`;
  admission/planner state теперь `CURRENT_165`, migration count `165`, latest
  `20260729120000_store_background_execution_fence`. Store остаются
  fail-closed, outbound `OFF`; production apply не выполнялся.
- `1.7.0`, 28.07.2026 — current additive tail расширен второй allowlisted
  migration `164`; current admission/planner state теперь `CURRENT_164`, при
  этом immutable StaffTask prefix остаётся `EXPAND_162`.
- `1.6.0`, 28.07.2026 — EXPAND зафиксирован как immutable protected prefix
  `EXPAND_162`; current downstream inventory/planner path требует отдельную
  allowlisted migration 163, `CURRENT_163` envelope/marker/admission и новый
  exact candidate SHA. Прежние SHA помечены historical.
- `1.5.0`, 28.07.2026 — runtime admission candidate остаётся
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; test evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` подтверждает authority `9/9`,
  admission `19/19` и public-only pre-signed pinned-path `LOCAL PASS` в isolated
  child. Remote CI evidence pending; experimental Node 22 module mock — P2.
  Production roots пусты, поэтому root enrollment, signer и acquisition
  остаются P0, а production-like flow — `NO-GO`. Порядок сохраняет отдельные
  state-bound `BASELINE_156` и `EXPAND_162` envelopes и обязательную замену DB
  marker между состояниями.
- `1.4.0`, 28.07.2026 — admission prerequisite обновлён до schema v2 boundary
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`: public-only pinned-path
  requirement,
  reviewed root/signer/acquisition controls, exact column-scoped `User` ACL и
  раздельные production-like row dry-run/apply/rollback/zero-diff. Trusted
  roots пусты; production-like execution остаётся `NO-GO`.
- `1.3.0`, 27.07.2026 — перед production-like inventory/planner добавлены
  обязательные Git-bound admissions `BASELINE_156` и `EXPAND_162`; synthetic
  candidate `7d67333b22f171c6e79f723190647cdd2454b128` прошёл `16` unit, `34`
  offline и `9` PostgreSQL 16 smoke-сценариев. Production-like snapshot не
  приобретался и не восстанавливался.
- `1.2.0`, 27.07.2026 — добавлены exact EXPAND artifact и future-DDL guards;
  planner gate усилен hidden database identity, exact FK/index catalog,
  `unexpectedProtectedForeignKeyCount=0`, `contentDigest`/`executionDigest` и
  adversarial disposable-clone extra-FK/wrong-index smoke. Output
  aggregate-only, apply/authorization отсутствуют, внешний beta остаётся
  `NO-GO`.
- `1.1.0`, 27.07.2026 — rehearsal усилена до populated legacy baseline 156 с
  применением ровно шести migrations `157..162` и реальной concurrent index
  build на заполненных parent-таблицах; добавлен aggregate reconciliation
  planner gate с явным запретом использовать proposal или HMAC evidence как
  apply authorization.
- `1.0.0`, 27.07.2026 — создан schema-only EXPAND rollout/validation runbook.
