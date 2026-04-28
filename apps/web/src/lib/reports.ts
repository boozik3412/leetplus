import { getApiUrl, getAuthHeaders } from "./api";

export type ReportGroup = {
  id: string | null;
  name: string;
  productsCount: number;
  averageMarginPercent: number;
  averageSalePrice: number;
  totalFacing: number;
};

export type LowMarginProduct = {
  id: string;
  article: string;
  name: string;
  marginPercent: number;
  purchasePrice: string;
  salePrice: string;
  categoryName: string | null;
  supplierName: string | null;
};

export type AssortmentReport = {
  tenantId: string;
  tenantSlug: string;
  totalSku: number;
  activeSku: number;
  inactiveSku: number;
  averageMarginPercent: number;
  averageMarkupPercent: number;
  categoryBreakdown: ReportGroup[];
  supplierBreakdown: ReportGroup[];
  lowMarginProducts: LowMarginProduct[];
};

export type OperationalReportFilters = {
  from?: string;
  to?: string;
  storeId?: string;
};

export type OutOfStockRiskProduct = {
  productId: string;
  article: string;
  name: string;
  stockQuantity: number;
  averageDailySales: number;
  stockDays: number;
};

export type ProductWithoutSales = {
  productId: string;
  article: string;
  name: string;
  stockQuantity: number;
  categoryName: string | null;
  supplierName: string | null;
};

export type OperationalReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  soldQuantity: number;
  averageDailyRevenue: number;
  stockQuantity: number;
  stockDays: number | null;
  outOfStockRiskProducts: OutOfStockRiskProduct[];
  productsWithoutSales: ProductWithoutSales[];
};

export async function getAssortmentReport(): Promise<AssortmentReport> {
  const response = await fetch(`${getApiUrl()}/reports/assortment`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch assortment report");
  }

  return response.json() as Promise<AssortmentReport>;
}

export async function getOperationalReport(
  filters: OperationalReportFilters,
): Promise<OperationalReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/operations${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch operational report");
  }

  return response.json() as Promise<OperationalReport>;
}
