import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
import { proxyJsonRequest } from "@/lib/proxy";

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const response = await fetch(`${getApiUrl()}/marketing/campaigns`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/marketing/campaigns", "POST");
}
