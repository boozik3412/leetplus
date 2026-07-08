import { getApiUrl, getAuthHeaders } from "./api";

export type Store = {
  id: string;
  publicSlug: string | null;
  name: string;
  address: string | null;
  city?: string | null;
  cityFiasId?: string | null;
  cityKladrId?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  yandexMapsUrl?: string | null;
  gameLogoUrl?: string | null;
  timeZone?: string | null;
  externalDomain?: string | null;
  externalClubId?: string | null;
  gamificationEnabled: boolean;
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
