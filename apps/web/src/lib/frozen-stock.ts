import type { FrozenStockValuation } from "@/lib/reports";

export const frozenStockFormulaText =
  "Заморожено = текущий положительный остаток × оценка за единицу. Оценка берется из подтверждённой закупочной цены или себестоимости; оценка по продажной цене помечается отдельно. Если оценки нет, сумма остаётся неизвестной.";

export const frozenStockShortText =
  "Замороженный остаток оценивается по закупке, а если ее нет - по цене продажи или последней исторической цене.";

export const frozenStockScopeText =
  "В расчет не входят товары без остатка, позиции с продажами или приходом внутри выбранного периода, а также SKU, исключенные из OOS/сервисные позиции.";

export function frozenStockValuationLabel(
  value: FrozenStockValuation | null | undefined,
) {
  const labels: Record<FrozenStockValuation, string> = {
    PURCHASE_PRICE: "Закупочная цена",
    SALE_PRICE: "Цена продажи",
    HISTORICAL_REVENUE: "Историческая цена продажи",
    CLUB_PURCHASE_PRICE: "Закупочная цена клуба",
    SALES_UNIT_COST: "Себестоимость продаж",
    PRODUCT_PURCHASE_PRICE: "Закупочная цена товара",
    SALE_PRICE_ESTIMATE: "Оценка по продажной цене",
    UNKNOWN: "Нет оценки",
  };

  return value ? labels[value] : "—";
}
