import type { StockValueView } from "./stock-value";

// Shared by the server page (reads ?view=) and the client table.
export const ORDER_PLANNING_VIEWS = [
  "order",
  "out-of-stock",
  "running-out",
  "no-movement",
  "forecast",
  "movement",
  "excess",
  "all",
] as const;

export type OrderPlanningView = (typeof ORDER_PLANNING_VIEWS)[number];

export function isOrderPlanningView(
  value: string | undefined,
): value is OrderPlanningView {
  return ORDER_PLANNING_VIEWS.includes(value as OrderPlanningView);
}

type SearchParams = { [key: string]: string | string[] | undefined };

function values(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/**
 * Link to a «Заказ товаров» view that keeps the club and category filters
 * (and the no-sales window) of an old report link. The old order, shortage,
 * movement and no-sales reports redirect here.
 */
export function orderPlanningHref(view: OrderPlanningView, from: SearchParams) {
  return scopedReportHref("/products/order", view, from, {
    noSalesDays: view === "no-movement",
  });
}

/**
 * Link to a «Деньги в остатке» view with the same scope. The old turnover and
 * money-at-risk reports redirect here.
 */
export function stockValueHref(view: StockValueView, from: SearchParams) {
  return scopedReportHref("/products/stock-value", view, from, {
    noSalesDays: view === "frozen",
  });
}

/**
 * `pathname?view=…` with the clubs, categories and, when asked, the no-sales
 * window of an old report link.
 */
export function scopedReportHref(
  pathname: string,
  view: string,
  from: SearchParams,
  keep: { noSalesDays: boolean },
) {
  const params = new URLSearchParams({ view });
  const storeIds = [...values(from.storeIds), ...values(from.storeId)];
  const categoryIds = [...values(from.categoryIds), ...values(from.categoryId)];
  new Set(storeIds.filter(Boolean)).forEach((id) =>
    params.append("storeIds", id),
  );
  new Set(categoryIds.filter(Boolean)).forEach((id) =>
    params.append("categoryIds", id),
  );
  // The movement report filtered by category name.
  new Set(values(from.category).filter(Boolean)).forEach((name) =>
    params.append("category", name),
  );
  const noSalesDays = values(from.noSalesDays ?? from.period)[0];
  if (keep.noSalesDays && noSalesDays) {
    params.set("noSalesDays", noSalesDays);
  }
  return `${pathname}?${params.toString()}`;
}
