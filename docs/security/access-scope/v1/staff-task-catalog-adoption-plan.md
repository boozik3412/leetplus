# Staff task templates и recurring rules: AccessScope adoption plan

| Поле | Значение |
|---|---|
| Статус | templates `IMPLEMENTED_CANDIDATE`; recurring/scheduler `NO-GO` |
| Версия | 1.1.0 |
| Дата | 27.07.2026 |
| Backlog | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008` |
| Scope contract | [access-scope-contract.md](./access-scope-contract.md) |

Документ фиксирует route/action/job inventory для шаблонов и регулярных задач.
Template CRUD/launch уже реализован отдельным bounded candidate, описанным в
[implementation checkpoint](./staff-task-catalog-implementation-checkpoint.md).
Recurring HTTP и scheduler всё ещё не применяют полный контракт, поэтому весь
catalog slice и внешний тест остаются `NO-GO`.

## 1. Инвентаризация поверхности

| Surface | Capability | Текущее состояние | Обязательное исправление |
|---|---|---|---|
| `GET /staff/task-templates` | `view_staff_tasks` | `IMPLEMENTED_CANDIDATE` | scoped rows/options/count/summary и creator projection |
| `POST /staff/task-templates` | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE` | fresh scope; STORES требует non-null active allowed Store |
| `PATCH /staff/task-templates/:id` | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE` | hidden UUID `404`; parent lock; final state; atomic catalog audit |
| `POST /staff/task-templates/:id/tasks` | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE` | ACTIVE-only; bound Store; shared task materializer; observers/audit |
| `GET /staff/task-rules` | `view_staff_tasks` | tenant-wide rules/runs/users/stores | rule, run и created-task projections используют один scope |
| `POST /staff/task-rules` | `manage_staff_tasks` | tenant-only references | allowed Store, compatible template и authoritative assignee |
| `PATCH /staff/task-rules/:id` | `manage_staff_tasks` | direct `id + tenantId` | scoped UUID, final-state validation и row lock |
| `POST /staff/task-rules/:id/tasks` | `manage_staff_tasks` | direct materialization | scoped parent lock/recheck, actor audit, shared safe task materializer |
| `POST /staff/task-rules/run-due` | `manage_staff_tasks` | запускает все due rules tenant | actor-scoped rules only; не раскрывает чужие IDs/titles |
| `POST /staff/task-rules/scheduled/run-due` | service token | tenant/all-tenant system execution | lifecycle, entitlement, store policy и system audit |
| in-process scheduler | process config | каждый API process, все tenant | один owner/lease, ACTIVE+entitled tenants, heartbeat и stale reclaim |

Отдельных detail, delete и export routes сейчас нет. Archive/pause выполняются
через status update.

## 2. Подтверждённые риски

1. `STORES[A1]` actor может читать и изменять template/rule Store A2.
2. Tenant-wide reports раскрывают runs, task titles, users и stores вне scope.
3. Interactive `run-due` теряет actor, пишет `actorUserId=null` и выглядит как
   automatic system run.
4. Template/rule materializers пишут `StaffTask` напрямую и обходят participant,
   status, server-owned labels и task creation policy.
5. Scheduler не исключает `SUSPENDED/ARCHIVED` tenant и пока не имеет staff
   entitlement gate.
6. Due rule читается до транзакции без final parent lock/recheck; concurrent
   pause/archive/store change не гарантирует отмену materialization.
7. Unique `(ruleId, scheduledFor)` уменьшает дубли, но stale `STARTED` run после
   crash не reclaim-ится.
8. Same-tenant DB invariants отсутствуют для связей
   rule/template/run/store/user/task; `Store.onDelete=SetNull` может превратить
   store-bound resource в tenant-global.
9. Нет domain audit create/update/archive template/rule.
10. Специализированной unit/PG suite для этих сервисов и scheduler нет.

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

Read-only inventory считает:

- cross-tenant references;
- null-store ACTIVE rules/templates;
- rule/template store mismatch;
- inactive/platform/out-of-store assignees;
- run tenant mismatch;
- stale `STARTED` и повторяющиеся `FAILED`;
- active rules у suspended tenant или inactive Store;
- store deletion candidates, которые превратятся в global resources.

Contract migration добавляется только после production-like inventory и
reconciliation plan. Destructive auto-fix запрещён.

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

- unit specs обоих сервисов;
- scheduler spec;
- real PostgreSQL race/rollback integration;
- API/BFF/browser negative journeys.

## 6. Exit criteria

Templates/recurring часть `BETA-MOD-STAFF-003` может перейти в
`IMPLEMENTED_CANDIDATE`, когда:

1. Все HTTP и system paths используют persisted scope.
2. Нельзя материализовать task в чужом Store или для недоступного assignee.
3. Interactive audit сохраняет реального actor.
4. Suspended/non-entitled tenant не обрабатывается.
5. Parent lock/recheck и rollback доказаны real PostgreSQL тестом.
6. Legacy inventory имеет объяснённый zero critical mismatch.
7. Focused/full CI и production builds зелёные.

`VERIFIED` требует staging/canary evidence, exact release SHA, scheduler
ownership и общий Gate 2.
