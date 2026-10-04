import { evaluateGuestGameProgress } from './guest-game-progress';
import { evaluateGuestGameLedgerRule } from './guest-game-rule-evaluator';
import {
  guestGameWindowMatch,
  guestGameWindowSpec,
  sessionMinutesInsideWindow,
} from './guest-game-session-window';

const timeZone = 'Asia/Yekaterinburg'; // UTC+5, clubs 1337
const weekdayDaytime = { hours: ['08:00-17:00'], weekdays: [1, 2, 3, 4, 5] };

// Local Yekaterinburg time -> UTC instant.
const local = (iso: string) => new Date(`${iso}+05:00`);

function inside(endLocal: string, minutes: number, spec = weekdayDaytime) {
  return sessionMinutesInsideWindow({
    endedAt: local(endLocal),
    minutes,
    spec,
    timeZone,
  });
}

describe('session minutes inside a time window', () => {
  it('counts only the part of a session inside weekday 08:00-17:00', () => {
    // Tue 29.09 15:42 -> Wed 30.09 00:08 (506 min): 15:42-17:00 counts.
    expect(inside('2026-09-30T00:08:00', 506)).toBe(78);
    // Tue 22.09 15:09 -> 16:07: fully inside but only 58 minutes.
    expect(inside('2026-09-22T16:07:00', 58)).toBe(58);
    // Thu 01.10 07:30 -> 08:45 starts before the window.
    expect(inside('2026-10-01T08:45:00', 75)).toBe(45);
    // Fri 02.10 16:30 -> 19:00 ends after the window.
    expect(inside('2026-10-02T19:00:00', 150)).toBe(30);
  });

  it('ignores weekend days and splits sessions across midnight', () => {
    // Sat 03.10 10:00 -> 13:00: weekend.
    expect(inside('2026-10-03T13:00:00', 180)).toBe(0);
    // Sun 04.10 23:00 -> Mon 05.10 09:30: only Monday 08:00-09:30.
    expect(inside('2026-10-05T09:30:00', 630)).toBe(90);
    // Mon 05.10 08:00 -> Wed 07.10 08:00: two full weekday windows.
    expect(inside('2026-10-07T08:00:00', 48 * 60)).toBe(2 * 9 * 60);
  });

  it('treats a whole-day window as the full duration and supports wrap-around', () => {
    expect(
      inside('2026-10-04T01:00:00', 120, {
        hours: ['00:00-23:59'],
        weekdays: [],
      }),
    ).toBe(120);
    expect(
      inside('2026-10-04T03:00:00', 360, {
        hours: ['22:00-02:00'],
        weekdays: [],
      }),
    ).toBe(240);
  });

  it('reads the mode and the window from the rule metric', () => {
    expect(guestGameWindowMatch({ windowMatch: 'overlap' }, {})).toBe(
      'OVERLAP',
    );
    expect(guestGameWindowMatch({}, {})).toBe('SESSION_END');
    expect(
      guestGameWindowSpec(
        { hours: ['08:00-17:00'], weekdayMode: 'WEEKDAYS' },
        {},
      ),
    ).toEqual(weekdayDaytime);
  });
});

const stepConditions = (windowMatch?: 'OVERLAP') => ({
  metric: {
    unit: 'минут',
    hours: ['08:00-17:00'],
    target: 60,
    weekdays: [1, 2, 3, 4, 5],
    eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
    windowDays: 300,
    aggregation: 'duration',
    minSessionMinutes: 60,
    ...(windowMatch ? { windowMatch } : {}),
  },
});

describe('battle pass step "60 minutes inside weekday 08:00-17:00"', () => {
  const sessionEnd = (endLocal: string, minutes: number) => ({
    eventType: 'PLAY_HOUR',
    occurredAt: local(endLocal),
    storeId: 'store-1',
    sessionMinutes: minutes,
  });
  const rule = (windowMatch?: 'OVERLAP') => ({
    triggerKind: 'PLAY_HOUR',
    conditions: stepConditions(windowMatch),
    timeZone,
  });

  it('completes on a long session that only overlaps the window', () => {
    const history = [
      sessionEnd('2026-09-22T16:07:00', 58),
      sessionEnd('2026-09-30T00:08:00', 506),
    ];
    const reference = {
      eventType: 'CHECK_IN',
      occurredAt: local('2026-10-04T19:44:00'),
      storeId: 'store-1',
    };

    const overlap = evaluateGuestGameProgress(
      rule('OVERLAP'),
      reference,
      history,
    );
    expect(overlap).toMatchObject({ completed: true, current: 78 });

    // The previous rule (stop time inside the window) did not count it.
    const sessionEndMode = evaluateGuestGameProgress(
      rule(),
      reference,
      history,
    );
    expect(sessionEndMode).toMatchObject({ completed: false, current: 0 });
  });

  it('does not add up minutes of different sessions', () => {
    const progress = evaluateGuestGameProgress(rule('OVERLAP'), null, [
      sessionEnd('2026-10-01T10:00:00', 40),
      sessionEnd('2026-10-01T11:00:00', 40),
    ]);
    expect(progress).toMatchObject({ completed: false, current: 0 });
  });

  it('matches the ledger fallback with the same overlap minutes', () => {
    const ledgerRule = {
      type: 'BATTLE_PASS_STEP',
      id: 'step-4',
      title: 'GOOD MORNING, VIETNAM',
      triggerKind: 'PLAY_HOUR',
      sessionType: 'ANY',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      activatedAt: new Date('2026-09-01T00:00:00Z'),
      periodFrom: null,
      periodTo: null,
      periodRules: stepConditions('OVERLAP'),
      storeIds: ['store-1'],
      progressTarget: 60,
      progressUnit: 'минут',
    };
    const fact = (endLocal: string, minutes: number, id: string) => ({
      id,
      factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      confidence: 'EXACT',
      happenedAt: local(endLocal),
      createdAt: local(endLocal),
      storeId: 'store-1',
      tariffName: null,
      tariffType: 'package_or_subscription',
      amount: null,
      durationMinutes: minutes,
      evidence: null,
      store: { timeZone },
      sessionExternalId: id,
    });
    const evaluatedAt = local('2026-10-04T19:44:00');

    const matched = evaluateGuestGameLedgerRule(
      ledgerRule,
      [fact('2026-09-30T00:08:00', 506, 'night-packet')],
      'store-1',
      evaluatedAt,
    );
    expect(matched.status).toBe('MATCHED');
    expect(matched.progress).toMatchObject({ current: 78 });

    const blocked = evaluateGuestGameLedgerRule(
      ledgerRule,
      [fact('2026-09-22T16:07:00', 58, 'short-hourly')],
      'store-1',
      evaluatedAt,
    );
    expect(blocked.status).toBe('BLOCKED');

    const sessionEndRule = {
      ...ledgerRule,
      periodRules: stepConditions(),
    };
    expect(
      evaluateGuestGameLedgerRule(
        sessionEndRule,
        [fact('2026-09-30T00:08:00', 506, 'night-packet')],
        'store-1',
        evaluatedAt,
      ).status,
    ).toBe('BLOCKED');
  });
});
