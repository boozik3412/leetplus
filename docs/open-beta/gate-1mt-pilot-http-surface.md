# Gate 1MT: HTTP-поверхность первого внешнего tenant

Статус: `PARTIAL IMPLEMENTATION / PILOT NO-GO`.

Этот документ и
`apps/api/src/tenancy/pilot-http-surface-manifest.ts` фиксируют полную HTTP-поверхность
модулей, согласованных для первого внешнего клуба:

- `GAMIFICATION` — B2B workspace, правила, миссии, Battle Pass, lootboxes,
  rewards/ledger/deliveries и public guest journey;
- `ASSORTMENT` — dashboard, товары, категории, поставщики, клубы, отчёты,
  импорт и parser;
- `STAFF` — контроль, мотивация, регламенты, checklists, задачи, обучение,
  база знаний, дисциплина, зарплатное планирование и shift workspace;
- `COMMUNICATIONS` — team chat, notifications и CRM contact tasks;
- `USERS_ROLES` — пользователи, роли и делегирование `NETWORK \| STORES`
  только внутри tenant.

Manifest не является runtime-allowlist и сам по себе не разрешает внешний доступ.
`ALLOW` означает только наличие подтверждённой реализации соответствующего slice.
Остальные Gate 1MT/Gate 2 и итоговый `SHARED BETA GO` остаются обязательными.

## 1. Fail-closed store scope

`FreshStoreScopeService` теперь является единой authority для переведённых
assortment read paths. Перед бизнес-запросами он:

1. требует аутентифицированного tenant-пользователя и запрещает platform admin;
2. читает из PostgreSQL только узкую проекцию `User`, tenant slug и
   `UserStoreAccess -> Store.tenantId` по составному ключу `(tenantId, id)`;
3. повторно валидирует persisted `NETWORK | STORES` через `AccessScopeService`;
4. требует точного совпадения fresh DB scope со scope, сформированным guard;
5. запрещает отсутствующий пользователь, inactive/platform subject, пустой
   `STORES`, duplicate store rows и cross-tenant store relation;
6. для `STORES` всегда возвращает непустой `allowedStoreIds` и не позволяет
   query/bulk filter выйти за его пределы;
7. для `NETWORK` разрешает все клубы только своего tenant, а явные store IDs
   дополнительно подтверждает tenant-scoped запросом к `Store`;
8. запрещает пустые, whitespace-only и duplicate explicit filters;
9. повторно читает системную роль, привязку custom role и tenant role override,
   вычисляет effective capabilities из PostgreSQL и требует их точного
   совпадения с guard-produced authority;
10. при отзыве роли, custom role, capability или store scope отклоняет старый
    JWT до чтения или изменения бизнес-данных.

Отсутствие фильтра не расширяет `STORES`: оно означает весь fresh allow-list.
`null` («все клубы tenant») может получить только fresh `NETWORK` subject.
Demo fallback и optional-auth в переведённых read methods отсутствуют.

## 2. Поля manifest

| Поле                     | Значение                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `module` / `entitlement` | Один из пяти согласованных product modules                               |
| `capability`             | Фактическая capability `RolesGuard`, `guest_session` или `service_token` |
| `minimumScope`           | `NETWORK` либо `STORES`                                                  |
| `storeFilter`            | `REQUIRED` либо `NOT_APPLICABLE`                                         |
| `effect`                 | `READ`, `TENANT_WRITE` либо `OUTBOUND`                                   |
| `principal`              | tenant operator, guest session либо internal service token               |
| `decision`               | `ALLOW` либо fail-closed `BLOCKED`                                       |
| `gaps`                   | Причины блокировки в текущем срезе                                       |

## 3. Реализованный assortment slice

Manifest разрешает ровно 26 `ASSORTMENT READ` handlers:

- store-scoped: `GET /dashboard/summary`,
  `GET /dashboard/revenue-diagnostics`;
- store-scoped: `GET /products`, `GET /products/:id`,
  `GET /products/summary`, `GET /products/catalog`;
- store-scoped: `GET /stores`;
- store-scoped: все read-only reports и export, кроме network-only
  `GET /reports/oos-exclusions`;
- network-only: `GET /categories`, `GET /categories/langame/overview`,
  `GET /suppliers`, `GET /imports`, оба product-parsing overview и
  `GET /reports/oos-exclusions`.

Dashboard, product facts, inventory, sales, movements, guest revenue sources,
report rows и store selectors получают обязательный effective store filter.
Store-scoped dashboard не использует network-wide business snapshot fallback.
Query `storeId`/`storeIds` сначала проходит fresh authority и только затем
попадает в Prisma selectors.

Категории, поставщики, import history, parsing state и OOS exclusions не имеют
надёжного store ownership в текущей схеме. Поэтому они намеренно доступны
только fresh `NETWORK`, а не `STORES` пользователю.

Дополнительно разрешён ровно 31 `ASSORTMENT TENANT_WRITE` handler только для
fresh `NETWORK` subject:

- create/update/archive товаров и массовое назначение категории;
- create/update/delete/merge категорий и preview/apply Langame mapping;
- create/update/archive поставщиков;
- preview/apply CSV imports товаров, остатков, продаж и движений;
- create/delete OOS exclusions и изменение recommendation state;
- analyze/apply/reject product parsing suggestions и create/update manual group.
- update/archive существующих клубов; сокращённая ссылка Яндекс Карт сначала
  должна пройти отдельный outbound-preview и больше не разрешается из mutation path.

Для каждой такой route AST-проверка связывает HTTP handler с точным service
method и требует `await this.freshStoreScopeService.assertNetwork(user)` до
tenant mutation. Обычное создание клуба внешним `PILOT/BETA/LIVE` tenant
runtime-запрещено до отдельного provisioning/quota workflow; любой outbound
этим slice также не разрешён.

Внутренний B2B-кабинет геймификации и загрузка игровых media получили
переходный fail-closed boundary: ровно 77 non-outbound handlers доступны только
fresh `NETWORK` subject. Guard повторно читает persisted scope из PostgreSQL;
`STORES`, stale JWT и platform subject отклоняются. Это открывает полный
in-app контур владельцу тестовой сети, но пока не объявляет готовыми
store-scoped operator access, public guest journey, Telegram и scheduled jobs.

Staff-контур расширен до 83 из 84 handlers. Ровно 55 ранее legacy-маршрутов
контроля, мотивации, регламентов, чек-листов, обучения, базы знаний,
дисциплины и shift workspace получили `FreshNetworkScopeGuard`; вместе с 23
ранее принятыми маршрутами и 5 salary handlers они доступны владельцу/
менеджменту сети. Salary намеренно остаётся NETWORK-only: его legacy service
ещё не умеет безопасно выдавать period rows по `STORES`. Единственный blocked
staff handler — internal scheduled execution; store-scoped доступ к 60
NETWORK-only routes остаётся fail-closed.

CRM contact-task surface теперь отделена от полного guest CRM и привязана к
модулю/entitlement `COMMUNICATIONS`. Открыты ровно восемь handlers:

- read: список задач, report, export, assignee users и contact events — только
  с `view_communications`;
- write: create task/contact event и update task — только с
  `manage_communications`.

Каждый из восьми handlers повторно проверяет persisted authority через
`FreshNetworkScopeGuard`; tenant selectors включают `tenantId`, а update
повторяет `tenantId` непосредственно в mutation predicate. У `GuestCrmTask` и
`GuestCrmContactEvent` пока нет надёжного `storeId`, поэтому `STORES` subject
намеренно получает `403`, а не tenant-wide данные. `/guests/crm/leads`, полная
guest analytics и неверные HTTP-методы не наследуют этот policy. Внешние
provider/outbound эффекты этим slice не открыты.

## 4. Текущий snapshot

Manifest содержит 294 handler:

| Module           |   Всего | Прошли этот slice | Заблокированы |
| ---------------- | ------: | ----------------: | ------------: |
| `ASSORTMENT`     |      66 |                57 |             9 |
| `COMMUNICATIONS` |      18 |                18 |             0 |
| `GAMIFICATION`   |     117 |                77 |            40 |
| `STAFF`          |      84 |                83 |             1 |
| `USERS_ROLES`    |       9 |                 5 |             4 |
| **Итого**        | **294** |           **240** |        **54** |

Все 21 `OUTBOUND`, public guest и internal scheduled handlers остаются
заблокированными для внешнего tenant.

Все восемь исполнимых `USERS_ROLES` service paths теперь проходят fresh
PostgreSQL re-attestation до business query/mutation. Чтение пользователей и
четыре legacy user/invite mutation используют fresh `NETWORK | STORES` scope;
три операции настройки custom/system roles дополнительно требуют fresh
`NETWORK`. Прямой `POST /users` остаётся немедленно fail-closed и не выполняет
DB query: учётные записи должны появляться только через email-bound invite.
Четыре invite HTTP routes всё ещё имеют решение `BLOCKED` до принятия
CURRENT189 delivery/revoke/reissue, поэтому snapshot `5/9` не изменён.

Web BFF candidate отдельно фиксирует семь route-файлов и ровно девять
handlers users/roles. Каждый path получает авторизацию только через server-side
cookie boundary, не принимает client `Authorization`/tenant selector, не
использует authenticated cache, а динамические user/invite/role IDs передаёт
только после `encodeURIComponent`. Invite responses остаются
`private, no-store`; CURRENT189 imports отсутствуют до атомарного cutover.
Локальный BFF gate: `4/4 PASS`; exact-SHA CI acceptance ещё обязательна.

## 5. Оставшиеся blocking gaps

Counts пересекаются: один handler может иметь несколько gaps.

| Gap                                                    | Handler count | Что требуется                                                         |
| ------------------------------------------------------ | ------------: | --------------------------------------------------------------------- |
| `STORE_SCOPE_NOT_ENFORCED_WITH_ALLOWED_STORE_IDS`      |             2 | Перевести оставшиеся selectors/mutations на fresh authority           |
| `PUBLIC_TENANT_ENTITLEMENT_ROUTE_UNCLASSIFIED`         |            31 | Отдельная public gamification entitlement policy                      |
| `PUBLIC_STORE_BINDING_NOT_ATTESTED`                    |            31 | Доказать tenant/store binding guest session, Telegram и media         |
| `NETWORK_SCOPE_NOT_ASSERTED`                           |            10 | Добавить fresh `assertNetwork()` до query/mutation/outbound           |
| `OUTBOUND_DEFAULT_OFF`                                 |            21 | Оставить OFF до отдельного audited store canary workflow              |
| `INTERNAL_SERVICE_ROUTE_NOT_AVAILABLE_TO_TENANT_USERS` |             7 | Сохранить service-token admission и tenant-aware worker identity      |
| external invite gaps                                   |      4 routes | Завершить verified delivery/revoke/reissue без raw URL/token response |

## 6. Намеренно заблокированные assortment surfaces

- create клуба: runtime-запрещён внешним tenant до lifecycle/quota workflow;
  update/archive уже требуют fresh NETWORK и tenant-scoped lookup;
- category Langame refresh, DaData/Yandex GET/POST и email/digest outbound;
- scheduled digest service-token route;
- store-scoped доступ к network-owned справочникам и history без store relation;
- любая новая route, пока она не появилась в manifest и не получила отдельные
  behavior/integration evidence.

Ни одна outbound route этим slice не открыта.

## 7. Автоматические проверки

`pilot-http-surface-manifest.spec.ts` строит фактический controller inventory
через TypeScript AST и падает при missing/stale/duplicate route, неизвестной
capability, расхождении с tenant HTTP policy или незакрытом outbound.
Отдельные assertions фиксируют точные списки 26 разрешённых assortment reads и
31 NETWORK-only mutation, запрещают outbound и требуют точной связи каждой
mutation с fresh NETWORK assertion в её service method.
Ещё один exact assertion фиксирует 77 NETWORK-only in-app gamification
handlers и запрещает смешать с ними public, service-token или outbound route.
Отдельный users/roles assertion связывает все восемь non-direct service paths
с `FreshStoreScopeService.resolve/assertNetwork`, а direct create сохраняет
нулевой data-access fail-closed path. Focused fresh/users/manifest gate:
`4 suites / 73 tests`.
Отдельная route-to-guard проверка фиксирует 60 NETWORK-only staff routes и не
позволяет включить scheduled execution или CRM widening. Ещё 23 ранее
разрешённых STAFF и 10 COMMUNICATIONS routes теперь также обязаны иметь
`FreshStoreScopeGuard`, поэтому stale JWT больше не считается достаточной
authority для задач, файлов, directory, team chat и notifications.

Отдельный CRM communications gate фиксирует ровно восемь NETWORK-only routes,
их exact `COMMUNICATIONS` entitlement и `view_communications`/
`manage_communications` capability, отсутствие provider calls и tenant-bound
read/target/update predicates. Он также доказывает, что broad CRM leads не
попали под это исключение.

Для team chat одной controller-проверки оказалось недостаточно: legacy service
после guard повторно строил channel/message selectors из JWT-копии scope.
Теперь все семь tenant-user service paths (`getReport`, live SSE state,
create channel/message, attachment authorization, update message и mark read)
сами вызывают `FreshStoreScopeService` до первого Prisma access. Явный
`storeId` в report/SSE проходит `resolveRequestedStoreIds`, а возвращённые БД
`tenantId/mode/allowedStoreIds` используются во всех channel, message, store и
user predicates. Отказ или stale scope останавливает запрос до создания
default channel и до любого chat query/mutation. Internal system notification
producers этим slice не открывались и остаются вне tenant-user admission.

`fresh-store-scope.service.spec.ts` покрывает:

- NETWORK и STORES;
- cross-tenant relation и cross-store/cross-tenant query filters;
- пустой или malformed scope;
- stale guard-to-DB scope (TOCTOU);
- inactive/missing/platform subject;
- duplicate и empty bulk IDs.

Web BFF имеет отдельный fail-closed inventory. Он фиксирует `130` route-файлов
и `158` HTTP handlers пилотных B2B/supporting-integration proxy, требует для
каждого либо общий authenticated proxy, либо явный cookie-to-Bearer admission с
локальным `401`, и запрещает `force-cache`/public cache на защищённых данных.
Inventory закреплён SHA-256
`ec4c892f14bb5db02ac1f35691723cbd002f7a4f6b7a4985b3cb8060bda580d1`.
На всём `/api/:path*` добавлены defensive `private, no-store`, `Vary:
Cookie, Authorization`, `nosniff`, `no-referrer` и same-origin resource policy.
Публичный игровой BFF пока отдельно зафиксирован ровно двумя boundaries:
`guest-portal/[...path]` и legacy media `GET`; это inventory, а не разрешение
пилота — legacy media остаётся блокирующим gap до CURRENT190 wiring.

Browser transport уже ужесточён отдельно от promotion CURRENT190: auth/select
ответы больше не возвращают guest JWT в доступное JavaScript поле `token`;
токен остаётся только в `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie с
предельным сроком один час. BFF выставляет `private, no-store`, а Telegram
club-select после handoff читает summary по cookie, не по bearer из response
body. Focused transport gate: `2/2 PASS`. Это устраняет утечку токена через
browser JSON, но не открывает guest routes: server-side persisted revoke при
logout, bearer admission всех защищённых методов и tenant-scoped media всё ещё
обязательны в CURRENT190 wiring.

Focused gate (`pilot-bff-boundary`: `4/4`, guest transport: `2/2`):

```powershell
pnpm --filter api test:ci:pilot-http-surface
pnpm --filter api test:ci:pilot-crm-communications
pnpm --filter web test:pilot-bff-boundary
pnpm --filter web test:users-roles-bff-boundary
pnpm --filter web test:guest-session-transport
```

Локальный manifest-прогон текущего candidate: `15 suites / 159 tests`; CRM communications gate:
`6 suites / 162 tests`; отдельный team-chat service прогон:
`1 suite / 21 tests`. Focused ESLint и API production typecheck также проходят.

Real PostgreSQL Gate 1MT fixture:

```powershell
pnpm --filter api test:integration:pilot-assortment-store-scope:pg
pnpm --filter api test:integration:pilot-team-chat-fresh-scope:pg
$env:PILOT_CRM_COMMUNICATIONS_PG_CONFIRM = 'run-pilot-crm-communications-postgres-fixtures'
pnpm --filter api test:integration:pilot-crm-communications:pg
$env:PILOT_USERS_ROLES_PG_CONFIRM = 'run-pilot-users-roles-postgres-fixtures'
pnpm --filter api test:integration:pilot-users-roles:pg
```

На exact CURRENT179 disposable PostgreSQL fixture принят `1 suite / 3 tests`:
A1 store subject видит только A1, A NETWORK — A1/A2, B NETWORK — только B1;
cross-store/cross-tenant filters, STORES write и stale NETWORK JWT отклоняются,
update/archive клуба требуют fresh NETWORK, Tenant B не меняет Store A,
а внешний PILOT не создаёт B2 в обход provisioning. Финальный fixture residue:
`0 tenants / 0 integration users`.

Отдельная exact CURRENT179 team-chat fixture принята: `1 suite / 3 tests`.
Она проверяет A/A1/A2↔B/B1 report и SSE reads, create/update/read-receipt
mutations, cross-tenant/cross-store IDOR и stale JWT. Fresh denial происходит
до создания default channel или сообщения; финальный residue равен
`0 tenants / 0 users / 0 fixture messages`.

Отдельная exact CURRENT179 CRM communications fixture принята:
`1 suite / 4 tests`. Через реальные `FreshNetworkScopeGuard` и `GuestsService`
она проверяет все восемь contact-task service paths для A/A1/A2↔B/B1:
tenant-isolated task/report/export/user/event reads, create/update, cross-tenant
guest/task targets, полный fresh `STORES` deny и stale `NETWORK -> STORES`
deny до mutation. Tenant predicates не подменяются; финальный residue равен
`0 tenants / 0 users / 0 fixture tasks / 0 fixture events`.

Отдельная exact CURRENT179 users/roles fixture принята на SHA
`f26dbb1612e4e86a1d6ee7254b5d4812bdae31a7`, CI `31641457556`:
`1 suite / 4 tests`, без fail/skip. Она проверяет `NETWORK`/`STORES`
inventories, user/custom-role/system-role mutations для A/A1/A2↔B/B1 и
отклоняет stale role/effective-capability authority до business effect. SHA-bound
artifact: `9159307294`, digest `sha256:1c79f2a3…cef5408`.

## 8. Следующая последовательность

1. Расширить принятую real PostgreSQL A/A1/A2 ↔ B/B1 matrix с assortment,
   team chat и CRM contact tasks на остальные pilot modules и browser/BFF.
2. Реализовать отдельный store-create provisioning/quota workflow; обычный
   внешний create уже закрыт, outbound оставить OFF.
3. Перевести gamification со временного NETWORK-only на корректный STORES
   scope, затем отдельно public guest-session binding.
4. Перевести 60 NETWORK-only staff routes (включая salary) на корректный
   STORES scope; добавить store-binding модель для CRM contact tasks и только
   затем разрешать их `STORES` subject; завершить employee invites.
5. Выполнить production-like browser/BFF rehearsal, apply/rollback/zero-diff и
   только после этого рассматривать `SHARED BETA GO`.

Production, текущая сеть из четырёх клубов и данные/e-mail внешнего тестера этим
slice не изменялись.
