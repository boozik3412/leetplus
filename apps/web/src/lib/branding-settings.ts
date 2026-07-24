import {
  getApiUrl,
  getAuthHeaders,
  requestJsonWithTimeout,
} from "./api";

export type BrandingStoreLogo = {
  id: string;
  publicSlug: string | null;
  name: string;
  address: string | null;
  isActive: boolean;
  gameLogoUrl: string | null;
  hasGameLogo?: boolean;
};

export type BrandingSettings = {
  tenant: {
    id: string;
    name: string;
    gameLogoUrl: string | null;
    hasGameLogo?: boolean;
  };
  stores: BrandingStoreLogo[];
};

export async function getBrandingSettings(): Promise<BrandingSettings> {
  const response = await requestJsonWithTimeout<BrandingSettings>(
    getApiUrl() + "/settings/branding",
    {
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch branding settings: ${response.error}`);
  }

  if (!response.data) {
    throw new Error("Failed to fetch branding settings: empty response");
  }

  return response.data;
}
