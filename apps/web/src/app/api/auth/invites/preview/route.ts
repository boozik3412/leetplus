import { getApiUrl, requestJsonWithTimeout } from "@/lib/api";
import { projectInvitePreview } from "@/lib/invite-transport-core.mts";
import {
  inviteJson,
  readInviteRequest,
  safeInviteError,
} from "../transport";

const PREVIEW_FIELDS = new Set(["token"]);

export async function POST(request: Request) {
  const parsed = await readInviteRequest(request, PREVIEW_FIELDS);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { token } = parsed.payload;
  try {
    const result = await requestJsonWithTimeout<unknown>(
      `${getApiUrl()}/auth/invites/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );

    if (!result.ok) {
      return inviteJson(
        { message: safeInviteError(result.error, token) },
        { status: result.status || 502 },
      );
    }

    const preview = projectInvitePreview(result.data, token);
    if (!preview) {
      return inviteJson(
        { message: "Сервис приглашений вернул некорректный ответ" },
        { status: 502 },
      );
    }

    return inviteJson(preview, { status: 200 });
  } catch {
    return inviteJson(
      { message: "Сервис приглашений временно недоступен" },
      { status: 502 },
    );
  }
}
