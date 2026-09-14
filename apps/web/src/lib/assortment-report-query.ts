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
    params.set("noSalesDays", String(scope.noSalesDays));
    return `/assortment/dashboard?${params}`;
  }

  if (subset === "oos-risk") {
    return `/reports/oos/table?${params}`;
  }

  if (subset === "assortment-risk") {
    params.set("noSalesDays", String(scope.noSalesDays));
    return `/reports/assortment-risk/table?${params}`;
  }

  if (subset === "out-of-stock") {
    params.set("stockStatus", "OUT_OF_STOCK");
    return `/reports/oos/table?${params}`;
  }

  if (subset === "low-stock") {
    params.set("stockStatus", "LOW_STOCK");
    return `/reports/oos/table?${params}`;
  }

  if (subset === "no-sales") {
    params.set("noSalesDays", String(scope.noSalesDays));
    return `/reports/no-sales/table?${params}`;
  }

  if (subset === "write-offs") {
    return `/products/movement/table?${params}`;
  }

  if (subset === "excess") {
    params.set("excess", "true");
  }

  return `/reports/inventory-turnover/table?${params}`;
}
