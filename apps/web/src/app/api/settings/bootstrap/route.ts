import { getAuthHeaders } from "@/lib/api";
import {
  getBrandingSettings,
  type BrandingSettings,
} from "@/lib/branding-settings";
import {
  getLangameSettings,
  type LangameSettings,
} from "@/lib/langame-settings";

type SettingsBootstrapPayload = {
  brandingSettings: BrandingSettings | null;
  langameSettings: LangameSettings | null;
  brandingError: string | null;
  langameError: string | null;
};

const SETTINGS_BOOTSTRAP_EVENT = "leetplus:settings-bootstrap";

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return respondWithBootstrap({
      brandingSettings: null,
      langameSettings: null,
      brandingError: "Необходимо войти в аккаунт",
      langameError: "Необходимо войти в аккаунт",
    });
  }

  const [langameResult, brandingResult] = await Promise.allSettled([
    getLangameSettings(),
    getBrandingSettings(),
  ]);

  return respondWithBootstrap({
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
  });
}

function respondWithBootstrap(payload: SettingsBootstrapPayload) {
  const serializedPayload = serializeForScript(payload);
  const body = [
    `window.__leetplusSettingsPayload = ${serializedPayload};`,
    `window.dispatchEvent(new CustomEvent(${JSON.stringify(
      SETTINGS_BOOTSTRAP_EVENT,
    )}, { detail: window.__leetplusSettingsPayload }));`,
  ].join("");

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}

function serializeForScript(payload: SettingsBootstrapPayload) {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

function getSettingsErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}
