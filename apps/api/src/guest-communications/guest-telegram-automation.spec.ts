import {
  TELEGRAM_AUTOMATION_MAX_PER_RUN,
  automationSourceKey,
  localHour,
  rewardNote,
  runTelegramAutomationsOnce,
  selectAutomationRecipients,
  storedAutomation,
  withinSendHours,
  type AutomationCampaign,
  type TelegramAutomationCandidate,
} from './guest-telegram-automation';

type Row = Record<string, unknown>;

// 10:00 UTC = 15:00 in Yekaterinburg: inside the 12–21 sending hours.
const NOW = new Date('2026-11-12T10:00:00.000Z');
const ZONE = 'Asia/Yekaterinburg';

function candidate(
  id: string,
  overrides: Partial<TelegramAutomationCandidate> = {},
): TelegramAutomationCandidate {
  return {
    profileId: id,
    guestId: `guest-${id}`,
    telegramIdentity: `chat:${id}`,
    phoneConsentStatus: 'GRANTED',
    promoConsentStatus: 'UNKNOWN',
    episodeKey: 'visit-2026-10-20',
    note: null,
    ...overrides,
  };
}

function prismaMock({
  candidates = [] as Row[],
  sent = [] as Row[],
  recent = [] as Row[],
} = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(candidates),
    $executeRaw: jest.fn().mockResolvedValue(1),
    store: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ name: 'Ленина', timeZone: ZONE }]),
    },
    marketingCampaign: {},
    guestTelegramOutboxMessage: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: Row }) =>
          Promise.resolve(where.sourceKey ? sent : recent),
        ),
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: Row[] }) =>
          Promise.resolve({ count: data.length }),
        ),
    },
  };
}

function campaign(overrides: Partial<AutomationCampaign> = {}) {
  return {
    id: 'campaign-a',
    tenantId: 'tenant-a',
    storeIds: ['store-a'],
    createdByUserId: 'user-creator',
    promo: false,
    automation: {
      trigger: 'LAPSED',
      days: 21,
      enabled: true,
      enabledAt: '2026-11-10T10:00:00.000Z',
      enabledByUserId: 'user-a',
      lastRunAt: null,
      lastQueued: null,
    },
    message: (note: string | null) => ({
      text: note ? `Мы скучаем\n\n${note}` : 'Мы скучаем',
      replyMarkup: { inline_keyboard: [] },
      kind: 'CAMPAIGN_NEWS' as const,
    }),
    ...overrides,
  } satisfies AutomationCampaign;
}

const logger = { log: jest.fn(), warn: jest.fn() };

function candidateRow(id: string, overrides: Row = {}) {
  return {
    profileId: id,
    guestId: `guest-${id}`,
    telegramIdentity: `chat:${id}`,
    phoneConsentStatus: 'GRANTED',
    promoConsentStatus: 'UNKNOWN',
    episodeAt: new Date('2026-10-20T15:00:00.000Z'),
    walletItemId: null,
    rewardTitle: null,
    expiresAt: null,
    ...overrides,
  };
}

describe('Telegram automations', () => {
  it('reads only a valid stored rule and falls back to the default days', () => {
    expect(storedAutomation({})).toBeNull();
    expect(
      storedAutomation({ automation: { trigger: 'SPAM', enabled: true } }),
    ).toBeNull();
    expect(
      storedAutomation({
        automation: { trigger: 'NO_SECOND_VISIT', days: 999, enabled: true },
      }),
    ).toMatchObject({ trigger: 'NO_SECOND_VISIT', days: 7, enabled: true });
  });

  it('queues only in the club daytime', () => {
    expect(localHour(NOW, ZONE)).toBe(15);
    expect(withinSendHours(NOW, ZONE)).toBe(true);
    expect(withinSendHours(new Date('2026-11-12T03:00:00.000Z'), ZONE)).toBe(
      false,
    );
    expect(withinSendHours(new Date('2026-11-12T16:00:00.000Z'), ZONE)).toBe(
      false,
    );
  });

  it('names the expiring reward and its last day', () => {
    expect(
      rewardNote('Кейс «Лето»', new Date('2026-11-14T18:59:00.000Z'), ZONE),
    ).toBe('Ваша награда «Кейс «Лето»» доступна до 14.11.');
    expect(rewardNote(null, new Date('2026-11-14T19:30:00.000Z'), ZONE)).toBe(
      'Ваша награда доступна до 15.11.',
    );
  });

  it('explains who of the matching guests will not get the message', async () => {
    const prisma = prismaMock({
      sent: [
        {
          sourceKey: automationSourceKey(
            'campaign-a',
            'visit-2026-10-20',
            'p1',
          ),
        },
      ],
      recent: [{ profileId: 'p4' }],
    });

    const { recipients, reach } = await selectAutomationRecipients(
      prisma as never,
      {
        tenantId: 'tenant-a',
        campaignId: 'campaign-a',
        trigger: 'LAPSED',
        promo: true,
        candidates: [
          candidate('p1', { promoConsentStatus: 'GRANTED' }),
          candidate('p2', { phoneConsentStatus: 'UNSUBSCRIBED' }),
          candidate('p3'),
          candidate('p4', { promoConsentStatus: 'GRANTED' }),
          candidate('p5', { promoConsentStatus: 'GRANTED' }),
        ],
        now: NOW,
      },
    );

    expect(reach).toEqual({
      matching: 5,
      alreadySent: 1,
      unsubscribed: 1,
      noPromoConsent: 1,
      recentlyMessaged: 1,
      willReceive: 1,
    });
    expect(recipients.map((recipient) => recipient.profileId)).toEqual(['p5']);
    expect(prisma.guestTelegramOutboxMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: { in: ['CAMPAIGN_NEWS', 'CAMPAIGN_PROMO'] },
          createdAt: { gte: new Date('2026-11-09T10:00:00.000Z') },
        }) as Row,
      }),
    );
  });

  it('does not hold a reward reminder back by the frequency cap', async () => {
    const prisma = prismaMock({ recent: [{ profileId: 'p1' }] });

    const { recipients } = await selectAutomationRecipients(prisma as never, {
      tenantId: 'tenant-a',
      campaignId: 'campaign-a',
      trigger: 'REWARD_EXPIRING',
      promo: false,
      candidates: [candidate('p1', { episodeKey: 'reward-w1' })],
      now: NOW,
    });

    expect(recipients).toHaveLength(1);
    expect(prisma.guestTelegramOutboxMessage.findMany).toHaveBeenCalledTimes(1);
  });

  it('queues one message per new episode and marks the run', async () => {
    const prisma = prismaMock({
      candidates: [
        candidateRow('p1'),
        candidateRow('p2'),
        // Same chat as p1: one message per chat.
        candidateRow('p3', { telegramIdentity: 'chat:p1' }),
      ],
    });
    const admission = {
      evaluate: jest.fn().mockResolvedValue({ allowed: true }),
    };

    const result = await runTelegramAutomationsOnce(
      {
        prisma: prisma as never,
        admission,
        loadCampaigns: () => Promise.resolve([campaign()]),
      },
      NOW,
      logger,
    );

    expect(result).toEqual({ campaigns: 1, queued: 2, failed: [] });
    expect(prisma.guestTelegramOutboxMessage.createMany).toHaveBeenCalledWith({
      data: ['p1', 'p2'].map((profileId) => ({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        profileId,
        kind: 'CAMPAIGN_NEWS',
        sourceKey: automationSourceKey(
          'campaign-a',
          'visit-2026-10-20',
          profileId,
        ),
        text: 'Мы скучаем',
        replyMarkup: { inline_keyboard: [] },
        marketingCampaignId: 'campaign-a',
        createdByUserId: 'user-a',
        nextAttemptAt: NOW,
      })),
      skipDuplicates: true,
    });
    expect(admission.evaluate).toHaveBeenCalledWith(
      'tenant-a',
      [{ module: 'COMMUNICATIONS', action: 'OUTBOUND' }],
      NOW,
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('adds the expiring reward line for a reward reminder', async () => {
    const prisma = prismaMock({
      candidates: [
        candidateRow('p1', {
          episodeAt: null,
          walletItemId: 'w1',
          rewardTitle: 'Час игры',
          expiresAt: new Date('2026-11-14T10:00:00.000Z'),
        }),
      ],
    });

    await runTelegramAutomationsOnce(
      {
        prisma: prisma as never,
        admission: { evaluate: jest.fn().mockResolvedValue({ allowed: true }) },
        loadCampaigns: () =>
          Promise.resolve([
            campaign({
              automation: {
                ...campaign().automation,
                trigger: 'REWARD_EXPIRING',
                days: 3,
              },
            }),
          ]),
      },
      NOW,
      logger,
    );

    expect(prisma.guestTelegramOutboxMessage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            sourceKey: automationSourceKey('campaign-a', 'reward-w1', 'p1'),
            text: 'Мы скучаем\n\nВаша награда «Час игры» доступна до 14.11.',
          }) as Row,
        ],
      }),
    );
  });

  it.each([
    [
      'ran less than 30 minutes ago',
      { at: NOW, lastRunAt: '2026-11-12T09:45:00.000Z', allowed: true },
    ],
    [
      'it is night in the club',
      {
        at: new Date('2026-11-12T20:00:00.000Z'),
        lastRunAt: null,
        allowed: true,
      },
    ],
    ['outbound messages are off', { at: NOW, lastRunAt: null, allowed: false }],
  ])(
    'skips the campaign when it %s',
    async (_name, { at, lastRunAt, allowed }) => {
      const prisma = prismaMock({ candidates: [candidateRow('p1')] });

      const result = await runTelegramAutomationsOnce(
        {
          prisma: prisma as never,
          admission: { evaluate: jest.fn().mockResolvedValue({ allowed }) },
          loadCampaigns: () =>
            Promise.resolve([
              campaign({
                automation: { ...campaign().automation, lastRunAt },
              }),
            ]),
        },
        at,
        logger,
      );

      expect(result.queued).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(
        prisma.guestTelegramOutboxMessage.createMany,
      ).not.toHaveBeenCalled();
    },
  );

  it('caps one run and leaves the rest for the next one', async () => {
    const rows = Array.from(
      { length: TELEGRAM_AUTOMATION_MAX_PER_RUN + 5 },
      (_, index) => candidateRow(`p${index}`),
    );
    const prisma = prismaMock({ candidates: rows });

    const result = await runTelegramAutomationsOnce(
      {
        prisma: prisma as never,
        admission: { evaluate: jest.fn().mockResolvedValue({ allowed: true }) },
        loadCampaigns: () => Promise.resolve([campaign()]),
      },
      NOW,
      logger,
    );

    expect(result.queued).toBe(TELEGRAM_AUTOMATION_MAX_PER_RUN);
  });

  it('keeps going when one campaign fails', async () => {
    const prisma = prismaMock({ candidates: [candidateRow('p1')] });
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([candidateRow('p1')]);

    const result = await runTelegramAutomationsOnce(
      {
        prisma: prisma as never,
        admission: { evaluate: jest.fn().mockResolvedValue({ allowed: true }) },
        loadCampaigns: () =>
          Promise.resolve([campaign({ id: 'campaign-x' }), campaign()]),
      },
      NOW,
      logger,
    );

    expect(result).toEqual({
      campaigns: 2,
      queued: 1,
      failed: ['campaign-x'],
    });
  });
});
