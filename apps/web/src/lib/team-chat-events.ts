const CHANNEL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveTeamChatEventUpstreamQuery(requestUrl: string) {
  const url = new URL(requestUrl);
  const channelIds = url.searchParams.getAll("channelId");
  const hasUnknownSelector = [...url.searchParams.keys()].some(
    (key) => key !== "channelId",
  );

  if (
    hasUnknownSelector ||
    channelIds.length > 1 ||
    (channelIds[0] !== undefined && !CHANNEL_ID_PATTERN.test(channelIds[0]))
  ) {
    return null;
  }

  const upstreamQuery = new URLSearchParams();

  if (channelIds[0]) {
    upstreamQuery.set("channelId", channelIds[0]);
  }

  return upstreamQuery.size > 0 ? `?${upstreamQuery.toString()}` : "";
}
