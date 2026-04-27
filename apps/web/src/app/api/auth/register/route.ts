import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getApiUrl,
  readApiError,
  type ApiErrorResponse,
} from "@/lib/api";
import type { AuthResponse } from "@/lib/auth";

const AUTH_COOKIE_MAX_AGE = 60 * 60;

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    password?: string;
    organizationName?: string;
    tenantSlug?: string;
    fullName?: string;
  };

  const response = await fetch(`${getApiUrl()}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readApiError(response);
    return NextResponse.json<ApiErrorResponse>(
      { message },
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
