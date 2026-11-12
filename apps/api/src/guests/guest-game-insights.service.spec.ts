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
  const externalAccountFindMany = jest.fn();
  const externalMatchFindMany = jest.fn();
  const externalMatchGroupBy = jest.fn();
  const storeFindMany = jest.fn();
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
      guestGameExternalAccount: { findMany: externalAccountFindMany },
      guestGameExternalMatch: {
        findMany: externalMatchFindMany,
        groupBy: externalMatchGroupBy,
      },
      store: { findMany: storeFindMany },
    } as never);
    externalAccountFindMany.mockResolvedValue([]);
    externalMatchFindMany.mockResolvedValue([]);
    externalMatchGroupBy.mockResolvedValue([]);
    storeFindMany.mockResolvedValue([]);
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
  it('shows linked Steam/FACEIT accounts and the FACEIT match journal', async () => {
    profileFindFirst.mockResolvedValueOnce(
      profileRow({
        displayName: 'Nick',
        tutorialSeenVersion: 2,
        tutorialSeenAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    );
    walletFindMany.mockResolvedValue([]);
    rewardFindMany.mockResolvedValue([]);
    ledgerFindMany.mockResolvedValue([]);
    eventFindMany.mockImplementation((args: { where: { id?: unknown } }) =>
      Promise.resolve(
        args.where.id ? [{ id: 'event-faceit', xpDelta: 40 }] : [],
      ),
    );
    eventCount.mockResolvedValue(0);
    rewardCount.mockResolvedValue(0);
    ledgerCount.mockResolvedValue(0);
    externalAccountFindMany.mockResolvedValueOnce([
      {
        id: 'acc-steam',
        provider: 'STEAM',
        externalId: '76561198000000001',
        nickname: 'steam-nick',
        status: 'ACTIVE',
        linkedAt: new Date('2026-09-10T00:00:00.000Z'),
        unlinkedAt: null,
        lookupStatus: 'FOUND',
        checkedAt: new Date('2026-09-10T00:05:00.000Z'),
        matchesSyncedUntil: null,
        details: {
          avatarUrl: 'https://avatars.example/a.jpg',
          steamBans: { vac: false, gameBans: 0, community: false },
        },
      },
      {
        id: 'acc-faceit',
        provider: 'FACEIT',
        externalId: 'faceit-player-1',
        nickname: 'faceit_nick',
        status: 'ACTIVE',
        linkedAt: new Date('2026-09-10T00:05:00.000Z'),
        unlinkedAt: null,
        lookupStatus: 'FOUND',
        checkedAt: new Date('2026-09-10T00:05:00.000Z'),
        matchesSyncedUntil: new Date('2026-09-20T00:00:00.000Z'),
        details: { level: 7, elo: 1450, steamId: '76561198000000001' },
      },
    ]);
    externalMatchFindMany.mockResolvedValueOnce([
      {
        id: 'match-1',
        provider: 'FACEIT',
        game: 'cs2',
        externalMatchId: '1-abc-def',
        startedAt: new Date('2026-09-15T18:00:00.000Z'),
        finishedAt: new Date('2026-09-15T18:40:00.000Z'),
        decision: 'COUNTED',
        decisionReason: null,
        stats: {
          match: {
            provider: 'FACEIT',
            result: 'WIN',
            kills: 21,
            deaths: 15,
            assists: 4,
            kd: 1.4,
            adr: 88.5,
            hsPercent: 52,
            mvps: 3,
            aces: 0,
            map: 'de_mirage',
          },
          session: { storeId: 'store-1', startedAt: null, stoppedAt: null },
        },
        eventId: 'event-faceit',
        reviewedAt: null,
      },
      {
        id: 'match-2',
        provider: 'FACEIT',
        game: 'cs2',
        externalMatchId: '1-home',
        startedAt: new Date('2026-09-14T18:00:00.000Z'),
        finishedAt: new Date('2026-09-14T18:40:00.000Z'),
        decision: 'OUTSIDE_SESSION',
        decisionReason: null,
        stats: {},
        eventId: null,
        reviewedAt: null,
      },
    ]);
    externalMatchGroupBy.mockResolvedValueOnce([
      { decision: 'COUNTED', _count: { _all: 3 } },
      { decision: 'OUTSIDE_SESSION', _count: { _all: 2 } },
      { decision: 'REVIEW', _count: { _all: 1 } },
    ]);
    storeFindMany.mockResolvedValueOnce([{ id: 'store-1', name: 'Клуб 1' }]);

    const detail = await service.loadGuestGameDetail(
      't',
      'guest-1',
      period,
      now,
    );

    expect(detail?.connection).toEqual({
      profileId: 'profile-1',
      status: 'ACTIVE',
      displayName: 'Nick',
      tutorialSeenVersion: 2,
      tutorialSeenAt: '2026-09-01T00:00:00.000Z',
    });
    expect(detail?.externalAccounts[0]).toEqual(
      expect.objectContaining({
        provider: 'STEAM',
        profileUrl: 'https://steamcommunity.com/profiles/76561198000000001',
        steamBans: { vac: false, gameBans: 0, community: false },
        faceitLevel: null,
      }),
    );
    expect(detail?.externalAccounts[1]).toEqual(
      expect.objectContaining({
        provider: 'FACEIT',
        faceitLevel: 7,
        faceitElo: 1450,
        profileUrl: 'https://www.faceit.com/ru/players/faceit_nick',
      }),
    );
    expect(detail?.externalMatches[0]).toEqual(
      expect.objectContaining({
        decision: 'COUNTED',
        storeName: 'Клуб 1',
        map: 'de_mirage',
        result: 'WIN',
        kills: 21,
        kd: 1.4,
        xpDelta: 40,
        matchUrl: 'https://www.faceit.com/ru/cs2/room/1-abc-def',
      }),
    );
    expect(detail?.externalMatches[1]).toEqual(
      expect.objectContaining({
        decision: 'OUTSIDE_SESSION',
        storeName: null,
        result: null,
        xpDelta: null,
      }),
    );
    expect(detail?.externalMatchTotals).toEqual({
      total: 6,
      counted: 3,
      outsideSession: 2,
      notEligible: 0,
      review: 1,
    });
    expect(
      firstCallArg<{ where: unknown }>(externalMatchFindMany).where,
    ).toEqual({ tenantId: 't', profileId: 'profile-1' });
    expect(firstCallArg<{ where: unknown }>(storeFindMany).where).toEqual({
      tenantId: 't',
      id: { in: ['store-1'] },
    });
    expect(JSON.stringify(detail)).not.toContain('avatars.example');
  });
});
