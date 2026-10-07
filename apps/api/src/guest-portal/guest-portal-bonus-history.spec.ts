import { Prisma } from '@prisma/client';
import { buildBonusLedgerHistory } from './guest-portal.service';

function ledgerRow(overrides: Record<string, unknown> = {}) {
  const at = new Date('2026-10-06T16:16:55.000Z');
  return {
    id: 'ledger-entry-1',
    rewardId: 'reward-1',
    status: 'CONFIRMED',
    entryType: 'EARN',
    amount: new Prisma.Decimal(500),
    balanceAfter: new Prisma.Decimal(1636),
    processedAt: at,
    confirmedAt: at,
    failedAt: null,
    canceledAt: null,
    createdAt: at,
    updatedAt: at,
    reward: {
      rewardLabel: '500 бонусов',
      rewardType: 'BONUS_BALANCE',
      qualifiedAt: at,
      lootBoxId: 'loot-box-1',
      missionId: null,
      seasonId: null,
      lootBox: { name: 'КЕЙС «КАМБЭК»' },
      mission: null,
      season: null,
    },
    store: { name: '1337 Радищева' },
    ...overrides,
  };
}

describe('guest bonus history', () => {
  it('links a payout to the reward it pays so the history can merge them', () => {
    const history = buildBonusLedgerHistory([ledgerRow()]);

    expect(history.items).toEqual([
      expect.objectContaining({
        id: 'ledger-entry-1',
        rewardId: 'reward-1',
        amount: 500,
        title: '500 бонусов',
      }),
    ]);
  });

  it('keeps entries without a reward, such as manual adjustments', () => {
    const history = buildBonusLedgerHistory([
      ledgerRow({ id: 'manual-1', rewardId: null, reward: null }),
    ]);

    expect(history.items[0]).toMatchObject({ id: 'manual-1', rewardId: null });
  });
});
