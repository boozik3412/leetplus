import {
  AUTH_COOKIE_NAME,
  getApiUrl,
  requestJsonWithTimeout,
} from "@/lib/api";
import type { AuthResponse } from "@/lib/auth";
import {
  inviteJson,
  readInviteRequest,
  safeInviteError,
} from "../transport";

const AUTH_COOKIE_MAX_AGE = 60 * 60;
const ACCEPT_FIELDS = new Set([
  "token",
  "email",
  "password",
  "confirmPassword",
  "fullName",
]);

export async function POST(request: Request) {
  const parsed = await readInviteRequest(request, ACCEPT_FIELDS);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { token } = parsed.payload;
  try {
    const result = await requestJsonWithTimeout<AuthResponse>(
      `${getApiUrl()}/auth/invites/accept`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.payload),
      },
    );

    if (!result.ok || !result.data) {
      return inviteJson(
        { message: safeInviteError(result.error, token) },
        { status: result.status || 502 },
      );
    }

    const response = inviteJson({ user: result.data.user }, { status: 200 });
    response.cookies.set(AUTH_COOKIE_NAME, result.data.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
    return response;
  } catch {
    return inviteJson(
      { message: "Сервис приглашений временно недоступен" },
      { status: 502 },
    );
  }
}
