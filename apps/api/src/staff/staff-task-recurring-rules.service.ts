import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const ruleStatuses = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
const ruleCadences = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'OPENING_SHIFT',
  'CLOSING_SHIFT',
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

export type StaffTaskRecurringRuleStatus = (typeof ruleStatuses)[number];
export type StaffTaskRecurringRuleCadence = (typeof ruleCadences)[number];
export type StaffTaskRecurringRuleTaskType = (typeof taskTypes)[number];
export type StaffTaskRecurringRulePriority = (typeof taskPriorities)[number];

export type StaffTaskRecurringRulesQuery = {
  status?: StaffTaskRecurringRuleStatus | 'all';
  cadence?: StaffTaskRecurringRuleCadence | 'all';
  storeId?: string;
  templateId?: string;
  search?: string;
};

export type StaffTaskRecurringRuleDto = {
  title?: string;
  description?: string | null;
  templateId?: string | null;
  storeId?: string | null;
  assignedToUserId?: string | null;
  cadence?: StaffTaskRecurringRuleCadence;
  status?: StaffTaskRecurringRuleStatus;
  taskType?: StaffTaskRecurringRuleTaskType;
  priority?: StaffTaskRecurringRulePriority;
  timeOfDay?: string | null;
  dayOfWeek?: number | string | null;
  dayOfMonth?: number | string | null;
  dueOffsetMinutes?: number | string | null;
  labels?: unknown;
  checklist?: unknown;
};

export type StaffTaskRecurringRuleLaunchDto = {
  title?: string;
  description?: string | null;
  storeId?: string | null;
  assignedToUserId?: string | null;
  dueAt?: string | null;
};

export type StaffTaskRecurringRulesReport = {
  filters: {
    status: StaffTaskRecurringRuleStatus | 'all';
    cadence: StaffTaskRecurringRuleCadence | 'all';
    storeId: string | null;
    templateId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    paused: number;
    archived: number;
    dueNow: number;
    tasksCreated: number;
  };
  rows: StaffTaskRecurringRuleResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; email: string; fullName: string | null }>;
  templates: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    priority: string;
    storeId: string | null;
  }>;
};

export type StaffTaskRecurringRuleResponse = {
  id: string;
  title: string;
  description: string | null;
  cadence: StaffTaskRecurringRuleCadence;
  status: StaffTaskRecurringRuleStatus;
  taskType: StaffTaskRecurringRuleTaskType;
  priority: StaffTaskRecurringRulePriority;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueOffsetMinutes: number | null;
  nextRunAt: string | null;
  lastManualRunAt: string | null;
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
  tasksCreatedCount: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  template: {
    id: string;
    title: string;
    status: string;
    type: string;
    priority: string;
    dueOffsetMinutes: number | null;
    storeId: string | null;
  } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  assignedToUser: { id: string; email: string; fullName: string | null } | null;
  lastCreatedTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
  } | null;
};

export type StaffTaskRecurringRuleLaunchResponse = {
  id: string;
  title: string;
  dueAt: string | null;
  ruleId: string;
  templateId: string | null;
};

const ruleInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  template: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      type: true,
      priority: true,
      dueOffsetMinutes: true,
      labels: true,
      checklist: true,
      storeId: true,
    },
  },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
  lastCreatedTask: {
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      createdAt: true,
    },
  },
  _count: { select: { generatedTasks: true } },
} satisfies Prisma.StaffTaskRecurringRuleInclude;

type StaffTaskRecurringRuleRow = Prisma.StaffTaskRecurringRuleGetPayload<{
  include: typeof ruleInclude;
}>;

type RuleScheduleInput = {
  status: string;
  cadence: string;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
};

@Injectable()
export class StaffTaskRecurringRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getRules(
    user: AuthenticatedUser,
    query: StaffTaskRecurringRulesQuery = {},
  ): Promise<StaffTaskRecurringRulesReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);

    const [rows, stores, users, templates] = await Promise.all([
      this.prisma.staffTaskRecurringRule.findMany({
        where,
        include: ruleInclude,
        orderBy: [
          { status: 'asc' },
          { nextRunAt: 'asc' },
          { updatedAt: 'desc' },
        ],
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
      this.prisma.staffTaskTemplate.findMany({
        where: { tenantId, status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          priority: true,
          storeId: true,
        },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
        take: 200,
      }),
    ]);
    const responseRows = rows.map((row) => this.toRuleResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      users,
      templates,
    };
  }

  async createRule(user: AuthenticatedUser, dto: StaffTaskRecurringRuleDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeRuleData(tenantId, dto, {
      requireTitle: true,
    });
    const nextRunAt = this.resolveNextRunAt({
      status: (data.status as string | undefined) ?? 'ACTIVE',
      cadence: (data.cadence as string | undefined) ?? 'DAILY',
      timeOfDay: (data.timeOfDay as string | null | undefined) ?? null,
      dayOfWeek: (data.dayOfWeek as number | null | undefined) ?? null,
      dayOfMonth: (data.dayOfMonth as number | null | undefined) ?? null,
    });

    const created = await this.prisma.staffTaskRecurringRule.create({
      data: {
        ...(data as Prisma.StaffTaskRecurringRuleUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
        nextRunAt,
      },
      include: ruleInclude,
    });

    return this.toRuleResponse(created);
  }

  async updateRule(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskRecurringRuleDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffTaskRecurringRule.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        cadence: true,
        timeOfDay: true,
        dayOfWeek: true,
        dayOfMonth: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    const data = await this.normalizeRuleData(tenantId, dto, {
      requireTitle: false,
    });
    const nextRunAt = this.resolveNextRunAt({
      status: (data.status as string | undefined) ?? current.status,
      cadence: (data.cadence as string | undefined) ?? current.cadence,
      timeOfDay:
        data.timeOfDay === undefined
          ? current.timeOfDay
          : (data.timeOfDay as string | null),
      dayOfWeek:
        data.dayOfWeek === undefined
          ? current.dayOfWeek
          : (data.dayOfWeek as number | null),
      dayOfMonth:
        data.dayOfMonth === undefined
          ? current.dayOfMonth
          : (data.dayOfMonth as number | null),
    });

    const updated = await this.prisma.staffTaskRecurringRule.update({
      where: { id: current.id },
      data: { ...data, nextRunAt },
      include: ruleInclude,
    });

    return this.toRuleResponse(updated);
  }

  async createTaskFromRule(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskRecurringRuleLaunchDto,
  ): Promise<StaffTaskRecurringRuleLaunchResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rule = await this.prisma.staffTaskRecurringRule.findFirst({
      where: { id, tenantId },
      include: { template: true },
    });

    if (!rule) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    if (rule.status === 'ARCHIVED') {
      throw new BadRequestException('Archived rule cannot create tasks');
    }

    const storeId =
      dto.storeId === undefined
        ? (rule.storeId ?? rule.template?.storeId ?? null)
        : await this.resolveStoreId(tenantId, dto.storeId);
    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? rule.assignedToUserId
        : await this.resolveUserId(tenantId, dto.assignedToUserId);
    const title =
      this.normalizeOptionalString(dto.title) ??
      rule.title.trim() ??
      rule.template?.title.trim();

    if (!title) {
      throw new BadRequestException('Task title is required');
    }

    const description =
      dto.description === undefined
        ? (rule.description ?? rule.template?.description ?? null)
        : this.normalizeOptionalString(dto.description);
    const dueAt =
      dto.dueAt === undefined
        ? this.resolveDueDateFromOffset(
            rule.dueOffsetMinutes ?? rule.template?.dueOffsetMinutes ?? null,
          )
        : this.normalizeDateTime(dto.dueAt);
    const labels = rule.labels ?? rule.template?.labels ?? Prisma.DbNull;
    const checklist =
      rule.checklist ?? rule.template?.checklist ?? Prisma.DbNull;

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.staffTask.create({
        data: {
          tenantId,
          storeId,
          assignedToUserId,
          sourceTemplateId: rule.templateId,
          sourceRecurringRuleId: rule.id,
          createdByUserId: user.id,
          title,
          description,
          type: rule.taskType,
          priority: rule.priority,
          status: 'OPEN',
          dueAt,
          labels,
          checklist,
        },
        select: { id: true, title: true, dueAt: true },
      });

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: task.id,
          actorUserId: user.id,
          action: 'CREATED_FROM_RECURRING_RULE',
          message: 'Task created from recurring rule',
          metadata: {
            ruleId: rule.id,
            ruleTitle: rule.title,
            cadence: rule.cadence,
            templateId: rule.templateId,
          },
        },
      });

      await tx.staffTaskRecurringRule.update({
        where: { id: rule.id },
        data: {
          lastManualRunAt: new Date(),
          lastCreatedTaskId: task.id,
          nextRunAt: this.resolveNextRunAt(rule),
        },
        select: { id: true },
      });

      return task;
    });

    return {
      id: created.id,
      title: created.title,
      dueAt: created.dueAt?.toISOString() ?? null,
      ruleId: rule.id,
      templateId: rule.templateId,
    };
  }

  private resolveFilters(
    query: StaffTaskRecurringRulesQuery,
  ): StaffTaskRecurringRulesReport['filters'] {
    return {
      status: this.resolveOne(
        query.status,
        ['all', ...ruleStatuses] as const,
        'all',
      ),
      cadence: this.resolveOne(
        query.cadence,
        ['all', ...ruleCadences] as const,
        'all',
      ),
      storeId: this.normalizeOptionalString(query.storeId),
      templateId: this.normalizeOptionalString(query.templateId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffTaskRecurringRulesReport['filters'],
  ): Prisma.StaffTaskRecurringRuleWhereInput {
    const where: Prisma.StaffTaskRecurringRuleWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.cadence !== 'all') {
      where.cadence = filters.cadence;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.templateId) {
      where.templateId = filters.templateId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildSummary(rows: StaffTaskRecurringRuleResponse[]) {
    const now = Date.now();

    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.tasksCreated += row.tasksCreatedCount;

        if (row.status === 'ACTIVE') {
          summary.active += 1;
        } else if (row.status === 'PAUSED') {
          summary.paused += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        if (row.status === 'ACTIVE' && row.nextRunAt) {
          const nextRunAt = new Date(row.nextRunAt).getTime();

          if (Number.isFinite(nextRunAt) && nextRunAt <= now) {
            summary.dueNow += 1;
          }
        }

        return summary;
      },
      {
        total: 0,
        active: 0,
        paused: 0,
        archived: 0,
        dueNow: 0,
        tasksCreated: 0,
      },
    );
  }

  private async normalizeRuleData(
    tenantId: string,
    dto: StaffTaskRecurringRuleDto,
    options: { requireTitle: boolean },
  ): Promise<Prisma.StaffTaskRecurringRuleUncheckedUpdateInput> {
    const data: Prisma.StaffTaskRecurringRuleUncheckedUpdateInput = {};
    const template =
      dto.templateId === undefined
        ? null
        : await this.resolveTemplate(tenantId, dto.templateId);

    if (dto.title !== undefined || options.requireTitle) {
      data.title =
        this.normalizeOptionalString(dto.title) ??
        template?.title ??
        this.required('Rule title is required');
    }

    if (dto.description !== undefined || (options.requireTitle && template)) {
      data.description =
        dto.description === undefined
          ? (template?.description ?? null)
          : this.normalizeOptionalString(dto.description);
    }

    if (dto.templateId !== undefined) {
      data.templateId = template?.id ?? null;
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    } else if (options.requireTitle && template?.storeId) {
      data.storeId = template.storeId;
    }

    if (dto.assignedToUserId !== undefined) {
      data.assignedToUserId = await this.resolveUserId(
        tenantId,
        dto.assignedToUserId,
      );
    }

    if (dto.cadence !== undefined) {
      data.cadence = this.resolveOne(dto.cadence, ruleCadences, 'DAILY');
    } else if (options.requireTitle) {
      data.cadence = 'DAILY';
    }

    if (dto.status !== undefined) {
      data.status = this.resolveOne(dto.status, ruleStatuses, 'ACTIVE');
    } else if (options.requireTitle) {
      data.status = 'ACTIVE';
    }

    if (dto.taskType !== undefined) {
      data.taskType = this.resolveOne(dto.taskType, taskTypes, 'RECURRING');
    } else if (options.requireTitle) {
      data.taskType = template?.type ?? 'RECURRING';
    }

    if (dto.priority !== undefined) {
      data.priority = this.resolveOne(dto.priority, taskPriorities, 'NORMAL');
    } else if (options.requireTitle) {
      data.priority = template?.priority ?? 'NORMAL';
    }

    if (dto.timeOfDay !== undefined) {
      data.timeOfDay = this.normalizeTimeOfDay(dto.timeOfDay);
    } else if (options.requireTitle) {
      data.timeOfDay = null;
    }

    if (dto.dayOfWeek !== undefined) {
      data.dayOfWeek = this.normalizeDayOfWeek(dto.dayOfWeek);
    }

    if (dto.dayOfMonth !== undefined) {
      data.dayOfMonth = this.normalizeDayOfMonth(dto.dayOfMonth);
    }

    if (dto.dueOffsetMinutes !== undefined) {
      data.dueOffsetMinutes = this.normalizeDueOffset(dto.dueOffsetMinutes);
    } else if (options.requireTitle && template?.dueOffsetMinutes !== null) {
      data.dueOffsetMinutes = template?.dueOffsetMinutes ?? null;
    }

    if (dto.labels !== undefined) {
      data.labels = this.normalizeJson(dto.labels);
    } else if (options.requireTitle && template?.labels) {
      data.labels = template.labels;
    }

    if (dto.checklist !== undefined) {
      data.checklist = this.normalizeJson(dto.checklist);
    } else if (options.requireTitle && template?.checklist) {
      data.checklist = template.checklist;
    }

    return data;
  }

  private toRuleResponse(
    row: StaffTaskRecurringRuleRow,
  ): StaffTaskRecurringRuleResponse {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      cadence: row.cadence as StaffTaskRecurringRuleCadence,
      status: row.status as StaffTaskRecurringRuleStatus,
      taskType: row.taskType as StaffTaskRecurringRuleTaskType,
      priority: row.priority as StaffTaskRecurringRulePriority,
      timeOfDay: row.timeOfDay,
      dayOfWeek: row.dayOfWeek,
      dayOfMonth: row.dayOfMonth,
      dueOffsetMinutes: row.dueOffsetMinutes,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      lastManualRunAt: row.lastManualRunAt?.toISOString() ?? null,
      labels: row.labels,
      checklist: row.checklist,
      tasksCreatedCount: row._count.generatedTasks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      template: row.template
        ? {
            id: row.template.id,
            title: row.template.title,
            status: row.template.status,
            type: row.template.type,
            priority: row.template.priority,
            dueOffsetMinutes: row.template.dueOffsetMinutes,
            storeId: row.template.storeId,
          }
        : null,
      createdByUser: row.createdByUser,
      assignedToUser: row.assignedToUser,
      lastCreatedTask: row.lastCreatedTask
        ? {
            id: row.lastCreatedTask.id,
            title: row.lastCreatedTask.title,
            status: row.lastCreatedTask.status,
            dueAt: row.lastCreatedTask.dueAt?.toISOString() ?? null,
            createdAt: row.lastCreatedTask.createdAt.toISOString(),
          }
        : null,
    };
  }

  private resolveNextRunAt(input: RuleScheduleInput) {
    if (input.status !== 'ACTIVE') {
      return null;
    }

    const now = new Date();
    const { hours, minutes } = this.resolveScheduleTime(
      input.cadence,
      input.timeOfDay,
    );

    if (
      input.cadence === 'DAILY' ||
      input.cadence === 'OPENING_SHIFT' ||
      input.cadence === 'CLOSING_SHIFT'
    ) {
      return this.nextDaily(now, hours, minutes);
    }

    if (input.cadence === 'WEEKLY') {
      return this.nextWeekly(now, hours, minutes, input.dayOfWeek ?? 1);
    }

    if (input.cadence === 'MONTHLY') {
      return this.nextMonthly(now, hours, minutes, input.dayOfMonth ?? 1);
    }

    return this.nextDaily(now, hours, minutes);
  }

  private resolveScheduleTime(cadence: string, value: string | null) {
    const fallback =
      cadence === 'OPENING_SHIFT'
        ? '09:00'
        : cadence === 'CLOSING_SHIFT'
          ? '23:00'
          : '10:00';
    const [hours, minutes] = (value ?? fallback)
      .split(':')
      .map((part) => Number.parseInt(part, 10));

    return {
      hours: Number.isFinite(hours) ? hours : 10,
      minutes: Number.isFinite(minutes) ? minutes : 0,
    };
  }

  private nextDaily(now: Date, hours: number, minutes: number) {
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  }

  private nextWeekly(
    now: Date,
    hours: number,
    minutes: number,
    dayOfWeek: number,
  ) {
    const target = new Date(now);
    const jsTargetDay = dayOfWeek % 7;
    const daysAhead = (jsTargetDay - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + daysAhead);
    target.setHours(hours, minutes, 0, 0);

    if (target <= now) {
      target.setDate(target.getDate() + 7);
    }

    return target;
  }

  private nextMonthly(
    now: Date,
    hours: number,
    minutes: number,
    dayOfMonth: number,
  ) {
    const target = new Date(now);
    this.setMonthDay(target, dayOfMonth, hours, minutes);

    if (target <= now) {
      target.setMonth(target.getMonth() + 1, 1);
      this.setMonthDay(target, dayOfMonth, hours, minutes);
    }

    return target;
  }

  private setMonthDay(
    target: Date,
    dayOfMonth: number,
    hours: number,
    minutes: number,
  ) {
    const lastDay = new Date(
      target.getFullYear(),
      target.getMonth() + 1,
      0,
    ).getDate();
    target.setDate(Math.min(Math.max(dayOfMonth, 1), lastDay));
    target.setHours(hours, minutes, 0, 0);
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

  private required(message: string): never {
    throw new BadRequestException(message);
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

  private normalizeTimeOfDay(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(normalized)) {
      throw new BadRequestException('Time must be HH:mm');
    }

    const [hours, minutes] = normalized
      .split(':')
      .map((part) => Number.parseInt(part, 10));

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new BadRequestException('Time must be HH:mm');
    }

    return normalized;
  }

  private normalizeDayOfWeek(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const day = Number.parseInt(String(value), 10);

    if (!Number.isFinite(day) || day < 1 || day > 7) {
      throw new BadRequestException('Day of week must be between 1 and 7');
    }

    return day;
  }

  private normalizeDayOfMonth(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const day = Number.parseInt(String(value), 10);

    if (!Number.isFinite(day) || day < 1 || day > 31) {
      throw new BadRequestException('Day of month must be between 1 and 31');
    }

    return day;
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

  private async resolveTemplate(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const template = await this.prisma.staffTaskTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new BadRequestException('Staff task template not found');
    }

    if (template.status === 'ARCHIVED') {
      throw new BadRequestException('Archived template cannot be scheduled');
    }

    return template;
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
