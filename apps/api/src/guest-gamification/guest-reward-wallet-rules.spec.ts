import {
  GUEST_GAME_BATTLE_PASS_COMPLETION_MARKER_TYPE,
  guestGameRewardIsBattlePassCompletionMarker,
} from './guest-reward-wallet-rules';

describe('guest reward wallet rules', () => {
  it('recognizes only the explicit zero-value Battle Pass completion marker', () => {
    expect(
      guestGameRewardIsBattlePassCompletionMarker({
        rewardType: GUEST_GAME_BATTLE_PASS_COMPLETION_MARKER_TYPE,
        rewardAmount: 0,
      }),
    ).toBe(true);

    expect(
      guestGameRewardIsBattlePassCompletionMarker({
        rewardType: GUEST_GAME_BATTLE_PASS_COMPLETION_MARKER_TYPE,
        rewardAmount: -1,
      }),
    ).toBe(false);
    expect(
      guestGameRewardIsBattlePassCompletionMarker({
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 0,
      }),
    ).toBe(false);
  });
});
