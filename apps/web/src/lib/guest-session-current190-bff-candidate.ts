const MAX_GUEST_MEDIA_BYTES = 2 * 1024 * 1024;
const MAX_LOGOUT_RECEIPT_BYTES = 4 * 1024;
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,8192}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const GUEST_SESSION_CURRENT190_BFF_CANDIDATE_ACTIVE = false as const;

export type GuestSessionCurrent190BffRoute = "LOGOUT" | "MEDIA";

export type GuestSessionCurrent190PreparedRequest = Readonly<{
  route: GuestSessionCurrent190BffRoute;
  upstreamPath: string;
  init: Readonly<{
    method: "GET" | "POST";
    headers: Readonly<Record<string, string>>;
    cache: "no-store";
    redirect: "error";
    credentials: "omit";
  }>;
}>;

export type GuestSessionCurrent190ProjectedResponse = Readonly<{
  response: Response;
  clearGuestCookie: boolean;
}>;

export class GuestSessionCurrent190BffCandidateError extends Error {
  readonly status: number;
  readonly reasonCode: string;

  constructor(status: number, reasonCode: string) {
    super(reasonCode);
    this.name = "GuestSessionCurrent190BffCandidateError";
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

/**
 * Dormant request builder for the atomic CURRENT190 BFF cutover.
 *
 * This file is intentionally not imported by a Route Handler. Promotion must
 * happen together with the canonical database/runtime grant and API route
 * cutover; until then the existing cookie-only logout remains visible to the
 * admission tests as a blocker.
 */
export function prepareGuestSessionCurrent190BffRequest(input: {
  method: string;
  path: readonly string[];
  guestToken: string | null | undefined;
  idempotencyKey?: string | null;
}): GuestSessionCurrent190PreparedRequest {
  const token = input.guestToken ?? "";
  if (!GUEST_TOKEN_PATTERN.test(token)) {
    fail(401, "GUEST_SESSION_CURRENT190_COOKIE_INVALID");
  }

  const baseHeaders = Object.freeze({ Authorization: `Bearer ${token}` });
  if (
    input.method === "POST" &&
    input.path.length === 2 &&
    input.path[0] === "session" &&
    input.path[1] === "logout"
  ) {
    const requestId = input.idempotencyKey ?? "";
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      fail(400, "GUEST_SESSION_CURRENT190_IDEMPOTENCY_KEY_INVALID");
    }
    return Object.freeze({
      route: "LOGOUT" as const,
      upstreamPath: "/guest-portal/session/logout",
      init: Object.freeze({
        method: "POST" as const,
        headers: Object.freeze({
          ...baseHeaders,
          "Idempotency-Key": requestId,
        }),
        cache: "no-store" as const,
        redirect: "error" as const,
        credentials: "omit" as const,
      }),
    });
  }

  if (
    input.method === "GET" &&
    input.path.length === 3 &&
    input.path[0] === "session" &&
    input.path[1] === "media" &&
    ASSET_ID_PATTERN.test(input.path[2])
  ) {
    return Object.freeze({
      route: "MEDIA" as const,
      upstreamPath: `/guest-portal/session/media/${encodeURIComponent(input.path[2])}`,
      init: Object.freeze({
        method: "GET" as const,
        headers: baseHeaders,
        cache: "no-store" as const,
        redirect: "error" as const,
        credentials: "omit" as const,
      }),
    });
  }

  fail(404, "GUEST_SESSION_CURRENT190_ROUTE_DENIED");
}

export async function projectGuestSessionCurrent190UpstreamResponse(
  route: GuestSessionCurrent190BffRoute,
  upstream: Response,
): Promise<GuestSessionCurrent190ProjectedResponse> {
  if (!upstream.ok) {
    await discardBounded(upstream, MAX_LOGOUT_RECEIPT_BYTES);
    const status = new Set([401, 404, 409, 423, 503]).has(upstream.status)
      ? upstream.status
      : 502;
    return Object.freeze({
      response: safeJsonResponse(
        { message: "Guest session request failed" },
        status,
      ),
      clearGuestCookie: false,
    });
  }

  if (route === "LOGOUT") {
    if (!isJsonContentType(upstream.headers.get("content-type"))) {
      fail(502, "GUEST_SESSION_CURRENT190_LOGOUT_CONTENT_TYPE_INVALID");
    }
    const bytes = await readBounded(upstream, MAX_LOGOUT_RECEIPT_BYTES);
    const receipt = parseJson(bytes);
    if (!validLogoutReceipt(receipt)) {
      fail(502, "GUEST_SESSION_CURRENT190_LOGOUT_RECEIPT_INVALID");
    }
    return Object.freeze({
      response: safeJsonResponse(receipt, 200),
      clearGuestCookie: true,
    });
  }

  const contentType = normalizedContentType(
    upstream.headers.get("content-type"),
  );
  if (!contentType || !ALLOWED_MEDIA_TYPES.has(contentType)) {
    fail(502, "GUEST_SESSION_CURRENT190_MEDIA_CONTENT_TYPE_INVALID");
  }
  const declaredLength = exactContentLength(
    upstream.headers.get("content-length"),
  );
  if (
    declaredLength !== null &&
    (declaredLength < 1 || declaredLength > MAX_GUEST_MEDIA_BYTES)
  ) {
    fail(502, "GUEST_SESSION_CURRENT190_MEDIA_LENGTH_INVALID");
  }
  const bytes = await readBounded(upstream, MAX_GUEST_MEDIA_BYTES);
  if (
    bytes.length < 1 ||
    (declaredLength !== null && declaredLength !== bytes.length) ||
    detectImageContentType(bytes) !== contentType
  ) {
    fail(502, "GUEST_SESSION_CURRENT190_MEDIA_BODY_INVALID");
  }
  const headers = privateHeaders();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(bytes.length));
  return Object.freeze({
    response: new Response(new Uint8Array(bytes), { status: 200, headers }),
    clearGuestCookie: false,
  });
}

function validLogoutReceipt(value: unknown): value is Readonly<{
  ok: true;
  status: "REVOKED";
  replayed: boolean;
  revokedAt: string;
}> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ["ok", "replayed", "revokedAt", "status"];
  if (
    keys.length !== expected.length ||
    !expected.every((key, index) => keys[index] === key) ||
    value.ok !== true ||
    value.status !== "REVOKED" ||
    typeof value.replayed !== "boolean" ||
    typeof value.revokedAt !== "string"
  ) {
    return false;
  }
  const parsed = new Date(value.revokedAt);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value.revokedAt
  );
}

async function discardBounded(response: Response, limit: number): Promise<void> {
  try {
    await readBounded(response, limit);
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const declaredLength = exactContentLength(
    response.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength > limit) {
    fail(502, "GUEST_SESSION_CURRENT190_UPSTREAM_BODY_TOO_LARGE");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        fail(502, "GUEST_SESSION_CURRENT190_UPSTREAM_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function safeJsonResponse(value: unknown, status: number): Response {
  const headers = privateHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function privateHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Cookie, Authorization, Idempotency-Key",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
}

function normalizedContentType(value: string | null): string | null {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return contentType || null;
}

function isJsonContentType(value: string | null): boolean {
  return normalizedContentType(value) === "application/json";
}

function exactContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(502, "GUEST_SESSION_CURRENT190_CONTENT_LENGTH_INVALID");
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? parsed
    : fail(502, "GUEST_SESSION_CURRENT190_CONTENT_LENGTH_INVALID");
}

function detectImageContentType(bytes: Buffer): string | null {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(status: number, reasonCode: string): never {
  throw new GuestSessionCurrent190BffCandidateError(status, reasonCode);
}
