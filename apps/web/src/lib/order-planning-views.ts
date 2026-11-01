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
  if (view === "no-movement" && noSalesDays) {
    params.set("noSalesDays", noSalesDays);
  }
  return `/products/order?${params.toString()}`;
}
