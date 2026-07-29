# Профиль доступа первой внешней когорты

| Поле          | Значение                                               |
| ------------- | ------------------------------------------------------ |
| Profile key   | `OPEN_BETA_FULL_OPERATIONS_V1`                         |
| Версия        | 1.16                                                   |
| Дата          | 29.07.2026                                             |
| Статус        | `NO-GO`; control-plane foundation реализован, adoption pending |
| Выдача        | Invite-only, отдельный Tenant на независимую сеть      |
| Область       | Собственная сеть или явно разрешённые клубы            |
| Назначение    | Первый shared external tenant и последующая когорта    |
| Schema target | `CURRENT_170` engineering checkpoint |
| Previous accepted baseline | PR-head-associated merge-ref `bbef153a...` / `30443837684`; not exact-SHA |
| Previous accepted exact-head | `d525b736...` / CI `30447467729`; `3/3 PASS` |
| Previous accepted checkpoint | exact-head `3b8228dd...` / CI `30460154200`; `3/3 PASS` |
| Current engineering checkpoint | `8dfe219...` / CI `30493779099`; `3/3 PASS`, review PASS, not deployed |
| Historical accepted checkpoint | `CURRENT_169` exact-head `f5d39fd...` / CI `30467882578`; `3/3 PASS` |
| Accepted prerequisite | `CURRENT_165`: `4bd6a036...` / `7c20adec...`, remote PASS |
| Historical evidence | `044ceca2` / `2341b999`, не evidence текущего candidate |

Этот профиль фиксирует обязательный продуктовый состав тестового доступа.
Persisted stage/trial, атомарный six-row entitlement profile и базовый
deny-by-default policy уже реализованы. Shared shell provisioning candidate
атомарно создаёт suspended tenant/store/profile, OWNER capability override и
canonical owner-email claim, но намеренно не создаёт `User`, `UserInvite`,
token, trial, outbox или письмо. Historical engineering exact-head `CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1; принятый
remote `CURRENT_168` относится только к предыдущему shell-only prerequisite.
Migration 170 добавляет immutable opaque locator и PII-free sealed replay
assert; current runtime allowlist содержит exact семь RPC при zero
`IdentityEmailClaim` table privileges. Exact-head `8dfe219...` / CI
`30493779099` (`run #47`) принят, `3/3 PASS`; independent review — `PASS` без
P0/P1/P2. Sealed issue-by-locator, email delivery и dedicated activation,
route/job/Telegram/integration adoption, role matrix и production-like
evidence ещё не завершены.
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

Local public-only pinned-path evidence прошёл admission suite `19/19`; его
исторический prerequisite вместе с authority/application/PostgreSQL gates
прошёл remote CI как `CURRENT_165` на
`4bd6a036...` / `30428288353`; documentation/evidence successor
`7c20adec...` / `30429463161` также зелёный. Current schema target —
`CURRENT_170`. Previous accepted engineering baseline связан с PR head
`bbef153a288bfdf1c3573eb704f27c013cc0e856` / merge-ref CI `30443837684`
(`run #23`), не exact-SHA checkout evidence: `3/3 PASS`, PostgreSQL job
`90549245372` подтвердил
`immutableMutationsRejected=7` и
`finalStateAndEvidenceUnchanged=true`. `c1fee42c...` / CI `30442286822`
сохраняется как historical precursor до legacy quarantine
delivery-row/lifecycle freeze. Rejected `6a69cd8...` / CI `30445054152`
(`run #26`), PostgreSQL job `90553255161`, завершился `FAILED` и не закрыл P1.
Exact-head `a644b81e909ea97c21e3c404480505bf97b19935` / CI
[`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
(`run #27`) также `REJECTED`: Application/Authority — `PASS`, PostgreSQL —
`FAIL` из-за replay-message expectation поверх SQLSTATE `23505`. Previous
accepted
exact-head —
`d525b736d03162a2c58de17cbf7679ba6f515096` / CI
[`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
(`run #28`), `3/3 PASS`: Application `90561260920`, Authority checks
`90561260926`, PostgreSQL major `16` job `90561260878`. Authority checks не
выполняли root enrollment; registry остаётся `{}`. Structured rehearsal
подтвердил `committedTransitions=4`, `runtimeBoundaryNegatives=9`,
`immutableMutationsRejected=7`,
`finalStateAndEvidenceUnchanged=true` и
`sourceDatabaseMigrationsApplied=0`; source migration state не изменён,
source application data не затронуты. Checkpoint закрыл final-row
reason/Event integrity и worker boundary-only durable event write. Последний
принятый provider-write exact-head —
`be8c94c4ea9106a31055a0aff577ffbd62b67e7c` / CI
[`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
(`run #29`), `3/3 PASS`: Application `90566337085`, Authority checks
`90566337062`, PostgreSQL major `16` job `90566337060`. Authority checks не
выполняли root enrollment; registry остаётся `{}`. Private SECURITY INVOKER
lock boundary, две DML session и advisory waiter закрыли
lock-order/deadlock/`40P01`; `privateSecurityInvokerLockBoundaries=1`,
`rawDeadlockOrLockTimeoutErrors=0`,
`stateAndEvidenceUnchanged=true`. Все четыре исходных engineering
provider-write P1 закрыты. Actual non-owner runtime/app DB role всё ещё должна
пройти admission и получить explicit `EXECUTE` grant (`PUBLIC EXECUTE`
revoked); batch/rebind/future provider writers остаются fail-closed,
whole-transaction bounded retry — defense-in-depth.
Текущий `CURRENT_170` engineering checkpoint подтвердил clean migrations
`170/170`, populated `169 → 170`, identity
`1 CREATED + 99 ALREADY_RESERVED`, revoke→same-email reserve, locator/ACL/
rollback checks и shell integration `2/2`; full API —
`101 suites / 1960 passed / 2 todo`. Exact-head `8dfe219...` / CI
`30493779099` (`run #47`) и independent review приняты. Historical engineering
exact-head
`f5d39fd89145c995c51e7005698327f5581a5cd8` / CI `30467882578`
(`run #37`) принят, `3/3 PASS`, и independent review без новых P0/P1.
Предыдущий `CURRENT_168` implementation
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0; он остаётся prerequisite, но
не является exact-head evidence текущей migration 170.
Production authority roots
остаются `EMPTY / FAIL-CLOSED`, поэтому fixture не является production-like
authority или Gate 2 evidence. Experimental Node.js 22 module mock учитывается
как `P2` test-infrastructure risk и не меняет entitlement или продуктовый
состав этого профиля.

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
