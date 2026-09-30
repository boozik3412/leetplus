import {
  clubDayQueryWindow,
  clubTimeZoneResolver,
  clubWallClock,
  onClubDays,
} from './club-time';

describe('club-local time', () => {
  it('moves an instant to the club wall clock on the UTC axis', () => {
    const formatters = new Map<string, Intl.DateTimeFormat>();
    // 30.09.2026 00:30 in Yekaterinburg (UTC+5).
    expect(
      clubWallClock(
        new Date('2026-09-29T19:30:15.250Z'),
        'Asia/Yekaterinburg',
        formatters,
      ).toISOString(),
    ).toBe('2026-09-30T00:30:15.250Z');
    expect(
      clubWallClock(
        new Date('2026-09-29T19:30:00.000Z'),
        'Europe/Samara',
        formatters,
      ).toISOString(),
    ).toBe('2026-09-29T23:30:00.000Z');
    expect([...formatters.keys()]).toEqual([
      'Asia/Yekaterinburg',
      'Europe/Samara',
    ]);
  });

  it('reads calendar days with a margin for every zone', () => {
    expect(
      clubDayQueryWindow(
        new Date('2026-09-23T00:00:00.000Z'),
        new Date('2026-09-29T23:59:59.999Z'),
      ),
    ).toEqual({
      gte: new Date('2026-09-22T10:00:00.000Z'),
      lte: new Date('2026-09-30T13:59:59.999Z'),
    });
  });

  it('resolves the zone by club, then by a single-zone domain, then by tenant', () => {
    const zoneOf = clubTimeZoneResolver([
      { id: 'pu', externalDomain: 'samara', timeZone: 'Europe/Samara' },
      { id: 'kh', externalDomain: 'samara', timeZone: 'Europe/Samara' },
      { id: 'ra', externalDomain: 'ekb', timeZone: 'Asia/Yekaterinburg' },
      { id: 'mix', externalDomain: 'ekb', timeZone: 'Europe/Moscow' },
    ]);
    expect(zoneOf('ra')).toBe('Asia/Yekaterinburg');
    expect(zoneOf(null, 'samara')).toBe('Europe/Samara');
    // A domain across zones and a mixed tenant fall back to UTC.
    expect(zoneOf(null, 'ekb')).toBe('UTC');
    expect(zoneOf(null, null)).toBe('UTC');
    expect(
      clubTimeZoneResolver([{ id: 'a', timeZone: 'Asia/Yekaterinburg' }])(
        'unknown',
      ),
    ).toBe('Asia/Yekaterinburg');
  });

  it('keeps the club-local days of a window and the stored instant', () => {
    const night = {
      storeId: 'ra',
      saleDate: new Date('2026-09-28T20:00:00.000Z'),
    };
    const nextNight = {
      storeId: 'ra',
      saleDate: new Date('2026-09-29T20:00:00.000Z'),
    };
    const result = onClubDays(
      [night, nextNight, { storeId: 'ra', saleDate: null }],
      'saleDate',
      () => 'Asia/Yekaterinburg',
      {
        from: new Date('2026-09-29T00:00:00.000Z'),
        to: new Date('2026-09-29T23:59:59.999Z'),
      },
      new Map(),
    );

    expect(result.rows).toEqual([
      { storeId: 'ra', saleDate: new Date('2026-09-29T01:00:00.000Z') },
    ]);
    expect(result.source(result.rows[0])).toBe(night);
  });
});
