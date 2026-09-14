# Общие контракты

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| Langame import | Ежедневный inventory и доказуемая session club binding | существующие sync методы; pure helper разрешения club по tenant/domain/externalClubId | Provider чтения, times/identities, идемпотентность; никаких effects на rewards/ledger |
| Assortment health | Общие правила stocks/demand/prices/OOS/no-sales/turnover/excess/valuation | общий typed engine + loader для DashboardService и ReportsService; summary `assortmentHealth`, те же row sets для существующих reports | Все join/coverage/granularity/exclusion правила |
| Dashboard service | Growth, scoped visits, freshness и интеграция health | существующий GET dashboard/summary с additive `assortmentHealth`, nullable values/reasons/coverage | Чтения фактов, разницу unknown и0 |
| Web | Существующий responsive экран и переходы | постоянные health cards, no-sales selector, report URL adapter | Форматирование и локальные состояния; формулы остаются в backend |

Engine возвращает метрики с value/state/reason/coverage и датой данных; списки OOS/no-sales/turnover используют один и тот же snapshot cutoff, demand21d и store×product. Конкретный TypeScript DTO согласуется исполнителями через interfaces.md до UI подключения. Проверки проходят через pure engine, существующие service boundaries и UI navigation adapter; private-method snapshot tests не заменяют поведенческие случаи.

R13.1: все новые числовые карточки кликабельны, включая стоимость no-sales остатков (тот же список no-sales), оборачиваемость/дни запаса (inventory-turnover) и избыточный запас (inventory-turnover с excess-фильтром). R14.1: причина размещается непосредственно под числом в карточке, не только в отдельной методике. R15.1: каждый partial-показатель показывает coverage рядом со значением; общий badge не заменяет индивидуальное покрытие. Детализация маржи/чеков — реализация R14–R15, не новая функция; security/rollout и UI QA — обязательные условия безопасной приёмки R01–R17 в существующем проекте.


## Правила исполнения

- D05: `AssortmentInventorySnapshot.observedAt?: Date` получает InventorySnapshot.updatedAt; snapshotDate остаётся дневным ключом. Cutoff проверяет обе даты, freshness/asOf metadata — observedAt??snapshotDate. Это предотвращает будущие наблюдения и ложное stale посленочногозапуска.

- D04: OOS использует sale price, frozen/excess — отдельную valuationPrice с basis. Loader передаёт config.purchasePrice и SalesFact.cost; fallback sale valuation ясно помечен как оценка, не себестоимость. Product.purchasePrice0 не делает прочие cost sources недоступными.

- D03: API loader передаёт engine явный `storeProductIds` из подтверждённых config/inventory/sales. Общий каталог не размножается на все клубы. Engine01 получает additive поле, форма согласуется health_foundation→api_integration.

- D01: session Store resolution не меняет historical timestamps/date parserTZ. D02: stock `asOf` отдельно от `demandTo` (default performance `period.to`); defaultсклад актуальный, demandзакрытыйпериод. ReportlinkscarryasOf+from/to.

- Рабочий repo: C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center, branch codex/assortment-operational-dashboard-20260914, source base1907930c. Все агенты используют этот checkout; свои ветки/worktrees не создавать.
- Stack Nest11/Prisma6/Next16.2.4/React19.2.4/pnpm10.33.2. Существующие зависимости установлены. Ничего не устанавливать без сообщения root.
- Корневой AGENTS.md и scoped apps/web/AGENTS.md обязательны. Для integrations полностью читать docs/security/runtime-security-contours.md.
- Тест одного API файла: pnpm --filter api exec jest --runInBand --runTestsByPath src/<file>.spec.ts. API typecheck: pnpm --filter api exec tsc --noEmit -p tsconfig.build.json. Web typecheck: pnpm --filter web typecheck.
- Отдельные stdout/stderr/exit каждого gate сохранять внеrepo: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/assortment-operational-20260914/. Перед retry читать полный ERROR_LOG.md и дописывать причину+изменившееся условие. Не запускать тяжёлые full suites параллельно несколькими агентами, root группирует приёмку.
- Не менять production, runtime-control, schema/grants, auth/guest game/ledger. Никаких секретов в выводе/файлах. Только root/согласованная задача выполняют production handoff.
- Тесты и код выполняют агенты; root ведёт состояние/контракты/проверки/коммиты. Не коммитить самостоятельно. Не трогать .autopilot/AGENTS/global package manifests вне своей зоны; сообщать новые интерфейсы root.
- Отсутствующие source факты остаются unknown; не присваивать multi-club store наугад. Товарные операции не чеки.

## Из01 — общий engine (review PASS, committed)

- `apps/api/src/common/assortment-health.ts`: `buildAssortmentHealth(input: AssortmentHealthInput): AssortmentHealth`.
- Input: `asOf; demandTo?; period; stores; products; inventorySnapshots; sales; salesCoverage; priceConfigurations; exclusions; writeOffs`.
- `AssortmentHealthRow`: inventory,demand21d,price,noSales,frozenValue,turnoverDays,excessQuantity,writeOff*,risk,actionable.
- `AssortmentMetric<T>`: value,state,reason,coverage,asOf. Точные types читать измодуля; WebDTO совместим с JSON serialization.
- `apps/api/src/common/guest-session-store.ts`: `resolveGuestSessionStore(input: ResolveGuestSessionStoreInput): GuestSessionStoreResolution`. Принимать полный tenant active topology, затемфильтроватьpermissions; missingclub shared-domain остаётсяambiguous.
- `asOf` inventory отдельно от `demandTo` (default period.to). Price configuration требуетtenant/domain/club+updatedAt; staleprice не точные деньги.
- Targeted helpers:6+1tests PASS, API build-tsconfig typecheck PASS. Root full suite/reviews выполняютсяпередcommit.

- Пользователь явно разрешил локальный Chromium через Playwright дляdesktop/narrow QA после CUA auth-token blocker. Existing npx @playwright/cli0.1.19 and installed Chromium доступны; новые browserdeps не нужны.

-01 repair: `excessStockDays?: number` defaultexisting30; `asOf` bounds allfactwindows,raw transactionprice requires confirmed salescoverage; config newest<=asOf; aggregate staleremainsstale,unknownnosales retainedinvaluationcoverage. Tests9+1,lint,tscPASS.

##02 — согласование API (ещё реализуется)

- Dashboard query: `asOf=YYYY-MM-DD` отдельно от performance period; выбранное noSalesDays7/14/21/30 согласуется с summary.
- Existing report API routes: operations, inventory-turnover. Query supports repeated `storeIds`/legacy`storeId`, repeated`categoryIds`/legacy`categoryId`, `from,to,asOf`, `noSalesDays=7|14|21|30`, `stockStatus=OUT_OF_STOCK|LOW_STOCK`, `excess=true|false`.
- Response сохраняет legacy storeId и добавляет storeIds/categoryIds/asOf/noSalesDays и компактную assortmentHealth summary. Rows остаются в отчётах, не дублируются массово в dashboard.
- Daily sales coverage legacy `summary.domains[]` содержит domain/status, sourceCounts источников. Новая03форма сохраняет quick/inventory раздельно; SUCCESS QUICK не доказывает inventory/movements.

##03 — загрузка источников (на review)

- BUSINESS_FACTS legacy summary.domains/top-level counts остаются QUICK; additive summary.quick/inventory и sourceCounts.quick/inventory.
- Current ordinary INTERNAL daily обновляет INVENTORY, только если не подтверждены свежие successful AUTO INVENTORY jobs всех active source domains за36ч. Уже завершённый QUICK не перезаписывается при inventory-only run; failure виден в IntegrationSyncJob и результате daily.
- Explicit date canary не выдаёт live goods за исторический stock. После rollout нужен обычный bounded native run для фактического current inventory.
- Session binding через общий resolver, полный source topology; parserTZ берётся только из explicit club как раньше. Inferred binding не меняет timestamps.
- Targeted3suites54PASS, lintPASS; общий tsc ждёт завершения concurrent common/loader изменения.

- D04/D05 common final: summary frozenValue/excessValue имеют basis (включая MIXED); InventorySnapshot observedAt optional bounded<=asOf и определяет freshness/asOf. Common18tests+lintPASS; общийAPI191suites3540tests+2todoPASS, build-tscPASS перед handoff02.
