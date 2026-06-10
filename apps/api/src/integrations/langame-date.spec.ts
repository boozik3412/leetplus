import { parseLangameDate } from './langame-date';

describe('parseLangameDate', () => {
  it('treats no-timezone timestamps as local club time', () => {
    expect(
      parseLangameDate(
        '2026-06-10 09:07:00',
        'Asia/Yekaterinburg',
      )?.toISOString(),
    ).toBe('2026-06-10T04:07:00.000Z');
  });

  it('keeps date-only values as calendar UTC dates', () => {
    expect(
      parseLangameDate('2026-05-10', 'Asia/Yekaterinburg')?.toISOString(),
    ).toBe('2026-05-10T00:00:00.000Z');
  });

  it('does not shift timestamps with an explicit timezone', () => {
    expect(
      parseLangameDate(
        '2026-06-10T09:07:00Z',
        'Asia/Yekaterinburg',
      )?.toISOString(),
    ).toBe('2026-06-10T09:07:00.000Z');
  });
});
