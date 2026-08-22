import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
import { resolveTeamChatEventUpstreamQuery } from "@/lib/team-chat-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_EVENT_STREAM_HEADERS = {
  "Cache-Control": "private, no-store, no-transform, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

export async function GET(request: Request) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401, headers: PRIVATE_EVENT_STREAM_HEADERS },
    );
  }

  const upstreamQuery = resolveTeamChatEventUpstreamQuery(request.url);

  if (upstreamQuery === null) {
    return NextResponse.json(
      { message: "Некорректный фильтр канала" },
      { status: 400, headers: PRIVATE_EVENT_STREAM_HEADERS },
    );
  }

  const response = await fetch(
    `${getApiUrl()}/staff/team-chat/events${upstreamQuery}`,
    {
      headers: {
        ...headers,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal: request.signal,
    },
  );

  if (!response.ok || !response.body) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status, headers: PRIVATE_EVENT_STREAM_HEADERS },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      ...PRIVATE_EVENT_STREAM_HEADERS,
    },
  });
}
