# Staff recurring rules: actor HTTP implementation checkpoint

| Поле | Значение |
|---|---|
| Дата | 27.07.2026 |
| Actor HTTP | `IMPLEMENTED_CANDIDATE` |
| In-process scheduler | `NO-GO`, provider не зарегистрирован |
| Scheduled HTTP | `NO-GO`, controller не зарегистрирован и fail-closed |
| Production deployment | Не выполнялся |
| Parent backlog | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008` |

Этот checkpoint продолжает
[template/catalog checkpoint](./staff-task-catalog-implementation-checkpoint.md)
и фиксирует только интерактивный HTTP-контур регулярных задач. Он не разрешает
background execution и не меняет общий release decision `NO-GO`.

## 1. Зафиксированная топология

- четыре текущих клуба остаются четырьмя `Store` одного существующего
  operational `Tenant`;
- `NETWORK` actor работает со всей своей сетью;
- `STORES` actor видит и изменяет только конкретные persisted allowed Store;
- независимая внешняя сеть всегда получает отдельный `Tenant`;
- первая внешняя когорта по-прежнему получает полный staff-модуль, но только
  после полного Gate 2.

## 2. Реализованный actor HTTP-контур

### `GET /staff/task-rules`

- rule rows ограничиваются persisted `NETWORK | STORES`;
- запрещённый explicit Store filter отклоняется `403` до SQL;
- linked template должен быть видим actor;
- runs дополнительно проверяют rule и созданную task;
- stores, active templates и participant users формируются из того же scope;
- summary считается по полному scoped набору, а не только по первым 200 rows;
- creator/assignee/last task проецируются только при live scoped visibility;
- raw legacy run errors и произвольный metadata не возвращаются.

### `POST /staff/task-rules`

- persisted actor scope перечитывается внутри транзакции;
- `STORES` требует concrete active allowed Store;
- linked template блокируется `FOR SHARE`, повторно читается и должен быть
  `ACTIVE`;
- template Store и rule Store должны совпадать;
- assignee проверяется authoritative participant predicate;
- Platform Admin и participant шире actor scope запрещены;
- server-owned task labels запрещены;
- rule и минимальный PII-safe `RULE` catalog audit записываются атомарно.

### `PATCH /staff/task-rules/:id`

- hidden/out-of-scope UUID маскируется как `404` до транзакции;
- после fresh scope Rule блокируется `FOR UPDATE` и перечитывается;
- linked Template блокируется и проверяется после Rule lock;
- final Store, Template, status и assignee валидируются повторно;
- schedule не пересчитывается, если присланные schedule fields фактически
  равны locked state;
- pause/archive-only остаётся возможным после деактивации Store, чтобы
  automation можно было безопасно остановить;
- mutation response повторно блокирует и проверяет candidate
  `User/UserStoreAccess`, поэтому committed revoke не раскрывает PII, а
  revoke-in-flight сериализуется;
- per-rule task count имеет тот же tenant/store predicate в list/create/update;
- update и `UPDATED | ACTIVATED | PAUSED | ARCHIVED` audit атомарны.

### `POST /staff/task-rules/:id/tasks`

- scoped precheck и transaction recheck дают `404` для hidden Rule;
- bound Rule нельзя запустить для другого Store или `null`;
- linked Template должен оставаться active и совместимым;
- task создаётся только через общий
  `StaffTasksService.createCatalogTaskInTransaction`;
- повторно применяются OPEN-only, Store, assignee, role, labels, task audit,
  observers/notification invariants общего materializer;
- обновляются только `lastManualRunAt` и `lastCreatedTaskId`;
- ручной запуск не сдвигает `nextRunAt`;
- task, task audit/notification, Rule update и RULE `TASK_LAUNCHED` audit
  имеют один commit.

### `POST /staff/task-rules/run-due`

- body разрешает только `limit` и `dryRun`;
- client `now`, `tenantId` и неизвестные поля отклоняются `400`;
- используется только server time;
- candidates выбираются из actor scope;
- перед каждой записью scope перечитывается, Rule блокируется и eligibility
  проверяется повторно;
- `Run`, `Task`, task audit/notification, Rule schedule update и catalog audit
  записываются одной транзакцией;
- materializer получает реального actor, а не `actorUserId = null`;
- unique conflict становится generic `SKIPPED` без раскрытия DB error.
- следующий run store-bound Rule вычисляется в IANA timezone Store; DST gap
  сдвигается вперёд, а повторяющееся время DST fold даёт одно earliest
  occurrence.
- calendar/IANA/DST расчёт вынесен в отдельный
  `staff-task-recurring-schedule.ts`; основной recurring service уменьшен на
  387 строк без изменения actor contract.

## 3. Lock contract

Actor mutation использует следующий фактический порядок:

```text
Tenant FOR SHARE
→ actor User FOR SHARE
→ actor UserStoreAccess FOR SHARE (storeId, id)
→ existing RecurringRule FOR UPDATE
→ linked Template FOR SHARE
→ active Store FOR SHARE
→ assignee User FOR SHARE
→ assignee UserStoreAccess FOR SHARE (storeId, id)
→ Rule / Run / Task / audits / notification writes
```

При создании Rule строка Rule отсутствует, поэтому после actor locks первой
reference lock является Template `FOR SHARE`.

Template mutation использует `Template FOR UPDATE`. Поэтому archive/rebind
Template и create/activate/launch Rule сериализуются на одной template row и
после ожидания всегда повторно проверяют final template state.

Store mutation обновляет Store row и не берёт User/Template locks. Recurring
mutation держит Store `FOR SHARE` до commit; archive ждёт либо завершается до
post-lock ACTIVE recheck. User mutation берёт User, затем изменяет
UserStoreAccess; recurring Store `FOR SHARE` совместим с FK `KEY SHARE`, а
Store lifecycle не берёт User, поэтому обратного Store→User цикла нет.

## 4. Background containment

Background-контур сознательно не повышен до candidate:

- `StaffTaskRecurringRulesSchedulerService` удалён из providers `StaffModule`;
- `StaffTaskRecurringRulesScheduledController` удалён из controllers
  `StaffModule`;
- scheduler даже после будущей явной регистрации включается только
  нормализованным exact `STAFF_TASK_RULES_SCHEDULER_ENABLED=true`;
- прежний fallback `production + SYNC_SERVICE_TOKEN` удалён;
- scheduled HTTP имеет дополнительный strict
  `STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED=true` gate до проверки token;
- оба флага в `.env.example` имеют безопасное значение `false`.

Таким образом текущий application graph не создаёт background timer и не
регистрирует all-tenant scheduled route.

## 5. UI и lifecycle

- новый Rule по умолчанию получает первый active Store; NETWORK actor может
  сознательно выбрать network-global режим;
- selector показывает только active templates и active stores;
- inactive Store или archived Template текущего legacy Rule остаётся видимым
  как disabled selection и не сбрасывается;
- ручной запуск store-bound Rule фиксирует Store;
- пустые launch overrides не отправляются как explicit `null`;
- archived Rule нельзя запускать из UI;
- PATCH строится как semantic diff; no-op не отправляется, а status-only
  pause/archive содержит только `{status}` и не пересчитывает `nextRunAt`;
- template можно архивировать archive-only update после деактивации его Store,
  но active recurring rules предварительно должны быть paused.

## 6. Проверки checkpoint

Подтверждено локально:

- recurring actor service unit — 23/23 pass;
- scheduled HTTP fail-closed unit — 6/6 pass;
- scheduler default-off unit — 4/4 pass;
- template lifecycle + scheduler targeted run — 16/16 pass;
- focused API — 27 suites, 375/375 tests — pass;
- full API — 80 suites, 1 599 pass, 2 todo (1 601 total) — pass;
- real PostgreSQL transaction security — 2 suites, 8/8 pass; recurring
  5/5 подтверждают фактическое ожидание через `pg_blocking_pids`, post-wait
  recheck и rollback для Template archive/rebind, Store archive и participant
  revoke;
- API и web production typecheck — pass;
- API boundary lint и targeted web lint — pass;
- full web lint — 0 errors, 30 существующих warnings;
- API production build — pass;
- web webpack production build — 203 pages — pass.

Первый независимый review нашёл шесть P1: revoked PII в status-only response,
unscoped per-rule count, Store/participant races, full UI PATCH и process-local
timezone. Все шесть закрыты кодом и unit/real-PostgreSQL evidence. Финальный
independent re-review по стабилизированному diff не нашёл P0/P1; actor HTTP
подтверждён как `IMPLEMENTED_CANDIDATE`, background и внешний beta остались
`NO-GO`. `git diff --check` — pass.

## 7. Остаточные блокеры

### P1 до повышения всего staff catalog

1. Нужен read-only inventory legacy cross-tenant links, Store/template
   mismatch, invalid assignee, inactive/null-store active rules и stale runs.
2. Нужны same-tenant composite DB invariants и политика `Store.onDelete`, чтобы
   store-bound Rule не превращался в global.
3. Нужны BFF/browser A1/A2/B negative journeys.
4. Tenant-global Rule пока имеет deterministic UTC fallback. До persisted
   tenant/rule timezone policy global automatic schedule не допускается в
   первую внешнюю когорту.

### P2 actor path

1. Любой Prisma `P2002` пока сворачивается в generic duplicate result; нужно
   отличать occurrence unique constraint от несвязанной ошибки.
2. Ошибка materialization откатывает `STARTED` Run вместе с task transaction;
   нужен отдельный sanitized persistent FAILED evidence contract.
3. Нужен real PostgreSQL duel двух одновременных actor `run-due` и scope revoke
   самого actor.
4. Manual `datetime-local` нужно нормализовать в браузере либо явно
   интерпретировать через Store timezone.
5. UI assignee selector пока actor-wide; backend безопасно отклоняет
   исполнителя, несовместимого с выбранным Store, но UI должен фильтровать
   заранее.
6. Перед staging у всех четырёх текущих Store должен быть валидный IANA
   timezone; иначе срабатывает UTC fallback.

### Scheduler остаётся `NO-GO`

- нет tenant lifecycle/staff entitlement gate;
- нет durable owner lease, fencing, heartbeat и stale reclaim;
- нет retry/dead-letter policy для failed occurrence;
- допустимый actor path использует Store timezone, но disabled legacy
  all-tenant methods сохраняют UTC/default semantics и не должны
  регистрироваться;
- system execution context и отдельная machine identity не реализованы;
- legacy all-tenant execution service не должен регистрироваться до закрытия
  этих пунктов.

## 8. Статус

```text
templates CRUD/launch      = IMPLEMENTED_CANDIDATE
direct staff tasks         = IMPLEMENTED_CANDIDATE
recurring actor HTTP       = IMPLEMENTED_CANDIDATE
in-process scheduler       = NO-GO / UNREGISTERED
scheduled all-tenant HTTP  = NO-GO / UNREGISTERED
external beta              = NO-GO
```

Ни deployment, ни production migration, ни выдача доступа этим checkpoint не
выполнялись.
