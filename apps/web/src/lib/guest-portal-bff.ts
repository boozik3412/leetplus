const GUEST_PORTAL_GET_QUERY_ALLOWLIST = new Map<string, readonly string[]>([
  ["gamification/clubs", ["lat", "lng", "radiusKm"]],
  ["session/game-missions", ["offset", "limit"]],
]);

type GuestPortalPostBodyProjection =
  | { ok: true; body: string }
  | { ok: false; status: 400 | 404; message: string };

export function resolveGuestPortalGetUpstreamQuery(
  path: readonly string[],
  requestUrl: string,
): string | null {
  const url = new URL(requestUrl);
  const routeKey = path.join("/");
  const allowed = GUEST_PORTAL_GET_QUERY_ALLOWLIST.get(routeKey) ?? [];

  if (!url.search) {
    return "";
  }

  if (allowed.length === 0) {
    return null;
  }

  const allowedSet = new Set(allowed);
  const upstreamParams = new URLSearchParams();

  for (const [key, value] of url.searchParams.entries()) {
    if (!allowedSet.has(key) || upstreamParams.has(key) || !value.trim()) {
      return null;
    }

    upstreamParams.set(key, value);
  }

  const search = upstreamParams.toString();

  return search ? `?${search}` : "";
}

export function projectGuestPortalPostBody(
  path: readonly string[],
  body: string,
): GuestPortalPostBodyProjection {
  const allowedFields = resolveGuestPortalPostBodyFields(path);

  if (!allowedFields) {
    return {
      ok: false,
      status: 404,
      message: "Маршрут гостевого модуля недоступен через web BFF.",
    };
  }

  if (!body.trim()) {
    return { ok: true, body: allowedFields.length > 0 ? "{}" : "" };
  }

  const payload = parseJsonObject(body);

  if (!payload) {
    return {
      ok: false,
      status: 400,
      message: "Тело запроса гостевого модуля должно быть JSON-объектом.",
    };
  }

  const allowedSet = new Set(allowedFields);
  const projected: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedSet.has(key)) {
      return {
        ok: false,
        status: 400,
        message: "Недопустимые поля запроса гостевого модуля.",
      };
    }

    projected[key] = value;
  }

  return { ok: true, body: JSON.stringify(projected) };
}

function resolveGuestPortalPostBodyFields(
  path: readonly string[],
): readonly string[] | null {
  if (path.length === 2) {
    if (path[0] === "telegram-mini-app" && path[1] === "session") {
      return ["initData", "clubId", "tenantSlug", "storeId"];
    }

    if (path[0] !== "session") {
      return null;
    }

    switch (path[1]) {
      case "app-open":
        return ["surface"];
      case "check-in":
        return ["note"];
      case "langame-details":
        return [];
      case "langame-match":
        return ["phone"];
      case "profile":
        return ["displayName"];
      case "select-club":
        return ["clubId", "tenantSlug", "storeId"];
      default:
        return null;
    }
  }

  if (path.length === 3 && path[0] === "session") {
    switch (`${path[1]}/${path[2]}`) {
      case "reward-wallet/claim-all":
        return [];
      case "communications/messenger":
        return ["channel", "identity"];
      case "communications/preferences":
        return ["action"];
      default:
        return null;
    }
  }

  if (path.length === 4 && path[0] === "session") {
    switch (`${path[1]}/${path[3]}`) {
      case "completion-notifications/acknowledge":
      case "loot-boxes/open":
        return [];
      case "communications/start":
        return path[2] === "telegram-link" ? [] : null;
      default:
        return null;
    }
  }

  if (
    path.length === 5 &&
    path[0] === "session" &&
    path[1] === "reward-wallet" &&
    path[2] === "items"
  ) {
    return path[4] === "claim" || path[4] === "open" ? [] : null;
  }

  if (path.length === 4) {
    const action = `${path[2]}/${path[3]}`;

    switch (action) {
      case "otp/start":
      case "user-call-auth/start":
      case "incoming-call-last4/start":
        return ["phone", "gameConsentAccepted"];
      case "otp/verify":
      case "incoming-call-last4/verify":
        return ["challengeId", "code", "referralCode"];
      case "telegram-auth/start":
        return ["gameConsentAccepted"];
      case "telegram-auth/status":
      case "user-call-auth/status":
        return ["challengeId", "referralCode"];
      default:
        return null;
    }
  }

  return null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
