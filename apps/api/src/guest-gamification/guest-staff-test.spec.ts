import { GuestPortalService } from '../guest-portal/guest-portal.service';
import {
  GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST,
  GAME_PROFILE_STAFF_TEST_OWNER_MARKED_STAFF,
  guestGameProfileStaffTestAutoMarkable,
} from './guest-staff-test';

describe('staff marking respects the owner confirmation', () => {
  it('only matches profiles the owner has not confirmed as guests', () => {
    expect(guestGameProfileStaffTestAutoMarkable()).toEqual({
      OR: [
        { staffTestReason: null },
        {
          staffTestReason: {
            not: GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST,
          },
        },
      ],
    });
  });

  it('marks an existing profile at sign-in through the guarded update only', async () => {
    const service = new GuestPortalService(
      ...(Array.from(
        { length: 11 },
        () => ({}),
      ) as never as ConstructorParameters<typeof GuestPortalService>),
    );
    const tx = { guestGameProfile: { updateMany: jest.fn() } };
    const patch = {
      isStaffTest: true,
      staffTestReason: 'LANGAME_STAFF_PHONE_MATCH',
      staffTestMatchedAt: new Date('2026-10-14T05:00:00.000Z'),
    };

    await service['markStaffTestProfile'](tx as never, 'profile-1', patch);
    await service['markStaffTestProfile'](tx as never, 'profile-2', {});

    expect(tx.guestGameProfile.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.guestGameProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', ...guestGameProfileStaffTestAutoMarkable() },
      data: patch,
    });
  });

  it('marks a new sign-in as staff when the guest card of the phone is marked', async () => {
    const prisma = {
      guest: { findFirst: jest.fn().mockResolvedValue({ id: 'guest-1' }) },
      staffMember: { findMany: jest.fn().mockResolvedValue([]) },
      langameStaffUser: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new GuestPortalService(
      prisma as never,
      ...(Array.from(
        { length: 10 },
        () => ({}),
      ) as never as ConstructorParameters<typeof GuestPortalService>),
    );
    const phone = { normalized: '79990001122', hash: 'hash-1', masked: '•' };

    const match = await service['resolveStaffTestMatch']('tenant-1', phone);

    expect(prisma.guest.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', phoneHash: 'hash-1', isStaff: true },
      select: { id: true },
    });
    expect(match).toEqual({
      reason: GAME_PROFILE_STAFF_TEST_OWNER_MARKED_STAFF,
      matchedAt: expect.any(Date),
    });

    prisma.guest.findFirst.mockResolvedValue(null);
    await expect(
      service['resolveStaffTestMatch']('tenant-1', phone),
    ).resolves.toBeNull();
  });
});
