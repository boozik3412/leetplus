import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import {
  evaluateGuestGameLedgerRule,
  guestGameRuleActivationAt,
  guestGameSessionTypeFromConditions,
  guestGameStringArray,
} from './guest-game-rule-evaluator';
import {
  compareGuestGameRuleDecisionPair,
  type GuestGameComparisonSourceFreshness,
} from './guest-game-rule-comparison';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type TimelineQuery = {
  from?: string;
  to?: string;
  sort?: string;
  storeId?: string;
  type?: string;
  status?: string;
  correlation?: string;
  limit?: string;
};

type TimelineItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  description: string | null;
  status: string | null;
  happenedAt: string;
  storeId: string | null;
  storeName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  traceId: string | null;
  evaluationRunId: string | null;
  sourceHash: string | null;
  sessionExternalId: string | null;
  payload: unknown;
};

@Injectable()
export class GuestGamificationLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLedgerService: GuestActivityLedgerService,
  ) {}

  async searchProfiles(user: AuthenticatedUser, query: string | undefined) {
    const rawQuery = (query ?? '').trim();
    const digits = rawQuery.replace(/\D/g, '');
    const phoneTail = digits.length >= 3 ? digits.slice(-8) : '';

    if (!phoneTail && rawQuery.length < 3) {
      throw new BadRequestException(
        'Введите минимум 3 цифры телефона для поиска гостя.',
      );
    }

    const rows = await this.prisma.guestGameProfile.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          ...(phoneTail
            ? [
                { contactMasked: { contains: phoneTail } },
                { guest: { phoneMasked: { contains: phoneTail } } },
              ]
            : []),
          { displayName: { contains: rawQuery, mode: 'insensitive' } },
          { guest: { externalGuestId: { contains: rawQuery } } },
        ],
      },
      include: {
        guest: {
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
            phoneMasked: true,
            lastActivityAt: true,
          },
        },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      take: 25,
    });

    return {
      items: rows.map((profile) => ({
        profileId: profile.id,
        guestId: profile.guestId,
        displayName: profile.displayName,
        contactMasked:
          profile.contactMasked ?? profile.guest?.phoneMasked ?? null,
        externalProvider: profile.guest?.externalProvider ?? null,
        externalDomain: profile.guest?.externalDomain ?? null,
        externalGuestId: profile.guest?.externalGuestId ?? null,
        lastActivityAt:
          profile.lastActivityAt?.toISOString() ??
          profile.guest?.lastActivityAt?.toISOString() ??
          null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      })),
    };
  }

  async getProfileLog(
    user: AuthenticatedUser,
    profileId: string,
    query: TimelineQuery,
  ) {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { id: profileId, tenantId: user.tenantId },
      include: {
        guest: {
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
            phoneMasked: true,
            lastActivityAt: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Игровой профиль гостя не найден.');
    }

    const from = parseDate(query.from);
    const to = parseDate(query.to);
    const sort = query.sort === 'asc' ? 'asc' : 'desc';
    const limit = clampNumber(
      Number(query.limit ?? DEFAULT_LIMIT),
      20,
      MAX_LIMIT,
    );
    const storeId = nullableString(query.storeId);
    const typeFilter = nullableString(query.type);
    const statusFilter = nullableString(query.status);
    const correlationFilter = nullableString(query.correlation);

    const [
      syncState,
      gameTimeline,
      langameTimeline,
      comparison,
      stores,
      retentionPolicy,
      retentionRun,
    ] = await Promise.all([
      this.findSyncState(user.tenantId, profile),
      this.buildGameTimeline(user.tenantId, profile, {
        from,
        to,
        sort,
        storeId,
        typeFilter,
        statusFilter,
        correlationFilter,
        limit,
      }),
      this.buildLangameTimeline(user.tenantId, profile, {
        from,
        to,
        sort,
        storeId,
        typeFilter,
        statusFilter,
        correlationFilter,
        limit,
      }),
      this.buildComparison(user.tenantId, profile, {
        from,
        to,
        storeId,
        correlationFilter,
        limit,
      }),
      this.prisma.store.findMany({
        where: { tenantId: user.tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.guestGameDataRetentionPolicy.findUnique({
        where: { tenantId: user.tenantId },
      }),
      this.prisma.guestGameDataRetentionRun.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    return {
      profile: {
        id: profile.id,
        guestId: profile.guestId,
        displayName: profile.displayName,
        contactMasked:
          profile.contactMasked ?? profile.guest?.phoneMasked ?? null,
        externalProvider: profile.guest?.externalProvider ?? null,
        externalDomain: profile.guest?.externalDomain ?? null,
        externalGuestId: profile.guest?.externalGuestId ?? null,
        level: profile.level,
        xp: profile.xp,
        status: profile.status,
        lastActivityAt:
          profile.lastActivityAt?.toISOString() ??
          profile.guest?.lastActivityAt?.toISOString() ??
          null,
        createdAt: profile.createdAt.toISOString(),
      },
      permissions: {
        canViewPii: canViewGamePii(user),
      },
      filters: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        sort,
        storeId,
        type: typeFilter,
        status: statusFilter,
        correlation: correlationFilter,
        limit,
        stores,
      },
      syncState: syncState ? mapPlain(syncState) : null,
      gameTimeline,
      langameTimeline,
      comparison,
      comparisonSummary: summarizeComparison(comparison),
      retention: {
        policy: retentionPolicy
          ? mapPlain(retentionPolicy)
          : {
              rawRetentionDays: 365,
              factRetentionDays: 1095,
              decisionRetentionDays: 1095,
              auditRetentionDays: 1095,
              liveCleanupEnabled: false,
              source: 'DEFAULT',
            },
        latestRun: retentionRun ? mapPlain(retentionRun) : null,
      },
      notes: [
        'Неуспешные попытки до включения audit-log могли не сохраняться.',
        'Лог Langame используется для диагностики и пока не влияет на боевую выдачу наград.',
      ],
    };
  }

  async syncProfile(
    user: AuthenticatedUser,
    profileId: string,
    query: { storeId?: string },
  ) {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { id: profileId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Игровой профиль гостя не найден.');
    }

    return this.activityLedgerService.syncProfile({
      tenantId: user.tenantId,
      profileId,
      storeId: nullableString(query.storeId),
      reason: 'GAMIFICATION_LOG_MANUAL_SYNC',
    });
  }

  private async findSyncState(
    tenantId: string,
    profile: {
      id: string;
      guestId: string | null;
      guest?: { externalGuestId: string | null } | null;
    },
  ) {
    return this.prisma.guestActivitySyncState.findFirst({
      where: {
        tenantId,
        OR: [
          { profileId: profile.id },
          ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ...(profile.guest?.externalGuestId
            ? [{ externalGuestId: profile.guest.externalGuestId }]
            : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async buildGameTimeline(
    tenantId: string,
    profile: { id: string; guestId: string | null },
    options: TimelineOptions,
  ): Promise<TimelineItem[]> {
    const whereBase = {
      tenantId,
      OR: [
        { profileId: profile.id },
        ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
      ],
      ...(options.storeId ? { storeId: options.storeId } : {}),
    };
    const dateWhere = dateRangeWhere(options.from, options.to);
    const orderBy = { happenedAt: options.sort };
    const queryLimit = options.correlationFilter ? MAX_LIMIT : options.limit;

    const [auditEvents, gameEvents, rewards, deliveries, decisions] =
      await Promise.all([
        this.prisma.guestGameAuditEvent.findMany({
          where: {
            ...whereBase,
            ...(dateWhere ? { happenedAt: dateWhere } : {}),
            ...(options.typeFilter ? { action: options.typeFilter } : {}),
            ...(options.statusFilter ? { status: options.statusFilter } : {}),
          },
          include: { store: { select: { id: true, name: true } } },
          orderBy,
          take: queryLimit,
        }),
        this.prisma.guestGameEvent.findMany({
          where: {
            ...whereBase,
            ...(dateWhere ? { occurredAt: dateWhere } : {}),
            ...(options.typeFilter ? { eventType: options.typeFilter } : {}),
          },
          include: {
            lootBox: { select: { id: true, name: true } },
            mission: { select: { id: true, name: true } },
            season: { select: { id: true, name: true } },
          },
          orderBy: { occurredAt: options.sort },
          take: queryLimit,
        }),
        this.prisma.guestGameReward.findMany({
          where: {
            ...whereBase,
            ...(dateWhere ? { qualifiedAt: dateWhere } : {}),
            ...(options.statusFilter ? { status: options.statusFilter } : {}),
          },
          include: {
            store: { select: { id: true, name: true } },
            lootBox: { select: { id: true, name: true } },
            mission: { select: { id: true, name: true } },
            season: { select: { id: true, name: true } },
          },
          orderBy: { qualifiedAt: options.sort },
          take: queryLimit,
        }),
        this.prisma.guestGameDelivery.findMany({
          where: {
            ...whereBase,
            ...(dateWhere ? { preparedAt: dateWhere } : {}),
            ...(options.statusFilter ? { status: options.statusFilter } : {}),
          },
          include: {
            store: { select: { id: true, name: true } },
            reward: {
              select: {
                id: true,
                rewardLabel: true,
                lootBox: { select: { id: true, name: true } },
                mission: { select: { id: true, name: true } },
                season: { select: { id: true, name: true } },
              },
            },
            events: {
              orderBy: { createdAt: options.sort },
              take: 20,
            },
          },
          orderBy: { preparedAt: options.sort },
          take: queryLimit,
        }),
        this.prisma.guestGameRuleDecision.findMany({
          where: {
            tenantId,
            OR: [
              { profileId: profile.id },
              ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
            ],
            ...(options.storeId ? { storeId: options.storeId } : {}),
            ...(dateWhere ? { evaluatedAt: dateWhere } : {}),
            ...(options.statusFilter ? { status: options.statusFilter } : {}),
          },
          orderBy: [{ evaluatedAt: options.sort }, { createdAt: options.sort }],
          take: queryLimit,
        }),
      ]);

    const items: TimelineItem[] = [
      ...auditEvents.map((event) => ({
        id: event.id,
        source: 'AUDIT',
        kind: event.action,
        title: auditEventTitle(event.action, event.status),
        description: event.reasonText,
        status: event.status,
        happenedAt: event.happenedAt.toISOString(),
        storeId: event.storeId,
        storeName: event.store?.name ?? null,
        entityType: event.entityType,
        entityId: event.entityId,
        entityName: null,
        reasonCode: event.reasonCode,
        reasonText: event.reasonText,
        traceId: event.traceId,
        evaluationRunId: jsonString(event.payload, 'evaluationRunId'),
        sourceHash: jsonString(event.payload, 'sourceHash'),
        sessionExternalId: jsonString(event.payload, 'sessionExternalId'),
        payload: event.payload,
      })),
      ...gameEvents.map((event) => {
        const entity = gameEventEntity(event);
        return {
          id: event.id,
          source: 'GAME_EVENT',
          kind: event.eventType,
          title: `Событие: ${event.eventType}`,
          description: event.note,
          status: null,
          happenedAt: event.occurredAt.toISOString(),
          storeId: null,
          storeName: null,
          entityType: entity.type,
          entityId: entity.id,
          entityName: entity.name,
          reasonCode: null,
          reasonText: null,
          traceId: jsonString(event.payload, 'traceId'),
          evaluationRunId: jsonString(event.payload, 'evaluationRunId'),
          sourceHash: jsonString(event.payload, 'sourceHash'),
          sessionExternalId: jsonString(event.payload, 'sessionExternalId'),
          payload: event.payload,
        };
      }),
      ...rewards.map((reward) => {
        const entity = rewardEntity(reward);
        return {
          id: reward.id,
          source: 'REWARD',
          kind: reward.source,
          title: `Награда: ${reward.rewardLabel}`,
          description: reward.note,
          status: reward.status,
          happenedAt: reward.qualifiedAt.toISOString(),
          storeId: reward.storeId,
          storeName: reward.store?.name ?? null,
          entityType: entity.type,
          entityId: entity.id,
          entityName: entity.name,
          reasonCode: null,
          reasonText: null,
          traceId: jsonString(reward.evidence, 'traceId'),
          evaluationRunId: jsonString(reward.evidence, 'evaluationRunId'),
          sourceHash: jsonString(reward.evidence, 'sourceHash'),
          sessionExternalId: jsonString(reward.evidence, 'sessionExternalId'),
          payload: {
            rewardType: reward.rewardType,
            rewardAmount: decimalToNumber(reward.rewardAmount),
            rewardRarity: reward.rewardRarity,
            evidence: reward.evidence,
          },
        };
      }),
      ...deliveries.flatMap((delivery) => [
        {
          id: delivery.id,
          source: 'DELIVERY',
          kind: delivery.channel,
          title: `Выдача: ${delivery.messageTitle}`,
          description: delivery.note ?? delivery.messageBody,
          status: delivery.status,
          happenedAt: delivery.preparedAt.toISOString(),
          storeId: delivery.storeId,
          storeName: delivery.store?.name ?? null,
          entityType: 'REWARD',
          entityId: delivery.rewardId,
          entityName: delivery.reward.rewardLabel,
          reasonCode: delivery.readinessStatus,
          reasonText: null,
          traceId: jsonString(delivery.metadata, 'traceId'),
          evaluationRunId: jsonString(delivery.metadata, 'evaluationRunId'),
          sourceHash: jsonString(delivery.metadata, 'sourceHash'),
          sessionExternalId: jsonString(delivery.metadata, 'sessionExternalId'),
          payload: {
            blockers: delivery.blockers,
            metadata: delivery.metadata,
          },
        },
        ...delivery.events.map((event) => ({
          id: event.id,
          source: 'DELIVERY_EVENT',
          kind: event.eventType,
          title: `Событие выдачи: ${event.eventType}`,
          description: event.note,
          status: event.toStatus,
          happenedAt: event.createdAt.toISOString(),
          storeId: delivery.storeId,
          storeName: delivery.store?.name ?? null,
          entityType: 'REWARD',
          entityId: delivery.rewardId,
          entityName: delivery.reward.rewardLabel,
          reasonCode: event.fromStatus,
          reasonText: event.channel,
          traceId: jsonString(event.payload, 'traceId'),
          evaluationRunId: jsonString(event.payload, 'evaluationRunId'),
          sourceHash: jsonString(event.payload, 'sourceHash'),
          sessionExternalId: jsonString(event.payload, 'sessionExternalId'),
          payload: event.payload,
        })),
      ]),
      ...decisions.map((decision) => ({
        id: decision.id,
        source: 'RULE_DECISION',
        kind: `${decision.evaluationMode}:${decision.ruleType}`,
        title: `${decision.evaluationMode} проверка: ${decision.ruleName ?? decision.ruleId}`,
        description: ruleDecisionReason(decision),
        status: decision.status,
        happenedAt: decision.evaluatedAt.toISOString(),
        storeId: decision.storeId,
        storeName: null,
        entityType: decision.ruleType,
        entityId: decision.ruleId,
        entityName: decision.ruleName,
        reasonCode: decision.sourceFactKind,
        reasonText: ruleDecisionReason(decision),
        traceId: decision.traceId,
        evaluationRunId: decision.evaluationRunId,
        sourceHash: null,
        sessionExternalId: null,
        payload: {
          evaluationMode: decision.evaluationMode,
          evaluatorVersion: decision.evaluatorVersion,
          eventId: decision.eventId,
          sourceEventType: decision.sourceEventType,
          sourceFactId: decision.sourceFactId,
          input: decision.input,
          evidence: decision.evidence,
          reasons: decision.reasons,
          blockers: decision.blockers,
        },
      })),
    ];

    return sortAndLimitTimeline(
      filterTimelineByCorrelation(items, options.correlationFilter),
      options.sort,
      options.limit,
    );
  }

  private async buildLangameTimeline(
    tenantId: string,
    profile: {
      id: string;
      guestId: string | null;
      guest?: {
        externalDomain: string | null;
        externalGuestId: string | null;
      } | null;
    },
    options: TimelineOptions,
  ): Promise<TimelineItem[]> {
    const baseWhere = {
      tenantId,
      OR: [
        { profileId: profile.id },
        ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
        ...(profile.guest?.externalGuestId
          ? [{ externalGuestId: profile.guest.externalGuestId }]
          : []),
      ],
      ...(options.storeId ? { storeId: options.storeId } : {}),
    };
    const dateWhere = dateRangeWhere(options.from, options.to);
    const queryLimit = options.correlationFilter ? MAX_LIMIT : options.limit;

    const [rawRecords, facts] = await Promise.all([
      this.prisma.guestActivityRawRecord.findMany({
        where: {
          ...baseWhere,
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
          ...(options.typeFilter ? { rawType: options.typeFilter } : {}),
          ...(options.statusFilter
            ? { parseStatus: options.statusFilter }
            : {}),
        },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ happenedAt: options.sort }, { createdAt: options.sort }],
        take: queryLimit,
      }),
      this.prisma.guestActivityFact.findMany({
        where: {
          ...baseWhere,
          lifecycleStatus: 'ACTIVE',
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
          ...(options.typeFilter ? { factType: options.typeFilter } : {}),
        },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ happenedAt: options.sort }, { createdAt: options.sort }],
        take: queryLimit,
      }),
    ]);

    const items: TimelineItem[] = [
      ...rawRecords.map((record) => ({
        id: record.id,
        source: 'LANGAME_RAW',
        kind: record.rawType ?? record.sourceKind,
        title: record.rawText ?? `Langame ${record.sourceKind}`,
        description: record.sourceKey,
        status: record.parseStatus,
        happenedAt:
          record.happenedAt?.toISOString() ?? record.createdAt.toISOString(),
        storeId: record.storeId,
        storeName: record.store?.name ?? null,
        entityType: 'LANGAME_RECORD',
        entityId: record.sourceHash,
        entityName: record.rawType,
        reasonCode: record.externalClubId,
        reasonText: null,
        traceId: null,
        evaluationRunId: null,
        sourceHash: record.sourceHash,
        sessionExternalId: record.sessionExternalId,
        payload: record.rawPayload,
      })),
      ...facts.map((fact) => ({
        id: fact.id,
        source: 'LANGAME_FACT',
        kind: fact.factType,
        title: factTitle(fact.factType),
        description: fact.tariffName,
        status: fact.confidence,
        happenedAt:
          fact.happenedAt?.toISOString() ?? fact.createdAt.toISOString(),
        storeId: fact.storeId,
        storeName: fact.store?.name ?? null,
        entityType: 'LANGAME_FACT',
        entityId: fact.sourceHash,
        entityName: fact.tariffType,
        reasonCode: fact.sourceKind,
        reasonText: null,
        traceId: null,
        evaluationRunId: null,
        sourceHash: fact.sourceHash,
        sessionExternalId: fact.sessionExternalId,
        payload: {
          evidence: fact.evidence,
          amount: decimalToNumber(fact.amount),
          bonusAmount: decimalToNumber(fact.bonusAmount),
          durationMinutes: fact.durationMinutes,
          parserVersion: fact.parserVersion,
          normalizationRunId: fact.normalizationRunId,
          lifecycleStatus: fact.lifecycleStatus,
        },
      })),
    ];

    return sortAndLimitTimeline(
      filterTimelineByCorrelation(items, options.correlationFilter),
      options.sort,
      options.limit,
    );
  }

  private async buildComparison(
    tenantId: string,
    profile: { id: string; guestId: string | null },
    options: {
      from: Date | null;
      to: Date | null;
      storeId: string | null;
      correlationFilter: string | null;
      limit: number;
    },
  ) {
    const dateWhere = dateRangeWhere(options.from, options.to);
    const [
      lootBoxes,
      missions,
      seasons,
      rewards,
      facts,
      audits,
      decisions,
      syncState,
    ] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.guestGameReward.findMany({
        where: {
          tenantId,
          OR: [
            { profileId: profile.id },
            ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ],
          ...(dateWhere ? { qualifiedAt: dateWhere } : {}),
        },
        orderBy: { qualifiedAt: 'desc' },
      }),
      this.prisma.guestActivityFact.findMany({
        where: {
          tenantId,
          lifecycleStatus: 'ACTIVE',
          OR: [
            { profileId: profile.id },
            ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ],
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
        },
        include: {
          store: { select: { id: true, name: true, timeZone: true } },
        },
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.guestGameAuditEvent.findMany({
        where: {
          tenantId,
          OR: [
            { profileId: profile.id },
            ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ],
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
        },
        orderBy: { happenedAt: 'desc' },
        take: 300,
      }),
      this.prisma.guestGameRuleDecision.findMany({
        where: {
          tenantId,
          OR: [
            { profileId: profile.id },
            ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ],
          ...(dateWhere ? { evaluatedAt: dateWhere } : {}),
        },
        orderBy: [{ evaluatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.prisma.guestActivitySyncState.findFirst({
        where: {
          tenantId,
          OR: [
            { profileId: profile.id },
            ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
          ],
          ...(options.storeId ? { storeId: options.storeId } : {}),
        },
        orderBy: [{ lastFinishedAt: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const sourceFreshness = guestActivitySourceFreshness(syncState);

    const ruleRows = [
      ...lootBoxes
        .filter((rule) => matchesStore(rule.storeIds, options.storeId))
        .map((rule) => ({
          type: 'LOOT_BOX',
          id: rule.id,
          title: rule.name,
          triggerKind: rule.triggerKind,
          sessionType: rule.sessionType,
          createdAt: rule.createdAt,
          activatedAt: guestGameRuleActivationAt(rule.createdAt, rule.limits),
          periodFrom: null,
          periodTo: null,
          periodRules: rule.periodRules,
          storeIds: guestGameStringArray(rule.storeIds),
        })),
      ...missions
        .filter((rule) => matchesStore(rule.storeIds, options.storeId))
        .map((rule) => ({
          type: 'MISSION',
          id: rule.id,
          title: rule.name,
          triggerKind: rule.triggerKind,
          sessionType: guestGameSessionTypeFromConditions(rule.conditions),
          createdAt: rule.createdAt,
          activatedAt: guestGameRuleActivationAt(
            rule.createdAt,
            rule.conditions,
          ),
          periodFrom: rule.periodFrom,
          periodTo: rule.periodTo,
          periodRules: rule.conditions,
          storeIds: guestGameStringArray(rule.storeIds),
        })),
      ...seasons
        .filter((rule) => matchesStore(rule.storeIds, options.storeId))
        .map((rule) => ({
          type: 'BATTLE_PASS',
          id: rule.id,
          title: rule.name,
          triggerKind: 'BATTLE_PASS',
          sessionType: null,
          createdAt: rule.createdAt,
          activatedAt: rule.periodFrom ?? rule.createdAt,
          periodFrom: rule.periodFrom,
          periodTo: rule.periodTo,
          periodRules: null,
          storeIds: guestGameStringArray(rule.storeIds),
        })),
    ].slice(0, options.limit);

    const rows = ruleRows.map((rule) => {
      const ruleRewards = rewards.filter((reward) =>
        rewardMatchesRule(reward, rule),
      );
      const ruleAudits = audits.filter(
        (audit) =>
          audit.entityId === rule.id ||
          JSON.stringify(audit.payload ?? {}).includes(rule.id),
      );
      const latestAudit = ruleAudits[0] ?? null;
      const ruleDecisions = decisions.filter(
        (decision) =>
          decision.ruleType === rule.type && decision.ruleId === rule.id,
      );
      const liveDecisions = ruleDecisions.filter(
        (decision) => decision.evaluationMode !== 'SHADOW',
      );
      const shadowDecisions = ruleDecisions.filter(
        (decision) => decision.evaluationMode === 'SHADOW',
      );
      const latestDecision = liveDecisions[0] ?? null;
      const pairedShadowDecision = latestDecision
        ? (shadowDecisions.find(
            (decision) =>
              decision.evaluationRunId === latestDecision.evaluationRunId,
          ) ?? null)
        : (shadowDecisions[0] ?? null);
      const legacyDecision = latestDecision
        ? null
        : legacyRuleDecisionFromAudits(ruleAudits, rule.id);
      const latestShadowDecision = shadowDecisions[0] ?? null;
      const ledgerEvaluation = evaluateGuestGameLedgerRule(
        rule,
        facts,
        options.storeId,
      );
      const matchingFacts = ledgerEvaluation.facts;
      const currentStatus = latestDecision
        ? latestDecision.status
        : legacyDecision
          ? legacyDecision.status
          : 'NOT_EVALUATED';
      const ledgerStatus =
        pairedShadowDecision?.status ??
        latestShadowDecision?.status ??
        ledgerEvaluation.status;
      const comparison = compareGuestGameRuleDecisionPair({
        live: latestDecision,
        shadow: pairedShadowDecision,
        sourceFreshness,
      });
      const shadowSourceFact = pairedShadowDecision?.sourceFactId
        ? facts.find((fact) => fact.id === pairedShadowDecision.sourceFactId)
        : null;

      return {
        ruleType: rule.type,
        ruleId: rule.id,
        title: rule.title,
        triggerKind: rule.triggerKind,
        sessionType: rule.sessionType,
        current: {
          status: currentStatus,
          reason:
            ruleDecisionReason(latestDecision) ??
            legacyDecision?.reason ??
            ruleRewards[0]?.rewardLabel ??
            latestAudit?.reasonText ??
            'Боевая система не сохранила решение по этому правилу в выбранном периоде.',
          evidenceCount:
            liveDecisions.length || legacyDecision
              ? liveDecisions.length + (legacyDecision ? 1 : 0)
              : ruleRewards.length + ruleAudits.length,
          latestAt:
            latestDecision?.evaluatedAt.toISOString() ??
            legacyDecision?.happenedAt ??
            ruleRewards[0]?.qualifiedAt.toISOString() ??
            latestAudit?.happenedAt.toISOString() ??
            null,
          evaluationRunId: latestDecision?.evaluationRunId ?? null,
          evaluatorVersion: latestDecision?.evaluatorVersion ?? null,
          traceId: latestDecision?.traceId ?? latestAudit?.traceId ?? null,
          source: latestDecision
            ? 'RULE_DECISION'
            : legacyDecision
              ? 'LEGACY_AUDIT'
              : ruleRewards.length
                ? 'REWARD_EVIDENCE'
                : 'NONE',
          storeId: latestDecision?.storeId ?? null,
        },
        ledger: {
          status: ledgerStatus,
          reason:
            ruleDecisionReason(pairedShadowDecision ?? latestShadowDecision) ??
            ledgerEvaluation.reason,
          evidenceCount:
            pairedShadowDecision || latestShadowDecision
              ? 1
              : matchingFacts.length,
          evaluationRunId: pairedShadowDecision?.evaluationRunId ?? null,
          evaluatorVersion:
            pairedShadowDecision?.evaluatorVersion ??
            latestShadowDecision?.evaluatorVersion ??
            null,
          evaluatedAt: pairedShadowDecision?.evaluatedAt.toISOString() ?? null,
          source: pairedShadowDecision
            ? 'PAIRED_SHADOW_DECISION'
            : latestShadowDecision
              ? 'UNPAIRED_SHADOW_DECISION'
              : 'DYNAMIC_FALLBACK',
          sourceFreshness,
          sourceFactKind: pairedShadowDecision?.sourceFactKind ?? null,
          sourceConfidence: shadowSourceFact?.confidence ?? null,
          facts: matchingFacts.slice(0, 5).map((fact) => ({
            id: fact.id,
            factType: fact.factType,
            confidence: fact.confidence,
            happenedAt: fact.happenedAt?.toISOString() ?? null,
            tariffName: fact.tariffName,
            tariffType: fact.tariffType,
          })),
        },
        verdict: comparison.verdict,
        differingConditions: comparison.differingConditions,
        paired:
          Boolean(latestDecision) &&
          Boolean(pairedShadowDecision) &&
          latestDecision?.evaluationRunId ===
            pairedShadowDecision?.evaluationRunId,
      };
    });

    const correlation = options.correlationFilter;
    return correlation
      ? rows.filter((row) => includesCorrelation(row, correlation))
      : rows;
  }
}

type TimelineOptions = {
  from: Date | null;
  to: Date | null;
  sort: 'asc' | 'desc';
  storeId: string | null;
  typeFilter: string | null;
  statusFilter: string | null;
  correlationFilter: string | null;
  limit: number;
};

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateRangeWhere(from: Date | null, to: Date | null) {
  if (!from && !to) {
    return null;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function canViewGamePii(user: AuthenticatedUser) {
  return (
    user.isPlatformAdmin ||
    user.role === UserRole.OWNER ||
    user.permissions?.includes('view_guest_game_pii')
  );
}

function mapPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? Number(value.toString()) : null;
}

function sortAndLimitTimeline(
  items: TimelineItem[],
  sort: 'asc' | 'desc',
  limit: number,
) {
  const direction = sort === 'asc' ? 1 : -1;
  return items
    .sort(
      (left, right) =>
        (new Date(left.happenedAt).getTime() -
          new Date(right.happenedAt).getTime()) *
        direction,
    )
    .slice(0, limit);
}

function filterTimelineByCorrelation(
  items: TimelineItem[],
  correlation: string | null,
) {
  return correlation
    ? items.filter((item) => includesCorrelation(item, correlation))
    : items;
}

export function includesCorrelation(value: unknown, correlation: string) {
  const needle = correlation.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  try {
    return JSON.stringify(value).toLowerCase().includes(needle);
  } catch {
    return String(value).toLowerCase().includes(needle);
  }
}

function jsonString(value: unknown, key: string) {
  const object = jsonObject(value);
  const candidate = object?.[key];
  return typeof candidate === 'string' ? candidate : null;
}

function auditEventTitle(action: string, status: string) {
  if (action === 'LOOT_BOX_OPEN') {
    return status === 'SUCCESS'
      ? 'Лутбокс открыт'
      : status === 'BLOCKED'
        ? 'Лутбокс не открылся'
        : 'Попытка открытия лутбокса';
  }

  if (action === 'GAME_SUMMARY') {
    return 'Обновление игрового модуля';
  }

  if (action === 'CHECK_IN') {
    return status === 'SUCCESS' ? 'Чек-ин выполнен' : 'Чек-ин не выполнен';
  }

  return `${action}: ${status}`;
}

function factTitle(factType: string) {
  const labels: Record<string, string> = {
    SESSION_STARTED: 'Старт сессии',
    SESSION_ENDED: 'Завершение сессии',
    PACKAGE_OR_SUBSCRIPTION_PURCHASED: 'Покупка пакета или абонемента',
    PACKAGE_OR_SUBSCRIPTION_USED: 'Использование пакета или абонемента',
    HOURLY_SESSION_STARTED: 'Почасовая сессия',
    HOURLY_PLAY_TIME_ACCUMULATED: 'Наиграно по почасовой оплате',
    PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED:
      'Наиграно по пакету или абонементу',
    PRODUCT_PURCHASED: 'Покупка товара',
    BALANCE_WRITE_OFF: 'Списание баланса',
    BONUS_TOPUP: 'Начисление бонусов',
    VISIT: 'Визит',
    REWARD_TRACE: 'След награды',
  };

  return labels[factType] ?? factType;
}

function gameEventEntity(event: {
  lootBox?: { id: string; name: string } | null;
  mission?: { id: string; name: string } | null;
  season?: { id: string; name: string } | null;
}) {
  if (event.lootBox) {
    return { type: 'LOOT_BOX', id: event.lootBox.id, name: event.lootBox.name };
  }

  if (event.mission) {
    return { type: 'MISSION', id: event.mission.id, name: event.mission.name };
  }

  if (event.season) {
    return {
      type: 'BATTLE_PASS',
      id: event.season.id,
      name: event.season.name,
    };
  }

  return { type: null, id: null, name: null };
}

function rewardEntity(reward: {
  lootBox?: { id: string; name: string } | null;
  mission?: { id: string; name: string } | null;
  season?: { id: string; name: string } | null;
}) {
  return gameEventEntity(reward);
}

function matchesStore(storeIds: unknown, selectedStoreId: string | null) {
  if (!selectedStoreId) {
    return true;
  }

  if (!Array.isArray(storeIds) || storeIds.length === 0) {
    return true;
  }

  return storeIds.includes(selectedStoreId);
}

function rewardMatchesRule(
  reward: {
    lootBoxId: string | null;
    missionId: string | null;
    seasonId: string | null;
  },
  rule: { type: string; id: string },
) {
  if (rule.type === 'LOOT_BOX') {
    return reward.lootBoxId === rule.id;
  }

  if (rule.type === 'MISSION') {
    return reward.missionId === rule.id;
  }

  if (rule.type === 'BATTLE_PASS') {
    return reward.seasonId === rule.id;
  }

  return false;
}

function ruleDecisionReason(
  decision: {
    status: string;
    reasons: Prisma.JsonValue | null;
    blockers: Prisma.JsonValue | null;
  } | null,
) {
  if (!decision) {
    return null;
  }

  const blockers = jsonStringArray(decision.blockers);
  const reasons = jsonStringArray(decision.reasons);

  return decision.status === 'BLOCKED'
    ? (blockers[0] ?? reasons[0] ?? null)
    : (reasons[0] ?? blockers[0] ?? null);
}

function legacyRuleDecisionFromAudits(
  audits: Array<{
    payload: Prisma.JsonValue | null;
    happenedAt: Date;
  }>,
  ruleId: string,
) {
  for (const audit of audits) {
    const payload = jsonObject(audit.payload);
    const liveSession = jsonObject(payload?.liveSession);
    const result = jsonObject(payload?.result);
    const candidates = [
      liveSession?.lootBoxRules,
      result?.lootBoxRules,
      payload?.lootBoxRules,
    ];

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      const rule = candidate
        .map(jsonObject)
        .find((item) => item?.id === ruleId);

      if (!rule || typeof rule.eligible !== 'boolean') {
        continue;
      }

      const blockers = jsonStringArray(rule.blockers);
      const reasons = jsonStringArray(rule.reasons);

      return {
        status: rule.eligible ? 'MATCHED' : 'BLOCKED',
        reason: rule.eligible
          ? (reasons[0] ?? null)
          : (blockers[0] ?? reasons[0] ?? null),
        happenedAt: audit.happenedAt.toISOString(),
      };
    }
  }

  return null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function guestActivitySourceFreshness(
  state: {
    status: string;
    lastSuccessfulTo: Date | null;
  } | null,
): GuestGameComparisonSourceFreshness {
  if (!state?.lastSuccessfulTo) {
    return 'MISSING';
  }

  const staleAfterMs = 10 * 60 * 1000;
  const staleByStatus = ['FAILED', 'PARTIAL'].includes(state.status);
  const staleByTime =
    Date.now() - state.lastSuccessfulTo.getTime() > staleAfterMs;

  return staleByStatus || staleByTime ? 'STALE' : 'FRESH';
}

function summarizeComparison(
  rows: Array<{
    ruleType: string;
    verdict: string;
    paired: boolean;
    current: {
      source: string;
      storeId: string | null;
      evaluatorVersion: string | null;
    };
    ledger: {
      sourceFactKind: string | null;
      sourceConfidence: string | null;
      evaluatorVersion: string | null;
    };
  }>,
) {
  const verdicts = [
    'MATCH',
    'MISMATCH',
    'NOT_EVALUATED',
    'INSUFFICIENT_SOURCE_DATA',
    'STALE_SOURCE',
    'ERROR',
  ];
  const counts = Object.fromEntries(
    verdicts.map((verdict) => [
      verdict,
      rows.filter((row) => row.verdict === verdict).length,
    ]),
  );
  const mismatches = rows.filter((row) => row.verdict === 'MISMATCH');

  return {
    total: rows.length,
    paired: rows.filter((row) => row.paired).length,
    decisionCoverage:
      rows.length > 0
        ? rows.filter((row) => row.current.source === 'RULE_DECISION').length /
          rows.length
        : 0,
    pairCoverage:
      rows.length > 0
        ? rows.filter((row) => row.paired).length / rows.length
        : 0,
    counts,
    mismatch: {
      total: mismatches.length,
      byStore: groupedComparisonCount(
        mismatches.map((row) => row.current.storeId ?? 'UNKNOWN'),
      ),
      byRuleType: groupedComparisonCount(mismatches.map((row) => row.ruleType)),
      bySource: groupedComparisonCount(
        mismatches.map((row) => row.ledger.sourceFactKind ?? 'UNKNOWN'),
      ),
      byConfidence: groupedComparisonCount(
        mismatches.map((row) => row.ledger.sourceConfidence ?? 'UNKNOWN'),
      ),
      byEvaluatorVersion: groupedComparisonCount(
        mismatches.map(
          (row) =>
            row.ledger.evaluatorVersion ??
            row.current.evaluatorVersion ??
            'UNKNOWN',
        ),
      ),
    },
  };
}

function groupedComparisonCount(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );
}
