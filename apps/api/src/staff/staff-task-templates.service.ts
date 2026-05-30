import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

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

const templateInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.StaffTaskTemplateInclude;

type StaffTaskTemplateRow = Prisma.StaffTaskTemplateGetPayload<{
  include: typeof templateInclude;
}>;

@Injectable()
export class StaffTaskTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getTemplates(
    user: AuthenticatedUser,
    query: StaffTaskTemplatesQuery = {},
  ): Promise<StaffTaskTemplateReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);

    const [rows, stores, users] = await Promise.all([
      this.prisma.staffTaskTemplate.findMany({
        where,
        include: templateInclude,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 200,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, email: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
    ]);
    const responseRows = rows.map((row) => this.toTemplateResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      users,
    };
  }

  async createTemplate(user: AuthenticatedUser, dto: StaffTaskTemplateDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeTemplateData(tenantId, dto, {
      requireTitle: true,
    });
    const created = await this.prisma.staffTaskTemplate.create({
      data: {
        ...(data as Prisma.StaffTaskTemplateUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
      },
      include: templateInclude,
    });

    return this.toTemplateResponse(created);
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskTemplateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffTaskTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Staff task template not found');
    }

    const data = await this.normalizeTemplateData(tenantId, dto, {
      requireTitle: false,
    });
    const updated = await this.prisma.staffTaskTemplate.update({
      where: { id: current.id },
      data,
      include: templateInclude,
    });

    return this.toTemplateResponse(updated);
  }

  async createTaskFromTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskTemplateLaunchDto,
  ): Promise<StaffTaskTemplateLaunchResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const template = await this.prisma.staffTaskTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Staff task template not found');
    }

    if (template.status === 'ARCHIVED') {
      throw new BadRequestException('Archived template cannot create tasks');
    }

    const storeId =
      dto.storeId === undefined
        ? template.storeId
        : await this.resolveStoreId(tenantId, dto.storeId);
    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? null
        : await this.resolveUserId(tenantId, dto.assignedToUserId);
    const dueAt =
      dto.dueAt === undefined
        ? this.resolveDueDateFromOffset(template.dueOffsetMinutes)
        : this.normalizeDateTime(dto.dueAt);
    const title =
      this.normalizeOptionalString(dto.title) ?? template.title.trim();
    const description =
      dto.description === undefined
        ? template.description
        : this.normalizeOptionalString(dto.description);

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.staffTask.create({
        data: {
          tenantId,
          storeId,
          assignedToUserId,
          sourceTemplateId: template.id,
          createdByUserId: user.id,
          title,
          description,
          type: template.type,
          priority: template.priority,
          status: 'OPEN',
          dueAt,
          labels: template.labels ?? Prisma.DbNull,
          checklist: template.checklist ?? Prisma.DbNull,
        },
        select: { id: true, title: true, dueAt: true },
      });

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: task.id,
          actorUserId: user.id,
          action: 'CREATED_FROM_TEMPLATE',
          message: 'Task created from template',
          metadata: {
            templateId: template.id,
            templateTitle: template.title,
          },
        },
      });

      return task;
    });

    return {
      id: created.id,
      title: created.title,
      dueAt: created.dueAt?.toISOString() ?? null,
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
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffTaskTemplateReport['filters'],
  ): Prisma.StaffTaskTemplateWhereInput {
    const where: Prisma.StaffTaskTemplateWhereInput = { tenantId };

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

  private buildSummary(rows: StaffTaskTemplateResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.tasksCreated += row.tasksCreatedCount;

        if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ACTIVE') {
          summary.active += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        return summary;
      },
      { total: 0, draft: 0, active: 0, archived: 0, tasksCreated: 0 },
    );
  }

  private async normalizeTemplateData(
    tenantId: string,
    dto: StaffTaskTemplateDto,
    options: { requireTitle: boolean },
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
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.dueOffsetMinutes !== undefined) {
      data.dueOffsetMinutes = this.normalizeDueOffset(dto.dueOffsetMinutes);
    }

    if (dto.labels !== undefined) {
      data.labels = this.normalizeJson(dto.labels);
    }

    if (dto.checklist !== undefined) {
      data.checklist = this.normalizeJson(dto.checklist);
    }

    return data;
  }

  private toTemplateResponse(
    row: StaffTaskTemplateRow,
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
      store: row.store,
      createdByUser: row.createdByUser,
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

  private async resolveUserId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Assigned user not found');
    }

    return user.id;
  }
}
