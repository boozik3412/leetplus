import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  SUPPORT_GUEST_REWARDS_LIMIT,
  buildSupportGuestRewards,
  type SupportGuestRewardsWalletRow,
} from './support-guest-rewards';
import { SupportTicketsService } from './support-tickets.service';

const now = new Date('2026-10-04T12:00:00.000Z');
const club = { id: 'store-a', name: 'Клуб на Холмогорова' };

function walletRow(
  overrides: Partial<SupportGuestRewardsWalletRow> = {},
): SupportGuestRewardsWalletRow {
  return {
    id: 'wallet-1',
    storeId: 'store-a',
    kind: 'LOOT_BOX_ENTITLEMENT',
    sourceKind: 'MISSION',
    title: 'Кейс WEEKEND',
    rewardLabel: 'Кейс',
    status: 'PENDING',
    createdAt: new Date('2026-10-03T12:00:00.000Z'),
    claimedAt: null,
    expiresAt: new Date('2026-10-10T12:00:00.000Z'),
    reward: null,
    ...overrides,
  };
}

function build(wallet: SupportGuestRewardsWalletRow[]) {
  return buildSupportGuestRewards({
    ticket: {
      id: 'ticket-a',
      createdAt: new Date('2026-10-04T10:00:00.000Z'),
      store: club,
    },
    wallet,
    storeNames: new Map([['store-b', 'Клуб на Радищева']]),
    now,
  });
}

describe('support guest rewards view', () => {
  it('labels cases and rewards by what the guest actually did', () => {
    const view = build([
      walletRow({ id: 'opened', status: 'CLAIMED' }),
      walletRow({ id: 'waiting' }),
      walletRow({
        id: 'expired',
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
      walletRow({
        id: 'bonus',
        kind: 'REWARD',
        sourceKind: 'LOOT_BOX',
        status: 'CLAIMED',
        rewardLabel: '150 бонусов',
        reward: {
          status: 'PAID',
          rewardAmount: 150,
          paidAt: new Date('2026-10-03T12:05:00.000Z'),
        },
      }),
      walletRow({
        id: 'canceled',
        kind: 'REWARD',
        status: 'CLAIMED',
        reward: { status: 'CANCELED', rewardAmount: 50, paidAt: null },
      }),
    ]);

    expect(
      view.items.map(({ id, state, stateLabel, sourceLabel }) => ({
        id,
        state,
        stateLabel,
        sourceLabel,
      })),
    ).toEqual([
      {
        id: 'opened',
        state: 'DONE',
        stateLabel: 'кейс открыт',
        sourceLabel: 'Задание',
      },
      {
        id: 'waiting',
        state: 'WAITING',
        stateLabel: 'кейс выдан, не открыт',
        sourceLabel: 'Задание',
      },
      {
        id: 'expired',
        state: 'PROBLEM',
        stateLabel: 'кейс истёк, не открыт',
        sourceLabel: 'Задание',
      },
      {
        id: 'bonus',
        state: 'DONE',
        stateLabel: 'получена',
        sourceLabel: 'Кейс',
      },
      {
        id: 'canceled',
        state: 'PROBLEM',
        stateLabel: 'получена',
        sourceLabel: 'Задание',
      },
    ]);
    expect(view.items[3]?.payout).toEqual({
      amount: 150,
      statusLabel: 'начислено',
      paidAt: '2026-10-03T12:05:00.000Z',
    });
    expect(view.items[4]?.payout?.statusLabel).toBe('начисление отменено');
  });

  it('keeps other clubs apart and only counts them', () => {
    const view = build([
      walletRow({ id: 'here' }),
      walletRow({ id: 'there-1', storeId: 'store-b' }),
      walletRow({ id: 'there-2', storeId: 'store-b' }),
      walletRow({ id: 'unknown', storeId: null }),
    ]);

    expect(view.items.map((item) => item.id)).toEqual(['here']);
    expect(view.otherClubs).toEqual([
      { storeId: 'store-b', name: 'Клуб на Радищева', items: 2 },
    ]);
    expect(view.withoutClub).toBe(1);
    expect(view.since).toBe('2026-09-04T10:00:00.000Z');
  });

  it('caps the list and says so', () => {
    const view = build(
      Array.from({ length: SUPPORT_GUEST_REWARDS_LIMIT + 2 }, (_, index) =>
        walletRow({ id: `item-${index}` }),
      ),
    );

    expect(view.items).toHaveLength(SUPPORT_GUEST_REWARDS_LIMIT);
    expect(view.truncated).toBe(true);
  });
});

describe('SupportTicketsService guest rewards', () => {
  function fixture(ticket: Record<string, unknown> | null) {
    const prisma = {
      guestSupportTicket: { findFirst: jest.fn().mockResolvedValue(ticket) },
      guestGameRewardWalletItem: { findMany: jest.fn().mockResolvedValue([]) },
      store: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SupportTicketsService(
      prisma as never,
      { resolve: jest.fn(() => ({ tenantId: 'tenant-a' })) } as never,
      new ConfigService({}),
      {} as never,
    );
    return { service, prisma };
  }
  const actor = {
    id: 'user-a',
    tenantId: 'tenant-a',
    role: UserRole.ADMIN,
  } as never;

  it('reads only the ticket profile inside the ticket tenant', async () => {
    const { service, prisma } = fixture({
      id: 'ticket-a',
      tenantId: 'tenant-a',
      profileId: 'profile-a',
      createdAt: new Date('2026-10-04T10:00:00.000Z'),
      store: club,
    });

    const view = await service.getTenantTicketGuestRewards(actor, 'ticket-a');

    expect(prisma.guestSupportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-a', tenantId: 'tenant-a' },
      }),
    );
    expect(prisma.guestGameRewardWalletItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          profileId: 'profile-a',
          createdAt: { gte: new Date('2026-09-04T10:00:00.000Z') },
        },
      }),
    );
    expect(view.store).toEqual(club);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('returns not found for a ticket of another tenant', async () => {
    const { service, prisma } = fixture(null);

    await expect(
      service.getTenantTicketGuestRewards(actor, 'ticket-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.guestGameRewardWalletItem.findMany).not.toHaveBeenCalled();
  });
});
