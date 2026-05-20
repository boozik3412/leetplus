import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

export async function GET() {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }

  const response = await fetch(
    `${getApiUrl()}/integrations/langame/guests/foundation/sync/status`,
    {
      cache: "no-store",
      headers,
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
