import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const checklistStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'ON_REVIEW',
  'ACCEPTED',
  'RETURNED',
  'CANCELED',
] as const;
const checklistFilterStatuses = [
  'all',
  'OVERDUE',
  ...checklistStatuses,
] as const;
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
const answerStatuses = ['PASS', 'FAILED', 'NOT_APPLICABLE'] as const;
const itemValueTypes = [
  'CHECKBOX',
  'TEXT',
  'NUMBER',
  'PHOTO_LINK',
  'FILE_LINK',
  'SELECT',
  'TIMESTAMP',
] as const;

export type StaffChecklistStatus = (typeof checklistStatuses)[number];
export type StaffChecklistFilterStatus =
  (typeof checklistFilterStatuses)[number];
export type StaffChecklistShiftKind = (typeof shiftKinds)[number];
export type StaffChecklistAnswerStatus = (typeof answerStatuses)[number];
export type StaffChecklistItemValueType = (typeof itemValueTypes)[number];

export type StaffChecklistsQuery = {
  status?: StaffChecklistFilterStatus;
  shiftKind?: StaffChecklistShiftKind | 'all';
  regulationId?: string;
  storeId?: string;
  assignedToUserId?: string;
  search?: string;
};

export type StaffChecklistCreateDto = {
  regulationId?: string;
  templateId?: string;
  title?: string | null;
  storeId?: string | null;
  shiftId?: string | null;
  assignedToUserId?: string | null;
  scheduledAt?: string | null;
};

export type StaffChecklistUpdateDto = {
  status?: StaffChecklistStatus;
  answers?: unknown;
  reviewComment?: string | null;
  createFollowUpTasks?: boolean;
};

export type StaffChecklistSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffChecklistItem[];
};

export type StaffChecklistItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffChecklistItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffChecklistAnswer = {
  sectionId: string;
  itemId: string;
  value: string | null;
  status: StaffChecklistAnswerStatus | null;
  note: string | null;
  evidenceUrl: string | null;
  completedAt: string | null;
};

export type StaffChecklistBlockingIssue = {
  sectionId: string;
  itemId: string;
  title: string;
  issue: 'REQUIRED_ANSWER_MISSING' | 'REQUIRED_EVIDENCE_MISSING';
};

export type StaffChecklistReport = {
  filters: {
    status: StaffChecklistFilterStatus;
    shiftKind: StaffChecklistShiftKind | 'all';
    regulationId: string | null;
    storeId: string | null;
    assignedToUserId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    onReview: number;
    accepted: number;
    returned: number;
    canceled: number;
    overdue: number;
    failedItems: number;
    blockingIssues: number;
  };
  rows: StaffChecklistRunResponse[];
  publishedRegulations: StaffChecklistRegulationOption[];
  checklistTemplates: StaffChecklistTemplateOption[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; email: string; fullName: string | null }>;
};

export type StaffChecklistRegulationOption = {
  id: string;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  version: number;
  store: { id: string; name: string; isActive: boolean } | null;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
};

export type StaffChecklistTemplateOption = {
  id: string;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  status: string;
  version: number;
  store: { id: string; name: string; isActive: boolean } | null;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
};

export type StaffChecklistRunResponse = {
  id: string;
  regulationId: string | null;
  templateId: string | null;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  status: StaffChecklistStatus;
  regulationVersion: number;
  templateVersion: number | null;
  scheduledAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  sections: StaffChecklistSection[];
  answers: StaffChecklistAnswer[];
  scoreTotal: number;
  scoreEarned: number;
  requiredItemsTotal: number;
  requiredItemsDone: number;
  evidenceTotal: number;
  evidenceDone: number;
  failedItems: number;
  blockingIssues: StaffChecklistBlockingIssue[];
  reviewComment: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  regulation: {
    id: string;
    title: string;
    status: string;
    version: number;
  } | null;
  template: {
    id: string;
    title: string;
    status: string;
    version: number;
  } | null;
  store: { id: string; name: string; isActive: boolean } | null;
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  assignedToUser: { id: string; email: string; fullName: string | null } | null;
  reviewedByUser: { id: string; email: string; fullName: string | null } | null;
};

const checklistRunInclude = {
  regulation: {
    select: { id: true, title: true, status: true, version: true },
  },
  template: {
    select: { id: true, title: true, status: true, version: true },
  },
  store: { select: { id: true, name: true, isActive: true } },
  shift: {
    select: {
      id: true,
      externalShiftId: true,
      startedAt: true,
      stoppedAt: true,
      store: { select: { id: true, name: true } },
    },
  },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
  reviewedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffChecklistRunInclude;

type StaffChecklistRunRow = Prisma.StaffChecklistRunGetPayload<{
  include: typeof checklistRunInclude;
}>;

type Metrics = {
  scoreTotal: number;
  scoreEarned: number;
  requiredItemsTotal: number;
  requiredItemsDone: number;
  evidenceTotal: number;
  evidenceDone: number;
  failedItems: number;
  blockingIssues: StaffChecklistBlockingIssue[];
};

type ChecklistSource = {
  kind: 'REGULATION' | 'TEMPLATE';
  id: string;
  title: string;
  shiftKind: string;
  roleScope: string;
  version: number;
  storeId: string | null;
  sections: Prisma.JsonValue;
};

@Injectable()
export class StaffChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getChecklists(
    user: AuthenticatedUser,
    query: StaffChecklistsQuery = {},
  ): Promise<StaffChecklistReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const baseWhere = this.buildWhere(tenantId, filters, false);
    const rowsWhere = this.buildWhere(tenantId, filters, true);

    const [rows, summaryRows, regulations, templates, stores, users] =
      await Promise.all([
        this.prisma.staffChecklistRun.findMany({
          where: rowsWhere,
          include: checklistRunInclude,
          orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
          take: 200,
        }),
        this.prisma.staffChecklistRun.findMany({
          where: baseWhere,
          select: {
            status: true,
            scheduledAt: true,
            failedItems: true,
            blockingIssues: true,
          },
          take: 2000,
        }),
        this.prisma.staffShiftRegulation.findMany({
          where: { tenantId, status: 'PUBLISHED' },
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
        this.prisma.staffChecklistTemplate.findMany({
          where: { tenantId, status: 'ACTIVE' },
          select: {
            id: true,
            title: true,
            shiftKind: true,
            roleScope: true,
            status: true,
            version: true,
            sections: true,
            store: { select: { id: true, name: true, isActive: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
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

    return {
      filters,
      summary: this.buildSummary(summaryRows),
      rows: rows.map((row) => this.toRunResponse(row)),
      publishedRegulations: regulations.map((row) =>
        this.toRegulationOption(row),
      ),
      checklistTemplates: templates.map((row) => this.toTemplateOption(row)),
      stores,
      users,
    };
  }

  async createChecklist(user: AuthenticatedUser, dto: StaffChecklistCreateDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const regulationId = this.normalizeOptionalString(dto.regulationId);
    const templateId = this.normalizeOptionalString(dto.templateId);

    if (!regulationId && !templateId) {
      throw new BadRequestException(
        'Regulation or checklist template is required',
      );
    }

    if (regulationId && templateId) {
      throw new BadRequestException(
        'Choose either a regulation or a checklist template',
      );
    }

    const source = regulationId
      ? await this.resolveRegulationSource(tenantId, regulationId)
      : await this.resolveTemplateSource(tenantId, templateId!);

    const requestedStoreId = this.normalizeOptionalString(dto.storeId);

    if (
      source.storeId &&
      requestedStoreId &&
      requestedStoreId !== source.storeId
    ) {
      throw new BadRequestException('Checklist store must match source');
    }

    const storeId = await this.resolveStoreId(
      tenantId,
      source.storeId ?? requestedStoreId,
    );
    const shiftId = await this.resolveShiftId(tenantId, dto.shiftId);
    const assignedToUserId = await this.resolveUserId(
      tenantId,
      dto.assignedToUserId,
    );
    const sections = this.normalizeSections(source.sections);
    const answers = this.defaultAnswers(sections);
    const metrics = this.calculateMetrics(sections, answers);
    const title =
      this.normalizeOptionalString(dto.title) ?? `${source.title}: выполнение`;

    const run = await this.prisma.staffChecklistRun.create({
      data: {
        tenantId,
        regulationId: source.kind === 'REGULATION' ? source.id : null,
        templateId: source.kind === 'TEMPLATE' ? source.id : null,
        storeId,
        shiftId,
        createdByUserId: user.id,
        assignedToUserId,
        title,
        shiftKind: source.shiftKind,
        roleScope: source.roleScope,
        regulationVersion: source.kind === 'REGULATION' ? source.version : 0,
        templateVersion: source.kind === 'TEMPLATE' ? source.version : null,
        scheduledAt: this.normalizeDateTime(dto.scheduledAt, 'scheduled date'),
        sectionsSnapshot: sections,
        answers,
        scoreTotal: metrics.scoreTotal,
        scoreEarned: metrics.scoreEarned,
        requiredItemsTotal: metrics.requiredItemsTotal,
        requiredItemsDone: metrics.requiredItemsDone,
        evidenceTotal: metrics.evidenceTotal,
        evidenceDone: metrics.evidenceDone,
        failedItems: metrics.failedItems,
        blockingIssues: metrics.blockingIssues,
      },
      include: checklistRunInclude,
    });

    return this.toRunResponse(run);
  }

  async updateChecklist(
    user: AuthenticatedUser,
    id: string,
    dto: StaffChecklistUpdateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffChecklistRun.findFirst({
      where: { id, tenantId },
      include: checklistRunInclude,
    });

    if (!current) {
      throw new NotFoundException('Checklist run not found');
    }

    const sections = this.normalizeSections(current.sectionsSnapshot);
    const answers =
      dto.answers === undefined
        ? this.normalizeAnswers(current.answers, sections)
        : this.normalizeAnswers(dto.answers, sections);
    const metrics = this.calculateMetrics(sections, answers);
    const currentStatus = current.status as StaffChecklistStatus;
    const nextStatus =
      dto.status === undefined
        ? currentStatus
        : this.resolveOne(dto.status, checklistStatuses, currentStatus);
    const isSubmit =
      nextStatus === 'ON_REVIEW' && currentStatus !== 'ON_REVIEW';
    const isReview =
      (nextStatus === 'ACCEPTED' || nextStatus === 'RETURNED') &&
      nextStatus !== currentStatus;
    const now = new Date();

    if (nextStatus === 'ON_REVIEW' && metrics.blockingIssues.length > 0) {
      throw new BadRequestException(
        'Required checklist answers or evidence are missing',
      );
    }

    const run = await this.prisma.$transaction(async (tx) => {
      await tx.staffChecklistRun.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          answers,
          scoreTotal: metrics.scoreTotal,
          scoreEarned: metrics.scoreEarned,
          requiredItemsTotal: metrics.requiredItemsTotal,
          requiredItemsDone: metrics.requiredItemsDone,
          evidenceTotal: metrics.evidenceTotal,
          evidenceDone: metrics.evidenceDone,
          failedItems: metrics.failedItems,
          blockingIssues: metrics.blockingIssues,
          reviewComment:
            dto.reviewComment === undefined
              ? undefined
              : this.normalizeOptionalString(dto.reviewComment),
          startedAt:
            current.startedAt ??
            (nextStatus === 'IN_PROGRESS' || nextStatus === 'ON_REVIEW'
              ? now
              : null),
          submittedAt: isSubmit ? now : undefined,
          reviewedAt: isReview ? now : undefined,
          reviewedByUserId: isReview ? user.id : undefined,
        },
        select: { id: true },
      });

      if (
        isSubmit &&
        metrics.failedItems > 0 &&
        dto.createFollowUpTasks !== false
      ) {
        await this.createFailedItemTasks(
          tx,
          tenantId,
          user.id,
          current,
          sections,
          answers,
        );
      }

      if (isSubmit && metrics.failedItems > 0) {
        await this.createChecklistIncidentMessage(
          tx,
          tenantId,
          user.id,
          current,
          sections,
          answers,
          metrics,
        );
      }

      return this.fetchRunOrThrow(tx, tenantId, current.id);
    });

    return this.toRunResponse(run);
  }

  private async resolveRegulationSource(
    tenantId: string,
    regulationId: string,
  ): Promise<ChecklistSource> {
    const regulation = await this.prisma.staffShiftRegulation.findFirst({
      where: { id: regulationId, tenantId, status: 'PUBLISHED' },
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

    return {
      kind: 'REGULATION',
      ...regulation,
    };
  }

  private async resolveTemplateSource(
    tenantId: string,
    templateId: string,
  ): Promise<ChecklistSource> {
    const template = await this.prisma.staffChecklistTemplate.findFirst({
      where: { id: templateId, tenantId, status: 'ACTIVE' },
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

    if (!template) {
      throw new BadRequestException('Active checklist template not found');
    }

    return {
      kind: 'TEMPLATE',
      ...template,
    };
  }

  private resolveFilters(
    query: StaffChecklistsQuery,
  ): StaffChecklistReport['filters'] {
    return {
      status: this.resolveOne(query.status, checklistFilterStatuses, 'all'),
      shiftKind: this.resolveOne(
        query.shiftKind,
        ['all', ...shiftKinds] as const,
        'all',
      ),
      regulationId: this.normalizeOptionalString(query.regulationId),
      storeId: this.normalizeOptionalString(query.storeId),
      assignedToUserId: this.normalizeOptionalString(query.assignedToUserId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffChecklistReport['filters'],
    includeStatus: boolean,
  ): Prisma.StaffChecklistRunWhereInput {
    const where: Prisma.StaffChecklistRunWhereInput = { tenantId };

    if (includeStatus && filters.status !== 'all') {
      if (filters.status === 'OVERDUE') {
        where.status = { in: ['OPEN', 'IN_PROGRESS', 'RETURNED'] };
        where.scheduledAt = { lt: new Date() };
      } else {
        where.status = filters.status;
      }
    }

    if (filters.shiftKind !== 'all') {
      where.shiftKind = filters.shiftKind;
    }

    if (filters.regulationId) {
      where.regulationId = filters.regulationId;
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.assignedToUserId) {
      where.assignedToUserId = filters.assignedToUserId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        {
          regulation: {
            title: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          template: {
            title: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private buildSummary(
    rows: Array<{
      status: string;
      scheduledAt: Date | null;
      failedItems: number;
      blockingIssues: Prisma.JsonValue | null;
    }>,
  ): StaffChecklistReport['summary'] {
    const now = new Date();
    const summary = {
      total: rows.length,
      open: 0,
      inProgress: 0,
      onReview: 0,
      accepted: 0,
      returned: 0,
      canceled: 0,
      overdue: 0,
      failedItems: 0,
      blockingIssues: 0,
    };

    rows.forEach((row) => {
      if (row.status === 'OPEN') {
        summary.open += 1;
      } else if (row.status === 'IN_PROGRESS') {
        summary.inProgress += 1;
      } else if (row.status === 'ON_REVIEW') {
        summary.onReview += 1;
      } else if (row.status === 'ACCEPTED') {
        summary.accepted += 1;
      } else if (row.status === 'RETURNED') {
        summary.returned += 1;
      } else if (row.status === 'CANCELED') {
        summary.canceled += 1;
      }

      if (
        row.scheduledAt &&
        row.scheduledAt < now &&
        ['OPEN', 'IN_PROGRESS', 'RETURNED'].includes(row.status)
      ) {
        summary.overdue += 1;
      }

      summary.failedItems += row.failedItems;
      summary.blockingIssues += this.normalizeBlockingIssues(
        row.blockingIssues,
      ).length;
    });

    return summary;
  }

  private toRegulationOption(row: {
    id: string;
    title: string;
    shiftKind: string;
    roleScope: string;
    version: number;
    sections: Prisma.JsonValue;
    store: { id: string; name: string; isActive: boolean } | null;
  }): StaffChecklistRegulationOption {
    const sections = this.normalizeSections(row.sections);
    const items = sections.flatMap((section) => section.items);

    return {
      id: row.id,
      title: row.title,
      shiftKind: row.shiftKind as StaffChecklistShiftKind,
      roleScope: row.roleScope,
      version: row.version,
      store: row.store,
      sectionsCount: sections.length,
      itemsCount: items.length,
      requiredEvidenceItems: items.filter((item) => item.evidenceRequired)
        .length,
    };
  }

  private toTemplateOption(row: {
    id: string;
    title: string;
    shiftKind: string;
    roleScope: string;
    status: string;
    version: number;
    sections: Prisma.JsonValue;
    store: { id: string; name: string; isActive: boolean } | null;
  }): StaffChecklistTemplateOption {
    const sections = this.normalizeSections(row.sections);
    const items = sections.flatMap((section) => section.items);

    return {
      id: row.id,
      title: row.title,
      shiftKind: row.shiftKind as StaffChecklistShiftKind,
      roleScope: row.roleScope,
      status: row.status,
      version: row.version,
      store: row.store,
      sectionsCount: sections.length,
      itemsCount: items.length,
      requiredEvidenceItems: items.filter((item) => item.evidenceRequired)
        .length,
    };
  }

  private toRunResponse(row: StaffChecklistRunRow): StaffChecklistRunResponse {
    const sections = this.normalizeSections(row.sectionsSnapshot);
    const answers = this.normalizeAnswers(row.answers, sections);
    const blockingIssues = this.normalizeBlockingIssues(row.blockingIssues);
    const now = new Date();
    const isOverdue =
      Boolean(row.scheduledAt) &&
      row.scheduledAt! < now &&
      ['OPEN', 'IN_PROGRESS', 'RETURNED'].includes(row.status);

    return {
      id: row.id,
      regulationId: row.regulationId,
      templateId: row.templateId,
      title: row.title,
      shiftKind: row.shiftKind as StaffChecklistShiftKind,
      roleScope: row.roleScope,
      status: row.status as StaffChecklistStatus,
      regulationVersion: row.regulationVersion,
      templateVersion: row.templateVersion,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      sections,
      answers,
      scoreTotal: row.scoreTotal,
      scoreEarned: row.scoreEarned,
      requiredItemsTotal: row.requiredItemsTotal,
      requiredItemsDone: row.requiredItemsDone,
      evidenceTotal: row.evidenceTotal,
      evidenceDone: row.evidenceDone,
      failedItems: row.failedItems,
      blockingIssues,
      reviewComment: row.reviewComment,
      isOverdue,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      regulation: row.regulation,
      template: row.template,
      store: row.store,
      shift: row.shift
        ? {
            id: row.shift.id,
            externalShiftId: row.shift.externalShiftId,
            startedAt: row.shift.startedAt?.toISOString() ?? null,
            stoppedAt: row.shift.stoppedAt?.toISOString() ?? null,
            store: row.shift.store,
          }
        : null,
      createdByUser: row.createdByUser,
      assignedToUser: row.assignedToUser,
      reviewedByUser: row.reviewedByUser,
    };
  }

  private normalizeSections(value: unknown): StaffChecklistSection[] {
    const rawSections = Array.isArray(value) ? value : [];
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
      throw new BadRequestException('Checklist sections are required');
    }

    if (sections.every((section) => section.items.length === 0)) {
      throw new BadRequestException('Checklist items are required');
    }

    return sections;
  }

  private normalizeItem(value: unknown, index: number): StaffChecklistItem {
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

  private defaultAnswers(sections: StaffChecklistSection[]) {
    return sections.flatMap((section) =>
      section.items.map((item) => ({
        sectionId: section.id,
        itemId: item.id,
        value: null,
        status: null,
        note: null,
        evidenceUrl: null,
        completedAt: null,
      })),
    );
  }

  private normalizeAnswers(
    value: unknown,
    sections: StaffChecklistSection[],
  ): StaffChecklistAnswer[] {
    const rawAnswers = Array.isArray(value) ? value : [];
    const answerByKey = new Map(
      rawAnswers.map((answer) => {
        const record = this.asRecord(answer);
        return [
          `${this.normalizeOptionalString(record.sectionId) ?? ''}::${this.normalizeOptionalString(record.itemId) ?? ''}`,
          record,
        ];
      }),
    );

    return sections.flatMap((section) =>
      section.items.map((item) => {
        const record = answerByKey.get(`${section.id}::${item.id}`) ?? {};
        const status = this.normalizeOptionalString(record.status);
        const normalizedStatus = status
          ? this.resolveOne(status, answerStatuses, 'PASS')
          : null;
        const evidenceUrl = this.normalizeEvidenceUrl(record.evidenceUrl);
        const completedAt =
          this.normalizeOptionalString(record.completedAt) ??
          (normalizedStatus ? new Date().toISOString() : null);

        return {
          sectionId: section.id,
          itemId: item.id,
          value: this.normalizeOptionalString(record.value),
          status: normalizedStatus,
          note: this.normalizeOptionalString(record.note),
          evidenceUrl,
          completedAt,
        };
      }),
    );
  }

  private calculateMetrics(
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
  ): Metrics {
    const answerByKey = new Map(
      answers.map((answer) => [
        `${answer.sectionId}::${answer.itemId}`,
        answer,
      ]),
    );
    const metrics: Metrics = {
      scoreTotal: 0,
      scoreEarned: 0,
      requiredItemsTotal: 0,
      requiredItemsDone: 0,
      evidenceTotal: 0,
      evidenceDone: 0,
      failedItems: 0,
      blockingIssues: [],
    };

    sections.forEach((section) => {
      section.items.forEach((item) => {
        const answer = answerByKey.get(`${section.id}::${item.id}`);
        const isAnswered = Boolean(answer?.status);

        metrics.scoreTotal += item.score;

        if (item.required) {
          metrics.requiredItemsTotal += 1;
        }

        if (item.evidenceRequired) {
          metrics.evidenceTotal += 1;
        }

        if (answer?.status === 'PASS' || answer?.status === 'NOT_APPLICABLE') {
          metrics.scoreEarned += item.score;
        }

        if (answer?.status === 'FAILED') {
          metrics.failedItems += 1;
        }

        if (item.required && isAnswered) {
          metrics.requiredItemsDone += 1;
        }

        if (item.evidenceRequired && answer?.evidenceUrl) {
          metrics.evidenceDone += 1;
        }

        if (item.required && !isAnswered) {
          metrics.blockingIssues.push({
            sectionId: section.id,
            itemId: item.id,
            title: item.title,
            issue: 'REQUIRED_ANSWER_MISSING',
          });
        }

        if (item.evidenceRequired && !answer?.evidenceUrl) {
          metrics.blockingIssues.push({
            sectionId: section.id,
            itemId: item.id,
            title: item.title,
            issue: 'REQUIRED_EVIDENCE_MISSING',
          });
        }
      });
    });

    return metrics;
  }

  private normalizeBlockingIssues(
    value: unknown,
  ): StaffChecklistBlockingIssue[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((issue) => {
        const record = this.asRecord(issue);
        const issueType = this.normalizeOptionalString(record.issue);

        if (
          issueType !== 'REQUIRED_ANSWER_MISSING' &&
          issueType !== 'REQUIRED_EVIDENCE_MISSING'
        ) {
          return null;
        }

        return {
          sectionId: this.normalizeOptionalString(record.sectionId) ?? '',
          itemId: this.normalizeOptionalString(record.itemId) ?? '',
          title: this.normalizeOptionalString(record.title) ?? 'Пункт чеклиста',
          issue: issueType,
        } satisfies StaffChecklistBlockingIssue;
      })
      .filter((issue): issue is StaffChecklistBlockingIssue => Boolean(issue));
  }

  private async createFailedItemTasks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    run: StaffChecklistRunRow,
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
  ) {
    const itemByKey = new Map(
      sections.flatMap((section) =>
        section.items.map((item) => [
          `${section.id}::${item.id}`,
          { section, item },
        ]),
      ),
    );
    const failedAnswers = answers.filter(
      (answer) => answer.status === 'FAILED',
    );

    for (const answer of failedAnswers.slice(0, 20)) {
      const source = itemByKey.get(`${answer.sectionId}::${answer.itemId}`);

      if (!source) {
        continue;
      }

      const task = await tx.staffTask.create({
        data: {
          tenantId,
          title: `Проверить пункт чеклиста: ${source.item.title}`.slice(0, 240),
          description: [
            `Чеклист: ${run.title}`,
            `Раздел: ${source.section.title}`,
            answer.note ? `Комментарий: ${answer.note}` : null,
            answer.evidenceUrl ? `Доказательство: ${answer.evidenceUrl}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          type: 'SHIFT',
          priority: 'HIGH',
          status: 'OPEN',
          storeId: run.storeId,
          shiftId: run.shiftId,
          assignedToUserId: run.assignedToUserId,
          createdByUserId: actorUserId,
          checklist: {
            source: 'CHECKLIST_FAILED_ITEM',
            checklistRunId: run.id,
            regulationId: run.regulationId,
            templateId: run.templateId,
            sectionId: answer.sectionId,
            itemId: answer.itemId,
          },
        },
        select: { id: true },
      });

      await tx.staffTaskAuditEvent.create({
        data: {
          tenantId,
          taskId: task.id,
          actorUserId,
          action: 'CREATED_FROM_CHECKLIST',
          message: 'Task created from failed checklist item',
          metadata: {
            checklistRunId: run.id,
            regulationId: run.regulationId,
            templateId: run.templateId,
            itemId: answer.itemId,
          },
        },
      });
    }
  }

  private async createChecklistIncidentMessage(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    run: StaffChecklistRunRow,
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
    metrics: Metrics,
  ) {
    const channelId = await this.ensureDefaultChatChannel(tx, tenantId);
    const message = await tx.staffChatMessage.create({
      data: {
        tenantId,
        channelId,
        authorUserId: actorUserId,
        storeId: run.storeId,
        body: this.buildChecklistIncidentBody(run, sections, answers, metrics),
        kind: 'INCIDENT',
        priority: metrics.failedItems >= 3 ? 'URGENT' : 'HIGH',
        isPinned: false,
      },
      select: { id: true },
    });

    await tx.staffChatReadReceipt.createMany({
      data: [
        {
          tenantId,
          channelId,
          messageId: message.id,
          userId: actorUserId,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async ensureDefaultChatChannel(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const channel = await tx.staffChatChannel.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: 'Информация и объявления',
        },
      },
      create: {
        tenantId,
        name: 'Информация и объявления',
        description:
          'Официальные объявления, регламенты и важные сообщения для всей сети.',
        scope: 'NETWORK',
        isDefault: true,
      },
      update: {
        isDefault: true,
        isArchived: false,
        scope: 'NETWORK',
      },
      select: { id: true },
    });

    return channel.id;
  }

  private buildChecklistIncidentBody(
    run: StaffChecklistRunRow,
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
    metrics: Metrics,
  ) {
    const itemByKey = new Map(
      sections.flatMap((section) =>
        section.items.map((item) => [
          `${section.id}::${item.id}`,
          { section, item },
        ]),
      ),
    );
    const failedLines = answers
      .filter((answer) => answer.status === 'FAILED')
      .slice(0, 5)
      .map((answer) => {
        const source = itemByKey.get(`${answer.sectionId}::${answer.itemId}`);
        const title = source
          ? `${source.section.title}: ${source.item.title}`
          : answer.itemId;
        const note = answer.note ? ` — ${answer.note}` : '';
        return `- ${title}${note}`;
      });
    const assignedTo =
      run.assignedToUser?.fullName ?? run.assignedToUser?.email ?? null;
    const score =
      metrics.scoreTotal > 0
        ? `${metrics.scoreEarned}/${metrics.scoreTotal}`
        : 'без баллов';

    return [
      'Чеклист отправлен на проверку с проблемными пунктами.',
      '',
      `Чеклист: ${run.title}`,
      `Клуб: ${run.store?.name ?? 'вся сеть'}`,
      assignedTo ? `Ответственный: ${assignedTo}` : null,
      `Провалено пунктов: ${metrics.failedItems}`,
      `Оценка: ${score}`,
      '',
      'Проблемные пункты:',
      ...failedLines,
      metrics.failedItems > failedLines.length
        ? `- Еще ${metrics.failedItems - failedLines.length} пункт(ов)`
        : null,
      '',
      'Источник: чеклист смены LeetPlus.',
      `Открыть чеклисты: /staff/checklists?search=${encodeURIComponent(
        run.title,
      )}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async fetchRunOrThrow(
    prisma: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const run = await prisma.staffChecklistRun.findFirst({
      where: { id, tenantId },
      include: checklistRunInclude,
    });

    if (!run) {
      throw new NotFoundException('Checklist run not found');
    }

    return run;
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

  private normalizeDateTime(value: string | null | undefined, label: string) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${label}`);
    }

    return date;
  }

  private normalizeEvidenceUrl(value: unknown) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    let url: URL;

    try {
      url = new URL(normalized);
    } catch {
      throw new BadRequestException('Evidence link must be a valid URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException('Evidence link must use http or https');
    }

    return url.toString();
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

  private async resolveShiftId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const shift = await this.prisma.guestWorkingShift.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    return shift.id;
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
      where: { id, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user.id;
  }
}
