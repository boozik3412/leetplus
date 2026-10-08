import {
  LeaderboardConfigError,
  defaultLeaderboardConfig,
  isGuestNickname,
  leaderboardMonth,
  leaderboardPlayerName,
  leaderboardPrizes,
  leaderboardTarget,
  leaderboardTotals,
  leaderboardValue,
  leaderboardVisibleRows,
  networkTimeZone,
  normalizeLeaderboardConfig,
  rankLeaderboard,
  type LeaderboardActivityRow,
} from './guest-leaderboard-core';

function row(
  profileId: string,
  storeId: string | null,
  values: Partial<LeaderboardActivityRow> = {},
): LeaderboardActivityRow {
  return {
    profileId,
    storeId,
    playMinutes: 0,
    sessions: 0,
    quests: 0,
    cases: 0,
    checkIns: 0,
    ...values,
  };
}

describe('guest leaderboard core', () => {
  const formula = defaultLeaderboardConfig().formula;

  it('sums a profile over clubs for the network and keeps one club apart', () => {
    const rows = [
      row('a', 'club-1', { playMinutes: 90, quests: 1 }),
      row('a', 'club-2', { playMinutes: 30, cases: 2 }),
      row('a', null, { quests: 1 }),
      row('b', 'club-1', { playMinutes: 60 }),
    ];

    const network = leaderboardTotals(rows, null);
    expect(network.get('a')).toMatchObject({
      playMinutes: 120,
      quests: 2,
      cases: 2,
    });

    const club = leaderboardTotals(rows, 'club-1');
    expect(club.get('a')).toMatchObject({
      playMinutes: 90,
      quests: 1,
      cases: 0,
    });
    expect(club.get('b')).toMatchObject({ playMinutes: 60 });
  });

  it('scores points with the configured formula', () => {
    const totals = {
      profileId: 'a',
      playMinutes: 150,
      sessions: 2,
      quests: 3,
      cases: 4,
      checkIns: 2,
    };
    // 2.5 h × 10 + 3 × 30 + 4 × 5 + 2 × 5
    expect(leaderboardValue('points', totals, formula)).toBe(25 + 90 + 20 + 10);
    expect(leaderboardValue('hours', totals, formula)).toBe(150);
    expect(leaderboardValue('sessions', totals, formula)).toBe(2);
    expect(leaderboardValue('quests', totals, formula)).toBe(3);
    expect(leaderboardValue('cases', totals, formula)).toBe(4);
  });

  it('ranks with shared places, drops zero values and excluded players', () => {
    const totals = leaderboardTotals(
      [
        row('a', 's', { playMinutes: 300 }),
        row('b', 's', { playMinutes: 200 }),
        row('c', 's', { playMinutes: 200 }),
        row('d', 's', { playMinutes: 100 }),
        row('e', 's', { quests: 1 }),
        row('x', 's', { playMinutes: 999 }),
      ],
      null,
    );

    const standings = rankLeaderboard(totals, 'hours', formula, new Set(['x']));
    expect(standings.map((s) => [s.profileId, s.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });

  it('tells the gap to the nearest strictly better place', () => {
    const standings = [
      { profileId: 'a', value: 300, rank: 1 },
      { profileId: 'b', value: 200, rank: 2 },
      { profileId: 'c', value: 200, rank: 2 },
      { profileId: 'd', value: 104, rank: 4 },
    ];
    expect(leaderboardTarget(standings, 'c')).toEqual({
      rank: 1,
      gap: 101,
      profileId: 'a',
    });
    expect(leaderboardTarget(standings, 'd')).toEqual({
      rank: 2,
      gap: 97,
      profileId: 'c',
    });
    expect(leaderboardTarget(standings, 'a')).toBeNull();
    // Not ranked yet: what it takes to enter the board.
    expect(leaderboardTarget(standings, 'z')).toEqual({
      rank: 4,
      gap: 105,
      profileId: 'd',
    });
  });

  it('shows the top and the guest with neighbours further down', () => {
    const standings = Array.from({ length: 30 }, (_, index) => ({
      profileId: `p${index + 1}`,
      value: 100 - index,
      rank: index + 1,
    }));

    const inTop = leaderboardVisibleRows(standings, 'p7');
    expect(inTop.map((r) => r.standing.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    const right = leaderboardVisibleRows(standings, 'p11');
    expect(right.map((r) => [r.standing.rank, r.gapBefore])).toEqual([
      ...Array.from({ length: 10 }, (_, i) => [i + 1, false]),
      [11, false],
      [12, false],
    ]);

    const far = leaderboardVisibleRows(standings, 'p20');
    expect(far.slice(10).map((r) => [r.standing.rank, r.gapBefore])).toEqual([
      [19, true],
      [20, false],
      [21, false],
    ]);

    const last = leaderboardVisibleRows(standings, 'p30');
    expect(last.slice(10).map((r) => r.standing.rank)).toEqual([29, 30]);
  });

  it('uses the club calendar month', () => {
    // 07.10 10:00 in Yekaterinburg (UTC+5).
    const now = new Date('2026-10-07T05:00:00.000Z');
    const month = leaderboardMonth(now, 'Asia/Yekaterinburg');
    expect(month.key).toBe('2026-10');
    expect(month.label).toBe('Октябрь');
    expect(month.from.toISOString()).toBe('2026-09-30T19:00:00.000Z');
    expect(month.to.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(month.resultsLabel).toBe('1 ноября');
    expect(month.daysLeft).toBe(25);

    const previous = leaderboardMonth(now, 'Asia/Yekaterinburg', -1);
    expect(previous.key).toBe('2026-09');
    expect(previous.to.toISOString()).toBe(month.from.toISOString());

    // 31.12 22:00 UTC is already January in Samara (UTC+4).
    const newYear = leaderboardMonth(
      new Date('2026-12-31T22:00:00.000Z'),
      'Europe/Samara',
    );
    expect(newYear.key).toBe('2027-01');
    expect(newYear.resultsLabel).toBe('1 февраля');
  });

  it('falls back to UTC for unknown zones and picks the common network zone', () => {
    expect(
      leaderboardMonth(new Date('2026-10-07T00:00:00Z'), 'Nowhere/Zone')
        .timeZone,
    ).toBe('UTC');
    expect(
      networkTimeZone([
        { name: 'Радищева', timeZone: 'Asia/Yekaterinburg' },
        { name: 'Пушкинская', timeZone: 'Europe/Samara' },
        { name: 'Холмогорова', timeZone: 'Europe/Samara' },
      ]),
    ).toBe('Europe/Samara');
  });

  it('shows a chosen nickname, otherwise the last four phone digits', () => {
    expect(isGuestNickname('ruslan')).toBe(true);
    expect(isGuestNickname('Гость клуба')).toBe(false);
    expect(isGuestNickname('А. В. Ю.')).toBe(false);
    expect(isGuestNickname('76331')).toBe(false);
    expect(isGuestNickname('Мария', ['Мария'])).toBe(false);

    expect(
      leaderboardPlayerName({ displayName: 'tilt.', contactMasked: '***0798' }),
    ).toEqual({ name: 'tilt.', hasNickname: true });
    expect(
      leaderboardPlayerName({ displayName: 'К. С.', contactMasked: '***0798' }),
    ).toEqual({ name: 'Игрок ••0798', hasNickname: false });
    expect(
      leaderboardPlayerName({ displayName: null, contactMasked: null }),
    ).toEqual({ name: 'Игрок', hasNickname: false });
  });

  it('validates owner settings and keeps prizes per scope and board', () => {
    const config = normalizeLeaderboardConfig(
      {
        networkEnabled: false,
        disabledStoreIds: ['club-2', 'club-2'],
        boards: { cases: false },
        formula: { hourPoints: 12 },
        prizes: {
          'club-1': {
            points: [
              { kind: 'LOOT_BOX', lootBoxId: 'box-1' },
              { kind: 'BONUS', amount: 500 },
              null,
            ],
            hours: [null, null, null],
          },
        },
        unknownKey: true,
      },
      new Set(['network', 'club-1', 'club-2']),
    );

    expect(config.networkEnabled).toBe(false);
    expect(config.disabledStoreIds).toEqual(['club-2']);
    expect(config.boards).toMatchObject({ points: true, cases: false });
    expect(config.formula).toEqual({
      hourPoints: 12,
      questPoints: 30,
      casePoints: 5,
      checkInPoints: 5,
    });
    // A board whose three places are empty is not stored.
    expect(Object.keys(config.prizes['club-1'])).toEqual(['points']);
    expect(
      leaderboardPrizes(
        config,
        'club-1',
        'points',
        new Map([['box-1', 'Легенда']]),
      ),
    ).toEqual([
      { place: 1, label: 'Кейс «Легенда»' },
      { place: 2, label: '500 бонусов' },
    ]);
    expect(leaderboardPrizes(config, 'network', 'points', new Map())).toEqual(
      [],
    );
    expect(leaderboardPrizes(config, 'club-1', 'hours', new Map())).toEqual([]);
  });

  it('rejects invalid settings', () => {
    const invalid: unknown[] = [
      'text',
      { formula: { hourPoints: -1 } },
      { formula: { questPoints: 1.5 } },
      { prizes: { 'club-9': { points: [{ kind: 'BONUS', amount: 10 }] } } },
      { prizes: { network: { points: [{ kind: 'BONUS', amount: 0 }] } } },
      { prizes: { network: { points: [{ kind: 'CUSTOM', label: '' }] } } },
      { prizes: { network: { level: [null] } } },
      { prizes: { network: { points: [null, null, null, null] } } },
      { disabledStoreIds: 'club-1' },
    ];
    for (const input of invalid) {
      expect(() =>
        normalizeLeaderboardConfig(input, new Set(['network', 'club-1'])),
      ).toThrow(LeaderboardConfigError);
    }
  });
});
