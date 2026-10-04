import { BadRequestException } from '@nestjs/common';
import { GuestPortalService } from './guest-portal.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const currentStoreId = '22222222-2222-4222-8222-222222222222';
const otherStoreId = '33333333-3333-4333-8333-333333333333';

function fixture(mode = 'LIVE') {
  const prisma = {
    store: {
      findMany: jest.fn().mockResolvedValue([
        { id: otherStoreId, name: 'Клуб на Радищева' },
        { id: currentStoreId, name: 'Клуб на Холмогорова' },
      ]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'GUEST_BUG_REPORTING_MODE' ? mode : undefined,
    ),
  };
  const guestSupportService = {
    createBugReport: jest.fn().mockResolvedValue({
      ticketNumber: 'LP-BUG-A1B2C3D4',
      createdAt: '2026-10-04T10:00:00.000Z',
    }),
  };
  const service = new GuestPortalService(
    prisma as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    guestSupportService as never,
  );
  jest.spyOn(service as never, 'verifyGuestToken').mockResolvedValue({
    tenantId,
    storeId: currentStoreId,
    guestId: 'guest-a',
  } as never);
  jest
    .spyOn(service as never, 'findProfile')
    .mockResolvedValue({ id: 'profile-a', guestId: 'guest-a' } as never);
  return { service, prisma, guestSupportService };
}

const input = {
  topic: 'LOOT_BOXES_AND_REWARDS',
  description: 'Кейс WEEKEND не выдали после сессии в клубе.',
};

function sentContext(
  guestSupportService: ReturnType<typeof fixture>['guestSupportService'],
) {
  return (
    guestSupportService.createBugReport.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >
  )[0]?.[0];
}

describe('guest bug report club', () => {
  it('offers the clubs of the guest network with the current club first', async () => {
    const { service, prisma } = fixture();

    const support = await service['guestSupportConfiguration']({
      tenantId,
      storeId: currentStoreId,
    });

    expect(support.bugReporting.currentClubId).toBe(currentStoreId);
    expect(support.bugReporting.clubs.map((club) => club.id)).toEqual([
      currentStoreId,
      otherStoreId,
    ]);
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          OR: [{ id: currentStoreId }, { isActive: true }],
        },
      }),
    );
  });

  it('does not query clubs while bug reporting is off', async () => {
    const { service, prisma } = fixture('OFF');

    const support = await service['guestSupportConfiguration']({
      tenantId,
      storeId: currentStoreId,
    });

    expect(support.bugReporting.clubs).toEqual([]);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('files the report for the selected club by default', async () => {
    const { service, prisma, guestSupportService } = fixture();

    await service.createBugReport('Bearer x', 'bug:key-12345', 'UA', input);

    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(sentContext(guestSupportService)).toMatchObject({
      tenantId,
      storeId: currentStoreId,
      reportedFromStoreId: currentStoreId,
    });
  });

  it('files the report for another active club of the same network', async () => {
    const { service, prisma, guestSupportService } = fixture();
    prisma.store.findFirst.mockResolvedValue({ id: otherStoreId });

    await service.createBugReport('Bearer x', 'bug:key-12345', 'UA', {
      ...input,
      storeId: otherStoreId,
    });

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: {
        id: otherStoreId,
        tenantId,
        isActive: true,
      },
      select: { id: true },
    });
    expect(sentContext(guestSupportService)).toMatchObject({
      storeId: otherStoreId,
      reportedFromStoreId: currentStoreId,
    });
  });

  it('rejects a club of another network or a malformed id', async () => {
    const { service, prisma, guestSupportService } = fixture();

    await expect(
      service.createBugReport('Bearer x', 'bug:key-12345', 'UA', {
        ...input,
        storeId: otherStoreId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createBugReport('Bearer x', 'bug:key-12345', 'UA', {
        ...input,
        storeId: "x' OR 1=1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.store.findFirst).toHaveBeenCalledTimes(1);
    expect(guestSupportService.createBugReport).not.toHaveBeenCalled();
  });
});
