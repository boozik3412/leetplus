import {
  VISIT_RATING_MAX_PER_RUN,
  findVisitRatingCandidates,
  runVisitRatingAsksOnce,
  visitRatingSourceKey,
  withinVisitRatingHours,
  type VisitRatingCandidate,
} from './guest-visit-rating';

type Row = Record<string, unknown>;

// 10:00 UTC = 15:00 in Yekaterinburg: inside the 11–22 asking hours.
const NOW = new Date('2026-11-12T10:00:00.000Z');
const ZONE = 'Asia/Yekaterinburg';
const logger = { log: jest.fn(), warn: jest.fn() };

function candidate(
  id: string,
  overrides: Partial<VisitRatingCandidate> = {},
): VisitRatingCandidate {
  return {
    sessionId: `session-${id}`,
    guestId: `guest-${id}`,
    storeId: 'store-a',
    storeName: '1337 Радищева',
    stoppedAt: new Date('2026-11-12T08:30:00.000Z'),
    profileId: `profile-${id}`,
    telegramIdentity: `chat:${id}`,
    ...overrides,
  };
}

function prismaMock({
  candidates = [] as VisitRatingCandidate[],
  settings = [
    { tenantId: 'tenant-a', enabledByUserId: 'user-a', lastRunAt: null },
  ] as Row[],
  duplicateSessions = [] as string[],
} = {}) {
  const tx = {
    guestVisitRating: {
      createManyAndReturn: jest
        .fn()
        .mockImplementation(({ data }: { data: Row[] }) =>
          Promise.resolve(
            data
              .filter(
                (row) =>
                  !duplicateSessions.includes(row.guestSessionId as string),
              )
              .map((row) => ({ id: row.id })),
          ),
        ),
    },
    guestTelegramOutboxMessage: {
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: Row[] }) =>
          Promise.resolve({ count: data.length }),
        ),
    },
  };
  return {
    tx,
    $queryRaw: jest.fn().mockResolvedValue(candidates),
    $transaction: jest
      .fn()
      .mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    guestVisitRating: {},
    guestVisitRatingSettings: {
      findMany: jest.fn().mockResolvedValue(settings),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestTelegramOutboxMessage: {},
    store: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ name: 'Радищева', timeZone: ZONE }]),
    },
  };
}

const allowed = () => ({
  evaluate: jest.fn().mockResolvedValue({ allowed: true }),
});

describe('visit ratings', () => {
  it('asks only in the club daytime', () => {
    expect(withinVisitRatingHours(NOW, ZONE)).toBe(true);
    // 05:00 and 22:30 local.
    expect(
      withinVisitRatingHours(new Date('2026-11-12T00:00:00.000Z'), ZONE),
    ).toBe(false);
    expect(
      withinVisitRatingHours(new Date('2026-11-12T17:30:00.000Z'), ZONE),
    ).toBe(false);
  });

  it('keeps one question per chat and caps the run', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          candidate('1'),
          candidate('2', { telegramIdentity: 'chat:1' }),
          candidate('3'),
        ]),
    };

    const rows = await findVisitRatingCandidates(prisma as never, {
      tenantId: 'tenant-a',
      now: NOW,
      limit: 1,
    });

    expect(rows.map((row) => row.profileId)).toEqual(['profile-1']);
  });

  it('stores the question and queues the bot message with 1–5 buttons', async () => {
    const prisma = prismaMock({ candidates: [candidate('1')] });
    const admission = allowed();

    const result = await runVisitRatingAsksOnce(
      { prisma: prisma as never, admission },
      NOW,
      logger,
    );

    expect(result).toEqual({ tenants: 1, queued: 1, failed: [] });
    expect(admission.evaluate).toHaveBeenCalledWith(
      'tenant-a',
      [{ module: 'COMMUNICATIONS', action: 'OUTBOUND' }],
      NOW,
    );
    const ratingCalls = prisma.tx.guestVisitRating.createManyAndReturn.mock
      .calls as Array<[{ data: Row[]; skipDuplicates: boolean }]>;
    const ratingCall = ratingCalls[0][0];
    expect(ratingCall.skipDuplicates).toBe(true);
    expect(ratingCall.data).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        profileId: 'profile-1',
        guestId: 'guest-1',
        guestSessionId: 'session-1',
        visitEndedAt: new Date('2026-11-12T08:30:00.000Z'),
        askedAt: NOW,
      }),
    ]);
    const ratingId = ratingCall.data[0].id as string;
    expect(
      prisma.tx.guestTelegramOutboxMessage.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-a',
          storeId: 'store-a',
          profileId: 'profile-1',
          kind: 'VISIT_RATING',
          sourceKey: visitRatingSourceKey(ratingId),
          text: expect.stringContaining('в клубе «1337 Радищева»') as string,
          replyMarkup: {
            inline_keyboard: [
              [1, 2, 3, 4, 5].map((score) => ({
                text: String(score),
                callback_data: `bot:rate:${ratingId}:${score}`,
              })),
            ],
          },
          createdByUserId: 'user-a',
          nextAttemptAt: NOW,
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.guestVisitRatingSettings.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', enabled: true },
      data: { lastRunAt: NOW },
    });
  });

  it('does not queue a message for a session asked about meanwhile', async () => {
    const prisma = prismaMock({
      candidates: [candidate('1'), candidate('2')],
      duplicateSessions: ['session-1'],
    });

    const result = await runVisitRatingAsksOnce(
      { prisma: prisma as never, admission: allowed() },
      NOW,
      logger,
    );

    expect(result.queued).toBe(1);
    const outboxCalls = prisma.tx.guestTelegramOutboxMessage.createMany.mock
      .calls as Array<[{ data: Row[] }]>;
    const outbox = outboxCalls[0][0];
    expect(outbox.data.map((row) => row.profileId)).toEqual(['profile-2']);
  });

  it.each([
    [
      'ran less than 5 minutes ago',
      {
        at: NOW,
        lastRunAt: new Date('2026-11-12T09:57:00.000Z'),
        allowed: true,
      },
    ],
    [
      'it is night in the club',
      {
        at: new Date('2026-11-12T19:00:00.000Z'),
        lastRunAt: null,
        allowed: true,
      },
    ],
    ['outbound messages are off', { at: NOW, lastRunAt: null, allowed: false }],
  ])(
    'skips the network when it %s',
    async (_name, { at, lastRunAt, allowed }) => {
      const prisma = prismaMock({
        candidates: [candidate('1')],
        settings: [{ tenantId: 'tenant-a', enabledByUserId: null, lastRunAt }],
      });

      const result = await runVisitRatingAsksOnce(
        {
          prisma: prisma as never,
          admission: { evaluate: jest.fn().mockResolvedValue({ allowed }) },
        },
        at,
        logger,
      );

      expect(result.queued).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('keeps going when one network fails', async () => {
    const prisma = prismaMock({
      settings: [
        { tenantId: 'tenant-x', enabledByUserId: null, lastRunAt: null },
        { tenantId: 'tenant-a', enabledByUserId: null, lastRunAt: null },
      ],
    });
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([candidate('1')]);

    const result = await runVisitRatingAsksOnce(
      { prisma: prisma as never, admission: allowed() },
      NOW,
      logger,
    );

    expect(result).toEqual({ tenants: 2, queued: 1, failed: ['tenant-x'] });
  });

  it('caps the run at the per-run limit', async () => {
    const prisma = prismaMock();
    await runVisitRatingAsksOnce(
      { prisma: prisma as never, admission: allowed() },
      NOW,
      logger,
    );
    const sql = prisma.$queryRaw.mock.calls[0] as unknown[];
    expect(sql).toContain(VISIT_RATING_MAX_PER_RUN * 2);
  });
});
