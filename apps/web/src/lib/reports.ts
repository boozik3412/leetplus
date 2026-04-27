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
