import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuestCommunicationConsentStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const marketingCampaignInclude = {
  audience: { select: { id: true, name: true, guestsCount: true } },
  crmTask: { select: { id: true, title: true, status: true, dueAt: true } },
  createdByUser: { select: { id: true, fullName: true, email: true } },
  ownerUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingCampaignInclude;

type MarketingCampaignRow = Prisma.MarketingCampaignGetPayload<{
  include: typeof marketingCampaignInclude;
}>;

const campaignGoals = [
  'RETURN_GUESTS',
  'REPEAT_VISIT',
  'WEAK_HOURS',
  'BAR_GROWTH',
  'EVENT_PROMO',
  'PROMO_BUNDLE',
] as const;

const campaignStatuses = [
  'DRAFT',
  'PLANNED',
  'RUNNING',
  'FINISHED',
  'CANCELED',
] as const;

export type MarketingCampaignGoal = (typeof campaignGoals)[number];
export type MarketingCampaignStatus = (typeof campaignStatuses)[number];

export type MarketingCampaignDto = {
  goal?: string | null;
  name?: string | null;
  audienceId?: string | null;
  storeIds?: string[] | null;
  ownerUserId?: string | null;
  status?: string | null;
  channel?: string | null;
  mechanic?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  dueAt?: string | null;
  budget?: string | number | null;
  note?: string | null;
};

export type MarketingCampaignUpdateDto = Partial<MarketingCampaignDto>;

export type MarketingCampaignConsentCoverage = {
  targetTotal: number;
  phoneGranted: number;
  phoneDenied: number;
  phoneUnsubscribed: number;
  phoneUnknown: number;
  contactable: number;
  excluded: number;
  requiresPhoneConsent: boolean;
};

export type MarketingCampaign = {
  id: string;
  goal: MarketingCampaignGoal;
  name: string;
  status: MarketingCampaignStatus;
  channel: string | null;
  mechanic: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  dueAt: string | null;
  budget: number | null;
  note: string | null;
  storeIds: string[];
  createdAt: string;
  updatedAt: string;
  audience: { id: string; name: string; guestsCount: number } | null;
  crmTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
  } | null;
  consentCoverage: MarketingCampaignConsentCoverage;
  createdBy: { id: string; displayName: string; email: string } | null;
  owner: { id: string; displayName: string; email: string } | null;
};

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaigns(user: AuthenticatedUser): Promise<MarketingCampaign[]> {
    const rows = await this.prisma.marketingCampaign.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingCampaignInclude,
    });

    const coverageByCampaign = await this.getConsentCoverageByCampaign(
      user.tenantId,
      rows,
    );

    return rows.map((row) =>
      this.toMarketingCampaign(row, coverageByCampaign.get(row.id)),
    );
  }

  async getCampaign(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaign> {
    const row = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: marketingCampaignInclude,
    });

    if (!row) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async createCampaign(
    user: AuthenticatedUser,
    dto: MarketingCampaignDto = {},
  ): Promise<MarketingCampaign> {
    const goal = resolveGoal(dto.goal);
    const audienceId = await this.resolveAudienceId(user, dto.audienceId);
    const storeIds = await this.resolveStoreIds(user, dto.storeIds);
    const ownerUserId = await this.resolveOwnerUserId(user, dto.ownerUserId);
    const status = resolveStatus(dto.status ?? 'DRAFT');
    const name =
      normalizeText(dto.name, 140) ??
      this.defaultCampaignName(goal, audienceId ? 'группы' : null);

    const row = await this.prisma.marketingCampaign.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        audienceId,
        storeIds: storeIds.length > 0 ? storeIds : Prisma.JsonNull,
        ownerUserId,
        goal,
        name,
        status,
        channel: normalizeText(dto.channel, 80),
        mechanic: normalizeText(dto.mechanic, 80),
        periodFrom: parseOptionalDate(dto.periodFrom),
        periodTo: parseOptionalDate(dto.periodTo),
        dueAt: parseOptionalDate(dto.dueAt),
        budget: parseOptionalBudget(dto.budget),
        note: normalizeText(dto.note, 2000),
      },
      include: marketingCampaignInclude,
    });

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async updateCampaign(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingCampaignUpdateDto = {},
  ): Promise<MarketingCampaign> {
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const data: Prisma.MarketingCampaignUpdateInput = {};

    if (hasOwn(dto, 'goal')) {
      data.goal = resolveGoal(dto.goal);
    }

    if (hasOwn(dto, 'name')) {
      data.name = requireText(dto.name, 'Campaign name', 140);
    }

    if (hasOwn(dto, 'status')) {
      data.status = resolveStatus(dto.status);
    }

    if (hasOwn(dto, 'audienceId')) {
      data.audience = await this.resolveAudienceRelation(user, dto.audienceId);
    }

    if (hasOwn(dto, 'storeIds')) {
      const storeIds = await this.resolveStoreIds(user, dto.storeIds);
      data.storeIds = storeIds.length > 0 ? storeIds : Prisma.JsonNull;
    }

    if (hasOwn(dto, 'ownerUserId')) {
      data.ownerUser = await this.resolveOwnerUserRelation(
        user,
        dto.ownerUserId,
      );
    }

    if (hasOwn(dto, 'channel')) {
      data.channel = normalizeText(dto.channel, 80);
    }

    if (hasOwn(dto, 'mechanic')) {
      data.mechanic = normalizeText(dto.mechanic, 80);
    }

    if (hasOwn(dto, 'periodFrom')) {
      data.periodFrom = parseOptionalDate(dto.periodFrom);
    }

    if (hasOwn(dto, 'periodTo')) {
      data.periodTo = parseOptionalDate(dto.periodTo);
    }

    if (hasOwn(dto, 'dueAt')) {
      data.dueAt = parseOptionalDate(dto.dueAt);
    }

    if (hasOwn(dto, 'budget')) {
      data.budget = parseOptionalBudget(dto.budget);
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingCampaign.update({
      where: { id },
      data,
      include: marketingCampaignInclude,
    });

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async createCampaignCrmTask(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaign> {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: marketingCampaignInclude,
    });

    if (!campaign) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      campaign.audienceId,
      campaign.channel,
    );

    if (campaign.crmTask) {
      return this.toMarketingCampaign(campaign, coverage);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const task = await tx.guestCrmTask.create({
        data: {
          tenantId: user.tenantId,
          audienceId: campaign.audienceId,
          createdByUserId: user.id,
          assignedToUserId: campaign.ownerUserId,
          title: `Маркетинг: ${campaign.name}`,
          description: campaignTaskDescription(campaign, coverage),
          dueAt: campaign.dueAt,
        },
        select: { id: true },
      });

      return tx.marketingCampaign.update({
        where: { id: campaign.id },
        data: {
          crmTaskId: task.id,
          status: campaign.status === 'DRAFT' ? 'PLANNED' : campaign.status,
        },
        include: marketingCampaignInclude,
      });
    });

    return this.toMarketingCampaign(row, coverage);
  }

  private async resolveAudienceId(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const audienceId = normalizeText(value, 80);

    if (!audienceId) {
      return null;
    }

    const audience = await this.prisma.guestAudience.findFirst({
      where: { id: audienceId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!audience) {
      throw new BadRequestException('Guest group not found');
    }

    return audience.id;
  }

  private async resolveAudienceRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.GuestAudienceUpdateOneWithoutMarketingCampaignsNestedInput> {
    const audienceId = await this.resolveAudienceId(user, value);
    return audienceId ? { connect: { id: audienceId } } : { disconnect: true };
  }

  private async resolveOwnerUserId(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const ownerUserId = normalizeText(value, 80);

    if (!ownerUserId) {
      return null;
    }

    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        tenantId: user.tenantId,
      },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException('Responsible user not found');
    }

    return owner.id;
  }

  private async resolveStoreIds(
    user: AuthenticatedUser,
    value?: string[] | null,
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    const storeIds = [
      ...new Set(value.map((item) => normalizeText(item, 80))),
    ].filter((item): item is string => Boolean(item));

    if (storeIds.length === 0) {
      return [];
    }

    const stores = await this.prisma.store.findMany({
      where: { tenantId: user.tenantId, id: { in: storeIds }, isActive: true },
      select: { id: true },
    });

    if (stores.length !== storeIds.length) {
      throw new BadRequestException('Store not found');
    }

    return storeIds;
  }

  private async resolveOwnerUserRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.UserUpdateOneWithoutOwnedMarketingCampaignsNestedInput> {
    const ownerUserId = await this.resolveOwnerUserId(user, value);
    return ownerUserId
      ? { connect: { id: ownerUserId } }
      : { disconnect: true };
  }

  private defaultCampaignName(
    goal: MarketingCampaignGoal,
    scope: string | null,
  ) {
    const labels: Record<MarketingCampaignGoal, string> = {
      RETURN_GUESTS: 'Вернуть гостей',
      REPEAT_VISIT: 'Повторный визит',
      WEAK_HOURS: 'Тихие часы',
      BAR_GROWTH: 'Рост бара',
      EVENT_PROMO: 'Событие или бронь',
      PROMO_BUNDLE: 'Промо-набор',
    };

    return scope ? `${labels[goal]} для ${scope}` : labels[goal];
  }

  private async getConsentCoverageByCampaign(
    tenantId: string,
    rows: MarketingCampaignRow[],
  ) {
    const result = new Map<string, MarketingCampaignConsentCoverage>();

    await Promise.all(
      rows.map(async (row) => {
        result.set(
          row.id,
          await this.getCampaignConsentCoverage(
            tenantId,
            row.audienceId,
            row.channel,
          ),
        );
      }),
    );

    return result;
  }

  private async getCampaignConsentCoverage(
    tenantId: string,
    audienceId: string | null,
    channel: string | null,
  ): Promise<MarketingCampaignConsentCoverage> {
    const requiresPhoneConsent = channelRequiresPhoneConsent(channel);

    if (!audienceId) {
      return {
        targetTotal: 0,
        phoneGranted: 0,
        phoneDenied: 0,
        phoneUnsubscribed: 0,
        phoneUnknown: 0,
        contactable: 0,
        excluded: 0,
        requiresPhoneConsent,
      };
    }

    const [targetTotal, groupedGuests] = await Promise.all([
      this.prisma.guestAudienceMember.count({
        where: { tenantId, audienceId },
      }),
      this.prisma.guest.groupBy({
        by: ['phoneConsentStatus'],
        where: {
          tenantId,
          audienceMembers: { some: { audienceId } },
        },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map(
      groupedGuests.map((group) => [
        group.phoneConsentStatus,
        group._count._all,
      ]),
    );
    const linkedGuests = [...counts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const unknown =
      (counts.get(GuestCommunicationConsentStatus.UNKNOWN) ?? 0) +
      Math.max(0, targetTotal - linkedGuests);
    const granted = counts.get(GuestCommunicationConsentStatus.GRANTED) ?? 0;
    const denied = counts.get(GuestCommunicationConsentStatus.DENIED) ?? 0;
    const unsubscribed =
      counts.get(GuestCommunicationConsentStatus.UNSUBSCRIBED) ?? 0;

    return {
      targetTotal,
      phoneGranted: granted,
      phoneDenied: denied,
      phoneUnsubscribed: unsubscribed,
      phoneUnknown: unknown,
      contactable: requiresPhoneConsent ? granted : targetTotal,
      excluded: requiresPhoneConsent ? targetTotal - granted : 0,
      requiresPhoneConsent,
    };
  }

  private toMarketingCampaign(
    row: MarketingCampaignRow,
    coverage?: MarketingCampaignConsentCoverage,
  ): MarketingCampaign {
    return {
      id: row.id,
      goal: resolveGoal(row.goal),
      name: row.name,
      status: resolveStatus(row.status),
      channel: row.channel,
      mechanic: row.mechanic,
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      budget: row.budget ? Number(row.budget) : null,
      note: row.note,
      storeIds: parseStringArray(row.storeIds),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      audience: row.audience
        ? {
            id: row.audience.id,
            name: row.audience.name,
            guestsCount: row.audience.guestsCount,
          }
        : null,
      crmTask: row.crmTask
        ? {
            id: row.crmTask.id,
            title: row.crmTask.title,
            status: row.crmTask.status,
            dueAt: row.crmTask.dueAt?.toISOString() ?? null,
          }
        : null,
      consentCoverage: coverage ?? emptyConsentCoverage(row.channel),
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
      owner: row.ownerUser ? toUserSummary(row.ownerUser) : null,
    };
  }
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function requireText(value: unknown, label: string, maxLength: number) {
  const text = normalizeText(value, maxLength);

  if (!text) {
    throw new BadRequestException(`${label} is required`);
  }

  return text;
}

function resolveGoal(value: unknown): MarketingCampaignGoal {
  if (campaignGoals.includes(value as MarketingCampaignGoal)) {
    return value as MarketingCampaignGoal;
  }

  return 'RETURN_GUESTS';
}

function resolveStatus(value: unknown): MarketingCampaignStatus {
  if (campaignStatuses.includes(value as MarketingCampaignStatus)) {
    return value as MarketingCampaignStatus;
  }

  return 'DRAFT';
}

function parseOptionalDate(value: unknown) {
  const text = normalizeText(value, 40);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  return date;
}

function parseOptionalBudget(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.').trim())
        : Number.NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException('Invalid budget');
  }

  return amount;
}

function toUserSummary(user: {
  id: string;
  fullName: string | null;
  email: string;
}) {
  return {
    id: user.id,
    displayName: user.fullName ?? user.email,
    email: user.email,
  };
}

function parseStringArray(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function campaignTaskDescription(
  campaign: {
    goal: string;
    audience: { name: string; guestsCount: number } | null;
    storeIds: Prisma.JsonValue | null;
    channel: string | null;
    mechanic: string | null;
    periodFrom: Date | null;
    periodTo: Date | null;
    budget: Prisma.Decimal | null;
    note: string | null;
  },
  coverage: MarketingCampaignConsentCoverage,
) {
  const storeIds = parseStringArray(campaign.storeIds);
  const lines = [
    `Цель: ${campaign.goal}`,
    campaign.audience
      ? `Группа: ${campaign.audience.name} (${campaign.audience.guestsCount} гостей)`
      : 'Группа: не выбрана',
    storeIds.length > 0 ? `Клубов: ${storeIds.length}` : 'Клубы: вся сеть',
    campaign.channel ? `Канал: ${campaign.channel}` : null,
    campaign.mechanic ? `Механика: ${campaign.mechanic}` : null,
    campaign.periodFrom || campaign.periodTo
      ? `Период: ${formatDateForTask(campaign.periodFrom)} - ${formatDateForTask(
          campaign.periodTo,
        )}`
      : null,
    campaign.budget ? `Бюджет: ${Number(campaign.budget)} руб` : null,
    coverage.targetTotal > 0
      ? `Согласия: доступно ${coverage.contactable} из ${coverage.targetTotal}, исключено ${coverage.excluded}`
      : 'Согласия: группа не выбрана или пуста',
    campaign.note ? `Заметка: ${campaign.note}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function formatDateForTask(value: Date | null) {
  if (!value) {
    return 'не задано';
  }

  return new Intl.DateTimeFormat('ru-RU').format(value);
}

function channelRequiresPhoneConsent(channel: string | null) {
  if (!channel) {
    return true;
  }

  const normalized = channel.toLocaleLowerCase('ru-RU');
  return (
    normalized.includes('crm') ||
    normalized.includes('звон') ||
    normalized.includes('месс') ||
    normalized.includes('sms') ||
    normalized.includes('рассыл') ||
    normalized.includes('telegram') ||
    normalized.includes('max')
  );
}

function emptyConsentCoverage(
  channel: string | null,
): MarketingCampaignConsentCoverage {
  return {
    targetTotal: 0,
    phoneGranted: 0,
    phoneDenied: 0,
    phoneUnsubscribed: 0,
    phoneUnknown: 0,
    contactable: 0,
    excluded: 0,
    requiresPhoneConsent: channelRequiresPhoneConsent(channel),
  };
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return key in obj;
}
