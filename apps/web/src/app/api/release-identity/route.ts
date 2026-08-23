import "server-only";

import { NextResponse } from "next/server";

import { resolveWebReleaseIdentity } from "@/lib/web-release-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET() {
  try {
    const release = await resolveWebReleaseIdentity(
      {
        RELEASE_SHA: process.env.RELEASE_SHA,
        WEB_BUILD_ID: process.env.WEB_BUILD_ID,
      },
      process.cwd(),
    );

    return NextResponse.json(
      { ok: true, release },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "WEB_RELEASE_IDENTITY_UNAVAILABLE" },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
}
