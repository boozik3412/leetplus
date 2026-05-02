import { getApiUrl, getAuthHeaders } from "./api";

export type ProductParsingSuggestion = {
  id: string;
  suggestedName: string;
  selectedName: string | null;
  normalizedKey: string;
  confidence: number;
  rationale: {
    brand: string | null;
    volume: string | null;
    flavor: string | null;
    variant: string | null;
    packageType: string | null;
    productKind: string | null;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    warnings: string[];
    hardBlockers: string[];
    domains: string[];
    names: string[];
    products: {
      id: string;
      name: string;
      article: string;
      sourceLabel: string;
      canonicalProductId: string | null;
      canonicalProductName: string | null;
      parsed: {
        brand: string | null;
        volume: string | null;
        flavor: string | null;
        variant: string | null;
        packageType: string | null;
        productKind: string | null;
        residualTokens: string[];
      };
    }[];
  };
  productIds: string[];
  candidateNames: string[];
  status: "PENDING" | "APPLIED" | "REJECTED";
};

export type ProductParsingRun = {
  id: string;
  status: string;
  totalProducts: number;
  suggestionsCount: number;
  appliedCount: number;
  rejectedCount: number;
  createdAt: string;
  finishedAt: string | null;
  suggestions: ProductParsingSuggestion[];
};

export type ProductParsingOverview = {
  latestRun: ProductParsingRun | null;
  pendingSuggestions: number;
  canonicalProductsCount: number;
};

export async function getProductParsingOverview(): Promise<ProductParsingOverview> {
  const response = await fetch(`${getApiUrl()}/utilities/product-parsing`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch product parsing overview");
  }

  return response.json() as Promise<ProductParsingOverview>;
}
