# Операционный дашборд ассортимента

Документ описывает контракт, фактически развёрнутый 15 сентября 2026 года local time
(14 сентября UTC), и не заменяет отдельный rollout handoff. Runtime fact — active blue
`b5c03360941e1e5d59fe83f334b8dc29c2eced3b`, generation5, с rollback green
`05cad9cd1611c014453603475e8e1ba4c953f839`; data/control `399876` retained.
Последующий source/docs commit не меняет этот runtime.

## Подтверждённое состояние rollout

Native operation `9f793938-e989-40a6-abec-b7f2e890192e` / plan `274a3a…` завершила
все пять phases и native postcheck PASS; exact-main Fast `34878469493` и Full
`34878469338` PASS. Local API `3564 PASS + 2 todo`, PG15 и UI47 дополняются
restored-copy API/Web и scoped assortment parity PASS обоих slots для периода
15.08–13.09 с fixed stock cutoff.

Daily CANARY `247537d8…` PASS 14.09 20:34:04 UTC: 3 AUTO INVENTORY jobs для
3 domains/4 Stores дали 2117 observations, salesCount0, без изменений
`DailyDataCoverage`/`BusinessSnapshot`; source cursors остались 13.09. Временный
UTC offset0 выбрал уже подтверждённый 13.09 during operator local midnight;
original c82 profile restored and gen5 daily TIMER enabled. Bonus canary не
входит в этот metric contract: он PASS 14.09 20:43:32 UTC. Final off-host backup
PASS 21:02:00.729 UTC подтвердил source blue b5/gen5, rollback green05, data399
и original daily/bonus profiles; deployment fully closed.

Production UI `16/16 PASS` на ширинах 390/944/1440 с screenshots: OOS `91`,
LOW `14`, no-sales `195` при coverage `97.1%` и выбранном no-sales window 21 days;
write-offs недоступны и так отображены, без подмены нулём. Money card `203771` и
excess `535839` имеют coverage `0%` для current freshness и historical cost на
03.09: они не являются подтверждёнными текущими valuations и должны оставаться
явно qualified в UI.

## Executive summary — source-only candidate, 15.09.2026

Исходный код добавляет корпоративные read-only `GET /dashboard/executive-summary`
и `GET /dashboard/executive-operations` для экрана `/dashboard`. Это отдельный
source-only кандидат, а не часть уже принятого assortment rollout выше: он не
меняет active blue `b5c033…`, generation5, data/control `399876`, схему,
роли, worker, provider egress или production admission.

Оба GET заново применяют `FreshStoreScope`, возвращают фактически принятую
область (period, конкретные allowed storeIds, store time zones, comparison и
asOf) и читают только сохранённые данные. Primary summary не ждёт независимый
assortment source; failure operations не удаляет уже полученные primary KPI.
Operations не является подтверждённым текущим inventory, если его wrapper или
дочерняя метрика имеют `STALE`/`MISSING`/`FAILED`: UI показывает состояние и
причину, а business priority допускается только для подтверждённого текущего
сигнала.

Текущая доказуемая семантика primary ограничена товарными продажами и
сохранёнными доказуемо привязанными game sessions. Sales store-days дают
`AVAILABLE`/`PARTIAL`/`MISSING` по фактическому coverage; подтверждённый ноль
остаётся нулём, а отсутствие coverage — `null`, не ноль. Непустые visits
остаются `PARTIAL` с `covered=observed`, `total=null`, `percent=null`, потому
что независимого store-day completeness proof для GuestSession нет; пустая
выборка visits остаётся `MISSING`. Услуги, реальные пополнения, исторические
capacity hours и зависимые точные ratios остаются `MISSING`, пока для них нет
independent saved-data proof.

Локальная browser fixture с 40 000 ₽, 14 000 ₽, 320 visits, 125 ₽/visit,
35% и 20.8% служит только проверкой presentation/formula на условных
service/capacity facts. Она не доказывает доступность этих service/capacity
значений в source, не использует real JWT и не является production canary.

## Область расчёта

`GET /dashboard/summary` возвращает выбранный период продаж, массивы `selectedStoreIds` и `selectedCategoryIds`, выбранное окно `selectedNoSalesDays` (7, 14, 21 или 30; по умолчанию 21), а также `selectedAssortmentAsOf`. Последнее — точный ISO cutoff ассортимента. Это единственный cutoff, который UI переносит в переходы к ассортиментным отчётам.

`assortmentHealth.inventory.asOf` означает фактическую дату наблюдения остатка. Это не query cutoff: подстановка этой даты в отчёт может изменить набор строк и ошибочно представить старый остаток свежим. На карточках дата остатка показывается отдельно от даты оценки или расчёта.

Все переходы из warehouse-карточек и «Все отчёты» сохраняют `from`, `to`, повторяющиеся `storeIds`, повторяющиеся `categoryIds`, точный `asOf` и `noSalesDays`. Общий URL-adapter задаёт subset: `OUT_OF_STOCK`, `LOW_STOCK`, no-sales, turnover, excess или write-offs. Страницы читают эти параметры до запроса API; они не выбирают первый клуб из массива.

## Карточки и состояния

Перед длинным списком действий отображаются четыре постоянные карточки: «Нет в наличии», «Закончится за 3 дня», «Без продаж» и «Деньги в этих остатках». Ниже находятся «Дни запаса и оборачиваемость», «Избыточный запас» и «Списания за период». Каждая карточка — ссылка на тот же scoped row set, который сформировал её число.

Каждая метрика содержит `value`, `state`, `reason`, `coverage` и `asOf`. `null` рендерится как «Нет данных», а не как ноль. Причина и покрытие стоят непосредственно под значением. `AVAILABLE`, `PARTIAL`, `STALE`, `MISSING`, `FAILED` и `UNKNOWN` не сворачиваются в зелёный общий статус.

Денежные показатели возвращают также `basis`. Закупочная цена клуба, себестоимость продаж, цена товара и оценка по продажной цене подписываются отдельно; `MIXED` и `UNKNOWN` не выглядят как точная себестоимость. При partial-оценке coverage относится к конкретной карточке. Для days/turnover и frozen/excess UI показывает дату остатка как «остатки на», а независимую дату значения — как «расчёт на» или «данные оценки на».

No-sales selector расположен рядом с карточкой, не внутри её ссылки. Он доступен с клавиатуры, меняет только `noSalesDays` и сохраняет остальные параметры дашборда. Строки no-sales означают положительный остаток и отсутствие продаж в выбранном окне с согласованными исключениями; это не утверждение об отсутствии любых складских движений.

## Отчёты и списания

`/reports/oos/table` без `stockStatus` сохраняет legacy полный список рисков. `stockStatus=OUT_OF_STOCK` открывает «Нет в наличии», `stockStatus=LOW_STOCK` — «Закончится за 3 дня». Заголовок показывает период, cutoff и причину/coverage соответствующей метрики, поэтому scoped subset не маскируется общим названием OOS.

Для каждой OOS-строки additive `grossProfitAtRisk` передаёт оценку прибыли в риске за день и за период вместе с основанием себестоимости, состоянием, причиной, coverage и `asOf`. Это оценка недополученной прибыли при OOS, не фактическая потеря. Legacy числовые поля остаются совместимыми копиями значений этой оценки; UI не пересчитывает их. Если подтверждённой себестоимости нет, обе суммы остаются `null`, а таблица показывает конкретную причину из metric.

`/reports/no-sales/table` и `/reports/inventory-turnover/table` получают одинаковую область из URL. Excess использует `excess=true`. `/reports/replenishment/table` передаёт `from`, `to`, exact `asOf`, repeated `storeIds` и repeated `categoryIds`; ответ возвращает эти значения, coverage и health summary. Его строки включают только store-product grains с подтверждёнными inventory и demand; нулевой заказ у нормального SKU или SKU без продаж остаётся числовой строкой.

`/products/movement/table?subset=write-offs` использует те же scope-параметры. Карточка суммы и количества берёт state/coverage из `assortmentHealth.writeOff*`; таблица показывает sanitised `writeOffMovements` с датой, названием клуба, артикулом, товаром, категорией, количеством и суммой. При наличии только агрегата UI честно сообщает, что детализация недоступна, и никогда не показывает внутренние UUID вместо товара.

## Сохранённые показатели

Существующие визиты, товарные операции, средняя сумма операции, выручка, тренды, категории и прогноз остаются на экране. Scoped visits используют `visitBinding.usableVisitCount`; неизвестное доказуемое club-binding не становится нулём. `marginCoverage` отделяет полную маржу от partial: legacy gross profit и margin nullable, пока cost coverage неполное. Receipt-блок остаётся свёрнутым при нулевом receipt coverage и объясняет причину; строка продажи не заменяет чек.

Порог устаревания остатков остаётся 36 часов. Ordinary daily inventory refresh подавляет только повторный AUTO INVENTORY в пределах одного часа и только когда каждый активный source-domain уже успешно покрыт; следующий обычный daily run снова читает остатки. Успешная синхронизация продаж, визитов или другого источника не обновляет freshness inventory. Локальная Chromium QA этого source-only кандидата должна отдельно подтвердить desktop, narrow и mobile состояния, keyboard/focus, селектор, collapse и отсутствие overflow до production handoff.
