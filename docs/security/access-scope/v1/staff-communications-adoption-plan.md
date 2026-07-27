# AccessScope v1: план внедрения для персонала и коммуникаций

| Поле | Значение |
|---|---|
| Статус | `INVENTORY` |
| Дата | 27.07.2026 |
| Версия контракта | 1.0.0 |
| Область | staff, attachments, team chat, notifications |
| Исходный baseline | `eb7ad9ef7d4783c47a7ddb5efbc271e5eb8a2fe2` |
| Связанный backlog | `BETA-SEC-003`, `BETA-SEC-006`, `BETA-MOD-STAFF-001..011`, `BETA-MOD-COMMS-001..005` |

Документ фиксирует текущие поверхности и обязательные изменения для принятия
`AccessScope` модулем персонала и коммуникаций. Он не подтверждает наличие
реализации, production enforcement или готовность к внешнему тесту.

Нормативный источник правил — [AccessScope contract v1](./access-scope-contract.md).
Авторитетная область доступа должна разрешаться из актуального состояния БД на
каждом запросе: `NETWORK` либо `STORES` с явным `allowedStoreIds`.
Отсутствующий или пустой `STORES` scope не повышается до `NETWORK` и
обрабатывается fail-closed.

## Инвентаризация поверхностей

| ID | Surface и точные пути | Текущий риск | Required change | Обязательные tests |
|---|---|---|---|---|
| STAFF-COMMS-01 | Generic attachments: `apps/api/src/staff/staff-attachments.controller.ts`; `apps/api/src/staff/staff-attachments.service.ts`; `packages/database/prisma/schema.prisma` (`StaffAttachment`, `StaffChatMessageAttachment`); `apps/web/src/app/api/staff/attachments/route.ts`; `apps/web/src/app/api/staff/attachments/[id]/route.ts`; `apps/web/src/lib/proxy.ts` | Download ищет файл только по `id + tenantId`; известный UUID открывает файл любому staff-пользователю tenant. У файла нет универсальной связи с store и parent resource. Pending/orphan upload не имеет TTL. Доверенный MIME и `inline`-выдача создают дополнительный риск active content; BFF не фиксирует private/no-store response policy. | Ввести attachment-to-resource ACL/link с `resourceKind`, `resourceId`, производным store/audience и tenant invariant. Pending upload доступен только uploader, имеет TTL и становится общим только после транзакционной привязки к доступному parent. Download каждый раз проверяет parent через `AccessScope`, на deny отвечает `404`. Добавить `Cache-Control: private, no-store`, `Vary`, `X-Content-Type-Options: nosniff`; опасные и неизвестные MIME отдавать как download. | Новый `apps/api/src/staff/staff-attachments.service.spec.ts`: own pending, accessible parent, A1→A2 deny, Tenant A→B deny, orphan deny, multiple parents, revoked scope. Real PostgreSQL migration/backfill smoke. API и BFF file IDOR tests, cache/header tests, unsafe MIME test. |
| STAFF-COMMS-02 | Channel list, direct lookup и SSE: `apps/api/src/staff/staff-team-chat.controller.ts`; `apps/api/src/staff/staff-team-chat.service.ts` (`getReport`, `getLiveState`, `buildAccessibleChannelWhere`, `resolveAccessibleChannel`, `getUserStoreIds`); `apps/web/src/app/api/staff/team-chat/route.ts`; `apps/web/src/app/api/staff/team-chat/events/route.ts` | Доступ к каналам выводится из роли и наличия строк `UserStoreAccess`. Некоторые роли видят все каналы независимо от persisted mode; пустой список может означать все store-каналы. Report возвращает tenant-wide store/user options. Те же ошибки попадают в SSE и channel stats. | Разрешать один актуальный `AccessScope` на вызов и строить единый channel predicate для list, direct UUID, live state, stats и SSE. `STORE`-канал доступен только для allowed store. `STORES[]` не получает каналов. Правило для `NETWORK`/`ROLE` audience должно быть явным; membership не расширяет business scope. Store/user options фильтруются тем же scope. Scope перечитывается на каждом SSE poll. | Новый `apps/api/src/staff/staff-team-chat.service.spec.ts`: `NETWORK`, `STORES[A1]`, `STORES[]`, A1/A2/B channels, direct UUID `404`, stats parity, SSE/live-state parity, scope revoke со старым JWT. API/BFF reconnect test для `/staff/team-chat/events`. |
| STAFF-COMMS-03 | Message list, stats, writes и read receipts: `apps/api/src/staff/staff-team-chat.service.ts` (`createMessage`, `updateMessage`, `markRead`, `buildMessageAudienceWhere`, `buildMessageWhere`, `buildChannelStats`, `normalizeMessageData`, `resolveMessageId`, `resolveStoreId`); BFF routes under `apps/web/src/app/api/staff/team-chat/messages/` and `apps/web/src/app/api/staff/team-chat/read/route.ts` | Message audience в основном учитывает knowledge article, но не гарантирует пересечение `StaffChatMessage.storeId` с actor scope. Клиент может передать tenant-valid store, не входящий в scope, либо override store store-канала. Direct update сначала находит tenant-wide UUID; counts/latest/unread могут раскрывать запрещённые сообщения. | Добавить message predicate во все list/count/latest/unread/read/update запросы. В `STORE`-канале message store неизменно равен store канала; client override отклоняется. Direct mutation проверяет текущий и будущий scope, deny маскируется как `404`. Pin/edit требуют отдельного action permission. Unscoped сообщение допускается только по явно документированной audience policy. | Расширить `staff-team-chat.service.spec.ts`: A1 не читает и не считает A2 message в network/custom channel; create/update store override deny; mark-read чужого UUID deny; unread/latest parity; current/next scope mutation; pin permission; stale JWT после revoke. |
| STAFF-COMMS-04 | Custom members, mentions и recipients: `apps/api/src/staff/staff-team-chat.service.ts` (`createChannel`, `resolveChannelMemberUserIds`, `resolveMentionedUserIds`, `normalizeChannelData`, создание `StaffNotification` для mentions) | Member и mentioned user проверяются как любой active user tenant. Store actor может выбрать пользователя другого клуба, создать tenant-global channel либо сгенерировать notification за пределами scope. Tenant-wide user picker облегчает перечисление аккаунтов. | Создание `NETWORK`, `ROLE` и cross-store `CUSTOM` channel требует `NETWORK` и соответствующей capability. Store actor выбирает только пользователей, чей effective scope пересекается с его allowed stores и разрешённой audience канала. Mention не создаёт receipt/notification, пока target не прошёл те же проверки. Custom membership само по себе не даёт доступ к store-bound данным или файлам. | `staff-team-chat.service.spec.ts`: cross-store member/mention deny, network-only channel creation, same-store custom allow, member removal/revoke, notification not created on deny, membership does not expose A2 attachment/message to A1. |
| STAFF-COMMS-05 | Shift report draft/send как producer chat и attachments: `apps/api/src/staff/staff-shift-reports.controller.ts`; `apps/api/src/staff/staff-shift-reports.service.ts`; BFF routes under `apps/web/src/app/api/staff/shift-reports/` | Draft и send принимают tenant-valid shift/store без общего actor scope. Fallback lookup может повторно искать смену без store constraint. Это раскрывает финансовые данные смены другого клуба и создаёт store-tagged сообщение в network reporting channel. Attachment связывается с message без универсального attachment ACL. | Draft ограничивается allowed stores; employee дополнительно видит только собственную назначенную смену. Requested store/shift проходят явную проверку и должны быть согласованы; fallback без store запрещён. Send проверяет store, shift и reporting audience, а attachment link создаёт в той же транзакции, что message. | Новый `apps/api/src/staff/staff-shift-reports.service.spec.ts`: own shift, A1→A2/B deny, mismatched store/shift deny, null-store actor deny, financial draft isolation, transactional attachment binding, reporting message visibility. |
| STAFF-COMMS-06 | Staff directory, Langame identity, PII и mutations: `apps/api/src/staff/staff-directory.controller.ts`; `apps/api/src/staff/staff-directory.service.ts`; BFF routes under `apps/web/src/app/api/staff/directory/` | Directory возвращает tenant-wide members, stores, user accounts, legacy mappings и Langame users, включая PII, compensation и external identity. Active-shift lookup, create и update проверяют только tenant; store-scoped manager может читать или изменять сотрудника другого клуба и назначить чужой либо null store. | Пересекать rows, summary, selectors, legacy mappings и Langame domains с actor scope до формирования ответа. Explicit forbidden store filter даёт `403`; чужой member UUID — `404`. Mutation проверяет current и next store, user target и external identity. `storeId=null`, network staff и cross-store reassignment требуют `NETWORK`. PII projection и reveal остаются отдельной capability/policy. | Новый `apps/api/src/staff/staff-directory.service.spec.ts`: list/summary/options A1-only, PII projection, A1→A2 active shifts deny, direct update `404`, move A1→A2/null deny, network allow, ambiguous Langame domain deny. PostgreSQL/API/browser IDOR tests. |
| STAFF-COMMS-07 | Tasks, export, comments/evidence и task-from-chat: `apps/api/src/staff/staff-tasks.controller.ts`; `apps/api/src/staff/staff-tasks.service.ts`; `apps/api/src/staff/staff-tasks.service.spec.ts`; BFF routes under `apps/web/src/app/api/staff/tasks/`; `apps/web/src/components/staff-team-chat-workspace.tsx` | Base query, summary, quick views, groups, user/store options и export могут быть tenant-wide. Direct update/comment lookup проверяет tenant, а store/shift/assignee resolvers не гарантируют subset actor scope. Task-from-chat может отправить network либо чужой store. Evidence URL не является авторитетной attachment link. | Добавить `AccessScope` во все list/detail/aggregate/export predicates. Tenant-global task доступна `STORES` actor только через документированное personal assignment/observer правило; tenant-global create требует `NETWORK`. Create/update проверяют task store, shift store, assignees, observers и current/next resource. Task-from-chat использует те же server-side проверки. Internal evidence attachment привязывается к task/comment resource. | Расширить `staff-tasks.service.spec.ts`: list/summary/export parity, direct UUID `404`, A1→A2/null create/update deny, shift mismatch, assignee/observer subset, personal task exception, task-from-chat payload, evidence bind/download. API/BFF export and IDOR tests. |
| STAFF-COMMS-08 | Notifications, acknowledge/resolve и interactive sync: `apps/api/src/staff/staff-notifications.controller.ts`; `apps/api/src/staff/staff-notifications.service.ts`; BFF routes under `apps/web/src/app/api/staff/notifications/` | Visibility учитывает tenant и target user, но untargeted Store B notification может быть видна и изменяема Store A actor. Store options tenant-wide. Каждый report запускает tenant-wide signal sync; interactive sync возвращает общесетевые counts и может resolve/update объекты вне actor scope. | List, summary, direct acknowledge/resolve пересекаются с notification store scope; персонально targeted exception описывается отдельно и не расширяет связанные resources. Tenant-wide generation переносится в system/worker или разрешается только `NETWORK`. Если scoped interactive sync сохраняется, он не читает, не обновляет и не помечает stale объекты вне allowed stores. | Новый `apps/api/src/staff/staff-notifications.service.spec.ts`: untargeted A1/A2 isolation, personal target policy, direct mutation `404`, scoped summary/options, sync cannot touch A2, network/system sync, duplicate/stale behavior, suspend/revoke. |
| STAFF-COMMS-09 | Operations dashboard и aggregate source для notifications: `apps/api/src/staff/staff-operations-dashboard.controller.ts`; `apps/api/src/staff/staff-operations-dashboard.service.ts` | Tasks, checklists, shifts, stores, users и readiness выбираются tenant-wide, если клиент не передал filter; переданный store не проверяется как allowed. Итоговые ratings/anomalies и masked guest data считаются до store isolation и затем используются notifications. | Передавать `AccessScope` во все source where builders и downstream readiness. Requested store/user пересекается с actor scope до query. Сначала фильтруются source rows, затем считаются totals, ratings и anomalies. Actor endpoint отделяется от system-only `getCurrentStaffControlSignals`; внутренний path получает явный system execution context. | Новый `apps/api/src/staff/staff-operations-dashboard.service.spec.ts`: A1 source filtering before totals, explicit A2 filter `403`, no A2 users/stores, readiness parity, notification signal parity, network totals unchanged. Real PostgreSQL aggregate reconciliation test. |

## Caveat: backfill attachment links

Strict download нельзя включать до инвентаризации существующих внутренних
ссылок. Сейчас один `StaffAttachment` может быть связан с ресурсом несколькими
способами:

- нормализованная relation `StaffChatMessageAttachment` в
  `packages/database/prisma/schema.prisma`;
- `StaffTaskComment.evidenceUrl` и связанные записи из
  `apps/api/src/staff/staff-tasks.service.ts`;
- checklist evidence и review-thread attachments, хранящиеся в JSON и
  нормализуемые в `apps/api/src/staff/staff-checklists.service.ts`;
- regulation attachments в JSON из
  `apps/api/src/staff/staff-shift-regulations.service.ts`;
- knowledge materials в JSON из
  `apps/api/src/staff/staff-knowledge-base.service.ts`;
- shift report attachments, которые в итоге связываются с chat message.

Backfill должен:

1. Работать сначала в dry-run и разбирать только собственные relative/absolute
   URL вида `/staff/attachments/:id` и `/api/staff/attachments/:id`.
2. Проверять совпадение tenant файла и parent resource.
3. Создавать отдельную link для каждого parent и наследовать store/audience
   parent, не выводя `NETWORK` из отсутствия store.
4. Не считать external `http(s)` URL внутренним файлом.
5. Помещать unresolved, conflicting и orphan attachments в quarantine:
   uploader-only с TTL, без неявного network-доступа.
6. Сохранять исходный blob и legacy reference до завершения reconciliation и
   rollback window.
7. Разрешать strict download только после отчёта с нулём необъяснённых active
   references либо после явного решения об их quarantine.

Простой nullable `storeId` на `StaffAttachment` недостаточен: один файл может
быть связан с несколькими parent resources и разными audiences. Авторизация
должна выполняться через доступный parent, а не через uploader, имя файла или
угадываемый URL.

## Минимальный безопасный порядок внедрения

1. Завершить и проверить общий persisted `AccessScope`: актуальное чтение из БД,
   fail-closed режимы, helpers для explicit filter `403` и direct resource
   `404`.
2. Добавить attachment link/ACL schema, tenant invariants, индексы, dry-run
   scanner и идемпотентный backfill. Не включать strict download.
3. Принять `AccessScope` в team chat: сначала channel/list/direct/SSE, затем
   messages/stats/read receipts и после этого membership/mentions.
4. Связать chat attachments с message resource транзакционно, выполнить
   reconciliation и только затем включить deny-by-default download.
5. Закрыть shift reports как producer store-bound chat messages и attachments.
6. Закрыть directory, затем tasks/export/comments/task-from-chat; backfill
   соответствующих attachment references.
7. Закрыть notifications и operations dashboard единым набором predicates,
   отделив actor calls от system/background execution.
8. Выполнить real PostgreSQL и API/BFF suite на topology двух tenant и минимум
   двух stores в каждом, затем browser/SSE/file regression.
9. Сохранить evidence с exact release SHA. Только после review evidence строки
   module adoption matrix могут менять `INVENTORY`.

## Exit criteria

План завершён только когда одновременно выполнены все условия:

1. Все девять surfaces разрешают актуальный `AccessScope` server-side и не
   используют роль, membership, creator, assignee либо client store filter как
   источник расширения доступа.
2. List, detail, counts, aggregates, mutations, export, file, background/system
   path и SSE применяют согласованные predicates.
3. Запрещённый explicit store filter возвращает `403`; direct foreign или
   out-of-scope UUID возвращает `404`.
4. `STORES[A1]` не читает, не считает, не изменяет и не скачивает A2/B;
   `STORES[]` не проходит аутентификацию; `NETWORK` не выходит за свой tenant.
5. Изменение или отзыв scope действует со старым JWT на следующем HTTP-запросе
   и следующем SSE poll.
6. Attachment backfill и reconciliation завершены; unresolved active
   references равны нулю либо явно quarantined; orphan URL не открывает файл.
7. Network totals до и после adoption совпадают; restricted totals равны сумме
   ровно allowed stores.
8. Unit, real PostgreSQL, API IDOR, BFF/file, browser и SSE tests зелёные.
9. Evidence содержит test names, migration/backfill report и exact release SHA,
   но не PII, production IDs, токены или secrets.
10. `STAFF-01..04` и `COMMS-01..02` не переходят в `VERIFIED` без отдельного
    review evidence. До общего Gate 2 из `OPEN_BETA_BACKLOG.md` внешний доступ
    остаётся `NO-GO`.
