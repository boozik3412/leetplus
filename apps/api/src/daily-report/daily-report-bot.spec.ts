import {
  DailyReportDeliveryService,
  moscowClock,
  openShiftRefs,
  renderFollowUp,
} from './daily-report-delivery.service';
import {
  TelegramApiError,
  hashLinkCode,
  linkCodeFromText,
  newLinkCode,
  normalizeBotToken,
  sendMessage,
  tokenHint,
} from './daily-report-telegram';
import type { DailyReport, DailyReportClub } from './daily-report.types';

const TOKEN = '1234567890:AAH-abcdefghijklmnopqrstuvwxyz012345';

function club(overrides: Partial<DailyReportClub> = {}): DailyReportClub {
  const metric = (value: number) => ({ value, usual: null, change: null });
  return {
    storeId: 'izh',
    name: '1337 Ижевск',
    timeZone: 'Europe/Samara',
    reportDate: '2026-10-26',
    from: '2026-10-25T05:00:00.000Z',
    to: '2026-10-26T05:00:00.000Z',
    shifts: [],
    openShifts: 0,
    uncoveredPeriods: [],
    metrics: {
      shiftRevenue: { value: 54_774, usual: 52_000, change: 0.05 },
      barRevenue: metric(0),
      barMargin: metric(0),
      barItems: metric(0),
      visits: metric(0),
      guests: metric(0),
      playHours: metric(0),
    },
    load: null,
    computerCount: null,
    guestSummary: {
      newGuests: 0,
      regulars: 0,
      averageVisitHours: null,
      peakHour: null,
      peakGuests: 0,
    },
    refunds: 0,
    topProducts: [],
    outOfStock: [],
    runningOut: [],
    stockAsOf: null,
    baselineDays: 7,
    ...overrides,
  };
}

function report(clubs: DailyReportClub[]): DailyReport {
  return {
    generatedAt: '2026-10-26T07:00:00.000Z',
    clubs,
  } as unknown as DailyReport;
}

const shift = {
  id: 's1',
  adminName: 'Дима',
  startedAt: '21:06',
  stoppedAt: null as string | null,
  closed: false,
  hours: 12,
  revenue: 27_408,
  cash: 9_000,
  cashless: 18_408,
  refunds: 0,
  revenuePerHour: null as number | null,
  adminUsualPerHour: null,
};

describe('daily report bot', () => {
  it('reads the Moscow clock for the 10:00 send', () => {
    expect(moscowClock(new Date('2026-10-26T07:05:00.000Z'))).toEqual({
      date: '2026-10-26',
      minutes: 10 * 60 + 5,
    });
    expect(moscowClock(new Date('2026-10-25T21:30:00.000Z'))).toEqual({
      date: '2026-10-26',
      minutes: 30,
    });
  });

  it('validates the BotFather token and never shows it whole', () => {
    expect(normalizeBotToken(`  ${TOKEN} `)).toBe(TOKEN);
    expect(normalizeBotToken('123:short')).toBeNull();
    expect(normalizeBotToken(42)).toBeNull();
    expect(tokenHint(TOKEN)).toBe('1234567890:…2345');
  });

  it('accepts only /start with a link code', () => {
    const code = newLinkCode();
    expect(linkCodeFromText(`/start ${code}`)).toBe(code);
    expect(linkCodeFromText(`/start@LeetPlusReportBot ${code}`)).toBe(code);
    expect(linkCodeFromText('/start')).toBeNull();
    expect(linkCodeFromText('привет')).toBeNull();
    expect(hashLinkCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkCode(code)).not.toContain(code);
  });

  it('remembers open shifts and announces them once closed', () => {
    const morning = report([club({ shifts: [shift], openShifts: 1 })]);
    const refs = openShiftRefs(morning);
    expect(refs).toEqual([
      { shiftId: 's1', storeId: 'izh', reportDate: '2026-10-26' },
    ]);
    expect(renderFollowUp(morning, refs[0])).toBeNull();

    const later = report([
      club({
        shifts: [
          { ...shift, stoppedAt: '09:12', closed: true, revenuePerHour: 2_268 },
        ],
      }),
    ]);
    const text = renderFollowUp(later, refs[0])!;
    expect(text).toContain('1337 Ижевск: смена закрыта');
    expect(text).toContain('Дима 21:06–09:12');
    expect(text).toContain('/ч');
    expect(text).toContain('+5%');
  });

  it('marks chats the bot can no longer write to', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            ok: false,
            description: 'Forbidden: bot was blocked by the user',
          }),
      }),
    ) as unknown as typeof fetch;
    const error = await sendMessage(fetchImpl, TOKEN, '1', 'test').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).chatGone).toBe(true);
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('claims the morning refresh first and stops waiting for a hung one', async () => {
    const calls: string[] = [];
    const prisma = {
      dailyReportBot: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'bot',
            tokenCiphertext: 'sealed',
            status: 'READY',
            checkedAt: new Date('2026-10-26T06:00:00Z'),
            updateOffset: BigInt(0),
            refreshedForDate: null,
            refreshedAt: null,
          }),
        ),
        update: jest.fn(({ data }: { data: object }) => {
          calls.push(`claim ${JSON.stringify(data)}`);
          return Promise.resolve({});
        }),
      },
      dailyReportRecipient: {
        findMany: jest.fn(() => Promise.resolve([{ tenantId: 'demo' }])),
      },
      dailyReportDelivery: { findMany: jest.fn(() => Promise.resolve([])) },
    };
    const service = new DailyReportDeliveryService(
      prisma as never,
      { decrypt: () => TOKEN } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const telegramFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, result: [] }),
      }),
    ) as unknown as typeof fetch;
    const refresh = jest.fn(() => {
      calls.push('refresh');
      return new Promise<void>(() => undefined); // Langame never answers
    });

    // 09:30 MSK: refresh time, before the 10:00 send.
    const result = await service.tick(new Date('2026-10-26T06:30:00Z'), {
      telegramFetch,
      refresh,
      refreshBudgetMs: 20,
    });

    expect(result.failures).toEqual([]);
    expect(calls).toEqual([
      'claim {"refreshedForDate":"2026-10-26","refreshedAt":"2026-10-26T06:30:00.000Z"}',
      'refresh',
    ]);
  });
});
