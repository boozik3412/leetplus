import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function gamificationPath(path: string[]) {
  return `/guests/gamification/${path.map(encodeURIComponent).join("/")}`;
}

export async function GET(request: Request, { params }: RouteContext) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const { path } = await params;
  const url = new URL(request.url);
  const response = await fetch(
    `${getApiUrl()}${gamificationPath(path)}${url.search}`,
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

  return proxyJsonRequest(request, gamificationPath(path), "POST");
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { path } = await params;

  return proxyJsonRequest(request, gamificationPath(path), "PATCH");
}
