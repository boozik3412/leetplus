import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const response = await fetch(`${getApiUrl()}/staff/knowledge-base/settings`, {
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

export async function PUT(request: Request) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const response = await fetch(`${getApiUrl()}/staff/knowledge-base/settings`, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
