# Профиль доступа первой внешней когорты

| Поле          | Значение                                               |
| ------------- | ------------------------------------------------------ |
| Profile key   | `OPEN_BETA_FULL_OPERATIONS_V1`                         |
| Версия        | 1.6                                                    |
| Дата          | 28.07.2026                                             |
| Статус        | `NO-GO`; control-plane foundation реализован, adoption pending |
| Выдача        | Invite-only, отдельный Tenant на независимую сеть      |
| Область       | Собственная сеть или явно разрешённые клубы            |
| Назначение    | Первый shared external tenant и последующая когорта    |
| Candidate SHA | Не назначен: shared control-plane пока в рабочем дереве |
| Historical evidence | `044ceca2` / `2341b999`, не evidence текущего candidate |

Этот профиль фиксирует обязательный продуктовый состав тестового доступа.
Persisted stage/trial, атомарный six-row entitlement profile и базовый
deny-by-default policy уже реализованы. Shared provisioning/revoke foundation
candidate атомарно создаёт suspended tenant/store/profile/OWNER invite, но
ещё не имеет real PostgreSQL/concurrency evidence, email delivery,
reissue/rotation и dedicated activation. Route/job/Telegram/integration
adoption, role matrix и production evidence также не завершены.
Initial shared-beta profile содержит пять product modules и supporting
`INTEGRATIONS`; у всех шести `read/write=ON`, `outbound=OFF`. Generic profile
mutation не включает outbound.

Сам по себе профиль не разрешает выдачу доступа. До успешного cutover текущей
сети, семи стабильных дней internal alpha, завершения Gate 1MT/Gate 2 и
protected `SHARED BETA GO` активация остаётся `NO-GO`.

Основной первый тест регулируется
[`SHARED_MULTI_TENANT_BETA_V1`](./shared-multi-tenant-beta-profile.md):
текущая сеть остаётся одним существующим `Tenant A` с четырьмя
`Store A1..A4`, а внешний клуб получает новый `Tenant B/Store B1` в общем
web/API/workers/PostgreSQL/Telegram data plane. Отдельный runtime/DB остаётся
только optional contingency/enterprise-isolation lane.

Local public-only pinned-path evidence прошёл admission suite `19/19`, но
remote CI ещё pending. Production authority roots остаются
`EMPTY / FAIL-CLOSED`, поэтому fixture не является production-like authority
или Gate 2 evidence. Experimental Node.js 22 module mock учитывается как `P2`
test-infrastructure risk и не меняет entitlement или продуктовый состав этого
профиля.

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

### Интеграции — supporting entitlement

Шестая обязательная строка профиля открывает tenant-owned settings,
encrypted credentials, connection diagnostics, preview/select/map и
read-only initial sync только своей сети. Unattended sync, reward/write-back
и массовые сообщения остаются `outbound=OFF` до отдельных workflows.

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
- Generic lifecycle mutation запрещена для non-`INTERNAL` tenant; первый
  внешний tenant активируется только dedicated workflow после всех gates.

## Acceptance профиля

Профиль можно активировать для внешнего Tenant только когда:

1. Текущая сеть прошла cutover и семь стабильных дней internal alpha;
   Gate 1MT и Gate 2 завершены, protected `SHARED BETA GO` принят.
2. Каждая включённая поверхность перечислена в module adoption matrix.
3. Для неё известны capability, resource class, audit и data owner.
4. Cross-tenant/store negative suite и browser journey зелёные.
5. Exports, attachments, PII и background jobs проверены отдельно.
6. Outbound side effects имеют tenant/store kill switch и canary.
7. Support owner, trial/cohort dates и onboarding checklist назначены.
8. Решение привязано к exact release SHA и имеет rollback.

Успех или длительность optional isolated DP-1 не выполняют Gate 1MT/Gate 2,
не заменяют семь дней internal alpha и не входят автоматически в Gate 3.
Promotion партнёра в shared когорту требует новой entitlement revision,
отдельного `GO` и нового измерительного окна.
