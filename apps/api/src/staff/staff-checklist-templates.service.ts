import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const templateStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const shiftKinds = [
  'OPENING',
  'CLOSING',
  'CASH',
  'BAR',
  'PC_ZONE',
  'CLEANLINESS',
  'INCIDENT',
  'INVENTORY',
  'CUSTOM',
] as const;
const roleScopes = [
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'MANAGER',
  'ALL_STAFF',
] as const;
const itemValueTypes = [
  'CHECKBOX',
  'TEXT',
  'NUMBER',
  'PHOTO_LINK',
  'FILE_LINK',
  'SELECT',
  'TIMESTAMP',
] as const;

export type StaffChecklistTemplateStatus = (typeof templateStatuses)[number];
export type StaffChecklistTemplateShiftKind = (typeof shiftKinds)[number];
export type StaffChecklistTemplateRoleScope = (typeof roleScopes)[number];
export type StaffChecklistTemplateItemValueType =
  (typeof itemValueTypes)[number];

export type StaffChecklistTemplatesQuery = {
  status?: StaffChecklistTemplateStatus | 'all';
  shiftKind?: StaffChecklistTemplateShiftKind | 'all';
  storeId?: string;
  search?: string;
};

export type StaffChecklistTemplateDto = {
  title?: string;
  description?: string | null;
  shiftKind?: StaffChecklistTemplateShiftKind;
  roleScope?: StaffChecklistTemplateRoleScope;
  status?: StaffChecklistTemplateStatus;
  storeId?: string | null;
  sourceRegulationId?: string | null;
  sections?: unknown;
};

export type StaffChecklistTemplateSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffChecklistTemplateItem[];
};

export type StaffChecklistTemplateItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffChecklistTemplateItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
  dueOffsetMinutes: number | null;
};

export type StaffChecklistTemplateReport = {
  filters: {
    status: StaffChecklistTemplateStatus | 'all';
    shiftKind: StaffChecklistTemplateShiftKind | 'all';
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    itemsCount: number;
    requiredItemsCount: number;
    evidenceItemsCount: number;
    scoreTotal: number;
  };
  rows: StaffChecklistTemplateResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  publishedRegulations: StaffChecklistTemplateRegulationOption[];
};

export type StaffChecklistTemplateRegulationOption = {
  id: string;
  title: string;
  shiftKind: StaffChecklistTemplateShiftKind;
  roleScope: StaffChecklistTemplateRoleScope;
  version: number;
  store: { id: string; name: string; isActive: boolean } | null;
  sections: StaffChecklistTemplateSection[];
  sectionsCount: number;
  itemsCount: number;
  evidenceItemsCount: number;
};

export type StaffChecklistTemplateResponse = {
  id: string;
  title: string;
  description: string | null;
  shiftKind: StaffChecklistTemplateShiftKind;
  roleScope: StaffChecklistTemplateRoleScope;
  status: StaffChecklistTemplateStatus;
  version: number;
  sections: StaffChecklistTemplateSection[];
  sectionsCount: number;
  itemsCount: number;
  requiredItemsCount: number;
  evidenceItemsCount: number;
  scoreTotal: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  sourceRegulation: {
    id: string;
    title: string;
    status: string;
    version: number;
  } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

const templateInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  sourceRegulation: {
    select: { id: true, title: true, status: true, version: true },
  },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffChecklistTemplateInclude;

type StaffChecklistTemplateRow = Prisma.StaffChecklistTemplateGetPayload<{
  include: typeof templateInclude;
}>;

type SourceRegulation = {
  id: string;
  title: string;
  shiftKind: string;
  roleScope: string;
  version: number;
  storeId: string | null;
  sections: Prisma.JsonValue;
};

type SectionSummary = {
  sectionsCount: number;
  itemsCount: number;
  requiredItemsCount: number;
  evidenceItemsCount: number;
  scoreTotal: number;
};

type StaffChecklistTemplateCatalogScope = {
  roleScopes: StaffChecklistTemplateRoleScope[];
  storeIds: string[] | null;
};

@Injectable()
export class StaffChecklistTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getTemplates(
    user: AuthenticatedUser,
    query: StaffChecklistTemplatesQuery = {},
  ): Promise<StaffChecklistTemplateReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const catalogScope = await this.resolveCatalogScope(tenantId, user);
    const filters = this.resolveFilters(query, catalogScope);
    const where = this.applyCatalogScope(
      this.buildWhere(tenantId, filters),
      catalogScope,
    );
    const regulationWhere = this.applyRegulationCatalogScope(
      { tenantId, status: 'PUBLISHED' },
      catalogScope,
    );

    const [rows, stores, regulations] = await Promise.all([
      this.prisma.staffChecklistTemplate.findMany({
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
      this.prisma.staffShiftRegulation.findMany({
        where: regulationWhere,
        select: {
          id: true,
          title: true,
          shiftKind: true,
          roleScope: true,
          version: true,
          sections: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
      }),
    ]);
    const responseRows = rows.map((row) => this.toTemplateResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      publishedRegulations: regulations.map((row) =>
        this.toRegulationOption(row),
      ),
    };
  }

  async createTemplate(
    user: AuthenticatedUser,
    dto: StaffChecklistTemplateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const sourceRegulation = await this.resolveSourceRegulation(
      tenantId,
      dto.sourceRegulationId,
    );
    const sections = this.normalizeSections(
      dto.sections ?? sourceRegulation?.sections ?? this.defaultSections(),
    );
    const summary = this.summarizeSections(sections);
    const storeId = await this.resolveStoreId(
      tenantId,
      dto.storeId === undefined ? sourceRegulation?.storeId : dto.storeId,
    );

    const template = await this.prisma.staffChecklistTemplate.create({
      data: {
        tenantId,
        storeId,
        sourceRegulationId: sourceRegulation?.id ?? null,
        createdByUserId: user.id,
        title: this.normalizeRequiredString(
          dto.title ?? sourceRegulation?.title,
          'Checklist template title is required',
        ),
        description: this.normalizeOptionalString(dto.description),
        shiftKind:
          dto.shiftKind ??
          ((sourceRegulation?.shiftKind ??
            'OPENING') as StaffChecklistTemplateShiftKind),
        roleScope:
          dto.roleScope ??
          ((sourceRegulation?.roleScope ??
            'ADMINISTRATOR') as StaffChecklistTemplateRoleScope),
        status: this.resolveOne(dto.status, templateStatuses, 'DRAFT'),
        version: 1,
        sections: sections,
        ...summary,
      },
      include: templateInclude,
    });

    return this.toTemplateResponse(template);
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: StaffChecklistTemplateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffChecklistTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Checklist template not found');
    }

    const sourceRegulation =
      dto.sourceRegulationId === undefined
        ? null
        : await this.resolveSourceRegulation(tenantId, dto.sourceRegulationId);
    const data: Prisma.StaffChecklistTemplateUncheckedUpdateInput = {};
    let shouldIncrementVersion = false;

    if (dto.title !== undefined) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Checklist template title is required',
      );
      shouldIncrementVersion = true;
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description);
    }

    if (dto.shiftKind !== undefined || sourceRegulation) {
      data.shiftKind = this.resolveOne(
        dto.shiftKind ?? sourceRegulation?.shiftKind,
        shiftKinds,
        'OPENING',
      );
      shouldIncrementVersion = true;
    }

    if (dto.roleScope !== undefined || sourceRegulation) {
      data.roleScope = this.resolveOne(
        dto.roleScope ?? sourceRegulation?.roleScope,
        roleScopes,
        'ADMINISTRATOR',
      );
      shouldIncrementVersion = true;
    }

    if (dto.status !== undefined) {
      data.status = this.resolveOne(dto.status, templateStatuses, 'DRAFT');
    }

    if (dto.storeId !== undefined || sourceRegulation) {
      data.storeId = await this.resolveStoreId(
        tenantId,
        dto.storeId === undefined ? sourceRegulation?.storeId : dto.storeId,
      );
    }

    if (dto.sourceRegulationId !== undefined) {
      data.sourceRegulationId = sourceRegulation?.id ?? null;
    }

    if (dto.sections !== undefined || sourceRegulation) {
      const sections = this.normalizeSections(
        dto.sections ?? sourceRegulation?.sections ?? this.defaultSections(),
      );
      data.sections = sections;
      Object.assign(data, this.summarizeSections(sections));
      shouldIncrementVersion = true;
    }

    if (shouldIncrementVersion) {
      data.version = { increment: 1 };
    }

    const template = await this.prisma.staffChecklistTemplate.update({
      where: { id: current.id },
      data,
      include: templateInclude,
    });

    return this.toTemplateResponse(template);
  }

  async deleteTemplate(user: AuthenticatedUser, id: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const template = await this.prisma.staffChecklistTemplate.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        title: true,
        createdByUserId: true,
        _count: { select: { checklistRuns: true } },
      },
    });

    if (!template) {
      throw new NotFoundException('Checklist template not found');
    }

    if (!this.canDeleteTemplate(user, template.createdByUserId)) {
      throw new ForbiddenException(
        'Удалить чек-лист может автор, управляющий клубом, управляющий сети или владелец',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffChecklistRun.updateMany({
        where: { tenantId, templateId: template.id },
        data: { templateId: null },
      });
      await tx.staffChecklistTemplate.delete({
        where: { id: template.id },
      });
    });

    return {
      id: template.id,
      deleted: true,
      detachedChecklistRuns: template._count.checklistRuns,
    };
  }

  private resolveFilters(
    query: StaffChecklistTemplatesQuery,
    catalogScope: StaffChecklistTemplateCatalogScope | null = null,
  ): StaffChecklistTemplateReport['filters'] {
    return {
      status: catalogScope
        ? 'ACTIVE'
        : this.resolveOne(
            query.status,
            ['all', ...templateStatuses] as const,
            'all',
          ),
      shiftKind: this.resolveOne(
        query.shiftKind,
        ['all', ...shiftKinds] as const,
        'all',
      ),
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffChecklistTemplateReport['filters'],
  ): Prisma.StaffChecklistTemplateWhereInput {
    const where: Prisma.StaffChecklistTemplateWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.shiftKind !== 'all') {
      where.shiftKind = filters.shiftKind;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        {
          sourceRegulation: {
            title: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private applyCatalogScope(
    where: Prisma.StaffChecklistTemplateWhereInput,
    scope: StaffChecklistTemplateCatalogScope | null,
  ): Prisma.StaffChecklistTemplateWhereInput {
    if (!scope) {
      return where;
    }

    const scoped: Prisma.StaffChecklistTemplateWhereInput = {
      roleScope: { in: scope.roleScopes },
    };

    if (scope.storeIds) {
      scoped.OR = [{ storeId: null }, { storeId: { in: scope.storeIds } }];
    }

    return { AND: [where, scoped] };
  }

  private applyRegulationCatalogScope(
    where: Prisma.StaffShiftRegulationWhereInput,
    scope: StaffChecklistTemplateCatalogScope | null,
  ): Prisma.StaffShiftRegulationWhereInput {
    if (!scope) {
      return where;
    }

    const scoped: Prisma.StaffShiftRegulationWhereInput = {
      roleScope: { in: scope.roleScopes },
    };

    if (scope.storeIds) {
      scoped.OR = [{ storeId: null }, { storeId: { in: scope.storeIds } }];
    }

    return { AND: [where, scoped] };
  }

  private async resolveCatalogScope(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<StaffChecklistTemplateCatalogScope | null> {
    if (!this.isShiftCatalogUser(user)) {
      return null;
    }

    const actor = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId, isActive: true },
      select: { storeAccesses: { select: { storeId: true } } },
    });

    return {
      roleScopes: this.roleScopesForUser(user.role),
      storeIds: actor?.storeAccesses.length
        ? actor.storeAccesses.map((access) => access.storeId)
        : null,
    };
  }

  private isShiftCatalogUser(user: AuthenticatedUser) {
    return (
      user.role === UserRole.SENIOR_ADMINISTRATOR ||
      user.role === UserRole.CLUB_ADMINISTRATOR ||
      user.role === UserRole.TRAINEE
    );
  }

  private roleScopesForUser(role: UserRole): StaffChecklistTemplateRoleScope[] {
    if (role === UserRole.SENIOR_ADMINISTRATOR) {
      return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'ALL_STAFF'];
    }

    return ['ADMINISTRATOR', 'ALL_STAFF'];
  }

  private canDeleteTemplate(
    user: AuthenticatedUser,
    createdByUserId: string | null,
  ) {
    if (createdByUserId && createdByUserId === user.id) {
      return true;
    }

    return (
      [
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.CLUB_MANAGER,
      ] as UserRole[]
    ).includes(user.role);
  }

  private buildSummary(rows: StaffChecklistTemplateResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.itemsCount += row.itemsCount;
        summary.requiredItemsCount += row.requiredItemsCount;
        summary.evidenceItemsCount += row.evidenceItemsCount;
        summary.scoreTotal += row.scoreTotal;

        if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ACTIVE') {
          summary.active += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        return summary;
      },
      {
        total: 0,
        draft: 0,
        active: 0,
        archived: 0,
        itemsCount: 0,
        requiredItemsCount: 0,
        evidenceItemsCount: 0,
        scoreTotal: 0,
      },
    );
  }

  private toRegulationOption(row: {
    id: string;
    title: string;
    shiftKind: string;
    roleScope: string;
    version: number;
    sections: Prisma.JsonValue;
    store: { id: string; name: string; isActive: boolean } | null;
  }): StaffChecklistTemplateRegulationOption {
    const sections = this.normalizeSections(row.sections);
    const summary = this.summarizeSections(sections);

    return {
      id: row.id,
      title: row.title,
      shiftKind: row.shiftKind as StaffChecklistTemplateShiftKind,
      roleScope: row.roleScope as StaffChecklistTemplateRoleScope,
      version: row.version,
      store: row.store,
      sections,
      sectionsCount: summary.sectionsCount,
      itemsCount: summary.itemsCount,
      evidenceItemsCount: summary.evidenceItemsCount,
    };
  }

  private toTemplateResponse(
    row: StaffChecklistTemplateRow,
  ): StaffChecklistTemplateResponse {
    const sections = this.normalizeSections(row.sections);
    const summary = this.summarizeSections(sections);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      shiftKind: row.shiftKind as StaffChecklistTemplateShiftKind,
      roleScope: row.roleScope as StaffChecklistTemplateRoleScope,
      status: row.status as StaffChecklistTemplateStatus,
      version: row.version,
      sections,
      sectionsCount: summary.sectionsCount,
      itemsCount: summary.itemsCount,
      requiredItemsCount: summary.requiredItemsCount,
      evidenceItemsCount: summary.evidenceItemsCount,
      scoreTotal: summary.scoreTotal,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      sourceRegulation: row.sourceRegulation,
      createdByUser: row.createdByUser,
    };
  }

  private async resolveSourceRegulation(
    tenantId: string,
    value: string | null | undefined,
  ): Promise<SourceRegulation | null> {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const regulation = await this.prisma.staffShiftRegulation.findFirst({
      where: { id, tenantId, status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        shiftKind: true,
        roleScope: true,
        version: true,
        storeId: true,
        sections: true,
      },
    });

    if (!regulation) {
      throw new BadRequestException('Published regulation not found');
    }

    return regulation;
  }

  private normalizeSections(value: unknown): StaffChecklistTemplateSection[] {
    const rawSections = Array.isArray(value) ? value : this.defaultSections();
    const sections = rawSections.slice(0, 20).map((section, sectionIndex) => {
      const sectionRecord = this.asRecord(section);
      const title =
        this.normalizeOptionalString(sectionRecord.title) ??
        `Раздел ${sectionIndex + 1}`;
      const rawItems = Array.isArray(sectionRecord.items)
        ? sectionRecord.items
        : [];
      const items = rawItems
        .slice(0, 80)
        .map((item, itemIndex) => this.normalizeItem(item, itemIndex))
        .filter((item) => item.title.length > 0);

      return {
        id:
          this.normalizeOptionalString(sectionRecord.id) ??
          `section-${sectionIndex + 1}`,
        title,
        description: this.normalizeOptionalString(sectionRecord.description),
        items,
      };
    });

    if (sections.length === 0) {
      throw new BadRequestException(
        'At least one checklist section is required',
      );
    }

    if (sections.every((section) => section.items.length === 0)) {
      throw new BadRequestException('At least one checklist item is required');
    }

    return sections;
  }

  private normalizeItem(
    value: unknown,
    index: number,
  ): StaffChecklistTemplateItem {
    const item = this.asRecord(value);
    const title = this.normalizeOptionalString(item.title) ?? '';

    return {
      id: this.normalizeOptionalString(item.id) ?? `item-${index + 1}`,
      title,
      instruction: this.normalizeOptionalString(item.instruction),
      valueType: this.resolveOne(
        this.normalizeOptionalString(item.valueType),
        itemValueTypes,
        'CHECKBOX',
      ),
      required: this.normalizeBoolean(item.required, true),
      evidenceRequired: this.normalizeBoolean(item.evidenceRequired, false),
      score: this.normalizeScore(item.score),
      dueOffsetMinutes: this.normalizeDueOffsetMinutes(item.dueOffsetMinutes),
    };
  }

  private summarizeSections(
    sections: StaffChecklistTemplateSection[],
  ): SectionSummary {
    const items = sections.flatMap((section) => section.items);

    return {
      sectionsCount: sections.length,
      itemsCount: items.length,
      requiredItemsCount: items.filter((item) => item.required).length,
      evidenceItemsCount: items.filter((item) => item.evidenceRequired).length,
      scoreTotal: items.reduce((sum, item) => sum + item.score, 0),
    };
  }

  private defaultSections(): StaffChecklistTemplateSection[] {
    return [
      {
        id: 'shift-readiness',
        title: 'Подготовка смены',
        description: 'Базовые действия администратора перед началом работы.',
        items: [
          {
            id: 'workspace-ready',
            title: 'Проверить рабочую зону и оборудование',
            instruction:
              'Отметьте состояние стойки, кассы, периферии и доступность основных рабочих сервисов.',
            valueType: 'CHECKBOX',
            required: true,
            evidenceRequired: false,
            score: 2,
            dueOffsetMinutes: null,
          },
          {
            id: 'guest-zone-ready',
            title: 'Проверить зал и гостевую зону',
            instruction:
              'Убедитесь, что гостевая зона готова к приему гостей и видимые проблемы сразу вынесены в задачу.',
            valueType: 'CHECKBOX',
            required: true,
            evidenceRequired: false,
            score: 2,
            dueOffsetMinutes: null,
          },
        ],
      },
    ];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
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

  private normalizeDueOffsetMinutes(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const minutes =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;

    if (!Number.isFinite(minutes) || minutes <= 0) {
      return null;
    }

    return Math.min(Math.trunc(minutes), 24 * 60);
  }

  private normalizeScore(value: unknown) {
    const score =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : 1;

    if (!Number.isFinite(score)) {
      return 1;
    }

    return Math.min(Math.max(Math.trunc(score), 0), 100);
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
