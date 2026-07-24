import {
  fetchWithTimeout,
  getApiUrl,
  getAuthHeaders,
  readApiError,
} from "./api";

export type BrandingStoreLogo = {
  id: string;
  publicSlug: string | null;
  name: string;
  address: string | null;
  isActive: boolean;
  gameLogoUrl: string | null;
};

export type BrandingSettings = {
  tenant: {
    id: string;
    name: string;
    gameLogoUrl: string | null;
  };
  stores: BrandingStoreLogo[];
};

export async function getBrandingSettings(): Promise<BrandingSettings> {
  const response = await fetchWithTimeout(getApiUrl() + "/settings/branding", {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch branding settings: ${await readApiError(response)}`,
    );
  }

  return response.json() as Promise<BrandingSettings>;
}
