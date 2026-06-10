import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const { id } = await params;
  const response = await fetch(
    `${getApiUrl()}/guests/${encodeURIComponent(id)}/live-session`,
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
