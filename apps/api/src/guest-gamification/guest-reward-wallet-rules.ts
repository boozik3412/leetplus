import type { Prisma } from '@prisma/client';

export const GUEST_GAME_BATTLE_PASS_COMPLETION_MARKER_TYPE =
  'BATTLE_PASS_COMPLETION_MARKER';
export const GUEST_GAME_SETTLED_LEDGER_STATUS = 'CONFIRMED';
export const GUEST_GAME_SETTLED_LEDGER_SOURCE = 'GAMIFICATION_REWARD';
export const GUEST_GAME_SETTLED_LEDGER_ENTRY_TYPE = 'EARN';
export const GUEST_GAME_SETTLED_DELIVERY_STATUS = 'SENT';

export function guestGameRewardIsBattlePassCompletionMarker(input: {
  rewardType?: string | null;
  rewardAmount?: Prisma.Decimal | number | string | null;
}) {
  const rewardType = input.rewardType?.trim().toUpperCase();
  const rewardAmount = Number(input.rewardAmount);

  return (
    rewardType === GUEST_GAME_BATTLE_PASS_COMPLETION_MARKER_TYPE &&
    Number.isFinite(rewardAmount) &&
    rewardAmount === 0
  );
}
