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

  try {
    return await withApiTimeout(
      fetch(input, {
        ...init,
        signal: controller.signal,
      }),
      timeoutMs,
      () => controller.abort(),
    );
  } catch (error) {
    throw normalizeApiTimeoutError(error, timeoutMs);
  }
}

export async function readJsonWithTimeout<T>(
  response: Response,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
) {
  try {
    return await withApiTimeout(
      response.json() as Promise<T>,
      timeoutMs,
      () => {},
    );
  } catch (error) {
    throw normalizeApiTimeoutError(error, timeoutMs);
  }
}

async function withApiTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      onTimeout();
      reject(new Error(apiTimeoutMessage(timeoutMs)));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeApiTimeoutError(error: unknown, timeoutMs: number) {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.message === apiTimeoutMessage(timeoutMs))
  ) {
    return new Error(apiTimeoutMessage(timeoutMs));
  }

  return error;
}

function apiTimeoutMessage(timeoutMs: number) {
  return `API request timed out after ${Math.round(timeoutMs / 1000)}s`;
}

export async function readApiError(response: Response) {
  try {
    const data = await readJsonWithTimeout<ApiErrorResponse>(response);
    const message = data.message;

    if (Array.isArray(message)) {
      return message.join(", ");
    }

    return message ?? data.error ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}
