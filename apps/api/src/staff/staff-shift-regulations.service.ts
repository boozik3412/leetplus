import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const regulationStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
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
const attachmentTypes = [
  'DOCUMENT',
  'IMAGE',
  'VIDEO',
  'FILE_LINK',
  'EXTERNAL_LINK',
  'OTHER',
] as const;

export type StaffShiftRegulationStatus = (typeof regulationStatuses)[number];
export type StaffShiftKind = (typeof shiftKinds)[number];
export type StaffShiftRoleScope = (typeof roleScopes)[number];
export type StaffShiftItemValueType = (typeof itemValueTypes)[number];
export type StaffShiftRegulationAttachmentType =
  (typeof attachmentTypes)[number];

export type StaffShiftRegulationsQuery = {
  status?: StaffShiftRegulationStatus | 'all';
  shiftKind?: StaffShiftKind | 'all';
  storeId?: string;
  search?: string;
};

export type StaffShiftRegulationDto = {
  title?: string;
  description?: string | null;
  shiftKind?: StaffShiftKind;
  status?: StaffShiftRegulationStatus;
  roleScope?: StaffShiftRoleScope;
  storeId?: string | null;
  effectiveFrom?: string | null;
  sections?: unknown;
  attachments?: unknown;
  requiresAssessmentRetake?: boolean;
  assessmentId?: string | null;
};

export type StaffShiftRegulationAcknowledgementDto = {
  comment?: string | null;
};

export type StaffShiftRegulationSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffShiftRegulationItem[];
};

export type StaffShiftRegulationItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffShiftItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffShiftRegulationAttachment = {
  id: string;
  title: string;
  type: StaffShiftRegulationAttachmentType;
  url: string;
  note: string | null;
  required: boolean;
};

export type StaffShiftRegulationReport = {
  filters: {
    status: StaffShiftRegulationStatus | 'all';
    shiftKind: StaffShiftKind | 'all';
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    published: number;
    archived: number;
    requiredEvidenceItems: number;
    requiredAcknowledgements: number;
    acknowledged: number;
    pendingAcknowledgements: number;
    retakeRequired: number;
  };
  rows: StaffShiftRegulationResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  assessments: StaffShiftRegulationAssessmentOption[];
};

export type StaffShiftRegulationAssessmentOption = {
  id: string;
  title: string;
  assessmentKind: string;
  roleScope: string;
  store: { id: string; name: string; isActive: boolean } | null;
};

export type StaffShiftRegulationAcknowledgementResponse = {
  id: string;
  userId: string;
  version: number;
  comment: string | null;
  acknowledgedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
  };
};

export type StaffShiftRegulationAcknowledgementSummary = {
  requiredCount: number;
  acknowledgedCount: number;
  pendingCount: number;
  requiredByMe: boolean;
  acknowledgedByMe: boolean;
  acknowledgedAt: string | null;
};

export type StaffShiftRegulationVersionResponse = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  shiftKind: StaffShiftKind;
  roleScope: StaffShiftRoleScope;
  attachmentsCount: number;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
  requiresAssessmentRetake: boolean;
  assessmentId: string | null;
  assessmentTitle: string | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
  createdAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffShiftRegulationResponse = {
  id: string;
  title: string;
  description: string | null;
  shiftKind: StaffShiftKind;
  status: StaffShiftRegulationStatus;
  roleScope: StaffShiftRoleScope;
  version: number;
  sections: StaffShiftRegulationSection[];
  attachments: StaffShiftRegulationAttachment[];
  attachmentsCount: number;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
  requiresAssessmentRetake: boolean;
  assessmentId: string | null;
  assessment: StaffShiftRegulationAssessmentOption | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  acknowledgementSummary: StaffShiftRegulationAcknowledgementSummary;
  acknowledgements: StaffShiftRegulationAcknowledgementResponse[];
  versions: StaffShiftRegulationVersionResponse[];
};

const regulationInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  assessment: {
    select: {
      id: true,
      title: true,
      assessmentKind: true,
      roleScope: true,
      store: { select: { id: true, name: true, isActive: true } },
    },
  },
  versions: {
    include: {
      store: { select: { id: true, name: true, isActive: true } },
      createdByUser: { select: { id: true, email: true, fullName: true } },
    },
    orderBy: { version: 'desc' },
    take: 20,
  },
  acknowledgements: {
    include: {
      user: { select: { id: true, email: true, fullName: true, role: true } },
    },
    orderBy: { acknowledgedAt: 'desc' },
  },
} satisfies Prisma.StaffShiftRegulationInclude;

type StaffShiftRegulationRow = Prisma.StaffShiftRegulationGetPayload<{
  include: typeof regulationInclude;
}>;

const acknowledgementUserInclude = {
  storeAccesses: { select: { storeId: true } },
} satisfies Prisma.UserInclude;

type AcknowledgementUserRow = Prisma.UserGetPayload<{
  include: typeof acknowledgementUserInclude;
}>;

type AcknowledgementRow = Prisma.StaffShiftRegulationAcknowledgementGetPayload<{
  include: {
    user: {
      select: { id: true; email: true; fullName: true; role: true };
    };
  };
}>;

@Injectable()
export class StaffShiftRegulationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getRegulations(
    user: AuthenticatedUser,
    query: StaffShiftRegulationsQuery = {},
  ): Promise<StaffShiftRegulationReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);

    const [rows, stores, activeUsers, assessments] = await Promise.all([
      this.prisma.staffShiftRegulation.findMany({
        where,
        include: regulationInclude,
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
        include: acknowledgementUserInclude,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
      }),
      this.prisma.staffAssessment.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          assessmentKind: true,
          roleScope: true,
          store: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ assessmentKind: 'asc' }, { title: 'asc' }],
      }),
    ]);
    const responseRows = rows.map((row) =>
      this.toRegulationResponse(row, user.id, activeUsers),
    );

    return {
      filters,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      assessments,
    };
  }

  async createRegulation(
    user: AuthenticatedUser,
    dto: StaffShiftRegulationDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeRegulationData(tenantId, dto, {
      requireTitle: true,
    });
    const status = data.status ?? 'DRAFT';

    const regulation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffShiftRegulation.create({
        data: {
          ...data,
          tenantId,
          status,
          createdByUserId: user.id,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: regulationInclude,
      });

      if (status === 'PUBLISHED') {
        await this.createVersionSnapshot(tx, created, user.id);
      }

      return tx.staffShiftRegulation.findUniqueOrThrow({
        where: { id: created.id },
        include: regulationInclude,
      });
    });

    const activeUsers = await this.getAcknowledgementUsers(tenantId);

    return this.toRegulationResponse(regulation, user.id, activeUsers);
  }

  async updateRegulation(
    user: AuthenticatedUser,
    id: string,
    dto: StaffShiftRegulationDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffShiftRegulation.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, version: true, publishedAt: true },
    });

    if (!current) {
      throw new NotFoundException('Shift regulation not found');
    }

    const data = await this.normalizeRegulationData(tenantId, dto, {
      requireTitle: false,
    });
    const status = data.status ?? current.status;
    const shouldPublish = data.status === 'PUBLISHED';
    const shouldArchive = data.status === 'ARCHIVED';
    const shouldCreateNewPublishedVersion =
      shouldPublish &&
      (current.status !== 'DRAFT' || Boolean(current.publishedAt));

    const regulation = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffShiftRegulation.update({
        where: { id: current.id },
        data: {
          ...data,
          version: shouldCreateNewPublishedVersion
            ? current.version + 1
            : undefined,
          publishedAt: shouldPublish ? new Date() : undefined,
          archivedAt: shouldArchive ? new Date() : undefined,
          status,
        },
        include: regulationInclude,
      });

      if (shouldPublish) {
        await this.createVersionSnapshot(tx, updated, user.id);
      }

      return tx.staffShiftRegulation.findUniqueOrThrow({
        where: { id: current.id },
        include: regulationInclude,
      });
    });

    const activeUsers = await this.getAcknowledgementUsers(tenantId);

    return this.toRegulationResponse(regulation, user.id, activeUsers);
  }

  async acknowledgeRegulation(
    user: AuthenticatedUser,
    id: string,
    dto: StaffShiftRegulationAcknowledgementDto = {},
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [regulation, actor] = await Promise.all([
      this.prisma.staffShiftRegulation.findFirst({
        where: { id, tenantId },
        include: regulationInclude,
      }),
      this.prisma.user.findFirst({
        where: { id: user.id, tenantId, isActive: true },
        include: acknowledgementUserInclude,
      }),
    ]);

    if (!regulation) {
      throw new NotFoundException('Shift regulation not found');
    }

    if (!actor) {
      throw new BadRequestException('Active user is required');
    }

    if (regulation.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'Only published regulations can be acknowledged',
      );
    }

    if (!this.userMatchesRegulationTarget(actor, regulation)) {
      throw new BadRequestException(
        'Regulation is not assigned to this employee role or club',
      );
    }

    const acknowledgement =
      await this.prisma.staffShiftRegulationAcknowledgement.upsert({
        where: {
          regulationId_userId_version: {
            regulationId: regulation.id,
            userId: user.id,
            version: regulation.version,
          },
        },
        create: {
          tenantId,
          regulationId: regulation.id,
          userId: user.id,
          version: regulation.version,
          comment: this.normalizeOptionalString(dto.comment),
        },
        update: {
          comment: this.normalizeOptionalString(dto.comment),
          acknowledgedAt: new Date(),
        },
        include: {
          user: {
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
      });

    return this.toAcknowledgementResponse(acknowledgement);
  }

  private resolveFilters(
    query: StaffShiftRegulationsQuery,
  ): StaffShiftRegulationReport['filters'] {
    return {
      status: this.resolveOne(
        query.status,
        ['all', ...regulationStatuses] as const,
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
    filters: StaffShiftRegulationReport['filters'],
  ): Prisma.StaffShiftRegulationWhereInput {
    const where: Prisma.StaffShiftRegulationWhereInput = { tenantId };

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
      ];
    }

    return where;
  }

  private buildSummary(rows: StaffShiftRegulationResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary.requiredEvidenceItems += row.requiredEvidenceItems;
        summary.requiredAcknowledgements +=
          row.acknowledgementSummary.requiredCount;
        summary.acknowledged += row.acknowledgementSummary.acknowledgedCount;
        summary.pendingAcknowledgements +=
          row.acknowledgementSummary.pendingCount;
        if (row.requiresAssessmentRetake) {
          summary.retakeRequired += 1;
        }

        if (row.status === 'DRAFT') {
          summary.draft += 1;
        } else if (row.status === 'PUBLISHED') {
          summary.published += 1;
        } else if (row.status === 'ARCHIVED') {
          summary.archived += 1;
        }

        return summary;
      },
      {
        total: 0,
        draft: 0,
        published: 0,
        archived: 0,
        requiredEvidenceItems: 0,
        requiredAcknowledgements: 0,
        acknowledged: 0,
        pendingAcknowledgements: 0,
        retakeRequired: 0,
      },
    );
  }

  private async normalizeRegulationData(
    tenantId: string,
    dto: StaffShiftRegulationDto,
    options: { requireTitle: boolean },
  ) {
    const data: Prisma.StaffShiftRegulationUncheckedCreateInput = {
      tenantId,
      title: '',
      sections: this.defaultSections(),
    };

    if (!options.requireTitle) {
      delete (data as Partial<typeof data>).tenantId;
      delete (data as Partial<typeof data>).title;
      delete (data as Partial<typeof data>).sections;
    }

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Regulation title is required',
      );
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description);
    }

    if (dto.shiftKind !== undefined) {
      data.shiftKind = this.resolveOne(dto.shiftKind, shiftKinds, 'OPENING');
    }

    if (dto.status !== undefined) {
      data.status = this.resolveOne(dto.status, regulationStatuses, 'DRAFT');
    }

    if (dto.roleScope !== undefined) {
      data.roleScope = this.resolveOne(
        dto.roleScope,
        roleScopes,
        'ADMINISTRATOR',
      );
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.effectiveFrom !== undefined) {
      data.effectiveFrom = this.normalizeDateTime(dto.effectiveFrom);
    }

    if (dto.sections !== undefined || options.requireTitle) {
      data.sections = this.normalizeSections(dto.sections);
    }

    if (dto.attachments !== undefined || options.requireTitle) {
      data.attachments = this.normalizeAttachments(dto.attachments);
    }

    const requiresAssessmentRetake =
      dto.requiresAssessmentRetake !== undefined
        ? this.normalizeBoolean(dto.requiresAssessmentRetake, false)
        : undefined;

    if (requiresAssessmentRetake !== undefined) {
      data.requiresAssessmentRetake = requiresAssessmentRetake;
    }

    if (requiresAssessmentRetake === false) {
      data.assessmentId = null;
    }

    if (requiresAssessmentRetake === true || dto.assessmentId !== undefined) {
      const assessmentId = this.normalizeOptionalString(dto.assessmentId);

      if (requiresAssessmentRetake && !assessmentId) {
        throw new BadRequestException(
          'Active assessment is required for regulation retake',
        );
      }

      data.assessmentId = assessmentId
        ? await this.resolveAssessmentId(tenantId, assessmentId)
        : null;
    }

    return data;
  }

  private toRegulationResponse(
    row: StaffShiftRegulationRow,
    currentUserId: string,
    activeUsers: AcknowledgementUserRow[],
  ): StaffShiftRegulationResponse {
    const sections = this.normalizeSections(row.sections);
    const attachments = this.normalizeAttachments(row.attachments);
    const items = sections.flatMap((section) => section.items);
    const targetUsers = activeUsers.filter((candidate) =>
      this.userMatchesRegulationTarget(candidate, row),
    );
    const currentVersionAcknowledgements = row.acknowledgements.filter(
      (acknowledgement) => acknowledgement.version === row.version,
    );
    const acknowledgedUserIds = new Set(
      currentVersionAcknowledgements.map(
        (acknowledgement) => acknowledgement.userId,
      ),
    );
    const acknowledgementByMe = currentVersionAcknowledgements.find(
      (acknowledgement) => acknowledgement.userId === currentUserId,
    );
    const acknowledgedCount = targetUsers.filter((candidate) =>
      acknowledgedUserIds.has(candidate.id),
    ).length;
    const requiredByMe =
      row.status === 'PUBLISHED' &&
      targetUsers.some((candidate) => candidate.id === currentUserId);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      shiftKind: row.shiftKind as StaffShiftKind,
      status: row.status as StaffShiftRegulationStatus,
      roleScope: row.roleScope as StaffShiftRoleScope,
      version: row.version,
      sections,
      attachments,
      attachmentsCount: attachments.length,
      sectionsCount: sections.length,
      itemsCount: items.length,
      requiredEvidenceItems: items.filter((item) => item.evidenceRequired)
        .length,
      requiresAssessmentRetake: row.requiresAssessmentRetake,
      assessmentId: row.assessmentId,
      assessment: row.assessment,
      effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
      acknowledgementSummary: {
        requiredCount: row.status === 'PUBLISHED' ? targetUsers.length : 0,
        acknowledgedCount: row.status === 'PUBLISHED' ? acknowledgedCount : 0,
        pendingCount:
          row.status === 'PUBLISHED'
            ? Math.max(targetUsers.length - acknowledgedCount, 0)
            : 0,
        requiredByMe,
        acknowledgedByMe: Boolean(acknowledgementByMe),
        acknowledgedAt:
          acknowledgementByMe?.acknowledgedAt.toISOString() ?? null,
      },
      acknowledgements: currentVersionAcknowledgements.map((acknowledgement) =>
        this.toAcknowledgementResponse(acknowledgement),
      ),
      versions: row.versions.map((version) => this.toVersionResponse(version)),
    };
  }

  private async createVersionSnapshot(
    tx: Prisma.TransactionClient,
    row: StaffShiftRegulationRow,
    createdByUserId: string,
  ) {
    await tx.staffShiftRegulationVersion.upsert({
      where: {
        regulationId_version: {
          regulationId: row.id,
          version: row.version,
        },
      },
      create: {
        tenantId: row.tenantId,
        regulationId: row.id,
        storeId: row.storeId,
        createdByUserId,
        assessmentId: row.assessmentId,
        version: row.version,
        title: row.title,
        description: row.description,
        shiftKind: row.shiftKind,
        roleScope: row.roleScope,
        sections: row.sections as Prisma.InputJsonValue,
        attachments: this.normalizeAttachments(row.attachments),
        requiresAssessmentRetake: row.requiresAssessmentRetake,
        assessmentTitle: row.assessment?.title ?? null,
        effectiveFrom: row.effectiveFrom,
        publishedAt: row.publishedAt,
      },
      update: {},
    });
  }

  private toVersionResponse(
    version: StaffShiftRegulationRow['versions'][number],
  ): StaffShiftRegulationVersionResponse {
    const sections = this.normalizeSections(version.sections);
    const attachments = this.normalizeAttachments(version.attachments);
    const items = sections.flatMap((section) => section.items);

    return {
      id: version.id,
      version: version.version,
      title: version.title,
      description: version.description,
      shiftKind: version.shiftKind as StaffShiftKind,
      roleScope: version.roleScope as StaffShiftRoleScope,
      attachmentsCount: attachments.length,
      sectionsCount: sections.length,
      itemsCount: items.length,
      requiredEvidenceItems: items.filter((item) => item.evidenceRequired)
        .length,
      requiresAssessmentRetake: version.requiresAssessmentRetake,
      assessmentId: version.assessmentId,
      assessmentTitle: version.assessmentTitle,
      effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      store: version.store,
      createdByUser: version.createdByUser,
    };
  }

  private toAcknowledgementResponse(
    acknowledgement: AcknowledgementRow,
  ): StaffShiftRegulationAcknowledgementResponse {
    return {
      id: acknowledgement.id,
      userId: acknowledgement.userId,
      version: acknowledgement.version,
      comment: acknowledgement.comment,
      acknowledgedAt: acknowledgement.acknowledgedAt.toISOString(),
      user: acknowledgement.user,
    };
  }

  private getAcknowledgementUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      include: acknowledgementUserInclude,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
    });
  }

  private userMatchesRegulationTarget(
    user: AcknowledgementUserRow,
    regulation: { roleScope: string; storeId: string | null },
  ) {
    if (
      !this.roleMatchesRegulationScope(
        user.role,
        regulation.roleScope as StaffShiftRoleScope,
      )
    ) {
      return false;
    }

    if (!regulation.storeId) {
      return true;
    }

    if (user.storeAccesses.length === 0) {
      return true;
    }

    return user.storeAccesses.some(
      (access) => access.storeId === regulation.storeId,
    );
  }

  private roleMatchesRegulationScope(
    role: UserRole,
    scope: StaffShiftRoleScope,
  ) {
    if (scope === 'ALL_STAFF') {
      return (
        [
          UserRole.MANAGER,
          UserRole.CLUB_MANAGER,
          UserRole.STANDARDS_MANAGER,
          UserRole.SENIOR_ADMINISTRATOR,
          UserRole.CLUB_ADMINISTRATOR,
          UserRole.TRAINEE,
        ] as UserRole[]
      ).includes(role);
    }

    if (scope === 'MANAGER') {
      return (
        [
          UserRole.MANAGER,
          UserRole.CLUB_MANAGER,
          UserRole.STANDARDS_MANAGER,
        ] as UserRole[]
      ).includes(role);
    }

    if (scope === 'SENIOR_ADMINISTRATOR') {
      return role === UserRole.SENIOR_ADMINISTRATOR;
    }

    return (
      [
        UserRole.SENIOR_ADMINISTRATOR,
        UserRole.CLUB_ADMINISTRATOR,
        UserRole.TRAINEE,
      ] as UserRole[]
    ).includes(role);
  }

  private normalizeAttachments(
    value: unknown,
  ): StaffShiftRegulationAttachment[] {
    const rawAttachments = Array.isArray(value) ? value : [];
    const attachments: StaffShiftRegulationAttachment[] = [];

    rawAttachments.slice(0, 20).forEach((attachment, index) => {
      const record = this.asRecord(attachment);
      const title = this.normalizeOptionalString(record.title);
      const url = this.normalizeOptionalString(record.url);

      if (!title && !url) {
        return;
      }

      if (!title || !url) {
        throw new BadRequestException('Attachment title and URL are required');
      }

      if (!this.isAllowedAttachmentUrl(url)) {
        throw new BadRequestException(
          'Attachment URL must start with http:// or https://',
        );
      }

      attachments.push({
        id:
          this.normalizeOptionalString(record.id) ?? `attachment-${index + 1}`,
        title: title.slice(0, 160),
        type: this.resolveOne(
          this.normalizeOptionalString(record.type),
          attachmentTypes,
          'DOCUMENT',
        ),
        url: url.slice(0, 2000),
        note: this.normalizeOptionalString(record.note)?.slice(0, 500) ?? null,
        required: this.normalizeBoolean(record.required, false),
      });
    });

    return attachments;
  }

  private isAllowedAttachmentUrl(value: string) {
    return /^https?:\/\//i.test(value);
  }

  private normalizeSections(value: unknown): StaffShiftRegulationSection[] {
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
      throw new BadRequestException('At least one section is required');
    }

    if (sections.every((section) => section.items.length === 0)) {
      throw new BadRequestException('At least one regulation item is required');
    }

    return sections;
  }

  private normalizeItem(
    value: unknown,
    index: number,
  ): StaffShiftRegulationItem {
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
    };
  }

  private defaultSections(): StaffShiftRegulationSection[] {
    return [
      {
        id: 'opening-readiness',
        title: 'Подготовка смены',
        description: 'Базовые действия администратора перед началом смены.',
        items: [
          {
            id: 'check-cash',
            title: 'Проверить кассу и стартовый остаток',
            instruction:
              'Сверить наличные, терминал и состояние кассовой зоны.',
            valueType: 'CHECKBOX',
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: 'check-hall',
            title: 'Проверить зал и рабочие места',
            instruction: 'Осмотреть ПК, периферию, чистоту столов и проходов.',
            valueType: 'CHECKBOX',
            required: true,
            evidenceRequired: false,
            score: 2,
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

  private normalizeDateTime(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid effective date');
    }

    return date;
  }

  private async resolveAssessmentId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const assessment = await this.prisma.staffAssessment.findFirst({
      where: { id, tenantId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!assessment) {
      throw new BadRequestException('Active assessment not found');
    }

    return assessment.id;
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
