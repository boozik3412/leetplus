# Live-награды гостевого игрового модуля

Last updated: 2026-07-31

Этот документ описывает боевой контракт гостевой геймификации. Он важнее старых заметок о ручной выдаче, если они расходятся.

## Актуальная карта источников

| Условие | Боевой путь | Ограничение |
| --- | --- | --- |
| `APP_OPEN` | Прямой LIVE `/guest-portal/session/app-open` | Ledger не подменяет вход в модуль |
| `SESSION_STARTED` | LIVE session/snapshot; опциональный последовательный Ledger fallback | Start-факты должны быть явно включены runtime-конфигурацией |
| Наигранное время | LIVE session/snapshot; опциональный Ledger fallback по завершённым сессиям | Без `date_stop` нет финального duration-факта |
| Покупка | LIVE product expense | Ledger остаётся SHADOW до reconciliation отмен/возвратов |
| Пополнение | `LEDGER_SUPPLEMENTAL` | Работает только в явно включённом tenant-scoped режиме |
| Чекин | Отдельный LIVE check-in pipeline | Generic visit/session не является заменой |

Наличие fallback, supplemental или materializer в коде не подтверждает его production-режим. Перед диагностикой проверяются runtime status/env, tenant scope, cutoff, fact allow-list, lag/retry/dead-letter и фактические решения в `/gamification/log`.

## Гостевая авторизация и восстановление

- Канонический путь: `/game/auth -> /game/clubs -> /game`; история кошелька — `/game/rewards`.
- Отсутствующая или истёкшая guest-сессия (`401`) показывает понятное действие возврата на `/game/auth`, а не старые ссылки регистрации.
- Сетевая, API- или серверная ошибка не должна называться истёкшей авторизацией: гость получает retry и безопасный переход на `/start`.
- Telegram/call handoff обязан завершаться guest-token, выбором клуба и первым trusted `APP_OPEN`; эта цепочка проверяется отдельным E2E.
- Устаревшая Langame-привязка профиля обновляется автоматически domain-scoped resolver по подтверждённой идентичности при входе и синхронизации. Неоднозначный результат завершается fail-closed без привязки.
- Неподтверждённое completion-уведомление миссии/Battle Pass хранится в БД и возвращается после reload. Оно считается просмотренным только после явного ACK; ACK не получает и не повторяет награду.

## Квалификация и явное получение

| Источник | После выполнения условия | Действие гостя |
| --- | --- | --- |
| Задание | Обычная награда и event XP квалифицируются как отдельные 30-дневные wallet item | Нажать `Забрать`; получить каждый item независимо |
| Этап Battle Pass | Фиксируется выполнение этапа; награда и XP квалифицируются в кошелёк | Нажать `Забрать`; переход этапа не означает выдачу ценности |
| Чекин | После нажатия чекина квалифицируются настроенные reward/XP item | Явно забрать квалифицированные item |
| Другое игровое событие | Reward и event XP сохраняются в кошелёк, но не применяются | Нажать `Забрать` |
| Кейс как награда задания/Battle Pass/иной активности | Durable reward effect создаёт entitlement и отдельный wallet item без ordinary claim родительской награды | Нажать `Открыть контейнер`; приз выбирается только при этом действии |
| Лутбокс | Сохраняется entitlement на одну ручную попытку открытия | Нажать `Открыть контейнер`; `Забрать все` его не открывает |

Автоматически выполняется только проверка условия и фиксация квалификации. До явного claim обычная награда не отправляется во внешний контур, XP не применяется к профилю, а код и claim payload не раскрываются. Лутбокс никогда не должен автоматически выбирать приз из-за фоновой проверки, открытия приложения, completion ACK или scheduler tick.

Наградной кейс является исключением только из ordinary claim родительского reward: `LOOT_BOX_ENTITLEMENT` не получает claim deadline и его effect сразу готов к безопасной материализации. Родитель не получает reward code, не попадает в cashier/bot delivery и не может быть погашен через admin redeem; единственное действие гостя относится к entitlement — `Открыть контейнер`. Это не открывает кейс и не выбирает приз. В entitlement поле `sourceRewardId` навсегда связывает право открытия с родительской наградой активности, а `rewardId` после завершения contract-этапа зарезервировано только для фактически выпавшего при открытии приза. Первый expand-деплой временно принимает исторический alias `rewardId = sourceRewardId`, чтобы старая и новая версия API одинаково считали лимиты; отдельная contract-миграция очищает alias только после подтверждённой замены старых процессов. Канонический event и immutable reward intent защищают повторную обработку, effect/entitlement/wallet имеют стабильные idempotency keys, а `game-summary` выполняет bounded best-effort recovery только для текущего tenant/profile и того же 30-дневного retention. Replay-safe миграция переводит ошибочно ожидавшие claim legacy effects и доказанные false-positive `APPLIED` без entitlement в `PENDING`, создаёт отсутствующий effect и очищает legacy reward code только для активированных профилей, внутри 30-дневного окна и при доказанном immutable target либо точном совпадении версии правила. Произвольные `CANCELED`, `EXPIRED` и уже завершённые записи не переоткрываются; единственное узкое исключение — старый case effect с точной причиной `claimed_without_external_delivery`, если claim был принят до исходного deadline, entitlement так и не появился, а migration marker проходит повторную runtime-проверку.

## Граница активации и кошелёк наград

- Участие профиля в игровом контуре начинается с `GuestGameProfile.gameActivatedAt`: это время первого доверенного `APP_OPEN`, принятого через `POST /guest-portal/session/app-open`. Для существующих профилей граница восстанавливается только из полностью аттестованного канонического события `APP_OPEN` штатного гостевого портала LeetPlus. Импортированная или историческая активность Langame сама по себе профиль не активирует. Факты, события, rewards и entitlements раньше этой границы не засчитываются и не должны задним числом попадать в кошелёк.
- При первом доверенном `APP_OPEN` API строит `signed` (знаковую) проекцию автоматического XP до активации, атомарно фиксирует её в `preActivationXpExcluded`, исключает только ещё не исключённую разницу и пересчитывает уровень. Ручной и не связанный с игровыми событиями XP сохраняется. Последующие summary повторяют знаковую проверку, поэтому поздно восстановленный pre-activation posting исключается ровно один раз, включая корректирующие отрицательные значения, и не может раздувать прогресс гостя.
- Кошелёк хранит claim-required обычные награды, отложенный event XP и неоткрытые lootbox entitlements, но не заменяет канонические таблицы. Обычный reward до claim остаётся `APPROVED` с `claimRequired=true`; связанный effect имеет `WAITING_CLAIM`. Код и claim payload в публичном summary отсутствуют. Entitlement доступен к open только в статусе `AVAILABLE`.
- Обычная награда и XP одного события материализуются двумя отдельными wallet item. Claim reward не применяет XP, а claim XP не подтверждает reward. Повторный вызов каждого exact item идемпотентен.
- Непринятый wallet item живёт до `qualifiedAt + 30 суток`. При `expiresAt <= now` `PENDING` item перестаёт быть доступным: claim-required reward переводится в `EXPIRED`, ожидающий effect — в `CANCELED`, `AVAILABLE` entitlement — в `EXPIRED`, затем wallet-запись физически удаляется bounded retention scheduler.
- Claim, принятый строго до deadline, фиксирует `deliveryRequestedAt < claimExpiresAt`. После этого ordinary item в `PROCESSING` или `FAILED` не удаляется на границе 30 суток и может завершить безопасную доставку либо перейти в операционную сверку. TTL ограничивает время принять награду, а не обрывает уже принятую доставку.
- `POST /guest-portal/session/reward-wallet/items/:walletItemId/claim` запускает реальное получение: для XP атомарно создаёт claim-event/posting и обновляет профиль; для обычной награды освобождает ожидающий effect и разрешает ledger delivery. `POST /guest-portal/session/reward-wallet/claim-all` делает это только для обычных `PENDING/FAILED` item. Он никогда не открывает лутбоксы, не расходует entitlement и не выбирает случайный приз.
- `POST /guest-portal/session/completion-notifications/:notificationId/acknowledge` обслуживает только прочтение поздравительного уведомления. Закрытие модалки не является claim, не меняет wallet item и не запускает доставку.
- Исторические rewards, уже подтверждённые/доставленные до запуска нового контура, и ранее применённый XP никогда не backfill-ятся как `PENDING`: это создало бы ложную повторную выдачу.
- Ручное открытие entitlement выполняется exact-маршрутом `POST /guest-portal/session/reward-wallet/items/:walletItemId/open`. Он принимает идентификатор wallet item, повторно проверяет tenant, профиль, текущий клуб, 30-дневный срок и точный `AVAILABLE` entitlement, после чего открывает связанный lootbox один раз. Совместимый маршрут `/session/loot-boxes/:lootBoxId/open` использует ту же entitlement-authoritative проверку: legacy unlock event сам по себе открыть контейнер не может. Для события внутри текущего 30-дневного окна разрешён bounded backfill, который сначала создаёт entitlement и wallet item; событие на границе day 30 или старше завершается fail-closed.
- После материализации живой попытки entitlement является доказательством уже пройденной квалификации. При exact open wallet item и entitlement атомарно резервируются состоянием `OPENING`; оно является authoritative lock для параллельных запросов и опасных административных изменений. При открытии повторно не проверяются текущая аудитория, временное окно, session/tariff-условия и issuance limits: иначе несколько честно накопленных прав блокировали бы друг друга. Сохраняются проверки точного владельца, tenant/profile/store, live entitlement/wallet, активного исходного rule, единственного random roll и идемпотентного связывания reward с consumed entitlement. Незавершённый `OPENING` восстанавливается контролируемым stale-recovery, а не вторым roll.
- Кошелёк профиля общий внутри tenant, а wallet item сохраняет `storeId`. Если право получено в другом клубе, клиент сначала вызывает `POST /guest-portal/session/select-club` с точными `tenantSlug` и `storeId`, применяет возвращённый summary и новый session cookie, показывает пользователю переключение, а затем вызывает exact open по `walletItemId`. Автоматическое открытие при переключении, загрузке страницы или `claim-all` запрещено.
- Общий `GET /guest-portal/session/game-summary` возвращает `rewardWallet`: `pendingCount`, `nextExpiresAt`, `retentionDays` и `items`. Публичные состояния item: `PENDING`, `PROCESSING`, `FAILED`, `OPENING`; действия: `CLAIM_REWARD`, `OPEN_LOOT_BOX` либо `null`. `FAILED` допускает явный retry только для доказанно безопасной ошибки до внешнего write; `PROCESSING/OPENING` не имеют кнопки действия. `errorHint` содержит безопасное объяснение без персональных данных или внешнего payload. `pendingCount` включает все незавершённые состояния, а `nextExpiresAt` учитывает только ещё не принятые expiring item.

### Lifecycle лутбокса при живом entitlement

- Пока существует непросроченная `PENDING` wallet-запись с `AVAILABLE` entitlement либо любой `OPENING`, backend блокирует удаление, перезапуск, деактивацию и семантическое изменение lootbox rule. `OPENING` остаётся блокирующим независимо от исходного `expiresAt`, пока попытка не финализирована или не восстановлена. К семантическим относятся как минимум статус и клубная область, usage/trigger, награда и probability rules, session/period/limits и режим ручного подтверждения.
- Legacy-состояние, в котором entitlement уже ссылается на удалённое или неактивное правило, не исправляется автоматической подменой правила, восстановлением по одному имени или новым random roll. Exact open завершается fail-closed. Оператор сверяет wallet item, entitlement, исходный rule ID и аудит, после чего выполняет контролируемое восстановление исходного определения либо явную компенсацию/закрытие права по утверждённой процедуре.

## Источники событий и обработка

1. Первый trusted `POST /guest-portal/session/app-open` атомарно фиксирует `gameActivatedAt`; только события и факты не раньше этой границы допускаются к боевой квалификации.
2. `APP_OPEN` строит `previousSummary`, а `GuestGamificationPipelineSchedulerService` каждые 15 секунд по умолчанию обрабатывает подготовленные snapshot-факты через `runSnapshotPipelineScheduled`.
3. После успешного активного правила создаётся идемпотентное игровое событие. Ordinary reward получает `claimRequired=true`, effect `WAITING_CLAIM` и wallet item; наградной кейс получает `claimRequired=false`, effect `PENDING`, entitlement и case wallet item; event XP сохраняется отдельным XP wallet item без изменения профиля.
4. Явный claim переводит ordinary wallet item в `PROCESSING`, историю — в `DELIVERY_PROCESSING`, а XP применяет локально и атомарно. Completion ACK этой границы не касается.
5. Bonus ledger dispatcher выбирает claim-required reward только при доказанном своевременном `deliveryRequestedAt < claimExpiresAt` и связанном wallet item `PROCESSING/FAILED`.
6. Подтверждённая внешняя доставка завершает reward/wallet. Если запрос во внешний Langame write уже был отправлен, но результат неоднозначен, ledger переходит в `RECONCILIATION_REQUIRED`, wallet остаётся `PROCESSING`, а автоматический и гостевой retry запрещены до сверки.

Scheduler работает внутри `leetplus-api.service`, отдельный systemd unit не нужен. В production он включен автоматически при наличии `SYNC_SERVICE_TOKEN`, если `GUEST_GAME_PIPELINE_SCHEDULER_ENABLED` не задан явно.

### Второй боевой слой игрового журнала

Мастер заданий v2 назначает источник на backend: игровое время и старт сессии используют LIVE как основной путь и могут получить последовательный `LIVE_WITH_LEDGER_FALLBACK`; покупки остаются `LIVE_PRIMARY` с SHADOW-сравнением, чекин — отдельным LIVE-контуром, а только пополнение баланса получает `LEDGER_SUPPLEMENTAL`. Клиент не может произвольно назначить policy.

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
- `GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES=true` направляет точные факты игрового времени и явно включённые start-факты всех профилей настроенного tenant во все совместимые активные v2-задания, текущие шаги Battle Pass и лутбоксы. Фиксированный сезон или шаг не требуется. Один физический старт имеет стабильный origin key; позднее уточнение «почасовая»/«пакет или абонемент» обогащает уже созданное событие и не может повторно квалифицировать XP, reward или entitlement либо продвинуть следующий шаг Battle Pass. Ordinary reward/XP материализуются в claim-required wallet item; для лутбокса создаётся только entitlement, случайный приз появляется после ручного открытия. Значение по умолчанию — `false`.
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

Для `LIVE` обязательны точный tenant, точный profile и `GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE`; `ALLOW_ALL_TENANTS=true` запрещён. `GUEST_GAME_ENTITLEMENT_READ_MODE=PRIMARY` либо `CANARY` с совпадающими tenant/profile остаётся явным rollout-guard самого recovery worker. При этом гостевые `game-summary` и open-маршруты всегда entitlement-authoritative: значение `OFF` не возвращает legacy-event authorization и не делает старое право невидимым.

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
- `REWARD_TEMPLATE` — контейнер не участвует в самостоятельной проверке и скрыт из каталога кейсов; право создаёт только выполненное задание или шаг Battle Pass.
- `BOTH` — разрешены оба пути, но общие лимиты и идемпотентный entitlement не допускают двойной выдачи.

FREE-награда Battle Pass типа `LOOT_BOX` создаёт один `AVAILABLE` entitlement через штатный reward-effect pipeline. `STANDALONE` нельзя использовать как наградной шаблон. Premium-награда fail-closed, пока нет подтверждённого источника premium-статуса гостя; смешанный шаг в таком состоянии выдаёт только FREE-дорожку и сохраняет диагностическую причину. Автоматическая квалификация не создаёт случайный приз и не пишет бонусы: приз определяется только при ручном открытии.

Перед включением entitlement-чтения `PRIMARY` необходимо выполнить безопасную сверку исторических данных. OWNER/ADMIN использует двухфазные preview/apply endpoints с ожидаемым количеством, SHA-256 digest и явным подтверждением:

- `POST /guest-gamification/rule-replays/loot-box-entitlements/reconciliation/preview` и `/apply` — привязка только по точному неизменяемому свидетельству открытия;
- `POST /guest-gamification/rule-replays/loot-box-entitlements/over-limit/preview` и `/apply` — отмена только лишних `AVAILABLE` entitlement для `STANDALONE|BOTH`, без изменения `CONSUMED`.

Apply выполняется в `SERIALIZABLE`-транзакции и прекращается при drift количества или digest. После каждого apply оба preview должны вернуть ноль до перехода к canary.

Перед additive-миграцией нужно проверить объём затрагиваемых таблиц, отсутствие конфликтующих дублей и допустимое время блокировки обычных `CREATE INDEX`; для крупных production-таблиц подготовить отдельную concurrent/maintenance-window стратегию. После миграции сначала нужно повторно синхронизировать или перенормализовать журнал, подтвердить заполнение стабильного `sourceExternalId` для нужных фактов и только затем включать tenant-scoped `SHADOW`. `sourceExternalId` нельзя заполнять из `sourceHash` или внутреннего ID строки LeetPlus: допускается только стабильный ID операции, полученный повторной нормализацией источника. Факты без стабильного внешнего ID fail-closed и в fallback не участвуют. `SHADOW` пишет только диагностические решения и receipts, но не создаёт event, XP, entitlement или reward. Перевод в scoped `LIVE` допустим только после проверки mismatch, freshness, replay, атомарности XP и отсутствия дублей на выбранном tenant и профиле.

Восстановление прав на открытие самостоятельных session-start кейсов управляется отдельным контуром `GUEST_GAME_LOOT_BOX_RECOVERY_*`. Kill switch по умолчанию включён; worker запускается только при явном `GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH=false`. В `LIVE` допускаются только точный tenant, один profile, валидный `LIVE_NOT_BEFORE`, `EXACT`-факты и стабильный внешний идентификатор сессии. Ожидание точного hourly/package-маркера хранится как `WAITING_CORRELATION`, не расходует лимит ошибок обработки и повторяется с backoff до истечения `LOOKBACK_MS`; `MAX_ATTEMPTS` применяется только после реального claim и ошибки evaluator/persistence. Retry-очередь фильтруется по `GuestActivityFact.profileId` и валидности anchor внутри SQL до `ORDER BY ... LIMIT`, поэтому receipts других профилей не могут вытеснить scoped canary. Этот контур выдаёт только entitlement на ручное открытие `STANDALONE|BOTH` кейса и не выбирает случайный приз.

### P0: атомарность квалификации, отложенного XP и плана награды

Новый effect-posting контур разделяет фиксацию квалификации и внешние side effects:

1. `GuestGameEvent` и `GuestGameRewardIntent` фиксируют результат квалификации без сетевого вызова. Для claim-required event XP исходное событие хранит нулевую применённую дельту: профиль не меняется до действия гостя.
2. Запрошенный XP хранится как отдельный wallet item в `claimXpDelta`. Claim выполняется в `SERIALIZABLE`-транзакции: создаёт отдельное событие `REWARD_CLAIMED`, append-only `GuestGameXpPosting`, обновляет XP/level и переводит только этот item в `CLAIMED`. Идемпотентный ключ wallet item запрещает двойное применение.
3. Если событие содержит reward и XP, создаются два item. Ни materializer, ни completion ACK не имеют права объединить их в одно подтверждение.
4. `GuestGameRewardIntent.plan` — неизменяемый снимок решения на момент события: тип и ID правила, точный шаг Battle Pass или выбранный лутбокс и конкретная награда. Retry уже созданного события материализует награду только из этого плана и не выполняет fresh dry-run следующего шага или новый случайный выбор.
5. После commit materializer создаёт обычный reward с `claimRequired=true`; `BONUS_LEDGER_QUEUE` остаётся в `WAITING_CLAIM` до своевременного guest claim. Для лутбокса materializer создаёт entitlement, но не выбирает приз. Внешний provider dispatch из reward-effect materializer не выполняется.

Additive-миграция `20260718180000_guest_game_effect_postings` добавляет `GuestGameXpPosting`, `GuestGameRewardIntent`, внешние ключи, уникальности и queue/claim индексы. Backfill исторических событий не выполняется. Deploy и применение миграции сами по себе не являются разрешением включать fallback: `GUEST_GAME_LEDGER_FALLBACK_MODE` и `GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE` должны оставаться `OFF` до отдельного контролируемого rollout.

Additive-миграция `20260718190000_guest_game_reward_effect_outbox` добавляет durable `GuestGameRewardEffect` и dedupe key системного сообщения staff chat. Reward и его начальные эффекты `STAFF_APPROVAL_NOTIFICATION`, `LOOT_BOX_ENTITLEMENT` или `BONUS_LEDGER_QUEUE` фиксируются одной транзакцией; claim-required `BONUS_LEDGER_QUEUE` стартует в `WAITING_CLAIM`. Effect materializer использует `FOR UPDATE SKIP LOCKED`, lease/reclaim, `leaseVersion` как fencing token, retry/backoff и терминальный `DEAD_LETTER`; финализация чужого или устаревшего claim запрещена.

Additive-миграция `20260725213500_guest_game_reward_wallet` добавляет границу первой активации, 30-дневные wallet item и claim-поля reward. Её backfill fail-closed: ранее доставленные rewards, раскрытые коды и уже применённый XP не создают новые `PENDING` item. Backfill entitlement допускается только при точном живом источнике и внутри текущего окна.

Additive-миграция `20260731090000_guest_game_case_reward_lifecycle` добавляет `sourceRewardId`, выводит родительский `LOOT_BOX_ENTITLEMENT` из ordinary claim и replay-safe восстанавливает только доказанные case effects. Она является expand-этапом: исторический alias в `rewardId` и совместимый write shield сохраняются до проверки первого production-деплоя. Миграция сериализует frozen repair set с legacy reward/wallet/effect writes, а временный DB-guard после commit нормализует поддерживаемые case-parent writes старого процесса и атомарно отклоняет его ordinary claim. Следующая contract-миграция удаляет shield и очищает alias; её нельзя отправлять в том же deployment wave. Обычный repair ограничен активированными профилями, 30-дневным retention, живой связью с mission/season и immutable target либо точной версией правила. Отдельно разрешён только ранее принятый в срок legacy claim с exact-причиной `claimed_without_external_delivery` и без entitlement; repaired wallet получает новый срок видимости от момента ремонта.

Production gate остаётся fail-closed: `GuestGameRewardMaterializerSchedulerService` по умолчанию выключен, без tenant scope не запускается, имеет отдельный kill switch и последовательно дренирует intent, затем effect outbox. Перед tenant-scoped canary нужно подтвердить фактическое состояние миграций и очередей при `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false`; готовность кода сама по себе не разрешает rollout.

Закрытые кодовые P0-gate:

- автономный intent/effect scheduler с `OFF` по умолчанию, обязательным tenant scope, ограниченными batch/interval и независимым kill switch;
- атомарный конкурентный claim intent и effect через `FOR UPDATE SKIP LOCKED`, lease/reclaim и `leaseVersion` fencing;
- fault-injection на транзакционных границах event/XP/intent и reward/effect, безопасный retry/dead-letter до внешнего write и `RECONCILIATION_REQUIRED` без retry после неоднозначного Langame write;
- restart/retry/replay и конкурентная обработка, при которой materializer читает immutable plan и не переоценивает актуальный шаг Battle Pass или случайный выбор лутбокса;
- reward-effect materializer не выполняет provider dispatch: эта граница остаётся под отдельным действующим bonus-ledger scheduler.

Операционный gate: проверить миграции и индексы на production-объёме, задеплоить API при выключенном materializer, подтвердить очереди и метрики, затем провести tenant-scoped canary.

## Гостевой интерфейс

- Страница игры: `/game`; совместимый URL: `/play/game`.
- Авторизация: `/game/auth`; выбор клуба: `/game/clubs`; история наград: `/game/rewards`.
- Клиент запрашивает `GET /guest-portal/session/game-summary` раз в 15 секунд.
- При ненулевом `pendingCount` после шкалы уровня показывается блок кошелька, а в шапке — компактный индикатор. В карточках источников отражается локальный статус. Когда незавершённых item нет, блок и индикатор скрыты.
- Кнопка `Забрать награды` запускает `claim-all` только для обычных item; для лутбоксов пользователь всегда выбирает конкретный `Открыть контейнер`. `PROCESSING/OPENING` визуально заблокированы, `FAILED` показывает безопасный retry или состояние сверки.
- История наград является вторичным действием кошелька и показывает `WAITING_CLAIM`, `DELIVERY_PROCESSING`, завершённые и истёкшие результаты без преждевременного кода.
- После каждого обновления новое summary сравнивается с предыдущим. Новые чек-ин, задания и шаги Battle Pass добавляются в последовательную очередь поздравительных модалок. Следующая модалка открывается только после закрытия предыдущей.
- Закрытие поздравительной модалки вызывает только notification ACK. Получение происходит исключительно из кошелька.
- Ошибка чекина и повторный чекин тоже показываются модалкой. Для повтора отображаются время прежней награды и момент следующей доступности по локальному времени клуба.

## Правила условий

- Время и дни недели считаются по timezone клуба. Успешно выполненное условие должно сохранять entitlement: гость может открыть уже разблокированный лутбокс позже, даже вне исходного временного окна или после завершения сессии.
- Чекин доступен один раз в календарные сутки на клуб. Streak использует уникальные локальные даты клуба и сбрасывается после пропущенного календарного дня.
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
3. Проверить, что квалификация создала ожидаемые wallet item: отдельный ordinary reward и отдельный XP item при mixed результате. До claim XP/уровень, внешний баланс и код не должны измениться.
4. Закрыть поздравительную модалку и убедиться, что item остался `PENDING/WAITING_CLAIM`. Затем выполнить exact claim и проверить переход `PROCESSING/DELIVERY_PROCESSING` к подтверждённому результату ровно один раз.
5. Для Battle Pass проверить смену текущего шага отдельно от получения награды. Для лутбокса проверить `AVAILABLE → OPENING → CONSUMED`, отсутствие открытия через `claim-all` и единственный random roll.
6. Проверить границы TTL: `PENDING` за миллисекунду до deadline доступен, на deadline истекает; принятый до deadline `PROCESSING/FAILED` не удаляется после него. Старые уже доставленные reward/XP не появляются в кошельке.
7. При расхождении открыть диагностику игрового журнала: факт, решение правила, `WAITING_CLAIM/DELIVERY_PROCESSING`, wallet/ledger статус и время клуба. Неоднозначный Langame write должен остановиться в `RECONCILIATION_REQUIRED` без второго внешнего запроса.
8. Для supplemental rollout сначала задеплоить с режимом `OFF`, затем включить `SHADOW` и подтвердить отсутствие наград. Только после проверки freshness, replay и mismatch включать `LIVE`; при любой аномалии вернуть `OFF` без удаления фактов или миграций.
9. Перед применением `20260718180000_guest_game_effect_postings`, `20260718190000_guest_game_reward_effect_outbox` и `20260725213500_guest_game_reward_wallet` проверить время блокировок и конфликтующие дубли. API и миграции сначала разворачиваются с processors в fail-closed конфигурации.
10. При выключенных processors проверить создание одной квалификации, отдельных wallet item и `WAITING_CLAIM` effect без XP/внешней отправки; затем задать один tenant scope и включить materializer canary.
11. Во время canary проверить leases/fencing, безопасный retry до внешнего write, отсутствие retry после неоднозначного write и восстановление ровно одного результата из immutable plan.
