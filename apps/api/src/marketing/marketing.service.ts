import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuestCommunicationConsentStatus, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
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

const DAY_MS = 24 * 60 * 60 * 1000;

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

export type MarketingCampaignExportFormat = 'csv' | 'xlsx';

export type MarketingCampaignExportQuery = {
  format?: string | null;
};

export type MarketingCampaignExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

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

export type MarketingCampaignEffectPeriod = {
  from: string;
  to: string;
  days: number;
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignFunnel = {
  targetTotal: number;
  linkedTargetGuests: number;
  contactableGuests: number;
  excludedGuests: number;
  completedContacts: number;
  directCompletedContacts: number;
  respondedContacts: number;
  visitedGuests: number;
  repeatGuests: number;
  revenue: number;
  barRevenue: number;
  contactCompletionRate: number | null;
  responseRate: number | null;
  visitRate: number | null;
  repeatRate: number | null;
  barShare: number | null;
  crmTask: {
    id: string;
    status: string;
    dueAt: string | null;
  } | null;
  responsibleUser: {
    id: string;
    displayName: string;
    email: string;
  } | null;
};

export type MarketingCampaignStoreEffectMetrics = {
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignStoreEffect = {
  storeId: string | null;
  storeName: string;
  before: MarketingCampaignStoreEffectMetrics;
  after: MarketingCampaignStoreEffectMetrics;
  delta: MarketingCampaignStoreEffectMetrics;
};

export type MarketingCampaignExecutionMetrics = {
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  linkedGuests: number;
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignExecutionBreakdownRow = {
  key: string;
  label: string;
  hint: string | null;
  metrics: MarketingCampaignExecutionMetrics;
};

export type MarketingCampaignExecutionBreakdown = {
  byResponsible: MarketingCampaignExecutionBreakdownRow[];
  byChannel: MarketingCampaignExecutionBreakdownRow[];
};

export type MarketingCampaignEffect = {
  campaignId: string;
  attributionMode: 'CAMPAIGN_OR_GROUP';
  targetTotal: number;
  linkedTargetGuests: number;
  unlinkedTargetMembers: number;
  window: {
    beforeFrom: string;
    beforeTo: string;
    afterFrom: string;
    afterTo: string;
  };
  before: MarketingCampaignEffectPeriod;
  after: MarketingCampaignEffectPeriod;
  delta: Omit<MarketingCampaignEffectPeriod, 'from' | 'to' | 'days'>;
  funnel: MarketingCampaignFunnel;
  storeBreakdown: MarketingCampaignStoreEffect[];
  executionBreakdown: MarketingCampaignExecutionBreakdown;
  dataQuality: {
    directContactAttribution: boolean;
    revenueScope: string;
    limitations: string[];
  };
};

type MarketingCampaignExecutionBucket = {
  key: string;
  label: string;
  hint: string | null;
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  linkedGuestIds: Set<string>;
};

type CsvCell = string | number | boolean | null;

type MarketingCampaignExportContactEvent = {
  id: string;
  channel: string;
  result: string | null;
  note: string | null;
  contactedAt: Date;
  marketingCampaignId: string | null;
  audience: { name: string } | null;
  guest: {
    externalDomain: string | null;
    externalGuestId: string;
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
  } | null;
  lead: {
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
    matchedGuestId: string | null;
  } | null;
  createdByUser: { fullName: string | null; email: string } | null;
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

  async getCampaignEffect(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaignEffect> {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        audience: { select: { id: true, guestsCount: true } },
        crmTask: { select: { id: true, status: true, dueAt: true } },
        ownerUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const storeIds = parseStringArray(campaign.storeIds);
    const { afterFrom, afterTo, beforeFrom, beforeTo } =
      this.resolveEffectWindow(campaign);
    const members = campaign.audienceId
      ? await this.prisma.guestAudienceMember.findMany({
          where: { tenantId: user.tenantId, audienceId: campaign.audienceId },
          select: { guestId: true },
        })
      : [];
    const guestIds = [
      ...new Set(
        members
          .map((member) => member.guestId)
          .filter((guestId): guestId is string => Boolean(guestId)),
      ),
    ];

    const [before, after, storeBreakdown, executionBreakdown] =
      await Promise.all([
        this.buildCampaignEffectPeriod({
          tenantId: user.tenantId,
          campaignId: campaign.id,
          audienceId: campaign.audienceId,
          guestIds,
          storeIds,
          from: beforeFrom,
          to: beforeTo,
        }),
        this.buildCampaignEffectPeriod({
          tenantId: user.tenantId,
          campaignId: campaign.id,
          audienceId: campaign.audienceId,
          guestIds,
          storeIds,
          from: afterFrom,
          to: afterTo,
        }),
        this.buildCampaignStoreBreakdown({
          tenantId: user.tenantId,
          guestIds,
          storeIds,
          beforeFrom,
          beforeTo,
          afterFrom,
          afterTo,
        }),
        this.buildCampaignExecutionBreakdown({
          tenantId: user.tenantId,
          campaignId: campaign.id,
          audienceId: campaign.audienceId,
          guestIds,
          storeIds,
          from: afterFrom,
          to: afterTo,
        }),
      ]);

    const linkedTargetGuests = guestIds.length;
    const targetTotal = campaign.audience?.guestsCount ?? members.length;
    const directContactAttribution = after.directContacts > 0;
    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      campaign.audienceId,
      campaign.channel,
    );
    const completedContacts = after.contacts;
    const respondedContacts = after.respondedContacts;
    const visitedGuests = after.activeGuests;

    return {
      campaignId: campaign.id,
      attributionMode: 'CAMPAIGN_OR_GROUP',
      targetTotal,
      linkedTargetGuests,
      unlinkedTargetMembers: Math.max(0, targetTotal - linkedTargetGuests),
      window: {
        beforeFrom: beforeFrom.toISOString(),
        beforeTo: beforeTo.toISOString(),
        afterFrom: afterFrom.toISOString(),
        afterTo: afterTo.toISOString(),
      },
      before,
      after,
      delta: {
        contacts: this.round(after.contacts - before.contacts, 2),
        directContacts: this.round(
          after.directContacts - before.directContacts,
          2,
        ),
        respondedContacts: this.round(
          after.respondedContacts - before.respondedContacts,
          2,
        ),
        activeGuests: this.round(after.activeGuests - before.activeGuests, 2),
        repeatGuests: this.round(after.repeatGuests - before.repeatGuests, 2),
        sessionsCount: this.round(
          after.sessionsCount - before.sessionsCount,
          2,
        ),
        playHours: this.round(after.playHours - before.playHours, 2),
        balanceRevenue: this.round(
          after.balanceRevenue - before.balanceRevenue,
          2,
        ),
        barRevenue: this.round(after.barRevenue - before.barRevenue, 2),
        totalRevenue: this.round(after.totalRevenue - before.totalRevenue, 2),
        barSalesCount: this.round(
          after.barSalesCount - before.barSalesCount,
          2,
        ),
      },
      funnel: {
        targetTotal,
        linkedTargetGuests,
        contactableGuests: coverage.contactable,
        excludedGuests: coverage.excluded,
        completedContacts,
        directCompletedContacts: after.directContacts,
        respondedContacts,
        visitedGuests,
        repeatGuests: after.repeatGuests,
        revenue: after.totalRevenue,
        barRevenue: after.barRevenue,
        contactCompletionRate: this.ratio(
          completedContacts,
          coverage.contactable,
        ),
        responseRate: this.ratio(respondedContacts, completedContacts),
        visitRate: this.ratio(
          visitedGuests,
          respondedContacts || completedContacts,
        ),
        repeatRate: this.ratio(after.repeatGuests, visitedGuests),
        barShare: this.ratio(after.barRevenue, after.totalRevenue),
        crmTask: campaign.crmTask
          ? {
              id: campaign.crmTask.id,
              status: campaign.crmTask.status,
              dueAt: campaign.crmTask.dueAt?.toISOString() ?? null,
            }
          : null,
        responsibleUser: campaign.ownerUser
          ? {
              id: campaign.ownerUser.id,
              displayName:
                campaign.ownerUser.fullName || campaign.ownerUser.email,
              email: campaign.ownerUser.email,
            }
          : null,
      },
      storeBreakdown,
      executionBreakdown,
      dataQuality: {
        directContactAttribution,
        revenueScope:
          'Target guest facts only: balance spend in clubs plus linked product/bar sales.',
        limitations: [
          directContactAttribution
            ? 'Contacts with campaign id are counted directly; older contacts may still be matched by group.'
            : 'No direct campaign contact events yet, so contacts are matched by campaign group.',
          'Unallocated online balance top-ups are not attributed to a campaign until they can be linked to a guest and response.',
          'Guests without linked guestId in the saved group are visible in coverage but excluded from behavioral effect calculations.',
        ],
      },
    };
  }

  async exportCampaignResults(
    user: AuthenticatedUser,
    id: string,
    query: MarketingCampaignExportQuery = {},
  ): Promise<MarketingCampaignExportFile> {
    const format = this.resolveExportFormat(query.format);
    const [campaign, effect] = await Promise.all([
      this.getCampaign(user, id),
      this.getCampaignEffect(user, id),
    ]);
    const events = await this.getCampaignContactEventsForExport(
      user.tenantId,
      campaign.id,
      campaign.audience?.id ?? null,
    );
    const rows = this.buildCampaignExportRows(campaign, effect, events);
    const fileName = `leetplus-campaign-${campaign.id}.${format}`;

    if (format === 'xlsx') {
      return {
        fileName,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: await this.buildCampaignExportXlsx(rows),
      };
    }

    return {
      fileName,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(rows), 'utf8'),
    };
  }

  private buildCampaignExportRows(
    campaign: MarketingCampaign,
    effect: MarketingCampaignEffect,
    events: MarketingCampaignExportContactEvent[],
  ): CsvCell[][] {
    return [
      ['Раздел', 'Показатель', 'Значение', 'Комментарий'],
      ['Кампания', 'Название', campaign.name, null],
      ['Кампания', 'Цель', campaign.goal, null],
      ['Кампания', 'Статус', campaign.status, null],
      ['Кампания', 'Группа', campaign.audience?.name ?? null, null],
      ['Кампания', 'Канал', campaign.channel, null],
      ['Кампания', 'Механика', campaign.mechanic, null],
      ['Кампания', 'Ответственный', campaign.owner?.displayName ?? null, null],
      [
        'Кампания',
        'Период с',
        this.formatExportDate(campaign.periodFrom),
        null,
      ],
      ['Кампания', 'Период по', this.formatExportDate(campaign.periodTo), null],
      ['Кампания', 'Бюджет, руб', campaign.budget, null],
      [],
      ['Воронка', 'Шаг', 'Значение', 'Конверсия'],
      [
        'Воронка',
        'Группа',
        effect.funnel.targetTotal,
        this.formatExportPercent(100),
      ],
      [
        'Воронка',
        'Доступно для контакта',
        effect.funnel.contactableGuests,
        this.formatExportPercent(
          this.ratio(
            effect.funnel.contactableGuests,
            effect.funnel.targetTotal,
          ),
        ),
      ],
      [
        'Воронка',
        'Контакты выполнены',
        effect.funnel.completedContacts,
        this.formatExportPercent(effect.funnel.contactCompletionRate),
      ],
      [
        'Воронка',
        'Есть результат',
        effect.funnel.respondedContacts,
        this.formatExportPercent(effect.funnel.responseRate),
      ],
      [
        'Воронка',
        'Посетили',
        effect.funnel.visitedGuests,
        this.formatExportPercent(effect.funnel.visitRate),
      ],
      [
        'Воронка',
        'Повторные',
        effect.funnel.repeatGuests,
        this.formatExportPercent(effect.funnel.repeatRate),
      ],
      ['Воронка', 'Выручка, руб', effect.funnel.revenue, null],
      ['Воронка', 'Бар, руб', effect.funnel.barRevenue, null],
      [],
      [
        'Периоды',
        'Период',
        'Контакты',
        'Гости',
        'Повторные',
        'Сессии',
        'Часы',
        'Выручка, руб',
        'Бар, руб',
      ],
      this.effectPeriodCsvRow('До кампании', effect.before),
      this.effectPeriodCsvRow('После кампании', effect.after),
      [
        'Периоды',
        'Дельта',
        effect.delta.contacts,
        effect.delta.activeGuests,
        effect.delta.repeatGuests,
        effect.delta.sessionsCount,
        effect.delta.playHours,
        effect.delta.totalRevenue,
        effect.delta.barRevenue,
      ],
      [],
      [
        'Клубы',
        'Клуб',
        'Выручка после, руб',
        'Бар после, руб',
        'Гости после',
        'Повторные после',
        'Часы после',
        'Дельта выручки, руб',
      ],
      ...effect.storeBreakdown.map((row) => [
        'Клубы',
        row.storeName,
        row.after.totalRevenue,
        row.after.barRevenue,
        row.after.activeGuests,
        row.after.repeatGuests,
        row.after.playHours,
        row.delta.totalRevenue,
      ]),
      [],
      [
        'Ответственные',
        'Ответственный',
        'Контакты',
        'С результатом',
        'Связанные гости',
        'Посетили',
        'Повторные',
        'Выручка, руб',
        'Бар, руб',
      ],
      ...effect.executionBreakdown.byResponsible.map((row) =>
        this.executionCsvRow('Ответственные', row),
      ),
      [],
      [
        'Каналы',
        'Канал',
        'Контакты',
        'С результатом',
        'Связанные гости',
        'Посетили',
        'Повторные',
        'Выручка, руб',
        'Бар, руб',
      ],
      ...effect.executionBreakdown.byChannel.map((row) =>
        this.executionCsvRow('Каналы', row),
      ),
      [],
      [
        'Контакты',
        'Дата контакта',
        'Канал',
        'Результат',
        'Ответственный',
        'Гость',
        'CRM-лид',
        'Группа',
        'Прямо в кампанию',
        'В окне эффекта',
        'Заметка',
      ],
      ...events.map((event) => [
        'Контакты',
        this.formatExportDateTime(event.contactedAt),
        event.channel,
        event.result,
        event.createdByUser?.fullName ?? event.createdByUser?.email ?? null,
        this.guestExportLabel(event.guest),
        this.leadExportLabel(event.lead),
        event.audience?.name ?? null,
        event.marketingCampaignId === campaign.id ? 'да' : 'нет',
        this.isWithinEffectWindow(
          event.contactedAt,
          effect.window.afterFrom,
          effect.window.afterTo,
        )
          ? 'да'
          : 'нет',
        event.note,
      ]),
    ];
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

  private async buildCampaignEffectPeriod({
    tenantId,
    campaignId,
    audienceId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    campaignId: string;
    audienceId: string | null;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignEffectPeriod> {
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const guestWhere =
      guestIds.length > 0 ? { guestId: { in: guestIds } } : null;
    const empty = this.emptyEffectPeriod(from, to);

    if (!guestWhere && !audienceId) {
      return empty;
    }

    type EffectSessionRow = {
      guestId: string | null;
      durationMinutes: number | null;
    };
    type EffectTransactionRow = {
      type: string | null;
      amount: Prisma.Decimal | null;
    };
    type EffectSaleRow = {
      guestId: string | null;
      revenue: Prisma.Decimal;
    };
    type EffectContactEventRow = {
      id: string;
      result: string | null;
      marketingCampaignId: string | null;
    };

    const sessionsPromise: Promise<EffectSessionRow[]> = guestWhere
      ? this.prisma.guestSession.findMany({
          where: {
            tenantId,
            ...guestWhere,
            startedAt: { gte: from, lt: to },
            ...storeWhere,
          },
          select: { guestId: true, durationMinutes: true },
        })
      : Promise.resolve([]);
    const transactionsPromise: Promise<EffectTransactionRow[]> = guestWhere
      ? this.prisma.guestTransaction.findMany({
          where: {
            tenantId,
            ...guestWhere,
            happenedAt: { gte: from, lt: to },
            ...storeWhere,
          },
          select: { type: true, amount: true },
        })
      : Promise.resolve([]);
    const salesPromise: Promise<EffectSaleRow[]> = guestWhere
      ? this.prisma.salesFact.findMany({
          where: {
            tenantId,
            ...guestWhere,
            saleDate: { gte: from, lt: to },
            isCanceled: false,
            ...storeWhere,
          },
          select: { guestId: true, revenue: true },
        })
      : Promise.resolve([]);
    const contactEventsPromise: Promise<EffectContactEventRow[]> =
      this.prisma.guestCrmContactEvent.findMany({
        where: {
          tenantId,
          contactedAt: { gte: from, lt: to },
          OR: [
            { marketingCampaignId: campaignId },
            ...(audienceId ? [{ audienceId }] : []),
            ...(guestWhere ? [guestWhere] : []),
          ],
        },
        select: { id: true, result: true, marketingCampaignId: true },
      });

    const [sessions, transactions, sales, contactEvents] = await Promise.all([
      sessionsPromise,
      transactionsPromise,
      salesPromise,
      contactEventsPromise,
    ]);

    const activeGuestIds = new Set<string>();
    const sessionsByGuestId = new Map<string, number>();
    let playMinutes = 0;
    let transactionRevenue = 0;
    let barRevenue = 0;

    sessions.forEach((session) => {
      if (session.guestId) {
        activeGuestIds.add(session.guestId);
        sessionsByGuestId.set(
          session.guestId,
          (sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }
      playMinutes += session.durationMinutes ?? 0;
    });

    transactions.forEach((transaction) => {
      transactionRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      if (sale.guestId) {
        activeGuestIds.add(sale.guestId);
      }
      barRevenue += sale.revenue.toNumber();
    });

    const balanceRevenue = transactionRevenue;
    const directContacts = contactEvents.filter(
      (event) => event.marketingCampaignId === campaignId,
    ).length;
    const respondedContacts = contactEvents.filter((event) =>
      Boolean(event.result?.trim()),
    ).length;

    return {
      ...empty,
      contacts: contactEvents.length,
      directContacts,
      respondedContacts,
      activeGuests: activeGuestIds.size,
      repeatGuests: [...sessionsByGuestId.values()].filter((count) => count > 1)
        .length,
      sessionsCount: sessions.length,
      playHours: this.round(playMinutes / 60, 2),
      balanceRevenue: this.round(balanceRevenue, 2),
      barRevenue: this.round(barRevenue, 2),
      totalRevenue: this.round(balanceRevenue + barRevenue, 2),
      barSalesCount: sales.length,
    };
  }

  private async buildCampaignStoreBreakdown({
    tenantId,
    guestIds,
    storeIds,
    beforeFrom,
    beforeTo,
    afterFrom,
    afterTo,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    beforeFrom: Date;
    beforeTo: Date;
    afterFrom: Date;
    afterTo: Date;
  }): Promise<MarketingCampaignStoreEffect[]> {
    const [before, after] = await Promise.all([
      this.buildStoreEffectMetrics({
        tenantId,
        guestIds,
        storeIds,
        from: beforeFrom,
        to: beforeTo,
      }),
      this.buildStoreEffectMetrics({
        tenantId,
        guestIds,
        storeIds,
        from: afterFrom,
        to: afterTo,
      }),
    ]);
    const keys = new Set<string>([
      ...storeIds,
      ...before.keys(),
      ...after.keys(),
    ]);

    if (keys.size === 0) {
      return [];
    }

    const storeIdList = [...keys].filter((key) => key !== 'unallocated');
    const stores = storeIdList.length
      ? await this.prisma.store.findMany({
          where: { tenantId, id: { in: storeIdList } },
          select: { id: true, name: true },
        })
      : [];
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));

    return [...keys]
      .map((key) => {
        const beforeMetrics = before.get(key) ?? this.emptyStoreEffectMetrics();
        const afterMetrics = after.get(key) ?? this.emptyStoreEffectMetrics();

        return {
          storeId: key === 'unallocated' ? null : key,
          storeName:
            key === 'unallocated'
              ? 'Нераспределено'
              : (storeNames.get(key) ?? 'Клуб без названия'),
          before: beforeMetrics,
          after: afterMetrics,
          delta: this.diffStoreEffectMetrics(afterMetrics, beforeMetrics),
        };
      })
      .sort((left, right) => {
        const revenueDiff = right.after.totalRevenue - left.after.totalRevenue;

        if (revenueDiff !== 0) {
          return revenueDiff;
        }

        const guestsDiff = right.after.activeGuests - left.after.activeGuests;

        if (guestsDiff !== 0) {
          return guestsDiff;
        }

        return left.storeName.localeCompare(right.storeName, 'ru');
      });
  }

  private async buildCampaignExecutionBreakdown({
    tenantId,
    campaignId,
    audienceId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    campaignId: string;
    audienceId: string | null;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignExecutionBreakdown> {
    const guestWhere =
      guestIds.length > 0 ? { guestId: { in: guestIds } } : null;
    const events = await this.prisma.guestCrmContactEvent.findMany({
      where: {
        tenantId,
        contactedAt: { gte: from, lt: to },
        OR: [
          { marketingCampaignId: campaignId },
          ...(audienceId ? [{ audienceId }] : []),
          ...(guestWhere ? [guestWhere] : []),
        ],
      },
      select: {
        id: true,
        channel: true,
        result: true,
        marketingCampaignId: true,
        guestId: true,
        createdByUserId: true,
        createdByUser: { select: { fullName: true, email: true } },
        lead: { select: { matchedGuestId: true } },
      },
    });

    const responsibleBuckets = new Map<
      string,
      MarketingCampaignExecutionBucket
    >();
    const channelBuckets = new Map<string, MarketingCampaignExecutionBucket>();
    const getBucket = (
      buckets: Map<string, MarketingCampaignExecutionBucket>,
      key: string,
      label: string,
      hint: string | null,
    ) => {
      const existing = buckets.get(key);

      if (existing) {
        return existing;
      }

      const bucket: MarketingCampaignExecutionBucket = {
        key,
        label,
        hint,
        contacts: 0,
        directContacts: 0,
        respondedContacts: 0,
        linkedGuestIds: new Set<string>(),
      };
      buckets.set(key, bucket);

      return bucket;
    };
    const addEventToBucket = (
      bucket: MarketingCampaignExecutionBucket,
      event: (typeof events)[number],
    ) => {
      const linkedGuestId = event.guestId ?? event.lead?.matchedGuestId ?? null;
      bucket.contacts += 1;

      if (event.marketingCampaignId === campaignId) {
        bucket.directContacts += 1;
      }

      if (event.result?.trim()) {
        bucket.respondedContacts += 1;
      }

      if (linkedGuestId) {
        bucket.linkedGuestIds.add(linkedGuestId);
      }
    };

    events.forEach((event) => {
      const responsibleLabel = event.createdByUser
        ? event.createdByUser.fullName || event.createdByUser.email
        : 'Без ответственного';
      const responsibleHint = event.createdByUser?.email ?? null;
      const responsibleKey = event.createdByUserId ?? 'unassigned';
      const responsibleBucket = getBucket(
        responsibleBuckets,
        responsibleKey,
        responsibleLabel,
        responsibleHint,
      );
      const channelLabel = event.channel.trim() || 'Канал не указан';
      const channelBucket = getBucket(
        channelBuckets,
        channelLabel.toLocaleLowerCase('ru-RU'),
        channelLabel,
        null,
      );

      addEventToBucket(responsibleBucket, event);
      addEventToBucket(channelBucket, event);
    });

    const toRows = async (
      buckets: Map<string, MarketingCampaignExecutionBucket>,
    ): Promise<MarketingCampaignExecutionBreakdownRow[]> => {
      const rows = await Promise.all(
        [...buckets.values()].map(async (bucket) => {
          const behavior = await this.buildExecutionBehaviorMetrics({
            tenantId,
            guestIds: [...bucket.linkedGuestIds],
            storeIds,
            from,
            to,
          });

          return {
            key: bucket.key,
            label: bucket.label,
            hint: bucket.hint,
            metrics: {
              ...behavior,
              contacts: bucket.contacts,
              directContacts: bucket.directContacts,
              respondedContacts: bucket.respondedContacts,
              linkedGuests: bucket.linkedGuestIds.size,
            },
          };
        }),
      );

      return rows.sort((left, right) => {
        const contactDiff = right.metrics.contacts - left.metrics.contacts;

        if (contactDiff !== 0) {
          return contactDiff;
        }

        const revenueDiff =
          right.metrics.totalRevenue - left.metrics.totalRevenue;

        if (revenueDiff !== 0) {
          return revenueDiff;
        }

        return left.label.localeCompare(right.label, 'ru');
      });
    };

    return {
      byResponsible: await toRows(responsibleBuckets),
      byChannel: await toRows(channelBuckets),
    };
  }

  private async buildExecutionBehaviorMetrics({
    tenantId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignExecutionMetrics> {
    const empty = this.emptyExecutionMetrics();

    if (guestIds.length === 0) {
      return empty;
    }

    const guestWhere = { guestId: { in: guestIds } };
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          ...guestWhere,
          startedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { guestId: true, durationMinutes: true },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...guestWhere,
          happenedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { type: true, amount: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          ...guestWhere,
          saleDate: { gte: from, lt: to },
          isCanceled: false,
          ...storeWhere,
        },
        select: { guestId: true, revenue: true },
      }),
    ]);
    const activeGuestIds = new Set<string>();
    const sessionsByGuestId = new Map<string, number>();
    let playMinutes = 0;
    let balanceRevenue = 0;
    let barRevenue = 0;

    sessions.forEach((session) => {
      if (session.guestId) {
        activeGuestIds.add(session.guestId);
        sessionsByGuestId.set(
          session.guestId,
          (sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }

      playMinutes += session.durationMinutes ?? 0;
    });

    transactions.forEach((transaction) => {
      balanceRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      if (sale.guestId) {
        activeGuestIds.add(sale.guestId);
      }

      barRevenue += sale.revenue.toNumber();
    });

    return {
      ...empty,
      linkedGuests: guestIds.length,
      activeGuests: activeGuestIds.size,
      repeatGuests: [...sessionsByGuestId.values()].filter((count) => count > 1)
        .length,
      sessionsCount: sessions.length,
      playHours: this.round(playMinutes / 60, 2),
      balanceRevenue: this.round(balanceRevenue, 2),
      barRevenue: this.round(barRevenue, 2),
      totalRevenue: this.round(balanceRevenue + barRevenue, 2),
      barSalesCount: sales.length,
    };
  }

  private async buildStoreEffectMetrics({
    tenantId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<Map<string, MarketingCampaignStoreEffectMetrics>> {
    if (guestIds.length === 0) {
      return new Map();
    }

    const guestWhere = { guestId: { in: guestIds } };
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const buckets = new Map<
      string,
      MarketingCampaignStoreEffectMetrics & {
        activeGuestIds: Set<string>;
        sessionsByGuestId: Map<string, number>;
      }
    >();
    const getBucket = (storeId: string | null) => {
      const key = storeId ?? 'unallocated';
      const existing = buckets.get(key);

      if (existing) {
        return existing;
      }

      const bucket = {
        ...this.emptyStoreEffectMetrics(),
        activeGuestIds: new Set<string>(),
        sessionsByGuestId: new Map<string, number>(),
      };
      buckets.set(key, bucket);

      return bucket;
    };

    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          ...guestWhere,
          startedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { storeId: true, guestId: true, durationMinutes: true },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...guestWhere,
          happenedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { storeId: true, type: true, amount: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          ...guestWhere,
          saleDate: { gte: from, lt: to },
          isCanceled: false,
          ...storeWhere,
        },
        select: { storeId: true, guestId: true, revenue: true },
      }),
    ]);

    sessions.forEach((session) => {
      const bucket = getBucket(session.storeId);
      bucket.sessionsCount += 1;
      bucket.playHours += (session.durationMinutes ?? 0) / 60;

      if (session.guestId) {
        bucket.activeGuestIds.add(session.guestId);
        bucket.sessionsByGuestId.set(
          session.guestId,
          (bucket.sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }
    });

    transactions.forEach((transaction) => {
      const bucket = getBucket(transaction.storeId);
      bucket.balanceRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      const bucket = getBucket(sale.storeId);
      bucket.barRevenue += sale.revenue.toNumber();
      bucket.barSalesCount += 1;

      if (sale.guestId) {
        bucket.activeGuestIds.add(sale.guestId);
      }
    });

    return new Map(
      [...buckets.entries()].map(([key, bucket]) => {
        const activeGuests = bucket.activeGuestIds.size;
        const repeatGuests = [...bucket.sessionsByGuestId.values()].filter(
          (count) => count > 1,
        ).length;

        return [
          key,
          {
            activeGuests,
            repeatGuests,
            sessionsCount: bucket.sessionsCount,
            playHours: this.round(bucket.playHours, 2),
            balanceRevenue: this.round(bucket.balanceRevenue, 2),
            barRevenue: this.round(bucket.barRevenue, 2),
            totalRevenue: this.round(
              bucket.balanceRevenue + bucket.barRevenue,
              2,
            ),
            barSalesCount: bucket.barSalesCount,
          },
        ];
      }),
    );
  }

  private emptyStoreEffectMetrics(): MarketingCampaignStoreEffectMetrics {
    return {
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private emptyExecutionMetrics(): MarketingCampaignExecutionMetrics {
    return {
      contacts: 0,
      directContacts: 0,
      respondedContacts: 0,
      linkedGuests: 0,
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private diffStoreEffectMetrics(
    after: MarketingCampaignStoreEffectMetrics,
    before: MarketingCampaignStoreEffectMetrics,
  ): MarketingCampaignStoreEffectMetrics {
    return {
      activeGuests: this.round(after.activeGuests - before.activeGuests, 2),
      repeatGuests: this.round(after.repeatGuests - before.repeatGuests, 2),
      sessionsCount: this.round(after.sessionsCount - before.sessionsCount, 2),
      playHours: this.round(after.playHours - before.playHours, 2),
      balanceRevenue: this.round(
        after.balanceRevenue - before.balanceRevenue,
        2,
      ),
      barRevenue: this.round(after.barRevenue - before.barRevenue, 2),
      totalRevenue: this.round(after.totalRevenue - before.totalRevenue, 2),
      barSalesCount: this.round(after.barSalesCount - before.barSalesCount, 2),
    };
  }

  private resolveEffectWindow(campaign: {
    periodFrom: Date | null;
    periodTo: Date | null;
    dueAt: Date | null;
    createdAt: Date;
  }) {
    const afterFrom = new Date(
      campaign.periodFrom ?? campaign.dueAt ?? campaign.createdAt,
    );
    const now = new Date();
    let afterTo = campaign.periodTo
      ? this.toExclusiveEffectEnd(campaign.periodTo)
      : now;

    if (afterTo <= afterFrom) {
      afterTo = new Date(afterFrom.getTime() + DAY_MS);
    }

    const durationMs = Math.max(
      DAY_MS,
      afterTo.getTime() - afterFrom.getTime(),
    );
    const beforeTo = new Date(afterFrom);
    const beforeFrom = new Date(afterFrom.getTime() - durationMs);

    return { afterFrom, afterTo, beforeFrom, beforeTo };
  }

  private toExclusiveEffectEnd(value: Date) {
    const result = new Date(value);

    if (
      result.getUTCHours() === 0 &&
      result.getUTCMinutes() === 0 &&
      result.getUTCSeconds() === 0 &&
      result.getUTCMilliseconds() === 0
    ) {
      result.setUTCDate(result.getUTCDate() + 1);
    }

    return result;
  }

  private emptyEffectPeriod(
    from: Date,
    to: Date,
  ): MarketingCampaignEffectPeriod {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS)),
      contacts: 0,
      directContacts: 0,
      respondedContacts: 0,
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private round(value: number, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  private ratio(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return null;
    }

    return this.round((numerator / denominator) * 100, 1);
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

  private async getCampaignContactEventsForExport(
    tenantId: string,
    campaignId: string,
    audienceId: string | null,
  ): Promise<MarketingCampaignExportContactEvent[]> {
    return this.prisma.guestCrmContactEvent.findMany({
      where: {
        tenantId,
        OR: [
          { marketingCampaignId: campaignId },
          ...(audienceId ? [{ audienceId }] : []),
        ],
      },
      orderBy: [{ contactedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
      select: {
        id: true,
        channel: true,
        result: true,
        note: true,
        contactedAt: true,
        marketingCampaignId: true,
        audience: { select: { name: true } },
        guest: {
          select: {
            externalDomain: true,
            externalGuestId: true,
            fullNameMasked: true,
            phoneMasked: true,
            emailMasked: true,
          },
        },
        lead: {
          select: {
            fullNameMasked: true,
            phoneMasked: true,
            emailMasked: true,
            matchedGuestId: true,
          },
        },
        createdByUser: { select: { fullName: true, email: true } },
      },
    });
  }

  private effectPeriodCsvRow(
    title: string,
    period: MarketingCampaignEffectPeriod,
  ): CsvCell[] {
    return [
      'Периоды',
      `${title}: ${this.formatExportDate(period.from)} - ${this.formatExportDate(
        period.to,
      )}`,
      period.contacts,
      period.activeGuests,
      period.repeatGuests,
      period.sessionsCount,
      period.playHours,
      period.totalRevenue,
      period.barRevenue,
    ];
  }

  private executionCsvRow(
    section: string,
    row: MarketingCampaignExecutionBreakdownRow,
  ): CsvCell[] {
    return [
      section,
      row.label,
      row.metrics.contacts,
      row.metrics.respondedContacts,
      row.metrics.linkedGuests,
      row.metrics.activeGuests,
      row.metrics.repeatGuests,
      row.metrics.totalRevenue,
      row.metrics.barRevenue,
    ];
  }

  private guestExportLabel(
    guest: MarketingCampaignExportContactEvent['guest'],
  ) {
    if (!guest) {
      return null;
    }

    return (
      guest.fullNameMasked ??
      guest.phoneMasked ??
      guest.emailMasked ??
      [guest.externalDomain, guest.externalGuestId].filter(Boolean).join(' / ')
    );
  }

  private leadExportLabel(lead: MarketingCampaignExportContactEvent['lead']) {
    if (!lead) {
      return null;
    }

    return (
      lead.fullNameMasked ??
      lead.phoneMasked ??
      lead.emailMasked ??
      lead.matchedGuestId ??
      'CRM-лид'
    );
  }

  private isWithinEffectWindow(value: Date, from: string, to: string) {
    const timestamp = value.getTime();

    return (
      timestamp >= new Date(from).getTime() &&
      timestamp < new Date(to).getTime()
    );
  }

  private formatExportDate(value: string | null) {
    if (!value) {
      return null;
    }

    return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
  }

  private formatExportDateTime(value: Date | string | null) {
    if (!value) {
      return null;
    }

    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private formatExportPercent(value: number | null) {
    if (value === null) {
      return null;
    }

    return `${this.round(value, 1)}%`;
  }

  private async buildCampaignExportXlsx(rows: CsvCell[][]) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Campaign');
    worksheet.columns = [
      { key: 'section', width: 20 },
      { key: 'metric', width: 34 },
      { key: 'value', width: 24 },
      { key: 'comment', width: 42 },
      { key: 'extra1', width: 20 },
      { key: 'extra2', width: 20 },
      { key: 'extra3', width: 18 },
      { key: 'extra4', width: 20 },
      { key: 'extra5', width: 20 },
      { key: 'extra6', width: 22 },
      { key: 'extra7', width: 38 },
    ];

    rows.forEach((row, index) => {
      const excelRow = worksheet.addRow(row.map((cell) => cell ?? ''));
      const previousRow = rows[index - 1];
      const isHeader =
        row.length > 0 &&
        (index === 0 || Boolean(previousRow && previousRow.length === 0));

      if (isHeader && typeof row[0] === 'string') {
        excelRow.font = { bold: true };
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
      }
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private toCsv(rows: CsvCell[][]) {
    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private csvRow(row: CsvCell[]) {
    return row.map((cell) => this.csvCell(cell)).join(';');
  }

  private csvCell(cell: CsvCell) {
    const value = cell === null ? '' : String(cell);

    return `"${value.replaceAll('"', '""')}"`;
  }

  private resolveExportFormat(
    format: string | null | undefined,
  ): MarketingCampaignExportFormat {
    if (!format || format === 'csv') {
      return 'csv';
    }

    if (format === 'xlsx') {
      return 'xlsx';
    }

    throw new BadRequestException('format must be csv or xlsx');
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
    id: string;
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
    `Карточка кампании: /marketing/campaigns/${campaign.id}`,
    `Цель: ${campaignGoalForTask(campaign.goal)}`,
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
      ? `Согласия: доступно ${coverage.contactable} из ${coverage.targetTotal}, исключено ${coverage.excluded}; отказов ${coverage.phoneDenied}, отписок ${coverage.phoneUnsubscribed}, неизвестных ${coverage.phoneUnknown}`
      : 'Согласия: группа не выбрана или пуста',
    '',
    'Инструкция:',
    campaignChannelInstruction(campaign.channel),
    '',
    'Зафиксировать в CRM:',
    '- кому сделали контакт и по какому каналу;',
    '- результат: дозвон, ответ, отказ, бронь, интерес, неактуально;',
    '- следующий шаг, дату следующего контакта и ответственного;',
    '- факт визита или использования промо, если он появился.',
    campaign.note ? `Заметка: ${campaign.note}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function campaignGoalForTask(goal: string) {
  const labels: Record<string, string> = {
    RETURN_GUESTS: 'Вернуть гостей',
    REPEAT_VISIT: 'Повторный визит',
    WEAK_HOURS: 'Заполнить тихие часы',
    BAR_GROWTH: 'Вырастить бар',
    EVENT_PROMO: 'Событие или бронь',
    PROMO_BUNDLE: 'Промо-набор',
  };

  return labels[goal] ?? goal;
}

function campaignChannelInstruction(channel: string | null) {
  const normalized = (channel ?? '').toLocaleLowerCase('ru-RU');

  if (normalized.includes('звон')) {
    return 'Позвонить гостям из группы, начать с самых ценных или срочных. Не обещать автоматические бонусы без ручного подтверждения. После звонка сразу записать результат контакта.';
  }

  if (
    normalized.includes('месс') ||
    normalized.includes('sms') ||
    normalized.includes('telegram') ||
    normalized.includes('max') ||
    normalized.includes('рассыл')
  ) {
    return 'Перед отправкой проверить согласие на контакт и исключить отписки. Текст должен содержать оффер, срок действия, клубы и понятный следующий шаг для гостя.';
  }

  if (normalized.includes('объяв')) {
    return 'Передать администраторам короткий текст объявления, период действия, клубы, лимиты и правила применения. Отдельно объяснить, какие факты нужно отметить в CRM.';
  }

  if (normalized.includes('соц')) {
    return 'Опубликовать оффер с датой, клубом, лимитами и ссылкой/контактом для заявки. Входящие обращения заводить как CRM-лиды или контактные события кампании.';
  }

  if (normalized.includes('crm')) {
    return 'Идти по CRM-списку, не выгружая персональные данные в сторонние файлы. Работать только с доступными контактами и фиксировать результат по каждому гостю.';
  }

  return 'Проверить канал, согласия, лимиты и ответственного. Выполнять контакт вручную и фиксировать все факты в CRM, чтобы затем измерить эффект кампании.';
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

function confirmedTransactionSpendAmount(type: string | null, amount: number) {
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }

  if (isBalanceTopUpOperationType(type)) {
    return 0;
  }

  return Math.abs(amount);
}

function isBalanceTopUpOperationType(type: string | null) {
  const normalizedType = normalizeExternalType(type);

  return (
    normalizedType === 'plus' ||
    normalizedType === 'popolnenie' ||
    normalizedType.includes('deposit') ||
    normalizedType.includes('top_up') ||
    normalizedType.includes('recharge') ||
    normalizedType.includes('РїРѕРїРѕР»РЅ')
  );
}

function normalizeExternalType(type: string | null) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return key in obj;
}
