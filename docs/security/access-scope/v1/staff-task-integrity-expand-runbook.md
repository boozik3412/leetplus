# Staff task integrity EXPAND: rollout и validation runbook

| Поле                    | Значение                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Статус                  | `IMPLEMENTED_CANDIDATE`; локальная real PostgreSQL rehearsal пройдена; не deployed     |
| Версия                  | 1.2.0                                                                                  |
| Дата                    | 27.07.2026                                                                             |
| Backlog                 | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                                   |
| Migration count         | 162                                                                                    |
| Latest migration        | `20260727131000_staff_task_integrity_expand`                                           |
| DB-native guard         | 28 FK: 14 composite + 14 simple compatibility                                          |
| Compatibility catalog   | 14 simple `NOT VALID`: 11 non-Store + 3 Store                                          |
| Candidate SHA           | `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed                              |
| Предыдущий этап         | [Integrity inventory](./staff-task-integrity-inventory-runbook.md)                     |
| Следующий этап          | [Aggregate reconciliation plan](./staff-task-integrity-reconciliation-plan-runbook.md) |
| Связанный adoption plan | [Templates и recurring rules](./staff-task-catalog-adoption-plan.md)                   |

Документ описывает schema-only фазу `EXPAND` для same-tenant ссылок
`StaffTaskTemplate`, `StaffTaskRecurringRule`, `StaffTaskRecurringRuleRun` и
`StaffTask`. Он нужен для повторяемой проверки миграций, дальнейшего
`VALIDATE` и безопасной эксплуатации политики archive-first для `Store`.

Этот runbook не является разрешением применять миграции в production,
исправлять production-данные, включать scheduler или выдавать внешний доступ.
Production-like inventory, reconciliation, `VALIDATE`, deployment и
операционный rollback drill остаются отдельными обязательными шагами.

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

1. зафиксировать exact release SHA, migration count `162`, latest migration и
   отношение к канонической ветке;
2. восстановить свежий production-like snapshot в отдельную БД;
3. выполнить guarded read-only inventory и сохранить только aggregate
   evidence;
4. на exact schema 162 выполнить
   [aggregate reconciliation planner](./staff-task-integrity-reconciliation-plan-runbook.md):
   latest migration, unfinished `0`, 14 composite exact, 14 simple exact,
   `0` expected-FK mismatch, `0` unexpected protected FK, 5 indexes exact,
   `0` index mismatch, hidden expected/actual database identity,
   domain-separated HMAC `databaseIdentityDigest`,
   `inventoryExecuted === schema.ready`,
   classification `8 proposal + 29 operator + 6 review`, actionable cap и exit
   contract;
5. назначить owner всем review/operator/proposal findings и получить
   `blockingTotal=0`; proposal, `contentDigest` и `executionDigest` не считать
   authorization;
6. выполнить отдельный idempotent row-level reconciliation dry-run, explicit
   apply и повторный zero-diff dry-run;
7. проверить backup restore, long transactions, свободное место, replication
   health и change window;
8. прогнать populated baseline 156 → exact six migrations 157..162 и N/N-1
   application compatibility;
9. измерить concurrent index duration и metadata lock duration;
10. проверить abort/retry и application rollback без удаления принятых
    constraints;
11. доказать, что N-1 rollback не запускает старый seed: предыдущий seed не
    знает нового archive-first delete order и не является rollback-шагом;
12. получить явное решение `GO` для schema-only release.

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
