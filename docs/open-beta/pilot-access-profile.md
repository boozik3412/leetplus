# Профиль доступа первой внешней когорты

| Поле | Значение |
|---|---|
| Profile key | `OPEN_BETA_FULL_OPERATIONS_V1` |
| Статус | Product contract; entitlement implementation pending |
| Выдача | Invite-only, отдельный Tenant на независимую сеть |
| Область | Собственная сеть или явно разрешённые клубы |

Этот профиль фиксирует обязательный продуктовый состав тестового доступа. Пока
единый entitlement engine не реализован, документ является контрактом для
route inventory, role matrix, provisioning и acceptance.

## Включено

### Геймификация

Полный B2B/B2C контур: rules, missions, Battle Pass, lootboxes, promo cards,
rewards, wallet, entitlements, ledger, deliveries, reconciliation, guest game,
Telegram Mini App и диагностика. Внешние bonus/reward writes включаются по
клубам только через `OFF → SHADOW → CANARY → LIVE`.

### Ассортимент и товары

Полный catalog и store facts: товары, карточка/история товара, категории,
suppliers, остатки, продажи, движения, OOS, matrix, рекомендации, reports,
exports, imports, parser, bulk operations, Langame sync и data-quality
diagnostics.

### Сотрудники

Полный контур: directory, задачи/templates/recurring, shift workspace/reports,
регламенты, checklist, knowledge base, обучение/onboarding/tests/assessment,
readiness, control, ratings, motivation, discipline, salary planning,
attachments/evidence/audit и локальный deterministic AI assistant.

Salary остаётся расчётным/плановым контуром без автоматической выплаты.
Motivation/discipline не выполняют внешних санкций или Langame write-back без
отдельно утверждённого сценария.

### Коммуникации

Полный текущий in-app контур: channels, chat, mentions, read receipts, channel
events, task creation from chat, notifications и CRM contact tasks. PII
маскирована по умолчанию; reveal/export требуют отдельных capabilities и audit.

Telegram, относящийся к guest gamification journey, включён. Массовые
Telegram/MAX/SMS-рассылки автоматически не включаются.

### Пользователи и роли

Users, invites, block/revoke, system/custom roles, capabilities, network/store
scope и audit. `Platform Admin` не является tenant role и не выдаётся клиенту.

## Поддерживающие разделы

- tenant-scoped dashboard;
- clubs/stores собственной сети;
- Langame sync и diagnostics;
- настройки собственной сети;
- in-product feedback.

## Не включено по умолчанию

- marketing campaigns и массовые рассылки;
- полный guest CRM analytics вне contact tasks;
- billing/subscriptions;
- public self-registration;
- доступ к platform administration или другим tenant.

Исключение возможно только отдельным решением с новой entitlement revision,
risk review, rollout и audit.

## Нормативные access rules

- `NETWORK` видит все Store только своего Tenant.
- `STORES` видит непустой persisted subset `allowedStoreIds`.
- Пустой, отсутствующий или противоречивый persisted scope — deny-by-default.
- Клиентские `tenantId`, `storeId`, `storeIds`, UUID и filters не расширяют
  область.
- List/detail/aggregate/write/export/file/job используют одну server-side
  authority.
- Tenant-global write доступен только явно уполномоченному NETWORK actor.
- Actor не может выдать target роль, capability или scope шире собственного.
- Login/session/invite и фоновые действия проверяют lifecycle, entitlement и
  актуальный persisted scope.

## Acceptance профиля

Профиль можно активировать для внешнего Tenant только когда:

1. Каждая включённая поверхность перечислена в module adoption matrix.
2. Для неё известны capability, resource class, audit и data owner.
3. Cross-tenant/store negative suite и browser journey зелёные.
4. Exports, attachments, PII и background jobs проверены отдельно.
5. Outbound side effects имеют tenant/store kill switch и canary.
6. Support owner, trial/cohort dates и onboarding checklist назначены.
7. Решение привязано к exact release SHA и имеет rollback.
