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

type SettingsBootstrapPayload = {
  brandingSettings: BrandingSettings | null;
  langameSettings: LangameSettings | null;
  brandingError: string | null;
  langameError: string | null;
};

const CALLBACK_PATTERN =
  /^window\.__leetplusSettingsCallbacks\.c[a-zA-Z0-9]+$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback") ?? "";

  if (!CALLBACK_PATTERN.test(callback)) {
    return NextResponse.json(
      { message: "Некорректный callback" },
      { status: 400 },
    );
  }

  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return respondWithCallback(callback, {
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

  return respondWithCallback(callback, {
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

function respondWithCallback(
  callback: string,
  payload: SettingsBootstrapPayload,
) {
  const body = `${callback}(${serializeForScript(payload)});`;

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
