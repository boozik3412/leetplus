import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantModule } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionService,
  type TenantExecutionRequirement,
} from '../tenancy/tenant-execution-admission.service';
import {
  TELEGRAM_AUTOMATION_CAMPAIGN_STATUS,
  TELEGRAM_AUTOMATION_DAYS,
  TELEGRAM_AUTOMATION_SEND_HOURS,
  automationTimeZone,
  findAutomationCandidates,
  isTelegramAutomationTrigger,
  runningAutomationWhere,
  selectAutomationRecipients,
  storedAutomation,
  stringArray,
  type AutomationCampaign,
  type TelegramAutomationReach,
  type TelegramAutomationSettings,
  type TelegramAutomationTrigger,
} from './guest-telegram-automation';
import {
  GUEST_TELEGRAM_OUTBOX_TEXT_MAX,
  type GuestTelegramOutboxKind,
} from './guest-telegram-outbox.service';

// A marketing campaign sent to its guest group through the guest Telegram bot.
// The cabinet only queues GuestTelegramOutboxMessage rows; the bot poller sends
// them. Club news goes to every reachable guest who has not unsubscribed;
// promotions only to guests who said yes in the bot («Акции клуба»).

export const TELEGRAM_CAMPAIGN_TYPES = ['NEWS', 'PROMO'] as const;
export type TelegramCampaignType = (typeof TELEGRAM_CAMPAIGN_TYPES)[number];

export const TELEGRAM_CAMPAIGN_TEXT_MAX = 1500;
const BUTTON_TEXT_MAX = 40;
const BUTTON_URL_MAX = 500;
// One campaign message per guest in three days, across all campaigns.
export const TELEGRAM_CAMPAIGN_FREQUENCY_MS = 3 * 24 * 60 * 60 * 1000;
export const TELEGRAM_CAMPAIGN_MAX_RECIPIENTS = 10_000;
const IN_CHUNK = 1000;

const SEND_REQUIREMENTS = [
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const satisfies readonly TenantExecutionRequirement[];

const UNREACHABLE_PROFILE_STATUSES = [
  'ARCHIVED',
  'SUPERSEDED',
  'MERGED_TELEGRAM_AUTH',
  'PENDING_TELEGRAM_AUTH',
];
const OPTED_OUT = new Set(['UNSUBSCRIBED', 'DENIED']);
const LIVE_OUTBOX_STATUSES = ['QUEUED', 'SENDING', 'SENT'];

export type TelegramCampaignDraft = {
  type: TelegramCampaignType;
  text: string;
  buttonText: string | null;
  buttonUrl: string | null;
};

export type TelegramCampaignDraftDto = {
  type?: unknown;
  text?: unknown;
  buttonText?: unknown;
  buttonUrl?: unknown;
};

export type TelegramCampaignReach = {
  audienceTotal: number;
  withTelegram: number;
  unsubscribed: number;
  noPromoConsent: number;
  recentlyMessaged: number;
  alreadyQueued: number;
  willReceive: number;
};

export type TelegramCampaignDelivery = {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
};

export type TelegramAutomationDto = {
  trigger?: unknown;
  days?: unknown;
  enabled?: unknown;
};

export type MarketingCampaignTelegramAutomation = {
  trigger: TelegramAutomationTrigger;
  days: number;
  enabled: boolean;
  enabledAt: string | null;
  lastRunAt: string | null;
  lastQueued: number | null;
  // Who matches the rule right now and who of them would get the message.
  reach: TelegramAutomationReach;
  campaignRunning: boolean;
  sendHours: { from: number; to: number };
  timeZone: string;
};

export type MarketingCampaignTelegram = {
  campaignId: string;
  campaignStatus: string;
  audience: { id: string; name: string } | null;
  draft: TelegramCampaignDraft | null;
  signature: string;
  preview: { text: string; buttons: string[] } | null;
  reach: TelegramCampaignReach;
  delivery: TelegramCampaignDelivery;
  lastSentAt: string | null;
  lastQueued: number | null;
  frequencyDays: number;
  automation: MarketingCampaignTelegramAutomation | null;
};

export type MarketingCampaignTelegramSendResult = MarketingCampaignTelegram & {
  queued: number;
};

type CampaignRow = {
  id: string;
  tenantId: string;
  status: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  audienceId: string | null;
  storeIds: Prisma.JsonValue;
  mechanicConfig: Prisma.JsonValue;
  audience: { id: string; name: string } | null;
  tenant: { name: string };
};

type Recipient = { profileId: string; guestId: string };

@Injectable()
export class GuestTelegramCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantExecutionAdmission: TenantExecutionAdmissionService,
  ) {}

  async get(
    user: AuthenticatedUser,
    campaignId: string,
    now = new Date(),
  ): Promise<MarketingCampaignTelegram> {
    const campaign = await this.loadCampaign(user, campaignId);
    return this.summary(campaign, now);
  }

  async saveDraft(
    user: AuthenticatedUser,
    campaignId: string,
    dto: TelegramCampaignDraftDto,
    now = new Date(),
  ): Promise<MarketingCampaignTelegram> {
    const campaign = await this.loadCampaign(user, campaignId);
    const draft = parseDraft(dto);
    const config = configRecord(campaign.mechanicConfig);
    const telegram = configRecord(config.telegram);
    const mechanicConfig = {
      ...config,
      telegram: { ...telegram, ...draft, updatedAt: now.toISOString() },
    } as Prisma.JsonObject;
    await this.prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, tenantId: campaign.tenantId },
      data: { mechanicConfig },
    });
    return this.summary({ ...campaign, mechanicConfig }, now);
  }

  async send(
    user: AuthenticatedUser,
    campaignId: string,
    now = new Date(),
  ): Promise<MarketingCampaignTelegramSendResult> {
    const campaign = await this.loadCampaign(user, campaignId);
    const draft = storedDraft(campaign.mechanicConfig);
    if (!draft) {
      throw new BadRequestException('Сначала сохраните текст рассылки.');
    }
    if (campaignAutomation(campaign)?.enabled) {
      throw new BadRequestException(
        'У кампании включён автосценарий: сообщения уходят сами. Выключите его, чтобы отправить вручную.',
      );
    }
    if (!campaign.audienceId) {
      throw new BadRequestException(
        'У кампании нет группы гостей: выберите, кому отправлять.',
      );
    }
    const admission = await this.tenantExecutionAdmission.evaluate(
      campaign.tenantId,
      SEND_REQUIREMENTS,
      now,
    );
    if (!admission.allowed) {
      throw new BadRequestException(
        'Рассылки для сети сейчас выключены: исходящие сообщения не разрешены.',
      );
    }

    const { recipients } = await this.resolveRecipients(campaign, draft, now);
    if (!recipients.length) {
      throw new BadRequestException(
        'Некому отправить: в группе нет гостей, до которых можно достучаться в Telegram.',
      );
    }
    if (recipients.length > TELEGRAM_CAMPAIGN_MAX_RECIPIENTS) {
      throw new BadRequestException(
        `За один раз можно отправить не больше ${TELEGRAM_CAMPAIGN_MAX_RECIPIENTS} сообщений. Разделите группу.`,
      );
    }

    const message = composeMessage(
      draft,
      this.signature(campaign, await this.storeNames(campaign)),
    );
    const kind: GuestTelegramOutboxKind =
      draft.type === 'PROMO' ? 'CAMPAIGN_PROMO' : 'CAMPAIGN_NEWS';
    let queued = 0;
    for (let index = 0; index < recipients.length; index += IN_CHUNK) {
      const chunk = recipients.slice(index, index + IN_CHUNK);
      const created = await this.prisma.guestTelegramOutboxMessage.createMany({
        data: chunk.map((recipient) => ({
          tenantId: campaign.tenantId,
          storeId: singleStoreId(campaign.storeIds),
          profileId: recipient.profileId,
          kind,
          sourceKey: campaignSourceKey(campaign.id, recipient.profileId),
          text: message.text,
          replyMarkup: message.replyMarkup,
          marketingCampaignId: campaign.id,
          createdByUserId: user.id,
          nextAttemptAt: now,
        })),
        skipDuplicates: true,
      });
      queued += created.count;
    }

    const config = configRecord(campaign.mechanicConfig);
    const telegram = configRecord(config.telegram);
    const mechanicConfig = {
      ...config,
      telegram: {
        ...telegram,
        lastSentAt: now.toISOString(),
        lastSentByUserId: user.id,
        lastQueued: queued,
      },
    } as Prisma.JsonObject;
    await this.prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, tenantId: campaign.tenantId },
      data: { mechanicConfig },
    });

    return {
      ...(await this.summary({ ...campaign, mechanicConfig }, now)),
      queued,
    };
  }

  /**
   * Saves the automatic rule of the campaign and switches it on or off.
   * Switching on needs a saved text and outbound messages allowed for the
   * network; a draft or planned campaign starts running with it.
   */
  async saveAutomation(
    user: AuthenticatedUser,
    campaignId: string,
    dto: TelegramAutomationDto,
    now = new Date(),
  ): Promise<MarketingCampaignTelegram> {
    const campaign = await this.loadCampaign(user, campaignId);
    const config = configRecord(campaign.mechanicConfig);
    const telegram = configRecord(config.telegram);
    const current = storedAutomation(telegram);

    if (dto?.trigger === null) {
      if (current?.enabled) {
        throw new BadRequestException(
          'Сначала выключите автосценарий, потом переходите к разовой отправке.',
        );
      }
      const { automation: _removed, ...rest } = telegram;
      void _removed;
      const mechanicConfig = { ...config, telegram: rest } as Prisma.JsonObject;
      await this.prisma.marketingCampaign.updateMany({
        where: { id: campaign.id, tenantId: campaign.tenantId },
        data: { mechanicConfig },
      });
      return this.summary({ ...campaign, mechanicConfig }, now);
    }

    const settings = parseAutomation(dto, current);
    let status = campaign.status;
    if (settings.enabled && !current?.enabled) {
      if (!storedDraft(campaign.mechanicConfig)) {
        throw new BadRequestException('Сначала сохраните текст сообщения.');
      }
      if (status === 'FINISHED' || status === 'CANCELED') {
        throw new BadRequestException(
          'Кампания завершена: автосценарий в ней не запустить.',
        );
      }
      const admission = await this.tenantExecutionAdmission.evaluate(
        campaign.tenantId,
        SEND_REQUIREMENTS,
        now,
      );
      if (!admission.allowed) {
        throw new BadRequestException(
          'Рассылки для сети сейчас выключены: исходящие сообщения не разрешены.',
        );
      }
      if (status === 'DRAFT' || status === 'PLANNED') {
        status = TELEGRAM_AUTOMATION_CAMPAIGN_STATUS;
      }
    }

    const automation = {
      ...configRecord(telegram.automation),
      trigger: settings.trigger,
      days: settings.days,
      enabled: settings.enabled,
      ...(settings.enabled && !current?.enabled
        ? { enabledAt: now.toISOString(), enabledByUserId: user.id }
        : {}),
      ...(!settings.enabled && current?.enabled
        ? { disabledAt: now.toISOString(), disabledByUserId: user.id }
        : {}),
    };
    const mechanicConfig = {
      ...config,
      telegram: { ...telegram, automation },
    } as Prisma.JsonObject;
    await this.prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, tenantId: campaign.tenantId },
      data: {
        mechanicConfig,
        ...(status !== campaign.status ? { status } : {}),
      },
    });
    return this.summary({ ...campaign, status, mechanicConfig }, now);
  }

  private async loadCampaign(
    user: AuthenticatedUser,
    campaignId: string,
  ): Promise<CampaignRow> {
    if (typeof campaignId !== 'string' || !campaignId.trim()) {
      throw new NotFoundException('Marketing campaign not found');
    }
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, tenantId: user.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        periodFrom: true,
        periodTo: true,
        audienceId: true,
        storeIds: true,
        mechanicConfig: true,
        audience: { select: { id: true, name: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Marketing campaign not found');
    }
    return campaign;
  }

  private async summary(
    campaign: CampaignRow,
    now: Date,
  ): Promise<MarketingCampaignTelegram> {
    const draft = storedDraft(campaign.mechanicConfig);
    const telegram = configRecord(
      configRecord(campaign.mechanicConfig).telegram,
    );
    const signature = this.signature(campaign, await this.storeNames(campaign));
    const automation = campaignAutomation(campaign);
    const [{ reach }, delivery, automationSummary] = await Promise.all([
      automation
        ? { reach: emptyReach() }
        : this.resolveRecipients(campaign, draft, now),
      this.delivery(campaign),
      automation
        ? this.automationSummary(campaign, automation, draft, now)
        : null,
    ]);
    const message = draft ? composeMessage(draft, signature) : null;
    return {
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      audience: campaign.audience,
      draft,
      signature,
      preview: message
        ? {
            text: message.text,
            buttons: message.replyMarkup.inline_keyboard
              .flat()
              .map((button) => button.text),
          }
        : null,
      reach,
      delivery,
      lastSentAt:
        typeof telegram.lastSentAt === 'string' ? telegram.lastSentAt : null,
      lastQueued:
        typeof telegram.lastQueued === 'number' ? telegram.lastQueued : null,
      frequencyDays: TELEGRAM_CAMPAIGN_FREQUENCY_MS / (24 * 60 * 60 * 1000),
      automation: automationSummary,
    };
  }

  private async automationSummary(
    campaign: CampaignRow,
    automation: TelegramAutomationSettings,
    draft: TelegramCampaignDraft | null,
    now: Date,
  ): Promise<MarketingCampaignTelegramAutomation> {
    const timeZone = await automationTimeZone(this.prisma, campaign.tenantId);
    const candidates = await findAutomationCandidates(this.prisma, {
      tenantId: campaign.tenantId,
      trigger: automation.trigger,
      days: automation.days,
      storeIds: stringArray(campaign.storeIds),
      now,
      timeZone,
    });
    const { reach } = await selectAutomationRecipients(this.prisma, {
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      trigger: automation.trigger,
      promo: draft?.type === 'PROMO',
      candidates,
      now,
    });
    return {
      trigger: automation.trigger,
      days: automation.days,
      enabled: automation.enabled,
      enabledAt: automation.enabledAt,
      lastRunAt: automation.lastRunAt,
      lastQueued: automation.lastQueued,
      reach,
      campaignRunning: isRunning(campaign, now),
      sendHours: { ...TELEGRAM_AUTOMATION_SEND_HOURS },
      timeZone,
    };
  }

  private async resolveRecipients(
    campaign: CampaignRow,
    draft: TelegramCampaignDraft | null,
    now: Date,
  ): Promise<{ recipients: Recipient[]; reach: TelegramCampaignReach }> {
    const reach: TelegramCampaignReach = {
      audienceTotal: 0,
      withTelegram: 0,
      unsubscribed: 0,
      noPromoConsent: 0,
      recentlyMessaged: 0,
      alreadyQueued: 0,
      willReceive: 0,
    };
    if (!campaign.audienceId) {
      return { recipients: [], reach };
    }

    const members = await this.prisma.guestAudienceMember.findMany({
      where: { tenantId: campaign.tenantId, audienceId: campaign.audienceId },
      select: { guestId: true },
    });
    reach.audienceTotal = members.length;
    const guestIds = [
      ...new Set(
        members
          .map((member) => member.guestId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const profiles: Array<{
      id: string;
      guestId: string | null;
      telegramIdentity: string | null;
      phoneConsentStatus: string;
      promoConsentStatus: string;
    }> = [];
    for (let index = 0; index < guestIds.length; index += IN_CHUNK) {
      profiles.push(
        ...(await this.prisma.guestGameProfile.findMany({
          where: {
            tenantId: campaign.tenantId,
            guestId: { in: guestIds.slice(index, index + IN_CHUNK) },
            telegramIdentity: { startsWith: 'chat:' },
            status: { notIn: UNREACHABLE_PROFILE_STATUSES },
          },
          orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
          select: {
            id: true,
            guestId: true,
            telegramIdentity: true,
            phoneConsentStatus: true,
            promoConsentStatus: true,
          },
        })),
      );
    }

    // One message per guest and per Telegram chat.
    const seenGuests = new Set<string>();
    const seenChats = new Set<string>();
    const reachable = profiles.filter((profile) => {
      if (!profile.guestId || !profile.telegramIdentity) return false;
      if (seenGuests.has(profile.guestId)) return false;
      if (seenChats.has(profile.telegramIdentity)) return false;
      seenGuests.add(profile.guestId);
      seenChats.add(profile.telegramIdentity);
      return true;
    });
    reach.withTelegram = reachable.length;

    const profileIds = reachable.map((profile) => profile.id);
    const alreadyQueued = new Set<string>();
    const recent = new Set<string>();
    for (let index = 0; index < profileIds.length; index += IN_CHUNK) {
      const rows = await this.prisma.guestTelegramOutboxMessage.findMany({
        where: {
          tenantId: campaign.tenantId,
          profileId: { in: profileIds.slice(index, index + IN_CHUNK) },
          kind: { in: ['CAMPAIGN_NEWS', 'CAMPAIGN_PROMO'] },
          OR: [
            { marketingCampaignId: campaign.id },
            {
              status: { in: LIVE_OUTBOX_STATUSES },
              createdAt: {
                gte: new Date(now.getTime() - TELEGRAM_CAMPAIGN_FREQUENCY_MS),
              },
            },
          ],
        },
        select: { profileId: true, marketingCampaignId: true },
      });
      for (const row of rows) {
        if (row.marketingCampaignId === campaign.id) {
          alreadyQueued.add(row.profileId);
        } else {
          recent.add(row.profileId);
        }
      }
    }

    const recipients: Recipient[] = [];
    for (const profile of reachable) {
      if (alreadyQueued.has(profile.id)) {
        reach.alreadyQueued += 1;
      } else if (OPTED_OUT.has(profile.phoneConsentStatus)) {
        reach.unsubscribed += 1;
      } else if (
        draft?.type === 'PROMO' &&
        profile.promoConsentStatus !== 'GRANTED'
      ) {
        reach.noPromoConsent += 1;
      } else if (recent.has(profile.id)) {
        reach.recentlyMessaged += 1;
      } else {
        recipients.push({ profileId: profile.id, guestId: profile.guestId! });
      }
    }
    reach.willReceive = recipients.length;
    return { recipients, reach };
  }

  private async delivery(
    campaign: CampaignRow,
  ): Promise<TelegramCampaignDelivery> {
    const groups = await this.prisma.guestTelegramOutboxMessage.groupBy({
      by: ['status'],
      where: { tenantId: campaign.tenantId, marketingCampaignId: campaign.id },
      _count: { _all: true },
    });
    const count = (status: string) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      queued: count('QUEUED') + count('SENDING'),
      sent: count('SENT'),
      failed: count('FAILED'),
      blocked: count('BLOCKED'),
      skipped: count('SKIPPED'),
    };
  }

  private async storeNames(campaign: CampaignRow) {
    const storeId = singleStoreId(campaign.storeIds);
    if (!storeId) return [];
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: campaign.tenantId },
      select: { name: true },
    });
    return store?.name?.trim() ? [store.name.trim()] : [];
  }

  private signature(campaign: CampaignRow, storeNames: string[]) {
    return storeNames.length === 1
      ? `Клуб «${storeNames[0]}»`
      : campaign.tenant.name.trim() || 'Ваш клуб';
  }
}

export function campaignSourceKey(campaignId: string, profileId: string) {
  return `campaign:${campaignId}:profile:${profileId}`;
}

export function composeMessage(
  draft: TelegramCampaignDraft,
  signature: string,
): {
  text: string;
  replyMarkup: {
    inline_keyboard: Array<
      Array<{ text: string; url?: string; callback_data?: string }>
    >;
  };
} {
  const optOut =
    draft.type === 'PROMO'
      ? { text: 'Не присылать акции', callback_data: 'bot:promo:no' }
      : { text: 'Отписаться', callback_data: 'bot:unsubscribe' };
  return {
    text: `${draft.text}\n\n— ${signature}`.slice(
      0,
      GUEST_TELEGRAM_OUTBOX_TEXT_MAX,
    ),
    replyMarkup: {
      inline_keyboard: [
        ...(draft.buttonText && draft.buttonUrl
          ? [[{ text: draft.buttonText, url: draft.buttonUrl }]]
          : []),
        [optOut],
      ],
    },
  };
}

export function parseDraft(
  dto: TelegramCampaignDraftDto,
): TelegramCampaignDraft {
  const type = dto?.type;
  if (!TELEGRAM_CAMPAIGN_TYPES.includes(type as TelegramCampaignType)) {
    throw new BadRequestException('Выберите тип: новость клуба или акция.');
  }
  const text = typeof dto.text === 'string' ? dto.text.trim() : '';
  if (!text) {
    throw new BadRequestException('Напишите текст сообщения.');
  }
  if (Array.from(text).length > TELEGRAM_CAMPAIGN_TEXT_MAX) {
    throw new BadRequestException(
      `Текст длиннее ${TELEGRAM_CAMPAIGN_TEXT_MAX} символов.`,
    );
  }
  // Control characters (except tab and newlines) break Telegram messages.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new BadRequestException('В тексте есть недопустимые символы.');
  }
  const buttonText =
    typeof dto.buttonText === 'string' && dto.buttonText.trim()
      ? dto.buttonText.trim()
      : null;
  const buttonUrlRaw =
    typeof dto.buttonUrl === 'string' && dto.buttonUrl.trim()
      ? dto.buttonUrl.trim()
      : null;
  if (Boolean(buttonText) !== Boolean(buttonUrlRaw)) {
    throw new BadRequestException(
      'Для кнопки нужны и надпись, и ссылка (или уберите оба поля).',
    );
  }
  if (buttonText && Array.from(buttonText).length > BUTTON_TEXT_MAX) {
    throw new BadRequestException(
      `Надпись на кнопке длиннее ${BUTTON_TEXT_MAX} символов.`,
    );
  }
  let buttonUrl: string | null = null;
  if (buttonUrlRaw) {
    let url: URL;
    try {
      url = new URL(buttonUrlRaw);
    } catch {
      throw new BadRequestException('Ссылка для кнопки некорректна.');
    }
    if (url.protocol !== 'https:' || buttonUrlRaw.length > BUTTON_URL_MAX) {
      throw new BadRequestException(
        'Ссылка для кнопки должна начинаться с https:// и быть не длиннее 500 символов.',
      );
    }
    buttonUrl = url.toString();
  }
  return { type: type as TelegramCampaignType, text, buttonText, buttonUrl };
}

function storedDraft(value: Prisma.JsonValue): TelegramCampaignDraft | null {
  const telegram = configRecord(configRecord(value).telegram);
  try {
    return telegram.text ? parseDraft(telegram) : null;
  } catch {
    return null;
  }
}

function configRecord(
  value: Prisma.JsonValue | undefined,
): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function singleStoreId(value: Prisma.JsonValue) {
  return Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === 'string'
    ? value[0]
    : null;
}

export function parseAutomation(
  dto: TelegramAutomationDto,
  current: TelegramAutomationSettings | null,
): { trigger: TelegramAutomationTrigger; days: number; enabled: boolean } {
  const trigger = dto?.trigger ?? current?.trigger;
  if (!isTelegramAutomationTrigger(trigger)) {
    throw new BadRequestException(
      'Выберите правило: давно не был, нет второго визита или награда сгорает.',
    );
  }
  const range = TELEGRAM_AUTOMATION_DAYS[trigger];
  const rawDays =
    dto?.days === undefined
      ? current?.trigger === trigger
        ? current.days
        : range.default
      : dto.days;
  const days = typeof rawDays === 'string' ? Number(rawDays) : rawDays;
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < range.min ||
    days > range.max
  ) {
    throw new BadRequestException(
      `Число дней должно быть от ${range.min} до ${range.max}.`,
    );
  }
  const enabled =
    dto?.enabled === undefined ? (current?.enabled ?? false) : dto.enabled;
  if (typeof enabled !== 'boolean') {
    throw new BadRequestException('Укажите, включён ли автосценарий.');
  }
  return { trigger, days, enabled };
}

function campaignAutomation(campaign: { mechanicConfig: Prisma.JsonValue }) {
  return storedAutomation(
    configRecord(configRecord(campaign.mechanicConfig).telegram),
  );
}

function isRunning(
  campaign: Pick<CampaignRow, 'status' | 'periodFrom' | 'periodTo'>,
  now: Date,
) {
  const dayMs = 24 * 60 * 60 * 1000;
  return (
    campaign.status === TELEGRAM_AUTOMATION_CAMPAIGN_STATUS &&
    (!campaign.periodFrom || campaign.periodFrom <= now) &&
    (!campaign.periodTo || campaign.periodTo.getTime() >= now.getTime() - dayMs)
  );
}

function emptyReach(): TelegramCampaignReach {
  return {
    audienceTotal: 0,
    withTelegram: 0,
    unsubscribed: 0,
    noPromoConsent: 0,
    recentlyMessaged: 0,
    alreadyQueued: 0,
    willReceive: 0,
  };
}

/**
 * Running campaigns with an enabled Telegram automation, with their message
 * ready to queue. Used by the bonus-ledger worker, across all networks.
 */
export async function loadAutomationCampaigns(
  prisma: Pick<PrismaService, 'marketingCampaign' | 'store'>,
  now: Date,
): Promise<AutomationCampaign[]> {
  const rows = await prisma.marketingCampaign.findMany({
    where: {
      ...runningAutomationWhere(now),
      mechanicConfig: {
        path: ['telegram', 'automation', 'enabled'],
        equals: true,
      },
    },
    select: {
      id: true,
      tenantId: true,
      storeIds: true,
      createdByUserId: true,
      mechanicConfig: true,
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const campaigns: AutomationCampaign[] = [];
  for (const row of rows) {
    const draft = storedDraft(row.mechanicConfig);
    const automation = campaignAutomation(row);
    if (!draft || !automation?.enabled) continue;
    const storeIds = stringArray(row.storeIds);
    const store =
      storeIds.length === 1
        ? await prisma.store.findFirst({
            where: { id: storeIds[0], tenantId: row.tenantId },
            select: { name: true },
          })
        : null;
    const signature = store?.name?.trim()
      ? `Клуб «${store.name.trim()}»`
      : row.tenant.name.trim() || 'Ваш клуб';
    const kind: GuestTelegramOutboxKind =
      draft.type === 'PROMO' ? 'CAMPAIGN_PROMO' : 'CAMPAIGN_NEWS';
    campaigns.push({
      id: row.id,
      tenantId: row.tenantId,
      storeIds: row.storeIds,
      createdByUserId: row.createdByUserId,
      automation,
      promo: draft.type === 'PROMO',
      message: (note) => {
        const message = composeMessage(
          note ? { ...draft, text: `${draft.text}\n\n${note}` } : draft,
          signature,
        );
        return {
          text: message.text,
          replyMarkup: message.replyMarkup,
          kind: kind,
        };
      },
    });
  }
  return campaigns;
}
