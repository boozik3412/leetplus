import { getApiUrl, getAuthHeaders } from "./api";

export type Category = {
  id: string;
  name: string;
  _count: {
    products: number;
  };
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
