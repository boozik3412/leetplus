import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const articleStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const roleScopes = [
  'ALL_STAFF',
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_MANAGER',
  'MANAGER',
  'STANDARDS_MANAGER',
] as const;
const materialTypes = [
  'TEXT',
  'FILE_LINK',
  'IMAGE',
  'VIDEO',
  'EXTERNAL_LINK',
  'OTHER',
] as const;

export type StaffKnowledgeArticleStatus = (typeof articleStatuses)[number];
export type StaffKnowledgeRoleScope = (typeof roleScopes)[number];
export type StaffKnowledgeMaterialType = (typeof materialTypes)[number];

export type StaffKnowledgeBaseQuery = {
  status?: StaffKnowledgeArticleStatus | 'all';
  roleScope?: StaffKnowledgeRoleScope | 'all';
  category?: string;
  storeId?: string;
  search?: string;
};

export type StaffKnowledgeArticleDto = {
  title?: string;
  summary?: string | null;
  content?: string | null;
  category?: string | null;
  roleScope?: StaffKnowledgeRoleScope;
  status?: StaffKnowledgeArticleStatus;
  storeId?: string | null;
  tags?: unknown;
  materials?: unknown;
};

export type StaffKnowledgeMaterial = {
  id: string;
  title: string;
  type: StaffKnowledgeMaterialType;
  url: string | null;
  content: string | null;
  note: string | null;
  required: boolean;
};

export type StaffKnowledgeBaseReport = {
  filters: {
    status: StaffKnowledgeArticleStatus | 'all';
    roleScope: StaffKnowledgeRoleScope | 'all';
    category: string | null;
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    materialsCount: number;
  };
  canManageKnowledge: boolean;
  categories: string[];
  rows: StaffKnowledgeArticleResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffKnowledgeArticleResponse = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  tags: string[];
  materials: StaffKnowledgeMaterial[];
  materialsCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

const articleInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffKnowledgeArticleInclude;

type StaffKnowledgeArticleRow = Prisma.StaffKnowledgeArticleGetPayload<{
  include: typeof articleInclude;
}>;

@Injectable()
export class StaffKnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getArticles(
    user: AuthenticatedUser,
    query: StaffKnowledgeBaseQuery = {},
  ): Promise<StaffKnowledgeBaseReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageKnowledge = this.canManageKnowledge(user);
    const filters = this.resolveFilters(query, canManageKnowledge);
    const where = this.buildWhere(tenantId, user, filters, canManageKnowledge);

    const [rows, stores, categories] = await Promise.all([
      this.prisma.staffKnowledgeArticle.findMany({
        where,
        include: articleInclude,
        orderBy: [
          { status: 'asc' },
          { category: 'asc' },
          { updatedAt: 'desc' },
        ],
        take: 300,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.staffKnowledgeArticle.findMany({
        where: {
          tenantId,
          ...(canManageKnowledge
            ? {}
            : {
                status: 'PUBLISHED',
                roleScope: { in: this.visibleRoleScopes(user.role) },
              }),
        },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
    ]);
    const responseRows = rows.map((row) => this.toArticleResponse(row));

    return {
      filters,
      summary: this.buildSummary(responseRows),
      canManageKnowledge,
      categories: categories.map((row) => row.category),
      rows: responseRows,
      stores,
    };
  }

  async createArticle(user: AuthenticatedUser, dto: StaffKnowledgeArticleDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageKnowledge(user)) {
      throw new BadRequestException('Knowledge base editing is not allowed');
    }

    const data = await this.normalizeArticleData(tenantId, dto, {
      requireTitle: true,
    });
    const status =
      (data.status as StaffKnowledgeArticleStatus | undefined) ?? 'DRAFT';
    const created = await this.prisma.staffKnowledgeArticle.create({
      data: {
        ...(data as Prisma.StaffKnowledgeArticleUncheckedCreateInput),
        tenantId,
        status,
        createdByUserId: user.id,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
      include: articleInclude,
    });

    return this.toArticleResponse(created);
  }

  async updateArticle(
    user: AuthenticatedUser,
    id: string,
    dto: StaffKnowledgeArticleDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageKnowledge(user)) {
      throw new BadRequestException('Knowledge base editing is not allowed');
    }

    const current = await this.prisma.staffKnowledgeArticle.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, publishedAt: true },
    });

    if (!current) {
      throw new NotFoundException('Knowledge article not found');
    }

    const data = await this.normalizeArticleData(tenantId, dto, {
      requireTitle: false,
    });
    const nextStatus =
      (data.status as StaffKnowledgeArticleStatus | undefined) ??
      (current.status as StaffKnowledgeArticleStatus);
    const updated = await this.prisma.staffKnowledgeArticle.update({
      where: { id: current.id },
      data: {
        ...data,
        publishedAt:
          nextStatus === 'PUBLISHED' && !current.publishedAt
            ? new Date()
            : undefined,
      },
      include: articleInclude,
    });

    return this.toArticleResponse(updated);
  }

  private resolveFilters(
    query: StaffKnowledgeBaseQuery,
    canManageKnowledge: boolean,
  ): StaffKnowledgeBaseReport['filters'] {
    const status = this.resolveOne(
      query.status,
      ['all', ...articleStatuses] as const,
      canManageKnowledge ? 'all' : 'PUBLISHED',
    );

    return {
      status: canManageKnowledge ? status : 'PUBLISHED',
      roleScope: this.resolveOne(
        query.roleScope,
        ['all', ...roleScopes] as const,
        'all',
      ),
      category: this.normalizeOptionalString(query.category),
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    user: AuthenticatedUser,
    filters: StaffKnowledgeBaseReport['filters'],
    canManageKnowledge: boolean,
  ): Prisma.StaffKnowledgeArticleWhereInput {
    const where: Prisma.StaffKnowledgeArticleWhereInput = { tenantId };

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.roleScope !== 'all') {
      where.roleScope = filters.roleScope;
    }

    if (!canManageKnowledge) {
      where.status = 'PUBLISHED';
      where.roleScope = { in: this.visibleRoleScopes(user.role) };
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { summary: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
        { category: { contains: filters.search, mode: 'insensitive' } },
        { tags: { has: filters.search } },
      ];
    }

    return where;
  }

  private buildSummary(rows: StaffKnowledgeArticleResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.materialsCount += row.materialsCount;

        if (row.status === 'PUBLISHED') {
          summary.published += 1;
        } else if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        return summary;
      },
      { total: 0, published: 0, draft: 0, archived: 0, materialsCount: 0 },
    );
  }

  private async normalizeArticleData(
    tenantId: string,
    dto: StaffKnowledgeArticleDto,
    options: { requireTitle: boolean },
  ): Promise<Prisma.StaffKnowledgeArticleUncheckedUpdateInput> {
    const data: Prisma.StaffKnowledgeArticleUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Article title is required',
      ).slice(0, 180);
    }

    if (dto.summary !== undefined) {
      data.summary = this.normalizeOptionalString(dto.summary)?.slice(0, 500);
    }

    if (dto.content !== undefined) {
      data.content = this.normalizeOptionalString(dto.content)?.slice(0, 12000);
    }

    if (dto.category !== undefined || options.requireTitle) {
      data.category =
        this.normalizeOptionalString(dto.category)?.slice(0, 80) ??
        'Общие стандарты';
    }

    if (dto.roleScope !== undefined || options.requireTitle) {
      data.roleScope = this.resolveOne(dto.roleScope, roleScopes, 'ALL_STAFF');
    }

    if (dto.status !== undefined || options.requireTitle) {
      data.status = this.resolveOne(dto.status, articleStatuses, 'DRAFT');
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.tags !== undefined || options.requireTitle) {
      data.tags = this.normalizeTags(dto.tags);
    }

    if (dto.materials !== undefined || options.requireTitle) {
      data.materials = this.normalizeMaterials(dto.materials);
    }

    return data;
  }

  private normalizeMaterials(value: unknown): StaffKnowledgeMaterial[] {
    const rawMaterials = Array.isArray(value) ? value : [];
    const materials: StaffKnowledgeMaterial[] = [];

    rawMaterials.slice(0, 30).forEach((material, index) => {
      const record = this.asRecord(material);
      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        materialTypes,
        'TEXT',
      );
      const title = this.normalizeOptionalString(record.title);
      const url = this.normalizeOptionalString(record.url);
      const content = this.normalizeOptionalString(record.content);

      if (!title && !url && !content) {
        return;
      }

      if (!title) {
        throw new BadRequestException('Material title is required');
      }

      if (type === 'TEXT' && !content) {
        throw new BadRequestException('Text material content is required');
      }

      if (type !== 'TEXT' && !url) {
        throw new BadRequestException('Material URL is required');
      }

      if (url && !this.isAllowedUrl(url)) {
        throw new BadRequestException(
          'Material URL must start with http:// or https://',
        );
      }

      materials.push({
        id: this.normalizeOptionalString(record.id) ?? `material-${index + 1}`,
        title: title.slice(0, 160),
        type,
        url: url?.slice(0, 2000) ?? null,
        content: content?.slice(0, 6000) ?? null,
        note: this.normalizeOptionalString(record.note)?.slice(0, 500) ?? null,
        required: this.normalizeBoolean(record.required, false),
      });
    });

    return materials;
  }

  private normalizeTags(value: unknown) {
    const rawTags = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];

    return Array.from(
      new Set(
        rawTags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean)
          .map((tag) => tag.slice(0, 40)),
      ),
    ).slice(0, 20);
  }

  private toArticleResponse(
    row: StaffKnowledgeArticleRow,
  ): StaffKnowledgeArticleResponse {
    const materials = this.normalizeMaterials(row.materials);

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      category: row.category,
      roleScope: row.roleScope as StaffKnowledgeRoleScope,
      status: row.status as StaffKnowledgeArticleStatus,
      tags: row.tags,
      materials,
      materialsCount: materials.length,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
    };
  }

  private canManageKnowledge(user: AuthenticatedUser) {
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

  private visibleRoleScopes(role: UserRole): StaffKnowledgeRoleScope[] {
    const scopes: StaffKnowledgeRoleScope[] = ['ALL_STAFF'];

    if (role === UserRole.CLUB_ADMINISTRATOR) {
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
