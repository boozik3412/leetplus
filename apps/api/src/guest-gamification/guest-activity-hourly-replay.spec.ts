import {
  GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
  hasSessionFactsPendingHourlyReplay,
  hourlySessionReplayReady,
  sessionFactHourlyReplayReadiness,
} from './guest-activity-hourly-replay';

describe('hourly session activity replay gate', () => {
  it('blocks an active session fact whose source has not acknowledged replay', async () => {
    const queryRaw = jest
      .fn<Promise<Array<{ id: string }>>, [unknown]>()
      .mockResolvedValue([{ id: 'fact-old-hourly' }]);

    await expect(
      hasSessionFactsPendingHourlyReplay({ $queryRaw: queryRaw } as never, {
        tenantId: 'tenant-1',
        factId: 'fact-old-hourly',
        profileId: 'profile-1',
        factTypes: ['HOURLY_SESSION_STARTED', 'PRODUCT_PURCHASED'],
        happenedAtGte: new Date('2026-07-30T00:00:00.000Z'),
      }),
    ).resolves.toBe(true);

    const query = queryRaw.mock.calls[0]?.[0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    const sql = query.strings.join(' ');
    expect(sql).toContain('LEFT JOIN "GuestActivitySyncState"');
    expect(sql).toContain('fact."externalProvider" = \'LANGAME\'');
    expect(sql).toContain("'LANGAME_GUEST_SESSION'");
    expect(sql).toContain('sync_state."status" <> \'SUCCESS\'');
    expect(sql).toContain("->> 'replayVersion'");
    expect(query.values).toContain('tenant-1');
    expect(query.values).toContain('fact-old-hourly');
    expect(query.values).toContain('profile-1');
    expect(query.values).toContain('HOURLY_SESSION_STARTED');
    expect(query.values).toContain(
      GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
    );
    expect(query.values).not.toContain('PRODUCT_PURCHASED');
  });

  it('does not query replay state for non-session facts', async () => {
    const queryRaw = jest.fn<Promise<Array<{ id: string }>>, [unknown]>();

    await expect(
      hasSessionFactsPendingHourlyReplay({ $queryRaw: queryRaw } as never, {
        tenantId: 'tenant-1',
        factTypes: ['PRODUCT_PURCHASED'],
      }),
    ).resolves.toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('requires both SUCCESS and the exact replay marker', () => {
    expect(
      hourlySessionReplayReady('SUCCESS', {
        replayVersion: GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
      }),
    ).toBe(true);
    expect(
      hourlySessionReplayReady('PARTIAL', {
        replayVersion: GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
      }),
    ).toBe(false);
    expect(hourlySessionReplayReady('SUCCESS', {})).toBe(false);
  });

  it.each([
    [[], 'NOT_APPLICABLE'],
    [
      [
        {
          lifecycleStatus: 'SUPERSEDED',
          supersededAt: new Date('2026-07-31T00:00:00.000Z'),
          factType: 'HOURLY_SESSION_STARTED',
          confidence: 'EXACT',
          syncStatus: 'SUCCESS',
          replayVersion: GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
        },
      ],
      'RECLASSIFIED',
    ],
    [
      [
        {
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          factType: 'HOURLY_SESSION_STARTED',
          confidence: 'EXACT',
          syncStatus: 'PARTIAL',
          replayVersion: null,
        },
      ],
      'PENDING',
    ],
    [
      [
        {
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          factType: 'HOURLY_SESSION_STARTED',
          confidence: 'EXACT',
          syncStatus: 'SUCCESS',
          replayVersion: GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
        },
      ],
      'READY',
    ],
  ] as const)(
    'reports exact source-fact replay readiness %#',
    async (rows, expected) => {
      const queryRaw = jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockResolvedValue([...rows]);

      await expect(
        sessionFactHourlyReplayReadiness({ $queryRaw: queryRaw } as never, {
          tenantId: 'tenant-1',
          factId: 'fact-1',
          eventType: 'SESSION_START',
        }),
      ).resolves.toBe(expected);
    },
  );

  it.each([
    ['SESSION_STARTED', 'EXACT'],
    ['PACKAGE_OR_SUBSCRIPTION_USED', 'EXACT'],
    ['HOURLY_SESSION_STARTED', 'UNKNOWN'],
  ])(
    'rejects a ready but incoherent source fact (%s/%s)',
    async (factType, confidence) => {
      const queryRaw = jest.fn().mockResolvedValue([
        {
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          factType,
          confidence,
          syncStatus: 'SUCCESS',
          replayVersion: GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
        },
      ]);

      await expect(
        sessionFactHourlyReplayReadiness({ $queryRaw: queryRaw } as never, {
          tenantId: 'tenant-1',
          factId: 'fact-1',
          eventType: 'SESSION_START',
        }),
      ).resolves.toBe('INCOHERENT');
    },
  );
});
