import {
  guestGameLootBoxDailyLimitExhausted,
  guestGameMissionTotalLimitExhausted,
  loadGuestGameRuleLimitUsage,
} from './guest-game-rule-limit-usage';

describe('guest game rule limit usage', () => {
  it('flags a mission once its lifetime reward limit is used up', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'mission-full', issued: 1007 },
        { id: 'mission-open', issued: 999 },
      ]),
    };
    const missions = [
      { id: 'mission-full', totalRewardLimit: 1000 },
      { id: 'mission-open', totalRewardLimit: 1000 },
      { id: 'mission-unlimited', totalRewardLimit: null },
    ];

    const usage = await loadGuestGameRuleLimitUsage(db, 'tenant-1', {
      missions,
      timeZone: 'Asia/Yekaterinburg',
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      missions
        .filter((mission) =>
          guestGameMissionTotalLimitExhausted(mission, usage),
        )
        .map((mission) => mission.id),
    ).toEqual(['mission-full']);
  });

  it('flags a case whose daily limit is reached and skips unlimited ones', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'box-full', issued: 30 }]),
    };
    const lootBoxes = [
      { id: 'box-full', limits: { totalPerDay: 30 } },
      { id: 'box-no-limit', limits: {} },
    ];

    const usage = await loadGuestGameRuleLimitUsage(db, 'tenant-1', {
      lootBoxes,
      timeZone: 'Asia/Yekaterinburg',
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      lootBoxes
        .filter((box) => guestGameLootBoxDailyLimitExhausted(box, usage))
        .map((box) => box.id),
    ).toEqual(['box-full']);
  });

  it('runs no query when no rule has a global limit', async () => {
    const db = { $queryRaw: jest.fn() };

    await loadGuestGameRuleLimitUsage(db, 'tenant-1', {
      missions: [{ id: 'm', totalRewardLimit: null }],
      lootBoxes: [{ id: 'b', limits: null }],
      timeZone: 'UTC',
    });

    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
