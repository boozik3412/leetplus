import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  StaffOperationsDashboardService,
  type StaffOperationsDashboard,
  type StaffOperationsRiskItem,
} from './staff-operations-dashboard.service';

const regulationSelect = {
  id: true,
  title: true,
  description: true,
  shiftKind: true,
  status: true,
  roleScope: true,
  version: true,
  sections: true,
  publishedAt: true,
  updatedAt: true,
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffShiftRegulationSelect;

const knowledgeArticleSelect = {
  id: true,
  title: true,
  summary: true,
  folder: true,
  category: true,
  roleScope: true,
  status: true,
  tags: true,
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffKnowledgeArticleSelect;

const trainingCourseSelect = {
  id: true,
  title: true,
  description: true,
  roleScope: true,
  status: true,
  required: true,
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffTrainingCourseSelect;

const assessmentSelect = {
  id: true,
  title: true,
  description: true,
  roleScope: true,
  status: true,
  assessmentKind: true,
  passThreshold: true,
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffAssessmentSelect;

type StoreOption = { id: string; name: string; isActive: boolean };
type UserOption = { id: string; email: string; fullName: string | null };
type StaffOperationsRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type RegulationRow = Prisma.StaffShiftRegulationGetPayload<{
  select: typeof regulationSelect;
}>;
type KnowledgeArticleRow = Prisma.StaffKnowledgeArticleGetPayload<{
  select: typeof knowledgeArticleSelect;
}>;
type TrainingCourseRow = Prisma.StaffTrainingCourseGetPayload<{
  select: typeof trainingCourseSelect;
}>;
type AssessmentRow = Prisma.StaffAssessmentGetPayload<{
  select: typeof assessmentSelect;
}>;

type ResolvedStaffAiAssistantFilters = {
  dateFrom: string;
  dateTo: string;
  start: Date;
  end: Date;
  storeId: string | null;
  userId: string | null;
  search: string | null;
};

type RegulationSection = {
  id: string;
  title: string;
  description: string | null;
  items: RegulationItem[];
};

type RegulationItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: string;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffAiAssistantQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  search?: string;
};

export type StaffAiInsight = {
  id: string;
  title: string;
  detail: string;
  tone: StaffOperationsRiskLevel;
  href: string | null;
};

export type StaffAiActionDraft = {
  id: string;
  title: string;
  detail: string;
  actionType:
    | 'TASK'
    | 'CHECKLIST'
    | 'KNOWLEDGE_MATERIAL'
    | 'TRAINING'
    | 'RETEST'
    | 'REVIEW';
  priority: StaffOperationsRiskLevel;
  sourceHref: string | null;
};

export type StaffAiChecklistDraft = {
  id: string;
  title: string;
  sourceTitle: string;
  sourceStatus: string;
  shiftKind: string;
  roleScope: string;
  store: StoreOption | null;
  sectionsCount: number;
  itemsCount: number;
  requiredItems: number;
  evidenceItems: number;
  checklistItems: Array<{
    title: string;
    sectionTitle: string;
    required: boolean;
    evidenceRequired: boolean;
    score: number;
  }>;
  publicationGuard: string;
  sourceHref: string;
};

export type StaffAiInstructionDraft = {
  id: string;
  title: string;
  sourceTitle: string;
  shiftKind: string;
  store: StoreOption | null;
  shortSteps: string[];
  controlPoints: string[];
  sourceHref: string;
};

export type StaffAiTaskDecompositionDraft = {
  id: string;
  title: string;
  priority: StaffOperationsRiskLevel;
  dueInDays: number;
  tasks: Array<{ title: string; detail: string; href: string | null }>;
  sourceHref: string | null;
};

export type StaffAiWeakSpotRecommendation = {
  id: string;
  title: string;
  detail: string;
  scopeLabel: string;
  occurrences: number;
  failedRuns: number;
  priority: StaffOperationsRiskLevel;
  recommendedAction: 'KNOWLEDGE_MATERIAL' | 'RETEST' | 'FOLLOW_UP_TASK';
  matchedMaterials: Array<{ id: string; title: string; href: string }>;
  matchedCourses: Array<{ id: string; title: string; href: string }>;
  matchedAssessments: Array<{ id: string; title: string; href: string }>;
  sourceHref: string;
};

export type StaffAiAssistantReport = {
  filters: {
    dateFrom: string;
    dateTo: string;
    storeId: string | null;
    userId: string | null;
    search: string | null;
  };
  generatedAt: string;
  dataPolicy: {
    mode: 'LOCAL_DETERMINISTIC';
    notes: string[];
  };
  managerSummary: {
    title: string;
    periodLabel: string;
    highlights: StaffAiInsight[];
    risks: StaffAiInsight[];
    recommendedActions: StaffAiActionDraft[];
  };
  checklistDrafts: StaffAiChecklistDraft[];
  shiftInstructionDrafts: StaffAiInstructionDraft[];
  taskDecompositionDrafts: StaffAiTaskDecompositionDraft[];
  weakSpotRecommendations: StaffAiWeakSpotRecommendation[];
  sourceCoverage: {
    tasks: number;
    checklists: number;
    recurringIssues: number;
    regulations: number;
    knowledgeMaterials: number;
    trainingCourses: number;
    assessments: number;
    disciplineRecords: number;
  };
  stores: StoreOption[];
  users: UserOption[];
};

@Injectable()
export class StaffAiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffOperationsDashboardService: StaffOperationsDashboardService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: StaffAiAssistantQuery = {},
  ): Promise<StaffAiAssistantReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const dashboard = await this.staffOperationsDashboardService.getDashboard(
      user,
      {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId ?? undefined,
        userId: filters.userId ?? undefined,
        search: filters.search ?? undefined,
      },
    );

    const [
      regulations,
      knowledgeArticles,
      trainingCourses,
      assessments,
      disciplineRecords,
    ] = await Promise.all([
      this.prisma.staffShiftRegulation.findMany({
        where: this.buildRegulationWhere(tenantId, filters),
        select: regulationSelect,
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.staffKnowledgeArticle.findMany({
        where: this.buildKnowledgeWhere(tenantId, filters),
        select: knowledgeArticleSelect,
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
      }),
      this.prisma.staffTrainingCourse.findMany({
        where: this.buildTrainingWhere(tenantId, filters),
        select: trainingCourseSelect,
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        take: 30,
      }),
      this.prisma.staffAssessment.findMany({
        where: this.buildAssessmentWhere(tenantId, filters),
        select: assessmentSelect,
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        take: 30,
      }),
      this.prisma.staffDisciplineRecord.count({
        where: this.buildDisciplineWhere(tenantId, filters),
      }),
    ]);

    const generatedAt = new Date();

    return {
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        userId: filters.userId,
        search: filters.search,
      },
      generatedAt: generatedAt.toISOString(),
      dataPolicy: {
        mode: 'LOCAL_DETERMINISTIC',
        notes: [
          'Помощник использует только данные текущего tenant и не отправляет персональные данные во внешние AI-провайдеры.',
          'Все результаты являются черновиками: публикация, назначение задач, обучение и retest требуют отдельного действия пользователя.',
          'Гостевые персональные данные не попадают в отчет помощника; используются только агрегированные staff-сигналы.',
        ],
      },
      managerSummary: this.buildManagerSummary(dashboard, filters),
      checklistDrafts: this.buildChecklistDrafts(regulations),
      shiftInstructionDrafts: this.buildInstructionDrafts(regulations),
      taskDecompositionDrafts: this.buildTaskDecompositions(dashboard),
      weakSpotRecommendations: this.buildWeakSpotRecommendations(
        dashboard,
        knowledgeArticles,
        trainingCourses,
        assessments,
      ),
      sourceCoverage: {
        tasks: dashboard.summary.tasksTotal,
        checklists: dashboard.summary.checklistsTotal,
        recurringIssues: dashboard.recurringIssues.length,
        regulations: regulations.length,
        knowledgeMaterials: knowledgeArticles.length,
        trainingCourses: trainingCourses.length,
        assessments: assessments.length,
        disciplineRecords,
      },
      stores: dashboard.stores,
      users: dashboard.users,
    };
  }

  private buildManagerSummary(
    dashboard: StaffOperationsDashboard,
    filters: ResolvedStaffAiAssistantFilters,
  ): StaffAiAssistantReport['managerSummary'] {
    const summary = dashboard.summary;
    const highlights: StaffAiInsight[] = [
      {
        id: 'operational-score',
        title: `Индекс дисциплины ${summary.operationalScore}%`,
        detail: `В срок закрыто ${summary.doneOnTime}, задач ${summary.tasksTotal}, чек-листов ${summary.checklistsTotal}.`,
        tone: summary.riskLevel,
        href: '/staff/operations-dashboard',
      },
      {
        id: 'shift-linking',
        title: `Смены Langame: ${dashboard.staffControl.summary.shiftsTotal}`,
        detail: `Привязано ${dashboard.staffControl.summary.linkedShifts}, без привязки ${dashboard.staffControl.summary.unlinkedShifts}.`,
        tone:
          dashboard.staffControl.summary.unlinkedShifts > 0 ? 'MEDIUM' : 'LOW',
        href: '/guests/staff-control/operators',
      },
    ];
    const risks: StaffAiInsight[] = [
      {
        id: 'overdue',
        title: `Просрочено: ${summary.overdue}`,
        detail: 'Задачи и чек-листы, которые требуют реакции руководителя.',
        tone: summary.overdue > 0 ? 'HIGH' : 'LOW',
        href: '/staff/tasks?view=overdue',
      },
      {
        id: 'failed-items',
        title: `Проваленные пункты: ${summary.failedItems}`,
        detail:
          'Сигнал для обучения, доработки регламентов и контрольных задач.',
        tone: summary.failedItems > 0 ? 'HIGH' : 'LOW',
        href: '/staff/checklists/report',
      },
      {
        id: 'recurring-issues',
        title: `Повторяющиеся слабые места: ${summary.recurringIssues}`,
        detail:
          'Повторы подходят для статьи базы знаний, retest или регулярного контроля.',
        tone: summary.recurringIssues > 0 ? 'MEDIUM' : 'LOW',
        href: '/staff/knowledge-base',
      },
    ];

    const recommendedActions = dashboard.latestRisks
      .slice(0, 6)
      .map((risk) => this.riskToActionDraft(risk));

    if (recommendedActions.length === 0) {
      recommendedActions.push({
        id: 'keep-control-loop',
        title: 'Закрепить текущую дисциплину',
        detail:
          'Критичных сигналов нет: можно проверить обновление регламентов, обязательные материалы и готовность к сменам.',
        actionType: 'REVIEW',
        priority: 'LOW',
        sourceHref: '/staff/readiness-report',
      });
    }

    return {
      title: 'Еженедельная сводка руководителя',
      periodLabel: `${filters.dateFrom} - ${filters.dateTo}`,
      highlights,
      risks,
      recommendedActions,
    };
  }

  private buildChecklistDrafts(
    regulations: RegulationRow[],
  ): StaffAiChecklistDraft[] {
    return regulations
      .map((regulation) => {
        const sections = this.normalizeSections(regulation.sections);
        const items = sections.flatMap((section) =>
          section.items.map((item) => ({
            title: item.title,
            sectionTitle: section.title,
            required: item.required,
            evidenceRequired: item.evidenceRequired,
            score: item.score,
          })),
        );

        return {
          id: `checklist-draft:${regulation.id}`,
          title: `Чек-лист: ${regulation.title}`,
          sourceTitle: regulation.title,
          sourceStatus: regulation.status,
          shiftKind: regulation.shiftKind,
          roleScope: regulation.roleScope,
          store: regulation.store,
          sectionsCount: sections.length,
          itemsCount: items.length,
          requiredItems: items.filter((item) => item.required).length,
          evidenceItems: items.filter((item) => item.evidenceRequired).length,
          checklistItems: items.slice(0, 12),
          publicationGuard:
            'Черновик не создает шаблон чек-листа и не публикуется без явного подтверждения.',
          sourceHref: `/staff/shift-regulations?search=${encodeURIComponent(regulation.title)}`,
        };
      })
      .filter((draft) => draft.itemsCount > 0)
      .slice(0, 6);
  }

  private buildInstructionDrafts(
    regulations: RegulationRow[],
  ): StaffAiInstructionDraft[] {
    return regulations
      .map((regulation) => {
        const sections = this.normalizeSections(regulation.sections);
        const sectionSteps = sections.flatMap((section) =>
          section.items.map((item) => this.instructionLine(section, item)),
        );
        const controlPoints = sections.flatMap((section) =>
          section.items
            .filter((item) => item.required || item.evidenceRequired)
            .map((item) => {
              const evidence = item.evidenceRequired
                ? 'нужно доказательство'
                : 'обязательный пункт';
              return `${section.title}: ${item.title} (${evidence})`;
            }),
        );

        return {
          id: `instruction-draft:${regulation.id}`,
          title: `Короткая инструкция: ${regulation.title}`,
          sourceTitle: regulation.title,
          shiftKind: regulation.shiftKind,
          store: regulation.store,
          shortSteps: sectionSteps.slice(0, 8),
          controlPoints: controlPoints.slice(0, 6),
          sourceHref: `/staff/shift-regulations?search=${encodeURIComponent(regulation.title)}`,
        };
      })
      .filter((draft) => draft.shortSteps.length > 0)
      .slice(0, 6);
  }

  private buildTaskDecompositions(
    dashboard: StaffOperationsDashboard,
  ): StaffAiTaskDecompositionDraft[] {
    const fromRisks = dashboard.latestRisks.slice(0, 5).map((risk) => ({
      id: `risk-decomposition:${risk.id}`,
      title: `Разобрать: ${risk.title}`,
      priority: risk.severity,
      dueInDays:
        risk.severity === 'HIGH' ? 1 : risk.severity === 'MEDIUM' ? 3 : 7,
      tasks: [
        {
          title: 'Проверить источник сигнала',
          detail: risk.detail,
          href: risk.href,
        },
        {
          title: 'Назначить ответственное действие',
          detail:
            risk.severity === 'HIGH'
              ? 'Поставить задачу руководителю клуба или старшему администратору на ближайшую смену.'
              : 'Запланировать контрольную задачу и зафиксировать ожидаемый результат.',
          href: '/staff/tasks',
        },
        {
          title: 'Закрыть обучающий контур',
          detail:
            'Если причина повторяется, привязать материал базы знаний, курс или retest.',
          href: '/staff/knowledge-base',
        },
      ],
      sourceHref: risk.href,
    }));

    const fromRecurringIssues = dashboard.recurringIssues
      .slice(0, 4)
      .map((issue) => ({
        id: `issue-decomposition:${issue.id}`,
        title: `Снять повтор: ${issue.title}`,
        priority: issue.riskLevel,
        dueInDays: issue.riskLevel === 'HIGH' ? 2 : 5,
        tasks: [
          {
            title: 'Разобрать последний провал',
            detail: `${issue.occurrences} повторов в ${issue.failedRuns} выполнениях.`,
            href: issue.href,
          },
          {
            title: 'Обновить стандарт или чек-лист',
            detail:
              'Уточнить формулировку действия и критерий приемки результата.',
            href: '/staff/shift-regulations',
          },
          {
            title: 'Проверить закрепление',
            detail: 'Назначить материал или retest сотрудникам из зоны риска.',
            href: '/staff/assessments',
          },
        ],
        sourceHref: issue.href,
      }));

    return [...fromRisks, ...fromRecurringIssues].slice(0, 8);
  }

  private buildWeakSpotRecommendations(
    dashboard: StaffOperationsDashboard,
    articles: KnowledgeArticleRow[],
    courses: TrainingCourseRow[],
    assessments: AssessmentRow[],
  ): StaffAiWeakSpotRecommendation[] {
    return dashboard.recurringIssues.slice(0, 8).map((issue) => {
      const tokens = this.textTokens(issue.title);
      const matchedMaterials = this.matchKnowledgeArticles(tokens, articles);
      const matchedCourses = this.matchTrainingCourses(tokens, courses);
      const matchedAssessments = this.matchAssessments(tokens, assessments);
      const recommendedAction =
        matchedMaterials.length === 0
          ? 'KNOWLEDGE_MATERIAL'
          : matchedAssessments.length === 0
            ? 'RETEST'
            : 'FOLLOW_UP_TASK';

      return {
        id: `weak-spot:${issue.id}`,
        title: issue.title,
        detail: `Повторялось ${issue.occurrences} раз в ${issue.failedRuns} выполнениях. Последний источник: ${issue.latestRunTitle}.`,
        scopeLabel: issue.scopeLabel,
        occurrences: issue.occurrences,
        failedRuns: issue.failedRuns,
        priority: issue.riskLevel,
        recommendedAction,
        matchedMaterials,
        matchedCourses,
        matchedAssessments,
        sourceHref: issue.href,
      };
    });
  }

  private riskToActionDraft(risk: StaffOperationsRiskItem): StaffAiActionDraft {
    if (risk.kind === 'TASK_OVERDUE' || risk.kind === 'TASK_UNCHECKED') {
      return {
        id: `action:${risk.id}`,
        title:
          risk.kind === 'TASK_OVERDUE'
            ? 'Закрыть просрочку'
            : 'Проверить результат',
        detail: `${risk.title}: ${risk.detail}`,
        actionType: 'TASK',
        priority: risk.severity,
        sourceHref: risk.href,
      };
    }

    if (risk.kind.startsWith('CHECKLIST')) {
      return {
        id: `action:${risk.id}`,
        title: 'Разобрать чек-лист смены',
        detail: `${risk.title}: ${risk.detail}`,
        actionType: 'CHECKLIST',
        priority: risk.severity,
        sourceHref: risk.href,
      };
    }

    return {
      id: `action:${risk.id}`,
      title: 'Проверить операционный сигнал',
      detail: `${risk.title}: ${risk.detail}`,
      actionType: 'REVIEW',
      priority: risk.severity,
      sourceHref: risk.href,
    };
  }

  private buildRegulationWhere(
    tenantId: string,
    filters: ResolvedStaffAiAssistantFilters,
  ): Prisma.StaffShiftRegulationWhereInput {
    const where: Prisma.StaffShiftRegulationWhereInput = {
      tenantId,
      status: { in: ['PUBLISHED', 'DRAFT'] },
      ...(filters.storeId
        ? { OR: [{ storeId: filters.storeId }, { storeId: null }] }
        : {}),
    };

    return this.withSearch(where, filters.search, [
      'title',
      'description',
      'shiftKind',
      'roleScope',
    ]);
  }

  private buildKnowledgeWhere(
    tenantId: string,
    filters: ResolvedStaffAiAssistantFilters,
  ): Prisma.StaffKnowledgeArticleWhereInput {
    const where: Prisma.StaffKnowledgeArticleWhereInput = {
      tenantId,
      status: { in: ['PUBLISHED', 'DRAFT', 'REVIEW'] },
      ...(filters.storeId
        ? { OR: [{ storeId: filters.storeId }, { storeId: null }] }
        : {}),
    };

    return this.withSearch(where, filters.search, [
      'title',
      'summary',
      'folder',
      'category',
      'roleScope',
    ]);
  }

  private buildTrainingWhere(
    tenantId: string,
    filters: ResolvedStaffAiAssistantFilters,
  ): Prisma.StaffTrainingCourseWhereInput {
    const where: Prisma.StaffTrainingCourseWhereInput = {
      tenantId,
      status: { in: ['ACTIVE', 'DRAFT'] },
      ...(filters.storeId
        ? { OR: [{ storeId: filters.storeId }, { storeId: null }] }
        : {}),
    };

    return this.withSearch(where, filters.search, [
      'title',
      'description',
      'roleScope',
    ]);
  }

  private buildAssessmentWhere(
    tenantId: string,
    filters: ResolvedStaffAiAssistantFilters,
  ): Prisma.StaffAssessmentWhereInput {
    const where: Prisma.StaffAssessmentWhereInput = {
      tenantId,
      status: { in: ['ACTIVE', 'DRAFT'] },
      ...(filters.storeId
        ? { OR: [{ storeId: filters.storeId }, { storeId: null }] }
        : {}),
    };

    return this.withSearch(where, filters.search, [
      'title',
      'description',
      'roleScope',
      'assessmentKind',
    ]);
  }

  private buildDisciplineWhere(
    tenantId: string,
    filters: ResolvedStaffAiAssistantFilters,
  ): Prisma.StaffDisciplineRecordWhereInput {
    const where: Prisma.StaffDisciplineRecordWhereInput = {
      tenantId,
      occurredAt: { gte: filters.start, lte: filters.end },
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    return this.withSearch(where, filters.search, [
      'categorySnapshot',
      'ruleTitleSnapshot',
      'comment',
    ]);
  }

  private withSearch<T extends { AND?: unknown }>(
    where: T,
    search: string | null,
    fields: string[],
  ): T {
    if (!search) {
      return where;
    }

    const existingAnd: unknown[] = Array.isArray(where.AND) ? where.AND : [];

    return {
      ...where,
      AND: [
        ...existingAnd,
        {
          OR: fields.map((field) => ({
            [field]: { contains: search, mode: 'insensitive' },
          })),
        },
      ],
    };
  }

  private matchKnowledgeArticles(
    tokens: string[],
    articles: KnowledgeArticleRow[],
  ) {
    return articles
      .filter((article) =>
        this.hasTokenMatch(tokens, [
          article.title,
          article.summary,
          article.folder,
          article.category,
          ...article.tags,
        ]),
      )
      .slice(0, 3)
      .map((article) => ({
        id: article.id,
        title: article.title,
        href: `/staff/knowledge-base?search=${encodeURIComponent(article.title)}`,
      }));
  }

  private matchTrainingCourses(tokens: string[], courses: TrainingCourseRow[]) {
    return courses
      .filter((course) =>
        this.hasTokenMatch(tokens, [
          course.title,
          course.description,
          course.roleScope,
        ]),
      )
      .slice(0, 3)
      .map((course) => ({
        id: course.id,
        title: course.title,
        href: `/staff/training-courses?search=${encodeURIComponent(course.title)}`,
      }));
  }

  private matchAssessments(tokens: string[], assessments: AssessmentRow[]) {
    return assessments
      .filter((assessment) =>
        this.hasTokenMatch(tokens, [
          assessment.title,
          assessment.description,
          assessment.roleScope,
          assessment.assessmentKind,
        ]),
      )
      .slice(0, 3)
      .map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        href: `/staff/assessments?search=${encodeURIComponent(assessment.title)}`,
      }));
  }

  private hasTokenMatch(tokens: string[], values: Array<string | null>) {
    if (tokens.length === 0) {
      return false;
    }

    const haystack = values
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();

    return tokens.some((token) => haystack.includes(token));
  }

  private textTokens(value: string) {
    return value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .slice(0, 12);
  }

  private instructionLine(section: RegulationSection, item: RegulationItem) {
    const instruction = item.instruction ? ` - ${item.instruction}` : '';
    return `${section.title}: ${item.title}${instruction}`;
  }

  private normalizeSections(value: unknown): RegulationSection[] {
    const rawSections = Array.isArray(value) ? value : [];

    return rawSections
      .slice(0, 20)
      .map((section, sectionIndex) => {
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
      })
      .filter((section) => section.items.length > 0);
  }

  private normalizeItem(value: unknown, index: number): RegulationItem {
    const item = this.asRecord(value);

    return {
      id: this.normalizeOptionalString(item.id) ?? `item-${index + 1}`,
      title: this.normalizeOptionalString(item.title) ?? '',
      instruction: this.normalizeOptionalString(item.instruction),
      valueType: this.normalizeOptionalString(item.valueType) ?? 'CHECKBOX',
      required: this.normalizeBoolean(item.required, true),
      evidenceRequired: this.normalizeBoolean(item.evidenceRequired, false),
      score: this.normalizeScore(item.score),
    };
  }

  private resolveFilters(
    query: StaffAiAssistantQuery,
  ): ResolvedStaffAiAssistantFilters {
    const dateTo =
      this.normalizeDate(query.dateTo) ?? this.toDateOnly(new Date());
    const dateFrom =
      this.normalizeDate(query.dateFrom) ??
      this.toDateOnly(this.addDays(new Date(`${dateTo}T00:00:00.000Z`), -6));
    const start = new Date(`${dateFrom}T00:00:00.000Z`);
    const end = new Date(`${dateTo}T23:59:59.999Z`);

    if (start > end) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    return {
      dateFrom,
      dateTo,
      start,
      end,
      storeId: this.normalizeOptionalString(query.storeId),
      userId: this.normalizeOptionalString(query.userId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private normalizeDate(value: string | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('Date must use YYYY-MM-DD format');
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
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.min(Math.round(parsed), 100);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }
}
