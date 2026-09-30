import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildGuestGameProfileBrief,
  type GuestGameProfileBrief,
  type GuestGameProfileFacts,
  type GuestInsightPeriod,
} from './guest-insights';

/**
 * Read-only projection of the guest game module for the guest CRM contour.
 *
 * The service deliberately depends on Prisma only: it never imports the
 * gamification module (schedulers, Langame writes, delivery), so the guest
 * module keeps its corporate-contour graph and the public guest runtime is
 * untouched. Everything here is keyed by `Guest.id` through
 * `GuestGameProfile.guestId` (unique per tenant).
 */

/** Event sources that count as product activity in the game statistics. */
export const GUEST_GAME_TRUSTED_EVENT_SOURCES = [
  'LANGAME',
  'API_IMPORT',
  'SYSTEM',
  'CHECK_IN',
] as const;

const PENDING_WALLET_STATUSES = ['PENDING', 'FAILED'] as const;
const CHUNK_SIZE = 1000;
const DAY_MS = 86_400_000;

export type GuestGameRewardDetail = {
  id: string;
  status: string;
  source: string;
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  sourceKind: 'MISSION' | 'LOOT_BOX' | 'BATTLE_PASS' | 'MANUAL';
  sourceName: string | null;
  storeName: string | null;
  qualifiedAt: string;
  paidAt: string | null;
  claimExpiresAt: string | null;
  expiresAt: string | null;
};

export type GuestGameWalletItemDetail = {
  id: string;
  kind: string;
  sourceKind: string;
  title: string;
  rewardLabel: string;
  status: string;
  storeName: string | null;
  availableAt: string;
  expiresAt: string;
  claimedAt: string | null;
  expiresInDays: number;
};

export type GuestGameLedgerDetail = {
  id: string;
  status: string;
  amount: number;
  reason: string | null;
  storeName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
};

export type GuestGameEventDetail = {
  id: string;
  eventType: string;
  source: string;
  xpDelta: number;
  occurredAt: string;
  sourceName: string | null;
};

export type GuestGameDetail = {
  profile: GuestGameProfileBrief;
  rewards: GuestGameRewardDetail[];
  wallet: GuestGameWalletItemDetail[];
  ledger: GuestGameLedgerDetail[];
  events: GuestGameEventDetail[];
  totals: {
    events: number;
    rewards: number;
    rewardsPaid: number;
    ledgerEntries: number;
  };
};

type ProfileRow = {
  id: string;
  guestId: string | null;
  status: string;
  level: number;
  xp: number;
  createdAt: Date;
  gameActivatedAt: Date | null;
  lastActivityAt: Date | null;
  isStaffTest: boolean;
  telegramIdentity: string | null;
  maxIdentity: string | null;
  phoneConsentStatus: GuestGameProfileFacts['phoneConsentStatus'];
};

const profileSelect = {
  id: true,
  guestId: true,
  status: true,
  level: true,
  xp: true,
  createdAt: true,
  gameActivatedAt: true,
  lastActivityAt: true,
  isStaffTest: true,
  telegramIdentity: true,
  maxIdentity: true,
  phoneConsentStatus: true,
} satisfies Prisma.GuestGameProfileSelect;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

@Injectable()
export class GuestGameInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the compact game projection for every guest in `guestIds` that has
   * a linked game profile. Guests without a profile are absent from the map.
   */
  async loadGuestGameFacts(
    tenantId: string,
    guestIds: string[],
    period: GuestInsightPeriod,
    now = new Date(),
  ): Promise<Map<string, GuestGameProfileBrief>> {
    const result = new Map<string, GuestGameProfileBrief>();

    if (guestIds.length === 0) {
      return result;
    }

    const profiles = await this.loadProfilesByGuestIds(tenantId, guestIds);

    if (profiles.length === 0) {
      return result;
    }

    const facts = await this.loadFacts(tenantId, profiles, period, now);

    for (const profile of profiles) {
      if (!profile.guestId) {
        continue;
      }

      result.set(
        profile.guestId,
        buildGuestGameProfileBrief(
          facts.get(profile.id) ?? this.emptyFacts(profile),
          period,
          now,
        ),
      );
    }

    return result;
  }

  async countUnlinkedProfiles(tenantId: string) {
    return this.prisma.guestGameProfile.count({
      where: { tenantId, guestId: null, isStaffTest: false },
    });
  }

  async loadGuestGameDetail(
    tenantId: string,
    guestId: string,
    period: GuestInsightPeriod,
    now = new Date(),
  ): Promise<GuestGameDetail | null> {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { tenantId, guestId },
      select: profileSelect,
    });

    if (!profile) {
      return null;
    }

    const facts = await this.loadFacts(tenantId, [profile], period, now);
    const brief = buildGuestGameProfileBrief(
      facts.get(profile.id) ?? this.emptyFacts(profile),
      period,
      now,
    );
    const [rewards, wallet, ledger, events, totals] = await Promise.all([
      this.prisma.guestGameReward.findMany({
        where: { tenantId, profileId: profile.id },
        orderBy: [{ qualifiedAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: {
          id: true,
          status: true,
          source: true,
          rewardType: true,
          rewardAmount: true,
          rewardLabel: true,
          qualifiedAt: true,
          paidAt: true,
          claimExpiresAt: true,
          expiresAt: true,
          mission: { select: { name: true } },
          lootBox: { select: { name: true } },
          season: { select: { name: true } },
          store: { select: { name: true } },
        },
      }),
      this.prisma.guestGameRewardWalletItem.findMany({
        where: {
          tenantId,
          profileId: profile.id,
          OR: [
            {
              status: {
                in: [...PENDING_WALLET_STATUSES, 'PROCESSING', 'OPENING'],
              },
            },
            { claimedAt: { not: null } },
          ],
        },
        orderBy: [{ availableAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: {
          id: true,
          kind: true,
          sourceKind: true,
          title: true,
          rewardLabel: true,
          status: true,
          availableAt: true,
          expiresAt: true,
          claimedAt: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.guestBonusLedgerEntry.findMany({
        where: { tenantId, profileId: profile.id, source: 'GAMIFICATION' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: {
          id: true,
          status: true,
          amount: true,
          reason: true,
          createdAt: true,
          confirmedAt: true,
          failedAt: true,
          canceledAt: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.guestGameEvent.findMany({
        where: {
          tenantId,
          profileId: profile.id,
          source: { in: [...GUEST_GAME_TRUSTED_EVENT_SOURCES, 'MANUAL'] },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: {
          id: true,
          eventType: true,
          source: true,
          xpDelta: true,
          occurredAt: true,
          mission: { select: { name: true } },
          lootBox: { select: { name: true } },
          season: { select: { name: true } },
        },
      }),
      Promise.all([
        this.prisma.guestGameEvent.count({
          where: { tenantId, profileId: profile.id },
        }),
        this.prisma.guestGameReward.count({
          where: { tenantId, profileId: profile.id },
        }),
        this.prisma.guestGameReward.count({
          where: { tenantId, profileId: profile.id, status: 'PAID' },
        }),
        this.prisma.guestBonusLedgerEntry.count({
          where: { tenantId, profileId: profile.id, source: 'GAMIFICATION' },
        }),
      ]),
    ]);

    return {
      profile: brief,
      rewards: rewards.map((reward) => ({
        id: reward.id,
        status: reward.status,
        source: reward.source,
        rewardType: reward.rewardType,
        rewardAmount: decimalToNumber(reward.rewardAmount),
        rewardLabel: reward.rewardLabel,
        sourceKind: reward.mission
          ? 'MISSION'
          : reward.lootBox
            ? 'LOOT_BOX'
            : reward.season
              ? 'BATTLE_PASS'
              : 'MANUAL',
        sourceName:
          reward.mission?.name ??
          reward.lootBox?.name ??
          reward.season?.name ??
          null,
        storeName: reward.store?.name ?? null,
        qualifiedAt: reward.qualifiedAt.toISOString(),
        paidAt: iso(reward.paidAt),
        claimExpiresAt: iso(reward.claimExpiresAt),
        expiresAt: iso(reward.expiresAt),
      })),
      wallet: wallet.map((item) => ({
        id: item.id,
        kind: item.kind,
        sourceKind: item.sourceKind,
        title: item.title,
        rewardLabel: item.rewardLabel,
        status: item.status,
        storeName: item.store?.name ?? null,
        availableAt: item.availableAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        claimedAt: iso(item.claimedAt),
        expiresInDays: Math.max(
          0,
          Math.ceil((item.expiresAt.getTime() - now.getTime()) / DAY_MS),
        ),
      })),
      ledger: ledger.map((entry) => ({
        id: entry.id,
        status: entry.status,
        amount: decimalToNumber(entry.amount),
        reason: entry.reason,
        storeName: entry.store?.name ?? null,
        createdAt: entry.createdAt.toISOString(),
        confirmedAt: iso(entry.confirmedAt),
        failedAt: iso(entry.failedAt),
        canceledAt: iso(entry.canceledAt),
      })),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        source: event.source,
        xpDelta: event.xpDelta,
        occurredAt: event.occurredAt.toISOString(),
        sourceName:
          event.mission?.name ??
          event.lootBox?.name ??
          event.season?.name ??
          null,
      })),
      totals: {
        events: totals[0],
        rewards: totals[1],
        rewardsPaid: totals[2],
        ledgerEntries: totals[3],
      },
    };
  }

  private async loadProfilesByGuestIds(tenantId: string, guestIds: string[]) {
    if (guestIds.length > CHUNK_SIZE) {
      // Profiles are few compared with guests: one tenant read beats
      // one query per 1000 guest ids.
      const selected = new Set(guestIds);
      const profiles = await this.prisma.guestGameProfile.findMany({
        where: { tenantId, guestId: { not: null } },
        select: profileSelect,
      });

      return profiles.filter(
        (profile) => profile.guestId !== null && selected.has(profile.guestId),
      );
    }

    const rows = await Promise.all(
      chunk(guestIds, CHUNK_SIZE).map((ids) =>
        this.prisma.guestGameProfile.findMany({
          where: { tenantId, guestId: { in: ids } },
          select: profileSelect,
        }),
      ),
    );

    return rows.flat();
  }

  private async loadFacts(
    tenantId: string,
    profiles: ProfileRow[],
    period: GuestInsightPeriod,
    now: Date,
  ) {
    const factsByProfileId = new Map<string, GuestGameProfileFacts>();

    for (const profile of profiles) {
      factsByProfileId.set(profile.id, this.emptyFacts(profile));
    }

    const profileIds = profiles.map((profile) => profile.id);
    const eventsFrom = new Date(period.fromDate.getTime() - 60 * DAY_MS);
    const chunks = chunk(profileIds, CHUNK_SIZE);
    const [walletRows, rewardRows, ledgerRows, eventRows] = await Promise.all([
      Promise.all(
        chunks.map((ids) =>
          this.prisma.guestGameRewardWalletItem.findMany({
            where: {
              tenantId,
              profileId: { in: ids },
              status: { in: [...PENDING_WALLET_STATUSES] },
              expiresAt: { gt: now },
            },
            select: {
              profileId: true,
              status: true,
              availableAt: true,
              expiresAt: true,
            },
          }),
        ),
      ).then((rows) => rows.flat()),
      Promise.all(
        chunks.map((ids) =>
          this.prisma.guestGameReward.findMany({
            where: { tenantId, profileId: { in: ids } },
            select: {
              profileId: true,
              status: true,
              qualifiedAt: true,
              paidAt: true,
            },
          }),
        ),
      ).then((rows) => rows.flat()),
      Promise.all(
        chunks.map((ids) =>
          this.prisma.guestBonusLedgerEntry.findMany({
            where: {
              tenantId,
              profileId: { in: ids },
              source: 'GAMIFICATION',
              entryType: 'EARN',
            },
            select: {
              profileId: true,
              status: true,
              amount: true,
              confirmedAt: true,
            },
          }),
        ),
      ).then((rows) => rows.flat()),
      Promise.all(
        chunks.map((ids) =>
          this.prisma.guestGameEvent.findMany({
            where: {
              tenantId,
              profileId: { in: ids },
              source: { in: [...GUEST_GAME_TRUSTED_EVENT_SOURCES] },
              occurredAt: { gte: eventsFrom },
            },
            select: { profileId: true, occurredAt: true },
          }),
        ),
      ).then((rows) => rows.flat()),
    ]);

    for (const row of walletRows) {
      factsByProfileId.get(row.profileId)?.wallet.push({
        status: row.status,
        availableAt: row.availableAt,
        expiresAt: row.expiresAt,
      });
    }

    for (const row of rewardRows) {
      if (!row.profileId) continue;
      factsByProfileId.get(row.profileId)?.rewards.push({
        status: row.status,
        qualifiedAt: row.qualifiedAt,
        paidAt: row.paidAt,
      });
    }

    for (const row of ledgerRows) {
      if (!row.profileId) continue;
      factsByProfileId.get(row.profileId)?.ledger.push({
        status: row.status,
        amount: decimalToNumber(row.amount),
        confirmedAt: row.confirmedAt,
      });
    }

    for (const row of eventRows) {
      if (!row.profileId) continue;
      factsByProfileId.get(row.profileId)?.events.push({
        occurredAt: row.occurredAt,
      });
    }

    return factsByProfileId;
  }

  private emptyFacts(profile: ProfileRow): GuestGameProfileFacts {
    return {
      profileId: profile.id,
      status: profile.status,
      level: profile.level,
      xp: profile.xp,
      createdAt: profile.createdAt,
      gameActivatedAt: profile.gameActivatedAt,
      lastActivityAt: profile.lastActivityAt,
      isStaffTest: profile.isStaffTest,
      telegramIdentity: profile.telegramIdentity,
      maxIdentity: profile.maxIdentity,
      phoneConsentStatus: profile.phoneConsentStatus,
      wallet: [],
      rewards: [],
      ledger: [],
      events: [],
    };
  }
}
