import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "./api";

export async function proxyJsonRequest(
  request: Request,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const body = method === "DELETE" ? undefined : await request.text();
  const response = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
