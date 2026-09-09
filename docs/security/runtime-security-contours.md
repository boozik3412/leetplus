# Runtime и security-контуры LeetPlus

Статус: **канонический current-state contract**

Актуально на: **08.09.2026**
Runtime implementation baseline:
`def5174f16f49212dd21d243cda89dffeff7837f` (PR #170; CURRENT190 production
baseline, включая canonical public-guest profile owner repair, verified-phone
registration repair и initial OWNER invite link mode; автономные Langame
worker timers перепривязаны к тому же exact SHA). Source после PR #171 уже
содержит target `CURRENT_191/191` для external Langame onboarding, но этот
successor не является production state до отдельного admission и rollout.

Этот документ обязателен перед изменениями авторизации, post-login routing,
access scope, публичного игрового входа, управления геймификацией, интеграций,
background jobs и production deployment. Его цель — не дать строгому
fail-closed правилу одного контура снова сломать другой контур.

## Текущее состояние

| Область                     | Состояние                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime implementation      | CURRENT190 production baseline, merge SHA `def5174f16f49212dd21d243cda89dffeff7837f`; previous admitted `797001d5f48c460bd431a65435b2fb387233c7fc` сохранён как hot rollback                                                                                                                                                                                                           |
| Admission merge SHA         | exact-main Fast CI `34226209000` и Full Release Admission `34226209023` для `def5174f…` — `SUCCESS`                                                                                                                                                                                                                                                                                    |
| Production API topology     | active blue exact `def5174f…`, `COMBINED`, schema `CURRENT_190/190`, bridge `OFF`, reporting `LIVE`; rollback green `797001d5…` независимо healthy                                                                                                                                                                                                                                     |
| Guest bug-report repair     | 20–2000 символов, canonical `5 fields + 1 file`, migration `20260831120000_guest_support_bug_report_input_repair`; **deployed**                                                                                                                                                                                                                                                        |
| Corporate invite repair     | `STANDARDS_MANAGER` делегирует canonical `SENIOR_ADMINISTRATOR`/`CLUB_ADMINISTRATOR` только внутри собственного store scope; overrides/custom permissions capability-bounded; **deployed**                                                                                                                                                                                             |
| Guest check-in consistency  | публичный чек-ин атомарно закрепляет activation boundary до evaluation и пишет exact `CHECK_IN_PERFORMED`; **deployed** в `982b537c…`                                                                                                                                                                                                                                                  |
| Split-runtime deployment    | `DORMANT / NOT INSTALLED`; нужен отдельный production GO                                                                                                                                                                                                                                                                                                                               |
| Corporate landing           | role-aware successor входит в active `f3f119fa…`; real-account canary остаётся отдельной проверкой                                                                                                                                                                                                                                                                                     |
| Release acceleration        | 8/8 + retention: controlled five-phase rollout operation `6be461db-c600-4fe7-9e87-6267d708554e` завершён receipt `c9cbf2c9…`; V3 и trusted lane metrics merged; public/corporate/worker контуры нельзя объединять или понижать ради скорости                                                                                                                                           |
| Langame recovery            | оба systemd timer `enabled/active`; daily authority привязана к exact `def5174f…` и обходит все `3/3` active Langame domains единственного admitted INTERNAL tenant; external unattended остаётся deny до отдельного admission                                                                                                                                                         |
| External Langame onboarding | canonical source target `CURRENT_191/191`: preview → atomic settings → manual exact-Store backfill; signed schema controller uses only the `CURRENT_190 → 191` bridge, while a pre-effect exact bridge re-pin may replace release SHA without DDL; transactional apply/check plus two final cutovers pin the SHA, terminal `OFF/LIVE` requires `final-check`; no production GO implied |
| Telegram guest auth         | egress recovery 06.09: один poller `172.25.0.10` через private HTTP CONNECT `172.25.0.1:18118` -> Privoxy SOCKS5t -> Tor remote DNS; webhook пуст, state monotonic; внешний canary и admitted heartbeat rollout обязательны до GO                                                                                                                                                      |
| Staff rewards               | source successor для `LP-BUG-A56627F5`: staff/test остаётся audit-меткой, но не ограничивает участие, reward, bonus-ledger queue или Langame dispatch; production effect требует отдельного exact-SHA rollout                                                                                                                                                                          |
| Guest identity owner        | exact-link и verified-phone repairs deployed в `def5174f…`; RU-варианты подтверждённого телефона разрешаются только внутри выбранного Langame domain, неоднозначность fail-closed; все 9 выявленных split-owner дублей погашены без reward replay, контрольный остаток `0`                                                                                                             |
| Внешний open beta           | `NO-GO` до Telegram end-to-end canary, admitted heartbeat/readiness rollout, закрытия SSH credential/public-port incident и оставшихся Gate 1MT/2                                                                                                                                                                                                                                      |

### Canonical simple safe external Langame onboarding

Для tenant со stage `PILOT`, `BETA` или `LIVE` canonical corporate path —
`POST /integrations/langame/settings/preview`, затем
`PUT /integrations/langame/settings`. Preview разрешён только authenticated
OWNER/ADMIN с fresh `NETWORK` scope и делает bounded read клубов; он не
сохраняет source/Store и не запускает sync. Ровно один returned club выбирается
автоматически, а при нескольких пользователь обязан передать точные club
bindings.

`PUT /settings` повторяет provider discovery и проверяет actor, tenant, club и
Store непосредственно перед единой transaction. Глобальная unique Store
identity `(externalProvider, externalDomain, externalClubId)` не позволяет
одному provider club оказаться в двух tenant; collision или preview drift
останавливают запись fail-closed. После подключения external tenant вправе
запускать только manual sync по persisted exact Store bindings. Scheduled/daily
external Langame, generic sync без persisted exact Store binding и guest foundation остаются
`EXTERNAL_DENY`; timers, permits и credentials INTERNAL-контура не
переиспользуются. Tenant `1337` остаётся `INTERNAL` legacy contour без смены
его semantics.

Schema target этого контракта — `CURRENT_191/191`, migration
`20260908180000_external_langame_simple_onboarding`. Только exact external
Langame `CURRENT191` signed schema controller может применить её: signature
привязана к release SHA, source/target heads и counts, миграции и receipts
обоих slots. До effect оба slot одного exact target-191 release проходят отдельно,
по одному inactive slot, через orchestrator profile
`--slot-runtime-profile current191-bridge`: основной переход только
`CURRENT190 OFF/LIVE → target191 ALLOW_CURRENT_190/OFF` (`COMBINED`). Узкое
cross-slot правило для второго bridge шага разделяет две lineage: latest
cutover и protected active env обязаны доказать previous CURRENT191 bridge
baseline plan, а accepted bind receipt и immutable target-env backup — прежний
BOUND CURRENT190 origin inactive slot. Исключение разрешено только для exact
`current191-bridge`; оно не допускает `preserve`, `current191-final`, ABSENT
origin, иной head/count/flags или ручную правку env. Узкое
исключение для восстановления частичного rollout разрешает
`CURRENT191 ALLOW_CURRENT_190/OFF →` тот же exact bridge profile нового
admitted release SHA; flags не меняются, DDL не выполняется, readiness и
cutover повторяются для одного inactive slot. Любой другой source head/count
или flags отклоняется. Plan digest, phase receipts и recovery `resume` всегда
относятся к одному slot и одному cutover; profile не является общим
переключателем flags.

Узкий `supersede-after-smoke-bind-rollback` не является rollout-success или
общим cancel. Он относится только к уже начатому первому inactive slot нового
replacement rollout `CURRENT191 current191-bridge`, у которого canonical
`SMOKE` intent и `SMOKE` unmask intent уже опубликованы, но `SMOKE`
evidence/receipt ещё нет.
`HYDRATE` и `BIND` chain к этому моменту обязаны быть accepted. Штатный binder
должен выполнить exact digest-pinned `BIND → ROLLBACK`: rollback ссылается на
accepted bind receipt, возвращает link к `PRIOR_RELEASE`, а protected target
env byte-в-byte совпадает с до-BIND backup. Target остаётся inactive, обе его
units — unmasked, `inactive/dead` с `PID=0` и без процессов. Только после этих
проверок old operation terminalizes immutable record, а replacement может быть
отдельным уже admitted control с иным SHA/control-attestation digest в той же
effective lane. Ручная правка env/link или operation
intent/evidence/receipt/terminal record запрещена и остаётся fail-closed.

Это recovery source contract, а не production evidence: source или CI не
означают deployed state. До отдельного receipt-backed admission и rollout
production остаётся `CURRENT_190/190`, traffic направлен на active blue.

Controller применяет schema транзакционно, а его exact `check` обязателен до
bridge-off и атомарно публикует receipt `root:root 0400`. Каждый
`current191-final` plan обязан пинить SHA-256 этого receipt; orchestrator до
создания операции и при каждом чтении plan сверяет immutable bytes, release
SHA, schema-plan, head/count/checksum и database/bridge evidence. Один exact
receipt используется в обоих final plan без TTL между slot cutover: после
первого final новый dual-bridge check уже невозможен. Это не ослабляет boundary,
потому что перед каждым effect orchestrator отдельно требует тот же release,
exact `ALLOW_CURRENT_190/OFF` source и повторную live DB readiness. После commit
orchestrator выполняет `current191-final` также по
одному inactive slot и с cutover: только `target191 ALLOW_CURRENT_190/OFF →
target191 OFF/LIVE`. После двух exact final receipts CURRENT191 CLI выполняет
`final-check`; только затем допустим final public postcheck. Это source
contract, не заявление о deployed production или GO: production остаётся
`CURRENT_190/190`.

### Public guest canonical profile owner repair 08.09.2026

Active repair сохраняет один профиль владельцем истории гостя при переходе между
клубами Langame. Для подтверждённого phone hash портал сначала ищет ровно один
`ACTIVE` профиль через `GuestGameProfileIdentityLink` того же tenant,
`LANGAME` provider и текущего domain/guest. Такая exact-связка имеет приоритет
над legacy `GuestGameProfile.guestId` и над `profileId` из уже выданного токена.
Если подходящих active owners больше одного, запрос завершается `409` до
profile mutation, JWT signing и любых event/reward effects. Профиль со статусом
`SUPERSEDED` нельзя восстановить через legacy token или club-selection fallback;
обычная поддерживаемая реактивация `INACTIVE` профиля не меняется.

Изменение не добавляет route, migration, database role, secret, egress,
scheduler или worker authority. Production repair для обращения `*6330`
завершён: доказанный пустой профиль-дубль и conflict-link переведены в
`SUPERSEDED`, future-sync cursor ownership закреплён за canonical профилем,
audit `SUPPORT_CANONICAL_PROFILE_OWNER_REPAIR` сохранён. Канонические события,
XP, wallet, bonus-ledger и существующее право на открытие кейса не переносились
и не проигрывались повторно; исторические activity facts сохранены как
evidence. Новые награды этой операцией не создавались. Для любого следующего
аналогичного repair всё равно обязательны exact preview, отдельный production
GO, backup/restored-copy и postcheck; source/CI или merge сами по себе не дают
права на data effect.

### Public guest verified-phone registration repair 08.09.2026

Production-разбор второго обращения (`*3669`) подтвердил отдельный predecessor
дефект регистрации. SMS.ru Callcheck успешно подтверждал телефон, но поиск
existing profile сравнивал только один literal `phoneHash`. Если старый Langame
guest был сохранён с эквивалентным RU-вариантом (`7`, `8` или локальные десять
цифр), портал создавал новый phone-only профиль. Следующий club selection уже
находил старого гостя, и один физический `SESSION_START` оказывался связан с
новым профилем, а facts этой же сессии — с каноническим. `app-open` и
`game-summary` затем штатно отвечали fail-closed `409` owner collision.

Deployed successor внутри той же challenge-scoped registration transaction
сначала получает все HMAC-варианты только из уже подтверждённого зашифрованного
телефона и ищет Langame guest только в выбранном `externalDomain`. Ровно один
guest возвращает его существующий `ACTIVE` профиль до create; два результата
дают `409` до profile mutation, JWT, event или reward effect. Provider polling
остаётся вне DB transaction, lock scope и публичные routes не меняются.

Изменение не добавляет migration, secret, egress, role, worker или scheduler.
Targeted regression `218/218`, API typecheck и targeted lint прошли. PR #170
развёрнут как exact SHA `def5174f16f49212dd21d243cda89dffeff7837f`
пятифазной operation `9687947d-722c-45e9-8a72-999e433434ab`; terminal receipt
SHA-256 —
`4d2f6c32ed57736a01f7f389467313bba0e410ba444aee5d1629c33c284f540d`.
Fresh backup, off-host checksum и restored-copy acceptance прошли до cutover.

После rollout bounded repair закрыл ещё восемь подтверждённых split-owner
состояний, включая `*3669`: семь физических `SESSION_START` и `98`
zero-effect decisions перенесены к canonical owners по audit
`LP_SPLIT_OWNER_REPAIR_V1`; один дополнительный no-fact `SESSION_START` и его
`14` zero-effect decisions — по `LP_SPLIT_OWNER_REPAIR_V2`. Все восемь пустых
phone-only профилей стали `SUPERSEDED`. Вместе с отдельным repair `*6330`
исправлены все девять выявленных дублей; контрольный поиск active structural
split owners вернул `0`. Facts, raw records, OTP, sync jobs, XP, rewards,
completion notifications, loot-box/mission/season entitlements, wallet, reward
intents, deliveries и bonus ledger не replay-ились и не начислялись повторно.
Любое отличие precondition в будущем обязано останавливать repair целиком.

Старая вкладка может сохранить JWT, выпущенный до repair. Exact identity owner
имеет приоритет над stale `profileId`, а `SUPERSEDED` профиль не реактивируется;
если клиент всё ещё показывает прежний экран, поддерживаемое действие — начать
новую авторизацию и ещё раз подтвердить телефон, а не создавать аккаунт или
начислять награду вручную. Операционный порядок описан в
[`guest-auth-profile-owner-incidents.md`](../support/guest-auth-profile-owner-incidents.md).

### Assortment action center deployed 08.09.2026

Впервые выпущенный release `1cf42bb311aafa7f41ad7f42784463fe34c152c7` и
текущий active `def5174f16f49212dd21d243cda89dffeff7837f`
расширяют существующий tenant-authenticated
`GET /dashboard/summary` и экран `/assortment/dashboard` операционными
показателями ассортимента: свежестью источников, приоритетными действиями,
покрытием себестоимости/остатков/категорий, чековыми метриками и семидневным
прогнозом. Route ownership, corporate JWT, fresh tenant/store scope и
`COMBINED` runtime остаются прежними. Public guest routes и platform-admin
контур не затронуты.

Langame daily worker остаётся единственным unattended owner загрузки продаж и
остатков. Candidate читает опциональный receipt/order identifier из уже
разрешённого ответа `/products/expense`, но сохраняет только SHA-256-bound
receipt token внутри существующего `SalesFact.sourcePayloadHash`; raw
идентификатор чека не пишется в БД, логи, readiness или HTTP response. Если
источник не передал идентификатор, чековые показатели честно остаются
`SOURCE_UNAVAILABLE`. Отсутствующая `price_purchase` дополняется только
tenant/store/product-scoped закупочной ценой из существующей конфигурации
Langame; provider write и новый egress не появляются.

Изменение не добавило migration, database role, secret, systemd unit,
scheduler или network authority: schema осталась exact `CURRENT_189/189`, API
schedulers остались `OFF`, а worker profile — отдельным fail-closed permit.
Exact-main Fast `34203683926` и Full `34203683901` прошли; пятифазный rollout
operation `6be461db-c600-4fe7-9e87-6267d708554e` завершён terminal receipt
`c9cbf2c981366613db76a14d310407734061ef9e0289f68e7b9ef8eb66741818`.
Active green и hot rollback blue независимо healthy. Старый Langame permit
снят штатным supersession; canary `2026-09-07` и stable timer
`plan/apply/check` прошли на новом SHA, apply receipt
`593b13108eb19ee10151a880e5b889318c65f399614b83d6cb55fd733b192a06`.

Текущий Web сворачивает подробные пять карточек источников по умолчанию. Сводка
готовности источников и ссылка «Обновить данные» остаются видимыми, раскрытие не
вызывает sync и не меняет серверные расчёты. Production QA на ширине 944 px
подтвердил отсутствие горизонтального переполнения и корректный цикл
`collapsed → 5 cards → collapsed`.

После каждого будущего application cutover старый Langame permit нельзя переносить:
production release обязан тем же операционным проходом выполнить exact
`supersede -> canary -> timer plan/apply/check` для нового release SHA. Source,
CI или merge сами по себе не считаются production deployment.

Store execution fence остаётся отдельным явным полномочием. Migration 165
правильно создала все существующие Store с `backgroundExecutionEnabled=false`,
но до 06.09 для текущего INTERNAL tenant не существовало реализованного
аудитируемого пути включения. Поэтому worker запускался, но ledger fallback,
reward materializer и другие store-bound background jobs останавливались на
`BACKGROUND_STORE_ID_REQUIRED` до чтения/выдачи эффекта. Новый platform-admin
control-plane route использует точные Tenant/Store IDs, expected Store revision,
reason, request ID, exact confirmation и validated release SHA; update и
`PlatformAdminAuditEvent` атомарны. Обычный tenant/public guest доступа не
получают, а внешний tenant не может пройти `ENABLE` этим маршрутом.

Слияние в `main`, наличие собранных `corporate-main.js`/`guest-main.js` или
зелёный CI не доказывают production deployment. Фактический production runtime,
env, systemd, nginx и database roles проверяются отдельно.

Production worker authority 06.09 дополнительно запрещает single-hop догадки о
предыдущем release. Если permit пережил несколько штатных cutover, authority
может снять его только по непрерывной immutable цепочке accepted receipts с
точными generation/SHA/slot bindings и bounded длиной. После supersession
обязательны новый canary и отдельный timer permit текущего release; перенос
старого разрешения или ручное удаление fence/pointer остаются запрещены.

Worker/control-plane не делит Prisma pool с двумя API slot. Для частого
`leetplus-bonus-ledger-worker` обязателен exact URL с `schema=public`,
`connection_limit=2`, `pool_timeout=5`, `connect_timeout=5`; неизвестные или
повторные query options отклоняются. Activity recovery всегда равен одному
профилю за tick, а systemd допускает до 15 минут на полный обход его bounded
Langame sources. Это сохраняет PostgreSQL role limit `20`, active blue/green
API и singleton ownership без переноса scheduler authority в HTTP runtime.

Production repair CURRENT_189 не смешивает контуры: Web отправляет bug-report через
same-origin guest BFF, GuestRuntime принимает только guest JWT и bounded
multipart, а tenant/platform очереди остаются в CorporateRuntime. Изменение
exclusive `parts` cap с 6 на 7 не расширяет allowlist: `fields=5`, `files=1`,
тип, сигнатура и размер файла продолжают проверяться отдельно. Production
работает на exact CURRENT189, bridge выключен, reporting включён.

Source successor 04.09 восстанавливает автономность геймификации без переноса
worker authority в public/corporate runtime. Существующий active-slot
`leetplus-bonus-ledger-worker.timer` остаётся единственным частым owner и
последовательно обслуживает bonus delivery, tenant-scoped activity queue,
основной/supplemental pipeline и quality monitoring. Отдельный authorized
`leetplus-langame-daily-worker.timer` владеет daily import, recovery enqueue и
bounded tenant maintenance. Оба API slot сохраняют встроенные schedulers
выключенными; оба worker требуют ровно один `ACTIVE + INTERNAL` tenant, а
`EXTERNAL_DENY` остаётся неизменным. Canary ограничен одной записью и не создаёт
pipeline/reward effect. Наличие этого source-контракта не доказывает production
deployment: нужен новый exact-main Fast+Full admission, immutable handoff,
canary и postflight.

Production preflight 05.09 для admitted successor `e4da6a04…` остановился до
runtime hydration: Ubuntu 24.04 / systemd 255 не публикует service-only
`MainPID`, `ControlPID` и `ExecMainPID` для `.timer`, а root successor
controller ошибочно считал пустые timer-поля неканоническим PID-состоянием.
Source repair нормализует только это exact отсутствие у `.timer` в нулевое
состояние; для `.service` по-прежнему обязательны явные `0`, а проверки
`inactive/disabled`, cgroup, fragment path, start-fence и immutable receipt не
ослабляются. До нового exact-main Fast+Full и установки новой control
generation production runtime остаётся `f3f119fa…`, Langame timer —
`inactive/disabled`; routing, БД и active services preflight не менял.

Controlled rollout 05.09 завершён на exact admitted SHA `982b537c…`: active
green, generation 22, blue сохранён hot rollback, production schema осталась
exact `CURRENT_189/189`. Частый `leetplus-bonus-ledger-worker.timer` включён и
bounded-пакетами дренирует историческую activity queue без bonus-ledger
`FAILED`, `BLOCKED` или `RECONCILIATION_REQUIRED`. Langame daily canary
остановился до worker effect: authorization authority передавал строгому
installed-control verifier унаследованную bash-переменную `_`, хотя verifier
разрешает только canonical `PATH/LANG/LC_ALL/TZ`. Source repair запускает
verifier через exact `/usr/bin/env -i` и фиксирует отрицательным fixture любое
добавочное окружение. Это не расширяет worker authority и не считается
deployed до нового exact-main Fast/Full, control install, canary и timer check.

Следующий admitted rollout exact `2b8c7dfd…` завершён штатным пятифазным
оркестратором: production active blue, green `982b537c…` сохранён hot rollback,
schema осталась `CURRENT_189/189`, public/corporate readiness проходит.
Canary Langame за `2026-08-27` затем фактически выполнил один INTERNAL tenant и
завершил синхронизацию без failed scope, но authorization authority не создал
success receipt: Ubuntu systemd успел garbage-collect завершённый static
oneshot, поэтому его terminal timestamps/result стали пустыми, а cleanup
ошибочно потребовал `reset-failed` уже выгруженного unit. Timer не включался;
временные 91-drop-in и active permit были удалены только после exact сверки
intent/permit, zero PID/cgroup/jobs и восстановления двух исходных 90-fence.

Текущий source repair не расширяет worker authority. Контроллер принимает
garbage-collected terminal success только если в этом же apply уже наблюдал
fresh monotonic start, после исчезновения unit получил exact `inactive` от
`is-failed` и повторно доказал zero PID/cgroup/jobs. Failed, deactivating,
не наблюдавшийся или неоднозначный запуск остаётся rejected. Worker wrapper
берёт `DATABASE_URL`, `APP_ENCRYPTION_KEY` и `INTEGRATION_ENCRYPTION_KEY` из уже
разобранного systemd environment, сохраняя root-owned raw EnvFile как источник
allowlist/hash identity; это делает корректными quoted systemd values без
ослабления secret set. До exact-main Fast/Full, установки control generation,
повторного принятого canary и timer check Langame timer остаётся
`inactive/disabled`.

Exact admitted rollout `96b28f44…` 05.09 завершён штатным пятифазным
оркестратором: production active green, blue `2b8c7dfd…` сохранён healthy hot
rollback, schema осталась `CURRENT_189/189`. Повторный идемпотентный canary за
`2026-08-27` фактически завершился success настолько быстро, что systemd успел
выгрузить static oneshot до первого двухсекундного sample. Контроллер был
остановлен только после подтверждённого terminal app-result; штатный `recover`
доказал zero PID/cgroup/jobs, удалил temporary permit/drop-ins и восстановил
оба 90-fence. Timer не включался.

Follow-up repair удерживает только canary service после успешного `Type=oneshot`
в `active(exited)` временным authorization drop-in
`[Service] RemainAfterExit=yes`. Authority обязан увидеть fresh monotonic start,
валидные exit timestamp/result/status и zero PID/cgroup/jobs, после чего сам
останавливает service до публикации execution receipt и восстановления fence.
Timer-profile не получает `RemainAfterExit`, поэтому ежедневные запускаемые
таймером jobs не могут остаться active и заблокировать следующий день. Journal
не используется как authority, failed/deactivating/чужой drop-in по-прежнему
fail-closed.

Exact admitted rollout `85920b7b…` сохранил active blue и healthy rollback
green, schema `CURRENT_189/189`; canary по всем датам `2026-08-27`–`2026-09-04`
дал `36/36 SUCCESS` и zero duplicate idempotency keys. Stable timer authority
остановился fail-closed на последней повторной проверке installed control:
вложенный authorization verifier вызывал Node напрямую, и Bash передал strict
verifier служебную exported-переменную `_`. Authority удалил temporary permit,
выключил timer и восстановил оба 90-fence; runtime и данные не откатывались.
Source repair не меняет allowlist или worker authority: child verifier всегда
запускается через `/usr/bin/env -i` только с canonical
`PATH/LANG/LC_ALL/TZ`. Disposable fixture и static gate закрепляют эту exact
границу. До нового exact-main admission, control install, повторного canary и
timer check repair не считается deployed.

Exact admitted rollout `72b1b053…` завершён штатным пятифазным оркестратором:
production active blue, healthy green `466ca90d…` сохранён hot rollback, schema
осталась `CURRENT_189/189`. Повторный canary `2026-09-04` дал `4/4 SUCCESS` и
zero duplicate effects. Stable authority прошёл permit/stable-env digest
проверки, установил временные authorization drop-in и включил timer, но
финальный verifier fail-closed отклонил штатную сериализацию systemd 255:
`DropInPaths` содержит два exact пути через один пробел, а избыточный
предварительный pattern ожидал двойной разделитель. Authority выключил timer,
удалил temporary authorization и восстановил оба 90-fence; runtime и данные
остались healthy. Source repair сохраняет строгую sorted equality двух exact
путей и запрет любого третьего drop-in, но не зависит от лишнего whitespace.
До нового exact-main Fast+Full, control install, canary и timer check этот
repair не считается deployed.

### Guardrail ускорения release pipeline

[`production-topology-contract.json`](../deployment/production-artifact/production-topology-contract.json)
фиксирует source topology COMBINED blue/green/N−1, runtime identities,
EnvironmentFiles, transient rehearsal membership и per-slot receipts.
Fail-closed verifier запускается в Fast и Full CI, чтобы инцидентные topology
mismatch обнаруживались до artifact hydration и production effect.

Disposable topology twin воспроизводит обе API/Web slot-пары реальными systemd
units, но только на одноразовом GitHub runner. Он проверяет exact effective
EnvironmentFiles, NSS/process groups и ports, отдельно разрешает transient
restored-copy identity. Supplementary membership
`leetplus-rehearsal -> leetplus-runtime` допустима только во время самого
restored-copy gate и должна быть удалена при любом PASS, FAIL или interrupt
до cache/slot bind/cutover fixtures. Persistent membership является privilege
residue: production preflight намеренно блокирует cache/cutover, пока она не
удалена и отсутствие не подтверждено. Zero-residue cleanup является частью
gate; production host и production data этот тест не использует.

Этот контракт не создаёт четвёртый security-контур и не позволяет применять
правила corporate tenant к public guest либо worker authority к runtime.
Release impact classifier теперь первым запускается в Fast и Full CI и может
только повышать lane. Изменения auth/scope, guest boundary, DB/schema/ACL,
systemd/nginx, workers или production-control всегда требуют полной
schema/security lane. Неизвестный, смешанный или недоверенный diff тоже считается
максимальным риском; `L1` ограничен явным allowlist. Только exact Markdown-only
получает non-deployable `L0` receipt и пропускает runtime jobs. Manifest не
доказывает фактическое live состояние и не заменяет exact-SHA admission,
installed-control verification, production receipts, backup/restored-copy или
отдельный GO. Для накопительных release-метрик trusted lane не берётся из
параметров оператора: final admission schema `2` фиксирует только `L1_RUNTIME`
или `L2_SCHEMA_SECURITY` вместе с SHA-256 exact impact receipt. Те же два поля
входят в immutable runtime/control provenance, root-only installed-generation
receipt и machine-readable verifier output. Историческая terminal операция без
этих полей остаётся `LEGACY_UNCLASSIFIED` и не участвует в lane percentile;
это не понижает требования admission или security-контуров. Read-only metrics
держит только shared install lock, читает canonical root-owned receipts и не
обращается к public guest, corporate tenant, DB, worker units, timers или сети;
attempt record не содержит identifiers, SHA, paths, environment, output или PII.
Retention не встроен в read-only report и не запускается автоматически.
`metrics-retention-plan` держит тот же shared install lock и только связывает
exact live/archive inventory. Отдельный `metrics-retention-apply` требует root,
plan SHA-256 и exclusive порядок `install.lock -> orchestrator.lock`, сначала
публикует immutable segments, затем удаляет только их exact live copies.
Incomplete archive блокирует metrics и rollout `apply|resume` до replay того же
plan. Этот filesystem-only production-control boundary не вызывает DB,
systemd/runtime, timers, providers или сеть и не получает authority public
guest, corporate tenant либо worker contour. Source/CI наличие команды не
означает её установку или запуск на production; для новой control generation и
самой retention operation нужны отдельные admission/GO соответственно.

Поверх impact lane действует независимый merge-candidate guard. Final runtime и
production-control handoff разрешён только runtime-eligible exact `push` SHA в
`refs/heads/main`, когда event base совпадает с повторно проверенным impact
base, а workflow ref/SHA принадлежат тому же merge commit. Manual, schedule,
feature branch и Markdown-only runs остаются non-deployable. Последующий main
commit не отменяет уже выполняющийся exact Full, но это не разрешает смешивать
release trains или устанавливать любой `main` без final admission и отдельного
GO.

Runtime rollout теперь имеет отдельный source/CI orchestrator для exact порядка
`HYDRATE -> BIND -> SMOKE -> CUTOVER -> POSTCHECK`. `prepare` создаёт только
nonauthorizing план, а `apply` остаётся отдельным production effect boundary.
Каждая фаза связана immutable intent/evidence/receipt; lost response допускает
только reconcile той же operation с повторной сверкой installed control,
active generation, slot link, readiness и authenticated smoke. Previous slot
остаётся hot rollback. Если target до rollout является hot rollback, BIND сам
выполняет persistent exact `mask --now` обеих instance units; cache и slot-link
effect разрешены только при exact masked/inactive/process-free состоянии.
SMOKE снимает маски перед start. Сбой оставляет текущий public slot доступным,
а target fenced; durable quiesce/unmask intents запрещают принимать или снимать
pre-existing operator mask. Ручной обход этой границы запрещён. Canonical
production-control `install.lock` удерживается
на всей цепочке, включая promoter через проверенный inherited fd, поэтому
generation bytes нельзя заменить между attestation и effect. Этот coordination
layer не становится четвёртым
security-контуром и не получает право на Prisma/SQL, ACL, auth/scope,
USER_CALL, guest flags или worker state. Такие L2 effects по-прежнему требуют
своих signed controllers, backup/restored-copy evidence и отдельного GO.

Узкий `supersede-pre-runtime` не является rollback и не допускает effect:
он terminalize только approved V3 operation с `0` accepted phase receipts,
единственным pending `HYDRATE` intent и отсутствующим `final.json`. Controller
сверяет старую baseline/cutover continuity, installed-control attestation
replacement SHA, одинаковую effective lane и разные old/replacement SHA, затем
exclusive-create публикует `superseded.json` как `root:root 0400`. Он не меняет
runtime, DB, slot env, unit или nginx/cutover state, а только закрывает
audit/control record и открывает новый `prepare`. Любой accepted phase либо
любой `BIND` record запрещает supersession; ручное удаление/правка operation
records также запрещены и остаются fail-closed.

Live continuity и replacement-control attestation являются precondition первой
exclusive-публикации. Идемпотентный replay затем доверяет только каноническому
receipt, связанному с exact plan, approval и HYDRATE intent: последующие
legitimate control/cutover поколения не могут сделать terminal audit record
снова незавершённым. Каждый новый `prepare` независимо проверяет собственный
installed-control generation и не наследует authority superseded operation.

Отдельный `supersede-after-bind-rollback` не расширяет это правило. Он
применим только к exact второму `CURRENT191` `current191-bridge` plan, где
`HYDRATE` принят, `BIND` intent pending, но BIND phase receipt/evidence ещё не
создан. Перед terminal publication controller требует exact receipt-bound
`BIND → ROLLBACK` pair того же slot/operation (`PRIOR_STATE=BOUND`, rollback
привязан к digest bind receipt), возвращённый `PRIOR_RELEASE`, target env
byte-в-byte из protected backup (`CURRENT190 OFF/LIVE`) и unmasked,
stopped/process-free target units. Active side обязана всё ещё совпасть с plan
previous `CURRENT191 ALLOW_CURRENT_190/OFF`, а cutover generation — с
baseline; replacement installed control должен быть другой SHA той же lane.
Exact bind/rollback digests обязательны в recovery-команде; controller также
сверяет binder `OPERATION_ID` в latest index и receipt и причинный timestamp
порядок после orchestration quiesce intent.
Только после этого exclusive-create публикует immutable `superseded.json`.
Команда не имеет права менять DB, runtime, env, slot link, units, nginx или
cutover и не является generic cancel/rollback. Любое BIND evidence, active or
target drift, иной profile/head/count/flags либо отсутствующий receipt
останавливает её fail-closed.

Immutable publication authority также не смешивает release и slot. Promotion
intent/attestation хранятся по exact SHA; их `RELEASE_SLOT` фиксирует origin
slot первой публикации. Reuse в другом slot разрешён исключительно для уже
существующего final `/srv/leetplus/releases/<SHA>`, когда intent и attestation
cross-bound друг с другом, их immutable provenance/manifests совпали и
`seal-release-artifact --dry-run` успешно выполнен от service-user target slot.
Origin receipts не меняются. Source/staging или promotion/quarantine recovery
остаются same-slot-only; missing/partial final release, mismatch или ручная
правка дают fail-closed stop.

Первый controlled production rollout оркестратора завершён 03.09.2026 на exact
admitted SHA `f3f119fa81fc497b75cc1e57f046d8539676c943`: active upstream —
blue, cutover generation — 21, hot rollback — green `22ab6b81…`. Public и
loopback API/Web readiness, authenticated reads, worker timers и exact
`CURRENT_189/189` прошли postcheck; schema, ACL и runtime security flags не
менялись. Операция сохранила terminal five-phase receipt и не оставила pending
record.

Этот rollout также дал точный production feedback для successor-контракта V3.
Target, остающийся в systemd `failed` после stop, теперь проходит только
идемпотентный `reset-failed` и повторную проверку `masked/inactive/dead/PID=0`.
Slot metadata обновляется атомарно под fence с root-only exact previous-byte
backup, lineage к bind receipt и сохранением guest reporting/schema-bridge
flags. Фактический legacy `API_BIND_HOST=localhost` допускается только как
точный previous input и после полного target fence нормализуется к canonical
`127.0.0.1`; это сужает listener contract и не разрешает `::1`, DNS name или
иной alias. Cache повторяется ограниченно только после обычного non-zero результата
и повторной проверки fence; ambiguous outcome не повторяется. Loopback
readiness получает bounded startup wait, но timeout/oversize/stderr остаются
fail-closed. Cutover с диагностическим stderr принимается только если уже
опубликованный latest receipt является точным successor generation и active
nginx link совпадает. Эти правила относятся только к deployment coordination и
не дают оркестратору SQL, auth/scope, provider или worker authority.

Rollout 01.09.2026 прошёл на exact admitted SHA после restored-copy PASS и
checksum-pinned перехода `CURRENT_188 -> CURRENT_189`. Оба runtime slot готовы
на exact `CURRENT_189/189`; active nginx generation — 20. Перед DDL создан
off-release backup `current189-preupgrade-20260901T1511Z`, а подписанные
evidence и receipts сохранены вне runtime release. Bonus-ledger timer после
postflight возвращён в автономный `active (waiting)` режим.

### История подготовки CURRENT189

Restored-copy acceptance для CURRENT_189 сравнивает каталог `/products` только
с активными `Product`: endpoint по контракту не возвращает архивные
`isActive=false` строки. Эта граница закреплена в database oracle и отдельном
регрессионном тесте; она не удаляет и не активирует товары. Первый rehearsal
корректно остановился до production effect, когда старый oracle посчитал ещё
251 неактивный товар (`1489` вместо API `1238`). Повторный rehearsal и exact-SHA
admission обязательны до rollout.

Вторая fail-closed остановка rehearsal выявила не утечку данных, а смешение
двух наборов identity внутри acceptance oracle. Tenant API намеренно не
показывает platform-admin в каталоге сотрудников, однако исторические записи
этого же tenant законно содержат его `createdBy/target/processedBy` ссылки.
Oracle теперь хранит отдельно точный visible user set и полный tenant reference
set: скрытый platform-admin того же tenant допустим только как ссылка, но не как
строка `/users`; любой ID пользователя другого tenant по-прежнему даёт
`CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE`. Production данные и runtime этим
исправлением не меняются; нужен новый exact-SHA rehearsal и admission.

Третья fail-closed остановка rehearsal уточнила ещё одну допустимую границу:
tenant account-management каталог содержит 28 non-platform пользователей, но
активные staff selectors намеренно возвращают только 26 `isActive=true` строк.
Acceptance oracle теперь отдельно фиксирует полный `/users` set, активный staff
set и более узкий discipline-role set; каждое несовпадение дополнительно
указывает module/probe/response key. Platform-admin исключён из всех tenant
employee selectors независимо от активности. Неактивные учётные записи не
удаляются и остаются управляемыми через `/users`, однако не могут быть выбраны
для новых задач, чек-листов, обучения, чата, оценок, дисциплины или зарплатных
операций. Production runtime и данные этим source repair не меняются; до rollout
обязательны новый exact-SHA admission и PASS на восстановленной копии.

Следующая exact-SHA rehearsal также остановилась до production database effect:
default `/staff/discipline` намеренно применяет `status=ACTIVE` и вернул 17
активных записей, тогда как database oracle включил ещё 6 исторических
`RESET`. Acceptance теперь сравнивает endpoint только с tenant-scoped
`StaffDisciplineRecord.status=ACTIVE`; это не скрывает active строки, не меняет
API и не переписывает 23 существующие записи. Новый exact-SHA admission и PASS
на той же копии остаются обязательными до rollout.

Для additive перехода `CURRENT_188 -> CURRENT_189` существует отдельный
fail-closed режим `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_188`. Он
допускает только exact пару
`20260828190000_guest_support_bug_reports/188 ->
20260831120000_guest_support_bug_report_input_repair/189`, только runtime
`COMBINED` и только `GUEST_BUG_REPORTING_MODE=OFF`. Он не заменяет исторический
`ALLOW_CURRENT_187`, не является общим N/N+1-допуском и не разрешает split
runtime. До DDL оба active/rollback slot должны быть одним admitted target-189
SHA с bridge/`OFF`; после DDL они обязаны перейти в exact CURRENT_189 readiness,
после чего bridge возвращается в `OFF`, а reporting — в `LIVE`.

Migration identity в release provenance вычисляется только из exact
`prisma/migrations`, уже скопированного в immutable artifact. Независимый
artifact verifier повторно выводит head/count из этого же sealed набора и
отклоняет несовпадение. Это исключает stale metadata при добавлении миграции,
но не является migration policy: отдельный API child-process fixture явно
pin-ит reviewed head/count и сверяет их с runtime readiness на disposable БД.
Production deploy controller по-прежнему требует заранее разрешённые exact SHA,
schema transition, immutable handoff и отдельный GO.

## Три независимых контура

| Контур            | Public guest                                                                             | Corporate tenant                                                                               | Workers / control plane                                              |
| ----------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Назначение        | массовый вход и игра гостей                                                              | управление сетью и игровыми правилами сотрудниками                                             | scheduled/replay/delivery/integration работа                         |
| Web               | `/game/auth`, `/game/clubs`, `/game`, `/game/rewards`, совместимые `/play*`, `/game/app` | `/dashboard`, `/gamification`, `/staff*`, `/marketing`, `/assortment*`, `/administration`      | операторские runbooks/CLI, не public Web session                     |
| API               | `/guest-portal`, `/guest-portal/*`, `/public/guest-game/media*`                          | `/auth*`, `/dashboard*`, `/stores*`, `/staff*`, `/guests/gamification*` и остальные B2B routes | service-token/scheduled endpoints и отдельные runners                |
| Identity          | `GuestGameProfile`, guest JWT/HttpOnly cookie, подтверждённый `phoneHash`                | corporate JWT, effective role/capabilities, fresh `NETWORK                                     | STORES` scope                                                        | отдельная service/runtime identity, tenant execution admission |
| Secrets           | guest JWT/referral/provider + нужные integration encryption keys                         | corporate JWT/identity/invite + B2B integration keys; guest JWT запрещён                       | только exact worker/provider secret set                              |
| Конкурентность    | сотни разных guest sessions должны исполняться параллельно                               | B2B rate/scope policy не влияет на public guest                                                | bounded leases/batches, без регистрации scheduler в public guest API |
| Process candidate | `guest-main` / `GuestRuntimeModule`                                                      | `corporate-main` / `CorporateRuntimeModule`                                                    | отдельные units/runners по rollout contract                          |

Критическое различие: `/guests/gamification*` — это корпоративное управление
игровым модулем. Оно должно остаться доступно tenant-ролям в corporate runtime.
Публичный игровой вход и gameplay используют `/guest-portal*` и не должны
импортировать корпоративную авторизацию. Название домена `guest-gamification`
в коде само по себе не определяет runtime-контур; определяет субъект и HTTP
contract.

### Production USER_CALL continuity

Публичный вход по SMS.ru Callcheck — пользовательский request path, а не worker.
Для текущего `COMBINED` blue/green runtime он включается только API-only файлом
`/etc/leetplus/guest-user-call-live.env`, установленным и проверенным exact
production-control generation. Профиль разрешает только `USER_CALL`, provider
`SMS_RU_CALLCHECK`, canonical `https://sms.ru` и timeout `8000`; API key остаётся
в API runtime secret set. Web не загружает этот файл. Все scheduler/delivery/
materializer switches остаются fail-closed в `canary-safe.env`.

Ручные `leetplus-user-call-api.service`/`leetplus-user-call-web.service` не
являются допустимым постоянным контуром: они не имеют immutable same-SHA,
schema-bridge и rollback authority. Перед `CURRENT_188` они должны быть
переключены на admitted slot без разрыва публичного входа, остановлены,
disabled и удалены из systemd inventory. Помечать такой sidecar `SAFE` нельзя.

### Autonomous bonus-ledger worker

Langame bonus accrual относится только к workers/control-plane contour. В
production встроенный `GuestBonusLedgerSchedulerService` обязан оставаться
выключенным в обоих одновременно активных blue/green API slot. Единственный
допустимый автономный владелец — отдельный
`leetplus-bonus-ledger-worker.timer`/oneshot service:

- runner разрешает active nginx slot на каждом tick, сверяет slot env с
  immutable release SHA и запускает CLI из этого exact release;
- worker имеет отдельный минимальный `/etc/leetplus/bonus-ledger-worker.env`,
  не загружает широкий API runtime env, не регистрирует HTTP controllers и не
  импортируется public guest runtime;
- systemd запрещает overlap одного oneshot unit; database claim generation,
  row locks и idempotency key остаются второй exactly-once границей;
- live fail-closed требует exact tenant, worker enable, `DRY_RUN=false` и
  `LANGAME_BONUS_ACCRUAL_ENABLED=true`; canary ограничен одной exact reward;
- tenant-wide scheduled pass может не задавать один `storeId`, но только внутри
  worker/control-plane path: перед каждым provider write claimed entry повторно
  проходит `TENANT_STORE_SYSTEM` identity с exact `entry.storeId`; запись без
  store остаётся заблокированной без Langame write. Corporate/manual dispatch
  без exact `storeId` по-прежнему отклоняется до claim;
- source successor не использует staff/test как eligibility или delivery gate:
  совпадение телефона сохраняется только в audit metadata, а сотрудник участвует
  и получает награду на общих условиях; исторические `CANCELED` записи не
  переигрываются автоматически;
- pre-dispatch ошибки используют bounded retry, а неоднозначный внешний POST
  остаётся `RECONCILIATION_REQUIRED` без автоматического повтора.

Тот же singleton worker является единственным частым owner автоматической
квалификации игрового прогресса. Он не включает scheduler в API и в каждом tick
для ровно одного `ACTIVE + INTERNAL` tenant: ставит не более одного due recovery
в activity queue, обрабатывает bounded sync, запускает snapshot pipeline,
worker-specific ledger fallback, supplemental pipeline и monitoring. Основной
fallback ограничен тремя exact play-time fact types; отдельный session-start
проход по умолчанию `OFF` и использует собственные mode/limit/cutoff и
exact-profile XOR allow-all scope. Canary допускает только `SHADOW/limit=1`, а
stable `LIVE` каждого прохода требует явную UTC-границу. Session-start путь
оценивает миссии и Battle Pass по их собственным условиям, а для standalone
лутбокса подавляет открытие и выбор материального приза: создаётся только
entitlement кейса. Любой другой tenant, неизвестный fact type, отсутствие
границы/scope или включённый API scheduler останавливают обработку до reward
effect. Существующие origin keys, database lease и idempotency не позволяют
повторному replay создать второй результат.

Установка unit/runner выполняется только exact production-control artifact с
отдельно закреплённым install-map digest. Само наличие файлов в `main` или
установка control generation не включает timer. Production activation требует
one-item canary, сверку Langame balance before/after и отдельный GO; rollback —
`systemctl disable --now leetplus-bonus-ledger-worker.timer` без переключения
public/corporate runtime.

#### Store-bound runtime identity control plane

Один active `backgroundExecutionEnabled` Store внутри INTERNAL tenant является
минимальной `TENANT_STORE_SYSTEM` identity для scheduled run. Это не делает
его источником всех фактов и не расширяет store scope правил: конкретные
mission/season/lootbox по-прежнему проверяются по собственным `storeIds`,
`externalDomain`, `externalClubId` и canonical fact evidence.

Текущее включение/выключение разрешено только platform admin через
`POST /admin/tenants/:tenantId/stores/:storeId/background-execution` в
corporate runtime. `ENABLE` требует exact `ACTIVE + INTERNAL` tenant, active
`gamificationEnabled` Store, expected trigger-owned revision, подтверждение
`tenant_slug:store_id:ENABLE`, причину и idempotency request ID. API связывает
audit receipt с validated `RELEASE_SHA`; клиент не передаёт SHA. `DISABLE`
разрешён и после смены stage/status как authority-reducing emergency stop.
Public guest route/module/secret set не меняются.

Production порядок и rollback:
[`store-background-execution-production-recovery.md`](../deployment/store-background-execution-production-recovery.md).

Production activation по этому runbook завершена 06.09.2026 на exact admitted
SHA `43d447a3c3bd08dcf496f783771c28130e13c82a`:

- five-phase rollout `HYDRATE -> BIND -> SMOKE -> CUTOVER -> POSTCHECK`
  завершён receipt `7695a17f8d4284056703e827f3a461404c7de13aafc6b774466b24b5e5933bb44`;
- active green и hot-rollback blue independently healthy, schema осталась
  `CURRENT_189/189`;
- для INTERNAL tenant включён ровно один Store
  `5b07123f-9db7-453c-9a03-ccd75aa1cf49`, revision `0 -> 1`, audit event
  `07b471ca-83f4-45a1-995a-d1a6ce7d4715`; повтор той же команды признан
  идемпотентным replay;
- exact факт сессии `548185` (`63` минуты) материализовал один `PLAY_HOUR`,
  один reward intent, одну reward-запись и один доступный entitlement
  `КЕЙС «КАМБЭК»`; повторный cursor-pass дошёл до того же fact, вернул
  duplicate и создал `0` events / `0` rewards;
- частый timer снова enabled/active, автоматически продолжает `PARTIAL` через
  `PENDING`/rerun и выполняет worker-only ledger fallback. API schedulers
  остаются выключены.

Первый bounded drain после активации выявил совместимый, но ошибочный второй
date probe: `1337.langame.ru` успешно отвечает на ISO-запрос пустой последней
страницей, после чего отвергает legacy `DD.MM.YYYY` с `400 Validation failed`.
Развёрнутый follow-up принимает исходный пустой ISO-ответ как authoritative только
для такого validation-отказа compatibility probe. `401/403`, timeout, network
и `5xx` не скрываются и остаются bounded retry/failure. Exact-main admission
`33997351479`/`33997351444` успешен; operation
`413f9c4b-504e-4cbe-b044-b47aa5598bb9` завершила controlled rollout exact
`94f9462e…` на active blue при healthy hot-rollback green `43d447a3…`.
Postflight exact проблемного профиля: `PRODUCT_EXPENSE SUCCESS` (`page=16`,
`rows=3000`), `TRANSACTION PARTIAL` продолжен как `PENDING` с
`nextPage=41`; глобально нет `RETRY`/`FAILED` activity jobs и unresolved
bonus-ledger записей. Один actual evaluation receipt сессии `548185` по-прежнему
соответствует ровно одному event/intent/reward/entitlement; повторный replay не
создаёт дубли.

Production activation завершена 30.08.2026 на exact admitted SHA
`4036d312b5760e9daf292e416288d68949419aaa`:

- blue/green controller принял generation 15; active upstream — blue, hot
  rollback green `d8c97649…` оставлен активным;
- dry-run увидел ровно одну canary-запись, live canary подтвердил одну операцию
  `0 -> 500`: ledger `CONFIRMED`, reward `PAID`, wallet `CLAIMED`, локальный
  Langame snapshot `500`;
- bounded recovery pass проверил 28 записей: 18 реальных начислений
  подтверждены, 10 staff/test записей отменены до provider write, ошибок и
  blocked entries не было; ещё одна своевременно claimed reward была поставлена
  в ledger этим же проходом;
- после повторного пустого прохода unresolved ledger backlog равен `0`;
  четыре wallet item со статусом `PENDING` остаются незабранными пользователями
  и поэтому корректно не попадают в delivery;
- `leetplus-bonus-ledger-worker.timer` включён, имеет состояние
  `active (waiting)` и выполняет 30-секундные проходы из exact active release;
  два последовательных автоматических tick завершились `0/0/0` без failed,
  blocked или reconciliation записей.

### Langame daily sync и discrepancy audit

Langame HTTP/manual sync остаётся corporate API path, но unattended daily sync
относится только к workers/control-plane. Два одновременно работающих API slot
не могут владеть scheduler: `LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false` и
`LANGAME_SCHEDULED_HTTP_ENABLED=false` обязательны и для API, и для dedicated
worker profile.

Единственный допустимый owner — отдельный systemd timer/oneshot. Worker
разрешает active immutable release на каждом запуске, принимает ровно один
lowercase tenant slug и падает, если tenant не обработан ровно один раз либо
хотя бы один scope `FAILED`. Explicit date разрешена только в canary. Current
containment допускает этот путь только для `INTERNAL`; `PILOT/BETA/LIVE`
сохраняют `EXTERNAL_DENY` до revision/lease-fenced successor.

Mutable discrepancy JSON не является authority и не хранится в release. Его
root и direct UUID tenant directories доступны только группе
`leetplus-api-runtime`; Web/public guest identities в группу не входят.
Root-only preflight перед API/worker стартом проверяет отсутствие symlink,
nested mount и unexpected entries, exact `2770`, а также blue→green и
green→blue create/read/delete. Repair меняет только group/mode по exact
digest-bound plan, сохраняет owner и не получает DB/network/systemd effect.
После сохранения DB facts audit-write failure становится `PARTIAL`, а не
откатом facts или ложным provider `FAILED`; наружу выходит только allowlisted
filesystem code.

`PARTIAL` с сохранённым cursor и без source error не является завершением
очереди: sync job атомарно возвращается в `PENDING` и продолжает следующую
страницу. `PARTIAL` с ошибкой источника переводится в bounded `RETRY`/backoff и
после исчерпания попыток остаётся наблюдаемым terminal failure. Помечать любой
из этих случаев `SUCCESS` запрещено: иначе exact facts сохранятся в ledger, но
не попадут в автоматическую квалификацию.

Legacy drain inventory сохраняет уже принятый autonomous bonus-ledger contour:
его service/timer классифицируются `SAFE` и не останавливаются ради Langame
rollout. Новый Langame daily service/timer остаётся `OPTIONAL_DRAIN` до canary и
явного включения, а общий audit preflight является `SAFE`. Все пять unit должны
быть одновременно перечислены в admitted manifest и закрытом verifier allowlist;
иначе rollout останавливается до runtime effect.

### Public check-in activation и canonical activity fact

Публичный check-in остаётся пользовательским request path GuestRuntime и не
получает worker/corporate полномочий. После успешной guest-JWT и store/guest
resolution, но до rule evaluation, GuestPortal обязан закрепить
`GuestGameProfile.gameActivatedAt`. Сам authenticated check-in является
наблюдаемым входом в игровой модуль; поэтому первый check-in не может быть
классифицирован как pre-activation только из-за гонки с параллельным
`APP_OPEN`.

Подтверждённый активной Langame-сессией check-in обязан создать или
идемпотентно переиспользовать exact `GuestActivityFact`:

- `factType=CHECK_IN_PERFORMED`, `confidence=EXACT`;
- source identity включает tenant, Langame domain, session, guest и локальную
  календарную дату клуба;
- один и тот же check-in в тот же локальный день не создаёт повторного факта
  или reward, но долгоживущая сессия не блокирует check-in следующего дня;
- `GuestGameEvent` ссылается на canonical fact и отдельно сохраняет
  `sessionExternalId`; evidence не содержит provider token, phone или другой
  секрет.

Историческое восстановление не расширяет эту request authority. Старые
ложно-заблокированные check-in сначала проходят bounded read-only preview по
exact profile/event/rule, затем восстанавливаются по одному idempotency key или
оформляются как явно аудируемая компенсация. Массовый replay, повторная выдача
и ретроактивное потребление события следующим ещё закрытым шагом Battle Pass
запрещены.

### Langame N−1 manifest successor и worker authorization

Исторический N−1 `activation.receipt` остаётся immutable даже при additive
расширении unit manifest. Такой переход допустим только через exact
manifest-successor controller: он связывает digest старого receipt, старого и
нового manifest, installed production-control generation, создаёт durable
fence только для двух новых `OPTIONAL_DRAIN` unit и публикует отдельный linked
receipt после live drain verification. Редактирование старого receipt,
удаление общего fence marker или ручное создание drop-in не являются
разрешённым recovery.

Verifier исторической принятой N−1 activation под `/usr/local/libexec` также
остаётся immutable и не является authority для более нового control generation.
Manifest-successor и worker authorization текущего поколения принимают только
root-owned `0400` byte из exact immutable scheduler-free control bundle. Это
сохраняет старое rollback evidence и одновременно исключает drift решения на
обновлённом systemd-контракте.

Manifest-successor не выдаёт network/provider authority. Снять точный fence
Langame service/timer для canary или live timer может только второй
worker-specific authority, связанный с active admitted release, exact INTERNAL
tenant, worker env и неизменными `LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false` /
`LANGAME_SCHEDULED_HTTP_ENABLED=false`. Canary разрешается bounded permit и
обязан вернуть legacy fence после terminal run. Live timer получает отдельный
permit только после совпавшего successful canary evidence; timer-profile
validation не выполняет второй oneshot перед `enable --now`, потому что
`Persistent=true` может сам выполнить ровно один missed daily run. USER_CALL,
public-guest и corporate identities/env в permit не входят. Generic
`OPTIONAL_DRAIN` semantics для остальных unit не меняется. Success/recovery
принимаются только при zero PID, пустом cgroup и отсутствии systemd jobs;
`enable --now` отдельно учитывает немедленный `Persistent=true` запуск. Отмена
live timer выполняется только exact revocation plan/apply/check: service/timer
quiesce, удаление узких 91 permit conditions и active pointer, возврат exact 90
fences и immutable revoke receipt. Простой ручной `disable --now` не закрывает
authority state и не является terminal rollback.

Worker wrapper не доверяет одному `INVOCATION_ID` из environment. Самым первым
shell-builtin-only действием он требует единственную cgroup-v2 запись
`0::/system.slice/leetplus-langame-daily-worker.service`, единственный PID `$$`
в kernel-owned `cgroup.procs` и exact 32-hex `INVOCATION_ID`. Direct caller и
другая systemd unit не могут присоединить себя к root-managed worker cgroup.
`/run/dbus` и `/run/systemd/private` скрыты от worker через `InaccessiblePaths`:
Ubuntu `dbus-daemon` не умеет безопасно аутентифицировать DynamicUser, поэтому
root `systemctl` остаётся только в authorization authority и не является
runtime-зависимостью worker. Positive gate выполняется прямо на одноразовом
GitHub-hosted Ubuntu runner с настоящим PID 1 systemd. Он не устанавливает
container engine, не строит образ и не меняет system D-Bus. До worker отдельный
DynamicUser canary доказывает exact singleton cgroup и недоступность обоих
manager transport; actual Node entrypoint повторно подтверждает те же свойства.
Direct/wrong-unit invocation fail-closed, а teardown требует zero
unit/PID/cgroup/timer residue. Это не production provisioning и не даёт worker
новых provider/runtime полномочий.

### Runtime repair contract 29–30.08.2026

- `USER_CALL` остаётся обычным public API request path. Advisory transaction
  lock обязан возвращать Prisma-поддерживаемый scalar (`::text AS
"lockResult"`); запрос, возвращающий PostgreSQL `void`, запрещён, потому что
  превращает корректный provider flow в HTTP 500 до создания challenge.
- Автономный reward materializer и inline reward claim имеют разные controls.
  Безопасный обычный API overlay — `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false`
  и `GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH=false`: scheduler не запускается,
  а уже заработанный кейс можно открыть вручную. `KILL_SWITCH=true` допустим
  только как аварийная остановка всех новых claim, а не как постоянный
  fail-closed default.
- Application runtime role получает `EXECUTE` ровно на десять зарегистрированных
  функций CURRENT188. В этот allowlist входят
  `assert_staff_attachment_state(text)` и
  `resolve_staff_attachment_resource_scope("StaffAttachmentResourceKind",text)`,
  необходимые вызывающим их attachment triggers. Гранты выдаются только
  `leetplus_runtime`, без `GRANT OPTION`; `PUBLIC` execute остаётся отозванным.
- Эти две исторические `SECURITY INVOKER` функции до runtime enrollment могут
  иметь только legacy-состояние без function-local `search_path`. Exact
  controller в одной транзакции закрепляет для них
  `pg_catalog, public, pg_temp` (с `pg_temp` строго последним) и только затем
  выдаёт `EXECUTE`. Любой иной pre-existing `search_path`, а также `CREATE` на
  `public` у runtime role, блокирует операцию. Для остальных 56 функций
  сохраняется точное требование `search_path=pg_catalog`.
- Runtime grant repair выполняется только versioned exact controller из
  admitted artifact. Ручной широкий `GRANT EXECUTE ON ALL FUNCTIONS` запрещён.
- Пока background materializer выключен, parked entitlement/reward rows не
  дренируются автоматически. Повтор exact пользовательского open/claim после
  снятия emergency kill switch безопасен благодаря idempotency intent/effect и
  является предпочтительным recovery для отдельного доступного кейса.

Production runtime repair rollout завершён 30.08.2026 на exact admitted SHA
`ca3f332f…`. Следующий UI/state rollout выполнен на exact admitted SHA
`6ec3a5f1…` без изменения схемы и security-контуров:

- active nginx upstream — blue, rollback green `ca3f332f…` оставлен активным;
- canonical API overlay подтверждён как materializer scheduler `false`,
  emergency kill switch `false`, USER_CALL `true/SMS_RU_CALLCHECK`;
- exact enrollment закрепил `search_path=pg_catalog, public, pg_temp` и
  `EXECUTE` для `leetplus_runtime` только у двух attachment helpers; `PUBLIC`
  execute остался `false`;
- production postflight: public API/Web ready, runtime advisory-lock cast
  исполняется, отрицательный USER_CALL status path возвращает контролируемый
  `400`, после cutover нет `P2010`/PostgreSQL `void` deserialize errors;
- staff QA через штатные login + signed tenant context прошёл upload/download
  одного 34-byte attachment (`200/200`);
- entitlement гостя `***6035` для `КЕЙС «УТРО»` остался `AVAILABLE`,
  `<unconsumed>`, wallet `PENDING`; QA намеренно не открывал кейс от имени
  пользователя.
- guest Battle Pass больше не использует onboarding fallback как реальный
  сезон: API сохраняет tenant/status/period/store scope, а Web рендерит блок
  только для активного сезона с уровнями;
- onboarding-шаг «Активность в клубе» закрывается только подтверждённым
  `CHECK_IN`; произвольная сессия или другое game event не засчитываются;
- редактор сохраняет смену club scope с безопасным remap category по
  единственному semantic name, выводит backend-ошибку у действия сохранения и
  показывает способ выдачи наград в сохранённой карточке.

## Техническая поддержка игрового модуля

Support-функциональность следует тем же трём границам и не образует четвёртый
смешанный контур:

- public guest отправляет обращение только через
  `/guest-portal/session/support/bug-reports`; identity — guest JWT и exact
  `GuestGameProfile`, rate/idempotency scoped по tenant + profile;
- tenant user работает только с `/support/bug-reports*` после corporate JWT,
  support capability и `FreshNetworkScopeGuard`;
- platform-wide `/admin/support-tickets*` требует `PlatformAdminGuard`;
- ФИО и телефон в карточке обращения являются read-time projection из
  канонических зашифрованных `Guest`/`GuestGameProfile`: расшифровка разрешена
  только после tenant/platform guard в corporate process, Prisma ciphertext и
  nested identity удаляются до HTTP-сериализации, а public guest route этих
  полей не получает;
- tenant support видит identity только внутри exact tenant, platform support —
  только через `PlatformAdminGuard`; открытые значения не копируются в
  support-owned таблицы, audit metadata или вложения, а private BFF остаётся
  `no-store`;
- guest process пишет только support-owned tables и не импортирует corporate
  auth, staff tasks, notifications или outbound transports;
- вложение ограничено одним JPG/PNG/WebP до 5 MiB, проверяется по bytes,
  очищается от metadata и выдаётся только как private attachment;
- runtime flag `GUEST_BUG_REPORTING_MODE=OFF|LIVE` fail-closed и по умолчанию
  равен `OFF`.
- schema bridge содержит только именованные exact-пары:
  `ALLOW_CURRENT_187` для `187 -> 188`, `ALLOW_CURRENT_188` для `188 -> 189`,
  `ALLOW_CURRENT_189` для `189 -> 190` и `ALLOW_CURRENT_190` для `190 -> 191`.
  Каждая разрешена только `COMBINED` runtime при
  `GUEST_BUG_REPORTING_MODE=OFF`; любой другой head/count, target release,
  unfinished migration, split runtime или `LIVE` блокирует startup/readiness.
  Это переходные deployment-контракты, а не общий N/N+1-допуск и не разрешение
  читать ещё отсутствующие таблицы/колонки. Они не разрешают ручную запись
  `/etc/leetplus/slots/*.env`: для CURRENT191 единственный writer — установленный
  orchestrator с именованными bridge/final profiles, exact plan и phase receipts;
- фактическая production schema имеет историческую mixed-owner topology.
  Единственный допустимый переход — same-SHA signed legacy controller с
  пообъектным OID/owner/ACL digest, migration от локальной postgres identity,
  неизменностью всех исторических owners и минимальным ACL только новых
  support-объектов. Универсальная owner normalization запрещена.
- до database effect active и rollback slot образуют только explicit
  `DUAL_BRIDGE_N_MINUS_ONE`: каждый обязан быть independently admitted
  target-188 artifact с release provenance, hydration/slot-link receipt,
  exact target migration checksum, API/Web invocation, authenticated DB-bound
  smoke и reporting OFF. Старый
  CURRENT_187 artifact не является rollback authority. Active slot и
  production-control generation обязаны принадлежать одному exact SHA;
  подписанный plan закрепляет доказательства обоих slot;
- production-control `install.lock` и blue/green cutover lock удерживаются одним
  authority window от финальной dual-slot сверки до post-effect проверки;
  замена control generation или runtime bytes во время DDL запрещена;
- под тем же root-owned cutover lock непосредственно перед DDL оба slot снова
  подтверждают actual database CURRENT_187 и единственную compatibility
  `187 -> 188`; сразу после DDL оба обязаны подтвердить exact CURRENT_188 без
  active compatibility evidence. До этого reporting LIVE запрещён.

Bug-report schema rollout CURRENT188 завершён 29.08.2026, runtime repair, последующий
Battle Pass/store-scope repair и autonomous bonus-ledger rollout — 30.08.2026.
После checklist review rollout 31.08.2026 active green `a130c13e…` работал на
exact CURRENT188 с bridge `OFF` и reporting `LIVE`; hot rollback blue
`4036d312…` оставался exact CURRENT188 и активным. Это исторический baseline,
заменённый CURRENT189 rollout 01.09.2026, описанным в начале документа.

### Checklist review status-only rollout 31.08.2026

Два старых checklist run сотрудника оставались `ON_REVIEW`, потому что review
клиент повторно отправлял весь snapshot `answers` с legacy абсолютными URL
вложений. Строгая attachment boundary корректно отвергала такие ссылки как
`Invalid attachment references`, но review-решение не должно повторно менять
ответы или attachment bindings.

Exact runtime `a130c13e8d694b605d86a924b1524a6174ae1b51` разделяет эти контракты:

- `ACCEPTED`, `RETURNED`, `ESCALATED` и `CANCELED` являются status-only
  переходами и не записывают `answers`, score/evidence metrics или attachment
  bindings даже для stale клиента;
- редактирование и отправка ответов сохраняют прежнюю строгую signature,
  quarantine, tenant/resource-scope и reference validation;
- historical absolute URLs не мигрировались, `QUARANTINED` файлы не
  разблокировались, два run не принимались от имени менеджера автоматически;
- Fast CI `33330505183` и Full Release Admission `33330505182` успешны;
  immutable handoff переключил production на generation 16, active green;
  public API/Web, exact schema `188`, authenticated catalog smoke и четыре
  последующих bonus-ledger tick прошли без ошибок и с пустой очередью.
  Это не меняет split-runtime решение: production по-прежнему
  `COMBINED`, а три логических security-контура сохраняются guards/module
  boundaries.

Подробный контракт и rollout:
[`docs/support/guest-bug-reporting.md`](../support/guest-bug-reporting.md).

## Инварианты публичного игрового входа

1. Нет общего application-wide лимита одновременно авторизующихся гостей.
   Anti-abuse лимит может быть scoped по exact phone/store/tenant/channel, но
   не превращается в глобальный mutex, cleanup или corporate throttle.
2. `USER_CALL` reservation и advisory lock ограничены exact
   `tenant + store + phoneHash + channel`. Создание/переиспользование профиля
   сериализуется только по текущему challenge.
3. Provider call выполняется вне database transaction и имеет bounded timeout.
   Повторный status poll одного challenge объединяется DB lease; разные
   challenge исполняются независимо.
4. Cleanup не делает глобальный `updateMany` по challenge других пользователей.
   Повторное подтверждение не создаёт второй profile, consent или referral.
5. Public guest request не требует corporate cookie/JWT, staff role,
   `FreshStoreScope` или `FreshNetworkScope`. Ошибка корпоративного входа не
   должна блокировать `/guest-portal*`.
6. Public registration создаёт/использует `GuestGameProfile`, а не общий
   `Guest`. Связь с сохранённым Langame guest появляется только после
   подтверждённого `phoneHash` и безопасной сверки.
7. Raw phone, provider token/API id, raw Telegram update/chat id и Langame
   payload не возвращаются в браузер и не попадают в readiness/audit.

### Telegram polling egress и liveness

1. Production использует long polling и ровно один `telegram-poller` на bot
   token. Webhook URL остается пустым; ручной `getUpdates`, второй consumer и
   `drop_pending_updates=true` запрещены.
2. Poller имеет process-scoped egress и не использует router fake-IP через
   transparent `TG_PROXY`. Exact route на 1337:
   `172.25.0.10 -> HTTP CONNECT 172.25.0.1:18118 -> Privoxy
forward-socks5t 127.0.0.1:9050 -> Tor remote DNS -> api.telegram.org`.
3. Privoxy слушает только gateway private Docker network, не имеет published,
   LAN или public listener и ACL-разрешает только exact poller IP. Штатный
   default `privoxy.service` выключен; работает hardened
   `1337-telegram-http-proxy.service`.
4. `GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL` задается только poller service и
   имеет `http(s)` scheme. Подстановка `socks5h://` в текущий Undici adapter
   является startup error, а hard-coded Telegram IP/fake-IP allowlist не
   допускаются.
5. Poller пишет отдельный atomic heartbeat после каждого успешного poll tick,
   включая пустой ответ. Heartbeat содержит только timestamps, monotonic
   offset, failure count и allowlisted error category/code; raw update, chat,
   contact, URL с token и response body туда не попадают.
6. `Up`/наличие env не является readiness. Docker health и operational alert
   fail-closed при stale successful heartbeat; проверка health сама не вызывает
   `getUpdates`.
7. Перед update state сохраняется и хешируется после остановки единственного
   poller. Rollback может вернуть config/image, но никогда не перезаписывает
   более новый offset старым snapshot.
8. Production GO требует non-consuming `getMe`/`getWebhookInfo`, пустой webhook,
   ровно один process, свежий heartbeat, monotonic state, Telegram canary и
   отрицательную public/corporate/worker matrix.

## Инварианты корпоративного входа

Маршрут после login — часть безопасного UX, но не замена authorization:

| Effective role/context                                  | Поддерживаемый landing                  |
| ------------------------------------------------------- | --------------------------------------- |
| `OWNER`, `ADMIN`, `MANAGER`, `CLUB_MANAGER`             | `/dashboard`                            |
| `BUYER`                                                 | `/assortment/dashboard`                 |
| `MARKETER`                                              | `/marketing`                            |
| `STANDARDS_MANAGER`                                     | `/staff`                                |
| `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR`, `TRAINEE` | `/staff/shift-workspace`                |
| Platform admin без подписанного tenant-контекста        | `/administration`                       |
| Platform admin с подписанным tenant-контекстом          | landing effective tenant role (`OWNER`) |

- Stale `returnTo=/dashboard` не отменяет специализированный landing.
- Прямой `/dashboard` проверяет landing до запросов `stores` и
  `dashboard/summary`.
- Нельзя чинить неверный redirect расширением capability, tenant scope или
  cross-tenant доступа.
- Сохранённая platform-admin сессия не является tenant-контекстом. Tenant
  выбирается явно и подписывается.

### Initial OWNER: почта или прямая ссылка

- Выбор выполняет только свежепроверенный Platform Admin через
  `/admin/tenants/:tenantId/initial-owner-invite/publish-link`; ссылка в Web
  проходит через private/no-store BFF на `/administration`.
- `EMAIL` остаётся безопасным режимом по умолчанию и требует verified `SENT`.
  `LINK` допускается только как атомарный переход активного initial
  `OWNER/NETWORK`: outbox отменяется до provider attempt с причиной
  `OWNER_INVITE_LINK_ONLY`, ciphertext очищается, а URL возвращается ровно
  один раз.
- Registration URL является bearer-секретом. Его запрещено сохранять в БД,
  audit, application/proxy logs, cookie или browser storage. Audit содержит
  только PII-free факт перехода и digest команды.
- `LINK` не имитирует отправленное письмо и не ослабляет tenant/scope. Database
  guard принимает либо точное `EMAIL/SENT` evidence, либо точное
  `LINK/CANCELED/OWNER_INVITE_LINK_ONLY` evidence; все смешанные состояния
  fail-closed.
- Повторная выдача секрета запрещена. Новый URL требует revoke/reissue, после
  чего новый invite снова начинает в `EMAIL`.
- Режимы `EMAIL/LINK` deployed в CURRENT190 exact `def5174f…`; использованный
  `CURRENT_189 → CURRENT_190` rollout bridge выключен после postcheck. Любое
  следующее schema изменение снова требует exact-SHA admission,
  restored-copy проверки и controlled rollout.

### Делегирование учётных записей сотрудникам

- `/users/invites*` принадлежит corporate tenant contour и всегда требует
  corporate JWT, exact tenant identity и свежий store scope.
- Матрица системных ролей является отдельной authority boundary. Для
  `STANDARDS_MANAGER` canonical роли `SENIOR_ADMINISTRATOR` и
  `CLUB_ADMINISTRATOR` разрешены как прямой рабочий процесс подбора
  администраторов, даже если штатная роль получателя содержит capability,
  которой нет у самого менеджера по стандартам.
- Это исключение действует только для неизменённого canonical system role.
  Tenant role override и custom role по-прежнему должны целиком помещаться в
  capability envelope инициатора.
- `STORES` scope приглашения обязан быть непустым подмножеством свежего scope
  инициатора. Делегирование `NETWORK`, чужого клуба, `OWNER`, platform role или
  более широкой системной роли этим правилом не разрешается.
- Source repair 31.08.2026 не меняет capabilities самого
  `STANDARDS_MANAGER`, public guest contour, worker identities или схему БД и
  не считается deployed до exact-SHA admission и отдельного rollout.

## Game administration и background jobs

- `CorporateGuestGamificationModule` сохраняет tenant-authenticated
  `/guests/gamification*`, media management и controlled game jobs в corporate
  process, но не регистрирует public guest media controller.
- `GuestRuntimeModule` регистрирует только public guest portal/media и
  health/version. Он не импортирует `AuthModule`, `StaffModule`, broad
  `IntegrationsModule`, `GuestPortalModule` или полный
  `GuestGamificationModule`.
- Нужный guest bonus signal в public process — explicit no-op. Public request
  не должен запускать автономный ledger/sync/materializer scheduler.
- Worker endpoints остаются за service token, tenant execution admission,
  rollout flags, bounded batch/lease и отдельной observability.

## Langame и outbound network boundary

1. Web runtime остаётся localhost-only.
2. API/worker может требовать reviewed TCP/DNS egress к Langame, Telegram,
   SMTP, SMS.ru и другим явно принятым providers. Telegram hostname должен
   сохраняться до SOCKS remote DNS; fake-IP нельзя передавать в Tor как raw
   destination. Копирование Web sandbox на API 27.08.2026 остановило
   Langame/check-in и не должно повторяться.
3. Каждый dedicated runtime получает только свой dependency allowlist; egress
   не означает доступ ко всем secret sets.
4. Для shared Langame domain fact без `club_id` допустима domain routing только
   когда правило охватывает все активные клубы этого domain. Partial store
   scope остаётся fail-closed.
5. Provider timeout/retry/idempotency оцениваются отдельно от database lock и
   HTTP concurrency.

## Split-runtime successor в source

На merge SHA `88719342...` реализованы:

- роли `COMBINED | CORPORATE | GUEST` и exact entrypoint assertion;
- fail-closed HTTP perimeter до body parser;
- взаимоисключающие production secret allowlists;
- разные service identities и health/version;
- dedicated PostgreSQL roles `leetplus_api_corporate` и
  `leetplus_api_guest`, verified TLS и bounded Prisma pools;
- отдельные dormant systemd UID/slices, blue/green ports и nginx upstreams без
  fallback между guest и corporate;
- CI boundary tests для module graph, HTTP, env, database URL и deployment
  candidate.

`COMBINED` сохранён только как совместимый текущий entrypoint до controlled
cutover. Он не является целевой долгосрочной изоляцией.

Полный deployment candidate:
[`docs/deployment/guest-runtime-pool-candidate/README.md`](../deployment/guest-runtime-pool-candidate/README.md).

## Что произошло 27–28.08.2026

| Изменение                                             | Зафиксированный урок                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #53/#54/#55/#61 — systemd 255 и production-control | Проверять effective runtime semantics, stale PID/cgroup и serializer формы; verifier обязан остановиться до nginx mutation, но не отвергать безопасную canonical форму ОС.                                                                                             |
| PR #56/#57 — guided OWNER onboarding                  | Invite-bound owner сам задаёт пароль и получает явные шаги замены временных названий/часового пояса/API credentials; это не меняет employee/platform-admin landing.                                                                                                    |
| PR #59 — восстановление API egress                    | Web localhost policy нельзя переносить на API: Langame/check-in требуют reviewed outbound.                                                                                                                                                                             |
| PR #60 — shared Langame domain routing                | Отсутствующий `club_id` не повод расширять store scope; domain fallback допустим только для правила на все клубы domain.                                                                                                                                               |
| PR #63/#64 — role-aware landing                       | Строгий API scope должен сочетаться с поддерживаемым landing; неверный redirect не чинится расширением прав.                                                                                                                                                           |
| PR #65 — logical guest auth isolation                 | Locks, cleanup, provider timeout и poll dedupe должны быть challenge-scoped; корпоративный auth contour не ограничивает public guest concurrency.                                                                                                                      |
| PR #66 — process/module/runtime isolation             | Public guest, B2B game administration и workers требуют разных module graphs, secret sets, pools и resource identities.                                                                                                                                                |
| PR #67 — current-context fixation                     | Source/admission и фактический production state фиксируются раздельно; green admission не является автоматическим deploy.                                                                                                                                              |
| USER_CALL production handoff                          | Пользовательский Callcheck допускается только через exact API activation profile; ручной old-SHA sidecar должен быть выведен до schema migration.                                                                                                                      |
| Blue/green post-auth watchdog                         | Stateful authenticated smoke выполняется после трёх последовательных public readiness samples; bounded probe children не наследуют cutover lock, поэтому ни ingress cooldown, ни переживший deadline descendant не обнуляют/блокируют доказанную runtime-стабильность. |

## Проверка перед изменением пересекающей области

1. Назвать субъект: public guest, tenant user, platform admin или worker.
2. Назвать exact route prefix и runtime owner из таблицы выше.
3. Проверить, не импортируется ли широкий module/guard/secret другого контура.
4. Проверить landing всех затронутых ролей до первого restricted API fetch.
5. Для lock/rate limit/cleanup указать exact scope key и доказать параллельность
   двух разных guest challenges.
6. Для provider/integration указать timeout, idempotency и нужный egress без
   удержания DB transaction.
7. Проверить both-way negative boundary: guest runtime отвергает B2B route,
   corporate runtime отвергает public guest route до body parsing.
8. Отдельно зафиксировать source state и фактический production state; не
   переносить слово `deployed` из CI/merge evidence.
9. Если boundary меняется, обновить этот документ, open-beta status и
   deployment runbook в том же PR.

## Оставшиеся production gates для split runtime

1. Создать и rehearsal-проверить разные DB roles/ACL и общий connection budget.
2. Включить обе API units/env/nginx bytes в production-control install map,
   digest attestation, preflight, watchdog, recovery receipt и atomic rollback.
3. На одном admitted SHA проверить loopback health/version и обе отрицательные
   route matrix.
4. Провести параллельный canary сотен guest sessions вместе с `/auth/me` и
   критическими B2B reads; отдельно проверить provider timeout и pool
   exhaustion.
5. Проверить независимый отказ каждого process и rollback на `COMBINED` N-1.
6. Получить отдельный явный production GO. До этого не устанавливать units, не
   менять nginx/DB ACL и не считать split runtime активным.
