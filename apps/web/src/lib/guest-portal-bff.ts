const GUEST_PORTAL_GET_QUERY_ALLOWLIST = new Map<string, readonly string[]>([
  ["gamification/clubs", ["lat", "lng", "radiusKm"]],
  ["session/game-missions", ["offset", "limit"]],
]);

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
