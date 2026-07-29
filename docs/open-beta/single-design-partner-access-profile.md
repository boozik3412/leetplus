# Профиль optional isolation `SINGLE_DESIGN_PARTNER_V1`

| Поле             | Значение                                                      |
| ---------------- | ------------------------------------------------------------- |
| Profile key      | `SINGLE_DESIGN_PARTNER_V1`                                    |
| Версия           | 1.5                                                           |
| Дата             | 29.07.2026                                                    |
| Статус           | `NO-GO`; identity writers disabled, status/suspend preserved  |
| Формат           | Contingency/enterprise isolation, invite-only                 |
| Среда            | Отдельные web, API, PostgreSQL, secrets и storage namespace   |
| Partner topology | Новый `Tenant D`, один `Store D1`                             |
| Current topology | Существующий `Tenant A`, четыре `Store A1..A4`, без изменений |
| Активация        | Full initial in-app scope; high-risk effects gated separately |
| Outbound/jobs    | `OFF` до отдельных surface/outbound `GO`                      |
| Общий beta       | По-прежнему `NO-GO` до Gate 1MT/Gate 2                        |

Этот профиль сохранён для contingency или договорной enterprise isolation. Он
не является основным способом первого внешнего теста, не является исключением
из security-инвариантов и не заменяет
[`SHARED_MULTI_TENANT_BETA_V1`](./shared-multi-tenant-beta-profile.md).

Документ сам по себе не разрешает выдачу credentials. До выполнения
[launch checklist](./single-design-partner-launch-checklist.md), Gate 1DP из
[`OPEN_BETA_BACKLOG.md`](../../OPEN_BETA_BACKLOG.md) и сохранения отдельного
`DESIGN_PARTNER GO` статус остаётся `NO-GO`.

Календарное окно этой lane не назначено. Работы возобновляются только после
отдельного product/security решения о том, почему целевой shared data plane
не подходит. Gate 1DP не заменяет Gate 1MT/Gate 2.

Текущая реализация не создаёт новый design-partner tenant или invite. Legacy
CLI/exported `provision` и `rotate-invite` fail-closed с
`DESIGN_PARTNER_IDENTITY_WRITER_DISABLED` до manifest/Prisma/БД/token.
Сохранены только read-only `status` для уже существующих isolated fixtures и
аварийный narrowing-only `suspend`. Общий Platform Admin lifecycle также не
может активировать tenant с design-partner provisioning marker. API startup
по-прежнему связывает isolated marker с пустой pre-provisioning БД либо с одним
точным `SUSPENDED` tenant/неактивным Store и прекращает запуск при shared или
active topology. Полный контракт:
[design-partner identity writer isolation](./design-partner-identity-writer-isolation.md).

## 1. Нормативная topology

```text
CURRENT PRODUCTION
  Tenant A
    Store A1
    Store A2
    Store A3
    Store A4

ISOLATED SINGLE DESIGN PARTNER
  separate web
  separate API
  separate PostgreSQL
  separate secrets
  separate storage namespace

  Tenant D
    Store D1
```

Обязательные инварианты:

- `Tenant A` сохраняет существующий `tenantId`; A1..A4 остаются четырьмя Store
  одной сети;
- данные, snapshot, credentials, integration tokens и identifiers Tenant A не
  копируются и не монтируются в partner environment;
- partner web/API не имеют production database URL, production secrets,
  service token или сетевой маршрут к PostgreSQL Tenant A;
- `Tenant D` создаётся только в partner PostgreSQL и содержит ровно один
  `Store D1`;
- D1 никогда не добавляется в Tenant A;
- partner runtime использует exact reviewed release SHA, но развёртывается
  отдельными процессами и конфигурацией;
- upload разрешается только в отдельном storage namespace с отдельными
  credentials; до этого attachments остаются `OFF`;
- в git используются только aliases A/A1..A4/D/D1, counts, hashes и opaque
  evidence references. Production ID, PII, URLs, tokens и secrets запрещены.

`stage=PILOT` и `cohort=SINGLE_DESIGN_PARTNER_V1` пока являются целевыми
операционными labels, а не сохранёнными полями текущей модели `Tenant`.
Persisted stage/cohort, entitlement revision и authoritative expiry должны быть
реализованы в `BETA-TEN-001`/`BETA-DP-004`. До этого provisioning audit marker
служит только доказательством bootstrap и не разрешает активацию.

## 2. Модель доступа

Внутри `Tenant D` действуют те же fail-closed правила `AccessScope`:

- OWNER имеет `NETWORK`, означающий один D1 только внутри Tenant D;
- club-level actor имеет `STORES[D1]`;
- `STORES[]`, отсутствующий/неизвестный scope и cross-tenant Store завершают
  аутентификацию отказом;
- actor не может выдать target роль, capability или scope шире собственного;
- Platform Admin не является tenant role и не выдаётся партнёру;
- client `tenantId`, `storeId`, UUID, filters или stale JWT не расширяют
  persisted scope;
- list, detail, aggregate, write, export, file, BFF, SSE и job применяют одну
  server-side authority;
- PII masked by default; reveal/export требуют отдельной surface-level
  capability, audit и `SURFACE GO`.

Если email владельца уже принадлежит пользователю другого tenant при текущей
глобальной identity-модели, onboarding останавливается до явного решения.
Ручной перенос пользователя или переиспользование production account
запрещены.

## 3. Начальный доступ и дальнейшая активация

Целевой продуктовый состав совпадает с запросом на совместное тестирование:

- геймификация;
- ассортимент и товары;
- сотрудники целиком, включая задачи, контроль, мотивацию, регламенты, базы
  знаний, обучение, дисциплину и salary planning;
- in-app коммуникации;
- users и roles только внутри Tenant D/Store D1.

Это обязательный состав первого выданного доступа, а не отложенный target.
Credentials не передаются, пока все in-app surfaces `DP-S0..DP-S4` ниже не
получили `VERIFIED + ENFORCED` на одном exact release SHA. Каждая surface
проходит независимый цикл:

```text
OFF
  → REVIEWED
  → INTERNAL EVIDENCE
  → MANUAL_CANARY
  → SURFACE GO
  → ACTIVE
```

Runtime contract:

- authorization mode поверхности — только `ENFORCED`;
- adoption status — только `VERIFIED` с exact evidence SHA;
- read/write/outbound entitlements сохраняются отдельно, с revision, reason,
  expiry и audit;
- surface ниже `VERIFIED + ENFORCED` скрыта в navigation и отклоняется на
  API/BFF/job уровне;
- `SHADOW` используется только для внутреннего evidence и не авторизует
  partner request;
- автоматическое расширение entitlement после deploy запрещено.

Рекомендуемые manual slices:

| Slice | Состав                                                                                                | Режим первого доступа                                       |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| DP-S0 | Login, OWNER invite, users/roles, Store D1, support, feedback                                         | Обязательно; только Tenant D/Store D1                       |
| DP-S1 | Ассортимент целиком: товары, каталог, отчёты, imports и ручной sync                                   | Read/write; unattended scheduler `OFF`                      |
| DP-S2 | Сотрудники целиком: directory/tasks/regulations/KB/training/control/motivation/discipline/salary plan | Read/write; salary planning-only, без внешних санкций       |
| DP-S3 | Channels/chat/mentions/receipts/notifications                                                         | Read/write только in-app                                    |
| DP-S4 | Gamification admin/guest/wallet/ledger diagnostics                                                    | Read/write; external reward delivery/posting остаётся `OFF` |
| DP-S5 | Reward/Langame/Telegram/SMS/MAX outbound                                                              | Только отдельный store canary и `OUTBOUND GO`               |

Первый доступ открывает `DP-S0..DP-S4` одновременно. Ограничение outbound,
планировщиков, массовых операций, PII reveal, exports и attachments не
считается скрытием согласованного модуля: эти эффекты имеют отдельные gates
безопасности и остаются fail-closed до своего `GO`.

Исторический fixture, уже созданный до writer isolation, может содержать
least-privilege OWNER override: dashboard/read-only assortment discovery и
управление пользователями внутри Tenant D. Из-за текущего системного OWNER
minimum он также явно содержит внутреннюю staff knowledge authoring surface;
её нужно проверить до выдачи credentials либо устранить через strict override
policy. Это описание нужно только для read-only status/admission существующей
fixture и не является инструкцией создать новую. Будущий bootstrap обязан
использовать отдельно reviewed shared sealed activation writer. До
`DESIGN_PARTNER GO` нужные capabilities `DP-S0..DP-S4` добавляются атомарно
только через reviewed persisted surface-level policy с expiry; generic
lifecycle activation для этого tenant запрещена.

## 4. Обязательные ограничения

До отдельных approvals всегда `OFF`:

- все schedulers, all-tenant routes, background materializers и unattended
  recurring execution;
- Langame writes, reward posting, Telegram/SMS/MAX и другие outbound effects;
- bulk import/mutation, пока для конкретной surface не принят write `GO`;
- PII reveal, exports и attachments, пока не пройдены их отдельные ACL,
  privacy и storage gates;
- любые автоматические внешние санкции, discipline write-back и salary
  выплаты.

Обязательный fail-closed overlay описан в
[`design-partner-runtime.env.example`](./design-partner-runtime.env.example).
API startup-кандидат проверяет его при
`DESIGN_PARTNER_ISOLATED_MODE=true`; сам файл не доказывает фактическую
конфигурацию, отдельный runtime или network isolation.

Salary остаётся planning-only. Motivation/discipline допускают только
внутренние записи с source, comment и audit.

Не входят в эту lane:

- marketing campaigns и массовые рассылки;
- полный guest CRM analytics вне явно принятой contact-task surface;
- billing/subscriptions;
- public self-registration;
- Platform Administration;
- доступ к Tenant A, его четырём Store или любому другому tenant.

## 5. Surface-level `GO`

Для каждого нового slice protected record содержит:

- exact environment и release SHA;
- module/surface inventory и version;
- capability, resource class, PII/export/file/job flags;
- adoption status `VERIFIED` и runtime mode `ENFORCED`;
- test names, CI/PG/browser result и evidence reference;
- entitlement revision и effective read/write/outbound modes;
- data owner, support owner и rollback owner;
- canary window, expiry и approver;
- kill-switch verification.

Один `SURFACE GO` не переносится на другую surface или outbound mode.

Для уже существующей isolated fixture read-only status продолжает проверять
historical provisioning/rotation evidence, не ограничиваясь подписью manifest:

- initial receipt HMAC-связывает exact Tenant D, Store D1, invite ID, hash
  opaque token и исходный expiry;
- каждый rotated invite связан отдельным domain-separated HMAC receipt с
  request ID, invite ID, token hash и исходным expiry;
- revoke может только сократить фактический expiry; продление сверх
  подписанного expiry либо изменение token hash блокирует HMAC-authenticated
  operator `status`;
- provisioning HMAC key отсутствует в API, web и standalone runtime; его
  наличие приводит к fail-closed startup. Runtime startup выполняет только
  структурную проверку ID/digest/hash shapes и верхней границы expiry; он не
  является криптографическим verifier и не заменяет operator status.

Эти receipts остаются только историческим verification contract. Legacy
`provision`/`rotate-invite` не могут выпустить новый receipt или token.
Local unit/boundary `23/23 PASS`; independent review принят без actionable
P0/P1/P2 в заявленном scope. PostgreSQL writer-isolation smoke не запускался без
`DATABASE_URL`/Postgres, remote exact-head CI pending.

StaffTask surface дополнительно не может использовать synthetic snapshot,
proposal report или HMAC digest как production-like authorization. До её
включения приняты требуемые admission, inventory/reconciliation,
apply/zero-diff, validation/deployment и rollback evidence для exact
изолированного target.

## 6. Kill switches и rollback

Partner environment обязан поддерживать:

1. `outbound OFF`;
2. module write entitlement `OFF`;
3. остановку partner jobs/processes;
4. revoke pending invites и active sessions;
5. `Tenant D → SUSPENDED`;
6. возврат к заранее проверенному N-1 artifact либо fix-forward;
7. isolated restore по отдельному incident decision.

Порядок реакции:

```text
outbound OFF
  → module writes OFF
  → jobs/processes stop
  → sessions/invites revoke
  → Tenant D SUSPENDED
  → evidence capture
  → rollback or fix-forward
```

Destructive down migration запрещена. Audit, entitlements и incident evidence
не удаляются при application rollback.

## 7. Stop conditions

Доступ немедленно останавливается при:

- cross-tenant, cross-store или PII reveal;
- неизвестном, отсутствующем или расширенном scope;
- доступе к surface ниже `VERIFIED + ENFORCED`;
- обходе entitlement через API, BFF, export, file, SSE или job;
- любой технической связи partner runtime с production Tenant A;
- неожиданном scheduler, queue consumer или outbound execution;
- потерянной/дублированной reward/ledger операции;
- необъяснимом повреждении import/sync;
- недоставленном critical alert;
- невозможности выполнить suspend, revoke, kill switch, backup или rollback;
- несовпадении exact SHA/schema/health evidence.

Security/data-integrity stop condition переводит Tenant D в `SUSPENDED`.
Возобновление требует нового evidence и нового `DESIGN_PARTNER GO`.

## 8. Feedback и incidents

- Назначаются partner owner, primary и backup LeetPlus owner.
- Обращение содержит alias tenant/store, category, severity, role, route,
  release SHA, request ID и browser.
- Screenshot только opt-in; PII и бизнес-данные не прикладываются
  автоматически.
- Workflow:
  `NEW → TRIAGED → ACCEPTED/DECLINED → PLANNED → FIXED → VERIFIED → CLOSED`.
- В active canary window выполняется ежедневный triage; не реже раза в неделю
  — совместная продуктовая сессия.
- `SEV0`: security, data corruption или ledger integrity — немедленный stop
  sequence и incident record.
- `SEV1`: недоступный либо неверный core workflow — module writes `OFF`,
  rollback/fix-forward и status update.
- Critical acknowledgement — до 30 минут в согласованном active test window и
  до 2 рабочих часов вне него.
- Каждый incident, fix и повторная проверка привязаны к exact SHA.

## 9. Завершение и promotion

В конце окна выполняется одно решение:

- `EXTEND` с новой expiry и неизменным лимитом один partner;
- `SUSPEND` до исправления;
- `OFFBOARD` с revoke, export/retention и закрытием integrations;
- `PROMOTE` только после общего Gate 2.

Успех DP-1 не завершает Gate 2 или Gate 3, не заменяет семь дней internal alpha
текущей сети и не разрешает второго партнёра. При promotion после Gate 2
создаются новая entitlement revision, новый cohort record и новое
измерительное окно.
