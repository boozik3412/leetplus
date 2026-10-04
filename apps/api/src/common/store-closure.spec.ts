import {
  addClosureDays,
  closedDaysInRange,
  closureDay,
  closuresOverlap,
  isClosedOn,
  parseClosureDay,
  rangeDays,
} from './store-closure';

describe('store closure days', () => {
  it('accepts real calendar days only', () => {
    expect(parseClosureDay('2026-09-29')).toBe('2026-09-29');
    expect(parseClosureDay(' 2026-02-28 ')).toBe('2026-02-28');
    expect(parseClosureDay('2026-02-30')).toBeNull();
    expect(parseClosureDay('2026-13-01')).toBeNull();
    expect(parseClosureDay('29.09.2026')).toBeNull();
    expect(parseClosureDay(20260929)).toBeNull();
    expect(closureDay(new Date('2026-09-29T00:00:00.000Z'))).toBe('2026-09-29');
    expect(addClosureDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('counts closed days of a range, open-ended closures included', () => {
    // Холмогорова: closed from 29.09, the week 23–29.09 has one closed day.
    const open = [{ closedFrom: '2026-09-29', reopenedOn: null }];
    expect(closedDaysInRange(open, '2026-09-23', '2026-09-29')).toBe(1);
    expect(closedDaysInRange(open, '2026-09-30', '2026-10-06')).toBe(7);
    expect(closedDaysInRange(open, '2026-09-16', '2026-09-22')).toBe(0);

    // The reopening day itself is open.
    const ended = [{ closedFrom: '2026-09-25', reopenedOn: '2026-09-28' }];
    expect(closedDaysInRange(ended, '2026-09-23', '2026-09-29')).toBe(3);
    expect(isClosedOn(ended, '2026-09-27')).toBe(true);
    expect(isClosedOn(ended, '2026-09-28')).toBe(false);
    expect(isClosedOn(ended, '2026-09-24')).toBe(false);

    expect(
      closedDaysInRange(
        [
          { closedFrom: '2026-09-01', reopenedOn: '2026-09-03' },
          { closedFrom: '2026-09-10', reopenedOn: null },
        ],
        '2026-09-01',
        '2026-09-30',
      ),
    ).toBe(2 + 21);
    expect(rangeDays('2026-09-23', '2026-09-29')).toBe(7);
    expect(rangeDays('2026-09-29', '2026-09-23')).toBe(0);
  });

  it('detects overlapping closures of one club', () => {
    const base = { closedFrom: '2026-09-10', reopenedOn: '2026-09-20' };
    expect(
      closuresOverlap(base, { closedFrom: '2026-09-19', reopenedOn: null }),
    ).toBe(true);
    // Reopening on the day another closure starts is fine.
    expect(
      closuresOverlap(base, { closedFrom: '2026-09-20', reopenedOn: null }),
    ).toBe(false);
    expect(
      closuresOverlap(base, {
        closedFrom: '2026-09-01',
        reopenedOn: '2026-09-10',
      }),
    ).toBe(false);
    expect(
      closuresOverlap(
        { closedFrom: '2026-09-01', reopenedOn: null },
        { closedFrom: '2026-12-01', reopenedOn: null },
      ),
    ).toBe(true);
  });
});
