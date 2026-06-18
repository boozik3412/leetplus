import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getApiUrl, readApiError } from "@/lib/api";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export const runtime = "nodejs";

function guestPortalPath(path: string[]) {
  return `/guest-portal/${path.map(encodeURIComponent).join("/")}`;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { path } = await params;
  const url = new URL(request.url);
  const headers: Record<string, string> = {};

  if (path.length >= 1 && path[0] === "session") {
    const cookieStore = await cookies();
    const token = cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value ?? null;

    if (!token) {
      return NextResponse.json(
        { message: "Гостевая сессия не найдена" },
        { status: 401 },
      );
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${getApiUrl()}${guestPortalPath(path)}${url.search}`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}

export async function POST(request: Request, { params }: RouteContext) {
  const { path } = await params;
  const body = await request.text();
  const miniAppEdgePayload = maybeBuildMiniAppEdgePayload(path, body);
  if (miniAppEdgePayload?.ok === false) {
    return NextResponse.json(
      { message: miniAppEdgePayload.message },
      { status: miniAppEdgePayload.status },
    );
  }

  const requestBody = miniAppEdgePayload?.ok ? miniAppEdgePayload.body : body;
  const headers: Record<string, string> = body
    ? { "Content-Type": "application/json" }
    : {};

  if (miniAppEdgePayload?.ok) {
    headers["x-guest-game-telegram-edge-secret"] =
      miniAppEdgePayload.edgeSecret;
  }

  if (path.length >= 1 && path[0] === "session") {
    const cookieStore = await cookies();
    const token = cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value ?? null;

    if (!token) {
      return NextResponse.json(
        { message: "Гостевая сессия не найдена" },
        { status: 401 },
      );
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiUrl()}${guestPortalPath(path)}`, {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  const data = await response.json();
  const nextResponse = NextResponse.json(data);

  if (
    ((path.length === 4 &&
      ((path[2] === "otp" && path[3] === "verify") ||
        (path[2] === "telegram-auth" && path[3] === "status") ||
        (path[2] === "user-call-auth" && path[3] === "status") ||
        (path[2] === "incoming-call-last4" && path[3] === "verify"))) ||
      (path.length === 2 &&
        path[0] === "telegram-mini-app" &&
        path[1] === "session") ||
      (path.length === 2 &&
        path[0] === "session" &&
        path[1] === "select-club")) &&
    typeof data?.token === "string"
  ) {
    nextResponse.cookies.set(GUEST_AUTH_COOKIE_NAME, data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return nextResponse;
}

function maybeBuildMiniAppEdgePayload(path: string[], body: string) {
  if (
    path.length !== 2 ||
    path[0] !== "telegram-mini-app" ||
    path[1] !== "session"
  ) {
    return null;
  }

  const edgeSecret = process.env.GUEST_GAME_TG_EDGE_SHARED_SECRET?.trim();
  const botToken =
    process.env.GUEST_GAME_TG_EDGE_BOT_TOKEN?.trim() ||
    process.env.GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN?.trim() ||
    process.env.GUEST_GAME_TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!edgeSecret) {
    return null;
  }

  if (!botToken) {
    return {
      ok: false as const,
      status: 503,
      message: "Telegram Mini App edge bot token is not configured.",
    };
  }

  if (!body.trim()) {
    return {
      ok: false as const,
      status: 400,
      message: "Telegram Mini App initData is required.",
    };
  }

  const payload = parseJsonObject(body);
  const initData = typeof payload.initData === "string" ? payload.initData : "";
  const validation = validateTelegramMiniAppInitData(initData, botToken);

  if (!validation.ok) {
    return {
      ok: false as const,
      status: 401,
      message: "Telegram Mini App initData is invalid.",
    };
  }

  return {
    ok: true as const,
    edgeSecret,
    body: JSON.stringify({
      telegramUserId: validation.userId,
      authDate: validation.authDate,
      clubId: payload.clubId,
      tenantSlug: payload.tenantSlug,
      storeId: payload.storeId,
    }),
  };
}

function validateTelegramMiniAppInitData(value: string, botToken: string) {
  const params = new URLSearchParams(value);
  const hash = params.get("hash")?.trim() ?? "";

  if (!hash) {
    return { ok: false as const };
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .map(([key, paramValue]) => `${key}=${paramValue}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (!safeCompareHex(hash, expectedHash)) {
    return { ok: false as const };
  }

  const authDate = Number(params.get("auth_date") ?? NaN);
  const user = parseTelegramMiniAppUser(params.get("user"));

  if (!Number.isFinite(authDate) || authDate <= 0 || !user) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    userId: user.id,
    authDate,
  };
}

function parseTelegramMiniAppUser(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { id?: unknown };
    const id =
      typeof parsed.id === "number" || typeof parsed.id === "string"
        ? String(parsed.id)
        : null;

    return id && /^[0-9]+$/.test(id) ? { id } : null;
  } catch {
    return null;
  }
}

function safeCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
