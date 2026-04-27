import { NextResponse } from "next/server";
import { getApiUrl, readApiError, type ApiErrorResponse } from "@/lib/api";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
  };

  const response = await fetch(`${getApiUrl()}/auth/resend-verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readApiError(response);
    return NextResponse.json<ApiErrorResponse>(
      { message },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
