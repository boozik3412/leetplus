import type { Prisma } from '@prisma/client';

// A game profile is marked as staff (excluded from the leaderboard and guest
// statistics) when its phone matches a staff member or a Langame
// administrator account. Langame keeps former administrators without a
// "dismissed" status, so the owner can confirm that a person is a guest;
// automatic matching must never mark such a profile again.
export const GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST =
  'OWNER_CONFIRMED_GUEST';

export function guestGameProfileStaffTestAutoMarkable(): Prisma.GuestGameProfileWhereInput {
  return {
    OR: [
      { staffTestReason: null },
      {
        staffTestReason: { not: GAME_PROFILE_STAFF_TEST_OWNER_CONFIRMED_GUEST },
      },
    ],
  };
}
