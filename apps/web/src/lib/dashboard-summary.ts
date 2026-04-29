import { getApiUrl, getAuthHeaders } from "./api";

export type DashboardTopSku = {
  productId: string;
  article: string;
  name: string;
  revenue: number;
  grossProfit: number;
  soldQuantity: number;
};

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  totalSku: number;
  activeSku: number;
  categoriesCount: number;
  suppliersCount: number;
  averageMarginPercent: number;
  averageFacing: number;
  totalRevenue: number;
  grossProfit: number;
  adjustedGrossProfit: number;
  marginPercent: number;
  adjustedMarginPercent: number;
  soldQuantity: number;
  writeOffAmount: number;
  returnAmount: number;
  stockQuantity: number;
  outOfStockRiskCount: number;
  recommendedOrderQuantity: number;
  topSkuByRevenue: DashboardTopSku[];
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await fetch(`${getApiUrl()}/dashboard/summary`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard summary");
  }

  return response.json() as Promise<DashboardSummary>;
}
