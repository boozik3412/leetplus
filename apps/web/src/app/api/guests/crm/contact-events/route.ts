import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  // Only ?leadId= is forwarded: the lead card reads its own contact feed.
  const leadId = new URL(request.url).searchParams.get("leadId");
  const query = leadId ? `?leadId=${encodeURIComponent(leadId)}` : "";
  const response = await fetch(
    `${getApiUrl()}/guests/crm/contact-events${query}`,
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

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/guests/crm/contact-events", "POST");
}
