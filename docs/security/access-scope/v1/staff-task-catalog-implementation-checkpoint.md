# Staff task catalog: implementation checkpoint

| Поле | Значение |
|---|---|
| Статус | `IMPLEMENTED_CANDIDATE` для templates; recurring/scheduler — `NO-GO` |
| Дата | 27.07.2026 |
| Backlog | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008` |
| Миграция | `20260727120000_staff_task_catalog_audit_expand` |
| Production deployment | Не выполнялся |

Этот документ фиксирует bounded-срез шаблонов задач и общего task
materializer. Он не означает готовность всего модуля сотрудников и не
разрешает внешний тест. Регулярные правила и scheduler остаются отдельным
блокирующим срезом.

## 1. Неизменяемый продуктовый контекст

- текущие четыре клуба — четыре `Store` одного существующего `Tenant`;
- текущая сеть не разделяется на четыре tenant;
- каждая новая независимая сеть получает отдельный `Tenant`;
- первый внешний tenant должен получить целиком геймификацию,
  ассортимент/товары, сотрудников, in-app коммуникации и users/roles;
- tenant user ограничен своим tenant и persisted режимом `NETWORK` либо
  `STORES` с явным `allowedStoreIds`;
- Platform Admin не является ролью клиента.

## 2. Поверхность checkpoint

| Route | Capability | Реализованный контракт |
|---|---|---|
| `GET /staff/task-templates` | `view_staff_tasks` | rows, stores, users, task counts и summary ограничены persisted scope |
| `POST /staff/task-templates` | `manage_staff_tasks` | fresh persisted scope; `STORES` требует active allowed Store; NETWORK может создать global |
| `PATCH /staff/task-templates/:id` | `manage_staff_tasks` | hidden UUID — `404`; parent lock; fresh scope; final Store/status; active-rule guard; atomic audit |
| `POST /staff/task-templates/:id/tasks` | `manage_staff_tasks` | только `ACTIVE`; bound Store нельзя переопределить; fresh scope; общий task materializer; atomic task/catalog audit |

Прямые task paths остаются описаны строкой `STAFF-02A` в
[module-adoption-matrix.md](./module-adoption-matrix.md). Recurring HTTP,
scheduled HTTP и in-process scheduler в этот checkpoint не входят.

## 3. Реализованные security-инварианты

### 3.1. Общая catalog policy

`StaffTaskCatalogAccessPolicyService` задаёт единые predicates для templates,
rules, runs, stores и participants:

- каждый predicate содержит authoritative `tenantId`;
- `STORES` видит только `storeId IN allowedStoreIds` и не видит global rows;
- forbidden explicit Store filter возвращает `403`;
- direct UUID вне scope маскируется как `404`;
- participant обязан быть active, не Platform Admin и иметь непротиворечивый
  persisted scope;
- NETWORK-пользователь с `UserStoreAccess` rows и STORES-пользователь без
  разрешённых rows считаются невалидными;
- server-owned assignment labels нельзя передать через template.

Перед mutation сервис перечитывает persisted `User` и `UserStoreAccess` в
транзакции. Порядок блокировок согласован с `UsersService`:

```text
User → UserStoreAccess → Template → domain write/audit
```

Это устраняет deadlock-сценарий, при котором отзыв scope ранее начинался с
удаления `UserStoreAccess`, а template launch уже держал `User`.

### 3.2. Scoped read model

- task count каждого шаблона использует scoped relation filter;
- summary считается отдельной scoped aggregation по всему результату, а не по
  первым 200 строкам списка;
- Store options ограничены actor scope;
- user options используют authoritative participant predicate;
- `createdByUser` возвращается только если creator входит в безопасную
  participant projection; tenant-only email projection больше не используется;
- повторный query parameter или non-string `storeId` отклоняется как `400`.

### 3.3. Writes и launch

- create/update используют fresh persisted scope внутри транзакции;
- template блокируется `FOR UPDATE` и после lock повторно проверяется тем же
  scoped predicate;
- новый или target Store должен быть active и принадлежать tenant/scope;
- `STORES` не может создать global template;
- launch разрешён только из `ACTIVE` template;
- store-bound template создаёт задачу только в собственном Store;
- общий materializer повторно применяет task status, store/shift consistency,
  participant и role-specific creation policy;
- task всегда начинает с `OPEN`;
- assignee, observers, task audit и system notification записываются в той же
  транзакции;
- массивы пользовательских тегов template сохраняются для single assignment,
  а grouped assignment требует object labels и не теряет данные молча;
- UI разрешает launch только для `ACTIVE`, фиксирует Store bound-template и
  передаёт `observerUserIds`.

## 4. Каталожный audit

Добавлена append-only application table `StaffTaskCatalogAuditEvent`:

- `tenantId`, `actorUserId`;
- `entityKind = TEMPLATE | RULE`;
- `entityId`, `action`, `effectiveStoreId`;
- список изменённых полей;
- безопасные `beforeState/afterState` только для `status/storeId`;
- `releaseSha`, `reasonCode`, `createdAt`.

В audit не записываются title, description, email, телефон или participant
lists. Create/update/activate/archive и template launch записываются атомарно с
domain mutation. Для global-template launch `effectiveStoreId` содержит
фактический Store задачи, даже если `template.storeId = null`.

Миграция содержит:

- check constraints для `entityKind` и `action`;
- индексы `(tenantId, createdAt)`,
  `(entityKind, entityId, createdAt)` и `(actorUserId, createdAt)`;
- tenant cascade и actor `SET NULL`.

Текущий retention contract сознательный: удаление actor сохраняет event и
обнуляет actor ID; удаление tenant каскадно удаляет его audit. До production
cutover этот контракт должен быть согласован с общей retention/offboarding
политикой.

## 5. Проверки checkpoint

Подтверждено локально:

- Prisma schema validation и client generation — pass;
- clean PostgreSQL schema: 156/156 migrations — pass;
- latest migration:
  `20260727120000_staff_task_catalog_audit_expand`;
- catalog audit constraint/retention smoke — 5/5 pass;
- real PostgreSQL task security race/rollback — 3/3 pass;
- focused API — 24 suites, 341/341 tests — pass;
- full API — 77 suites, 1 565 pass, 2 todo (1 567 total) — pass;
- template/catalog/materializer/users targeted suites — pass;
- API и web production typecheck — pass;
- API boundary lint и targeted web lint — pass;
- API production build — pass;
- web webpack production build — 203 pages — pass;
- независимый read-only review не нашёл прямого tenant/store escape в template
  CRUD/launch.

Изолированная тестовая PostgreSQL schema имеет префикс `staff_task_test_`.
Production и рабочая `public` schema не изменялись.

## 6. Известные остатки и статус

### P1 — блокирует повышение всего catalog slice

1. Recurring create/update/activation пока не использует тот же template lock.
   Возможна phantom race с archive/rebind template.
2. Recurring HTTP остаётся tenant-wide и может обходить новый materializer.
3. In-process scheduler пока не имеет tenant entitlement, durable lease/fence,
   stale reclaim и безопасный system execution context.
4. Participant `User/UserStoreAccess` references проверяются авторитетно, но
   ещё не блокируются до task create; параллельный revoke требует lock/recheck
   либо reconciliation.
5. Архивирование template неактивного Store требует отдельной lifecycle
   политики: archive должен быть возможен, launch/create/rebind — запрещены.

### P2

- materializer должен принимать уже заблокированный source contract либо сам
  валидировать source IDs перед подключением recurring caller;
- catalog launch audit не хранит task ID напрямую; связь восстанавливается
  через `StaffTask.sourceTemplateId` и task audit;
- denied attempts и `reasonCode` ещё не используются;
- UI должен автоматически выбирать allowed Store для STORES actor, фильтровать
  assignee/observers по выбранному Store и скрывать inactive options;
- нужны frontend interaction и production-like A1/A2/B browser tests.

Итоговый статус:

```text
templates CRUD/launch = IMPLEMENTED_CANDIDATE
direct tasks           = IMPLEMENTED_CANDIDATE
recurring HTTP         = NO-GO
scheduler              = NO-GO
external beta          = NO-GO
```

## 7. Rollout и rollback

Миграция — additive EXPAND: новая таблица не меняет существующие task/template
rows и игнорируется N-1 приложением. Рекомендуемый порядок:

1. immutable candidate artifact и exact SHA;
2. backup/restore evidence;
3. `prisma migrate deploy` с session lock/statement timeouts;
4. проверка count/latest/constraints/indexes;
5. deployment приложения;
6. catalog audit smoke и scoped template smoke;
7. canary только внутренней сети.

До появления audit writer новый код нельзя запускать против схемы без таблицы.
При application rollback таблица остаётся: N-1 её игнорирует. Удалять таблицу в
аварийном rollback не требуется; schema contraction выполняется только
отдельной согласованной миграцией.

## 8. Следующий обязательный срез

1. Actor-scoped recurring list/create/update/manual launch/run-due.
2. Общий template lock protocol и safe source contract.
3. Явно выключенный scheduler по умолчанию.
4. Отдельный `SYSTEM` execution context, lifecycle/entitlement gate.
5. Durable lease/fencing, heartbeat, retry/dead-letter и stale reclaim.
6. Real PostgreSQL races: rule activation vs template archive, scope/participant
   revoke, duplicate worker и rollback без half-state.

До выполнения пунктов 1–3 scheduled activation запрещена независимо от
наличия общего `SYNC_SERVICE_TOKEN`.
