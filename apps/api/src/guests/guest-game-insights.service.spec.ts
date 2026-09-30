import { GuestGameInsightsService } from './guest-game-insights.service';

const period = {
  fromDate: new Date('2026-07-01T00:00:00.000Z'),
  toDate: new Date('2026-09-30T23:59:59.999Z'),
  from: '2026-07-01',
  to: '2026-09-30',
};
const now = new Date('2026-09-30T12:00:00.000Z');

function firstCallArg<T>(fn: jest.Mock): T {
  return (fn.mock.calls as unknown[][])[0][0] as T;
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    guestId: 'guest-1',
    status: 'ACTIVE',
    level: 2,
    xp: 640,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    gameActivatedAt: new Date('2026-08-01T00:00:00.000Z'),
    lastActivityAt: new Date('2026-08-01T00:00:00.000Z'),
    isStaffTest: false,
    telegramIdentity: 'tg:1',
    maxIdentity: null,
    phoneConsentStatus: 'GRANTED',
    ...overrides,
  };
}

describe('GuestGameInsightsService', () => {
  const profileFindMany = jest.fn();
  const profileFindFirst = jest.fn();
  const profileCount = jest.fn();
  const walletFindMany = jest.fn();
  const rewardFindMany = jest.fn();
  const rewardCount = jest.fn();
  const ledgerFindMany = jest.fn();
  const ledgerCount = jest.fn();
  const eventFindMany = jest.fn();
  const eventCount = jest.fn();
  let service: GuestGameInsightsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuestGameInsightsService({
      guestGameProfile: {
        findMany: profileFindMany,
        findFirst: profileFindFirst,
        count: profileCount,
      },
      guestGameRewardWalletItem: { findMany: walletFindMany },
      guestGameReward: { findMany: rewardFindMany, count: rewardCount },
      guestBonusLedgerEntry: { findMany: ledgerFindMany, count: ledgerCount },
      guestGameEvent: { findMany: eventFindMany, count: eventCount },
    } as never);
  });

  it('returns an empty map without guest ids and without profiles', async () => {
    expect((await service.loadGuestGameFacts('t', [], period, now)).size).toBe(
      0,
    );
    expect(profileFindMany).not.toHaveBeenCalled();

    profileFindMany.mockResolvedValueOnce([]);
    expect(
      (await service.loadGuestGameFacts('t', ['guest-1'], period, now)).size,
    ).toBe(0);
    expect(walletFindMany).not.toHaveBeenCalled();
  });

  it('keys the projection by guest id and only reads trusted event sources', async () => {
    profileFindMany.mockResolvedValueOnce([
      profileRow(),
      profileRow({
        id: 'profile-2',
        guestId: 'guest-2',
        gameActivatedAt: null,
      }),
    ]);
    walletFindMany.mockResolvedValueOnce([
      {
        profileId: 'profile-1',
        status: 'PENDING',
        availableAt: new Date('2026-09-20T00:00:00.000Z'),
        expiresAt: new Date('2026-10-20T00:00:00.000Z'),
      },
    ]);
    rewardFindMany.mockResolvedValueOnce([
      {
        profileId: 'profile-1',
        status: 'PAID',
        qualifiedAt: new Date('2026-09-05T00:00:00.000Z'),
        paidAt: new Date('2026-09-06T00:00:00.000Z'),
      },
    ]);
    ledgerFindMany.mockResolvedValueOnce([
      {
        profileId: 'profile-1',
        status: 'CONFIRMED',
        amount: { toString: () => '120.50' },
        confirmedAt: new Date('2026-09-06T00:00:00.000Z'),
      },
    ]);
    eventFindMany.mockResolvedValueOnce([
      {
        profileId: 'profile-1',
        occurredAt: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);

    const facts = await service.loadGuestGameFacts(
      't',
      ['guest-1', 'guest-2', 'guest-3'],
      period,
      now,
    );

    expect([...facts.keys()].sort()).toEqual(['guest-1', 'guest-2']);
    expect(facts.get('guest-1')).toEqual(
      expect.objectContaining({
        profileId: 'profile-1',
        pendingRewards: 1,
        rewardsPaidInPeriod: 1,
        bonusConfirmedInPeriod: 120.5,
        gameEventsInPeriod: 1,
        engagement: 'ACTIVE',
      }),
    );
    expect(facts.get('guest-2')?.engagement).toBe('NOT_ACTIVATED');

    const profileArgs = firstCallArg<{
      where: { tenantId: string; guestId: { in: string[] } };
    }>(profileFindMany);
    expect(profileArgs.where).toEqual({
      tenantId: 't',
      guestId: { in: ['guest-1', 'guest-2', 'guest-3'] },
    });

    const eventArgs = firstCallArg<{
      where: { source: { in: string[] }; profileId: { in: string[] } };
    }>(eventFindMany);
    expect(eventArgs.where.source.in).toEqual([
      'LANGAME',
      'API_IMPORT',
      'SYSTEM',
      'CHECK_IN',
    ]);
    expect(eventArgs.where.profileId.in).toEqual(['profile-1', 'profile-2']);

    const walletArgs = firstCallArg<{
      where: { status: { in: string[] }; expiresAt: { gt: Date } };
    }>(walletFindMany);
    expect(walletArgs.where.status.in).toEqual(['PENDING', 'FAILED']);
    expect(walletArgs.where.expiresAt.gt).toEqual(now);
  });

  it('counts unlinked profiles without staff test profiles', async () => {
    profileCount.mockResolvedValueOnce(4);

    await expect(service.countUnlinkedProfiles('t')).resolves.toBe(4);
    expect(profileCount).toHaveBeenCalledWith({
      where: { tenantId: 't', guestId: null, isStaffTest: false },
    });
  });

  it('returns null detail when the guest has no profile', async () => {
    profileFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.loadGuestGameDetail('t', 'guest-1', period, now),
    ).resolves.toBeNull();
    expect(rewardFindMany).not.toHaveBeenCalled();
  });

  it('maps reward, wallet, ledger and event details without raw payloads', async () => {
    profileFindFirst.mockResolvedValueOnce(profileRow());
    walletFindMany.mockResolvedValueOnce([]);
    rewardFindMany.mockResolvedValueOnce([]);
    ledgerFindMany.mockResolvedValueOnce([]);
    eventFindMany.mockResolvedValueOnce([]);
    rewardFindMany.mockResolvedValueOnce([
      {
        id: 'reward-1',
        status: 'PAID',
        source: 'LANGAME',
        rewardType: 'BONUS_BALANCE',
        rewardAmount: { toString: () => '150' },
        rewardLabel: '150 бонусов',
        qualifiedAt: new Date('2026-09-05T00:00:00.000Z'),
        paidAt: new Date('2026-09-06T00:00:00.000Z'),
        claimExpiresAt: null,
        expiresAt: null,
        mission: { name: 'Вечерняя сессия' },
        lootBox: null,
        season: null,
        store: { name: 'Клуб 1' },
      },
    ]);
    walletFindMany.mockResolvedValueOnce([
      {
        id: 'wallet-1',
        kind: 'REWARD',
        sourceKind: 'MISSION',
        title: 'Награда за задание',
        rewardLabel: '100 бонусов',
        status: 'PENDING',
        availableAt: new Date('2026-09-25T00:00:00.000Z'),
        expiresAt: new Date('2026-10-05T00:00:00.000Z'),
        claimedAt: null,
        store: null,
      },
    ]);
    ledgerFindMany.mockResolvedValueOnce([
      {
        id: 'ledger-1',
        status: 'CONFIRMED',
        amount: { toString: () => '150' },
        reason: 'mission reward',
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
        confirmedAt: new Date('2026-09-06T00:10:00.000Z'),
        failedAt: null,
        canceledAt: null,
        store: { name: 'Клуб 1' },
      },
    ]);
    eventFindMany.mockResolvedValueOnce([
      {
        id: 'event-1',
        eventType: 'MISSION_COMPLETED',
        source: 'LANGAME',
        xpDelta: 50,
        occurredAt: new Date('2026-09-05T00:00:00.000Z'),
        mission: { name: 'Вечерняя сессия' },
        lootBox: null,
        season: null,
      },
    ]);
    eventCount.mockResolvedValueOnce(7);
    rewardCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    ledgerCount.mockResolvedValueOnce(2);

    const detail = await service.loadGuestGameDetail(
      't',
      'guest-1',
      period,
      now,
    );

    expect(detail).not.toBeNull();
    expect(detail?.rewards[0]).toEqual(
      expect.objectContaining({
        id: 'reward-1',
        sourceKind: 'MISSION',
        sourceName: 'Вечерняя сессия',
        rewardAmount: 150,
        storeName: 'Клуб 1',
      }),
    );
    expect(detail?.wallet[0]).toEqual(
      expect.objectContaining({ id: 'wallet-1', expiresInDays: 5 }),
    );
    expect(detail?.ledger[0].amount).toBe(150);
    expect(detail?.events[0].sourceName).toBe('Вечерняя сессия');
    expect(detail?.totals).toEqual({
      events: 7,
      rewards: 3,
      rewardsPaid: 2,
      ledgerEntries: 2,
    });
    expect(JSON.stringify(detail)).not.toContain('langameRequest');
  });
});
