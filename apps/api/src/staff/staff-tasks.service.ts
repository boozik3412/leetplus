import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  buildStaffExportFile,
  formatStaffDateTime,
  resolveStaffExportFormat,
  staffUserLabel,
  staffYesNo,
  type StaffExportCell,
  type StaffExportFile,
} from './staff-export';

const taskStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'ON_REVIEW',
  'DONE',
  'CANCELED',
] as const;

const taskFilterStatuses = ['all', 'OVERDUE', ...taskStatuses] as const;
const taskViewModes = [
  'all',
  'today',
  'overdue',
  'my',
  'watched',
  'approval',
  'byClub',
  'byEmployee',
  'byShift',
  'byStatus',
] as const;
const taskTypes = [
  'ONE_TIME',
  'SHIFT',
  'RECURRING',
  'LONG_TERM',
  'PERSONAL',
  'CLUB',
  'ROLE',
] as const;
const taskPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const taskSortKeys = [
  'dueAt',
  'createdAt',
  'updatedAt',
  'status',
  'priority',
] as const;

export type StaffTaskStatus = (typeof taskStatuses)[number];
export type StaffTaskFilterStatus = (typeof taskFilterStatuses)[number];
export type StaffTaskViewMode = (typeof taskViewModes)[number];
export type StaffTaskType = (typeof taskTypes)[number];
export type StaffTaskPriority = (typeof taskPriorities)[number];
export type StaffTaskSortKey = (typeof taskSortKeys)[number];

export type StaffTasksQuery = {
  view?: StaffTaskViewMode;
  status?: StaffTaskFilterStatus;
  type?: StaffTaskType | 'all';
  priority?: StaffTaskPriority | 'all';
  storeId?: string;
  shiftId?: string;
  assignedToUserId?: string;
  observerUserId?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  sort?: StaffTaskSortKey;
  direction?: 'asc' | 'desc';
  pageSize?: string;
};

export type StaffTasksExportQuery = StaffTasksQuery & {
  format?: string;
};

export type StaffTaskDto = {
  title?: string;
  description?: string | null;
  type?: StaffTaskType;
  status?: StaffTaskStatus;
  priority?: StaffTaskPriority;
  dueAt?: string | null;
  storeId?: string | null;
  shiftId?: string | null;
  assignedToUserId?: string | null;
  observerUserIds?: unknown;
  labels?: unknown;
  checklist?: unknown;
};

export type StaffTaskCommentDto = {
  body?: string | null;
  evidenceType?: string | null;
  evidenceLabel?: string | null;
  evidenceUrl?: string | null;
  status?: StaffTaskStatus;
};

export type StaffTaskReport = {
  filters: {
    view: StaffTaskViewMode;
    status: StaffTaskFilterStatus;
    type: StaffTaskType | 'all';
    priority: StaffTaskPriority | 'all';
    storeId: string | null;
    shiftId: string | null;
    assignedToUserId: string | null;
    observerUserId: string | null;
    search: string | null;
    dueFrom: string | null;
    dueTo: string | null;
    sort: StaffTaskSortKey;
    direction: 'asc' | 'desc';
    pageSize: number;
  };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    onReview: number;
    done: number;
    overdue: number;
    canceled: number;
  };
  quickViews: Array<{
    key: StaffTaskViewMode;
    label: string;
    count: number;
  }>;
  groups: {
    byClub: StaffTaskGroup[];
    byEmployee: StaffTaskGroup[];
    byShift: StaffTaskGroup[];
    byStatus: StaffTaskGroup[];
  };
  rows: StaffTaskResponse[];
  users: Array<{ id: string; email: string; fullName: string | null }>;
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffTaskGroup = {
  key: string;
  label: string;
  hint: string | null;
  total: number;
  open: number;
  inProgress: number;
  onReview: number;
  done: number;
  overdue: number;
  canceled: number;
  filter: {
    status?: StaffTaskFilterStatus;
    storeId?: string;
    assignedToUserId?: string;
    shiftId?: string;
  };
};

export type StaffTaskResponse = {
  id: string;
  title: string;
  description: string | null;
  type: StaffTaskType;
  status: StaffTaskStatus;
  priority: StaffTaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  store: { id: string; name: string; isActive: boolean } | null;
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  assignedToUser: { id: string; email: string; fullName: string | null } | null;
  observers: StaffTaskObserverResponse[];
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
  comments: StaffTaskCommentResponse[];
  auditEvents: StaffTaskAuditEventResponse[];
};

export type StaffTaskObserverResponse = {
  id: string;
  createdAt: string;
  user: { id: string; email: string; fullName: string | null };
};

export type StaffTaskCommentResponse = {
  id: string;
  body: string | null;
  evidenceType: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  authorUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffTaskAuditEventResponse = {
  id: string;
  action: string;
  message: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  actorUser: { id: string; email: string; fullName: string | null } | null;
};

const taskInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  shift: {
    select: {
      id: true,
      externalShiftId: true,
      startedAt: true,
      stoppedAt: true,
      store: { select: { id: true, name: true } },
    },
  },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
  observers: {
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      authorUser: { select: { id: true, email: true, fullName: true } },
    },
  },
  auditEvents: {
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      actorUser: { select: { id: true, email: true, fullName: true } },
    },
  },
} satisfies Prisma.StaffTaskInclude;

type StaffTaskRow = Prisma.StaffTaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class StaffTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getTasks(
    user: AuthenticatedUser,
    query: StaffTasksQuery = {},
  ): Promise<StaffTaskReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const baseWhere = this.buildWhere(tenantId, filters, false, user.id);
    const rowsWhere = this.buildWhere(tenantId, filters, true, user.id);
    const quickViewWhere = this.buildQuickViewWhere(tenantId, filters, user.id);

    const [rows, summaryRows, quickRows, groupRows, users, stores] =
      await Promise.all([
        this.prisma.staffTask.findMany({
          where: rowsWhere,
          include: taskInclude,
          orderBy: this.buildOrderBy(filters),
          take: filters.pageSize,
        }),
        this.prisma.staffTask.findMany({
          where: baseWhere,
          select: { status: true, dueAt: true },
          take: 2000,
        }),
        this.prisma.staffTask.findMany({
          where: quickViewWhere,
          select: {
            status: true,
            dueAt: true,
            assignedToUserId: true,
            storeId: true,
            shiftId: true,
            type: true,
            title: true,
            description: true,
            labels: true,
            observers: { select: { userId: true } },
          },
          take: 5000,
        }),
        this.prisma.staffTask.findMany({
          where: quickViewWhere,
          select: {
            status: true,
            dueAt: true,
            store: { select: { id: true, name: true } },
            assignedToUser: {
              select: { id: true, email: true, fullName: true },
            },
            shift: {
              select: {
                id: true,
                externalShiftId: true,
                startedAt: true,
                store: { select: { name: true } },
              },
            },
            type: true,
          },
          take: 5000,
        }),
        this.prisma.user.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, email: true, fullName: true },
          orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
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
      quickViews: this.buildQuickViews(quickRows, user.id),
      groups: this.buildGroups(groupRows),
      rows: rows.map((task) => this.toTaskResponse(task)),
      users,
      stores,
    };
  }

  async exportTasks(
    user: AuthenticatedUser,
    query: StaffTasksExportQuery = {},
  ): Promise<StaffExportFile> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const format = resolveStaffExportFormat(query.format);
    const rows = await this.prisma.staffTask.findMany({
      where: this.buildWhere(tenantId, filters, true, user.id),
      include: taskInclude,
      orderBy: this.buildOrderBy(filters),
      take: 10000,
    });

    return buildStaffExportFile({
      format,
      fileNameBase: 'leetplus-staff-tasks',
      sheetName: 'Tasks',
      rows: [
        [
          'ID',
          'Задача',
          'Статус',
          'Тип',
          'Приоритет',
          'Клуб',
          'Исполнитель',
          'Наблюдатели',
          'Дедлайн',
          'Завершено',
          'Просрочено',
          'Создано',
          'Обновлено',
          'Последний комментарий',
          'Доказательство',
          'Описание',
        ],
        ...rows.map((task) => this.toTaskExportRow(this.toTaskResponse(task))),
      ],
      widths: [36, 34, 18, 20, 16, 24, 28, 34, 20, 20, 14, 20, 20, 44, 36, 48],
    });
  }

  async createTask(user: AuthenticatedUser, dto: StaffTaskDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeTaskData(tenantId, dto, {
      requireTitle: true,
    });
    const observerUserIds =
      (await this.resolveObserverUserIds(tenantId, dto.observerUserIds)) ?? [];
    const status = (data.status as StaffTaskStatus | undefined) ?? 'OPEN';

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffTask.create({
        data: {
          ...(data as Prisma.StaffTaskUncheckedCreateInput),
          tenantId,
          status,
          createdByUserId: user.id,
          completedAt: status === 'DONE' ? new Date() : null,
        },
        select: { id: true },
      });

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: created.id,
          actorUserId: user.id,
          action: 'CREATED',
          message: 'Task created',
          metadata: {
            status,
            priority: data.priority ?? 'NORMAL',
            type: data.type ?? 'ONE_TIME',
            observerUserIds,
          },
        },
      });

      await this.syncTaskObservers(tx, tenantId, created.id, observerUserIds);

      return this.fetchTaskOrThrow(tx, tenantId, created.id);
    });

    return this.toTaskResponse(task);
  }

  async updateTask(user: AuthenticatedUser, id: string, dto: StaffTaskDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffTask.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });

    if (!current) {
      throw new NotFoundException('Staff task not found');
    }

    const data = await this.normalizeTaskData(tenantId, dto, {
      requireTitle: false,
    });
    const observerUserIds = await this.resolveObserverUserIds(
      tenantId,
      dto.observerUserIds,
    );
    const normalizedStatus = data.status as StaffTaskStatus | undefined;
    const currentStatus = current.status as StaffTaskStatus;
    const nextStatus = normalizedStatus ?? currentStatus;
    const dataFields = Object.keys(data);

    const task = await this.prisma.$transaction(async (tx) => {
      if (dataFields.length > 0) {
        await tx.staffTask.update({
          where: { id: current.id },
          data: {
            ...data,
            completedAt:
              data.status === undefined
                ? undefined
                : nextStatus === 'DONE'
                  ? new Date()
                  : null,
          },
          select: { id: true },
        });
      }

      if (observerUserIds !== undefined) {
        await this.syncTaskObservers(tx, tenantId, current.id, observerUserIds);
      }

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: current.id,
          actorUserId: user.id,
          action: normalizedStatus
            ? 'STATUS_CHANGED'
            : observerUserIds !== undefined && dataFields.length === 0
              ? 'OBSERVERS_UPDATED'
              : 'UPDATED',
          message: normalizedStatus
            ? `Status changed from ${currentStatus} to ${nextStatus}`
            : observerUserIds !== undefined && dataFields.length === 0
              ? 'Task observers updated'
              : 'Task updated',
          metadata: normalizedStatus
            ? {
                fromStatus: currentStatus,
                toStatus: nextStatus,
                ...(observerUserIds !== undefined ? { observerUserIds } : {}),
              }
            : {
                fields: dataFields,
                ...(observerUserIds !== undefined ? { observerUserIds } : {}),
              },
        },
      });

      return this.fetchTaskOrThrow(tx, tenantId, current.id);
    });

    return this.toTaskResponse(task);
  }

  async createTaskComment(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskCommentDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffTask.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });

    if (!current) {
      throw new NotFoundException('Staff task not found');
    }

    const body = this.normalizeOptionalString(dto.body);
    const evidenceUrl = this.normalizeEvidenceUrl(dto.evidenceUrl);
    const evidenceType = this.normalizeOptionalString(dto.evidenceType);
    const evidenceLabel = this.normalizeOptionalString(dto.evidenceLabel);

    if (!body && !evidenceUrl) {
      throw new BadRequestException('Comment or evidence link is required');
    }

    const nextStatus =
      dto.status === undefined
        ? undefined
        : this.resolveOne(
            dto.status,
            taskStatuses,
            current.status as StaffTaskStatus,
          );

    const task = await this.prisma.$transaction(async (tx) => {
      await tx.staffTaskComment.create({
        data: {
          tenantId,
          taskId: current.id,
          authorUserId: user.id,
          body,
          evidenceType,
          evidenceLabel,
          evidenceUrl,
        },
      });

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: current.id,
          actorUserId: user.id,
          action: evidenceUrl ? 'EVIDENCE_ADDED' : 'COMMENT_ADDED',
          message: evidenceUrl ? 'Evidence added' : 'Comment added',
          metadata: {
            hasBody: Boolean(body),
            hasEvidence: Boolean(evidenceUrl),
            evidenceType,
          },
        },
      });

      if (nextStatus && nextStatus !== current.status) {
        await tx.staffTask.update({
          where: { id: current.id },
          data: {
            status: nextStatus,
            completedAt: nextStatus === 'DONE' ? new Date() : null,
          },
          select: { id: true },
        });

        await tx.staffTaskAuditEvent.create({
          data: {
            tenantId,
            taskId: current.id,
            actorUserId: user.id,
            action: 'STATUS_CHANGED',
            message: `Status changed from ${current.status} to ${nextStatus}`,
            metadata: { fromStatus: current.status, toStatus: nextStatus },
          },
        });
      }

      return this.fetchTaskOrThrow(tx, tenantId, current.id);
    });

    return this.toTaskResponse(task);
  }

  private resolveFilters(query: StaffTasksQuery): StaffTaskReport['filters'] {
    const view = this.resolveOne(query.view, taskViewModes, 'all');
    const status = this.resolveOne(query.status, taskFilterStatuses, 'all');
    const type = this.resolveOne(
      query.type,
      ['all', ...taskTypes] as const,
      'all',
    );
    const priority = this.resolveOne(
      query.priority,
      ['all', ...taskPriorities] as const,
      'all',
    );
    const sort = this.resolveOne(query.sort, taskSortKeys, 'dueAt');
    const direction = query.direction === 'desc' ? 'desc' : 'asc';
    const pageSize = Math.min(
      Math.max(Number.parseInt(query.pageSize ?? '200', 10) || 200, 20),
      500,
    );

    return {
      view,
      status,
      type,
      priority,
      storeId: this.normalizeOptionalString(query.storeId),
      shiftId: this.normalizeOptionalString(query.shiftId),
      assignedToUserId: this.normalizeOptionalString(query.assignedToUserId),
      observerUserId: this.normalizeOptionalString(query.observerUserId),
      search: this.normalizeOptionalString(query.search),
      dueFrom: this.normalizeDateString(query.dueFrom),
      dueTo: this.normalizeDateString(query.dueTo),
      sort,
      direction,
      pageSize,
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffTaskReport['filters'],
    includeStatus: boolean,
    currentUserId: string,
  ): Prisma.StaffTaskWhereInput {
    const where: Prisma.StaffTaskWhereInput = { tenantId };
    const and: Prisma.StaffTaskWhereInput[] = [];
    const now = new Date();

    if (includeStatus && filters.status !== 'all') {
      if (filters.status === 'OVERDUE') {
        and.push({
          status: { notIn: ['DONE', 'CANCELED'] },
          dueAt: { lt: now },
        });
      } else {
        and.push({ status: filters.status });
      }
    }

    if (includeStatus && filters.view === 'today') {
      const { start, end } = this.todayRange();
      and.push({
        status: { notIn: ['DONE', 'CANCELED'] },
        dueAt: { gte: start, lte: end },
      });
    }

    if (includeStatus && filters.view === 'overdue') {
      and.push({ status: { notIn: ['DONE', 'CANCELED'] }, dueAt: { lt: now } });
    }

    if (includeStatus && filters.view === 'approval') {
      and.push(this.buildApprovalWorkflowWhere());
    }

    if (includeStatus && filters.view === 'byShift' && !filters.shiftId) {
      and.push({ OR: [{ shiftId: { not: null } }, { type: 'SHIFT' }] });
    }

    if (filters.type !== 'all') {
      where.type = filters.type;
    }

    if (filters.priority !== 'all') {
      where.priority = filters.priority;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.shiftId) {
      where.shiftId = filters.shiftId;
    }

    if (filters.assignedToUserId) {
      where.assignedToUserId = filters.assignedToUserId;
    } else if (includeStatus && filters.view === 'my') {
      where.assignedToUserId = currentUserId;
    }

    if (filters.observerUserId) {
      where.observers = { some: { userId: filters.observerUserId } };
    } else if (includeStatus && filters.view === 'watched') {
      where.observers = { some: { userId: currentUserId } };
    }

    if (filters.search) {
      and.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.dueFrom || filters.dueTo) {
      and.push({
        dueAt: {
          ...(filters.dueFrom
            ? { gte: new Date(`${filters.dueFrom}T00:00:00.000Z`) }
            : {}),
          ...(filters.dueTo
            ? { lte: new Date(`${filters.dueTo}T23:59:59.999Z`) }
            : {}),
        },
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private buildApprovalWorkflowWhere(): Prisma.StaffTaskWhereInput {
    return {
      OR: [
        {
          labels: {
            path: ['workflow'],
            equals: 'KNOWLEDGE_BASE_APPROVAL',
          },
        },
        {
          labels: {
            path: ['workflowStep'],
            equals: 'RETURNED_ARTICLE_REVISION',
          },
        },
        {
          title: {
            startsWith: 'Доработать материал базы знаний:',
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: 'Материал возвращен на доработку из базы знаний.',
            mode: 'insensitive',
          },
        },
      ],
    };
  }

  private isApprovalWorkflowTask(row: {
    title: string;
    description: string | null;
    labels: Prisma.JsonValue | null;
  }) {
    if (
      row.labels &&
      typeof row.labels === 'object' &&
      !Array.isArray(row.labels)
    ) {
      const labels = row.labels as Record<string, unknown>;

      if (
        labels.workflow === 'KNOWLEDGE_BASE_APPROVAL' ||
        labels.workflowStep === 'RETURNED_ARTICLE_REVISION'
      ) {
        return true;
      }
    }

    return (
      row.title
        .toLocaleLowerCase('ru-RU')
        .startsWith('доработать материал базы знаний:') ||
      Boolean(
        row.description?.includes(
          'Материал возвращен на доработку из базы знаний.',
        ),
      )
    );
  }

  private buildQuickViewWhere(
    tenantId: string,
    filters: StaffTaskReport['filters'],
    currentUserId: string,
  ) {
    return this.buildWhere(
      tenantId,
      {
        ...filters,
        view: 'all',
        status: 'all',
        shiftId: filters.view === 'byShift' ? null : filters.shiftId,
        assignedToUserId:
          filters.view === 'my' ? null : filters.assignedToUserId,
        observerUserId:
          filters.view === 'watched' ? null : filters.observerUserId,
      },
      false,
      currentUserId,
    );
  }

  private buildOrderBy(
    filters: StaffTaskReport['filters'],
  ): Prisma.StaffTaskOrderByWithRelationInput[] {
    const direction = filters.direction;

    if (filters.sort === 'status') {
      return [{ status: direction }, { dueAt: 'asc' }, { createdAt: 'desc' }];
    }

    if (filters.sort === 'priority') {
      return [{ priority: direction }, { dueAt: 'asc' }, { createdAt: 'desc' }];
    }

    if (filters.sort === 'createdAt') {
      return [{ createdAt: direction }];
    }

    if (filters.sort === 'updatedAt') {
      return [{ updatedAt: direction }];
    }

    return [{ dueAt: direction }, { createdAt: 'desc' }];
  }

  private buildSummary(
    rows: Array<{ status: string; dueAt: Date | null }>,
  ): StaffTaskReport['summary'] {
    const now = new Date();
    const summary = {
      total: rows.length,
      open: 0,
      inProgress: 0,
      onReview: 0,
      done: 0,
      overdue: 0,
      canceled: 0,
    };

    rows.forEach((row) => {
      if (row.status === 'OPEN') {
        summary.open += 1;
      } else if (row.status === 'IN_PROGRESS') {
        summary.inProgress += 1;
      } else if (row.status === 'ON_REVIEW') {
        summary.onReview += 1;
      } else if (row.status === 'DONE') {
        summary.done += 1;
      } else if (row.status === 'CANCELED') {
        summary.canceled += 1;
      }

      if (
        row.dueAt &&
        row.dueAt < now &&
        row.status !== 'DONE' &&
        row.status !== 'CANCELED'
      ) {
        summary.overdue += 1;
      }
    });

    return summary;
  }

  private buildQuickViews(
    rows: Array<{
      status: string;
      dueAt: Date | null;
      assignedToUserId: string | null;
      storeId: string | null;
      shiftId: string | null;
      type: string;
      title: string;
      description: string | null;
      labels: Prisma.JsonValue | null;
      observers: Array<{ userId: string }>;
    }>,
    currentUserId: string,
  ): StaffTaskReport['quickViews'] {
    const { start, end } = this.todayRange();
    const activeRows = rows.filter((row) => !this.isTerminalStatus(row.status));

    return [
      { key: 'all', label: 'Все задачи', count: rows.length },
      {
        key: 'today',
        label: 'Сегодня',
        count: activeRows.filter(
          (row) => row.dueAt && row.dueAt >= start && row.dueAt <= end,
        ).length,
      },
      {
        key: 'overdue',
        label: 'Просрочены',
        count: activeRows.filter((row) => row.dueAt && row.dueAt < new Date())
          .length,
      },
      {
        key: 'my',
        label: 'Мои',
        count: rows.filter((row) => row.assignedToUserId === currentUserId)
          .length,
      },
      {
        key: 'watched',
        label: 'Наблюдаю',
        count: rows.filter((row) =>
          row.observers.some((observer) => observer.userId === currentUserId),
        ).length,
      },
      {
        key: 'approval',
        label: 'Согласование',
        count: rows.filter((row) => this.isApprovalWorkflowTask(row)).length,
      },
      {
        key: 'byClub',
        label: 'По клубам',
        count: rows.filter((row) => row.storeId).length,
      },
      {
        key: 'byEmployee',
        label: 'По сотрудникам',
        count: rows.filter((row) => row.assignedToUserId).length,
      },
      {
        key: 'byShift',
        label: 'По сменам',
        count: rows.filter((row) => row.shiftId || row.type === 'SHIFT').length,
      },
      { key: 'byStatus', label: 'По статусам', count: rows.length },
    ];
  }

  private buildGroups(
    rows: Array<{
      status: string;
      dueAt: Date | null;
      store: { id: string; name: string } | null;
      assignedToUser: {
        id: string;
        email: string;
        fullName: string | null;
      } | null;
      shift: {
        id: string;
        externalShiftId: string;
        startedAt: Date | null;
        store: { name: string } | null;
      } | null;
      type: string;
    }>,
  ): StaffTaskReport['groups'] {
    return {
      byClub: this.groupTasks(rows, (row) => ({
        key: row.store?.id ?? 'network',
        label: row.store?.name ?? 'Вся сеть',
        hint: row.store ? null : 'Задачи без привязки к клубу',
        filter: row.store ? { storeId: row.store.id } : {},
      })),
      byEmployee: this.groupTasks(rows, (row) => ({
        key: row.assignedToUser?.id ?? 'unassigned',
        label:
          row.assignedToUser?.fullName ??
          row.assignedToUser?.email ??
          'Не назначено',
        hint: row.assignedToUser ? row.assignedToUser.email : null,
        filter: row.assignedToUser
          ? { assignedToUserId: row.assignedToUser.id }
          : {},
      })),
      byShift: this.groupTasks(
        rows.filter((row) => row.shift || row.type === 'SHIFT'),
        (row) => ({
          key: row.shift?.id ?? 'shift-type',
          label: row.shift
            ? `Смена ${row.shift.externalShiftId}`
            : 'Сменные задачи без факта смены',
          hint: row.shift
            ? [
                row.shift.store?.name,
                row.shift.startedAt
                  ? formatStaffDateTime(row.shift.startedAt.toISOString())
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || null
            : 'Тип задачи SHIFT',
          filter: row.shift ? { shiftId: row.shift.id } : {},
        }),
      ),
      byStatus: this.groupTasks(rows, (row) => ({
        key: row.status,
        label: this.taskStatusLabel(row.status as StaffTaskStatus),
        hint: null,
        filter: { status: row.status as StaffTaskFilterStatus },
      })),
    };
  }

  private groupTasks<T>(
    rows: T[],
    resolver: (row: T) => {
      key: string;
      label: string;
      hint: string | null;
      filter: StaffTaskGroup['filter'];
    },
  ) {
    const groups = new Map<string, StaffTaskGroup>();
    const now = new Date();

    rows.forEach((row) => {
      const meta = resolver(row);
      const group = groups.get(meta.key) ?? {
        key: meta.key,
        label: meta.label,
        hint: meta.hint,
        total: 0,
        open: 0,
        inProgress: 0,
        onReview: 0,
        done: 0,
        overdue: 0,
        canceled: 0,
        filter: meta.filter,
      };
      const task = row as { status: string; dueAt: Date | null };

      group.total += 1;
      if (task.status === 'OPEN') {
        group.open += 1;
      } else if (task.status === 'IN_PROGRESS') {
        group.inProgress += 1;
      } else if (task.status === 'ON_REVIEW') {
        group.onReview += 1;
      } else if (task.status === 'DONE') {
        group.done += 1;
      } else if (task.status === 'CANCELED') {
        group.canceled += 1;
      }

      if (
        task.dueAt &&
        task.dueAt < now &&
        !this.isTerminalStatus(task.status)
      ) {
        group.overdue += 1;
      }

      groups.set(meta.key, group);
    });

    return Array.from(groups.values()).sort((left, right) => {
      if (right.overdue !== left.overdue) {
        return right.overdue - left.overdue;
      }

      return right.total - left.total || left.label.localeCompare(right.label);
    });
  }

  private todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private isTerminalStatus(status: string) {
    return status === 'DONE' || status === 'CANCELED';
  }

  private async normalizeTaskData(
    tenantId: string,
    dto: StaffTaskDto,
    options: { requireTitle: boolean },
  ): Promise<Prisma.StaffTaskUncheckedUpdateInput> {
    const data: Prisma.StaffTaskUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Task title is required',
      );
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description);
    }

    if (dto.type !== undefined) {
      data.type = this.resolveOne(dto.type, taskTypes, 'ONE_TIME');
    }

    if (dto.status !== undefined) {
      data.status = this.resolveOne(dto.status, taskStatuses, 'OPEN');
    }

    if (dto.priority !== undefined) {
      data.priority = this.resolveOne(dto.priority, taskPriorities, 'NORMAL');
    }

    if (dto.dueAt !== undefined) {
      data.dueAt = this.normalizeDateTime(dto.dueAt);
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.shiftId !== undefined) {
      data.shiftId = await this.resolveShiftId(tenantId, dto.shiftId);
    }

    if (dto.assignedToUserId !== undefined) {
      data.assignedToUserId = await this.resolveUserId(
        tenantId,
        dto.assignedToUserId,
      );
    }

    if (dto.labels !== undefined) {
      data.labels = this.normalizeJson(dto.labels);
    }

    if (dto.checklist !== undefined) {
      data.checklist = this.normalizeJson(dto.checklist);
    }

    return data;
  }

  private async resolveObserverUserIds(
    tenantId: string,
    value: unknown,
  ): Promise<string[] | undefined> {
    if (value === undefined) {
      return undefined;
    }

    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];
    const ids = Array.from(
      new Set(
        values
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean),
      ),
    );

    if (ids.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: ids }, isActive: true },
      select: { id: true },
    });
    const foundIds = new Set(users.map((observer) => observer.id));
    const missingId = ids.find((id) => !foundIds.has(id));

    if (missingId) {
      throw new BadRequestException('Observer user not found');
    }

    return ids;
  }

  private async syncTaskObservers(
    prisma: Prisma.TransactionClient,
    tenantId: string,
    taskId: string,
    observerUserIds: string[],
  ) {
    await prisma.staffTaskObserver.deleteMany({
      where: {
        tenantId,
        taskId,
        userId: { notIn: observerUserIds },
      },
    });

    if (observerUserIds.length === 0) {
      return;
    }

    const existing = await prisma.staffTaskObserver.findMany({
      where: { tenantId, taskId },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((observer) => observer.userId));
    const newObserverIds = observerUserIds.filter((id) => !existingIds.has(id));

    if (newObserverIds.length === 0) {
      return;
    }

    await prisma.staffTaskObserver.createMany({
      data: newObserverIds.map((userId) => ({
        tenantId,
        taskId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  private toTaskResponse(task: StaffTaskRow): StaffTaskResponse {
    const now = new Date();
    const isOverdue =
      Boolean(task.dueAt) &&
      task.dueAt! < now &&
      task.status !== 'DONE' &&
      task.status !== 'CANCELED';

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type as StaffTaskType,
      status: task.status as StaffTaskStatus,
      priority: task.priority as StaffTaskPriority,
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      isOverdue,
      store: task.store,
      shift: task.shift
        ? {
            id: task.shift.id,
            externalShiftId: task.shift.externalShiftId,
            startedAt: task.shift.startedAt?.toISOString() ?? null,
            stoppedAt: task.shift.stoppedAt?.toISOString() ?? null,
            store: task.shift.store,
          }
        : null,
      createdByUser: task.createdByUser,
      assignedToUser: task.assignedToUser,
      observers: task.observers.map((observer) => ({
        id: observer.id,
        createdAt: observer.createdAt.toISOString(),
        user: observer.user,
      })),
      labels: task.labels,
      checklist: task.checklist,
      comments: task.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        evidenceType: comment.evidenceType,
        evidenceLabel: comment.evidenceLabel,
        evidenceUrl: comment.evidenceUrl,
        createdAt: comment.createdAt.toISOString(),
        authorUser: comment.authorUser,
      })),
      auditEvents: task.auditEvents.map((event) => ({
        id: event.id,
        action: event.action,
        message: event.message,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
        actorUser: event.actorUser,
      })),
    };
  }

  private toTaskExportRow(task: StaffTaskResponse): StaffExportCell[] {
    const latestComment = task.comments[0] ?? null;

    return [
      task.id,
      task.title,
      this.taskStatusLabel(task.status),
      this.taskTypeLabel(task.type),
      this.taskPriorityLabel(task.priority),
      task.store?.name ?? null,
      staffUserLabel(task.assignedToUser),
      task.observers
        .map((observer) => staffUserLabel(observer.user))
        .join(', '),
      formatStaffDateTime(task.dueAt),
      formatStaffDateTime(task.completedAt),
      staffYesNo(task.isOverdue),
      formatStaffDateTime(task.createdAt),
      formatStaffDateTime(task.updatedAt),
      latestComment?.body ?? null,
      latestComment?.evidenceLabel ?? latestComment?.evidenceUrl ?? null,
      task.description,
    ];
  }

  private taskStatusLabel(status: StaffTaskStatus) {
    const labels: Record<StaffTaskStatus, string> = {
      OPEN: 'Новая',
      IN_PROGRESS: 'В работе',
      ON_REVIEW: 'На проверке',
      DONE: 'Готово',
      CANCELED: 'Отменена',
    };

    return labels[status];
  }

  private taskTypeLabel(type: StaffTaskType) {
    const labels: Record<StaffTaskType, string> = {
      ONE_TIME: 'Разовая',
      SHIFT: 'На смену',
      RECURRING: 'Повторяемая',
      LONG_TERM: 'Долгосрочная',
      PERSONAL: 'Личная',
      CLUB: 'Для клуба',
      ROLE: 'Для роли',
    };

    return labels[type];
  }

  private taskPriorityLabel(priority: StaffTaskPriority) {
    const labels: Record<StaffTaskPriority, string> = {
      LOW: 'Низкий',
      NORMAL: 'Обычный',
      HIGH: 'Высокий',
      URGENT: 'Срочно',
    };

    return labels[priority];
  }

  private async fetchTaskOrThrow(
    prisma: Pick<PrismaService, 'staffTask'>,
    tenantId: string,
    id: string,
  ) {
    const task = await prisma.staffTask.findFirst({
      where: { id, tenantId },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Staff task not found');
    }

    return task;
  }

  private resolveOne<T extends readonly string[]>(
    value: string | null | undefined,
    allowed: T,
    fallback: T[number],
  ): T[number] {
    if (!value) {
      return fallback;
    }

    if (allowed.includes(value)) {
      return value;
    }

    throw new BadRequestException(`Unsupported value: ${value}`);
  }

  private normalizeRequiredString(value: string | undefined, message: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private normalizeOptionalString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  private normalizeDateString(value: string | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('Date must use YYYY-MM-DD format');
    }

    return normalized;
  }

  private normalizeDateTime(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    return date;
  }

  private normalizeEvidenceUrl(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    let url: URL;

    try {
      url = new URL(normalized);
    } catch {
      throw new BadRequestException('Evidence link must be a valid URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException('Evidence link must use http or https');
    }

    return url.toString();
  }

  private normalizeJson(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return Prisma.DbNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private async resolveStoreId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('Store not found');
    }

    return store.id;
  }

  private async resolveShiftId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const shift = await this.prisma.guestWorkingShift.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    return shift.id;
  }

  private async resolveUserId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Assigned user not found');
    }

    return user.id;
  }
}
