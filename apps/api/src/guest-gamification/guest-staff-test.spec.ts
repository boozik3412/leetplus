import { GuestPortalService } from '../guest-portal/guest-portal.service';
import {
  GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST,
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
});
