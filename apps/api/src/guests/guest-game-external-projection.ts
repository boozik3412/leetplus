import type { Prisma } from '@prisma/client';

/**
 * Read-only projection of a guest's linked game accounts (Steam, FACEIT) and
 * the FACEIT match journal for the guest card. Pure mapping: the service reads
 * the rows with Prisma; nothing here calls Steam or FACEIT.
 *
 * Exposed: provider, public nickname and public account id (SteamID64 /
 * FACEIT player id, both visible on the providers' public profiles), Steam ban
 * flags, FACEIT level/elo, lookup status and the journal decision with the
 * player's own match statistics. Not exposed: avatar URLs, raw provider
 * payloads, other players of the match.
 */

export const GUEST_GAME_DETAIL_EXTERNAL_MATCH_ROWS = 20;

export type GuestGameExternalAccountDetail = {
  id: string;
  /** 'STEAM' or 'FACEIT'. */
  provider: string;
  status: string;
  nickname: string | null;
  externalId: string;
  profileUrl: string | null;
  linkedAt: string;
  unlinkedAt: string | null;
  lookupStatus: string;
  lookupError: string | null;
  checkedAt: string | null;
  matchesSyncedUntil: string | null;
  faceitLevel: number | null;
  faceitElo: number | null;
  steamBans: { vac: boolean; gameBans: number; community: boolean } | null;
};

export type GuestGameExternalMatchDetail = {
  id: string;
  provider: string;
  game: string;
  externalMatchId: string;
  matchUrl: string | null;
  startedAt: string | null;
  finishedAt: string;
  decision: string;
  decisionReason: string | null;
  storeName: string | null;
  map: string | null;
  result: 'WIN' | 'LOSS' | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd: number | null;
  adr: number | null;
  hsPercent: number | null;
  mvps: number | null;
  aces: number | null;
  eventId: string | null;
  xpDelta: number | null;
  reviewedAt: string | null;
};

export type GuestGameExternalMatchTotals = {
  total: number;
  counted: number;
  outsideSession: number;
  notEligible: number;
  review: number;
};

export type GuestGameExternalAccountRow = {
  id: string;
  provider: string;
  externalId: string;
  nickname: string | null;
  status: string;
  linkedAt: Date;
  unlinkedAt: Date | null;
  lookupStatus: string;
  checkedAt: Date | null;
  matchesSyncedUntil: Date | null;
  details: Prisma.JsonValue | null;
};

export type GuestGameExternalMatchRow = {
  id: string;
  provider: string;
  game: string;
  externalMatchId: string;
  startedAt: Date | null;
  finishedAt: Date;
  decision: string;
  decisionReason: string | null;
  stats: Prisma.JsonValue | null;
  eventId: string | null;
  reviewedAt: Date | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function shortText(value: unknown, max = 128) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

const STEAM_ID_PATTERN = /^\d{17}$/;
const FACEIT_MATCH_ID_PATTERN = /^[A-Za-z0-9-]{1,80}$/;

export function externalAccountProfileUrl(
  provider: string,
  externalId: string,
  nickname: string | null,
) {
  if (provider === 'STEAM' && STEAM_ID_PATTERN.test(externalId)) {
    return `https://steamcommunity.com/profiles/${externalId}`;
  }
  if (provider === 'FACEIT' && nickname && /^[\w.-]{1,64}$/.test(nickname)) {
    return `https://www.faceit.com/ru/players/${nickname}`;
  }
  return null;
}

export function externalMatchUrl(
  provider: string,
  game: string,
  externalMatchId: string,
) {
  if (
    provider === 'FACEIT' &&
    game === 'cs2' &&
    FACEIT_MATCH_ID_PATTERN.test(externalMatchId)
  ) {
    return `https://www.faceit.com/ru/cs2/room/${externalMatchId}`;
  }
  return null;
}

export function toExternalAccountDetail(
  row: GuestGameExternalAccountRow,
): GuestGameExternalAccountDetail {
  const details = record(row.details);
  const bans = record(details.steamBans);
  const hasBans = Object.keys(bans).length > 0;

  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    nickname: row.nickname,
    externalId: row.externalId,
    profileUrl: externalAccountProfileUrl(
      row.provider,
      row.externalId,
      row.nickname,
    ),
    linkedAt: row.linkedAt.toISOString(),
    unlinkedAt: row.unlinkedAt?.toISOString() ?? null,
    lookupStatus: row.lookupStatus,
    lookupError: shortText(details.faceitError, 64),
    checkedAt: row.checkedAt?.toISOString() ?? null,
    matchesSyncedUntil: row.matchesSyncedUntil?.toISOString() ?? null,
    faceitLevel: row.provider === 'FACEIT' ? finite(details.level) : null,
    faceitElo: row.provider === 'FACEIT' ? finite(details.elo) : null,
    steamBans:
      row.provider === 'STEAM' && hasBans
        ? {
            vac: bans.vac === true,
            gameBans: finite(bans.gameBans) ?? 0,
            community: bans.community === true,
          }
        : null,
  };
}

export function toExternalMatchDetail(
  row: GuestGameExternalMatchRow,
  storeNames: ReadonlyMap<string, string>,
  eventXp: ReadonlyMap<string, number>,
): GuestGameExternalMatchDetail {
  const stats = record(row.stats);
  const match = record(stats.match);
  const session = record(stats.session);
  const storeId = shortText(session.storeId, 64);
  const result =
    match.result === 'WIN' || match.result === 'LOSS' ? match.result : null;

  return {
    id: row.id,
    provider: row.provider,
    game: row.game,
    externalMatchId: row.externalMatchId,
    matchUrl: externalMatchUrl(row.provider, row.game, row.externalMatchId),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt.toISOString(),
    decision: row.decision,
    decisionReason: row.decisionReason,
    storeName: storeId ? (storeNames.get(storeId) ?? null) : null,
    map: shortText(match.map, 64),
    result,
    kills: finite(match.kills),
    deaths: finite(match.deaths),
    assists: finite(match.assists),
    kd: finite(match.kd),
    adr: finite(match.adr),
    hsPercent: finite(match.hsPercent),
    mvps: finite(match.mvps),
    aces: finite(match.aces),
    eventId: row.eventId,
    xpDelta: row.eventId ? (eventXp.get(row.eventId) ?? null) : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/** Store ids referenced by the journal rows (session club of each match). */
export function externalMatchStoreIds(rows: GuestGameExternalMatchRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const storeId = shortText(record(record(row.stats).session).storeId, 64);
    if (storeId) ids.add(storeId);
  }
  return [...ids];
}

export function externalMatchTotals(
  groups: Array<{ decision: string; _count: { _all: number } }>,
): GuestGameExternalMatchTotals {
  const totals: GuestGameExternalMatchTotals = {
    total: 0,
    counted: 0,
    outsideSession: 0,
    notEligible: 0,
    review: 0,
  };
  for (const group of groups) {
    const count = group._count._all;
    totals.total += count;
    if (group.decision === 'COUNTED') totals.counted += count;
    else if (group.decision === 'OUTSIDE_SESSION')
      totals.outsideSession += count;
    else if (group.decision === 'NOT_ELIGIBLE') totals.notEligible += count;
    else if (group.decision === 'REVIEW') totals.review += count;
  }
  return totals;
}
