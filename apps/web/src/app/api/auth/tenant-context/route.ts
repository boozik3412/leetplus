import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getApiUrl,
  getAuthHeaders,
  readApiError,
  type ApiErrorResponse,
} from "@/lib/api";
import type { AuthResponse } from "@/lib/auth";

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24;

export async function POST(request: Request) {
  let payload: { tenantId?: string };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { message: "Некорректная сеть" },
      { status: 400 },
    );
  }

  return updateTenantContext("POST", payload);
}

export function DELETE() {
  return updateTenantContext("DELETE");
}

async function updateTenantContext(
  method: "POST" | "DELETE",
  payload?: { tenantId?: string },
) {
  const headers = await getAuthHeaders();

  if (!("Authorization" in headers)) {
    return NextResponse.json<ApiErrorResponse>(
      { message: "Требуется авторизация" },
      { status: 401 },
    );
  }

  let response: Response;

  try {
    response = await fetch(`${getApiUrl()}/auth/tenant-context`, {
      method,
      cache: "no-store",
      headers: {
        ...headers,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
    });
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { message: "Backend недоступен. Попробуйте еще раз через минуту." },
      { status: 503 },
    );
  }

  if (!response.ok) {
    return NextResponse.json<ApiErrorResponse>(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  const auth = (await response.json()) as AuthResponse;
  const nextResponse = NextResponse.json({ user: auth.user });

  nextResponse.cookies.set(AUTH_COOKIE_NAME, auth.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });

  return nextResponse;
}
