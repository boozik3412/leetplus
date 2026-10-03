import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiUrl, readApiError } from "@/lib/api";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";
import { GUEST_SUPPORT_TICKET_NUMBER } from "@/lib/guest-support-tickets";

const MAX_BODY_BYTES = 8 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;

type ForwardOptions<T> = {
  method: "GET" | "POST";
  ticketNumber?: string;
  action?: "read" | "messages" | "feedback";
  idempotencyKey?: string;
  body?: Record<string, string>;
  project: (value: unknown) => T | null;
};

// Forwards one guest support-ticket call with the guest session cookie as a
// bearer token and returns only the projected, guest-safe response.
export async function forwardGuestSupportTickets<T>(
  options: ForwardOptions<T>,
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return privateJson({ message: "Гостевая сессия не найдена" }, 401);
  }

  const path = [
    "/guest-portal/session/support/tickets",
    options.ticketNumber ? `/${options.ticketNumber}` : "",
    options.action ? `/${options.action}` : "",
  ].join("");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    return privateJson(
      { message: await readApiError(response) },
      response.status,
    );
  }
  const projected = options.project(await response.json().catch(() => null));
  if (!projected) {
    return privateJson(
      { message: "Сервис обращений вернул некорректный ответ." },
      502,
    );
  }
  return privateJson(projected, 200);
}

export function guestTicketNumberOrNull(value: string) {
  return GUEST_SUPPORT_TICKET_NUMBER.test(value) ? value : null;
}

export function guestIdempotencyKeyOrNull(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  return IDEMPOTENCY_KEY.test(key) ? key : null;
}

// Reads a small JSON object and keeps only the allowed string fields.
export async function readGuestSupportBody(
  request: Request,
  allowedFields: readonly string[],
): Promise<Record<string, string> | null> {
  const rawLength = request.headers.get("content-length")?.trim() ?? "";
  if (
    rawLength &&
    (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_BODY_BYTES)
  ) {
    return null;
  }
  const text = await request.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const projected: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!allowedFields.includes(key) || typeof field !== "string") {
      return null;
    }
    projected[key] = field;
  }
  return projected;
}

export function privateJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
