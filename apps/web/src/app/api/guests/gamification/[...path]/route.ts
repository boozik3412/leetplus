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

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return NextResponse.json(await response.json());
  }

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": contentType || "text/plain; charset=utf-8",
      ...(response.headers.get("content-disposition")
        ? { "content-disposition": response.headers.get("content-disposition")! }
        : {}),
    },
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { path } = await params;

  return proxyJsonRequest(request, gamificationPath(path), "POST");
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { path } = await params;

  return proxyJsonRequest(request, gamificationPath(path), "PATCH");
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { path } = await params;

  return proxyJsonRequest(request, gamificationPath(path), "DELETE");
}
