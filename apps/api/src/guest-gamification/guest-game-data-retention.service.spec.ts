/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import { GuestGameDataRetentionService } from './guest-game-data-retention.service';

const rewardWalletMigrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/database/prisma/migrations/20260725213500_guest_game_reward_wallet/migration.sql',
  ),
  'utf8',
);

const sourceRewardIdField = {
  modelName: 'GuestGameEntitlement',
  name: 'sourceRewardId',
  typeName: 'String',
  isList: false,
} as Prisma.GuestGameEntitlementFieldRefs['sourceRewardId'];

type GuestGameDataRetentionServiceTestAccess = {
  deleteExpiredRewardWalletItemBatches(cutoff: Date): Promise<number>;
  recoverStaleRewardWalletOpeningBatches(now: Date): Promise<number>;
};

function testAccess(
  service: GuestGameDataRetentionService,
): GuestGameDataRetentionServiceTestAccess {
  return service as unknown as GuestGameDataRetentionServiceTestAccess;
}

function createFixture(configValues: Record<string, string | undefined> = {}) {
  const delegates = {
    tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]) },
    guestGameDataRetentionPolicy: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    guestGameDataRetentionRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue({ id: 'run-1' }),
    },
    guestActivityRawRecord: retentionDelegate(2),
    guestActivityFact: retentionDelegate(3),
    guestGameRuleDecision: retentionDelegate(4),
    guestGameAuditEvent: retentionDelegate(5),
    guestGameReward: {
      count: jest.fn().mockResolvedValue(6),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestBonusLedgerEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestGameRewardEffect: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestGameEntitlement: {
      fields: {
        sourceRewardId: sourceRewardIdField,
      },
      count: jest.fn().mockResolvedValue(7),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestGameEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    guestGameRewardWalletItem: retentionDelegate(0),
    $transaction: jest.fn(function (
      this: Record<string, unknown>,
      operation: (tx: Record<string, unknown>) => Promise<unknown>,
    ) {
      return operation(this);
    }),
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new GuestGameDataRetentionService(
    delegates as unknown as PrismaService,
    config,
  );

  return { service, delegates };
}

function retentionDelegate(count: number) {
  return {
    count: jest.fn().mockResolvedValue(count),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
}

function unopenedEntitlementRewardWhere(
  field: Prisma.GuestGameEntitlementFieldRefs['sourceRewardId'],
) {
  return {
    OR: [
      { rewardId: null },
      {
        sourceRewardId: { not: null },
        rewardId: { equals: field },
      },
    ],
  };
}

describe('GuestGameDataRetentionService', () => {
  const now = new Date('2026-07-12T00:00:00.000Z');

  it('keeps policy retention in dry-run while deleting expired wallet items', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameRewardWalletItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'expired-wallet-item',
          tenantId: 'tenant-1',
          status: 'PENDING',
          kind: 'LOOT_BOX_ENTITLEMENT',
          rewardId: null,
          entitlementId: 'expired-entitlement',
          eventId: null,
          expiresAt: now,
        },
      ]);
    delegates.guestGameEntitlement.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestGameRewardWalletItem.deleteMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 1 });
    expect(result.results[0]).toMatchObject({
      mode: 'DRY_RUN',
      status: 'DRY_RUN_COMPLETE',
      candidates: {
        rawRecords: 2,
        facts: 3,
        decisions: 4,
        auditEvents: 5,
        protectedRewards: 6,
        protectedEntitlements: 7,
      },
    });
    expect(delegates.guestActivityRawRecord.deleteMany).not.toHaveBeenCalled();
    expect(delegates.guestGameRewardWalletItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'CLAIMED'] },
          AND: expect.arrayContaining([
            { expiresAt: { lte: now } },
            expect.objectContaining({
              OR: expect.arrayContaining([
                { status: 'CLAIMED' },
                expect.objectContaining({
                  status: 'PENDING',
                  kind: 'REWARD',
                  reward: expect.objectContaining({
                    is: expect.objectContaining({
                      OR: expect.arrayContaining([
                        expect.objectContaining({
                          status: 'APPROVED',
                          claimRequired: true,
                          deliveryRequestedAt: null,
                          claimExpiresAt: { lte: now },
                        }),
                        expect.objectContaining({
                          status: {
                            in: ['PAID', 'CANCELED', 'EXPIRED'],
                          },
                        }),
                      ]),
                    }),
                  }),
                }),
                expect.objectContaining({
                  status: 'PENDING',
                  kind: 'LOOT_BOX_ENTITLEMENT',
                  entitlement: {
                    is: {
                      OR: [
                        {
                          status: 'AVAILABLE',
                          consumedAt: null,
                          canceledAt: null,
                          AND: [
                            unopenedEntitlementRewardWhere(
                              delegates.guestGameEntitlement.fields
                                .sourceRewardId,
                            ),
                          ],
                        },
                        {
                          status: {
                            in: ['CONSUMED', 'CANCELED', 'EXPIRED'],
                          },
                        },
                      ],
                    },
                  },
                }),
              ]),
            }),
          ]),
        }),
        select: expect.objectContaining({
          id: true,
          tenantId: true,
          status: true,
          kind: true,
          rewardId: true,
          entitlementId: true,
          eventId: true,
          expiresAt: true,
        }),
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: 1_000,
      }),
    );
    expect(delegates.guestGameRewardWalletItem.deleteMany).toHaveBeenCalledWith(
      {
        where: {
          id: 'expired-wallet-item',
          tenantId: 'tenant-1',
          entitlementId: 'expired-entitlement',
          kind: 'LOOT_BOX_ENTITLEMENT',
          status: 'PENDING',
          expiresAt: { lte: now },
        },
      },
    );
    expect(delegates.guestGameEntitlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'expired-entitlement',
        tenantId: 'tenant-1',
        status: 'AVAILABLE',
        consumedAt: null,
        canceledAt: null,
        AND: [
          unopenedEntitlementRewardWhere(
            delegates.guestGameEntitlement.fields.sourceRewardId,
          ),
        ],
      },
      data: {
        status: 'EXPIRED',
        validUntil: now,
      },
    });
    expect(delegates.guestGameDataRetentionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRY_RUN_COMPLETE' }),
      }),
    );
  });

  it('keeps an expired wallet item when the entitlement has an incompatible outcome binding', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameRewardWalletItem.findMany.mockResolvedValue([
      {
        id: 'incompatible-entitlement-wallet',
        tenantId: 'tenant-1',
        status: 'PENDING',
        kind: 'LOOT_BOX_ENTITLEMENT',
        rewardId: null,
        entitlementId: 'incompatible-entitlement',
        eventId: null,
        expiresAt: now,
      },
    ]);
    delegates.guestGameEntitlement.updateMany.mockResolvedValue({ count: 0 });
    delegates.guestGameEntitlement.findFirst.mockResolvedValue(null);

    await expect(
      testAccess(service).deleteExpiredRewardWalletItemBatches(now),
    ).resolves.toBe(0);

    expect(delegates.guestGameEntitlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'incompatible-entitlement',
        tenantId: 'tenant-1',
        status: 'AVAILABLE',
        consumedAt: null,
        canceledAt: null,
        AND: [
          unopenedEntitlementRewardWhere(
            delegates.guestGameEntitlement.fields.sourceRewardId,
          ),
        ],
      },
      data: {
        status: 'EXPIRED',
        validUntil: now,
      },
    });
    expect(
      delegates.guestGameRewardWalletItem.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('expires an unrequested ordinary reward exactly at its claim deadline', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameRewardWalletItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'expired-reward-wallet-item',
          tenantId: 'tenant-1',
          status: 'PENDING',
          kind: 'REWARD',
          rewardId: 'reward-1',
          entitlementId: null,
          eventId: null,
          expiresAt: now,
        },
      ]);
    delegates.guestGameReward.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestGameRewardEffect.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestGameRewardWalletItem.deleteMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 1 });
    expect(delegates.guestGameReward.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reward-1',
        tenantId: 'tenant-1',
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: null,
        claimExpiresAt: { lte: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    expect(delegates.guestGameRewardEffect.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        rewardId: 'reward-1',
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
    expect(delegates.guestGameRewardWalletItem.deleteMany).toHaveBeenCalledWith(
      {
        where: {
          id: 'expired-reward-wallet-item',
          tenantId: 'tenant-1',
          rewardId: 'reward-1',
          kind: 'REWARD',
          status: 'PENDING',
          expiresAt: { lte: now },
        },
      },
    );
  });

  it('expires a quarantined reward whose deadline passed before wallet materialization', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameReward.findMany
      .mockResolvedValueOnce([
        {
          id: 'orphan-reward',
          tenantId: 'tenant-1',
        },
      ])
      .mockResolvedValueOnce([]);
    delegates.guestGameReward.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestGameRewardEffect.updateMany.mockResolvedValue({ count: 1 });

    await service.runAll({ now, liveRequested: false });

    expect(delegates.guestGameReward.findMany).toHaveBeenCalledWith({
      where: {
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: null,
        claimExpiresAt: { lte: now },
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
      take: 1_000,
    });
    expect(delegates.guestGameReward.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'orphan-reward',
        tenantId: 'tenant-1',
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: null,
        claimExpiresAt: { lte: now },
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
    expect(delegates.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        rewardId: 'orphan-reward',
        source: 'GAMIFICATION_REWARD',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: {
        status: 'CANCELED',
        lockedAt: null,
        nextAttemptAt: null,
        canceledAt: now,
        errorCode: 'REWARD_CLAIM_EXPIRED',
        errorMessage: 'Reward claim expired before wallet materialization.',
      },
    });
    expect(delegates.guestGameRewardEffect.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        rewardId: 'orphan-reward',
        status: { in: ['PENDING', 'FAILED', 'WAITING_CLAIM'] },
      },
      data: {
        status: 'CANCELED',
        claimedAt: null,
        claimExpiresAt: null,
        nextAttemptAt: null,
        lastError: 'Reward claim expired before wallet materialization.',
      },
    });
  });

  it('retains a claim accepted one millisecond before the deadline', async () => {
    const { service, delegates } = createFixture();
    const rewardState = {
      status: 'APPROVED',
      deliveryRequestedAt: new Date(now.getTime() - 1),
      claimExpiresAt: now,
    };
    delegates.guestGameRewardWalletItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'claimed-at-deadline-wallet-item',
          tenantId: 'tenant-1',
          status: 'PENDING',
          kind: 'REWARD',
          rewardId: 'reward-claimed-at-deadline',
          entitlementId: null,
          eventId: null,
        },
      ]);
    delegates.guestGameReward.updateMany.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => ({
        count:
          rewardState.status === where.status &&
          rewardState.deliveryRequestedAt === where.deliveryRequestedAt &&
          rewardState.claimExpiresAt.getTime() <=
            (
              (where.claimExpiresAt as { lte: Date } | undefined)?.lte ??
              new Date(0)
            ).getTime()
            ? 1
            : 0,
      }),
    );

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 0 });
    expect(delegates.guestGameReward.updateMany).toHaveBeenCalledTimes(1);
    expect(delegates.guestGameRewardEffect.updateMany).not.toHaveBeenCalled();
    expect(
      delegates.guestGameRewardWalletItem.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it.each(['PROCESSING', 'FAILED'])(
    'retains an accepted %s delivery after the display deadline',
    async (status) => {
      const { service, delegates } = createFixture();
      delegates.guestGameRewardWalletItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: `${status.toLowerCase()}-wallet-item`,
            tenantId: 'tenant-1',
            status,
            kind: 'REWARD',
            rewardId: 'reward-in-delivery',
            entitlementId: null,
            eventId: null,
          },
        ]);

      const result = await service.runAll({ now, liveRequested: false });

      expect(result.walletCleanup).toEqual({ deleted: 0 });
      expect(delegates.guestGameReward.updateMany).not.toHaveBeenCalled();
      expect(
        delegates.guestGameRewardWalletItem.deleteMany,
      ).not.toHaveBeenCalled();
    },
  );

  it('deletes an expired check-in XP wallet item without mutating canonical rewards', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameRewardWalletItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'expired-check-in-wallet-item',
          tenantId: 'tenant-1',
          status: 'PENDING',
          kind: 'REWARD',
          rewardId: null,
          entitlementId: null,
          eventId: 'check-in-event-1',
        },
      ]);
    delegates.guestGameRewardWalletItem.deleteMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 1 });
    expect(delegates.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(delegates.guestGameRewardEffect.updateMany).not.toHaveBeenCalled();
    expect(delegates.guestGameEntitlement.updateMany).not.toHaveBeenCalled();
    expect(delegates.guestGameRewardWalletItem.deleteMany).toHaveBeenCalledWith(
      {
        where: {
          id: 'expired-check-in-wallet-item',
          tenantId: 'tenant-1',
          eventId: 'check-in-event-1',
          kind: 'REWARD',
          status: 'PENDING',
          expiresAt: { lte: now },
        },
      },
    );
  });

  it('leaves an OPENING wallet item unchanged at and after expiry', async () => {
    const { service, delegates } = createFixture();
    delegates.guestGameRewardWalletItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'opening-wallet-item',
          tenantId: 'tenant-1',
          status: 'OPENING',
          kind: 'LOOT_BOX_ENTITLEMENT',
          rewardId: null,
          entitlementId: 'opening-entitlement',
          eventId: null,
        },
      ]);

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 0 });
    expect(delegates.guestGameEntitlement.updateMany).not.toHaveBeenCalled();
    expect(
      delegates.guestGameRewardWalletItem.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('restores a stale OPENING entitlement whose reward still aliases its source reward', async () => {
    const { service, delegates } = createFixture();
    const entitlementId = 'opening-alias-entitlement';
    delegates.guestGameRewardWalletItem.findMany.mockResolvedValue([
      {
        id: 'opening-alias-wallet',
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        entitlementId,
        expiresAt: new Date('2026-08-12T00:00:00.000Z'),
        entitlement: { ruleId: 'lootbox-1' },
      },
    ]);
    delegates.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'opening-alias-wallet',
      expiresAt: new Date('2026-08-12T00:00:00.000Z'),
      entitlement: {
        id: entitlementId,
        status: 'OPENING',
        sourceRewardId: 'case-parent-reward',
        rewardId: 'case-parent-reward',
        ruleId: 'lootbox-1',
      },
    });
    delegates.guestGameEntitlement.updateMany.mockResolvedValue({ count: 1 });
    delegates.guestGameRewardWalletItem.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      testAccess(service).recoverStaleRewardWalletOpeningBatches(now),
    ).resolves.toBe(1);

    expect(delegates.guestGameReward.findFirst).not.toHaveBeenCalled();
    expect(delegates.guestGameRewardWalletItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          entitlement: {
            select: expect.objectContaining({
              sourceRewardId: true,
              rewardId: true,
            }),
          },
        }),
      }),
    );
    expect(delegates.guestGameEntitlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: entitlementId,
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        ruleType: 'LOOT_BOX',
        ruleId: 'lootbox-1',
        status: 'OPENING',
        AND: [
          unopenedEntitlementRewardWhere(
            delegates.guestGameEntitlement.fields.sourceRewardId,
          ),
        ],
      },
      data: {
        status: 'AVAILABLE',
        consumedAt: null,
        canceledAt: null,
        validUntil: null,
      },
    });
    expect(delegates.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith(
      {
        where: { id: 'opening-alias-wallet', status: 'OPENING' },
        data: { status: 'PENDING', claimedAt: null },
      },
    );
  });

  it('fails closed for a stale OPENING entitlement with a distinct persisted outcome', async () => {
    const { service, delegates } = createFixture();
    const entitlementId = 'opening-incompatible-entitlement';
    delegates.guestGameRewardWalletItem.findMany.mockResolvedValue([
      {
        id: 'opening-incompatible-wallet',
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        entitlementId,
        expiresAt: new Date('2026-08-12T00:00:00.000Z'),
        entitlement: { ruleId: 'lootbox-1' },
      },
    ]);
    delegates.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'opening-incompatible-wallet',
      expiresAt: new Date('2026-08-12T00:00:00.000Z'),
      entitlement: {
        id: entitlementId,
        status: 'OPENING',
        sourceRewardId: 'case-parent-reward',
        rewardId: 'different-outcome-reward',
        ruleId: 'lootbox-1',
      },
    });
    delegates.guestGameReward.findFirst.mockResolvedValue(null);

    await expect(
      testAccess(service).recoverStaleRewardWalletOpeningBatches(now),
    ).resolves.toBe(0);

    expect(delegates.guestGameEvent.findFirst).not.toHaveBeenCalled();
    expect(delegates.guestGameEntitlement.updateMany).not.toHaveBeenCalled();
    expect(
      delegates.guestGameRewardWalletItem.updateMany,
    ).not.toHaveBeenCalled();
    expect(
      delegates.guestGameRewardWalletItem.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('requires both the global flag and tenant policy for live deletion', async () => {
    const { service, delegates } = createFixture({
      GUEST_GAME_RETENTION_LIVE_ENABLED: 'true',
    });
    delegates.guestGameDataRetentionPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        rawRetentionDays: 365,
        factRetentionDays: 1095,
        decisionRetentionDays: 1095,
        auditRetentionDays: 1095,
        liveCleanupEnabled: false,
      },
    ]);

    const result = await service.runAll({ now, liveRequested: true });

    expect(result.results[0]).toMatchObject({ mode: 'DRY_RUN' });
    expect(delegates.guestActivityFact.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only bounded candidates when both live guards are enabled', async () => {
    const { service, delegates } = createFixture({
      GUEST_GAME_RETENTION_LIVE_ENABLED: 'true',
    });
    delegates.guestGameDataRetentionPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        rawRetentionDays: 365,
        factRetentionDays: 1095,
        decisionRetentionDays: 1095,
        auditRetentionDays: 1095,
        liveCleanupEnabled: true,
      },
    ]);
    for (const delegate of [
      delegates.guestActivityFact,
      delegates.guestGameRuleDecision,
      delegates.guestGameAuditEvent,
      delegates.guestActivityRawRecord,
    ]) {
      delegate.findMany.mockResolvedValue([{ id: 'old-1' }]);
      delegate.deleteMany.mockResolvedValue({ count: 1 });
    }

    const result = await service.runAll({ now, liveRequested: true });

    expect(result.results[0]).toMatchObject({
      mode: 'LIVE',
      status: 'LIVE_COMPLETE',
      deleted: {
        rawRecords: 1,
        facts: 1,
        decisions: 1,
        auditEvents: 1,
        protectedRewards: 0,
        protectedEntitlements: 0,
      },
    });
    expect(delegates.guestGameReward).not.toHaveProperty('deleteMany');
    expect(delegates.guestGameEntitlement).not.toHaveProperty('deleteMany');
  });

  it('bounds mandatory wallet cleanup independently of retention live mode', async () => {
    const { service, delegates } = createFixture({
      GUEST_GAME_RETENTION_BATCH_SIZE: '10',
      GUEST_GAME_RETENTION_MAX_BATCHES: '2',
    });
    delegates.guestGameRewardWalletItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `expired-wallet-item-${index}`,
        tenantId: 'tenant-1',
        status: 'CLAIMED',
        kind: 'REWARD',
        rewardId: `reward-${index}`,
        entitlementId: null,
        eventId: null,
        expiresAt: now,
      })),
    );
    delegates.guestGameRewardWalletItem.deleteMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.walletCleanup).toEqual({ deleted: 20 });
    expect(delegates.guestGameRewardWalletItem.findMany).toHaveBeenCalledTimes(
      3,
    );
    expect(
      delegates.guestGameRewardWalletItem.deleteMany,
    ).toHaveBeenCalledTimes(20);
    expect(delegates.guestActivityRawRecord.deleteMany).not.toHaveBeenCalled();
  });
});

describe('reward wallet rollout migration', () => {
  it('fail-closes profile rewards but preserves legacy non-profile delivery', () => {
    expect(rewardWalletMigrationSql).toContain(`reward."profileId",`);
    expect(rewardWalletMigrationSql).toContain(
      `IF linked_reward."claimRequired" = false THEN`,
    );
    expect(rewardWalletMigrationSql).toMatch(
      /IF linked_reward\."claimRequired" = false THEN[\s\S]*?IF linked_reward\."profileId" IS NULL THEN\s+RETURN NEW;\s+END IF;\s+RETURN NULL;/,
    );
  });

  it('blocks true unclaimed profile rewards and allows only accepted wallet claims', () => {
    expect(rewardWalletMigrationSql).toMatch(
      /linked_reward\."deliveryRequestedAt" IS NOT NULL[\s\S]*?linked_reward\."claimExpiresAt" IS NOT NULL[\s\S]*?linked_reward\."deliveryRequestedAt" <[\s\S]*?linked_reward\."claimExpiresAt"/,
    );
    expect(rewardWalletMigrationSql).toMatch(
      /wallet\."status" IN \('PROCESSING', 'FAILED'\)[\s\S]*?RETURN NEW;/,
    );
    expect(rewardWalletMigrationSql).toMatch(
      /END IF;[\s\S]*?WHEN undefined_table THEN\s+RETURN NULL;\s+END;\s+RETURN NULL;\s+END;/,
    );
  });

  it('quarantines only safe recent legacy rows and expires safe old rows', () => {
    expect(rewardWalletMigrationSql).toContain(
      `ledger."status" NOT IN ('PENDING', 'FAILED')`,
    );
    expect(rewardWalletMigrationSql).toContain(
      `reward."qualifiedAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
    );
    expect(rewardWalletMigrationSql).toContain(
      `reward."qualifiedAt" <= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
    );
    expect(rewardWalletMigrationSql).toContain(`"status" = 'EXPIRED'`);
    expect(rewardWalletMigrationSql).toContain(`"status" = 'WAITING_CLAIM'`);
    expect(rewardWalletMigrationSql).toContain(
      `profile."gameActivatedAt" IS NOT NULL`,
    );
    expect(rewardWalletMigrationSql).toContain(
      `reward."qualifiedAt" >= profile."gameActivatedAt"`,
    );
  });

  it('materializes an opened loot-box prize but keeps unopened rights separate', () => {
    expect(rewardWalletMigrationSql).not.toContain(
      `reward."lootBoxId" IS NULL`,
    );
    expect(rewardWalletMigrationSql).toContain(
      `WHEN reward."lootBoxId" IS NOT NULL THEN 'LOOT_BOX'`,
    );
    expect(rewardWalletMigrationSql).toContain(
      `LEFT JOIN "GuestGameLootBox" AS loot_box`,
    );
    expect(rewardWalletMigrationSql).toContain(`'LOOT_BOX_ENTITLEMENT'`);
    expect(rewardWalletMigrationSql).toContain(
      `entitlement."rewardId" IS NULL`,
    );
  });
});
