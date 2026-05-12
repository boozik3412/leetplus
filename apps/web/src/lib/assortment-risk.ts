import type { OutOfStockRiskProduct, ProductWithoutSales } from "@/lib/reports";

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
  profitAtRiskForPeriod: number;
  frozenStockAmount: number;
  totalRiskAmount: number;
};

export type AssortmentRiskSummary = {
  totalRiskAmount: number;
  oosProfitAtRisk: number;
  frozenStockAmount: number;
  oosSkuCount: number;
  noSalesSkuCount: number;
  rows: AssortmentRiskRow[];
};

export function buildAssortmentRiskSummary({
  oosRows,
  noSalesRows,
}: {
  oosRows: OutOfStockRiskProduct[];
  noSalesRows: ProductWithoutSales[];
}): AssortmentRiskSummary {
  const oosRiskRows = oosRows.map((row): AssortmentRiskRow => ({
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
    frozenStockAmount: 0,
    totalRiskAmount: row.grossProfitAtRiskForPeriod,
  }));

  const noSalesRiskRows = noSalesRows.map((row): AssortmentRiskRow => ({
    riskType: "NO_SALES",
    riskTypeLabel: "Замороженный остаток",
    storeName: row.storeName,
    name: row.name,
    categoryName: row.categoryName ?? "—",
    supplierName: row.supplierName ?? "—",
    stockQuantity: row.stockQuantity,
    stockDays: null,
    averageDailySales: null,
    profitAtRiskForPeriod: 0,
    frozenStockAmount: row.frozenStockAmount,
    totalRiskAmount: row.frozenStockAmount,
  }));

  const rows = [...oosRiskRows, ...noSalesRiskRows].sort(
    (a, b) => b.totalRiskAmount - a.totalRiskAmount || a.name.localeCompare(b.name, "ru"),
  );

  const oosProfitAtRisk = sum(oosRiskRows, "profitAtRiskForPeriod");
  const frozenStockAmount = sum(noSalesRiskRows, "frozenStockAmount");

  return {
    totalRiskAmount: oosProfitAtRisk + frozenStockAmount,
    oosProfitAtRisk,
    frozenStockAmount,
    oosSkuCount: oosRiskRows.length,
    noSalesSkuCount: noSalesRiskRows.length,
    rows,
  };
}

function sum(rows: AssortmentRiskRow[], key: "profitAtRiskForPeriod" | "frozenStockAmount") {
  return rows.reduce((total, row) => total + row[key], 0);
}
