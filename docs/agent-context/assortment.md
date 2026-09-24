# Assortment implementation context

Read for assortment, inventory or report changes. This guide preserves the source
contracts formerly in root AGENTS.md; verify the affected implementation when changing it.
File paths below are repository-relative. Current checks are in [verification](verification.md).
The [metric contract](../assortment-dashboard-metric-contract.md) and root security
invariants remain mandatory for their scope. Test ports and past receipts are history.


- Входы — защищённые CSV imports товаров, остатков, продаж и движений, а также сохранённые интеграционные факты; они заполняют каталог, `InventorySnapshot`, `SalesFact`, `StockMovement`, покрытие и конфигурации цен.
- Обычный INTERNAL daily обновляет inventory ежедневно даже при закрытом QUICK; только недавний повтор подавляется при success AUTO INVENTORY всех активных доменов за 1 час. Это не порог качества данных: freshness остаётся 36 часов. Inventory-only run не двигает sales cursor.
- `resolveGuestSessionStore` доказывает Store по полной топологии tenant; вызывающий код затем применяет permissions. Inferred binding не меняет historical timestamps или parser timezone.
- Общие точки реализации — `apps/api/src/common/assortment-health.ts`, `assortment-health-loader.service.ts` и `guest-session-store.ts`; loader строит доказанные store×product grains и передаёт факты в pure `buildAssortmentHealth`.
- Устойчивые границы engine: `AssortmentHealth`/`AssortmentHealthRow` и `AssortmentMetric<T>` с `value|null`, `state`, `reason`, `coverage`, `asOf`; денежные оценки дополнительно несут `basis`.
- Отсутствующие данные остаются `null`/`UNKNOWN`, известный ноль остаётся нулём, а `PARTIAL` не становится точным итогом; Web показывает причину и coverage у конкретной карточки.
- Cutoff запроса — `selectedAssortmentAsOf`/report `asOf`; `inventory.asOf` — отдельная дата наблюдения остатка и не переносится как cutoff.
- `DashboardService` добавляет summary в `GET /dashboard/summary`, а `ReportsService` использует те же row sets для `operations`, `inventory-turnover` и `replenishment` вместе с scoped rows и write-off details.
- Web transport находится в `apps/web/src/lib/dashboard-summary.ts` и `apps/web/src/lib/reports.ts`; `/assortment/dashboard`, `/reports` и table pages сохраняют `from`, `to`, repeated `storeIds`/`categoryIds`, `asOf`, `noSalesDays` и subset URL.
- Карточки ассортимента кликабельны: OOS/low-stock/no-sales ведут в отчёты, turnover/excess — в inventory-turnover, а списания — в movement table с `subset=write-offs`.
- OOS `grossProfitAtRisk` хранит дневную/периодную оценку и cost basis: известная себестоимость позволяет расчёт, sale-price valuation не становится cost, отсутствие подтверждения остаётся null.
- Источник и production proof определяются canonical deployment documentation, а не веткой или наличием исходного кода.
