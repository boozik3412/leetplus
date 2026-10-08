import type { PrismaService } from '../prisma/prisma.service';
import { GuestLeaderboardReadService } from './guest-leaderboard-read.service';

type ActivityRow = {
  profileId: string;
  storeId: string | null;
  playMinutes: number;
  sessions: number;
  quests: number;
  cases: number;
  checkIns: number;
};

function activity(
  profileId: string,
  storeId: string,
  playMinutes: number,
  extra: Partial<ActivityRow> = {},
): ActivityRow {
  return {
    profileId,
    storeId,
    playMinutes,
    sessions: 0,
    quests: 0,
    cases: 0,
    checkIns: 0,
    ...extra,
  };
}

const NOW = new Date('2026-10-07T05:00:00.000Z');

function createService(input: {
  settings?: { enabled: boolean; config: unknown } | null;
  rows?: ActivityRow[];
  previousMonthRows?: ActivityRow[];
}) {
  const queryRaw = jest.fn((sql: { values: unknown[] }) => {
    // The window start is the first timestamp parameter.
    const from = String(
      sql.values.find(
        (value) => typeof value === 'string' && /^\d{4}-/.test(value),
      ),
    );
    return Promise.resolve(
      from.startsWith('2026-08')
        ? (input.previousMonthRows ?? [])
        : (input.rows ?? []),
    );
  });
  const prisma = {
    guestLeaderboardSettings: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          input.settings === null
            ? null
            : {
                enabled: input.settings?.enabled ?? true,
                config: input.settings?.config ?? {},
                revision: 3,
                updatedAt: NOW,
              },
        ),
      ),
    },
    store: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 'rad', name: '1337 Радищева', timeZone: 'Asia/Yekaterinburg' },
          {
            id: 'rod',
            name: '1337 Родонитовая',
            timeZone: 'Asia/Yekaterinburg',
          },
        ]),
      ),
    },
    guestGameLootBox: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 'box', name: 'Легенда' }]),
      ),
    },
    guestGameProfile: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in.map((id) => ({
            id,
            displayName:
              id === 'me' ? 'ruslan' : id === 'p2' ? 'А. Б.' : `nick-${id}`,
            contactMasked: '***4417',
            guest: null,
          })),
        ),
      ),
    },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  return { service: new GuestLeaderboardReadService(prisma), queryRaw };
}

describe('GuestLeaderboardReadService.guestView', () => {
  it('returns nothing while the owner has not switched the leaderboard on', async () => {
    const { service, queryRaw } = createService({ settings: null });

    const view = await service.guestView({
      tenantId: 't',
      profileId: 'me',
      storeId: 'rad',
      now: NOW,
    });

    expect(view.enabled).toBe(false);
    expect(view.entries).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('ranks the club, masks names without a nickname and shows the gap', async () => {
    const { service } = createService({
      settings: {
        enabled: true,
        config: {
          prizes: {
            rad: {
              hours: [{ kind: 'LOOT_BOX', lootBoxId: 'box' }, null, null],
            },
          },
        },
      },
      rows: [
        activity('p1', 'rad', 600),
        activity('p2', 'rad', 300),
        activity('me', 'rad', 240),
        activity('p3', 'rod', 900),
      ],
      previousMonthRows: [activity('p2', 'rad', 50)],
    });

    const view = await service.guestView({
      tenantId: 't',
      profileId: 'me',
      storeId: 'rad',
      scope: 'club',
      board: 'hours',
      now: NOW,
    });

    expect(view.enabled).toBe(true);
    expect(view.scopes.map((s) => s.scope)).toEqual(['club', 'network']);
    expect(view.unit).toBe('minutes');
    expect(view.period).toMatchObject({
      key: '2026-10',
      resultsLabel: '1 ноября',
    });
    expect(view.totalPlayers).toBe(3);
    expect(view.entries.map((e) => [e.rank, e.name, e.value, e.isMe])).toEqual([
      [1, 'nick-p1', 600, false],
      [2, 'Игрок ••4417', 300, false],
      [3, 'ruslan', 240, true],
    ]);
    // p2 won the club last month.
    expect(view.entries.find((e) => e.rank === 2)?.crown).toBe(true);
    expect(view.me).toMatchObject({
      rank: 3,
      value: 240,
      hasNickname: true,
      excluded: false,
    });
    expect(view.target).toEqual({ rank: 2, gap: 61, name: 'Игрок ••4417' });
    expect(view.prizes).toEqual([{ place: 1, label: 'Кейс «Легенда»' }]);
    expect(JSON.stringify(view)).not.toContain('***');
    expect(JSON.stringify(view)).not.toMatch(/"p[123]"|profileId/u);
  });

  it('falls back to the network when the club board is switched off', async () => {
    const { service } = createService({
      settings: { enabled: true, config: { disabledStoreIds: ['rad'] } },
      rows: [activity('p3', 'rod', 900), activity('me', 'rad', 240)],
    });

    const view = await service.guestView({
      tenantId: 't',
      profileId: 'me',
      storeId: 'rad',
      scope: 'club',
      now: NOW,
    });

    expect(view.scope).toBe('network');
    expect(view.board).toBe('points');
    expect(view.formula).toMatchObject({ hourPoints: 10 });
    expect(view.entries.map((e) => [e.name, e.storeName])).toEqual([
      ['nick-p3', '1337 Родонитовая'],
      ['ruslan', '1337 Радищева'],
    ]);
  });

  it('keeps an excluded guest out of the board and tells them so', async () => {
    const { service } = createService({
      settings: { enabled: true, config: { excludedProfileIds: ['me'] } },
      rows: [activity('p1', 'rad', 600), activity('me', 'rad', 900)],
    });

    const view = await service.guestView({
      tenantId: 't',
      profileId: 'me',
      storeId: 'rad',
      board: 'hours',
      now: NOW,
    });

    expect(view.entries.map((e) => e.name)).toEqual(['nick-p1']);
    expect(view.me).toMatchObject({ rank: null, excluded: true });
    expect(view.target).toBeNull();
  });
});
