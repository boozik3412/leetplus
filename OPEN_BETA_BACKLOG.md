# LeetPlus — специальный backlog выхода на открытый тест

- Дата актуализации: 27.07.2026
- Версия: 1.17
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

| ID           | Приоритет | Статус        | Задача                                             | Критерии приёмки                                                                                                                                                                        | Зависимости                              |
| ------------ | --------- | ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-TEN-001 | P0        | Запланировано | Разделить operational lifecycle и customer stage   | Существуют lifecycle `ACTIVE/SUSPENDED/ARCHIVED` и отдельный stage `INTERNAL/PILOT/BETA/LIVE`; сохраняются cohort, trial dates, support owner и onboarding state                        | BETA-SRC-002                             |
| BETA-TEN-002 | P0        | Запланировано | Добавить tenant/store entitlements                 | Профиль первого теста включает `gamification`, `assortment`, `staff`, `communications`, `users_roles`; read/write/outbound управляются отдельно; изменения имеют reason, expiry и audit | BETA-TEN-001                             |
| BETA-TEN-003 | P0        | Запланировано | Реализовать idempotent Platform Admin provisioning | Одно действие создаёт tenant в `PROVISIONING`, обязательный beta entitlement profile, email-bound OWNER invite, support owner и checklist; повтор не создаёт дублей                     | BETA-TEN-001, BETA-TEN-002, BETA-SEC-009 |
| BETA-TEN-004 | P0        | Запланировано | Ввести единый `TenantExecutionPolicy`              | Login, invites, HTTP writes, schedulers, sync, messages, rewards и exports проверяют lifecycle, trial, entitlement и store scope; suspend останавливает обработку немедленно            | BETA-TEN-002, BETA-SEC-003               |
| BETA-TEN-005 | P1        | Запланировано | Расширить Platform Admin cockpit                   | Видны stage, trial, entitlement, owner invite, onboarding, stores, source freshness, sync errors, last activity, support owner и incidents                                              | BETA-TEN-003, BETA-OPS-010               |
| BETA-TEN-006 | P0        | Запланировано | Реализовать offboarding и retention workflow       | Suspend/archive отзывает invites/sessions, выключает integrations и jobs; data export/delete/retention выполняются по утверждённой процедуре и аудируются                               | BETA-TEN-004                             |
| BETA-TEN-007 | P0        | Запланировано | Поддержать безопасную смену tenant slug            | Старые QR, Telegram и guest URLs имеют контролируемый alias/redirect либо перевыпускаются; alias не позволяет обратиться к чужому tenant                                                | BETA-SEC-003                             |

### 5.4. Пользователи и роли

| ID           | Приоритет | Статус        | Задача                                                    | Критерии приёмки                                                                                                                                                                                            | Зависимости                |
| ------------ | --------- | ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| BETA-IAM-001 | P0        | В работе      | Утвердить role/capability matrix обязательного beta scope | Для OWNER, ADMIN, network manager, club manager и сотрудников перечислены разрешённые действия во всех пяти обязательных контурах; deny-by-default                                                          | BETA-SEC-004               |
| BETA-IAM-002 | P0        | В работе      | Реализовать явный network-level и club-level scope        | `NETWORK` и `STORES` — явные режимы; отсутствие `UserStoreAccess` не повышает пользователя до NETWORK; смена scope действует сразу на API, BFF, exports, files и активные сессии                            | BETA-SEC-003, BETA-IAM-001 |
| BETA-IAM-003 | P0        | В работе      | Ограничить полномочия управляющего actor                  | Store manager не может создать NETWORK user, назначить чужой store, выдать роль/capability выше собственной или управлять пользователем вне пересечения scopes; защищены self-escalation и последний OWNER  | BETA-IAM-001, BETA-IAM-002 |
| BETA-IAM-004 | P0        | В работе      | Завершить invite/resend/revoke workflow                   | Только email-bound opaque invites; update ротирует token; send/resend/revoke/accept аудируются; TTL настраивается; actor не может выдать invite шире своего scope; revoked/expired token не работает        | BETA-SEC-009, BETA-IAM-003 |
| BETA-IAM-005 | P0        | Запланировано | Ограничить особо чувствительное повышение привилегий      | Только явно разрешённая роль может назначить OWNER или чувствительные capabilities; Platform Admin нельзя назначить tenant API                                                                              | BETA-IAM-001, BETA-IAM-003 |
| BETA-IAM-006 | P0        | Запланировано | Свести backend/frontend permission maps                   | Один источник или contract-test подтверждает одинаковые роли, capabilities и nav visibility; скрытый UI не заменяет API authorization                                                                       | BETA-IAM-001               |
| BETA-IAM-007 | P0        | Запланировано | Добавить журнал доступа и управление сессиями             | Владелец видит активных пользователей и security events своей сети; может блокировать аккаунт и отзывать его сессии                                                                                         | BETA-SEC-010               |
| BETA-IAM-008 | P1        | Запланировано | Принять multi-network identity model                      | Решено, может ли один email состоять в нескольких независимых tenant; глобальная уникальность `User.email` либо сохранена как явное ограничение первого pilot, либо заменена membership-моделью с миграцией | BETA-TEN-003               |

### 5.5. CI/CD, БД и эксплуатационная надёжность

| ID           | Приоритет | Статус        | Задача                                           | Критерии приёмки                                                                                                                                                                                                                          | Зависимости                              |
| ------------ | --------- | ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BETA-OPS-001 | P0        | В работе      | Ввести обязательный CI                           | Frozen install, Prisma validate/generate, API tests/typecheck/build, web lint/typecheck/build и migration check обязательны для merge; CI-команды не изменяют файлы                                                                       | BETA-SRC-002                             |
| BETA-OPS-002 | P0        | В работе      | Добавить real PostgreSQL integration environment | Все миграции применяются с нуля; smoke использует реальную БД; проверяются tenant/store isolation, provisioning, suspend и ключевые writes                                                                                                | BETA-OPS-001                             |
| BETA-OPS-003 | P0        | Запланировано | Добавить frontend browser smoke                  | Автоматизированы login, owner invite, store switch/scope, обязательная навигация, ключевой сценарий каждого модуля и logout                                                                                                               | BETA-OPS-001, BETA-IAM-002               |
| BETA-OPS-004 | P0        | Запланировано | Перейти на immutable release artifact            | API, web и Telegram edge собираются один раз; release manifest содержит SHA/build time/schema; staging и production используют один artifact                                                                                              | BETA-OPS-001, BETA-SRC-004               |
| BETA-OPS-005 | P0        | В работе      | Реализовать live/ready/version endpoints         | Liveness не зависит от Langame; readiness выполняет DB/schema/storage checks; version показывает exact SHA; внешний probe проверяет web/API/game                                                                                          | BETA-OPS-004                             |
| BETA-OPS-006 | P0        | В работе      | Зафиксировать безопасную миграционную процедуру  | Migration выполняется атомарно, locks берутся до preflight, lock/statement timeout заданы; есть abort/retry smoke, production-like rehearsal, drift/`_prisma_migrations`, backup/postflight и доказанная N/N-1 либо fix-forward стратегия | BETA-OPS-002                             |
| BETA-OPS-007 | P0        | Запланировано | Ввести backup/restore и цели восстановления      | Encrypted off-host backup мониторится; выполнен свежий restore в отдельную БД; зафиксированы RPO/RTO; восстановлены все stateful данные                                                                                                   | BETA-OPS-006                             |
| BETA-OPS-008 | P0        | Запланировано | Определить единственного владельца schedulers    | До выделения worker технически разрешён один scheduler owner; есть lease/heartbeat/reclaim; каждый job проверяет `TenantExecutionPolicy`; graceful shutdown включён                                                                       | BETA-TEN-004                             |
| BETA-OPS-009 | P0        | Запланировано | Добавить общий reliability envelope Langame      | Каждый request имеет timeout; GET retry только с backoff/jitter; неоднозначные writes не ретраятся и идут в reconciliation; ошибки upstream — 502/503; tenant/domain изолированы                                                          | BETA-OPS-008                             |
| BETA-OPS-010 | P0        | Запланировано | Добавить минимальную observability               | Correlation/request ID, tenant/source/SHA, structured errors, 5xx/latency, scheduler heartbeat, sync freshness, queue age и reward reconciliation доступны оператору                                                                      | BETA-OPS-005                             |
| BETA-OPS-011 | P0        | Запланировано | Добавить alerts и incident delivery              | Алерты на failed deploy/readiness/backup, 5xx, stale sync, dead-letter, scheduler gap и reward anomalies доставляются ответственному; тестовая тревога подтверждена                                                                       | BETA-OPS-007, BETA-OPS-010               |
| BETA-OPS-012 | P0        | Запланировано | Реализовать атомарный deploy и rollback          | API/web/schema не остаются в смешанной версии; хранится N-1 artifact; rollback drill и failed-readiness rollback фактически выполнены                                                                                                     | BETA-OPS-004, BETA-OPS-005, BETA-OPS-006 |

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

| ID                 | Приоритет | Статус        | Задача                                              | Критерии приёмки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Зависимости                      |
| ------------------ | --------- | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| BETA-MOD-STAFF-001 | P0        | Запланировано | Провести полный route/action inventory staff        | Все staff pages/API/BFF, exports, attachments и schedulers сопоставлены с entitlement, capability, tenant/store/staff scope, audit и тестом                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | BETA-TEN-002, BETA-IAM-001       |
| BETA-MOD-STAFF-002 | P0        | Запланировано | Закрыть directory и identity mapping                | Сотрудник, LeetPlus user, store и Langame identity связаны без cross-tenant/store утечки; ручная замена и rollback аудируются                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | BETA-SEC-006, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-003 | P0        | В работе      | Закрыть задачи, templates и recurring rules         | Direct tasks, templates CRUD/launch, recurring actor HTTP, guarded integrity inventory и schema-only DB EXPAND имеют `IMPLEMENTED_CANDIDATE`: persisted scope, scoped aggregates/options/mutation responses, Tenant/Rule/Template/Store/participant lock/recheck, shared materializer, Store-timezone interactive due, atomic task/run/catalog audit, 43-code read-only legacy gate, пять concurrent parent indexes, 14 composite и 14 simple compatibility `NOT VALID` FK. PostgreSQL race, clean inventory и staged EXPAND smoke обязательны в CI. Scheduler/all-tenant HTTP не зарегистрированы и остаются `NO-GO`. До `Готово` остаются production-like inventory/reconciliation, VALIDATE/CONTRACT/deploy, scheduler lease/lifecycle/entitlement, global timezone policy, task/shift DB invariant и полная A1/A2/B API/BFF/browser suite | BETA-OPS-008, BETA-MOD-STAFF-001 |
| BETA-MOD-STAFF-004 | P0        | Запланировано | Закрыть shift workspace и shift reports             | Сотрудник видит свою смену и назначенные процессы; manager — разрешённые stores; drafts/send/history не выходят за scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | BETA-MOD-STAFF-002, BETA-IAM-002 |
| BETA-MOD-STAFF-005 | P0        | Запланировано | Закрыть регламенты и чек-листы                      | Draft/publish/archive, targeting, acknowledgements, snapshots, execution, review и reports работают по role/store; опубликованная история неизменяема                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | BETA-MOD-STAFF-001               |
| BETA-MOD-STAFF-006 | P0        | Запланировано | Закрыть знания, обучение и аттестации               | Knowledge base, courses, onboarding, tests, assessments, profiles и readiness корректно target-ятся; результаты и read receipts защищены                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | BETA-MOD-STAFF-001, BETA-IAM-002 |
| BETA-MOD-STAFF-007 | P0        | Запланировано | Закрыть контроль, рейтинги, мотивацию и дисциплину  | Staff-control, operations dashboard, ratings, signals, warnings и penalties имеют понятный источник, право просмотра/изменения, комментарий и audit; нет автоматических внешних санкций или Langame write-back                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | BETA-MOD-STAFF-002, BETA-SEC-005 |
| BETA-MOD-STAFF-008 | P0        | Запланировано | Закрыть salary planning                             | Schemes, periods, rows, adjustments и exports tenant/store-scoped; расчёт воспроизводим; изменения денег аудируются; доступ отделён отдельной capability; система не выполняет выплаты                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | BETA-MOD-STAFF-001, BETA-SEC-005 |
| BETA-MOD-STAFF-009 | P0        | В работе      | Защитить attachments и evidence                     | Upload/download/delete проверяют parent resource, tenant/store/task access; тип/размер ограничены; URL не открывает чужой файл; lifecycle, quarantine и retention определены в `docs/security/access-scope/v1/attachment-acl-rollout.md`; фактический checkpoint — `attachment-acl-implementation-checkpoint.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | BETA-MOD-STAFF-001, BETA-SEC-006 |
| BETA-MOD-STAFF-010 | P0        | Запланировано | Проверить AI-assistant как безопасную функцию staff | Только локальный deterministic режим; нет внешней отправки PII; вывод не изменяет задачи/регламенты/обучение без подтверждения                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | BETA-MOD-STAFF-001               |
| BETA-MOD-STAFF-011 | P0        | Запланировано | Добавить staff end-to-end regression                | OWNER, network manager, club manager и employee проходят свои сценарии; запрещённые stores, зарплата, дисциплина, exports и attachments дают deny                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | BETA-SEC-006, BETA-OPS-003       |

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
  SQL: guard блокирует DROP/RENAME любого из 28 FK, destructive
  DROP/RENAME/DROP COLUMN на protected tables, DROP/ALTER пяти parent indexes,
  DROP SCHEMA и неожиданные имена migration directories;
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
- staged real PostgreSQL smoke отдельно применил baseline 161, создал
  14 контролируемых legacy violations и затем применил только EXPAND;
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
   snapshot: все 162 migrations до
   `20260727131000_staff_task_integrity_expand`, пять ready/valid concurrent
   indexes, 14 composite и 14 simple compatibility `NOT VALID` FK, 14 benign
   legacy updates, пять UUID + пять tenant-move rejection checks, scoped
   `prismaDriftDrops=14`, N/N-1 runtime compatibility без старого seed,
   expanded future-migration DDL guard, abort/retry и rollback evidence;
   `db push` запрещён.
3. На staging классифицировать persisted `NETWORK|STORES` для tenant одной сети
   с четырьмя клубами; strict AccessScope разрешить только при нуле unresolved
   active users/invites.
4. Запустить read-only attachment inventory, затем реализовать отдельный
   idempotent apply/backfill/reconciliation tool с explicit apply,
   quarantine и повторным zero-diff dry-run.
5. Использовать готовые template/catalog, actor-scoped recurring HTTP,
   guarded integrity inventory и same-tenant EXPAND candidates; сохранить
   scheduler/all-tenant route незарегистрированными до lifecycle/entitlement,
   system identity и durable lease/fencing; выполнить inventory на
   production-like snapshot, подготовить explicit reconciliation, затем
   отдельно валидировать 14 StaffTask composite FK, после N-1 window выполнить
   reviewed CONTRACT для 14 simple compatibility FK и реализовать оставшиеся
   task-shift/Store/provenance invariants, global timezone policy и полную
   production-like A1/A2/B API/BFF/browser/file evidence; продолжить
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
