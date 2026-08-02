import { NextResponse } from "next/server";
import {
  INVITE_ERROR_MESSAGE,
  parseInviteRequest,
} from "@/lib/invite-transport-core.mts";

export { safeInviteError } from "@/lib/invite-transport-core.mts";

type InviteRequestResult =
  | {
      ok: true;
      payload: Record<string, unknown> & { token: string };
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function readInviteRequest(
  request: Request,
  allowedFields: ReadonlySet<string>,
): Promise<InviteRequestResult> {
  const parsed = await parseInviteRequest(request, allowedFields);
  return parsed.ok
    ? parsed
    : {
        ok: false,
        response: inviteJson(
          { message: INVITE_ERROR_MESSAGE },
          { status: parsed.status },
        ),
      };
}

export function inviteJson(
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
