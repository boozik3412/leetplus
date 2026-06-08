import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  StaffTeamChatService,
  type StaffChatSystemNotificationDto,
} from './staff-team-chat.service';

const courseStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const roleScopes = [
  'ALL_STAFF',
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_MANAGER',
  'MANAGER',
  'STANDARDS_MANAGER',
] as const;
const stepTypes = ['ARTICLE', 'TEXT', 'LINK', 'TASK'] as const;

export type StaffTrainingCourseStatus = (typeof courseStatuses)[number];
export type StaffTrainingRoleScope = (typeof roleScopes)[number];
export type StaffTrainingCourseStepType = (typeof stepTypes)[number];

export type StaffTrainingCoursesQuery = {
  status?: StaffTrainingCourseStatus | 'all';
  roleScope?: StaffTrainingRoleScope | 'all';
  required?: 'true' | 'false' | 'all';
  storeId?: string;
  search?: string;
};

export type StaffTrainingCourseDto = {
  title?: string;
  description?: string | null;
  roleScope?: StaffTrainingRoleScope;
  status?: StaffTrainingCourseStatus;
  required?: boolean | string;
  dueDays?: number | string | null;
  storeId?: string | null;
  steps?: unknown;
};

export type StaffTrainingCourseStep = {
  id: string;
  title: string;
  type: StaffTrainingCourseStepType;
  articleId: string | null;
  content: string | null;
  url: string | null;
  required: boolean;
};

export type StaffTrainingCourseReport = {
  filters: {
    status: StaffTrainingCourseStatus | 'all';
    roleScope: StaffTrainingRoleScope | 'all';
    required: 'true' | 'false' | 'all';
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    required: number;
    stepsCount: number;
  };
  canManageTraining: boolean;
  rows: StaffTrainingCourseResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  knowledgeArticles: StaffTrainingKnowledgeArticleOption[];
};

export type StaffTrainingCourseResponse = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffTrainingRoleScope;
  status: StaffTrainingCourseStatus;
  required: boolean;
  dueDays: number | null;
  steps: StaffTrainingCourseStep[];
  stepsCount: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffTrainingKnowledgeArticleOption = {
  id: string;
  title: string;
  category: string;
  roleScope: StaffTrainingRoleScope;
  status: string;
  store: { id: string; name: string; isActive: boolean } | null;
};

const courseInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffTrainingCourseInclude;

type StaffTrainingCourseRow = Prisma.StaffTrainingCourseGetPayload<{
  include: typeof courseInclude;
}>;

@Injectable()
export class StaffTrainingCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffTeamChatService: StaffTeamChatService,
  ) {}

  async getCourses(
    user: AuthenticatedUser,
    query: StaffTrainingCoursesQuery = {},
  ): Promise<StaffTrainingCourseReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageTraining = this.canManageTraining(user);
    const filters = this.resolveFilters(query, canManageTraining);
    const where = this.buildWhere(tenantId, user, filters, canManageTraining);

    const [rows, stores, articles] = await Promise.all([
      this.prisma.staffTrainingCourse.findMany({
        where,
        include: courseInclude,
        orderBy: [
          { status: 'asc' },
          { required: 'desc' },
          { updatedAt: 'desc' },
        ],
        take: 200,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.staffKnowledgeArticle.findMany({
        where: {
          tenantId,
          status: canManageTraining
            ? { in: ['PUBLISHED', 'DRAFT'] }
            : 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          category: true,
          roleScope: true,
          status: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
        take: 300,
      }),
    ]);
    const responseRows = rows.map((row) => this.toCourseResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      canManageTraining,
      rows: responseRows,
      stores,
      knowledgeArticles: articles.map((article) => ({
        id: article.id,
        title: article.title,
        category: article.category,
        roleScope: article.roleScope as StaffTrainingRoleScope,
        status: article.status,
        store: article.store,
      })),
    };
  }

  async createCourse(user: AuthenticatedUser, dto: StaffTrainingCourseDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageTraining(user)) {
      throw new BadRequestException('Training course editing is not allowed');
    }

    const normalized = await this.normalizeCourseData(tenantId, dto, {
      requireTitle: true,
    });
    const created = await this.prisma.staffTrainingCourse.create({
      data: {
        ...(normalized.data as Prisma.StaffTrainingCourseUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
      },
      include: courseInclude,
    });

    if (created.status === 'ACTIVE') {
      await this.staffTeamChatService.createSystemNotification(
        tenantId,
        this.buildCourseNotification(created, 'created'),
      );
    }

    return this.toCourseResponse(created);
  }

  async updateCourse(
    user: AuthenticatedUser,
    id: string,
    dto: StaffTrainingCourseDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageTraining(user)) {
      throw new BadRequestException('Training course editing is not allowed');
    }

    const current = await this.prisma.staffTrainingCourse.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        required: true,
        roleScope: true,
        storeId: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Training course not found');
    }

    const normalized = await this.normalizeCourseData(tenantId, dto, {
      requireTitle: false,
    });
    const updated = await this.prisma.staffTrainingCourse.update({
      where: { id: current.id },
      data: normalized.data,
      include: courseInclude,
    });

    if (this.shouldNotifyCourseUpdate(current, updated, normalized.data)) {
      await this.staffTeamChatService.createSystemNotification(
        tenantId,
        this.buildCourseNotification(updated, 'updated'),
      );
    }

    return this.toCourseResponse(updated);
  }

  private shouldNotifyCourseUpdate(
    current: {
      status: string;
      required: boolean;
      roleScope: string;
      storeId: string | null;
    },
    updated: StaffTrainingCourseRow,
    data: Prisma.StaffTrainingCourseUncheckedUpdateInput,
  ) {
    if (updated.status !== 'ACTIVE') {
      return false;
    }

    return (
      current.status !== updated.status ||
      current.required !== updated.required ||
      current.roleScope !== updated.roleScope ||
      current.storeId !== updated.storeId ||
      data.title !== undefined ||
      data.description !== undefined ||
      data.steps !== undefined ||
      data.dueDays !== undefined
    );
  }

  private buildCourseNotification(
    course: StaffTrainingCourseRow,
    event: 'created' | 'updated',
  ): StaffChatSystemNotificationDto {
    const prefix =
      event === 'created'
        ? course.required
          ? 'Назначен обязательный курс'
          : 'Новый курс доступен'
        : course.required
          ? 'Обязательный курс обновлен'
          : 'Курс обновлен';

    return {
      title: `${prefix}: ${course.title}`,
      message: [
        course.store ? `Клуб: ${course.store.name}` : 'Клуб: вся сеть',
        `Кому: ${this.trainingRoleScopeLabel(
          course.roleScope as StaffTrainingRoleScope,
        )}`,
        `Обязательный: ${course.required ? 'да' : 'нет'}`,
        course.dueDays !== null
          ? `Срок прохождения: ${course.dueDays} дн.`
          : null,
        `Шагов: ${course.stepsCount}`,
      ]
        .filter(Boolean)
        .join('\n'),
      storeId: course.storeId,
      severity: course.required ? 'WARNING' : 'INFO',
      actionLabel: 'Открыть курсы',
      actionHref: `/staff/training-courses?search=${encodeURIComponent(
        course.title,
      )}`,
    };
  }

  private trainingRoleScopeLabel(roleScope: StaffTrainingRoleScope) {
    const labels: Record<StaffTrainingRoleScope, string> = {
      ALL_STAFF: 'весь персонал',
      ADMINISTRATOR: 'администраторы и стажеры',
      SENIOR_ADMINISTRATOR: 'старшие администраторы',
      CLUB_MANAGER: 'управляющие клубом',
      MANAGER: 'управляющие сети',
      STANDARDS_MANAGER: 'менеджеры по стандартам',
    };

    return labels[roleScope];
  }

  private resolveFilters(
    query: StaffTrainingCoursesQuery,
    canManageTraining: boolean,
  ): StaffTrainingCourseReport['filters'] {
    const status = this.resolveOne(
      query.status,
      ['all', ...courseStatuses] as const,
      canManageTraining ? 'all' : 'ACTIVE',
    );

    return {
      status: canManageTraining ? status : 'ACTIVE',
      roleScope: this.resolveOne(
        query.roleScope,
        ['all', ...roleScopes] as const,
        'all',
      ),
      required:
        query.required === 'true' || query.required === 'false'
          ? query.required
          : 'all',
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    user: AuthenticatedUser,
    filters: StaffTrainingCourseReport['filters'],
    canManageTraining: boolean,
  ): Prisma.StaffTrainingCourseWhereInput {
    const where: Prisma.StaffTrainingCourseWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.roleScope !== 'all') {
      where.roleScope = filters.roleScope;
    }

    if (!canManageTraining) {
      where.status = 'ACTIVE';
      where.roleScope = { in: this.visibleRoleScopes(user.role) };
    }

    if (filters.required !== 'all') {
      where.required = filters.required === 'true';
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

  private buildSummary(rows: StaffTrainingCourseResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.stepsCount += row.stepsCount;

        if (row.status === 'ACTIVE') {
          summary.active += 1;
        } else if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        if (row.required) {
          summary.required += 1;
        }

        return summary;
      },
      {
        total: 0,
        active: 0,
        draft: 0,
        archived: 0,
        required: 0,
        stepsCount: 0,
      },
    );
  }

  private async normalizeCourseData(
    tenantId: string,
    dto: StaffTrainingCourseDto,
    options: { requireTitle: boolean },
  ): Promise<{ data: Prisma.StaffTrainingCourseUncheckedUpdateInput }> {
    const data: Prisma.StaffTrainingCourseUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Course title is required',
      ).slice(0, 180);
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description)?.slice(
        0,
        2000,
      );
    }

    if (dto.roleScope !== undefined || options.requireTitle) {
      data.roleScope = this.resolveOne(dto.roleScope, roleScopes, 'ALL_STAFF');
    }

    if (dto.status !== undefined || options.requireTitle) {
      data.status = this.resolveOne(dto.status, courseStatuses, 'DRAFT');
    }

    if (dto.required !== undefined || options.requireTitle) {
      data.required = this.normalizeBoolean(dto.required, false);
    }

    if (dto.dueDays !== undefined || options.requireTitle) {
      data.dueDays = this.normalizeDueDays(dto.dueDays);
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.steps !== undefined || options.requireTitle) {
      const steps = await this.normalizeSteps(tenantId, dto.steps);
      data.steps = steps;
      data.stepsCount = steps.length;
    }

    return { data };
  }

  private async normalizeSteps(
    tenantId: string,
    value: unknown,
  ): Promise<StaffTrainingCourseStep[]> {
    const rawSteps = Array.isArray(value) ? value : [];
    const steps: StaffTrainingCourseStep[] = [];
    const articleIds = rawSteps
      .map((step) =>
        this.normalizeOptionalString(this.asRecord(step).articleId),
      )
      .filter((id): id is string => Boolean(id));
    const existingArticleIds =
      articleIds.length > 0
        ? new Set(
            (
              await this.prisma.staffKnowledgeArticle.findMany({
                where: { id: { in: articleIds }, tenantId },
                select: { id: true },
              })
            ).map((article) => article.id),
          )
        : new Set<string>();

    rawSteps.slice(0, 40).forEach((step, index) => {
      const record = this.asRecord(step);
      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        stepTypes,
        'TEXT',
      );
      const title = this.normalizeOptionalString(record.title);
      const articleId = this.normalizeOptionalString(record.articleId);
      const content = this.normalizeOptionalString(record.content);
      const url = this.normalizeOptionalString(record.url);

      if (!title && !articleId && !content && !url) {
        return;
      }

      if (!title) {
        throw new BadRequestException('Course step title is required');
      }

      if (type === 'ARTICLE') {
        if (!articleId) {
          throw new BadRequestException('Course step article is required');
        }

        if (!existingArticleIds.has(articleId)) {
          throw new BadRequestException('Knowledge article not found');
        }
      }

      if (type === 'LINK' && !url) {
        throw new BadRequestException('Course step URL is required');
      }

      if (url && !this.isAllowedUrl(url)) {
        throw new BadRequestException(
          'Course step URL must start with http:// or https://',
        );
      }

      if ((type === 'TEXT' || type === 'TASK') && !content) {
        throw new BadRequestException('Course step text is required');
      }

      steps.push({
        id: this.normalizeOptionalString(record.id) ?? `step-${index + 1}`,
        title: title.slice(0, 180),
        type,
        articleId: type === 'ARTICLE' ? articleId : null,
        content: content?.slice(0, 6000) ?? null,
        url: url?.slice(0, 2000) ?? null,
        required: this.normalizeBoolean(record.required, true),
      });
    });

    return steps;
  }

  private toCourseResponse(row: StaffTrainingCourseRow) {
    const steps = this.normalizeStepsFromStorage(row.steps);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      roleScope: row.roleScope as StaffTrainingRoleScope,
      status: row.status as StaffTrainingCourseStatus,
      required: row.required,
      dueDays: row.dueDays,
      steps,
      stepsCount: steps.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
    };
  }

  private normalizeStepsFromStorage(value: unknown): StaffTrainingCourseStep[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 40).map((step, index) => {
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
        articleId: this.normalizeOptionalString(record.articleId),
        content: this.normalizeOptionalString(record.content),
        url: this.normalizeOptionalString(record.url),
        required: this.normalizeBoolean(record.required, true),
      };
    });
  }

  private canManageTraining(user: AuthenticatedUser) {
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

  private visibleRoleScopes(role: UserRole): StaffTrainingRoleScope[] {
    const scopes: StaffTrainingRoleScope[] = ['ALL_STAFF'];

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

  private normalizeDueDays(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const days = Number.parseInt(String(value), 10);

    if (!Number.isFinite(days) || days < 0 || days > 365) {
      throw new BadRequestException('Due days must be between 0 and 365');
    }

    return days;
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
