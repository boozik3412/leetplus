import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TenantLifecycleStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedAccessScope } from '../tenancy/access-scope.service';
import {
  evaluateTenantBackgroundExecutionPolicy,
  evaluateTenantBackgroundRuntimeIdentity,
  tenantBackgroundStageForCustomerStage,
} from '../tenancy/tenant-background-execution-policy';
import { StaffTaskCatalogAccessPolicyService } from './staff-task-catalog-access-policy.service';
import {
  resolveStaffTaskRecurringNextRunAt,
  type StaffTaskRecurringScheduleInput,
} from './staff-task-recurring-schedule';
import { StaffTasksService, type StaffTaskDto } from './staff-tasks.service';

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

export type StaffTaskRecurringRuleRunDueDto = {
  limit?: number | string | null;
  dryRun?: boolean | string | null;
  now?: string | null;
  tenantId?: string | null;
};

export type StaffTaskRecurringRuleActorRunDueDto = Pick<
  StaffTaskRecurringRuleRunDueDto,
  'limit' | 'dryRun'
>;

export type StaffTaskRecurringRuleRunResponse = {
  id: string;
  ruleId: string;
  ruleTitle: string;
  status: string;
  scheduledFor: string;
  startedAt: string;
  completedAt: string | null;
  message: string | null;
  metadata: Prisma.JsonValue | null;
  createdTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
  } | null;
};

export type StaffTaskRecurringRuleRunDueResult = {
  now: string;
  dryRun: boolean;
  limit: number;
  due: number;
  created: number;
  skipped: number;
  failed: number;
  runs: Array<{
    ruleId: string;
    ruleTitle: string;
    scheduledFor: string;
    status: 'DUE' | 'SUCCESS' | 'SKIPPED' | 'FAILED';
    taskId: string | null;
    message: string | null;
  }>;
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
  runs: StaffTaskRecurringRuleRunResponse[];
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
  lastAutomaticRunAt: string | null;
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
  store: {
    select: { id: true, tenantId: true, name: true, isActive: true },
  },
  template: {
    select: {
      id: true,
      tenantId: true,
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
  createdByUser: {
    select: {
      id: true,
      tenantId: true,
      isActive: true,
      isPlatformAdmin: true,
      email: true,
      fullName: true,
    },
  },
  assignedToUser: {
    select: {
      id: true,
      tenantId: true,
      isActive: true,
      isPlatformAdmin: true,
      email: true,
      fullName: true,
    },
  },
  lastCreatedTask: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      title: true,
      status: true,
      dueAt: true,
      createdAt: true,
    },
  },
  _count: { select: { generatedTasks: true } },
} satisfies Prisma.StaffTaskRecurringRuleInclude;

const ruleRunInclude = {
  rule: { select: { id: true, tenantId: true, storeId: true, title: true } },
  createdTask: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      title: true,
      status: true,
      dueAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.StaffTaskRecurringRuleRunInclude;

type StaffTaskRecurringRuleRow = Prisma.StaffTaskRecurringRuleGetPayload<{
  include: typeof ruleInclude;
}>;

type StaffTaskRecurringRuleRunRow = Prisma.StaffTaskRecurringRuleRunGetPayload<{
  include: typeof ruleRunInclude;
}>;

type StaffTaskRecurringRuleWithTemplate =
  Prisma.StaffTaskRecurringRuleGetPayload<{
    include: { template: true };
  }>;

type RecurringRuleStoreRow = {
  id: string;
  tenantId: string;
  isActive: boolean;
  timeZone: string | null;
};

type RunDueOptions = {
  now: Date;
  limit: number;
  dryRun: boolean;
};

type RecurringRuleMutationRow = {
  id: string;
  tenantId: string;
  templateId: string | null;
  storeId: string | null;
  assignedToUserId: string | null;
  title: string;
  description: string | null;
  cadence: string;
  status: string;
  taskType: string;
  priority: string;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueOffsetMinutes: number | null;
  nextRunAt: Date | null;
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
};

type RecurringRuleTemplateRow = {
  id: string;
  tenantId: string;
  storeId: string | null;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  dueOffsetMinutes: number | null;
  labels: Prisma.JsonValue | null;
  checklist: Prisma.JsonValue | null;
};

@Injectable()
export class StaffTaskRecurringRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly catalogAccessPolicy: StaffTaskCatalogAccessPolicyService,
    private readonly staffTasksService: StaffTasksService,
  ) {}

  async getRules(
    user: AuthenticatedUser,
    query: StaffTaskRecurringRulesQuery = {},
  ): Promise<StaffTaskRecurringRulesReport> {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const filters = this.resolveFilters(query);
    this.catalogAccessPolicy.assertExplicitStoreFilterAllowed(
      accessScope,
      filters.storeId,
    );
    const where = this.buildScopedRuleWhere(accessScope, filters);
    const runWhere = this.catalogAccessPolicy.buildRunWhere(accessScope, {
      rule: { is: where },
    });
    const now = new Date();

    const [
      rows,
      runs,
      stores,
      users,
      templates,
      statusCounts,
      dueNow,
      tasksCreated,
    ] = await Promise.all([
      this.prisma.staffTaskRecurringRule.findMany({
        where,
        include: this.scopedRuleInclude(accessScope),
        orderBy: [
          { status: 'asc' },
          { nextRunAt: 'asc' },
          { updatedAt: 'desc' },
        ],
        take: 200,
      }),
      this.prisma.staffTaskRecurringRuleRun.findMany({
        where: runWhere,
        include: ruleRunInclude,
        orderBy: { startedAt: 'desc' },
        take: 25,
      }),
      this.prisma.store.findMany({
        where: this.catalogAccessPolicy.buildStoreSelectorWhere(accessScope),
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: this.catalogAccessPolicy.buildParticipantUserWhere(accessScope),
        select: { id: true, email: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
      this.prisma.staffTaskTemplate.findMany({
        where: this.catalogAccessPolicy.buildTemplateWhere(accessScope, {
          status: 'ACTIVE',
        }),
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
      this.prisma.staffTaskRecurringRule.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.staffTaskRecurringRule.count({
        where: {
          AND: [where, { status: 'ACTIVE', nextRunAt: { lte: now } }],
        },
      }),
      this.prisma.staffTask.count({
        where: {
          AND: [
            { tenantId: accessScope.tenantId },
            ...(accessScope.mode === 'STORES'
              ? [{ storeId: { in: [...accessScope.allowedStoreIds] } }]
              : []),
            { sourceRecurringRule: { is: where } },
          ],
        },
      }),
    ]);
    const visibleUserIds = new Set(users.map((item) => item.id));
    const responseRows = rows.map((row) =>
      this.toRuleResponse(row, accessScope, visibleUserIds),
    );

    return {
      filters,
      summary: this.buildSummaryFromCounts(statusCounts, dueNow, tasksCreated),
      rows: responseRows,
      runs: runs.map((run) => this.toRunResponse(run, accessScope)),
      stores,
      users,
      templates,
    };
  }

  async createRule(user: AuthenticatedUser, dto: StaffTaskRecurringRuleDto) {
    this.catalogAccessPolicy.resolve(user);

    return this.prisma.$transaction(async (tx) => {
      await this.lockTenantForRecurringMutation(tx, user.tenantId);
      const accessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const prepared = await this.prepareRuleMutation(tx, accessScope, dto, {
        current: null,
      });
      const created = await tx.staffTaskRecurringRule.create({
        data: {
          ...prepared.data,
          tenantId: accessScope.tenantId,
          createdByUserId: user.id,
          nextRunAt: prepared.nextRunAt,
        },
        include: this.scopedRuleInclude(accessScope),
      });

      await this.writeRuleAudit(tx, user, created, {
        action: 'CREATED',
        changedFields: this.ruleChangedFields(dto, true),
      });
      const visibleUserIds = await this.resolveVisibleRuleParticipantIds(
        tx,
        accessScope,
        created,
      );

      return this.toRuleResponse(created, accessScope, visibleUserIds);
    });
  }

  async updateRule(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskRecurringRuleDto,
  ) {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const current = await this.prisma.staffTaskRecurringRule.findFirst({
      where: this.buildScopedRuleLookupWhere(accessScope, id),
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockTenantForRecurringMutation(tx, user.tenantId);
      const freshAccessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const locked = await this.lockVisibleRuleForMutation(
        tx,
        freshAccessScope,
        current.id,
      );
      const prepared = await this.prepareRuleMutation(
        tx,
        freshAccessScope,
        dto,
        { current: locked },
      );
      const updated = await tx.staffTaskRecurringRule.update({
        where: { id: locked.id },
        data: {
          ...prepared.data,
          nextRunAt: prepared.nextRunAt,
        },
        include: this.scopedRuleInclude(freshAccessScope),
      });

      await this.writeRuleAudit(tx, user, updated, {
        action: this.resolveRuleUpdateAuditAction(
          locked.status,
          updated.status,
        ),
        changedFields: this.ruleChangedFields(dto),
        before: {
          storeId: locked.storeId,
          status: locked.status,
          templateId: locked.templateId,
        },
      });
      const visibleUserIds = await this.resolveVisibleRuleParticipantIds(
        tx,
        freshAccessScope,
        updated,
      );

      return this.toRuleResponse(updated, freshAccessScope, visibleUserIds);
    });
  }

  async createTaskFromRule(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTaskRecurringRuleLaunchDto,
  ): Promise<StaffTaskRecurringRuleLaunchResponse> {
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const rule = await this.prisma.staffTaskRecurringRule.findFirst({
      where: this.buildScopedRuleLookupWhere(accessScope, id),
      select: { id: true },
    });

    if (!rule) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockTenantForRecurringMutation(tx, user.tenantId);
      const freshAccessScope =
        await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
      const lockedRule = await this.lockVisibleRuleForMutation(
        tx,
        freshAccessScope,
        rule.id,
      );

      if (lockedRule.status === 'ARCHIVED') {
        throw new BadRequestException('Archived rule cannot create tasks');
      }

      const template = await this.lockRuleTemplateForExecution(
        tx,
        freshAccessScope,
        lockedRule,
      );
      const taskInput = await this.buildActorTaskInput(
        tx,
        freshAccessScope,
        lockedRule,
        template,
        dto,
      );
      const freshUser = this.withFreshAccessScope(user, freshAccessScope);
      const task = await this.staffTasksService.createCatalogTaskInTransaction(
        tx,
        freshUser,
        taskInput.dto,
        {
          kind: 'RECURRING_RULE',
          ruleId: lockedRule.id,
          ruleTitle: lockedRule.title,
          cadence: lockedRule.cadence,
          templateId: lockedRule.templateId,
          automatic: false,
        },
      );
      const now = new Date();

      await tx.staffTaskRecurringRule.update({
        where: { id: lockedRule.id },
        data: {
          lastManualRunAt: now,
          lastCreatedTaskId: task.id,
        },
        select: { id: true },
      });
      await this.writeRuleAudit(tx, user, lockedRule, {
        action: 'TASK_LAUNCHED',
        changedFields: ['lastManualRunAt', 'lastCreatedTaskId'],
        effectiveStoreId: taskInput.effectiveStoreId,
      });

      return { task, templateId: lockedRule.templateId };
    });

    return {
      id: created.task.id,
      title: created.task.title,
      dueAt: created.task.dueAt,
      ruleId: rule.id,
      templateId: created.templateId,
    };
  }

  async runDueRulesForUser(
    user: AuthenticatedUser,
    dto: StaffTaskRecurringRuleActorRunDueDto = {},
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    this.assertActorRunDuePayload(dto);
    const accessScope = this.catalogAccessPolicy.resolve(user);
    const options: RunDueOptions = {
      now: new Date(),
      limit: this.normalizeRunLimit(dto.limit),
      dryRun: this.normalizeBoolean(dto.dryRun),
    };

    return this.runDueRulesForActor(user, accessScope, options);
  }

  async runDueRulesForTenant(
    tenantId: string,
    dto: StaffTaskRecurringRuleRunDueDto = {},
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    const options = this.resolveRunDueOptions(dto);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        id: true,
        customerStage: true,
        status: true,
        stores: {
          where: { isActive: true, backgroundExecutionEnabled: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant || tenant.status !== TenantLifecycleStatus.ACTIVE) {
      return this.emptyRunDueResult(options);
    }

    const executionDecision = evaluateTenantBackgroundExecutionPolicy({
      stage: tenantBackgroundStageForCustomerStage(tenant.customerStage),
      jobKind: 'STAFF_TASK_RECURRING_RULES',
    });
    if (!executionDecision.allowed) {
      return this.emptyRunDueResult(options);
    }

    const aggregate = this.emptyRunDueResult(options);

    for (const store of tenant.stores) {
      const runtimeIdentity = evaluateTenantBackgroundRuntimeIdentity({
        decision: executionDecision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: tenant.id,
        storeId: store.id,
      });
      if (!runtimeIdentity.accepted || !runtimeIdentity.storeId) {
        continue;
      }

      const result = await this.runDueRules(
        tenant.id,
        options,
        runtimeIdentity.storeId,
      );
      aggregate.due += result.due;
      aggregate.created += result.created;
      aggregate.skipped += result.skipped;
      aggregate.failed += result.failed;
      aggregate.runs.push(...result.runs);
    }

    return aggregate;
  }

  async runDueRulesForAllTenants(
    dto: StaffTaskRecurringRuleRunDueDto = {},
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    const options = this.resolveRunDueOptions(dto);
    const tenantId = this.normalizeOptionalString(dto.tenantId);
    const tenants = await this.prisma.tenant.findMany({
      where: tenantId ? { id: tenantId } : undefined,
      select: { id: true },
      orderBy: { slug: 'asc' },
    });
    const aggregate = this.emptyRunDueResult(options);

    for (const tenant of tenants) {
      const result = await this.runDueRulesForTenant(tenant.id, {
        now: options.now.toISOString(),
        limit: options.limit,
        dryRun: options.dryRun,
      });
      aggregate.due += result.due;
      aggregate.created += result.created;
      aggregate.skipped += result.skipped;
      aggregate.failed += result.failed;
      aggregate.runs.push(...result.runs);
    }

    return aggregate;
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
      storeId: this.normalizeOptionalQueryString(query.storeId, 'storeId'),
      templateId: this.normalizeOptionalQueryString(
        query.templateId,
        'templateId',
      ),
      search: this.normalizeOptionalQueryString(query.search, 'search'),
    };
  }

  private buildScopedRuleWhere(
    accessScope: ResolvedAccessScope,
    filters: StaffTaskRecurringRulesReport['filters'],
  ): Prisma.StaffTaskRecurringRuleWhereInput {
    const where: Prisma.StaffTaskRecurringRuleWhereInput = {};

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

    return this.catalogAccessPolicy.buildRuleWhere(accessScope, {
      AND: [where, this.buildRuleReferenceVisibilityWhere(accessScope)],
    });
  }

  private buildScopedRuleLookupWhere(
    accessScope: ResolvedAccessScope,
    id: string,
  ) {
    return this.catalogAccessPolicy.buildRuleWhere(accessScope, {
      AND: [{ id }, this.buildRuleReferenceVisibilityWhere(accessScope)],
    });
  }

  private buildScopedGeneratedTaskWhere(
    accessScope: ResolvedAccessScope,
  ): Prisma.StaffTaskWhereInput {
    return {
      AND: [
        { tenantId: accessScope.tenantId },
        ...(accessScope.mode === 'STORES'
          ? [{ storeId: { in: [...accessScope.allowedStoreIds] } }]
          : []),
      ],
    };
  }

  private scopedRuleInclude(accessScope: ResolvedAccessScope) {
    return {
      ...ruleInclude,
      _count: {
        select: {
          generatedTasks: {
            where: this.buildScopedGeneratedTaskWhere(accessScope),
          },
        },
      },
    } satisfies Prisma.StaffTaskRecurringRuleInclude;
  }

  private buildRuleReferenceVisibilityWhere(
    accessScope: ResolvedAccessScope,
  ): Prisma.StaffTaskRecurringRuleWhereInput {
    const visibleTemplate =
      this.catalogAccessPolicy.buildTemplateWhere(accessScope);

    return {
      OR: [
        { templateId: null },
        {
          template: {
            is: visibleTemplate,
          },
        },
      ],
    };
  }

  private buildSummaryFromCounts(
    statusCounts: Array<{ status: string; _count: { _all: number } }>,
    dueNow: number,
    tasksCreated: number,
  ) {
    const summary = {
      total: 0,
      active: 0,
      paused: 0,
      archived: 0,
      dueNow,
      tasksCreated,
    };

    for (const row of statusCounts) {
      summary.total += row._count._all;

      if (row.status === 'ACTIVE') {
        summary.active += row._count._all;
      } else if (row.status === 'PAUSED') {
        summary.paused += row._count._all;
      } else if (row.status === 'ARCHIVED') {
        summary.archived += row._count._all;
      }
    }

    return summary;
  }

  private async runDueRulesForActor(
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
    options: RunDueOptions,
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    const result = this.emptyRunDueResult(options);
    const dueRules = await this.prisma.staffTaskRecurringRule.findMany({
      where: this.catalogAccessPolicy.buildRuleWhere(accessScope, {
        AND: [
          this.buildRuleReferenceVisibilityWhere(accessScope),
          {
            status: 'ACTIVE',
            nextRunAt: { lte: options.now },
          },
        ],
      }),
      select: {
        id: true,
        title: true,
        nextRunAt: true,
      },
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
    });
    result.due = dueRules.length;

    for (const candidate of dueRules) {
      const candidateScheduledFor = candidate.nextRunAt ?? options.now;
      const baseRun = {
        ruleId: candidate.id,
        ruleTitle: candidate.title,
        scheduledFor: candidateScheduledFor.toISOString(),
        taskId: null,
      };

      if (options.dryRun) {
        result.runs.push({
          ...baseRun,
          status: 'DUE',
          message: null,
        });
        continue;
      }

      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
          await this.lockTenantForRecurringMutation(tx, user.tenantId);
          const freshAccessScope =
            await this.catalogAccessPolicy.resolveFreshForMutation(tx, user);
          const rule = await this.lockVisibleRuleForMutation(
            tx,
            freshAccessScope,
            candidate.id,
          );

          if (
            rule.status !== 'ACTIVE' ||
            !rule.nextRunAt ||
            rule.nextRunAt > options.now
          ) {
            return { kind: 'SKIPPED' as const };
          }

          const template = await this.lockRuleTemplateForExecution(
            tx,
            freshAccessScope,
            rule,
          );
          const taskInput = await this.buildActorTaskInput(
            tx,
            freshAccessScope,
            rule,
            template,
            {},
          );
          const scheduledFor = rule.nextRunAt;
          const run = await tx.staffTaskRecurringRuleRun.create({
            data: {
              tenantId: freshAccessScope.tenantId,
              ruleId: rule.id,
              scheduledFor,
              status: 'STARTED',
              metadata: {
                trigger: 'INTERACTIVE_DUE',
                cadence: rule.cadence,
                templateId: rule.templateId,
              },
            },
            select: { id: true },
          });
          const freshUser = this.withFreshAccessScope(user, freshAccessScope);
          const task =
            await this.staffTasksService.createCatalogTaskInTransaction(
              tx,
              freshUser,
              taskInput.dto,
              {
                kind: 'RECURRING_RULE',
                ruleId: rule.id,
                ruleTitle: rule.title,
                cadence: rule.cadence,
                templateId: rule.templateId,
                automatic: true,
                scheduledFor: scheduledFor.toISOString(),
                ruleRunId: run.id,
              },
            );
          const nextRunAt = this.resolveNextRunAt(
            rule,
            scheduledFor,
            taskInput.storeTimeZone,
          );

          await tx.staffTaskRecurringRule.update({
            where: { id: rule.id },
            data: {
              lastAutomaticRunAt: options.now,
              lastCreatedTaskId: task.id,
              nextRunAt,
            },
            select: { id: true },
          });
          await tx.staffTaskRecurringRuleRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              createdTaskId: task.id,
              completedAt: new Date(),
              message: 'Task created',
            },
            select: { id: true },
          });
          await this.writeRuleAudit(tx, user, rule, {
            action: 'TASK_LAUNCHED',
            changedFields: [
              'lastAutomaticRunAt',
              'lastCreatedTaskId',
              'nextRunAt',
            ],
            effectiveStoreId: taskInput.effectiveStoreId,
          });

          return {
            kind: 'SUCCESS' as const,
            task,
            scheduledFor,
          };
        });

        if (outcome.kind === 'SKIPPED') {
          result.skipped += 1;
          result.runs.push({
            ...baseRun,
            status: 'SKIPPED',
            message: 'Rule is no longer due',
          });
          continue;
        }

        result.created += 1;
        result.runs.push({
          ...baseRun,
          scheduledFor: outcome.scheduledFor.toISOString(),
          status: 'SUCCESS',
          taskId: outcome.task.id,
          message: 'Task created',
        });
      } catch (error) {
        if (
          this.isUniqueConstraintError(error) ||
          error instanceof NotFoundException
        ) {
          result.skipped += 1;
          result.runs.push({
            ...baseRun,
            status: 'SKIPPED',
            message: 'Rule is no longer eligible or was already processed',
          });
          continue;
        }

        result.failed += 1;
        result.runs.push({
          ...baseRun,
          status: 'FAILED',
          message: 'Rule could not be processed',
        });
      }
    }

    return result;
  }

  private async runDueRules(
    tenantId: string,
    options: RunDueOptions,
    runtimeStoreId: string,
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    const result = this.emptyRunDueResult(options);
    const dueRules = await this.prisma.staffTaskRecurringRule.findMany({
      where: {
        tenantId,
        storeId: runtimeStoreId,
        status: 'ACTIVE',
        nextRunAt: { lte: options.now },
      },
      include: { template: true },
      orderBy: { nextRunAt: 'asc' },
      take: options.limit,
    });
    result.due = dueRules.length;

    for (const rule of dueRules) {
      const scheduledFor = rule.nextRunAt ?? options.now;
      const baseRun = {
        ruleId: rule.id,
        ruleTitle: rule.title,
        scheduledFor: scheduledFor.toISOString(),
        taskId: null,
      };

      if (options.dryRun) {
        result.runs.push({
          ...baseRun,
          status: 'DUE',
          message: null,
        });
        continue;
      }

      const run = await this.createScheduleRun({
        tenantId,
        rule,
        scheduledFor,
      });

      if (!run) {
        result.skipped += 1;
        result.runs.push({
          ...baseRun,
          status: 'SKIPPED',
          message: 'Rule already has a scheduler run for this due time',
        });
        continue;
      }

      try {
        const taskData = await this.buildTaskDataFromRule({
          tenantId,
          rule,
          dto: {},
          createdByUserId: null,
        });

        const task = await this.prisma.$transaction(async (tx) => {
          const createdTask = await tx.staffTask.create({
            data: taskData,
            select: { id: true, title: true },
          });

          await tx.staffTaskAuditEvent.create({
            data: {
              tenantId,
              taskId: createdTask.id,
              actorUserId: null,
              action: 'CREATED_FROM_RECURRING_RULE',
              message: 'Task created automatically from recurring rule',
              metadata: {
                ruleId: rule.id,
                ruleTitle: rule.title,
                cadence: rule.cadence,
                templateId: rule.templateId,
                automatic: true,
                scheduledFor: scheduledFor.toISOString(),
                ruleRunId: run.id,
              },
            },
          });

          await tx.staffTaskRecurringRule.update({
            where: { id: rule.id },
            data: {
              lastAutomaticRunAt: options.now,
              lastCreatedTaskId: createdTask.id,
              nextRunAt: this.resolveNextRunAt(rule, options.now),
            },
            select: { id: true },
          });

          await tx.staffTaskRecurringRuleRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              createdTaskId: createdTask.id,
              completedAt: new Date(),
              message: 'Task created',
            },
            select: { id: true },
          });

          return createdTask;
        });

        result.created += 1;
        result.runs.push({
          ...baseRun,
          status: 'SUCCESS',
          taskId: task.id,
          message: `Created task: ${task.title}`,
        });
      } catch (error) {
        const message = this.errorMessage(error);
        result.failed += 1;
        await this.prisma.staffTaskRecurringRuleRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            message,
          },
        });
        result.runs.push({
          ...baseRun,
          status: 'FAILED',
          message,
        });
      }
    }

    return result;
  }

  private emptyRunDueResult(
    options: RunDueOptions,
  ): StaffTaskRecurringRuleRunDueResult {
    return {
      now: options.now.toISOString(),
      dryRun: options.dryRun,
      limit: options.limit,
      due: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      runs: [],
    };
  }

  private async createScheduleRun({
    tenantId,
    rule,
    scheduledFor,
  }: {
    tenantId: string;
    rule: StaffTaskRecurringRuleWithTemplate;
    scheduledFor: Date;
  }) {
    try {
      return await this.prisma.staffTaskRecurringRuleRun.create({
        data: {
          tenantId,
          ruleId: rule.id,
          scheduledFor,
          status: 'STARTED',
          metadata: {
            cadence: rule.cadence,
            templateId: rule.templateId,
            nextRunAt: rule.nextRunAt?.toISOString() ?? null,
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async buildTaskDataFromRule({
    tenantId,
    rule,
    dto,
    createdByUserId,
  }: {
    tenantId: string;
    rule: StaffTaskRecurringRuleWithTemplate;
    dto: StaffTaskRecurringRuleLaunchDto;
    createdByUserId: string | null;
  }): Promise<Prisma.StaffTaskUncheckedCreateInput> {
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
      this.normalizeOptionalString(rule.title) ??
      this.normalizeOptionalString(rule.template?.title) ??
      this.required('Task title is required');
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

    return {
      tenantId,
      storeId,
      assignedToUserId,
      sourceTemplateId: rule.templateId,
      sourceRecurringRuleId: rule.id,
      createdByUserId,
      title,
      description,
      type: rule.taskType,
      priority: rule.priority,
      status: 'OPEN',
      dueAt,
      labels: rule.labels ?? rule.template?.labels ?? Prisma.DbNull,
      checklist: rule.checklist ?? rule.template?.checklist ?? Prisma.DbNull,
    };
  }

  private async prepareRuleMutation(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    dto: StaffTaskRecurringRuleDto,
    options: { current: RecurringRuleMutationRow | null },
  ) {
    const current = options.current;
    const status =
      dto.status === undefined
        ? (current?.status ?? 'ACTIVE')
        : this.resolveOne(dto.status, ruleStatuses, 'ACTIVE');
    const deactivationOnly =
      Boolean(current) &&
      (status === 'PAUSED' || status === 'ARCHIVED') &&
      Object.keys(dto).every((field) => field === 'status');
    const templateId =
      dto.templateId === undefined
        ? (current?.templateId ?? null)
        : this.normalizeOptionalIdentifier(dto.templateId, 'templateId');
    const template = templateId
      ? await this.lockVisibleTemplateForRuleMutation(
          tx,
          accessScope,
          templateId,
        )
      : null;

    if (template && template.status !== 'ACTIVE' && !deactivationOnly) {
      throw new BadRequestException(
        'Only active templates can be used by recurring rules',
      );
    }

    const requestedStoreId =
      dto.storeId === undefined
        ? current
          ? current.storeId
          : (template?.storeId ?? null)
        : this.normalizeOptionalIdentifier(dto.storeId, 'storeId');
    const store = await this.resolveRuleStoreId(
      tx,
      accessScope,
      requestedStoreId,
      {
        allowInactive:
          deactivationOnly && requestedStoreId === current?.storeId,
      },
    );
    const storeId = store?.id ?? null;

    if (template?.storeId && template.storeId !== storeId) {
      throw new BadRequestException(
        'Recurring rule and template must belong to the same store',
      );
    }

    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? (current?.assignedToUserId ?? null)
        : this.normalizeOptionalIdentifier(
            dto.assignedToUserId,
            'assignedToUserId',
          );

    if (assignedToUserId && !deactivationOnly) {
      await this.assertParticipantAllowed(
        tx,
        accessScope,
        storeId,
        assignedToUserId,
      );
    }

    if (dto.labels !== undefined) {
      this.catalogAccessPolicy.assertTaskLabelsWritable(dto.labels);
    }

    const cadence =
      dto.cadence === undefined
        ? (current?.cadence ?? 'DAILY')
        : this.resolveOne(dto.cadence, ruleCadences, 'DAILY');
    const timeOfDay =
      dto.timeOfDay === undefined
        ? (current?.timeOfDay ?? null)
        : this.normalizeTimeOfDay(dto.timeOfDay);
    const dayOfWeek =
      dto.dayOfWeek === undefined
        ? (current?.dayOfWeek ?? null)
        : this.normalizeDayOfWeek(dto.dayOfWeek);
    const dayOfMonth =
      dto.dayOfMonth === undefined
        ? (current?.dayOfMonth ?? null)
        : this.normalizeDayOfMonth(dto.dayOfMonth);
    const scheduleChanged =
      !current ||
      current.status !== status ||
      current.cadence !== cadence ||
      current.timeOfDay !== timeOfDay ||
      current.dayOfWeek !== dayOfWeek ||
      current.dayOfMonth !== dayOfMonth ||
      current.storeId !== storeId;
    const nextRunAt =
      status !== 'ACTIVE'
        ? null
        : scheduleChanged || !current?.nextRunAt
          ? this.resolveNextRunAt(
              {
                status,
                cadence,
                timeOfDay,
                dayOfWeek,
                dayOfMonth,
              },
              new Date(),
              store?.timeZone,
            )
          : current.nextRunAt;
    const title =
      dto.title === undefined
        ? (current?.title ??
          template?.title ??
          this.required('Rule title is required'))
        : this.normalizeRequiredString(dto.title, 'Rule title is required');
    const description =
      dto.description === undefined
        ? (current?.description ?? template?.description ?? null)
        : this.normalizeOptionalString(dto.description);
    const taskType =
      dto.taskType === undefined
        ? (current?.taskType ?? template?.type ?? 'RECURRING')
        : this.resolveOne(dto.taskType, taskTypes, 'RECURRING');
    const priority =
      dto.priority === undefined
        ? (current?.priority ?? template?.priority ?? 'NORMAL')
        : this.resolveOne(dto.priority, taskPriorities, 'NORMAL');
    const dueOffsetMinutes =
      dto.dueOffsetMinutes === undefined
        ? (current?.dueOffsetMinutes ?? template?.dueOffsetMinutes ?? null)
        : this.normalizeDueOffset(dto.dueOffsetMinutes);
    const labels =
      dto.labels === undefined
        ? (current?.labels ?? template?.labels ?? null)
        : this.normalizeJson(dto.labels);
    const checklist =
      dto.checklist === undefined
        ? (current?.checklist ?? template?.checklist ?? null)
        : this.normalizeJson(dto.checklist);

    return {
      data: {
        title,
        description,
        templateId,
        storeId,
        assignedToUserId,
        cadence,
        status,
        taskType,
        priority,
        timeOfDay,
        dayOfWeek,
        dayOfMonth,
        dueOffsetMinutes,
        labels: this.toNullableJsonInput(labels),
        checklist: this.toNullableJsonInput(checklist),
      } satisfies Prisma.StaffTaskRecurringRuleUncheckedUpdateInput,
      nextRunAt,
    };
  }

  private async lockVisibleRuleForMutation(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    id: string,
  ): Promise<RecurringRuleMutationRow> {
    const where = this.buildScopedRuleLookupWhere(accessScope, id);
    const visibleBeforeLock = await tx.staffTaskRecurringRule.findFirst({
      where,
      select: this.ruleMutationSelect(),
    });

    if (!visibleBeforeLock) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT rule."id"
      FROM "StaffTaskRecurringRule" AS rule
      WHERE rule."id" = ${id}
        AND rule."tenantId" = ${accessScope.tenantId}
      FOR UPDATE
    `);

    if (lockedRows.length !== 1) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    const current = await tx.staffTaskRecurringRule.findFirst({
      where,
      select: this.ruleMutationSelect(),
    });

    if (!current) {
      throw new NotFoundException('Staff task recurring rule not found');
    }

    return current;
  }

  private ruleMutationSelect() {
    return {
      id: true,
      tenantId: true,
      templateId: true,
      storeId: true,
      assignedToUserId: true,
      title: true,
      description: true,
      cadence: true,
      status: true,
      taskType: true,
      priority: true,
      timeOfDay: true,
      dayOfWeek: true,
      dayOfMonth: true,
      dueOffsetMinutes: true,
      nextRunAt: true,
      labels: true,
      checklist: true,
    } as const;
  }

  private async lockVisibleTemplateForRuleMutation(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    id: string,
  ): Promise<RecurringRuleTemplateRow> {
    const where = this.catalogAccessPolicy.buildTemplateLookupWhere(
      accessScope,
      id,
    );
    const visibleBeforeLock = await tx.staffTaskTemplate.findFirst({
      where,
      select: this.ruleTemplateSelect(),
    });

    if (!visibleBeforeLock) {
      throw new BadRequestException('Staff task template not found');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT template."id"
      FROM "StaffTaskTemplate" AS template
      WHERE template."id" = ${id}
        AND template."tenantId" = ${accessScope.tenantId}
      FOR SHARE
    `);

    if (lockedRows.length !== 1) {
      throw new BadRequestException('Staff task template not found');
    }

    const template = await tx.staffTaskTemplate.findFirst({
      where,
      select: this.ruleTemplateSelect(),
    });

    if (!template) {
      throw new BadRequestException('Staff task template not found');
    }

    return template;
  }

  private ruleTemplateSelect() {
    return {
      id: true,
      tenantId: true,
      storeId: true,
      title: true,
      description: true,
      status: true,
      type: true,
      priority: true,
      dueOffsetMinutes: true,
      labels: true,
      checklist: true,
    } as const;
  }

  private async lockRuleTemplateForExecution(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    rule: RecurringRuleMutationRow,
  ) {
    if (!rule.templateId) {
      this.catalogAccessPolicy.assertTaskLabelsWritable(rule.labels);
      return null;
    }

    const template = await this.lockVisibleTemplateForRuleMutation(
      tx,
      accessScope,
      rule.templateId,
    );

    if (template.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active templates can create recurring tasks',
      );
    }

    if (template.storeId && template.storeId !== rule.storeId) {
      throw new BadRequestException(
        'Recurring rule and template must belong to the same store',
      );
    }

    this.catalogAccessPolicy.assertTaskLabelsWritable(rule.labels);
    this.catalogAccessPolicy.assertTaskLabelsWritable(template.labels);

    return template;
  }

  private async resolveRuleStoreId(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    storeId: string | null,
    options: { allowInactive: boolean },
  ): Promise<RecurringRuleStoreRow | null> {
    this.catalogAccessPolicy.assertStoreMutationAllowed(accessScope, storeId);

    if (!storeId) {
      return null;
    }

    const where: Prisma.StoreWhereInput = {
      AND: [
        this.catalogAccessPolicy.buildStoreSelectorWhere(accessScope),
        {
          id: storeId,
          ...(options.allowInactive ? {} : { isActive: true }),
        },
      ],
    };
    const select = {
      id: true,
      tenantId: true,
      isActive: true,
      timeZone: true,
    } satisfies Prisma.StoreSelect;
    const visibleBeforeLock = await tx.store.findFirst({
      where,
      select,
    });

    if (!visibleBeforeLock) {
      throw new BadRequestException('Store not found or inactive');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT store."id"
      FROM "Store" AS store
      WHERE store."id" = ${storeId}
        AND store."tenantId" = ${accessScope.tenantId}
      FOR SHARE
    `);

    if (lockedRows.length !== 1) {
      throw new BadRequestException('Store not found or inactive');
    }

    const store = await tx.store.findFirst({
      where: {
        AND: [where, { tenantId: accessScope.tenantId }],
      },
      select,
    });

    if (!store) {
      throw new BadRequestException('Store not found or inactive');
    }

    return store;
  }

  private async assertParticipantAllowed(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    storeId: string | null,
    userId: string,
  ) {
    const where: Prisma.UserWhereInput = {
      AND: [
        this.catalogAccessPolicy.buildParticipantUserWhere(
          accessScope,
          storeId,
        ),
        { id: userId },
      ],
    };
    const participantBeforeLock = await tx.user.findFirst({
      where,
      select: { id: true },
    });

    if (!participantBeforeLock) {
      throw new BadRequestException(
        'Assigned user is outside the effective task scope',
      );
    }

    const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT participant."id"
      FROM "User" AS participant
      WHERE participant."id" = ${userId}
        AND participant."tenantId" = ${accessScope.tenantId}
      FOR SHARE
    `);

    if (lockedUsers.length !== 1) {
      throw new BadRequestException(
        'Assigned user is outside the effective task scope',
      );
    }

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT access."id"
      FROM "UserStoreAccess" AS access
      WHERE access."userId" = ${userId}
      ORDER BY access."storeId", access."id"
      FOR SHARE
    `);

    const participant = await tx.user.findFirst({
      where: {
        AND: [where, { tenantId: accessScope.tenantId }],
      },
      select: { id: true },
    });

    if (!participant) {
      throw new BadRequestException(
        'Assigned user is outside the effective task scope',
      );
    }
  }

  private async lockTenantForRecurringMutation(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT tenant."id"
      FROM "Tenant" AS tenant
      WHERE tenant."id" = ${tenantId}
      FOR SHARE
    `);

    if (rows.length !== 1) {
      throw new NotFoundException('Tenant not found');
    }
  }

  private async resolveVisibleRuleParticipantIds(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    rule: {
      storeId: string | null;
      createdByUserId: string | null;
      assignedToUserId: string | null;
    },
  ) {
    const candidateIds = Array.from(
      new Set(
        [rule.createdByUserId, rule.assignedToUserId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    if (candidateIds.length === 0) {
      return new Set<string>();
    }

    candidateIds.sort((left, right) => left.localeCompare(right));
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT participant."id"
      FROM "User" AS participant
      WHERE participant."tenantId" = ${accessScope.tenantId}
        AND participant."id" IN (${Prisma.join(candidateIds)})
      ORDER BY participant."id"
      FOR SHARE
    `);
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT access."id"
      FROM "UserStoreAccess" AS access
      WHERE access."userId" IN (${Prisma.join(candidateIds)})
      ORDER BY access."userId", access."storeId", access."id"
      FOR SHARE
    `);

    const visible = await tx.user.findMany({
      where: {
        AND: [
          this.catalogAccessPolicy.buildParticipantUserWhere(
            accessScope,
            rule.storeId,
          ),
          { id: { in: candidateIds } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return new Set(visible.map((item) => item.id));
  }

  private async buildActorTaskInput(
    tx: Prisma.TransactionClient,
    accessScope: ResolvedAccessScope,
    rule: RecurringRuleMutationRow,
    template: RecurringRuleTemplateRow | null,
    dto: StaffTaskRecurringRuleLaunchDto,
  ): Promise<{
    dto: StaffTaskDto;
    effectiveStoreId: string | null;
    storeTimeZone: string | null;
  }> {
    const boundStoreId = rule.storeId ?? template?.storeId ?? null;
    const requestedStoreId =
      dto.storeId === undefined
        ? boundStoreId
        : this.normalizeOptionalIdentifier(dto.storeId, 'storeId');
    const store = await this.resolveRuleStoreId(
      tx,
      accessScope,
      requestedStoreId,
      { allowInactive: false },
    );
    const storeId = store?.id ?? null;

    if (boundStoreId && storeId !== boundStoreId) {
      throw new BadRequestException(
        'A store-bound recurring rule can only create tasks for its own store',
      );
    }

    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? rule.assignedToUserId
        : this.normalizeOptionalIdentifier(
            dto.assignedToUserId,
            'assignedToUserId',
          );

    if (assignedToUserId) {
      await this.assertParticipantAllowed(
        tx,
        accessScope,
        storeId,
        assignedToUserId,
      );
    }

    const title =
      dto.title === undefined
        ? rule.title.trim() ||
          template?.title.trim() ||
          this.required('Task title is required')
        : this.normalizeRequiredString(dto.title, 'Task title is required');
    const description =
      dto.description === undefined
        ? (rule.description ?? template?.description ?? null)
        : this.normalizeOptionalString(dto.description);
    const dueAt =
      dto.dueAt === undefined
        ? this.resolveDueDateFromOffset(
            rule.dueOffsetMinutes ?? template?.dueOffsetMinutes ?? null,
          )
        : this.normalizeDateTime(dto.dueAt);

    return {
      effectiveStoreId: storeId,
      storeTimeZone: store?.timeZone ?? null,
      dto: {
        title,
        description,
        type: rule.taskType as StaffTaskRecurringRuleTaskType,
        priority: rule.priority as StaffTaskRecurringRulePriority,
        status: 'OPEN',
        storeId,
        assignedToUserId,
        dueAt: dueAt?.toISOString() ?? null,
        labels: rule.labels ?? template?.labels ?? null,
        checklist: rule.checklist ?? template?.checklist ?? null,
      },
    };
  }

  private withFreshAccessScope(
    user: AuthenticatedUser,
    accessScope: ResolvedAccessScope,
  ): AuthenticatedUser {
    return {
      ...user,
      accessScope: accessScope.mode,
      allowedStoreIds: [...accessScope.allowedStoreIds],
    };
  }

  private ruleChangedFields(
    dto: StaffTaskRecurringRuleDto,
    includeDefaults = false,
  ) {
    const fields = [
      'title',
      'description',
      'templateId',
      'storeId',
      'assignedToUserId',
      'cadence',
      'status',
      'taskType',
      'priority',
      'timeOfDay',
      'dayOfWeek',
      'dayOfMonth',
      'dueOffsetMinutes',
      'labels',
      'checklist',
    ] as const;

    return fields.filter(
      (field) => includeDefaults || dto[field] !== undefined,
    );
  }

  private resolveRuleUpdateAuditAction(
    previousStatus: string,
    nextStatus: string,
  ) {
    if (previousStatus !== nextStatus && nextStatus === 'ACTIVE') {
      return 'ACTIVATED' as const;
    }

    if (previousStatus !== nextStatus && nextStatus === 'PAUSED') {
      return 'PAUSED' as const;
    }

    if (previousStatus !== nextStatus && nextStatus === 'ARCHIVED') {
      return 'ARCHIVED' as const;
    }

    return 'UPDATED' as const;
  }

  private async writeRuleAudit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    rule: {
      id: string;
      tenantId: string;
      storeId: string | null;
      templateId: string | null;
      status: string;
    },
    input: {
      action:
        | 'CREATED'
        | 'UPDATED'
        | 'ACTIVATED'
        | 'ARCHIVED'
        | 'PAUSED'
        | 'TASK_LAUNCHED';
      changedFields: readonly string[];
      before?: {
        storeId: string | null;
        templateId: string | null;
        status: string;
      };
      effectiveStoreId?: string | null;
    },
  ) {
    const releaseSha = this.configService.get<string>('RELEASE_SHA')?.trim();

    await tx.staffTaskCatalogAuditEvent.create({
      data: {
        tenantId: rule.tenantId,
        actorUserId: user.id,
        entityKind: 'RULE',
        entityId: rule.id,
        action: input.action,
        effectiveStoreId:
          input.effectiveStoreId === undefined
            ? rule.storeId
            : input.effectiveStoreId,
        changedFields: [...input.changedFields],
        ...(input.before
          ? {
              beforeState: {
                status: input.before.status,
                storeId: input.before.storeId,
                templateId: input.before.templateId,
              },
            }
          : {}),
        afterState: {
          status: rule.status,
          storeId: rule.storeId,
          templateId: rule.templateId,
        },
        releaseSha: releaseSha || null,
      },
    });
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
    accessScope: ResolvedAccessScope,
    visibleUserIds: ReadonlySet<string>,
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
      lastAutomaticRunAt: row.lastAutomaticRunAt?.toISOString() ?? null,
      labels: row.labels,
      checklist: row.checklist,
      tasksCreatedCount: row._count.generatedTasks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store:
        row.store?.tenantId === row.tenantId &&
        row.store.id === row.storeId &&
        this.isStoreVisible(accessScope, row.store.id)
          ? {
              id: row.store.id,
              name: row.store.name,
              isActive: row.store.isActive,
            }
          : null,
      template:
        row.template?.tenantId === row.tenantId &&
        row.template.id === row.templateId &&
        this.isStoreVisible(accessScope, row.template.storeId)
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
      createdByUser:
        row.createdByUser?.tenantId === row.tenantId &&
        row.createdByUser.isActive &&
        !row.createdByUser.isPlatformAdmin &&
        visibleUserIds.has(row.createdByUser.id)
          ? {
              id: row.createdByUser.id,
              email: row.createdByUser.email,
              fullName: row.createdByUser.fullName,
            }
          : null,
      assignedToUser:
        row.assignedToUser?.tenantId === row.tenantId &&
        row.assignedToUser.isActive &&
        !row.assignedToUser.isPlatformAdmin &&
        visibleUserIds.has(row.assignedToUser.id)
          ? {
              id: row.assignedToUser.id,
              email: row.assignedToUser.email,
              fullName: row.assignedToUser.fullName,
            }
          : null,
      lastCreatedTask:
        row.lastCreatedTask?.tenantId === row.tenantId &&
        this.isStoreVisible(accessScope, row.lastCreatedTask.storeId)
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

  private toRunResponse(
    row: StaffTaskRecurringRuleRunRow,
    accessScope: ResolvedAccessScope,
  ): StaffTaskRecurringRuleRunResponse {
    const ruleVisible =
      row.rule.tenantId === row.tenantId &&
      this.isStoreVisible(accessScope, row.rule.storeId);
    const createdTaskVisible =
      row.createdTask?.tenantId === row.tenantId &&
      this.isStoreVisible(accessScope, row.createdTask.storeId);

    return {
      id: row.id,
      ruleId: row.ruleId,
      ruleTitle: ruleVisible ? row.rule.title : 'Unavailable rule',
      status: row.status,
      scheduledFor: row.scheduledFor.toISOString(),
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      message:
        row.status === 'FAILED'
          ? 'Rule processing failed'
          : row.status === 'SUCCESS'
            ? 'Task created'
            : null,
      metadata: this.safeRunMetadata(row.metadata),
      createdTask:
        row.createdTask && createdTaskVisible
          ? {
              id: row.createdTask.id,
              title: row.createdTask.title,
              status: row.createdTask.status,
              dueAt: row.createdTask.dueAt?.toISOString() ?? null,
              createdAt: row.createdTask.createdAt.toISOString(),
            }
          : null,
    };
  }

  private resolveNextRunAt(
    input: StaffTaskRecurringScheduleInput,
    from = new Date(),
    storeTimeZone?: string | null,
  ) {
    return resolveStaffTaskRecurringNextRunAt(input, from, storeTimeZone);
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

  private resolveRunDueOptions(
    dto: StaffTaskRecurringRuleRunDueDto,
  ): RunDueOptions {
    return {
      now: this.normalizeRunNow(dto.now),
      limit: this.normalizeRunLimit(dto.limit),
      dryRun: this.normalizeBoolean(dto.dryRun),
    };
  }

  private normalizeRunNow(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return new Date();
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid scheduler timestamp');
    }

    return date;
  }

  private normalizeRunLimit(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return 50;
    }

    const limit = Math.trunc(Number(value));

    if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'Scheduler limit must be between 1 and 500',
      );
    }

    return limit;
  }

  private normalizeBoolean(value: boolean | string | null | undefined) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return false;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  private assertActorRunDuePayload(
    value: StaffTaskRecurringRuleActorRunDueDto,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Run-due body must be an object');
    }

    const allowedFields = new Set(['limit', 'dryRun']);
    const unsupportedField = Object.keys(value).find(
      (field) => !allowedFields.has(field),
    );

    if (unsupportedField) {
      throw new BadRequestException(
        `Unsupported interactive run-due field: ${unsupportedField}`,
      );
    }
  }

  private normalizeOptionalQueryString(value: unknown, field: string) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a single string`);
    }

    return value.trim() || null;
  }

  private normalizeOptionalIdentifier(value: unknown, field: string) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string or null`);
    }

    return value.trim() || null;
  }

  private normalizeRequiredString(value: unknown, message: string) {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private toNullableJsonInput(value: unknown) {
    if (value === null || value === undefined || value === Prisma.DbNull) {
      return Prisma.DbNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private isStoreVisible(
    accessScope: ResolvedAccessScope,
    storeId: string | null,
  ) {
    return (
      accessScope.mode === 'NETWORK' ||
      (Boolean(storeId) &&
        accessScope.allowedStoreIds.includes(storeId as string))
    );
  }

  private safeRunMetadata(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const source = value as Record<string, Prisma.JsonValue>;
    const safe: Record<string, Prisma.JsonValue> = {};

    if (typeof source.trigger === 'string') {
      safe.trigger = source.trigger;
    }

    if (typeof source.cadence === 'string') {
      safe.cadence = source.cadence;
    }

    return Object.keys(safe).length > 0 ? safe : null;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
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
