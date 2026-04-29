import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getApiUrl,
  readApiError,
  type ApiErrorResponse,
} from "@/lib/api";
import type { AuthResponse } from "@/lib/auth";

const AUTH_COOKIE_MAX_AGE = 60 * 60;
const REMEMBERED_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  };

  const response = await fetch(`${getApiUrl()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
    }),
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
    maxAge: payload.rememberMe
      ? REMEMBERED_AUTH_COOKIE_MAX_AGE
      : AUTH_COOKIE_MAX_AGE,
  });

  return nextResponse;
}
