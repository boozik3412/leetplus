import type {
  FrozenStockValuation,
  OutOfStockRiskProduct,
  ProductWithoutSales,
} from "@/lib/reports";

export type AssortmentRiskRow = {
  riskType: "OOS" | "NO_SALES";
  riskTypeLabel: string;
  storeName: string;
  name: string;
  categoryName: string;
  supplierName: string;
  stockQuantity: number;
  stockDays: number | null;
  averageDailySales: number | null;
  profitAtRiskForPeriod: number | null;
  frozenStockUnitValue: number | null;
  frozenStockValuation: FrozenStockValuation | null;
  frozenStockAmount: number | null;
  totalRiskAmount: number | null;
};

export type AssortmentRiskSummary = {
  totalRiskAmount: number | null;
  oosProfitAtRisk: number | null;
  frozenStockAmount: number | null;
  state: "AVAILABLE" | "PARTIAL";
  oosSkuCount: number;
  noSalesSkuCount: number;
  rows: AssortmentRiskRow[];
};

export function buildAssortmentRiskSummary({
  oosRows,
  noSalesRows,
  oosState,
  noSalesState,
}: {
  oosRows: OutOfStockRiskProduct[];
  noSalesRows: ProductWithoutSales[];
  oosState?:
    | "AVAILABLE"
    | "PARTIAL"
    | "STALE"
    | "MISSING"
    | "FAILED"
    | "UNKNOWN";
  noSalesState?:
    | "AVAILABLE"
    | "PARTIAL"
    | "STALE"
    | "MISSING"
    | "FAILED"
    | "UNKNOWN";
}): AssortmentRiskSummary {
  const oosRiskRows = oosRows.map(
    (row): AssortmentRiskRow => ({
      riskType: "OOS",
      riskTypeLabel: "Дефицит спроса",
      storeName: row.storeName,
      name: row.name,
      categoryName: "—",
      supplierName: row.supplierName ?? "—",
      stockQuantity: row.stockQuantity,
      stockDays: row.stockDays,
      averageDailySales: row.averageDailySales,
      profitAtRiskForPeriod: row.grossProfitAtRiskForPeriod,
      frozenStockUnitValue: null,
      frozenStockValuation: null,
      frozenStockAmount: null,
      totalRiskAmount: row.grossProfitAtRiskForPeriod,
    }),
  );

  const noSalesRiskRows = noSalesRows.map(
    (row): AssortmentRiskRow => ({
      riskType: "NO_SALES",
      riskTypeLabel: "Замороженный остаток",
      storeName: row.storeName,
      name: row.name,
      categoryName: row.categoryName ?? "—",
      supplierName: row.supplierName ?? "—",
      stockQuantity: row.stockQuantity,
      stockDays: null,
      averageDailySales: null,
      profitAtRiskForPeriod: null,
      frozenStockUnitValue: row.frozenStockUnitValue,
      frozenStockValuation: row.frozenStockValuation,
      frozenStockAmount: row.frozenStockAmount,
      totalRiskAmount: row.frozenStockAmount,
    }),
  );

  const rows = [...oosRiskRows, ...noSalesRiskRows].sort(
    (a, b) =>
      (b.totalRiskAmount ?? -Infinity) - (a.totalRiskAmount ?? -Infinity) ||
      a.name.localeCompare(b.name, "ru"),
  );

  const oosProfitAtRisk = unavailableEmpty(oosRows, oosState)
    ? null
    : sum(oosRiskRows, "profitAtRiskForPeriod");
  const frozenStockAmount = unavailableEmpty(noSalesRows, noSalesState)
    ? null
    : sum(noSalesRiskRows, "frozenStockAmount");

  return {
    totalRiskAmount:
      oosProfitAtRisk === null ||
      frozenStockAmount === null ||
      (oosState !== undefined && oosState !== "AVAILABLE") ||
      (noSalesState !== undefined && noSalesState !== "AVAILABLE")
        ? null
        : oosProfitAtRisk + frozenStockAmount,
    oosProfitAtRisk,
    frozenStockAmount,
    oosSkuCount: oosRiskRows.length,
    noSalesSkuCount: noSalesRiskRows.length,
    rows,
    state:
      oosProfitAtRisk === null ||
      frozenStockAmount === null ||
      (oosState !== undefined && oosState !== "AVAILABLE") ||
      (noSalesState !== undefined && noSalesState !== "AVAILABLE")
        ? "PARTIAL"
        : "AVAILABLE",
  };
}

function unavailableEmpty(
  rows: readonly unknown[],
  state:
    | "AVAILABLE"
    | "PARTIAL"
    | "STALE"
    | "MISSING"
    | "FAILED"
    | "UNKNOWN"
    | undefined,
) {
  return rows.length === 0 && state !== undefined && state !== "AVAILABLE";
}

function sum(
  rows: AssortmentRiskRow[],
  key: "profitAtRiskForPeriod" | "frozenStockAmount",
) {
  if (rows.some((row) => row[key] === null)) {
    return null;
  }

  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}
