import { getApiUrl, getAuthHeaders } from "./api";

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  totalSku: number;
  activeSku: number;
  categoriesCount: number;
  suppliersCount: number;
  averageMarginPercent: number;
  averageFacing: number;
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
