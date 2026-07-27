# LeetPlus — специальный backlog выхода на открытый тест

- Дата актуализации: 27.07.2026
- Версия: 1.12
- Статус документа: активный launch backlog
- Текущий release decision: `NO-GO` для внешних доступов до прохождения Gate 2
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
- Открытый тест сначала остаётся заявочным и invite-only. Публичная self-registration не является условием запуска.
- Первый внешний тест не ограничивается только аналитикой. Тестовый tenant получает обязательный состав модулей, перечисленный ниже.

## 3. Обязательный состав первого внешнего теста

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

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-SRC-001 | P0 | Готово | Сохранить исходные локальные изменения и локальные коммиты | Динамический source manifest фиксирует branch, HEAD, origin/main, ahead/behind и worktree; работа сохранена в отдельной ветке/коммитах без потерь | — |
| BETA-SRC-002 | P0 | В работе | Осознанно согласовать local `main` с `origin/main` | Один канонический clean SHA; расхождение `ahead/behind` устранено без уничтожения локальной работы | BETA-SRC-001 |
| BETA-SRC-003 | P0 | Запланировано | Защитить `main` и ввести release freeze на новые функции | Merge возможен только после обязательных checks; до Gate 3 принимаются только launch-blockers и обязательный beta scope | BETA-SRC-002, BETA-OPS-001 |
| BETA-SRC-004 | P1 | Запланировано | Версионировать nginx, systemd, deploy и env examples | Production-конфигурация воспроизводится из репозитория; секреты отсутствуют; review показывает точный diff инфраструктуры | BETA-SRC-002 |

### 5.2. P0: безопасность и изоляция

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-SEC-001 | P0 | В работе | Убрать optional-auth со всех operational B2B endpoints | Anonymous dashboard, products, stores, categories, suppliers, reports, staff, communications и management отвечают `401`; BFF не обходит защиту | BETA-SRC-002 |
| BETA-SEC-002 | P1 | Запланировано | При необходимости создать безопасную архитектуру публичного demo | Публичны только allowlist-проекции синтетического `public-demo`; отсутствуют реальные выручка, себестоимость, остатки, адреса, внешние ID, PII и secrets; есть pagination и rate limit; задача не задерживает invite-only pilot после закрытия anonymous operational API | BETA-SEC-001 |
| BETA-SEC-003 | P0 | В работе | Ввести единый server-side `AccessScope` | Каждый запрос пересекается с `tenantId` и `allowedStoreIds`; пустой или отсутствующий scope даёт deny-by-default; store-bound facts всегда фильтруются, а tenant-global write разрешён только network-scoped роли; общий механизм используется всеми обязательными модулями | BETA-SRC-002 |
| BETA-SEC-004 | P0 | В работе | Сделать capabilities авторитетной endpoint-проверкой | Совпадение стандартной роли не обходит capability; capability задаётся декларативно на endpoint; frontend visibility не считается защитой | BETA-SEC-003 |
| BETA-SEC-005 | P0 | Запланировано | Разделить просмотр бизнес-данных, PII reveal и export | PII маскирована по умолчанию; reveal/export требуют отдельных capabilities; каждое действие аудируется с tenant, store scope, user, route и request ID | BETA-SEC-004 |
| BETA-SEC-006 | P0 | В работе | Добавить двухtenantную и двухклубную IDOR/integration suite | Tenant A/Store A не читает, не изменяет и не экспортирует Tenant B/Store B через list, UUID, filters, aggregates, exports, attachments, BFF или jobs | BETA-SEC-003, BETA-SEC-004, BETA-OPS-002 |
| BETA-SEC-007 | P0 | В работе | Удалить известный production QA/seed риск | Известные credentials не работают; QA не Platform Admin; все сессии отозваны; seed отказывается работать с production DB и создаёт случайные local credentials | BETA-SRC-002 |
| BETA-SEC-008 | P0 | В работе | Добавить fail-closed startup validation и разделить secrets | Production не запускается с отсутствующими, placeholder, короткими или повторно используемыми JWT, PII, HMAC, integration, referral и scheduler secrets; opaque invite tokens генерируются случайно и хранятся только как hash; ротация secrets версионирована | BETA-SRC-002 |
| BETA-SEC-009 | P0 | В работе | Сделать принятие приглашения атомарным | Invite привязан к email; один conditional claim; 100 параллельных запросов создают ровно одного пользователя; изменение email/role/stores/TTL ротирует token | BETA-SEC-008 |
| BETA-SEC-010 | P0 | Запланировано | Усилить B2B authentication | Rate limit и progressive backoff на login/invite; password reset; revoke sessions; MFA либо эквивалентное усиление Platform Admin; security headers проверяются deploy smoke | BETA-SEC-008, BETA-IAM-004 |

### 5.3. Tenant lifecycle, entitlements и provisioning

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-TEN-001 | P0 | Запланировано | Разделить operational lifecycle и customer stage | Существуют lifecycle `ACTIVE/SUSPENDED/ARCHIVED` и отдельный stage `INTERNAL/PILOT/BETA/LIVE`; сохраняются cohort, trial dates, support owner и onboarding state | BETA-SRC-002 |
| BETA-TEN-002 | P0 | Запланировано | Добавить tenant/store entitlements | Профиль первого теста включает `gamification`, `assortment`, `staff`, `communications`, `users_roles`; read/write/outbound управляются отдельно; изменения имеют reason, expiry и audit | BETA-TEN-001 |
| BETA-TEN-003 | P0 | Запланировано | Реализовать idempotent Platform Admin provisioning | Одно действие создаёт tenant в `PROVISIONING`, обязательный beta entitlement profile, email-bound OWNER invite, support owner и checklist; повтор не создаёт дублей | BETA-TEN-001, BETA-TEN-002, BETA-SEC-009 |
| BETA-TEN-004 | P0 | Запланировано | Ввести единый `TenantExecutionPolicy` | Login, invites, HTTP writes, schedulers, sync, messages, rewards и exports проверяют lifecycle, trial, entitlement и store scope; suspend останавливает обработку немедленно | BETA-TEN-002, BETA-SEC-003 |
| BETA-TEN-005 | P1 | Запланировано | Расширить Platform Admin cockpit | Видны stage, trial, entitlement, owner invite, onboarding, stores, source freshness, sync errors, last activity, support owner и incidents | BETA-TEN-003, BETA-OPS-010 |
| BETA-TEN-006 | P0 | Запланировано | Реализовать offboarding и retention workflow | Suspend/archive отзывает invites/sessions, выключает integrations и jobs; data export/delete/retention выполняются по утверждённой процедуре и аудируются | BETA-TEN-004 |
| BETA-TEN-007 | P0 | Запланировано | Поддержать безопасную смену tenant slug | Старые QR, Telegram и guest URLs имеют контролируемый alias/redirect либо перевыпускаются; alias не позволяет обратиться к чужому tenant | BETA-SEC-003 |

### 5.4. Пользователи и роли

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-IAM-001 | P0 | В работе | Утвердить role/capability matrix обязательного beta scope | Для OWNER, ADMIN, network manager, club manager и сотрудников перечислены разрешённые действия во всех пяти обязательных контурах; deny-by-default | BETA-SEC-004 |
| BETA-IAM-002 | P0 | В работе | Реализовать явный network-level и club-level scope | `NETWORK` и `STORES` — явные режимы; отсутствие `UserStoreAccess` не повышает пользователя до NETWORK; смена scope действует сразу на API, BFF, exports, files и активные сессии | BETA-SEC-003, BETA-IAM-001 |
| BETA-IAM-003 | P0 | В работе | Ограничить полномочия управляющего actor | Store manager не может создать NETWORK user, назначить чужой store, выдать роль/capability выше собственной или управлять пользователем вне пересечения scopes; защищены self-escalation и последний OWNER | BETA-IAM-001, BETA-IAM-002 |
| BETA-IAM-004 | P0 | В работе | Завершить invite/resend/revoke workflow | Только email-bound opaque invites; update ротирует token; send/resend/revoke/accept аудируются; TTL настраивается; actor не может выдать invite шире своего scope; revoked/expired token не работает | BETA-SEC-009, BETA-IAM-003 |
| BETA-IAM-005 | P0 | Запланировано | Ограничить особо чувствительное повышение привилегий | Только явно разрешённая роль может назначить OWNER или чувствительные capabilities; Platform Admin нельзя назначить tenant API | BETA-IAM-001, BETA-IAM-003 |
| BETA-IAM-006 | P0 | Запланировано | Свести backend/frontend permission maps | Один источник или contract-test подтверждает одинаковые роли, capabilities и nav visibility; скрытый UI не заменяет API authorization | BETA-IAM-001 |
| BETA-IAM-007 | P0 | Запланировано | Добавить журнал доступа и управление сессиями | Владелец видит активных пользователей и security events своей сети; может блокировать аккаунт и отзывать его сессии | BETA-SEC-010 |
| BETA-IAM-008 | P1 | Запланировано | Принять multi-network identity model | Решено, может ли один email состоять в нескольких независимых tenant; глобальная уникальность `User.email` либо сохранена как явное ограничение первого pilot, либо заменена membership-моделью с миграцией | BETA-TEN-003 |

### 5.5. CI/CD, БД и эксплуатационная надёжность

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-OPS-001 | P0 | В работе | Ввести обязательный CI | Frozen install, Prisma validate/generate, API tests/typecheck/build, web lint/typecheck/build и migration check обязательны для merge; CI-команды не изменяют файлы | BETA-SRC-002 |
| BETA-OPS-002 | P0 | В работе | Добавить real PostgreSQL integration environment | Все миграции применяются с нуля; smoke использует реальную БД; проверяются tenant/store isolation, provisioning, suspend и ключевые writes | BETA-OPS-001 |
| BETA-OPS-003 | P0 | Запланировано | Добавить frontend browser smoke | Автоматизированы login, owner invite, store switch/scope, обязательная навигация, ключевой сценарий каждого модуля и logout | BETA-OPS-001, BETA-IAM-002 |
| BETA-OPS-004 | P0 | Запланировано | Перейти на immutable release artifact | API, web и Telegram edge собираются один раз; release manifest содержит SHA/build time/schema; staging и production используют один artifact | BETA-OPS-001, BETA-SRC-004 |
| BETA-OPS-005 | P0 | В работе | Реализовать live/ready/version endpoints | Liveness не зависит от Langame; readiness выполняет DB/schema/storage checks; version показывает exact SHA; внешний probe проверяет web/API/game | BETA-OPS-004 |
| BETA-OPS-006 | P0 | В работе | Зафиксировать безопасную миграционную процедуру | Migration выполняется атомарно, locks берутся до preflight, lock/statement timeout заданы; есть abort/retry smoke, production-like rehearsal, drift/`_prisma_migrations`, backup/postflight и доказанная N/N-1 либо fix-forward стратегия | BETA-OPS-002 |
| BETA-OPS-007 | P0 | Запланировано | Ввести backup/restore и цели восстановления | Encrypted off-host backup мониторится; выполнен свежий restore в отдельную БД; зафиксированы RPO/RTO; восстановлены все stateful данные | BETA-OPS-006 |
| BETA-OPS-008 | P0 | Запланировано | Определить единственного владельца schedulers | До выделения worker технически разрешён один scheduler owner; есть lease/heartbeat/reclaim; каждый job проверяет `TenantExecutionPolicy`; graceful shutdown включён | BETA-TEN-004 |
| BETA-OPS-009 | P0 | Запланировано | Добавить общий reliability envelope Langame | Каждый request имеет timeout; GET retry только с backoff/jitter; неоднозначные writes не ретраятся и идут в reconciliation; ошибки upstream — 502/503; tenant/domain изолированы | BETA-OPS-008 |
| BETA-OPS-010 | P0 | Запланировано | Добавить минимальную observability | Correlation/request ID, tenant/source/SHA, structured errors, 5xx/latency, scheduler heartbeat, sync freshness, queue age и reward reconciliation доступны оператору | BETA-OPS-005 |
| BETA-OPS-011 | P0 | Запланировано | Добавить alerts и incident delivery | Алерты на failed deploy/readiness/backup, 5xx, stale sync, dead-letter, scheduler gap и reward anomalies доставляются ответственному; тестовая тревога подтверждена | BETA-OPS-007, BETA-OPS-010 |
| BETA-OPS-012 | P0 | Запланировано | Реализовать атомарный deploy и rollback | API/web/schema не остаются в смешанной версии; хранится N-1 artifact; rollback drill и failed-readiness rollback фактически выполнены | BETA-OPS-004, BETA-OPS-005, BETA-OPS-006 |

### 5.6. Обязательный модуль: геймификация

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-MOD-GAME-001 | P0 | Запланировано | Провести полный route/action inventory геймификации | Каждый B2B/B2C/API/BFF/Telegram route сопоставлен с entitlement, capability, tenant/store scope, audit и тестом; необозначенных public writes нет | BETA-TEN-002, BETA-IAM-001 |
| BETA-MOD-GAME-002 | P0 | Запланировано | Закрыть B2B management journey | OWNER/authorized manager создаёт, изменяет, запускает и останавливает rules, missions, Battle Pass, lootboxes и rewards только в разрешённых stores | BETA-MOD-GAME-001, BETA-SEC-006 |
| BETA-MOD-GAME-003 | P0 | Запланировано | Закрыть guest journey | Регистрация, выбор клуба, профиль, XP, задания, Battle Pass, lootbox, wallet/reward history, unsubscribe и Telegram Mini App работают внутри выбранного active tenant/store | BETA-MOD-GAME-001, BETA-TEN-004 |
| BETA-MOD-GAME-004 | P0 | Запланировано | Завершить безопасный reward ledger path | Idempotency, immutable reward plan, wallet, entitlement, posting, outbox, dead-letter и reconciliation исключают двойную или потерянную награду | BETA-OPS-002, BETA-OPS-009 |
| BETA-MOD-GAME-005 | P0 | Запланировано | Сделать canary tenant/store-scoped | `OFF → SHADOW → CANARY → LIVE` и kill switch доступны по tenant/store/rule; откат не требует deploy; write-back начинается только после reconciliation gate | BETA-TEN-002, BETA-MOD-GAME-004 |
| BETA-MOD-GAME-006 | P0 | Запланировано | Добавить game isolation and concurrency suite | Проверены cross-tenant/store, повтор события, параллельное открытие, лимиты, restart, stale leases, replay и неоднозначный Langame write | BETA-SEC-006, BETA-MOD-GAME-004 |
| BETA-MOD-GAME-007 | P0 | Запланировано | Закрыть module browser QA и performance | Все admin/guest/mobile/Telegram критические сценарии проходят; нет unbounded responses; журнал и diagnostics позволяют расследовать событие по trace ID | BETA-OPS-003, BETA-OPS-010 |
| BETA-MOD-GAME-008 | P0 | Запланировано | Убрать hardcoded pilot-store и сделать readiness per tenant/store | В коде и runbook нет специального поиска клуба `1337`; оператор явно выбирает tenant/store; readiness проверяет mapping, timezone/geo/public slug, auth channel, freshness facts, scheduler owner и отсутствие unresolved ledger reconciliation | BETA-MOD-GAME-001, BETA-OPS-008 |

### 5.7. Обязательный модуль: ассортимент и товары

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-MOD-ASSORT-001 | P0 | Запланировано | Провести полный route/action inventory ассортимента | Dashboard, products, movements, categories/triage, suppliers, reports, imports и utilities имеют entitlement, capability, tenant/store scope, audit и тест | BETA-TEN-002, BETA-IAM-001 |
| BETA-MOD-ASSORT-002 | P0 | В работе | Закрыть products/catalog legacy и pagination | Anonymous доступ отсутствует; legacy `/products` ограничен или выведен; большие списки paginated; история не агрегируется без ограничений в памяти | BETA-SEC-001, BETA-MOD-ASSORT-001 |
| BETA-MOD-ASSORT-003 | P0 | Запланировано | Проверить категории, suppliers и массовые операции | CRUD, merge, mapping, bulk category и supplier actions tenant-scoped, обратимы где требуется и аудируются | BETA-SEC-006, BETA-MOD-ASSORT-001 |
| BETA-MOD-ASSORT-004 | P0 | Запланировано | Закрыть imports и product parsing | Preview не изменяет данные; apply транзакционен и идемпотентен; файл и результат tenant-scoped; ошибки строк доступны без утечки данных | BETA-OPS-002, BETA-MOD-ASSORT-001 |
| BETA-MOD-ASSORT-005 | P0 | Запланировано | Проверить все отчёты и exports по stores | OOS, ABC, LFL, turnover, matrix, recommendations, sales и supplier reports используют разрешённый scope; суммы UI/API/export совпадают | BETA-SEC-003, BETA-MOD-ASSORT-001 |
| BETA-MOD-ASSORT-006 | P0 | Запланировано | Реализовать staged Langame onboarding ассортимента | Diagnostics → выбор четырёх stores → catalog/categories → inventory/sales → 7 дней → reconciliation → 30–90 дней backfill → daily sync | BETA-OPS-009, BETA-CUT-001 |
| BETA-MOD-ASSORT-007 | P0 | Запланировано | Ввести data-quality gate ассортимента | Для каждого клуба сверены stores, SKU, остатки, операции и выручка; freshness видна; расхождение ≤1% либо документировано доменное исключение | BETA-MOD-ASSORT-006, BETA-OPS-010 |
| BETA-MOD-ASSORT-008 | P0 | Запланировано | Закрыть module browser QA и performance | Ключевые экраны и tables работают на production-like объёме; тяжёлые отчёты bounded/async; export имеет лимиты и понятный прогресс | BETA-OPS-003, BETA-MOD-ASSORT-005 |
| BETA-MOD-ASSORT-009 | P0 | Запланировано | Завершить 360° карточку товара и историю | Карточка показывает идентичность, категории, поставщиков, store-level остатки/продажи/движения, историю переименований и источники; scope применяется до totals/history, deep link и export проверены | BETA-MOD-ASSORT-001, BETA-MOD-ASSORT-005 |

### 5.8. Обязательный модуль: сотрудники

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-MOD-STAFF-001 | P0 | Запланировано | Провести полный route/action inventory staff | Все staff pages/API/BFF, exports, attachments и schedulers сопоставлены с entitlement, capability, tenant/store/staff scope, audit и тестом | BETA-TEN-002, BETA-IAM-001 |
| BETA-MOD-STAFF-002 | P0 | Запланировано | Закрыть directory и identity mapping | Сотрудник, LeetPlus user, store и Langame identity связаны без cross-tenant/store утечки; ручная замена и rollback аудируются | BETA-SEC-006, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-003 | P0 | В работе | Закрыть задачи, templates и recurring rules | Direct task candidate применяет persisted `AccessScope`, server-owned assignment metadata, parent lock/recheck и atomic evidence bind; full API/build и real PG A1→A2/rollback зелёные. До `Готово` остаются templates/recurring/background по `staff-task-catalog-adoption-plan.md`, task/shift DB invariant, revoke и полная A1/A2/B API/BFF/browser suite | BETA-OPS-008, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-004 | P0 | Запланировано | Закрыть shift workspace и shift reports | Сотрудник видит свою смену и назначенные процессы; manager — разрешённые stores; drafts/send/history не выходят за scope | BETA-MOD-STAFF-002, BETA-IAM-002 |
| BETA-MOD-STAFF-005 | P0 | Запланировано | Закрыть регламенты и чек-листы | Draft/publish/archive, targeting, acknowledgements, snapshots, execution, review и reports работают по role/store; опубликованная история неизменяема | BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-006 | P0 | Запланировано | Закрыть знания, обучение и аттестации | Knowledge base, courses, onboarding, tests, assessments, profiles и readiness корректно target-ятся; результаты и read receipts защищены | BETA-MOD-STAFF-001, BETA-IAM-002 |
| BETA-MOD-STAFF-007 | P0 | Запланировано | Закрыть контроль, рейтинги, мотивацию и дисциплину | Staff-control, operations dashboard, ratings, signals, warnings и penalties имеют понятный источник, право просмотра/изменения, комментарий и audit; нет автоматических внешних санкций или Langame write-back | BETA-MOD-STAFF-002, BETA-SEC-005 |
| BETA-MOD-STAFF-008 | P0 | Запланировано | Закрыть salary planning | Schemes, periods, rows, adjustments и exports tenant/store-scoped; расчёт воспроизводим; изменения денег аудируются; доступ отделён отдельной capability; система не выполняет выплаты | BETA-MOD-STAFF-001, BETA-SEC-005 |
| BETA-MOD-STAFF-009 | P0 | В работе | Защитить attachments и evidence | Upload/download/delete проверяют parent resource, tenant/store/task access; тип/размер ограничены; URL не открывает чужой файл; lifecycle, quarantine и retention определены в `docs/security/access-scope/v1/attachment-acl-rollout.md`; фактический checkpoint — `attachment-acl-implementation-checkpoint.md` | BETA-MOD-STAFF-001, BETA-SEC-006 |
| BETA-MOD-STAFF-010 | P0 | Запланировано | Проверить AI-assistant как безопасную функцию staff | Только локальный deterministic режим; нет внешней отправки PII; вывод не изменяет задачи/регламенты/обучение без подтверждения | BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-011 | P0 | Запланировано | Добавить staff end-to-end regression | OWNER, network manager, club manager и employee проходят свои сценарии; запрещённые stores, зарплата, дисциплина, exports и attachments дают deny | BETA-SEC-006, BETA-OPS-003 |

### 5.9. Обязательный модуль: коммуникации

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-MOD-COMMS-001 | P0 | Запланировано | Провести полный route/action inventory коммуникаций | Overview, team chat, channels, messages, notifications, events и CRM contact tasks имеют entitlement, capability, tenant/store scope, audit и тест | BETA-TEN-002, BETA-IAM-001 |
| BETA-MOD-COMMS-002 | P0 | В работе | Закрыть audience, membership и message scope | Для network announcements задана явная audience policy: при необходимости они могут читаться store staff того же tenant, но не дают NETWORK-полномочий; store/custom channel ограничен разрешёнными clubs/members; UUID, SSE, mentions, receipts, attachments и task-from-chat не раскрывают чужие объекты и не создают задачу для всей сети/чужого store | BETA-SEC-006, BETA-MOD-COMMS-001 |
| BETA-MOD-COMMS-003 | P0 | Запланировано | Закрыть notifications и background delivery | Generate/read/acknowledge/resolve соблюдают scope и lifecycle; suspend останавливает внешнюю доставку; повтор не дублирует сообщение | BETA-TEN-004, BETA-OPS-008 |
| BETA-MOD-COMMS-004 | P0 | Запланировано | Защитить CRM contact tasks и PII | Contact data masked by default; reveal/export — отдельные capabilities и audit; пользователь не получает гостя или задачу другого store | BETA-SEC-005, BETA-MOD-COMMS-001 |
| BETA-MOD-COMMS-005 | P0 | Запланировано | Добавить communications end-to-end regression | Проверены chat send/read, channel boundaries, notifications, contact task, suspend и reconnect для network/club/staff roles | BETA-OPS-003, BETA-MOD-COMMS-002, BETA-MOD-COMMS-003 |

### 5.10. Cutover четырёх текущих клубов одной сети

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-CUT-001 | P0 | В работе | Зафиксировать topology manifest текущей сети | Записаны current tenant ID, четыре store ID, Langame domain/mapping, users, roles, sources, public links и контрольные суммы; подтверждено, что это одна сеть | BETA-SRC-002 |
| BETA-CUT-002 | P0 | Запланировано | Провести backup и restore rehearsal перед cutover | Snapshot успешно восстановлен отдельно; подтверждены row counts и контрольные бизнес-суммы; известны время и процедура возврата | BETA-OPS-007, BETA-CUT-001 |
| BETA-CUT-003 | P0 | Запланировано | Подготовить cutover runbook и окно изменения | Есть owner, freeze, stop jobs, SQL/API steps, verification, rollback, коммуникация и stop conditions; dry-run выполнен | BETA-CUT-002, BETA-OPS-012 |
| BETA-CUT-004 | P0 | Запланировано | Перевести operational `demo` в реальный tenant in place | Сохранены tenantId и все FK; изменены name/slug/domain/stage/entitlements; четыре stores, users, продажи, inventory, staff и game data не потеряны | BETA-TEN-002, BETA-TEN-007, BETA-CUT-003 |
| BETA-CUT-005 | P0 | В работе | Удалить зависимость operational данных от имени `demo` | Anonymous fallback не использует реальный tenant; seed не очищает его; jobs/config/routes не полагаются на slug `demo` | BETA-SEC-001, BETA-SEC-007, BETA-CUT-004 |
| BETA-CUT-006 | P0 | Запланировано | Обновить guest/QR/Telegram links и sessions | Старые ссылки контролируемо перенаправлены либо перевыпущены; Telegram/guest login работает на новом slug; устаревшие сессии отозваны | BETA-TEN-007, BETA-CUT-004 |
| BETA-CUT-007 | P0 | Запланировано | Выполнить staged sync и reconciliation четырёх клубов | Все четыре stores выбраны явно; catalog/inventory/sales/staff/game sources проверены; контрольные суммы и freshness приняты по каждому клубу | BETA-MOD-ASSORT-006, BETA-OPS-009 |
| BETA-CUT-008 | P0 | Запланировано | Провести full-scope acceptance текущей сети | Для каждой обязательной области выполнены owner/network manager/club manager/employee/guest сценарии; scope подтверждён на четырёх stores | Все BETA-MOD-* P0 |
| BETA-CUT-009 | P0 | Запланировано | Выдержать internal alpha | Семь последовательных дней без P0/P1 launch incident, потерянного sync, дубликата награды, cross-scope доступа и необработанного critical alert | BETA-CUT-008, BETA-OPS-011 |

### 5.11. Onboarding, feedback и расширение теста

| ID | Приоритет | Статус | Задача | Критерии приёмки | Зависимости |
|---|---|---|---|---|---|
| BETA-PILOT-001 | P0 | Запланировано | Реализовать persisted onboarding checklist | Owner invite, network/stores, Langame diagnostics, mapping, initial sync, reconciliation, users/roles, modules, support и acceptance сохраняются со статусами и audit | BETA-TEN-003 |
| BETA-PILOT-002 | P0 | Запланировано | Реализовать in-product feedback | С каждой страницы отправляется category/severity/message с tenant/user/role/route/SHA/request ID/browser; screenshot только opt-in; бизнес-данные и PII не прикладываются автоматически | BETA-OPS-010 |
| BETA-PILOT-003 | P0 | Запланировано | Добавить feedback inbox и workflow | Platform operator видит new/triaged/planned/fixed/closed, tenant, cohort, release и ответ; критичные обращения создают alert | BETA-PILOT-002, BETA-OPS-011 |
| BETA-PILOT-004 | P0 | Запланировано | Добавить privacy-safe activation telemetry | Видны provisioned → invite accepted → diagnostics → first sync → validation → first module action → second user → D7 return; без raw PII | BETA-PILOT-001, BETA-OPS-010 |
| BETA-PILOT-005 | P0 | Запланировано | Подготовить pilot package | С юристом согласованы pilot terms/data processing/retention/offboarding; готовы quickstart, role guide, module test script, known issues и support contacts | BETA-TEN-006 |
| BETA-PILOT-006 | P0 | Запланировано | Подготовить support и incident process | Назначены primary/backup owner; severity и escalation; critical acknowledgment ≤2 рабочих часов; status updates, export/delete и incident templates готовы | BETA-OPS-011 |
| BETA-PILOT-007 | P0 | Запланировано | Подключить friendly cohort | Две независимые сети, суммарно 3–5 клубов, provisioned раздельно; обязательные модули доступны; не более одного нового tenant каждые 3–4 дня | BETA-CUT-009, BETA-PILOT-001, BETA-PILOT-005 |
| BETA-PILOT-008 | P0 | Запланировано | Провести 14-дневную внешнюю когорту | Нет security incident и открытых launch-blocking P0/P1; sync success ≥98%; freshness ≤24 ч; каждый tenant повторил целевой workflow две недели подряд | BETA-PILOT-007 |
| BETA-PILOT-009 | P1 | Запланировано | Запустить открытый заявочный тест | Public application не создаёт tenant автоматически; оператор проверяет fit и capacity; provisioning выполняется штатным workflow; cohorts и stop conditions соблюдаются | BETA-PILOT-008 |

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

### Gate 2 — готовность текущей сети

- Завершены все `BETA-OPS` P0 и `BETA-MOD-*` P0.
- Текущий tenant переведён in place; четыре клуба сверены.
- Выполнены backup restore, rollback и alert drills.
- Internal alpha прошла семь стабильных дней.

Обязательные module gates:

- Gamification: для каждого включённого store пройдены readiness, shadow, one-user canary и reconciliation; нет unresolved ledger posting; kill switch проверен.
- Assortment: 4/4 stores сопоставлены; initial sync и backfill приняты; остатки, операции и выручка сверены; freshness видна.
- Staff: пройдены сценарии OWNER, network manager, club manager, senior/admin и trainee; attachments работают в `ENFORCED` после adoption/backfill/canary; `LEGACY/SHADOW` запрещены для внешнего beta; salary остаётся planning-only; автоматических санкций нет.
- Communications: проверены network/store channels, messages, mentions, read receipts, notifications, CRM contact tasks, SSE/reconnect и PII policy.
- Users and roles: actor не может выдать scope или capability шире собственного; revoke действует немедленно; Platform Admin недоступен tenant users.

После Gate 2 разрешается первый внешний invite-only pilot.

### Gate 3 — готовность открытого заявочного теста

- Две friendly-сети прошли 14 дней.
- Нет подтверждённых cross-tenant/store/PII incident.
- Нет открытых launch-blocking P0/P1.
- Scheduled sync success не ниже 98%, freshness не хуже 24 часов.
- Контрольные операции и выручка расходятся не более чем на 1% либо исключение документировано.
- Каждый tenant имеет owner, support owner, entitlement profile и завершённый checklist.
- Каждый production incident и feedback привязан к release SHA.
- Suspend, restore, rollback, export и offboarding проверены.

## 7. Рекомендуемая последовательность разработки

1. Завершить независимый review текущего AccessScope/attachment candidate,
   зафиксировать exact SHA и включить CI как required check; strict bundle не
   передавать в auto-deploy `main`.
2. Отрепетировать отдельный schema-only EXPAND release на production-like
   snapshot: все 155 migrations с session `PGOPTIONS`, ready/valid concurrent
   indexes, N-1 compatibility, abort/retry и rollback evidence.
3. На staging классифицировать persisted `NETWORK|STORES` для tenant одной сети
   с четырьмя клубами; strict AccessScope разрешить только при нуле unresolved
   active users/invites.
4. Запустить read-only attachment inventory, затем реализовать отдельный
   idempotent apply/backfill/reconciliation tool с explicit apply,
   quarantine и повторным zero-diff dry-run.
5. Реализовать AccessScope и безопасную materialization для
   task templates/recurring/scheduler по отдельному adoption plan; добавить
   task/shift DB invariant + legacy inventory, revoke/delete и полную
   production-like A1/A2/B API/BFF/browser/file evidence; затем продолжить
   parent adoption в порядке `CHECKLIST_RUN → KNOWLEDGE_ARTICLE/SHIFT_REGULATION →
   TRAINING_COURSE/ONBOARDING_PLAN`, для каждого добавляя atomic bind, live
   parent ACL, revoke и A1/A2/B tests.
6. Использовать реализованный process-wide `SHADOW` для mismatch evidence,
   добавить tenant/store canary orchestration и aggregate gate, затем включить
   `ENFORCED`; пройти browser/BFF/file regression и rollback drill.
7. Завершить оставшиеся staff/communications surfaces, включая membership,
   mentions, receipts, SSE, notifications, PII и background execution.
8. Завершить IAM: resend/revoke audit, session revoke и 100-way accept
   concurrency.
9. Последовательно подключить единый scope к gamification/ledger, затем к
   assortment/reports/imports и пройти store-level negative suites.
10. Добавить PII reveal/export audit policy и browser E2E для пяти обязательных
    контуров.
11. Реализовать customer stage, обязательный beta entitlement profile,
    provisioning, suspend/offboarding и `TenantExecutionPolicy`.
12. Завершить эксплуатационный контур: immutable artifact, versioned
    infrastructure, external probes/alerts, scheduler ownership,
    backup/restore и rollback drills.
13. Провести legacy-key audit и безопасный secret/session/invite/referral
    cutover.
14. Зафиксировать topology manifest и выполнить dry-run in-place cutover одной
    сети из четырёх клубов без смены `tenantId`.
15. Выполнить cutover, staged Langame sync, full-scope acceptance и семь дней
    internal alpha.
16. Подключить две friendly-сети по одному tenant каждые 3–4 дня и провести
    14-дневный pilot.
17. После Gate 3 открыть приём заявок, сохранив ручное одобрение и когортные
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

## 9. Осознанно отложено

- Billing, платёжный шлюз и автоматическое продление.
- Self-service tenant registration.
- Массовые маркетинговые кампании и рассылки.
- Полный гостевой CRM-аналитический модуль вне CRM-задач коммуникаций.
- Полная декомпозиция всех крупных сервисов до начала пилота.
- Исправление всего исторического lint backlog одним изменением.
- Горизонтальное масштабирование API до выделения безопасного worker/scheduler ownership.

Отложенные пункты не могут использоваться для обхода P0/P1 требований этого backlog.
