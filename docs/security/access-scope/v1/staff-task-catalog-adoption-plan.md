# Staff task templates и recurring rules: AccessScope adoption plan

| Поле           | Значение                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Статус         | templates, recurring actor HTTP, snapshot admission, inventory/planner, SYNTHETIC proposal dry-run и DB EXPAND `IMPLEMENTED_CANDIDATE`; scheduler `NO-GO` |
| Версия         | 1.17.0                                                                                                                                                    |
| Дата           | 30.07.2026                                                                                                                                                |
| Backlog        | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008`                                                                                                      |
| Scope contract | [access-scope-contract.md](./access-scope-contract.md)                                                                                                    |

Документ фиксирует route/action/job inventory для шаблонов и регулярных задач.
Template CRUD/launch уже реализован отдельным bounded candidate, описанным в
[implementation checkpoint](./staff-task-catalog-implementation-checkpoint.md).
Recurring actor HTTP реализован следующим
[checkpoint](./staff-task-recurring-http-implementation-checkpoint.md).
Same-tenant schema-only EXPAND описан отдельным
[rollout/validation runbook](./staff-task-integrity-expand-runbook.md).
Aggregate-only классификация будущей reconciliation описана в
[reconciliation plan runbook](./staff-task-integrity-reconciliation-plan-runbook.md).
Допуск точного Git-bound snapshot перед inventory/planner обязателен по
[snapshot admission runbook](./staff-task-integrity-snapshot-admission-runbook.md).
Synthetic row-level proposal evidence описан в отдельном
[proposal dry-run runbook](./staff-task-integrity-reconciliation-proposal-dry-run-runbook.md);
он не является production-like evidence или apply authorization.
Scheduler и scheduled all-tenant HTTP не зарегистрированы и всё ещё не
применяют system execution contract, поэтому весь catalog slice и внешний тест
остаются `NO-GO`.

State contract после control-plane EXPAND разделён: StaffTask evidence
остаётся bound к frozen `EXPAND_162` (count `162`, head
`20260727131000_staff_task_integrity_expand`), а current production-like
inventory/planner допускается только после `CURRENT_179` admission — exact
prefix плюс ровно 17 exact allowlisted additive migrations `163..179` из
[канонического current release contract](../README.md#канонический-current-release-contract).
Current count `179`, head
`20260731120000_identity_mail_delivery_release_head`, unfinished `0`. Prior
engineering baseline связан с PR head
`bbef153a288bfdf1c3573eb704f27c013cc0e856` / CI `30443837684`
(`run #23`), выполненным через merge-ref; это не exact-SHA checkout evidence.
Baseline завершился `3/3 PASS`; PostgreSQL подтвердил
`immutableMutationsRejected=7` и
`finalStateAndEvidenceUnchanged=true`. `c1fee42c...` / CI `30442286822`
сохраняется как historical precursor до legacy quarantine
delivery-row/lifecycle freeze. Rejected `6a69cd8...` / run #26 / PG job
`90553255161` и `a644b81...` / run #27 (`2/3 PASS`, PostgreSQL
`90559756334` `FAIL`) не являются accepted evidence. Previous accepted
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
`guest_game_reward_delivery_lock_v1`, оба deferred trigger и pre-DML adoption
application writers закрыли последний lock-order/`40P01` slice; все четыре
engineering provider-write P1 закрыты.

Provider activation и внешний beta всё ещё `NO-GO`: фактическая non-owner
runtime/app DB role должна пройти admission и получить явный `EXECUTE`;
`PUBLIC` revoked. Batch/rebind/future provider writers остаются fail-closed,
bounded whole-transaction retry — defense-in-depth. Interactive actor boundary,
retention, roots/acquisition и production-like apply/deploy/cutover pending.
Signed `CURRENT_166` authority envelope и его DB marker являются historical
evidence только для `CURRENT_166`; их нельзя переименовать или reuse как
authorization для `CURRENT_179`. Для current state требуются новый acquisition
request, `creationNonce`, state-bound Ed25519 envelope и marker rotation.
Production roots `{}` / EMPTY, поэтому production-like admission и внешний
beta остаются `NO-GO`. Historical SHA ниже не являются evidence current
`CURRENT_179`.

## 1. Инвентаризация поверхности

| Surface                                    | Capability           | Текущее состояние                                    | Обязательное исправление                                                                                      |
| ------------------------------------------ | -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /staff/task-templates`                | `view_staff_tasks`   | `IMPLEMENTED_CANDIDATE`                              | scoped rows/options/count/summary и creator projection                                                        |
| `POST /staff/task-templates`               | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | fresh scope; STORES требует non-null active allowed Store                                                     |
| `PATCH /staff/task-templates/:id`          | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | hidden UUID `404`; parent lock; final state; atomic catalog audit                                             |
| `POST /staff/task-templates/:id/tasks`     | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | ACTIVE-only; bound Store; shared task materializer; observers/audit                                           |
| `GET /staff/task-rules`                    | `view_staff_tasks`   | `IMPLEMENTED_CANDIDATE`                              | scoped rules/runs/tasks/options/full summary и PII-safe projection                                            |
| `POST /staff/task-rules`                   | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | fresh scope; active allowed Store FOR SHARE; Template/participant locks; authoritative assignee; atomic audit |
| `PATCH /staff/task-rules/:id`              | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | hidden UUID `404`; Rule FOR UPDATE; Template/Store/participant recheck; scoped response/audit                 |
| `POST /staff/task-rules/:id/tasks`         | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | bound Store; shared materializer; actor/task/catalog audit; schedule unchanged                                |
| `POST /staff/task-rules/run-due`           | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | actor-scoped, server time, atomic Run/Task/Rule/audits, safe duplicate/error result                           |
| `POST /staff/task-rules/scheduled/run-due` | service token        | `NO-GO`, controller не зарегистрирован и default-off | lifecycle, entitlement, store policy, separate machine identity и system audit                                |
| in-process scheduler                       | process config       | `NO-GO`, provider не зарегистрирован и default-off   | один owner/lease, ACTIVE+entitled tenants, heartbeat, timezone и stale reclaim                                |

Отдельных detail, delete и export routes сейчас нет. Archive/pause выполняются
через status update.

## 2. Подтверждённые риски и текущий статус

1. Cross-store template/rule actor HTTP — закрыто bounded candidate.
2. Tenant-wide actor report/runs/PII — закрыто bounded candidate.
3. Interactive `run-due` actor loss/client time travel — закрыто bounded
   candidate.
4. Direct Template/Rule materialization — закрыто общим safe materializer.
5. Scheduler не исключает `SUSPENDED/ARCHIVED` tenant и пока не имеет staff
   entitlement gate; runtime graph поэтому не регистрирует scheduler.
6. Actor due имеет final Rule/Template/Store/participant lock/recheck; real
   PostgreSQL concurrent evidence 5/5 подтверждает ожидание и rollback.
7. Unique `(ruleId, scheduledFor)` уменьшает дубли, но stale `STARTED` run после
   crash system-path пока не reclaim-ится; actor path пишет occurrence и task в
   одном commit.
8. Same-tenant DB EXPAND реализован candidate для 14 связей
   rule/template/run/store/user/task. Три опасных `Store.onDelete=SetNull`
   заменены парой composite + temporary simple `RESTRICT`: simple FK сохраняет
   global existence legacy cross-tenant Store references, штатный путь —
   archive/deactivate. Production-like inventory/reconciliation и `VALIDATE`
   ещё не выполнялись.
9. Template/Rule domain audit реализован; retention/system denied attempts ещё
   требуют общей политики.
10. Unit и PG race/rollback suite добавлены; guarded inventory candidate готов,
    aggregate-only reconciliation planner также реализован, но
    production-like scan/reconciliation, API/BFF/browser и scheduler lease
    suite ещё обязательны.
11. Store-bound actor schedule использует IANA timezone/DST policy. Global Rule
    имеет UTC fallback и не допускается в первую внешнюю когорту до persisted
    tenant/rule timezone policy.

## 3. Нормативная модель

### NETWORK

- читает все templates/rules/runs своего Tenant;
- создаёт и изменяет store-bound и tenant-global ресурсы;
- может запускать due rules сети при наличии `manage_staff_tasks`;
- не может выбирать Platform Admin как assignee.

### STORES

- читает только `storeId IN allowedStoreIds`;
- не получает null/global templates, rules, runs или option projections;
- create требует non-null allowed Store;
- запрещённый explicit store filter даёт `403`;
- direct UUID вне scope маскируется как `404`;
- assignee имеет persisted `STORES` scope, включающий target Store, и не имеет
  доступ шире actor;
- linked template доступен actor и совместим с effective rule/task Store.

Client `tenantId`, `storeId`, template/rule UUID, labels или assignee никогда не
расширяют authority.

## 4. Реализация

### Slice A — единая catalog policy

Добавить переиспользуемую policy для templates/rules:

- resolve persisted actor scope;
- list/direct predicates;
- allowed Store selector;
- authoritative user selector;
- null/global write rule;
- server-owned task label deny;
- helpers `403` для explicit filter и `404` для hidden UUID.

Подключить её к обоим сервисам и `StaffModule`.

### Slice B — безопасные writes и launch

- вычислять effective final store/template/assignee/status;
- блокировать parent `FOR UPDATE`;
- после lock повторять scope/status/reference checks;
- разделить DRAFT/PUBLISHED template launch policy;
- вынести общий безопасный `StaffTask` materializer либо повторно применить все
  task invariants;
- create task только `OPEN`;
- не принимать клиентские `assignmentMode`, `candidateUserIds`,
  `originalAssignedToUserIds`, `bulkTaskGroupId`;
- audit содержит actor, source template/rule, effective Store и release SHA, но
  не PII.

### Slice C — interactive и scheduled due execution

- interactive run получает actor context и обрабатывает только доступные rules;
- scheduled path выбирает только `ACTIVE` и staff-entitled tenant;
- перед materialization в одной транзакции повторно проверяются tenant
  lifecycle, rule ACTIVE, Store active/allowed, template compatibility и
  assignee;
- scheduler имеет единственного owner/lease, in-flight guard, heartbeat и
  reclaim stale `STARTED`;
- suspend/entitlement revoke прекращают новые task writes немедленно.

До появления `TenantExecutionPolicy` scheduled activation остаётся `NO-GO`.

### Slice D — database и legacy inventory

Read-only часть реализована candidate
`56d615437ecfcb90db252016d3e5b83f3f545578`; операционный порядок описан в
[inventory runbook](./staff-task-integrity-inventory-runbook.md). Команда
обязательна в CI после применения всех миграций и не имеет apply-режима.

Read-only inventory считает:

- cross-tenant references;
- null-store ACTIVE rules/templates;
- rule/template store mismatch;
- inactive/platform/out-of-store assignees;
- run tenant mismatch;
- stale `STARTED` и повторяющиеся `FAILED`;
- active rules у suspended tenant или inactive Store;
- store deletion candidates, которые превратятся в global resources.

Scanner использует одну read-only `REPEATABLE READ` snapshot, возвращает 43
стабильных aggregate reason code без ID/PII и различает database/contract
failure (`1`) и blocking finding (`2`). Destructive auto-fix запрещён.

Schema-only EXPAND реализован отдельным bounded candidate
`dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed:

- пять parent keys создаются отдельными
  `CREATE UNIQUE INDEX CONCURRENTLY`;
- 14 composite same-tenant FK добавляются как `NOT VALID`: новые invalid
  writes уже запрещены, legacy rows допускаются до reconciliation;
- 11 соответствующих legacy non-Store FK swap/re-add’ятся как `NOT VALID`:
  сохраняют 10 `ON DELETE SET NULL` и один `CASCADE`, но переходят на
  `ON UPDATE RESTRICT`;
- три legacy Store `SET NULL` FK пересоздаются под прежними именами как
  temporary simple `RESTRICT/RESTRICT NOT VALID`, параллельно с composite
  Store `RESTRICT`; это защищает legacy cross-tenant rows от dangling
  `storeId`;
- parent identifiers Store/User/Template/Rule/Task immutable; N/N-1 runtime
  compatibility не разрешает ID update или запуск старого seed;
- Prisma 6.19 отражает parent keys, Store relations и `onUpdate: Restrict`
  всех 11 simple non-Store relations; manual composite drift включает
  10 partial-`SET NULL` и один Run→Rule `CASCADE`, а `NOT VALID`/coexistence
  всех 14 simple compatibility FK остаётся DB-native;
- exact fresh-162 diff предлагает 14 security DROP: 11 non-Store composite и
  три temporary simple Store FK; 11 simple non-Store FK он не меняет,
  unrelated ADD/index-rename drift рассматривается отдельно; smoke получает
  diff через `--from-schema-datasource`/scoped env без URL или пароля в argv;
- offline self-test защищает 28 FK от DROP/RENAME/ALTER,
  `DROP NOT NULL` contract-колонок, trigger/`session_replication_role` bypass и
  запрещает destructive table/column DDL, DROP/ALTER пяти parent indexes,
  DROP SCHEMA и неожиданные migration directory names; exact artifact guard
  фиксирует пять one-statement concurrent index migrations и финальную
  transaction/timeouts/lock order/`28 ADD + 14 DROP + 28 NOT VALID`;
  разрешены только create-only generation и ручной SQL review, `db push`
  запрещён;
- полная схема содержит 162 migration, latest —
  `20260727131000_staff_task_integrity_expand`.

Порядок rehearsal, `VALIDATE`, `CONTRACT` и rollback зафиксирован в
[EXPAND runbook](./staff-task-integrity-expand-runbook.md). Наличие candidate
не отменяет обязательный production-like inventory и reconciliation.

Aggregate-only reconciliation planner описан в отдельном
[runbook](./staff-task-integrity-reconciliation-plan-runbook.md):
historical candidate `2c74c663...` не является current evidence; exact
`CURRENT_165` engineering candidate
`4bd6a036df16579f68b2c96a14b6475c8311b231` принят по зелёному remote CI
`30428288353`, а documentation/evidence successor `7c20adec...` — по CI
`30429463161`. Это historical prerequisite. Living schema target —
`CURRENT_179`; `CURRENT_166` evidence не разрешает current operations;
prior PR-head-associated merge-ref baseline —
`bbef153a...` / `30443837684`, не exact-SHA evidence; previous accepted
exact-head — `d525b736...` / `30447467729`, `3/3 PASS`; last accepted
exact-head — `be8c94c4...` / `30449026506`, `3/3 PASS`, все четыре engineering
provider-write P1 закрыты. `c1fee42c...` / `30442286822` остаётся historical
precursor. Production-like evidence ещё pending.

- использует одно соединение и одну `READ ONLY REPEATABLE READ` transaction;
- требует exact target/confirmation, production attestation, 40-hex
  `RELEASE_SHA`, HMAC key и expected database binding; expected/actual DB
  names не выводятся; domain-separated HMAC `databaseIdentityDigest` связывает
  evidence с database name, PostgreSQL cluster и database OID без raw identity;
- принимает только полный каталог из 43 кодов:
  `8 proposal + 29 operator + 6 review`;
- считает actionable cap только по proposal/operator, исключая review-only
  counts;
- сохраняет protected StaffTask prefix `EXPAND_162`, но выполняет current
  schema-first exact gate `CURRENT_179`, `migrationCount=179`, latest
  `20260731120000_identity_mail_delivery_release_head`, `unfinished=0`,
  `14 composite exact`, `14 simple exact`, `0 expected-FK mismatch`,
  `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
- использует exits `0/1/2/3`;
- считает `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` blocking;
- fail-closed требует `inventoryExecuted === schema.ready`;
- не имеет apply path; proposal не является authorization; aggregate-only
  output не содержит row identifiers/database names; стабильный
  `contentDigest` и timestamp-bound `executionDigest` не являются row-stable
  checksum или CAS/apply token.

Planner только оценивает объём и классы работы. SYNTHETIC row-level proposal
dry-run schema `1` уже реализован для disposable harness, но не является
production-like evidence или apply authorization. Production-like row dry-run,
idempotent apply, locks/recheck, audit, rollback и повторный zero-diff остаются
отдельным следующим P0.

Historical snapshot admission evidence boundary зафиксирован на
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; это не current candidate
evidence. Current admission поддерживает schema target `CURRENT_179` после
exact 17-name allowlisted tail `163..179`; prior merge-ref engineering baseline
— `bbef153a...` / `30443837684`, PostgreSQL major `16`; previous accepted
exact-head — `d525b736...` / `30447467729`, `3/3 PASS`; last accepted
exact-head — `be8c94c4...` / `30449026506`, `3/3 PASS`, все четыре engineering
provider-write P1 закрыты. `c1fee42c...` / `30442286822` остаётся historical
precursor. Historical `CURRENT_165` engineering candidate
`4bd6a036...` / CI `30428288353` и evidence successor
`7c20adec...` / CI `30429463161` остаются prerequisite.
Admission допускает только loopback snapshot, точные runtime bytes и migration
manifest из Git artifact. Logical allowlist содержит девять
relations, но роль получает table-level `SELECT` только на восемь; для `User`
разрешены ровно `id`, `tenantId`, `isPlatformAdmin`, `isActive`,
`accessScope`. Admission report использует schema `2`, planner/proposal —
schema `1`. Caller HMAC не является production-like authority:
положительный допуск требует Ed25519 manifest, nonce-bound DB/approval
evidence и совпадающий DB marker. Trusted-root registry намеренно пуст, поэтому
production-like admission, inventory и planner остаются fail-closed `NO-GO`.
Отдельный historical test evidence
`2341b99937e54cc50d1763a0a794d975816c72ce` подтверждает authority `9/9`,
admission `19/19` и public-only pre-signed pinned-path `LOCAL PASS` в
изолированном child-процессе. Его historical successor в exact
`CURRENT_165` candidate прошёл remote CI
`4bd6a036...` / `30428288353` и `7c20adec...` / `30429463161`; используемый
экспериментальный Node 22 module mock классифицирован как P2. Это тест verifier
path, а не enrollment production root: reviewed root enrollment, operational
signer и approved snapshot acquisition остаются P0.
Синтетическая PostgreSQL 16.13 репетиция прошла 23 database-сценария: восемь
proposal-кодов дали восемь occurrences и семь cases, включая coalescing двух
last-task причин; подтверждены parity `10 blocking + 2 review` и cap boundary
`9 reject / 10 findings`.

## 5. Обязательная test topology

- Tenant A: Store A1 и A2;
- actors `NETWORK`, `STORES[A1]`, `STORES[A1,A2]`;
- Tenant B: Store B1;
- active, suspended и archived tenant;
- same-store, cross-store, cross-tenant, null/global, inactive/platform и
  contradictory assignee.

Проверить list/options/runs, forbidden filter, hidden UUID, create/update,
template launch, rule launch, interactive run-due, scheduled run-due, scope
revoke, concurrent pause/store change, duplicate tick и stale run reclaim.

Нужны:

- unit specs templates/recurring/scheduler — реализованы для bounded actor
  candidate;
- real PostgreSQL race/rollback integration — 2 suites/8 tests, включая
  recurring 5/5, реализована и обязательна в CI;
- historical integrity inventory contract — 9/9; frozen clean PostgreSQL
  prefix 162 `PASS`; намеренная cross-tenant fixture `BLOCKED`/2 без ID;
- historical aggregate reconciliation planner contract — pass на prefix 162;
  current `CURRENT_179` production-like evidence ещё pending;
- historical snapshot admission contract — `19` admission unit, `9` authority unit и
  `46` offline smoke checks; staged PostgreSQL 16.13 smoke прошёл `23`
  сценария `BASELINE_156 → migrations 157..162 → EXPAND_162`, exact восемь
  table grants + пять `User` columns, admission schema `2`, все восемь
  proposal-кодов/восемь occurrences/семь cases, coalescing, parity
  `10 blocking + 2 review`, cap `9 reject / 10 findings` и негативные
  privilege/trigger/tamper/privacy проверки;
- historical public-only pre-signed pinned-path test — `LOCAL PASS` на evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` в isolated child; remote CI
  evidence pending, experimental Node 22 module mock — P2;
- proposal dry-run contract — schema `1`, unit `14/14`; HMAC-authenticated
  synthetic provenance, privacy, execution unlinkability и no-apply boundary
  подтверждены;
- identity/inventory contract подтверждает HMAC `databaseIdentityDigest`,
  различие evidence между БД/кластерами и отклонение противоречивого
  `inventoryExecuted`;
- adversarial catalog smoke на disposable local/CI clone сохранил все expected
  FK, отклонил дополнительный конфликтующий FK и неверный порядок колонок
  index до inventory; source database не изменена, clone удалён;
- staged real PostgreSQL EXPAND smoke: populated legacy baseline 156 → ровно
  шесть migrations `157..162`; пять parent indexes построены на заполненных
  таблицах, 14 legacy rows сохранены, 14 composite + 14 simple compatibility
  `NOT VALID` FK, 14 benign legacy updates, 14 rejected new invalid writes,
  три archive-first, три legacy Store delete protections, пять rejected UUID
  - пять tenant moves и `prismaDriftDrops=14` — pass;
- API/BFF/browser negative journeys.

Текущий recurring checkpoint: focused 27 suites/375 tests и full API
80 suites/1 599 pass/2 todo; real PostgreSQL 8/8 и API/web production builds
зелёные. Это не заменяет inventory, browser и background system evidence.

## 6. Exit criteria

Для перехода всей templates/recurring/EXPAND части `BETA-MOD-STAFF-003` из
`IMPLEMENTED_CANDIDATE` в `VERIFIED` должны одновременно выполняться условия:

1. Все HTTP и system paths используют persisted scope.
2. Нельзя материализовать task в чужом Store или для недоступного assignee.
3. Interactive audit сохраняет реального actor.
4. Suspended/non-entitled tenant не обрабатывается.
5. Parent lock/recheck и rollback доказаны real PostgreSQL тестом.
6. Свежий production-like snapshot прошёл Git-bound admission сначала с
   отдельным `BASELINE_156` authority envelope/DB marker, затем после exact
   migrations `157..162` — с новым `EXPAND_162` envelope, новым nonce-bound
   binding и заменённым DB marker, затем после exact 17-name allowlisted tail
   `163..179` — с отдельным `CURRENT_179` envelope и второй marker rotation;
   historical `CURRENT_166` envelope/marker не переименовывались и не
   переиспользовались;
   все state-specific protected evidence bundle и rotation attestation
   сохранены. Remote target, marker reuse и mutable worktree artifact не
   использовались.
7. Production-like legacy inventory и reconciliation имеют объяснённый zero
   critical mismatch.
8. Focused/full CI и production builds зелёные.
9. Все 14 composite FK валидированы в управляемом
   staging/production-like rehearsal.
10. После N-1 rollback window отдельный CONTRACT удалил ровно 14 simple
    compatibility FK и сохранил guard для 14 composite FK.
11. Aggregate planner на production-like snapshot прошёл exact schema gate и
    cap; proposal/operator обработаны отдельным approved reconciliation
    workflow, `contentDigest`/`executionDigest` не использовались как
    row-level/CAS authorization.

`VERIFIED` требует staging/canary evidence, exact release SHA, scheduler
ownership и общий Gate 2.

## 7. Changelog

- `1.17.0`, 30.07.2026 — living inventory/planner/admission target переведён
  на terminal `CURRENT_179` (`179` /
  `20260731120000_identity_mail_delivery_release_head`) при frozen prefix
  `EXPAND_162` и exact 17-name tail `163..179`. Signed `CURRENT_166`
  envelope/marker сохранён только как historical evidence; для `179` нужны
  новый nonce-bound envelope и marker rotation. Roots `{}` / EMPTY сохраняют
  production-like workflow и external beta в состоянии `NO-GO`.

- `1.16.0`, 29.07.2026 — единая retroactive evidence correction:
  schema target — `CURRENT_166`; previous accepted PR-head-associated merge-ref
  baseline `bbef153a...` / CI `30443837684` (`run #23`) завершился `3/3
  PASS`, но не является exact-SHA evidence;
  PostgreSQL evidence:
  `immutableMutationsRejected=7`,
  `finalStateAndEvidenceUnchanged=true`. Legacy quarantine
  delivery-row/lifecycle P1 закрыт. Run #26 и run #27 rejected. Previous
  accepted exact-head `d525b736...` / CI `30447467729` (`run #28`) — `3/3
  PASS`. Last accepted exact-head `be8c94c4...` / CI `30449026506` (`run #29`)
  — `3/3 PASS`: Application `90566337085`, Authority checks `90566337062`,
  PostgreSQL major `16` `90566337060`; checks не выполняли enrollment, roots
  `{}`. Structured lock-order evidence закрыл последний engineering
  provider-write P1; все четыре закрыты. Non-owner runtime role admission и
  explicit `EXECUTE`, interactive boundary, retention, roots/acquisition,
  production-like admission/reconciliation/apply/deploy и внешний beta
  остаются `NO-GO`.
- `1.15.0`, 29.07.2026 — exact-SHA engineering evidence catalog/admission
  target `CURRENT_166` принято на `c1fee42c...` / CI `30442286822`;
  PostgreSQL major `16` rehearsal `165 → 166` зелёный. Scheduler,
  production-like admission/reconciliation, apply/deploy и внешний beta
  остаются `NO-GO`.
- `1.14.0`, 29.07.2026 — current operational catalog/admission/planner target
  переведён на implementation candidate `CURRENT_166`: tail `163..166`, count
  `166`, latest `20260729160000_guest_game_delivery_claim_fence`. Remote
  exact-SHA и populated `165 → 166` pending; `CURRENT_165`
  `4bd6a036...`/`7c20adec...` остаётся historical evidence, scheduler и
  production-like — `NO-GO`.
- `1.13.0`, 29.07.2026 — historical `CURRENT_165`
  catalog/admission/planner
  engineering gates прошли remote CI `4bd6a036...` / `30428288353`;
  production-like evidence и scheduler остаются `NO-GO`.
- `1.10.0`, 28.07.2026 — runtime candidate сохранён на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, а тестовый контур зафиксирован
  отдельным SHA `2341b99937e54cc50d1763a0a794d975816c72ce`: authority `9/9`,
  admission `19/19`, public-only pre-signed pinned-path `LOCAL PASS` в isolated
  child. Remote CI evidence pending; experimental Node 22 module mock — P2.
  Production roots пусты; root enrollment, signer и acquisition остаются P0,
  production-like прогон и внешний beta — `NO-GO`.
- `1.9.0`, 28.07.2026 — admission обновлён до schema v2 и evidence boundary
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`: exact runtime Git blobs,
  column-scoped `User`, Ed25519 manifest/DB marker/freshness и exhaustive
  synthetic proposal matrix подтверждены 23 PostgreSQL 16.13 сценариями.
  Trusted roots, operational signer/acquisition и production-like прогон ещё
  отсутствуют; apply и внешний beta остаются `NO-GO`.
- `1.8.0`, 27.07.2026 — добавлен обязательный Git-bound snapshot admission
  перед production-like inventory/planner: candidate
  `7d67333b22f171c6e79f723190647cdd2454b128`, состояния `BASELINE_156` и
  `EXPAND_162`, exact select-only role, `16` unit, `34` offline и `9`
  PostgreSQL 16 smoke-сценариев. Production-like acquisition/restore/admission
  не выполнялись, внешний beta остаётся `NO-GO`.
- `1.7.0`, 27.07.2026 — planner усилен schema-first exact gate, скрытой
  expected/actual database identity binding, aggregate-only/no-ID contract,
  `contentDigest`/`executionDigest` и adversarial disposable-clone FK/index
  smoke; EXPAND получил exact artifact/future-DDL guards. Apply/authorization
  отсутствуют, внешний beta остаётся `NO-GO`.
- `1.6.0`, 27.07.2026 — добавлен aggregate-only reconciliation planner:
  `8 proposal + 29 operator + 6 review`, exact schema gate, exits `0/1/2/3`,
  actionable cap и HMAC evidence с
  запретом использовать proposal/HMAC evidence как apply authorization; EXPAND
  rehearsal усилена populated baseline `156 → 157..162`.
- `1.5.0`, 27.07.2026 — добавлен same-tenant schema-only EXPAND candidate:
  пять concurrent parent indexes, 14 composite и 14 simple compatibility
  `NOT VALID` FK, archive-first/global-existence Store protection, immutable
  parent IDs, expanded DDL guard, scoped Prisma drift, staged PostgreSQL smoke
  и отдельный runbook;
  production-like reconciliation/VALIDATE/deploy остаются `NO-GO`.
- `1.4.0`, 27.07.2026 — реализован guarded read-only integrity inventory,
  добавлены 43 aggregate reason code, deterministic exit gate, clean-schema CI
  и отдельный runbook будущих DB constraints.
- `1.3.0`, 27.07.2026 — зафиксирован recurring actor HTTP candidate,
  Store/participant locking, IANA/DST schedule и background containment.
