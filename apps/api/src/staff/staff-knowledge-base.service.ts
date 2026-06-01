import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const articleStatuses = [
  'DRAFT',
  'REVIEW',
  'RETURNED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
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
const RETURNED_ARTICLE_REVISION_SLA_DAYS = 2;
const DEFAULT_REVISION_SLA_ROLE_DAYS = {
  ALL_STAFF: 2,
  ADMINISTRATOR: 2,
  SENIOR_ADMINISTRATOR: 3,
  CLUB_MANAGER: 3,
  MANAGER: 4,
  STANDARDS_MANAGER: 4,
} as const;
const DEFAULT_REVISION_SLA_MATERIAL_EXTRA_DAYS = {
  TEXT: 0,
  FILE_LINK: 1,
  IMAGE: 1,
  VIDEO: 1,
  EXTERNAL_LINK: 0,
  OTHER: 0,
} as const;

export type StaffKnowledgeArticleStatus = (typeof articleStatuses)[number];
export type StaffKnowledgeRoleScope = (typeof roleScopes)[number];
export type StaffKnowledgeMaterialType = (typeof materialTypes)[number];

export type StaffKnowledgeRevisionSlaPolicy = {
  defaultDays: number;
  roleDays: Record<StaffKnowledgeRoleScope, number>;
  materialTypeExtraDays: Record<StaffKnowledgeMaterialType, number>;
};

const DEFAULT_REVISION_SLA_POLICY: StaffKnowledgeRevisionSlaPolicy = {
  defaultDays: RETURNED_ARTICLE_REVISION_SLA_DAYS,
  roleDays: { ...DEFAULT_REVISION_SLA_ROLE_DAYS },
  materialTypeExtraDays: { ...DEFAULT_REVISION_SLA_MATERIAL_EXTRA_DAYS },
};

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
  revisionSlaDays?: number | string | null;
  tags?: unknown;
  materials?: unknown;
  relatedLinks?: unknown;
  approvalNote?: string | null;
};

export type StaffKnowledgeReadReceiptDto = {
  note?: string | null;
};

export type StaffKnowledgeSettingsDto = {
  revisionSlaPolicy?: unknown;
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
    returned: number;
    archived: number;
    requiredReading: number;
    requiredAudience: number;
    readReceipts: number;
    pendingReads: number;
    materialsCount: number;
  };
  canManageKnowledge: boolean;
  canEditKnowledge: boolean;
  canReviewKnowledge: boolean;
  canPublishKnowledge: boolean;
  folders: string[];
  categories: string[];
  rows: StaffKnowledgeArticleResponse[];
  articleSuggestions: StaffKnowledgeArticleSuggestion[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  settings: StaffKnowledgeSettingsResponse;
};

export type StaffKnowledgeArticleSuggestion = {
  id: string;
  issueTitle: string;
  title: string;
  detail: string;
  occurrences: number;
  failedRuns: number;
  firstSeen: string;
  lastSeen: string;
  latestRunTitle: string;
  shiftKind: string;
  store: { id: string; name: string; isActive: boolean } | null;
  employee: { id: string; email: string; fullName: string | null } | null;
  href: string;
  draft: {
    title: string;
    summary: string;
    content: string;
    folder: string;
    category: string;
    roleScope: StaffKnowledgeRoleScope;
    templateKey: string;
    requiresReading: boolean;
    tags: string[];
    materials: StaffKnowledgeMaterial[];
    relatedLinks: StaffKnowledgeRelatedLink[];
    approvalNote: string;
  };
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
  returnedAt: string | null;
  revisionDueAt: string | null;
  revisionSlaDays: number | null;
  revisionSlaDaysEffective: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  approvedByUser: { id: string; email: string; fullName: string | null } | null;
  readingSummary: StaffKnowledgeReadingSummary;
  readReceipts: StaffKnowledgeReadReceiptResponse[];
  versions: StaffKnowledgeArticleVersionResponse[];
  workflowEvents: StaffKnowledgeWorkflowEventResponse[];
};

export type StaffKnowledgeWorkflowEventResponse = {
  id: string;
  type: 'CREATED' | 'REVIEW_REQUESTED' | 'RETURNED' | 'PUBLISHED' | 'ARCHIVED';
  title: string;
  detail: string | null;
  happenedAt: string;
  actor: { id: string; email: string; fullName: string | null } | null;
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

const knowledgeSettingsInclude = {
  updatedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffKnowledgeSettingsInclude;

const knowledgeSuggestionChecklistSelect = {
  id: true,
  title: true,
  shiftKind: true,
  status: true,
  scheduledAt: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  failedItems: true,
  sectionsSnapshot: true,
  answers: true,
  store: { select: { id: true, name: true, isActive: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffChecklistRunSelect;

type StaffKnowledgeArticleRow = Prisma.StaffKnowledgeArticleGetPayload<{
  include: typeof articleInclude;
}>;

type StaffKnowledgeSettingsRow = Prisma.StaffKnowledgeSettingsGetPayload<{
  include: typeof knowledgeSettingsInclude;
}>;

type StaffKnowledgeSuggestionChecklistRow = Prisma.StaffChecklistRunGetPayload<{
  select: typeof knowledgeSuggestionChecklistSelect;
}>;

type StaffKnowledgeArticleVersionRow =
  StaffKnowledgeArticleRow['versions'][number];

type StaffKnowledgeFailedIssue = {
  title: string;
  date: Date;
  run: StaffKnowledgeSuggestionChecklistRow;
};

type StaffKnowledgeSuggestionDraft = StaffKnowledgeFailedIssue & {
  occurrences: number;
  runIds: Set<string>;
};

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
  revisionSlaDays: number | null;
};

type ReturnedKnowledgeArticleWorkflowSource = {
  id: string;
  title: string;
  folder: string;
  category: string;
  roleScope: string;
  materials: Prisma.JsonValue | null;
  storeId: string | null;
  status: string;
  approvalNote: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  returnedAt: Date | null;
  revisionDueAt: Date | null;
  revisionSlaDays: number | null;
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
  revisionSlaDays: number | null;
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

export type StaffKnowledgeSettingsResponse = {
  revisionSlaPolicy: StaffKnowledgeRevisionSlaPolicy;
  updatedAt: string | null;
  updatedByUser: { id: string; email: string; fullName: string | null } | null;
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
    const canEditKnowledge = this.canEditKnowledge(user);
    const canReviewKnowledge = this.canReviewKnowledge(user);
    const canPublishKnowledge = this.canPublishKnowledge(user);
    const canManageKnowledge =
      canEditKnowledge || canReviewKnowledge || canPublishKnowledge;
    const filters = this.resolveFilters(query, canManageKnowledge);
    const where = this.buildWhere(tenantId, user, filters, canManageKnowledge);

    const [rows, stores, activeUsers, folders, categories, settings] =
      await Promise.all([
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
        this.getKnowledgeSettingsRow(tenantId),
      ]);
    const settingsResponse = this.toKnowledgeSettingsResponse(settings);
    const responseRows = rows.map((row) =>
      this.toArticleResponse(
        row,
        user.id,
        activeUsers,
        settingsResponse.revisionSlaPolicy,
      ),
    );
    const articleSuggestions = canEditKnowledge
      ? await this.buildArticleSuggestions(tenantId, filters.storeId)
      : [];

    return {
      filters,
      summary: this.buildSummary(responseRows),
      canManageKnowledge,
      canEditKnowledge,
      canReviewKnowledge,
      canPublishKnowledge,
      folders: folders.map((row) => row.folder),
      categories: categories.map((row) => row.category),
      rows: responseRows,
      articleSuggestions,
      stores,
      settings: settingsResponse,
    };
  }

  async getSettings(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const settings = await this.getKnowledgeSettingsRow(tenantId);

    return this.toKnowledgeSettingsResponse(settings);
  }

  async updateSettings(
    user: AuthenticatedUser,
    dto: StaffKnowledgeSettingsDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageKnowledge(user)) {
      throw new BadRequestException('Knowledge base settings are not allowed');
    }

    const revisionSlaPolicy = this.normalizeRevisionSlaPolicy(
      dto.revisionSlaPolicy,
    );
    const settings = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.staffKnowledgeSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          revisionSlaPolicy,
          updatedByUserId: user.id,
        },
        update: {
          revisionSlaPolicy,
          updatedByUserId: user.id,
        },
        include: {
          updatedByUser: {
            select: { id: true, email: true, fullName: true },
          },
        },
      });

      const returnedArticles = await tx.staffKnowledgeArticle.findMany({
        where: {
          tenantId,
          status: 'RETURNED',
          revisionSlaDays: null,
          returnedAt: { not: null },
        },
        select: {
          id: true,
          returnedAt: true,
          roleScope: true,
          materials: true,
          revisionSlaDays: true,
        },
      });

      for (const article of returnedArticles) {
        await tx.staffKnowledgeArticle.update({
          where: { id: article.id },
          data: {
            revisionDueAt: article.returnedAt
              ? this.addDays(
                  article.returnedAt,
                  this.resolveArticleRevisionSlaDays(
                    {
                      revisionSlaDays: article.revisionSlaDays,
                      roleScope: article.roleScope,
                      materials: article.materials,
                    },
                    revisionSlaPolicy,
                  ),
                )
              : undefined,
          },
          select: { id: true },
        });
      }

      return upserted;
    });

    return this.toKnowledgeSettingsResponse(settings);
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
    this.assertKnowledgeWriteAllowed(user, status, { isCreate: true });
    const now = new Date();
    const revisionSlaPolicy = await this.getRevisionSlaPolicy(tenantId);
    const revisionSlaDays = this.resolveArticleRevisionSlaDays(
      {
        roleScope:
          typeof data.roleScope === 'string' ? data.roleScope : 'ALL_STAFF',
        materials:
          data.materials === undefined
            ? null
            : (data.materials as Prisma.JsonValue),
        revisionSlaDays:
          typeof data.revisionSlaDays === 'number' ||
          data.revisionSlaDays === null
            ? data.revisionSlaDays
            : null,
      },
      revisionSlaPolicy,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const article = await tx.staffKnowledgeArticle.create({
        data: {
          ...(data as Prisma.StaffKnowledgeArticleUncheckedCreateInput),
          tenantId,
          status,
          createdByUserId: user.id,
          reviewRequestedAt: status === 'REVIEW' ? now : null,
          approvedAt: status === 'PUBLISHED' ? now : null,
          approvedByUserId:
            status === 'PUBLISHED' || status === 'RETURNED' ? user.id : null,
          returnedAt: status === 'RETURNED' ? now : null,
          revisionDueAt:
            status === 'RETURNED' ? this.addDays(now, revisionSlaDays) : null,
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

    return this.toArticleResponse(
      created,
      user.id,
      activeUsers,
      revisionSlaPolicy,
    );
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
      select: {
        id: true,
        status: true,
        publishedAt: true,
        returnedAt: true,
        roleScope: true,
        materials: true,
        revisionSlaDays: true,
      },
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
    this.assertKnowledgeWriteAllowed(user, nextStatus);
    const now = new Date();
    const shouldCreateVersion = nextStatus === 'PUBLISHED';
    const revisionSlaPolicy = await this.getRevisionSlaPolicy(tenantId);
    const revisionSlaDays = this.resolveArticleRevisionSlaDays(
      {
        roleScope:
          typeof data.roleScope === 'string'
            ? data.roleScope
            : current.roleScope,
        materials:
          data.materials === undefined
            ? current.materials
            : (data.materials as Prisma.JsonValue),
        revisionSlaDays:
          typeof data.revisionSlaDays === 'number' ||
          data.revisionSlaDays === null
            ? data.revisionSlaDays
            : current.revisionSlaDays,
      },
      revisionSlaPolicy,
    );
    const returnSlaStart =
      nextStatus === 'RETURNED'
        ? current.status === 'RETURNED' && current.returnedAt
          ? current.returnedAt
          : now
        : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const article = await tx.staffKnowledgeArticle.update({
        where: { id: current.id },
        data: {
          ...data,
          reviewRequestedAt: nextStatus === 'REVIEW' ? now : undefined,
          approvedAt: nextStatus === 'PUBLISHED' ? now : undefined,
          returnedAt:
            nextStatus === 'RETURNED'
              ? returnSlaStart
              : current.status === 'RETURNED'
                ? null
                : undefined,
          revisionDueAt:
            nextStatus === 'RETURNED' && returnSlaStart
              ? this.addDays(returnSlaStart, revisionSlaDays)
              : current.status === 'RETURNED'
                ? null
                : undefined,
          approvedByUserId:
            nextStatus === 'PUBLISHED' ||
            nextStatus === 'RETURNED' ||
            nextStatus === 'ARCHIVED'
              ? user.id
              : undefined,
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

      if (nextStatus === 'RETURNED') {
        await this.upsertReturnedArticleNotification(
          tx,
          tenantId,
          article,
          user,
        );
        await this.upsertReturnedArticleRevisionTask(
          tx,
          tenantId,
          article,
          user,
        );
      } else if (current.status === 'RETURNED') {
        await this.resolveReturnedArticleNotification(tx, tenantId, article.id);
      }

      return tx.staffKnowledgeArticle.findUniqueOrThrow({
        where: { id: article.id },
        include: articleInclude,
      });
    });

    const activeUsers = await this.getActiveKnowledgeUsers(tenantId);

    return this.toArticleResponse(
      updated,
      user.id,
      activeUsers,
      revisionSlaPolicy,
    );
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
        } else if (row.status === 'RETURNED') {
          summary.returned += 1;
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
        returned: 0,
        archived: 0,
        requiredReading: 0,
        requiredAudience: 0,
        readReceipts: 0,
        pendingReads: 0,
        materialsCount: 0,
      },
    );
  }

  private async buildArticleSuggestions(
    tenantId: string,
    storeId: string | null,
  ): Promise<StaffKnowledgeArticleSuggestion[]> {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const [runs, existingArticles] = await Promise.all([
      this.prisma.staffChecklistRun.findMany({
        where: {
          tenantId,
          failedItems: { gt: 0 },
          status: { not: 'CANCELED' },
          createdAt: { gte: since },
          ...(storeId ? { storeId } : {}),
        },
        select: knowledgeSuggestionChecklistSelect,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: 400,
      }),
      this.prisma.staffKnowledgeArticle.findMany({
        where: { tenantId, status: { not: 'ARCHIVED' } },
        select: { title: true, tags: true },
        take: 500,
      }),
    ]);

    const existingIndex = existingArticles.map((article) =>
      [article.title, ...article.tags].join(' ').toLowerCase(),
    );
    const issuesByKey = new Map<string, StaffKnowledgeSuggestionDraft>();

    runs.forEach((run) => {
      this.extractFailedIssues(run).forEach((issue) => {
        if (this.hasExistingKnowledgeArticle(issue.title, existingIndex)) {
          return;
        }

        const key = [
          run.store?.id ?? 'network',
          run.shiftKind,
          this.normalizeIssueKey(issue.title),
        ].join('::');
        const existing = issuesByKey.get(key);

        if (!existing) {
          issuesByKey.set(key, {
            ...issue,
            occurrences: 1,
            runIds: new Set([run.id]),
          });
          return;
        }

        existing.occurrences += 1;
        existing.runIds.add(run.id);

        if (issue.date < existing.date) {
          existing.date = issue.date;
        }

        if (issue.date > this.activityDate(existing.run)) {
          existing.run = run;
        }
      });
    });

    return Array.from(issuesByKey.values())
      .filter((issue) => issue.occurrences > 1)
      .map((issue) => this.toArticleSuggestion(issue))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 8);
  }

  private toArticleSuggestion(
    issue: StaffKnowledgeSuggestionDraft,
  ): StaffKnowledgeArticleSuggestion {
    const category = this.suggestKnowledgeCategory(issue.title);
    const href = `/staff/checklists?search=${encodeURIComponent(issue.title)}`;
    const scopeParts = [
      issue.run.store?.name ?? 'вся сеть',
      this.shiftKindLabel(issue.run.shiftKind),
      issue.run.assignedToUser?.fullName ??
        issue.run.assignedToUser?.email ??
        'исполнитель не назначен',
    ];
    const tags = Array.from(
      new Set([
        'чек-лист',
        'повторное нарушение',
        category.toLowerCase(),
        this.shiftKindLabel(issue.run.shiftKind).toLowerCase(),
      ]),
    );

    return {
      id: `knowledge-suggestion-${this.stableHash(
        [
          issue.run.store?.id ?? 'network',
          issue.run.shiftKind,
          issue.title,
        ].join('::'),
      )}`,
      issueTitle: issue.title,
      title: `Разобрать стандарт: ${issue.title}`,
      detail: [
        `${issue.occurrences} повторов в ${issue.runIds.size} выполнениях`,
        scopeParts.join(' · '),
      ].join(' · '),
      occurrences: issue.occurrences,
      failedRuns: issue.runIds.size,
      firstSeen: issue.date.toISOString(),
      lastSeen: this.activityDate(issue.run).toISOString(),
      latestRunTitle: issue.run.title,
      shiftKind: issue.run.shiftKind,
      store: issue.run.store,
      employee: issue.run.assignedToUser,
      href,
      draft: {
        title: `Стандарт: ${issue.title}`,
        summary: `Материал создан из повторяющегося провала чек-листа: ${issue.occurrences} повторов за последние 90 дней.`,
        content: [
          `Проблема: ${issue.title}.`,
          `Где повторяется: ${scopeParts.join(' · ')}.`,
          'Что должен сделать сотрудник:',
          '1. Проверить требование до отметки пункта чек-листа.',
          '2. Зафиксировать результат понятным комментарием или доказательством, если оно требуется.',
          '3. Если выполнить стандарт нельзя, сразу создать задачу или написать управляющему в командный чат.',
          'Контроль: управляющий проверяет следующие выполнения чек-листа и возвращает результат, если причина не устранена.',
        ].join('\n\n'),
        folder: 'Разборы нарушений',
        category,
        roleScope: 'ADMINISTRATOR',
        templateKey: `checklist-issue-${this.stableHash(issue.title)}`,
        requiresReading: true,
        tags,
        materials: [
          {
            id: 'material-checklist-context',
            title: 'Контекст повторения',
            type: 'TEXT',
            url: null,
            content: `Провал найден в чек-листах ${issue.runIds.size} раз(а). Последний чек-лист: ${issue.run.title}.`,
            note: null,
            required: false,
          },
        ],
        relatedLinks: [
          {
            id: 'link-checklist-failures',
            type: 'CHECKLIST',
            title: 'Проваленные чек-листы по этому пункту',
            url: href,
            note: 'Откройте список выполнений и проверьте последние причины провала.',
          },
        ],
        approvalNote:
          'Черновик создан из повторяющихся провалов чек-листа. Перед публикацией проверьте формулировки и добавьте локальные правила клуба.',
      },
    };
  }

  private extractFailedIssues(
    run: StaffKnowledgeSuggestionChecklistRow,
  ): StaffKnowledgeFailedIssue[] {
    const itemTitles = this.mapChecklistItemTitles(run.sectionsSnapshot);
    const answers = Array.isArray(run.answers) ? run.answers : [];
    const date = this.activityDate(run);

    return answers
      .map((answer) => {
        const record = this.asRecord(answer);

        if (record.status !== 'FAILED') {
          return null;
        }

        const sectionId = this.normalizeOptionalString(record.sectionId) ?? '';
        const itemId = this.normalizeOptionalString(record.itemId) ?? '';
        const title =
          itemTitles.get(`${sectionId}::${itemId}`) ??
          this.normalizeOptionalString(record.note) ??
          'Пункт чек-листа';

        return { title, date, run } satisfies StaffKnowledgeFailedIssue;
      })
      .filter((issue): issue is StaffKnowledgeFailedIssue => Boolean(issue));
  }

  private mapChecklistItemTitles(value: unknown) {
    const map = new Map<string, string>();
    const sections = Array.isArray(value) ? value : [];

    sections.forEach((section) => {
      const sectionRecord = this.asRecord(section);
      const sectionTitle = this.normalizeOptionalString(sectionRecord.title);
      const sectionId = this.normalizeOptionalString(sectionRecord.id) ?? '';
      const items = Array.isArray(sectionRecord.items)
        ? sectionRecord.items
        : [];

      items.forEach((item) => {
        const itemRecord = this.asRecord(item);
        const itemId = this.normalizeOptionalString(itemRecord.id) ?? '';
        const itemTitle =
          this.normalizeOptionalString(itemRecord.title) ?? 'Пункт чек-листа';
        map.set(
          `${sectionId}::${itemId}`,
          sectionTitle ? `${sectionTitle}: ${itemTitle}` : itemTitle,
        );
      });
    });

    return map;
  }

  private activityDate(run: StaffKnowledgeSuggestionChecklistRow) {
    return (
      run.reviewedAt ?? run.submittedAt ?? run.scheduledAt ?? run.createdAt
    );
  }

  private hasExistingKnowledgeArticle(issueTitle: string, existing: string[]) {
    const issue = this.normalizeIssueKey(issueTitle);

    if (issue.length < 8) {
      return false;
    }

    return existing.some((candidate) => {
      const normalized = this.normalizeIssueKey(candidate);
      if (normalized.length < 8) {
        return false;
      }

      return normalized.includes(issue) || issue.includes(normalized);
    });
  }

  private normalizeIssueKey(value: string) {
    return value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim();
  }

  private suggestKnowledgeCategory(issueTitle: string) {
    const value = issueTitle.toLowerCase();

    if (/касс|инкас|налич|оплат|чек|деньг/.test(value)) {
      return 'Касса';
    }

    if (/бар|товар|витрин|напит|склад|остат/.test(value)) {
      return 'Бар';
    }

    if (/чист|зал|мусор|санит|уборк/.test(value)) {
      return 'Чистота';
    }

    if (/пк|комп|мест|тех|оборуд|монитор|мыш|клав/.test(value)) {
      return 'ПК-зона';
    }

    if (/гост|сервис|конфликт|брон/.test(value)) {
      return 'Сервис';
    }

    return 'Операционные стандарты';
  }

  private shiftKindLabel(value: string) {
    const labels: Record<string, string> = {
      OPENING: 'Открытие',
      CLOSING: 'Закрытие',
      CASH: 'Касса',
      BAR: 'Бар',
      PC_ZONE: 'ПК-зона',
      CLEANLINESS: 'Чистота',
      INCIDENT: 'Инцидент',
      INVENTORY: 'Инвентаризация',
      CUSTOM: 'Произвольная смена',
    };

    return labels[value] ?? value;
  }

  private stableHash(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
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

    if (dto.revisionSlaDays !== undefined) {
      data.revisionSlaDays = this.normalizeRevisionSlaDays(dto.revisionSlaDays);
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

  private normalizeRevisionSlaDays(value: unknown) {
    if (value === null || value === '') {
      return null;
    }

    const numberValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value.trim(), 10)
          : Number.NaN;

    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException('Revision SLA days must be a number');
    }

    return this.clampRevisionSlaDays(numberValue, 1, 14);
  }

  private normalizeRevisionSlaPolicy(
    value: unknown,
  ): StaffKnowledgeRevisionSlaPolicy {
    const record = this.asRecord(value);
    const roleDaysRecord = this.asRecord(record.roleDays);
    const materialTypeExtraRecord = this.asRecord(record.materialTypeExtraDays);
    const defaultDays = this.normalizeSlaPolicyNumber(
      record.defaultDays,
      DEFAULT_REVISION_SLA_POLICY.defaultDays,
      1,
      14,
    );

    return {
      defaultDays,
      roleDays: Object.fromEntries(
        roleScopes.map((roleScope) => [
          roleScope,
          this.normalizeSlaPolicyNumber(
            roleDaysRecord[roleScope],
            DEFAULT_REVISION_SLA_POLICY.roleDays[roleScope],
            1,
            14,
          ),
        ]),
      ) as Record<StaffKnowledgeRoleScope, number>,
      materialTypeExtraDays: Object.fromEntries(
        materialTypes.map((materialType) => [
          materialType,
          this.normalizeSlaPolicyNumber(
            materialTypeExtraRecord[materialType],
            DEFAULT_REVISION_SLA_POLICY.materialTypeExtraDays[materialType],
            0,
            7,
          ),
        ]),
      ) as Record<StaffKnowledgeMaterialType, number>,
    };
  }

  private normalizeSlaPolicyNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const numberValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value.trim(), 10)
          : Number.NaN;

    if (!Number.isFinite(numberValue)) {
      return fallback;
    }

    return this.clampRevisionSlaDays(numberValue, min, max);
  }

  private clampRevisionSlaDays(value: number, min: number, max: number) {
    return Math.min(Math.max(Math.round(value), min), max);
  }

  private resolveArticleRevisionSlaDays(
    article: {
      revisionSlaDays: number | null;
      roleScope: string;
      materials: Prisma.JsonValue | null;
    },
    policy: StaffKnowledgeRevisionSlaPolicy = DEFAULT_REVISION_SLA_POLICY,
  ) {
    if (article.revisionSlaDays) {
      return article.revisionSlaDays;
    }

    const materials = this.normalizeMaterials(article.materials);
    const materialExtraDays = materials.reduce((maxExtraDays, material) => {
      if (!material.required) {
        return maxExtraDays;
      }

      return Math.max(
        maxExtraDays,
        policy.materialTypeExtraDays[material.type] ?? 0,
      );
    }, 0);
    const roleDays =
      policy.roleDays[article.roleScope as StaffKnowledgeRoleScope] ??
      policy.defaultDays;

    return this.clampRevisionSlaDays(roleDays + materialExtraDays, 1, 14);
  }

  private resolveReturnedArticleSlaDays(article: {
    revisionSlaDays: number | null;
    roleScope: string;
    materials: Prisma.JsonValue | null;
    returnedAt: Date | null;
    revisionDueAt: Date | null;
  }) {
    if (article.returnedAt && article.revisionDueAt) {
      const diffDays =
        (article.revisionDueAt.getTime() - article.returnedAt.getTime()) /
        (24 * 60 * 60 * 1000);

      return this.clampRevisionSlaDays(diffDays, 1, 14);
    }

    return this.resolveArticleRevisionSlaDays(article);
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
    revisionSlaPolicy: StaffKnowledgeRevisionSlaPolicy,
  ): StaffKnowledgeArticleResponse {
    const materials = this.normalizeMaterials(row.materials);
    const relatedLinks = this.normalizeRelatedLinks(row.relatedLinks);
    const revisionSlaDaysEffective = this.resolveArticleRevisionSlaDays(
      {
        revisionSlaDays: row.revisionSlaDays,
        roleScope: row.roleScope,
        materials: row.materials,
      },
      revisionSlaPolicy,
    );
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
      returnedAt: row.returnedAt?.toISOString() ?? null,
      revisionDueAt: row.revisionDueAt?.toISOString() ?? null,
      revisionSlaDays: row.revisionSlaDays,
      revisionSlaDaysEffective,
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
      workflowEvents: this.toWorkflowEvents(row),
    };
  }

  private toWorkflowEvents(
    row: StaffKnowledgeArticleRow,
  ): StaffKnowledgeWorkflowEventResponse[] {
    const events: StaffKnowledgeWorkflowEventResponse[] = [
      {
        id: `created:${row.id}`,
        type: 'CREATED',
        title: 'Создан черновик',
        detail: row.summary,
        happenedAt: row.createdAt.toISOString(),
        actor: row.createdByUser,
      },
    ];

    if (row.reviewRequestedAt) {
      events.push({
        id: `review:${row.id}`,
        type: 'REVIEW_REQUESTED',
        title: 'Отправлено на согласование',
        detail: row.approvalNote,
        happenedAt: row.reviewRequestedAt.toISOString(),
        actor: row.createdByUser,
      });
    }

    if (row.status === 'RETURNED') {
      const detail = [
        row.approvalNote,
        row.revisionDueAt
          ? `Срок реакции: ${this.formatSlaDate(row.revisionDueAt)}`
          : null,
      ]
        .filter(Boolean)
        .join('\n');
      events.push({
        id: `returned:${row.id}`,
        type: 'RETURNED',
        title: 'Возвращено на доработку',
        detail: detail || null,
        happenedAt: (row.returnedAt ?? row.updatedAt).toISOString(),
        actor: row.approvedByUser,
      });
    }

    row.versions.forEach((version) => {
      events.push({
        id: `published:${row.id}:${version.version}`,
        type: 'PUBLISHED',
        title: `Опубликована версия ${version.version}`,
        detail: version.summary,
        happenedAt: version.createdAt.toISOString(),
        actor: version.createdByUser,
      });
    });

    if (row.status === 'ARCHIVED') {
      events.push({
        id: `archived:${row.id}`,
        type: 'ARCHIVED',
        title: 'Материал архивирован',
        detail: row.approvalNote,
        happenedAt: row.updatedAt.toISOString(),
        actor: row.approvedByUser,
      });
    }

    return events.sort(
      (left, right) =>
        new Date(right.happenedAt).getTime() -
        new Date(left.happenedAt).getTime(),
    );
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
      revisionSlaDays: row.revisionSlaDays,
      createdAt: row.createdAt.toISOString(),
      createdByUser: row.createdByUser,
    };
  }

  private getKnowledgeSettingsRow(tenantId: string) {
    return this.prisma.staffKnowledgeSettings.findUnique({
      where: { tenantId },
      include: knowledgeSettingsInclude,
    });
  }

  private async getRevisionSlaPolicy(tenantId: string) {
    const settings = await this.getKnowledgeSettingsRow(tenantId);

    return this.toKnowledgeSettingsResponse(settings).revisionSlaPolicy;
  }

  private toKnowledgeSettingsResponse(
    row: StaffKnowledgeSettingsRow | null,
  ): StaffKnowledgeSettingsResponse {
    return {
      revisionSlaPolicy: this.normalizeRevisionSlaPolicy(
        row?.revisionSlaPolicy,
      ),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedByUser: row?.updatedByUser ?? null,
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
        revisionSlaDays: article.revisionSlaDays,
      },
    });
  }

  private async upsertReturnedArticleRevisionTask(
    tx: Prisma.TransactionClient,
    tenantId: string,
    article: ReturnedKnowledgeArticleWorkflowSource,
    reviewer: AuthenticatedUser,
  ) {
    if (!article.createdByUserId) {
      return;
    }

    const dueAt =
      article.revisionDueAt ??
      this.addDays(
        article.returnedAt ?? new Date(),
        this.resolveArticleRevisionSlaDays(article),
      );
    const title = `Доработать материал базы знаний: ${article.title}`.slice(
      0,
      240,
    );
    const actionHref = `/staff/knowledge-base?status=RETURNED&search=${encodeURIComponent(article.title)}`;
    const description = [
      'Материал возвращен на доработку из базы знаний.',
      `Раздел: ${article.folder} / ${article.category}`,
      article.approvalNote
        ? `Комментарий согласования: ${article.approvalNote}`
        : null,
      article.revisionDueAt
        ? `SLA реакции: до ${this.formatSlaDate(article.revisionDueAt)}`
        : null,
      `Открыть материал: ${actionHref}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
    const labels = {
      source: 'KNOWLEDGE_BASE',
      workflow: 'KNOWLEDGE_BASE_APPROVAL',
      workflowStep: 'RETURNED_ARTICLE_REVISION',
      articleId: article.id,
      articleTitle: article.title,
      returnedAt: article.returnedAt?.toISOString() ?? null,
      revisionDueAt: article.revisionDueAt?.toISOString() ?? null,
      autoCreated: true,
    };
    const existing = await tx.staffTask.findFirst({
      where: {
        tenantId,
        status: { notIn: ['DONE', 'CANCELED'] },
        AND: [
          {
            labels: {
              path: ['workflowStep'],
              equals: 'RETURNED_ARTICLE_REVISION',
            },
          },
          {
            labels: {
              path: ['articleId'],
              equals: article.id,
            },
          },
        ],
      },
      select: { id: true },
    });

    const task = existing
      ? await tx.staffTask.update({
          where: { id: existing.id },
          data: {
            storeId: article.storeId,
            assignedToUserId: article.createdByUserId,
            title,
            description,
            type: 'LONG_TERM',
            priority: 'NORMAL',
            dueAt,
            labels,
          },
          select: { id: true },
        })
      : await tx.staffTask.create({
          data: {
            tenantId,
            storeId: article.storeId,
            createdByUserId: reviewer.id,
            assignedToUserId: article.createdByUserId,
            title,
            description,
            type: 'LONG_TERM',
            status: 'OPEN',
            priority: 'NORMAL',
            dueAt,
            labels,
          },
          select: { id: true },
        });

    await tx.staffTaskAuditEvent.create({
      data: {
        tenantId,
        taskId: task.id,
        actorUserId: reviewer.id,
        action: existing ? 'UPDATED' : 'CREATED',
        message: existing
          ? 'Knowledge base revision task updated'
          : 'Knowledge base revision task created',
        metadata: {
          source: 'KNOWLEDGE_BASE',
          workflowStep: 'RETURNED_ARTICLE_REVISION',
          articleId: article.id,
          articleTitle: article.title,
          authorUserId: article.createdByUserId,
          reviewerUserId: reviewer.id,
          dueAt: dueAt.toISOString(),
          autoCreated: true,
        },
      },
    });

    if (reviewer.id !== article.createdByUserId) {
      await tx.staffTaskObserver.upsert({
        where: {
          taskId_userId: {
            taskId: task.id,
            userId: reviewer.id,
          },
        },
        create: {
          tenantId,
          taskId: task.id,
          userId: reviewer.id,
        },
        update: {},
      });
    }
  }

  private async upsertReturnedArticleNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    article: ReturnedKnowledgeArticleWorkflowSource,
    reviewer: AuthenticatedUser,
  ) {
    const dedupeKey = `knowledge-base:${article.id}:returned`;
    const reviewerLabel = reviewer.fullName ?? reviewer.email;
    const slaDays = this.resolveReturnedArticleSlaDays(article);
    const severity =
      article.revisionDueAt && article.revisionDueAt < new Date()
        ? 'CRITICAL'
        : 'WARNING';
    const message = [
      reviewerLabel ? `Проверил: ${reviewerLabel}` : null,
      article.revisionDueAt
        ? `Срок реакции: ${this.formatSlaDate(article.revisionDueAt)}`
        : null,
      article.approvalNote
        ? `Комментарий: ${article.approvalNote}`
        : 'Нужно доработать материал и снова отправить на согласование.',
    ]
      .filter(Boolean)
      .join('\n');

    await tx.staffNotification.upsert({
      where: {
        tenantId_dedupeKey: {
          tenantId,
          dedupeKey,
        },
      },
      create: {
        tenantId,
        storeId: article.storeId,
        targetUserId: article.createdByUserId,
        sourceType: 'KNOWLEDGE_BASE',
        sourceId: article.id,
        severity,
        status: 'OPEN',
        title: `Материал базы знаний возвращен: ${article.title}`.slice(0, 240),
        message,
        actionLabel: 'Открыть материал',
        actionHref: `/staff/knowledge-base?status=RETURNED&search=${encodeURIComponent(article.title)}`,
        dedupeKey,
        metadata: {
          status: article.status,
          approvalNote: article.approvalNote,
          authorUserId: article.createdByUserId,
          reviewerUserId: article.approvedByUserId,
          returnedAt: article.returnedAt?.toISOString() ?? null,
          revisionDueAt: article.revisionDueAt?.toISOString() ?? null,
          slaDays,
        },
      },
      update: {
        storeId: article.storeId,
        targetUserId: article.createdByUserId,
        sourceType: 'KNOWLEDGE_BASE',
        sourceId: article.id,
        severity,
        status: 'OPEN',
        title: `Материал базы знаний возвращен: ${article.title}`.slice(0, 240),
        message,
        actionLabel: 'Открыть материал',
        actionHref: `/staff/knowledge-base?status=RETURNED&search=${encodeURIComponent(article.title)}`,
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        resolvedAt: null,
        resolvedByUserId: null,
        metadata: {
          status: article.status,
          approvalNote: article.approvalNote,
          authorUserId: article.createdByUserId,
          reviewerUserId: article.approvedByUserId,
          returnedAt: article.returnedAt?.toISOString() ?? null,
          revisionDueAt: article.revisionDueAt?.toISOString() ?? null,
          slaDays,
        },
      },
    });
  }

  private async resolveReturnedArticleNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    articleId: string,
  ) {
    await tx.staffNotification.updateMany({
      where: {
        tenantId,
        dedupeKey: `knowledge-base:${articleId}:returned`,
        status: { not: 'RESOLVED' },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        message:
          'Материал больше не находится в статусе возврата на доработку.',
      },
    });
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private formatSlaDate(date: Date) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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

  private assertKnowledgeWriteAllowed(
    user: AuthenticatedUser,
    status: StaffKnowledgeArticleStatus,
    options: { isCreate?: boolean } = {},
  ) {
    if (options.isCreate && !this.canEditKnowledge(user)) {
      throw new BadRequestException('Knowledge base editing is not allowed');
    }

    if (status === 'PUBLISHED' || status === 'ARCHIVED') {
      if (!this.canPublishKnowledge(user)) {
        throw new BadRequestException(
          'Knowledge base publication is not allowed',
        );
      }
      return;
    }

    if (status === 'RETURNED') {
      if (!this.canReviewKnowledge(user)) {
        throw new BadRequestException(
          'Knowledge base review workflow is not allowed',
        );
      }
      return;
    }

    if (status === 'REVIEW') {
      if (!this.canEditKnowledge(user) && !this.canReviewKnowledge(user)) {
        throw new BadRequestException(
          'Knowledge base review workflow is not allowed',
        );
      }
      return;
    }

    if (!this.canEditKnowledge(user) && !this.canReviewKnowledge(user)) {
      throw new BadRequestException('Knowledge base editing is not allowed');
    }
  }

  private canManageKnowledge(user: AuthenticatedUser) {
    return (
      this.canEditKnowledge(user) ||
      this.canReviewKnowledge(user) ||
      this.canPublishKnowledge(user)
    );
  }

  private canEditKnowledge(user: AuthenticatedUser) {
    return this.hasKnowledgeCapability(user, 'edit_staff_knowledge');
  }

  private canReviewKnowledge(user: AuthenticatedUser) {
    return this.hasKnowledgeCapability(user, 'review_staff_knowledge');
  }

  private canPublishKnowledge(user: AuthenticatedUser) {
    return this.hasKnowledgeCapability(user, 'publish_staff_knowledge');
  }

  private hasKnowledgeCapability(
    user: AuthenticatedUser,
    capability:
      | 'edit_staff_knowledge'
      | 'review_staff_knowledge'
      | 'publish_staff_knowledge',
  ) {
    if (hasCapability(user, capability)) {
      return true;
    }

    if (user.customRoleId) {
      return false;
    }

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
