# Спецификация: приоритеты сети

## 1. Задача и результат

Руководитель видит подтверждённое снижение среднего товарного чека и дохода на визит как разные сигналы, текущие незакрытые обязательства персонала и важные риски ассортимента. Из каждого сигнала можно перейти к его основаниям или к соответствующим объектам. Утверждённые пять KPI-карточек, интерактивный график и компактная таблица клубов сохраняются.

Видимый список остаётся компактным: сначала до трёх наиболее срочных подтверждённых сигналов, затем кнопка раскрытия остальных. Счётчик относится ко всему доступному списку. Источники, которые не удалось проверить, не считаются источниками с нулём проблем.

## 2. Истории и приёмка

| Метка | История руководителя | Приёмка |
|---|---|---|
| R01 | Я вижу снижение среднего товарного чека и могу его разобрать | Отдельный signal при полностью сопоставимых current/previous receipt metrics и отрицательной дельте; current/previous суммы, проценты и число чеков объяснимы |
| R01.1 | Я понимаю отсутствие точного чека | Отсутствующий receipt ID, неполное покрытие и неоднозначный ID не превращаются в полный чек или ноль; видны причины |
| R01.2 | Я доверяю детализации | Period/club/day используют одни admitted receipt groups; детали сохраняют период, клубы, comparison/asOf; average не является средним дневных средних |
| R02 | Я отдельно вижу снижение дохода на визит | Правило читает только revenuePerVisit с AVAILABLE, известными значениями и валидным отрицательным comparison; не подменяет его средним чеком |
| R02.1 | Я понимаю источник ограничения | Пока текущий API не подтверждает услуги и полноту визитов, ARPV остаётся MISSING, его причина показана среди источников; никакого fabricated override |
| R03 | Я вижу просроченные незакрытые задачи персонала | dueAt < evaluatedAt, статусы кроме DONE/CANCELED; старые открытые задачи вне финансового периода не теряются; count не взят из capped rows |
| R04 | Я вижу чек-листы, не выполненные вовремя | Канонический existing OVERDUE filter: OPEN/IN_PROGRESS/RETURNED/ESCALATED и scheduledAt < evaluatedAt; ACCEPTED/CANCELED исключены |
| A01 → R04 | Я отличаю исполнение от проверки | ON_REVIEW показан отдельно как очередь проверки, когда назначенное время уже прошло; это не обвинение сотрудника в просрочке и не новый SLA проверки |
| R05 | Я вижу непройденное обязательное обучение | Только ACTIVE, required, подходящие role/store назначения; COMPLETED/WAIVED исключены; optional library не создаёт приоритет |
| A02 → R05 | Я вижу неподтверждённые обязательные материалы | Отдельный сигнал по matching PUBLISHED regulations, если нет acknowledgement текущей версии для сотрудника; менеджеру не предлагают подтвердить за сотрудника |
| R05.2 | Я понимаю предел полноты | Caps пользователей/курсов/assessments/results отмечены PARTIAL; положительный count — нижняя граница, без положительных доказательств partial не даёт уверенного нуля |
| R06 | Я открываю именно подходящих сотрудников/задачи/чек-листы | Новый read-only список priority items использует тот же kind/scope/where; ссылки на taskId/runId/userId только где destination их реально поддерживает |
| R06.1 | Я сохраняю контекст | Store selection сохраняется в summary/details; финансовый период сохраняется в возврате. Staff показывает текущее evaluatedAt, а не выдаёт живую очередь за историческую |
| R06.2 | Я не вижу недоступные сведения | NETWORK guard и feature permissions не ослабляются; foreign/stale scope deny; source без прав даёт unavailable без counts/PII/ссылки на чужой профиль |
| R06.3 | Сбой одного источника не мешает остальным | Staff loading/failure не блокирует основные KPI/график и уже подтверждённые business priorities; поздний ответ прежнего scope не смешивается с новым |
| R07 | Я получаю обзор всех разделов | Матрица покрывает ассортимент, гости/CRM, коммуникации, персонал, геймификацию, поддержку, маркетинг, управление/интеграции и platform admin |
| R08 | Я не пропускаю доступные важные риски | Обнаруженные важные кандидаты и ограничения отражены в аудите, без ложной срочности |
| A03 → R08 | Я вижу приближающийся дефицит | Canonical lowStock подключён как отдельный проверенный сигнал |
| A04 → R08 | Я вижу товары без продаж | Canonical noSales[21] подключён как отдельный проверенный сигнал |
| R08.1 | Я могу увидеть все подтверждённые сигналы | При >3 signal kinds все доступны по раскрытию; стабильные id, отсутствие дублей и понятный порядок |

## 3. Средний товарный чек и финансовые правила

Добавляется averageProductCheck в executive metric contract и существующую metric details page. Шестая KPI-карточка не добавляется. Верхние пять показателей и выбор графика остаются прежними.

Используется только receipt-v1 identity из sourcePayloadHash. Sale operation ID, externalSaleId и количество товарных строк не являются receipt ID. Существующий grain: provider + domain + store + receipt identity. Receipt revenue суммируется по неотменённым операциям; mean = сумма admitted receipt revenue / количество admitted distinct receipts. Себестоимость не требуется и не влияет на этот показатель.

Нужны две независимые полноты: обычное STORE_DAYS coverage и receiptEvidence (covered/total operations, covered/total revenue, percent для каждого и ambiguousIdentityCount). AVAILABLE допускается только при полном подтверждении store-days, полном receipt evidence и отсутствии неоднозначности. При подтверждённых группах и неполных данных возможен явно PARTIAL результат, comparison:null. Если нет пригодного знаменателя — value:null с конкретной причиной; известное отсутствие продаж не становится средним чеком0. Настоящие бесплатные чеки с положительным count могут иметь mean0.

Receipt ID не гарантированно уникален между fiscal dates. Нельзя молча добавить дату в key. Совпадение identity на разных датах должно давать ambiguity и подавлять точное сравнение. Admission window фиксируется независимо от включения comparison; переключение comparison не меняет current value/coverage. Простой допустимый вариант — current+previous одинаковой длины как постоянное bounded validation window. Одни admitted groups используются для period, club и day. Правила grouping/ambiguity следует вынести в общий pure helper и переиспользовать существующий receipt путь для одинаковой population; нельзя поддерживать два противоречивых определения среднего чека. Если у legacy другая population, нужен явный адаптер и документированное отличие, без тяжёлого вызова legacy dashboard из executive.

Сравнение averageProductCheck допускается только при полностью подтверждённых current и previous для одного набора клубов/равной длины периода. Частичные receipt counts не сравниваются через общий gate абсолютных coverage counts. Нулевая база не создаёт Infinity/процент по догадке. Для любого decline rule scope.comparison должен быть включён, значения и дельта конечны, absoluteDelta < 0. Отдельный произвольный порог снижения не вводится: пользователь попросил разбираться при снижении.

ARPV использует существующий metric contract. Текущий источник не доказывает полный numerator услуг и denominator визитов; новая задача не разрешает угадать их из движения баланса. Код правила строится, ограничение доступности остаётся явным и будет отражено в итоговом отчёте.

## 4. Текущие обязательства персонала

Новые узкие GET summary/items размещаются внутри существующего staff operations-dashboard contour. Сохраняются JwtAuthGuard, RolesGuard, FreshNetworkScopeGuard и view_staff_control. Дополнительно каждый source проверяет view_staff_tasks, view_staff_standards или view_staff_training; чужие training profiles требуют manage_staff_training. Передача чужого userId при отсутствии management не может незаметно вернуться к self и выглядеть как ответ о другом сотруднике. Факты недоступного source не читаются и не возвращаются.

Query поддерживает проверенный массив storeIds через FreshStoreScopeService. Он сужает NETWORK доступ, не даёт STORES субъекту обойти существующий NETWORK guard. Foreign ids, неверные kind/cursor/page size отклоняются. Для dashboard with zero accepted stores нет fallback на всю сеть.

Scope включает точные storeIds и includesNetworkAssignments. Общие записи с storeId:null и сотрудники NETWORK без явной привязки допустимы только при доказанном полном выборе активной сети; при subset они не приписываются выбранным клубам. Inactive stores не добавляются без явного принятого выбора. Response/сигналы подписывают общесетевые обязательства отдельно. Scope нормализуется сервером, не доверяет client flag.

Tasks/checklists summary counts — отдельные count/groupBy без cap5000. Items используют тот же where и paging (default20, максимум100, стабильный keyset/cursor, hasMore). Summary и details фиксируют серверный evaluatedAt; финансовые dateFrom/dateTo/asOf не ограничивают текущий backlog. Детали явно перечитываются на момент открытия и могут измениться после закрытия задачи.

Для обучения переиспользуются действующие assignment/readiness rules, а не копируется логика required/role/store match. Нужны scope evidence target user (включая persisted accessScope), course/regulation store и явная coverage/truncation metadata. Сетевой сотрудник без store bindings не считается сотрудником каждого выбранного клуба. Employee с несколькими клубами/одним курсом считается один раз; назначения другого невыбранного клуба не попадают в срез. Обязательные общие материалы учитываются по подтверждённым сотрудникам выборки. Caps300 users,400 courses/assessments,1000 results нельзя выдать за полную сеть. Допустим ограниченный PARTIAL lower-bound с видимой причиной; точный0 только при доказанной полноте.

Readiness regs: только PUBLISHED role/store matching, current-version acknowledgement (user, regulation, version). Knowledge-base чтение не эквивалентно этому факту и сейчас в readiness не участвует. Assessment readiness отражается в аудите как отдельный кандидат; не называется непрочитанным материалом.

Никаких ensure/create/upsert, auto-assign, notifications, submit/review, provider probe, sync или materialization на этих GET. Существующие report routes/status computations не меняются глобально ради нового счётчика.

## 5. Список приоритетов и пользовательский путь

Каждый signal: стабильный id/kind, domain, заголовок действия, краткое основание, количество/дельта с единицей, severity, scope label, availability и поддерживаемый target. Пользователь не видит сырые enum/SQL/trace.

Сохраняются OOS, подтверждённое снижение visits и предупреждение полноты выручки. Добавляются два разных финансовых decline, staff overdue tasks/checklists, review queue, incomplete required courses, unacknowledged mandatory regulations, lowStock и noSales21. Положительные assortment alerts требуют wrapper и конкретную метрику AVAILABLE/PARTIAL; stale/failed/missing не создают рекомендации закупки. Partial положительный count подписан как подтверждённая часть. Денежные потери не выдумываются и не участвуют в ранжировании без доказанного расчёта.

Порядок: сначала просроченные обязательства и фактическое отсутствие товара, затем подтверждённые финансовые снижения, далее предупреждения подготовки/проверки/низкого запаса/залежавшегося товара, в конце data-quality. Внутри категории порядок детерминированный; оценки денег и SLA не изобретаются. По умолчанию3 строки, раскрытие остальных, total count по всем доступным сигналам. Не превращать каждую необязательную запись библиотеки или обычную новую заявку поддержки в срочную задачу.

Sources имеют отдельную свёрнутую область с текущими loading/ready/partial/unavailable/failed и причинами. Пока source не прочитан, не пишем «проблем нет». Financial reasons и staff ограничения не скрываются полностью за hover. Staff область подписана «на текущий момент» и evaluatedAt; основной финансовый период остаётся выбранным пользователем.

Staff источник загружается независимо от primary dashboard через серверную async/Suspense границу или эквивалентный действующий безопасный transport. Основные KPI и base priorities доступны при медленном/упавшем staff source. Готовый priority list получает согласованный scope; при смене фильтров не смешиваются поколения. Не добавлять клиентские прямые обращения к production API/новую auth схему.

Staff priority details: отдельная read-only страница текущих matching items с paging и датой перечитывания. В URL сохраняются kind и selected stores; финансовый контекст отдельно сохранён для возврата, но не применяется как staff deadline cutoff. Task/run links используют поддержанные taskId/runId anchors. Training link userId только при разрешённом management. Для regs нет обещания подтвердить за сотрудника: новый detail показывает точную employee+material/version пару и допустимый переход в раздел; никаких acknowledgement POST.

## 6. Аудит остальных разделов

Результат аудита сохраняется отдельной матрицей source availability/permissions/drill-down. Реализуем сейчас ещё lowStock/noSales21 и required regulations в персонале: они опираются на уже существующие доказуемые факты и нужны для R08.

CRM overdue — следующий кандидат: нет надёжного storeId; network count недопустим под A+B subset. Marketing campaign может ссылаться на ту же CRM task, нельзя дублировать её как независимый alert. Support NEW/IN_PROGRESS не имеют severity/deadline/SLA, поэтому не объявляются срочными. Snapshot getStatus — безопасный read candidate для stale/failed, но отдельные manage_integrations/NETWORK и область source должны быть спроектированы до включения. Gamification terminal failure/reconciliation — возможный read-only кандидат, без retry/replay и смешения worker/guest/corporate. Platform admin не объединяется с tenant dashboard. Unread chats/notifications не считаются критическими без принятого агрегата/смысла. Эти пункты являются результатом запрошенного аудита, не обещанием реализованных alerts.

Дополнения A01–A04 (очередь проверки, обязательные регламенты, lowStock, noSales21) явно привязаны к R04/R05/R08. Они не заменяют исходные требования; в итоговом отчёте будут перечислены как дополнительные возможности. Их число4 меньше8 прямых требований. Работы только по A не предшествуют работам по R.

## 7. Границы и тестовые швы

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| Receipt projection | canonical identity/grouping, coverage и admission current/previous | averageProductCheck ExecutiveMetric + receiptEvidence в existing executive-summary и details | чтение фактов, ambiguity, группировки и denominator |
| Staff priority reader | current scoped obligations, source capabilities, counts/paging | GET staff/operations-dashboard/priorities и GET staff/operations-dashboard/priorities/items | Prisma, assignment/readiness reuse, nullable/network membership и лимиты |
| Priority presentation | eligibility, стабильный порядок, top3/all, качество sources и targets | сборку карточек и read-only priority details | formatting и UI navigation state; не считает финансовые коэффициенты |
| Audit/docs | полный охват разделов и admission границы | проверенную матрицу и source-only handoff | не превращает рекомендации в выполненный код |

API query/DTO shapes фиксируются в interfaces до параллельных авторов. Test seams: existing public DashboardService summary, новый staff reader/HTTP boundary, реальные пользовательские действия в Next. Не проверять приватную форму Prisma вместо наблюдаемого результата.

## 8. Проверки

Receipt: несколько строк одного чека; разные чеки одного SKU; provider/domain/store collision; ambiguity across fiscal dates; две независимые coverage; current600 vs previous750 даёт-150/-20%; mean не среднее средних; empty sales != mean0; настоящие free receipts mean0; отсутствие receipt-v1; сравнение off не меняетcurrent; все decline подавлены при partial/missing.

Staff: due past/future, DONE/CANCELED, returned/escalated/accepted, ON_REVIEW отдельная очередь, обязательное vs optional/waived/inactive обучение, current-version regs, current backlog вне финансовой недели, exact count > returned page size, caps metadata, no false0, count/items parity, foreign/stale/non-NETWORK/custom permissions, target employee scope без ложного self fallback, NETWORK-unbound под subset, read-only no writes.

UI: оба decline отдельно; staff и business вместе; top3/all без потери; loading/failure/denied без фиктивного0; selected stores and Back; actual item navigation; missing/partial/known-zero; keyboard,390/944/1440 и две темы. Тестовые данные отделены от production. Required local suites и CI имеют отдельные logs/exits; unchanged full API/PG не повторять без причины.

## 9. Вне рамок и открытые ограничения

Нет отменённых пользовательских требований. R07/R08 требуют аудита, а не автоматического внедрения каждого обнаруженного кандидата: ограничения остальных разделов отражаются в матрице и итоговом отчёте. Подключение новых финансовых источников для ARPV, provider calls/backfill, изменение прав, миграции/schema, автоуведомления/назначения и production rollout не входят в запрос. R02 имеет доказанное ограничение источника; его нельзя объявить реально вычисляемым только по UI fixture.

Source-работа ведётся в координации с задачей «Спланировать открытый тест»: сообщать точный source SHA и файловую область, сохранять согласованное окно, объединять canonical docs секционно и передать проверенный итоговый кандидат. Координационное сообщение не является production GO.

Network/controller fix имеет отдельного effect owner в задаче Тикеты. Конкурирующих server writes нет. Будущий app release требует свежего фактического control baseline, exact SHA и отдельного GO; прежний399876 не является текущей authority по предположению.

## Покрытие

R01 → §2,3,7,8. R02 → §2,3,5,8,9. R03 → §2,4,5,8. R04 → §2,4,5,8. R05 → §2,4,5,8. R06 → §2,4,5,7,8. R07 → §6. R08 → §5,6,8.
