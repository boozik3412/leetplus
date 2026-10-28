import {
  buildDailyReport,
  guestSummary,
  shiftBelongsToDay,
} from './daily-report-builder';
import {
  DailyReportCommentaryService,
  unknownNumbers,
} from './daily-report-commentary';
import { packMessages, renderDailyReport } from './daily-report-text';
import {
  formatRub,
  pluralRu,
  shortPersonName,
  shortProductName,
} from './daily-report-format';
import {
  clubDayWindow,
  lastClosedClubDay,
  localTime,
} from './daily-report-window';
import type {
  DailyReportInput,
  DailyReportShiftRow,
} from './daily-report.types';

const IZHEVSK = 'Europe/Samara';
const YEKATERINBURG = 'Asia/Yekaterinburg';

function shift(
  overrides: Partial<DailyReportShiftRow> & { startedAt: Date | null },
): DailyReportShiftRow {
  return {
    id: overrides.id ?? `shift-${Math.random()}`,
    storeId: 'izh',
    adminKey: 'izh.langame.ru:1',
    adminName: 'Анна',
    stoppedAt: null,
    cash: 0,
    cashless: 0,
    mobilePay: 0,
    refunds: 0,
    incass: 0,
    ...overrides,
  };
}

describe('club day window', () => {
  it('runs from 09:00 to 09:00 on the club clock, not by Moscow time', () => {
    const izhevsk = clubDayWindow('2026-10-26', IZHEVSK);
    expect(izhevsk.from.toISOString()).toBe('2026-10-25T05:00:00.000Z');
    expect(izhevsk.to.toISOString()).toBe('2026-10-26T05:00:00.000Z');

    const yekaterinburg = clubDayWindow('2026-10-26', YEKATERINBURG);
    expect(yekaterinburg.from.toISOString()).toBe('2026-10-25T04:00:00.000Z');
    expect(yekaterinburg.to.toISOString()).toBe('2026-10-26T04:00:00.000Z');
  });

  it('takes the day that closed this morning at 10:00 MSK', () => {
    const tenMoscow = new Date('2026-10-26T07:00:00.000Z');
    expect(lastClosedClubDay(tenMoscow, IZHEVSK).reportDate).toBe('2026-10-26');
    expect(lastClosedClubDay(tenMoscow, YEKATERINBURG).reportDate).toBe(
      '2026-10-26',
    );
    // 08:30 in Izhevsk: today's day has not closed yet.
    const beforeClose = new Date('2026-10-26T04:30:00.000Z');
    expect(lastClosedClubDay(beforeClose, IZHEVSK).reportDate).toBe(
      '2026-10-25',
    );
  });

  it('assigns a shift to the day it started in, with early openings to the next day', () => {
    const window = clubDayWindow('2026-10-26', IZHEVSK);
    const at = (local: string) => new Date(`${local}+04:00`);
    expect(
      shiftBelongsToDay(
        shift({ startedAt: at('2026-10-25T09:02:00') }),
        window,
      ),
    ).toBe(true);
    expect(
      shiftBelongsToDay(
        shift({ startedAt: at('2026-10-25T08:40:00') }),
        window,
      ),
    ).toBe(true);
    expect(
      shiftBelongsToDay(
        shift({ startedAt: at('2026-10-25T21:00:00') }),
        window,
      ),
    ).toBe(true);
    expect(
      shiftBelongsToDay(
        shift({ startedAt: at('2026-10-26T08:40:00') }),
        window,
      ),
    ).toBe(false);
    expect(localTime(at('2026-10-25T21:00:00'), IZHEVSK)).toBe('21:00');
  });
});

describe('daily report builder', () => {
  const at = (local: string) => new Date(`${local}+04:00`);
  const window = clubDayWindow('2026-10-26', IZHEVSK);
  const baseline = Array.from({ length: 7 }, (_, index) =>
    clubDayWindow(`2026-10-${String(25 - index).padStart(2, '0')}`, IZHEVSK),
  );

  function input(overrides: Partial<DailyReportInput> = {}): DailyReportInput {
    return {
      generatedAt: new Date('2026-10-26T07:00:00.000Z'),
      stores: [
        {
          id: 'izh',
          name: '1337 Ижевск',
          timeZone: IZHEVSK,
          computerCount: 10,
          window,
        },
      ],
      baselineWindows: { izh: baseline },
      shifts: [
        shift({
          id: 'day',
          startedAt: at('2026-10-25T09:00:00'),
          stoppedAt: at('2026-10-25T21:00:00'),
          cash: 10000,
          cashless: 20000,
          refunds: 1500,
        }),
        shift({
          id: 'night',
          adminKey: 'izh.langame.ru:2',
          adminName: 'Борис',
          startedAt: at('2026-10-25T21:05:00'),
          stoppedAt: null,
          cash: 5000,
        }),
        // A usual day a week ago: 40 000 ₽.
        shift({
          id: 'old',
          startedAt: at('2026-10-19T09:00:00'),
          stoppedAt: at('2026-10-20T09:00:00'),
          cash: 40000,
        }),
      ],
      historyShifts: [
        shift({
          id: 'anna-history',
          startedAt: at('2026-10-20T09:00:00'),
          stoppedAt: at('2026-10-20T21:00:00'),
          cash: 36000,
        }),
      ],
      sales: [
        {
          storeId: 'izh',
          productKey: 'monster',
          productName: 'Monster 0,5',
          saleDate: at('2026-10-25T23:10:00'),
          quantity: 3,
          revenue: 600,
          cost: 300,
        },
        {
          storeId: 'izh',
          productKey: 'monster',
          productName: 'Monster 0,5',
          // After 09:00: belongs to the next club day.
          saleDate: at('2026-10-26T09:10:00'),
          quantity: 1,
          revenue: 200,
          cost: 100,
        },
      ],
      sessions: [
        {
          storeId: 'izh',
          guestKey: 'g1',
          startedAt: at('2026-10-25T12:00:00'),
          durationMinutes: 120,
        },
        {
          storeId: 'izh',
          guestKey: 'g1',
          startedAt: at('2026-10-25T18:00:00'),
          durationMinutes: 60,
        },
        {
          storeId: 'izh',
          guestKey: 'g2',
          startedAt: at('2026-10-26T02:00:00'),
          durationMinutes: 60,
        },
      ],
      stock: [
        {
          storeId: 'izh',
          productKey: 'monster',
          productName: 'Monster 0,5',
          quantity: 0,
          snapshotDate: new Date('2026-10-26T00:00:00.000Z'),
        },
        {
          storeId: 'izh',
          productKey: 'lit',
          productName: 'Lit Energy',
          quantity: 1,
          snapshotDate: new Date('2026-10-26T00:00:00.000Z'),
        },
      ],
      stockSales: [
        {
          storeId: 'izh',
          productKey: 'monster',
          productName: '',
          saleDate: new Date(),
          quantity: 28,
          revenue: 0,
          cost: 0,
        },
        {
          storeId: 'izh',
          productKey: 'lit',
          productName: '',
          saleDate: new Date(),
          quantity: 14,
          revenue: 0,
          cost: 0,
        },
      ],
      stockDays: 14,
      oosExcludedProductKeys: new Set(),
      ...overrides,
    };
  }

  it('counts the club day, flags the open shift and compares with the usual day', () => {
    const report = buildDailyReport(input());
    const club = report.clubs[0];

    expect(club.shifts.map((item) => item.id)).toEqual(['day', 'night']);
    expect(club.openShifts).toBe(1);
    // 10 000 + 20 000 − 1 500 + 5 000 (open shift so far).
    expect(club.metrics.shiftRevenue.value).toBe(33500);
    expect(club.metrics.shiftRevenue.usual).toBe(40000);
    expect(club.metrics.shiftRevenue.change).toBeCloseTo(-0.16, 2);
    expect(club.metrics.barRevenue.value).toBe(600);
    expect(club.metrics.barMargin.value).toBe(300);
    expect(club.metrics.visits.value).toBe(3);
    expect(club.metrics.guests.value).toBe(2);
    expect(club.metrics.playHours.value).toBe(4);
    expect(club.topProducts).toEqual([
      { name: 'Monster 0,5', quantity: 3, revenue: 600 },
    ]);
    expect(club.outOfStock.map((item) => item.name)).toEqual(['Monster 0,5']);
    expect(club.runningOut.map((item) => item.name)).toEqual(['Lit Energy']);
    expect(report.alerts[0]).toBe(
      '1337 Ижевск: смена Борис не закрыта (открыта в 21:05)',
    );
    expect(report.alerts).toContain('1337 Ижевск: закончились 1 ходовой товар');
  });

  it('compares admins with the network and with their own usual hour', () => {
    const report = buildDailyReport(input());
    expect(report.admins).toHaveLength(1);
    const anna = report.admins[0];
    expect(anna.name).toBe('Анна');
    expect(anna.revenuePerHour).toBeCloseTo(28500 / 12, 1);
    expect(anna.vsNetwork).toBe(0);
    // Usual 36 000 ₽ / 12 h = 3 000 ₽ per hour.
    expect(anna.vsUsual).toBeCloseTo(28500 / 12 / 3000 - 1, 2);
  });

  it('reports hours without an open shift and a day without shifts', () => {
    const withGap = buildDailyReport(
      input({
        shifts: [
          shift({
            id: 'day',
            startedAt: at('2026-10-25T09:00:00'),
            stoppedAt: at('2026-10-25T21:00:00'),
          }),
          shift({
            id: 'late',
            startedAt: at('2026-10-25T23:00:00'),
            stoppedAt: at('2026-10-26T09:00:00'),
          }),
        ],
      }),
    );
    expect(withGap.clubs[0].uncoveredPeriods).toEqual(['21:00–23:00']);

    const empty = buildDailyReport(input({ shifts: [] }));
    expect(empty.alerts).toContain(
      '1337 Ижевск: за сутки нет ни одной смены в данных',
    );
  });

  it('skips products the owner excluded from out-of-stock signals', () => {
    const report = buildDailyReport(
      input({ oosExcludedProductKeys: new Set(['monster']) }),
    );
    expect(report.clubs[0].outOfStock).toEqual([]);
  });

  it('renders Telegram HTML with escaped names and the commentary first', () => {
    const report = buildDailyReport(
      input({
        stores: [
          {
            id: 'izh',
            name: 'Клуб <1337>',
            timeZone: IZHEVSK,
            computerCount: 10,
            window,
          },
        ],
      }),
    );
    const [summary, club] = renderDailyReport(report, 'Сутки прошли спокойно.');
    expect(summary).toContain('📊 <b>Сутки 25.10 → 26.10</b>');
    expect(summary).toContain('🧠 <b>Разбор</b>\nСутки прошли спокойно.');
    expect(summary).toContain('👤 <b>Админы, ₽ в час</b>');
    expect(summary).not.toContain('Клуб &lt;1337&gt;</b>');
    expect(club).toContain('🏠 <b>Клуб &lt;1337&gt;</b>');
    expect(club).toContain('⚠️ 21:05–не закрыта Борис');
    expect(club).toContain(
      '<blockquote expandable><b>🚫 Закончились (1)</b>\nMonster 0,5</blockquote>',
    );
  });

  it('shortens names and products and marks a club without guest data', () => {
    expect(shortPersonName('Семенова Анастасия Анатольевна')).toBe(
      'Семенова А.',
    );
    expect(shortPersonName('Администратор не определён')).toBe(
      'Администратор не определён',
    );
    expect(
      shortProductName('Энергетический напиток BURN Гуава 500мл ж/б'),
    ).toBe('BURN Гуава 0,5 л');
    expect(
      shortProductName('Негазированная вода AQUA MINERALE Цитрус 1л ПЭТ'),
    ).toBe('AQUA MINERALE Цитрус 1 л');
    expect(shortProductName('Langame product #1052')).toBe(
      'Товар #1052 (нет в каталоге Langame)',
    );
    expect(pluralRu(178, ['гость', 'гостя', 'гостей'])).toBe('гостей');
    expect(pluralRu(22, ['гость', 'гостя', 'гостей'])).toBe('гостя');

    const noGuests = buildDailyReport(input({ sessions: [] }));
    expect(noGuests.alerts).toContain(
      `1337 Ижевск: нет данных о гостях при кассе ${formatRub(33500)}, проверьте сессии в Langame`,
    );
    const [, club] = renderDailyReport(noGuests, null);
    expect(club).toContain('гостей 0 ⚠️ нет данных о гостях');
  });

  it('splits long reports into Telegram-sized messages without cutting sections', () => {
    const sections = ['a'.repeat(3000), 'b'.repeat(3000), 'c'.repeat(100)];
    const messages = packMessages(sections, 3900);
    expect(messages).toEqual([
      'a'.repeat(3000),
      `${'b'.repeat(3000)}\n\n${'c'.repeat(100)}`,
    ]);
  });
});

describe('guest summary', () => {
  const at = (local: string) => new Date(`${local}+04:00`);
  const window = clubDayWindow('2026-10-26', IZHEVSK);

  it('counts new and returning guests, visit length and the peak hour', () => {
    const summary = guestSummary(window, [
      // Came two days ago too: a regular.
      {
        storeId: 'izh',
        guestKey: 'g1',
        startedAt: at('2026-10-23T20:00:00'),
        durationMinutes: 60,
      },
      {
        storeId: 'izh',
        guestKey: 'g1',
        startedAt: at('2026-10-25T20:30:00'),
        durationMinutes: 120,
      },
      // Registered during the day: new.
      {
        storeId: 'izh',
        guestKey: 'g2',
        startedAt: at('2026-10-25T20:45:00'),
        durationMinutes: 60,
        guestRegisteredAt: at('2026-10-25T20:40:00'),
      },
      {
        storeId: 'izh',
        guestKey: 'g3',
        startedAt: at('2026-10-26T01:00:00'),
        durationMinutes: 30,
        guestRegisteredAt: at('2026-01-01T12:00:00'),
      },
    ]);
    expect(summary).toEqual({
      newGuests: 1,
      regulars: 1,
      averageVisitHours: 1.17,
      peakHour: '21:00',
      peakGuests: 2,
    });
  });
});

describe('daily report commentary', () => {
  const at = (local: string) => new Date(`${local}+04:00`);
  const report = buildDailyReport({
    generatedAt: new Date('2026-10-26T07:00:00.000Z'),
    stores: [
      {
        id: 'izh',
        name: '1337 Ижевск',
        timeZone: IZHEVSK,
        computerCount: null,
        window: clubDayWindow('2026-10-26', IZHEVSK),
      },
    ],
    baselineWindows: {},
    shifts: [
      shift({
        id: 'day',
        startedAt: at('2026-10-25T09:00:00'),
        stoppedAt: at('2026-10-26T09:00:00'),
        cash: 45300,
      }),
    ],
    historyShifts: [],
    sales: [],
    sessions: [],
    stock: [],
    stockSales: [],
    stockDays: 14,
    oosExcludedProductKeys: new Set(),
  });

  it('accepts figures from the report and rejects invented ones', () => {
    expect(unknownNumbers('Касса 45 300 ₽ за сутки.', report)).toEqual([]);
    expect(
      unknownNumbers('Касса 52 000 ₽, гостей 120.', report).map(
        (item) => item.raw,
      ),
    ).toEqual(['52 000', '120']);
  });

  function service(env: Record<string, string>) {
    return new DailyReportCommentaryService({
      get: (key: string) => env[key],
    } as never);
  }

  it('stays off without a key and does not call the provider', async () => {
    const fetchImpl = jest.fn();
    const result = await service({}).comment(report, fetchImpl as never);
    expect(result.status).toBe('DISABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks again once when the model invents a figure, then drops the commentary', async () => {
    const answers = ['Касса 99 999 ₽.', 'Касса 88 888 ₽.'];
    const fetchImpl = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: answers.shift() } }],
          }),
      }),
    );
    const result = await service({ DAILY_REPORT_LLM_API_KEY: 'key' }).comment(
      report,
      fetchImpl as never,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('REJECTED');
    expect(result.text).toBeNull();
  });

  it('asks again once when the provider times out, if the caller allows it', async () => {
    const timeout = () =>
      Promise.reject(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
    const answer = () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Касса 45 300 ₽.' } }],
          }),
      });
    const env = { DAILY_REPORT_LLM_API_KEY: 'key' };

    const once = jest.fn().mockImplementationOnce(timeout);
    expect((await service(env).comment(report, once as never)).status).toBe(
      'FAILED',
    );
    expect(once).toHaveBeenCalledTimes(1);

    const twice = jest
      .fn()
      .mockImplementationOnce(timeout)
      .mockImplementationOnce(answer);
    const result = await service(env).comment(report, twice as never, {
      minTimeoutMs: 180_000,
      retryOnFailure: true,
    });
    expect(result.status).toBe('OK');
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it('does not ask again when the provider refuses the request', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('bad key'),
      }),
    );
    const result = await service({ DAILY_REPORT_LLM_API_KEY: 'key' }).comment(
      report,
      fetchImpl as never,
      { retryOnFailure: true },
    );
    expect(result.status).toBe('FAILED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns the commentary from Cloud.ru by default', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: 'Касса 45 300 ₽, спокойные сутки.' } },
            ],
          }),
      }),
    );
    const result = await service({ DAILY_REPORT_LLM_API_KEY: 'key' }).comment(
      report,
      fetchImpl as never,
    );
    expect(result).toEqual({
      status: 'OK',
      text: 'Касса 45 300 ₽, спокойные сутки.',
      model: 'zai-org/GLM-5.1',
    });
    const [url, request] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://foundation-models.api.cloud.ru/v1/chat/completions',
    );
    expect(request.headers.Authorization).toBe('Bearer key');
  });
});
