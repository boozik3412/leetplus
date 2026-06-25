import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  buildStaffExportFile,
  formatStaffDateTime,
  resolveStaffExportFormat,
  staffUserLabel,
  staffYesNo,
  type StaffExportCell,
  type StaffExportFile,
} from './staff-export';
import {
  STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
  STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
} from './staff-team-chat.service';

const checklistStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'ON_REVIEW',
  'ACCEPTED',
  'RETURNED',
  'ESCALATED',
  'CANCELED',
] as const;
const checklistUseOnlyRoles = new Set([
  'SENIOR_ADMINISTRATOR',
  'CLUB_ADMINISTRATOR',
  'TRAINEE',
]);
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
const executionSortFields = [
  'activityDate',
  'checklist',
  'store',
  'employee',
  'score',
  'problems',
  'status',
] as const;
const executionSortDirections = ['asc', 'desc'] as const;
const executionProblemFilters = ['all', 'with', 'none'] as const;
const executionScoreFilters = [
  'all',
  'lt50',
  '50to79',
  '80to99',
  '100',
] as const;
const executionSourceFilters = [
  'all',
  'REGULATION',
  'TEMPLATE',
  'RUN',
] as const;

export type StaffChecklistStatus = (typeof checklistStatuses)[number];
export type StaffChecklistFilterStatus =
  (typeof checklistFilterStatuses)[number];
export type StaffChecklistShiftKind = (typeof shiftKinds)[number];
export type StaffChecklistAnswerStatus = (typeof answerStatuses)[number];
export type StaffChecklistItemValueType = (typeof itemValueTypes)[number];
export type StaffChecklistExecutionSort = (typeof executionSortFields)[number];
export type StaffChecklistExecutionSortDirection =
  (typeof executionSortDirections)[number];
export type StaffChecklistExecutionProblemFilter =
  (typeof executionProblemFilters)[number];
export type StaffChecklistExecutionScoreFilter =
  (typeof executionScoreFilters)[number];
export type StaffChecklistExecutionSourceFilter =
  (typeof executionSourceFilters)[number];

export type StaffChecklistsQuery = {
  status?: StaffChecklistFilterStatus;
  shiftKind?: StaffChecklistShiftKind | 'all';
  runId?: string;
  regulationId?: string;
  templateId?: string;
  storeId?: string;
  assignedToUserId?: string;
  search?: string;
};

export type StaffChecklistExecutionReportQuery = StaffChecklistsQuery & {
  dateFrom?: string;
  dateTo?: string;
  sort?: StaffChecklistExecutionSort;
  direction?: StaffChecklistExecutionSortDirection;
  problems?: StaffChecklistExecutionProblemFilter;
  scoreRange?: StaffChecklistExecutionScoreFilter;
  sourceType?: StaffChecklistExecutionSourceFilter;
};

export type StaffChecklistExecutionExportQuery =
  StaffChecklistExecutionReportQuery & {
    format?: string;
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

export type StaffChecklistItemReviewMessageDto = {
  body?: string | null;
  attachmentUrl?: string | null;
  attachments?: unknown;
};

export type StaffChecklistItemReviewResolveDto = {
  comment?: string | null;
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

export type StaffChecklistEvidenceAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type StaffChecklistReviewThreadStatus = 'OPEN' | 'RESOLVED';

export type StaffChecklistReviewThreadMessage = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  authorRole: string | null;
  body: string;
  attachments: StaffChecklistEvidenceAttachment[];
  createdAt: string;
};

export type StaffChecklistReviewThread = {
  id: string;
  status: StaffChecklistReviewThreadStatus;
  createdByUserId: string | null;
  createdAt: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  messages: StaffChecklistReviewThreadMessage[];
};

export type StaffChecklistAnswer = {
  sectionId: string;
  itemId: string;
  value: string | null;
  status: StaffChecklistAnswerStatus | null;
  note: string | null;
  evidenceUrl: string | null;
  evidenceAttachments: StaffChecklistEvidenceAttachment[];
  reviewThreads: StaffChecklistReviewThread[];
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
    runId: string | null;
    regulationId: string | null;
    templateId?: string | null;
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
    escalated: number;
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

export type StaffChecklistExecutionMetrics = {
  total: number;
  open: number;
  inProgress: number;
  onReview: number;
  accepted: number;
  returned: number;
  escalated: number;
  canceled: number;
  overdue: number;
  failedItems: number;
  blockingIssues: number;
  scoreTotal: number;
  scoreEarned: number;
  scorePercent: number;
  requiredItemsTotal: number;
  requiredItemsDone: number;
  requiredPercent: number;
  evidenceTotal: number;
  evidenceDone: number;
  evidencePercent: number;
};

export type StaffChecklistExecutionGroup = StaffChecklistExecutionMetrics & {
  key: string;
  label: string;
  caption: string | null;
};

export type StaffChecklistExecutionRun = StaffChecklistExecutionMetrics & {
  id: string;
  title: string;
  status: StaffChecklistStatus;
  activityDate: string;
  scheduledAt: string | null;
  submittedAt: string | null;
  store: { id: string; name: string; isActive: boolean } | null;
  assignedToUser: { id: string; email: string; fullName: string | null } | null;
  checklist: {
    id: string | null;
    title: string;
    type: 'REGULATION' | 'TEMPLATE' | 'RUN';
  };
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
};

export type StaffChecklistExecutionReport = {
  filters: StaffChecklistReport['filters'] & {
    dateFrom: string | null;
    dateTo: string | null;
    sort: StaffChecklistExecutionSort;
    direction: StaffChecklistExecutionSortDirection;
    problems: StaffChecklistExecutionProblemFilter;
    scoreRange: StaffChecklistExecutionScoreFilter;
    sourceType: StaffChecklistExecutionSourceFilter;
  };
  summary: StaffChecklistExecutionMetrics;
  byClub: StaffChecklistExecutionGroup[];
  byShift: StaffChecklistExecutionGroup[];
  byEmployee: StaffChecklistExecutionGroup[];
  byChecklist: StaffChecklistExecutionGroup[];
  runs: StaffChecklistExecutionRun[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; email: string; fullName: string | null }>;
  checklistTemplates: StaffChecklistTemplateOption[];
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

type ChecklistSourceScope = {
  roleScopes: string[];
  storeIds: string[] | null;
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
    const useOnlyScope = this.buildChecklistUseOnlyScope(user);
    const canManageChecklistRuns = !this.isChecklistUseOnlyUser(user);
    const sourceScope = await this.resolveChecklistSourceScope(tenantId, user);
    const baseWhere = this.applyChecklistScope(
      this.buildWhere(tenantId, filters, false),
      useOnlyScope,
    );
    const rowsWhere = this.applyChecklistScope(
      this.buildWhere(tenantId, filters, true),
      useOnlyScope,
    );
    const regulationWhere = this.applyRegulationSourceScope(
      { tenantId, status: 'PUBLISHED' },
      sourceScope,
    );
    const templateWhere = this.applyTemplateSourceScope(
      { tenantId, status: 'ACTIVE' },
      sourceScope,
    );

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
        this.prisma.staffChecklistTemplate.findMany({
          where: templateWhere,
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
      users: canManageChecklistRuns
        ? users
        : users.filter((row) => row.id === user.id),
    };
  }

  async getExecutionReport(
    user: AuthenticatedUser,
    query: StaffChecklistExecutionReportQuery = {},
  ): Promise<StaffChecklistExecutionReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveExecutionFilters(query);
    const where = this.buildExecutionWhere(tenantId, filters);

    const [rows, stores, users, checklistTemplates] = await Promise.all([
      this.prisma.staffChecklistRun.findMany({
        where,
        include: checklistRunInclude,
        orderBy: [
          { startedAt: 'desc' },
          { scheduledAt: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 5000,
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
        orderBy: [{ title: 'asc' }, { updatedAt: 'desc' }],
        take: 300,
      }),
    ]);
    const reportRows = this.applyExecutionTableFilters(rows, filters);

    const summary = this.createExecutionMetrics();
    const byClub = new Map<string, StaffChecklistExecutionGroup>();
    const byShift = new Map<string, StaffChecklistExecutionGroup>();
    const byEmployee = new Map<string, StaffChecklistExecutionGroup>();
    const byChecklist = new Map<string, StaffChecklistExecutionGroup>();

    reportRows.forEach((row) => {
      this.addRunToExecutionMetrics(summary, row);

      const clubGroup = this.getExecutionGroup(
        byClub,
        row.store?.id ?? 'network',
        row.store?.name ?? 'Вся сеть / клуб не указан',
        row.store?.isActive === false ? 'неактивный клуб' : null,
      );
      this.addRunToExecutionMetrics(clubGroup, row);

      const shiftGroup = this.getExecutionGroup(
        byShift,
        row.shift?.id ?? 'no-shift',
        row.shift
          ? `Смена ${row.shift.externalShiftId}`
          : 'Без привязки к смене',
        row.shift?.store?.name ?? row.store?.name ?? null,
      );
      this.addRunToExecutionMetrics(shiftGroup, row);

      const employeeGroup = this.getExecutionGroup(
        byEmployee,
        row.assignedToUser?.id ?? 'unassigned',
        row.assignedToUser?.fullName ??
          row.assignedToUser?.email ??
          'Не назначен',
        row.assignedToUser?.email ?? null,
      );
      this.addRunToExecutionMetrics(employeeGroup, row);

      const source = this.resolveChecklistSource(row);
      const checklistGroup = this.getExecutionGroup(
        byChecklist,
        source.key,
        source.title,
        source.type === 'REGULATION'
          ? 'регламент смены'
          : source.type === 'TEMPLATE'
            ? 'шаблон чеклиста'
            : 'разовое выполнение',
      );
      this.addRunToExecutionMetrics(checklistGroup, row);
    });

    return {
      filters,
      summary: this.finalizeExecutionMetrics(summary),
      byClub: this.finalizeExecutionGroups(byClub),
      byShift: this.finalizeExecutionGroups(byShift),
      byEmployee: this.finalizeExecutionGroups(byEmployee),
      byChecklist: this.finalizeExecutionGroups(byChecklist),
      runs: reportRows.slice(0, 300).map((row) => this.toExecutionRun(row)),
      stores,
      users,
      checklistTemplates: checklistTemplates.map((row) =>
        this.toTemplateOption(row),
      ),
    };
  }

  async exportExecutionReport(
    user: AuthenticatedUser,
    query: StaffChecklistExecutionExportQuery = {},
  ): Promise<StaffExportFile> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveExecutionFilters(query);
    const format = resolveStaffExportFormat(query.format);
    const rows = await this.prisma.staffChecklistRun.findMany({
      where: this.buildExecutionWhere(tenantId, filters),
      include: checklistRunInclude,
      orderBy: [
        { submittedAt: 'desc' },
        { scheduledAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 10000,
    });
    const reportRows = this.applyExecutionTableFilters(rows, filters);

    return buildStaffExportFile({
      format,
      fileNameBase: 'leetplus-staff-checklists',
      sheetName: 'Checklists',
      rows: [
        [
          'ID',
          'Чеклист',
          'Источник',
          'Статус',
          'Клуб',
          'Сотрудник',
          'Дата активности',
          'Запланировано',
          'Отправлено',
          'Смена',
          'Просрочено',
          'Проблемных пунктов',
          'Блокирующих проблем',
          'Оценка, %',
          'Обязательные, %',
          'Доказательства, %',
        ],
        ...reportRows.map((row) => this.toExecutionExportRow(row)),
      ],
      widths: [36, 34, 18, 18, 24, 28, 20, 20, 20, 22, 14, 18, 18, 14, 16, 18],
    });
  }

  async createChecklist(user: AuthenticatedUser, dto: StaffChecklistCreateDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const regulationId = this.normalizeOptionalString(dto.regulationId);
    const templateId = this.normalizeOptionalString(dto.templateId);
    const isUseOnlyUser = this.isChecklistUseOnlyUser(user);

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
    const sourceScope = isUseOnlyUser
      ? await this.resolveChecklistSourceScope(tenantId, user)
      : null;

    const requestedStoreId = this.normalizeOptionalString(dto.storeId);
    this.ensureCanStartChecklist(user, {
      source,
      sourceScope,
      requestedStoreId,
      assignedToUserId: this.normalizeOptionalString(dto.assignedToUserId),
      shiftId: this.normalizeOptionalString(dto.shiftId),
    });

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
    const assignedToUserId = isUseOnlyUser
      ? user.id
      : await this.resolveUserId(tenantId, dto.assignedToUserId);

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
    this.ensureCanUpdateChecklist(user, current, currentStatus, nextStatus);

    const isSubmit =
      nextStatus === 'ON_REVIEW' && currentStatus !== 'ON_REVIEW';
    const isReview =
      (nextStatus === 'ACCEPTED' ||
        nextStatus === 'RETURNED' ||
        nextStatus === 'ESCALATED') &&
      nextStatus !== currentStatus;
    const isEscalation =
      nextStatus === 'ESCALATED' && nextStatus !== currentStatus;
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

      if (isEscalation) {
        await this.createChecklistEscalationMessage(
          tx,
          tenantId,
          user.id,
          current,
          sections,
          answers,
          metrics,
          this.normalizeOptionalString(dto.reviewComment),
        );
      }

      return this.fetchRunOrThrow(tx, tenantId, current.id);
    });

    return this.toRunResponse(run);
  }

  async addItemReviewMessage(
    user: AuthenticatedUser,
    id: string,
    itemId: string,
    dto: StaffChecklistItemReviewMessageDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffChecklistRun.findFirst({
      where: { id, tenantId },
      include: checklistRunInclude,
    });

    if (!current) {
      throw new NotFoundException('Checklist run not found');
    }

    this.ensureCanCommentChecklist(user, current);

    const sections = this.normalizeSections(current.sectionsSnapshot);
    const source = this.findChecklistItem(sections, itemId);

    if (!source) {
      throw new NotFoundException('Checklist item not found');
    }

    const body = this.normalizeRequiredString(
      dto.body ?? undefined,
      'Комментарий обязателен',
    );
    const attachments = this.normalizeEvidenceAttachments(
      dto.attachments,
      this.normalizeEvidenceUrl(dto.attachmentUrl),
    );
    const answers = this.normalizeAnswers(current.answers, sections);
    const now = new Date();
    const message: StaffChecklistReviewThreadMessage = {
      id: randomUUID(),
      authorUserId: user.id,
      authorName: user.fullName ?? user.email,
      authorRole: user.customRoleName ?? user.role,
      body,
      attachments,
      createdAt: now.toISOString(),
    };
    let updatedThread: StaffChecklistReviewThread | null = null;
    const nextAnswers = answers.map((answer) => {
      if (answer.itemId !== itemId) {
        return answer;
      }

      const openThread = answer.reviewThreads.find(
        (thread) => thread.status === 'OPEN',
      );
      const nextThread: StaffChecklistReviewThread = openThread
        ? {
            ...openThread,
            messages: [...openThread.messages, message],
          }
        : {
            id: randomUUID(),
            status: 'OPEN',
            createdByUserId: user.id,
            createdAt: now.toISOString(),
            resolvedByUserId: null,
            resolvedAt: null,
            messages: [message],
          };
      updatedThread = nextThread;

      return {
        ...answer,
        reviewThreads: [
          ...answer.reviewThreads.filter(
            (thread) => thread.id !== nextThread.id,
          ),
          nextThread,
        ],
      };
    });
    const metrics = this.calculateMetrics(sections, nextAnswers);

    const run = await this.prisma.$transaction(async (tx) => {
      await tx.staffChecklistRun.update({
        where: { id: current.id },
        data: {
          answers: nextAnswers,
          scoreTotal: metrics.scoreTotal,
          scoreEarned: metrics.scoreEarned,
          requiredItemsTotal: metrics.requiredItemsTotal,
          requiredItemsDone: metrics.requiredItemsDone,
          evidenceTotal: metrics.evidenceTotal,
          evidenceDone: metrics.evidenceDone,
          failedItems: metrics.failedItems,
          blockingIssues: metrics.blockingIssues,
        },
        select: { id: true },
      });

      if (updatedThread) {
        await this.createChecklistReviewNotification(
          tx,
          tenantId,
          user,
          current,
          source,
          updatedThread,
          message,
        );
      }

      return this.fetchRunOrThrow(tx, tenantId, current.id);
    });

    return this.toRunResponse(run);
  }

  async resolveItemReviewThread(
    user: AuthenticatedUser,
    id: string,
    itemId: string,
    dto: StaffChecklistItemReviewResolveDto = {},
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffChecklistRun.findFirst({
      where: { id, tenantId },
      include: checklistRunInclude,
    });

    if (!current) {
      throw new NotFoundException('Checklist run not found');
    }

    if (this.isChecklistUseOnlyUser(user)) {
      throw new ForbiddenException(
        'Зачесть уточнение может только проверяющий сотрудник',
      );
    }

    const sections = this.normalizeSections(current.sectionsSnapshot);
    const source = this.findChecklistItem(sections, itemId);

    if (!source) {
      throw new NotFoundException('Checklist item not found');
    }

    const answers = this.normalizeAnswers(current.answers, sections);
    const now = new Date();
    const comment = this.normalizeOptionalString(dto.comment);
    let resolvedThread: StaffChecklistReviewThread | null = null;
    const nextAnswers = answers.map((answer) => {
      if (answer.itemId !== itemId) {
        return answer;
      }

      const openThread = answer.reviewThreads.find(
        (thread) => thread.status === 'OPEN',
      );

      if (!openThread) {
        return answer;
      }

      const resolveMessage: StaffChecklistReviewThreadMessage | null = comment
        ? {
            id: randomUUID(),
            authorUserId: user.id,
            authorName: user.fullName ?? user.email,
            authorRole: user.customRoleName ?? user.role,
            body: comment,
            attachments: [],
            createdAt: now.toISOString(),
          }
        : null;
      const nextThread: StaffChecklistReviewThread = {
        ...openThread,
        status: 'RESOLVED',
        resolvedByUserId: user.id,
        resolvedAt: now.toISOString(),
        messages: resolveMessage
          ? [...openThread.messages, resolveMessage]
          : openThread.messages,
      };
      resolvedThread = nextThread;

      return {
        ...answer,
        reviewThreads: answer.reviewThreads.map((thread) =>
          thread.id === openThread.id ? nextThread : thread,
        ),
      };
    });

    if (!resolvedThread) {
      throw new BadRequestException('Открытых уточнений по пункту нет');
    }

    const notificationThread = resolvedThread;
    const metrics = this.calculateMetrics(sections, nextAnswers);
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.staffChecklistRun.update({
        where: { id: current.id },
        data: {
          answers: nextAnswers,
          scoreTotal: metrics.scoreTotal,
          scoreEarned: metrics.scoreEarned,
          requiredItemsTotal: metrics.requiredItemsTotal,
          requiredItemsDone: metrics.requiredItemsDone,
          evidenceTotal: metrics.evidenceTotal,
          evidenceDone: metrics.evidenceDone,
          failedItems: metrics.failedItems,
          blockingIssues: metrics.blockingIssues,
        },
        select: { id: true },
      });

      await this.createChecklistReviewResolvedNotification(
        tx,
        tenantId,
        user,
        current,
        source,
        notificationThread,
      );

      return this.fetchRunOrThrow(tx, tenantId, current.id);
    });

    return this.toRunResponse(run);
  }

  private isChecklistUseOnlyUser(user: AuthenticatedUser) {
    return checklistUseOnlyRoles.has(user.role);
  }

  private buildChecklistUseOnlyScope(
    user: AuthenticatedUser,
  ): Prisma.StaffChecklistRunWhereInput | null {
    if (!this.isChecklistUseOnlyUser(user)) {
      return null;
    }

    return {
      AND: [
        { status: { notIn: ['ACCEPTED', 'CANCELED'] } },
        {
          OR: [{ assignedToUserId: user.id }, { assignedToUserId: null }],
        },
      ],
    };
  }

  private applyChecklistScope(
    where: Prisma.StaffChecklistRunWhereInput,
    scope: Prisma.StaffChecklistRunWhereInput | null,
  ): Prisma.StaffChecklistRunWhereInput {
    if (!scope) {
      return where;
    }

    return {
      AND: [where, scope],
    };
  }

  private async resolveChecklistSourceScope(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<ChecklistSourceScope | null> {
    if (!this.isChecklistUseOnlyUser(user)) {
      return null;
    }

    const actor = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId, isActive: true },
      select: { storeAccesses: { select: { storeId: true } } },
    });

    return {
      roleScopes: this.sourceRoleScopesForUser(user.role),
      storeIds: actor?.storeAccesses.length
        ? actor.storeAccesses.map((access) => access.storeId)
        : null,
    };
  }

  private applyRegulationSourceScope(
    where: Prisma.StaffShiftRegulationWhereInput,
    scope: ChecklistSourceScope | null,
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

  private applyTemplateSourceScope(
    where: Prisma.StaffChecklistTemplateWhereInput,
    scope: ChecklistSourceScope | null,
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

  private sourceRoleScopesForUser(role: AuthenticatedUser['role']) {
    if (role === 'SENIOR_ADMINISTRATOR') {
      return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'ALL_STAFF'];
    }

    return ['ADMINISTRATOR', 'ALL_STAFF'];
  }

  private ensureCanStartChecklist(
    user: AuthenticatedUser,
    options: {
      source: ChecklistSource;
      sourceScope: ChecklistSourceScope | null;
      requestedStoreId: string | null;
      assignedToUserId: string | null;
      shiftId: string | null;
    },
  ) {
    if (!this.isChecklistUseOnlyUser(user)) {
      this.ensureCanCreateChecklist(user);
      return;
    }

    if (options.source.kind !== 'TEMPLATE') {
      throw new ForbiddenException(
        'Сменные роли могут запускать только активные шаблоны чек-листов.',
      );
    }

    if (options.assignedToUserId && options.assignedToUserId !== user.id) {
      throw new ForbiddenException(
        'Чек-лист смены можно запустить только для текущего пользователя.',
      );
    }

    if (options.shiftId) {
      throw new ForbiddenException(
        'Привязка к смене доступна только через домашнюю страницу смены.',
      );
    }

    if (!this.isSourceVisibleForScope(options.source, options.sourceScope)) {
      throw new ForbiddenException(
        'Шаблон чек-листа недоступен для вашей роли или клуба.',
      );
    }

    if (
      options.requestedStoreId &&
      options.sourceScope?.storeIds &&
      !options.sourceScope.storeIds.includes(options.requestedStoreId)
    ) {
      throw new ForbiddenException('Клуб чек-листа недоступен для вашей роли.');
    }
  }

  private isSourceVisibleForScope(
    source: ChecklistSource,
    scope: ChecklistSourceScope | null,
  ) {
    if (!scope) {
      return false;
    }

    if (!scope.roleScopes.includes(source.roleScope)) {
      return false;
    }

    return (
      !scope.storeIds ||
      !source.storeId ||
      scope.storeIds.includes(source.storeId)
    );
  }

  private ensureCanCreateChecklist(user: AuthenticatedUser) {
    if (this.isChecklistUseOnlyUser(user)) {
      throw new ForbiddenException(
        'Создание чек-листов недоступно для вашей роли',
      );
    }
  }

  private ensureCanUpdateChecklist(
    user: AuthenticatedUser,
    current: { assignedToUserId: string | null },
    currentStatus: StaffChecklistStatus,
    nextStatus: StaffChecklistStatus,
  ) {
    if (!this.isChecklistUseOnlyUser(user)) {
      return;
    }

    if (current.assignedToUserId && current.assignedToUserId !== user.id) {
      throw new ForbiddenException('Чек-лист недоступен для вашей роли');
    }

    if (currentStatus === 'ACCEPTED' || currentStatus === 'CANCELED') {
      throw new ForbiddenException('Закрытый чек-лист нельзя изменить');
    }

    if (nextStatus === 'CANCELED') {
      if (currentStatus === 'OPEN' || currentStatus === 'IN_PROGRESS') {
        return;
      }

      throw new ForbiddenException(
        'Отменить можно только новый чек-лист или чек-лист в работе',
      );
    }

    const isReviewTransition =
      nextStatus !== currentStatus &&
      (nextStatus === 'ACCEPTED' ||
        nextStatus === 'RETURNED' ||
        nextStatus === 'ESCALATED');

    if (isReviewTransition) {
      throw new ForbiddenException(
        'Проверка чек-листов недоступна для вашей роли',
      );
    }
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

  private resolveExecutionFilters(
    query: StaffChecklistExecutionReportQuery,
  ): StaffChecklistExecutionReport['filters'] {
    const baseFilters = this.resolveFilters(query);

    return {
      ...baseFilters,
      dateFrom: this.normalizeDateFilter(query.dateFrom),
      dateTo: this.normalizeDateFilter(query.dateTo),
      sort: this.resolveOne(query.sort, executionSortFields, 'activityDate'),
      direction: this.resolveOne(
        query.direction,
        executionSortDirections,
        'desc',
      ),
      problems: this.resolveOne(query.problems, executionProblemFilters, 'all'),
      scoreRange: this.resolveOne(
        query.scoreRange,
        executionScoreFilters,
        'all',
      ),
      sourceType: this.resolveOne(
        query.sourceType,
        executionSourceFilters,
        'all',
      ),
    };
  }

  private buildExecutionWhere(
    tenantId: string,
    filters: StaffChecklistExecutionReport['filters'],
  ): Prisma.StaffChecklistRunWhereInput {
    const where = this.buildWhere(tenantId, filters, true);
    const dateFrom = this.normalizeDateTime(filters.dateFrom, 'date from');
    const dateTo = this.normalizeDateTime(filters.dateTo, 'date to');

    if (dateFrom || dateTo) {
      const dateRange: { gte?: Date; lte?: Date } = {};

      if (dateFrom) {
        dateRange.gte = dateFrom;
      }

      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateRange.lte = end;
      }

      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          OR: [
            { startedAt: dateRange },
            { startedAt: null, scheduledAt: dateRange },
            { startedAt: null, scheduledAt: null, createdAt: dateRange },
          ],
        },
      ];
    }

    return where;
  }

  private applyExecutionTableFilters(
    rows: StaffChecklistRunRow[],
    filters: StaffChecklistExecutionReport['filters'],
  ) {
    return rows
      .filter((row) => {
        const source = this.resolveChecklistSource(row);
        const problems = this.executionProblemCount(row);
        const scorePercent = this.executionScorePercent(row);

        if (
          filters.sourceType !== 'all' &&
          source.type !== filters.sourceType
        ) {
          return false;
        }

        if (filters.problems === 'with' && problems <= 0) {
          return false;
        }

        if (filters.problems === 'none' && problems > 0) {
          return false;
        }

        return this.matchesExecutionScoreFilter(
          scorePercent,
          filters.scoreRange,
        );
      })
      .sort((left, right) => {
        const result = this.compareExecutionRows(left, right, filters.sort);
        const directed = filters.direction === 'asc' ? result : -result;

        if (directed !== 0) {
          return directed;
        }

        return (
          this.executionActivityDate(right).getTime() -
          this.executionActivityDate(left).getTime()
        );
      });
  }

  private compareExecutionRows(
    left: StaffChecklistRunRow,
    right: StaffChecklistRunRow,
    sort: StaffChecklistExecutionSort,
  ) {
    if (sort === 'checklist') {
      return this.compareExecutionText(
        this.resolveChecklistSource(left).title,
        this.resolveChecklistSource(right).title,
      );
    }

    if (sort === 'store') {
      return this.compareExecutionText(
        left.store?.name ?? '',
        right.store?.name ?? '',
      );
    }

    if (sort === 'employee') {
      return this.compareExecutionText(
        left.assignedToUser?.fullName ?? left.assignedToUser?.email ?? '',
        right.assignedToUser?.fullName ?? right.assignedToUser?.email ?? '',
      );
    }

    if (sort === 'score') {
      return (
        this.executionScorePercent(left) - this.executionScorePercent(right)
      );
    }

    if (sort === 'problems') {
      return (
        this.executionProblemCount(left) - this.executionProblemCount(right)
      );
    }

    if (sort === 'status') {
      return this.compareExecutionText(left.status, right.status);
    }

    return (
      this.executionActivityDate(left).getTime() -
      this.executionActivityDate(right).getTime()
    );
  }

  private executionScorePercent(row: StaffChecklistRunRow) {
    return this.percent(row.scoreEarned, row.scoreTotal);
  }

  private executionProblemCount(row: StaffChecklistRunRow) {
    return (
      row.failedItems + this.normalizeBlockingIssues(row.blockingIssues).length
    );
  }

  private matchesExecutionScoreFilter(
    scorePercent: number,
    scoreRange: StaffChecklistExecutionScoreFilter,
  ) {
    if (scoreRange === 'lt50') {
      return scorePercent < 50;
    }

    if (scoreRange === '50to79') {
      return scorePercent >= 50 && scorePercent < 80;
    }

    if (scoreRange === '80to99') {
      return scorePercent >= 80 && scorePercent < 100;
    }

    if (scoreRange === '100') {
      return scorePercent === 100;
    }

    return true;
  }

  private compareExecutionText(left: string, right: string) {
    return left.localeCompare(right, 'ru', {
      sensitivity: 'base',
      numeric: true,
    });
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
      runId: this.normalizeOptionalString(query.runId),
      regulationId: this.normalizeOptionalString(query.regulationId),
      templateId: this.normalizeOptionalString(query.templateId),
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
        where.status = { in: ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ESCALATED'] };
        where.scheduledAt = { lt: new Date() };
      } else {
        where.status = filters.status;
      }
    }

    if (filters.shiftKind !== 'all') {
      where.shiftKind = filters.shiftKind;
    }

    if (filters.runId) {
      where.id = filters.runId;
    }

    if (filters.regulationId) {
      where.regulationId = filters.regulationId;
    }

    if (filters.templateId) {
      where.templateId = filters.templateId;
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
      escalated: 0,
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
      } else if (row.status === 'ESCALATED') {
        summary.escalated += 1;
      } else if (row.status === 'CANCELED') {
        summary.canceled += 1;
      }

      if (this.isRunOverdue(row.status, row.scheduledAt, now)) {
        summary.overdue += 1;
      }

      summary.failedItems += row.failedItems;
      summary.blockingIssues += this.normalizeBlockingIssues(
        row.blockingIssues,
      ).length;
    });

    return summary;
  }

  private createExecutionMetrics(): StaffChecklistExecutionMetrics {
    return {
      total: 0,
      open: 0,
      inProgress: 0,
      onReview: 0,
      accepted: 0,
      returned: 0,
      escalated: 0,
      canceled: 0,
      overdue: 0,
      failedItems: 0,
      blockingIssues: 0,
      scoreTotal: 0,
      scoreEarned: 0,
      scorePercent: 0,
      requiredItemsTotal: 0,
      requiredItemsDone: 0,
      requiredPercent: 0,
      evidenceTotal: 0,
      evidenceDone: 0,
      evidencePercent: 0,
    };
  }

  private getExecutionGroup(
    groups: Map<string, StaffChecklistExecutionGroup>,
    key: string,
    label: string,
    caption: string | null,
  ) {
    const current = groups.get(key);

    if (current) {
      return current;
    }

    const group = {
      key,
      label,
      caption,
      ...this.createExecutionMetrics(),
    };

    groups.set(key, group);
    return group;
  }

  private addRunToExecutionMetrics(
    metrics: StaffChecklistExecutionMetrics,
    row: StaffChecklistRunRow,
  ) {
    metrics.total += 1;

    if (row.status === 'OPEN') {
      metrics.open += 1;
    } else if (row.status === 'IN_PROGRESS') {
      metrics.inProgress += 1;
    } else if (row.status === 'ON_REVIEW') {
      metrics.onReview += 1;
    } else if (row.status === 'ACCEPTED') {
      metrics.accepted += 1;
    } else if (row.status === 'RETURNED') {
      metrics.returned += 1;
    } else if (row.status === 'ESCALATED') {
      metrics.escalated += 1;
    } else if (row.status === 'CANCELED') {
      metrics.canceled += 1;
    }

    if (this.isRunOverdue(row.status, row.scheduledAt)) {
      metrics.overdue += 1;
    }

    metrics.failedItems += row.failedItems;
    metrics.blockingIssues += this.normalizeBlockingIssues(
      row.blockingIssues,
    ).length;
    metrics.scoreTotal += row.scoreTotal;
    metrics.scoreEarned += row.scoreEarned;
    metrics.requiredItemsTotal += row.requiredItemsTotal;
    metrics.requiredItemsDone += row.requiredItemsDone;
    metrics.evidenceTotal += row.evidenceTotal;
    metrics.evidenceDone += row.evidenceDone;
  }

  private finalizeExecutionGroups(
    groups: Map<string, StaffChecklistExecutionGroup>,
  ) {
    return [...groups.values()]
      .map((group) => this.finalizeExecutionMetrics(group))
      .sort((left, right) => {
        if (right.failedItems !== left.failedItems) {
          return right.failedItems - left.failedItems;
        }

        return right.total - left.total;
      });
  }

  private finalizeExecutionMetrics<T extends StaffChecklistExecutionMetrics>(
    metrics: T,
  ): T {
    metrics.scorePercent = this.percent(
      metrics.scoreEarned,
      metrics.scoreTotal,
    );
    metrics.requiredPercent = this.percent(
      metrics.requiredItemsDone,
      metrics.requiredItemsTotal,
    );
    metrics.evidencePercent = this.percent(
      metrics.evidenceDone,
      metrics.evidenceTotal,
    );

    return metrics;
  }

  private percent(value: number, total: number) {
    if (total <= 0) {
      return 0;
    }

    return Math.round((value / total) * 100);
  }

  private isRunOverdue(
    status: string,
    scheduledAt: Date | null,
    now = new Date(),
  ) {
    return (
      Boolean(scheduledAt) &&
      scheduledAt! < now &&
      ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ESCALATED'].includes(status)
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
    const isOverdue = this.isRunOverdue(row.status, row.scheduledAt);

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

  private toExecutionRun(
    row: StaffChecklistRunRow,
  ): StaffChecklistExecutionRun {
    const metrics = this.createExecutionMetrics();
    this.addRunToExecutionMetrics(metrics, row);
    const source = this.resolveChecklistSource(row);

    return {
      id: row.id,
      title: row.title,
      status: row.status as StaffChecklistStatus,
      activityDate: this.executionActivityDate(row).toISOString(),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      store: row.store,
      assignedToUser: row.assignedToUser,
      checklist: {
        id: source.id,
        title: source.title,
        type: source.type,
      },
      shift: row.shift
        ? {
            id: row.shift.id,
            externalShiftId: row.shift.externalShiftId,
            startedAt: row.shift.startedAt?.toISOString() ?? null,
            stoppedAt: row.shift.stoppedAt?.toISOString() ?? null,
            store: row.shift.store,
          }
        : null,
      ...this.finalizeExecutionMetrics(metrics),
    };
  }

  private toExecutionExportRow(row: StaffChecklistRunRow): StaffExportCell[] {
    const run = this.toExecutionRun(row);

    return [
      run.id,
      run.title,
      this.checklistSourceLabel(run.checklist.type),
      this.checklistStatusLabel(run.status),
      run.store?.name ?? null,
      staffUserLabel(run.assignedToUser),
      formatStaffDateTime(run.activityDate),
      formatStaffDateTime(run.scheduledAt),
      formatStaffDateTime(run.submittedAt),
      run.shift ? `Смена ${run.shift.externalShiftId}` : null,
      staffYesNo(run.overdue > 0),
      run.failedItems,
      run.blockingIssues,
      run.scorePercent,
      run.requiredPercent,
      run.evidencePercent,
    ];
  }

  private checklistSourceLabel(
    type: StaffChecklistExecutionRun['checklist']['type'],
  ) {
    const labels: Record<
      StaffChecklistExecutionRun['checklist']['type'],
      string
    > = {
      REGULATION: 'Регламент смены',
      TEMPLATE: 'Шаблон чеклиста',
      RUN: 'Разовое выполнение',
    };

    return labels[type];
  }

  private checklistStatusLabel(status: StaffChecklistStatus) {
    const labels: Record<StaffChecklistStatus, string> = {
      OPEN: 'Новый',
      IN_PROGRESS: 'В работе',
      ON_REVIEW: 'На проверке',
      ACCEPTED: 'Принят',
      RETURNED: 'Возвращен',
      ESCALATED: 'Эскалирован',
      CANCELED: 'Отменен',
    };

    return labels[status];
  }

  private resolveChecklistSource(row: StaffChecklistRunRow) {
    if (row.templateId || row.template) {
      return {
        key: `template:${row.templateId ?? 'missing'}`,
        id: row.templateId,
        title: row.template?.title ?? row.title,
        type: 'TEMPLATE' as const,
      };
    }

    if (row.regulationId || row.regulation) {
      return {
        key: `regulation:${row.regulationId ?? 'missing'}`,
        id: row.regulationId,
        title: row.regulation?.title ?? row.title,
        type: 'REGULATION' as const,
      };
    }

    return {
      key: `run:${row.id}`,
      id: null,
      title: row.title,
      type: 'RUN' as const,
    };
  }

  private executionActivityDate(row: StaffChecklistRunRow) {
    return row.startedAt ?? row.scheduledAt ?? row.createdAt;
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
        evidenceAttachments: [],
        reviewThreads: [],
        completedAt: null,
      })),
    );
  }

  private normalizeReviewThreads(value: unknown): StaffChecklistReviewThread[] {
    const rawThreads = Array.isArray(value) ? value : [];

    return rawThreads
      .slice(0, 20)
      .map((thread) => {
        const record = this.asRecord(thread);
        const id = this.normalizeOptionalString(record.id);

        if (!id) {
          return null;
        }

        const rawStatus = this.normalizeOptionalString(record.status);
        const status: StaffChecklistReviewThreadStatus =
          rawStatus === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
        const messages = this.normalizeReviewThreadMessages(record.messages);

        return {
          id,
          status,
          createdByUserId: this.normalizeOptionalString(record.createdByUserId),
          createdAt:
            this.normalizeOptionalString(record.createdAt) ??
            new Date().toISOString(),
          resolvedByUserId:
            status === 'RESOLVED'
              ? this.normalizeOptionalString(record.resolvedByUserId)
              : null,
          resolvedAt:
            status === 'RESOLVED'
              ? this.normalizeOptionalString(record.resolvedAt)
              : null,
          messages,
        } satisfies StaffChecklistReviewThread;
      })
      .filter((thread): thread is StaffChecklistReviewThread =>
        Boolean(thread),
      );
  }

  private normalizeReviewThreadMessages(
    value: unknown,
  ): StaffChecklistReviewThreadMessage[] {
    const rawMessages = Array.isArray(value) ? value : [];

    return rawMessages
      .slice(0, 100)
      .map((message) => {
        const record = this.asRecord(message);
        const id = this.normalizeOptionalString(record.id);
        const body = this.normalizeOptionalString(record.body);

        if (!id || !body) {
          return null;
        }

        return {
          id,
          authorUserId: this.normalizeOptionalString(record.authorUserId),
          authorName:
            this.normalizeOptionalString(record.authorName) ?? 'LeetPlus',
          authorRole: this.normalizeOptionalString(record.authorRole),
          body,
          attachments: this.normalizeEvidenceAttachments(
            record.attachments,
            null,
          ),
          createdAt:
            this.normalizeOptionalString(record.createdAt) ??
            new Date().toISOString(),
        } satisfies StaffChecklistReviewThreadMessage;
      })
      .filter((message): message is StaffChecklistReviewThreadMessage =>
        Boolean(message),
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
        const evidenceAttachments = this.normalizeEvidenceAttachments(
          record.evidenceAttachments,
          evidenceUrl,
        );
        const persistedCompletedAt = this.normalizeOptionalString(
          record.completedAt,
        );
        const completedAt = normalizedStatus
          ? (persistedCompletedAt ?? new Date().toISOString())
          : null;

        return {
          sectionId: section.id,
          itemId: item.id,
          value: this.normalizeOptionalString(record.value),
          status: normalizedStatus,
          note: this.normalizeOptionalString(record.note),
          evidenceUrl,
          evidenceAttachments,
          reviewThreads: this.normalizeReviewThreads(record.reviewThreads),
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

        if (item.evidenceRequired && this.answerHasEvidence(answer)) {
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

        if (item.evidenceRequired && !this.answerHasEvidence(answer)) {
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

  private ensureCanCommentChecklist(
    user: AuthenticatedUser,
    current: { assignedToUserId: string | null },
  ) {
    if (!this.isChecklistUseOnlyUser(user)) {
      return;
    }

    if (current.assignedToUserId && current.assignedToUserId !== user.id) {
      throw new ForbiddenException('Чек-лист недоступен для вашей роли');
    }
  }

  private findChecklistItem(
    sections: StaffChecklistSection[],
    itemId: string,
  ): { section: StaffChecklistSection; item: StaffChecklistItem } | null {
    for (const section of sections) {
      const item = section.items.find((candidate) => candidate.id === itemId);

      if (item) {
        return { section, item };
      }
    }

    return null;
  }

  private resolveChecklistReviewNotificationTarget(
    actor: AuthenticatedUser,
    run: StaffChecklistRunRow,
    thread: StaffChecklistReviewThread,
  ) {
    if (
      !this.isChecklistUseOnlyUser(actor) &&
      run.assignedToUserId &&
      run.assignedToUserId !== actor.id
    ) {
      return run.assignedToUserId;
    }

    const lastParticipant = [...thread.messages]
      .reverse()
      .find(
        (message) => message.authorUserId && message.authorUserId !== actor.id,
      );

    return (
      lastParticipant?.authorUserId ??
      run.reviewedByUserId ??
      run.createdByUserId ??
      null
    );
  }

  private async createChecklistReviewNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actor: AuthenticatedUser,
    run: StaffChecklistRunRow,
    source: { section: StaffChecklistSection; item: StaffChecklistItem },
    thread: StaffChecklistReviewThread,
    message: StaffChecklistReviewThreadMessage,
  ) {
    const targetUserId = this.resolveChecklistReviewNotificationTarget(
      actor,
      run,
      thread,
    );

    if (!targetUserId || targetUserId === actor.id) {
      return;
    }

    await tx.staffNotification.create({
      data: {
        tenantId,
        storeId: run.storeId,
        targetUserId,
        sourceType: 'STAFF_CHECKLIST_REVIEW',
        sourceId: `${run.id}:${source.item.id}`,
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Нужно уточнение по чек-листу',
        message: [
          `Чек-лист: ${run.title}`,
          `Пункт: ${source.item.title}`,
          `Комментарий: ${message.body}`,
        ].join('\n'),
        actionLabel: 'Открыть комментарий',
        actionHref: `/staff/checklists?runId=${run.id}&itemId=${source.item.id}#item-${source.item.id}`,
        dedupeKey: `staff-checklist-review:${run.id}:${source.item.id}:${message.id}`,
        metadata: {
          checklistRunId: run.id,
          sectionId: source.section.id,
          itemId: source.item.id,
          threadId: thread.id,
          messageId: message.id,
        },
      },
    });
  }

  private async createChecklistReviewResolvedNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actor: AuthenticatedUser,
    run: StaffChecklistRunRow,
    source: { section: StaffChecklistSection; item: StaffChecklistItem },
    thread: StaffChecklistReviewThread,
  ) {
    if (!run.assignedToUserId || run.assignedToUserId === actor.id) {
      return;
    }

    await tx.staffNotification.create({
      data: {
        tenantId,
        storeId: run.storeId,
        targetUserId: run.assignedToUserId,
        sourceType: 'STAFF_CHECKLIST_REVIEW',
        sourceId: `${run.id}:${source.item.id}`,
        severity: 'INFO',
        status: 'OPEN',
        title: 'Уточнение по чек-листу зачтено',
        message: [
          `Чек-лист: ${run.title}`,
          `Пункт: ${source.item.title}`,
          'Проверяющий зачел выполнение пункта.',
        ].join('\n'),
        actionLabel: 'Открыть чек-лист',
        actionHref: `/staff/checklists?runId=${run.id}&itemId=${source.item.id}#item-${source.item.id}`,
        dedupeKey: `staff-checklist-review-resolved:${run.id}:${source.item.id}:${thread.id}:${thread.resolvedAt}`,
        metadata: {
          checklistRunId: run.id,
          sectionId: source.section.id,
          itemId: source.item.id,
          threadId: thread.id,
        },
      },
    });
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
            this.formatAnswerEvidenceLinks(answer),
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

  private async createChecklistEscalationMessage(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    run: StaffChecklistRunRow,
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
    metrics: Metrics,
    reviewComment: string | null,
  ) {
    const channelId = await this.ensureDefaultChatChannel(tx, tenantId);
    const message = await tx.staffChatMessage.create({
      data: {
        tenantId,
        channelId,
        authorUserId: actorUserId,
        storeId: run.storeId,
        body: this.buildChecklistEscalationBody(
          run,
          sections,
          answers,
          metrics,
          reviewComment,
        ),
        kind: 'INCIDENT',
        priority: 'URGENT',
        isPinned: true,
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
          name: STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
        },
      },
      create: {
        tenantId,
        name: STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
        description: STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
        scope: 'NETWORK',
        isDefault: true,
      },
      update: {
        description: STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
        isDefault: true,
        isArchived: false,
        scope: 'NETWORK',
        storeId: null,
        roleScope: null,
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

  private buildChecklistEscalationBody(
    run: StaffChecklistRunRow,
    sections: StaffChecklistSection[],
    answers: StaffChecklistAnswer[],
    metrics: Metrics,
    reviewComment: string | null,
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
        const note = answer.note ? ` - ${answer.note}` : '';
        return `- ${title}${note}`;
      });
    const assignedTo =
      run.assignedToUser?.fullName ?? run.assignedToUser?.email ?? null;
    const score =
      metrics.scoreTotal > 0
        ? `${metrics.scoreEarned}/${metrics.scoreTotal}`
        : 'без баллов';

    return [
      'Чеклист эскалирован менеджером.',
      '',
      `Чеклист: ${run.title}`,
      `Клуб: ${run.store?.name ?? 'вся сеть'}`,
      assignedTo ? `Ответственный: ${assignedTo}` : null,
      reviewComment ? `Комментарий проверки: ${reviewComment}` : null,
      `Проблемных пунктов: ${metrics.failedItems}`,
      `Блокеров сдачи: ${metrics.blockingIssues.length}`,
      `Оценка: ${score}`,
      '',
      failedLines.length > 0 ? 'Проблемные пункты:' : null,
      ...failedLines,
      metrics.failedItems > failedLines.length
        ? `- Еще ${metrics.failedItems - failedLines.length} пункт(ов)`
        : null,
      '',
      'Источник: эскалация чеклиста смены LeetPlus.',
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

  private normalizeDateFilter(value: unknown) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date filter');
    }

    return normalized;
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

  private answerHasEvidence(answer: StaffChecklistAnswer | undefined) {
    return Boolean(
      answer?.evidenceUrl || (answer?.evidenceAttachments?.length ?? 0) > 0,
    );
  }

  private formatAnswerEvidenceLinks(answer: StaffChecklistAnswer) {
    const links = [
      ...answer.evidenceAttachments.map((attachment) => attachment.url),
      answer.evidenceUrl,
    ].filter((value): value is string => Boolean(value));
    const uniqueLinks = Array.from(new Set(links));

    return uniqueLinks.length > 0
      ? `Доказательства: ${uniqueLinks.join(', ')}`
      : null;
  }

  private normalizeEvidenceAttachments(
    value: unknown,
    fallbackUrl: string | null,
  ): StaffChecklistEvidenceAttachment[] {
    const rawAttachments = Array.isArray(value) ? value : [];
    const attachments = new Map<string, StaffChecklistEvidenceAttachment>();

    for (const attachment of rawAttachments.slice(0, 20)) {
      const record = this.asRecord(attachment);
      const url = this.normalizeEvidenceUrl(record.url);

      if (!url) {
        continue;
      }

      attachments.set(url, {
        id: this.normalizeOptionalString(record.id) ?? url,
        fileName: this.normalizeOptionalString(record.fileName) ?? 'Файл',
        contentType:
          this.normalizeOptionalString(record.contentType) ??
          'application/octet-stream',
        byteSize: this.normalizeAttachmentByteSize(record.byteSize),
        url,
        createdAt: this.normalizeOptionalString(record.createdAt) ?? '',
      });
    }

    if (fallbackUrl && !attachments.has(fallbackUrl)) {
      attachments.set(fallbackUrl, {
        id: fallbackUrl,
        fileName: 'Доказательство',
        contentType: 'text/uri-list',
        byteSize: 0,
        url: fallbackUrl,
        createdAt: '',
      });
    }

    return Array.from(attachments.values());
  }

  private normalizeAttachmentByteSize(value: unknown) {
    const size =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : 0;

    if (!Number.isFinite(size)) {
      return 0;
    }

    return Math.min(Math.max(Math.trunc(size), 0), 50 * 1024 * 1024);
  }

  private normalizeEvidenceUrl(value: unknown) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('/staff/attachments/')) {
      return normalized;
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
