/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */

import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { GuestPortalService } from './guest-portal.service';

function rewardWallet(overrides: Record<string, unknown> = {}) {
  const claimExpiresAt = new Date('2099-07-01T00:00:00.000Z');
  return {
    id: 'wallet-1',
    status: 'PENDING',
    kind: 'REWARD',
    entitlementId: null,
    rewardId: 'reward-1',
    eventId: null,
    claimXpDelta: 0,
    expiresAt: claimExpiresAt,
    storeId: null,
    reward: {
      id: 'reward-1',
      status: 'APPROVED',
      rewardType: 'BONUS_BALANCE',
      rewardAmount: new Prisma.Decimal(100),
      storeId: null,
      externalDomain: 'club.example',
      claimRequired: true,
      deliveryRequestedAt: null,
      claimExpiresAt,
    },
    event: null,
    ...overrides,
  };
}
function createService() {
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
    store: { findFirst: jest.fn(), findMany: jest.fn() },
    guestGameRewardWalletItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameReward: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    guestGameRewardEffect: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new GuestPortalService(
    prisma as any,
    { get: jest.fn() } as unknown as ConfigService,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest
    .spyOn(service as any, 'prepareRewardWalletDeliveryClaim')
    .mockResolvedValue(undefined);
  return { prisma, service };
}

describe('GuestPortalService bonus settlement claim', () => {
  it('binds a fresh storeless reward only to its wallet and leaves source reward storeless', async () => {
    const { prisma, service } = createService();
    prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue(
      rewardWallet(),
    );
    prisma.store.findFirst.mockResolvedValue({
      id: 'claim-store',
      tenantId: 'tenant-1',
      isActive: true,
      externalDomain: 'club.example',
      integrationSource: null,
    });
    await expect(
      (service as any).acceptRewardWalletClaim(
        'tenant-1',
        'profile-1',
        'wallet-1',
        'claim-store',
      ),
    ).resolves.toEqual({ rewardId: 'reward-1', materialize: true });
    expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'reward-1' }),
        data: { deliveryRequestedAt: expect.any(Date) },
      }),
    );
    expect(prisma.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: null, status: 'PENDING' }),
        data: { status: 'PROCESSING', claimedAt: null, storeId: 'claim-store' },
      }),
    );
    expect(prisma.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.guestGameAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        storeId: 'claim-store',
        entityType: 'REWARD_WALLET_ITEM',
        entityId: 'wallet-1',
        action: 'BONUS_SETTLEMENT_BOUND',
        reasonCode: 'DOMAIN_SCOPED_REWARD',
        payload: expect.objectContaining({
          rewardId: 'reward-1',
          externalDomain: 'club.example',
          claimStoreId: 'claim-store',
          settlementStoreId: 'claim-store',
          settlementBinding: 'GUEST_WALLET_CLAIM_V1',
        }),
      }),
    });
    const audit = prisma.guestGameAuditEvent.create.mock.calls[0][0].data;
    expect(JSON.stringify(audit)).not.toContain('+7999');
  });

  it('preserves an existing settlement on retry even when current selected club differs', async () => {
    const { prisma, service } = createService();
    const acceptedAt = new Date('2026-09-14T08:00:00.000Z');
    const expiresAt = new Date('2099-07-01T00:00:00.000Z');
    prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue(
      rewardWallet({
        status: 'FAILED',
        storeId: 'bound-store',
        reward: {
          ...rewardWallet().reward,
          deliveryRequestedAt: acceptedAt,
          claimExpiresAt: expiresAt,
        },
      }),
    );
    prisma.store.findFirst.mockResolvedValue({
      id: 'bound-store',
      tenantId: 'tenant-1',
      isActive: true,
      externalDomain: 'club.example',
      integrationSource: null,
    });
    await expect(
      (service as any).acceptRewardWalletClaim(
        'tenant-1',
        'profile-1',
        'wallet-1',
        'other-current-store',
      ),
    ).resolves.toEqual({ rewardId: 'reward-1', materialize: true });
    expect(prisma.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'bound-store',
          status: 'FAILED',
        }),
        data: { status: 'PROCESSING', claimedAt: null, storeId: 'bound-store' },
      }),
    );
    expect(prisma.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('does not auto-repair an already PROCESSING old unbound wallet claim', async () => {
    const { prisma, service } = createService();
    prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue(
      rewardWallet({ status: 'PROCESSING', storeId: null }),
    );
    await expect(
      (service as any).acceptRewardWalletClaim(
        'tenant-1',
        'profile-1',
        'wallet-old-unbound',
        'claim-store',
      ),
    ).resolves.toEqual({ rewardId: 'reward-1', materialize: true });
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(prisma.guestGameRewardWalletItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
  });
});
