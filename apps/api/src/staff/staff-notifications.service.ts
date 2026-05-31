import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const notificationStatuses = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const notificationSeverities = ['INFO', 'WARNING', 'CRITICAL'] as const;
const notificationSourceTypes = [
  'TASK',
  'CHECKLIST',
  'RECURRING_RULE',
  'TEAM_CHAT',
] as const;
const notificationStatusFilters = ['all', ...notificationStatuses] as const;
const notificationSeverityFilters = ['all', ...notificationSeverities] as const;
const notificationSourceTypeFilters = [
  'all',
  ...notificationSourceTypes,
] as const;

export type StaffNotificationStatus = (typeof notificationStatuses)[number];
export type StaffNotificationSeverity = (typeof notificationSeverities)[number];
export type StaffNotificationSourceType =
  (typeof notificationSourceTypes)[number];

export type StaffNotificationsQuery = {
  status?: StaffNotificationStatus | 'all';
  severity?: StaffNotificationSeverity | 'all';
  sourceType?: StaffNotificationSourceType | 'all';
  storeId?: string;
  search?: string;
  pageSize?: string;
};

export type StaffNotificationsReport = {
  filters: {
    status: StaffNotificationStatus | 'all';
    severity: StaffNotificationSeverity | 'all';
    sourceType: StaffNotificationSourceType | 'all';
    storeId: string | null;
    search: string | null;
    pageSize: number;
  };
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    critical: number;
    warning: number;
    info: number;
  };
  rows: StaffNotificationResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  sourceTypes: StaffNotificationSourceType[];
  severities: StaffNotificationSeverity[];
  statuses: StaffNotificationStatus[];
};

export type StaffNotificationResponse = {
  id: string;
  sourceType: StaffNotificationSourceType;
  sourceId: string | null;
  severity: StaffNotificationSeverity;
  status: StaffNotificationStatus;
  title: string;
  message: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  metadata: Prisma.JsonValue | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  acknowledgedByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  resolvedByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

type NotificationFilters = StaffNotificationsReport['filters'];

type SignalDraft = {
  sourceType: StaffNotificationSourceType;
  sourceId: string;
  dedupeKey: string;
  severity: StaffNotificationSeverity;
  title: string;
  message: string;
  storeId: string | null;
  actionLabel: string;
  actionHref: string;
  metadata: Prisma.InputJsonValue;
};

const notificationInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  acknowledgedByUser: { select: { id: true, email: true, fullName: true } },
  resolvedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffNotificationInclude;

type StaffNotificationRow = Prisma.StaffNotificationGetPayload<{
  include: typeof notificationInclude;
}>;

@Injectable()
export class StaffNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: StaffNotificationsQuery = {},
  ): Promise<StaffNotificationsReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.syncCurrentSignals(tenantId);

    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);

    const [rows, summaryRows, stores] = await Promise.all([
      this.prisma.staffNotification.findMany({
        where,
        include: notificationInclude,
        orderBy: [
          { status: 'asc' },
          { severity: 'asc' },
          { createdAt: 'desc' },
        ],
        take: filters.pageSize,
      }),
      this.prisma.staffNotification.findMany({
        where: { tenantId },
        select: { status: true, severity: true },
        take: 5000,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    ]);

    return {
      filters,
      summary: this.buildSummary(summaryRows),
      rows: rows.map((row) => this.toResponse(row)),
      stores,
      sourceTypes: [...notificationSourceTypes],
      severities: [...notificationSeverities],
      statuses: [...notificationStatuses],
    };
  }

  async syncSignals(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.syncCurrentSignals(tenantId);
  }

  async acknowledge(user: AuthenticatedUser, id: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const notification = await this.resolveNotification(tenantId, id);
    const now = new Date();

    const updated = await this.prisma.staffNotification.update({
      where: { id: notification.id },
      data: {
        status:
          notification.status === 'RESOLVED'
            ? notification.status
            : 'ACKNOWLEDGED',
        acknowledgedAt: notification.acknowledgedAt ?? now,
        acknowledgedByUserId: notification.acknowledgedByUserId ?? user.id,
      },
      include: notificationInclude,
    });

    return this.toResponse(updated);
  }

  async resolve(user: AuthenticatedUser, id: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const notification = await this.resolveNotification(tenantId, id);
    const now = new Date();

    const updated = await this.prisma.staffNotification.update({
      where: { id: notification.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: notification.resolvedAt ?? now,
        resolvedByUserId: notification.resolvedByUserId ?? user.id,
        acknowledgedAt: notification.acknowledgedAt ?? now,
        acknowledgedByUserId: notification.acknowledgedByUserId ?? user.id,
      },
      include: notificationInclude,
    });

    return this.toResponse(updated);
  }

  private async syncCurrentSignals(tenantId: string) {
    const signals = await this.collectSignals(tenantId);
    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const signal of signals) {
      const existing = await this.prisma.staffNotification.findFirst({
        where: { tenantId, dedupeKey: signal.dedupeKey },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.staffNotification.update({
          where: { id: existing.id },
          data: {
            storeId: signal.storeId,
            sourceType: signal.sourceType,
            sourceId: signal.sourceId,
            severity: signal.severity,
            title: signal.title,
            message: signal.message,
            actionLabel: signal.actionLabel,
            actionHref: signal.actionHref,
            metadata: signal.metadata,
          },
        });
        updated += 1;
      } else {
        await this.prisma.staffNotification.create({
          data: {
            tenantId,
            storeId: signal.storeId,
            sourceType: signal.sourceType,
            sourceId: signal.sourceId,
            severity: signal.severity,
            status: 'OPEN',
            title: signal.title,
            message: signal.message,
            actionLabel: signal.actionLabel,
            actionHref: signal.actionHref,
            dedupeKey: signal.dedupeKey,
            metadata: signal.metadata,
          },
        });
        created += 1;
      }
    }

    const activeDedupeKeys = signals.map((signal) => signal.dedupeKey);
    const stale = await this.prisma.staffNotification.updateMany({
      where: {
        tenantId,
        sourceType: { in: [...notificationSourceTypes] },
        status: { not: 'RESOLVED' },
        dedupeKey:
          activeDedupeKeys.length > 0
            ? { notIn: activeDedupeKeys }
            : { not: null },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        message: 'Сигнал больше не активен по текущим данным LeetPlus.',
      },
    });

    return {
      created,
      updated,
      resolvedStale: stale.count,
      activeSignals: signals.length,
      syncedAt: now.toISOString(),
    };
  }

  private async collectSignals(tenantId: string): Promise<SignalDraft[]> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [tasks, checklists, rules, incidents] = await Promise.all([
      this.prisma.staffTask.findMany({
        where: {
          tenantId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'ON_REVIEW'] },
          dueAt: { lt: now },
          priority: { in: ['HIGH', 'URGENT'] },
        },
        include: {
          store: { select: { id: true, name: true } },
          assignedToUser: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: 100,
      }),
      this.prisma.staffChecklistRun.findMany({
        where: {
          tenantId,
          OR: [
            { status: 'ESCALATED' },
            {
              status: { in: ['ON_REVIEW', 'RETURNED'] },
              failedItems: { gt: 0 },
            },
          ],
        },
        include: {
          store: { select: { id: true, name: true } },
          assignedToUser: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      this.prisma.staffTaskRecurringRule.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          nextRunAt: { lte: now },
        },
        include: {
          store: { select: { id: true, name: true } },
          assignedToUser: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { nextRunAt: 'asc' },
        take: 100,
      }),
      this.prisma.staffChatMessage.findMany({
        where: {
          tenantId,
          kind: 'INCIDENT',
          createdAt: { gte: fourteenDaysAgo },
          OR: [{ priority: 'URGENT' }, { isPinned: true }],
        },
        include: {
          channel: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          authorUser: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return [
      ...tasks.map((task): SignalDraft => {
        const assignee = this.userLabel(task.assignedToUser);

        return {
          sourceType: 'TASK',
          sourceId: task.id,
          dedupeKey: `task:${task.id}:overdue`,
          severity: task.priority === 'URGENT' ? 'CRITICAL' : 'WARNING',
          title: `Просрочена важная задача: ${task.title}`.slice(0, 240),
          message: [
            task.store ? `Клуб: ${task.store.name}` : 'Клуб: вся сеть',
            assignee ? `Ответственный: ${assignee}` : null,
            task.dueAt ? `Срок: ${task.dueAt.toLocaleString('ru-RU')}` : null,
            `Приоритет: ${task.priority}`,
          ]
            .filter(Boolean)
            .join('\n'),
          storeId: task.storeId,
          actionLabel: 'Открыть задачу',
          actionHref: `/staff/tasks?search=${encodeURIComponent(task.title)}`,
          metadata: {
            priority: task.priority,
            status: task.status,
            dueAt: task.dueAt?.toISOString() ?? null,
          },
        };
      }),
      ...checklists.map((run): SignalDraft => {
        const assignee = this.userLabel(run.assignedToUser);
        const isEscalated = run.status === 'ESCALATED';

        return {
          sourceType: 'CHECKLIST',
          sourceId: run.id,
          dedupeKey: `checklist:${run.id}:failed`,
          severity: isEscalated ? 'CRITICAL' : 'WARNING',
          title:
            `${isEscalated ? 'Эскалирован чек-лист' : 'Чек-лист с проблемами'}: ${run.title}`.slice(
              0,
              240,
            ),
          message: [
            run.store ? `Клуб: ${run.store.name}` : 'Клуб: вся сеть',
            assignee ? `Ответственный: ${assignee}` : null,
            `Статус: ${run.status}`,
            `Проблемных пунктов: ${run.failedItems}`,
            run.reviewComment ? `Комментарий: ${run.reviewComment}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          storeId: run.storeId,
          actionLabel: 'Открыть чек-листы',
          actionHref: `/staff/checklists?search=${encodeURIComponent(run.title)}`,
          metadata: {
            status: run.status,
            failedItems: run.failedItems,
            scoreEarned: run.scoreEarned,
            scoreTotal: run.scoreTotal,
          },
        };
      }),
      ...rules.map((rule): SignalDraft => {
        const overdueHours = rule.nextRunAt
          ? Math.max(
              0,
              Math.floor((now.getTime() - rule.nextRunAt.getTime()) / 3600000),
            )
          : 0;
        const assignee = this.userLabel(rule.assignedToUser);

        return {
          sourceType: 'RECURRING_RULE',
          sourceId: rule.id,
          dedupeKey: `recurring-rule:${rule.id}:due`,
          severity: overdueHours >= 4 ? 'CRITICAL' : 'WARNING',
          title: `Регулярная задача ожидает запуска: ${rule.title}`.slice(
            0,
            240,
          ),
          message: [
            rule.store ? `Клуб: ${rule.store.name}` : 'Клуб: вся сеть',
            assignee ? `Ответственный: ${assignee}` : null,
            rule.nextRunAt
              ? `Плановый запуск: ${rule.nextRunAt.toLocaleString('ru-RU')}`
              : null,
            `Расписание: ${rule.cadence}`,
          ]
            .filter(Boolean)
            .join('\n'),
          storeId: rule.storeId,
          actionLabel: 'Открыть правила',
          actionHref: '/staff/task-rules',
          metadata: {
            cadence: rule.cadence,
            nextRunAt: rule.nextRunAt?.toISOString() ?? null,
            overdueHours,
          },
        };
      }),
      ...incidents.map(
        (message): SignalDraft => ({
          sourceType: 'TEAM_CHAT',
          sourceId: message.id,
          dedupeKey: `team-chat:${message.id}:incident`,
          severity: 'CRITICAL',
          title: `Срочный инцидент в чате: ${message.channel.name}`.slice(
            0,
            240,
          ),
          message: [
            message.store ? `Клуб: ${message.store.name}` : 'Клуб: вся сеть',
            this.userLabel(message.authorUser)
              ? `Автор: ${this.userLabel(message.authorUser)}`
              : null,
            message.body.slice(0, 700),
          ]
            .filter(Boolean)
            .join('\n'),
          storeId: message.storeId,
          actionLabel: 'Открыть чат',
          actionHref: `/staff/team-chat?channelId=${encodeURIComponent(message.channelId)}`,
          metadata: {
            priority: message.priority,
            isPinned: message.isPinned,
            channelId: message.channelId,
          },
        }),
      ),
    ];
  }

  private resolveFilters(query: StaffNotificationsQuery): NotificationFilters {
    return {
      status: this.resolveOne(query.status, notificationStatusFilters, 'all'),
      severity: this.resolveOne(
        query.severity,
        notificationSeverityFilters,
        'all',
      ),
      sourceType: this.resolveOne(
        query.sourceType,
        notificationSourceTypeFilters,
        'all',
      ),
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
      pageSize: this.normalizePageSize(query.pageSize),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: NotificationFilters,
  ): Prisma.StaffNotificationWhereInput {
    const where: Prisma.StaffNotificationWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.severity !== 'all') {
      where.severity = filters.severity;
    }

    if (filters.sourceType !== 'all') {
      where.sourceType = filters.sourceType;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildSummary(rows: Array<{ status: string; severity: string }>) {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;

        if (row.status === 'OPEN') {
          acc.open += 1;
        } else if (row.status === 'ACKNOWLEDGED') {
          acc.acknowledged += 1;
        } else if (row.status === 'RESOLVED') {
          acc.resolved += 1;
        }

        if (row.severity === 'CRITICAL') {
          acc.critical += 1;
        } else if (row.severity === 'INFO') {
          acc.info += 1;
        } else {
          acc.warning += 1;
        }

        return acc;
      },
      {
        total: 0,
        open: 0,
        acknowledged: 0,
        resolved: 0,
        critical: 0,
        warning: 0,
        info: 0,
      },
    );
  }

  private async resolveNotification(tenantId: string, id: string) {
    const notification = await this.prisma.staffNotification.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        acknowledgedAt: true,
        acknowledgedByUserId: true,
        resolvedAt: true,
        resolvedByUserId: true,
      },
    });

    if (!notification) {
      throw new NotFoundException('Staff notification not found');
    }

    return notification;
  }

  private toResponse(row: StaffNotificationRow): StaffNotificationResponse {
    return {
      id: row.id,
      sourceType: this.resolveOne(
        row.sourceType,
        notificationSourceTypes,
        'TASK',
      ),
      sourceId: row.sourceId,
      severity: this.resolveOne(
        row.severity,
        notificationSeverities,
        'WARNING',
      ),
      status: this.resolveOne(row.status, notificationStatuses, 'OPEN'),
      title: row.title,
      message: row.message,
      actionLabel: row.actionLabel,
      actionHref: row.actionHref,
      metadata: row.metadata,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      acknowledgedByUser: row.acknowledgedByUser,
      resolvedByUser: row.resolvedByUser,
    };
  }

  private userLabel(
    user: { email: string; fullName: string | null } | null | undefined,
  ) {
    return user?.fullName ?? user?.email ?? null;
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const text = typeof value === 'string' ? value.trim() : '';

    return text.length > 0 ? text : null;
  }

  private normalizePageSize(value: string | null | undefined) {
    const parsed = Number(value ?? 80);

    if (!Number.isFinite(parsed)) {
      return 80;
    }

    return Math.min(Math.max(Math.trunc(parsed), 20), 200);
  }

  private resolveOne<T extends readonly string[]>(
    value: string | null | undefined,
    allowed: T,
    fallback: T[number],
  ): T[number] {
    if (!value) {
      return fallback;
    }

    return allowed.includes(value) ? value : fallback;
  }
}
