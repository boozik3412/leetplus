import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiUrl, readApiError } from "@/lib/api";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

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
  const headers: Record<string, string> = body
    ? { "Content-Type": "application/json" }
    : {};

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
    body,
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
    path.length === 4 &&
    ((path[2] === "otp" && path[3] === "verify") ||
      (path[2] === "telegram-auth" && path[3] === "status") ||
      (path[2] === "user-call-auth" && path[3] === "status")) &&
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
