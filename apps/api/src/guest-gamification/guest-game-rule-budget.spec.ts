import { Prisma } from '@prisma/client';
import {
  guestGameRuleBudgetExhausted,
  loadGuestGameRuleBudgetSpent,
} from './guest-game-rule-budget';

describe('guest game rule budget', () => {
  it('sums rewards only for rules that have a budget', async () => {
    const groupBy = jest.fn(({ by }: { by: string[] }) =>
      Promise.resolve(
        by[0] === 'lootBoxId'
          ? [
              {
                lootBoxId: 'box-a',
                _sum: { rewardAmount: new Prisma.Decimal(1200) },
              },
            ]
          : by[0] === 'missionId'
            ? [{ missionId: 'mission-a', _sum: { rewardAmount: null } }]
            : [],
      ),
    );

    const spent = await loadGuestGameRuleBudgetSpent(
      { guestGameReward: { groupBy } } as never,
      'tenant-1',
      {
        lootBoxes: [
          { id: 'box-a', budgetAmount: new Prisma.Decimal(5000) },
          { id: 'box-unlimited', budgetAmount: null },
        ],
        missions: [{ id: 'mission-a', budgetAmount: 100 }],
        seasons: [{ id: 'season-a', budgetAmount: null }],
      },
    );

    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['lootBoxId'],
        where: {
          tenantId: 'tenant-1',
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          lootBoxId: { in: ['box-a'] },
        },
      }),
    );
    expect(Object.fromEntries(spent)).toEqual({
      'box-a': 1200,
      'mission-a': 0,
    });
  });

  it('treats a rule as exhausted only when its budget is fully spent', () => {
    const spent = new Map([
      ['box-full', 5000],
      ['box-open', 4999.5],
    ]);

    expect(
      guestGameRuleBudgetExhausted(
        { id: 'box-full', budgetAmount: '5000.00' },
        spent,
      ),
    ).toBe(true);
    expect(
      guestGameRuleBudgetExhausted(
        { id: 'box-open', budgetAmount: 5000 },
        spent,
      ),
    ).toBe(false);
    expect(
      guestGameRuleBudgetExhausted({ id: 'box-new', budgetAmount: 0 }, spent),
    ).toBe(true);
    expect(
      guestGameRuleBudgetExhausted(
        { id: 'box-unlimited', budgetAmount: null },
        spent,
      ),
    ).toBe(false);
  });
});
