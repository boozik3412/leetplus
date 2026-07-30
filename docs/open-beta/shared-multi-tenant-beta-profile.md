# Профиль `SHARED_MULTI_TENANT_BETA_V1`

| Поле             | Значение                                                     |
| ---------------- | ------------------------------------------------------------ |
| Profile key      | `SHARED_MULTI_TENANT_BETA_V1`                                |
| Версия           | 1.14                                                         |
| Дата             | 30.07.2026                                                   |
| Schema target    | local `CURRENT_174`; last remote accepted `CURRENT_172`      |
| Статус           | `NO-GO`; обязательные P0 и Gate 1MT/Gate 2 не завершены      |
| Формат           | Первый friendly external club, invite-only                   |
| Data plane       | Shared web, API, workers, PostgreSQL и Telegram              |
| Current topology | `Tenant A`, четыре `Store A1..A4`                            |
| Partner topology | Новый `Tenant B`, первоначально один `Store B1`              |
| Владелец         | Email-bound OWNER invite; `NETWORK` только внутри `Tenant B` |
| Product scope    | Пять основных модулей целиком                                |
| Integrations     | Обязательная шестая supporting row; outbound отдельно gated  |

Этот профиль является контрактом первого внешнего доступа в целевой
multi-tenant архитектуре LeetPlus. Он не разрешает deployment, создание
tenant или отправку invite сам по себе. До завершения
[launch checklist](./shared-multi-tenant-launch-checklist.md), Gate 1MT,
Gate 2 и protected `SHARED BETA GO` статус остаётся `NO-GO`.

Плановый ориентир первого friendly external club — окно
`31.08–07.09.2026`, только если все gates закрыты без stop condition. Это не
обещание даты и не основание заранее создавать учётную запись.

## 1. Нормативная topology

```text
SHARED DATA PLANE
  web
  API
  workers
  PostgreSQL
  Telegram bot / Mini App edge

  Tenant A
    Store A1
    Store A2
    Store A3
    Store A4

  Tenant B
    Store B1
```

- Текущие четыре клуба остаются одной сетью и одним `Tenant A`.
- Внешний независимый клуб не добавляется в `Tenant A`: для него создаётся
  новый `Tenant B`.
- Shared PostgreSQL является целевой моделью. Изоляция обеспечивается
  persisted tenant/store authority, capabilities и resource ownership на
  каждом server-side path.
- Отдельный runtime/DB применяется только по отдельному решению как
  contingency или enterprise-isolation option.
- Один Telegram-контур обслуживает несколько tenant. B2B-пользователю не
  создаётся отдельный бот; tenant/store выбираются из доверенного persisted
  контекста, а не из произвольного client input.

## 2. Формула авторизации

Любое действие разрешается только как пересечение:

```text
tenant lifecycle
∩ customer stage / onboarding / trial
∩ module entitlement (read | write | outbound)
∩ actor capability
∩ actor scope (NETWORK | STORES)
∩ resource tenant/store ownership
∩ outbound/store rollout policy
```

Отсутствующий, просроченный, неизвестный или противоречивый элемент даёт
deny-by-default. Frontend visibility не является авторизацией.

Общие правила:

- `NETWORK` охватывает только Store собственного Tenant.
- `STORES` требует непустой persisted список разрешённых Store.
- `tenantId`, `storeId`, `storeIds`, UUID и filters из запроса никогда не
  расширяют server-side authority.
- List/detail/aggregate/write/export/file/job/SSE/Telegram paths применяют
  одну и ту же модель.
- Tenant-global write требует отдельной capability и `NETWORK`.
- Suspend, trial expiry и entitlement revoke применяются к новым HTTP и
  background actions без restart.
- Platform Admin является control-plane identity и не назначается tenant user.
- Generic lifecycle endpoint отклоняет каждую non-`INTERNAL` сеть; external
  activation/suspend/offboarding выполняются только dedicated workflows.

## 3. Владелец и delegation

Platform operator в целевом workflow сначала выполняет idempotent shell-only
provisioning. Historical `CURRENT_170` locator checkpoint сохраняет
реализованный в `CURRENT_168` shell service, который одной
serializable-транзакцией:

1. создаёт `Tenant B` как
   `PILOT/SUSPENDED/PROVISIONING/profileRevision=1`;
2. создаёт неактивный `Store B1` с gamification/background execution `OFF`;
3. оставляет `trialStartsAt/trialEndsAt` пустыми;
4. создаёт OWNER capability override и exact six-row entitlement profile;
5. резервирует canonical owner email через sealed claim RPC, но не создаёт
   `User` или `UserInvite`;
6. сохраняет HMAC-bound request digest и audit fingerprint/version без raw
   email;
7. возвращает только несекретный shell snapshot.

Shell не создаёт invite, token, registration URL, trial, outbox или письмо.
Migration 169 добавляет persisted revision provenance и explicit revoke
history для `User`/`UserInvite`; обычные issue/reissue/revoke/accept paths
используют sealed state machine. Migration 170 добавляет immutable opaque
`workflowLocator` и PII-free sealed locator assert; shell replay использует
persisted reservation UUID без raw e-mail. Runtime role имеет zero
`IdentityEmailClaim` table privileges и exact `EXECUTE` на
`reserve_v2/assert_v1/assert_invite_locator_v1/transition_v2/release_v2`;
полный application allowlist содержит ровно семь RPC с учётом двух guest-game
boundaries. Direct user creation и user/invite email change остаются
fail-closed.

Disposable PostgreSQL `16.13` подтвердил clean deploy `170/170`,
populated upgrade `169 → 170`, locator/ACL/rollback checks,
identity idempotency `100 = 1 CREATED + 99 ALREADY_RESERVED`, transition
destination replay-check, retained revoked history, новую same-email
reservation после explicit revoke и shell integration `2/2`. Full API —
`101 suites / 1960 passed / 2 todo`. Exact-head `8dfe219...` / CI
`30493779099` (`run #47`) принят, `3/3 PASS`; independent review — `PASS` без
P0/P1/P2. Historical engineering exact-head `CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1.

Предыдущий `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0 только как historical
prerequisite. Ни local, ни remote engineering evidence не являются launch
approval.

Historical `CURRENT_171` добавил dormant `NETWORK OWNER` issue и encrypted
`HOLD` outbox. Последний remote-accepted `CURRENT_172` добавил signed
non-consuming admission provenance: exact-head
`12d574166bffe860205b128dd9d092f4f54514fc`, CI `30509157338`
(`run #53`) — `3/3 PASS`. Local candidate `CURRENT_174` реализует отдельные
build/deployment provenance, instance-bound activation role и одну atomic
transaction с finite trial, GO consume и `HOLD→PENDING`; он остаётся
`LOCAL_ACCEPTED / EXACT_SHA_CI_PENDING / NOT_DEPLOYED`. Production roots,
production-like rehearsal, delivery worker/SMTP и admin route остаются
pending, поэтому внешний доступ — `NO-GO`.

Оба Platform Admin route остаются закрытыми:

```text
POST /admin/shared-beta/tenants/provision
  → 503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING

POST /admin/tenants/:tenantId/initial-owner-invite/revoke
  → 503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

OWNER invite появится только в отдельной protected activation после
persisted `SHARED BETA GO`. До неё необходимо использовать принятый locator
checkpoint, реализовать sealed issue-by-locator, encrypted outbox и verified
delivery,
закрыть
[`BETA-IAM-004B`](./identity-legacy-backfill.md): local evidence, финальный
independent security review и exact-head
`d1162eed042893ec3b27ed823bdaddfa64c7e90f` / CI `30479020686`
(`run #39`), `3/3 PASS`, приняты, но item остаётся открытым до отдельного
production-like inventory и будущего signed proposal/apply/rollback.
Legacy design-partner `provision`/`rotate-invite` уже изолированы
fail-closed до manifest/Prisma/БД/token; local unit/boundary `23/23 PASS`,
independent review без actionable P0/P1/P2; exact-head
`f4224072f60507bd97f8e49440e3bda89ffe2aaa` / CI `30483184102`
(`run #41`) — `3/3 PASS`, включая PostgreSQL 16 smoke. Полный
issue/reissue/revoke/accept race всё ещё не
пройден. Fingerprint HMAC startup validation уже
реализована candidate; до deploy требуется защищённо настроить и аттестовать
отдельный production secret version `v1`. Поэтому реальный tester email в
route не передаётся.

После принятия invite OWNER:

- управляет пользователями и ролями только `Tenant B`;
- может выдать `NETWORK` внутри B либо `STORES` с разрешённым subset B;
- не может создать Platform Admin;
- не может делегировать role/capability/scope шире собственной authority;
- не может добавить пользователя или Store в `Tenant A`;
- подключает интеграции только своей сети.

Изменение OWNER выполняется отдельным owner-transfer workflow. Обычный ADMIN
не назначает OWNER и не обходит защиту последнего владельца.

## 4. Полный профиль: пять product modules + supporting integration

Для первого доступа атомарно сохраняются ровно шесть module keys:

| Module key       | Initial read | Initial write | Initial outbound |
| ---------------- | ------------ | ------------- | ---------------- |
| `GAMIFICATION`   | `ON`         | `ON`          | `OFF`            |
| `ASSORTMENT`     | `ON`         | `ON`          | `OFF`            |
| `STAFF`          | `ON`         | `ON`          | `OFF`            |
| `COMMUNICATIONS` | `ON`         | `ON`          | `OFF`            |
| `USERS_ROLES`    | `ON`         | `ON`          | `OFF`            |
| `INTEGRATIONS`   | `ON`         | `ON`          | `OFF`            |

Профиль хранится и обновляется как полный атомарный набор. Значение
`Tenant.entitlementProfileRevision` является CAS-версией всего набора, а
каждая строка модуля содержит тот же `profileRevision`; частичное смешение
ревизий запрещено policy. Изменение выполняется одной короткой транзакцией
вместе с `PlatformAdminAuditEvent`. Для `INTEGRATIONS` также существует
явная строка профиля, но она остаётся supporting control-plane gate, описанным
ниже.

`Initial outbound=OFF` не урезает in-app scope. Он отделяет продуктовые
операции от unattended jobs и действий во внешних системах. Каждый переход
`OFF → SHADOW → CANARY → LIVE` имеет tenant/store, revision, reason, expiry,
approver, audit и kill switch.

### 4.1. `GAMIFICATION`

Включены rules, missions, chains, Battle Pass, lootboxes, promo cards,
rewards, wallet, entitlements, ledger, deliveries, reconciliation, guest
registration/profile/XP, game/reward pages, Telegram Mini App и диагностика.

Reward/bonus write-back включается отдельно по Store после shadow, one-user
canary и reconciliation. Недопустимы потеря или двойная выдача.

### 4.2. `ASSORTMENT`

Включены dashboard, товары, карточки/история, категории, suppliers, остатки,
продажи, движения, OOS, matrix, рекомендации, reports/exports, imports,
parser, bulk operations и data-quality diagnostics.

Langame preview и read-only initial sync относятся к onboarding integrations
gate. Периодический sync и любые внешние writes включаются отдельно.

### 4.3. `STAFF`

Включены directory, задачи/templates/recurring, shift workspace/reports,
регламенты и версии, checklist, knowledge base, обучение/onboarding/tests/
assessment, readiness, контроль, рейтинги, мотивация, дисциплина,
salary planning, attachments/evidence/audit и текущий deterministic assistant.

Salary остаётся planning-only, без автоматической выплаты. Мотивация и
дисциплина не выполняют внешних санкций без отдельного продукта и approval.

### 4.4. `COMMUNICATIONS`

Включён текущий in-app контур: network/store channels, chat, mentions, read
receipts, channel events, создание задач из чата, notifications и CRM contact
tasks. PII маскирована; reveal/export требуют отдельных capabilities и audit.

Массовые Telegram/MAX/SMS-рассылки не включены. Telegram, необходимый guest
gamification journey, проходит собственный outbound/store gate.

### 4.5. `USERS_ROLES`

Включены users, email-bound invites, resend/revoke, block, session revoke,
system/custom roles, capabilities, `NETWORK | STORES` scope и audit.

## 5. `INTEGRATIONS` как supporting control-plane

`INTEGRATIONS` является обязательной шестой entitlement row, но не открытым
шестым product module: это supporting control-plane. OWNER может:

- сохранить tenant-owned credentials только в зашифрованном виде;
- проверить соединение через серверный egress policy;
- получить preview доступных внешних клубов;
- явно выбрать и сопоставить только свой клуб со `Store B1`;
- запустить read-only diagnostic/initial sync после onboarding approval.

Обязательные guards:

- scheme/host/port allowlist;
- DNS/IP resolution и повторная проверка перед соединением;
- запрет loopback, link-local, private metadata и DNS rebinding;
- общий timeout, bounded retry, circuit breaker и rate limit;
- secrets не возвращаются клиенту и не попадают в logs/evidence;
- API key/domain не импортируют автоматически все видимые клубы;
- unattended sync, write-back и mass messaging имеют отдельные outbound gates.

## 6. Не включено по умолчанию

- marketing campaigns и массовые рассылки;
- полный CRM analytics вне включённых contact tasks;
- billing/subscriptions;
- public self-registration;
- Platform Administration;
- автоматические выплаты или санкции;
- доступ к `Tenant A` или другому tenant;
- любой новый product module без новой entitlement revision.

## 7. Acceptance и stop conditions

Профиль активируется только если:

1. Gate 1MT и Gate 2 завершены.
2. Exact release SHA/CI/version и deployment artifact приняты.
3. Shared PostgreSQL fixture доказала A/A1/A2 ↔ B/B1 isolation для
   API/BFF/browser/files/jobs/SSE/Telegram.
4. Все пять product modules и supporting `INTEGRATIONS` имеют
   `VERIFIED + ENFORCED` access policy.
5. Shell provisioning, protected activation/invite, delegation и session
   revoke работают атомарно.
6. Integration preview/mapping не импортирует чужие клубы.
7. Shared workers имеют tenant/store system identity, durable lease/fencing
   и idempotency.
8. Backup/restore, rollback, alerts, tenant suspend и per-store kill switches
   проверены.
9. Support/incident/feedback/offboarding owners и trial expiry назначены.
10. Protected `SHARED BETA GO` сохранён до создания invite.

Дополнительно до любого внешнего доступа обязательны production-like
upgrade/rollback/zero-diff и полноценная two-tenant rehearsal. Ни historical
`CURRENT_170/171`, ни remote-accepted `CURRENT_172`, ни local
`CURRENT_174` PostgreSQL evidence не заменяют эти gates.

Немедленные stop conditions:

- cross-tenant, cross-store или несанкционированный PII access;
- неизвестный/пустой scope, entitlement bypass или privilege escalation;
- потеря/дублирование reward либо необъяснимое повреждение sync/import;
- routing Telegram/job в неправильный tenant/store;
- unexpected outbound execution;
- недоступный suspend, revoke, kill switch, restore или rollback.

Порядок остановки:

```text
outbound OFF
→ module writes OFF
→ jobs stop
→ sessions/invites revoke
→ Tenant B SUSPENDED
→ evidence preserve / incident process
```
