import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoreFloorPlanAttentionService } from './store-floor-plan-attention.service';

const now = new Date('2026-11-12T15:00:00.000Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

const admin = {
  id: 'user-1',
  role: 'CLUB_ADMINISTRATOR',
  isPlatformAdmin: false,
  permissions: ['view_club_scheme', 'view_guests', 'manage_communications'],
} as unknown as AuthenticatedUser;
const noGuests = {
  ...admin,
  permissions: ['view_club_scheme', 'manage_communications'],
} as unknown as AuthenticatedUser;

function gameRow(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Гость ${id}`,
    segment: 'active',
    visitsDays: 5,
    rfm: { segment: 'PROMISING' },
    crmStatus: 'NONE',
    nextAction: null,
    bonusLoad: { status: 'OK', currentBalance: 0 },
    gameProfile: {
      pendingRewards: 0,
      rewardsExpiringSoon: 0,
      nearestRewardExpiresAt: null,
      engagement: 'ACTIVE',
    },
    ...patch,
  };
}

function setup() {
  const prisma = {
    guest: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'g-10', externalGuestId: 'lg-10', isStaff: false },
        { id: 'g-21', externalGuestId: 'lg-21', isStaff: false },
        { id: 'g-5', externalGuestId: 'lg-5', isStaff: true },
      ]),
    },
    guestSession: { findFirst: jest.fn().mockResolvedValue(null) },
    guestSupportTicket: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { status: unknown } }) =>
          Promise.resolve(
            args.where.status === 'RESOLVED'
              ? []
              : [
                  {
                    id: 't-1',
                    ticketNumber: 'LP-1',
                    guestId: 'g-21',
                    kind: 'TELEGRAM',
                    description: 'Первое сообщение',
                    status: 'NEW',
                    createdAt: minutes(-3),
                    lastActivityAt: minutes(-2),
                    comments: [{ body: 'Не работает\nгарнитура' }],
                  },
                  {
                    id: 't-2',
                    ticketNumber: 'LP-2',
                    guestId: 'g-out',
                    kind: 'BUG',
                    description: 'Не начислился кейс',
                    status: 'IN_PROGRESS',
                    createdAt: minutes(-50),
                    lastActivityAt: minutes(-40),
                    comments: [],
                  },
                ],
          ),
        ),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestSupportTicketAuditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const freshStoreScopeService = {
    resolveRequestedStoreIds: jest
      .fn()
      .mockResolvedValue({ tenantId: 'tenant-1', storeIds: ['store-1'] }),
  };
  const liveService = {
    seatedGuests: jest.fn().mockResolvedValue({
      storeId: 'store-1',
      tenantId: 'tenant-1',
      timeZone: 'Europe/Moscow',
      domain: 'club.langame.ru',
      seats: [
        {
          number: 5,
          langameGuestId: 'lg-5',
          startedAt: minutes(-30),
          endsAt: minutes(5),
          purchases: 1,
        },
        {
          number: 8,
          langameGuestId: 'lg-8',
          startedAt: minutes(-20),
          endsAt: null,
          purchases: 0,
        },
        {
          number: 10,
          langameGuestId: 'lg-10',
          startedAt: minutes(-90),
          endsAt: null,
          purchases: 1,
        },
        {
          number: 21,
          langameGuestId: 'lg-21',
          startedAt: minutes(-100),
          endsAt: null,
          purchases: 2,
        },
      ],
    }),
  };
  const guestsService = {
    floorPlanGuestRows: jest.fn().mockResolvedValue([
      gameRow('g-10', {
        gameProfile: {
          pendingRewards: 2,
          rewardsExpiringSoon: 0,
          nearestRewardExpiresAt: null,
          engagement: 'ACTIVE',
        },
      }),
      gameRow('g-21'),
      gameRow('g-5', { segment: 'repeat', gameProfile: null }),
      gameRow('g-out'),
    ]),
  };
  const service = new StoreFloorPlanAttentionService(
    prisma as never,
    freshStoreScopeService as never,
    liveService as never,
    guestsService as never,
  );
  return { service, prisma, liveService, guestsService };
}

describe('StoreFloorPlanAttentionService', () => {
  it('puts hints and guest messages on the computers of the club', async () => {
    const { service, guestsService, prisma } = setup();
    const view = await service.get('store-1', admin, now);

    expect(view.guestAccess).toBe('AVAILABLE');
    expect(
      view.seats.map((seat) => [
        seat.number,
        seat.guestName,
        seat.hints.map((hint) => hint.key),
      ]),
    ).toEqual([
      // Staff: only the session hint.
      [5, 'Гость g-5', ['TIME_ENDING']],
      // Not in the LeetPlus base yet.
      [8, null, ['FIRST_VISIT']],
      [10, 'Гость g-10', ['REWARDS_WAITING']],
      [21, 'Гость g-21', ['GUEST_MESSAGE']],
    ]);
    expect(view.seats[3].hints[0]).toMatchObject({
      tone: 'ALERT',
      hint: 'Не работает гарнитура',
      alertId: 't-1',
    });
    expect(view.alerts).toEqual([
      expect.objectContaining({
        id: 't-1',
        number: 21,
        guestName: 'Гость g-21',
        channel: 'TELEGRAM',
        text: 'Не работает гарнитура',
        status: 'NEW',
      }),
      expect.objectContaining({
        id: 't-2',
        number: null,
        channel: 'APP',
        text: 'Не начислился кейс',
        status: 'IN_PROGRESS',
      }),
    ]);
    expect(guestsService.floorPlanGuestRows).toHaveBeenCalledWith('tenant-1', [
      'g-10',
      'g-21',
      'g-5',
      'g-out',
    ]);
    expect(JSON.stringify(view)).not.toContain('lg-');
    expect(prisma.guestSupportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          storeId: 'store-1',
        }) as unknown,
      }),
    );
  });

  it('shows only session hints to a viewer without the «Гости» section', async () => {
    const { service, prisma, guestsService } = setup();
    const view = await service.get('store-1', noGuests, now);

    expect(view.guestAccess).toBe('NO_CAPABILITY');
    expect(view.alerts).toEqual([]);
    expect(view.seats).toEqual([
      {
        number: 5,
        guestId: null,
        guestName: null,
        hints: [expect.objectContaining({ key: 'TIME_ENDING' })],
      },
    ]);
    expect(prisma.guest.findMany).not.toHaveBeenCalled();
    expect(prisma.guestSupportTicket.findMany).not.toHaveBeenCalled();
    expect(guestsService.floorPlanGuestRows).not.toHaveBeenCalled();
  });

  it('shares one build per club within the window but checks scope every time', async () => {
    const { service, liveService, guestsService } = setup();
    await service.get('store-1', admin, now);
    await service.get('store-1', admin, new Date(now.getTime() + 5_000));
    expect(liveService.seatedGuests).toHaveBeenCalledTimes(2);
    expect(guestsService.floorPlanGuestRows).toHaveBeenCalledTimes(1);
    await service.get('store-1', admin, new Date(now.getTime() + 16_000));
    expect(guestsService.floorPlanGuestRows).toHaveBeenCalledTimes(2);
  });

  describe('updateAlert', () => {
    it('marks a message of the club as taken and logs who did it', async () => {
      const { service, prisma } = setup();
      prisma.guestSupportTicket.findFirst.mockResolvedValue({
        id: 't-1',
        tenantId: 'tenant-1',
        status: 'NEW',
      });

      await expect(
        service.updateAlert(
          'store-1',
          't-1',
          { status: 'IN_PROGRESS' },
          admin,
          now,
        ),
      ).resolves.toEqual({ id: 't-1', status: 'IN_PROGRESS' });
      expect(prisma.guestSupportTicket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1', tenantId: 'tenant-1', storeId: 'store-1' },
        }),
      );
      expect(prisma.guestSupportTicket.updateMany).toHaveBeenCalledWith({
        where: { id: 't-1', tenantId: 'tenant-1', status: 'NEW' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          resolvedAt: null,
        }) as unknown,
      });
      expect(prisma.guestSupportTicketAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          action: 'UPDATED_FROM_CLUB_SCHEME',
        }) as unknown,
      });
    });

    it('refuses other statuses, other clubs, closed messages and viewers without guests', async () => {
      const { service, prisma } = setup();
      await expect(
        service.updateAlert('store-1', 't-1', { status: 'CLOSED' }, admin, now),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateAlert(
          'store-1',
          't-1',
          { status: 'RESOLVED' },
          noGuests,
          now,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      prisma.guestSupportTicket.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.updateAlert(
          'store-1',
          't-9',
          { status: 'RESOLVED' },
          admin,
          now,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.guestSupportTicket.findFirst.mockResolvedValueOnce({
        id: 't-1',
        tenantId: 'tenant-1',
        status: 'CLOSED',
      });
      await expect(
        service.updateAlert(
          'store-1',
          't-1',
          { status: 'RESOLVED' },
          admin,
          now,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.guestSupportTicket.findFirst.mockResolvedValueOnce({
        id: 't-1',
        tenantId: 'tenant-1',
        status: 'IN_PROGRESS',
      });
      prisma.guestSupportTicket.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.updateAlert(
          'store-1',
          't-1',
          { status: 'RESOLVED' },
          admin,
          now,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestSupportTicketAuditEvent.create).not.toHaveBeenCalled();
    });
  });
});
