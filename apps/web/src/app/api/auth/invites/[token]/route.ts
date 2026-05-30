import { NextResponse } from "next/server";
import { getApiUrl, readApiError } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const response = await fetch(
    `${getApiUrl()}/auth/invites/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
