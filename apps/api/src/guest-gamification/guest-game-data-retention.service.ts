import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RAW_RETENTION_DAYS = 365;
const DEFAULT_DERIVED_RETENTION_DAYS = 3 * 365;
const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 20;
const REWARD_WALLET_OPENING_STALE_MS = 5 * 60 * 1_000;

type RetentionCounts = {
  rawRecords: number;
  facts: number;
  decisions: number;
  auditEvents: number;
  protectedRewards: number;
  protectedEntitlements: number;
};

@Injectable()
export class GuestGameDataRetentionService {
  private readonly logger = new Logger(GuestGameDataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async runAll(options: { now?: Date; liveRequested?: boolean } = {}) {
    const now = options.now ?? new Date();
    await this.recoverStaleRewardWalletOpeningBatches(now);
    await this.expireOrphanRewardClaimBatches(now);
    const walletCleanup = {
      deleted: await this.deleteExpiredRewardWalletItemBatches(now),
    };
    const [tenants, policies] = await Promise.all([
      this.prisma.tenant.findMany({ select: { id: true } }),
      this.prisma.guestGameDataRetentionPolicy.findMany(),
    ]);
    const policyByTenant = new Map(
      policies.map((policy) => [policy.tenantId, policy]),
    );
    const results: Array<Record<string, unknown> & { status: string }> = [];

    for (const tenant of tenants) {
      results.push(
        await this.runTenant({
          tenantId: tenant.id,
          now,
          liveRequested: options.liveRequested ?? false,
          policy: policyByTenant.get(tenant.id) ?? null,
        }),
      );
    }

    return {
      now: now.toISOString(),
      walletCleanup,
      tenants: results.length,
      completed: results.filter((result) => result.status !== 'SKIPPED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      results,
    };
  }

  async runTenant(options: {
    tenantId: string;
    now?: Date;
    liveRequested?: boolean;
    policy?: {
      rawRetentionDays: number;
      factRetentionDays: number;
      decisionRetentionDays: number;
      auditRetentionDays: number;
      liveCleanupEnabled: boolean;
    } | null;
  }) {
    const now = options.now ?? new Date();
    const policy =
      options.policy ??
      (await this.prisma.guestGameDataRetentionPolicy.findUnique({
        where: { tenantId: options.tenantId },
      }));
    const effectivePolicy = {
      rawRetentionDays: positiveDays(
        policy?.rawRetentionDays,
        DEFAULT_RAW_RETENTION_DAYS,
      ),
      factRetentionDays: positiveDays(
        policy?.factRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      decisionRetentionDays: positiveDays(
        policy?.decisionRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      auditRetentionDays: positiveDays(
        policy?.auditRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      liveCleanupEnabled: policy?.liveCleanupEnabled ?? false,
    };
    const live =
      Boolean(options.liveRequested) &&
      this.liveCleanupGloballyEnabled() &&
      effectivePolicy.liveCleanupEnabled;
    const mode = live ? 'LIVE' : 'DRY_RUN';
    const dayKey = now.toISOString().slice(0, 10);
    const runKey = `${options.tenantId}:${dayKey}:${mode}`;
    const cutoffs = {
      rawCutoff: subtractDays(now, effectivePolicy.rawRetentionDays),
      factCutoff: subtractDays(now, effectivePolicy.factRetentionDays),
      decisionCutoff: subtractDays(now, effectivePolicy.decisionRetentionDays),
      auditCutoff: subtractDays(now, effectivePolicy.auditRetentionDays),
    };

    let run: { id: string };
    try {
      run = await this.prisma.guestGameDataRetentionRun.create({
        data: {
          tenantId: options.tenantId,
          runKey,
          mode,
          ...cutoffs,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { tenantId: options.tenantId, mode, status: 'SKIPPED' as const };
      }
      throw error;
    }

    try {
      const candidates = await this.countCandidates(options.tenantId, cutoffs);
      const deleted = live
        ? await this.deleteCandidates(options.tenantId, cutoffs)
        : emptyDeletedCounts(candidates);

      await this.prisma.guestGameDataRetentionRun.update({
        where: { id: run.id },
        data: {
          status: live ? 'LIVE_COMPLETE' : 'DRY_RUN_COMPLETE',
          candidates,
          deleted,
          finishedAt: new Date(),
        },
      });

      return {
        tenantId: options.tenantId,
        mode,
        status: live
          ? ('LIVE_COMPLETE' as const)
          : ('DRY_RUN_COMPLETE' as const),
        policy: effectivePolicy,
        cutoffs: mapDates(cutoffs),
        candidates,
        deleted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.guestGameDataRetentionRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      this.logger.error(
        `Guest game retention failed for tenant ${options.tenantId}: ${message}`,
      );
      throw error;
    }
  }

  private async countCandidates(
    tenantId: string,
    cutoffs: {
      rawCutoff: Date;
      factCutoff: Date;
      decisionCutoff: Date;
      auditCutoff: Date;
    },
  ): Promise<RetentionCounts> {
    const [
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards,
      protectedEntitlements,
    ] = await Promise.all([
      this.prisma.guestActivityRawRecord.count({
        where: {
          tenantId,
          ...nullableEventCutoff('happenedAt', cutoffs.rawCutoff),
        },
      }),
      this.prisma.guestActivityFact.count({
        where: {
          tenantId,
          ...nullableEventCutoff('happenedAt', cutoffs.factCutoff),
        },
      }),
      this.prisma.guestGameRuleDecision.count({
        where: { tenantId, evaluatedAt: { lt: cutoffs.decisionCutoff } },
      }),
      this.prisma.guestGameAuditEvent.count({
        where: { tenantId, happenedAt: { lt: cutoffs.auditCutoff } },
      }),
      this.prisma.guestGameReward.count({ where: { tenantId } }),
      this.prisma.guestGameEntitlement.count({ where: { tenantId } }),
    ]);

    return {
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards,
      protectedEntitlements,
    };
  }

  private async deleteCandidates(
    tenantId: string,
    cutoffs: {
      rawCutoff: Date;
      factCutoff: Date;
      decisionCutoff: Date;
      auditCutoff: Date;
    },
  ) {
    const facts = await this.deleteFactBatches(tenantId, cutoffs.factCutoff);
    const decisions = await this.deleteDecisionBatches(
      tenantId,
      cutoffs.decisionCutoff,
    );
    const auditEvents = await this.deleteAuditBatches(
      tenantId,
      cutoffs.auditCutoff,
    );
    const rawRecords = await this.deleteRawBatches(tenantId, cutoffs.rawCutoff);

    return {
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards: 0,
      protectedEntitlements: 0,
    };
  }

  private async deleteRawBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestActivityRawRecord.findMany({
          where: { tenantId, ...nullableEventCutoff('happenedAt', cutoff) },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestActivityRawRecord.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteFactBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestActivityFact.findMany({
          where: { tenantId, ...nullableEventCutoff('happenedAt', cutoff) },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestActivityFact.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteDecisionBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestGameRuleDecision.findMany({
          where: { tenantId, evaluatedAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { evaluatedAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestGameRuleDecision.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteAuditBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestGameAuditEvent.findMany({
          where: { tenantId, happenedAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { happenedAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestGameAuditEvent.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteExpiredRewardWalletItemBatches(cutoff: Date) {
    let deleted = 0;
    let cursor: { expiresAt: Date; id: string } | null = null;
    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const rows = await this.prisma.guestGameRewardWalletItem.findMany({
        where: {
          status: { in: ['PENDING', 'CLAIMED'] },
          AND: [
            { expiresAt: { lte: cutoff } },
            ...(cursor
              ? [
                  {
                    OR: [
                      {
                        expiresAt: {
                          gt: cursor.expiresAt,
                          lte: cutoff,
                        },
                      },
                      {
                        expiresAt: cursor.expiresAt,
                        id: { gt: cursor.id },
                      },
                    ],
                  },
                ]
              : []),
            {
              OR: [
                { status: 'CLAIMED' },
                {
                  status: 'PENDING',
                  kind: 'REWARD',
                  rewardId: null,
                  entitlementId: null,
                  eventId: { not: null },
                },
                {
                  status: 'PENDING',
                  kind: 'REWARD',
                  reward: {
                    is: {
                      OR: [
                        {
                          status: 'APPROVED',
                          claimRequired: true,
                          deliveryRequestedAt: null,
                          claimExpiresAt: { lte: cutoff },
                        },
                        {
                          status: {
                            in: ['PAID', 'CANCELED', 'EXPIRED'],
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  status: 'PENDING',
                  kind: 'LOOT_BOX_ENTITLEMENT',
                  entitlement: {
                    is: {
                      OR: [
                        {
                          status: 'AVAILABLE',
                          consumedAt: null,
                          canceledAt: null,
                          rewardId: null,
                        },
                        {
                          status: {
                            in: ['CONSUMED', 'CANCELED', 'EXPIRED'],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          status: true,
          kind: true,
          rewardId: true,
          entitlementId: true,
          eventId: true,
          expiresAt: true,
        },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize(),
      });
      if (rows.length === 0) {
        break;
      }
      const lastRow = rows[rows.length - 1];
      cursor = { expiresAt: lastRow.expiresAt, id: lastRow.id };

      let batchDeleted = 0;
      for (const row of rows) {
        // Fail closed if a mocked delegate or a future query change returns a
        // delivery/opening state that the candidate filter intentionally
        // excludes. Accepted claims remain durable beyond their display TTL.
        if (row.status !== 'PENDING' && row.status !== 'CLAIMED') {
          continue;
        }

        const removed = await this.prisma.$transaction(async (tx) => {
          if (row.status === 'CLAIMED') {
            const result = await tx.guestGameRewardWalletItem.deleteMany({
              where: {
                id: row.id,
                tenantId: row.tenantId,
                status: 'CLAIMED',
                expiresAt: { lte: cutoff },
              },
            });
            return result.count;
          }

          if (row.rewardId && row.kind === 'REWARD') {
            // The reward CAS serializes cleanup with a concurrent claim. A
            // claim accepted even one millisecond before the deadline writes
            // deliveryRequestedAt first, so this update loses and the wallet
            // item remains available to PROCESSING/FAILED reconciliation.
            const expired = await tx.guestGameReward.updateMany({
              where: {
                id: row.rewardId,
                tenantId: row.tenantId,
                status: 'APPROVED',
                claimRequired: true,
                deliveryRequestedAt: null,
                claimExpiresAt: { lte: cutoff },
              },
              data: {
                status: 'EXPIRED',
              },
            });
            if (expired.count !== 1) {
              const terminalReward =
                await tx.guestGameReward.findFirst({
                  where: {
                    id: row.rewardId,
                    tenantId: row.tenantId,
                    status: { in: ['PAID', 'CANCELED', 'EXPIRED'] },
                  },
                  select: { status: true },
                });
              if (!terminalReward) {
                return 0;
              }

              if (terminalReward.status !== 'PAID') {
                await tx.guestGameRewardEffect.updateMany({
                  where: {
                    tenantId: row.tenantId,
                    rewardId: row.rewardId,
                    status: 'WAITING_CLAIM',
                  },
                  data: {
                    status: 'CANCELED',
                    claimedAt: null,
                    claimExpiresAt: null,
                    nextAttemptAt: null,
                    lastError:
                      'Reward claim parent reached a terminal state before delivery.',
                  },
                });
              }

              const result =
                await tx.guestGameRewardWalletItem.deleteMany({
                  where: {
                    id: row.id,
                    tenantId: row.tenantId,
                    rewardId: row.rewardId,
                    kind: 'REWARD',
                    status: 'PENDING',
                    expiresAt: { lte: cutoff },
                  },
                });
              return result.count;
            }

            await tx.guestGameRewardEffect.updateMany({
              where: {
                tenantId: row.tenantId,
                rewardId: row.rewardId,
                status: 'WAITING_CLAIM',
              },
              data: {
                status: 'CANCELED',
                claimedAt: null,
                claimExpiresAt: null,
                nextAttemptAt: null,
                lastError: 'Reward claim expired before delivery was requested.',
              },
            });

            const result = await tx.guestGameRewardWalletItem.deleteMany({
              where: {
                id: row.id,
                tenantId: row.tenantId,
                rewardId: row.rewardId,
                kind: 'REWARD',
                status: 'PENDING',
                expiresAt: { lte: cutoff },
              },
            });
            return result.count;
          }

          if (row.entitlementId && row.kind === 'LOOT_BOX_ENTITLEMENT') {
            const expired = await tx.guestGameEntitlement.updateMany({
              where: {
                id: row.entitlementId,
                tenantId: row.tenantId,
                status: 'AVAILABLE',
                consumedAt: null,
                canceledAt: null,
                rewardId: null,
              },
              data: {
                status: 'EXPIRED',
                validUntil: cutoff,
              },
            });
            if (expired.count !== 1) {
              const terminalEntitlement =
                await tx.guestGameEntitlement.findFirst({
                  where: {
                    id: row.entitlementId,
                    tenantId: row.tenantId,
                    status: {
                      in: ['CONSUMED', 'CANCELED', 'EXPIRED'],
                    },
                  },
                  select: { id: true },
                });
              if (!terminalEntitlement) {
                return 0;
              }

              const result =
                await tx.guestGameRewardWalletItem.deleteMany({
                  where: {
                    id: row.id,
                    tenantId: row.tenantId,
                    entitlementId: row.entitlementId,
                    kind: 'LOOT_BOX_ENTITLEMENT',
                    status: 'PENDING',
                    expiresAt: { lte: cutoff },
                  },
                });
              return result.count;
            }

            const result = await tx.guestGameRewardWalletItem.deleteMany({
              where: {
                id: row.id,
                tenantId: row.tenantId,
                entitlementId: row.entitlementId,
                kind: 'LOOT_BOX_ENTITLEMENT',
                status: 'PENDING',
                expiresAt: { lte: cutoff },
              },
            });
            return result.count;
          }

          if (row.eventId && row.kind === 'REWARD') {
            const result = await tx.guestGameRewardWalletItem.deleteMany({
              where: {
                id: row.id,
                tenantId: row.tenantId,
                eventId: row.eventId,
                kind: 'REWARD',
                status: 'PENDING',
                expiresAt: { lte: cutoff },
              },
            });
            return result.count;
          }

          return 0;
        });
        batchDeleted += removed;
      }

      deleted += batchDeleted;
      if (rows.length < this.batchSize()) {
        break;
      }
    }
    return deleted;
  }

  private async expireOrphanRewardClaimBatches(cutoff: Date) {
    let expired = 0;
    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const rows = await this.prisma.guestGameReward.findMany({
        where: {
          status: 'APPROVED',
          claimRequired: true,
          deliveryRequestedAt: null,
          claimExpiresAt: { lte: cutoff },
          walletItems: { none: {} },
          deliveries: { none: {} },
          bonusLedgerEntries: {
            none: {
              source: 'GAMIFICATION_REWARD',
              status: { notIn: ['PENDING', 'FAILED'] },
            },
          },
        },
        select: {
          id: true,
          tenantId: true,
        },
        orderBy: [{ claimExpiresAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize(),
      });
      if (rows.length === 0) {
        break;
      }

      let batchExpired = 0;
      for (const row of rows) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const reward = await tx.guestGameReward.updateMany({
            where: {
              id: row.id,
              tenantId: row.tenantId,
              status: 'APPROVED',
              claimRequired: true,
              deliveryRequestedAt: null,
              claimExpiresAt: { lte: cutoff },
              walletItems: { none: {} },
              deliveries: { none: {} },
              bonusLedgerEntries: {
                none: {
                  source: 'GAMIFICATION_REWARD',
                  status: { notIn: ['PENDING', 'FAILED'] },
                },
              },
            },
            data: {
              status: 'EXPIRED',
            },
          });
          if (reward.count !== 1) {
            return false;
          }

          await tx.guestBonusLedgerEntry.updateMany({
            where: {
              tenantId: row.tenantId,
              rewardId: row.id,
              source: 'GAMIFICATION_REWARD',
              status: { in: ['PENDING', 'FAILED'] },
            },
            data: {
              status: 'CANCELED',
              lockedAt: null,
              nextAttemptAt: null,
              canceledAt: cutoff,
              errorCode: 'REWARD_CLAIM_EXPIRED',
              errorMessage:
                'Reward claim expired before wallet materialization.',
            },
          });
          await tx.guestGameRewardEffect.updateMany({
            where: {
              tenantId: row.tenantId,
              rewardId: row.id,
              status: { in: ['PENDING', 'FAILED', 'WAITING_CLAIM'] },
            },
            data: {
              status: 'CANCELED',
              claimedAt: null,
              claimExpiresAt: null,
              nextAttemptAt: null,
              lastError:
                'Reward claim expired before wallet materialization.',
            },
          });
          return true;
        });
        if (changed) {
          batchExpired += 1;
        }
      }

      expired += batchExpired;
      if (rows.length < this.batchSize() || batchExpired === 0) {
        break;
      }
    }
    return expired;
  }

  private async recoverStaleRewardWalletOpeningBatches(now: Date) {
    const staleBefore = new Date(
      now.getTime() - REWARD_WALLET_OPENING_STALE_MS,
    );
    let recovered = 0;
    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const rows = await this.prisma.guestGameRewardWalletItem.findMany({
        where: {
          kind: 'LOOT_BOX_ENTITLEMENT',
          status: 'OPENING',
          updatedAt: { lte: staleBefore },
          entitlementId: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          profileId: true,
          entitlementId: true,
          expiresAt: true,
          entitlement: {
            select: {
              ruleId: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize(),
      });
      if (rows.length === 0) {
        break;
      }

      let batchRecovered = 0;
      for (const row of rows) {
        if (!row.entitlementId || !row.entitlement?.ruleId) {
          continue;
        }
        const entitlementId = row.entitlementId;
        const changed = await this.prisma.$transaction(async (tx) => {
          const current = await tx.guestGameRewardWalletItem.findFirst({
            where: {
              id: row.id,
              tenantId: row.tenantId,
              profileId: row.profileId,
              entitlementId,
              kind: 'LOOT_BOX_ENTITLEMENT',
              status: 'OPENING',
              updatedAt: { lte: staleBefore },
            },
            select: {
              id: true,
              expiresAt: true,
              entitlement: {
                select: {
                  id: true,
                  status: true,
                  rewardId: true,
                  ruleId: true,
                },
              },
            },
          });
          if (!current?.entitlement) {
            return false;
          }

          let rewardId = current.entitlement.rewardId;
          if (!rewardId) {
            const event = await tx.guestGameEvent.findFirst({
              where: {
                tenantId: row.tenantId,
                profileId: row.profileId,
                lootBoxId: current.entitlement.ruleId,
                externalId: {
                  endsWith: `:guest-game-entitlement:${entitlementId}`,
                },
              },
              select: {
                rewardIntents: {
                  where: {
                    tenantId: row.tenantId,
                    profileId: row.profileId,
                    ruleType: 'LOOT_BOX',
                    ruleId: current.entitlement.ruleId,
                    rewardId: { not: null },
                  },
                  select: { rewardId: true },
                  orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
                  take: 1,
                },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            });
            rewardId = event?.rewardIntents[0]?.rewardId ?? null;
          }

          if (rewardId) {
            const reward = await tx.guestGameReward.findFirst({
              where: {
                id: rewardId,
                tenantId: row.tenantId,
                profileId: row.profileId,
                lootBoxId: current.entitlement.ruleId,
              },
              select: { id: true },
            });
            if (reward) {
              if (current.entitlement.status === 'OPENING') {
                const finalized = await tx.guestGameEntitlement.updateMany({
                  where: {
                    id: entitlementId,
                    tenantId: row.tenantId,
                    profileId: row.profileId,
                    ruleType: 'LOOT_BOX',
                    ruleId: current.entitlement.ruleId,
                    status: 'OPENING',
                  },
                  data: {
                    status: 'CONSUMED',
                    consumedAt: now,
                    rewardId: reward.id,
                  },
                });
                if (finalized.count !== 1) {
                  return false;
                }
              } else if (
                current.entitlement.status !== 'CONSUMED' ||
                current.entitlement.rewardId !== reward.id
              ) {
                return false;
              }
              await tx.guestGameRewardWalletItem.updateMany({
                where: { id: current.id, status: 'OPENING' },
                data: { status: 'CLAIMED', claimedAt: now },
              });
              return true;
            }
          }

          if (current.expiresAt > now) {
            const restored = await tx.guestGameEntitlement.updateMany({
              where: {
                id: entitlementId,
                tenantId: row.tenantId,
                profileId: row.profileId,
                ruleType: 'LOOT_BOX',
                ruleId: current.entitlement.ruleId,
                status: 'OPENING',
                rewardId: null,
              },
              data: {
                status: 'AVAILABLE',
                consumedAt: null,
                canceledAt: null,
                validUntil: null,
              },
            });
            if (restored.count !== 1) {
              return false;
            }
            await tx.guestGameRewardWalletItem.updateMany({
              where: { id: current.id, status: 'OPENING' },
              data: { status: 'PENDING', claimedAt: null },
            });
            return true;
          }

          await tx.guestGameEntitlement.updateMany({
            where: {
              id: entitlementId,
              tenantId: row.tenantId,
              profileId: row.profileId,
              ruleType: 'LOOT_BOX',
              ruleId: current.entitlement.ruleId,
              status: 'OPENING',
              rewardId: null,
            },
            data: {
              status: 'EXPIRED',
              validUntil: now,
            },
          });
          await tx.guestGameRewardWalletItem.deleteMany({
            where: { id: current.id, status: 'OPENING' },
          });
          return true;
        });
        if (changed) {
          batchRecovered += 1;
        }
      }
      recovered += batchRecovered;
      if (rows.length < this.batchSize() || batchRecovered === 0) {
        break;
      }
    }
    return recovered;
  }

  private async deleteIdBatches(
    findIds: () => Promise<Array<{ id: string }>>,
    deleteIds: (ids: string[]) => Promise<{ count: number }>,
  ) {
    let deleted = 0;
    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const rows = await findIds();
      if (rows.length === 0) {
        break;
      }
      const result = await deleteIds(rows.map((row) => row.id));
      deleted += result.count;
      if (rows.length < this.batchSize()) {
        break;
      }
    }
    return deleted;
  }

  private liveCleanupGloballyEnabled() {
    return envFlag(
      this.config.get<string>('GUEST_GAME_RETENTION_LIVE_ENABLED'),
    );
  }

  private batchSize() {
    return boundedInteger(
      this.config.get<string>('GUEST_GAME_RETENTION_BATCH_SIZE'),
      DEFAULT_BATCH_SIZE,
      10,
      5_000,
    );
  }

  private maxBatches() {
    return boundedInteger(
      this.config.get<string>('GUEST_GAME_RETENTION_MAX_BATCHES'),
      DEFAULT_MAX_BATCHES,
      1,
      500,
    );
  }
}

function nullableEventCutoff(field: 'happenedAt', cutoff: Date) {
  return {
    OR: [
      { [field]: { lt: cutoff } },
      { [field]: null, createdAt: { lt: cutoff } },
    ],
  };
}

function emptyDeletedCounts(candidates: RetentionCounts): RetentionCounts {
  return Object.fromEntries(
    Object.keys(candidates).map((key) => [key, 0]),
  ) as RetentionCounts;
}

function subtractDays(value: Date, days: number) {
  return new Date(value.getTime() - days * 24 * 60 * 60 * 1_000);
}

function positiveDays(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function envFlag(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function mapDates(value: Record<string, Date>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, date]) => [key, date.toISOString()]),
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
