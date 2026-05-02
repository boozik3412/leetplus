import { getApiUrl, getAuthHeaders } from "./api";

export type Store = {
  id: string;
  name: string;
  address: string | null;
  externalDomain?: string | null;
  externalClubId?: string | null;
  isActive: boolean;
};

export async function getStores(): Promise<Store[]> {
  const response = await fetch(`${getApiUrl()}/stores`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch stores");
  }

  return response.json() as Promise<Store[]>;
}
