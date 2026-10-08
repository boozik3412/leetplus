import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestGamificationService } from '../guest-gamification/guest-gamification.service';
import { acquireGuestGameLootBoxRuleLock } from '../guest-gamification/guest-game-loot-box-lock';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEADERBOARD_NETWORK_SCOPE_KEY,
  LEADERBOARD_RESULT_SIZE,
  enabledLeaderboardBoards,
  leaderboardPrizeForRank,
  leaderboardPrizeIdempotencyKey,
  leaderboardPrizeLabel,
  leaderboardPrizeTitle,
  leaderboardSettlementDue,
  normalizeLeaderboardConfig,
  type GuestLeaderboardConfig,
  type LeaderboardBoard,
  type LeaderboardPrize,
} from './guest-leaderboard-core';
import {
  GuestLeaderboardReadService,
  type LeaderboardStore,
} from './guest-leaderboard-read.service';

/** Result rows whose prize is still to be issued (crash-safe resume). */
const PRIZE_PENDING = 'PRIZE_PENDING';
const PRIZE_ISSUED = 'PRIZE_ISSUED';
const PRIZE_FAILED = 'PRIZE_FAILED';
const MANUAL_PRIZE = 'MANUAL_PRIZE';
const RECORDED = 'RECORDED';
const PRIZE_BATCH = 50;
const PRIZE_CLAIM_DAYS = 30;
const SETTLEMENT_ACTOR_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
];

export type GuestLeaderboardSettlementResult = {
  frozenBoards: number;
  frozenRows: number;
  prizesIssued: number;
  manualPrizes: number;
  prizesFailed: number;
  failures: string[];
};

type StoredPrize = LeaderboardPrize & {
  label?: string;
  title?: string;
  entitlementId?: string;
  error?: string;
};

/**
 * Month-end results of the guest leaderboard («1-го числа подводим итоги»).
 * Runs in the gamification worker for the INTERNAL tenant only:
 *
 * 1. Freeze: when a scope's previous month is due (12 h after it ended in its
 *    zone), its top places per board are written to GuestLeaderboardPeriodResult
 *    once; a place with a configured prize is written as PRIZE_PENDING.
 * 2. Issue: every PRIZE_PENDING row is issued exactly once (idempotency key per
 *    profile, period, scope and board):
 *    - BONUS — an approved BONUS reward with a wallet claim, the same path as
 *      mission bonuses (the bonus ledger pays it out after the claim);
 *    - LOOT_BOX — an AVAILABLE case entitlement with a wallet item;
 *    - CUSTOM — marked MANUAL_PRIZE for staff to hand over.
 *    A failed prize is marked PRIZE_FAILED with the reason and is not retried
 *    automatically; the admin «Рейтинг» tab lists it.
 */
@Injectable()
export class GuestLeaderboardSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: GuestLeaderboardReadService,
    private readonly gamification: GuestGamificationService,
  ) {}

  async settleTenant(
    tenantId: string,
    now = new Date(),
  ): Promise<GuestLeaderboardSettlementResult> {
    const result: GuestLeaderboardSettlementResult = {
      frozenBoards: 0,
      frozenRows: 0,
      prizesIssued: 0,
      manualPrizes: 0,
      prizesFailed: 0,
      failures: [],
    };
    const settings = await this.prisma.guestLeaderboardSettings.findUnique({
      where: { tenantId },
      select: { enabled: true, config: true, createdAt: true },
    });
    if (!settings) return result;

    let config: GuestLeaderboardConfig;
    try {
      config = normalizeLeaderboardConfig(settings.config);
    } catch {
      result.failures.push('stored leaderboard settings are invalid');
      return result;
    }

    if (settings.enabled) {
      await this.freezeDueMonths(
        tenantId,
        config,
        settings.createdAt,
        now,
        result,
      );
    }
    await this.issuePendingPrizes(tenantId, now, result);
    return result;
  }

  private async freezeDueMonths(
    tenantId: string,
    config: GuestLeaderboardConfig,
    settingsCreatedAt: Date,
    now: Date,
    result: GuestLeaderboardSettlementResult,
  ) {
    const stores = await this.reader.loadStores(tenantId);
    const scopes: Array<{ scopeKey: string; store: LeaderboardStore | null }> =
      [];
    if (config.networkEnabled) {
      scopes.push({ scopeKey: LEADERBOARD_NETWORK_SCOPE_KEY, store: null });
    }
    stores
      .filter((store) => !config.disabledStoreIds.includes(store.id))
      .forEach((store) => scopes.push({ scopeKey: store.id, store }));

    for (const { scopeKey, store } of scopes) {
      const period = this.reader.periodFor(
        store ? 'club' : 'network',
        store,
        stores,
        now,
        -1,
      );
      if (!leaderboardSettlementDue(period, now, settingsCreatedAt)) continue;

      for (const board of enabledLeaderboardBoards(config)) {
        const already = await this.prisma.guestLeaderboardPeriodResult.count({
          where: { tenantId, periodKey: period.key, scopeKey, board },
        });
        if (already > 0) continue;

        const standings = await this.reader.standings({
          tenantId,
          storeId: store?.id ?? null,
          board,
          config,
          from: period.from,
          to: period.to,
          now,
        });
        const top = standings.filter(
          (row) => row.rank <= LEADERBOARD_RESULT_SIZE,
        );
        if (top.length === 0) continue;

        const created =
          await this.prisma.guestLeaderboardPeriodResult.createMany({
            data: top.map((row) => {
              const prize = leaderboardPrizeForRank(
                config,
                scopeKey,
                board,
                row.rank,
              );
              return {
                tenantId,
                periodKey: period.key,
                scopeKey,
                storeId: store?.id ?? null,
                board,
                rank: row.rank,
                profileId: row.profileId,
                value: row.value,
                prize: prize
                  ? {
                      ...prize,
                      title: leaderboardPrizeTitle({
                        monthLabel: period.label,
                        rank: row.rank,
                        board,
                        scopeName: store?.name ?? 'вся сеть',
                      }),
                    }
                  : Prisma.DbNull,
                status: prize ? PRIZE_PENDING : RECORDED,
              };
            }),
            skipDuplicates: true,
          });
        result.frozenBoards += 1;
        result.frozenRows += created.count;
      }
    }
  }

  private async issuePendingPrizes(
    tenantId: string,
    now: Date,
    result: GuestLeaderboardSettlementResult,
  ) {
    const pending = await this.prisma.guestLeaderboardPeriodResult.findMany({
      where: { tenantId, status: PRIZE_PENDING },
      orderBy: [{ periodKey: 'asc' }, { createdAt: 'asc' }, { rank: 'asc' }],
      take: PRIZE_BATCH,
    });
    if (pending.length === 0) return;

    const actor = await this.settlementActor(tenantId);
    const lootBoxNames = new Map(
      (
        await this.prisma.guestGameLootBox.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        })
      ).map((row) => [row.id, row.name]),
    );

    for (const row of pending) {
      const prize = row.prize as StoredPrize | null;
      const board = row.board as LeaderboardBoard;
      try {
        if (!prize) throw new Error('prize is missing');
        if (prize.kind === 'CUSTOM') {
          await this.markResult(row.id, MANUAL_PRIZE, null, {
            ...prize,
            label: prize.label,
          });
          await this.audit(tenantId, row, 'LEADERBOARD_PRIZE_MANUAL', prize);
          result.manualPrizes += 1;
          continue;
        }
        if (!actor) {
          throw new Error('no active owner, administrator or network manager');
        }
        const profile = await this.prisma.guestGameProfile.findFirst({
          where: { tenantId, id: row.profileId },
          select: {
            id: true,
            guestId: true,
            status: true,
            gameActivatedAt: true,
          },
        });
        if (!profile || profile.status !== 'ACTIVE') {
          throw new Error('the winner profile is no longer active');
        }
        const idempotencyKey = leaderboardPrizeIdempotencyKey({
          tenantId,
          periodKey: row.periodKey,
          scopeKey: row.scopeKey,
          board,
          profileId: row.profileId,
        });
        const label = leaderboardPrizeLabel(prize, lootBoxNames) ?? 'Приз';
        const title = prize.title ?? `Рейтинг · ${row.rank}-е место`;

        if (prize.kind === 'BONUS') {
          const rewardId = await this.issueBonus(actor, {
            profileId: profile.id,
            guestId: profile.guestId,
            storeId: row.storeId,
            amount: prize.amount,
            label: `${title}: ${label}`,
            idempotencyKey,
            now,
            evidence: { resultId: row.id, periodKey: row.periodKey },
          });
          await this.markResult(row.id, PRIZE_ISSUED, rewardId, {
            ...prize,
            label,
          });
        } else {
          const storeId =
            row.storeId ?? (await this.homeStoreId(tenantId, row, now));
          const entitlementId = await this.issueCase(tenantId, {
            profileId: profile.id,
            guestId: profile.guestId,
            storeId,
            lootBoxId: prize.lootBoxId,
            title,
            idempotencyKey,
            now,
            resultId: row.id,
          });
          await this.markResult(row.id, PRIZE_ISSUED, null, {
            ...prize,
            label,
            entitlementId,
          });
        }
        await this.audit(tenantId, row, 'LEADERBOARD_PRIZE_ISSUED', {
          ...prize,
          label,
        });
        result.prizesIssued += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'unknown');
        await this.markResult(row.id, PRIZE_FAILED, null, {
          ...(prize ?? {}),
          error: message.slice(0, 300),
        } as StoredPrize);
        await this.audit(tenantId, row, 'LEADERBOARD_PRIZE_FAILED', {
          error: message.slice(0, 300),
        });
        result.prizesFailed += 1;
        result.failures.push(
          `${row.periodKey}/${row.scopeKey}/${row.board}#${row.rank}: ${message.slice(0, 120)}`,
        );
      }
    }
  }

  private async issueBonus(
    actor: AuthenticatedUser,
    input: {
      profileId: string;
      guestId: string | null;
      storeId: string | null;
      amount: number;
      label: string;
      idempotencyKey: string;
      now: Date;
      evidence: Record<string, string>;
    },
  ) {
    const existing = await this.prisma.guestGameReward.findFirst({
      where: { tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing.id;

    const reward = await this.gamification.createReward(
      actor,
      {
        profileId: input.profileId,
        guestId: input.guestId,
        storeId: input.storeId,
        status: 'APPROVED',
        source: 'MANUAL',
        rewardType: 'BONUS',
        rewardAmount: input.amount,
        rewardLabel: input.label,
        qualifiedAt: input.now.toISOString(),
        note: 'Приз рейтинга гостей за месяц.',
        evidence: {
          source: 'guest_leaderboard_month_prize',
          ...input.evidence,
        },
      },
      {
        idempotencyKey: input.idempotencyKey,
        originKey: input.idempotencyKey,
        claimRequired: true,
        claimExpiresAt: new Date(
          input.now.getTime() + PRIZE_CLAIM_DAYS * 86_400_000,
        ),
      },
    );
    return reward.id;
  }

  private async issueCase(
    tenantId: string,
    input: {
      profileId: string;
      guestId: string | null;
      storeId: string | null;
      lootBoxId: string;
      title: string;
      idempotencyKey: string;
      now: Date;
      resultId: string;
    },
  ) {
    const lootBox = await this.prisma.guestGameLootBox.findFirst({
      where: { tenantId, id: input.lootBoxId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    if (!lootBox) {
      throw new Error('the prize case is not active');
    }
    return this.prisma.$transaction(async (tx) => {
      await acquireGuestGameLootBoxRuleLock(tx, tenantId, lootBox.id);
      const entitlement = await tx.guestGameEntitlement.upsert({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        create: {
          tenantId,
          profileId: input.profileId,
          guestId: input.guestId,
          storeId: input.storeId,
          ruleType: 'LOOT_BOX',
          ruleId: lootBox.id,
          ruleName: lootBox.name,
          sourceEventType: 'LEADERBOARD_PRIZE',
          status: 'AVAILABLE',
          idempotencyKey: input.idempotencyKey,
          originKey: input.idempotencyKey,
          qualifiedAt: input.now,
          evidence: {
            source: 'guest_leaderboard_month_prize',
            resultId: input.resultId,
            noBonusOrXp: true,
          },
        },
        update: {},
        select: { id: true },
      });
      await tx.guestGameRewardWalletItem.upsert({
        where: {
          tenantId_entitlementId: { tenantId, entitlementId: entitlement.id },
        },
        create: {
          tenantId,
          profileId: input.profileId,
          storeId: input.storeId,
          entitlementId: entitlement.id,
          kind: 'LOOT_BOX_ENTITLEMENT',
          sourceKind: 'LOOT_BOX',
          sourceId: lootBox.id,
          title: input.title,
          rewardLabel: `Кейс «${lootBox.name}»`,
          status: 'PENDING',
          availableAt: input.now,
          expiresAt: new Date(
            input.now.getTime() + PRIZE_CLAIM_DAYS * 86_400_000,
          ),
        },
        update: {},
      });
      return entitlement.id;
    });
  }

  private async homeStoreId(
    tenantId: string,
    row: { profileId: string; periodKey: string },
    now: Date,
  ) {
    const stores = await this.reader.loadStores(tenantId);
    const period = this.reader.periodFor('network', null, stores, now, -1);
    const home = await this.reader.homeStores(tenantId, period, now, [
      row.profileId,
    ]);
    return home.get(row.profileId) ?? stores[0]?.id ?? null;
  }

  private markResult(
    id: string,
    status: string,
    rewardId: string | null,
    prize: StoredPrize,
  ) {
    return this.prisma.guestLeaderboardPeriodResult.update({
      where: { id },
      data: {
        status,
        rewardId,
        prize: prize,
        issuedAt: status === PRIZE_ISSUED ? new Date() : null,
      },
    });
  }

  private audit(
    tenantId: string,
    row: {
      id: string;
      profileId: string;
      storeId: string | null;
      periodKey: string;
      scopeKey: string;
      board: string;
      rank: number;
    },
    action: string,
    payload: object,
  ) {
    return this.prisma.guestGameAuditEvent.create({
      data: {
        tenantId,
        profileId: row.profileId,
        storeId: row.storeId,
        entityType: 'LEADERBOARD_RESULT',
        entityId: row.id,
        action,
        status: action === 'LEADERBOARD_PRIZE_FAILED' ? 'FAILED' : 'APPLIED',
        payload: {
          periodKey: row.periodKey,
          scopeKey: row.scopeKey,
          board: row.board,
          rank: row.rank,
          ...payload,
        },
      },
    });
  }

  /** The audit-safe actor of system rewards, as for the scheduled pipeline. */
  private async settlementActor(
    tenantId: string,
  ): Promise<AuthenticatedUser | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            accessScope: 'NETWORK',
            role: { in: SETTLEMENT_ACTOR_ROLES },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const user = tenant?.users[0];
    if (!tenant || !user) return null;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      customRoleId: user.customRoleId,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantStatus: tenant.status,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
  }
}
