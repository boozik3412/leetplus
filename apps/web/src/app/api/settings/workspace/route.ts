import { NextResponse } from "next/server";
import { getAuthHeaders } from "@/lib/api";
import {
  getBrandingSettings,
  type BrandingSettings,
} from "@/lib/branding-settings";
import {
  getLangameSettings,
  type LangameSettings,
} from "@/lib/langame-settings";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { headers: RESPONSE_HEADERS, status: 401 },
    );
  }

  const [langameResult, brandingResult] = await Promise.allSettled([
    getLangameSettings().then(sanitizeLangameSettingsForSettingsPage),
    getBrandingSettings().then(sanitizeBrandingSettingsForSettingsPage),
  ]);

  return NextResponse.json(
    {
      brandingSettings:
        brandingResult.status === "fulfilled" ? brandingResult.value : null,
      langameSettings:
        langameResult.status === "fulfilled" ? langameResult.value : null,
      brandingError:
        brandingResult.status === "rejected"
          ? getSettingsErrorMessage(brandingResult.reason)
          : null,
      langameError:
        langameResult.status === "rejected"
          ? getSettingsErrorMessage(langameResult.reason)
          : null,
    },
    { headers: RESPONSE_HEADERS },
  );
}

function sanitizeBrandingSettingsForSettingsPage(
  settings: BrandingSettings,
): BrandingSettings {
  return {
    tenant: {
      id: settings.tenant.id,
      name: settings.tenant.name,
      gameLogoUrl: null,
      hasGameLogo: Boolean(settings.tenant.gameLogoUrl),
    },
    stores: settings.stores.map((store) => ({
      id: store.id,
      publicSlug: store.publicSlug,
      name: store.name,
      address: store.address,
      isActive: store.isActive,
      gameLogoUrl: null,
      hasGameLogo: Boolean(store.gameLogoUrl),
    })),
  };
}

function sanitizeLangameSettingsForSettingsPage(
  settings: LangameSettings,
): LangameSettings {
  return {
    tenantName: settings.tenantName,
    hasApiKey: settings.hasApiKey,
    domains: settings.domains,
    sources: settings.sources,
    syncJobs: [],
    latestSuccessfulSyncJob: null,
    endpointProfiles: [],
    endpointSnapshotCandidates: [],
    endpointSnapshots: [],
  };
}

function getSettingsErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}
