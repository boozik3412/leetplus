import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  GuestTelegramCampaignService,
  campaignSourceKey,
  composeMessage,
  parseDraft,
} from './guest-telegram-campaign.service';

type Row = Record<string, unknown>;

const NOW = new Date('2026-11-12T10:00:00.000Z');
const user = { id: 'user-a', tenantId: 'tenant-a' } as AuthenticatedUser;

function profile(id: string, overrides: Row = {}) {
  return {
    id,
    guestId: `guest-${id}`,
    telegramIdentity: `chat:${id}`,
    phoneConsentStatus: 'GRANTED',
    promoConsentStatus: 'UNKNOWN',
    ...overrides,
  };
}

type FixtureOptions = {
  telegram?: Row | null;
  audienceId?: string | null;
  storeIds?: unknown;
  members?: Row[];
  profiles?: Row[];
  outboxRows?: Row[];
  allowed?: boolean;
  status?: string;
  candidates?: Row[];
};

function fixture({
  telegram = null,
  audienceId = 'audience-a',
  storeIds = ['store-a'],
  members = ['p1', 'p2'].map((id) => ({ guestId: `guest-${id}` })),
  profiles = [profile('p1'), profile('p2')],
  outboxRows = [],
  allowed = true,
  status = 'DRAFT',
  candidates = [],
}: FixtureOptions = {}) {
  const campaign = {
    id: 'campaign-a',
    tenantId: 'tenant-a',
    status,
    periodFrom: null,
    periodTo: null,
    audienceId,
    storeIds,
    mechanicConfig: telegram ? { telegram } : {},
    audience: audienceId ? { id: audienceId, name: 'Давно не были' } : null,
    tenant: { name: 'Сеть клубов' },
  };
  const prisma = {
    marketingCampaign: {
      findFirst: jest.fn().mockResolvedValue(campaign),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestAudienceMember: { findMany: jest.fn().mockResolvedValue(members) },
    guestGameProfile: { findMany: jest.fn().mockResolvedValue(profiles) },
    guestTelegramOutboxMessage: {
      findMany: jest.fn().mockResolvedValue(outboxRows),
      groupBy: jest.fn().mockResolvedValue([]),
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: Row[] }) =>
          Promise.resolve({ count: data.length }),
        ),
    },
    store: {
      findFirst: jest.fn().mockResolvedValue({ name: 'Ленина' }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { name: 'Ленина', timeZone: 'Asia/Yekaterinburg' },
        ]),
    },
    $queryRaw: jest.fn().mockResolvedValue(candidates),
  };
  const admission = { evaluate: jest.fn().mockResolvedValue({ allowed }) };
  const service = new GuestTelegramCampaignService(
    prisma as never,
    admission as never,
  );
  return { service, prisma, admission, campaign };
}

const newsDraft = {
  type: 'NEWS',
  text: 'В субботу турнир по CS2',
  buttonText: null,
  buttonUrl: null,
};

describe('GuestTelegramCampaignService', () => {
  describe('parseDraft', () => {
    it('trims the text and keeps an optional https button', () => {
      expect(
        parseDraft({
          type: 'PROMO',
          text: '  Скидка 20%  ',
          buttonText: ' Подробнее ',
          buttonUrl: 'https://leetplus.ru/promo',
        }),
      ).toEqual({
        type: 'PROMO',
        text: 'Скидка 20%',
        buttonText: 'Подробнее',
        buttonUrl: 'https://leetplus.ru/promo',
      });
    });

    it.each([
      ['an unknown type', { type: 'SPAM', text: 'x' }],
      ['an empty text', { type: 'NEWS', text: '   ' }],
      ['a too long text', { type: 'NEWS', text: 'я'.repeat(1501) }],
      [
        'a button without a link',
        { type: 'NEWS', text: 'x', buttonText: 'Кнопка' },
      ],
      [
        'a non-https link',
        {
          type: 'NEWS',
          text: 'x',
          buttonText: 'Кнопка',
          buttonUrl: 'http://example.com',
        },
      ],
    ])('rejects %s', (_name, dto) => {
      expect(() => parseDraft(dto)).toThrow(BadRequestException);
    });
  });

  it('composes the message with the club signature and an opt-out button', () => {
    expect(
      composeMessage(
        {
          type: 'PROMO',
          text: 'Скидка',
          buttonText: 'Подробнее',
          buttonUrl: 'https://leetplus.ru/',
        },
        'Клуб «Ленина»',
      ),
    ).toEqual({
      text: 'Скидка\n\n— Клуб «Ленина»',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'Подробнее', url: 'https://leetplus.ru/' }],
          [{ text: 'Не присылать акции', callback_data: 'bot:promo:no' }],
        ],
      },
    });
    expect(
      composeMessage({ ...newsDraft, type: 'NEWS' } as never, 'Сеть')
        .replyMarkup.inline_keyboard,
    ).toEqual([[{ text: 'Отписаться', callback_data: 'bot:unsubscribe' }]]);
  });

  it('does not show another network’s campaign', async () => {
    const { service, prisma } = fixture();
    prisma.marketingCampaign.findFirst.mockResolvedValue(null);

    await expect(service.get(user, 'campaign-b', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.marketingCampaign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'campaign-b', tenantId: 'tenant-a' },
      }),
    );
  });

  it('saves the draft into the campaign and shows the preview', async () => {
    const { service, prisma } = fixture();

    const result = await service.saveDraft(user, 'campaign-a', newsDraft, NOW);

    expect(prisma.marketingCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-a', tenantId: 'tenant-a' },
      data: {
        mechanicConfig: {
          telegram: { ...newsDraft, updatedAt: NOW.toISOString() },
        },
      },
    });
    expect(result.signature).toBe('Клуб «Ленина»');
    expect(result.preview).toEqual({
      text: 'В субботу турнир по CS2\n\n— Клуб «Ленина»',
      buttons: ['Отписаться'],
    });
    expect(result.reach.willReceive).toBe(2);
  });

  it('signs with the network name when the campaign covers several clubs', async () => {
    const { service } = fixture({
      telegram: newsDraft,
      storeIds: ['store-a', 'store-b'],
    });

    await expect(service.get(user, 'campaign-a', NOW)).resolves.toMatchObject({
      signature: 'Сеть клубов',
    });
  });

  it('explains who will not receive the message and why', async () => {
    const { service, prisma } = fixture({
      telegram: { ...newsDraft, type: 'PROMO' },
      members: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id) => ({
        guestId: `guest-${id}`,
      })),
      profiles: [
        profile('p1', { promoConsentStatus: 'GRANTED' }),
        profile('p2', { phoneConsentStatus: 'UNSUBSCRIBED' }),
        profile('p3'),
        profile('p4', { promoConsentStatus: 'GRANTED' }),
        profile('p5', { promoConsentStatus: 'GRANTED' }),
        // Second profile of the same guest: one message per guest.
        profile('p1b', {
          guestId: 'guest-p1',
          telegramIdentity: 'chat:other',
          promoConsentStatus: 'GRANTED',
        }),
      ],
      outboxRows: [
        { profileId: 'p4', marketingCampaignId: 'campaign-other' },
        { profileId: 'p5', marketingCampaignId: 'campaign-a' },
      ],
    });

    const result = await service.get(user, 'campaign-a', NOW);

    expect(result.reach).toEqual({
      audienceTotal: 7,
      withTelegram: 5,
      unsubscribed: 1,
      noPromoConsent: 1,
      recentlyMessaged: 1,
      alreadyQueued: 1,
      willReceive: 1,
    });
    expect(prisma.guestTelegramOutboxMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { marketingCampaignId: 'campaign-a' },
            {
              status: { in: ['QUEUED', 'SENDING', 'SENT'] },
              createdAt: { gte: new Date('2026-11-09T10:00:00.000Z') },
            },
          ],
        }) as Row,
      }),
    );
  });

  it('sends news to guests who did not agree to promos', async () => {
    const { service } = fixture({ telegram: newsDraft });

    await expect(service.get(user, 'campaign-a', NOW)).resolves.toMatchObject({
      reach: { noPromoConsent: 0, willReceive: 2 },
    });
  });

  it('queues one message per guest with a stable key and remembers the launch', async () => {
    const { service, prisma } = fixture({ telegram: newsDraft });

    const result = await service.send(user, 'campaign-a', NOW);

    expect(prisma.guestTelegramOutboxMessage.createMany).toHaveBeenCalledWith({
      data: ['p1', 'p2'].map((profileId) => ({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        profileId,
        kind: 'CAMPAIGN_NEWS',
        sourceKey: campaignSourceKey('campaign-a', profileId),
        text: 'В субботу турнир по CS2\n\n— Клуб «Ленина»',
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'Отписаться', callback_data: 'bot:unsubscribe' }],
          ],
        },
        marketingCampaignId: 'campaign-a',
        createdByUserId: 'user-a',
        nextAttemptAt: NOW,
      })),
      skipDuplicates: true,
    });
    expect(prisma.marketingCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-a', tenantId: 'tenant-a' },
      data: {
        mechanicConfig: {
          telegram: {
            ...newsDraft,
            lastSentAt: NOW.toISOString(),
            lastSentByUserId: 'user-a',
            lastQueued: 2,
          },
        },
      },
    });
    expect(result).toMatchObject({ queued: 2, lastQueued: 2 });
  });

  it('marks a promo send with its own kind', async () => {
    const { service, prisma } = fixture({
      telegram: { ...newsDraft, type: 'PROMO' },
      profiles: [profile('p1', { promoConsentStatus: 'GRANTED' })],
    });

    await service.send(user, 'campaign-a', NOW);

    expect(prisma.guestTelegramOutboxMessage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ kind: 'CAMPAIGN_PROMO' }) as Row],
      }),
    );
  });

  it.each([
    ['there is no saved text', { telegram: null }],
    [
      'the campaign has no guest group',
      { telegram: newsDraft, audienceId: null },
    ],
    ['outbound messages are off', { telegram: newsDraft, allowed: false }],
    ['nobody is reachable', { telegram: newsDraft, profiles: [] }],
  ])('refuses to send when %s', async (_name, options) => {
    const { service, prisma } = fixture(options);

    await expect(service.send(user, 'campaign-a', NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.guestTelegramOutboxMessage.createMany).not.toHaveBeenCalled();
  });

  it('checks outbound admission for the campaign network', async () => {
    const { service, admission } = fixture({ telegram: newsDraft });

    await service.send(user, 'campaign-a', NOW);

    expect(admission.evaluate).toHaveBeenCalledWith(
      'tenant-a',
      [{ module: 'COMMUNICATIONS', action: 'OUTBOUND' }],
      NOW,
    );
  });

  describe('automatic rule', () => {
    const automation = {
      trigger: 'LAPSED',
      days: 21,
      enabled: true,
      enabledAt: '2026-11-11T10:00:00.000Z',
      enabledByUserId: 'user-a',
    };

    it('switches the rule on and starts a draft campaign', async () => {
      const { service, prisma, admission } = fixture({ telegram: newsDraft });

      const result = await service.saveAutomation(
        user,
        'campaign-a',
        { trigger: 'LAPSED', days: 30, enabled: true },
        NOW,
      );

      expect(admission.evaluate).toHaveBeenCalled();
      expect(prisma.marketingCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-a', tenantId: 'tenant-a' },
        data: {
          status: 'RUNNING',
          mechanicConfig: {
            telegram: {
              ...newsDraft,
              automation: {
                trigger: 'LAPSED',
                days: 30,
                enabled: true,
                enabledAt: NOW.toISOString(),
                enabledByUserId: 'user-a',
              },
            },
          },
        },
      });
      expect(result).toMatchObject({
        campaignStatus: 'RUNNING',
        automation: {
          trigger: 'LAPSED',
          days: 30,
          enabled: true,
          campaignRunning: true,
          reach: { matching: 0, willReceive: 0 },
        },
      });
    });

    it.each([
      ['there is no saved text', { telegram: null }],
      ['outbound messages are off', { telegram: newsDraft, allowed: false }],
      ['the campaign is finished', { telegram: newsDraft, status: 'FINISHED' }],
    ])('refuses to switch it on when %s', async (_name, options) => {
      const { service, prisma } = fixture(options);

      await expect(
        service.saveAutomation(
          user,
          'campaign-a',
          { trigger: 'LAPSED', enabled: true },
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.marketingCampaign.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      [{ trigger: 'SPAM' }],
      [{ trigger: 'LAPSED', days: 3 }],
      [{ trigger: 'REWARD_EXPIRING', days: 30 }],
      [{ trigger: 'LAPSED', enabled: 'yes' }],
    ])('rejects invalid settings %j', async (dto) => {
      const { service } = fixture({ telegram: newsDraft });

      await expect(
        service.saveAutomation(user, 'campaign-a', dto, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('shows who matches the rule now instead of the guest group', async () => {
      const { service, prisma } = fixture({
        telegram: { ...newsDraft, automation },
        status: 'RUNNING',
        candidates: [
          {
            profileId: 'p1',
            guestId: 'guest-p1',
            telegramIdentity: 'chat:p1',
            phoneConsentStatus: 'GRANTED',
            promoConsentStatus: 'UNKNOWN',
            episodeAt: new Date('2026-10-20T10:00:00.000Z'),
            walletItemId: null,
            rewardTitle: null,
            expiresAt: null,
          },
        ],
      });

      const result = await service.get(user, 'campaign-a', NOW);

      expect(result.automation).toMatchObject({
        trigger: 'LAPSED',
        enabled: true,
        campaignRunning: true,
        timeZone: 'Asia/Yekaterinburg',
        sendHours: { from: 12, to: 21 },
        reach: { matching: 1, willReceive: 1 },
      });
      expect(prisma.guestAudienceMember.findMany).not.toHaveBeenCalled();
    });

    it('does not send by hand while the rule is on', async () => {
      const { service, prisma } = fixture({
        telegram: { ...newsDraft, automation },
        status: 'RUNNING',
      });

      await expect(
        service.send(user, 'campaign-a', NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        prisma.guestTelegramOutboxMessage.createMany,
      ).not.toHaveBeenCalled();
    });

    it('goes back to a one-off send only after the rule is off', async () => {
      const off = fixture({
        telegram: {
          ...newsDraft,
          automation: { ...automation, enabled: false },
        },
        status: 'RUNNING',
      });
      await off.service.saveAutomation(
        user,
        'campaign-a',
        { trigger: null },
        NOW,
      );
      expect(off.prisma.marketingCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-a', tenantId: 'tenant-a' },
        data: { mechanicConfig: { telegram: newsDraft } },
      });
    });

    it('switches the rule off and keeps it while it is on', async () => {
      const { service, prisma } = fixture({
        telegram: { ...newsDraft, automation },
        status: 'RUNNING',
      });

      await service.saveAutomation(user, 'campaign-a', { enabled: false }, NOW);
      expect(prisma.marketingCampaign.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'campaign-a', tenantId: 'tenant-a' },
        data: {
          mechanicConfig: {
            telegram: {
              ...newsDraft,
              automation: {
                ...automation,
                enabled: false,
                disabledAt: NOW.toISOString(),
                disabledByUserId: 'user-a',
              },
            },
          },
        },
      });

      await expect(
        service.saveAutomation(user, 'campaign-a', { trigger: null }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
