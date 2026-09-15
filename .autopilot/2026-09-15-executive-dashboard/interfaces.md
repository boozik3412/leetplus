# Интерфейсы и правила v2

План обновлён по новым навыкам. Реализация возобновлена 15.09.2026 по указанию пользователя. Этот файл заменяет прежнюю схему чисто серверного первого шага.

## Обязательные навыки по зонам

- Все авторы метрик: C:/Users/ALIENWARE/.codex/skills/leetplus-dashboard-ux/SKILL.md и references/metric-contracts.md.
- UI/пояснения: C:/Users/ALIENWARE/.codex/skills/leetplus-ux-writing/SKILL.md и references/copy-and-states.md.
- Компоненты/тема: C:/Users/ALIENWARE/.codex/skills/leetplus-design-system/SKILL.md и references/theme-and-components.md.
- Приёмка: C:/Users/ALIENWARE/.codex/skills/leetplus-ui-quality/SKILL.md и references/acceptance-matrix.md.

Предметные contracts находятся в spec.md, UI_CONTRACTS.md, ACCEPTANCE.md. Скиллы не расширяют пользовательский объём до всего frontend.

## Границы и будущие стабильные интерфейсы

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| Scope/metric contract | Одинаковый период, разрешённые клубы, сравнение, cutoff и определение метрики | Проверяемый контекст и typed metric metadata | Нормализацию legacy aliases, основания коэффициента и coverage |
| Executive data | Чтение и классификация сохранённых фактов, агрегаты по клубам/дням | Основные показатели и независимые вторичные данные | Prisma, источник/дедупликацию/полноту; не возвращает сырые PII |
| Metric/filter presentation | Единое отображение данных и запросов, тексты/действия по роли | Совместимые карточка, источник, фильтр, детали | Formatting и применимые interaction states; не считает бизнесформулы |
| Executive page | Выбранная композиция1 и рабочий маршрут руководителя | /dashboard, сопоставимые графики/таблица/приоритеты | Управление последним запросом и применение поддерживаемых URL |
| Drill-down adapters | Связь значения со строками и восстановление контекста | Работающие маршруты/детали того же grain | Несовместимые параметры не уходят незаметно |

Семантический контракт: value:number|null, unit/definition/grain, фактическое data state, reason, coverage с указанием основания, source dates и asOf. Реальный DTO сверить с существующими типами, не навязывать universal enum. current/previous + absoluteDelta/percentDelta/pointsDelta определяют сравнение; процент может бытьnull при базе0.

Loading/refresh/error запроса и data state независимы. AppliedScope связан с принятым результатом. Поздний ответ не меняет последний выбор. Все детали используют этот же контекст; при изменении данных между запросами нельзя молча смешивать поколения.

Primary/secondary остаются логическими частями для скорости и независимости ошибок. Candidate URLs /dashboard/executive-summary и /dashboard/executive-operations пока не являются установленным transport contract. В01 закрепить минимальный реальный контракт/метод публичной границы и передать root. До параллельного02/03 интерфейс должен быть конкретным; не писать два разных API по догадке.

## Первый сквозной срез

Товарная выручка выбрана потому, что её сохранённые факты уже имеют дату/клуб/сумму/отмену и не требуют подменять смысл услуг или мощности. Срез охватывает query/доказательство данных, actual app component, общий выбор клубов, статус/пояснение и соответствующую детализацию. Проверка идёт через реальные компоненты/сервис на разрешённой fixture, а не через прежний standalone HTML.

Контрактные states остальных KPI могут проверяться на typed fixture, но01 не отмечает готовыми их расчёты. Общий helper не должен дублировать existing DashboardFilters или существующее state-представление; извлечь только действительно совместимое поведение. UI-часть01 не меняет всю страницу до интеграции03.

Результат01: закреплённые signatures и context, перечень изменённых общих компонентов/потребителей и способ проверки. После него02 пишет backend-расчёты,03 использует общий контракт и примитивы. Изменение общей границы согласуется root до правки; нельзя одновременно править одну зону.

## Общие правила исполнения

- Checkout: C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center; branch codex/executive-dashboard-20260915; исходная база696c3486614b4f3084018a0f89974bf78384a552. Свои worktree/ветки/commits не создавать.
- Прочитать действующие AGENTS.md; перед данными/scope/auth/integration — полностью docs/security/runtime-security-contours.md. Источник production не выводить из ветки/merge.
- Сохраняются Nest/Prisma/Next16.2.4/React19.2.4/Phosphor/Recharts/Tailwind и .dark. Установленные версии перепроверить. Для Next читать node_modules/next/dist/docs.
- Состояние запроса и состояние данных различаются. Исходный enum интерпретируется по конкретному полю API; generic mapping по названию недостаточен.
- Все GET только читают сохранённые данные. Нет syncComputerCounts, provider calls, backfill, reward/ledger effects, изменения ролей, schema, migration или network/control.
- FreshStoreScope и capabilities проверяются сервером. Client scopeKey/requestId — контекст отображения, не authorization token. Не раскрывать чужие counts или скрытые ресурсы через причины/подсказки.
- Оперативная сводка не подменяется полным трёхмесячным CRM; legacy CRM сохраняет смысл.
- Не писать .autopilot/interfaces/state самостоятельно: root обновляет контракты по возвращённому INTERFACES-блоку. Не менять соседние zones.
- Evidence: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-dashboard-20260915. Полный ERROR_LOG читать перед retry/production-командой; append cause/changed condition; каждый gate имеет отдельные stdout/stderr/exit.
- Агентам не выполнять production/auth/sync. Старые JWT/окна CANARY не переиспользовать. Активный исполнитель01: /root/executive_pilot; остальные зоны выдаются после закрепления границы01.
- API test: pnpm.cmd --filter api exec jest --runInBand --runTestsByPath src/<file>.spec.ts; API typecheck: pnpm.cmd --filter api exec tsc --noEmit -p tsconfig.build.json.
- Web: pnpm.cmd --filter web typecheck; pnpm.cmd --filter web build; scoped lint через pnpm.cmd --filter api/web exec eslint <paths>.
- Browser выбирается действующим процессом; ранее пользователь явно разрешил локальный Chromium. Новый рендер/стенд проверять заново, не считать старый порт или55проверокHTML доказательством продукта.

## Допуск зоны01 — 15.09.2026

Для сквозного подключения пилота дополнительно разрешены apps/api/src/dashboard/dashboard.service.ts, при необходимости dashboard.controller.ts, и apps/web/src/lib/dashboard-summary.ts. Сохранять legacy потребителей ассортимента; предпочтительна узкая additive projection с явным контрактом запроса. DashboardFilters расширяется совместимо. Полные KPI и оптимизация остаются02. Эти файлы пока принадлежат только01; сигнатуры закрепляются до02/03.

## Закреплённая граница сводки — после согласования01

Общие типы01: apps/api/src/common/executive-contract.ts; зеркальный Web contract/transport apps/web/src/lib/dashboard-executive.ts. Это дополнение зоны01 до начала02/03. После01 API-модуль принадлежит02, Web-модуль03; изменения wire shape согласуются root и передаются обоим.

- Query: period, dateFrom, dateTo, repeated storeIds; comparison:boolean (default true), asOf?:ISO cutoff. Server resolves default closed-day period and fresh allowed stores; invalid scope is rejected/limited by canonical FreshStoreScope, not client assertions.
- ExecutiveAppliedScope={period:{from:string,to:string,timezone:string},storeIds:string[],storeTimeZones:Record<string,string>,comparison:{from:string,to:string}|null,asOf:string}. asOf is one requested/resolved calculation cutoff; source fact dates remain independent. Response scope is the accepted context.
- ExecutiveCoverage={covered:number,total:number|null,percent:number|null,basis:'STORE_DAYS'|'STORE_OPERATIONS'|'STORE_SESSIONS'|'CAPACITY_HOURS'}. Unknown total is null, not a invented denominator. Metric reason/definition names what is covered. Not merely integration presence.
- ExecutiveMetric={key:string,unit:'RUB'|'COUNT'|'PERCENT'|'RUB_PER_VISIT',definition:string,grain:string,value:number|null,state:'AVAILABLE'|'PARTIAL'|'MISSING'|'STALE'|'FAILED',reason:string|null,coverage:ExecutiveCoverage|null,factAsOf:string|null,lastCalculatedAt:string,comparison:{previousValue:number|null,absoluteDelta:number|null,percentDelta:number|null,pointsDelta:number|null}|null,destination?:'CLUBS'|'ASSORTMENT'}.
- ExecutiveMetrics has exact keys revenue, serviceRevenue, topups, visits, revenuePerVisit, load, productRevenue, productRevenueShare. Main UI uses five cards and productRevenueShare next to goods; service/topups are disclosed without double counting.
- GET /dashboard/executive-summary → ExecutiveSummary={scope:ExecutiveAppliedScope,metrics:ExecutiveMetrics,clubs:Array<{storeId:string,storeName:string,metrics:ExecutiveMetrics}>,days:Array<{date:string,metrics:ExecutiveMetrics}>}. Club/day details reuse this accepted generation, explicitly labelled as aggregates by club/day; no claim of individual receipts. Comparisons cover each metric, zero base leaves percentDelta null.
- GET /dashboard/executive-operations → ExecutiveOperations={scope:ExecutiveAppliedScope,assortment:{state:'AVAILABLE'|'PARTIAL'|'MISSING'|'STALE'|'FAILED',reason:string|null,data:AssortmentHealth|null}}. Reuse existing canonical AssortmentHealth type; if summary-only projection needed, name exact existing DTO alias before changes. No invented CRM payload. This source may fail independently of primary.
- Both routes stay corporate guarded, use same scope normalization, make only saved-data reads. Web transport exposes getExecutiveSummary(query,{signal?}) and getExecutiveOperations(query,{signal?}); abort/latest-request guard belongs to03. Naming can follow current transport conventions if exact exports are reported before02/03.
- Product pilot remains GET /dashboard/executive-product-revenue with metric/rows public seam; its metric should conform to generic states/proof. Existing /dashboard/summary remains compatible for assortment consumers.

No full-formula completion is implied by these types.01 proves product revenue only;02 implements complete main/operations;03 wires selected variant1.

Pilot UI mount:01 разрешено минимальное подключение карточки/пилота в apps/web/src/app/(app)/dashboard/page.tsx. Полная композиция страницы остаётся03; до завершения01 другие авторы её не меняют. Period.from/to и comparison.from/to — YYYY-MM-DD включительно в возвращённой business timezone; asOf — отдельный ISOinstant cutoff.


### Уточнения общей границы после независимой проверки

- Параметры периода: явная пара dateFrom+dateTo используется для custom периода; отсутствие одного края, неверные даты и from>to — 400. period без пары использует существующий supported preset. Если валидная пара присутствует вместе с period, явные даты имеют приоритет и ответ возвращает фактический интервал. Web после apply сериализует канонический URL; legacy from/to нормализует принимающий Web-адаптер, а API не угадывает unsupported aliases.
- Product-pilot ответ: {scope:ExecutiveAppliedScope,metric:ExecutiveMetric,rows:Array<{storeId:string,storeName:string,revenue:number|null,saleOperationCount:number|null,metric:ExecutiveMetric}>,grain:'CLUB'}. Существующие tenantId/tenantSlug/periodFrom/periodTo/selectedStoreIds поля пилота допустимы как совместимые aliases, но actual UI читает scope. Общая метрика имеет исходный PRODUCT_SALE_OPERATION grain; rows явно клубные агрегаты, не чеки.
- Secondary запрашивается с принятыми main.scope.period/from/to, scope.storeIds и scope.asOf; server валидирует этот scope заново. UI принимает operations только для текущего request generation и полного совпадения scope; смена фильтра немедленно делает прошлый secondary непригодным к новой выборке. asOf — cutoff, а не обещание общего DB snapshot двух HTTP. Даты inventory/facts показываются отдельно; UI не вычисляет отношения между main и independently-read operations.
- Приоритеты03 строит по уже полученным фактам: ограничение main metrics (по конкретной причине), canonical assortmentHealth OOS/lowStock/noSales и подтверждённое сравнение visits. Действия максимум3, один сигнал одной проблемы, доступность переходов по текущей роли. Нет отдельного fabricated CRM/priority endpoint. При operationsFAILED его состояние видно, а отсутствие данных не сообщает «задач нет».
- MISSING означает нет доказанного значения/источника/совместимого знаменателя, всегда value=null. FAILED — источник не удалось прочитать; value=null. AVAILABLE0 допустим лишь при доказанной полноте. PARTIAL допускает только полезную подтверждённую сумму по явному правилу метрики; STALE может содержать прошлое значение с factAsOf/reason. Нельзя общий mapper по совпадающим словам enum старого API.
- ExecutiveMetric дополнен ratio:{numeratorValue:number|null,denominatorValue:number|null,numeratorLabel:string,denominatorLabel:string,compatible:boolean}|null. Для revenuePerVisit/productRevenueShare/load он обязателен, включая отсутствующие основания; для остальных null. UI показывает эти основания и reason, не реконструирует их из других nullable карточек. Для load основания — занятые и доступные часы; для ARPV — согласованная выручка и визиты; для доли — товары и общая выручка той же популяции.

### Подтверждение источников для02 (координация15.09)

Задача «Спланировать открытый тест» независимо проверила локальные документы и source: подтверждённого dictionary source/form/name для gaming services НЕТ. docs/LANGAME_PUBLIC_API.md перечисляет поля AllOperationsLogListResponseDTO, но не enum/semantics. Импорт переносит rawname/source/form без normalized service kind. ClubRevenueFact = typeplus; existing broad negative/expense helpers — это списания баланса, не доказанные услуги. Их нельзя переименовывать или складывать с SalesFact как непересекающиеся услуги.

02 должен проверить доступные сохранённые источники/контракты; если нового доказательства нет, serviceRevenue=null/MISSING с точной причиной. Общая выручка может показать подтверждённую товарную составляющую только как PARTIAL по явному определению, а зависимые отношения не становятся точными. Synthetic classified service facts проверяют формулу, но не доказывают production availability. Не добавлять постоянный hardcoded mock/fake classified source. Новые provider calls/backfill/schema вне этого scope.

Route inventory extension:01 может добавить точную запись новой guarded GET /dashboard/executive-product-revenue в существующий pilot HTTP surface manifest. Не менять exhaustive manifest assertion, существующие permissions или controllers.02 добавляет собственные2routes тем же образом после передачи зоны.


### Repair01 contract clarification

Pilot row.metric carries per-club value/state/reason/coverage; revenue is a nullable compatible alias of row.metric.value, not an invented0. saleOperationCount remains null when its observation population is unknown. Confirmed partial sums only include confirmed store-days; incomplete/missing club rows show their limitation. Query accepts explicit asOf and actual business-period normalization. Response scope.storeIds always lists the concrete accepted store universe used by both facts and rows (never [] as an ambiguous alias for populated whole-network results). Header comparison scope and cutoff have the same business timezone as the actual query. This is repair1 of pilot, before02/03 start.
Windows tools: App Router paths with parentheses must bypass pnpm.cmd/cmd.exe when linting/formatting. Call node.exe directly with the absolute installed Prettier/ESLint JS entrypoint and literal PowerShell path arguments. pnpm filtered exec also changes cwd to its package, so root-relative patterns are invalid there. Do not repeat either known invocation failure or install a second formatter.


### Repair2: несколько часовых поясов

Разрешённый выбор A+B не отклоняется только потому, что часовые пояса клубов различаются. Scope содержит storeTimeZones:Record<string,string> для принятых клубов; period.timezone равен общему IANA timezone для однородной выборки либо PER_STORE для смешанной. Для товарного пилота UI показывает «Продажи показаны по учётным датам источника»; у timestamp-метрик02 применимы локальные календарные границы. PER_STORE не передаётся в Intl как имя зоны.

Проверено по существующим источникам: импорт Langame SalesFact сохраняет fiscal-date строки через Date.UTC без пересчёта зоны; DailyDataCoverage.businessDate также нормализована через Date.UTC, а loader сопоставляет её по sameUtcDay. Эти учётные даты нельзя повторно смещать по store.timeZone. Для товарного пилота выбранные YYYY-MM-DD сопоставляются с теми же UTC fiscal-date labels. CSV date может содержать время; его действующая семантика сохраняется и не объявляется точным временем отдельного чека.

Настоящие timestamp-популяции (например GuestSession) в02 ограничиваются локальными границами выбранных календарных дней каждого клуба. asOf остаётся принятым ISO cutoff для источников, к которым он применим, и передаётся вместе с selection; это не обещание intraday-разделения дневных SalesFact или общего DB snapshot. Даты источников и lastCalculatedAt остаются отдельными. Не выдавать плюс/минус-баланс за подтверждённые услуги.

Проверка смешанной сети обязательна: два разрешённых клуба с разными зонами сохраняют оба ID/строки и сумму; в ответе нет400 из-за самого факта смешанной выборки. Из тестов01 удаляются assertions формы приватного Prisma запроса и лишний cast; проверяются результаты публичного сервиса на независимых fixtures.
## Принимаемый результат01

- Public product seam и Web transport согласованы; строка имеет nullable revenue/count и собственный ExecutiveMetric. Последняя версия включает storeTimeZones/PER_STORE, источник fiscal-date labels, локальный request error и только inline детали того же результата.
- Неблокирующие задачи переходят03/04: компактные мобильные подписи DashboardFilters, один общий DashboardFiltersProps вместо двойного объявления; полная проверка палитры/фокуса. Для03 разрешены dashboard-filters.tsx и metric-presentation.ts в рамках этих адаптаций и общей презентации метрик.01 больше их не меняет после commit.
- Web summary contract/transport apps/web/src/lib/dashboard-executive.ts теперь принадлежит03. API common/executive-contract.ts и dashboard/* принадлежат02. Wire-shape меняется только через root и уведомление обоих; остаётся одна согласованная схема.
-02 получает также точное дополнение apps/api/src/tenancy/pilot-http-surface-manifest.ts/.spec.ts для регистрации двух своих read endpoints, без смены exhaustive assertions/guards/profiles. Подключение новых routes требует актуальной source-only документации в04.
- Windows gate helper .autopilot/run-executive-gate.ps1 использует проверенный cached pnpm10.33.2 через node.exe, чтобы обойти Corepack shim. Для Prettier/ESLint App Router paths вызывать direct node entrypoint из правильного package cwd; Web ESLint config находится в apps/web. Это не смена версии или установка зависимости.
Допуск02 для производительности: разрешены узкое совместимое чтение sales/store-day coverage в apps/api/src/common/assortment-health-loader.service.ts и его тесты, либо общий executive helper без дублирования правил. Main не должен ждать inventory/CRM. Старый load и его потребители сохраняются. Никто кроме02 этот API helper сейчас не меняет; новый public method/signature вернуть root.


## Принимаемый результат02 и фактическая доступность

- Guarded executive-summary/executive-operations используют согласованный wire. loadSalesCoverage({tenantId,storeIds,period}) читает сохранённые sales store-day доказательства без inventory/CRM; legacy full load сохранён.
- Реальные days/clubs строятся из собственных подмножеств сохранённых продаж и доказанно привязанных сессий, не копированием общего итога. У товаров сравнивается равный предыдущий период при сопоставимом подтверждении, нулевая база сохраняет absoluteDelta и percentDelta=null.
- В текущих источниках НЕТ независимого сохранённого GuestSession store-day completeness proof. Binding проверяется отдельно для каждого периода/клуба/дня. Непустые наблюдения: PARTIAL, covered=observed, total/percent=null; пустота: MISSING. Это не утверждение нулевых реальных визитов. Сравнения визитов подавлены, пока полнота не доказана; sales BUSINESS_FACTS не заменяет session evidence.
- Услуги, реальные денежные пополнения и историческая мощность не подтверждаются текущими источниками. Они и зависимые точные ratios остаются MISSING. Неиспользуемые125/35 arithmetic demos удалены; UI fixture с такими условными основаниями доказывает только отображение, не текущую доступность API данных.
- Неблокирующий technical concern: narrow/full loader дублируют store/coverage reads. Семантические правила salesDayEvidence общие; выделение общей read primitive можно сделать при финальной triage, не расширяя запрос main доinventory.
