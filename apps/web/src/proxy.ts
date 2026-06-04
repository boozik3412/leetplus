import { NextResponse, type NextRequest } from "next/server";

const authCookieName = "leetplus_access_token";

const publicPathPrefixes = [
  "/api",
  "/_next",
  "/login",
  "/register",
  "/verify-email",
  "/guest",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const dashboardCanonicalResponse = canonicalizeDashboardUrl(request);

  if (dashboardCanonicalResponse) {
    return dashboardCanonicalResponse;
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(authCookieName)?.value ?? null;

  if (!token || isExpiredJwt(token)) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(authCookieName);

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function isPublicPath(pathname: string) {
  if (
    publicPathPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(pathname);
}

function canonicalizeDashboardUrl(request: NextRequest) {
  const { nextUrl } = request;

  if (
    nextUrl.pathname !== "/dashboard" &&
    !nextUrl.pathname.startsWith("/dashboard/")
  ) {
    return null;
  }

  if (!nextUrl.searchParams.has("skuGrouping")) {
    return null;
  }

  const canonicalUrl = nextUrl.clone();

  canonicalUrl.searchParams.delete("skuGrouping");

  return NextResponse.redirect(canonicalUrl);
}

function isExpiredJwt(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    return true;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    );
    const data = JSON.parse(atob(paddedPayload)) as { exp?: unknown };

    if (typeof data.exp !== "number") {
      return false;
    }

    return data.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
