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

- D01: session Store resolution не меняет historical timestamps/date parserTZ. D02: stock `asOf` отдельно от `demandTo` (default performance `period.to`); defaultсклад актуальный, demandзакрытыйпериод. ReportlinkscarryasOf+from/to.

- Рабочий repo: C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center, branch codex/assortment-operational-dashboard-20260914, source base1907930c. Все агенты используют этот checkout; свои ветки/worktrees не создавать.
- Stack Nest11/Prisma6/Next16.2.4/React19.2.4/pnpm10.33.2. Существующие зависимости установлены. Ничего не устанавливать без сообщения root.
- Корневой AGENTS.md и scoped apps/web/AGENTS.md обязательны. Для integrations полностью читать docs/security/runtime-security-contours.md.
- Тест одного API файла: pnpm --filter api exec jest --runInBand --runTestsByPath src/<file>.spec.ts. API typecheck: pnpm --filter api exec tsc --noEmit -p tsconfig.build.json. Web typecheck: pnpm --filter web typecheck.
- Отдельные stdout/stderr/exit каждого gate сохранять внеrepo: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/assortment-operational-20260914/. Перед retry читать полный ERROR_LOG.md и дописывать причину+изменившееся условие. Не запускать тяжёлые full suites параллельно несколькими агентами, root группирует приёмку.
- Не менять production, runtime-control, schema/grants, auth/guest game/ledger. Никаких секретов в выводе/файлах. Только root/согласованная задача выполняют production handoff.
- Тесты и код выполняют агенты; root ведёт состояние/контракты/проверки/коммиты. Не коммитить самостоятельно. Не трогать .autopilot/AGENTS/global package manifests вне своей зоны; сообщать новые интерфейсы root.
- Отсутствующие source факты остаются unknown; не присваивать multi-club store наугад. Товарные операции не чеки.

## Из01 — общий engine (на review)

- `apps/api/src/common/assortment-health.ts`: `buildAssortmentHealth(input: AssortmentHealthInput): AssortmentHealth`.
- Input: `asOf; demandTo?; period; stores; products; inventorySnapshots; sales; salesCoverage; priceConfigurations; exclusions; writeOffs`.
- `AssortmentHealthRow`: inventory,demand21d,price,noSales,frozenValue,turnoverDays,excessQuantity,writeOff*,risk,actionable.
- `AssortmentMetric<T>`: value,state,reason,coverage,asOf. Точные types читать измодуля; WebDTO совместим с JSON serialization.
- `apps/api/src/common/guest-session-store.ts`: `resolveGuestSessionStore(input: ResolveGuestSessionStoreInput): GuestSessionStoreResolution`. Принимать полный tenant active topology, затемфильтроватьpermissions; missingclub shared-domain остаётсяambiguous.
- `asOf` inventory отдельно от `demandTo` (default period.to). Price configuration требуетtenant/domain/club+updatedAt; staleprice не точные деньги.
- Targeted helpers:6+1tests PASS, API build-tsconfig typecheck PASS. Root full suite/reviews выполняютсяпередcommit.

- Пользователь явно разрешил локальный Chromium через Playwright дляdesktop/narrow QA после CUA auth-token blocker. Existing npx @playwright/cli0.1.19 and installed Chromium доступны; новые browserdeps не нужны.

-01 repair: `excessStockDays?: number` defaultexisting30; `asOf` bounds allfactwindows,raw transactionprice requires confirmed salescoverage; config newest<=asOf; aggregate staleremainsstale,unknownnosales retainedinvaluationcoverage. Tests9+1,lint,tscPASS.
