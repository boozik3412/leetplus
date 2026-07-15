import { getApiUrl, getAuthHeaders } from "./api";

export type Category = {
  id: string;
  name: string;
};

export type Supplier = {
  id: string;
  name: string;
};

export type ProductAssortmentRole =
  | "CORE"
  | "TRAFFIC_DRIVER"
  | "MARGIN_DRIVER"
  | "IMPULSE"
  | "SEASONAL"
  | "TEST"
  | "SERVICE"
  | "OPTIONAL"
  | "EXCLUDED";

export type Product = {
  id: string;
  article: string;
  name: string;
  purchasePrice: string;
  unitCost: number | null;
  salePrice: string;
  facing: number;
  shelfLifeDays: number | null;
  isActive: boolean;
  isOperationalActive: boolean;
  assortmentRole: ProductAssortmentRole;
  isMandatory: boolean;
  createdAt: string;
  externalDomain: string | null;
  storeIds: string[];
  storeNames: string[];
  categoryId: string | null;
  supplierId: string | null;
  category: Category | null;
  supplier: Supplier | null;
};

export type ProductCatalogSort =
  | "name"
  | "article"
  | "category"
  | "supplier"
  | "assortmentRole"
  | "isMandatory"
  | "purchasePrice"
  | "salePrice"
  | "createdAt";

export type ProductCatalogQuery = {
  page?: string;
  pageSize?: string;
  name?: string;
  storeIds?: string[];
  sort?: ProductCatalogSort;
  direction?: "asc" | "desc";
};

export type ProductCatalog = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProductCatalogSummary = {
  totalSku: number;
  operationalActiveSku: number;
  categorizedSku: number;
  suppliedSku: number;
};

export async function getProducts(): Promise<Product[]> {
  const response = await fetch(`${getApiUrl()}/products`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }

  return response.json() as Promise<Product[]>;
}

export async function getProductCatalog(
  query: ProductCatalogQuery,
): Promise<ProductCatalog> {
  const params = new URLSearchParams();

  if (query.page) {
    params.set("page", query.page);
  }

  if (query.pageSize) {
    params.set("pageSize", query.pageSize);
  }

  if (query.name?.trim()) {
    params.set("name", query.name.trim());
  }

  query.storeIds?.forEach((storeId) => params.append("storeId", storeId));

  if (query.sort) {
    params.set("sort", query.sort);
  }

  if (query.direction) {
    params.set("direction", query.direction);
  }

  const response = await fetch(
    `${getApiUrl()}/products/catalog${params.size ? `?${params.toString()}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch product catalog");
  }

  return response.json() as Promise<ProductCatalog>;
}

export async function getProductCatalogSummary(): Promise<ProductCatalogSummary> {
  const response = await fetch(`${getApiUrl()}/products/summary`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch product catalog summary");
  }

  return response.json() as Promise<ProductCatalogSummary>;
}
