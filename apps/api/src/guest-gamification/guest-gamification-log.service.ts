import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type TimelineQuery = {
  from?: string;
  to?: string;
  sort?: string;
  storeId?: string;
  type?: string;
  status?: string;
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

    const [syncState, gameTimeline, langameTimeline, comparison, stores] =
      await Promise.all([
        this.findSyncState(user.tenantId, profile),
        this.buildGameTimeline(user.tenantId, profile, {
          from,
          to,
          sort,
          storeId,
          typeFilter,
          statusFilter,
          limit,
        }),
        this.buildLangameTimeline(user.tenantId, profile, {
          from,
          to,
          sort,
          storeId,
          typeFilter,
          statusFilter,
          limit,
        }),
        this.buildComparison(user.tenantId, profile, {
          from,
          to,
          storeId,
          limit,
        }),
        this.prisma.store.findMany({
          where: { tenantId: user.tenantId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
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
        limit,
        stores,
      },
      syncState: syncState ? mapPlain(syncState) : null,
      gameTimeline,
      langameTimeline,
      comparison,
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

    const [auditEvents, gameEvents, rewards, deliveries] = await Promise.all([
      this.prisma.guestGameAuditEvent.findMany({
        where: {
          ...whereBase,
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
          ...(options.typeFilter ? { action: options.typeFilter } : {}),
          ...(options.statusFilter ? { status: options.statusFilter } : {}),
        },
        include: { store: { select: { id: true, name: true } } },
        orderBy,
        take: options.limit,
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
        take: options.limit,
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
        take: options.limit,
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
        take: options.limit,
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
          payload: event.payload,
        })),
      ]),
    ];

    return sortAndLimitTimeline(items, options.sort, options.limit);
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
        take: options.limit,
      }),
      this.prisma.guestActivityFact.findMany({
        where: {
          ...baseWhere,
          ...(dateWhere ? { happenedAt: dateWhere } : {}),
          ...(options.typeFilter ? { factType: options.typeFilter } : {}),
        },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ happenedAt: options.sort }, { createdAt: options.sort }],
        take: options.limit,
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
        payload: {
          evidence: fact.evidence,
          amount: decimalToNumber(fact.amount),
          bonusAmount: decimalToNumber(fact.bonusAmount),
          durationMinutes: fact.durationMinutes,
        },
      })),
    ];

    return sortAndLimitTimeline(items, options.sort, options.limit);
  }

  private async buildComparison(
    tenantId: string,
    profile: { id: string; guestId: string | null },
    options: {
      from: Date | null;
      to: Date | null;
      storeId: string | null;
      limit: number;
    },
  ) {
    const dateWhere = dateRangeWhere(options.from, options.to);
    const [lootBoxes, missions, seasons, rewards, facts, audits] =
      await Promise.all([
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
            OR: [
              { profileId: profile.id },
              ...(profile.guestId ? [{ guestId: profile.guestId }] : []),
            ],
            ...(dateWhere ? { happenedAt: dateWhere } : {}),
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
      ]);

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
        })),
      ...missions
        .filter((rule) => matchesStore(rule.storeIds, options.storeId))
        .map((rule) => ({
          type: 'MISSION',
          id: rule.id,
          title: rule.name,
          triggerKind: rule.triggerKind,
          sessionType: sessionTypeFromConditions(rule.conditions),
          createdAt: rule.createdAt,
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
        })),
    ].slice(0, options.limit);

    return ruleRows.map((rule) => {
      const ruleRewards = rewards.filter((reward) =>
        rewardMatchesRule(reward, rule),
      );
      const ruleAudits = audits.filter(
        (audit) =>
          audit.entityId === rule.id ||
          JSON.stringify(audit.payload ?? {}).includes(rule.id),
      );
      const latestAudit = ruleAudits[0] ?? null;
      const relevantFacts = relevantFactsForRule(
        rule.triggerKind,
        rule.sessionType,
      );
      const matchingFacts = facts.filter((fact) =>
        relevantFacts.includes(fact.factType),
      );
      const currentStatus = ruleRewards.length
        ? 'MATCHED'
        : latestAudit?.status === 'BLOCKED' || latestAudit?.status === 'FAILED'
          ? 'BLOCKED'
          : latestAudit?.status === 'SUCCESS'
            ? 'MATCHED'
            : 'NO_DECISION';
      const ledgerStatus = matchingFacts.length ? 'MATCHED' : 'NO_MATCH';
      const verdict =
        currentStatus === 'NO_DECISION' || ledgerStatus === 'NO_MATCH'
          ? 'INSUFFICIENT_DATA'
          : currentStatus === ledgerStatus
            ? 'MATCH'
            : 'MISMATCH';

      return {
        ruleType: rule.type,
        ruleId: rule.id,
        title: rule.title,
        triggerKind: rule.triggerKind,
        sessionType: rule.sessionType,
        current: {
          status: currentStatus,
          reason:
            ruleRewards[0]?.rewardLabel ??
            latestAudit?.reasonText ??
            'Боевая система не сохранила решение по этому правилу в выбранном периоде.',
          evidenceCount: ruleRewards.length + ruleAudits.length,
          latestAt:
            ruleRewards[0]?.qualifiedAt.toISOString() ??
            latestAudit?.happenedAt.toISOString() ??
            null,
        },
        ledger: {
          status: ledgerStatus,
          reason: matchingFacts.length
            ? `Найдены факты: ${[
                ...new Set(matchingFacts.map((fact) => fact.factType)),
              ].join(', ')}`
            : `Не найдены факты: ${relevantFacts.join(', ')}`,
          evidenceCount: matchingFacts.length,
          facts: matchingFacts.slice(0, 5).map((fact) => ({
            id: fact.id,
            factType: fact.factType,
            confidence: fact.confidence,
            happenedAt: fact.happenedAt?.toISOString() ?? null,
            tariffName: fact.tariffName,
            tariffType: fact.tariffType,
          })),
        },
        verdict,
      };
    });
  }
}

type TimelineOptions = {
  from: Date | null;
  to: Date | null;
  sort: 'asc' | 'desc';
  storeId: string | null;
  typeFilter: string | null;
  statusFilter: string | null;
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

function sessionTypeFromConditions(conditions: Prisma.JsonValue | null) {
  if (
    !conditions ||
    typeof conditions !== 'object' ||
    Array.isArray(conditions)
  ) {
    return null;
  }

  const value = (conditions as Record<string, unknown>).sessionType;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function relevantFactsForRule(
  triggerKind: string | null,
  sessionType: string | null,
) {
  const trigger = (triggerKind ?? '').toUpperCase();
  const session = (sessionType ?? '').toUpperCase();

  if (trigger.includes('SESSION')) {
    if (session.includes('PACKET') || session.includes('PACKAGE')) {
      return ['PACKAGE_OR_SUBSCRIPTION_USED'];
    }

    if (session.includes('HOURLY')) {
      return ['HOURLY_SESSION_STARTED'];
    }

    return ['SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED'];
  }

  if (trigger.includes('CHECK_IN')) {
    return ['VISIT', 'SESSION_STARTED'];
  }

  if (trigger.includes('APP_OPEN')) {
    return ['VISIT'];
  }

  return ['SESSION_STARTED', 'VISIT', 'REWARD_TRACE'];
}
