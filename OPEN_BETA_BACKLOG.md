# LeetPlus — специальный backlog выхода на открытый тест

- Дата актуализации: 29.07.2026
- Версия: 1.62
- Статус документа: активный launch backlog
- Текущий release decision: `NO-GO` для всех внешних доступов; основной путь
  первого внешнего клуба — `SHARED_MULTI_TENANT_BETA` в общем data plane
  только после Gate 1MT и Gate 2
- Связанный общий backlog: [BACKLOG.md](./BACKLOG.md)
- Пакет документации запуска:
  [docs/open-beta](./docs/open-beta/README.md)
- Канонический AccessScope package:
  [docs/security/access-scope](./docs/security/access-scope/README.md)

## 1. Цель

Перевести четыре действующих клуба из текущего operational tenant `demo` в полноценный рабочий tenant одной сети, затем безопасно подключать другие сети для получения обратной связи и выйти на открытый заявочный тест.

Этот файл является специальным исполнимым backlog запуска. Он не заменяет общий продуктовый backlog: здесь находятся только работы, от которых зависят безопасность, надёжность, обязательный состав модулей и управляемое расширение теста.

Для launch readiness этот файл и связанный release evidence имеют приоритет над
историческими планами и заявлениями о готовности в `BACKLOG.md` и других docs.

## 2. Зафиксированные продуктовые решения

- Четыре текущих клуба принадлежат одной сети и остаются четырьмя `Store` внутри одного `Tenant`.
- Текущий `tenantId` сохраняется. Разделение данных между tenant для текущей сети не требуется.
- Перед переименованием operational tenant закрывается публичный anonymous fallback на `demo`.
- Operational tenant получает реальные `name`, `slug` и `domain`.
- Отдельный публичный demo, если он нужен, создаётся заново как синтетический `public-demo` без реальных операционных, персональных и интеграционных данных.
- Для каждой новой независимой сети создаётся отдельный tenant. Несвязанные сети не объединяются в одном tenant.
- Целевая beta-топология общая: shared web, API, workers, PostgreSQL и
  Telegram. Текущая сеть остаётся `Tenant A` с `Store A1..A4`; первый
  независимый внешний клуб создаётся как новый `Tenant B` с `Store B1` в том
  же data plane. Данные и полномочия пересекаются только через server-side
  tenant/store policy, а не через отдельные runtime.
- Владелец `Tenant B` получает email-bound owner invite, принимает его и затем
  через verified email workflow сам приглашает пользователей, назначает
  `NETWORK | STORES` scope и подключает интеграции только своей сети. Generic
  direct-create и выдача raw invite URL владельцу не являются допустимым
  production-путём.
- Один общий Telegram-контур обслуживает несколько tenant; tenant/store
  определяются из persisted identity и настроек. Отдельный бот на каждого B2B
  пользователя не создаётся.
- `SINGLE_DESIGN_PARTNER_V1` с отдельными web/API/PostgreSQL/secrets сохраняется
  только как contingency или будущая enterprise-isolation option. Он не
  является основным способом первого теста и не сокращает обязательные shared
  multi-tenant gates.
- Открытый тест сначала остаётся заявочным и invite-only. Публичная self-registration не является условием запуска.
- Первый внешний тест не ограничивается только аналитикой. Тестовый tenant получает обязательный состав модулей, перечисленный ниже.

## 3. Обязательный состав первого внешнего теста

Полный состав ниже является обязательным для первого внешнего `Tenant B`
после Gate 1MT и Gate 2. Все in-app surfaces должны иметь
`VERIFIED + ENFORCED` tenant/store/capability policy до owner invite. Модуль
`INTEGRATIONS` является supporting control-plane: владелец может подключить и
проверить источник только своей сети, но sync, reward write-back, массовые
сообщения и прочие внешние effects включаются отдельно через
`OFF → SHADOW → CANARY → LIVE`.

### 3.1. Геймификация — целиком

В тестовый доступ входят:

- управление правилами, миссиями и цепочками миссий;
- Battle Pass;
- лутбоксы, лимиты, расписания и правила выдачи;
- promo cards и visual editor;
- награды, согласования, кошелёк, entitlements и история;
- deliveries, ledger, игровой журнал, диагностика, shadow/canary и reconciliation;
- гостевая регистрация, выбор клуба, профиль, XP и прогресс;
- страницы игры и наград;
- Telegram Mini App и связанные игровые уведомления;
- live reward/write-back после обязательного store-level canary.

Модуль виден и доступен тестовому tenant с начала пилота. Денежные или бонусные записи во внешнюю систему включаются по клубам через `OFF → SHADOW → CANARY → LIVE`; это предохранитель запуска, а не исключение функции из пилота.

### 3.2. Ассортимент и товары — целиком

В тестовый доступ входят:

- дашборд ассортимента;
- товары, карточки, история и движение;
- категории, сопоставления и triage;
- поставщики;
- остатки, продажи, OOS, матрица и рекомендации;
- все ассортиментные отчёты и экспорты;
- импорт товаров, продаж, остатков и движений;
- парсинг, ручные утилиты и массовые операции;
- Langame catalog/inventory/sales sync и диагностика качества данных.

### 3.3. Сотрудники — целиком

В тестовый доступ входят:

- обзор персонала и справочник сотрудников;
- задачи, шаблоны, регулярные правила и комментарии;
- shift workspace и сменные отчёты;
- регламенты, версии, подтверждения и чек-листы;
- база знаний;
- обучение, onboarding, курсы, тесты и аттестации;
- readiness и профили обучения;
- операционный контроль и staff-control;
- рейтинги, контроль и мотивация;
- дисциплина, предупреждения и связанные отчёты;
- плановый расчёт зарплаты, схемы, периоды и ручные корректировки без автоматических выплат;
- вложения, доказательства и audit trail;
- AI-помощник в его текущем локальном детерминированном режиме.

### 3.4. Коммуникации — целиком

В тестовый доступ входят:

- обзор коммуникаций;
- командный чат и каналы;
- mentions, read receipts, события канала и создание задач из чата;
- уведомления, подтверждение и разрешение сигналов;
- CRM-задачи контакта, входящие в раздел коммуникаций;
- уведомления и сообщения, возникающие из задач, чек-листов, регламентов, обучения и геймификации.

Контактные данные в CRM-задачах маскируются по умолчанию. Раскрытие PII и экспорт требуют отдельных capabilities и обязательного audit event.

В рамках первой когорты коммуникации означают текущий in-app контур. Массовые Telegram/MAX/SMS-рассылки не включаются автоматически; исключение — Telegram и уведомления, являющиеся частью пользовательского сценария геймификации.

### 3.5. Пользователи и роли

В тестовый доступ входят:

- создание, приглашение, блокировка и отзыв пользователей;
- системные и кастомные роли;
- настройка capabilities;
- назначение доступа ко всей сети или выбранным клубам;
- audit изменений ролей, capabilities и store scope.

Правила области доступа:

- пользователь сети видит только свой tenant и только разрешённые ему клубы;
- network-level пользователь может получить все клубы своего tenant;
- club-level пользователь получает явный список `allowedStoreIds`;
- режим `NETWORK` или `STORES` хранится явно и не выводится неявно из отсутствия записей доступа;
- list, detail, aggregate, mutation, export, file и background action обязаны применять один и тот же server-side `AccessScope`;
- переданные клиентом `tenantId`, `storeId`, `storeIds`, UUID или фильтры никогда не расширяют доступ;
- Platform Admin не является ролью клиента и не выдаётся участникам теста.

### 3.6. Поддерживающие разделы

Для работы обязательных модулей также доступны:

- базовый tenant-scoped дашборд;
- клубы своей сети;
- синхронизация и диагностика Langame;
- настройки своей сети;
- in-product feedback.

Не входят в обязательный состав первой когорты: маркетинговые кампании и массовые рассылки, полный гостевой CRM-аналитический модуль вне CRM-задач коммуникаций, billing и self-service registration.

## 4. Приоритеты, статусы и Definition of Done

- `P0` — блокирует любой внешний доступ или cutover реальной сети.
- `P1` — обязателен до открытого теста; допускается завершать во время internal alpha.
- `P2` — улучшение после первой внешней когорты, если не обнаружен связанный P0/P1 риск.
- Статусы задач: `Запланировано`, `В работе`, `Заблокировано`, `Готово`.
- Статус в этом файле означает launch readiness, а не наличие функциональной
  основы: существующий широкий модуль может оставаться `Запланировано`, пока не
  закрыты scope, entitlement, tests, operations и evidence.

Задача считается готовой только когда:

1. Реализация и миграции находятся в канонической ветке.
2. Есть автоматические позитивные и негативные тесты со связанным риском.
3. Tenant/store/capability scope проверен на API, BFF, export, files и background jobs.
4. Добавлены наблюдаемость, audit и безопасная обработка ошибок.
5. Описаны rollout, rollback и эксплуатационные действия.
6. Критерии приёмки выполнены на staging или production canary.
7. Результат привязан к exact release SHA.

## 5. Исполнимый backlog

### 5.1. Канонический исходный код и управление изменениями

| ID           | Приоритет | Статус        | Задача                                                     | Критерии приёмки                                                                                                                                  | Зависимости                |
| ------------ | --------- | ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| BETA-SRC-001 | P0        | Готово        | Сохранить исходные локальные изменения и локальные коммиты | Динамический source manifest фиксирует branch, HEAD, origin/main, ahead/behind и worktree; работа сохранена в отдельной ветке/коммитах без потерь | —                          |
| BETA-SRC-002 | P0        | В работе      | Осознанно согласовать local `main` с `origin/main`         | Один канонический clean SHA; расхождение `ahead/behind` устранено без уничтожения локальной работы                                                | BETA-SRC-001               |
| BETA-SRC-003 | P0        | Запланировано | Защитить `main` и ввести release freeze на новые функции   | Merge возможен только после обязательных checks; до Gate 3 принимаются только launch-blockers и обязательный beta scope                           | BETA-SRC-002, BETA-OPS-001 |
| BETA-SRC-004 | P1        | Запланировано | Версионировать nginx, systemd, deploy и env examples       | Production-конфигурация воспроизводится из репозитория; секреты отсутствуют; review показывает точный diff инфраструктуры                         | BETA-SRC-002               |

### 5.2. P0: безопасность и изоляция

| ID           | Приоритет | Статус        | Задача                                                           | Критерии приёмки                                                                                                                                                                                                                                                            | Зависимости                              |
| ------------ | --------- | ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-SEC-001 | P0        | В работе      | Убрать optional-auth со всех operational B2B endpoints           | Anonymous dashboard, products, stores, categories, suppliers, reports, staff, communications и management отвечают `401`; BFF не обходит защиту                                                                                                                             | BETA-SRC-002                             |
| BETA-SEC-002 | P1        | Запланировано | При необходимости создать безопасную архитектуру публичного demo | Публичны только allowlist-проекции синтетического `public-demo`; отсутствуют реальные выручка, себестоимость, остатки, адреса, внешние ID, PII и secrets; есть pagination и rate limit; задача не задерживает invite-only pilot после закрытия anonymous operational API    | BETA-SEC-001                             |
| BETA-SEC-003 | P0        | В работе      | Ввести единый server-side `AccessScope`                          | Каждый запрос пересекается с `tenantId` и `allowedStoreIds`; пустой или отсутствующий scope даёт deny-by-default; store-bound facts всегда фильтруются, а tenant-global write разрешён только network-scoped роли; общий механизм используется всеми обязательными модулями | BETA-SRC-002                             |
| BETA-SEC-004 | P0        | В работе      | Сделать capabilities авторитетной endpoint-проверкой             | Совпадение стандартной роли не обходит capability; capability задаётся декларативно на endpoint; frontend visibility не считается защитой                                                                                                                                   | BETA-SEC-003                             |
| BETA-SEC-005 | P0        | Запланировано | Разделить просмотр бизнес-данных, PII reveal и export            | PII маскирована по умолчанию; reveal/export требуют отдельных capabilities; каждое действие аудируется с tenant, store scope, user, route и request ID                                                                                                                      | BETA-SEC-004                             |
| BETA-SEC-006 | P0        | В работе      | Добавить двухtenantную и двухклубную IDOR/integration suite      | Tenant A/Store A не читает, не изменяет и не экспортирует Tenant B/Store B через list, UUID, filters, aggregates, exports, attachments, BFF или jobs                                                                                                                        | BETA-SEC-003, BETA-SEC-004, BETA-OPS-002 |
| BETA-SEC-007 | P0        | В работе      | Удалить известный production QA/seed риск                        | Известные credentials не работают; QA не Platform Admin; все сессии отозваны; seed отказывается работать с production DB и создаёт случайные local credentials                                                                                                              | BETA-SRC-002                             |
| BETA-SEC-008 | P0        | В работе      | Добавить fail-closed startup validation и разделить secrets      | Production не запускается с отсутствующими, placeholder, короткими или повторно используемыми JWT, PII, HMAC, integration, referral и scheduler secrets; opaque invite tokens генерируются случайно и хранятся только как hash; ротация secrets версионирована              | BETA-SRC-002                             |
| BETA-SEC-009 | P0        | В работе      | Сделать принятие приглашения атомарным                           | Invite привязан к email; один conditional claim; 100 параллельных запросов создают ровно одного пользователя; изменение email/role/stores/TTL ротирует token                                                                                                                | BETA-SEC-008                             |
| BETA-SEC-010 | P0        | Запланировано | Усилить B2B authentication                                       | Rate limit и progressive backoff на login/invite; password reset; revoke sessions; MFA либо эквивалентное усиление Platform Admin; security headers проверяются deploy smoke                                                                                                | BETA-SEC-008, BETA-IAM-004               |

### 5.3. Tenant lifecycle, entitlements и provisioning

| ID           | Приоритет | Статус        | Задача                                                           | Критерии приёмки                                                                                                                                                                                                                                                                                                                                                                    | Зависимости                                             |
| ------------ | --------- | ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| BETA-TEN-001 | P0        | В работе      | Разделить operational lifecycle и customer stage                 | Существуют lifecycle `ACTIVE/SUSPENDED/ARCHIVED` и отдельный stage `INTERNAL/PILOT/BETA/LIVE`; сохраняются cohort, trial dates, support owner и onboarding state                                                                                                                                                                                                                    | BETA-SRC-002                                            |
| BETA-TEN-002 | P0        | В работе      | Добавить tenant/store entitlements                               | Полный атомарный профиль первого теста содержит пять product rows `gamification`, `assortment`, `staff`, `communications`, `users_roles` и supporting row `integrations`; initial state для всех шести — `read/write=ON`, `outbound=OFF`; изменения имеют revision, reason, expiry и audit, а outbound включается только отдельным workflow                                         | BETA-TEN-001                                            |
| BETA-TEN-003 | P0        | В работе      | Реализовать idempotent shell-only Platform Admin provisioning    | Service candidate атомарно создаёт `PILOT/SUSPENDED/PROVISIONING` tenant, неактивный Store, OWNER override, полный six-row профиль и canonical owner-email reservation, но не создаёт `User/UserInvite`, token, mail/outbox и не запускает trial; `CURRENT_170` replay использует immutable locator без raw email; локальный PostgreSQL PASS, exact-head CI/review pending; historical `CURRENT_169` принят на `f5d39fd...` / CI `30467882578`, `3/3 PASS`; HTTP route остаётся `503` до protected activation и production-like evidence | BETA-TEN-001, BETA-TEN-002, BETA-IAM-004A, BETA-IAM-004F |
| BETA-TEN-004 | P0        | В работе      | Ввести единый `TenantExecutionPolicy`                            | External HTTP routes fail-closed сопоставлены с module/action; reusable fresh-PostgreSQL admission поддерживает cross-module requirements; login, invites, BFF/files, guest/Telegram, schedulers, sync, messages, rewards и exports принимают тот же policy; `INTERNAL` имеет только временный entitlement bypass; неизвестный route/action запрещён                                | BETA-TEN-002, BETA-SEC-003                              |
| BETA-TEN-005 | P1        | Запланировано | Расширить Platform Admin cockpit                                 | Видны stage, trial, entitlement, owner invite, onboarding, stores, source freshness, sync errors, last activity, support owner и incidents                                                                                                                                                                                                                                          | BETA-TEN-003, BETA-OPS-010                              |
| BETA-TEN-006 | P0        | Запланировано | Реализовать offboarding и retention workflow                     | Suspend/archive отзывает invites/sessions, выключает integrations и jobs; data export/delete/retention выполняются по утверждённой процедуре и аудируются                                                                                                                                                                                                                           | BETA-TEN-004                                            |
| BETA-TEN-007 | P0        | Запланировано | Поддержать безопасную смену tenant slug                          | Старые QR, Telegram и guest URLs имеют контролируемый alias/redirect либо перевыпускаются; alias не позволяет обратиться к чужому tenant                                                                                                                                                                                                                                            | BETA-SEC-003                                            |
| BETA-TEN-008 | P0        | В работе      | Реализовать persisted GO, activation/suspend и execution fencing | Signed gate attestations и tenant admission decision привязаны к exact SHA/environment/schema/profile; activation запускает trial и атомарно создаёт invite/outbox; `executionRevision` fencing не позволяет job/provider effect после suspend commit; emergency suspend не зависит от stale GO                                                                                     | BETA-TEN-003, BETA-TEN-004, BETA-IAM-004A, BETA-OPS-004 |

### 5.4. Пользователи и роли

| ID            | Приоритет | Статус        | Задача                                                    | Критерии приёмки                                                                                                                                                                                                                                                                                                           | Зависимости                                            |
| ------------- | --------- | ------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| BETA-IAM-001  | P0        | В работе      | Утвердить role/capability matrix обязательного beta scope | Для OWNER, ADMIN, network manager, club manager и сотрудников перечислены разрешённые действия во всех пяти обязательных контурах; deny-by-default                                                                                                                                                                         | BETA-SEC-004                                           |
| BETA-IAM-002  | P0        | В работе      | Реализовать явный network-level и club-level scope        | `NETWORK` и `STORES` — явные режимы; отсутствие `UserStoreAccess` не повышает пользователя до NETWORK; смена scope действует сразу на API, BFF, exports, files и активные сессии                                                                                                                                           | BETA-SEC-003, BETA-IAM-001                             |
| BETA-IAM-003  | P0        | В работе      | Ограничить полномочия управляющего actor                  | Store manager не может создать NETWORK user, назначить чужой store, выдать роль/capability выше собственной или управлять пользователем вне пересечения scopes; защищены self-escalation и последний OWNER                                                                                                                 | BETA-IAM-001, BETA-IAM-002                             |
| BETA-IAM-004  | P0        | В работе      | Завершить invite/resend/revoke workflow                   | Для external tenant generic direct-create, invite issue/rotation и email change остаются fail-closed; verified workflow доставляет opaque token только на bound mailbox, не возвращает raw URL tenant actor, резервирует normalized email под lock, аудирует send/resend/revoke/accept и отклоняет revoked/expired token   | BETA-SEC-009, BETA-IAM-003                             |
| BETA-IAM-004A | P0        | В работе      | Реализовать initial OWNER identity outbox                 | Migrations 167..170 дают case-insensitive `IdentityEmailClaim`, persisted provenance/revocation, immutable privacy-safe activation locator и seven-RPC candidate при zero runtime table privileges; legacy reconciliation выделен в `BETA-IAM-004B`, design-partner writer isolation — в `BETA-IAM-004D`, transport — в `BETA-IAM-004E`, locator — в `BETA-IAM-004F`; до готовности initial OWNER остаются sealed issue-by-locator, encrypted leased outbox/verified delivery и protected reissue/resend; до deploy настраиваются отдельные production HMAC/encryption secrets; raw email/token/URL/ciphertext отсутствуют в responses/logs/audit | BETA-SEC-008, BETA-SEC-009, BETA-TEN-001, BETA-TEN-002, BETA-IAM-004E..004F |
| BETA-IAM-004B | P0        | В работе      | `IDENTITY_LEGACY_RECONCILIATION_V1`                       | Принятое evidence `CURRENT_169` остаётся historical prerequisite, но не переиспользуется после migration 170. Inventory manifest обновлён на exact `CURRENT_170`: `workflowLocator` не выдаётся reader role, новый function/constraint/index/trigger входят в catalog authority; fresh exact-head CI/review и production-like inventory ещё обязательны. Любой User, включая inactive, остаётся owner-кандидатом, invite — только live candidate; bound claim + `NULL` provenance, collision/mismatch/invalid email блокируют, terminal history не получает synthetic revision; evidence aggregate-only и HMAC-bound; production inventory, proposal/apply/rollback отсутствуют и запрещены; обе admin route остаются `503` | BETA-SEC-007..009, BETA-IAM-004A, BETA-IAM-004F |
| BETA-IAM-004C | P0        | Запланировано | Включить tenant-owned employee invites и email change     | Только после 004A/004B/004E OWNER может выдавать scope-bounded invites; email change требует password step-up, reservation, confirmation, `authVersion` revoke и уведомления на old/new mailbox; owner transfer остаётся отдельным workflow                                                                                | BETA-IAM-002..005, BETA-IAM-004A, BETA-IAM-004B, BETA-IAM-004E |
| BETA-IAM-004D | P0        | Готово        | `DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1`              | Legacy design-partner CLI `provision`/`rotate-invite` и оба exported writer entrypoint fail-closed с `DESIGN_PARTNER_IDENTITY_WRITER_DISABLED` до чтения manifest, загрузки/создания Prisma client, обращения к БД или генерации token; exact package operator namespace содержит только guarded CLI, URL builder и legacy write bodies отсутствуют; `status` только читает уже существующие isolated fixtures, emergency `suspend` только сужает эффекты; arbitrary repository/DB-owner execution не входит в этот checkpoint и требует отдельной runtime-role/credential границы; в принятом historical checkpoint schema, exact six-RPC runtime allowlist и обе `503` admin route не изменялись. Local unit/boundary `23/23 PASS`, independent review — `PASS` без actionable P0/P1/P2; implementation exact-head `f4224072f60507bd97f8e49440e3bda89ffe2aaa`, CI `30483184102` (`run #41`) — `3/3 PASS`, включая PostgreSQL 16 writer-isolation lifecycle. Production, account и invites не изменялись | BETA-IAM-004A, BETA-IAM-004B                          |
| BETA-IAM-004E | P0        | Готово        | `INVITE_SECRET_TRANSPORT_V1`                              | На historical `CURRENT_169` canonical URL имеет вид `/register#invite=<43-char base64url>`; gate capture/scrub выполняется до session/preview и хранит token только в ephemeral memory; preview/accept используют fixed same-origin POST+BFF/API body, streaming/API parser limit `4 KiB`, strict JSON/origin/fields/token и allowlisted preview projection; legacy token path и query fallback отсутствуют, malformed token отклоняется до DB. External generic invite и обе shared-beta admin route остаются fail-closed/`503`. Residual `INTERNAL` create/reissue всё ещё раскрывает fragment-only `registrationUrl` авторизованному actor/UI, но ответы имеют private no-store; это не verified delivery. На том milestone outbox/locator/initial OWNER и production proxy/CSP/mail-client acceptance были pending; external pilot `NO-GO`. Local API focused `68`, route e2e `6`, web runtime `7` — `PASS`; final independent review — `PASS` без actionable P0/P1/P2; implementation exact-head `f09383563bbcc22e11e0e67ca597360cf8996f4b`, CI `30488598755` (`run #43`) — `3/3 PASS`. Production, account и invites не изменялись | BETA-IAM-004, BETA-SEC-008..010 |
| BETA-IAM-004F | P0        | В работе      | `MIGRATION_170_ACTIVATION_LOCATOR`                        | `IdentityEmailClaim.workflowLocator` — immutable opaque UUID, initial value выводится из server-generated reservation и сохраняется при transition; PII-free sealed assert выполняет bounded lookup → canonical advisory lock → exact row recheck, не возвращает email и не расширяет table/column grants. Runtime candidate имеет exact seven-RPC allowlist, shell replay больше не передаёт raw email в assert. Populated `169 → 170`, clean `170/170`, fail-closed rollback любого legacy subject не в exact lowercase trimmed UUID (включая uppercase/whitespace), runtime ACL и shell PostgreSQL проверены локально; exact-head CI/review pending. Locator не является authority и не закрывает issue/outbox/activation; production и tester account не изменялись | BETA-IAM-004A, BETA-IAM-004B, BETA-SEC-008..009 |
| BETA-IAM-005  | P0        | В работе      | Ограничить особо чувствительное повышение привилегий      | Generic users/invites API не назначает OWNER; добавление/смена OWNER выполняется только отдельным атомарным owner-transfer workflow; Platform Admin нельзя назначить tenant API                                                                                                                                            | BETA-IAM-001, BETA-IAM-003                             |
| BETA-IAM-006  | P0        | Запланировано | Свести backend/frontend permission maps                   | Один источник или contract-test подтверждает одинаковые роли, capabilities и nav visibility; скрытый UI не заменяет API authorization                                                                                                                                                                                      | BETA-IAM-001                                           |
| BETA-IAM-007  | P0        | Запланировано | Добавить журнал доступа и управление сессиями             | Владелец видит активных пользователей и security events своей сети; может блокировать аккаунт и отзывать его сессии                                                                                                                                                                                                        | BETA-SEC-010                                           |
| BETA-IAM-008  | P1        | Запланировано | Принять multi-network identity model                      | Решено, может ли один email состоять в нескольких независимых tenant; глобальная уникальность `User.email` либо сохранена как явное ограничение первого pilot, либо заменена membership-моделью с миграцией                                                                                                                | BETA-TEN-003                                           |

### 5.5. CI/CD, БД и эксплуатационная надёжность

| ID           | Приоритет | Статус        | Задача                                           | Критерии приёмки                                                                                                                                                                                                                                                                                         | Зависимости                              |
| ------------ | --------- | ------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-OPS-001 | P0        | В работе      | Ввести обязательный CI                           | Frozen install, Prisma validate/generate, API tests/typecheck/build, web lint/typecheck/build и migration check обязательны для merge; CI-команды не изменяют файлы                                                                                                                                      | BETA-SRC-002                             |
| BETA-OPS-002 | P0        | В работе      | Добавить real PostgreSQL integration environment | Все миграции применяются с нуля; smoke использует реальную БД; проверяются tenant/store isolation, provisioning, suspend и ключевые writes                                                                                                                                                               | BETA-OPS-001                             |
| BETA-OPS-003 | P0        | Запланировано | Добавить frontend browser smoke                  | Автоматизированы login, owner invite, store switch/scope, обязательная навигация, ключевой сценарий каждого модуля и logout                                                                                                                                                                              | BETA-OPS-001, BETA-IAM-002               |
| BETA-OPS-004 | P0        | Запланировано | Перейти на immutable release artifact            | API, web и Telegram edge собираются один раз; release manifest содержит SHA/build time/schema; staging и production используют один artifact                                                                                                                                                             | BETA-OPS-001, BETA-SRC-004               |
| BETA-OPS-005 | P0        | В работе      | Реализовать live/ready/version endpoints         | Liveness не зависит от Langame; readiness выполняет DB/schema/storage checks; version показывает exact SHA; внешний probe проверяет web/API/game                                                                                                                                                         | BETA-OPS-004                             |
| BETA-OPS-006 | P0        | В работе      | Зафиксировать безопасную миграционную процедуру  | Migration выполняется атомарно, locks берутся до preflight, lock/statement timeout заданы; есть abort/retry smoke, production-like rehearsal, drift/`_prisma_migrations`, backup/postflight и доказанная N/N-1 либо fix-forward стратегия                                                                | BETA-OPS-002                             |
| BETA-OPS-007 | P0        | Запланировано | Ввести backup/restore и цели восстановления      | Encrypted off-host backup мониторится; выполнен свежий restore в отдельную БД; зафиксированы RPO/RTO; восстановлены все stateful данные                                                                                                                                                                  | BETA-OPS-006                             |
| BETA-OPS-008 | P0        | В работе      | Определить единственного владельца schedulers    | До выделения worker технически разрешён один scheduler owner; есть lease/heartbeat/reclaim; каждый tenant/job до claim и непосредственно перед effect проверяет fresh `TenantExecutionPolicy` и `executionRevision`; denial даёт audited `SKIPPED`, а не cross-tenant failure; graceful shutdown включён | BETA-TEN-004, BETA-TEN-008               |
| BETA-OPS-009 | P0        | Запланировано | Добавить общий reliability envelope Langame      | Каждый request имеет timeout; GET retry только с backoff/jitter; неоднозначные writes не ретраятся и идут в reconciliation; ошибки upstream — 502/503; tenant/domain изолированы                                                                                                                         | BETA-OPS-008                             |
| BETA-OPS-010 | P0        | Запланировано | Добавить минимальную observability               | Correlation/request ID, tenant/source/SHA, structured errors, 5xx/latency, scheduler heartbeat, sync freshness, queue age и reward reconciliation доступны оператору                                                                                                                                     | BETA-OPS-005                             |
| BETA-OPS-011 | P0        | Запланировано | Добавить alerts и incident delivery              | Алерты на failed deploy/readiness/backup, 5xx, stale sync, dead-letter, scheduler gap и reward anomalies доставляются ответственному; тестовая тревога подтверждена                                                                                                                                      | BETA-OPS-007, BETA-OPS-010               |
| BETA-OPS-012 | P0        | Запланировано | Реализовать атомарный deploy и rollback          | API/web/schema не остаются в смешанной версии; хранится N-1 artifact; rollback drill и failed-readiness rollback фактически выполнены                                                                                                                                                                    | BETA-OPS-004, BETA-OPS-005, BETA-OPS-006 |

### 5.6. Обязательный модуль: геймификация

| ID                | Приоритет | Статус        | Задача                                                            | Критерии приёмки                                                                                                                                                                                                                                | Зависимости                     |
| ----------------- | --------- | ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| BETA-MOD-GAME-001 | P0        | Запланировано | Провести полный route/action inventory геймификации               | Каждый B2B/B2C/API/BFF/Telegram route сопоставлен с entitlement, capability, tenant/store scope, audit и тестом; необозначенных public writes нет                                                                                               | BETA-TEN-002, BETA-IAM-001      |
| BETA-MOD-GAME-002 | P0        | Запланировано | Закрыть B2B management journey                                    | OWNER/authorized manager создаёт, изменяет, запускает и останавливает rules, missions, Battle Pass, lootboxes и rewards только в разрешённых stores                                                                                             | BETA-MOD-GAME-001, BETA-SEC-006 |
| BETA-MOD-GAME-003 | P0        | Запланировано | Закрыть guest journey                                             | Регистрация, выбор клуба, профиль, XP, задания, Battle Pass, lootbox, wallet/reward history, unsubscribe и Telegram Mini App работают внутри выбранного active tenant/store                                                                     | BETA-MOD-GAME-001, BETA-TEN-004 |
| BETA-MOD-GAME-004 | P0        | Запланировано | Завершить безопасный reward ledger path                           | Idempotency, immutable reward plan, wallet, entitlement, posting, outbox, dead-letter и reconciliation исключают двойную или потерянную награду                                                                                                 | BETA-OPS-002, BETA-OPS-009      |
| BETA-MOD-GAME-005 | P0        | Запланировано | Сделать canary tenant/store-scoped                                | `OFF → SHADOW → CANARY → LIVE` и kill switch доступны по tenant/store/rule; откат не требует deploy; write-back начинается только после reconciliation gate                                                                                     | BETA-TEN-002, BETA-MOD-GAME-004 |
| BETA-MOD-GAME-006 | P0        | Запланировано | Добавить game isolation and concurrency suite                     | Проверены cross-tenant/store, повтор события, параллельное открытие, лимиты, restart, stale leases, replay и неоднозначный Langame write                                                                                                        | BETA-SEC-006, BETA-MOD-GAME-004 |
| BETA-MOD-GAME-007 | P0        | Запланировано | Закрыть module browser QA и performance                           | Все admin/guest/mobile/Telegram критические сценарии проходят; нет unbounded responses; журнал и diagnostics позволяют расследовать событие по trace ID                                                                                         | BETA-OPS-003, BETA-OPS-010      |
| BETA-MOD-GAME-008 | P0        | Запланировано | Убрать hardcoded pilot-store и сделать readiness per tenant/store | В коде и runbook нет специального поиска клуба `1337`; оператор явно выбирает tenant/store; readiness проверяет mapping, timezone/geo/public slug, auth channel, freshness facts, scheduler owner и отсутствие unresolved ledger reconciliation | BETA-MOD-GAME-001, BETA-OPS-008 |
| BETA-MOD-GAME-009 | P0        | В работе      | Ввести durable provider-delivery protocol                         | Один Store-scoped claim primitive обслуживает direct и bot paths; generation/lease/revisions, immutable attempt, typed event, provider/workload authority, reaper/reconcile и terminal CAS исключают duplicate/unsafe send; legacy paths hard-denied; populated `165 → 166`, old-worker cutoff и tenant/store concurrency matrix зелёные | BETA-MOD-GAME-001, BETA-TEN-008, BETA-OPS-002 |

### 5.7. Обязательный модуль: ассортимент и товары

| ID                  | Приоритет | Статус        | Задача                                              | Критерии приёмки                                                                                                                                                                                      | Зависимости                              |
| ------------------- | --------- | ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-MOD-ASSORT-001 | P0        | Запланировано | Провести полный route/action inventory ассортимента | Dashboard, products, movements, categories/triage, suppliers, reports, imports и utilities имеют entitlement, capability, tenant/store scope, audit и тест                                            | BETA-TEN-002, BETA-IAM-001               |
| BETA-MOD-ASSORT-002 | P0        | В работе      | Закрыть products/catalog legacy и pagination        | Anonymous доступ отсутствует; legacy `/products` ограничен или выведен; большие списки paginated; история не агрегируется без ограничений в памяти                                                    | BETA-SEC-001, BETA-MOD-ASSORT-001        |
| BETA-MOD-ASSORT-003 | P0        | Запланировано | Проверить категории, suppliers и массовые операции  | CRUD, merge, mapping, bulk category и supplier actions tenant-scoped, обратимы где требуется и аудируются                                                                                             | BETA-SEC-006, BETA-MOD-ASSORT-001        |
| BETA-MOD-ASSORT-004 | P0        | Запланировано | Закрыть imports и product parsing                   | Preview не изменяет данные; apply транзакционен и идемпотентен; файл и результат tenant-scoped; ошибки строк доступны без утечки данных                                                               | BETA-OPS-002, BETA-MOD-ASSORT-001        |
| BETA-MOD-ASSORT-005 | P0        | Запланировано | Проверить все отчёты и exports по stores            | OOS, ABC, LFL, turnover, matrix, recommendations, sales и supplier reports используют разрешённый scope; суммы UI/API/export совпадают                                                                | BETA-SEC-003, BETA-MOD-ASSORT-001        |
| BETA-MOD-ASSORT-006 | P0        | Запланировано | Реализовать staged Langame onboarding ассортимента  | Diagnostics → выбор четырёх stores → catalog/categories → inventory/sales → 7 дней → reconciliation → 30–90 дней backfill → daily sync                                                                | BETA-OPS-009, BETA-CUT-001               |
| BETA-MOD-ASSORT-007 | P0        | Запланировано | Ввести data-quality gate ассортимента               | Для каждого клуба сверены stores, SKU, остатки, операции и выручка; freshness видна; расхождение ≤1% либо документировано доменное исключение                                                         | BETA-MOD-ASSORT-006, BETA-OPS-010        |
| BETA-MOD-ASSORT-008 | P0        | Запланировано | Закрыть module browser QA и performance             | Ключевые экраны и tables работают на production-like объёме; тяжёлые отчёты bounded/async; export имеет лимиты и понятный прогресс                                                                    | BETA-OPS-003, BETA-MOD-ASSORT-005        |
| BETA-MOD-ASSORT-009 | P0        | Запланировано | Завершить 360° карточку товара и историю            | Карточка показывает идентичность, категории, поставщиков, store-level остатки/продажи/движения, историю переименований и источники; scope применяется до totals/history, deep link и export проверены | BETA-MOD-ASSORT-001, BETA-MOD-ASSORT-005 |

### 5.8. Обязательный модуль: сотрудники

| ID                 | Приоритет | Статус        | Задача                                              | Критерии приёмки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Зависимости                      |
| ------------------ | --------- | ------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| BETA-MOD-STAFF-001 | P0        | Запланировано | Провести полный route/action inventory staff        | Все staff pages/API/BFF, exports, attachments и schedulers сопоставлены с entitlement, capability, tenant/store/staff scope, audit и тестом                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | BETA-TEN-002, BETA-IAM-001       |
| BETA-MOD-STAFF-002 | P0        | Запланировано | Закрыть directory и identity mapping                | Сотрудник, LeetPlus user, store и Langame identity связаны без cross-tenant/store утечки; ручная замена и rollback аудируются                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | BETA-SEC-006, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-003 | P0        | В работе      | Закрыть задачи, templates и recurring rules         | Direct tasks, templates CRUD/launch, recurring actor HTTP, guarded integrity inventory, aggregate-only reconciliation planner, schema-only DB EXPAND, snapshot admission и SYNTHETIC proposal dry-run имеют `IMPLEMENTED_CANDIDATE`: persisted scope, scoped aggregates/options/mutation responses, Tenant/Rule/Template/Store/participant lock/recheck, shared materializer, Store-timezone interactive due, atomic task/run/catalog audit, 43-code read-only legacy gate, classification `8 proposal + 29 operator + 6 review`, exact Git-bound states `BASELINE_156 / EXPAND_162`, schema gate `162/latest/unfinished 0 + 14 composite exact + 14 simple exact + 0 expected-FK mismatch + 0 unexpected protected FK + 5 indexes exact + 0 index mismatch`, четыре enabled internal trigger на каждый expected FK, пять concurrent parent indexes и 28 `NOT VALID` FK. Admission schema `v2` требует loopback-only isolated snapshot и exact least-privilege доступ к девяти логическим relations: table-level `SELECT` на восьми разрешённых relations и только column-level `SELECT` на `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`; planner/proposal schema остаются `v1`. Exhaustive PostgreSQL 16.13 smoke покрывает все 8 proposal codes, 8 occurrences, 7 cases и двухпричинный last-task coalescing; все negative ACL gates пройдены. Independent Ed25519 verifier, database marker, freshness и exact Git-blob binding реализованы, но pinned authority roots намеренно пусты, поэтому `PRODUCTION_LIKE` остаётся fail-closed `NO-GO`. HMAC не является authority; synthetic name/reference — доверенная декларация harness/operator, а не provenance proof или Gate 2 evidence; apply path отсутствует. Scheduler/all-tenant HTTP и production-like execution остаются `NO-GO`. До `Готово` остаются protected root enrollment/signer/acquisition, approved production-like admission/inventory/reconciliation/apply, VALIDATE/CONTRACT/deploy, scheduler lease/lifecycle/entitlement, global timezone policy, task/shift DB invariant и полная A1/A2/B API/BFF/browser suite | BETA-OPS-008, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-004 | P0        | Запланировано | Закрыть shift workspace и shift reports             | Сотрудник видит свою смену и назначенные процессы; manager — разрешённые stores; drafts/send/history не выходят за scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | BETA-MOD-STAFF-002, BETA-IAM-002 |
| BETA-MOD-STAFF-005 | P0        | Запланировано | Закрыть регламенты и чек-листы                      | Draft/publish/archive, targeting, acknowledgements, snapshots, execution, review и reports работают по role/store; опубликованная история неизменяема                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | BETA-MOD-STAFF-001               |
| BETA-MOD-STAFF-006 | P0        | Запланировано | Закрыть знания, обучение и аттестации               | Knowledge base, courses, onboarding, tests, assessments, profiles и readiness корректно target-ятся; результаты и read receipts защищены                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | BETA-MOD-STAFF-001, BETA-IAM-002 |
| BETA-MOD-STAFF-007 | P0        | Запланировано | Закрыть контроль, рейтинги, мотивацию и дисциплину  | Staff-control, operations dashboard, ratings, signals, warnings и penalties имеют понятный источник, право просмотра/изменения, комментарий и audit; нет автоматических внешних санкций или Langame write-back                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | BETA-MOD-STAFF-002, BETA-SEC-005 |
| BETA-MOD-STAFF-008 | P0        | Запланировано | Закрыть salary planning                             | Schemes, periods, rows, adjustments и exports tenant/store-scoped; расчёт воспроизводим; изменения денег аудируются; доступ отделён отдельной capability; система не выполняет выплаты                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | BETA-MOD-STAFF-001, BETA-SEC-005 |
| BETA-MOD-STAFF-009 | P0        | В работе      | Защитить attachments и evidence                     | Upload/download/delete проверяют parent resource, tenant/store/task access; тип/размер ограничены; URL не открывает чужой файл; lifecycle, quarantine и retention определены в `docs/security/access-scope/v1/attachment-acl-rollout.md`; фактический checkpoint — `attachment-acl-implementation-checkpoint.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | BETA-MOD-STAFF-001, BETA-SEC-006 |
| BETA-MOD-STAFF-010 | P0        | Запланировано | Проверить AI-assistant как безопасную функцию staff | Только локальный deterministic режим; нет внешней отправки PII; вывод не изменяет задачи/регламенты/обучение без подтверждения                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | BETA-MOD-STAFF-001               |
| BETA-MOD-STAFF-011 | P0        | Запланировано | Добавить staff end-to-end regression                | OWNER, network manager, club manager и employee проходят свои сценарии; запрещённые stores, зарплата, дисциплина, exports и attachments дают deny                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | BETA-SEC-006, BETA-OPS-003       |

Current-state уточнение `BETA-MOD-STAFF-003`: перечисленные в строке
`EXPAND_162` gate и старые SHA являются frozen/historical evidence. Protected
StaffTask prefix остаётся 162, но current production-like
admission/inventory/planner для текущего implementation candidate допускается
только на `CURRENT_170` — exact prefix
плюс allowlisted migrations
`20260728120000_tenant_execution_control_plane_expand` и
`20260728150000_tenant_execution_revision_fence` и
`20260729120000_store_background_execution_fence` и
`20260729160000_guest_game_delivery_claim_fence` и
`20260729190000_identity_email_claim_foundation` и
`20260729210000_identity_email_claim_write_boundary` и
`20260729230000_identity_invite_writer_boundary` и
`20260729233000_identity_activation_locator`. Исторический exact
engineering prerequisite `CURRENT_165` на
`4bd6a036df16579f68b2c96a14b6475c8311b231` принят по зелёному remote CI
`30428288353`; documentation/evidence successor
`7c20adec4ee7cb0a390f1e38ec8e7dd333fa367f` также прошёл remote CI
`30429463161`. Оба SHA являются historical `CURRENT_165` evidence.
Предыдущий `CURRENT_168` принят на exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` по GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS` только как historical prerequisite. Engineering exact-head
`CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят по GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578),
`3/3 PASS`, и independent review без новых P0/P1. Exact-head CI/review
`CURRENT_170` и production-like evidence ещё pending. Strict acquisition
contract, root lifecycle и detached
`prepare → external sign → finalize` реализованы как candidate; реальный
public root намеренно не enrolled. Статус остаётся `В работе / NO-GO`.

### 5.9. Обязательный модуль: коммуникации

| ID                 | Приоритет | Статус        | Задача                                              | Критерии приёмки                                                                                                                                                                                                                                                                                                                                          | Зависимости                                          |
| ------------------ | --------- | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| BETA-MOD-COMMS-001 | P0        | Запланировано | Провести полный route/action inventory коммуникаций | Overview, team chat, channels, messages, notifications, events и CRM contact tasks имеют entitlement, capability, tenant/store scope, audit и тест                                                                                                                                                                                                        | BETA-TEN-002, BETA-IAM-001                           |
| BETA-MOD-COMMS-002 | P0        | В работе      | Закрыть audience, membership и message scope        | Для network announcements задана явная audience policy: при необходимости они могут читаться store staff того же tenant, но не дают NETWORK-полномочий; store/custom channel ограничен разрешёнными clubs/members; UUID, SSE, mentions, receipts, attachments и task-from-chat не раскрывают чужие объекты и не создают задачу для всей сети/чужого store | BETA-SEC-006, BETA-MOD-COMMS-001                     |
| BETA-MOD-COMMS-003 | P0        | Запланировано | Закрыть notifications и background delivery         | Generate/read/acknowledge/resolve соблюдают scope и lifecycle; suspend останавливает внешнюю доставку; повтор не дублирует сообщение                                                                                                                                                                                                                      | BETA-TEN-004, BETA-OPS-008                           |
| BETA-MOD-COMMS-004 | P0        | Запланировано | Защитить CRM contact tasks и PII                    | Contact data masked by default; reveal/export — отдельные capabilities и audit; пользователь не получает гостя или задачу другого store                                                                                                                                                                                                                   | BETA-SEC-005, BETA-MOD-COMMS-001                     |
| BETA-MOD-COMMS-005 | P0        | Запланировано | Добавить communications end-to-end regression       | Проверены chat send/read, channel boundaries, notifications, contact task, suspend и reconnect для network/club/staff roles                                                                                                                                                                                                                               | BETA-OPS-003, BETA-MOD-COMMS-002, BETA-MOD-COMMS-003 |

### 5.10. Cutover четырёх текущих клубов одной сети

| ID           | Приоритет | Статус        | Задача                                                  | Критерии приёмки                                                                                                                                              | Зависимости                              |
| ------------ | --------- | ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-CUT-001 | P0        | В работе      | Зафиксировать topology manifest текущей сети            | Записаны current tenant ID, четыре store ID, Langame domain/mapping, users, roles, sources, public links и контрольные суммы; подтверждено, что это одна сеть | BETA-SRC-002                             |
| BETA-CUT-002 | P0        | Запланировано | Провести backup и restore rehearsal перед cutover       | Snapshot успешно восстановлен отдельно; подтверждены row counts и контрольные бизнес-суммы; известны время и процедура возврата                               | BETA-OPS-007, BETA-CUT-001               |
| BETA-CUT-003 | P0        | Запланировано | Подготовить cutover runbook и окно изменения            | Есть owner, freeze, stop jobs, SQL/API steps, verification, rollback, коммуникация и stop conditions; dry-run выполнен                                        | BETA-CUT-002, BETA-OPS-012               |
| BETA-CUT-004 | P0        | Запланировано | Перевести operational `demo` в реальный tenant in place | Сохранены tenantId и все FK; изменены name/slug/domain/stage/entitlements; четыре stores, users, продажи, inventory, staff и game data не потеряны            | BETA-TEN-002, BETA-TEN-007, BETA-CUT-003 |
| BETA-CUT-005 | P0        | В работе      | Удалить зависимость operational данных от имени `demo`  | Anonymous fallback не использует реальный tenant; seed не очищает его; jobs/config/routes не полагаются на slug `demo`                                        | BETA-SEC-001, BETA-SEC-007, BETA-CUT-004 |
| BETA-CUT-006 | P0        | Запланировано | Обновить guest/QR/Telegram links и sessions             | Старые ссылки контролируемо перенаправлены либо перевыпущены; Telegram/guest login работает на новом slug; устаревшие сессии отозваны                         | BETA-TEN-007, BETA-CUT-004               |
| BETA-CUT-007 | P0        | Запланировано | Выполнить staged sync и reconciliation четырёх клубов   | Все четыре stores выбраны явно; catalog/inventory/sales/staff/game sources проверены; контрольные суммы и freshness приняты по каждому клубу                  | BETA-MOD-ASSORT-006, BETA-OPS-009        |
| BETA-CUT-008 | P0        | Запланировано | Провести full-scope acceptance текущей сети             | Для каждой обязательной области выполнены owner/network manager/club manager/employee/guest сценарии; scope подтверждён на четырёх stores                     | Все BETA-MOD-\* P0                       |
| BETA-CUT-009 | P0        | Запланировано | Выдержать internal alpha                                | Семь последовательных дней без P0/P1 launch incident, потерянного sync, дубликата награды, cross-scope доступа и необработанного critical alert               | BETA-CUT-008, BETA-OPS-011               |

### 5.11. Onboarding, feedback и расширение теста

| ID             | Приоритет | Статус        | Задача                                     | Критерии приёмки                                                                                                                                                                        | Зависимости                                  |
| -------------- | --------- | ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| BETA-PILOT-001 | P0        | Запланировано | Реализовать persisted onboarding checklist | Owner invite, network/stores, Langame diagnostics, mapping, initial sync, reconciliation, users/roles, modules, support и acceptance сохраняются со статусами и audit                   | BETA-TEN-003                                 |
| BETA-PILOT-002 | P0        | Запланировано | Реализовать in-product feedback            | С каждой страницы отправляется category/severity/message с tenant/user/role/route/SHA/request ID/browser; screenshot только opt-in; бизнес-данные и PII не прикладываются автоматически | BETA-OPS-010                                 |
| BETA-PILOT-003 | P0        | Запланировано | Добавить feedback inbox и workflow         | Platform operator видит new/triaged/planned/fixed/closed, tenant, cohort, release и ответ; критичные обращения создают alert                                                            | BETA-PILOT-002, BETA-OPS-011                 |
| BETA-PILOT-004 | P0        | Запланировано | Добавить privacy-safe activation telemetry | Видны provisioned → invite accepted → diagnostics → first sync → validation → first module action → second user → D7 return; без raw PII                                                | BETA-PILOT-001, BETA-OPS-010                 |
| BETA-PILOT-005 | P0        | Запланировано | Подготовить pilot package                  | С юристом согласованы pilot terms/data processing/retention/offboarding; готовы quickstart, role guide, module test script, known issues и support contacts                             | BETA-TEN-006                                 |
| BETA-PILOT-006 | P0        | Запланировано | Подготовить support и incident process     | Назначены primary/backup owner; severity и escalation; critical acknowledgment ≤2 рабочих часов; status updates, export/delete и incident templates готовы                              | BETA-OPS-011                                 |
| BETA-PILOT-007 | P0        | Запланировано | Подключить friendly cohort                 | Две независимые сети, суммарно 3–5 клубов, provisioned раздельно; обязательные модули доступны; не более одного нового tenant каждые 3–4 дня                                            | BETA-CUT-009, BETA-PILOT-001, BETA-PILOT-005 |
| BETA-PILOT-008 | P0        | Запланировано | Провести 14-дневную внешнюю когорту        | Нет security incident и открытых launch-blocking P0/P1; sync success ≥98%; freshness ≤24 ч; каждый tenant повторил целевой workflow две недели подряд                                   | BETA-PILOT-007                               |
| BETA-PILOT-009 | P1        | Запланировано | Запустить открытый заявочный тест          | Public application не создаёт tenant автоматически; оператор проверяет fit и capacity; provisioning выполняется штатным workflow; cohorts и stop conditions соблюдаются                 | BETA-PILOT-008                               |

### 5.12. Прогресс реализации — 26.07.2026

Работа ведётся в изолированной ветке `codex/open-beta-hardening`, созданной от
канонического `origin/main` (`b04bff58d2b08152c0e5a86316a3db19b5617370`).
Исходный расходящийся worktree сохранён отдельной safety-веткой, bundle и
working-tree patch. Текущий production и operational tenant с четырьмя клубами
не изменялись.

Реализован первый hardening-срез:

- operational dashboard, products, stores, categories и suppliers больше не
  используют optional auth или неявный tenant `demo`;
- чтения обязательной B2B-границы требуют JWT и server-side capability;
- совпадение системной роли больше не обходит mapped capability;
- операции bonus ledger получили отдельную capability и жёсткий потолок
  `OWNER/ADMIN/MANAGER`;
- production startup fail-closed проверяет независимые secrets, release SHA,
  build time, latest migration и точное количество миграций;
- добавлены `/health/live`, `/health/ready` и `/version`; readiness проверяет
  PostgreSQL, unfinished migrations, ожидаемые revision и count;
- demo seed требует явную development-аттестацию, отказывается от production,
  remote DB без fingerprint и operational slugs `demo`/`public-demo`, создаёт
  случайные OWNER credentials и выполняется одной транзакцией;
- добавлен CI baseline: frozen install, Prisma validate/generate, database
  scripts typecheck, seed-safety tests, security boundary lint, focused/full
  API tests, API/web typecheck/build/lint, production config contract и
  PostgreSQL 16 migration smoke;
- migration smoke сравнивает БД с полным набором миграций release artifact, а
  не только проверяет наличие хотя бы одной миграции.

Локальная проверка среза:

- focused security/config/health: 7 suites, 101 test — pass;
- полный API regression: 63 suites, 1356 pass, 2 todo;
- API typecheck и build — pass;
- web typecheck — pass; lint: 0 errors, 30 существующих warnings;
- seed-safety: 9/9 — pass; database scripts/seed TypeScript — pass;
- все 150 миграций применены с нуля в изолированной PostgreSQL-схеме с
  `lock_timeout=5s` и `statement_timeout=120s`;
- exact DB smoke подтвердил latest
  `20260726110000_reconcile_completed_reward_wallet` и count `150`; временная
  схема после проверки удалена.

Оставшиеся границы этого среза:

- workflow ещё не включён как required check в protected `main`;
- внешний probe, storage readiness, immutable artifact и rollback не готовы;
- перед production-разделением encryption/signing keys нужен аудит
  фактических legacy keys, dual-read/dual-verify либо согласованная
  инвалидизация старых сессий, invites и referral links;
- известные production QA credentials и активные сессии требуют отдельной
  операционной ротации;
- legacy `/products` ещё требует pagination/bounding;
- основной текущий P0-блокер — `BETA-SEC-003`/`BETA-IAM-002`: явный
  persisted `NETWORK|STORES` scope и единый deny-by-default `AccessScope`.

### 5.13. Прогресс реализации — 27.07.2026

Реализован второй P0-срез AccessScope без изменения production и operational
tenant:

- schema-only EXPAND зафиксирован отдельным локальным candidate
  `28724008192442c03f35fcc46ff7de78cdead642`, strict application — отдельным
  candidate `df993a9d04fdb48809868555b0d040d52848e3ee`; оба не deployed;
- создан версионируемый пакет документации: ADR, нормативный контракт, phased
  migration/rollback runbook, module adoption matrix, test strategy, детальный
  staff/communications adoption plan и шаблон release evidence;
- добавлены nullable persisted `User.accessScope` и
  `UserInvite.accessScope` для безопасной EXPAND-фазы;
- legacy user/invite с непустым allow-list классифицируется как `STORES`, а
  пустой список остаётся `NULL` до явного решения; автоматического назначения
  `NETWORK` нет;
- PostgreSQL deferred constraints запрещают cross-tenant
  `UserStoreAccess` и store rows у `NETWORK`; DB smoke использует два
  синтетических tenant; migration обёрнута в одну транзакцию, берёт locks до
  preflight и задаёт lock/statement timeout;
- `JwtAuthGuard` перечитывает mode и store rows на каждом запросе, отвергает
  `NULL`, `STORES[]`, противоречивый NETWORK, duplicates и cross-tenant links;
  JWT grants не являются authority;
- users/roles/invites стали первым enforced consumer: list ограничен exact
  actor scope, store manager не выдаёт NETWORK/чужой store, global role writes
  требуют NETWORK, self-scope change запрещён;
- закрыта выдача custom/system role выше capabilities actor;
- accept invite использует conditional compare-and-set по состоянию и
  `updatedAt`; create/update используют email-bound opaque token, update
  ротирует token, update/cancel используют CAS, а общий список не возвращает
  registration URL;
- update пользователя использует optimistic CAS по `tenantId` и `updatedAt`;
  при конкурентном изменении API возвращает conflict вместо перезаписи;
- последний active system `NETWORK OWNER` защищён tenant-scoped advisory
  transaction lock: деактивация, снятие OWNER, переход в STORES и назначение
  custom role запрещены, если другого active NETWORK OWNER нет;
- frontend отправляет explicit scope, по умолчанию выбирает `STORES`, требует
  хотя бы один клуб, не показывает NETWORK store-scoped actor и не открывает
  сетевой редактор ролей club-level actor;
- guest/Telegram synthetic actors получили exact club scope, а сетевые
  gamification schedulers и scheduled reports выбирают только persisted
  NETWORK actor.

Проверка второго среза:

- AccessScope/IAM focused: 12 suites, 153 tests — pass;
- полный API regression: 66 suites, 1393 pass, 2 todo;
- API production typecheck и build — pass;
- production environment contract — pass;
- web typecheck и production build — pass; lint: 0 errors, 30 существующих
  warnings;
- Prisma validate/generate — pass;
- все 151 migration с нуля и два PostgreSQL smoke — pass;
- временная схема удалена, локальная PostgreSQL остановлена.

Оставшиеся границы до завершения `BETA-SEC-003`/`BETA-IAM-002`:

- production topology manifest и ручная классификация аккаунтов четырёх клубов
  ещё не выполнялись;
- migration остаётся EXPAND: поля nullable до завершения classification/shadow;
- schema-only EXPAND и strict application activation должны быть отдельными
  releases; auto-deploy объединённого bundle запрещён до классификации;
- `SHADOW` только журналирует попытку unclassified subject и продолжает deny;
  общего tenant/module switch и mismatch audit ещё нет;
- AccessScope ещё должен быть подключён ко всем staff/attachments/chat,
  gamification, assortment/report/import surfaces;
- inventory подтвердил tenant-wide риски generic attachments, chat/SSE,
  shift reports, directory/PII, tasks/exports, notifications и staff
  aggregates; точные пути, backfill и exit criteria зафиксированы в
  `docs/security/access-scope/v1/staff-communications-adoption-plan.md`;
- resend/revoke audit, session revoke и 100-way accept concurrency test ещё
  не закрыты;
- нормативные audit reason codes и same-tenant нормализация invite store IDs на
  уровне БД ещё не завершены;
- внешний доступ по-прежнему `NO-GO`.

### 5.14. Bounded implementation checkpoint — staff и communications

Candidate второго прикладного среза:
`764a9d7d7d5712e0283e0fca787a75829f95a240` (не deployed).

Проверки предыдущего attachment baseline до `STAFF_TASK`-изменений:

- focused security/API: 16/16 suites, 191/191 tests — pass;
- full API: 70/70 suites, 1 432 passed, 2 todo, 1 434 total — pass;
- API boundary lint, typecheck и production build — pass;
- web targeted/full lint — 0 errors, 30 ранее существовавших warnings;
- web typecheck и production build — pass;
- production environment contract — pass;
- финальный независимый security-review: `COMMIT-SAFE` для bounded-среза.

Срез не меняет продуктовую модель запуска: четыре текущих клуба остаются
четырьмя `Store` одной сети в одном `Tenant`; состав первой внешней когорты
остаётся полным и включает геймификацию, ассортимент и товары, сотрудников,
in-app коммуникации, а также пользователей и роли только в пределах своей
сети или разрешённых клубов.

В bounded candidate реализовано:

- staff directory: server-side `AccessScope` для list, summary, store/user
  options, direct member lookup, active shifts и create/update; запрещённый
  explicit store filter возвращает `403`, out-of-scope member маскируется
  `404`, переход в чужой/null store требует `NETWORK`; Langame identity
  создаётся, меняется или очищается только `NETWORK`, а полный Langame detail
  для `STORES` не запрашивается; update защищён CAS по tenant/store/updatedAt;
- staff notifications: store predicate для list, summary, options,
  acknowledge/resolve; interactive tenant-wide sync разрешён только
  `NETWORK`, а actor endpoint не запускает tenant-wide generation для
  `STORES`;
- team-chat core: единый актуальный scope для channel list/report/direct/live
  state и message list/count/latest/unread/read/create/update; store membership
  и client filter не расширяют разрешённые клубы; `STORES` получает
  `CUSTOM`-канал только через membership; SSE reconnect выполняет повторную
  HTTP-аутентификацию;
- attachment delivery hardening: private/no-store и nosniff headers в API/BFF,
  безопасный inline allow-list, принудительный download для active/unknown
  content types.

Это только `IMPLEMENTED_CANDIDATE`, а не завершение модульных строк и не
разрешение внешнего доступа. Открыты как минимум:

- attachment-to-resource ACL schema и read-only inventory теперь реализованы в
  следующем checkpoint, но apply-backfill/reconciliation, adoption всех parent
  kinds, quarantine workflow и staged strict activation остаются открыты;
- lifecycle custom channel membership, полный member/mention recipient
  policy и доказательство того, что membership не открывает чужие сообщения
  или вложения;
- audit/backfill существующих Langame identity bindings и отдельная
  PII/reveal policy;
- отдельный system/worker execution context и фактическое подключение
  background producers уведомлений;
- reconciliation старых chat messages и их store/audience;
- frontend controls, BFF/browser/SSE/file regression;
- real PostgreSQL и API IDOR tests на topology двух tenant и нескольких
  stores.

Широкие строки `STAFF-01..04` и `COMMS-01..02` остаются `INVENTORY`, пока не
закрыты все их route/action/job/file поверхности и required evidence.
Release decision остаётся `NO-GO`.

### 5.15. Attachment ACL implementation checkpoint — 27.07.2026

Создан канонический checkpoint:
`docs/security/access-scope/v1/attachment-acl-implementation-checkpoint.md`.
Candidate не deployed, exact release SHA будет назначен после review/commit.

Топология и продуктовый scope не менялись:

- четыре текущих клуба — четыре `Store` одного `Tenant`;
- первый внешний tenant должен получить полный контур геймификации,
  ассортимента/товаров, сотрудников, in-app коммуникаций и users/roles;
- каждый actor ограничен своим tenant и `NETWORK` либо явными
  `allowedStoreIds`;
- изолированные внешние сети создаются отдельными tenant.

Реализовано в текущем attachment candidate:

- fail-closed lifecycle `PENDING/BOUND/UNRESOLVED/QUARANTINED`,
  many-to-many parent binding, same-tenant parent/blob checks, deferred
  cardinality invariant и serialization concurrent delete;
- четыре последовательные attachment migrations
  `20260727110000`, `20260727111000`, `20260727112000`,
  `20260727113000`; полный artifact содержит 155 миграций, latest —
  `20260727113000_staff_attachment_acl_invariant_hardening`;
- upload создаёт exact-uploader `PENDING` с TTL 24 часа;
- chat create/update и новые shift-report uploads транзакционно dual-write
  legacy relation + `CHAT_MESSAGE` binding и compare-and-set
  `PENDING → BOUND`;
- download сначала проверяет metadata/lifecycle/live parent ACL и только потом
  читает blob; foreign/out-of-scope/orphan/unresolved/quarantined маскируются
  одинаковым `404`;
- shift-report draft/send больше не расширяет store scope; frontend передаёт в
  binder только свежие uploads текущей editor session, а legacy URL остаётся
  неавторитетной текстовой копией;
- generic attachment route использует union только attachment-related
  capabilities, после чего всё равно выполняется parent ACL;
- реализован всегда read-only inventory scanner: одна read-only
  `REPEATABLE READ` snapshot transaction, bounded keyset pages, secondary
  coverage chat body/task description/checklist/checklist answers, production
  attestation и privacy-safe aggregate output;
- добавлен process-wide
  `STAFF_ATTACHMENT_ACL_MODE=LEGACY|SHADOW|ENFORCED`: production требует
  explicit mode, local/test default — `ENFORCED`, CI startup contract —
  `SHADOW`;
- `LEGACY` сохраняет tenant-only read только для внутреннего перехода;
  `SHADOW` вычисляет strict decision и пишет safe mismatch, но отдаёт legacy
  result и не quarantine expired pending; `ENFORCED` включает parent ACL и TTL
  quarantine;
- CI проверяет scanner contract, все 155 migrations, ready/valid concurrent
  indexes, lifecycle/tenant invariants и реальную гонку удаления последних
  bindings.

Текущая chat policy, которую attachment reader наследует без упрощения:

- `NETWORK` manager-level actor видит non-gamification `CUSTOM` channel без
  membership;
- gamification `CUSTOM` требует membership;
- `STORES` actor видит `CUSTOM` только через membership, которое не расширяет
  allowed stores;
- `STORE` message обязан соответствовать store канала.

Проверки candidate:

- focused API: 19 suites, 230/230 tests — pass;
- full API: 73 suites, 1 471 passed, 2 todo, 1 473 total — pass;
- API boundary lint, typecheck и production build — pass;
- web typecheck/build — pass; lint: 0 errors, 30 существующих warnings;
- clean PostgreSQL schema: 155/155 migrations — pass;
- exact migration/latest smoke, AccessScope smoke и attachment ACL smoke,
  включая two-client concurrent-delete race — pass;
- read-only inventory на clean schema — pass; временная schema удалена.

P0 остаётся `В работе`:

- strict reader реализован для `CHAT_MESSAGE`; shift report использует этот
  parent. `STAFF_TASK` transactional bind и strict reader добавлены следующим
  candidate; focused/full API, API/web builds, PostgreSQL smoke и real task
  race/rollback integration пройдены;
- `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`,
  `TRAINING_COURSE`, `ONBOARDING_PLAN` имеют schema и inventory coverage, но их
  producer bind и authoritative reader pending;
- apply-backfill/reconciliation command, production-like inventory текущего
  tenant, manual quarantine resolution, retention/delete/revoke,
  tenant/store canary orchestration, mismatch aggregate gate и full
  API/BFF/browser A1/A2/B suite ещё отсутствуют;
- `ENFORCED` нельзя активировать до inventory/backfill/adoption/canary: legacy
  blobs имеют `UNRESOLVED` и будут закрыты, а unsupported parent kinds останутся
  недоступны;
- внешний beta запрещён в `LEGACY` и `SHADOW`.

Операционная деталь: concurrent-index migrations запускаются с session
`PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=120000"`. После deploy
оба индекса обязаны иметь `indisready=true` и `indisvalid=true`. Invalid index
удаляется только точной `DROP INDEX CONCURRENTLY` вне transaction, после чего
exact failed Prisma migration помечается rolled back и повторяется. Полный
runbook находится в attachment checkpoint.

Release decision остаётся `NO-GO`.

### 5.16. `STAFF_TASK` parent adoption candidate — 27.07.2026

Следующий P0-срез реализован в рабочем candidate и проходит проверку:

- task list, quick/summary/groups и export используют один persisted
  `AccessScope`;
- explicit запрещённый store filter отклоняется, а direct update/comment по
  скрытому UUID маскируется как `404`;
- для `STORES` store-bound task доступна только в `allowedStoreIds`, а
  null-store task — только exact assignee или нормализованному observer;
- participant target берётся только из authoritative persisted store scope:
  для `STORES` это подмножество разрешённых actor stores с обязательным
  доступом к конкретному task store; platform admins исключены из selector и
  assignment;
- direct create требует один store у task и assigned shift, а direct update
  повторяет application-level equality check через transaction client после
  parent lock; read fail-closed скрывает shift вне `allowedStoreIds`;
- create/update не могут назначить store вне scope; `STORES` не может делать
  structural PATCH null-store task, однако exact assignee/observer может
  комментировать такую задачу и выполнять разрешённые self-service status
  transitions;
- manager-only status transitions требуют `manage_staff_tasks`; role без этой
  capability не получает управляющие полномочия;
- обычный create допускает только `OPEN`; assignment labels принадлежат серверу,
  grouped task нельзя переназначить single-assignee PATCH, а candidate
  `ANY_OF` нельзя удалить из observers;
- update/comment берут row lock на parent task и после lock повторяют visibility,
  store/shift/final-participant и status checks через transaction client;
- freshly uploaded task evidence передаётся как `attachmentIds`, а canonical
  internal URL без binding не принимается как новое полномочие;
- task comment и `STAFF_TASK` binding создаются в одной транзакции; binder
  повторно проверяет tenant, uploader, lifecycle и TTL;
- strict attachment reader перечитывает live task и применяет тот же
  tenant/store/assignee/observer predicate и capability;
- web хранит ID только свежего upload текущей формы; ручное изменение URL
  сбрасывает pending binding intent.

Проверки финального task candidate:

- focused CI: 21 suite, 302 tests — pass;
- task service/access-scope tests: 63 tests — pass;
- full API: 74 suite, 1 526 passed, 2 todo, 1 528 total — pass;
- API boundary lint, production typecheck и build — pass;
- web lint (0 errors, 30 existing warnings), typecheck и webpack production
  build (203 pages) — pass;
- clean PostgreSQL: 155 migrations и attachment ACL smoke с реальным
  `STAFF_TASK` binding/derived store — pass;
- real PostgreSQL task security: A1→A2 race и два transactional rollback —
  3/3 pass; временные schema удалены.

Это `IMPLEMENTED_CANDIDATE`, а не закрытие `BETA-MOD-STAFF-003` или
`BETA-MOD-STAFF-009`. Открыты revoke/delete semantics, production-like A1/A2/B
API/BFF/browser/file integration, templates/recurring/background paths и
DB/inventory invariant для legacy task/shift mismatch внутри двух разрешённых
stores. Обычный transaction-client recheck ещё не сериализует конкурентное
изменение `GuestWorkingShift.storeId`, `User` или `UserStoreAccess`: до
DB-контракта либо согласованных reference-row locks это остаётся P1 и не
считается постоянным инвариантом. Route/job inventory templates/recurring
зафиксирован в
`docs/security/access-scope/v1/staff-task-catalog-adoption-plan.md`. Остальные parent kinds
`CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`, `TRAINING_COURSE` и
`ONBOARDING_PLAN` ещё не adopted.

Топология и состав первой когорты неизменны: четыре текущих клуба являются
четырьмя `Store` одного `Tenant`; первый beta tenant получает полные модули
геймификации, ассортимента/товаров, сотрудников, in-app коммуникаций и
users/roles только в пределах собственного tenant и разрешённых clubs.

Release decision остаётся `NO-GO` до завершения остальных parent kinds,
inventory/backfill/reconciliation, activation/operations gates и полного Gate 2.

### 5.17. Task templates и catalog audit candidate — 27.07.2026

Создан фактический checkpoint:
`docs/security/access-scope/v1/staff-task-catalog-implementation-checkpoint.md`.
Production deployment не выполнялся.

Реализовано:

- единая catalog policy для template/rule/run/store/participant predicates;
- template rows, scoped task counts, full summary, store/user options и creator
  projection ограничены persisted `NETWORK | STORES`;
- create/update перечитывают persisted actor scope в транзакции;
- update/launch блокируют template, повторяют visibility и проверяют final
  active Store/status;
- `STORES` не создаёт global template, hidden UUID даёт `404`, forbidden filter
  — `403`;
- launch только из `ACTIVE`; store-bound template нельзя переопределить другим
  Store или null;
- template launch использует общий безопасный task materializer, включая
  assignee, observers, role policy, server labels, task audit и notification;
- массивы template tags не теряются при single assignment;
- `UsersService` использует согласованный lock order
  `User → UserStoreAccess`, поэтому concurrent scope revoke не образует прежний
  deadlock с catalog mutation;
- добавлена additive migration
  `20260727120000_staff_task_catalog_audit_expand`;
- create/update/activate/archive/launch пишут атомарный catalog audit без title,
  email и participant lists;
- UI запускает только active template, фиксирует bound Store и передаёт
  подтверждающих observers.

Проверки:

- Prisma validate/generate — pass;
- clean PostgreSQL schema: 156/156 migrations — pass;
- catalog audit constraints/retention smoke — 5/5 pass;
- real PostgreSQL task race/rollback — 3/3 pass;
- focused API: 24 suites, 341/341 tests — pass;
- full API: 77 suites, 1 565 pass, 2 todo (1 567 total) — pass;
- API/web typecheck, API boundary lint и targeted web lint — pass;
- API production build — pass;
- web webpack production build: 203 pages — pass;
- независимый review не нашёл прямого tenant/store escape в template
  CRUD/launch.

Статус ограничен `IMPLEMENTED_CANDIDATE`. Actor recurring HTTP и общий
Rule/Template/Store/participant lock закрыты следующим checkpoint в разделе
5.18. P1 остаются:

- scheduler и all-tenant HTTP остаются `NO-GO` без lifecycle/entitlement,
  durable lease/fencing и stale reclaim;
- guarded legacy inventory реализован следующим checkpoint в разделе 5.19;
  production-like reconciliation, same-tenant database invariants и политика
  физического удаления Store ещё не закрыты;
- production-like A1/A2/B API/BFF/browser evidence ещё не закрыт.

Топология и состав доступа неизменны: четыре текущих клуба — четыре `Store`
одного `Tenant`; независимые сети получают отдельные tenant; первая когорта
получает целиком геймификацию, ассортимент/товары, сотрудников, in-app
коммуникации и users/roles только в пределах своего tenant/scope.

Release decision остаётся `NO-GO`.

### 5.18. Recurring actor HTTP и background containment candidate — 27.07.2026

Создан фактический checkpoint:
`docs/security/access-scope/v1/staff-task-recurring-http-implementation-checkpoint.md`.
Production deployment и production migration не выполнялись.

Реализовано:

- `GET /staff/task-rules` ограничивает rules, runs, created tasks, stores,
  active templates, users, summary, per-rule counts и PII projections
  persisted scope, включая create/update responses;
- forbidden Store filter даёт `403`, hidden Rule UUID для update/launch —
  `404`;
- create/update перечитывают scope внутри транзакции, блокируют Tenant, Rule
  `FOR UPDATE`, linked Template, Store, participant User и UserStoreAccess,
  затем проверяют final Store, template status/compatibility и authoritative
  assignee;
- `STORES` не создаёт global Rule, inactive Store не используется для новых
  writes, но pause/archive-only остаётся доступен для безопасной остановки;
- create/update/status transitions пишут atomic PII-safe `RULE` catalog audit;
- manual launch использует общий task materializer и не меняет `nextRunAt`;
- interactive `run-due` принимает только `limit/dryRun`, использует server
  time и actor scope, сохраняет реального actor;
- interactive `Run + Task + task audit/notification + Rule schedule + catalog
audit` имеют один commit; duplicate occurrence возвращает generic `SKIPPED`;
- raw legacy run errors и произвольный metadata не возвращаются actor;
- template archive-only разрешён после деактивации Store при отсутствии active
  rules;
- Store-bound schedule вычисляется в IANA timezone клуба; DST gap сдвигается
  вперёд, DST fold создаёт одно earliest occurrence, global/invalid timezone
  имеет детерминированный UTC fallback;
- чистая calendar/IANA/DST логика вынесена в отдельный
  `staff-task-recurring-schedule.ts`; recurring service уменьшен на 387 строк
  относительно стабилизированного pre-extraction diff;
- UI показывает active references, сохраняет inactive legacy selection,
  фиксирует bound Store, отправляет semantic sparse PATCH и не отправляет
  пустые overrides как explicit null;
- status-only pause/archive не сдвигает schedule и остаётся доступен после
  Store/template/participant deactivation без выдачи отозванной PII;
- scheduler provider и scheduled all-tenant controller удалены из
  `StaffModule`, поэтому timer и route отсутствуют в runtime graph;
- scheduler дополнительно включается только explicit
  `STAFF_TASK_RULES_SCHEDULER_ENABLED=true`;
- scheduled controller даже при будущем возврате требует отдельный
  `STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED=true` до проверки token;
- оба флага документированы safe-default `false`.

Предварительные проверки bounded slice:

- recurring actor service unit — 23/23 pass;
- scheduled HTTP fail-closed unit — 6/6 pass;
- scheduler default-off unit — 4/4 pass;
- template lifecycle + scheduler targeted run — 16/16 pass;
- focused API — 27 suites, 375/375 tests — pass;
- full API — 80 suites, 1 599 pass, 2 todo (1 601 total) — pass;
- real PostgreSQL transaction security — 2 suites, 8/8 pass, из них 5
  recurring Rule/Template/Store/participant race/rollback; новый suite
  обязателен в CI;
- API/web typecheck и API boundary/targeted web lint — pass;
- full web lint — 0 errors, 30 существующих warnings;
- API production build — pass;
- web webpack production build — 203 pages — pass.

Initial independent review нашёл шесть launch-blocking P1; они исправлены до
checkpoint-коммита. Финальный independent re-review по стабилизированному diff
не нашёл P0/P1; `git diff --check` — pass.

Статус:

```text
recurring actor HTTP       = IMPLEMENTED_CANDIDATE
scheduler                  = NO-GO / UNREGISTERED
scheduled all-tenant HTTP  = NO-GO / UNREGISTERED
external beta              = NO-GO
```

Следующий P1:

- применить готовый read-only inventory к production-like snapshot, выполнить
  reconciliation и добавить same-tenant/Store deletion DB invariants;
- BFF/browser A1/A2/B negative journeys;
- отдельный system execution context, tenant lifecycle/staff entitlement,
  durable lease/fencing/heartbeat/retry/stale reclaim до любого background
  re-registration;
- явная persisted timezone policy для tenant-global recurring Rule вместо UTC
  fallback до допуска global schedule в первую внешнюю когорту.

Следующий P2:

- различать duplicate occurrence constraint и несвязанный Prisma `P2002`;
- сохранять sanitized persistent FAILED evidence после rollback occurrence;
- добавить real PostgreSQL duel двух actor `run-due` и revoke scope самого
  actor;
- нормализовать manual `datetime-local` через Store timezone и фильтровать UI
  assignee options по выбранному Store;
- заменить `Store.onDelete=SetNull` на подтверждённую inventory миграцией
  same-tenant deletion policy.

Топология и состав доступа неизменны: четыре текущих клуба — четыре `Store`
одного `Tenant`; каждая внешняя сеть получает отдельный tenant; первая когорта
получает полный staff-модуль вместе с геймификацией, ассортиментом,
коммуникациями и users/roles только в своём tenant/scope после Gate 2.

Release decision остаётся `NO-GO`.

### 5.19. Staff task integrity inventory candidate — 27.07.2026

Создан отдельный implementation checkpoint
`56d615437ecfcb90db252016d3e5b83f3f545578` и операционный
`docs/security/access-scope/v1/staff-task-integrity-inventory-runbook.md`.
Production/production-like inventory, data repair и production migration не
выполнялись.

Реализовано:

- `db:inventory:staff-task-integrity` требует explicit
  `development|staging|production`, exact run confirmation и дополнительную
  production attestation;
- соединение принудительно ограничено одним connection с
  `default_transaction_read_only=on`;
- все 43 aggregate проверки выполняются одним SQL statement внутри одной
  `REPEATABLE READ` transaction; scanner повторно устанавливает READ ONLY и
  проверяет фактические `transaction_read_only/isolation`;
- bounded lock/statement/transaction timeout исключают бесконечный scan;
- blocking coverage включает cross-tenant Template/Rule/Task/Run references,
  current Rule/Template Store mismatch, source provenance, active
  Store/Tenant/Template/schedule/timezone, active Rule и unfinished Task
  assignee, stale `STARTED` и threshold `FAILED`;
- review coverage отдельно считает tenant-global Template, исторические
  Task↔mutable catalog Store mismatch и записи, которые текущий
  `Store.onDelete=SetNull` превратит в global;
- отчёт содержит только stable reason code и counts, без UUID, имён, email,
  URL, credentials или свободного row text;
- exit `1` означает contract/database failure, exit `2` — blocking findings,
  review-only результат остаётся exit `0`, но требует owner/решения;
- help/self-test/Node tests включены в application CI; реальный scanner
  запускается после всех миграций в PostgreSQL migration job.

Проверки:

- syntax/help/self-test и contract suite — 9/9 pass;
- Prisma validate и database script typecheck — pass;
- чистая PostgreSQL schema: 156/156 migrations, 43 reason code,
  `PASS`, blocking/review `0/0`;
- намеренная cross-tenant Template→Store fixture:
  `BLOCKED`, exit `2`, blocking/review `1/1`;
- после безопасной локальной reconciliation fixture:
  `REVIEW`, exit `0`, blocking `0`;
- raw fixture identifiers не появились ни в одном report;
- две точные временные test schema удалены, `public` не затрагивалась;
- `git diff --check` и Prettier — pass;
- независимый read-only review не нашёл P0/P1.

Статус на момент inventory checkpoint:

```text
inventory implementation     = IMPLEMENTED_CANDIDATE
production-like inventory    = PENDING / NO-GO
same-tenant DB constraints   = PENDING
scheduler/all-tenant HTTP    = NO-GO / UNREGISTERED
external beta                = NO-GO
```

Остатки:

- добавить real PostgreSQL fixtures для всех критических групп predicate, а
  не только clean schema и проверенную cross-tenant ветку;
- принять семантику `REPEATED_FAILED_RUN`: все failures за окно либо последняя
  непрерывная серия;
- выполнить scanner на восстановленном production-like snapshot;
- разработать отдельный idempotent reconciliation dry-run/apply tool; scanner
  никогда не получает apply-режим;
- после объяснённого zero blocking diff перейти к отдельным
  `EXPAND → VALIDATE → CONTRACT` для same-tenant references и archive-first
  Store deletion policy; текущий EXPAND candidate зафиксирован следующим
  разделом 5.20, но production-like `VALIDATE/CONTRACT` ещё не выполнялись.

Топология и состав первой когорты не изменились: четыре текущих клуба —
четыре `Store` одного `Tenant`; внешняя сеть получает отдельный Tenant; после
Gate 2 доступны полные геймификация, ассортимент/товары, сотрудники,
коммуникации и users/roles только в своём tenant/allowed stores.

Release decision остаётся `NO-GO`.

### 5.20. Staff task same-tenant DB EXPAND candidate — 27.07.2026

Реализован неприменённый schema-only candidate и создан операционный
`docs/security/access-scope/v1/staff-task-integrity-expand-runbook.md`.
Локальный checkpoint:
`dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed. Production-like
inventory/reconciliation, `VALIDATE`, `CONTRACT`, deployment и production
cutover не выполнялись.

Состав migration:

- пять parent keys создаются пятью отдельными однооператорными
  `CREATE UNIQUE INDEX CONCURRENTLY` migrations для
  `Store`, `User`, `StaffTaskTemplate`, `StaffTaskRecurringRule` и
  `StaffTask` по `(tenantId, id)`;
- финальная migration `20260727131000_staff_task_integrity_expand` добавляет
  14 composite same-tenant FK как `NOT VALID`; новые invalid writes
  блокируются сразу, а legacy rows остаются доступными для controlled
  reconciliation;
- migration использует deterministic table locks, `lock_timeout=5s`,
  `statement_timeout=2min` и одну короткую transaction;
- 11 paired legacy non-Store FK swap/re-add’ятся под прежними именами как
  `NOT VALID`: сохраняются 10 `ON DELETE SET NULL` и один
  `Run→Rule ON DELETE CASCADE`, но `ON UPDATE` меняется с `CASCADE` на
  `RESTRICT`;
- идентификаторы Store/User/Template/Rule/Task считаются immutable: прежний
  update cascade мог обойти composite `RESTRICT` при смене parent UUID;
- три legacy Store `SET NULL` FK под прежними именами атомарно пересозданы как
  temporary simple `RESTRICT/RESTRICT NOT VALID` и работают вместе с тремя
  composite `RESTRICT`: same-tenant writes защищены, а legacy cross-tenant
  rows не теряют global-existence защиту и не получают dangling `storeId`;
- прежняя Store `SET NULL` семантика отсутствует; штатный lifecycle-путь —
  deactivate/archive;
- nullable links используют PostgreSQL 15+ column-list
  `ON DELETE SET NULL`, который очищает reference ID, но сохраняет tenant;
  Run→Rule использует composite `CASCADE`;
- Prisma schema отражает пять parent keys, три composite Store relations и
  явный `onUpdate: Restrict` всех 11 simple non-Store relations. Manual
  composite drift Prisma 6.19 включает 11 FK — десять partial `SET NULL` и
  один Run→Rule `CASCADE`; `NOT VALID`/coexistence всех 14 simple
  compatibility FK, включая три temporary Store, остаётся DB-native contract;
- exact diff на свежей 162-migration schema предлагает ровно 14 destructive
  security DROP: 11 non-Store composite + три temporary simple Store FK; он
  не предлагает менять 11 simple non-Store FK. Unrelated pre-existing
  ADD/index-rename drift учитывается отдельно;
- staged smoke запускает diff через `--from-schema-datasource` со scoped env:
  database URL/пароль не передаются в argv, output фиксирует
  `prismaDriftDrops=14`;
- application CI выполняет offline self-test и сканирует все будущие migration
  SQL: guard блокирует DROP/RENAME/ALTER любого из 28 FK,
  `DROP NOT NULL` обязательных contract-колонок, отключение trigger/
  `session_replication_role`, destructive DROP/RENAME/DROP COLUMN на protected
  tables, DROP/ALTER пяти parent indexes, DROP SCHEMA и неожиданные имена
  migration directories;
- exact artifact guard фиксирует migrations `157..161` как пять отдельных
  one-statement `CREATE UNIQUE INDEX CONCURRENTLY`, а migration `162` — как
  одну transaction с `5s/2min` timeout, фиксированным lock order, ровно
  `28 ADD / 14 swap DROP / 28 NOT VALID`;
- для будущих изменений обязательны create-only generation и ручной SQL
  review; `prisma db push` запрещён.

Текущий schema contract:

```text
migration count                = 162
latest migration               = 20260727131000_staff_task_integrity_expand
concurrent parent indexes      = 5
composite NOT VALID FK         = 14
simple compatibility NOT VALID = 14 (11 non-Store + 3 Store)
legacy Store SET NULL policy   = 0
guarded DB-native FK           = 28
Store delete protections       = 3 same-tenant + 3 legacy
immutable parent ID checks     = 5
immutable parent tenant checks = 5
legacy benign update checks    = 14
exact Prisma drift DROP        = 14
```

Локальная verification:

- clean PostgreSQL path применил 162/162 migration;
- database smoke подтвердил exact latest/count; catalog audit smoke — 5/5;
- read-only integrity inventory на clean schema проверил 43 reason code и
  вернул `PASS`, blocking/review `0/0`;
- staged real PostgreSQL smoke создал populated legacy baseline на 156
  миграциях, затем применил ровно шесть migration `157..162`; пять concurrent
  indexes строились на заполненных parent-таблицах, а 14 контролируемых legacy
  violations сохранились после EXPAND;
- все 14 legacy invalid rows после EXPAND успешно прошли benign non-FK update;
- catalog assertions подтвердили пять unique/valid/ready parent indexes,
  14 точных composite и 14 simple compatibility `NOT VALID` FK, delete/update
  actions и parent namespaces/indexes;
- попытка `VALIDATE` каждого из 14 composite FK ожидаемо обнаружила
  соответствующую legacy fixture, а 14 новых invalid writes были отклонены;
- валидный Template→Rule→Task→Run graph, partial `SET NULL` и Run→Rule
  `CASCADE` прошли;
- три Store delete restrictions/archive-first path и ещё три legacy
  cross-tenant Store delete protections прошли без dangling `storeId`;
- пять parent identifier update попыток отклонены: Store/User/Template/Rule/
  Task ID считаются immutable;
- пять parent `tenantId` move попыток также отклонены
  (`parentTenantUpdatesRejected=5`);
- offline self-test подтвердил safety target, migration partition и
  расширенный future-migration DDL guard; unexpected migration directory names
  также запрещены;
- scoped exact Prisma diff внутри smoke подтвердил `prismaDriftDrops=14`;
  unrelated ADD/index-rename drift не включён в security contract, credentials
  отсутствуют в argv;
- seed cleanup повторно проверен на заполненном
  Template→Rule→Task→Run graph;
- Prisma validate/generate, database/API typecheck, seed-safety 9/9,
  focused API 27 suites/375 tests, full API 80 suites/1 599 pass/2 todo и
  boundary lint прошли.

Осознанно не входит:

- production-like inventory и объяснённый reconciliation zero-diff;
- `VALIDATE CONSTRAINT` для 14 FK и последующий `CONTRACT`;
- `StaffTask.shiftId` и DB equality Task↔Shift Store;
- Rule↔Template Store equality и полная source provenance equality;
- динамические assignee active/platform/UserStoreAccess invariants;
- tenant lifecycle/staff entitlement, global timezone и scheduler
  lease/fencing;
- deployment, production migration и выдача внешнего доступа;
- N-1 application rollback не запускает старый seed; `db push` не является
  допустимым release или recovery path; N-1 runtime compatibility не включает
  обновление immutable parent identifiers.

Статус:

```text
same-tenant DB EXPAND       = IMPLEMENTED_CANDIDATE / NOT DEPLOYED
production-like inventory  = PENDING / NO-GO
reconciliation             = PENDING
VALIDATE / CONTRACT        = PENDING
scheduler/all-tenant HTTP  = NO-GO / UNREGISTERED
external beta              = NO-GO
```

Топология и продуктовый состав неизменны: четыре текущих клуба — четыре
`Store` одной сети в одном `Tenant`; каждая внешняя сеть получает отдельный
Tenant. После полного Gate 2 первая внешняя когорта получает полные
геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
users/roles только внутри собственного tenant и разрешённых Store.

Release decision остаётся `NO-GO`.

### 5.21. Staff task aggregate reconciliation planner candidate — 27.07.2026

Реализован следующий bounded checkpoint и создан операционный
[reconciliation plan runbook](./docs/security/access-scope/v1/staff-task-integrity-reconciliation-plan-runbook.md).
Локальный candidate:
`2c74c663780b3f183be708a01431c22efe57a723` — not deployed. Инструмент строит
только агрегированный read-only план; production/production-like запуск,
reconciliation apply и migration deployment не выполнялись.

Safety contract:

- planner использует одно PostgreSQL-соединение и одну
  `READ ONLY REPEATABLE READ` transaction;
- обязательны точные target/confirmation, а для production — отдельная
  attestation; `NODE_ENV=production` не может маскироваться другим target;
- требуется exact 40-character lowercase hex `RELEASE_SHA`;
- HMAC key длиной `32..4096` UTF-8 bytes обязателен и не попадает в output;
- обязательное ожидаемое имя БД проверяется на target и сравнивается с
  фактическим `current_database()` внутри snapshot; оба имени не выводятся;
- report содержит только `databaseIdentityMatched` и domain-separated HMAC
  `databaseIdentityDigest`, рассчитанный из фактических `current_database()`,
  PostgreSQL `system_identifier` и database OID; raw identity не выводится;
- output содержит только 43 stable reason code и aggregate counts без UUID,
  row identifiers, database names, PII, URL, credentials или свободного текста
  строк;
- DML/DDL, row-level plan, `--apply`, backfill и auto-fix отсутствуют;
- `proposal` — только класс будущей работы, а не authorization на mutation.

Классификация полного каталога:

```text
proposal codes = 8
operator codes = 29
review codes   = 6
total codes    = 43
```

`TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` теперь явно `BLOCKING`: незавершённая
tenant-global Task не может быть назначена пользователю с `STORES` scope.
Actionable `maxCandidates` считает только `proposal + operator`; review-only
counts в cap не входят, но остаются в observed/review evidence.

Planner fail-closed проверяет точную DB-фазу:

```text
currentSchemaIsPublic                    = true
databaseIdentityMatched                 = true
migrationCount                           = 162
latestMigration                          = 20260727131000_staff_task_integrity_expand
unfinishedMigrationCount                 = 0
compositeContractMatchCount              = 14
simpleContractMatchCount                 = 14
foreignKeyContractMismatchCount          = 0
unexpectedProtectedForeignKeyCount       = 0
parentIndexContractMatchCount            = 5
parentIndexContractMismatchCount         = 0
```

Exit contract:

- `0` — schema готова, cap соблюдён, blocking findings нет; decision может
  быть `PASS` или `REVIEW`;
- `1` — CLI/env/safety/database error;
- `2` — blocking findings;
- `3` — actionable cap exceeded либо exact schema mismatch.

`contentDigest` — отдельный domain-separated HMAC-SHA256 стабильной
агрегированной части report без
`generatedAt`; он включает `databaseIdentityDigest`, одинаков для одинакового
content из той же БД при другом времени запуска и меняется при смене БД либо
PostgreSQL cluster. `databaseIdentityDigest` различает БД/кластеры, не раскрывая
`current_database()`, `system_identifier` или database OID.
`executionDigest` в своём HMAC-domain подписывает
`{contentDigest, generatedAt}` и
привязывает evidence к snapshot timestamp. Оба значения не являются
row-stable checksum, CAS token или apply authorization: разные строки с теми
же counts могут иметь тот же `contentDigest`. Перед будущим write необходимо
отдельное row-level evidence и повторный lock/recheck.

Planner также fail-closed требует
`summary.inventoryExecuted === schema.ready`. Любое рассогласование
отклоняется с `INVENTORY_EXECUTION_STATE_INVALID`/exit `1`; обычный schema
mismatch имеет `schema.ready=false`, `inventoryExecuted=false`,
`SCHEMA_MISMATCH`/exit `3` и не запускает inventory.

Локальная verification:

- planner syntax/help/self-test и contract unit suite `11/11` — `PASS`;
- clean real PostgreSQL planner на полной schema 162 вернул `PASS`, exact
  schema-first contract `162/latest/0 + 14/14/0/0 + 5/0` и exit `0`;
- source-safety/serialization tests подтвердили aggregate-only output,
  отсутствие identifiers/raw database identity/секретов, строгую
  классификацию, actionable cap, HMAC `databaseIdentityDigest` и разделённые
  `contentDigest`/`executionDigest`;
- contract suite подтверждает, что `databaseIdentityDigest` и
  `contentDigest` меняются для другой БД или PostgreSQL cluster, а нарушение
  `inventoryExecuted === schema.ready` fail-closed отклоняется;
- CI запускает planner contract отдельно и реальный clean planner после
  migrations;
- adversarial PostgreSQL smoke на disposable local/CI clone отдельно
  сохраняет 28 expected FK, добавляет конфликтующий FK с другим именем и
  отдельно подменяет порядок колонок parent index; оба случая дают
  `SCHEMA_MISMATCH`/exit `3`, inventory не запускается, source database не
  меняется, clone удаляется;
- URL с `schema=pg_catalog` сохраняет чтение migration state из
  `public._prisma_migrations`, даёт `SCHEMA_MISMATCH`/exit `3` и не запускает
  inventory;
- EXPAND rehearsal теперь начинается с populated legacy baseline 156 и
  применяет ровно шесть migrations `157..162`; пять concurrent indexes
  действительно строятся на заполненных parent-таблицах;
- после усиленной rehearsal сохранены 14 legacy rows и проходят прежние
  проверки всех 14 composite + 14 simple compatibility FK, 14 invalid writes,
  delete policies, parent UUID/tenant immutability и Prisma drift.

Статус:

```text
aggregate reconciliation planner = IMPLEMENTED_CANDIDATE / READ-ONLY
production-like inventory/plan   = PENDING / NO-GO
SYNTHETIC proposal dry-run        = IMPLEMENTED_CANDIDATE / PASS
PRODUCTION_LIKE row dry-run       = PENDING / NO-GO
explicit apply / zero-diff       = PENDING
VALIDATE / CONTRACT / deploy     = PENDING
external beta                    = NO-GO
```

Следующий P0-порядок:

1. зафиксировать exact candidate SHA и зелёный CI;
2. восстановить свежий production-like snapshot;
3. выполнить исходный inventory и aggregate planner с одинаковыми thresholds,
   exact schema-first gate: `162/latest/unfinished 0`, `14 composite exact`,
   `14 simple exact`, `0 expected-FK mismatch`,
   `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
   проверить `inventoryExecuted === schema.ready`, DB identity binding и
   protected HMAC evidence без raw identity;
4. назначить owner всем non-zero codes; не считать `proposal` разрешением;
5. использовать реализованный synthetic-only proposal dry-run как design
   checkpoint; отдельно спроектировать production-like row dry-run и
   idempotent apply с explicit approval, row locks/recheck, audit и rollback;
6. выполнить dry-run → approved apply → zero-diff dry-run, затем повторить
   inventory/planner;
7. только при zero blocking и принятых review findings репетировать отдельный
   `VALIDATE`; после N-1 window — reviewed `CONTRACT`, затем deployment/canary.

Топология и продуктовый состав неизменны: четыре текущих клуба — четыре
`Store` одной сети в одном `Tenant`; каждая внешняя сеть получает отдельный
Tenant. После полного Gate 2 первая когорта получает полные геймификацию,
ассортимент/товары, сотрудников, in-app коммуникации и users/roles только
внутри собственного tenant и разрешённых Store.

Release decision остаётся `NO-GO`.

### 5.22. Staff task snapshot admission candidate — 27.07.2026

Исторический срез на 27.07.2026; актуальный contract и закрытые P1
зафиксированы в разделе 5.24.

Реализован обязательный checkpoint между получением изолированного snapshot и
любой inventory/reconciliation-репетицией. Операционный контракт зафиксирован
в
[snapshot admission runbook](./docs/security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md).
Исходный admission candidate:
`7d67333b22f171c6e79f723190647cdd2454b128`. Текущий проверенный
интегрированный release SHA:
`dee25393ae7bff171bdd74a49f2d01cdef9ce4ee` — not deployed.

Admission candidate:

- принимает только явные `SYNTHETIC|PRODUCTION_LIKE` и
  `BASELINE_156|EXPAND_162`;
- полностью запрещает remote target и `NODE_ENV=production`; допустим только
  loopback PostgreSQL 16 в изолированном non-production контуре;
- требует exact confirmation, isolation attestation, encrypted artifact
  SHA-256, opaque approval/provenance reference, HMAC key и timeline
  `acquiredAt <= restoredAt < expiresAt`;
- считает TTL от immutable `restoredAt`: до 7 дней для synthetic и до 72 часов
  для production-like;
- для `PRODUCTION_LIKE` требует заранее одобренный
  `databaseIdentityDigest`, рассчитанный из DB name, PostgreSQL
  `system_identifier` и database OID; raw identity не выводится;
- привязывает runtime source и все migration checksums к exact clean Git
  `RELEASE_SHA`; manifest читается из commit blobs, а не из mutable worktree;
- использует одно соединение и одну `READ ONLY REPEATABLE READ` transaction;
- не имеет restore, migrate, export, row-level, apply, auto-fix, `VALIDATE`,
  `CONTRACT` или deploy path.

Dedicated admission role должна иметь `NOINHERIT`, нулевые membership,
ownership и write authority, `CONNECT` только к проверяемой БД, `USAGE` только
на `public` и exact `SELECT` только на девять relations:

```text
_prisma_migrations
Tenant
Store
User
UserStoreAccess
StaffTaskTemplate
StaffTaskRecurringRule
StaffTaskRecurringRuleRun
StaffTask
```

Любой дополнительный relation/column `SELECT`, sequence privilege,
user-function `EXECUTE`, foreign-server `USAGE`, large-object authority,
доступ к другой user schema/DB, ownership, membership или write privilege
даёт `LEAST_PRIVILEGE_ROLE_REQUIRED`/exit `3`.

Exact state gate дополнительно требует четыре включённых PostgreSQL internal
trigger для каждого ожидаемого FK. Отключённый FK trigger теперь является
catalog mismatch даже при совпадающей строке `pg_constraint`.

Verification exact SHA:

- admission contract unit suite: `16/16` — `PASS`;
- offline smoke/source guards: `36` checks — `PASS`;
- реальный PostgreSQL 16 disposable rehearsal: `14` scenarios — `PASS`;
- из commit blobs применены первые 156 migrations, admission
  `BASELINE_156`, затем ровно migrations `157..162` и admission
  `EXPAND_162`;
- проверены exact 9-table role, denied excess SELECT/DML/DDL/FK-trigger
  disable, planner exits `2/3`, stable/timestamp-bound HMAC, tampered
  attestation/migration rejection и отсутствие protected identity в output;
- source aggregate fingerprint не изменился; PUBLIC CONNECT ACL восстановлен;
  advisory lock освобождён; disposable DB, role и migration artifact удалены;
- CI contract и real PostgreSQL smoke добавлены в обязательные jobs;
- финальный independent security rereview integrated release не обнаружил P0;
  оставшиеся P1 относятся к полноте восьми positive fixtures, provenance trust
  boundary вне harness и table-wide `User` SELECT для production-like роли.

Оставшиеся P2/operational ограничения: ACL cleanup smoke выполняется
in-process и допускается только на одноразовом CI-кластере; encryption,
no-egress, acquisition/restore timestamps и destruction требуют отдельной
protected evidence; loopback URL не разрешает фактически remote tunnel/proxy.

Статус:

```text
snapshot admission candidate       = IMPLEMENTED_CANDIDATE
SYNTHETIC PostgreSQL rehearsal     = PASS
remote admission                   = NO-GO
PRODUCTION_LIKE acquisition/restore = NOT EXECUTED
PRODUCTION_LIKE admission          = PENDING / NO-GO
inventory / planner on snapshot    = PENDING
SYNTHETIC proposal dry-run         = IMPLEMENTED_CANDIDATE / PASS
PRODUCTION_LIKE row dry-run        = PENDING / NO-GO
explicit apply / zero-diff         = PENDING / NO-GO
VALIDATE / CONTRACT / deploy       = PENDING / NO-GO
external beta                      = NO-GO
```

Следующий P0-порядок:

1. получить зелёный remote CI для exact SHA;
2. оформить approval, minimization, encryption, no-egress, TTL и destruction
   owner для свежего production-like snapshot;
3. восстановить baseline в отдельный loopback PostgreSQL 16, создать exact
   admission role и получить out-of-band identity digest;
4. выполнить `admission(BASELINE_156)`; при любом exit не `0` остановиться;
5. применить только migrations `157..162`, затем выполнить
   `admission(EXPAND_162)`;
6. только после второго admission запускать read-only inventory и aggregate
   planner, назначать owner каждому non-zero code;
7. использовать synthetic proposal dry-run только как проверенный design
   checkpoint; production-like row dry-run, apply, zero-diff, `VALIDATE`,
   `CONTRACT` и deploy проектировать и утверждать как отдельные последующие
   фазы.

Топология и обязательный beta scope неизменны: четыре текущих клуба остаются
четырьмя `Store` одной сети в одном `Tenant`; каждая внешняя сеть получает
отдельный Tenant. После полного Gate 2 первая внешняя когорта получает полные
геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
users/roles только внутри собственного tenant и разрешённых Store.

Release decision остаётся `NO-GO`.

### 5.23. Staff task SYNTHETIC reconciliation proposal dry-run candidate — 27.07.2026

Исторический срез на 27.07.2026; актуальная exhaustive matrix и authority
boundary зафиксированы в разделе 5.24.

Реализован следующий bounded checkpoint и создан отдельный
[proposal dry-run runbook](./docs/security/access-scope/v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md).
Exact integrated release SHA:
`dee25393ae7bff171bdd74a49f2d01cdef9ce4ee` — clean, not deployed.

Инструмент:

- принимает только harness-managed `SYNTHETIC` fixture в exact `EXPAND_162`;
- запрещает `PRODUCTION_LIKE`, production process, remote target, произвольную
  локальную копию, caller URL options и любой `--apply`;
- повторно выполняет полный Git-bound snapshot admission;
- в отдельной `READ ONLY REPEATABLE READ` transaction получает cluster
  advisory lock и ранние `ACCESS SHARE` locks на все девять relations;
- повторно сверяет exact migration names/checksums, PostgreSQL 16,
  database identity, catalog/FK/index/trigger state, RLS и least privilege;
- требует HMAC-аутентифицированный отдельным harness-ключом synthetic
  provenance manifest,
  связанный с release SHA, DB identity, случайным creation nonce, fixture
  profile, database marker и TTL не более двух часов;
- применяет cap до row evidence, получает не более `maxCases + 1` rows и
  отклоняет aggregate/row count mismatch;
- строит HMAC-псевдонимизированные, execution-unlinkable proposal только для
  восьми разрешённых reason codes;
- объединяет две причины для одного
  `StaffTaskRecurringRule.lastCreatedTaskId`;
- никогда не выводит raw database/tenant/store/user/template/rule/task/run
  identity, PII, URL, credentials, nonce или ключи;
- отклоняет report больше 8 MiB целиком и не выводит partial evidence.

Разрешённые proposal:

```text
TEMPLATE_CREATOR_CROSS_TENANT
RULE_TEMPLATE_CROSS_TENANT
RULE_CREATOR_CROSS_TENANT
RULE_LAST_TASK_CROSS_TENANT
TASK_TEMPLATE_CROSS_TENANT
TASK_RULE_CROSS_TENANT
TASK_CREATOR_CROSS_TENANT
RULE_LAST_TASK_SOURCE_MISMATCH
```

Каждый proposal имеет только символическое действие
`REFERENCE_CLEAR_CANDIDATE`. Оно означает «owner может рассмотреть очистку
nullable reference», а не SQL, mutation, approval, CAS token или разрешение на
apply. Остальные `29 operator` и `6 review` codes остаются aggregate-only.

Exit contract:

```text
0 = completed, blocking operator/proposal findings отсутствуют
1 = CLI/runtime/query/evidence/report-integrity error
2 = blocking findings
3 = admission/schema/privilege/identity/catalog/RLS/cap gate rejected
```

Verification exact integrated SHA:

- dry-run self-test: `20` checks — `PASS`;
- dry-run contract unit suite: `14/14` — `PASS`;
- admission contract unit suite: `16/16` — `PASS`;
- admission offline smoke/source guards: `36` — `PASS`;
- aggregate planner `11/11` и inventory `9/9` — `PASS`;
- database typecheck, Prisma validate, format/diff checks — `PASS`;
- официальный PostgreSQL major `16` disposable rehearsal: `14` scenarios —
  `PASS`;
- подтверждены findings/cap/RLS/concurrent-lock exits, signed provenance,
  tamper rejection, execution unlinkability, protected output, неизменность
  source aggregate fingerprint и полный cleanup disposable DB/role/artifact;
- independent architecture/security review не обнаружил P0.

Оставшиеся P1 и stop conditions:

1. PostgreSQL smoke имеет positive fixture только для
   `TEMPLATE_CREATOR_CROSS_TENANT`; добавить positive fixture для остальных
   семи codes и overlap/coalescing двух last-task причин.
2. Provenance доказывает владение harness-ключом, но не является независимой
   аттестацией, когда caller контролирует env и DB `COMMENT`; standalone и
   production-like запуск запрещены до out-of-band/asymmetric trust boundary.
3. Admission-role пока читает `User` table-wide; до production-like rehearsal
   перейти на column-scoped privilege либо reviewed views.
4. Apply path отсутствует намеренно. Будущий write должен быть отдельным
   idempotent binary с owner approval, immutable input evidence, row
   lock/recheck, audit, rollback и повторным zero-diff.

Статус:

```text
SYNTHETIC proposal dry-run candidate = IMPLEMENTED_CANDIDATE
SYNTHETIC PostgreSQL rehearsal       = PASS / 14 scenarios
all 8 positive PostgreSQL fixtures   = PENDING
standalone/operator-run dry-run      = NO-GO
PRODUCTION_LIKE dry-run              = PENDING / NO-GO
explicit apply / zero-diff           = PENDING / NO-GO
VALIDATE / CONTRACT / deploy         = PENDING / NO-GO
external beta                        = NO-GO
```

Следующий P0-порядок:

1. добавить exhaustive PostgreSQL fixture matrix для всех восьми proposal и
   overlap/coalescing case;
2. получить зелёный remote CI exact integrated SHA и независимый rereview;
3. спроектировать out-of-band provenance и column-scoped evidence access для
   production-like контура;
4. только после отдельного approval восстановить свежий disposable
   production-like snapshot и пройти
   `BASELINE_156 admission → migrations 157..162 → EXPAND_162 admission`;
5. выполнить production-like read-only inventory и aggregate planner,
   назначить owner всем non-zero codes;
6. отдельно спроектировать production-like row dry-run и ещё отдельно —
   idempotent apply;
7. выполнить
   `approved dry-run → approved apply → zero-diff → inventory/planner`,
   затем отдельные `VALIDATE`, N-1 window, `CONTRACT` и deploy decisions.

Топология и обязательный beta scope неизменны: четыре текущих клуба — четыре
`Store` одной сети в одном `Tenant`; каждая внешняя сеть получает отдельный
Tenant. После полного Gate 2 первая внешняя когорта получает полные
геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
users/roles только внутри собственного tenant и разрешённых Store.

Release decision остаётся `NO-GO`.

### 5.24. Staff task exhaustive SYNTHETIC evidence и независимая authority boundary — 28.07.2026

Закрыты три P1 из предыдущего checkpoint: exhaustive PostgreSQL fixtures,
column-scoped доступ к `User` и независимая asymmetric verification boundary.
Runtime candidate SHA:
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — not deployed.
Связанный local test-evidence commit:
`2341b99937e54cc50d1763a0a794d975816c72ce` — not deployed, remote CI
pending.

Реализованный контракт:

- admission report переведён на schema `v2`; aggregate planner и proposal
  report сохраняют schema `v1`;
- реальный PostgreSQL 16.13 rehearsal покрывает все восемь proposal codes:
  `8` occurrences сведены в `7` cases, потому что две last-task причины для
  одного `StaffTaskRecurringRule.lastCreatedTaskId` coalesce в один case;
- least-privilege admission role получает table-level `SELECT` ровно на
  восьми разрешённых relations и column-level `SELECT` только на
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`; это девять
  логических relations, но не table-wide `User SELECT`;
- negative gates отклоняют отсутствующий grant, лишние User columns,
  table-wide `User SELECT`, table/column grant option, `PUBLIC SELECT`,
  запрещённые DML/DDL/TEMP/membership/ownership и физически переименованный
  authority column;
- proposal parity, exact reason counts, cap boundary, execution
  unlinkability, отсутствие raw identity/canary и двухпричинный coalescing
  проверены реальными fixtures;
- source data до и после smoke совпали; временная mutation cluster ACL
  восстановлена, disposable database/role удалены;
- отдельный verify-only Ed25519 verifier связывает approved authority
  manifest с release SHA, database identity, artifact digest, approval,
  marker и freshness; runtime дополнительно сверяет exact Git blob content;
- pinned public authority roots намеренно пусты. Это fail-closed состояние:
  без reviewed root enrollment и защищённого signer/acquisition контура
  `PRODUCTION_LIKE` authority не может быть сформирована или принята;
- HMAC digest и HMAC report integrity остаются средствами
  псевдонимизации/целостности, но не authority и не provenance;
- production-like admission report получает доверие только как
  same-process evidence и намеренно non-transferable. Сериализованный report
  сам по себе не может подтвердить authority; для защищённой передачи нужен
  связанный подписанный manifest/evidence record;
- exact synthetic database name и `synthetic:` approval reference ограничивают
  harness-контракт, но `SYNTHETIC` остаётся доверенной декларацией
  harness/operator. Это не автоматическое доказательство происхождения данных,
  не production-like provenance и не Gate 2 evidence.

Verification runtime/test evidence:

```text
PostgreSQL                  = 16.13
smoke scenarios             = 23 / PASS
proposal codes/occurrences  = 8 / 8
proposal cases              = 7
last-task coalescing        = 2 reasons -> 1 case / PASS
logical relations           = 9
table-level relation SELECT = 8
User column SELECT          = id, tenantId, isPlatformAdmin, isActive, accessScope
negative ACL gates          = PASS
source data unchanged       = PASS
temporary cluster ACL       = restored
admission report schema     = v2
planner/proposal schema     = v1
public-only pinned path     = LOCAL PASS
historical admission suite  = 19/19 PASS
historical authority suite  = 9/9 PASS
test evidence commit        = 2341b99937e54cc50d1763a0a794d975816c72ce
```

Статус:

```text
exhaustive SYNTHETIC fixtures       = PASS
column-scoped User evidence access  = IMPLEMENTED_CANDIDATE
independent Ed25519 verifier        = IMPLEMENTED_CANDIDATE
pinned production authority roots  = EMPTY / FAIL-CLOSED
positive pinned-path integration   = LOCAL PASS / TEST EVIDENCE 2341b999
remote CI including test evidence  = PASS / d77c7439
remote CI for exact authority SHA  = REQUIRED / RELEASE EVIDENCE
PRODUCTION_LIKE admission           = PENDING / NO-GO
PRODUCTION_LIKE inventory/planner   = PENDING / NO-GO
PRODUCTION_LIKE row dry-run         = PENDING / NO-GO
explicit apply / rollback/zero-diff = PENDING / NO-GO
VALIDATE / CONTRACT / deploy        = PENDING / NO-GO
current-network cutover             = PENDING / NO-GO
external beta                       = NO-GO
```

Следующий список сохранён как историческая детализация прежнего security/data
slice. Он полностью заменён актуальной последовательностью раздела 7 и не
используется как operational runbook:

1. считать `2341b999...`/`044ceca2...` historical evidence; назначить exact
   current candidate SHA и получить для него зелёный remote CI и независимый
   review;
2. независимо проверить реализованный detached authority candidate, утвердить
   внешний signer/HSM, separation of duties, key custody и защищённый
   acquisition-to-signature transport;
3. отдельным reviewed release enrol Ed25519 public root; затем после
   approval/minimization/encryption/no-egress/TTL/destruction controls
   получить свежий disposable production-like snapshot и подписанный
   authority manifest с marker/freshness/artifact binding;
4. отдельно выполнить production-like admission: подписанный state-bound
   `BASELINE_156` envelope → exact DB marker → admission → migrations
   `157..162` → новый `EXPAND_162` envelope с новым nonce-bound binding →
   marker rotation → второй admission → exact allowlisted migrations
   `163..166`, включая
   `20260729160000_guest_game_delivery_claim_fence` → новый `CURRENT_166`
   envelope/marker → current admission.
   Protected StaffTask
   prefix остаётся 162; предыдущие envelope/marker не переиспользовать; любой
   non-zero exit или
   marker/freshness/blob/authority/ACL mismatch останавливает работу;
5. только после всех state-specific admission отдельно выполнить read-only
   inventory и aggregate planner на current DB 166, назначить owner каждому
   non-zero code;
6. отдельно спроектировать, утвердить и выполнить production-like row
   dry-run с protected row evidence; synthetic/HMAC report не засчитывать;
7. отдельным изменением реализовать explicit idempotent apply с immutable
   input, owner approval, row lock/recheck, audit и rollback; затем отдельно
   доказать zero-diff и повторить inventory/planner;
8. только после zero blocking и принятых review findings принимать отдельные
   решения по `VALIDATE`, N-1 window, `CONTRACT` и deployment.

Все последующие platform/module prerequisites, `Gate 2A`, dry-run и cutover
выполняются только в порядке раздела 7. Этот локальный список не является
альтернативной последовательностью и не разрешает cutover.

Топология и обязательный beta scope неизменны. После полного Gate 2 первая
внешняя когорта получает полные геймификацию, ассортимент/товары, сотрудников,
in-app коммуникации и users/roles только внутри собственного tenant и
разрешённых Store. Каждая независимая внешняя сеть получает отдельный Tenant.

Release decision остаётся `NO-GO`.

### 5.25. Public-only pinned-path test evidence — 28.07.2026

Runtime-контракт не изменён и остаётся привязан к candidate
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`. Отдельный test-evidence commit
`2341b99937e54cc50d1763a0a794d975816c72ce` добавляет только positive
pinned-path fixture и admission test coverage; это не production root
enrollment, не production-like admission и не разрешение на deployment.

Локально подтверждено:

- public-only fixture содержит Ed25519 public key и заранее подписанный
  envelope, но не содержит private key, key generation или signing API;
- production registry остаётся exact frozen `{}`; test root подменяется только
  в отдельном spawned child process;
- реальный pinned wrapper создаёт process-private branded authority;
- positive path связывает marker и nonce-bound database identity;
- marker mismatch и expiry на generation/emission/verification отклоняются;
- detached `structuredClone` report не наследует private same-process evidence
  и не получает успешный exit;
- admission contract suite: `19/19` — `LOCAL PASS` на Node.js 22.

Границы evidence:

- public-only test evidence входит в полностью зелёный remote CI exact SHA
  `d77c74393c510b688f9f2a5c43eaa908390450b5`;
- `node:test` module mock требует experimental Node.js 22 flag. Это `P2`
  test-infrastructure risk: он не расширяет production authority, но требует
  отдельного контроля совместимости CI/runtime upgrades;
- fixture не является signer, acquisition evidence, production-like snapshot
  или Gate 2A evidence;
- pinned production authority roots остаются `EMPTY / FAIL-CLOSED`, поэтому
  `PRODUCTION_LIKE` и внешний beta остаются `NO-GO`.

Исторический порядок ниже полностью заменён разделом 7:

1. считать `2341b999...` historical test evidence; назначить current candidate
   SHA и получить для него зелёный remote CI и независимый review;
2. независимо проверить detached authority candidate и получить зелёный CI
   exact SHA; утвердить внешний signer/HSM, separation of duties и key custody;
3. отдельным security change enrol reviewed public root, затем получить свежий
   approved production-like snapshot через protected acquisition/evidence
   boundary;
4. выпустить отдельный signed `BASELINE_156` envelope, установить его exact
   marker и пройти первый admission;
5. применить только migrations `157..162`, выпустить новый signed
   `EXPAND_162` envelope с новым nonce-bound identity, выполнить marker
   rotation и второй admission; baseline envelope/marker reuse запрещён;
6. применить exact allowlisted migrations
   `20260728120000_tenant_execution_control_plane_expand`, затем
   `20260728150000_tenant_execution_revision_fence`, затем
   `20260729120000_store_background_execution_fence`, затем
   `20260729160000_guest_game_delivery_claim_fence`, выпустить отдельный
   `CURRENT_166` envelope, снова ротировать marker и пройти current admission;
   StaffTask protected prefix остаётся 162;
7. затем отдельно проходить inventory/planner на current DB 166, row dry-run,
   apply/rollback/zero-diff и последующие Gate 2A/Gate 2 этапы из раздела 7.

Топология и обязательный beta scope не меняются: четыре текущих клуба остаются
четырьмя `Store` одного существующего `Tenant`; первая внешняя когорта после
Gate 2 получает полные геймификацию, ассортимент/товары, сотрудников, in-app
коммуникации и users/roles только внутри собственного tenant и разрешённых
Store.

Release decision остаётся `NO-GO`.

### 5.25.1. Detached authority operations candidate — 29.07.2026

Зафиксирован следующий security/data slice для `BETA-MOD-STAFF-003`,
`BETA-OPS-002` и `BETA-OPS-006`:

- canonical acquisition request schema `v1` связывает exact release SHA,
  schema state, snapshot artifact digest, restored DB identity, TTL не более
  72 часов, четыре разные actor reference и обязательные
  encryption/no-egress/disposable/destruction controls;
- production-like approval reference больше не является произвольной строкой:
  допускается только derived `acquisition-v1:<SHA-256 request digest>`;
- public root registry получил lifecycle `ACTIVE/RETIRED/REVOKED`,
  единственный active root, canonical JSON history, actual parent→HEAD CI
  transition gate, guarded rotation/emergency revoke-to-zero/recovery и
  supersession без cycle;
- LeetPlus выполняет только detached ceremony
  `prepare → external Ed25519 sign → finalize`, не принимает private key,
  passphrase, HSM PIN или signing secret и не подключается к БД/сети;
- `finalize` обязательно перечитывает тот же canonical request и пересчитывает
  request/approval/DB identity/state/artifact/release/timeline binding; valid
  signature для другого request отклоняется;
- каждая output-пара (`package+payload` и `receipt+envelope`) создаётся в своём
  одном внешнем protected каталоге без overwrite и с `fsync`; каталоги двух
  фаз могут различаться; payload/envelope публикуются последними как readiness
  files, ADS paths запрещены, caught partial write очищается;
- admission release binding включает acquisition/root-lifecycle/detached
  runtime и canonical root JSON; ceremony отдельно сравнивает runtime bytes с
  exact Git blobs до publication; production-like admission отклоняет legacy
  arbitrary approval alias.

Локальная verification:

```text
authority/acquisition/root/detached tests = 40/40 PASS
admission contract tests                  = 21/21 PASS
admission smoke self-test                 = PASS
latest green pre-authority remote SHA     = d77c74393c510b688f9f2a5c43eaa908390450b5
production public root registry           = {} / EMPTY / FAIL-CLOSED
main branch protection/ruleset/CODEOWNERS = ABSENT
production-like acquisition/restore       = NOT EXECUTED
production-like admission                 = NO-GO
external beta                             = NO-GO
```

До operational use обязательны independent reviewer и защищённый approval
path до root enrollment: текущий owner не может заменить независимое
одобрение self-review. Также обязательны зелёный remote CI exact
authority-candidate SHA; выбор внешнего signer/HSM и
key-custody процесса; отдельный reviewed public-root enrollment с собственным
parent-transition CI; защищённый snapshot acquisition/restore; три
state-bound request/signing ceremony и marker rotation. Candidate не разрешает
production deploy, reconciliation apply или выдачу доступа тестеру.

### 5.26. `SINGLE_DESIGN_PARTNER`: contingency/enterprise isolation — 28.07.2026

Это сохранённая резервная lane для contractual enterprise isolation либо
аварийного снижения blast radius. Она не является основным способом первого
внешнего теста, не ослабляет Gate 1MT/Gate 2 и не разрешает обход
shared-multitenant acceptance.

Фиксированная topology:

```text
CURRENT_NETWORK
  Tenant A
    Store A1
    Store A2
    Store A3
    Store A4

SINGLE_DESIGN_PARTNER
  isolated web + API + PostgreSQL + secrets
  Tenant D
    Store D1
```

`Tenant A` и четыре его `Store` остаются в текущем production-контуре без
переноса, копирования или общей БД с partner environment. `Tenant D` и
`Store D1` создаются только в отдельном контуре; отдельные credentials,
database URL, encryption/signing/integration secrets и runtime processes не
переиспользуются из shared production. Upload/storage разрешается только в
отдельном namespace с отдельными credentials; иначе attachments остаются
`OFF`.

Текущий статус — `NO-GO`. Legacy identity writers этой lane изолированы:
`provision` и `rotate-invite` теперь безусловно завершаются
`DESIGN_PARTNER_IDENTITY_WRITER_DISABLED` до manifest/Prisma/БД/token.
Остаются read-only `status` для уже существующих isolated fixtures и
аварийный narrowing-only `suspend`. API startup validation isolated overlay и
запрет generic lifecycle activation не менялись. Календарное окно этой
резервной lane не назначено: она возобновляется только отдельным
product/security решением после оценки причин, из-за которых shared lane
неприменима.

| ID          | Приоритет | Статус        | Задача                                                     | Критерии приёмки                                                                                                                                                                                                                                                                                                                                                                                | Зависимости                                                 |
| ----------- | --------- | ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| BETA-DP-001 | P0        | Запланировано | Зафиксировать topology и design-partner agreement          | В protected record указаны один named partner, срок, owner, data terms и aliases `Tenant D`/`Store D1`; отдельно подтверждено, что текущая сеть — неизменный `Tenant A`/`A1..A4`, а production ID/PII/secrets не попадают в git                                                                                                                                                                 | —                                                           |
| BETA-DP-002 | P0        | Запланировано | Развернуть полностью изолированный runtime                 | Отдельные web, API, PostgreSQL, secrets, DNS/runtime identity и storage namespace; partner runtime не имеет route, credentials или network access к production PostgreSQL текущей сети; `/version` показывает exact reviewed SHA                                                                                                                                                                | BETA-SRC-002, BETA-OPS-001, BETA-DP-001                     |
| BETA-DP-003 | P0        | В работе      | Сделать isolated startup и egress fail-closed              | Нет fallback/production secrets; anonymous B2B даёт `401`; schedulers, queues, Langame/reward writes, Telegram/SMS/MAX и любой outbound default-off; egress allowlist пуст либо содержит только отдельно одобренный endpoint; restart не меняет эти значения                                                                                                                                    | BETA-SEC-001, BETA-SEC-008, BETA-DP-002                     |
| BETA-DP-004 | P0        | Запланировано | Реализовать профиль `SINGLE_DESIGN_PARTNER_V1`             | Persisted lifecycle/cohort и read/write/outbound entitlements имеют revision, reason, expiry и audit; неактивная surface скрыта в UI и отклоняется API/BFF/job; `TenantExecutionPolicy` может немедленно suspend весь `Tenant D`                                                                                                                                                                | BETA-TEN-001, BETA-TEN-002, BETA-TEN-004, BETA-DP-003       |
| BETA-DP-005 | P0        | Заблокировано | Provision `Tenant D` и единственный `Store D1`             | Legacy design-partner CLI не является допустимым provisioning path и fail-closed до manifest/Prisma/БД/token; создание Tenant D/Store D1, email-bound OWNER invite, support owner и checklist возобновляется только через отдельно reviewed shared sealed activation writer. OWNER имеет `NETWORK` только внутри D, club actor — `STORES[D1]`; manual SQL и добавление D1 в Tenant A запрещены; real-PG bridge связывает штатный output с API startup admission | BETA-TEN-003, BETA-SEC-009, BETA-IAM-001..005, BETA-IAM-004D, BETA-DP-004 |
| BETA-DP-006 | P0        | Запланировано | Доказать tenant/store/capability isolation                 | На ephemeral двухtenantной fixture зелёные list/detail/aggregate/write/export/file/BFF/job/SSE negative cases; stale token, forbidden filter, hidden UUID, scope change и invite delegation fail-closed; тесты не используют production data Tenant A                                                                                                                                           | BETA-SEC-003..006, BETA-OPS-002, BETA-OPS-003, BETA-DP-005  |
| BETA-DP-007 | P0        | Запланировано | Подготовить полный начальный набор модулей                 | До credentials IAM/support/feedback и все согласованные in-app slices `DP-S1..DP-S4` — геймификация, ассортимент целиком, сотрудники целиком, коммуникации и users/roles — имеют exact inventory, capability, audit, tests, accepted evidence SHA и runtime `VERIFIED + ENFORCED`; unattended jobs и внешние reward/Langame/Telegram/SMS/MAX effects остаются `OFF` до отдельных outbound gates | BETA-DP-006, соответствующие BETA-MOD-\*                    |
| BETA-DP-008 | P0        | Запланировано | Проверить backup, kill switches и rollback                 | Выполнены isolated backup/restore, outbound `OFF`, module writes `OFF`, scheduler stop, invite/session revoke, tenant suspend и N-1 либо fix-forward drill; destructive down migration запрещена; измерены owner и recovery time                                                                                                                                                                | BETA-OPS-005, BETA-OPS-007, BETA-OPS-012, BETA-DP-007       |
| BETA-DP-009 | P0        | Запланировано | Запустить feedback и incident process                      | Назначены partner/primary/backup owners; обращения привязаны к alias tenant/store, severity, route, request ID и SHA без auto-PII; есть ежедневный active-window triage, weekly review, SEV0/SEV1 templates, critical alert и stop/offboarding communication                                                                                                                                    | BETA-PILOT-002, BETA-PILOT-003, BETA-PILOT-006, BETA-DP-008 |
| BETA-DP-012 | P0        | Запланировано | Запечатать control-plane DB writes                         | Фактическая runtime role не может менять Tenant lifecycle, provisioning/rotation/suspend receipts и bootstrap OWNER override; receipt audit append-only, signed invite token hash неизменяем, expiry только сокращается, acceptance выполняется CAS; `_prisma_migrations` доступна только на `SELECT`; valid-hex tamper, restart и readiness проверены под exact runtime login                  | BETA-DP-003, BETA-DP-005                                    |
| BETA-DP-010 | P0        | Запланировано | Принять отдельный `DESIGN_PARTNER GO` и выдать credentials | Все технические preconditions Gate 1DP из `BETA-DP-001..009` и `BETA-DP-012` выполнены без незакрытых stop condition; protected record содержит exact environment/release SHA, entitlement revision, enabled surfaces, expiry, approver и rollback owner; day-0 login/scope/health/feedback/kill-switch smoke зелёный; срок доступа начинается только после этого record                        | BETA-DP-001..009, BETA-DP-012                               |
| BETA-DP-011 | P1        | Запланировано | Провести цикл, offboarding либо controlled promotion       | Feedback и incidents привязаны к SHA; нет security/data-integrity incident; export/retention/revoke/suspend проверены; добавление второго partner запрещено; promotion в общую когорту возможен только после Gate 2 с новой entitlement revision и новым измерительным окном                                                                                                                    | BETA-DP-010                                                 |

Implementation checkpoint:

- `BETA-DP-003`: API при `DESIGN_PARTNER_ISOLATED_MODE=true` требует точный
  fail-closed runtime overlay и допускает только empty pre-provisioning DB либо
  один exact `SUSPENDED` tenant/inactive Store с marker и структурно exact
  initial/rotation receipt topology; token-only scheduled HTTP routes
  отклоняются до service execution. Provisioning HMAC key в runtime запрещён,
  поэтому криптографический receipt status выполняется оператором перед
  restart, а runtime проверяет ID/digest/hash shapes и невозможность продлить
  signed expiry. Это candidate-код, deployment/restart и egress evidence ещё
  отсутствуют.
- `BETA-DP-005` заблокирован shared sealed activation boundary.
  `provision`/`rotate-invite` в executable CLI и одноимённые exported writers
  fail-closed с `DESIGN_PARTNER_IDENTITY_WRITER_DISABLED` до чтения manifest,
  Prisma/БД и token generation; legacy URL builder и write bodies удалены.
  `status` остаётся read-only проверкой уже существующих isolated fixtures,
  а emergency `suspend` может только выключить Tenant/Store/integrations и
  pending invites. Historical HMAC receipt verification сохранена: initial и
  rotation receipts по-прежнему связывают Tenant/Store, invite ID, token hash,
  исходный expiry и operation ID, а tamper/TTL-extension отклоняются. Это не
  разрешает создавать или ротировать identity.
- `accessExpiresAt` пока закреплён только manifest/audit metadata и не является
  runtime policy; persisted expiry/entitlements остаются `BETA-DP-004`.
- PostgreSQL writer-isolation smoke доказал disabled provision/rotate,
  historical read-only status и narrowing-only suspend на exact implementation
  SHA `f4224072f60507bd97f8e49440e3bda89ffe2aaa`: CI `30483184102`
  (`run #41`), PostgreSQL 16 job `90682228302` — `PASS`. Локально smoke не
  запускался из-за отсутствующего `DATABASE_URL`; independent review принят
  без actionable P0/P1/P2.
- Provisioning lifecycle и API admission пока выполняются двумя отдельными
  PostgreSQL fixtures; обязательный bridge `shared sealed activation output →
  same DB startup admission` без ручного fake receipt ещё не реализован и
  сохраняет `BETA-DP-005` в статусе `Заблокировано`.
- Restricted runtime-role smoke доказывает базовые attributes, отсутствие
  ownership/DDL/grant option, application DML и read-only migration readiness.
  Он пока намеренно выдаёт broad application-table DML и не запечатывает
  control-plane строки/колонки; это отдельный обязательный `BETA-DP-012`, без
  которого credentials остаются `NO-GO`.
- Read-only historical status, заблокированные identity writers и граница
  DB-only emergency stop приведены в
  [`single-design-partner-launch-checklist.md`](docs/open-beta/single-design-partner-launch-checklist.md).
  Канонический контракт:
  [`design-partner-identity-writer-isolation.md`](docs/open-beta/design-partner-identity-writer-isolation.md).

Progressive activation contract:

1. credentials открывают одновременно IAM/support/feedback и все согласованные
   in-app slices `DP-S1..DP-S4`: геймификацию, ассортимент целиком,
   сотрудников целиком и коммуникации; users/roles ограничены Tenant D/D1;
2. surface со статусом ниже `VERIFIED + ENFORCED` не может входить в первый
   доступ; новые возможности после старта включаются отдельными revisions;
3. staff recurring scheduler и любой all-tenant route не запускаются;
4. reward/Langame/Telegram и иные outbound effects остаются `OFF` до
   отдельного store-level `OUTBOUND GO`, canary и reconciliation;
5. salary остаётся planning-only, а discipline/motivation не выполняют
   внешних санкций;
6. marketing/mass messaging, full CRM analytics, billing, public
   self-registration и Platform Administration не входят в lane.

Немедленные stop conditions: cross-tenant/store/PII reveal, неизвестный scope,
доступ к выключенной surface, обход entitlement, потеря/дублирование reward,
необъяснимое повреждение import/sync, недоставленный critical alert,
недоступный suspend/revoke/rollback, неожиданная scheduler/outbound activity
или любая техническая связь с production Tenant A. Реакция:
`outbound OFF → module writes OFF → jobs stop → sessions/invites revoke →
Tenant D SUSPENDED`; evidence сохраняется, destructive rollback запрещён.

Успех DP-1 не завершает Gate 1MT, Gate 2 или Gate 3 и не засчитывает
обязательные семь дней internal alpha текущей сети. До фактического выполнения
`BETA-DP-001..010` и `BETA-DP-012` решение для DP-1 остаётся `NO-GO`.

### 5.27. `SHARED_MULTI_TENANT_BETA`: основной путь первого внешнего клуба — 28.07.2026

Целевая topology:

```text
SHARED DATA PLANE
  shared web + API + workers + PostgreSQL + Telegram
    Tenant A: Store A1, A2, A3, A4
    Tenant B: Store B1
```

Первый внешний владелец получает email-bound invite максимальной tenant-роли,
но не Platform Admin. После принятия invite он управляет пользователями,
ролями, разрешёнными клубами и интеграциями только `Tenant B`. Любой доступ
определяется пересечением:

```text
tenant lifecycle/stage/trial
∩ module read/write/outbound entitlement
∩ actor capability
∩ NETWORK | STORES scope
∩ resource ownership / outbound policy
```

Отсутствие любого элемента даёт deny-by-default. Полный профиль состоит из
пяти product rows и шестой supporting row `INTEGRATIONS`. `INTEGRATIONS` не
является шестым открытым продуктовым модулем: это supporting control-plane
для настройки собственного источника. Для первого доступа у всех шести rows
`read=ON`, `write=ON`, `outbound=OFF`; проверка credentials, preview/mapping
и первичный read-only sync отделены от unattended sync и внешних write-back.

| ID          | Приоритет | Статус        | Задача                                                              | Критерии приёмки                                                                                                                                                                                                                                                                                                                                                                                                  | Зависимости                                                 |
| ----------- | --------- | ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| BETA-MT-001 | P0        | В работе      | Зафиксировать shared topology и tenant creation contract            | Один manifest описывает shared web/API/workers/PostgreSQL/Telegram, `Tenant A/A1..A4` и новый `Tenant B/B1`; создание B не меняет A и не требует ручного SQL; public demo не содержит operational data                                                                                                                                                                                                            | BETA-SRC-002, BETA-CUT-002                                  |
| BETA-MT-002 | P0        | В работе      | Реализовать persisted stage/trial/module entitlements               | `INTERNAL/PILOT/BETA/LIVE`, onboarding state, trial dates и полный набор из шести rows `GAMIFICATION/ASSORTMENT/STAFF/COMMUNICATIONS/USERS_ROLES/INTEGRATIONS` хранятся с общей revision, reason, validity и audit; initial `read/write=ON`, `outbound=OFF`; missing/expired/incomplete/mixed-revision state запрещает действие                                                                                   | BETA-TEN-001, BETA-TEN-002                                  |
| BETA-MT-003 | P0        | В работе      | Применить fail-closed `TenantExecutionPolicy` ко всем путям         | Login/invite, API/BFF, exports/files, jobs, sync, messages, rewards и Telegram пересекают lifecycle/stage/trial/entitlement со scope/capability; generic lifecycle mutation fail-closed запрещена для любого non-`INTERNAL` tenant, external activation/suspend принадлежат dedicated workflows; suspend/expiry прекращают новые HTTP и background actions без restart; неизвестный tenant/module/action запрещён | BETA-TEN-004, BETA-SEC-003..006                             |
| BETA-MT-004 | P0        | В работе      | Реализовать shell provisioning, protected activation и owner invite | Platform Admin provisioning создаёт только `PILOT/SUSPENDED/PROVISIONING` shell, inactive `Store B1`, OWNER override, exact six-row `read/write=ON + outbound=OFF` profile и canonical email claim; trial/invite/outbox появляются атомарно только при activation по persisted GO; ни один response/replay не раскрывает email/token/URL/ciphertext; reissue/revoke/accept и real PostgreSQL concurrency доказаны | BETA-TEN-003, BETA-TEN-008, BETA-SEC-009, BETA-IAM-001..005, BETA-IAM-004E..004F |
| BETA-MT-005 | P0        | В работе      | Закрыть delegation и store authority во всех beta-модулях           | OWNER/ADMIN не могут назначить роль/scope/capability выше допустимого; generic API не назначает OWNER, а отдельный owner-transfer workflow сохраняет последнего active NETWORK OWNER; Store list/detail/write и все GAMIFICATION/ASSORTMENT/STAFF/COMMUNICATIONS/USERS_ROLES surfaces применяют тот же `NETWORK \| STORES` authority                                                                              | BETA-IAM-001..007, соответствующие BETA-MOD-\*              |
| BETA-MT-006 | P0        | Запланировано | Сделать безопасный self-service `INTEGRATIONS` control-plane        | Tenant owner сохраняет только свои зашифрованные credentials; endpoint allowlist, DNS/IP recheck, timeout/retry/circuit breaker и audit обязательны; preview показывает доступные внешние клубы, exact mapping создаёт только выбранный Store; ключ не импортирует остальные клубы domain/account                                                                                                                 | BETA-MOD-ASSORT-006, BETA-SEC-008                           |
| BETA-MT-007 | P0        | Запланировано | Доказать двухtenantную изоляцию на общем PostgreSQL/runtime         | Реальная PostgreSQL fixture содержит A/A1/A2 и B/B1; list/detail/aggregate/write/export/file/BFF/browser/job/SSE/Telegram negative matrix зелёная для пяти product modules и supporting `INTEGRATIONS`; stale token, hidden UUID, forbidden filter, scope change и owner delegation fail-closed; нет test-only policy bypass                                                                                      | BETA-MT-003..006, BETA-OPS-002, BETA-OPS-003                |
| BETA-MT-008 | P0        | В работе      | Подготовить общий worker/Telegram execution plane                   | Jobs получают явную tenant/store system identity, durable lease/fencing и idempotency; один shared Telegram bot маршрутизирует update в правильный tenant/store; update ID дедуплицируется durable; tenant suspend и per-store kill switch останавливают effects; hardcoded tenant/store отсутствуют                                                                                                              | BETA-MT-003, BETA-OPS-006, BETA-MOD-GAME-006                |
| BETA-MT-009 | P0        | Запланировано | Пройти полный module acceptance первого `Tenant B`                  | Все пять product modules и supporting `INTEGRATIONS` доступны согласно полному six-row профилю; staff включает контроль, мотивацию, регламенты, checklist, обучение и knowledge base; salary только planning; in-app communications включены; integrations прошли preview/read-only sync; каждый outbound effect остаётся отдельно gated                                                                          | BETA-MT-005..008, все BETA-MOD-\* P0                        |
| BETA-MT-010 | P0        | Запланировано | Принять shared beta access decision и выполнить day-0               | Gate 1MT и Gate 2 закрыты; exact SHA/CI/backup/restore/rollback/alerts приняты; protected `SHARED BETA GO` содержит Tenant/Store aliases, entitlement revision, trial, approver, support/rollback owner и stop conditions; owner invite создаётся после GO; day-0 login/scope/feedback/kill-switch smoke зелёный                                                                                                  | BETA-MT-001..009, BETA-CUT-009, BETA-PILOT-005..006         |
| BETA-MT-011 | P0        | Запланировано | Провести controlled first-club cycle и offboarding                  | Один новый tenant активируется за change window; D1/D7 review привязаны к SHA; suspend, session/invite revoke, integration stop, export/retention и support подтверждены; второй внешний tenant не создаётся до принятия first-club review и capacity/incident decision                                                                                                                                           | BETA-MT-010                                                 |

Текущий implementation candidate `CURRENT_170`:

- новая сеть fail-closed создаётся как
  `SUSPENDED + INTERNAL + PROVISIONING + profileRevision=0`;
- persisted lifecycle/stage/onboarding/trial и атомарный six-row entitlement
  profile реализованы; initial state для всех шести —
  `read/write=ON, outbound=OFF`; generic mutation всегда отклоняет
  `outbound=ON` и допускает только same-state update; смены
  `customerStage` и onboarding state зарезервированы за dedicated workflows;
  mutation защищена revision/`updatedAt` CAS,
  request-ID idempotency и audit в одной транзакции;
- login/JWT/invite admission учитывает свежий tenant state; первый OWNER
  принимается только как `NETWORK` без stores/custom role и обязательно
  переводит `OWNER_INVITED → ONBOARDING` под tenant row lock;
- external login/invite/module admission требует ровно шесть уникальных rows
  текущей `entitlementProfileRevision`; partial/duplicate/mixed-revision
  profile отклоняется до JWT, invite acceptance или module action;
- generic users/invites API больше не создаёт и не назначает OWNER; отдельный
  owner-transfer workflow ещё не реализован;
- для external tenant generic direct user creation, invite issue/rotation и
  email change fail-closed до verified email delivery/change workflows. Это
  исключает получение raw invite URL tenant actor и захват чужого глобального
  email без доказательства владения mailbox;
- database default с `User.role` удалён: любой create/invite/transfer path
  обязан назначать роль явно;
- shared shell service candidate атомарно создаёт
  `PILOT/SUSPENDED/PROVISIONING/revision 1` tenant, один неактивный Store с
  gamification/background execution `OFF`, OWNER capability override и exact
  six-row `read/write=ON + outbound=OFF` profile без validity window;
  `trialStartsAt/trialEndsAt` остаются `null`;
- canonical owner email резервируется через sealed
  `identity_email_claim_reserve_invite_v2`, audit содержит только
  domain-separated HMAC fingerprint/key version и HMAC-bound request digest.
  `User`, `UserInvite`, token, registration URL, trial, outbox и письмо не
  создаются; identical replay не создаёт дублей и не раскрывает identity data;
- provisioning controller остаётся fail-closed:
  `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`; legacy
  initial-owner revoke route также закрыт:
  `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`;
- generic lifecycle mutation теперь запрещена для каждого non-`INTERNAL`
  tenant. Activation shared external tenant остаётся отдельным dedicated
  workflow и в этом срезе не реализована;
- внешний authenticated HTTP-контур сопоставляет обязательные beta-prefixes с
  `module + READ|WRITE|OUTBOUND`; неизвестный route для external tenant
  отклоняется, а existing `INTERNAL` tenant временно сохраняет совместимость;
  read-only diagnostics и manual pull/ingest не смешиваются с provider write
  или unattended execution;
- lower-layer `TenantExecutionAdmissionService` каждый раз перечитывает
  lifecycle/trial/profile/entitlements и `executionRevision` из PostgreSQL,
  поддерживает cross-module requirements, выдаёт revision-bound permit и
  возвращает stable denial для scheduler
  `SKIPPED`; report email/digest, scheduled Langame sync/daily sync,
  bonus-ledger provider, scheduled delivery, Telegram/MAX dispatch и bot pull
  уже защищены baseline admission;
- additive migration `164` вводит trigger-owned монотонный
  `Tenant.executionRevision`: existing tenants backfill-ятся в `1`, новый
  неактивный shell начинается в `0`, а lifecycle/onboarding/trial/profile
  mutation даёт ровно один bump. Прямое изменение revision запрещено; shared
  API lifecycle/profile/OWNER/revoke paths используют revision в CAS и
  перепроверяют фактический `+1`. Legacy operator scripts требуют отдельного
  rollout review. Перед DDL migration берёт `ACCESS EXCLUSIVE` locks и
  fail-closed отклоняет apply при любом `RUNNING` report digest либо
  `PROCESSING/DISPATCHING` bonus-ledger effect; operational drain теперь
  является не только runbook-требованием, но и database precondition;
- ручные report email/digest получают permit до построения файла и
  непосредственно перед SMTP повторно проверяют permit, tenant revision,
  active actor, effective `export_reports` и неизменный
  `NETWORK | STORES` scope. Scheduled digest сохраняет
  captured revision в `ReportDigestScheduleRun`; bonus ledger сохраняет её в
  claim, повторно проверяет permit перед Langame и завершает transition только
  по exact `status + claimGeneration + attempts + executionRevision`;
  pre-dispatch CAS дополнительно привязан к `lockedAt`.
  Ветка staff-test cancellation использует тот же CAS и не позволяет stale
  worker отменить запись, уже захваченную новым worker. Отдельный монотонный
  `claimGeneration`, не сбрасываемый вместе с retry-attempts, закрывает ABA
  после operator `NOT_APPLIED → retry`;
- bonus-ledger Langame write имеет обязательный timeout не более 30 секунд,
  свежо читает active source/credential, normalized phone target и
  reward/staff eligibility у effect boundary. Непосредственно перед provider
  выполняется exact ownership check текущей claim generation вместе с
  текущим `Tenant.executionRevision`. Неоднозначный timeout идёт в
  `RECONCILIATION_REQUIRED` без
  автоматического write retry; `NOT_APPLIED` доступен только после quarantine
  `LANGAME_BONUS_RECONCILIATION_QUARANTINE_MINUTES` (default `30`). Provider
  idempotency/status API ещё не доказан, поэтому outbound остаётся `OFF`;
- token-only `POST /reports/digests/scheduled` допускает только явно
  включённый `dryRun=true`; live HTTP SMTP fail-closed до маршрутизации через
  persisted `ReportDigestScheduleRun` coordinator и unique run guard;
- remaining `BETA-MT-008`: durable lease/reclaim для delivery, Langame sync и
  остальных schedulers, per-source recheck, shared Telegram claim и
  двухфазный suspend/drain. Поэтому полный immediate-suspend contract ещё
  pending, а outbound первого tenant остаётся `OFF`;
- disposable PostgreSQL 16 rehearsal candidate для populated upgrade
  `163 → 164` реализован и подключён к обязательному CI: он строит exact
  prefix `1..163`, сохраняет существующие tenant/report-run/bonus-ledger
  rows, проверяет backfill/defaults/constraints/trigger/CAS, три
  zero-in-flight rejection с SQLSTATE `55000`, `lock_timeout`, late-DDL
  transactional rollback и повторный `migrate deploy`. Exact committed
  preflight `DO` block теперь отдельно исполняется через PostgreSQL connection
  и проверяется по SQLSTATE + reason; сам `migrate deploy` отдельно проверяется
  по bounded failure, `_prisma_migrations`, отсутствию partial DDL/data и
  recovery. Exact lock и late-index statements также отдельно доказывают
  database SQLSTATE `55P03` и `42P07`, а Prisma CLI обязан как минимум
  идентифицировать target-migration failure. Это устраняет зависимость от того,
  раскрывает ли Prisma CLI исходный SQLSTATE из explicit transaction.
  Изолированный локальный
  PostgreSQL major `16` diagnostic run прошёл с `6` tenants, `6` report runs и
  `10` ledger rows, тремя drain rejection, lock-timeout/late-DDL rollback,
  пятью rolled-back attempts и recovery deploy. Он не привязан к remote
  exact-SHA artifact и не заменяет обязательный remote PASS; production-like
  evidence, backup/restore и operational rollout остаются pending;
- runtime database role пока не запечатана от прямого изменения
  `TenantModuleEntitlement`: штатный profile API повышает parent revision, но
  обходной DML должен быть запрещён privilege/trigger boundary до external
  `GO`;
- scheduled report digest вычисляет effective capabilities с custom role и
  tenant overrides; отсутствие `export_reports` блокирует export и SMTP, а
  active/network scope, role и overrides повторно читаются непосредственно
  перед отправкой.
  Langame sync требует `INTEGRATIONS + ASSORTMENT`, а guest foundation и
  business snapshot — также `GAMIFICATION + STAFF`; соответствующие HTTP
  sync entrypoints требуют AND-capabilities всех затронутых модулей;
  guest-foundation import имеет узкую `import_guest_foundation` вместо
  широкого `manage_guest_crm`;
- activation primitive запрещает `outbound=ON` в любом из шести modules для
  всех допустимых reactivation states, а не только `OWNER_INVITED`;
- migrations `167..170` добавили global canonical email claim, sealed
  foundation, persisted `User`/`UserInvite` provenance/revocation и immutable
  opaque activation locator. Application runtime role candidate имеет exact
  семь RPC: две guest-game boundary и
  `reserve_v2/assert_v1/assert_invite_locator_v1/transition_v2/release_v2`;
  zero effective
  `IdentityEmailClaim` table DML, direct lock helper, старые writer RPC и
  worker event function остаются запрещены. Обычные
  `UsersService`/`AuthService` issue/reissue/revoke/accept paths используют
  sealed state machine, а direct user creation и user/invite email mutation
  fail-closed. Local disposable PostgreSQL `16.13` evidence:
  clean deploy `170/170`, populated `169 → 170`, locator/ACL/rollback checks,
  identity idempotency
  `100 = 1 CREATED + 99 ALREADY_RESERVED`, transition destination replay,
  retained revoked history, revoke→same-email-reserve и shell integration
  `2/2`; full API — `101 suites / 1960 passed / 2 todo`. Exact-head CI/review
  для `CURRENT_170` pending;
- sealed identity/shell candidate не завершает OWNER workflow: остаются
  privacy-safe inventory/admitted backfill исторических rows без provenance,
  sealed issue-by-locator, persisted GO, encrypted outbox и verified OWNER
  delivery. Locator уже реализован локально как candidate, но не является
  authority. `BETA-IAM-004E` принят как engineering transport checkpoint; его
  production proxy/APM/CSP/browser/mail-client acceptance остаётся pending.
  Fingerprint HMAC startup validation уже реализована candidate и CI
  environment contract обновлён; до deploy требуется отдельное защищённое
  prod secret value `v1`;
- StaffTask integrity contract сохранён как immutable migrations `1..162`;
  migrations `163..170` допускаются только как проверенный additive tail, не
  меняющий protected `StaffTask*` relations. Schema target —
  `CURRENT_170`, `migrationCount=170`, latest
  `20260729233000_identity_activation_locator`. Предыдущий accepted
  engineering baseline был связан с PR head
  `bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
  [`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
  (`run #23`), но выполнен через merge-ref и не является exact-SHA checkout
  evidence. Все три job завершились `PASS`: Application checks `90549245276`,
  Authority checks `90549245284` и PostgreSQL migration smoke `90549245372`
  на PostgreSQL major `16`. Authority job не выполнял root enrollment;
  canonical root registry остаётся `{}`.
  Его PostgreSQL evidence подтверждает
  `immutableMutationsRejected=7` и
  `finalStateAndEvidenceUnchanged=true`. Более ранний accepted checkpoint
  `c1fee42c...` / CI `30442286822` сохраняется как historical precursor:
  он принял foundation migration `166`, но предшествовал legacy quarantine
  delivery-row/lifecycle freeze. Exact-head
  `a644b81e909ea97c21e3c404480505bf97b19935`, CI
  [`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
  (`run #27`) — `REJECTED`: Application `90559756157` и Authority
  `90559756309` прошли, PostgreSQL `90559756334` завершился `FAIL`, потому что
  harness ожидал custom replay text, а unique index вернул `SQLSTATE 23505`
  через generic Prisma message. Он не закрыл P1.
  `d525b736d03162a2c58de17cbf7679ba6f515096` / GitHub CI
  [`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
  (`run #28`) остаётся previous accepted exact-head baseline. Следующий
  accepted provider-write engineering checkpoint —
  `be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, GitHub CI
  [`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
  (`run #29`): Application `90566337085`, Authority checks `90566337062` и
  PostgreSQL `90566337060` — `3/3 PASS`. Authority checks не выполняли root
  enrollment; roots остаются `{}`. PostgreSQL major `16` structured evidence:
  `populatedLegacyDeliveries=10`, `canonicalStoreBackfills=1`,
  `legacyQuarantines=6`, `preservedFailClosedStores=3`,
  `committedTransitions=4`, `runtimeBoundaryNegatives=9`,
  `immutableMutationsRejected=7`,
  `finalStateAndEvidenceUnchanged=true`,
  `sourceDatabaseMigrationsApplied=0`,
  `privateSecurityInvokerLockBoundaries=1` и
  `rewardDeliveryLockOrderEvidence={restrictedRuntimeScopeChecks:true,
  disposableOwnerDmlSessions:2, missingRewardRejected:true,
  crossTenantRewardRejected:true, waiterObservedOnAdvisoryLock:true,
  deliveryDeferredTriggerCommitted:true, rewardDeferredTriggerCommitted:true,
  holderAndWaiterCommitted:true, rawDeadlockOrLockTimeoutErrors:0,
  stateAndEvidenceUnchanged:true}`. Все четыре исходных engineering
  provider-write P1 закрыты. Rejected candidate
  `6a69cd8247a2ec1787d00e4f9afacee2af075c60`, CI `30445054152`
  (`run #26`), PostgreSQL job `90553255161`, завершился `FAILED`: retry fixture
  не выставлял `readinessStatus=READY_FOR_BOT`, а independent preflight
  обнаружил null-closed Event gap; ни один P1 этим run не закрыт.
  Engineering closure не разрешает provider activation: actual non-owner
  runtime/app DB role ещё требует explicit `EXECUTE` grant и admission, так
  как `PUBLIC EXECUTE` revoked; batch/rebind/future provider writers остаются
  fail-closed, а whole-transaction bounded retry сохраняется обязательной
  pre-activation defense-in-depth.
- предыдущий accepted `CURRENT_168` implementation checkpoint —
  `3b8228dd278fae062c753bf4301e0339ba93738b`, GitHub CI
  [`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200):
  Application checks, PostgreSQL migration smoke и Authority root trust gate —
  `3/3 PASS`. Предшествующий exact-head
  `474fce63ede2938f1ad8e0dd167e00b8298b5828`, CI
  [`30459289293`](https://github.com/boozik3412/leetplus/actions/runs/30459289293),
  был отклонён только PostgreSQL job: serialization conflict пришёл как
  Prisma `P2010` с PostgreSQL SQLSTATE `40001`. `CURRENT_168` структурно
  нормализует `P2034`, `P2010/meta 40001|40P01` и прямые
  `40001|40P01`, выполняет не более одного полного serializable retry и
  сохраняет unknown errors fail-closed. Независимый review того diff не
  обнаружил новых P0; targeted review error mapping подтвердил fail-closed
  контракт.
- последний детализированный historical checkpoint `CURRENT_165` проходит
  `16 suites / 663 tests` tenant-execution,
  `32 suites / 523 tests` focused security и полный API regression
  `96 suites / 1873 passed / 2 todo` (`1875 total`). Design-partner subset
  проходит `7 suites / 68 tests`. API production build, production env
  contract, API/database/web
  typecheck, API boundary/tenant-execution lint, web lint без ошибок, seed
  safety `9/9`, Prisma validate/generate, migration-164 offline contract
  `6/6`, populated-upgrade rehearsal self-test и diff-check зелёные; отдельный
  real PostgreSQL major `16` local diagnostic rehearsal также зелёный. Remote
  PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
  `37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`.

Этот checkpoint закрывает только local claim/shell/application-writer
foundation, но не Gate 1MT. Следующий обязательный P0-порядок:
inventory/admitted backfill исторических identity rows + принятие
PostgreSQL/remote CI уже reviewed design-partner writer isolation → activation
locator → persisted GO, encrypted outbox,
verified OWNER delivery + production acceptance уже реализованного
`BETA-IAM-004E` transport → закончить durable
lease/job/guest/Telegram effect fencing → безопасный integration
preview/select/map → полный PostgreSQL concurrency, two-tenant и
production-like migration/rollback/zero-diff rehearsal. До закрытия этих
gates реальный внешний tenant не provisioned и owner invite тестеру не
выдаётся.

Исполнимый профиль и launch checklist:

- [shared-multi-tenant-beta-profile.md](./docs/open-beta/shared-multi-tenant-beta-profile.md);
- [shared-multi-tenant-launch-checklist.md](./docs/open-beta/shared-multi-tenant-launch-checklist.md).

Срок выдачи не определяется датой документа. Текущий плановый ориентир первого
friendly external club — окно `31.08–07.09.2026`, только если Gate 1MT и Gate 2
завершены без stop condition; это не обещание даты.

### 5.28. Background execution containment candidate — 28.07.2026

До полной реализации `BETA-MT-008` добавлен временный fail-closed registry для
17 unattended job kinds. Persisted stages `PILOT/BETA/LIVE` отображаются в
`EXTERNAL`; отсутствующий/неизвестный stage или job kind отклоняется.
Текущая сеть `Tenant A/A1..A4` сохраняет legacy-совместимость только в явно
заданной стадии `INTERNAL`.

Для внешнего tenant сейчас разрешены только два уже доказанных
revision-fenced effect path:

- `REPORT_DIGEST_SMTP`;
- `GUEST_BONUS_LEDGER_LANGAME`.

Оба пути теперь сами вызывают registry при scheduler/dispatch admission и на
fresh effect boundary; bonus-ledger делает это до auto-queue, stale promotion
и claim. Изменение registry-классификации не игнорируется. Все
остальные 15 job kinds имеют `EXTERNAL_DENY`. Containment подключён к
scheduled/AUTO Langame, daily/business/guest-foundation, gamification
snapshot/supplemental, delivery/bot pull, activity ledger, retention,
fallback, loot-box recovery, quality monitoring и reward materializer.
Staff recurring job зарезервирован в registry, но scheduler/all-tenant route
по-прежнему не смонтированы.

Отдельный CI gate `test:ci:background-execution` фиксирует hard-coded полный
набор registry keys, unknown-value deny, совместимость `INTERNAL`, deny
`PILOT/BETA/LIVE`, отсутствие provider/credential/защищённой business mutation
после denial, допустимую audit-запись `SKIPPED`/`BLOCKED` и повторную проверку
двух разрешённых effect paths. Последний локальный результат:
`15 suites / 665 tests`; полный API regression:
`96 suites / 1873 passed / 2 todo`; tenant-execution lint, production typecheck
и API build — `PASS`.

Ограничения остаются launch-blocking: это не durable lease/generation fence.
Stage/revision flip посреди уже начатого `INTERNAL` job, bot provider после
pull, длинные retention/materializer операции и direct/manual DB entrypoints
не имеют общего suspend/drain primitive. Activity external jobs могут
оставаться unclaimed. Migration `165` теперь добавляет только fail-closed
Store fence (`backgroundExecutionEnabled=false`, `executionRevision=0`);
ни один Store не активирован, outbound остаётся `OFF`. Поэтому `BETA-MT-008`
остаётся `В работе`, external
outbound — `OFF`, owner invite — `NO-GO`.

Полный контракт, матрица job kinds, проверки и следующий порядок:
[background-execution-containment.md](./docs/open-beta/background-execution-containment.md).
Design candidate первого durable vertical slice с включёнными замечаниями
независимого review зафиксирован отдельно:
[migration 166 delivery claim design](./docs/open-beta/delivery-claim-migration-166-design.md).
Он выбирает typed claim state в `GuestGameDelivery`, opaque capability-token,
canonical delivery↔reward Store invariant, fresh consent/reward/provider
revalidation, provider-attempt marker, durable reaper/reconciliation,
old-worker cutoff и отдельный populated `165 → 166` rehearsal. Delivery claim
migration `166` и fail-closed legacy runtime containment теперь находятся в
implementation candidate (§5.30), но effect-capable coordinator и обязательные
production-like/cutover evidence ещё не приняты; это по-прежнему `NO-GO`.

### 5.29. Store background execution fence candidate — 29.07.2026

Exact remote prerequisite `CURRENT_164` подтверждён на SHA
`37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`. Новый
bounded schema candidate `20260729120000_store_background_execution_fence`
переводит release contract в `CURRENT_165` (`migrationCount=165`) и добавляет
только fail-closed Store-level execution fence. Все существующие и новые Store
остаются `backgroundExecutionEnabled=false`; автоматической активации и
outbound effects нет. Production migration/deploy не выполнялись.

Remote exact-SHA evidence для `CURRENT_165` принято: SHA
`4bd6a036df16579f68b2c96a14b6475c8311b231`, CI run `30428288353`. Все три
job завершились `PASS`; real PostgreSQL шаг подтвердил populated
`164 → 165`, а StaffTask EXPAND/admission/security/inventory/planner/catalog
drift и application/authority gates зелёные. Это engineering/release evidence,
не production-like acquisition/admission, deploy или разрешение доступа.
Documentation/evidence successor
`7c20adec4ee7cb0a390f1e38ec8e7dd333fa367f` также прошёл все remote job в CI
`30429463161`; оба checkpoint являются historical prerequisite для
`CURRENT_166`, а не evidence migration `166`.

Authority bundle локально проходит `40/40`, включая child-process positive
ceremony E2E; canonical root registry остаётся `{}`. В `main` нет branch
protection/ruleset и `CODEOWNERS`, поэтому root enrollment запрещён до
независимого reviewer и защищённого approval path. Delivery claim перенесён в
  implementation candidate migration `166`; schema target — `CURRENT_166`.
  Previous accepted PR-head-associated merge-ref baseline —
  `bbef153a...` / CI `30443837684` (`run #23`), не exact-SHA evidence; он
  включает legacy quarantine delivery-row/lifecycle freeze.
  `c1fee42c...` / CI `30442286822` остаётся historical precursor. Exact-head
  `a644b81...` / CI `30447011917` (`run #27`) rejected (`2/3 PASS`,
  PostgreSQL `FAIL`). Previous accepted exact-head —
  `d525b73...` / CI `30447467729` (`run #28`), `3/3 PASS`. Last accepted
  exact-head — `be8c94c4...` / CI `30449026506` (`run #29`), `3/3 PASS`;
  все четыре исходных engineering provider-write P1 закрыты. Production-like
  evidence, effect-capable coordinator и Store-scoped effect enforcement ещё
  pending.
Gate 1MT, owner invite и внешний доступ остаются `NO-GO`.

### 5.30. Guest-game delivery claim fence candidate — 29.07.2026

Начата реализация exact additive migration
`20260729160000_guest_game_delivery_claim_fence`, переводящей release contract
в `CURRENT_166` (`migrationCount=166`). Candidate добавляет active
generation-bound claim в `GuestGameDelivery`, immutable provider-attempt
evidence в `GuestGameDeliveryAttempt`, typed transition events, canonical
tenant/reward/profile/guest/Store bindings, lease/reaper/reconciliation
состояния и database-enforced fail-closed transition matrix. Frozen manifest
фиксирует exact ordered/checksummed базу `CURRENT_165`; migration не может
тихо примениться к другой истории.

Legacy direct provider и bot-pull paths в API переведены в hard containment:
env/canary flags не разрешают реальную отправку, direct request принудительно
становится dry-run, bot pull не возвращает sendable payload, а readiness не
показывает provider как готовый. Это временный deny, а не новый delivery
coordinator и не разрешение outbound.

Containment также закрывает legacy provider prepare/update/bot ack до
delivery row/event mutation. Bonus-ledger revoke и Telegram unsubscribe
продолжают основную ledger/reward cancellation и consent update, но сохраняют
provider delivery rows/events неизменными; `CASHIER/MANUAL` cancellation
остаётся доступным. Это сохранение бизнес-операции без legacy provider-state
write, а не effect-capable protocol.

Предыдущий accepted PR-head-associated merge-ref engineering baseline связан с
`bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
[`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
(`run #23`), и не является exact-SHA checkout evidence. Все три job
завершились `PASS`: Application checks `90549245276`, Authority checks
`90549245284`, PostgreSQL migration smoke `90549245372`; использована
PostgreSQL major `16`. Authority checks не выполняли root enrollment;
canonical root registry остаётся `{}`. PostgreSQL job
подтвердил `immutableMutationsRejected=7` и
`finalStateAndEvidenceUnchanged=true`. Checkpoint `c1fee42c...` /
`30442286822` является historical precursor до legacy quarantine
delivery-row/lifecycle freeze.

Rejected exact-head candidate
`a644b81e909ea97c21e3c404480505bf97b19935`, CI
[`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
(`run #27`) использовал exact-head checkout: Application `90559756157` и
Authority `90559756309` — `PASS`, PostgreSQL `90559756334` — `FAIL`; итог
`REJECTED`, P1 не закрыт. Previous accepted exact-head checkpoint —
`d525b736d03162a2c58de17cbf7679ba6f515096`, GitHub CI
[`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
(`run #28`): Application `90561260920`, Authority `90561260926` и PostgreSQL
`90561260878` — `3/3 PASS`. Последний принятый provider-write exact-head —
`be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, GitHub CI
[`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
(`run #29`): Application `90566337085`, Authority checks `90566337062` и
PostgreSQL `90566337060` — `3/3 PASS`. Authority checks не выполняли root
enrollment; canonical roots остаются `{}`. Rejected
`6a69cd8247a2ec1787d00e4f9afacee2af075c60` /
`30445054152` (`run #26`), PostgreSQL job `90553255161`, завершился `FAILED`
из-за retry readiness fixture; independent preflight также обнаружил
null-closed Event integrity gap. Он не закрыл P1.

Принятый run #29 delivery rehearsal на PostgreSQL major `16` подтвердил exact
prefix `165 → 166`,
`populatedLegacyDeliveries=10`, `canonicalStoreBackfills=1`,
`legacyQuarantines=6`, `preservedFailClosedStores=3`,
`committedTransitions=4`, `runtimeBoundaryNegatives=9`,
`immutableMutationsRejected=7`,
`finalStateAndEvidenceUnchanged=true`, lock SQLSTATE `55P03`, late-DDL SQLSTATE
`42710`, idempotent deploy,
`sourceDatabaseMigrationsApplied=0`, неизменное migration state source-БД,
отсутствие изменений source application data и
`public executable functions=0`, `privateSecurityInvokerLockBoundaries=1` и
`rewardDeliveryLockOrderEvidence`:

```text
restrictedRuntimeScopeChecks=true
disposableOwnerDmlSessions=2
missingRewardRejected=true
crossTenantRewardRejected=true
waiterObservedOnAdvisoryLock=true
deliveryDeferredTriggerCommitted=true
rewardDeferredTriggerCommitted=true
holderAndWaiterCommitted=true
rawDeadlockOrLockTimeoutErrors=0
stateAndEvidenceUnchanged=true
```

Это только SYNTHETIC engineering evidence:
migration не применялась к production, provider writes не разрешены.

Engineering prerequisite clean/populated rehearsal и remote CI закрыт
checkpoint выше. До provider activation и production-like принятия candidate
остаются обязательны:

- runtime coordinator с claim/attempt/finalize/reaper/reconcile API,
  opaque generation-bound token, provider/workload authority и old-worker
  cutoff;
- server-side `NETWORK | STORES` enforcement: delivery list, claim, manual
  mutation, retry, cancel, evidence и provider effect обязаны пересекаться с
  `allowedStoreIds`; текущие tenant-only CLUB_MANAGER paths не допускаются в
  effect-capable release;
- operational enrollment отдельной bounded audited retention
  identity/procedure, exact grants, retention window и audit для evidence
  cleanup; сейчас прямой `DELETE` из `GuestGameDeliveryAttempt` и
  `GuestGameDeliveryEvent` fail-closed запрещён для ordinary/enrolled DML
  roles при включённых triggers. Owner/superuser/DDL bypass operationally
  запрещён, retention identity/procedure не enrolled, а migration намеренно
  не создаёт DB role или обход без отдельного reviewed operations change;
- один из исходных четырёх P1 закрыт accepted checkpoint
  `bbef153a...` / CI `30443837684`: `LEGACY_QUARANTINED` полностью immutable,
  все изменения state/reason/scope/provider-полей и `DELETE` отклоняются;
  семь PostgreSQL negative mutations оставляют delivery row и evidence
  неизменными. Это legacy quarantine delivery-row/lifecycle freeze, а не
  закрытие прямой Event INSERT boundary;
- ещё два исходных P1 закрыты previous exact-head checkpoint
  `d525b73...` / CI `30447467729` (`run #28`): final-row reason/integrity
  consistency и worker boundary-only durable event write. PostgreSQL evidence
  включает `committedTransitions=4` и `runtimeBoundaryNegatives=9`.
  Engineering closure не заменяет operational boundary: обязательны отдельная
  non-owner runtime DB role и grants; worker boundary не принимает
  `actorUserId`, а interactive same-tenant actor boundary остаётся pending;
- четвёртый исходный P1 закрыт последним provider-write exact-head
  `be8c94c4...` / CI `30449026506` (`run #29`): private SECURITY INVOKER
  `guest_game_reward_delivery_lock_v1` берёт canonical advisory seed `166`,
  затем same-tenant `Reward FOR UPDATE`, затем `VERIFIED` Telegram/MAX
  Deliveries `ORDER BY id FOR UPDATE`; оба deferred trigger делегируют этой
  boundary, а application writers вызывают её до первой DML. Двухсессионный
  rehearsal не получил raw deadlock/lock-timeout и сохранил state/evidence;
- перед provider activation actual non-owner runtime/app DB role должен пройти
  отдельный admission и получить explicit `EXECUTE` grant на private
  boundary: `PUBLIC EXECUTE` revoked. Batch/rebind/future provider writers
  остаются fail-closed, а whole-transaction bounded retry остаётся
  defense-in-depth;
- rejected `6a69cd8...` / CI `30445054152` (`run #26`) и
  `a644b81...` / CI `30447011917` (`run #27`) сохраняются как failed evidence
  и не использовались для закрытия P1;
- versioned provider authority/configuration, workload identity, egress
  isolation, credential rotation и cutover/drain rehearsal;
Независимый adversarial review не нашёл P0-блокера для inert schema candidate.
Все исходные четыре engineering provider-write P1 закрыты. Provider writes
остаются `NO-GO` до operational grants/admission, production-like evidence,
effect-capable coordinator, Store-scoped effect enforcement и cutover.

Migration/runtime containment являются implementation candidate и не
применялись к production. Все Store остаются
`backgroundExecutionEnabled=false`, outbound остаётся `OFF`, canonical root
registry — `{}`. Gate 1MT, создание external tenant, owner invite и тестовый
доступ для второго клуба остаются `NO-GO`.

### 5.31. `CURRENT_168`: sealed OWNER identity boundary и shell-only provisioning — 29.07.2026

Schema candidate на момент historical checkpoint:

```text
migrationCount = 168
latest = 20260729210000_identity_email_claim_write_boundary
release decision = NO-GO
```

Реализовано как engineering candidate, не применённый к production:

- migration 167 создаёт global case-insensitive `IdentityEmailClaim` и единый
  advisory-lock namespace;
- migration 168 создаёт sealed `SECURITY DEFINER`
  `reserve/assert/transition/release` RPC, combined `INVITE | USER` subject
  invariant и отдельный `EMAIL_CHANGE` invariant; reserve проверяет legacy
  identity rows до replay, exact `search_path=pg_catalog` всех четырёх
  definer RPC аттестуется по PostgreSQL catalog;
- actual non-owner application runtime enrollment содержит ровно шесть RPC:
  две guest-game и четыре identity; direct lock helper и worker event function
  excluded;
- runtime role имеет zero effective `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
  REFERENCES/TRIGGER` на `IdentityEmailClaim`, а `PUBLIC` privileges отозваны;
- shell service в одной serializable-транзакции создаёт только
  `PILOT/SUSPENDED/PROVISIONING` tenant, inactive Store, OWNER capability
  override, exact six-row `read/write=ON + outbound=OFF` profile и canonical
  owner reservation; после recovery допускается ровно один полный retry только
  для serialization conflict (`P2034`, PostgreSQL `40001/40P01` или
  `IDENTITY_CLAIM_RETRY_REQUIRED`);
- shell audit содержит только HMAC fingerprint/key version и HMAC-bound
  request digest; raw email не сохраняется в audit/response;
- production startup-validation candidate требует отдельный fingerprint HMAC
  secret, запрещает reuse и принимает только version `v1`; CI environment
  contract обновлён;
- shell не создаёт `User`, `UserInvite`, token, registration URL, trial,
  outbox или письмо;
- provision route остаётся
  `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`, legacy
  initial-owner revoke route —
  `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`.

Local disposable PostgreSQL `16.14` evidence без production data:

```text
clean migrations: 168/168
identity idempotency: 100 total = 1 CREATED + 99 ALREADY_RESERVED
combined subject invariant: INVITE versus USER collision rejected
shell PostgreSQL integration: 2/2
cross-slug shell race: 50 winner responses + 50 IDENTITY_EMAIL_UNAVAILABLE
```

Remote exact-head implementation evidence принято:

```text
implementation SHA: 3b8228dd278fae062c753bf4301e0339ba93738b
GitHub CI: https://github.com/boozik3412/leetplus/actions/runs/30460154200
result: Application + PostgreSQL + Authority = 3/3 PASS
independent review: PASS, новых P0 не обнаружено
```

Это не production-like admission, не persisted GO, не deploy и не разрешение
создать external account.

Открытые launch-blocking P0 на момент historical `CURRENT_168` checkpoint:

1. Legacy `User` и `UserInvite` writers ещё не используют sealed claim
   invariant; direct или параллельный обход lock-before-read недопустим.
2. Нужен privacy-safe activation locator: по claim UUID/HMAC необходимо найти
   identity без raw-email leak и повторно проверить exact claim под lock.
3. Отсутствуют persisted `SHARED BETA GO`, activation/trial start,
   `UserInvite`, encrypted leased outbox, verified mail delivery,
   issue/reissue/revoke/resend/accept и fragment + POST-body transport.
4. Не пройдены полный 100-way accept/revoke/reissue matrix,
   production-like upgrade/rollback/zero-diff и полноценная two-tenant
   rehearsal.

Список выше зафиксирован как historical `CURRENT_168` evidence. Позднейший
`BETA-IAM-004E` принят как fragment + fixed POST-body engineering checkpoint;
это не закрывает остальные перечисленные P0 и production acceptance.
Открытый hardening P1 до внешней активации:

1. Runtime admission должен привязать четыре `SECURITY DEFINER` RPC не только
   к signature/security mode/volatility/search path, но и к эталонному body
   digest и ожидаемому definer-owner с least-privilege доступом.
2. Replay shell должен перечитать и сопоставить фактические Tenant/Store,
   OWNER override и six-row entitlement state, а не доверять одному audit
   receipt после проверки tenant/slug/claim.

До production deploy отдельно создаётся, защищённо устанавливается и
аттестуется production fingerprint HMAC secret value `v1`. До закрытия всех
launch blockers обе admin route остаются `503`, production не изменяется, а
тестовый доступ не выдаётся.

### 5.32. `CURRENT_169`: persisted invite provenance и sealed runtime writers — 29.07.2026

Historical milestone schema state:

```text
migrationCount = 169
latest = 20260729230000_identity_invite_writer_boundary
release decision = NO-GO
production deploy = NOT PERFORMED
```

Реализовано:

- `User` и `UserInvite` сохраняют exact `identityClaimRevision`;
- `UserInvite` имеет explicit `revokedAt/revokedByUserId`, а revoked history
  не удаляется;
- `reserve_invite_v2` исключает explicitly revoked invite history и устраняет
  clock-sensitive повторную блокировку адреса;
- `transition_v2` проверяет destination до replay и сохраняет email ownership
  inactive user;
- `release_v2` освобождает только exact unbound reservation либо явно
  revoked/unaccepted invite с совпавшей persisted provenance;
- создание invite выполняет
  `reserve → assert → create → transition → persist revision`;
- same-email reissue создаёт новый immutable invite, CAS-отзывает старый и
  переводит claim;
- explicit cancel освобождает claim и для live, и для естественно истёкшего
  invite; одна natural expiry без cancel остаётся fail-closed;
- accept выполняет
  `assert → Tenant lock/admission recheck → User create → invite CAS →
  INVITE→USER transition → User revision persist`;
- direct user creation отвечает
  `DIRECT_USER_CREATION_REQUIRES_INVITE`;
- реальная смена `User.email` и смена email invite закрыты до verified
  first-class workflow;
- legacy rows с `NULL identityClaimRevision` отклоняются как
  `IDENTITY_INVITE_PROVENANCE_REQUIRED`;
- application boundary разрешает User ownership create только в
  `AuthService`, а UserInvite mutation — только в `AuthService/UsersService`;
- для этого historical checkpoint runtime allowlist равен six-RPC:
  две guest-game и
  `reserve_v2/assert_v1/transition_v2/release_v2`; predecessor v1 write RPC и
  raw lock helper явно excluded.

Historical local disposable PostgreSQL `16.13` evidence без production data:

```text
clean migrations: 169/169
identity static boundary: 14/14
runtime enrollment static boundary: 13/13
focused auth/users/provisioning tests: 89/89
full API: 99 suites, 1940 passed, 2 todo
API lint boundary + typecheck + build: PASS
shared shell PostgreSQL integration: 2/2
runtime grants: 6 application RPC; sealed table privileges: 0
identity concurrency: 100 = 1 CREATED + 99 ALREADY_RESERVED
transition replay destination recheck: PASS
retained revoked invite release: PASS
explicit revoke → same-email reserve_v2: PASS
```

Первый exact-head candidate
`f9db2643b576778fbb0c651229c37e42d3f0892c` сохранён как `REJECTED`:
GitHub CI
[`30467211571`](https://github.com/boozik3412/leetplus/actions/runs/30467211571)
(`run #36`) завершился `2/3 PASS`. Application и authority-root прошли, а
PostgreSQL job упал в историческом `EXPAND_162` rehearsal: актуальный
Prisma-клиент включил post-baseline `User.identityClaimRevision` в
неограниченный `RETURNING`.

Compatibility fix заморозил `User` mutation projection до baseline-полей
`id/tenantId` для create/update/delete и добавил exact offline guard.
Historical engineering exact-head
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`: Application `90630292527`, authority-root
`90630292169`, PostgreSQL 16 `90630292257`. Исправленный исторический
StaffTask EXPAND rehearsal, `CURRENT_169` identity boundary и runtime grants
прошли. Independent implementation/security review и отдельный review
compatibility fix не нашли новых P0/P1; для fix также нет P2.

Предыдущий `CURRENT_168` exact-head `3b8228dd...` / CI `30460154200` остаётся
historical prerequisite. Принятый engineering checkpoint не является
production-like admission, deploy или разрешением на внешний доступ.

### 5.33. `IDENTITY_LEGACY_RECONCILIATION_V1`: read-only inventory candidate — 29.07.2026

Integrated least-privilege inventory работает только как aggregate/HMAC-bound
read-only candidate на exact `CURRENT_170`. Он не выдаёт row values, не
формирует signed proposal и не выполняет DML.

Принятое ниже local/CI evidence относится к historical `CURRENT_169`:

```text
core self-test: PASS / 18 checks
smoke self-test: PASS / 18 checks
Node unit: PASS / 17 of 17
PostgreSQL 16 smoke: PASS / 3 disposable clones
healthy topology: PASS / zero findings
proposal/review topology: 2 proposals + REVIEW
adversarial topology: BLOCKED / reachable codes
catalogDriftRejected: true
authorityDriftRejected: true
clusterAclRestored: true
privacy inspection: PASS
cleanup: guaranteed LIFO
cleanup residue: 0 databases / 0 roles / 0 parameter ACL
```

`CURRENT_170` exact admission фиксирует `5` relations, `30` IAM catalog
columns, `11` constraints, `9` indexes, `10` functions, exact ordered enum и один
trigger, а также exact `8` enabled PG16 internal RI FK triggers. Reader
получает ровно `22` columns без `updatedAt`; target/TLS, identity catalog и
полный ACL admission проверяются до чтения migration table. Privilege-only
failure даёт clean `ADMISSION_MISMATCH`, schema drift — исходный
`SCHEMA_MISMATCH`; unrelated extra catalog objects допускаются. Non-public
schema `USAGE/CREATE`, CONNECT/USAGE grant options и excess SELECT запрещены.
Admission также требует zero effective foreign-data-wrapper `USAGE`, zero
`pg_parameter_acl SET/ALTER SYSTEM`, zero ownership dependencies/user-defined
types, zero system-schema CREATE, `systemObjectPrivilegeCount=0`,
`systemSchemaPrivilegeCount=0`, `systemSecurityDefinerFunctionCount=0`,
`systemHighOidExecutableFunctionCount=0` и enum owner, совпадающий с database
owner. System-object guard отклоняет любые direct role ACL и опасный PUBLIC
ACL delta: `pg_catalog` сравнивается с `pg_init_privs`; built-in
`information_schema` OID `<16384` допускает только штатный `SELECT/USAGE` без
grant option; high-OID/custom/иной ACL и PUBLIC ACL в других system namespaces
отклоняются. Smoke отрицательно проверяет `postgres_fdw USAGE`,
`work_mem SET`, `pg_catalog CREATE`, `pg_toast USAGE`, `pg_authid SELECT`,
direct/PUBLIC `pg_read_file EXECUTE`, отдельные executable high-OID
`pg_catalog SECURITY DEFINER/INVOKER` functions, enum-owner drift и disabled
RI trigger; function/authority negative очищаются LIFO, финальный cleanup
возвращает `clusterAclRestored=true`.

Любой non-loopback target требует Prisma 6 exact
`sslmode=require&sslaccept=strict`; duplicate query parameters и host override
отклоняются. Production дополнительно требует separately approved HMAC
database identity digest и `pg_stat_ssl=true`. Release binding имеет отдельный
`--verify-release-artifact`: canonical realpath case-sensitive на Linux и
case-insensitive только на Windows. Exact artifact включает
`packages/database/package.json` и `pnpm-lock.yaml`; runtime требует Prisma
Client `6.19.3`, а frozen-lock install/CI является dependency-trust
prerequisite.

В CI добавлены gates
`check:identity-legacy-backfill-inventory`,
`check:identity-legacy-backfill-release-artifact` и
`db:smoke:identity-legacy-backfill-inventory`. Historical `CURRENT_169`
exact-head implementation
`d1162eed042893ec3b27ed823bdaddfa64c7e90f` принят GitHub Actions
[`30479020686`](https://github.com/boozik3412/leetplus/actions/runs/30479020686)
(`run #39`), `3/3 PASS`; финальный independent security review того slice —
`PASS` без оставшихся actionable P0/P1/P2. Production inventory не запускался.
Fresh exact-head CI/review и release-artifact/three-clone evidence для
locator-aware `CURRENT_170` ещё pending; full PostgreSQL inventory smoke
текущего local candidate прошёл.
Production proposal/apply/rollback отсутствуют и запрещены, deployment и
release decision остаются `NOT DEPLOYED / NO-GO`, реальная учётная запись
тестера не создана.

Открытые launch-blocking P0:

1. Принять fresh exact-head CI/review и release-bound inventory tooling
   `BETA-IAM-004B` на `CURRENT_170`; затем отдельно выполнить approved
   production-like read-only inventory и только потом будущий signed
   proposal/apply/rollback. Collision/ambiguous rows не допускаются
   автоматически.
2. Принять exact-head locator candidate и реализовать sealed issue-by-locator,
   persisted `SHARED BETA GO`, trial start и initial OWNER invite.
3. Encrypted leased identity-mail outbox, verified delivery, resend/revoke,
   session revoke и production proxy/APM/CSP/browser/mail-client acceptance
   реализованного `BETA-IAM-004E`.
4. First-class verified `EMAIL_CHANGE`; до него email mutation остаётся
   закрытой.
5. Bounded natural-expiry sweeper с audit/reconciliation.
6. Production-like migration 168→170, inventory/backfill dry-run,
   apply/rollback/zero-diff, full accept/revoke/reissue concurrency и
   two-tenant application/browser matrix.
7. Function body/owner attestation, production fingerprint secret,
   backup/restore, monitoring и exact release-artifact CI/review после
   оставшихся изменений.

Исторический independent review широкого `CURRENT_169` application
writer-boundary diff не обнаружил P0/P1. В нём остались P2:
literal-pattern static writer test требуется усилить AST/DB-level boundary
против raw SQL, aliases и nested writes; callback unit mocks не заменяют
реальный PostgreSQL rollback/race evidence из пункта 6. Это не verdict
отдельного `BETA-IAM-004D`, чей exact-head review учитывается отдельно.

Канонические подробные checkpoints:
[identity invite writer boundary](./docs/open-beta/identity-invite-writer-boundary.md)
и
[legacy identity reconciliation](./docs/open-beta/identity-legacy-backfill.md).
До закрытия P0, Gate 1MT, Gate 2 и protected `SHARED BETA GO` обе admin route
остаются `503`, реальная учётная запись тестера не создаётся, временный пароль
не устанавливается и production не изменяется.

### 5.34. `DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1` — 29.07.2026

Legacy isolated design-partner path больше не является параллельным
identity writer:

- CLI-команды `provision` и `rotate-invite` завершаются
  `DESIGN_PARTNER_IDENTITY_WRITER_DISABLED` до чтения manifest, создания
  Prisma client, обращения к БД, HMAC/token generation или формирования URL;
- exported `provisionDesignPartner` и `rotateDesignPartnerInvite` имеют ту же
  безусловную fail-closed границу; legacy write bodies и invite URL builder
  удалены;
- `status` сохраняется только как read-only verifier исторических isolated
  fixtures и существующих HMAC-bound provisioning/rotation receipts;
- emergency `suspend` сохраняется как narrowing-only операция: он не создаёт
  tenant, Store, User, invite или token, а только выключает существующие
  Tenant/Store/integration sources/credentials и pending invites;
- для этого historical checkpoint schema target `CURRENT_169`, migration set,
  exact six-RPC runtime allowlist, shared Platform Admin controllers и их
  ответы `503` не изменялись.

Historical milestone evidence:

```text
local unit + executable boundary: 23/23 PASS
local PostgreSQL writer-isolation smoke: NOT RUN / DATABASE_URL/Postgres absent
implementation exact-head: f4224072f60507bd97f8e49440e3bda89ffe2aaa
GitHub CI: 30483184102 / run #41 / 3 of 3 PASS
Application job: 90682228273 / PASS
PostgreSQL 16 job: 90682228302 / writer-isolation lifecycle PASS
Authority root job: 90682228357 / PASS
independent review: PASS / no actionable P0/P1/P2 in stated scope
production/account/invites: UNCHANGED
release decision: NO-GO
```

Engineering checkpoint `BETA-IAM-004D` принят. Он не реализует shared sealed
activation, initial OWNER outbox,
Tenant D/Store D1 provisioning или выдачу credentials. `BETA-DP-005` остаётся
заблокированным до отдельного reviewed writer поверх общей sealed identity
state machine. Канонический контракт:
[design-partner identity writer isolation](./docs/open-beta/design-partner-identity-writer-isolation.md).

### 5.35. `INVITE_SECRET_TRANSPORT_V1` — 29.07.2026

Bearer-secret приглашения вынесены из HTTP path/query в отдельную
fail-closed transport boundary:

- canonical delivery URL — `/register#invite=<43-char base64url>`;
- client gate один раз capture-ит fragment, синхронно scrub-ит URL до
  `/register` и только затем выполняет session/preview request; token остаётся
  только в ephemeral React memory;
- preview/accept используют fixed same-origin POST BFF/API routes и JSON body;
  legacy token-path route и query fallback удалены;
- BFF runtime boundary проверяет media type, Origin, `Sec-Fetch-Site`,
  allowlisted fields и canonical token, потоково прекращает чтение после
  `4 KiB`; API использует отдельный route-scoped `4kb` JSON parser и
  отклоняет malformed token до Prisma;
- preview response строится по явной allowlist-проекции и fail-closed
  отклоняет отражённый token/неизвестную структуру;
- `/register`, BFF/API и временные INTERNAL create/reissue responses получают
  private `no-store`/`no-referrer`/`nosniff` controls.

Для этого historical transport checkpoint schema остаётся `CURRENT_169`,
exact six-RPC runtime allowlist и обе shared-beta admin route не изменялись.
Для каждого non-`INTERNAL` generic
invite issue/reissue остаётся fail-closed. В compatibility lane текущей сети
авторизованный actor/UI всё ещё получает raw fragment-only `registrationUrl`;
это явно не verified delivery и должно быть удалено после encrypted outbox.

Historical transport milestone evidence:

```text
focused API: 4 suites / 68 PASS
dedicated API route/body-limit e2e: 1 suite / 6 PASS
full API regression: 101 suites / 1958 PASS / 2 todo
web parser + runtime boundary/projection: 7/7 PASS
API invite lint: PASS
API/web typecheck + production build: PASS
manual browser smoke: fragment scrub/query deny/reload deny/valid preview PASS
schema/migrations/RPC allowlist at milestone: UNCHANGED / CURRENT_169
production/account/invites: UNCHANGED
implementation exact-head: f09383563bbcc22e11e0e67ca597360cf8996f4b
GitHub CI: 30488598755 / run #43 / 3 of 3 PASS
Application job: 90700487213 / PASS
PostgreSQL 16 job: 90700487216 / PASS
Authority root job: 90700487264 / PASS
final independent re-review: PASS / no actionable P0/P1/P2
release decision: NO-GO
```

Legacy query links нельзя мигрировать автоматически: raw token не
восстанавливается из `tokenHash`. Перед deploy требуются inventory,
log review, revoke/reissue через verified delivery и уведомление получателей.
Production proxy/WAF/APM body redaction, постоянный `/register` query/legacy
path request-target redaction, strict CSP, final-origin HTTPS без
redirect/tracker и Gmail/Outlook/Telegram/mobile browser matrix остаются
отдельными acceptance gates.

Канонический контракт:
[invite secret transport](./docs/open-beta/invite-secret-transport.md).

### 5.36. `MIGRATION_170_ACTIVATION_LOCATOR` — 29.07.2026

`CURRENT_170` реализован как локально проверенный candidate:

- `IdentityEmailClaim.workflowLocator` — immutable opaque UUID, выведенный из
  initial server-generated reservation subject;
- upgrade preflight и revision guard требуют exact lowercase trimmed UUID;
  uppercase, surrounding whitespace и иной non-canonical subject отклоняются
  fail-closed с transactional rollback;
- partial unique invariant действует для `INVITE | USER`;
- PII-free sealed assert выполняет
  `bounded lookup → canonical e-mail advisory lock → exact row recheck`;
- shell replay использует persisted reservation UUID и больше не передаёт raw
  e-mail в assert;
- runtime candidate имеет exact seven-RPC allowlist и zero effective
  `IdentityEmailClaim` table/column privileges;
- local PostgreSQL 16 подтвердил populated `169 → 170`, clean `170/170`,
  locator/ACL/lock-race checks, fail-closed rollback legacy subject не в exact
  lowercase trimmed UUID, включая uppercase/whitespace, и shell `2/2`.

Exact committed SHA, CI, independent review и новый release-bound inventory
ещё pending. Locator является correlation key, а не authority; он не создаёт
`UserInvite`, token, outbox, trial или письмо и не включает admin route.
Следующий обязательный primitive — sealed issue-by-locator, после него нужны
encrypted leased outbox, persisted GO и dedicated activation.

Канонический контракт:
[identity activation locator](./docs/open-beta/identity-activation-locator.md).

## 6. Release gates

### Gate 0 — каноническая основа

- Завершены `BETA-SRC-001` и `BETA-SRC-002`.
- Известен exact candidate SHA.
- Новая функциональность вне launch scope заморожена.

### Gate 1 — безопасная платформа

- Завершены все `BETA-SEC` P0, `BETA-TEN` P0, `BETA-IAM` P0.
- Anonymous B2B API отвечает `401`.
- Двухtenantная и двухклубная suite зелёная.
- Suspend останавливает HTTP и background execution.

### Gate 1DP — optional contingency/enterprise isolation

- Завершены и приняты `BETA-DP-001..009`.
- Partner environment имеет отдельные web, API, PostgreSQL, secrets и storage
  namespace и технически не может обратиться к production data Tenant A.
- Exact SHA, CI, ephemeral PostgreSQL/IDOR/browser smoke, health/version,
  backup/restore и rollback evidence зелёные.
- `Tenant D` содержит ровно один `Store D1`; owner/invite/scope/capability
  работают fail-closed, Platform Admin клиенту не выдаётся.
- Все согласованные начальные slices `DP-S0..DP-S4` имеют
  `VERIFIED + ENFORCED`; не входящие в scope surfaces остаются `OFF`.
- Все schedulers, all-tenant jobs и outbound effects остаются `OFF`; их
  включение требует отдельных surface/outbound `GO`.
- Support, feedback, incident, stop/offboarding owners и expiry назначены.
- После выполнения технических preconditions отдельный
  `DESIGN_PARTNER GO` из `BETA-DP-010` сохранён до выдачи credentials.

Gate 1DP не входит в основной launch critical path. Он разрешает только одного
named partner в isolated environment после отдельного решения о необходимости
изоляции. Он не разрешает shared-data-plane access, второго партнёра, cutover
текущей сети или общую внешнюю когорту и не закрывает Gate 1, Gate 1MT,
Gate 2A, Gate 2 либо Gate 3.

### Gate 1MT — shared multi-tenant technical admission

- Завершены и приняты `BETA-MT-001..009`.
- Shared topology содержит текущий `Tenant A/A1..A4` и независимый
  `Tenant B/B1`; публичный demo не использует их operational data.
- Persisted lifecycle/stage/trial и module read/write/outbound entitlements
  действуют fail-closed для API, BFF, files, jobs, sync, rewards и Telegram.
- Shell provisioning не создаёт invite/token/trial; OWNER invite + encrypted
  outbox создаются только dedicated activation по persisted GO и дают
  `NETWORK` только внутри `Tenant B`; дальнейшая delegation не может расширить
  полномочия actor.
- Отдельная non-owner runtime role имеет exact seven-RPC allowlist и zero
  `IdentityEmailClaim` DML; legacy `User`/`UserInvite` writers используют
  sealed invariant, отдельное production fingerprint HMAC secret value `v1`
  настроено и аттестовано, а activation находит и перепроверяет reservation
  без raw-email leak.
- Full two-tenant/two-store PostgreSQL, API/BFF/browser/file/job/SSE/Telegram
  matrix для всех обязательных модулей зелёная без test-only bypass.
- `INTEGRATIONS` допускает только tenant-owned encrypted credentials,
  безопасный preview и exact club mapping; unattended sync и write-back
  остаются `OFF` до отдельных outbound gates.
- Shared workers используют tenant/store system identity, durable
  lease/fencing/idempotency; suspend и kill switches проверены.
- Exact reviewed SHA, CI, version, backup/restore, rollback, alerts, support и
  incident evidence приняты.

Gate 1MT подтверждает техническую готовность общего data plane, но сам по себе
не разрешает owner invite: до первого внешнего доступа также обязателен
Gate 2 и protected `SHARED BETA GO` из `BETA-MT-010`.

### Gate 2A — разрешение на cutover текущей сети

- Завершены все pre-cutover `BETA-OPS` P0 и `BETA-MOD-*` P0.
- Production-like admission, inventory/planner, row dry-run, apply, rollback и
  zero-diff имеют отдельные принятые evidence records.
- Backup/restore и rollback rehearsals успешны; topology manifest подтверждает
  один существующий `Tenant` и четыре `Store`.
- Cutover checklist не содержит незакрытых stop condition.
- Назначены change window, owner и отдельный explicit `CUTOVER GO`.

`Gate 2A` разрешает только cutover текущей сети. Он не разрешает внешний pilot.

### Gate 2 — готовность текущей сети и внешнего invite-only pilot

- Выполнен `Gate 1MT`.
- Выполнен `Gate 2A`.
- Текущий tenant переведён in place; четыре клуба сверены.
- Выполнены backup restore, rollback и alert drills.
- Internal alpha прошла семь стабильных дней.

Обязательные module gates:

- Gamification: для каждого включённого store пройдены readiness, shadow, one-user canary и reconciliation; нет unresolved ledger posting; kill switch проверен.
- Assortment: 4/4 stores сопоставлены; initial sync и backfill приняты; остатки, операции и выручка сверены; freshness видна.
- Staff: пройдены сценарии OWNER, network manager, club manager, senior/admin и trainee; attachments работают в `ENFORCED` после adoption/backfill/canary; `LEGACY/SHADOW` запрещены для внешнего beta; salary остаётся planning-only; автоматических санкций нет.
- Communications: проверены network/store channels, messages, mentions, read receipts, notifications, CRM contact tasks, SSE/reconnect и PII policy.
- Users and roles: actor не может выдать scope или capability шире собственного; revoke действует немедленно; Platform Admin недоступен tenant users.

После Gate 1MT и Gate 2 отдельный `SHARED BETA GO` разрешает owner invite
первого внешнего `Tenant B/Store B1` в общем data plane.

Optional isolated `SINGLE_DESIGN_PARTNER`, если он отдельно прошёл Gate 1DP,
не считается этой когортой и не заменяет ни одно условие Gate 1MT/Gate 2.

### Gate 3 — готовность открытого заявочного теста

- Две friendly-сети прошли 14 дней.
- Нет подтверждённых cross-tenant/store/PII incident.
- Нет открытых launch-blocking P0/P1.
- Scheduled sync success не ниже 98%, freshness не хуже 24 часов.
- Контрольные операции и выручка расходятся не более чем на 1% либо исключение документировано.
- Каждый tenant имеет owner, support owner, entitlement profile и завершённый checklist.
- Каждый production incident и feedback привязан к release SHA.
- Suspend, restore, rollback, export и offboarding проверены.

Результаты optional isolated DP-1 могут использоваться как product feedback,
но не входят в метрики Gate 3, пока после Gate 1MT/Gate 2 партнёр не переведён
отдельным решением в shared когорту и для него не начато новое измерительное
окно.

## 7. Рекомендуемая последовательность разработки

Основная последовательность ниже — shared production/cutover path. Работы
`BETA-MT-001..011` являются частью этого critical path. `BETA-DP-*` можно
возобновить только по отдельному решению о contingency/enterprise isolation;
эта lane не переносит approvals или evidence в shared последовательность.

1. Schema target — `CURRENT_170`. Local disposable PostgreSQL `16.13`
   подтвердил `170/170`, populated `169 → 170`, exact seven-RPC allowlist,
   locator/ACL/rollback checks, identity `1 winner / 99 replay`, explicit
   revoke→release→same-email reserve, shell `2/2`, full API
   `101 suites / 1960 passed / 2 todo`. Exact-head CI/review current candidate
   pending. Historical engineering exact-head `CURRENT_169`
   `f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
   `30467882578` (`run #37`), `3/3 PASS`, и independent review без новых
   P0/P1. Предыдущий `CURRENT_168` implementation
   `3b8228dd278fae062c753bf4301e0339ba93738b` / CI `30460154200` остаётся
   historical prerequisite. SHA
   `2341b999...`, `044ceca2...` и
   accepted precursor
   `c1fee42cc0d85a2c2d1acb354ff5198280bc4ecc` являются historical evidence, а
   не current candidate. Previous accepted baseline связан с PR head
   `bbef153a288bfdf1c3573eb704f27c013cc0e856` и merge-ref CI
   `30443837684` (`run #23`); это не exact-SHA evidence. Legacy quarantine
   delivery-row/lifecycle freeze закрыла первый P1. Exact-head
   `a644b81...` / CI `30447011917` (`run #27`) rejected (`2/3 PASS`,
   PostgreSQL `FAIL`). Previous accepted exact-head checkpoint —
   `d525b736d03162a2c58de17cbf7679ba6f515096` / CI `30447467729`
   (`run #28`), `3/3 PASS`; он закрыл reason/evidence и worker durable-event
   P1. Последний принятый provider-write checkpoint —
   `be8c94c4ea9106a31055a0aff577ffbd62b67e7c` / CI `30449026506`
   (`run #29`), `3/3 PASS`; private SECURITY INVOKER lock boundary и
   двухсессионный rehearsal закрыли lock-order/`40P01` P1. Все четыре
   исходных engineering provider-write P1 закрыты.
   Bundle не передавать в auto-deploy `main`: этот checkpoint не является
   production-like admission, deploy или cutover.
2. После принятия current test evidence независимо проверить detached
   authority candidate, утвердить внешний signer/HSM, separation of duties,
   key custody и защищённый acquisition-to-signature transport. Private
   signing key в repository, LeetPlus process, CI variables общего назначения
   или snapshot не хранить.
3. Отдельным reviewed security change enrol pinned Ed25519 public root и
   получить зелёный remote CI exact enrolled-root SHA до любого acquisition.
   Затем оформить первый canonical acquisition request с
   approval/minimization/encryption/no-egress/TTL/destruction controls и
   получить свежий disposable production-like snapshot baseline.
   Подписанный authority manifest обязан связать release SHA, database
   identity, artifact digest, approval, database marker и freshness.
4. Создать отдельную `LOGIN NOINHERIT` reader role с exact grants, пройти
   negative ACL gate и выполнить production-like admission schema `v2`:
   отдельные request/nonce/envelope/marker для `BASELINE_156` и первый
   admission; затем применить только migrations `157..162`, создать новый
   acquisition request и получить новый `EXPAND_162` envelope с новым
   nonce-bound binding, заменить DB marker его digest и выполнить второй
   admission. Затем применить только exact allowlisted migrations
   `20260728120000_tenant_execution_control_plane_expand`, затем exact
   `20260728150000_tenant_execution_revision_fence`, exact
   `20260729120000_store_background_execution_fence`, exact
   `20260729160000_guest_game_delivery_claim_fence`, exact
   `20260729190000_identity_email_claim_foundation`, exact
   `20260729210000_identity_email_claim_write_boundary`, exact
   `20260729230000_identity_invite_writer_boundary` и exact
   `20260729233000_identity_activation_locator`, выпустить новый
   `CURRENT_170` request/envelope с новым binding, повторно заменить marker и
   пройти current admission. Protected StaffTask evidence остаётся bound к prefix 162;
   предыдущие marker не переиспользовать; все state-specific authority bundle и
   marker-rotation attestation сохранить. Exact роль
   получает table `SELECT` на восьми разрешённых relations и только
   `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`; любой
   non-zero exit или authority/marker/freshness/blob/ACL mismatch
   останавливает работу. После повторного zero-diff inventory/planner login
   reader role отзывается и удаляется до уничтожения snapshot.
5. Только после всех state-specific admission отдельно выполнить read-only inventory и
   aggregate reconciliation planner schema `v1` на exact current
   `CURRENT_170` (`migrationCount=170`, latest
   `20260729233000_identity_activation_locator`) с
   одинаковыми thresholds, exact protected StaffTask catalog gate и owner для
   каждого non-zero code. HMAC
   `databaseIdentityDigest`, `contentDigest` и `executionDigest` являются
   aggregate evidence, а не provenance, row-level/CAS authorization или
   authority.
6. Отдельно спроектировать и утвердить production-like row dry-run с
   protected row evidence, owner decisions и immutable binding. SYNTHETIC
   rehearsal, даже прошедший все 8 codes/8 occurrences/7 cases, не является
   Gate 2 evidence.
7. Отдельным reviewed change реализовать explicit idempotent apply с
   immutable input, owner approval, row lock/recheck, audit и rollback. После
   apply отдельно выполнить zero-diff dry-run и повторить inventory/planner;
   один approval не распространяется между dry-run, apply и zero-diff.
8. Только при zero blocking и принятых review findings принимать отдельные
   решения по `VALIDATE` всех 14 composite FK, N-1 window, `CONTRACT` для 14
   simple compatibility FK и deployment.
9. На staging классифицировать persisted `NETWORK|STORES` для tenant одной сети
   с четырьмя клубами; strict AccessScope разрешить только при нуле unresolved
   active users/invites.
10. Запустить read-only attachment inventory, затем реализовать отдельный
    idempotent apply/backfill/reconciliation tool с explicit apply,
    quarantine и повторным zero-diff dry-run.
11. Сохранить scheduler/all-tenant route незарегистрированными до
    lifecycle/entitlement, system identity и durable lease/fencing; реализовать
    оставшиеся task-shift/Store/provenance invariants, global timezone policy и
    полную production-like A1/A2/B API/BFF/browser/file evidence; продолжить
    parent adoption в порядке `CHECKLIST_RUN`, затем
    `KNOWLEDGE_ARTICLE/SHIFT_REGULATION`, затем
    `TRAINING_COURSE/ONBOARDING_PLAN`; для каждого добавлять atomic bind, live
    parent ACL, revoke и A1/A2/B tests.
12. Использовать реализованный process-wide `SHADOW` для mismatch evidence,
    добавить tenant/store canary orchestration и aggregate gate, затем включить
    `ENFORCED`; пройти browser/BFF/file regression и rollback drill.
13. Завершить оставшиеся staff/communications surfaces, включая membership,
    mentions, receipts, SSE, notifications, PII и background execution.
14. Завершить initial OWNER IAM поверх уже реализованных claim boundary,
    shell service и application issue/reissue/revoke/accept writers:
    использовать принятые exact-head CI/review `BETA-IAM-004B` как
    engineering prerequisite, затем отдельно выполнить production-like
    inventory и будущий signed proposal/apply/rollback; принять PostgreSQL,
    exact-head CI и independent review уже реализованной fail-closed изоляции
    design-partner CLI; принять locator exact-head, добавить sealed
    issue-by-locator, encrypted leased outbox, persisted GO, protected
    issue/reissue/revoke/accept, POST-body token
    transport production acceptance, session revoke и полный 100-way
    concurrency matrix. Engineering transport foundation уже выделен в
    `BETA-IAM-004E`; обе admin route до завершения остаются `503`.
15. Последовательно подключить единый scope к gamification/ledger, затем к
    assortment/reports/imports и пройти store-level negative suites.
16. Добавить PII reveal/export audit policy и browser E2E для пяти обязательных
    контуров.
17. Завершить `BETA-MT-001..006`: historical engineering exact-head `CURRENT_169`
    `f5d39fd89145c995c51e7005698327f5581a5cd8` / CI `30467882578`
    (`run #37`) принят, `3/3 PASS`, но не deployed и не production-like
    admission; exact-head CI/review `CURRENT_170` ещё pending. Затем закрыть
    `BETA-IAM-004B`, persisted GO + owner
    activation/invite, delegation limits и безопасный tenant-owned
    integrations control-plane.
18. Реализовать `BETA-MT-007..009`: полную shared PostgreSQL/API/BFF/browser/
    file/job/SSE/Telegram isolation matrix, tenant-aware worker/Telegram
    execution и full-scope module acceptance для `Tenant B/Store B1`.
19. Завершить эксплуатационный контур: immutable artifact, versioned
    infrastructure, external probes/alerts, scheduler ownership,
    backup/restore и rollback drills.
20. Провести legacy-key audit и безопасный secret/session/invite/referral
    cutover.
21. Зафиксировать topology manifest и выполнить dry-run in-place cutover одной
    сети из четырёх клубов без смены `tenantId`.
22. Закрыть все pre-cutover условия `Gate 2A` и сохранить отдельный explicit
    `CUTOVER GO` с approver, change window и stop conditions.
23. Выполнить cutover, staged Langame sync, full-scope acceptance и
    post-cutover rollback verification.
24. Провести семь стабильных дней internal alpha. После выполнения Gate 1MT и
    всех условий Gate 2 сохранить protected `SHARED BETA GO`, затем создать
    owner invite первого `Tenant B/Store B1`. Плановый ориентир окна
    `31.08–07.09.2026` условный и автоматически сдвигается при failed gate.
25. После принятого first-club review подключить ещё две friendly-сети не чаще
    одного tenant каждые 3–4 дня и провести
    14-дневный pilot.
26. После Gate 3 открыть приём заявок, сохранив ручное одобрение и когортные
    лимиты.

## 8. Метрики запуска

- Security: 0 cross-tenant, cross-store и несанкционированных PII incident.
- Reliability: scheduled sync success ≥98% за 14 дней.
- Freshness: не хуже 24 часов для ежедневной аналитики.
- Data quality: расхождение контрольных операций и выручки ≤1% либо документированное исключение.
- Release: 100% production процессов показывают exact SHA.
- Provisioning: 100% pilot tenants создаются без ручного SQL.
- Recovery: свежие backup restore и N-1 rollback drills успешны.
- Support: critical acknowledgment ≤2 рабочих часов.
- Activation: owner принял invite, завершил sync и выполнил первое действие в каждом обязательном модуле.
- Retention: каждый pilot tenant повторил минимум один целевой workflow две недели подряд.
- DP isolation: partner web/API/PostgreSQL/secrets не имеют production
  credentials или data path; неожиданных scheduler/outbound executions — 0.
- DP control: 100% активных surfaces имеют отдельные evidence SHA,
  entitlement revision, owner и проверенный kill switch.

## 9. Осознанно отложено

- Billing, платёжный шлюз и автоматическое продление.
- Self-service tenant registration.
- Массовые маркетинговые кампании и рассылки.
- Полный гостевой CRM-аналитический модуль вне CRM-задач коммуникаций.
- Полная декомпозиция всех крупных сервисов до начала пилота.
- Исправление всего исторического lint backlog одним изменением.
- Горизонтальное масштабирование API до выделения безопасного worker/scheduler ownership.

Отложенные пункты не могут использоваться для обхода P0/P1 требований этого backlog.
