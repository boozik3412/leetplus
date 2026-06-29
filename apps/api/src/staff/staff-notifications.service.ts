import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  StaffOperationsDashboardService,
  type StaffOperationsStaffControlAnomaly,
} from './staff-operations-dashboard.service';

const notificationStatuses = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const notificationSeverities = ['INFO', 'WARNING', 'CRITICAL'] as const;
const notificationSourceTypes = [
  'TASK',
  'CHECKLIST',
  'RECURRING_RULE',
  'TEAM_CHAT',
  'KNOWLEDGE_BASE',
  'OPERATIONS_DASHBOARD',
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
  targetUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
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
  targetUserId: string | null;
  actionLabel: string;
  actionHref: string;
  metadata: Prisma.InputJsonValue;
};

const notificationInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  targetUser: { select: { id: true, email: true, fullName: true } },
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
    private readonly staffOperationsDashboardService: StaffOperationsDashboardService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: StaffNotificationsQuery = {},
  ): Promise<StaffNotificationsReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.syncCurrentSignals(tenantId);

    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters, user.id);

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
        where: this.buildVisibilityWhere(tenantId, user.id),
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
    const notification = await this.resolveNotification(tenantId, id, user.id);
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
    const notification = await this.resolveNotification(tenantId, id, user.id);
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
            targetUserId: signal.targetUserId,
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
            targetUserId: signal.targetUserId,
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

    const [
      tasks,
      checklists,
      rules,
      incidents,
      returnedArticles,
      operationsDashboardSignals,
    ] = await Promise.all([
      this.prisma.staffTask.findMany({
        where: {
          tenantId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'ON_REVIEW'] },
          dueAt: { lt: now },
          priority: { in: ['HIGH', 'URGENT'] },
        },
        include: {
          store: { select: { id: true, name: true } },
          assignedToUser: {
            select: { id: true, email: true, fullName: true },
          },
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
          assignedToUser: {
            select: { id: true, email: true, fullName: true },
          },
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
          assignedToUser: {
            select: { id: true, email: true, fullName: true },
          },
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
      this.prisma.staffKnowledgeArticle.findMany({
        where: {
          tenantId,
          status: 'RETURNED',
        },
        include: {
          store: { select: { id: true, name: true } },
          createdByUser: {
            select: { id: true, email: true, fullName: true },
          },
          approvedByUser: {
            select: { id: true, email: true, fullName: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.staffOperationsDashboardService.getCurrentStaffControlSignals(
        tenantId,
      ),
    ]);

    return [
      ...tasks.map((task): SignalDraft => {
        return {
          sourceType: 'TASK',
          sourceId: task.id,
          dedupeKey: `task:${task.id}:overdue`,
          severity: task.priority === 'URGENT' ? 'CRITICAL' : 'WARNING',
          title: `Просрочена важная задача: ${task.title}`.slice(0, 240),
          message: this.notificationMessage([
            `Источник: Задача — ${task.title}`,
            'Ситуация: просрочена важная задача',
          ]),
          storeId: task.storeId,
          targetUserId: task.assignedToUserId,
          actionLabel: 'Открыть задачу',
          actionHref: `/staff/tasks?taskId=${encodeURIComponent(task.id)}`,
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
        const failedItems = Math.max(0, run.failedItems ?? 0);
        const blockingIssuesCount = this.checklistBlockingIssueCount(
          run.blockingIssues,
        );
        const reviewComment = this.normalizeOptionalString(run.reviewComment);
        const administrator = assignee ?? 'не назначен';
        const actionHref = `/staff/checklists?runId=${encodeURIComponent(
          run.id,
        )}`;
        const situation = this.checklistSituation({
          isEscalated,
          failedItems,
          blockingIssuesCount,
          reviewComment,
        });

        return {
          sourceType: 'CHECKLIST',
          sourceId: run.id,
          dedupeKey: `checklist:${run.id}:failed`,
          severity: this.checklistSeverity({
            isEscalated,
            failedItems,
            blockingIssuesCount,
            reviewComment,
          }),
          title: `${
            isEscalated ? 'Эскалация чек-листа' : 'Чек-лист с проблемами'
          }: ${run.title}`.slice(0, 240),
          message: this.notificationMessage([
            `Источник: Чек-лист — ${run.title}`,
            `Администратор: ${administrator}`,
            `Ситуация: ${situation}`,
          ]),
          storeId: run.storeId,
          targetUserId: null,
          actionLabel: 'Открыть чек-лист',
          actionHref,
          metadata: {
            status: run.status,
            failedItems,
            blockingIssues: blockingIssuesCount,
            scoreEarned: run.scoreEarned,
            scoreTotal: run.scoreTotal,
            reviewComment,
            administrator,
            actionHref,
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
        return {
          sourceType: 'RECURRING_RULE',
          sourceId: rule.id,
          dedupeKey: `recurring-rule:${rule.id}:due`,
          severity: overdueHours >= 4 ? 'CRITICAL' : 'WARNING',
          title: `Регулярная задача ожидает запуска: ${rule.title}`.slice(
            0,
            240,
          ),
          message: this.notificationMessage([
            `Источник: Регулярное правило — ${rule.title}`,
            `Ситуация: ${this.recurringRuleSituation(overdueHours)}`,
          ]),
          storeId: rule.storeId,
          targetUserId: rule.assignedToUserId,
          actionLabel: 'Открыть правила',
          actionHref: '/staff/task-rules',
          metadata: {
            cadence: rule.cadence,
            nextRunAt: rule.nextRunAt?.toISOString() ?? null,
            overdueHours,
          },
        };
      }),
      ...returnedArticles.map((article): SignalDraft => {
        const isSlaOverdue =
          Boolean(article.revisionDueAt) && article.revisionDueAt! < now;

        return {
          sourceType: 'KNOWLEDGE_BASE',
          sourceId: article.id,
          dedupeKey: `knowledge-base:${article.id}:returned`,
          severity: isSlaOverdue ? 'CRITICAL' : 'WARNING',
          title: `Материал базы знаний возвращен: ${article.title}`.slice(
            0,
            240,
          ),
          message: this.notificationMessage([
            `Источник: База знаний — ${article.title}`,
            `Ситуация: ${
              isSlaOverdue
                ? 'доработка материала просрочена'
                : 'материал возвращен на доработку'
            }`,
          ]),
          storeId: article.storeId,
          targetUserId: article.createdByUserId,
          actionLabel: 'Открыть материал',
          actionHref: `/staff/knowledge-base?status=RETURNED&search=${encodeURIComponent(article.title)}`,
          metadata: {
            status: article.status,
            approvalNote: article.approvalNote,
            authorUserId: article.createdByUserId,
            reviewerUserId: article.approvedByUserId,
            returnedAt: article.returnedAt?.toISOString() ?? null,
            revisionDueAt: article.revisionDueAt?.toISOString() ?? null,
            slaOverdue: isSlaOverdue,
          },
        };
      }),
      ...incidents
        .filter((message) => !this.isChecklistGeneratedIncident(message.body))
        .map((message): SignalDraft => {
          const messageAction = this.extractMessageAction(message.body);
          const chatHref = `/staff/team-chat?channelId=${encodeURIComponent(
            message.channelId,
          )}`;

          return {
            sourceType: 'TEAM_CHAT',
            sourceId: message.id,
            dedupeKey: `team-chat:${message.id}:incident`,
            severity: 'CRITICAL',
            title: `Срочный инцидент в чате: ${message.channel.name}`.slice(
              0,
              240,
            ),
            message: this.notificationMessage([
              `Источник: Командный чат — ${message.channel.name}`,
              `Ситуация: ${
                this.compactNotificationText(messageAction.body) ??
                'срочный инцидент в командном чате'
              }`,
            ]),
            storeId: message.storeId,
            targetUserId: null,
            actionLabel: messageAction.actionLabel ?? 'Открыть чат',
            actionHref: messageAction.actionHref ?? chatHref,
            metadata: {
              priority: message.priority,
              isPinned: message.isPinned,
              channelId: message.channelId,
              chatHref,
              messageActionHref: messageAction.actionHref,
            },
          };
        }),
      ...operationsDashboardSignals.anomalies
        .filter((anomaly) => anomaly.severity === 'HIGH')
        .map((anomaly) =>
          this.toOperationsDashboardSignal(
            anomaly,
            operationsDashboardSignals.dateFrom,
            operationsDashboardSignals.dateTo,
          ),
        ),
    ];
  }

  private notificationMessage(lines: Array<string | null | undefined>) {
    return lines
      .map((line) => this.compactNotificationText(line, 240))
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }

  private compactNotificationText(
    value: string | null | undefined,
    maxLength = 180,
  ) {
    const text = this.normalizeOptionalString(value)?.replace(/\s+/g, ' ');

    if (!text) {
      return null;
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }

  private checklistBlockingIssueCount(value: unknown) {
    return Array.isArray(value) ? value.length : 0;
  }

  private checklistSeverity({
    isEscalated,
    failedItems,
    blockingIssuesCount,
    reviewComment,
  }: {
    isEscalated: boolean;
    failedItems: number;
    blockingIssuesCount: number;
    reviewComment: string | null;
  }): StaffNotificationSeverity {
    if (!isEscalated) {
      return 'WARNING';
    }

    if (failedItems > 0 || blockingIssuesCount > 0 || reviewComment) {
      return 'CRITICAL';
    }

    return 'WARNING';
  }

  private checklistSituation({
    isEscalated,
    failedItems,
    blockingIssuesCount,
    reviewComment,
  }: {
    isEscalated: boolean;
    failedItems: number;
    blockingIssuesCount: number;
    reviewComment: string | null;
  }) {
    const issueSummary = this.checklistIssueSummary(
      failedItems,
      blockingIssuesCount,
    );

    if (isEscalated) {
      if (issueSummary) {
        return `эскалация: ${issueSummary}`;
      }

      return reviewComment
        ? 'эскалация без проблемных пунктов; причина указана в чек-листе'
        : 'эскалация без указанной причины';
    }

    return issueSummary ?? 'чек-лист требует проверки';
  }

  private checklistIssueSummary(
    failedItems: number,
    blockingIssuesCount: number,
  ) {
    const parts: string[] = [];

    if (failedItems > 0) {
      parts.push(
        this.pluralizeRu(
          failedItems,
          'проблемный пункт',
          'проблемных пункта',
          'проблемных пунктов',
        ),
      );
    }

    if (blockingIssuesCount > 0) {
      parts.push(
        this.pluralizeRu(
          blockingIssuesCount,
          'блокер сдачи',
          'блокера сдачи',
          'блокеров сдачи',
        ),
      );
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private recurringRuleSituation(overdueHours: number) {
    if (overdueHours > 0) {
      return `ожидает запуска ${this.pluralizeRu(
        overdueHours,
        'час',
        'часа',
        'часов',
      )}`;
    }

    return 'ожидает запуска';
  }

  private pluralizeRu(count: number, one: string, few: string, many: string) {
    const abs = Math.abs(count);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    const label =
      mod10 === 1 && mod100 !== 11
        ? one
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? few
          : many;

    return `${count} ${label}`;
  }

  private isChecklistGeneratedIncident(body: string) {
    return (
      body.includes('Источник: чеклист смены LeetPlus.') ||
      body.includes('Источник: эскалация чеклиста смены LeetPlus.')
    );
  }

  private extractMessageAction(body: string) {
    const lines = body.split('\n');
    const actionLineIndex = this.findLastTextLineIndex(lines);

    if (actionLineIndex === -1) {
      return { body, actionLabel: null, actionHref: null };
    }

    const rawActionLine = lines[actionLineIndex]?.trim() ?? '';
    const match = rawActionLine.match(
      /^([^:\n]{2,100}?):\s*((?:\/|https?:\/\/)\S+)$/i,
    );

    if (!match) {
      return { body, actionLabel: null, actionHref: null };
    }

    const actionLabel = this.normalizeOptionalString(match[1]);
    const actionHref = this.normalizeMessageActionHref(match[2]);

    if (!actionLabel || !actionHref) {
      return { body, actionLabel: null, actionHref: null };
    }

    const visibleLines = lines.slice();
    visibleLines.splice(actionLineIndex, 1);

    while (
      visibleLines.length > 0 &&
      !visibleLines[visibleLines.length - 1]?.trim()
    ) {
      visibleLines.pop();
    }

    return {
      body: visibleLines.join('\n'),
      actionLabel,
      actionHref,
    };
  }

  private findLastTextLineIndex(lines: string[]) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index]?.trim()) {
        return index;
      }
    }

    return -1;
  }

  private normalizeMessageActionHref(rawHref: string) {
    const href = this.trimTrailingHrefPunctuation(rawHref.trim());

    if (href.startsWith('/') && !href.startsWith('//')) {
      return href;
    }

    try {
      const url = new URL(href);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      if (
        url.hostname === 'leetplus.ru' ||
        url.hostname === 'www.leetplus.ru' ||
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1'
      ) {
        return url.pathname + url.search + url.hash;
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  private trimTrailingHrefPunctuation(href: string) {
    let cleanHref = href;

    while (/[),.;!?]$/.test(cleanHref)) {
      cleanHref = cleanHref.slice(0, -1);
    }

    return cleanHref;
  }

  private toOperationsDashboardSignal(
    anomaly: StaffOperationsStaffControlAnomaly,
    dateFrom: string,
    dateTo: string,
  ): SignalDraft {
    return {
      sourceType: 'OPERATIONS_DASHBOARD',
      sourceId: anomaly.id,
      dedupeKey: `operations-dashboard:${anomaly.kind}:${anomaly.id}`,
      severity: 'CRITICAL',
      title: `Операционный риск: ${anomaly.title}`.slice(0, 240),
      message: this.notificationMessage([
        `Источник: Операционный контроль — ${anomaly.title}`,
        `Ситуация: ${
          this.compactNotificationText(anomaly.detail) ??
          'обнаружен операционный риск'
        }`,
      ]),
      storeId: anomaly.store?.id ?? null,
      targetUserId: null,
      actionLabel: this.operationsDashboardActionLabel(anomaly.href),
      actionHref: anomaly.href || '/staff/operations-dashboard',
      metadata: {
        kind: anomaly.kind,
        riskLevel: anomaly.severity,
        count: anomaly.count,
        amount: anomaly.amount,
        dateFrom,
        dateTo,
        operatorLabel: anomaly.operatorLabel,
        dashboardHref: '/staff/operations-dashboard',
      },
    };
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
    currentUserId: string,
  ): Prisma.StaffNotificationWhereInput {
    const where = this.buildVisibilityWhere(tenantId, currentUserId);
    const and: Prisma.StaffNotificationWhereInput[] = [];

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
      and.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { message: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private buildVisibilityWhere(
    tenantId: string,
    currentUserId: string,
  ): Prisma.StaffNotificationWhereInput {
    return {
      tenantId,
      OR: [{ targetUserId: null }, { targetUserId: currentUserId }],
    };
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

  private async resolveNotification(
    tenantId: string,
    id: string,
    currentUserId: string,
  ) {
    const notification = await this.prisma.staffNotification.findFirst({
      where: {
        id,
        ...this.buildVisibilityWhere(tenantId, currentUserId),
      },
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
      targetUser: row.targetUser,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      acknowledgedByUser: row.acknowledgedByUser,
      resolvedByUser: row.resolvedByUser,
    };
  }

  private operationsDashboardActionLabel(href: string) {
    if (href.startsWith('/guests/staff-control/operators')) {
      return 'Открыть операторов';
    }

    if (href.startsWith('/staff/checklists/report')) {
      return 'Открыть отчет чек-листов';
    }

    return 'Открыть дашборд';
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
