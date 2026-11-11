import { BadRequestException } from '@nestjs/common';
import {
  GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST,
  GAME_PROFILE_STAFF_TEST_OWNER_MARKED_STAFF,
} from '../guest-gamification/guest-staff-test';
import { GUEST_STAFF_GROUP_ID, GuestsService } from './guests.service';

const user = { id: 'user-1', tenantId: 'tenant-1' } as never;

function createService() {
  const tx = {
    guest: { update: jest.fn() },
    guestGameProfile: {
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn(),
    },
    guestStaffMarkEvent: { create: jest.fn() },
  };
  const prisma = {
    guest: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'guest-1', phoneHash: 'phone-hash-1' }),
    },
    guestGroup: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'group-admin',
          name: 'Администраторы',
          externalDomain: 'club.langame.test',
          externalGroupId: '7',
        },
      ]),
    },
    store: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new GuestsService(
    prisma as never,
    { resolve: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }) } as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  const getGuest = jest
    .spyOn(service, 'getGuest')
    .mockResolvedValue({ id: 'guest-1' } as never);
  const invalidate = jest.spyOn(service['analysisCache'], 'invalidateTenant');

  return { service, prisma, tx, getGuest, invalidate };
}

describe('GuestsService staff mark', () => {
  it('marks the guest and every game profile of the same person', async () => {
    const { service, tx, getGuest, invalidate } = createService();

    await service.updateGuestStaffMark(user, 'guest-1', {
      isStaff: true,
      note: '  администратор смены  ',
    });

    expect(tx.guest.update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: expect.objectContaining({
        isStaff: true,
        staffMarkedByUserId: 'user-1',
        staffMarkedAt: expect.any(Date),
      }),
    });
    const profileWhere = {
      tenantId: 'tenant-1',
      OR: [{ guestId: 'guest-1' }, { phoneHash: 'phone-hash-1' }],
    };
    expect(tx.guestGameProfile.count).toHaveBeenCalledWith({
      where: { ...profileWhere, isStaffTest: false },
    });
    expect(tx.guestGameProfile.updateMany).toHaveBeenCalledWith({
      where: profileWhere,
      data: {
        isStaffTest: true,
        staffTestReason: GAME_PROFILE_STAFF_TEST_OWNER_MARKED_STAFF,
        staffTestMatchedAt: expect.any(Date),
      },
    });
    expect(tx.guestStaffMarkEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        isStaff: true,
        note: 'администратор смены',
        gameProfilesUpdated: 1,
        createdByUserId: 'user-1',
      },
    });
    expect(invalidate).toHaveBeenCalledWith('tenant-1');
    expect(getGuest).toHaveBeenCalledWith(user, 'guest-1');
  });

  it('unmarks as a confirmed guest so phone matching stays off', async () => {
    const { service, tx } = createService();

    await service.updateGuestStaffMark(user, 'guest-1', { isStaff: false });

    expect(tx.guest.update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: { isStaff: false, staffMarkedAt: null, staffMarkedByUserId: null },
    });
    expect(tx.guestGameProfile.updateMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      data: {
        isStaffTest: false,
        staffTestReason: GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST,
        staffTestMatchedAt: null,
      },
    });
    expect(tx.guestStaffMarkEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isStaff: false, note: null }),
    });
  });

  it('rejects a request without an explicit boolean', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateGuestStaffMark(user, 'guest-1', { isStaff: 'yes' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps marked staff out of guest analytics and lists them in their own group', async () => {
    const { service } = createService();
    const defaults = await service['resolveGuestFilters']('tenant-1', {});
    const staff = await service['resolveGuestFilters']('tenant-1', {
      guestGroupId: GUEST_STAFF_GROUP_ID,
    });

    expect(defaults.markedStaff).toBe('EXCLUDE');
    expect(service['buildGuestWhere']('tenant-1', defaults)).toMatchObject({
      isStaff: false,
      NOT: { OR: [{ externalGuestTypeId: '7' }] },
    });
    expect(staff.markedStaff).toBe('ONLY');
    const staffWhere = service['buildGuestWhere']('tenant-1', staff);
    expect(staffWhere).toMatchObject({ tenantId: 'tenant-1', isStaff: true });
    expect(staffWhere.NOT).toBeUndefined();
  });

  it('offers the staff group among the guest group filters', async () => {
    const { service } = createService();
    const options = await service.getFilterOptions(user);

    expect(options.groups.map((group) => group.id)).toEqual([
      'group-admin',
      GUEST_STAFF_GROUP_ID,
    ]);
  });
});
