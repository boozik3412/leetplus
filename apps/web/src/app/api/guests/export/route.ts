import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

export async function GET(request: Request) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const response = await fetch(`${getApiUrl()}/guests/export${url.search}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition":
        response.headers.get("content-disposition") ??
        'attachment; filename="leetplus-guests.csv"',
    },
  });
}
