/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */

import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GUEST_BONUS_SETTLEMENT_BINDING } from './guest-bonus-settlement';

const user: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.test',
  fullName: 'Owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-1',
  tenantSlug: 'tenant-one',
  tenantStatus: TenantLifecycleStatus.ACTIVE,
};
function createService() {
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    guestGameReward: {
      fields: { claimExpiresAt: 'claim-expiry' },
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameRewardWalletItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestBonusLedgerEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guest: { findFirst: jest.fn() },
    guestGameProfile: { findFirst: jest.fn(), updateMany: jest.fn() },
    staffMember: { findMany: jest.fn().mockResolvedValue([]) },
    langameStaffUser: { findMany: jest.fn().mockResolvedValue([]) },
    store: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const langameClient = {
    adjustGuestBalanceByPhone: jest.fn(),
    postEndpoint: jest.fn(),
  };
  const service = new GuestBonusLedgerService(
    prisma as any,
    { get: jest.fn() } as unknown as ConfigService,
    langameClient as any,
    { resolveTenantAccess: jest.fn() } as any,
    { decrypt: jest.fn((value) => value) } as any,
    { evaluatePermit: jest.fn(), acquirePermit: jest.fn() } as any,
  );
  return { prisma, langameClient, service };
}
function boundStore(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settlement-store',
    tenantId: user.tenantId,
    isActive: true,
    externalDomain: 'club.example',
    integrationSource: null,
    ...overrides,
  };
}

describe('GuestBonusLedgerService settlement routing', () => {
  it('queues from PROCESSING wallet settlement without rewriting storeless reward provenance', async () => {
    const { prisma, service } = createService();
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-1',
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: null,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club.example',
        guestExternalId: 'external-guest-1',
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(150),
        rewardLabel: '150 бонусов',
        rewardCode: null,
        walletItems: [
          {
            id: 'wallet-1',
            tenantId: user.tenantId,
            profileId: 'profile-1',
            storeId: 'settlement-store',
            store: boundStore(),
          },
        ],
        guest: {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club.example',
          externalGuestId: 'external-guest-1',
          phoneEncrypted: '+79990000001',
          phoneMasked: '+7 *** **-01',
        },
        profile: {
          phoneEncrypted: null,
          contactMasked: null,
          isStaffTest: false,
          staffTestReason: null,
        },
        store: null,
      },
    ]);
    const result = await (service as any).queueApprovedRewards(user, {
      storeId: 'settlement-store',
    });
    expect(result).toMatchObject({ queued: 1, skipped: 0 });
    expect(prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { storeId: 'settlement-store' },
                {
                  storeId: null,
                  walletItems: {
                    some: {
                      tenantId: user.tenantId,
                      storeId: 'settlement-store',
                      kind: 'REWARD',
                      status: 'PROCESSING',
                    },
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-1',
          storeId: 'settlement-store',
          metadata: expect.objectContaining({
            settlementBinding: GUEST_BONUS_SETTLEMENT_BINDING,
            settlementWalletItemId: 'wallet-1',
            settlementStoreId: 'settlement-store',
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
  });

  it('blocks a settlement mismatch before any Langame delivery', async () => {
    const { prisma, langameClient, service } = createService();
    const claimedAt = new Date('2026-09-14T08:00:00.000Z');
    const expiresAt = new Date('2026-09-14T09:00:00.000Z');
    const entry = {
      id: 'ledger-1',
      tenantId: user.tenantId,
      guestId: 'guest-1',
      profileId: 'profile-1',
      rewardId: 'reward-1',
      storeId: 'settlement-store',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club.example',
      externalGuestId: 'external-guest-1',
      idempotencyKey: 'reward-1:bonus',
      entryType: 'EARN',
      source: 'GAMIFICATION_REWARD',
      status: 'PROCESSING',
      amount: new Prisma.Decimal(150),
      attempts: 1,
      claimGeneration: 1,
      lockedAt: claimedAt,
      executionRevision: 3,
      reason: '150 бонусов',
      metadata: {
        settlementBinding: GUEST_BONUS_SETTLEMENT_BINDING,
        settlementWalletItemId: 'wallet-1',
        settlementStoreId: 'settlement-store',
      },
      createdAt: claimedAt,
    };
    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: '+79990000001',
      phoneMasked: '+7 *** **-01',
    });
    prisma.store.findFirst.mockResolvedValue(
      boundStore({ externalDomain: 'different.example' }),
    );
    prisma.guestGameReward.findFirst
      .mockResolvedValueOnce({
        id: 'reward-1',
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: claimedAt,
        claimExpiresAt: expiresAt,
      })
      .mockResolvedValueOnce({
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: claimedAt,
        claimExpiresAt: expiresAt,
      });
    const result = await (service as any).processClaimedEntry(user.id, entry, {
      path: '/master_api/guests/balance/phone',
      maxAttempts: 5,
      retryMinutes: 1,
    });
    expect(result).toMatchObject({
      status: 'BLOCKED',
      note: expect.stringContaining('Клуб получения награды'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorCode: 'BONUS_SETTLEMENT_MISMATCH',
          status: 'PENDING',
        }),
      }),
    );
  });
});
