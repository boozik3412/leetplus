export type AssortmentReportScope = {
  from: string;
  to: string;
  asOf: string | null;
  storeIds: readonly string[];
  categoryIds: readonly string[];
  noSalesDays: 7 | 14 | 21 | 30;
};

export type AssortmentReportSubset =
  | "dashboard"
  | "oos-risk"
  | "assortment-risk"
  | "out-of-stock"
  | "low-stock"
  | "no-sales"
  | "turnover"
  | "excess"
  | "write-offs";

export function buildAssortmentReportHref(
  scope: AssortmentReportScope,
  subset: AssortmentReportSubset,
) {
  const params = new URLSearchParams({
    from: scope.from,
    to: scope.to,
    subset,
  });

  if (scope.asOf) {
    params.set("asOf", scope.asOf);
  }

  scope.storeIds.forEach((storeId) => params.append("storeIds", storeId));
  scope.categoryIds.forEach((categoryId) =>
    params.append("categoryIds", categoryId),
  );

  if (subset === "dashboard") {
    params.set("period", "custom");
    params.set("dateFrom", scope.from);
    params.set("dateTo", scope.to);
    params.set("noSalesDays", String(scope.noSalesDays));
    return `/assortment/dashboard?${params}`;
  }

  if (subset === "oos-risk" || subset === "low-stock") {
    return orderPlanningHref(scope, "running-out");
  }

  if (subset === "assortment-risk") {
    return stockValueHref(scope, "frozen");
  }

  if (subset === "out-of-stock") {
    return orderPlanningHref(scope, "out-of-stock");
  }

  if (subset === "no-sales") {
    return orderPlanningHref(scope, "no-movement");
  }

  if (subset === "write-offs") {
    return `/products/movement/table?${params}`;
  }

  return stockValueHref(scope, subset === "excess" ? "excess" : "all");
}

/**
 * Shortage and no-sales drilldowns open «Заказ товаров» (it replaced those
 * reports). It and «Деньги в остатке» always show the latest full club days,
 * so only the club, category and no-sales window carry over.
 */
function orderPlanningHref(
  scope: AssortmentReportScope,
  view: "running-out" | "out-of-stock" | "no-movement",
) {
  return scopedHref("/products/order", view, scope, view === "no-movement");
}

/** Frozen stock, turnover and excess drilldowns open «Деньги в остатке». */
function stockValueHref(
  scope: AssortmentReportScope,
  view: "frozen" | "excess" | "all",
) {
  return scopedHref("/products/stock-value", view, scope, view === "frozen");
}

function scopedHref(
  pathname: string,
  view: string,
  scope: AssortmentReportScope,
  withNoSalesDays: boolean,
) {
  const params = new URLSearchParams({ view });
  scope.storeIds.forEach((storeId) => params.append("storeIds", storeId));
  scope.categoryIds.forEach((categoryId) =>
    params.append("categoryIds", categoryId),
  );
  if (withNoSalesDays) {
    params.set("noSalesDays", String(scope.noSalesDays));
  }
  return `${pathname}?${params}`;
}
