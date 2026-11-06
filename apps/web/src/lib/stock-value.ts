import type { OrderPlanningRow } from "./reports";

/**
 * «Деньги в остатке»: where money sits in stock and what to sell off. Built on
 * the «Заказ товаров» rows, so a SKU shows the same stock, sales and demand on
 * both screens: club days, no canceled sales, demand per in-stock day and the
 * club's purchase price.
 */

export const STOCK_VALUE_VIEWS = [
  "frozen",
  "excess",
  "lost-profit",
  "all",
] as const;

export type StockValueView = (typeof STOCK_VALUE_VIEWS)[number];

export function isStockValueView(
  value: string | undefined,
): value is StockValueView {
  return STOCK_VALUE_VIEWS.includes(value as StockValueView);
}

export const STOCK_VALUE_DEFAULT_WINDOW_DAYS = 30;
export const NO_SALES_DAY_OPTIONS = [7, 14, 21, 30, 45, 60];
export const DEFAULT_NO_SALES_DAYS = 21;
export const EXCESS_HORIZON_OPTIONS = [14, 30, 60];
export const DEFAULT_EXCESS_HORIZON_DAYS = 30;

export type StockValueRow = {
  key: string;
  storeId: string;
  storeName: string;
  name: string;
  article: string;
  categoryName: string | null;
  supplierName: string | null;
  /** Current stock; 0 for a SKU that sells but is out of stock. */
  stockQuantity: number;
  stockStale: boolean;
  unitCost: number | null;
  /** Stock × purchase price; null when the price is unknown. */
  stockValue: number | null;
  soldQuantity: number;
  averageDailySales: number;
  stockDaysLeft: number | null;
  /** Last club day with a sale inside the window. */
  lastSaleDay: string | null;
  /** Full days since the last sale; null = no sale in the whole window. */
  daysWithoutSales: number | null;
  /** Stock that will not sell within the horizon at the current pace. */
  excessQuantity: number;
  excessValue: number | null;
  /** Gross profit lost per day while a selling SKU is out of stock. */
  lostProfitPerDay: number | null;
  daysOutOfStock: number;
  /** Lost profit per day × days out of stock in the window. */
  lostProfit: number | null;
};

/**
 * Rows of the screen: every SKU on stock now, plus SKUs that sell but are out
 * of stock (they lose profit). Rows without stock data are left out.
 */
export function buildStockValueRows(
  rows: readonly OrderPlanningRow[],
  days: readonly string[],
  horizonDays: number,
): StockValueRow[] {
  return rows.flatMap((row) => {
    const stock = row.stockQuantity;
    if (stock === null) return [];
    const inStock = stock > 0;
    const selling = row.averageDailySales > 0;
    if (!inStock && !selling) return [];

    const lastSaleIndex = lastIndexWithSales(row.dailySales);
    const excessQuantity = inStock
      ? Math.max(0, stock - row.averageDailySales * horizonDays)
      : 0;
    const unitProfit =
      row.unitCost !== null && row.soldQuantity > 0
        ? row.revenue / row.soldQuantity - row.unitCost
        : null;
    const lostProfitPerDay =
      !inStock && unitProfit !== null
        ? round(row.averageDailySales * Math.max(0, unitProfit))
        : null;

    return [
      {
        key: `${row.storeId}:${row.productId}`,
        storeId: row.storeId,
        storeName: row.storeName,
        name: row.name,
        article: row.article,
        categoryName: row.categoryName,
        supplierName: row.supplierName,
        stockQuantity: Math.max(0, stock),
        stockStale: row.stockStale,
        unitCost: row.unitCost,
        stockValue:
          row.unitCost === null
            ? null
            : round(Math.max(0, stock) * row.unitCost),
        soldQuantity: row.soldQuantity,
        averageDailySales: row.averageDailySales,
        stockDaysLeft: row.stockDaysLeft,
        lastSaleDay:
          lastSaleIndex === null ? null : (days[lastSaleIndex] ?? null),
        daysWithoutSales:
          lastSaleIndex === null
            ? null
            : row.dailySales.length - 1 - lastSaleIndex,
        excessQuantity: round(excessQuantity),
        excessValue:
          row.unitCost === null ? null : round(excessQuantity * row.unitCost),
        lostProfitPerDay,
        daysOutOfStock: row.daysOutOfStock,
        lostProfit:
          lostProfitPerDay === null
            ? null
            : round(lostProfitPerDay * row.daysOutOfStock),
      },
    ];
  });
}

/** On stock and not sold for at least `days` full days (or the whole window). */
export function isWithoutSales(row: StockValueRow, days: number) {
  return (
    row.stockQuantity > 0 &&
    (row.daysWithoutSales === null || row.daysWithoutSales >= days)
  );
}

export function matchesStockValueView(
  row: StockValueRow,
  view: StockValueView,
  noSalesDays: number,
) {
  switch (view) {
    case "frozen":
      return isWithoutSales(row, noSalesDays);
    case "excess":
      return row.excessQuantity > 0;
    case "lost-profit":
      return row.stockQuantity <= 0;
    case "all":
      return row.stockQuantity > 0;
  }
}

export type StockValueTotals = {
  stockValue: number;
  frozenValue: number;
  excessValue: number;
  lostProfitPerDay: number;
  inStock: number;
  unpriced: number;
};

export function stockValueTotals(
  rows: readonly StockValueRow[],
  noSalesDays: number,
): StockValueTotals {
  const inStock = rows.filter((row) => row.stockQuantity > 0);
  return {
    stockValue: round(sumOf(inStock, (row) => row.stockValue)),
    frozenValue: round(
      sumOf(
        inStock.filter((row) => isWithoutSales(row, noSalesDays)),
        (row) => row.stockValue,
      ),
    ),
    excessValue: round(sumOf(inStock, (row) => row.excessValue)),
    lostProfitPerDay: round(sumOf(rows, (row) => row.lostProfitPerDay)),
    inStock: inStock.length,
    unpriced: inStock.filter((row) => row.unitCost === null).length,
  };
}

export type StockValueBreakdown = "product" | "store" | "category" | "supplier";

export type StockValueGroupRow = {
  key: string;
  label: string;
  positions: number;
  stockQuantity: number;
  stockValue: number;
  excessValue: number;
  lostProfitPerDay: number;
  unpriced: number;
};

export const NO_CATEGORY = "Без категории";
export const NO_SUPPLIER = "Без поставщика";

/** Sums of the rows by club, category or supplier. */
export function groupStockValueRows(
  rows: readonly StockValueRow[],
  by: Exclude<StockValueBreakdown, "product">,
): StockValueGroupRow[] {
  const groups = new Map<string, StockValueRow[]>();
  rows.forEach((row) => {
    const label =
      by === "store"
        ? row.storeName
        : by === "category"
          ? (row.categoryName ?? NO_CATEGORY)
          : (row.supplierName ?? NO_SUPPLIER);
    const group = groups.get(label) ?? [];
    group.push(row);
    groups.set(label, group);
  });
  return [...groups.entries()].map(([label, group]) => ({
    key: label,
    label,
    positions: group.length,
    stockQuantity: round(sumOf(group, (row) => row.stockQuantity)),
    stockValue: round(sumOf(group, (row) => row.stockValue)),
    excessValue: round(sumOf(group, (row) => row.excessValue)),
    lostProfitPerDay: round(sumOf(group, (row) => row.lostProfitPerDay)),
    unpriced: group.filter(
      (row) => row.stockQuantity > 0 && row.unitCost === null,
    ).length,
  }));
}

function lastIndexWithSales(values: readonly number[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if ((values[index] ?? 0) > 0) return index;
  }
  return null;
}

function sumOf<T>(rows: readonly T[], pick: (row: T) => number | null) {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
