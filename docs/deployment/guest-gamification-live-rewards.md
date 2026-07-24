# Live-награды гостевого игрового модуля

Дата: 20.07.2026

Этот документ описывает боевой контракт гостевой геймификации. Он важнее старых заметок о ручной выдаче, если они расходятся.

## Что происходит автоматически

| Сущность         | После выполнения условия                                      | Действие гостя                                       |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Задание          | Создается и отправляется одобренная награда                   | Не требуется                                         |
| Этап Battle Pass | Создается и отправляется награда этапа, открывается следующий | Не требуется                                         |
| Чекин            | Награда создается после успешного чекина                      | Нажать кнопку чекина                                 |
| Лутбокс          | Сохраняется право открыть контейнер                           | Нажать `Открыть контейнер` для выбора и выдачи приза |

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

Пополнение — доменный факт Langame. Если несколько клубов используют один домен, пополнение в любом из них может выполнить задание выбранного клуба того же домена. Supplemental evaluator строит доменную и timezone-карту из выбранных клубов: факт того же домена допускается, факт другого домена и клуб без заполненного `externalDomain` блокируются. Мастер показывает доменную семантику до активации.

Receipt supplemental-очереди использует lease. Просроченный `PROCESSING` атомарно возвращается в обработку; после трёх неуспешных попыток запись переводится в `DEAD_LETTER`. Fresh claim другого worker не перехватывается.

### Последовательный LIVE → Ledger fallback

`GuestGameLedgerFallbackSchedulerService` — отдельная страховочная очередь для правил с backend-policy `LIVE_WITH_LEDGER_FALLBACK`. Она не заменяет основной snapshot scheduler и не относится к `LEDGER_SUPPLEMENTAL` пополнениям.

Алгоритм всегда последовательный:

1. Нормализованный факт игрового времени получает канонический `originKey` и ждёт основной LIVE-контур в течение `GRACE_MS`.
2. Если LIVE уже создал событие с тем же `originKey`, receipt помечается `LIVE_PROCESSED`, а ledger ничего не создаёт.
3. Только после grace-window и атомарного захвата receipt режим `LIVE` может передать факт в существующий `processEvent` → reward → bonus-ledger контур.
4. Повторный tick, replay или рестарт не должны создать второе событие или награду для того же `originKey`.

Конфигурация:

- `GUEST_GAME_LEDGER_FALLBACK_MODE=OFF|SHADOW|LIVE`; безопасное значение по умолчанию — `OFF`.
- `GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH=true` немедленно останавливает новые тики независимо от режима.
- `GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES` фильтруется жёстким allow-list: `SESSION_STARTED`, `HOURLY_SESSION_STARTED`, `PACKAGE_OR_SUBSCRIPTION_USED`, `SESSION_PLAY_TIME_ACCUMULATED`, `HOURLY_PLAY_TIME_ACCUMULATED`, `PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED`, `PRODUCT_PURCHASED`. Без явной настройки безопасный default по-прежнему содержит только три duration-факта. Start-факты включаются явно и обрабатывают совместимые задания, текущий шаг Battle Pass и лутбоксы через один канонический `SESSION_START`. Нейтральный факт используется только правилами с типом сессии «Любая», а тарифные факты остаются строгими. `PRODUCT_PURCHASED` остаётся только в `SHADOW` до отдельной проверки lifecycle отмен и возвратов по стабильному sale ID; добавление его в env не разрешает боевую обработку.
- `GUEST_GAME_LEDGER_FALLBACK_GRACE_MS`, `...CLAIM_LEASE_MS`, `...INTERVAL_MS` и `...BATCH_SIZE` задают grace-window, lease для восстановления после рестарта, частоту и размер пакета. Grace-window начинается при первом появлении origin receipt.
- `LIVE` работает в двух fail-closed scope. Legacy canary требует точный tenant, `PROFILE_ID`, `SEASON_ID`, положительный `BATTLE_PASS_STEP` и `LIVE_NOT_BEFORE`. Общий режим игрового времени требует точный tenant, `LIVE_NOT_BEFORE` и явный флаг `GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES=true`; `ALLOW_ALL_TENANTS` в обоих режимах запрещён.
- `GUEST_GAME_LEDGER_FALLBACK_MISSIONS_ALLOW_ALL_PROFILES=true` сохранён для legacy staged-rollout: он расширяет только активные задания `PLAY_TIME`, оставляя Battle Pass в точном canary scope. Для единого контура заданий, Battle Pass и лутбоксов используется общий `PLAY_TIME_ALLOW_ALL_PROFILES`.
- `GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES=true` направляет точные факты игрового времени и явно включённые start-факты всех профилей настроенного tenant во все совместимые активные v2-задания, текущие шаги Battle Pass и лутбоксы. Фиксированный сезон или шаг не требуется. Один физический старт имеет стабильный origin key; позднее уточнение «почасовая»/«пакет или абонемент» обогащает уже созданное событие и не может повторно выдать XP, награду или entitlement либо продвинуть следующий шаг Battle Pass. Награды и права открытия создаются существующим идемпотентным pipeline; для лутбокса создаётся только entitlement, случайный приз появляется после ручного открытия. Значение по умолчанию — `false`.
- `GUEST_GAME_LEDGER_FALLBACK_LIVE_NOT_BEFORE` обязателен для `LIVE` и задаётся валидной UTC ISO-датой, например `2026-07-19T16:30:00.000Z`. Факты раньше cutoff не выбираются, поэтому накопленные `SHADOWED` receipts не могут задним числом породить event, XP или reward после переключения режима.
- `GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS` должен оставаться `false`: режим `LIVE` с `true` запрещён и fail-closed. Расширение заданий допускается только внутри явно настроенного tenant.

Безопасный rollout выполняется последовательно:

1. Развернуть код с `MODE=OFF` либо оставить действующий tenant/profile-scoped `SHADOW`; проверить health, миграции, freshness, replay и отсутствие дублей.
2. Для первого canary заполнить точные tenant, profile, season и Battle Pass step; установить `LIVE_NOT_BEFORE` на текущий момент UTC непосредственно перед canary. Оставить `ALLOW_ALL_TENANTS=false`, только три точных типа игрового времени и небольшой batch.
3. Сначала запустить `MODE=LIVE` с `KILL_SWITCH=true`, проверить итоговую runtime-конфигурацию, затем снять kill switch. Подтвердить цепочку fact → receipt → event → decision → reward intent/effect → bonus ledger и отсутствие повторов при следующем tick/restart.
4. После подтверждения canary включить `PLAY_TIME_ALLOW_ALL_PROFILES=true` только для проверенного tenant. Убедиться, что один точный факт маршрутизируется во все совместимые активные задания, текущие шаги Battle Pass и `PLAY_HOUR`-лутбоксы, а повторный tick не создаёт вторую награду. Покупки в этот rollout не включать.

Rollback не требует удаления данных или отката миграций: немедленно установить `GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH=true` либо вернуть `GUEST_GAME_LEDGER_FALLBACK_MODE=SHADOW`/`OFF` и перезапустить только API. Основной LIVE snapshot-контур продолжает работать. Уже созданные receipts, events и postings сохраняются для аудита и не переигрываются; перед следующим canary задаётся новый `LIVE_NOT_BEFORE`.

### Восстановление права открыть сессионный лутбокс

`GuestGameLootBoxSessionRecoverySchedulerService` закрывает узкий разрыв между LIVE snapshot и нормализованным журналом для активных лутбоксов с триггером `SESSION_START`. Это не второй контур розыгрыша приза: результатом успешной проверки является только идемпотентный `GuestGameEntitlement` со статусом `AVAILABLE`. Приз и reward появляются исключительно после ручного открытия гостем.

Проверка использует тот же боевой `dryRun`, что и LIVE: область клуба, timezone клуба, день недели, временное окно, тип сессии, дата активации и лимиты не переопределяются Ledger-логикой. Для `ANY` требуется точный `SESSION_STARTED`; для `HOURLY` и `PACKAGE_OR_SUBSCRIPTION` старт сессии должен быть однозначно сопоставлен с соответствующим нормализованным маркером. Сначала используется стабильная внешняя идентичность, а временное окно применяется только как fail-closed fallback с взаимно-однозначным сопоставлением. Standalone `PLAY_HOUR` без явно заданной цели означает завершённую сессию длительностью не менее 60 минут; задания с явной целью, например 30 минут, сохраняют собственный порог.

Режимы `GUEST_GAME_LOOT_BOX_RECOVERY_MODE=OFF|SHADOW|LIVE`:

> Этот worker является legacy-контуром только для восстановления session-start entitlement. Перед включением start-фактов в общий `GUEST_GAME_LEDGER_FALLBACK_MODE=LIVE` его необходимо остановить: `GUEST_GAME_LOOT_BOX_RECOVERY_MODE=OFF` и `GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH=true`. Одновременный LIVE-охват одной области блокируется fail-closed interlock.

- `OFF` — безопасное значение по умолчанию;
- `SHADOW` — сохраняет объяснимое решение, но не создаёт entitlement, event, XP, reward или приз;
- `LIVE` — сохраняет только entitlement через существующую таблицу прав на открытие.

Для `LIVE` обязательны точный tenant, точный profile и `GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE`; `ALLOW_ALL_TENANTS=true` запрещён. Кроме того, чтение entitlement в `game-summary` должно быть включено для той же области через `GUEST_GAME_ENTITLEMENT_READ_MODE=PRIMARY` либо `CANARY` с совпадающими tenant/profile. Иначе scheduler остаётся fail-closed, чтобы не создавать невидимые гостю права.

Повторная синхронизация, reparse, restart или retry не создают второе право: receipt, решение и entitlement используют стабильную идентичность исходной сессии. Уже выполненный `DAILY`-кейс не теряет право после окончания дня или временного окна; период ограничивает новое получение, а не срок открытия уже заработанного кейса.

Это целевая форма объединения контуров: источники LIVE и Ledger нормализуют факты, общий evaluator принимает решение, а единый entitlement/reward pipeline материализует результат. Источник не имеет собственного альтернативного алгоритма награждения.

Обычный LIVE snapshot processor продолжает обрабатывать только ограниченное окно самых свежих подготовленных фактов. Отдельный historical anti-join backfill, который ищет guest-bound завершённые сессии и положительные неотменённые покупки без канонического события, теперь имеет независимый fail-closed gate:

- `GUEST_GAME_PIPELINE_BACKFILL_MODE=OFF|SHADOW|LIVE`; безопасное значение по умолчанию — `OFF`. В `OFF` SQL anti-join запросы вообще не выполняются, при этом обычная обработка свежего snapshot-окна не меняется.
- Для любого включённого режима `GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH` должен быть явно равен `false`. Пустое или неизвестное boolean-значение останавливает backfill.
- `SHADOW` требует точный tenant scope, может быть дополнительно ограничен профилем и `LIVE_NOT_BEFORE`, выполняет dry-run и сохраняет только диагностические `SHADOW` decisions. Он не вызывает `processEvent` и не создаёт каноническое событие, XP, reward или entitlement. Факт, который одновременно находится в обычном свежем окне, остаётся на штатном LIVE-пути и не перехватывается SHADOW-backfill.
- `LIVE` требует точный tenant, валидный timezone-qualified `GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE` и точный `GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID`. Расширение до всего выбранного tenant разрешается только явным `GUEST_GAME_PIPELINE_BACKFILL_ALLOW_TENANT_WIDE=true`; глобального all-tenants режима нет. Несовпадение tenant, неизвестный профиль без связанного guest или невалидный cutoff отключают historical backfill.
- `GUEST_GAME_PIPELINE_BACKFILL_LOOKBACK_MS` ограничивает SQL-окно и всегда clamp-ится API в диапазон 1–90 дней (по умолчанию 30 дней). В `LIVE` фактический cutoff — более позднее значение между lookback и `LIVE_NOT_BEFORE`; факты до `LIVE_NOT_BEFORE` дополнительно отбрасываются после нормализации.

Источники сессий и покупок справедливо чередуются, а штатный `processEvent` остаётся финальным идемпотентным барьером. Активная сессия не создаёт `PLAY_HOUR`: финальная длительность фиксируется только после `stoppedAt`, чтобы ранние 30/60 минут не заблокировали последующее корректное событие тем же идемпотентным ключом.

### Область использования лутбоксов и восстановление исторических прав

- `STANDALONE` — кейс может быть заработан своим условием и открыт гостем.
- `REWARD_TEMPLATE` — контейнер не участвует в самостоятельной проверке; право создаёт только выполненное задание или шаг Battle Pass.
- `BOTH` — разрешены оба пути, но общие лимиты и идемпотентный entitlement не допускают двойной выдачи.

FREE-награда Battle Pass типа `LOOT_BOX` создаёт один `AVAILABLE` entitlement через штатный reward-effect pipeline. `STANDALONE` нельзя использовать как наградной шаблон. Premium-награда fail-closed, пока нет подтверждённого источника premium-статуса гостя; смешанный шаг в таком состоянии выдаёт только FREE-дорожку и сохраняет диагностическую причину. Автоматическая квалификация не создаёт случайный приз и не пишет бонусы: приз определяется только при ручном открытии.

Перед включением entitlement-чтения `PRIMARY` необходимо выполнить безопасную сверку исторических данных. OWNER/ADMIN использует двухфазные preview/apply endpoints с ожидаемым количеством, SHA-256 digest и явным подтверждением:

- `POST /guest-gamification/rule-replays/loot-box-entitlements/reconciliation/preview` и `/apply` — привязка только по точному неизменяемому свидетельству открытия;
- `POST /guest-gamification/rule-replays/loot-box-entitlements/over-limit/preview` и `/apply` — отмена только лишних `AVAILABLE` entitlement для `STANDALONE|BOTH`, без изменения `CONSUMED`.

Apply выполняется в `SERIALIZABLE`-транзакции и прекращается при drift количества или digest. После каждого apply оба preview должны вернуть ноль до перехода к canary.

Перед additive-миграцией нужно проверить объём затрагиваемых таблиц, отсутствие конфликтующих дублей и допустимое время блокировки обычных `CREATE INDEX`; для крупных production-таблиц подготовить отдельную concurrent/maintenance-window стратегию. После миграции сначала нужно повторно синхронизировать или перенормализовать журнал, подтвердить заполнение стабильного `sourceExternalId` для нужных фактов и только затем включать tenant-scoped `SHADOW`. `sourceExternalId` нельзя заполнять из `sourceHash` или внутреннего ID строки LeetPlus: допускается только стабильный ID операции, полученный повторной нормализацией источника. Факты без стабильного внешнего ID fail-closed и в fallback не участвуют. `SHADOW` пишет только диагностические решения и receipts, но не создаёт event, XP, entitlement или reward. Перевод в scoped `LIVE` допустим только после проверки mismatch, freshness, replay, атомарности XP и отсутствия дублей на выбранном tenant и профиле.

Восстановление прав на открытие самостоятельных session-start кейсов управляется отдельным контуром `GUEST_GAME_LOOT_BOX_RECOVERY_*`. Kill switch по умолчанию включён; worker запускается только при явном `GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH=false`. В `LIVE` допускаются только точный tenant, один profile, валидный `LIVE_NOT_BEFORE`, `EXACT`-факты и стабильный внешний идентификатор сессии. Ожидание точного hourly/package-маркера хранится как `WAITING_CORRELATION`, не расходует лимит ошибок обработки и повторяется с backoff до истечения `LOOKBACK_MS`; `MAX_ATTEMPTS` применяется только после реального claim и ошибки evaluator/persistence. Retry-очередь фильтруется по `GuestActivityFact.profileId` и валидности anchor внутри SQL до `ORDER BY ... LIMIT`, поэтому receipts других профилей не могут вытеснить scoped canary. Этот контур выдаёт только entitlement на ручное открытие `STANDALONE|BOTH` кейса и не выбирает случайный приз.

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
