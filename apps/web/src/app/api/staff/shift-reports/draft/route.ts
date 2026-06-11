import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

export async function GET(request: Request) {
  const headers = await getAuthHeaders();
  const url = new URL(request.url);

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const response = await fetch(
    `${getApiUrl()}/staff/shift-reports/draft${url.search}`,
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
