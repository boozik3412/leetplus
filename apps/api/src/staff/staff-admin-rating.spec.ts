import {
  adminRatingShiftKind,
  averageCheckPoints,
  buildClubAverages,
  clubAverageKey,
  computeAdminRating,
  isTaskOverdue,
  type AdminRatingInput,
  type AdminRatingShift,
} from './staff-admin-rating';

const NOW = new Date('2026-11-13T09:00:00.000Z');

function input(overrides: Partial<AdminRatingInput> = {}): AdminRatingInput {
  return {
    now: NOW,
    escalations: [],
    records: [],
    tasks: [],
    shifts: [],
    clubAverages: new Map(),
    linkedToLangame: true,
    disciplineHref: '/staff/discipline?userId=u1',
    ...overrides,
  };
}

function shifts(
  storeId: string,
  shiftKind: AdminRatingShift['shiftKind'],
  checks: number[],
): AdminRatingShift[] {
  return checks.map((middleCheck) => ({ storeId, shiftKind, middleCheck }));
}

describe('administrator rating', () => {
  it('starts at 100 with nothing to count', () => {
    const result = computeAdminRating(input());

    expect(result.score).toBe(100);
    expect(result.items).toEqual([]);
    expect(result.riskLevel).toBe('LOW');
  });

  it('takes 5 per escalation, 10 per fine, 5 per warning and 3 per overdue task', () => {
    const result = computeAdminRating(
      input({
        escalations: [
          {
            id: 'r1',
            title: 'Закрытие смены',
            at: new Date('2026-11-05T20:00:00.000Z'),
            storeName: '1337',
            failedItems: 3,
          },
        ],
        records: [
          {
            id: 'd1',
            level: 'FINE_1',
            title: 'Опоздание на смену',
            category: 'Опоздания',
            amount: 500,
            at: new Date('2026-11-08T10:00:00.000Z'),
          },
          {
            id: 'd2',
            level: 'WARNING_1',
            title: 'Внешний вид',
            category: 'Форма',
            amount: 0,
            at: new Date('2026-11-10T10:00:00.000Z'),
          },
        ],
        tasks: [
          {
            id: 't1',
            title: 'Пересчитать склад',
            status: 'DONE',
            dueAt: new Date('2026-11-09T15:00:00.000Z'),
            completedAt: new Date('2026-11-10T09:00:00.000Z'),
          },
          {
            id: 't2',
            title: 'Вовремя',
            status: 'DONE',
            dueAt: new Date('2026-11-09T15:00:00.000Z'),
            completedAt: new Date('2026-11-09T14:00:00.000Z'),
          },
        ],
      }),
    );

    expect(result.items.map((item) => [item.kind, item.points])).toEqual([
      ['CHECKLIST_ESCALATED', -5],
      ['FINE', -10],
      ['WARNING', -5],
      ['TASK_OVERDUE', -3],
    ]);
    expect(result.score).toBe(77);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.counts).toEqual({
      escalatedChecklists: 1,
      fines: 1,
      warnings: 1,
      overdueTasks: 1,
      forgiven: 0,
      forgivenPoints: 0,
      bonusPoints: 0,
      penaltyPoints: 0,
    });
    expect(result.items[1].href).toBe('/staff/discipline?userId=u1');
  });

  it('ignores the fine amount and keeps the score at 0 or more', () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      id: `d${index}`,
      level: 'FINE_3',
      title: 'Касса',
      category: 'Касса',
      amount: 5000,
      at: new Date('2026-11-01T10:00:00.000Z'),
    }));

    const result = computeAdminRating(input({ records }));

    expect(result.rawScore).toBe(-20);
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('HIGH');
  });

  it('counts open tasks past the deadline but not canceled or future ones', () => {
    const base = { id: 't', title: 'x', completedAt: null };

    expect(
      isTaskOverdue(
        { ...base, status: 'OPEN', dueAt: new Date('2026-11-12T00:00:00Z') },
        NOW,
      ),
    ).toBe(true);
    expect(
      isTaskOverdue(
        { ...base, status: 'OPEN', dueAt: new Date('2026-11-14T00:00:00Z') },
        NOW,
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        {
          ...base,
          status: 'CANCELED',
          dueAt: new Date('2026-11-12T00:00:00Z'),
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        { ...base, status: 'DONE', dueAt: new Date('2026-11-12T00:00:00Z') },
        NOW,
      ),
    ).toBe(false);
  });

  it('gives 1 point per full 5% of average check, at most 5', () => {
    expect(averageCheckPoints(4.9)).toBe(0);
    expect(averageCheckPoints(13)).toBe(2);
    expect(averageCheckPoints(-10)).toBe(-2);
    expect(averageCheckPoints(-9.9)).toBe(-1);
    expect(averageCheckPoints(80)).toBe(5);
    expect(averageCheckPoints(-80)).toBe(-5);
  });

  it('compares day shifts with day and night shifts with night', () => {
    const own = [
      ...shifts('s1', 'DAY', [612, 612]),
      ...shifts('s1', 'NIGHT', [410, 410]),
    ];
    const club = [
      ...own,
      ...shifts('s1', 'DAY', [468, 468]),
      ...shifts('s1', 'NIGHT', [500, 500]),
    ];

    const result = computeAdminRating(
      input({ shifts: own, clubAverages: buildClubAverages(club) }),
    );

    // Day: 612 against 540 (+13%) → +2. Night: 410 against 455 (−10%) → −2.
    expect(result.averageCheck.day).toMatchObject({
      shifts: 2,
      average: 612,
      clubAverage: 540,
      deltaPercent: 13,
      points: 2,
    });
    expect(result.averageCheck.night).toMatchObject({
      average: 410,
      clubAverage: 455,
      deltaPercent: -10,
      points: -2,
    });
    expect(result.rawScore).toBe(100);
    expect(result.items.map((item) => item.points)).toEqual([2, -2]);
  });

  it('needs two shifts of a kind before the check counts', () => {
    const own = shifts('s1', 'NIGHT', [300]);
    const result = computeAdminRating(
      input({
        shifts: own,
        clubAverages: new Map([[clubAverageKey('s1', 'NIGHT'), 500]]),
      }),
    );

    expect(result.averageCheck.night.deltaPercent).toBe(-40);
    expect(result.averageCheck.night.points).toBe(0);
    expect(result.score).toBe(100);
  });

  it('caps the score at 100 but keeps the bonus for the order', () => {
    const own = shifts('s1', 'DAY', [700, 700]);
    const result = computeAdminRating(
      input({
        shifts: own,
        clubAverages: new Map([[clubAverageKey('s1', 'DAY'), 500]]),
      }),
    );

    expect(result.score).toBe(100);
    expect(result.rawScore).toBe(105);
  });

  it('measures a multi-club administrator against the clubs they worked in', () => {
    const own = [
      ...shifts('s1', 'DAY', [500, 500]),
      ...shifts('s2', 'DAY', [300, 300]),
    ];
    const result = computeAdminRating(
      input({
        shifts: own,
        clubAverages: new Map([
          [clubAverageKey('s1', 'DAY'), 500],
          [clubAverageKey('s2', 'DAY'), 300],
        ]),
      }),
    );

    expect(result.averageCheck.day.deltaPercent).toBe(0);
    expect(result.averageCheck.day.points).toBe(0);
  });

  it('treats a shift started 8:00–19:59 club time as a day shift', () => {
    expect(adminRatingShiftKind(7)).toBe('NIGHT');
    expect(adminRatingShiftKind(8)).toBe('DAY');
    expect(adminRatingShiftKind(19)).toBe('DAY');
    expect(adminRatingShiftKind(20)).toBe('NIGHT');
    expect(adminRatingShiftKind(0)).toBe('NIGHT');
  });

  describe('reviewer decisions', () => {
    const at = new Date('2026-11-10T12:00:00.000Z');
    const penalties = () =>
      input({
        records: [
          {
            id: 'd1',
            level: 'FINE_1',
            title: 'Опоздание',
            category: 'Дисциплина',
            amount: 500,
            at,
          },
        ],
        tasks: [
          {
            id: 't1',
            title: 'Пересчитать кассу',
            status: 'OPEN',
            dueAt: new Date('2026-11-08T12:00:00.000Z'),
            completedAt: null,
          },
        ],
      });

    it('forgives one item: it stays in the list with 0 points', () => {
      const base = penalties();
      const result = computeAdminRating({
        ...base,
        adjustments: [
          {
            id: 'a1',
            kind: 'FORGIVE',
            points: 0,
            targetKind: 'TASK_OVERDUE',
            targetId: 't1',
            reason: 'Ждали поставщика',
            at,
            authorName: 'Иванов Иван',
          },
        ],
      });

      const task = result.items.find((item) => item.kind === 'TASK_OVERDUE');
      expect(task).toMatchObject({
        points: 0,
        basePoints: -3,
        targetId: 't1',
        forgiven: {
          adjustmentId: 'a1',
          reason: 'Ждали поставщика',
          authorName: 'Иванов Иван',
        },
      });
      expect(result.score).toBe(90);
      expect(result.counts).toMatchObject({
        fines: 1,
        overdueTasks: 0,
        forgiven: 1,
        forgivenPoints: 3,
      });
    });

    it('does not forgive an item of another kind with the same id', () => {
      const result = computeAdminRating({
        ...penalties(),
        adjustments: [
          {
            id: 'a1',
            kind: 'FORGIVE',
            points: 0,
            targetKind: 'FINE',
            targetId: 't1',
            reason: 'Ошибка',
            at,
            authorName: null,
          },
        ],
      });

      expect(result.score).toBe(87);
      expect(result.counts.forgiven).toBe(0);
    });

    it('adds bonuses and penalties with their reason and author', () => {
      const result = computeAdminRating({
        ...penalties(),
        adjustments: [
          {
            id: 'b1',
            kind: 'BONUS',
            points: 5,
            targetKind: null,
            targetId: null,
            reason: 'Вышел на замену',
            at,
            authorName: 'Иванов Иван',
          },
          {
            id: 'p1',
            kind: 'PENALTY',
            points: -2,
            targetKind: null,
            targetId: null,
            reason: 'Грубость гостю',
            at,
            authorName: null,
          },
        ],
      });

      expect(result.items.map((item) => [item.kind, item.points])).toEqual([
        ['FINE', -10],
        ['TASK_OVERDUE', -3],
        ['MANUAL_BONUS', 5],
        ['MANUAL_PENALTY', -2],
      ]);
      expect(result.items[2]).toMatchObject({
        title: 'Поощрение',
        detail: '«Вышел на замену» · Иванов Иван · 2026-11-10',
        decision: { adjustmentId: 'b1' },
      });
      expect(result.score).toBe(90);
      expect(result.counts).toMatchObject({ bonusPoints: 5, penaltyPoints: 2 });
    });

    it('keeps the score at 100 but lets a bonus break the tie', () => {
      const result = computeAdminRating(
        input({
          adjustments: [
            {
              id: 'b1',
              kind: 'BONUS',
              points: 4,
              targetKind: null,
              targetId: null,
              reason: 'Помог соседнему клубу',
              at,
              authorName: null,
            },
          ],
        }),
      );

      expect(result.score).toBe(100);
      expect(result.rawScore).toBe(104);
    });
  });
});
