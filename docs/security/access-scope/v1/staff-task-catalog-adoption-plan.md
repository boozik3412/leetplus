# Staff task templates и recurring rules: AccessScope adoption plan

| Поле           | Значение                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Статус         | templates, recurring actor HTTP и integrity inventory `IMPLEMENTED_CANDIDATE`; scheduler `NO-GO` |
| Версия         | 1.4.0                                                                                            |
| Дата           | 27.07.2026                                                                                       |
| Backlog        | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008`                                             |
| Scope contract | [access-scope-contract.md](./access-scope-contract.md)                                           |

Документ фиксирует route/action/job inventory для шаблонов и регулярных задач.
Template CRUD/launch уже реализован отдельным bounded candidate, описанным в
[implementation checkpoint](./staff-task-catalog-implementation-checkpoint.md).
Recurring actor HTTP реализован следующим
[checkpoint](./staff-task-recurring-http-implementation-checkpoint.md).
Scheduler и scheduled all-tenant HTTP не зарегистрированы и всё ещё не
применяют system execution contract, поэтому весь catalog slice и внешний тест
остаются `NO-GO`.

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
8. Same-tenant DB invariants отсутствуют для связей
   rule/template/run/store/user/task; `Store.onDelete=SetNull` может превратить
   store-bound resource в tenant-global. Guarded read-only inventory уже
   реализован, но production-like reconciliation ещё не выполнялся.
9. Template/Rule domain audit реализован; retention/system denied attempts ещё
   требуют общей политики.
10. Unit и PG race/rollback suite добавлены; guarded inventory candidate готов,
    но production-like scan/reconciliation, API/BFF/browser и scheduler lease
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
failure (`1`) и blocking finding (`2`). Contract migration добавляется только
после production-like inventory и reconciliation plan. Destructive auto-fix
запрещён.

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
- integrity inventory contract — 9/9; clean PostgreSQL со 156 миграциями
  `PASS`; намеренная cross-tenant fixture `BLOCKED`/2 без ID;
- API/BFF/browser negative journeys.

Текущий recurring checkpoint: focused 27 suites/375 tests и full API
80 suites/1 599 pass/2 todo; real PostgreSQL 8/8 и API/web production builds
зелёные. Это не заменяет inventory, browser и background system evidence.

## 6. Exit criteria

Templates/recurring часть `BETA-MOD-STAFF-003` может перейти в
`IMPLEMENTED_CANDIDATE`, когда:

1. Все HTTP и system paths используют persisted scope.
2. Нельзя материализовать task в чужом Store или для недоступного assignee.
3. Interactive audit сохраняет реального actor.
4. Suspended/non-entitled tenant не обрабатывается.
5. Parent lock/recheck и rollback доказаны real PostgreSQL тестом.
6. Production-like legacy inventory имеет объяснённый zero critical mismatch.
7. Focused/full CI и production builds зелёные.

`VERIFIED` требует staging/canary evidence, exact release SHA, scheduler
ownership и общий Gate 2.

## 7. Changelog

- `1.4.0`, 27.07.2026 — реализован guarded read-only integrity inventory,
  добавлены 43 aggregate reason code, deterministic exit gate, clean-schema CI
  и отдельный runbook будущих DB constraints.
- `1.3.0`, 27.07.2026 — зафиксирован recurring actor HTTP candidate,
  Store/participant locking, IANA/DST schedule и background containment.
