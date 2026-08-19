import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders } from "./api";

type ProxyJsonRequestOptions = {
  forwardQuery?: boolean;
  privateNoStore?: boolean;
};

type ProxyFileRequestOptions = {
  forwardQuery?: boolean;
};

export async function proxyJsonRequest(
  request: Request,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  options: ProxyJsonRequestOptions = {},
) {
  const headers = await getAuthHeaders();
  const responseHeaders = options.privateNoStore
    ? PRIVATE_JSON_RESPONSE_HEADERS
    : undefined;

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401, headers: responseHeaders },
    );
  }

  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();
  const url = new URL(request.url);
  const search = options.forwardQuery === false ? "" : url.search;
  const response = await fetch(`${getApiUrl()}${path}${search}`, {
    method,
    cache: "no-store",
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  if (!response.ok) {
    return NextResponse.json(await readProxyErrorBody(response), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  return NextResponse.json(await response.json(), {
    headers: responseHeaders,
  });
}

async function readProxyErrorBody(response: Response) {
  const rawError = await response.text();

  try {
    return JSON.parse(rawError) as unknown;
  } catch {
    return { message: rawError || "Ошибка запроса" };
  }
}

export async function proxyFileRequest(
  request: Request,
  path: string,
  fallbackFileName: string,
  options: ProxyFileRequestOptions = {},
) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401, headers: PRIVATE_FILE_RESPONSE_HEADERS },
    );
  }

  const url = new URL(request.url);
  const search = options.forwardQuery === false ? "" : url.search;
  const response = await fetch(`${getApiUrl()}${path}${search}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const rawError = await response.text();
    let errorBody: unknown;

    try {
      errorBody = JSON.parse(rawError);
    } catch {
      errorBody = { message: rawError || "Ошибка запроса" };
    }

    return NextResponse.json(errorBody, {
      status: response.status,
      headers: PRIVATE_FILE_RESPONSE_HEADERS,
    });
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const contentDisposition = safeFileDisposition(
    response.headers.get("content-disposition"),
    contentType,
    fallbackFileName,
  );

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
      ...PRIVATE_FILE_RESPONSE_HEADERS,
    },
  });
}

const PRIVATE_FILE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const PRIVATE_JSON_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const SAFE_INLINE_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function safeFileDisposition(
  upstreamValue: string | null,
  contentType: string,
  fallbackFileName: string,
) {
  const normalizedType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  const safeFallback = fallbackFileName.replace(/[\r\n"]/g, "_");
  const fallback = `attachment; filename="${safeFallback || "attachment"}"`;
  const sanitized = upstreamValue?.replace(/[\r\n]/g, "").trim();

  if (!sanitized) {
    return fallback;
  }

  if (normalizedType && SAFE_INLINE_CONTENT_TYPES.has(normalizedType)) {
    return sanitized;
  }

  if (/^inline\b/i.test(sanitized)) {
    return sanitized.replace(/^inline\b/i, "attachment");
  }

  return /^attachment\b/i.test(sanitized) ? sanitized : fallback;
}
