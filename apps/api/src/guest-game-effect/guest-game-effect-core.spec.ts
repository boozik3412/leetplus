import {
  GAME_EFFECT_WINDOW_DAYS,
  buildGameEffectDataset,
  dayNumberFromIso,
  dayNumberToIso,
  gameEffectVerdict,
  holdoutBucket,
  isInGameHoldout,
  localDayNumber,
  measureCohortEffect,
  measureGuestEffect,
  measureHoldoutEffect,
  visitBucket,
  windowValues,
  type GameEffectDailyRow,
} from './guest-game-effect-core';

const D = dayNumberFromIso('2026-09-01');

function visits(
  guestId: string,
  days: number[],
  extra: Partial<GameEffectDailyRow> = {},
): GameEffectDailyRow[] {
  return days.map((day) => ({
    guestId,
    day,
    storeId: 'store-1',
    sessions: 1,
    playMinutes: 120,
    balanceSpend: 300,
    barRevenue: 100,
    ...extra,
  }));
}

/** Every 7 days in [from, to]. */
function weekly(from: number, to: number) {
  const days: number[] = [];
  for (let day = from; day <= to; day += 7) days.push(day);
  return days;
}

/** Every 3 days in [from, to]. */
function everyThird(from: number, to: number) {
  const days: number[] = [];
  for (let day = from; day <= to; day += 3) days.push(day);
  return days;
}

describe('guest game effect core', () => {
  it('converts calendar days and local days in the network zone', () => {
    expect(dayNumberToIso(dayNumberFromIso('2026-10-14'))).toBe('2026-10-14');
    // 20:30 UTC is already the next day in Yekaterinburg (UTC+5).
    expect(
      dayNumberToIso(
        localDayNumber(new Date('2026-10-13T20:30:00Z'), 'Asia/Yekaterinburg'),
      ),
    ).toBe('2026-10-14');
  });

  it('sums a guest window with prefix sums and picks the home club', () => {
    const dataset = buildGameEffectDataset([
      ...visits('g1', [D, D + 1, D + 5]),
      { ...visits('g1', [D + 6])[0], storeId: 'store-2', sessions: 0 },
    ]);
    const timeline = dataset.timelines.get('g1');
    expect(windowValues(timeline, D, D + 1)).toMatchObject({
      visitDays: 2,
      sessions: 2,
      playMinutes: 240,
      money: 800,
    });
    // A day with money but no session is not a visit day.
    expect(windowValues(timeline, D + 6, D + 6).visitDays).toBe(0);
    expect(timeline?.homeStoreId).toBe('store-1');
    expect(dataset.visitorsByDay.get(D + 6)).toBeUndefined();
  });

  it('buckets pre-window visits', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 14, 15, 30].map(visitBucket)).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it('measures the change of participants against same-day visitors', () => {
    const exposure = D + 40;
    const rows: GameEffectDailyRow[] = [];
    const participants = [];
    for (let index = 0; index < 20; index += 1) {
      // Weekly before, every third day after the exposure.
      const id = `p${index}`;
      rows.push(
        ...visits(id, [
          ...weekly(exposure - 28, exposure),
          ...everyThird(exposure + 1, exposure + 28),
        ]),
      );
      participants.push({ guestId: id, exposureDay: exposure });
    }
    for (let index = 0; index < 30; index += 1) {
      // Comparison guests keep visiting weekly.
      rows.push(...visits(`c${index}`, weekly(exposure - 28, exposure + 28)));
    }
    const dataset = buildGameEffectDataset(rows);
    const result = measureCohortEffect({
      dataset,
      participants,
      isComparisonEligible: (guestId) => guestId.startsWith('c'),
      lastCompleteDay: exposure + 40,
    });

    expect(result.measured).toBe(20);
    expect(result.comparisonGuests).toBe(30);
    // Before: 4 visits (exposure-28, -21, -14, -7). After: 10 vs 4.
    expect(result.metrics.visitDays.participantsBefore).toBe(4);
    expect(result.metrics.visitDays.participantsAfter).toBe(10);
    expect(result.metrics.visitDays.comparisonBefore).toBe(4);
    expect(result.metrics.visitDays.comparisonAfter).toBe(4);
    expect(result.metrics.visitDays.effectPerGuest).toBe(6);
    expect(result.metrics.money.effectPerGuest).toBe(6 * 400);
    expect(result.metrics.money.total).toBe(20 * 6 * 400);
    expect(result.measuredGuestIds).toHaveLength(20);
    expect(gameEffectVerdict(result.measured, result.metrics)).toBe('POSITIVE');
  });

  it('counts immature, unmatched and unknown participants apart', () => {
    const exposure = D + 40;
    const dataset = buildGameEffectDataset([
      ...visits('late', [exposure]),
      ...visits('alone', [D + 10]),
    ]);
    const result = measureCohortEffect({
      dataset,
      participants: [
        { guestId: 'late', exposureDay: exposure },
        { guestId: 'alone', exposureDay: D + 10 },
        { guestId: 'ghost', exposureDay: D + 10 },
      ],
      isComparisonEligible: () => true,
      lastCompleteDay: exposure + GAME_EFFECT_WINDOW_DAYS - 1,
    });
    expect(result).toMatchObject({
      participants: 3,
      measured: 0,
      immature: 1,
      unmatched: 1,
      noHistory: 1,
    });
    expect(gameEffectVerdict(result.measured, result.metrics)).toBe(
      'NOT_ENOUGH_DATA',
    );
  });

  it('never uses ineligible guests as comparison', () => {
    const exposure = D + 40;
    const rows = [
      ...visits('p', weekly(exposure - 28, exposure + 28)),
      ...visits('x1', weekly(exposure - 28, exposure + 28)),
      ...visits('x2', weekly(exposure - 28, exposure + 28)),
      ...visits('x3', weekly(exposure - 28, exposure + 28)),
    ];
    const result = measureCohortEffect({
      dataset: buildGameEffectDataset(rows),
      participants: [{ guestId: 'p', exposureDay: exposure }],
      isComparisonEligible: () => false,
      lastCompleteDay: exposure + 30,
    });
    expect(result.unmatched).toBe(1);
  });

  it('widens to neighbouring days, measuring each visitor around their own day', () => {
    const exposure = D + 40;
    const rows = [
      ...visits('p', [exposure - 7, exposure, exposure + 7, exposure + 14]),
      // Comparison guests visited one day later than the participant.
      ...['c1', 'c2', 'c3'].flatMap((id) =>
        visits(id, [exposure - 6, exposure + 1, exposure + 8]),
      ),
    ];
    const result = measureCohortEffect({
      dataset: buildGameEffectDataset(rows),
      participants: [{ guestId: 'p', exposureDay: exposure }],
      isComparisonEligible: (guestId) => guestId.startsWith('c'),
      lastCompleteDay: exposure + 40,
    });
    expect(result.measured).toBe(1);
    // Around their own day (exposure+1): 1 before, 1 after → no change.
    expect(result.metrics.visitDays.comparisonBefore).toBe(1);
    expect(result.metrics.visitDays.comparisonAfter).toBe(1);
    expect(result.metrics.visitDays.effectPerGuest).toBe(1);
    // A single guest has no interval.
    expect(result.metrics.visitDays.ciLow).toBeNull();
  });

  it('measures one guest on a shrunken window while the window runs', () => {
    const exposure = D + 40;
    const rows = [
      ...visits('p', [exposure - 3, exposure, exposure + 2, exposure + 5]),
      ...['c1', 'c2', 'c3'].flatMap((id) =>
        visits(id, [exposure - 3, exposure, exposure + 5]),
      ),
    ];
    const dataset = buildGameEffectDataset(rows);
    const early = measureGuestEffect({
      dataset,
      participant: { guestId: 'p', exposureDay: exposure },
      isComparisonEligible: (guestId) => guestId.startsWith('c'),
      lastCompleteDay: exposure + 5,
    });
    expect(early).toMatchObject({ status: 'TOO_EARLY', daysElapsed: 5 });

    const partial = measureGuestEffect({
      dataset,
      participant: { guestId: 'p', exposureDay: exposure },
      isComparisonEligible: (guestId) => guestId.startsWith('c'),
      lastCompleteDay: exposure + 10,
    });
    expect(partial.status).toBe('MEASURED');
    if (partial.status !== 'MEASURED') return;
    expect(partial.windowDays).toBe(10);
    expect(partial.complete).toBe(false);
    expect(partial.before.visitDays).toBe(1);
    expect(partial.after.visitDays).toBe(2);
    expect(partial.expectedAfter.visitDays).toBe(1);
    expect(partial.effect.visitDays).toBe(1);
  });

  it('splits holdout deterministically and monotonically', () => {
    expect(holdoutBucket('mission-1:profile-1')).toBe(
      holdoutBucket('mission-1:profile-1'),
    );
    const ids = Array.from({ length: 2000 }, (_, index) => `profile-${index}`);
    const at10 = ids.filter((profileId) =>
      isInGameHoldout({ scenarioId: 'mission-1', profileId, percent: 10 }),
    );
    const at20 = ids.filter((profileId) =>
      isInGameHoldout({ scenarioId: 'mission-1', profileId, percent: 20 }),
    );
    expect(at10.length / ids.length).toBeGreaterThan(0.07);
    expect(at10.length / ids.length).toBeLessThan(0.13);
    expect(at10.every((id) => at20.includes(id))).toBe(true);
    expect(
      isInGameHoldout({ scenarioId: 'm', profileId: 'p', percent: 0 }),
    ).toBe(false);
    // The share is capped at 50 %.
    const capped = ids.filter((profileId) =>
      isInGameHoldout({ scenarioId: 'mission-1', profileId, percent: 90 }),
    );
    expect(capped.length / ids.length).toBeLessThan(0.55);
  });

  it('compares assigned and held-out guests from their start', () => {
    const start = D + 40;
    const rows: GameEffectDailyRow[] = [];
    const members = [];
    for (let index = 0; index < 12; index += 1) {
      rows.push(
        ...visits(`t${index}`, [
          ...weekly(start - 28, start - 1),
          ...everyThird(start, start + 27),
        ]),
      );
      members.push({ guestId: `t${index}`, startDay: start, holdout: false });
      rows.push(...visits(`h${index}`, weekly(start - 28, start + 27)));
      members.push({ guestId: `h${index}`, startDay: start, holdout: true });
    }
    const result = measureHoldoutEffect({
      dataset: buildGameEffectDataset(rows),
      members,
      lastCompleteDay: start + 40,
    });
    expect(result).toMatchObject({
      windowDays: 28,
      treatment: 12,
      holdout: 12,
      measuredTreatment: 12,
      measuredHoldout: 12,
    });
    expect(result.metrics.visitDays.effectPerGuest).toBe(10 - 4);
    expect(gameEffectVerdict(12, result.metrics)).toBe('POSITIVE');
  });

  it('reads money first and visits second in the verdict', () => {
    const metric = (effectPerGuest: number, significant: boolean) => ({
      participantsBefore: 0,
      participantsAfter: 0,
      comparisonBefore: 0,
      comparisonAfter: 0,
      effectPerGuest,
      ciLow: significant ? effectPerGuest - 1 : -1,
      ciHigh: significant ? effectPerGuest + 1 : 1,
      total: 0,
      significant,
    });
    const base = {
      visitDays: metric(0, false),
      sessions: metric(0, false),
      playMinutes: metric(0, false),
      balanceSpend: metric(0, false),
      barRevenue: metric(0, false),
      money: metric(0, false),
    };
    expect(gameEffectVerdict(50, base)).toBe('NO_EFFECT');
    expect(gameEffectVerdict(50, { ...base, money: metric(-300, true) })).toBe(
      'NEGATIVE',
    );
    expect(
      gameEffectVerdict(50, {
        ...base,
        money: metric(-300, true),
        visitDays: metric(2, true),
      }),
    ).toBe('NEGATIVE');
    expect(gameEffectVerdict(50, { ...base, visitDays: metric(2, true) })).toBe(
      'POSITIVE',
    );
    expect(gameEffectVerdict(5, { ...base, money: metric(300, true) })).toBe(
      'NOT_ENOUGH_DATA',
    );
  });
});
