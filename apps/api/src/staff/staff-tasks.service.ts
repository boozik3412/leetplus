import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, StaffAttachmentResourceKind, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScopeService,
  type ResolvedAccessScope,
} from '../tenancy/access-scope.service';
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
import { StaffAttachmentBindingsService } from './staff-attachment-bindings.service';
import {
  StaffTeamChatService,
  type StaffChatSystemNotificationDto,
} from './staff-team-chat.service';

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
const taskAssignmentModes = ['SINGLE', 'ANY_OF', 'INDIVIDUAL'] as const;
const taskAssignmentLabelKeys = [
  'assignmentMode',
  'candidateUserIds',
  'originalAssignedToUserIds',
  'bulkTaskGroupId',
] as const;
const taskReviewerRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
] as const;
const taskStatusManagerRoles = [
  ...taskReviewerRoles,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;
const taskStaffAssigneeRoles = [
  UserRole.CLUB_ADMINISTRATOR,
  UserRole.TRAINEE,
] as const;
const taskConfirmationRoles = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
] as const;

export type StaffTaskStatus = (typeof taskStatuses)[number];
export type StaffTaskFilterStatus = (typeof taskFilterStatuses)[number];
export type StaffTaskViewMode = (typeof taskViewModes)[number];
export type StaffTaskType = (typeof taskTypes)[number];
export type StaffTaskPriority = (typeof taskPriorities)[number];
export type StaffTaskSortKey = (typeof taskSortKeys)[number];
export type StaffTaskAssignmentMode = (typeof taskAssignmentModes)[number];

export type StaffTasksQuery = {
  view?: StaffTaskViewMode;
  status?: StaffTaskFilterStatus;
  type?: StaffTaskType | 'all';
  priority?: StaffTaskPriority | 'all';
  storeId?: string;
  taskId?: string;
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
  assignedToUserIds?: unknown;
  assignmentMode?: StaffTaskAssignmentMode;
  observerUserIds?: unknown;
  labels?: unknown;
  checklist?: unknown;
};

export type StaffTaskCommentDto = {
  body?: string | null;
  evidenceType?: string | null;
  evidenceLabel?: string | null;
  evidenceUrl?: string | null;
  attachmentIds?: unknown;
  status?: StaffTaskStatus;
};

export type StaffTaskCatalogSource =
  | {
      kind: 'TEMPLATE';
      templateId: string;
      templateTitle: string;
    }
  | {
      kind: 'RECURRING_RULE';
      ruleId: string;
      ruleTitle: string;
      cadence: string;
      templateId: string | null;
      automatic: boolean;
      scheduledFor?: string;
      ruleRunId?: string;
    };

export type StaffTaskReport = {
  filters: {
    view: StaffTaskViewMode;
    status: StaffTaskFilterStatus;
    type: StaffTaskType | 'all';
    priority: StaffTaskPriority | 'all';
    storeId: string | null;
    taskId: string | null;
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
  users: Array<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    stores: Array<{ id: string; name: string; isActive: boolean }>;
  }>;
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

type StaffTaskStatusContext = {
  id: string;
  storeId: string | null;
  status: string;
  assignedToUserId: string | null;
  labels: Prisma.JsonValue | null;
};

type StaffTaskMutationContext = StaffTaskStatusContext & {
  shiftId: string | null;
  observers: Array<{ userId: string }>;
};

type StaffTaskReferenceClient = Pick<
  PrismaService,
  'guestWorkingShift' | 'store' | 'user'
>;

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
  createdByUser: StaffTaskUserResponse | null;
  assignedToUser: StaffTaskUserResponse | null;
  observers: StaffTaskObserverResponse[];
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
  comments: StaffTaskCommentResponse[];
  auditEvents: StaffTaskAuditEventResponse[];
};

export type StaffTaskObserverResponse = {
  id: string;
  createdAt: string;
  user: StaffTaskUserResponse;
};

export type StaffTaskCommentResponse = {
  id: string;
  body: string | null;
  evidenceType: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  authorUser: StaffTaskUserResponse | null;
};

export type StaffTaskAuditEventResponse = {
  id: string;
  action: string;
  message: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  actorUser: StaffTaskUserResponse | null;
};

export type StaffTaskUserResponse = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  stores?: Array<{ id: string; name: string; isActive: boolean }>;
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
  createdByUser: {
    select: { id: true, email: true, fullName: true, role: true },
  },
  assignedToUser: {
    select: { id: true, email: true, fullName: true, role: true },
  },
  observers: {
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, email: true, fullName: true, role: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      authorUser: {
        select: { id: true, email: true, fullName: true, role: true },
      },
    },
  },
  auditEvents: {
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      actorUser: {
        select: { id: true, email: true, fullName: true, role: true },
      },
    },
  },
} satisfies Prisma.StaffTaskInclude;

type StaffTaskRow = Prisma.StaffTaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class StaffTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffTeamChatService: StaffTeamChatService,
    private readonly accessScopeService: AccessScopeService,
    private readonly staffAttachmentBindingsService: StaffAttachmentBindingsService,
  ) {}

  async getTasks(
    user: AuthenticatedUser,
    query: StaffTasksQuery = {},
  ): Promise<StaffTaskReport> {
    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const filters = this.resolveFilters(query);
    this.assertTaskStoreFilterAllowed(user, filters.storeId);
    const baseWhere = this.buildWhere(
      tenantId,
      filters,
      false,
      user,
      accessScope,
    );
    const quickViewWhere = this.buildQuickViewWhere(
      tenantId,
      filters,
      user,
      accessScope,
    );

    const [rows, summaryRows, quickRows, groupRows, users, stores] =
      await Promise.all([
        this.fetchOrderedTaskRows(
          tenantId,
          filters,
          user,
          accessScope,
          filters.pageSize,
        ),
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
          where: this.buildTaskUserSelectorWhere(tenantId, accessScope),
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            staffMember: {
              select: {
                store: { select: { id: true, name: true, isActive: true } },
              },
            },
            storeAccesses: {
              select: {
                store: { select: { id: true, name: true, isActive: true } },
              },
            },
          },
          orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
        }),
        this.prisma.store.findMany({
          where: this.buildTaskStoreSelectorWhere(tenantId, accessScope),
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
      users: users.map((reportUser) => {
        const storesById = new Map<
          string,
          { id: string; name: string; isActive: boolean }
        >();

        if (
          reportUser.staffMember?.store &&
          this.isTaskStoreVisible(reportUser.staffMember.store.id, accessScope)
        ) {
          storesById.set(
            reportUser.staffMember.store.id,
            reportUser.staffMember.store,
          );
        }

        reportUser.storeAccesses.forEach((access) => {
          if (this.isTaskStoreVisible(access.store.id, accessScope)) {
            storesById.set(access.store.id, access.store);
          }
        });

        return {
          id: reportUser.id,
          email: reportUser.email,
          fullName: reportUser.fullName,
          role: reportUser.role,
          stores: Array.from(storesById.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
        };
      }),
      stores,
    };
  }

  async exportTasks(
    user: AuthenticatedUser,
    query: StaffTasksExportQuery = {},
  ): Promise<StaffExportFile> {
    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const filters = this.resolveFilters(query);
    this.assertTaskStoreFilterAllowed(user, filters.storeId);
    const format = resolveStaffExportFormat(query.format);
    const rows = await this.fetchOrderedTaskRows(
      tenantId,
      filters,
      user,
      accessScope,
      10000,
    );

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
    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const data = await this.normalizeTaskData(tenantId, dto, {
      requireTitle: true,
    });
    const status = (data.status as StaffTaskStatus | undefined) ?? 'OPEN';
    this.assertTaskCreationStatus(status);
    const taskStoreId = typeof data.storeId === 'string' ? data.storeId : null;
    const observerUserIds =
      (await this.resolveObserverUserIds(
        tenantId,
        dto.observerUserIds,
        accessScope,
        taskStoreId,
      )) ?? [];
    const fallbackAssignedToUserId =
      typeof data.assignedToUserId === 'string' ? data.assignedToUserId : null;
    const assignedToUserIds = await this.resolveAssignedUserIds(
      tenantId,
      dto.assignedToUserIds,
      fallbackAssignedToUserId,
      accessScope,
      taskStoreId,
    );
    const assignmentMode = this.resolveAssignmentMode(
      dto.assignmentMode,
      assignedToUserIds.length,
    );

    this.assertTaskCreateStoreAllowed(accessScope, taskStoreId);
    await this.assertTaskShiftMatchesStore(
      tenantId,
      typeof data.shiftId === 'string' ? data.shiftId : null,
      taskStoreId,
      accessScope,
    );
    await this.assertTaskCreationPolicy(
      tenantId,
      user,
      assignedToUserIds,
      observerUserIds,
      taskStoreId,
    );

    const tasks = await this.prisma.$transaction(async (tx) => {
      await this.resolveAssignedUserIds(
        tenantId,
        assignedToUserIds,
        null,
        accessScope,
        taskStoreId,
        tx,
      );
      await this.resolveObserverUserIds(
        tenantId,
        observerUserIds,
        accessScope,
        taskStoreId,
        tx,
      );
      await this.assertTaskShiftMatchesStore(
        tenantId,
        typeof data.shiftId === 'string' ? data.shiftId : null,
        taskStoreId,
        accessScope,
        tx,
      );
      await this.assertTaskCreationPolicy(
        tenantId,
        user,
        assignedToUserIds,
        observerUserIds,
        taskStoreId,
        tx,
      );

      const createdTasks: StaffTaskRow[] = [];
      const groupId =
        assignmentMode === 'INDIVIDUAL' && assignedToUserIds.length > 1
          ? randomUUID()
          : null;
      const taskTargets =
        assignmentMode === 'INDIVIDUAL' && assignedToUserIds.length > 0
          ? assignedToUserIds
          : [
              assignmentMode === 'ANY_OF'
                ? null
                : (assignedToUserIds[0] ?? null),
            ];

      for (const targetUserId of taskTargets) {
        const assignmentObserverUserIds =
          assignmentMode === 'ANY_OF'
            ? Array.from(new Set([...observerUserIds, ...assignedToUserIds]))
            : observerUserIds;
        const assignmentLabels = this.buildAssignmentLabels(data.labels, {
          assignmentMode,
          candidateUserIds:
            assignmentMode === 'ANY_OF'
              ? assignedToUserIds
              : targetUserId
                ? [targetUserId]
                : [],
          bulkTaskGroupId: groupId,
          originalAssignedToUserIds: assignedToUserIds,
        });
        const created = await tx.staffTask.create({
          data: {
            ...(data as Prisma.StaffTaskUncheckedCreateInput),
            tenantId,
            status,
            assignedToUserId: targetUserId,
            labels: assignmentLabels,
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
              observerUserIds: assignmentObserverUserIds,
              assignedToUserIds,
              assignmentMode,
              bulkTaskGroupId: groupId,
            },
          },
        });

        await this.syncTaskObservers(
          tx,
          tenantId,
          created.id,
          assignmentObserverUserIds,
        );

        const task = await this.fetchTaskOrThrow(tx, tenantId, created.id);
        await this.staffTeamChatService.createSystemNotification(
          tenantId,
          this.buildTaskCreatedNotification(task),
          tx,
        );
        createdTasks.push(task);
      }

      return createdTasks;
    });

    if (tasks.length === 1) {
      return this.toTaskResponse(tasks[0]);
    }

    return {
      assignmentMode,
      createdCount: tasks.length,
      tasks: tasks.map((task) => this.toTaskResponse(task)),
    };
  }

  async createCatalogTaskInTransaction(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    dto: StaffTaskDto,
    source: StaffTaskCatalogSource,
  ): Promise<StaffTaskResponse> {
    if (
      dto.assignedToUserIds !== undefined ||
      dto.assignmentMode !== undefined
    ) {
      throw new BadRequestException(
        'Catalog task materialization supports a single assignment only',
      );
    }

    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const data = await this.normalizeTaskData(
      tenantId,
      dto,
      { requireTitle: true },
      tx,
    );
    const status = (data.status as StaffTaskStatus | undefined) ?? 'OPEN';
    this.assertTaskCreationStatus(status);
    const taskStoreId = typeof data.storeId === 'string' ? data.storeId : null;
    const observerUserIds =
      (await this.resolveObserverUserIds(
        tenantId,
        dto.observerUserIds,
        accessScope,
        taskStoreId,
        tx,
      )) ?? [];
    const assignedToUserIds = await this.resolveAssignedUserIds(
      tenantId,
      undefined,
      typeof data.assignedToUserId === 'string' ? data.assignedToUserId : null,
      accessScope,
      taskStoreId,
      tx,
    );

    this.assertTaskCreateStoreAllowed(accessScope, taskStoreId);
    await this.assertTaskShiftMatchesStore(
      tenantId,
      typeof data.shiftId === 'string' ? data.shiftId : null,
      taskStoreId,
      accessScope,
      tx,
    );
    await this.assertTaskCreationPolicy(
      tenantId,
      user,
      assignedToUserIds,
      observerUserIds,
      taskStoreId,
      tx,
    );

    const assignedToUserId = assignedToUserIds[0] ?? null;
    const labels = this.buildAssignmentLabels(data.labels, {
      assignmentMode: 'SINGLE',
      candidateUserIds: assignedToUserId ? [assignedToUserId] : [],
      bulkTaskGroupId: null,
      originalAssignedToUserIds: assignedToUserIds,
    });
    const sourceFields =
      source.kind === 'TEMPLATE'
        ? {
            sourceTemplateId: source.templateId,
            sourceRecurringRuleId: null,
          }
        : {
            sourceTemplateId: source.templateId,
            sourceRecurringRuleId: source.ruleId,
          };
    const sourceMetadata =
      source.kind === 'TEMPLATE'
        ? {
            templateId: source.templateId,
            templateTitle: source.templateTitle,
          }
        : {
            ruleId: source.ruleId,
            ruleTitle: source.ruleTitle,
            cadence: source.cadence,
            templateId: source.templateId,
            automatic: source.automatic,
            ...(source.scheduledFor
              ? { scheduledFor: source.scheduledFor }
              : {}),
            ...(source.ruleRunId ? { ruleRunId: source.ruleRunId } : {}),
          };
    const auditAction =
      source.kind === 'TEMPLATE'
        ? 'CREATED_FROM_TEMPLATE'
        : 'CREATED_FROM_RECURRING_RULE';
    const auditMessage =
      source.kind === 'TEMPLATE'
        ? 'Task created from template'
        : source.automatic
          ? 'Task created automatically from recurring rule'
          : 'Task created from recurring rule';
    const created = await tx.staffTask.create({
      data: {
        ...(data as Prisma.StaffTaskUncheckedCreateInput),
        ...sourceFields,
        tenantId,
        status,
        assignedToUserId,
        labels,
        createdByUserId: user.id,
        completedAt: null,
      },
      select: { id: true },
    });

    await tx.staffTaskAuditEvent.create({
      data: {
        tenantId,
        taskId: created.id,
        actorUserId: user.id,
        action: auditAction,
        message: auditMessage,
        metadata: {
          ...sourceMetadata,
          status,
          priority: data.priority ?? 'NORMAL',
          type: data.type ?? 'ONE_TIME',
          observerUserIds,
          assignedToUserIds,
          assignmentMode: 'SINGLE',
        },
      },
    });
    await this.syncTaskObservers(tx, tenantId, created.id, observerUserIds);

    const task = await this.fetchTaskOrThrow(tx, tenantId, created.id);
    await this.staffTeamChatService.createSystemNotification(
      tenantId,
      this.buildTaskCreatedNotification(task),
      tx,
    );

    return this.toTaskResponse(task);
  }

  async updateTask(user: AuthenticatedUser, id: string, dto: StaffTaskDto) {
    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const current = await this.prisma.staffTask.findFirst({
      where: {
        AND: [
          { id, tenantId },
          this.buildTaskUpdateVisibilityWhere(user, accessScope),
        ],
      },
      select: {
        id: true,
        storeId: true,
        shiftId: true,
        status: true,
        assignedToUserId: true,
        labels: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Staff task not found');
    }

    const data = await this.normalizeTaskData(tenantId, dto, {
      requireTitle: false,
    });
    this.assertTaskUpdateStoreAllowed(accessScope, dto, data);
    const nextStoreId =
      dto.storeId === undefined
        ? current.storeId
        : typeof data.storeId === 'string'
          ? data.storeId
          : null;
    const nextShiftId =
      dto.shiftId === undefined
        ? current.shiftId
        : typeof data.shiftId === 'string'
          ? data.shiftId
          : null;
    if (dto.assignedToUserId !== undefined) {
      const assignedToUserIds = await this.resolveAssignedUserIds(
        tenantId,
        undefined,
        typeof data.assignedToUserId === 'string'
          ? data.assignedToUserId
          : null,
        accessScope,
        nextStoreId,
      );
      data.assignedToUserId = assignedToUserIds[0] ?? null;
    }
    let observerUserIds = await this.resolveObserverUserIds(
      tenantId,
      dto.observerUserIds,
      accessScope,
      nextStoreId,
    );
    if (dto.storeId !== undefined || dto.shiftId !== undefined) {
      await this.assertTaskShiftMatchesStore(
        tenantId,
        nextShiftId,
        nextStoreId,
        accessScope,
      );
    }
    const normalizedStatus = data.status as StaffTaskStatus | undefined;
    const currentStatus = current.status as StaffTaskStatus;
    const dataFields = Object.keys(data);

    if (normalizedStatus && normalizedStatus !== currentStatus) {
      this.assertStatusTransitionAllowed(user, current, normalizedStatus);
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const lockedCurrent = await this.lockVisibleTaskForMutation(
        tx,
        tenantId,
        current.id,
        user,
        accessScope,
        'UPDATE',
      );
      const lockedNextStoreId =
        dto.storeId === undefined
          ? lockedCurrent.storeId
          : typeof data.storeId === 'string'
            ? data.storeId
            : null;
      const lockedNextShiftId =
        dto.shiftId === undefined
          ? lockedCurrent.shiftId
          : typeof data.shiftId === 'string'
            ? data.shiftId
            : null;

      if (dto.labels !== undefined) {
        data.labels = this.mergeTaskLabelsForUpdate(
          lockedCurrent.labels,
          dto.labels,
        );
      }

      if (dto.assignedToUserId !== undefined) {
        const assignedToUserIds = await this.resolveAssignedUserIds(
          tenantId,
          undefined,
          typeof data.assignedToUserId === 'string'
            ? data.assignedToUserId
            : null,
          accessScope,
          lockedNextStoreId,
          tx,
        );
        data.assignedToUserId = assignedToUserIds[0] ?? null;
      }
      if (dto.observerUserIds !== undefined) {
        observerUserIds = await this.resolveObserverUserIds(
          tenantId,
          dto.observerUserIds,
          accessScope,
          lockedNextStoreId,
          tx,
        );
      }
      this.assertTaskAssignmentMetadataMutationAllowed(
        lockedCurrent,
        dto,
        observerUserIds,
      );
      if (dto.storeId !== undefined || dto.shiftId !== undefined) {
        await this.assertTaskShiftMatchesStore(
          tenantId,
          lockedNextShiftId,
          lockedNextStoreId,
          accessScope,
          tx,
        );
      }
      if (
        dto.storeId !== undefined ||
        dto.assignedToUserId !== undefined ||
        dto.observerUserIds !== undefined
      ) {
        const finalAssignedToUserIds = Array.from(
          new Set(
            [
              typeof data.assignedToUserId === 'string'
                ? data.assignedToUserId
                : dto.assignedToUserId === undefined
                  ? lockedCurrent.assignedToUserId
                  : null,
              ...this.taskCandidateUserIds(lockedCurrent),
              ...this.taskOriginalAssignedToUserIds(lockedCurrent),
            ].filter((userId): userId is string => Boolean(userId)),
          ),
        );
        const finalObserverUserIds =
          observerUserIds ??
          lockedCurrent.observers.map((observer) => observer.userId);

        await this.resolveAssignedUserIds(
          tenantId,
          finalAssignedToUserIds,
          null,
          accessScope,
          lockedNextStoreId,
          tx,
        );
        await this.resolveObserverUserIds(
          tenantId,
          finalObserverUserIds,
          accessScope,
          lockedNextStoreId,
          tx,
        );
        await this.assertTaskCreationPolicy(
          tenantId,
          user,
          finalAssignedToUserIds,
          finalObserverUserIds,
          lockedNextStoreId,
          tx,
        );
      }

      const lockedCurrentStatus = lockedCurrent.status as StaffTaskStatus;
      const lockedNextStatus = normalizedStatus ?? lockedCurrentStatus;

      if (normalizedStatus && normalizedStatus !== lockedCurrentStatus) {
        this.assertStatusTransitionAllowed(
          user,
          lockedCurrent,
          normalizedStatus,
        );
      }

      if (dataFields.length > 0) {
        await tx.staffTask.update({
          where: { id: lockedCurrent.id },
          data: {
            ...data,
            completedAt:
              data.status === undefined
                ? undefined
                : lockedNextStatus === 'DONE'
                  ? new Date()
                  : null,
          },
          select: { id: true },
        });
      }

      if (observerUserIds !== undefined) {
        await this.syncTaskObservers(
          tx,
          tenantId,
          lockedCurrent.id,
          observerUserIds,
        );
      }

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: lockedCurrent.id,
          actorUserId: user.id,
          action: normalizedStatus
            ? 'STATUS_CHANGED'
            : observerUserIds !== undefined && dataFields.length === 0
              ? 'OBSERVERS_UPDATED'
              : 'UPDATED',
          message: normalizedStatus
            ? `Status changed from ${lockedCurrentStatus} to ${lockedNextStatus}`
            : observerUserIds !== undefined && dataFields.length === 0
              ? 'Task observers updated'
              : 'Task updated',
          metadata: normalizedStatus
            ? {
                fromStatus: lockedCurrentStatus,
                toStatus: lockedNextStatus,
                ...(observerUserIds !== undefined ? { observerUserIds } : {}),
              }
            : {
                fields: dataFields,
                ...(observerUserIds !== undefined ? { observerUserIds } : {}),
              },
        },
      });

      const task = await this.fetchTaskOrThrow(tx, tenantId, lockedCurrent.id);

      if (normalizedStatus) {
        await this.staffTeamChatService.createSystemNotification(
          tenantId,
          this.buildTaskStatusNotification(
            task,
            lockedCurrentStatus,
            normalizedStatus,
          ),
          tx,
        );
      }

      return task;
    });

    return this.toTaskResponse(task);
  }

  async createTaskComment(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskCommentDto,
  ) {
    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const current = await this.prisma.staffTask.findFirst({
      where: {
        AND: [
          { id, tenantId },
          this.buildTaskVisibilityWhere(user, accessScope),
        ],
      },
      select: {
        id: true,
        storeId: true,
        status: true,
        assignedToUserId: true,
        labels: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Staff task not found');
    }

    const body = this.normalizeOptionalString(dto.body);
    const attachmentIds = this.normalizeEvidenceAttachmentIds(
      dto.attachmentIds,
    );
    const evidenceUrl =
      attachmentIds.length === 1
        ? `/staff/attachments/${attachmentIds[0]}`
        : this.normalizeEvidenceUrl(dto.evidenceUrl);
    const evidenceType = this.normalizeOptionalString(dto.evidenceType);
    const evidenceLabel = this.normalizeOptionalString(dto.evidenceLabel);

    const requestedStatus =
      dto.status === undefined
        ? undefined
        : this.resolveOne(dto.status, taskStatuses, 'OPEN');
    const statusChange =
      requestedStatus && requestedStatus !== current.status
        ? requestedStatus
        : undefined;

    if (!body && !evidenceUrl && !statusChange) {
      throw new BadRequestException('Comment or evidence link is required');
    }

    if (statusChange) {
      this.assertStatusTransitionAllowed(user, current, statusChange);
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const lockedCurrent = await this.lockVisibleTaskForMutation(
        tx,
        tenantId,
        current.id,
        user,
        accessScope,
        'COMMENT',
      );
      const lockedStatusChange =
        requestedStatus && requestedStatus !== lockedCurrent.status
          ? requestedStatus
          : undefined;

      if (!body && !evidenceUrl && !lockedStatusChange) {
        throw new BadRequestException('Comment or evidence link is required');
      }

      if (lockedStatusChange) {
        this.assertStatusTransitionAllowed(
          user,
          lockedCurrent,
          lockedStatusChange,
        );
      }

      if (body || evidenceUrl) {
        await tx.staffTaskComment.create({
          data: {
            tenantId,
            taskId: lockedCurrent.id,
            authorUserId: user.id,
            body,
            evidenceType,
            evidenceLabel,
            evidenceUrl,
          },
        });

        if (attachmentIds.length > 0) {
          await this.staffAttachmentBindingsService.bindPendingResourceAttachments(
            tx,
            {
              tenantId,
              actorUserId: user.id,
              resourceKind: StaffAttachmentResourceKind.STAFF_TASK,
              resourceId: lockedCurrent.id,
              attachmentIds,
            },
          );
        }

        await tx.staffTaskAuditEvent.create({
          data: {
            tenantId,
            taskId: lockedCurrent.id,
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
      }

      if (lockedStatusChange) {
        await tx.staffTask.update({
          where: { id: lockedCurrent.id },
          data: {
            status: lockedStatusChange,
            completedAt: lockedStatusChange === 'DONE' ? new Date() : null,
          },
          select: { id: true },
        });

        await tx.staffTaskAuditEvent.create({
          data: {
            tenantId,
            taskId: lockedCurrent.id,
            actorUserId: user.id,
            action: 'STATUS_CHANGED',
            message: `Status changed from ${lockedCurrent.status} to ${lockedStatusChange}`,
            metadata: {
              fromStatus: lockedCurrent.status,
              toStatus: lockedStatusChange,
            },
          },
        });
      }

      const task = await this.fetchTaskOrThrow(tx, tenantId, lockedCurrent.id);

      if (lockedStatusChange) {
        await this.staffTeamChatService.createSystemNotification(
          tenantId,
          this.buildTaskStatusNotification(
            task,
            lockedCurrent.status as StaffTaskStatus,
            lockedStatusChange,
          ),
          tx,
        );
      }

      return task;
    });

    return this.toTaskResponse(task);
  }

  private async lockVisibleTaskForMutation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    taskId: string,
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
    operation: 'UPDATE' | 'COMMENT',
  ): Promise<StaffTaskMutationContext> {
    const visibility =
      operation === 'UPDATE'
        ? this.buildTaskUpdateVisibilityWhere(user, accessScope)
        : this.buildTaskVisibilityWhere(user, accessScope);
    const where: Prisma.StaffTaskWhereInput = {
      AND: [{ id: taskId, tenantId }, visibility],
    };
    const select = {
      id: true,
      storeId: true,
      shiftId: true,
      status: true,
      assignedToUserId: true,
      labels: true,
      observers: { select: { userId: true } },
    } satisfies Prisma.StaffTaskSelect;
    const visibleBeforeLock = await tx.staffTask.findFirst({
      where,
      select,
    });

    if (!visibleBeforeLock) {
      throw new NotFoundException('Staff task not found');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT task."id"
      FROM "StaffTask" AS task
      WHERE task."id" = ${taskId}
        AND task."tenantId" = ${tenantId}
      FOR UPDATE
    `);

    if (lockedRows.length !== 1) {
      throw new NotFoundException('Staff task not found');
    }

    const current = await tx.staffTask.findFirst({
      where,
      select,
    });

    if (!current) {
      throw new NotFoundException('Staff task not found');
    }

    return current;
  }

  async canReadAnyAttachmentTask(
    user: AuthenticatedUser,
    taskIds: readonly string[],
    prismaClient: Pick<PrismaService, 'staffTask'> = this.prisma,
  ): Promise<boolean> {
    if (!hasCapability(user, 'view_staff_tasks')) {
      return false;
    }

    const normalizedTaskIds = Array.from(
      new Set(
        taskIds
          .map((taskId) => taskId.trim())
          .filter((taskId) => taskId.length > 0),
      ),
    );

    if (normalizedTaskIds.length === 0) {
      return false;
    }

    const { tenantId } = this.tenantContextService.resolve(user);
    const accessScope = this.accessScopeService.resolve(user);
    const task = await prismaClient.staffTask.findFirst({
      where: {
        AND: [
          { id: { in: normalizedTaskIds }, tenantId },
          this.buildTaskVisibilityWhere(user, accessScope),
        ],
      },
      select: { id: true },
    });

    return Boolean(task);
  }

  private buildTaskVisibilityWhere(
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
  ): Prisma.StaffTaskWhereInput {
    if (accessScope.mode === 'NETWORK') {
      return {};
    }

    return {
      OR: [
        {
          AND: [
            { storeId: { in: [...accessScope.allowedStoreIds] } },
            {
              OR: [
                { shiftId: null },
                {
                  shift: {
                    is: {
                      storeId: { in: [...accessScope.allowedStoreIds] },
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          AND: [
            { storeId: null },
            { shiftId: null },
            {
              OR: [
                { assignedToUserId: user.id },
                { observers: { some: { userId: user.id } } },
              ],
            },
          ],
        },
      ],
    };
  }

  private buildTaskUpdateVisibilityWhere(
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
  ): Prisma.StaffTaskWhereInput {
    if (accessScope.mode === 'NETWORK') {
      return {};
    }

    return {
      AND: [
        this.buildTaskVisibilityWhere(user, accessScope),
        { storeId: { in: [...accessScope.allowedStoreIds] } },
      ],
    };
  }

  private assertTaskStoreFilterAllowed(
    user: AuthenticatedUser,
    storeId: string | null,
  ) {
    if (storeId) {
      this.accessScopeService.assertStoreAllowed(user, storeId);
    }
  }

  private assertTaskCreateStoreAllowed(
    accessScope: ResolvedAccessScope,
    storeId: string | null,
  ) {
    if (
      accessScope.mode === 'STORES' &&
      (!storeId || !accessScope.allowedStoreIds.includes(storeId))
    ) {
      throw new ForbiddenException(
        'A store-scoped task must belong to an allowed store',
      );
    }
  }

  private assertTaskUpdateStoreAllowed(
    accessScope: ResolvedAccessScope,
    dto: StaffTaskDto,
    data: Prisma.StaffTaskUncheckedUpdateInput,
  ) {
    if (accessScope.mode !== 'STORES' || dto.storeId === undefined) {
      return;
    }

    const storeId = typeof data.storeId === 'string' ? data.storeId : null;

    if (!storeId || !accessScope.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'A store-scoped task must belong to an allowed store',
      );
    }
  }

  private async assertTaskShiftMatchesStore(
    tenantId: string,
    shiftId: string | null,
    taskStoreId: string | null,
    accessScope: ResolvedAccessScope,
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    if (!shiftId) {
      return;
    }

    const shift = await prismaClient.guestWorkingShift.findFirst({
      where: { id: shiftId, tenantId },
      select: { id: true, storeId: true },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    if (
      accessScope.mode === 'STORES' &&
      (!shift.storeId || !accessScope.allowedStoreIds.includes(shift.storeId))
    ) {
      throw new ForbiddenException('Shift is outside your access scope');
    }

    if (!taskStoreId || shift.storeId !== taskStoreId) {
      throw new BadRequestException(
        'Task store must match the selected shift store',
      );
    }
  }

  private buildTaskUserSelectorWhere(
    tenantId: string,
    accessScope: ResolvedAccessScope,
    requiredStoreId: string | null | undefined = undefined,
  ): Prisma.UserWhereInput {
    if (accessScope.mode === 'NETWORK') {
      const where: Prisma.UserWhereInput = {
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
      };

      if (requiredStoreId === null) {
        return {
          ...where,
          accessScope: 'NETWORK',
          storeAccesses: { none: {} },
        };
      }

      if (requiredStoreId) {
        return {
          ...where,
          OR: [
            {
              accessScope: 'NETWORK',
              storeAccesses: { none: {} },
            },
            {
              accessScope: 'STORES',
              storeAccesses: {
                some: { storeId: requiredStoreId },
                none: { store: { tenantId: { not: tenantId } } },
              },
            },
          ],
        };
      }

      return {
        ...where,
        OR: [
          {
            accessScope: 'NETWORK',
            storeAccesses: { none: {} },
          },
          {
            accessScope: 'STORES',
            storeAccesses: {
              some: { store: { tenantId } },
              none: { store: { tenantId: { not: tenantId } } },
            },
          },
        ],
      };
    }

    const storeIds = [...accessScope.allowedStoreIds];

    return {
      tenantId,
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      storeAccesses: {
        some: {
          storeId: requiredStoreId ? requiredStoreId : { in: storeIds },
        },
        none: { storeId: { notIn: storeIds } },
      },
    };
  }

  private buildTaskStoreSelectorWhere(
    tenantId: string,
    accessScope: ResolvedAccessScope,
  ): Prisma.StoreWhereInput {
    return accessScope.mode === 'NETWORK'
      ? { tenantId }
      : {
          tenantId,
          id: { in: [...accessScope.allowedStoreIds] },
        };
  }

  private isTaskStoreVisible(
    storeId: string,
    accessScope: ResolvedAccessScope,
  ) {
    return (
      accessScope.mode === 'NETWORK' ||
      accessScope.allowedStoreIds.includes(storeId)
    );
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
      taskId: this.normalizeOptionalString(query.taskId),
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
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
  ): Prisma.StaffTaskWhereInput {
    const where: Prisma.StaffTaskWhereInput = { tenantId };
    const and: Prisma.StaffTaskWhereInput[] = [];
    const now = new Date();

    if (accessScope.mode === 'STORES') {
      and.push(this.buildTaskVisibilityWhere(user, accessScope));
    }

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

    if (filters.taskId) {
      where.id = filters.taskId;
    }

    if (filters.shiftId) {
      where.shiftId = filters.shiftId;
    }

    if (filters.assignedToUserId) {
      where.assignedToUserId = filters.assignedToUserId;
    } else if (includeStatus && filters.view === 'my') {
      and.push({
        OR: [
          { assignedToUserId: user.id },
          {
            AND: [
              {
                labels: {
                  path: ['assignmentMode'],
                  equals: 'ANY_OF',
                },
              },
              {
                observers: { some: { userId: user.id } },
              },
            ],
          },
        ],
      });
    }

    if (filters.observerUserId) {
      where.observers = { some: { userId: filters.observerUserId } };
    } else if (includeStatus && filters.view === 'watched') {
      where.observers = { some: { userId: user.id } };
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
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
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
      user,
      accessScope,
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

  private async fetchOrderedTaskRows(
    tenantId: string,
    filters: StaffTaskReport['filters'],
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
    take: number,
  ): Promise<StaffTaskRow[]> {
    const where = this.buildWhere(tenantId, filters, true, user, accessScope);
    const orderBy = this.buildOrderBy(filters);

    if (filters.status !== 'all') {
      return this.prisma.staffTask.findMany({
        where,
        include: taskInclude,
        orderBy,
        take,
      });
    }

    const activeRows = await this.prisma.staffTask.findMany({
      where: this.withTaskStatusWhere(where, { notIn: ['DONE', 'CANCELED'] }),
      include: taskInclude,
      orderBy,
      take,
    });

    if (activeRows.length >= take) {
      return activeRows;
    }

    const closedRows = await this.prisma.staffTask.findMany({
      where: this.withTaskStatusWhere(where, { in: ['DONE', 'CANCELED'] }),
      include: taskInclude,
      orderBy,
      take: take - activeRows.length,
    });

    return [...activeRows, ...closedRows];
  }

  private withTaskStatusWhere(
    where: Prisma.StaffTaskWhereInput,
    status: Prisma.StringFilter | StaffTaskStatus,
  ): Prisma.StaffTaskWhereInput {
    return {
      AND: [
        where,
        {
          status,
        },
      ],
    };
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
        count: rows.filter(
          (row) =>
            row.assignedToUserId === currentUserId ||
            this.isAnyOfTaskForUser(row, currentUserId),
        ).length,
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

  private assertStatusTransitionAllowed(
    user: AuthenticatedUser,
    current: StaffTaskStatusContext,
    nextStatus: StaffTaskStatus,
  ) {
    const currentStatus = current.status as StaffTaskStatus;

    if (this.isTerminalStatus(currentStatus)) {
      throw new BadRequestException('Closed task status cannot be changed');
    }

    if (nextStatus === 'DONE') {
      if (currentStatus !== 'ON_REVIEW') {
        throw new BadRequestException(
          'Task must be submitted for review before completion',
        );
      }

      this.assertCanApproveTask(user, current);
      return;
    }

    if (nextStatus === 'CANCELED') {
      this.assertCanCancelTask(user);
      return;
    }

    if (currentStatus === 'ON_REVIEW' && nextStatus === 'IN_PROGRESS') {
      this.assertCanReturnTask(user, current);
      return;
    }

    this.assertCanMoveTask(user, current);
  }

  private assertCanApproveTask(
    user: AuthenticatedUser,
    current: StaffTaskStatusContext,
  ) {
    if (
      current.assignedToUserId === user.id ||
      this.taskCandidateUserIds(current).includes(user.id)
    ) {
      throw new ForbiddenException('You cannot approve your own task');
    }

    if (!this.canReviewTask(user)) {
      throw new ForbiddenException(
        'Only a manager can approve submitted staff tasks',
      );
    }
  }

  private assertCanReturnTask(
    user: AuthenticatedUser,
    current: StaffTaskStatusContext,
  ) {
    if (
      current.assignedToUserId === user.id ||
      this.taskCandidateUserIds(current).includes(user.id) ||
      this.canReviewTask(user)
    ) {
      return;
    }

    throw new ForbiddenException(
      'Only the assignee or a manager can return a submitted task',
    );
  }

  private assertCanCancelTask(user: AuthenticatedUser) {
    if (this.canManageTaskStatus(user)) {
      return;
    }

    throw new ForbiddenException(
      'Only a staff task manager can cancel staff tasks',
    );
  }

  private assertCanMoveTask(
    user: AuthenticatedUser,
    current: StaffTaskStatusContext,
  ) {
    if (
      current.assignedToUserId === user.id ||
      this.taskCandidateUserIds(current).includes(user.id) ||
      this.canReviewTask(user)
    ) {
      return;
    }

    throw new ForbiddenException(
      'Only the assignee or a manager can change task status',
    );
  }

  private canReviewTask(user: AuthenticatedUser) {
    return (
      hasCapability(user, 'manage_staff_tasks') &&
      (user.isPlatformAdmin ||
        (taskReviewerRoles as readonly UserRole[]).includes(user.role))
    );
  }

  private canManageTaskStatus(user: AuthenticatedUser) {
    return (
      hasCapability(user, 'manage_staff_tasks') &&
      (user.isPlatformAdmin ||
        (taskStatusManagerRoles as readonly UserRole[]).includes(user.role))
    );
  }

  private mustCreateTaskForStaffOnly(user: AuthenticatedUser) {
    return (
      !user.isPlatformAdmin &&
      (user.role === UserRole.CLUB_ADMINISTRATOR ||
        user.role === UserRole.TRAINEE ||
        user.role === UserRole.SENIOR_ADMINISTRATOR)
    );
  }

  private mustRequestTaskConfirmation(user: AuthenticatedUser) {
    return (
      !user.isPlatformAdmin &&
      (user.role === UserRole.CLUB_ADMINISTRATOR ||
        user.role === UserRole.TRAINEE)
    );
  }

  private resolveAssignmentMode(
    value: StaffTaskAssignmentMode | undefined,
    assignedCount: number,
  ): StaffTaskAssignmentMode {
    const mode = this.resolveOne(value, taskAssignmentModes, 'SINGLE');

    if (mode === 'ANY_OF' && assignedCount === 0) {
      throw new BadRequestException(
        'Для общей задачи выберите хотя бы одного ответственного.',
      );
    }

    if (mode === 'INDIVIDUAL' && assignedCount === 0) {
      throw new BadRequestException(
        'Для отдельных задач выберите ответственных.',
      );
    }

    if (mode === 'SINGLE' && assignedCount > 1) {
      return 'INDIVIDUAL';
    }

    return mode;
  }

  private async resolveAssignedUserIds(
    tenantId: string,
    value: unknown,
    fallbackUserId: string | null,
    accessScope: ResolvedAccessScope,
    taskStoreId: string | null,
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    const rawValues = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : fallbackUserId
          ? [fallbackUserId]
          : [];
    const ids = Array.from(
      new Set(
        rawValues
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean),
      ),
    );

    if (ids.length === 0) {
      return [];
    }

    const users = await prismaClient.user.findMany({
      where: {
        ...this.buildTaskUserSelectorWhere(tenantId, accessScope, taskStoreId),
        id: { in: ids },
      },
      select: { id: true },
    });
    const foundIds = new Set(users.map((assignedUser) => assignedUser.id));
    const missingId = ids.find((id) => !foundIds.has(id));

    if (missingId) {
      throw new BadRequestException('Assigned user not found');
    }

    return ids;
  }

  private buildAssignmentLabels(
    value: Prisma.StaffTaskUncheckedUpdateInput['labels'],
    assignment: {
      assignmentMode: StaffTaskAssignmentMode;
      candidateUserIds: string[];
      bulkTaskGroupId: string | null;
      originalAssignedToUserIds: string[];
    },
  ) {
    const labelObject = this.taskLabelObject(value);
    const labels = { ...(labelObject ?? {}) };
    taskAssignmentLabelKeys.forEach((key) => delete labels[key]);

    if (
      assignment.assignmentMode === 'SINGLE' &&
      assignment.candidateUserIds.length <= 1 &&
      !assignment.bulkTaskGroupId
    ) {
      return labelObject ? (labels as Prisma.InputJsonValue) : value;
    }

    if (!labelObject && value !== null && value !== undefined) {
      throw new BadRequestException(
        'Task labels must be an object for grouped assignment',
      );
    }

    return {
      ...labels,
      assignmentMode: assignment.assignmentMode,
      candidateUserIds: assignment.candidateUserIds,
      originalAssignedToUserIds: assignment.originalAssignedToUserIds,
      ...(assignment.bulkTaskGroupId
        ? { bulkTaskGroupId: assignment.bulkTaskGroupId }
        : {}),
    } satisfies Prisma.InputJsonValue;
  }

  private taskLabelRecord(task: { labels: Prisma.JsonValue | null }) {
    return this.taskLabelObject(task.labels);
  }

  private taskLabelObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private assertTaskCreationStatus(status: StaffTaskStatus) {
    if (status !== 'OPEN') {
      throw new BadRequestException(
        'New staff tasks must start in OPEN status',
      );
    }
  }

  private assertNoServerOwnedTaskLabelKeys(value: unknown) {
    const labels = this.taskLabelObject(value);
    const forbiddenKey = labels
      ? taskAssignmentLabelKeys.find((key) =>
          Object.prototype.hasOwnProperty.call(labels, key),
        )
      : undefined;

    if (forbiddenKey) {
      throw new BadRequestException(
        `Task label "${forbiddenKey}" is managed by the server`,
      );
    }
  }

  private mergeTaskLabelsForUpdate(
    currentValue: Prisma.JsonValue | null,
    nextValue: unknown,
  ) {
    const currentLabels = this.taskLabelObject(currentValue);
    const serverLabels: Record<string, unknown> = {};

    if (currentLabels) {
      taskAssignmentLabelKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(currentLabels, key)) {
          serverLabels[key] = currentLabels[key];
        }
      });
    }

    if (Object.keys(serverLabels).length === 0) {
      return this.normalizeJson(nextValue);
    }

    if (nextValue === null || nextValue === undefined || nextValue === '') {
      return serverLabels as Prisma.InputJsonValue;
    }

    const nextLabels = this.taskLabelObject(nextValue);

    if (!nextLabels) {
      throw new BadRequestException(
        'Task labels must be an object while assignment metadata is present',
      );
    }

    return {
      ...nextLabels,
      ...serverLabels,
    } as Prisma.InputJsonValue;
  }

  private assertTaskAssignmentMetadataMutationAllowed(
    current: { labels: Prisma.JsonValue | null },
    dto: StaffTaskDto,
    observerUserIds: string[] | undefined,
  ) {
    const labels = this.taskLabelRecord(current);
    const hasServerAssignmentMetadata = taskAssignmentLabelKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(labels ?? {}, key),
    );

    if (dto.assignedToUserId !== undefined && hasServerAssignmentMetadata) {
      throw new BadRequestException(
        'Grouped task assignment must be changed through a dedicated workflow',
      );
    }

    if (observerUserIds === undefined || labels?.assignmentMode !== 'ANY_OF') {
      return;
    }

    const observerIds = new Set(observerUserIds);
    const removedCandidateId = this.taskCandidateUserIds(current).find(
      (candidateUserId) => !observerIds.has(candidateUserId),
    );

    if (removedCandidateId) {
      throw new BadRequestException(
        'ANY_OF task candidates must remain task observers',
      );
    }
  }

  private taskCandidateUserIds(task: { labels: Prisma.JsonValue | null }) {
    const labels = this.taskLabelRecord(task);
    const candidateUserIds = labels?.candidateUserIds;

    return Array.isArray(candidateUserIds)
      ? candidateUserIds.filter(
          (candidateUserId): candidateUserId is string =>
            typeof candidateUserId === 'string' && candidateUserId.length > 0,
        )
      : [];
  }

  private taskOriginalAssignedToUserIds(task: {
    labels: Prisma.JsonValue | null;
  }) {
    const labels = this.taskLabelRecord(task);
    const originalAssignedToUserIds = labels?.originalAssignedToUserIds;

    return Array.isArray(originalAssignedToUserIds)
      ? originalAssignedToUserIds.filter(
          (userId): userId is string =>
            typeof userId === 'string' && userId.length > 0,
        )
      : [];
  }

  private isAnyOfTaskForUser(
    task: {
      labels: Prisma.JsonValue | null;
      observers?: Array<{ userId: string }>;
    },
    userId: string,
  ) {
    const labels = this.taskLabelRecord(task);

    return (
      labels?.assignmentMode === 'ANY_OF' &&
      this.taskCandidateUserIds(task).includes(userId) &&
      (!task.observers ||
        task.observers.some((observer) => observer.userId === userId))
    );
  }

  private async assertTaskCreationPolicy(
    tenantId: string,
    user: AuthenticatedUser,
    assignedToUserIds: string[],
    observerUserIds: string[],
    taskStoreId: string | null,
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    const staffOnly = this.mustCreateTaskForStaffOnly(user);
    const needsConfirmation = this.mustRequestTaskConfirmation(user);

    if (!staffOnly && !needsConfirmation) {
      return;
    }

    if (assignedToUserIds.length === 0) {
      throw new BadRequestException(
        'Выберите ответственного администратора или стажера.',
      );
    }

    const assignedUsers = await prismaClient.user.findMany({
      where: { id: { in: assignedToUserIds }, tenantId, isActive: true },
      select: {
        id: true,
        role: true,
        storeAccesses: { select: { storeId: true } },
      },
    });

    if (assignedUsers.length !== assignedToUserIds.length) {
      throw new BadRequestException('Assigned user not found');
    }

    const hasOnlyAllowedAssignedUsers = assignedUsers.every((assignedUser) =>
      (taskStaffAssigneeRoles as readonly UserRole[]).includes(
        assignedUser.role,
      ),
    );

    if (!hasOnlyAllowedAssignedUsers) {
      throw new ForbiddenException(
        user.role === UserRole.SENIOR_ADMINISTRATOR
          ? 'Старший администратор может назначать задачи только администраторам и стажерам.'
          : 'Администратор и стажер могут назначать задачи только администраторам и стажерам.',
      );
    }

    if (user.role === UserRole.SENIOR_ADMINISTRATOR) {
      await this.assertSeniorAdministratorTaskStoreScope(
        tenantId,
        user.id,
        assignedUsers,
        taskStoreId,
        prismaClient,
      );
    }

    if (!needsConfirmation) {
      return;
    }

    if (assignedUsers.some((assignedUser) => assignedUser.id === user.id)) {
      throw new ForbiddenException('Нельзя назначить задачу самому себе.');
    }

    if (observerUserIds.length === 0) {
      throw new BadRequestException(
        'Для задачи нужно выбрать подтверждающего: старшего администратора, управляющего клубом или менеджера по стандартам.',
      );
    }

    const confirmationUsers = await prismaClient.user.findMany({
      where: { id: { in: observerUserIds }, tenantId, isActive: true },
      select: { id: true, role: true },
    });
    const allConfirmationUsersAreAllowed =
      confirmationUsers.length === observerUserIds.length &&
      confirmationUsers.every((confirmationUser) =>
        (taskConfirmationRoles as readonly UserRole[]).includes(
          confirmationUser.role,
        ),
      );

    if (!allConfirmationUsersAreAllowed) {
      throw new ForbiddenException(
        'Подтверждающими могут быть только старший администратор, управляющий клубом или менеджер по стандартам.',
      );
    }
  }

  private async assertSeniorAdministratorTaskStoreScope(
    tenantId: string,
    userId: string,
    assignedUsers: Array<{
      id: string;
      storeAccesses: Array<{ storeId: string }>;
    }>,
    taskStoreId: string | null,
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    const seniorUser = await prismaClient.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { storeAccesses: { select: { storeId: true } } },
    });
    const seniorStoreIds = new Set(
      seniorUser?.storeAccesses.map((access) => access.storeId) ?? [],
    );

    if (seniorStoreIds.size === 0) {
      throw new ForbiddenException(
        'У старшего администратора не указан клуб. Назначить задачу можно только внутри своего клуба.',
      );
    }

    if (!taskStoreId || !seniorStoreIds.has(taskStoreId)) {
      throw new ForbiddenException(
        'Старший администратор может ставить задачи только в своем клубе.',
      );
    }

    const hasOnlyOwnStoreAssignees = assignedUsers.every((assignedUser) =>
      assignedUser.storeAccesses.some((access) =>
        seniorStoreIds.has(access.storeId),
      ),
    );

    if (!hasOnlyOwnStoreAssignees) {
      throw new ForbiddenException(
        'Старший администратор может назначать задачи только администраторам и стажерам своего клуба.',
      );
    }
  }

  private async normalizeTaskData(
    tenantId: string,
    dto: StaffTaskDto,
    options: { requireTitle: boolean },
    prismaClient: StaffTaskReferenceClient = this.prisma,
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
      data.storeId = await this.resolveStoreId(
        tenantId,
        dto.storeId,
        prismaClient,
      );
    }

    if (dto.shiftId !== undefined) {
      data.shiftId = await this.resolveShiftId(
        tenantId,
        dto.shiftId,
        prismaClient,
      );
    }

    if (dto.assignedToUserId !== undefined) {
      data.assignedToUserId = this.normalizeOptionalString(
        dto.assignedToUserId,
      );
    }

    if (dto.labels !== undefined) {
      this.assertNoServerOwnedTaskLabelKeys(dto.labels);
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
    accessScope: ResolvedAccessScope,
    taskStoreId: string | null,
    prismaClient: StaffTaskReferenceClient = this.prisma,
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

    const users = await prismaClient.user.findMany({
      where: {
        ...this.buildTaskUserSelectorWhere(tenantId, accessScope, taskStoreId),
        id: { in: ids },
      },
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

  private buildTaskCreatedNotification(
    task: StaffTaskRow,
  ): StaffChatSystemNotificationDto {
    return {
      title: `Назначена задача: ${task.title}`,
      message: this.buildTaskNotificationDetails(task),
      storeId: task.storeId,
      severity: this.taskNotificationSeverity(
        task.priority as StaffTaskPriority,
      ),
      actionLabel: 'Открыть задачу',
      actionHref: `/staff/tasks?taskId=${encodeURIComponent(task.id)}`,
    };
  }

  private buildTaskStatusNotification(
    task: StaffTaskRow,
    fromStatus: StaffTaskStatus,
    toStatus: StaffTaskStatus,
  ): StaffChatSystemNotificationDto {
    const titleByStatus: Record<StaffTaskStatus, string> = {
      OPEN: 'Задача возвращена в новые',
      IN_PROGRESS:
        fromStatus === 'ON_REVIEW'
          ? 'Задача возвращена в работу'
          : 'Задача взята в работу',
      ON_REVIEW: 'Задача отправлена на проверку',
      DONE: 'Задача закрыта',
      CANCELED: 'Задача отменена',
    };

    return {
      title: `${titleByStatus[toStatus]}: ${task.title}`,
      message: [
        `Статус: ${this.taskStatusLabel(fromStatus)} -> ${this.taskStatusLabel(toStatus)}`,
        this.buildTaskNotificationDetails(task),
      ].join('\n'),
      storeId: task.storeId,
      severity:
        toStatus === 'DONE' || toStatus === 'ON_REVIEW'
          ? 'INFO'
          : toStatus === 'CANCELED'
            ? 'WARNING'
            : this.taskNotificationSeverity(task.priority as StaffTaskPriority),
      actionLabel: 'Открыть задачу',
      actionHref: `/staff/tasks?taskId=${encodeURIComponent(task.id)}`,
    };
  }

  private buildTaskNotificationDetails(task: StaffTaskRow) {
    return [
      task.store ? `Клуб: ${task.store.name}` : 'Клуб: вся сеть',
      `Ответственный: ${this.taskAssigneeLabel(task) ?? 'Не назначен'}`,
      task.dueAt ? `Срок: ${formatStaffDateTime(task.dueAt)}` : null,
      `Приоритет: ${this.taskPriorityLabel(task.priority as StaffTaskPriority)}`,
      `Тип: ${this.taskTypeLabel(task.type as StaffTaskType)}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private taskNotificationSeverity(priority: StaffTaskPriority) {
    if (priority === 'URGENT') {
      return 'CRITICAL';
    }

    if (priority === 'HIGH') {
      return 'WARNING';
    }

    return 'INFO';
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
      this.taskAssigneeLabel(task),
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

  private taskAssigneeLabel(task: {
    assignedToUser: StaffTaskUserResponse | null;
    observers: Array<{ userId?: string; user: StaffTaskUserResponse }>;
    labels: Prisma.JsonValue | null;
  }) {
    const assignedLabel = staffUserLabel(task.assignedToUser);

    if (assignedLabel) {
      return assignedLabel;
    }

    const labels = this.taskLabelRecord(task);

    if (labels?.assignmentMode !== 'ANY_OF') {
      return null;
    }

    const candidateIds = new Set(this.taskCandidateUserIds(task));
    const candidateLabels = task.observers
      .filter((observer) =>
        candidateIds.has(observer.userId ?? observer.user.id),
      )
      .map((observer) => staffUserLabel(observer.user))
      .filter(Boolean);

    if (candidateLabels.length === 0) {
      return candidateIds.size > 0 ? `Любой из ${candidateIds.size}` : null;
    }

    return `Любой из: ${candidateLabels.join(', ')}`;
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

    if (this.isInternalAttachmentPath(normalized)) {
      throw new BadRequestException(
        'Attachment IDs are required for internal evidence links',
      );
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

    if (this.isInternalAttachmentPath(url.pathname)) {
      throw new BadRequestException(
        'Attachment IDs are required for internal evidence links',
      );
    }

    return url.toString();
  }

  private normalizeEvidenceAttachmentIds(value: unknown) {
    if (value === null || value === undefined) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('Attachment IDs must be an array');
    }

    const attachmentIds = Array.from(
      new Set(
        value.map((attachmentId) => {
          if (typeof attachmentId !== 'string' || !attachmentId.trim()) {
            throw new BadRequestException('Attachment ID is required');
          }

          return attachmentId.trim();
        }),
      ),
    );

    if (attachmentIds.length > 1) {
      throw new BadRequestException(
        'Only one evidence attachment is supported',
      );
    }

    return attachmentIds;
  }

  private isInternalAttachmentPath(value: string) {
    return /^\/?(?:api\/)?staff\/attachments\/[^/?#]+(?:[?#].*)?$/i.test(
      value.trim(),
    );
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
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const store = await prismaClient.store.findFirst({
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
    prismaClient: StaffTaskReferenceClient = this.prisma,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const shift = await prismaClient.guestWorkingShift.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    return shift.id;
  }
}
