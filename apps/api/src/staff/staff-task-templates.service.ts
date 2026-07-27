import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedAccessScope } from '../tenancy/access-scope.service';
import { StaffTaskCatalogAccessPolicyService } from './staff-task-catalog-access-policy.service';
import { StaffTasksService } from './staff-tasks.service';

const templateStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
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

export type StaffTaskTemplateStatus = (typeof templateStatuses)[number];
export type StaffTaskTemplateTaskType = (typeof taskTypes)[number];
export type StaffTaskTemplatePriority = (typeof taskPriorities)[number];

export type StaffTaskTemplatesQuery = {
  status?: StaffTaskTemplateStatus | 'all';
  type?: StaffTaskTemplateTaskType | 'all';
  priority?: StaffTaskTemplatePriority | 'all';
  storeId?: string;
  search?: string;
};

export type StaffTaskTemplateDto = {
  title?: string;
  description?: string | null;
  type?: StaffTaskTemplateTaskType;
  priority?: StaffTaskTemplatePriority;
  status?: StaffTaskTemplateStatus;
  storeId?: string | null;
  dueOffsetMinutes?: number | string | null;
  labels?: unknown;
  checklist?: unknown;
};

export type StaffTaskTemplateLaunchDto = {
  title?: string;
  description?: string | null;
  storeId?: string | null;
  assignedToUserId?: string | null;
  observerUserIds?: unknown;
  dueAt?: string | null;
};

export type StaffTaskTemplateReport = {
  filters: {
    status: StaffTaskTemplateStatus | 'all';
    type: StaffTaskTemplateTaskType | 'all';
    priority: StaffTaskTemplatePriority | 'all';
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    tasksCreated: number;
  };
  rows: StaffTaskTemplateResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; email: string; fullName: string | null }>;
};

export type StaffTaskTemplateResponse = {
  id: string;
  title: string;
  description: string | null;
  type: StaffTaskTemplateTaskType;
  priority: StaffTaskTemplatePriority;
  status: StaffTaskTemplateStatus;
  dueOffsetMinutes: number | null;
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
  tasksCreatedCount: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffTaskTemplateLaunchResponse = {
  id: string;
  title: string;
  dueAt: string | null;
  templateId: string;
};

function buildVisibleTemplateTaskWhere(
  accessScope: ResolvedAccessScope,
): Prisma.StaffTaskWhereInput {
  return accessScope.mode === 'NETWORK'
    ? { tenantId: accessScope.tenantId }
    : {
        tenantId: accessScope.tenantId,
        storeId: { in: [...accessScope.allowedStoreIds] },
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
      };
}

function buildTemplateInclude(accessScope: ResolvedAccessScope) {
  const taskWhere = buildVisibleTemplateTaskWhere(accessScope);

  return {
    store: {
      select: { id: true, tenantId: true, name: true, isActive: true },
    },
    createdByUser: {
      select: { id: true, tenantId: true, email: true, fullName: true },
    },
    _count: { select: { tasks: { where: taskWhere } } },
  } satisfies Prisma.StaffTaskTemplateInclude;
}

type StaffTaskTemplateRow = Prisma.StaffTaskTemplateGetPayload<{
  include: ReturnType<typeof buildTemplateInclude>;
}>;

type StaffTaskTemplateReferenceClient = Pick<PrismaService, 'store'>;

@Injectable()
export class StaffTaskTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogAccessPolicy: StaffTaskCatalogAccessPolicyService,
    private readonly staffTasksService: StaffTasksService,
    private readonly configService: ConfigService,
  ) {}

  async getTemplates(
    user: AuthenticatedUser,
    query: StaffTaskTemplatesQuery = {},
  ): Promise<StaffTaskTemplateReport> {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const filters = this.resolveFilters(query);
    this.catalogAccessPolicy.assertExplicitStoreFilterAllowed(
      accessScope,
      filters.storeId,
    );
    if (filters.storeId) {
      const visibleStore = await this.prisma.store.findFirst({
        where: {
          AND: [
            this.catalogAccessPolicy.buildStoreSelectorWhere(accessScope),
            { id: filters.storeId },
          ],
        },
        select: { id: true },
      });

      if (!visibleStore) {
        throw new ForbiddenException('Store is outside your access scope');
      }
    }
    const where = this.catalogAccessPolicy.buildTemplateWhere(
      accessScope,
      this.buildFilterWhere(filters),
    );

    const [rows, stores, users, statusCounts, tasksCreated] = await Promise.all(
      [
        this.prisma.staffTaskTemplate.findMany({
          where,
          include: buildTemplateInclude(accessScope),
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
          take: 200,
        }),
        this.prisma.store.findMany({
          where: this.catalogAccessPolicy.buildStoreSelectorWhere(accessScope),
          select: { id: true, name: true, isActive: true },
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        }),
        this.prisma.user.findMany({
          where:
            this.catalogAccessPolicy.buildParticipantUserWhere(accessScope),
          select: { id: true, email: true, fullName: true },
          orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
        }),
        this.prisma.staffTaskTemplate.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.staffTask.count({
          where: {
            AND: [
              buildVisibleTemplateTaskWhere(accessScope),
              { sourceTemplate: { is: where } },
            ],
          },
        }),
      ],
    );
    const visibleCreatorIds = new Set(
      users.map((visibleUser) => visibleUser.id),
    );
    const responseRows = rows.map((row) =>
      this.toTemplateResponse(row, visibleCreatorIds),
    );

    return {
      filters,
      summary: this.buildSummary(statusCounts, tasksCreated),
      rows: responseRows,
      stores,
      users,
    };
  }

  async createTemplate(user: AuthenticatedUser, dto: StaffTaskTemplateDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const accessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const data = await this.normalizeTemplateData(
        accessScope,
        dto,
        { requireTitle: true },
        tx,
      );
      const storeId = typeof data.storeId === 'string' ? data.storeId : null;
      this.catalogAccessPolicy.assertStoreMutationAllowed(accessScope, storeId);

      const template = await tx.staffTaskTemplate.create({
        data: {
          ...(data as Prisma.StaffTaskTemplateUncheckedCreateInput),
          tenantId: accessScope.tenantId,
          createdByUserId: user.id,
        },
        include: buildTemplateInclude(accessScope),
      });
      await this.writeTemplateAudit(tx, user, template, {
        action: 'CREATED',
        changedFields: this.catalogChangedFields(dto),
      });

      return template;
    });

    return this.toTemplateResponse(created, new Set([user.id]));
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskTemplateDto,
  ) {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const current = await this.prisma.staffTaskTemplate.findFirst({
      where: this.catalogAccessPolicy.buildTemplateLookupWhere(accessScope, id),
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Staff task template not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const freshAccessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const lockedCurrent = await this.lockVisibleTemplateForMutation(
        tx,
        freshAccessScope,
        current.id,
      );
      const data = await this.normalizeTemplateData(
        freshAccessScope,
        dto,
        { requireTitle: false },
        tx,
      );
      const nextStoreId =
        dto.storeId === undefined
          ? lockedCurrent.storeId
          : typeof data.storeId === 'string'
            ? data.storeId
            : null;
      this.catalogAccessPolicy.assertStoreMutationAllowed(
        freshAccessScope,
        nextStoreId,
      );
      if (nextStoreId) {
        await this.resolveStoreId(freshAccessScope, nextStoreId, tx);
      }
      const nextStatus =
        typeof data.status === 'string' ? data.status : lockedCurrent.status;
      await this.assertActiveRulesUnaffected(
        tx,
        lockedCurrent,
        nextStoreId,
        nextStatus,
      );

      const template = await tx.staffTaskTemplate.update({
        where: { id: lockedCurrent.id },
        data,
        include: buildTemplateInclude(freshAccessScope),
      });
      await this.writeTemplateAudit(tx, user, template, {
        action: this.resolveTemplateUpdateAuditAction(
          lockedCurrent.status,
          template.status,
        ),
        changedFields: this.catalogChangedFields(dto),
        before: lockedCurrent,
      });

      return template;
    });

    return this.toTemplateResponse(updated, new Set([user.id]));
  }

  async createTaskFromTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskTemplateLaunchDto,
  ): Promise<StaffTaskTemplateLaunchResponse> {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const template = await this.prisma.staffTaskTemplate.findFirst({
      where: this.catalogAccessPolicy.buildTemplateLookupWhere(accessScope, id),
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Staff task template not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const freshAccessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const lockedTemplate = await this.lockVisibleTemplateForMutation(
        tx,
        freshAccessScope,
        template.id,
      );

      if (lockedTemplate.status !== 'ACTIVE') {
        throw new BadRequestException('Only active templates can create tasks');
      }

      const inheritedStoreId = lockedTemplate.storeId
        ? await this.resolveStoreId(
            freshAccessScope,
            lockedTemplate.storeId,
            tx,
          )
        : null;
      const storeId =
        dto.storeId === undefined
          ? inheritedStoreId
          : await this.resolveStoreId(freshAccessScope, dto.storeId, tx);
      this.catalogAccessPolicy.assertStoreMutationAllowed(
        freshAccessScope,
        storeId,
      );
      if (inheritedStoreId && storeId !== inheritedStoreId) {
        throw new BadRequestException(
          'A store-bound template can only create tasks for its own store',
        );
      }
      const dueAt =
        dto.dueAt === undefined
          ? this.resolveDueDateFromOffset(lockedTemplate.dueOffsetMinutes)
          : this.normalizeDateTime(dto.dueAt);
      const title =
        this.normalizeOptionalString(dto.title) ?? lockedTemplate.title.trim();
      const description =
        dto.description === undefined
          ? lockedTemplate.description
          : this.normalizeOptionalString(dto.description);
      const freshUser: AuthenticatedUser = {
        ...user,
        accessScope: freshAccessScope.mode,
        allowedStoreIds: [...freshAccessScope.allowedStoreIds],
      };

      const task = await this.staffTasksService.createCatalogTaskInTransaction(
        tx,
        freshUser,
        {
          title,
          description,
          type: lockedTemplate.type as StaffTaskTemplateTaskType,
          priority: lockedTemplate.priority as StaffTaskTemplatePriority,
          status: 'OPEN',
          storeId,
          assignedToUserId:
            dto.assignedToUserId === undefined ? null : dto.assignedToUserId,
          observerUserIds: dto.observerUserIds,
          dueAt: dueAt?.toISOString() ?? null,
          labels: lockedTemplate.labels,
          checklist: lockedTemplate.checklist,
        },
        {
          kind: 'TEMPLATE',
          templateId: lockedTemplate.id,
          templateTitle: lockedTemplate.title,
        },
      );
      await this.writeTemplateAudit(tx, user, lockedTemplate, {
        action: 'TASK_LAUNCHED',
        changedFields: [],
        effectiveStoreId: storeId,
      });

      return task;
    });

    return {
      id: created.id,
      title: created.title,
      dueAt: created.dueAt,
      templateId: template.id,
    };
  }

  private resolveFilters(
    query: StaffTaskTemplatesQuery,
  ): StaffTaskTemplateReport['filters'] {
    return {
      status: this.resolveOne(
        query.status,
        ['all', ...templateStatuses] as const,
        'all',
      ),
      type: this.resolveOne(query.type, ['all', ...taskTypes] as const, 'all'),
      priority: this.resolveOne(
        query.priority,
        ['all', ...taskPriorities] as const,
        'all',
      ),
      storeId: this.normalizeOptionalIdentifier(query.storeId, 'storeId'),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildFilterWhere(
    filters: StaffTaskTemplateReport['filters'],
  ): Prisma.StaffTaskTemplateWhereInput {
    const where: Prisma.StaffTaskTemplateWhereInput = {};

    if (filters.status !== 'all') {
      where.status = filters.status;
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

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildSummary(
    statusCounts: Array<{ status: string; _count: { _all: number } }>,
    tasksCreated: number,
  ) {
    const summary = {
      total: 0,
      draft: 0,
      active: 0,
      archived: 0,
      tasksCreated,
    };

    for (const row of statusCounts) {
      summary.total += row._count._all;

      if (row.status === 'DRAFT') {
        summary.draft += row._count._all;
      } else if (row.status === 'ACTIVE') {
        summary.active += row._count._all;
      } else if (row.status === 'ARCHIVED') {
        summary.archived += row._count._all;
      }
    }

    return summary;
  }

  private async normalizeTemplateData(
    accessScope: ResolvedAccessScope,
    dto: StaffTaskTemplateDto,
    options: { requireTitle: boolean },
    prismaClient: StaffTaskTemplateReferenceClient = this.prisma,
  ): Promise<Prisma.StaffTaskTemplateUncheckedUpdateInput> {
    const data: Prisma.StaffTaskTemplateUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Template title is required',
      );
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description);
    }

    if (dto.type !== undefined) {
      data.type = this.resolveOne(dto.type, taskTypes, 'SHIFT');
    }

    if (dto.priority !== undefined) {
      data.priority = this.resolveOne(dto.priority, taskPriorities, 'NORMAL');
    }

    if (dto.status !== undefined) {
      data.status = this.resolveOne(dto.status, templateStatuses, 'DRAFT');
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(
        accessScope,
        dto.storeId,
        prismaClient,
      );
    }

    if (dto.dueOffsetMinutes !== undefined) {
      data.dueOffsetMinutes = this.normalizeDueOffset(dto.dueOffsetMinutes);
    }

    if (dto.labels !== undefined) {
      this.catalogAccessPolicy.assertTaskLabelsWritable(dto.labels);
      data.labels = this.normalizeJson(dto.labels);
    }

    if (dto.checklist !== undefined) {
      data.checklist = this.normalizeJson(dto.checklist);
    }

    return data;
  }

  private toTemplateResponse(
    row: StaffTaskTemplateRow,
    visibleCreatorIds: ReadonlySet<string> = new Set(),
  ): StaffTaskTemplateResponse {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type as StaffTaskTemplateTaskType,
      priority: row.priority as StaffTaskTemplatePriority,
      status: row.status as StaffTaskTemplateStatus,
      dueOffsetMinutes: row.dueOffsetMinutes,
      labels: row.labels,
      checklist: row.checklist,
      tasksCreatedCount: row._count.tasks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store:
        row.store?.tenantId === row.tenantId
          ? {
              id: row.store.id,
              name: row.store.name,
              isActive: row.store.isActive,
            }
          : null,
      createdByUser:
        row.createdByUser?.tenantId === row.tenantId &&
        visibleCreatorIds.has(row.createdByUser.id)
          ? {
              id: row.createdByUser.id,
              email: row.createdByUser.email,
              fullName: row.createdByUser.fullName,
            }
          : null,
    };
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

  private normalizeOptionalIdentifier(value: unknown, field: string) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }

    return value.trim() || null;
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

  private normalizeDueOffset(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const offset = Number.parseInt(String(value), 10);

    if (!Number.isFinite(offset) || offset < 0 || offset > 10080) {
      throw new BadRequestException(
        'Due offset must be between 0 and 10080 minutes',
      );
    }

    return offset;
  }

  private resolveDueDateFromOffset(value: number | null) {
    if (value === null) {
      return null;
    }

    return new Date(Date.now() + value * 60_000);
  }

  private normalizeJson(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return Prisma.DbNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private async resolveStoreId(
    accessScope: ResolvedAccessScope,
    value: string | null | undefined,
    prismaClient: StaffTaskTemplateReferenceClient = this.prisma,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    this.catalogAccessPolicy.assertStoreMutationAllowed(accessScope, id);
    const store = await prismaClient.store.findFirst({
      where: {
        AND: [
          this.catalogAccessPolicy.buildStoreSelectorWhere(accessScope),
          { id, isActive: true },
        ],
      },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('Store not found');
    }

    return store.id;
  }

  private async lockVisibleTemplateForMutation(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    id: string,
  ) {
    const where = this.catalogAccessPolicy.buildTemplateLookupWhere(
      accessScope,
      id,
    );
    const visibleBeforeLock = await tx.staffTaskTemplate.findFirst({ where });

    if (!visibleBeforeLock) {
      throw new NotFoundException('Staff task template not found');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT template."id"
      FROM "StaffTaskTemplate" AS template
      WHERE template."id" = ${id}
        AND template."tenantId" = ${accessScope.tenantId}
      FOR UPDATE
    `);

    if (lockedRows.length !== 1) {
      throw new NotFoundException('Staff task template not found');
    }

    const current = await tx.staffTaskTemplate.findFirst({ where });

    if (!current) {
      throw new NotFoundException('Staff task template not found');
    }

    return current;
  }

  private async assertActiveRulesUnaffected(
    tx: Prisma.TransactionClient,
    current: {
      id: string;
      tenantId: string;
      storeId: string | null;
      status: string;
    },
    nextStoreId: string | null,
    nextStatus: string,
  ) {
    if (current.storeId === nextStoreId && current.status === nextStatus) {
      return;
    }

    const activeRule = await tx.staffTaskRecurringRule.findFirst({
      where: {
        tenantId: current.tenantId,
        templateId: current.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (activeRule) {
      throw new ConflictException(
        'Pause active recurring rules before changing template store or status',
      );
    }
  }

  private catalogChangedFields(dto: StaffTaskTemplateDto) {
    return [
      'title',
      'description',
      'type',
      'priority',
      'status',
      'storeId',
      'dueOffsetMinutes',
      'labels',
      'checklist',
    ].filter((field) => dto[field as keyof StaffTaskTemplateDto] !== undefined);
  }

  private resolveTemplateUpdateAuditAction(
    previousStatus: string,
    nextStatus: string,
  ) {
    if (previousStatus !== nextStatus && nextStatus === 'ACTIVE') {
      return 'ACTIVATED';
    }

    if (previousStatus !== nextStatus && nextStatus === 'ARCHIVED') {
      return 'ARCHIVED';
    }

    return 'UPDATED';
  }

  private async writeTemplateAudit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    template: {
      id: string;
      tenantId: string;
      storeId: string | null;
      status: string;
    },
    input: {
      action:
        | 'CREATED'
        | 'UPDATED'
        | 'ACTIVATED'
        | 'ARCHIVED'
        | 'TASK_LAUNCHED';
      changedFields: string[];
      before?: { storeId: string | null; status: string };
      effectiveStoreId?: string | null;
    },
  ) {
    const releaseSha = this.configService.get<string>('RELEASE_SHA')?.trim();

    await tx.staffTaskCatalogAuditEvent.create({
      data: {
        tenantId: template.tenantId,
        actorUserId: user.id,
        entityKind: 'TEMPLATE',
        entityId: template.id,
        action: input.action,
        effectiveStoreId:
          input.effectiveStoreId === undefined
            ? template.storeId
            : input.effectiveStoreId,
        changedFields: input.changedFields,
        ...(input.before
          ? {
              beforeState: {
                status: input.before.status,
                storeId: input.before.storeId,
              },
            }
          : {}),
        afterState: {
          status: template.status,
          storeId: template.storeId,
        },
        releaseSha: releaseSha || null,
      },
    });
  }
}
