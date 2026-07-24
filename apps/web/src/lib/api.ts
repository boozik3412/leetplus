import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "leetplus_access_token";
const DEFAULT_API_TIMEOUT_MS = 15_000;

export type ApiErrorResponse = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

export function getApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
  }

  return apiUrl;
}

export async function getAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return {} satisfies Record<string, string>;
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  } satisfies Record<string, string>;
}

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `API request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    const message = data.message;

    if (Array.isArray(message)) {
      return message.join(", ");
    }

    return message ?? data.error ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}
