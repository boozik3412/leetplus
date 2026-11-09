import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FACEIT_DAILY_COUNTED_CAP,
  faceitMatchEligibility,
  faceitMissionFacts,
  opposingLinkedPlayers,
  parseFaceitHistory,
  parseFaceitMatchStats,
  sessionForMatch,
  type ClubSessionWindow,
  type FaceitJournalDecision,
} from './faceit-match-journal';
import {
  createGuestGameExternalFetch,
  type GuestGameExternalFetch,
} from './guest-game-external-fetch';

/**
 * Worker-only pass: fills public facts of linked Steam accounts and finds the
 * FACEIT account by the verified SteamID. The Steam Web API and FACEIT keys
 * live only in the worker profile (GUEST_GAME_STEAM_WEB_API_KEY,
 * GUEST_GAME_FACEIT_API_KEY); without a key that part is skipped.
 *
 * Steam Web API terms: data is fetched only for accounts the guest linked
 * themselves. FACEIT Data API publishes no rate numbers, so a 429 ends the
 * pass for this tick.
 */

const STEAM_API = 'https://api.steampowered.com';
const FACEIT_API = 'https://open.faceit.com/data/v4';
const REQUEST_TIMEOUT_MS = 5_000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_FAILED_AFTER_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
/** FACEIT history is read only this far back, even for an old link. */
const MATCH_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Recent matches wait so FACEIT stats are final. */
const MATCH_SETTLE_MS = 10 * 60 * 1000;
const MATCH_ACCOUNTS_PER_TICK = 10;
const MATCH_STATS_PER_TICK = 20;

export type FaceitMatchSyncResult = {
  accounts: number;
  journaled: number;
  counted: number;
  review: number;
  rateLimited: boolean;
  unreachable: boolean;
  skipped: string | null;
};

export type GuestGameAccountsLookupResult = {
  checked: number;
  found: number;
  notFound: number;
  failed: number;
  rateLimited: boolean;
  skipped: string | null;
};

type SteamSummary = {
  nickname: string | null;
  avatarUrl: string | null;
  bans: { vac: boolean; gameBans: number; community: boolean } | null;
};

type FaceitLookup =
  | {
      status: 'FOUND';
      playerId: string;
      nickname: string;
      level: number | null;
      elo: number | null;
    }
  | { status: 'NOT_FOUND' }
  | { status: 'FAILED'; reason: string }
  | { status: 'RATE_LIMITED' };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 200) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function httpsUrl(value: unknown) {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

export function parseFaceitPlayer(
  body: unknown,
  steamId64: string,
): FaceitLookup {
  const player = record(body);
  const playerId = text(player.player_id, 64);
  const nickname = text(player.nickname, 64);
  const cs2 = record(record(player.games).cs2);
  const gamePlayerId = text(cs2.game_player_id, 32);
  const steamField = text(player.steam_id_64, 32);

  if (!playerId || !nickname) {
    return { status: 'FAILED', reason: 'FACEIT_RESPONSE_INVALID' };
  }

  // The account must be bound to exactly this Steam account on FACEIT.
  if (gamePlayerId !== steamId64 && steamField !== steamId64) {
    return { status: 'NOT_FOUND' };
  }

  return {
    status: 'FOUND',
    playerId,
    nickname,
    level: finite(cs2.skill_level),
    elo: finite(cs2.faceit_elo),
  };
}

@Injectable()
export class GuestGameAccountsLookupService {
  private readonly fetchImpl: GuestGameExternalFetch;

  constructor(private readonly prisma: PrismaService) {
    this.fetchImpl = createGuestGameExternalFetch(process.env);
  }

  async lookupTenant(
    tenantId: string,
    now = new Date(),
    env: NodeJS.ProcessEnv = process.env,
    limit = DEFAULT_LIMIT,
  ): Promise<GuestGameAccountsLookupResult> {
    const faceitKey = env.GUEST_GAME_FACEIT_API_KEY?.trim() || null;
    const steamKey = env.GUEST_GAME_STEAM_WEB_API_KEY?.trim() || null;
    const result: GuestGameAccountsLookupResult = {
      checked: 0,
      found: 0,
      notFound: 0,
      failed: 0,
      rateLimited: false,
      skipped: null,
    };

    if (!faceitKey && !steamKey) {
      result.skipped = 'no provider keys';
      return result;
    }

    const accounts = await this.prisma.guestGameExternalAccount.findMany({
      where: {
        tenantId,
        provider: 'STEAM',
        status: 'ACTIVE',
        OR: [
          { checkedAt: null },
          ...(faceitKey
            ? [
                { lookupStatus: 'PENDING' },
                {
                  lookupStatus: 'FAILED',
                  checkedAt: {
                    lt: new Date(now.getTime() - RETRY_FAILED_AFTER_MS),
                  },
                },
              ]
            : []),
          { checkedAt: { lt: new Date(now.getTime() - REFRESH_AFTER_MS) } },
        ],
      },
      orderBy: [
        { checkedAt: { sort: 'asc', nulls: 'first' } },
        { linkedAt: 'asc' },
      ],
      take: limit,
    });

    if (accounts.length === 0) {
      return result;
    }

    const summaries = steamKey
      ? await this.steamSummaries(
          steamKey,
          accounts.map((account) => account.externalId),
        )
      : new Map<string, SteamSummary>();

    for (const account of accounts) {
      const faceit: FaceitLookup | null = faceitKey
        ? await this.faceitLookup(faceitKey, account.externalId)
        : null;

      if (faceit?.status === 'RATE_LIMITED') {
        result.rateLimited = true;
        break;
      }

      result.checked += 1;
      const summary = summaries.get(account.externalId) ?? null;
      const details = {
        ...record(account.details),
        ...(summary
          ? {
              avatarUrl: summary.avatarUrl,
              steamBans: summary.bans,
              steamCheckedAt: now.toISOString(),
            }
          : {}),
        ...(faceit?.status === 'FAILED' ? { faceitError: faceit.reason } : {}),
      } as Prisma.InputJsonObject;
      const lookupStatus = faceit ? faceit.status : account.lookupStatus;

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.guestGameExternalAccount.updateMany({
            where: { id: account.id, tenantId, status: 'ACTIVE' },
            data: {
              nickname: summary?.nickname ?? account.nickname,
              details,
              lookupStatus,
              checkedAt: now,
            },
          });

          if (faceit?.status !== 'FOUND') {
            if (faceit?.status === 'NOT_FOUND') {
              await tx.guestGameExternalAccount.updateMany({
                where: {
                  tenantId,
                  profileId: account.profileId,
                  provider: 'FACEIT',
                  status: 'ACTIVE',
                },
                data: { status: 'UNLINKED', unlinkedAt: now },
              });
            }
            return;
          }

          const current = await tx.guestGameExternalAccount.findFirst({
            where: {
              tenantId,
              profileId: account.profileId,
              provider: 'FACEIT',
              status: 'ACTIVE',
            },
          });
          const faceitDetails = {
            level: faceit.level,
            elo: faceit.elo,
            steamId: account.externalId,
          };

          if (current && current.externalId === faceit.playerId) {
            await tx.guestGameExternalAccount.update({
              where: { id: current.id },
              data: {
                nickname: faceit.nickname,
                details: faceitDetails,
                lookupStatus: 'FOUND',
                checkedAt: now,
              },
            });
            return;
          }

          if (current) {
            await tx.guestGameExternalAccount.update({
              where: { id: current.id },
              data: { status: 'UNLINKED', unlinkedAt: now },
            });
          }

          await tx.guestGameExternalAccount.create({
            data: {
              tenantId,
              profileId: account.profileId,
              provider: 'FACEIT',
              externalId: faceit.playerId,
              nickname: faceit.nickname,
              status: 'ACTIVE',
              verifiedVia: 'STEAM_ID_MATCH',
              linkedAt: now,
              lookupStatus: 'FOUND',
              checkedAt: now,
              details: faceitDetails,
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // The FACEIT account is active on another profile of the network.
          await this.prisma.guestGameExternalAccount.updateMany({
            where: { id: account.id, tenantId },
            data: {
              lookupStatus: 'FAILED',
              checkedAt: now,
              details: { ...details, faceitError: 'FACEIT_LINKED_ELSEWHERE' },
            },
          });
          result.failed += 1;
          continue;
        }
        throw error;
      }

      if (faceit?.status === 'FOUND') result.found += 1;
      else if (faceit?.status === 'NOT_FOUND') result.notFound += 1;
      else if (faceit?.status === 'FAILED') result.failed += 1;

      // An unreachable provider (egress, outage) would only burn the tick.
      if (
        faceit?.status === 'FAILED' &&
        faceit.reason === 'FACEIT_UNREACHABLE'
      ) {
        break;
      }
    }

    return result;
  }

  /**
   * Reads FACEIT CS2 history of linked accounts and journals each new match
   * with a decision. Only COUNTED rows become game events (in the
   * gamification pass); a match counts only inside a paid club session.
   */
  async syncFaceitMatches(
    tenantId: string,
    now = new Date(),
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<FaceitMatchSyncResult> {
    const key = env.GUEST_GAME_FACEIT_API_KEY?.trim() || null;
    const result: FaceitMatchSyncResult = {
      accounts: 0,
      journaled: 0,
      counted: 0,
      review: 0,
      rateLimited: false,
      unreachable: false,
      skipped: null,
    };
    if (!key) {
      result.skipped = 'no FACEIT key';
      return result;
    }

    const to = new Date(now.getTime() - MATCH_SETTLE_MS);
    const accounts = await this.prisma.guestGameExternalAccount.findMany({
      where: {
        tenantId,
        provider: 'FACEIT',
        status: 'ACTIVE',
        OR: [{ matchesSyncedUntil: null }, { matchesSyncedUntil: { lt: to } }],
      },
      orderBy: [
        { matchesSyncedUntil: { sort: 'asc', nulls: 'first' } },
        { linkedAt: 'asc' },
      ],
      take: MATCH_ACCOUNTS_PER_TICK,
    });
    if (!accounts.length) return result;

    const linked = await this.prisma.guestGameExternalAccount.findMany({
      where: { tenantId, provider: 'FACEIT', status: 'ACTIVE' },
      select: { externalId: true },
    });
    const linkedPlayerIds = new Set(linked.map((row) => row.externalId));
    let statsBudget = MATCH_STATS_PER_TICK;

    for (const account of accounts) {
      const from = new Date(
        Math.max(
          account.linkedAt.getTime(),
          account.matchesSyncedUntil?.getTime() ?? 0,
          now.getTime() - MATCH_LOOKBACK_MS,
        ),
      );
      if (from >= to) continue;

      const history = await this.faceitGet(
        key,
        `/players/${encodeURIComponent(account.externalId)}/history?game=cs2&from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}&offset=0&limit=20`,
      );
      if (history.kind === 'RATE_LIMITED') {
        result.rateLimited = true;
        break;
      }
      if (history.kind === 'UNREACHABLE') {
        result.unreachable = true;
        break;
      }
      result.accounts += 1;
      if (history.kind !== 'OK') {
        continue;
      }

      const items = parseFaceitHistory(history.body).sort(
        (a, b) =>
          (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0),
      );
      const known = new Set(
        (
          await this.prisma.guestGameExternalMatch.findMany({
            where: {
              tenantId,
              provider: 'FACEIT',
              accountId: account.id,
              externalMatchId: { in: items.map((item) => item.matchId) },
            },
            select: { externalMatchId: true },
          })
        ).map((row) => row.externalMatchId),
      );
      const sessions = await this.clubSessions(
        tenantId,
        account.profileId,
        from,
        now,
      );
      let syncedUntil = to;
      let stopped = false;

      for (const item of items) {
        if (known.has(item.matchId) || !item.finishedAt) continue;
        if (item.finishedAt < account.linkedAt) continue;
        let decision: FaceitJournalDecision = 'COUNTED';
        let reason: string | null = faceitMatchEligibility(item);
        let session: ClubSessionWindow | null = null;
        let facts: ReturnType<typeof faceitMissionFacts> = null;

        if (reason) {
          decision = 'NOT_ELIGIBLE';
        } else {
          session = sessionForMatch(
            sessions,
            item.startedAt as Date,
            item.finishedAt,
            now,
          );
          if (!session) {
            decision = 'OUTSIDE_SESSION';
          }
        }

        if (decision === 'COUNTED') {
          if (statsBudget <= 0) {
            // Leave the rest of this account for the next tick.
            syncedUntil = new Date(item.finishedAt.getTime() - 1000);
            stopped = true;
            break;
          }
          statsBudget -= 1;
          const statsResponse = await this.faceitGet(
            key,
            `/matches/${encodeURIComponent(item.matchId)}/stats`,
          );
          if (
            statsResponse.kind === 'RATE_LIMITED' ||
            statsResponse.kind === 'UNREACHABLE'
          ) {
            result.rateLimited ||= statsResponse.kind === 'RATE_LIMITED';
            result.unreachable ||= statsResponse.kind === 'UNREACHABLE';
            syncedUntil = new Date(item.finishedAt.getTime() - 1000);
            stopped = true;
            break;
          }
          const stats =
            statsResponse.kind === 'OK'
              ? parseFaceitMatchStats(statsResponse.body)
              : null;
          facts = stats ? faceitMissionFacts(stats, account.externalId) : null;
          if (!stats || !facts) {
            decision = 'NOT_ELIGIBLE';
            reason = 'NO_PLAYER_STATS';
          } else if (
            opposingLinkedPlayers(stats, account.externalId, linkedPlayerIds)
              .length
          ) {
            decision = 'REVIEW';
            reason = 'LINKED_GUEST_ON_OTHER_TEAM';
          } else {
            const countedToday = await this.prisma.guestGameExternalMatch.count(
              {
                where: {
                  tenantId,
                  profileId: account.profileId,
                  decision: 'COUNTED',
                  finishedAt: {
                    gt: new Date(
                      item.finishedAt.getTime() - 24 * 60 * 60 * 1000,
                    ),
                    lte: item.finishedAt,
                  },
                },
              },
            );
            if (countedToday >= FACEIT_DAILY_COUNTED_CAP) {
              decision = 'NOT_ELIGIBLE';
              reason = 'DAILY_CAP';
            }
          }
        }

        await this.prisma.guestGameExternalMatch.createMany({
          data: [
            {
              tenantId,
              profileId: account.profileId,
              accountId: account.id,
              provider: 'FACEIT',
              externalMatchId: item.matchId,
              game: 'cs2',
              startedAt: item.startedAt,
              finishedAt: item.finishedAt,
              sessionExternalId: session?.externalSessionId ?? null,
              externalDomain: session?.externalDomain ?? null,
              decision,
              decisionReason: decision === 'COUNTED' ? null : reason,
              stats: {
                ...(facts ? { match: facts } : {}),
                ...(session
                  ? {
                      session: {
                        storeId: session.storeId,
                        startedAt: session.startedAt?.toISOString() ?? null,
                        stoppedAt: session.stoppedAt?.toISOString() ?? null,
                      },
                    }
                  : {}),
              },
            },
          ],
          skipDuplicates: true,
        });
        result.journaled += 1;
        if (decision === 'COUNTED') result.counted += 1;
        if (decision === 'REVIEW') result.review += 1;
      }

      await this.prisma.guestGameExternalAccount.updateMany({
        where: { id: account.id, tenantId, status: 'ACTIVE' },
        data: { matchesSyncedUntil: syncedUntil },
      });
      if (stopped && (result.rateLimited || result.unreachable)) break;
    }

    return result;
  }

  private async clubSessions(
    tenantId: string,
    profileId: string,
    from: Date,
    now: Date,
  ): Promise<ClubSessionWindow[]> {
    const [profile, links] = await Promise.all([
      this.prisma.guestGameProfile.findFirst({
        where: { id: profileId, tenantId },
        select: { guestId: true },
      }),
      this.prisma.guestGameProfileIdentityLink.findMany({
        where: { tenantId, profileId, status: 'ACTIVE' },
        select: { guestId: true },
      }),
    ]);
    const guestIds = [
      ...new Set(
        [profile?.guestId, ...links.map((link) => link.guestId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (!guestIds.length) return [];

    const rows = await this.prisma.guestSession.findMany({
      where: {
        tenantId,
        guestId: { in: guestIds },
        startedAt: {
          gte: new Date(from.getTime() - 24 * 60 * 60 * 1000),
          lte: now,
        },
      },
      select: {
        externalSessionId: true,
        externalDomain: true,
        storeId: true,
        startedAt: true,
        stoppedAt: true,
      },
      orderBy: { startedAt: 'asc' },
      take: 500,
    });

    return rows;
  }

  private async faceitGet(
    key: string,
    path: string,
  ): Promise<
    | { kind: 'OK'; body: unknown }
    | { kind: 'NOT_FOUND' | 'FAILED' | 'RATE_LIMITED' | 'UNREACHABLE' }
  > {
    try {
      const { status, body } = await this.getJson(`${FACEIT_API}${path}`, {
        Authorization: `Bearer ${key}`,
      });
      if (status === 200) return { kind: 'OK', body };
      if (status === 404) return { kind: 'NOT_FOUND' };
      if (status === 429) return { kind: 'RATE_LIMITED' };
      return { kind: 'FAILED' };
    } catch {
      return { kind: 'UNREACHABLE' };
    }
  }

  private async getJson(url: string, headers: Record<string, string> = {}) {
    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = response.ok ? ((await response.json()) as unknown) : null;

    return { status: response.status, body };
  }

  private async steamSummaries(key: string, steamIds: string[]) {
    const result = new Map<string, SteamSummary>();
    const ids = steamIds.join(',');

    try {
      const [summaries, bans] = await Promise.all([
        this.getJson(
          `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${ids}`,
        ),
        this.getJson(
          `${STEAM_API}/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(key)}&steamids=${ids}`,
        ),
      ]);
      const players = record(record(summaries.body).response).players;
      const banRows = record(bans.body).players;

      for (const row of Array.isArray(players) ? players : []) {
        const player = record(row);
        const steamId = text(player.steamid, 32);
        if (!steamId) continue;
        result.set(steamId, {
          nickname: text(player.personaname, 64),
          avatarUrl: httpsUrl(player.avatarfull),
          bans: null,
        });
      }

      for (const row of Array.isArray(banRows) ? banRows : []) {
        const ban = record(row);
        const steamId = text(ban.SteamId, 32);
        if (!steamId) continue;
        const summary = result.get(steamId) ?? {
          nickname: null,
          avatarUrl: null,
          bans: null,
        };
        summary.bans = {
          vac: ban.VACBanned === true,
          gameBans: finite(ban.NumberOfGameBans) ?? 0,
          community: ban.CommunityBanned === true,
        };
        result.set(steamId, summary);
      }
    } catch {
      // Steam profile facts are cosmetic here; FACEIT lookup still runs.
    }

    return result;
  }

  private async faceitLookup(
    key: string,
    steamId64: string,
  ): Promise<FaceitLookup> {
    try {
      const { status, body } = await this.getJson(
        `${FACEIT_API}/players?game=cs2&game_player_id=${encodeURIComponent(steamId64)}`,
        { Authorization: `Bearer ${key}` },
      );

      if (status === 404) return { status: 'NOT_FOUND' };
      if (status === 429) return { status: 'RATE_LIMITED' };
      if (status !== 200)
        return { status: 'FAILED', reason: `FACEIT_HTTP_${status}` };

      return parseFaceitPlayer(body, steamId64);
    } catch {
      return { status: 'FAILED', reason: 'FACEIT_UNREACHABLE' };
    }
  }
}
