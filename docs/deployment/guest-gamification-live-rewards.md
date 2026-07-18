# Live-награды гостевого игрового модуля

Дата: 18.07.2026

Этот документ описывает боевой контракт гостевой геймификации. Он важнее старых заметок о ручной выдаче, если они расходятся.

## Что происходит автоматически

| Сущность | После выполнения условия | Действие гостя |
| --- | --- | --- |
| Задание | Создается и отправляется одобренная награда | Не требуется |
| Этап Battle Pass | Создается и отправляется награда этапа, открывается следующий | Не требуется |
| Чекин | Награда создается после успешного чекина | Нажать кнопку чекина |
| Лутбокс | Сохраняется право открыть контейнер | Нажать `Открыть контейнер` для выбора и выдачи приза |

Лутбокс никогда не должен автоматически выбирать приз или создавать reward только из-за фоновой проверки, открытия приложения или scheduler tick.

## Источники событий и обработка

1. `POST /guest-portal/session/app-open` фиксирует открытие игрового модуля, строит `previousSummary` и вызывает `processEvent` для активных правил `APP_OPEN`.
2. `GuestGamificationPipelineSchedulerService` каждые 15 секунд по умолчанию обрабатывает подготовленные snapshot-факты Langame через `runSnapshotPipelineScheduled`.
3. После успешного активного правила создается идемпотентное игровое событие и reward. Для автоматических наград `queueAndDispatchApprovedReward` передает ее в bonus ledger.
4. Bonus ledger dispatcher выполняет разрешенную отправку в Langame и сохраняет статусы доставки и аудит.

Scheduler работает внутри `leetplus-api.service`, отдельный systemd unit не нужен. В production он включен автоматически при наличии `SYNC_SERVICE_TOKEN`, если `GUEST_GAME_PIPELINE_SCHEDULER_ENABLED` не задан явно.

### Второй боевой слой игрового журнала

Мастер заданий v2 назначает источник на backend: игровое время, покупки и чекин остаются `LIVE_PRIMARY`; только пополнение баланса получает `LEDGER_SUPPLEMENTAL`. Клиент не может изменить policy самостоятельно.

Изолированный `GuestGamificationSupplementalPipelineSchedulerService` читает только нормализованные `GuestActivityFact.BALANCE_TOPUP`. Он не заменяет snapshot scheduler и повторно не обрабатывает время, покупки или чекин. Идемпотентность основана на tenant, домене, типе факта и стабильном внешнем ID операции (`sourceExternalId`), а не на изменяемом хэше версии парсера.

Режим задаётся `GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE=OFF|SHADOW|LIVE`:

- `OFF` — processor не запускается; это безопасное значение по умолчанию и аварийный откат.
- `SHADOW` — сохраняются диагностические решения, но не создаются игровое событие, XP, entitlement или reward.
- `LIVE` — создаётся каноническое событие и вызывается существующий reward/bonus-ledger контур только для активных v2-заданий `BALANCE_TOPUP`.

Дополнительный аварийный выключатель — `GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH=true`. Разрешённый список фактов принудительно ограничен `BALANCE_TOPUP`, даже если в env указаны другие значения. Tenant scope, interval и batch настраиваются отдельными переменными из `.env.example`.

Пополнение — доменный факт Langame. Если несколько клубов используют один домен, пополнение в любом из них может выполнить задание выбранного клуба того же домена. Мастер показывает это предупреждение до активации.

### Последовательный LIVE → Ledger fallback

`GuestGameLedgerFallbackSchedulerService` — отдельная страховочная очередь для правил с backend-policy `LIVE_WITH_LEDGER_FALLBACK`. Она не заменяет основной snapshot scheduler и не относится к `LEDGER_SUPPLEMENTAL` пополнениям.

Алгоритм всегда последовательный:

1. Нормализованный факт времени или покупки получает канонический `originKey` и ждёт основной LIVE-контур в течение `GRACE_MS`.
2. Если LIVE уже создал событие с тем же `originKey`, receipt помечается `LIVE_PROCESSED`, а ledger ничего не создаёт.
3. Только после grace-window и атомарного захвата receipt режим `LIVE` может передать факт в существующий `processEvent` → reward → bonus-ledger контур.
4. Повторный tick, replay или рестарт не должны создать второе событие или награду для того же `originKey`.

Конфигурация:

- `GUEST_GAME_LEDGER_FALLBACK_MODE=OFF|SHADOW|LIVE`; безопасное значение по умолчанию — `OFF`.
- `GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH=true` немедленно останавливает новые тики независимо от режима.
- `GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES` фильтруется жёстким allow-list: `HOURLY_PLAY_TIME_ACCUMULATED`, `PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED`, `PRODUCT_PURCHASED`. По умолчанию разрешены только два типа игрового времени. `PRODUCT_PURCHASED` требует отдельного явного opt-in после проверки lifecycle отмен и возвратов по стабильному sale ID.
- `GUEST_GAME_LEDGER_FALLBACK_GRACE_MS`, `...CLAIM_LEASE_MS`, `...INTERVAL_MS`, `...BATCH_SIZE`, `...TENANT_ID` и `...TENANT_SLUG` задают grace-window, lease для восстановления после рестарта, частоту, пакет и область rollout. Необязательный `GUEST_GAME_LEDGER_FALLBACK_PROFILE_ID` дополнительно ограничивает canary одним точным профилем. Grace-window начинается при первом появлении origin receipt, поэтому исторический re-sync не может немедленно создать fallback-событие.
- Tenant scope обязателен: без `...TENANT_ID` или `...TENANT_SLUG` scheduler fail-closed. Глобальный запуск возможен только отдельным явным opt-in `GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS=true` после завершения canary.

До отдельного решения о rollout production должен оставаться в `OFF`. Перед additive-миграцией нужно проверить объём затрагиваемых таблиц, отсутствие конфликтующих дублей и допустимое время блокировки обычных `CREATE INDEX`; для крупных production-таблиц подготовить отдельную concurrent/maintenance-window стратегию. После миграции сначала нужно повторно синхронизировать или перенормализовать журнал, подтвердить заполнение стабильного `sourceExternalId` для нужных фактов и только затем включать tenant-scoped `SHADOW`. `sourceExternalId` нельзя заполнять из `sourceHash` или внутреннего ID строки LeetPlus: допускается только стабильный ID операции, полученный повторной нормализацией источника. Факты без стабильного внешнего ID fail-closed и в fallback не участвуют. `SHADOW` пишет только диагностические решения и receipts, но не создаёт event, XP, entitlement или reward. Перевод в `LIVE` допустим только после проверки mismatch, freshness, replay, атомарности XP и отсутствия дублей на выбранном tenant.

### P0: атомарность event, XP и плана награды

Новый effect-posting контур разделяет фиксацию квалификации и внешние side effects:

1. `GuestGameEvent`, изменение XP профиля, append-only `GuestGameXpPosting` и все `GuestGameRewardIntent` создаются одной короткой транзакцией. Внутри неё нет сетевых вызовов или отправки в Langame.
2. `GuestGameXpPosting` фиксирует event, идемпотентный ключ, запрошенную/применённую дельту и баланс до/после. Уникальности по `eventId` и `tenantId + idempotencyKey` запрещают повторное XP при retry/replay.
3. `GuestGameRewardIntent.plan` — неизменяемый снимок решения на момент события: тип и ID правила, точный шаг Battle Pass или выбранный лутбокс и конкретная награда. Retry уже созданного события материализует награду только из этого плана и не выполняет fresh dry-run следующего шага или новый случайный выбор.
4. После commit materializer создаёт reward идемпотентно. Если reward уже существует, reconciliation восстанавливает только отсутствующие штатные side effects: entitlement лутбокса и постановку в существующий bonus ledger. Внешний provider dispatch из reward-effect materializer не выполняется: его делает только действующий bonus-ledger scheduler со своей очередью, claim/retry и production-флагами.

Additive-миграция `20260718180000_guest_game_effect_postings` добавляет `GuestGameXpPosting`, `GuestGameRewardIntent`, внешние ключи, уникальности и queue/claim индексы. Backfill исторических событий не выполняется. Миграция подготовлена в репозитории, но на production ещё не применялась; deploy и применение миграции не являются разрешением включать fallback. `GUEST_GAME_LEDGER_FALLBACK_MODE` и `GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE` должны оставаться `OFF` до отдельного контролируемого rollout.

Additive-миграция `20260718190000_guest_game_reward_effect_outbox` добавляет durable `GuestGameRewardEffect` и dedupe key системного сообщения staff chat. Reward и его начальные эффекты `STAFF_APPROVAL_NOTIFICATION`, `LOOT_BOX_ENTITLEMENT` или `BONUS_LEDGER_QUEUE` фиксируются одной транзакцией. Effect materializer использует `FOR UPDATE SKIP LOCKED`, lease/reclaim, `leaseVersion` как fencing token, retry/backoff и терминальный `DEAD_LETTER`; финализация чужого или устаревшего claim запрещена.

Текущий статус production gate: код автономного materializer готов, но обе миграции подготовлены только в репозитории и на production не применялись. `GuestGameRewardMaterializerSchedulerService` по умолчанию выключен, без tenant scope не запускается, имеет отдельный kill switch и последовательно дренирует intent, затем effect outbox. Поэтому готовность кода не является разрешением deploy/rollout: сначала миграции применяются с `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false`, затем выполняется проверка очередей и только после этого допускается tenant-scoped canary.

Закрытые кодовые P0-gate:

- автономный intent/effect scheduler с `OFF` по умолчанию, обязательным tenant scope, ограниченными batch/interval и независимым kill switch;
- атомарный конкурентный claim intent и effect через `FOR UPDATE SKIP LOCKED`, lease/reclaim и `leaseVersion` fencing;
- fault-injection на транзакционных границах event/XP/intent и reward/effect, а также retry/dead-letter для entitlement, approval notification и bonus-ledger queue;
- restart/retry/replay и конкурентная обработка, при которой materializer читает immutable plan и не переоценивает актуальный шаг Battle Pass или случайный выбор лутбокса;
- reward-effect materializer не выполняет provider dispatch: эта граница остаётся под отдельным действующим bonus-ledger scheduler.

Оставшийся production gate — операционный: проверить миграции и индексы на production-объёме, задеплоить API при выключенном materializer, подтвердить очереди и метрики, затем провести tenant-scoped canary. В этой реализации production, переменные окружения и база данных не изменялись.

## Гостевой интерфейс

- Страница игры: `/game`; совместимый URL: `/play/game`.
- Авторизация: `/game/auth`; выбор клуба: `/game/clubs`; история наград: `/game/rewards`.
- Клиент запрашивает `GET /guest-portal/session/game-summary` раз в 15 секунд.
- После каждого обновления новое summary сравнивается с предыдущим. Новые чек-ин, задания и шаги Battle Pass добавляются в последовательную очередь поздравительных модалок. Следующая модалка открывается только после закрытия предыдущей.
- Ошибка чекина и повторный чекин тоже показываются модалкой. Для повтора отображаются время прежней награды и момент следующей доступности по локальному времени клуба.

## Правила условий

- Время и дни недели считаются по timezone клуба. Успешно выполненное условие должно сохранять entitlement: гость может открыть уже разблокированный лутбокс позже, даже вне исходного временного окна или после завершения сессии.
- Чекин доступен один раз в календарные сутки на клуб.
- Тип сессии - это `HOURLY` или `PACKAGE_OR_SUBSCRIPTION` ("пакет или абонемент"). Из-за неполных structured-данных Langame используется также нормализованный журнал гостя как диагностический источник.
- Для гостя условия показываются человеческим текстом: например, "Начните игровую сессию с пакетом или абонементом в будние дни".

## Конфигурация редакторов

- Расширенный редактор на `/gamification` является источником правил, условий, статуса и клубной области. Активация элемента после подтверждения сразу делает его доступным в игровом контуре выбранных клубов.
- Визуальный редактор используется для компоновки и внешнего вида. Только он имеет publish для визуальной конфигурации.
- Перед удалением или деактивацией элемента, размещенного в клубах, оператор должен увидеть список клубов. Подтверждение удаляет активные размещения и сам элемент из отображений.
- На вкладке «Задания» доступен отдельный мастер `/gamification/missions/wizard`. Он сохраняет только `DRAFT`, использует контракт `definitionVersion=2`, выполняет backend readiness-check и требует отдельного подтверждения активации.
- Категории товаров доступны в мастере и синхронизируются из активных групп Langame и конфигурации товаров каждого клуба. Связь с товаром выполняется по внешнему `product_id`; клубная категория хранится отдельно и не перезаписывает `Product.categoryId`. Неподтверждённые точные тарифные справочники остаются отключёнными с пометкой «В разработке».
- Для категорий мастер требует явный источник `LANGAME` или `LEETPLUS`. LIVE и SHADOW используют соответственно только `domain:groupId` либо только внутренний `Category.id`; названия категорий не являются межсистемным ключом.
- Поиск товаров выполняется серверно после трёх символов. В правило сохраняются tenant product ID, внешний product ID и домен; покупки без привязанного гостя, отмены, возвраты и неположительные позиции не учитываются.

## Безопасность и диагностика

- Все события и награды должны быть идемпотентными: повторная синхронизация не создает вторую награду.
- Для новых событий XP подтверждается append-only `GuestGameXpPosting`, а награда — `GuestGameRewardIntent` с immutable plan. Отсутствие posting/intent при частично созданном событии считается ошибкой целостности, а не поводом повторно оценивать актуальные правила.
- Черновики не участвуют в боевом запуске и не могут подавить совпадающее активное правило.
- `/gamification` и `/gamification/log` показывают диагностические решения правила, факты игрового журнала, freshness источника и историю наград. Для тестов используйте эти данные вместе с summary гостя.
- Не сохраняйте в документации или клиентских логах raw phone, токены, ключи Langame, payload Langame и VDS credentials.

## Production QA

Detailed migration preflight, runtime flag semantics, sequential deployment, canary, and rollback are documented in `docs/deployment/guest-game-reward-materializer-rollout.md`.

1. Убедиться, что активное правило имеет правильный клуб, статус, триггер и лимиты.
2. Выполнить условие реальным гостем и дождаться следующего обновления summary или нажать штатное обновление.
3. Проверить, что появилась одна награда в истории и одна поздравительная модалка; для нескольких результатов модалки должны показываться по очереди.
4. Для Battle Pass проверить смену текущего шага и автоматическую награду. Для лутбокса проверить, что он лишь разблокирован до ручного открытия.
5. При расхождении открыть диагностику игрового журнала: факт Langame, решение правила, reward/ledger статус и время клуба.
6. Для supplemental rollout сначала задеплоить с режимом `OFF`, затем включить `SHADOW` и подтвердить отсутствие наград. Только после проверки freshness, replay и mismatch включать `LIVE`; при любой аномалии вернуть `OFF` без удаления фактов или миграций.
7. Перед применением `20260718180000_guest_game_effect_postings` и `20260718190000_guest_game_reward_effect_outbox` проверить время блокировок и конфликтующие дубли. API и миграции сначала разворачиваются с `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false`; отсутствие tenant scope также должно удерживать scheduler в fail-closed состоянии.
8. При выключенных processors проверить создание одной связки `event + XP posting + reward intent` и durable effect без внешней отправки, затем задать один tenant scope и включить materializer canary. `BONUS_LEDGER_QUEUE` должен только поставить запись в ledger; Langame provider dispatch проверяется отдельно через существующий bonus-ledger scheduler.
9. Во время canary проверить reclaim просроченного lease, fencing устаревшего worker, retry/dead-letter и восстановление ровно одного reward со штатными side effects из исходного immutable plan. Kill switch должен остановить новые claims без удаления очереди; откат выполняется переводом `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false` или kill switch в `true`.
