import { getApiUrl, getAuthHeaders } from "./api";

export type Category = {
  id: string;
  name: string;
};

export type Supplier = {
  id: string;
  name: string;
};

export type Product = {
  id: string;
  article: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  facing: number;
  shelfLifeDays: number | null;
  isActive: boolean;
  categoryId: string | null;
  supplierId: string | null;
  category: Category | null;
  supplier: Supplier | null;
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
