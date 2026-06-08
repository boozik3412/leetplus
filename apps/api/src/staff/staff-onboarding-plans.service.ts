import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const planStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const roleScopes = [
  'ALL_STAFF',
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_MANAGER',
  'MANAGER',
  'STANDARDS_MANAGER',
] as const;
const stepTypes = [
  'COURSE',
  'TASK_TEMPLATE',
  'CHECKLIST_TEMPLATE',
  'REGULATION',
  'TEXT',
  'LINK',
] as const;

export type StaffOnboardingPlanStatus = (typeof planStatuses)[number];
export type StaffOnboardingRoleScope = (typeof roleScopes)[number];
export type StaffOnboardingStepType = (typeof stepTypes)[number];

export type StaffOnboardingPlansQuery = {
  status?: StaffOnboardingPlanStatus | 'all';
  roleScope?: StaffOnboardingRoleScope | 'all';
  storeId?: string;
  search?: string;
};

export type StaffOnboardingPlanDto = {
  title?: string;
  description?: string | null;
  roleScope?: StaffOnboardingRoleScope;
  status?: StaffOnboardingPlanStatus;
  durationDays?: number | string | null;
  storeId?: string | null;
  steps?: unknown;
};

export type StaffOnboardingStep = {
  id: string;
  title: string;
  type: StaffOnboardingStepType;
  day: number | null;
  courseId: string | null;
  taskTemplateId: string | null;
  checklistTemplateId: string | null;
  regulationId: string | null;
  content: string | null;
  url: string | null;
  required: boolean;
};

export type StaffOnboardingPlanReport = {
  filters: {
    status: StaffOnboardingPlanStatus | 'all';
    roleScope: StaffOnboardingRoleScope | 'all';
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    stepsCount: number;
    coursesCount: number;
    tasksCount: number;
  };
  canManageOnboarding: boolean;
  rows: StaffOnboardingPlanResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  courses: StaffOnboardingOption[];
  taskTemplates: StaffOnboardingOption[];
  checklistTemplates: StaffOnboardingOption[];
  regulations: StaffOnboardingOption[];
};

export type StaffOnboardingPlanResponse = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffOnboardingRoleScope;
  status: StaffOnboardingPlanStatus;
  durationDays: number | null;
  steps: StaffOnboardingStep[];
  stepsCount: number;
  coursesCount: number;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffOnboardingOption = {
  id: string;
  title: string;
  status: string;
  roleScope: string | null;
  store: { id: string; name: string; isActive: boolean } | null;
};

const planInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffOnboardingPlanInclude;

type StaffOnboardingPlanRow = Prisma.StaffOnboardingPlanGetPayload<{
  include: typeof planInclude;
}>;

@Injectable()
export class StaffOnboardingPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getPlans(
    user: AuthenticatedUser,
    query: StaffOnboardingPlansQuery = {},
  ): Promise<StaffOnboardingPlanReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageOnboarding = this.canManageOnboarding(user);
    const filters = this.resolveFilters(query, canManageOnboarding);
    const where = this.buildWhere(tenantId, user, filters, canManageOnboarding);

    const [
      rows,
      stores,
      courses,
      taskTemplates,
      checklistTemplates,
      regulations,
    ] = await Promise.all([
      this.prisma.staffOnboardingPlan.findMany({
        where,
        include: planInclude,
        orderBy: [
          { status: 'asc' },
          { roleScope: 'asc' },
          { updatedAt: 'desc' },
        ],
        take: 200,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.staffTrainingCourse.findMany({
        where: {
          tenantId,
          status: canManageOnboarding ? { in: ['ACTIVE', 'DRAFT'] } : 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
          status: true,
          roleScope: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
        take: 300,
      }),
      this.prisma.staffTaskTemplate.findMany({
        where: {
          tenantId,
          status: canManageOnboarding ? { in: ['ACTIVE', 'DRAFT'] } : 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
          status: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
        take: 300,
      }),
      this.prisma.staffChecklistTemplate.findMany({
        where: {
          tenantId,
          status: canManageOnboarding ? { in: ['ACTIVE', 'DRAFT'] } : 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
          status: true,
          roleScope: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
        take: 300,
      }),
      this.prisma.staffShiftRegulation.findMany({
        where: {
          tenantId,
          status: canManageOnboarding
            ? { in: ['PUBLISHED', 'DRAFT'] }
            : 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          status: true,
          roleScope: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
        take: 300,
      }),
    ]);
    const responseRows = rows.map((row) => this.toPlanResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      canManageOnboarding,
      rows: responseRows,
      stores,
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        status: course.status,
        roleScope: course.roleScope,
        store: course.store,
      })),
      taskTemplates: taskTemplates.map((template) => ({
        id: template.id,
        title: template.title,
        status: template.status,
        roleScope: null,
        store: template.store,
      })),
      checklistTemplates: checklistTemplates.map((template) => ({
        id: template.id,
        title: template.title,
        status: template.status,
        roleScope: template.roleScope,
        store: template.store,
      })),
      regulations: regulations.map((regulation) => ({
        id: regulation.id,
        title: regulation.title,
        status: regulation.status,
        roleScope: regulation.roleScope,
        store: regulation.store,
      })),
    };
  }

  async createPlan(user: AuthenticatedUser, dto: StaffOnboardingPlanDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageOnboarding(user)) {
      throw new BadRequestException('Onboarding plan editing is not allowed');
    }

    const normalized = await this.normalizePlanData(tenantId, dto, {
      requireTitle: true,
    });
    const created = await this.prisma.staffOnboardingPlan.create({
      data: {
        ...(normalized.data as Prisma.StaffOnboardingPlanUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
      },
      include: planInclude,
    });

    return this.toPlanResponse(created);
  }

  async updatePlan(
    user: AuthenticatedUser,
    id: string,
    dto: StaffOnboardingPlanDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageOnboarding(user)) {
      throw new BadRequestException('Onboarding plan editing is not allowed');
    }

    const current = await this.prisma.staffOnboardingPlan.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Onboarding plan not found');
    }

    const normalized = await this.normalizePlanData(tenantId, dto, {
      requireTitle: false,
    });
    const updated = await this.prisma.staffOnboardingPlan.update({
      where: { id: current.id },
      data: normalized.data,
      include: planInclude,
    });

    return this.toPlanResponse(updated);
  }

  private resolveFilters(
    query: StaffOnboardingPlansQuery,
    canManageOnboarding: boolean,
  ): StaffOnboardingPlanReport['filters'] {
    const status = this.resolveOne(
      query.status,
      ['all', ...planStatuses] as const,
      canManageOnboarding ? 'all' : 'ACTIVE',
    );

    return {
      status: canManageOnboarding ? status : 'ACTIVE',
      roleScope: this.resolveOne(
        query.roleScope,
        ['all', ...roleScopes] as const,
        'all',
      ),
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    user: AuthenticatedUser,
    filters: StaffOnboardingPlanReport['filters'],
    canManageOnboarding: boolean,
  ): Prisma.StaffOnboardingPlanWhereInput {
    const where: Prisma.StaffOnboardingPlanWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.roleScope !== 'all') {
      where.roleScope = filters.roleScope;
    }

    if (!canManageOnboarding) {
      where.status = 'ACTIVE';
      where.roleScope = { in: this.visibleRoleScopes(user.role) };
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

  private buildSummary(rows: StaffOnboardingPlanResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.stepsCount += row.stepsCount;
        summary.coursesCount += row.coursesCount;
        summary.tasksCount += row.tasksCount;

        if (row.status === 'ACTIVE') {
          summary.active += 1;
        } else if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        return summary;
      },
      {
        total: 0,
        active: 0,
        draft: 0,
        archived: 0,
        stepsCount: 0,
        coursesCount: 0,
        tasksCount: 0,
      },
    );
  }

  private async normalizePlanData(
    tenantId: string,
    dto: StaffOnboardingPlanDto,
    options: { requireTitle: boolean },
  ): Promise<{ data: Prisma.StaffOnboardingPlanUncheckedUpdateInput }> {
    const data: Prisma.StaffOnboardingPlanUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Onboarding plan title is required',
      ).slice(0, 180);
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description)?.slice(
        0,
        2000,
      );
    }

    if (dto.roleScope !== undefined || options.requireTitle) {
      data.roleScope = this.resolveOne(
        dto.roleScope,
        roleScopes,
        'ADMINISTRATOR',
      );
    }

    if (dto.status !== undefined || options.requireTitle) {
      data.status = this.resolveOne(dto.status, planStatuses, 'DRAFT');
    }

    if (dto.durationDays !== undefined || options.requireTitle) {
      data.durationDays = this.normalizePositiveDays(
        dto.durationDays,
        'Duration days must be between 1 and 365',
      );
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.steps !== undefined || options.requireTitle) {
      const steps = await this.normalizeSteps(tenantId, dto.steps);
      data.steps = steps;
      data.stepsCount = steps.length;
      data.coursesCount = steps.filter((step) => step.type === 'COURSE').length;
      data.tasksCount = steps.filter(
        (step) =>
          step.type === 'TASK_TEMPLATE' ||
          step.type === 'CHECKLIST_TEMPLATE' ||
          step.type === 'REGULATION',
      ).length;
    }

    return { data };
  }

  private async normalizeSteps(
    tenantId: string,
    value: unknown,
  ): Promise<StaffOnboardingStep[]> {
    const rawSteps = Array.isArray(value) ? value.slice(0, 50) : [];
    const courseIds = this.collectIds(rawSteps, 'courseId');
    const taskTemplateIds = this.collectIds(rawSteps, 'taskTemplateId');
    const checklistTemplateIds = this.collectIds(
      rawSteps,
      'checklistTemplateId',
    );
    const regulationIds = this.collectIds(rawSteps, 'regulationId');
    const [courses, taskTemplates, checklistTemplates, regulations] =
      await Promise.all([
        this.prisma.staffTrainingCourse.findMany({
          where: { tenantId, id: { in: courseIds } },
          select: { id: true },
        }),
        this.prisma.staffTaskTemplate.findMany({
          where: { tenantId, id: { in: taskTemplateIds } },
          select: { id: true },
        }),
        this.prisma.staffChecklistTemplate.findMany({
          where: { tenantId, id: { in: checklistTemplateIds } },
          select: { id: true },
        }),
        this.prisma.staffShiftRegulation.findMany({
          where: { tenantId, id: { in: regulationIds } },
          select: { id: true },
        }),
      ]);
    const existingCourseIds = new Set(courses.map((row) => row.id));
    const existingTaskTemplateIds = new Set(taskTemplates.map((row) => row.id));
    const existingChecklistTemplateIds = new Set(
      checklistTemplates.map((row) => row.id),
    );
    const existingRegulationIds = new Set(regulations.map((row) => row.id));
    const steps: StaffOnboardingStep[] = [];

    rawSteps.forEach((step, index) => {
      const record = this.asRecord(step);
      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        stepTypes,
        'TEXT',
      );
      const title = this.normalizeOptionalString(record.title);
      const content = this.normalizeOptionalString(record.content);
      const url = this.normalizeOptionalString(record.url);
      const courseId = this.normalizeOptionalString(record.courseId);
      const taskTemplateId = this.normalizeOptionalString(
        record.taskTemplateId,
      );
      const checklistTemplateId = this.normalizeOptionalString(
        record.checklistTemplateId,
      );
      const regulationId = this.normalizeOptionalString(record.regulationId);

      if (
        !title &&
        !content &&
        !url &&
        !courseId &&
        !taskTemplateId &&
        !checklistTemplateId &&
        !regulationId
      ) {
        return;
      }

      if (!title) {
        throw new BadRequestException('Onboarding step title is required');
      }

      if (type === 'COURSE' && !existingCourseIds.has(courseId ?? '')) {
        throw new BadRequestException('Training course not found');
      }

      if (
        type === 'TASK_TEMPLATE' &&
        !existingTaskTemplateIds.has(taskTemplateId ?? '')
      ) {
        throw new BadRequestException('Task template not found');
      }

      if (
        type === 'CHECKLIST_TEMPLATE' &&
        !existingChecklistTemplateIds.has(checklistTemplateId ?? '')
      ) {
        throw new BadRequestException('Checklist template not found');
      }

      if (
        type === 'REGULATION' &&
        !existingRegulationIds.has(regulationId ?? '')
      ) {
        throw new BadRequestException('Shift regulation not found');
      }

      if ((type === 'TEXT' || type === 'LINK') && !content && !url) {
        throw new BadRequestException('Onboarding step content is required');
      }

      if (type === 'LINK' && url && !this.isAllowedUrl(url)) {
        throw new BadRequestException(
          'Onboarding step URL must start with http:// or https://',
        );
      }

      steps.push({
        id: this.normalizeOptionalString(record.id) ?? `step-${index + 1}`,
        title: title.slice(0, 180),
        type,
        day: this.normalizeStepDay(record.day),
        courseId: type === 'COURSE' ? courseId : null,
        taskTemplateId: type === 'TASK_TEMPLATE' ? taskTemplateId : null,
        checklistTemplateId:
          type === 'CHECKLIST_TEMPLATE' ? checklistTemplateId : null,
        regulationId: type === 'REGULATION' ? regulationId : null,
        content: content?.slice(0, 6000) ?? null,
        url: url?.slice(0, 2000) ?? null,
        required: this.normalizeBoolean(record.required, true),
      });
    });

    return steps;
  }

  private toPlanResponse(row: StaffOnboardingPlanRow) {
    const steps = this.normalizeStepsFromStorage(row.steps);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      roleScope: row.roleScope as StaffOnboardingRoleScope,
      status: row.status as StaffOnboardingPlanStatus,
      durationDays: row.durationDays,
      steps,
      stepsCount: steps.length,
      coursesCount: steps.filter((step) => step.type === 'COURSE').length,
      tasksCount: steps.filter(
        (step) =>
          step.type === 'TASK_TEMPLATE' ||
          step.type === 'CHECKLIST_TEMPLATE' ||
          step.type === 'REGULATION',
      ).length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
    };
  }

  private normalizeStepsFromStorage(value: unknown): StaffOnboardingStep[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 50).map((step, index) => {
      const record = this.asRecord(step);
      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        stepTypes,
        'TEXT',
      );

      return {
        id: this.normalizeOptionalString(record.id) ?? `step-${index + 1}`,
        title: this.normalizeOptionalString(record.title) ?? `Шаг ${index + 1}`,
        type,
        day: this.normalizeStepDay(record.day),
        courseId: this.normalizeOptionalString(record.courseId),
        taskTemplateId: this.normalizeOptionalString(record.taskTemplateId),
        checklistTemplateId: this.normalizeOptionalString(
          record.checklistTemplateId,
        ),
        regulationId: this.normalizeOptionalString(record.regulationId),
        content: this.normalizeOptionalString(record.content),
        url: this.normalizeOptionalString(record.url),
        required: this.normalizeBoolean(record.required, true),
      };
    });
  }

  private collectIds(rows: unknown[], key: string) {
    return Array.from(
      new Set(
        rows
          .map((row) => this.normalizeOptionalString(this.asRecord(row)[key]))
          .filter((id): id is string => Boolean(id)),
      ),
    );
  }

  private canManageOnboarding(user: AuthenticatedUser) {
    switch (user.role) {
      case UserRole.OWNER:
      case UserRole.ADMIN:
      case UserRole.MANAGER:
      case UserRole.CLUB_MANAGER:
      case UserRole.STANDARDS_MANAGER:
        return true;
      default:
        return false;
    }
  }

  private visibleRoleScopes(role: UserRole): StaffOnboardingRoleScope[] {
    const scopes: StaffOnboardingRoleScope[] = ['ALL_STAFF'];

    if (role === UserRole.CLUB_ADMINISTRATOR || role === UserRole.TRAINEE) {
      scopes.push('ADMINISTRATOR');
    }

    if (role === UserRole.SENIOR_ADMINISTRATOR) {
      scopes.push('ADMINISTRATOR', 'SENIOR_ADMINISTRATOR');
    }

    if (role === UserRole.CLUB_MANAGER) {
      scopes.push('ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'CLUB_MANAGER');
    }

    if (
      role === UserRole.MANAGER ||
      role === UserRole.OWNER ||
      role === UserRole.ADMIN
    ) {
      scopes.push(
        'ADMINISTRATOR',
        'SENIOR_ADMINISTRATOR',
        'CLUB_MANAGER',
        'MANAGER',
        'STANDARDS_MANAGER',
      );
    }

    if (role === UserRole.STANDARDS_MANAGER) {
      scopes.push(
        'ADMINISTRATOR',
        'SENIOR_ADMINISTRATOR',
        'CLUB_MANAGER',
        'STANDARDS_MANAGER',
      );
    }

    return Array.from(new Set(scopes));
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

  private normalizeBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }
    }

    return fallback;
  }

  private normalizePositiveDays(
    value: number | string | null | undefined,
    message: string,
  ) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const days = Number.parseInt(String(value), 10);

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException(message);
    }

    return days;
  }

  private normalizeStepDay(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(
        'Onboarding step day must be between 1 and 365',
      );
    }

    const day = Number.parseInt(String(value), 10);

    if (!Number.isFinite(day) || day < 1 || day > 365) {
      throw new BadRequestException(
        'Onboarding step day must be between 1 and 365',
      );
    }

    return day;
  }

  private isAllowedUrl(value: string) {
    return /^https?:\/\//i.test(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
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
}
