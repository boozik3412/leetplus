import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEADERBOARD_MIN_SESSION_MINUTES,
  LEADERBOARD_NETWORK_SCOPE_KEY,
  enabledLeaderboardBoards,
  leaderboardMonth,
  leaderboardPlayerName,
  leaderboardPrizeLootBoxIds,
  leaderboardPrizes,
  leaderboardTarget,
  leaderboardTotals,
  leaderboardVisibleRows,
  networkTimeZone,
  normalizeLeaderboardConfig,
  rankLeaderboard,
  safeTimeZone,
  type GuestLeaderboardConfig,
  type LeaderboardActivityRow,
  type LeaderboardBoard,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type LeaderboardStanding,
} from './guest-leaderboard-core';

/**
 * Read side of the guest leaderboard. Depends on Prisma only, so both the
 * public guest runtime (GuestPortalService) and the corporate administration
 * can use it without importing each other's modules. It never writes.
 *
 * Sources (all after `gameActivatedAt`, staff-test profiles excluded):
 * - play time and sessions: canonical `GuestActivityFact` play-time facts, one
 *   per Langame session, attributed to the club (GuestSession.storeId is NULL
 *   for clubs sharing a Langame domain);
 * - check-ins: `CHECK_IN_PERFORMED` facts;
 * - missions: reward-wallet items from missions and Battle Pass steps;
 * - cases: opened (CLAIMED) case items of the reward wallet.
 */

const PLAY_TIME_FACT_TYPES = [
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
  'SESSION_PLAY_TIME_ACCUMULATED',
] as const;
/** One session longer than a day is a source error, not play. */
const MAX_SESSION_MINUTES = 24 * 60;
const OPEN_WINDOW_TTL_MS = 5 * 60 * 1000;
const CLOSED_WINDOW_TTL_MS = 60 * 60 * 1000;
const SETTINGS_TTL_MS = 60 * 1000;
const MOVEMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MOVEMENT_QUANTUM_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 300;

export type GuestLeaderboardSettingsState = {
  enabled: boolean;
  config: GuestLeaderboardConfig;
  revision: number;
  updatedAt: Date | null;
};

export type LeaderboardStore = {
  id: string;
  name: string;
  timeZone: string | null;
};

export type GuestLeaderboardEntry = {
  rank: number;
  name: string;
  value: number;
  isMe: boolean;
  /** Places gained since yesterday; null = no comparison (new or day 1). */
  movement: number | null;
  isNew: boolean;
  /** Winner of the same board last month. */
  crown: boolean;
  gapBefore: boolean;
  storeName: string | null;
};

export type GuestLeaderboardView = {
  enabled: boolean;
  generatedAt: string;
  scope: LeaderboardScope;
  board: LeaderboardBoard;
  scopes: Array<{ scope: LeaderboardScope; label: string }>;
  boards: LeaderboardBoard[];
  period: {
    key: string;
    label: string;
    resultsLabel: string;
    daysLeft: number;
    progress: number;
  } | null;
  formula: GuestLeaderboardConfig['formula'] | null;
  unit: 'points' | 'minutes' | 'count';
  totalPlayers: number;
  entries: GuestLeaderboardEntry[];
  me: {
    name: string;
    hasNickname: boolean;
    rank: number | null;
    value: number;
    movement: number | null;
    excluded: boolean;
  } | null;
  target: { rank: number; gap: number } | null;
  prizes: Array<{ place: number; label: string }>;
};

type CacheEntry<T> = { expiresAt: number; value: Promise<T> };

type ProfileNameRow = {
  id: string;
  displayName: string | null;
  contactMasked: string | null;
  guest: { fullNameMasked: string | null; externalGuestId: string } | null;
};

export function boardUnit(
  board: LeaderboardBoard,
): GuestLeaderboardView['unit'] {
  if (board === 'points') return 'points';
  if (board === 'hours') return 'minutes';
  return 'count';
}

@Injectable()
export class GuestLeaderboardReadService {
  private readonly activityCache = new Map<
    string,
    CacheEntry<LeaderboardActivityRow[]>
  >();
  private readonly settingsCache = new Map<
    string,
    CacheEntry<GuestLeaderboardSettingsState>
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Drops cached settings after an administrator saved them. */
  invalidateSettings(tenantId: string) {
    this.settingsCache.delete(tenantId);
  }

  getSettings(tenantId: string): Promise<GuestLeaderboardSettingsState> {
    return this.cached(this.settingsCache, tenantId, SETTINGS_TTL_MS, () =>
      this.loadSettings(tenantId),
    );
  }

  async loadSettings(tenantId: string): Promise<GuestLeaderboardSettingsState> {
    const row = await this.prisma.guestLeaderboardSettings.findUnique({
      where: { tenantId },
      select: { enabled: true, config: true, revision: true, updatedAt: true },
    });
    if (!row) {
      return {
        enabled: false,
        config: normalizeLeaderboardConfig(null),
        revision: 0,
        updatedAt: null,
      };
    }
    let config: GuestLeaderboardConfig;
    try {
      config = normalizeLeaderboardConfig(row.config);
    } catch {
      // A stored config is validated on save; fail closed if it was altered.
      return {
        enabled: false,
        config: normalizeLeaderboardConfig(null),
        revision: row.revision,
        updatedAt: row.updatedAt,
      };
    }
    return {
      enabled: row.enabled,
      config,
      revision: row.revision,
      updatedAt: row.updatedAt,
    };
  }

  async loadStores(tenantId: string): Promise<LeaderboardStore[]> {
    return this.prisma.store.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, timeZone: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Per profile and club activity in [from, to). Cached per window. */
  activity(tenantId: string, from: Date, to: Date, now = new Date()) {
    const key = `${tenantId}|${from.toISOString()}|${to.toISOString()}`;
    const ttl =
      to.getTime() <= now.getTime() ? CLOSED_WINDOW_TTL_MS : OPEN_WINDOW_TTL_MS;
    return this.cached(this.activityCache, key, ttl, () =>
      this.loadActivity(tenantId, from, to),
    );
  }

  private async loadActivity(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<LeaderboardActivityRow[]> {
    // Timestamp columns hold UTC without a zone; compare as UTC explicitly so
    // the session time zone of the connection never shifts the window.
    const fromUtc = Prisma.sql`(${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const toUtc = Prisma.sql`(${to.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const playTypes = Prisma.join([...PLAY_TIME_FACT_TYPES]);

    const rows = await this.prisma.$queryRaw<
      Array<{
        profileId: string;
        storeId: string | null;
        playMinutes: number;
        sessions: number;
        quests: number;
        cases: number;
        checkIns: number;
      }>
    >(Prisma.sql`
      WITH players AS (
        SELECT profile_row.id, profile_row."gameActivatedAt"
        FROM "GuestGameProfile" profile_row
        WHERE profile_row."tenantId" = ${tenantId}
          AND profile_row.status = 'ACTIVE'
          AND profile_row."isStaffTest" = FALSE
          AND profile_row."gameActivatedAt" IS NOT NULL
      ),
      play AS (
        SELECT DISTINCT ON (fact_row."externalDomain", COALESCE(fact_row."sessionExternalId", fact_row.id))
               fact_row."profileId" AS "profileId",
               fact_row."storeId" AS "storeId",
               LEAST(fact_row."durationMinutes", ${MAX_SESSION_MINUTES}) AS minutes
        FROM "GuestActivityFact" fact_row
        JOIN players ON players.id = fact_row."profileId"
        WHERE fact_row."tenantId" = ${tenantId}
          AND fact_row."lifecycleStatus" = 'ACTIVE'
          AND fact_row."factType" IN (${playTypes})
          AND fact_row."happenedAt" >= ${fromUtc}
          AND fact_row."happenedAt" < ${toUtc}
          AND fact_row."happenedAt" >= players."gameActivatedAt"
          AND fact_row."durationMinutes" > 0
        ORDER BY fact_row."externalDomain",
                 COALESCE(fact_row."sessionExternalId", fact_row.id),
                 fact_row."durationMinutes" DESC
      ),
      check_ins AS (
        SELECT fact_row."profileId" AS "profileId", fact_row."storeId" AS "storeId",
               COUNT(*)::int AS n
        FROM "GuestActivityFact" fact_row
        JOIN players ON players.id = fact_row."profileId"
        WHERE fact_row."tenantId" = ${tenantId}
          AND fact_row."lifecycleStatus" = 'ACTIVE'
          AND fact_row."factType" = 'CHECK_IN_PERFORMED'
          AND fact_row."happenedAt" >= ${fromUtc}
          AND fact_row."happenedAt" < ${toUtc}
          AND fact_row."happenedAt" >= players."gameActivatedAt"
        GROUP BY 1, 2
      ),
      quests AS (
        SELECT item."profileId" AS "profileId", item."storeId" AS "storeId",
               COUNT(*)::int AS n
        FROM "GuestGameRewardWalletItem" item
        JOIN players ON players.id = item."profileId"
        WHERE item."tenantId" = ${tenantId}
          AND item."sourceKind" IN ('MISSION', 'BATTLE_PASS')
          AND item.status NOT IN ('CANCELED', 'CANCELLED', 'REVOKED')
          AND item."createdAt" >= ${fromUtc}
          AND item."createdAt" < ${toUtc}
          AND item."createdAt" >= players."gameActivatedAt"
        GROUP BY 1, 2
      ),
      cases AS (
        SELECT item."profileId" AS "profileId", item."storeId" AS "storeId",
               COUNT(*)::int AS n
        FROM "GuestGameRewardWalletItem" item
        JOIN players ON players.id = item."profileId"
        WHERE item."tenantId" = ${tenantId}
          AND item.kind = 'LOOT_BOX_ENTITLEMENT'
          AND item.status = 'CLAIMED'
          AND item."claimedAt" >= ${fromUtc}
          AND item."claimedAt" < ${toUtc}
          AND item."claimedAt" >= players."gameActivatedAt"
        GROUP BY 1, 2
      )
      SELECT u."profileId" AS "profileId",
             u."storeId" AS "storeId",
             SUM(u.minutes)::int AS "playMinutes",
             SUM(u.sessions)::int AS sessions,
             SUM(u.quests)::int AS quests,
             SUM(u.cases)::int AS cases,
             SUM(u.check_ins)::int AS "checkIns"
      FROM (
        SELECT "profileId", "storeId", minutes,
               CASE WHEN minutes >= ${LEADERBOARD_MIN_SESSION_MINUTES} THEN 1 ELSE 0 END AS sessions,
               0 AS quests, 0 AS cases, 0 AS check_ins
        FROM play
        UNION ALL
        SELECT "profileId", "storeId", 0, 0, n, 0, 0 FROM quests
        UNION ALL
        SELECT "profileId", "storeId", 0, 0, 0, n, 0 FROM cases
        UNION ALL
        SELECT "profileId", "storeId", 0, 0, 0, 0, n FROM check_ins
      ) u
      GROUP BY 1, 2
    `);

    return rows.map((row) => ({
      profileId: row.profileId,
      storeId: row.storeId,
      playMinutes: Number(row.playMinutes) || 0,
      sessions: Number(row.sessions) || 0,
      quests: Number(row.quests) || 0,
      cases: Number(row.cases) || 0,
      checkIns: Number(row.checkIns) || 0,
    }));
  }

  /** The period of a scope: club month in the club zone, network in its zone. */
  periodFor(
    scope: LeaderboardScope,
    store: LeaderboardStore | null,
    stores: readonly LeaderboardStore[],
    now: Date,
    shift = 0,
  ): LeaderboardPeriod {
    const zone =
      scope === 'club' && store
        ? safeTimeZone(store.timeZone)
        : networkTimeZone(stores);
    return leaderboardMonth(now, zone, shift);
  }

  /** Standings of one board for a scope and window. */
  async standings(input: {
    tenantId: string;
    storeId: string | null;
    board: LeaderboardBoard;
    config: GuestLeaderboardConfig;
    from: Date;
    to: Date;
    now: Date;
  }): Promise<LeaderboardStanding[]> {
    const rows = await this.activity(
      input.tenantId,
      input.from,
      input.to,
      input.now,
    );
    return rankLeaderboard(
      leaderboardTotals(rows, input.storeId),
      input.board,
      input.config.formula,
      new Set(input.config.excludedProfileIds),
    );
  }

  async lootBoxNames(tenantId: string, config: GuestLeaderboardConfig) {
    const ids = leaderboardPrizeLootBoxIds(config);
    if (ids.length === 0) return new Map<string, string>();
    const rows = await this.prisma.guestGameLootBox.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async profileNames(tenantId: string, profileIds: string[]) {
    if (profileIds.length === 0) return new Map<string, ProfileNameRow>();
    const rows = await this.prisma.guestGameProfile.findMany({
      where: { tenantId, id: { in: profileIds } },
      select: {
        id: true,
        displayName: true,
        contactMasked: true,
        guest: { select: { fullNameMasked: true, externalGuestId: true } },
      },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * The board a guest sees. `scope`/`board` fall back to the first available
   * ones; a disabled leaderboard returns `enabled: false` and nothing else.
   */
  async guestView(input: {
    tenantId: string;
    profileId: string | null;
    storeId: string;
    scope?: unknown;
    board?: unknown;
    now?: Date;
  }): Promise<GuestLeaderboardView> {
    const now = input.now ?? new Date();
    const settings = await this.getSettings(input.tenantId);
    const stores = await this.loadStores(input.tenantId);
    const store = stores.find((row) => row.id === input.storeId) ?? null;
    const { config } = settings;

    const scopes: GuestLeaderboardView['scopes'] = [];
    if (store && !config.disabledStoreIds.includes(store.id)) {
      scopes.push({ scope: 'club', label: store.name });
    }
    if (config.networkEnabled) {
      scopes.push({ scope: 'network', label: 'Вся сеть' });
    }
    const boards = enabledLeaderboardBoards(config);
    const empty: GuestLeaderboardView = {
      enabled: false,
      generatedAt: now.toISOString(),
      scope: 'club',
      board: 'points',
      scopes: [],
      boards: [],
      period: null,
      formula: null,
      unit: 'points',
      totalPlayers: 0,
      entries: [],
      me: null,
      target: null,
      prizes: [],
    };
    if (!settings.enabled || scopes.length === 0 || boards.length === 0) {
      return empty;
    }

    const scope =
      scopes.find((row) => row.scope === input.scope)?.scope ?? scopes[0].scope;
    const board = boards.find((row) => row === input.board) ?? boards[0];
    const scopeStoreId = scope === 'club' ? store!.id : null;
    const period = this.periodFor(scope, store, stores, now);
    const previous = this.periodFor(scope, store, stores, now, -1);
    const movementCutoff = new Date(
      Math.floor((now.getTime() - MOVEMENT_WINDOW_MS) / MOVEMENT_QUANTUM_MS) *
        MOVEMENT_QUANTUM_MS,
    );

    const [current, yesterday, lastMonth, lootBoxNames] = await Promise.all([
      this.standings({
        tenantId: input.tenantId,
        storeId: scopeStoreId,
        board,
        config,
        from: period.from,
        to: period.to,
        now,
      }),
      movementCutoff > period.from
        ? this.standings({
            tenantId: input.tenantId,
            storeId: scopeStoreId,
            board,
            config,
            from: period.from,
            to: movementCutoff,
            now,
          })
        : Promise.resolve(null),
      this.standings({
        tenantId: input.tenantId,
        storeId: scopeStoreId,
        board,
        config,
        from: previous.from,
        to: previous.to,
        now,
      }),
      this.lootBoxNames(input.tenantId, config),
    ]);

    const yesterdayRanks = yesterday
      ? new Map(yesterday.map((row) => [row.profileId, row.rank]))
      : null;
    const crowned = new Set(
      lastMonth.filter((row) => row.rank === 1).map((row) => row.profileId),
    );
    const meProfileId = input.profileId;
    const visible = leaderboardVisibleRows(current, meProfileId ?? '');
    const names = await this.profileNames(input.tenantId, [
      ...new Set([
        ...visible.map((row) => row.standing.profileId),
        ...(meProfileId ? [meProfileId] : []),
      ]),
    ]);
    const nameOf = (profileId: string) => {
      const row = names.get(profileId);
      return leaderboardPlayerName({
        displayName: row?.displayName,
        contactMasked: row?.contactMasked,
        importedNames: [
          row?.guest?.fullNameMasked,
          row?.guest?.externalGuestId,
        ],
      });
    };
    const movementOf = (standing: LeaderboardStanding) => {
      if (!yesterdayRanks) return { movement: null, isNew: false };
      const before = yesterdayRanks.get(standing.profileId);
      return before === undefined
        ? { movement: null, isNew: true }
        : { movement: before - standing.rank, isNew: false };
    };
    const storeNames = new Map(stores.map((row) => [row.id, row.name]));
    const homeStores =
      scope === 'network'
        ? await this.homeStores(
            input.tenantId,
            period,
            now,
            visible.map((row) => row.standing.profileId),
          )
        : new Map<string, string>();

    const entries: GuestLeaderboardEntry[] = visible.map(
      ({ standing, gapBefore }) => ({
        rank: standing.rank,
        name: nameOf(standing.profileId).name,
        value: standing.value,
        isMe: standing.profileId === meProfileId,
        ...movementOf(standing),
        crown: crowned.has(standing.profileId),
        gapBefore,
        storeName:
          scope === 'network'
            ? (storeNames.get(homeStores.get(standing.profileId) ?? '') ?? null)
            : null,
      }),
    );

    const meStanding = meProfileId
      ? (current.find((row) => row.profileId === meProfileId) ?? null)
      : null;
    const excluded = meProfileId
      ? config.excludedProfileIds.includes(meProfileId)
      : false;
    const meName = meProfileId ? nameOf(meProfileId) : null;

    return {
      enabled: true,
      generatedAt: now.toISOString(),
      scope,
      board,
      scopes,
      boards,
      period: {
        key: period.key,
        label: period.label,
        resultsLabel: period.resultsLabel,
        daysLeft: period.daysLeft,
        progress: period.progress,
      },
      formula: board === 'points' ? config.formula : null,
      unit: boardUnit(board),
      totalPlayers: current.length,
      entries,
      me: meName
        ? {
            name: meName.name,
            hasNickname: meName.hasNickname,
            rank: meStanding?.rank ?? null,
            value: meStanding?.value ?? 0,
            movement: meStanding ? movementOf(meStanding).movement : null,
            excluded,
          }
        : null,
      target:
        meProfileId && !excluded
          ? leaderboardTarget(current, meProfileId)
          : null,
      prizes: leaderboardPrizes(
        config,
        scope === 'club' ? store!.id : LEADERBOARD_NETWORK_SCOPE_KEY,
        board,
        lootBoxNames,
      ),
    };
  }

  /** The club where each profile played most this period (network board). */
  async homeStores(
    tenantId: string,
    period: LeaderboardPeriod,
    now: Date,
    profileIds: string[],
  ) {
    const rows = await this.activity(tenantId, period.from, period.to, now);
    const wanted = new Set(profileIds);
    const best = new Map<string, { storeId: string; minutes: number }>();
    rows.forEach((row) => {
      if (!row.storeId || !wanted.has(row.profileId)) return;
      const current = best.get(row.profileId);
      const weight = row.playMinutes + row.quests + row.cases + row.checkIns;
      if (!current || weight > current.minutes) {
        best.set(row.profileId, { storeId: row.storeId, minutes: weight });
      }
    });
    return new Map(
      [...best].map(([profileId, row]) => [profileId, row.storeId]),
    );
  }

  private cached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const nowMs = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > nowMs) return hit.value;
    const value = load();
    cache.set(key, { expiresAt: nowMs + ttlMs, value });
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    if (cache.size > CACHE_LIMIT) {
      for (const [entryKey, entry] of cache) {
        if (entry.expiresAt <= nowMs || cache.size > CACHE_LIMIT) {
          cache.delete(entryKey);
        }
        if (cache.size <= CACHE_LIMIT) break;
      }
    }
    return value;
  }
}
