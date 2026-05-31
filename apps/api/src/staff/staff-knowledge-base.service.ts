import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const articleStatuses = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
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
const relatedLinkTypes = [
  'REGULATION',
  'CHECKLIST',
  'TRAINING',
  'ONBOARDING',
  'DISCIPLINE',
  'TASK',
  'OTHER',
] as const;

export type StaffKnowledgeArticleStatus = (typeof articleStatuses)[number];
export type StaffKnowledgeRoleScope = (typeof roleScopes)[number];
export type StaffKnowledgeMaterialType = (typeof materialTypes)[number];

export type StaffKnowledgeBaseQuery = {
  status?: StaffKnowledgeArticleStatus | 'all';
  roleScope?: StaffKnowledgeRoleScope | 'all';
  folder?: string;
  category?: string;
  storeId?: string;
  search?: string;
  requiredReading?: 'all' | 'required' | 'optional';
};

export type StaffKnowledgeArticleDto = {
  title?: string;
  summary?: string | null;
  content?: string | null;
  folder?: string | null;
  category?: string | null;
  roleScope?: StaffKnowledgeRoleScope;
  status?: StaffKnowledgeArticleStatus;
  storeId?: string | null;
  templateKey?: string | null;
  requiresReading?: boolean | string | null;
  tags?: unknown;
  materials?: unknown;
  relatedLinks?: unknown;
  approvalNote?: string | null;
};

export type StaffKnowledgeReadReceiptDto = {
  note?: string | null;
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

export type StaffKnowledgeRelatedLink = {
  id: string;
  type: (typeof relatedLinkTypes)[number];
  title: string;
  url: string | null;
  note: string | null;
};

export type StaffKnowledgeBaseReport = {
  filters: {
    status: StaffKnowledgeArticleStatus | 'all';
    roleScope: StaffKnowledgeRoleScope | 'all';
    folder: string | null;
    category: string | null;
    storeId: string | null;
    search: string | null;
    requiredReading: 'all' | 'required' | 'optional';
  };
  summary: {
    total: number;
    published: number;
    draft: number;
    review: number;
    archived: number;
    requiredReading: number;
    requiredAudience: number;
    readReceipts: number;
    pendingReads: number;
    materialsCount: number;
  };
  canManageKnowledge: boolean;
  folders: string[];
  categories: string[];
  rows: StaffKnowledgeArticleResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffKnowledgeArticleResponse = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  folder: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  templateKey: string | null;
  requiresReading: boolean;
  tags: string[];
  materials: StaffKnowledgeMaterial[];
  relatedLinks: StaffKnowledgeRelatedLink[];
  materialsCount: number;
  version: number;
  reviewRequestedAt: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  approvedByUser: { id: string; email: string; fullName: string | null } | null;
  readingSummary: StaffKnowledgeReadingSummary;
  readReceipts: StaffKnowledgeReadReceiptResponse[];
  versions: StaffKnowledgeArticleVersionResponse[];
};

const articleInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  approvedByUser: { select: { id: true, email: true, fullName: true } },
  versions: {
    orderBy: { version: 'desc' },
    take: 5,
    include: {
      createdByUser: { select: { id: true, email: true, fullName: true } },
    },
  },
  readReceipts: {
    orderBy: { readAt: 'desc' },
    take: 20,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          storeAccesses: { select: { storeId: true } },
        },
      },
    },
  },
} satisfies Prisma.StaffKnowledgeArticleInclude;

type StaffKnowledgeArticleRow = Prisma.StaffKnowledgeArticleGetPayload<{
  include: typeof articleInclude;
}>;

type StaffKnowledgeArticleVersionRow =
  StaffKnowledgeArticleRow['versions'][number];

type StaffKnowledgeArticleSnapshotSource = {
  id: string;
  tenantId: string;
  version: number;
  title: string;
  summary: string | null;
  content: string | null;
  folder: string;
  category: string;
  roleScope: string;
  tags: string[];
  materials: Prisma.JsonValue | null;
  relatedLinks: Prisma.JsonValue | null;
};

export type StaffKnowledgeArticleVersionResponse = {
  id: string;
  version: number;
  title: string;
  summary: string | null;
  folder: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  tags: string[];
  materialsCount: number;
  relatedLinksCount: number;
  createdAt: string;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

type StaffKnowledgeReadUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  storeAccesses: Array<{ storeId: string }>;
};

type StaffKnowledgeReadReceiptRow =
  StaffKnowledgeArticleRow['readReceipts'][number];

export type StaffKnowledgeReadingSummary = {
  requiredCount: number;
  readCount: number;
  pendingCount: number;
  requiredByMe: boolean;
  readByMe: boolean;
  readAt: string | null;
};

export type StaffKnowledgeReadReceiptResponse = {
  id: string;
  userId: string;
  version: number;
  note: string | null;
  readAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
  };
};

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

    const [rows, stores, activeUsers, folders, categories] = await Promise.all([
      this.prisma.staffKnowledgeArticle.findMany({
        where,
        include: articleInclude,
        orderBy: [
          { status: 'asc' },
          { folder: 'asc' },
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
      this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          storeAccesses: { select: { storeId: true } },
        },
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
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
        select: { folder: true },
        distinct: ['folder'],
        orderBy: { folder: 'asc' },
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
    const responseRows = rows.map((row) =>
      this.toArticleResponse(row, user.id, activeUsers),
    );

    return {
      filters,
      summary: this.buildSummary(responseRows),
      canManageKnowledge,
      folders: folders.map((row) => row.folder),
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
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const article = await tx.staffKnowledgeArticle.create({
        data: {
          ...(data as Prisma.StaffKnowledgeArticleUncheckedCreateInput),
          tenantId,
          status,
          createdByUserId: user.id,
          reviewRequestedAt: status === 'REVIEW' ? now : null,
          approvedAt: status === 'PUBLISHED' ? now : null,
          approvedByUserId: status === 'PUBLISHED' ? user.id : null,
          publishedAt: status === 'PUBLISHED' ? now : null,
          version: status === 'PUBLISHED' ? 1 : 0,
        },
      });

      if (status === 'PUBLISHED') {
        await this.createArticleVersion(tx, article, user.id);
      }

      return tx.staffKnowledgeArticle.findUniqueOrThrow({
        where: { id: article.id },
        include: articleInclude,
      });
    });

    const activeUsers = await this.getActiveKnowledgeUsers(tenantId);

    return this.toArticleResponse(created, user.id, activeUsers);
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
    const now = new Date();
    const shouldCreateVersion = nextStatus === 'PUBLISHED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const article = await tx.staffKnowledgeArticle.update({
        where: { id: current.id },
        data: {
          ...data,
          reviewRequestedAt: nextStatus === 'REVIEW' ? now : undefined,
          approvedAt: nextStatus === 'PUBLISHED' ? now : undefined,
          approvedByUserId: nextStatus === 'PUBLISHED' ? user.id : undefined,
          publishedAt:
            nextStatus === 'PUBLISHED' && !current.publishedAt
              ? now
              : undefined,
          version: shouldCreateVersion ? { increment: 1 } : undefined,
        },
      });

      if (shouldCreateVersion) {
        await this.createArticleVersion(tx, article, user.id);
      }

      return tx.staffKnowledgeArticle.findUniqueOrThrow({
        where: { id: article.id },
        include: articleInclude,
      });
    });

    const activeUsers = await this.getActiveKnowledgeUsers(tenantId);

    return this.toArticleResponse(updated, user.id, activeUsers);
  }

  async markArticleRead(
    user: AuthenticatedUser,
    id: string,
    dto: StaffKnowledgeReadReceiptDto = {},
  ): Promise<StaffKnowledgeReadReceiptResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const article = await this.prisma.staffKnowledgeArticle.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        version: true,
        roleScope: true,
        storeId: true,
      },
    });

    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }

    if (article.status !== 'PUBLISHED' || article.version < 1) {
      throw new BadRequestException(
        'Only published articles can be marked read',
      );
    }

    const currentUser = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId, isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        storeAccesses: { select: { storeId: true } },
      },
    });

    if (
      !currentUser ||
      !this.userMatchesKnowledgeTarget(currentUser, article)
    ) {
      throw new BadRequestException('Article is not assigned to this user');
    }

    const note = this.normalizeOptionalString(dto.note)?.slice(0, 500) ?? null;
    const receipt = await this.prisma.staffKnowledgeArticleReadReceipt.upsert({
      where: {
        articleId_userId_version: {
          articleId: article.id,
          userId: user.id,
          version: article.version,
        },
      },
      create: {
        tenantId,
        articleId: article.id,
        userId: user.id,
        version: article.version,
        note,
      },
      update: {
        readAt: new Date(),
        note,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, role: true },
        },
      },
    });

    return this.toReadReceiptResponse(receipt);
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
      folder: this.normalizeOptionalString(query.folder),
      category: this.normalizeOptionalString(query.category),
      storeId: this.normalizeOptionalString(query.storeId),
      search: this.normalizeOptionalString(query.search),
      requiredReading: this.resolveOne(
        query.requiredReading,
        ['all', 'required', 'optional'] as const,
        'all',
      ),
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

    if (filters.folder) {
      where.folder = filters.folder;
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

    if (filters.requiredReading === 'required') {
      where.requiresReading = true;
    } else if (filters.requiredReading === 'optional') {
      where.requiresReading = false;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { summary: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
        { folder: { contains: filters.search, mode: 'insensitive' } },
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
        } else if (row.status === 'REVIEW') {
          summary.review += 1;
        } else if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        if (row.requiresReading) {
          summary.requiredReading += 1;
          summary.requiredAudience += row.readingSummary.requiredCount;
          summary.readReceipts += row.readingSummary.readCount;
          summary.pendingReads += row.readingSummary.pendingCount;
        }

        return summary;
      },
      {
        total: 0,
        published: 0,
        draft: 0,
        review: 0,
        archived: 0,
        requiredReading: 0,
        requiredAudience: 0,
        readReceipts: 0,
        pendingReads: 0,
        materialsCount: 0,
      },
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

    if (dto.folder !== undefined || options.requireTitle) {
      data.folder =
        this.normalizeOptionalString(dto.folder)?.slice(0, 80) ?? 'Общие';
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

    if (dto.templateKey !== undefined) {
      data.templateKey =
        this.normalizeOptionalString(dto.templateKey)?.slice(0, 80) ?? null;
    }

    if (dto.requiresReading !== undefined || options.requireTitle) {
      data.requiresReading = this.normalizeBoolean(dto.requiresReading, false);
    }

    if (dto.approvalNote !== undefined) {
      data.approvalNote =
        this.normalizeOptionalString(dto.approvalNote)?.slice(0, 1000) ?? null;
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

    if (dto.relatedLinks !== undefined || options.requireTitle) {
      data.relatedLinks = this.normalizeRelatedLinks(dto.relatedLinks);
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

  private normalizeRelatedLinks(value: unknown): StaffKnowledgeRelatedLink[] {
    const rawLinks = Array.isArray(value) ? value : [];
    const links: StaffKnowledgeRelatedLink[] = [];

    rawLinks.slice(0, 20).forEach((link, index) => {
      const record = this.asRecord(link);
      const title = this.normalizeOptionalString(record.title);
      const url = this.normalizeOptionalString(record.url);

      if (!title && !url) {
        return;
      }

      if (!title) {
        throw new BadRequestException('Related link title is required');
      }

      if (url && !this.isAllowedInternalOrExternalUrl(url)) {
        throw new BadRequestException(
          'Related link URL must be an internal path or start with http:// or https://',
        );
      }

      links.push({
        id: this.normalizeOptionalString(record.id) ?? `link-${index + 1}`,
        type: this.resolveOne(
          this.normalizeOptionalString(record.type),
          relatedLinkTypes,
          'OTHER',
        ),
        title: title.slice(0, 160),
        url: url?.slice(0, 2000) ?? null,
        note: this.normalizeOptionalString(record.note)?.slice(0, 500) ?? null,
      });
    });

    return links;
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
    currentUserId: string,
    activeUsers: StaffKnowledgeReadUser[],
  ): StaffKnowledgeArticleResponse {
    const materials = this.normalizeMaterials(row.materials);
    const relatedLinks = this.normalizeRelatedLinks(row.relatedLinks);
    const targetUsers =
      row.status === 'PUBLISHED' && row.requiresReading
        ? activeUsers.filter((candidate) =>
            this.userMatchesKnowledgeTarget(candidate, row),
          )
        : [];
    const currentVersionReceipts = row.readReceipts.filter(
      (receipt) => receipt.version === row.version,
    );
    const readUserIds = new Set(
      currentVersionReceipts.map((receipt) => receipt.userId),
    );
    const readByMe = currentVersionReceipts.find(
      (receipt) => receipt.userId === currentUserId,
    );
    const readCount = targetUsers.filter((candidate) =>
      readUserIds.has(candidate.id),
    ).length;
    const requiredByMe = targetUsers.some(
      (candidate) => candidate.id === currentUserId,
    );

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      folder: row.folder,
      category: row.category,
      roleScope: row.roleScope as StaffKnowledgeRoleScope,
      status: row.status as StaffKnowledgeArticleStatus,
      templateKey: row.templateKey,
      requiresReading: row.requiresReading,
      tags: row.tags,
      materials,
      relatedLinks,
      materialsCount: materials.length,
      version: row.version,
      reviewRequestedAt: row.reviewRequestedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvalNote: row.approvalNote,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
      approvedByUser: row.approvedByUser,
      readingSummary: {
        requiredCount: targetUsers.length,
        readCount,
        pendingCount: Math.max(targetUsers.length - readCount, 0),
        requiredByMe,
        readByMe: Boolean(readByMe),
        readAt: readByMe?.readAt.toISOString() ?? null,
      },
      readReceipts: currentVersionReceipts.map((receipt) =>
        this.toReadReceiptResponse(receipt),
      ),
      versions: row.versions.map((version) => this.toVersionResponse(version)),
    };
  }

  private toReadReceiptResponse(
    row:
      | StaffKnowledgeReadReceiptRow
      | {
          id: string;
          userId: string;
          version: number;
          note: string | null;
          readAt: Date;
          user: {
            id: string;
            email: string;
            fullName: string | null;
            role: UserRole;
          };
        },
  ): StaffKnowledgeReadReceiptResponse {
    return {
      id: row.id,
      userId: row.userId,
      version: row.version,
      note: row.note,
      readAt: row.readAt.toISOString(),
      user: {
        id: row.user.id,
        email: row.user.email,
        fullName: row.user.fullName,
        role: row.user.role,
      },
    };
  }

  private toVersionResponse(
    row: StaffKnowledgeArticleVersionRow,
  ): StaffKnowledgeArticleVersionResponse {
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      summary: row.summary,
      folder: row.folder,
      category: row.category,
      roleScope: row.roleScope as StaffKnowledgeRoleScope,
      tags: row.tags,
      materialsCount: this.normalizeMaterials(row.materials).length,
      relatedLinksCount: this.normalizeRelatedLinks(row.relatedLinks).length,
      createdAt: row.createdAt.toISOString(),
      createdByUser: row.createdByUser,
    };
  }

  private async createArticleVersion(
    tx: Prisma.TransactionClient,
    article: StaffKnowledgeArticleSnapshotSource,
    userId: string,
  ) {
    await tx.staffKnowledgeArticleVersion.create({
      data: {
        tenantId: article.tenantId,
        articleId: article.id,
        createdByUserId: userId,
        version: article.version,
        title: article.title,
        summary: article.summary,
        content: article.content,
        folder: article.folder,
        category: article.category,
        roleScope: article.roleScope,
        tags: article.tags,
        materials: article.materials ?? Prisma.JsonNull,
        relatedLinks: article.relatedLinks ?? Prisma.JsonNull,
      },
    });
  }

  private getActiveKnowledgeUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        storeAccesses: { select: { storeId: true } },
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
    });
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

  private userMatchesKnowledgeTarget(
    user: StaffKnowledgeReadUser,
    article: { roleScope: string; storeId: string | null },
  ) {
    if (
      !this.roleMatchesKnowledgeScope(
        user.role,
        article.roleScope as StaffKnowledgeRoleScope,
      )
    ) {
      return false;
    }

    if (!article.storeId) {
      return true;
    }

    if (user.storeAccesses.length === 0) {
      return true;
    }

    return user.storeAccesses.some(
      (access) => access.storeId === article.storeId,
    );
  }

  private roleMatchesKnowledgeScope(
    role: UserRole,
    scope: StaffKnowledgeRoleScope,
  ) {
    if (scope === 'ALL_STAFF') {
      return (
        [
          UserRole.OWNER,
          UserRole.ADMIN,
          UserRole.MANAGER,
          UserRole.CLUB_MANAGER,
          UserRole.STANDARDS_MANAGER,
          UserRole.SENIOR_ADMINISTRATOR,
          UserRole.CLUB_ADMINISTRATOR,
        ] as UserRole[]
      ).includes(role);
    }

    if (scope === 'MANAGER') {
      return (
        [
          UserRole.OWNER,
          UserRole.ADMIN,
          UserRole.MANAGER,
          UserRole.CLUB_MANAGER,
          UserRole.STANDARDS_MANAGER,
        ] as UserRole[]
      ).includes(role);
    }

    if (scope === 'CLUB_MANAGER') {
      return role === UserRole.CLUB_MANAGER;
    }

    if (scope === 'STANDARDS_MANAGER') {
      return role === UserRole.STANDARDS_MANAGER;
    }

    if (scope === 'SENIOR_ADMINISTRATOR') {
      return role === UserRole.SENIOR_ADMINISTRATOR;
    }

    return (
      [UserRole.SENIOR_ADMINISTRATOR, UserRole.CLUB_ADMINISTRATOR] as UserRole[]
    ).includes(role);
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

  private isAllowedInternalOrExternalUrl(value: string) {
    return value.startsWith('/') || this.isAllowedUrl(value);
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
