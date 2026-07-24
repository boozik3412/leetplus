import {
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "leetplus_access_token";
const DEFAULT_API_TIMEOUT_MS = 15_000;

export type ApiErrorResponse = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

export type ApiJsonRequestOptions = {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
};

export type ApiJsonResult<T> = {
  data: T | null;
  error: string | null;
  headers: IncomingHttpHeaders;
  ok: boolean;
  status: number;
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

export async function requestJsonWithTimeout<T>(
  input: string,
  init: ApiJsonRequestOptions = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<ApiJsonResult<T>> {
  const response = await requestTextWithTimeout(input, init, timeoutMs);
  const ok = response.status >= 200 && response.status < 300;
  const parsed = response.body
    ? parseJsonResponse(response.body, input, ok)
    : null;

  return {
    data: ok ? (parsed as T) : null,
    error: ok ? null : getApiErrorMessage(parsed),
    headers: response.headers,
    ok,
    status: response.status,
  };
}

function requestTextWithTimeout(
  input: string,
  init: ApiJsonRequestOptions,
  timeoutMs: number,
) {
  return new Promise<{
    body: string;
    headers: IncomingHttpHeaders;
    status: number;
  }>((resolve, reject) => {
    const url = new URL(input);
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    let request: ClientRequest | null = null;
    let settled = false;

    const timeout = setTimeout(() => {
      request?.destroy(new Error(apiTimeoutMessage(timeoutMs)));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    request = transport(
      url,
      {
        headers: init.headers,
        method: init.method ?? "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          finish(() => {
            resolve({
              body: Buffer.concat(chunks).toString("utf8"),
              headers: response.headers,
              status: response.statusCode ?? 0,
            });
          });
        });
        response.on("error", (error) => {
          finish(() => reject(error));
        });
      },
    );

    request.on("error", (error) => {
      finish(() => reject(normalizeApiTimeoutError(error, timeoutMs)));
    });

    if (init.body) {
      request.write(init.body);
    }

    request.end();
  });
}

function parseJsonResponse(body: string, input: string, strict: boolean) {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (strict) {
      throw new Error(
        `Failed to parse API JSON from ${input}: ${String(error)}`,
      );
    }

    return null;
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
    (error.name === "AbortError" ||
      error.message === apiTimeoutMessage(timeoutMs))
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
    return getApiErrorMessage(data);
  } catch {
    return "Ошибка запроса";
  }
}

function getApiErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") {
    return "Ошибка запроса";
  }

  const response = data as ApiErrorResponse;
  const message = response.message;

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  return message ?? response.error ?? "Ошибка запроса";
}
