import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
import { proxyJsonRequest } from "@/lib/proxy";

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json({ message: "Необходимо войти в аккаунт" }, { status: 401 });
  }

  const response = await fetch(`${getApiUrl()}/reports/oos-exclusions`, {
    cache: "no-store",
    headers,
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
  return proxyJsonRequest(request, "/reports/oos-exclusions", "POST");
}
