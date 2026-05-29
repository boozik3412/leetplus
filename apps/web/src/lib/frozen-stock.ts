import type { FrozenStockValuation } from "@/lib/reports";

export const frozenStockFormulaText =
  "Заморожено = текущий положительный остаток × оценка за единицу. Оценка берется из закупочной цены, при ее отсутствии из цены продажи, затем из последней исторической цены продажи; если цены нет, сумма остается 0.";

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
    UNKNOWN: "Нет оценки",
  };

  return value ? labels[value] : "—";
}
