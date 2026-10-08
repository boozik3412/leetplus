import type { GuestGamificationService } from '../guest-gamification/guest-gamification.service';
import type { PrismaService } from '../prisma/prisma.service';
import { leaderboardSettlementDue } from './guest-leaderboard-core';
import { GuestLeaderboardReadService } from './guest-leaderboard-read.service';
import { GuestLeaderboardSettlementService } from './guest-leaderboard-settlement.service';

type ResultRow = {
  id: string;
  tenantId: string;
  periodKey: string;
  scopeKey: string;
  storeId: string | null;
  board: string;
  rank: number;
  profileId: string;
  value: number;
  prize: Record<string, unknown> | null;
  status: string;
  rewardId: string | null;
  createdAt: Date;
};

// 01.11 13:00 in Yekaterinburg: October ended 18 h ago there.
const NOW = new Date('2026-11-01T08:00:00.000Z');

function activity(profileId: string, minutes: number) {
  return {
    profileId,
    storeId: 'rad',
    playMinutes: minutes,
    sessions: 0,
    quests: 0,
    cases: 0,
    checkIns: 0,
  };
}

function setup(options: { createdAt?: Date; existingResults?: number } = {}) {
  const results: ResultRow[] = [];
  const audits: Array<{ action: string }> = [];
  const entitlements: Array<Record<string, unknown>> = [];
  const walletItems: Array<Record<string, unknown>> = [];
  const createReward = jest.fn((_user: unknown, dto: Record<string, unknown>) =>
    Promise.resolve({ id: `reward-${String(dto.profileId)}` }),
  );

  const prisma: Record<string, unknown> = {
    guestLeaderboardSettings: {
      findUnique: () =>
        Promise.resolve({
          enabled: true,
          createdAt: options.createdAt ?? new Date('2026-10-08T00:00:00Z'),
          revision: 2,
          updatedAt: NOW,
          config: {
            networkEnabled: false,
            boards: {
              points: false,
              hours: true,
              sessions: false,
              quests: false,
              cases: false,
            },
            prizes: {
              rad: {
                hours: [
                  { kind: 'BONUS', amount: 500 },
                  { kind: 'LOOT_BOX', lootBoxId: 'box' },
                  { kind: 'CUSTOM', label: '2 часа игры' },
                ],
              },
            },
          },
        }),
    },
    store: {
      findMany: () =>
        Promise.resolve([
          { id: 'rad', name: '1337 Радищева', timeZone: 'Asia/Yekaterinburg' },
        ]),
    },
    $queryRaw: () =>
      Promise.resolve([
        activity('p1', 900),
        activity('p2', 600),
        activity('p3', 300),
        activity('p4', 60),
      ]),
    guestLeaderboardPeriodResult: {
      count: () => Promise.resolve(options.existingResults ?? results.length),
      createMany: ({ data }: { data: Array<Omit<ResultRow, 'id'>> }) => {
        data.forEach((row, index) =>
          results.push({
            ...row,
            id: `result-${index + 1}`,
            prize:
              row.prize && typeof row.prize === 'object' ? row.prize : null,
            rewardId: null,
            createdAt: NOW,
          }),
        );
        return Promise.resolve({ count: data.length });
      },
      findMany: ({ where }: { where: { status: string } }) =>
        Promise.resolve(results.filter((row) => row.status === where.status)),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ResultRow>;
      }) => {
        const row = results.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      },
    },
    guestGameLootBox: {
      findMany: () => Promise.resolve([{ id: 'box', name: 'Легенда' }]),
      findFirst: () => Promise.resolve({ id: 'box', name: 'Легенда' }),
    },
    guestGameProfile: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          guestId: `guest-${where.id}`,
          status: 'ACTIVE',
          gameActivatedAt: new Date('2026-09-01T00:00:00Z'),
        }),
      findMany: () => Promise.resolve([]),
    },
    guestGameReward: { findFirst: () => Promise.resolve(null) },
    guestGameEntitlement: {
      upsert: ({ create }: { create: Record<string, unknown> }) => {
        entitlements.push(create);
        return Promise.resolve({ id: 'entitlement-1' });
      },
    },
    guestGameRewardWalletItem: {
      upsert: ({ create }: { create: Record<string, unknown> }) => {
        walletItems.push(create);
        return Promise.resolve(create);
      },
    },
    guestGameAuditEvent: {
      create: ({ data }: { data: { action: string } }) => {
        audits.push(data);
        return Promise.resolve(data);
      },
    },
    tenant: {
      findUnique: () =>
        Promise.resolve({
          id: 't',
          slug: 'demo',
          status: 'ACTIVE',
          users: [
            {
              id: 'owner',
              email: 'owner@leetplus.test',
              fullName: null,
              role: 'OWNER',
              customRoleId: null,
              isPlatformAdmin: false,
            },
          ],
        }),
    },
  };
  prisma.$transaction = (run: (tx: unknown) => Promise<unknown>) => run(prisma);

  const reader = new GuestLeaderboardReadService(
    prisma as unknown as PrismaService,
  );
  const service = new GuestLeaderboardSettlementService(
    prisma as unknown as PrismaService,
    reader,
    { createReward } as unknown as GuestGamificationService,
  );
  return { service, results, audits, entitlements, walletItems, createReward };
}

describe('guest leaderboard settlement', () => {
  it('waits for the grace period and skips months before the leaderboard', () => {
    const period = { to: new Date('2026-10-31T19:00:00Z') };
    const createdAt = new Date('2026-10-08T00:00:00Z');
    expect(
      leaderboardSettlementDue(
        period,
        new Date('2026-11-01T06:59:00Z'),
        createdAt,
      ),
    ).toBe(false);
    expect(
      leaderboardSettlementDue(
        period,
        new Date('2026-11-01T07:00:00Z'),
        createdAt,
      ),
    ).toBe(true);
    expect(
      leaderboardSettlementDue(
        { to: new Date('2026-09-30T19:00:00Z') },
        NOW,
        createdAt,
      ),
    ).toBe(false);
  });

  it('freezes the month once and issues each prize by its own path', async () => {
    const {
      service,
      results,
      audits,
      entitlements,
      walletItems,
      createReward,
    } = setup();

    const first = await service.settleTenant('t', NOW);

    expect(
      results.map((row) => [row.rank, row.profileId, row.value, row.status]),
    ).toEqual([
      [1, 'p1', 900, 'PRIZE_ISSUED'],
      [2, 'p2', 600, 'PRIZE_ISSUED'],
      [3, 'p3', 300, 'MANUAL_PRIZE'],
      [4, 'p4', 60, 'RECORDED'],
    ]);
    expect(results[0]).toMatchObject({
      periodKey: '2026-10',
      scopeKey: 'rad',
      board: 'hours',
      rewardId: 'reward-p1',
    });
    expect(first).toMatchObject({
      frozenBoards: 1,
      frozenRows: 4,
      prizesIssued: 2,
      manualPrizes: 1,
      prizesFailed: 0,
    });

    // BONUS: an approved bonus reward with a wallet claim, one per winner.
    expect(createReward).toHaveBeenCalledTimes(1);
    const [, dto, identity] = createReward.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(dto).toMatchObject({
      profileId: 'p1',
      status: 'APPROVED',
      rewardType: 'BONUS',
      rewardAmount: 500,
      rewardLabel:
        'Рейтинг · октябрь · 1-е место · Часы · 1337 Радищева: 500 бонусов',
    });
    expect(identity).toMatchObject({
      idempotencyKey: 'guest-leaderboard-prize:v1:t:2026-10:rad:hours:p1',
      claimRequired: true,
    });

    // LOOT_BOX: an available case with a wallet item.
    expect(entitlements).toEqual([
      expect.objectContaining({
        profileId: 'p2',
        ruleType: 'LOOT_BOX',
        ruleId: 'box',
        status: 'AVAILABLE',
        storeId: 'rad',
      }),
    ]);
    expect(walletItems).toEqual([
      expect.objectContaining({
        profileId: 'p2',
        kind: 'LOOT_BOX_ENTITLEMENT',
        status: 'PENDING',
        rewardLabel: 'Кейс «Легенда»',
      }),
    ]);
    expect(audits.map((row) => row.action)).toEqual([
      'LEADERBOARD_PRIZE_ISSUED',
      'LEADERBOARD_PRIZE_ISSUED',
      'LEADERBOARD_PRIZE_MANUAL',
    ]);

    // A second tick finds the month frozen and nothing pending.
    const second = await service.settleTenant('t', NOW);
    expect(second).toMatchObject({ frozenRows: 0, prizesIssued: 0 });
    expect(createReward).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the month is due', async () => {
    const { service, results } = setup();
    const result = await service.settleTenant(
      't',
      new Date('2026-10-31T23:00:00Z'),
    );
    expect(result.frozenRows).toBe(0);
    expect(results).toEqual([]);
  });

  it('marks a prize that cannot be issued and keeps going', async () => {
    const { service, results, createReward } = setup();
    createReward.mockRejectedValueOnce(new Error('bonus ledger is closed'));

    const result = await service.settleTenant('t', NOW);

    expect(result.prizesFailed).toBe(1);
    expect(result.failures[0]).toContain('bonus ledger is closed');
    expect(results[0]).toMatchObject({ status: 'PRIZE_FAILED' });
    expect(results[0].prize).toMatchObject({ error: 'bonus ledger is closed' });
    expect(results[1]).toMatchObject({ status: 'PRIZE_ISSUED' });
  });
});
