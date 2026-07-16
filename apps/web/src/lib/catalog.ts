import { getApiUrl, getAuthHeaders } from "./api";

export type Category = {
  id: string;
  name: string;
  _count: {
    products: number;
  };
};

export type LangameCategoryCatalogGroup = {
  externalDomain: string;
  externalGroupId: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  syncedAt: string;
  productCount: number;
  linkedProductCount: number;
  uncategorizedProductCount: number;
  unmatchedProductCount: number;
  conflictProductCount: number;
  storesCount: number;
  mapping: {
    id: string;
    categoryId: string;
    categoryName: string;
    status: "SUGGESTED" | "CONFIRMED" | "REJECTED";
    confidence: number | null;
    updatedAt: string;
  } | null;
  suggestedCategory: {
    id: string;
    name: string;
  } | null;
};

export type LangameCategoryCatalogOverview = {
  source: "LANGAME";
  latestSyncedAt: string | null;
  warnings: string[];
  summary: {
    groups: number;
    activeGroups: number;
    configurationsWithoutGroup: number;
    configurationsWithUnavailableGroup: number;
    unlinkedProducts: number;
    uncategorizedProducts: number;
  };
  groups: LangameCategoryCatalogGroup[];
};

export type Supplier = {
  id: string;
  name: string;
  paymentDelayDays: number | null;
  minOrderAmount: string | null;
  orderMultiplicity: number | null;
  isActive: boolean;
  _count: {
    products: number;
  };
};

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${getApiUrl()}/categories`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch categories");
  }

  return response.json() as Promise<Category[]>;
}

export async function getLangameCategoryCatalog(): Promise<LangameCategoryCatalogOverview> {
  const response = await fetch(`${getApiUrl()}/categories/langame/overview`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Langame category catalog");
  }

  return response.json() as Promise<LangameCategoryCatalogOverview>;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const response = await fetch(`${getApiUrl()}/suppliers`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch suppliers");
  }

  return response.json() as Promise<Supplier[]>;
}
