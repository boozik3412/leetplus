import {
  DailyReportDeliveryService,
  START_LINKED_TEXT,
  START_STOPPED_TEXT,
  START_TEXT,
  moscowClock,
  openShiftRefs,
  renderFollowUp,
} from './daily-report-delivery.service';
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
  TelegramApiError,
  hashLinkCode,
  linkCodeFromText,
  newLinkCode,
  normalizeBotToken,
  sendMessage,
  setBotProfile,
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

  it.each([
    ['a linked chat', [{ enabled: true }], START_LINKED_TEXT],
    ['a chat that sent /stop', [{ enabled: false }], START_STOPPED_TEXT],
    ['an unknown chat', [], START_TEXT],
  ])('answers a bare /start from %s', async (_, linked, expected) => {
    const sent: string[] = [];
    const prisma = {
      dailyReportBot: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'bot',
            tokenCiphertext: 'sealed',
            status: 'READY',
            checkedAt: new Date('2026-10-27T02:30:00Z'),
            updateOffset: BigInt(0),
            refreshedForDate: null,
            refreshedAt: null,
          }),
        ),
        update: jest.fn(() => Promise.resolve({})),
      },
      dailyReportRecipient: {
        findMany: jest.fn(({ where }: { where: { chatId?: string } }) =>
          Promise.resolve(where.chatId === '42' ? linked : []),
        ),
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
    const telegramFetch = jest.fn((url: string, init: { body: string }) => {
      const method = url.split('/').pop();
      if (method === 'sendMessage') {
        sent.push((JSON.parse(init.body) as { text: string }).text);
      }
      const result =
        method === 'getUpdates'
          ? [
              {
                update_id: 5,
                message: {
                  chat: { id: 42, type: 'private' },
                  from: { first_name: 'Никита' },
                  text: '/start',
                },
              },
            ]
          : true;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, result }),
      });
    }) as unknown as typeof fetch;

    // 06:00 MSK: before the refresh and the send window.
    await service.tick(new Date('2026-10-27T03:00:00Z'), { telegramFetch });

    expect(sent).toEqual([expected]);
  });

  it('describes itself and its commands to Telegram', async () => {
    const bodies: Record<string, unknown> = {};
    const fetchImpl = jest.fn((url: string, init: { body: string }) => {
      bodies[url.split('/').pop()!] = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, result: true }),
      });
    }) as unknown as typeof fetch;

    await setBotProfile(fetchImpl, TOKEN);

    expect(Object.keys(bodies)).toEqual([
      'setMyDescription',
      'setMyShortDescription',
      'setMyCommands',
    ]);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(BOT_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
    expect(bodies.setMyCommands).toEqual({ commands: BOT_COMMANDS });
  });
});
