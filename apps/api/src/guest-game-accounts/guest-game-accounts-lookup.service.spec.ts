import type { PrismaService } from '../prisma/prisma.service';
import { GuestGameAccountsLookupService } from './guest-game-accounts-lookup.service';

const NOW = new Date('2026-11-09T18:00:00Z');
const LINKED_AT = new Date('2026-11-09T10:00:00Z');
const ENV = { GUEST_GAME_FACEIT_API_KEY: 'faceit-key' };
const unix = (iso: string) => new Date(iso).getTime() / 1000;

function historyRow(id: string, start: string, finish: string) {
  return {
    match_id: id,
    status: 'FINISHED',
    game_mode: '5v5',
    competition_type: 'matchmaking',
    started_at: unix(start),
    finished_at: unix(finish),
  };
}

function statsBody(rivalId = 'rival') {
  return {
    rounds: [
      {
        round_stats: { Map: 'de_inferno' },
        teams: [
          {
            team_id: 'a',
            players: [
              {
                player_id: 'faceit-me',
                player_stats: { Result: '1', Kills: '21', 'Penta Kills': '0' },
              },
            ],
          },
          {
            team_id: 'b',
            players: [{ player_id: rivalId, player_stats: { Result: '0' } }],
          },
        ],
      },
    ],
  };
}

function harness(linkedIds: string[] = ['faceit-me']) {
  const account = {
    id: 'account-faceit',
    tenantId: 'tenant-1',
    profileId: 'profile-1',
    externalId: 'faceit-me',
    linkedAt: LINKED_AT,
    matchesSyncedUntil: null,
  };
  const prisma = {
    guestGameExternalAccount: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce(linkedIds.map((externalId) => ({ externalId }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameExternalMatch: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameProfile: {
      findFirst: jest.fn().mockResolvedValue({ guestId: 'guest-1' }),
    },
    guestGameProfileIdentityLink: {
      findMany: jest.fn().mockResolvedValue([{ guestId: 'guest-2' }]),
    },
    guestSession: {
      findMany: jest.fn().mockResolvedValue([
        {
          externalSessionId: 'lg-1',
          externalDomain: 'club.langame.ru',
          storeId: 'store-1',
          startedAt: new Date('2026-11-09T12:00:00Z'),
          stoppedAt: new Date('2026-11-09T14:00:00Z'),
        },
      ]),
    },
  };
  return { prisma, account };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function respond(routes: Array<[RegExp, number, unknown]>) {
  return jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = requestUrl(input);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) return Promise.reject(new Error(`unexpected ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(route[2]), { status: route[1] }),
    );
  });
}

type CreateCall = { data: Array<Record<string, unknown>> };

function journaled(prisma: ReturnType<typeof harness>['prisma']) {
  return (
    prisma.guestGameExternalMatch.createMany.mock.calls as unknown as [
      CreateCall,
    ][]
  ).map(([call]) => call.data[0]);
}

afterEach(() => jest.restoreAllMocks());

describe('FACEIT match sync', () => {
  it('does nothing without the worker FACEIT key', async () => {
    const { prisma } = harness();
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await new GuestGameAccountsLookupService(
      prisma as unknown as PrismaService,
    ).syncFaceitMatches('tenant-1', NOW, {});

    expect(result.skipped).toBe('no FACEIT key');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts a match inside the club session and journals the rest with a reason', async () => {
    const { prisma } = harness();
    const fetchSpy = respond([
      [
        /\/players\/faceit-me\/history\?game=cs2&from=\d+&to=\d+/,
        200,
        {
          items: [
            // Played at home after the club session ended.
            historyRow(
              'm-home',
              '2026-11-09T15:00:00Z',
              '2026-11-09T15:40:00Z',
            ),
            historyRow(
              'm-club',
              '2026-11-09T12:30:00Z',
              '2026-11-09T13:10:00Z',
            ),
            // A short warmup in the club.
            historyRow(
              'm-short',
              '2026-11-09T13:20:00Z',
              '2026-11-09T13:25:00Z',
            ),
            // Played before the guest linked Steam.
            historyRow('m-old', '2026-11-09T08:00:00Z', '2026-11-09T08:40:00Z'),
          ],
        },
      ],
      [/\/matches\/m-club\/stats$/, 200, statsBody()],
    ]);

    const result = await new GuestGameAccountsLookupService(
      prisma as unknown as PrismaService,
    ).syncFaceitMatches('tenant-1', NOW, ENV);

    expect(result).toMatchObject({ journaled: 3, counted: 1, review: 0 });
    const rows = journaled(prisma);
    expect(rows.map((row) => [row.externalMatchId, row.decision])).toEqual([
      ['m-club', 'COUNTED'],
      ['m-short', 'NOT_ELIGIBLE'],
      ['m-home', 'OUTSIDE_SESSION'],
    ]);
    expect(rows[0]).toMatchObject({
      profileId: 'profile-1',
      sessionExternalId: 'lg-1',
      externalDomain: 'club.langame.ru',
      decisionReason: null,
      stats: {
        match: { result: 'WIN', kills: 21, map: 'de_inferno' },
        session: { storeId: 'store-1' },
      },
    });
    expect(rows[1].decisionReason).toBe('TOO_SHORT');
    // Stats are fetched only for a match that could count.
    expect(
      fetchSpy.mock.calls.filter(([url]) => requestUrl(url).includes('/stats')),
    ).toHaveLength(1);
    expect(prisma.guestSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          guestId: { in: ['guest-1', 'guest-2'] },
        }) as unknown,
      }),
    );
    expect(prisma.guestGameExternalAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'account-faceit', tenantId: 'tenant-1', status: 'ACTIVE' },
      data: { matchesSyncedUntil: new Date('2026-11-09T17:50:00Z') },
    });
  });

  it('sends a match against another linked guest to review', async () => {
    const { prisma } = harness(['faceit-me', 'rival']);
    respond([
      [
        /\/history/,
        200,
        {
          items: [
            historyRow(
              'm-club',
              '2026-11-09T12:30:00Z',
              '2026-11-09T13:10:00Z',
            ),
          ],
        },
      ],
      [/\/matches\/m-club\/stats$/, 200, statsBody('rival')],
    ]);

    const result = await new GuestGameAccountsLookupService(
      prisma as unknown as PrismaService,
    ).syncFaceitMatches('tenant-1', NOW, ENV);

    expect(result).toMatchObject({ counted: 0, review: 1 });
    expect(journaled(prisma)[0]).toMatchObject({
      decision: 'REVIEW',
      decisionReason: 'LINKED_GUEST_ON_OTHER_TEAM',
    });
  });

  it('stops at the daily cap and on a FACEIT rate limit', async () => {
    const capped = harness();
    capped.prisma.guestGameExternalMatch.count.mockResolvedValue(10);
    respond([
      [
        /\/history/,
        200,
        {
          items: [
            historyRow(
              'm-club',
              '2026-11-09T12:30:00Z',
              '2026-11-09T13:10:00Z',
            ),
          ],
        },
      ],
      [/\/stats$/, 200, statsBody()],
    ]);
    await new GuestGameAccountsLookupService(
      capped.prisma as unknown as PrismaService,
    ).syncFaceitMatches('tenant-1', NOW, ENV);
    expect(journaled(capped.prisma)[0]).toMatchObject({
      decision: 'NOT_ELIGIBLE',
      decisionReason: 'DAILY_CAP',
    });
    jest.restoreAllMocks();

    const limited = harness();
    respond([[/\/history/, 429, {}]]);
    const result = await new GuestGameAccountsLookupService(
      limited.prisma as unknown as PrismaService,
    ).syncFaceitMatches('tenant-1', NOW, ENV);
    expect(result.rateLimited).toBe(true);
    expect(
      limited.prisma.guestGameExternalMatch.createMany,
    ).not.toHaveBeenCalled();
    expect(
      limited.prisma.guestGameExternalAccount.updateMany,
    ).not.toHaveBeenCalled();
  });
});
