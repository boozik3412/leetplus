import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  StaffReadinessReportService,
  type StaffReadinessRow,
  type StaffReadinessStatus,
} from './staff-readiness-report.service';

const taskClosedStatuses = ['DONE', 'CANCELED'];
const checklistClosedStatuses = ['ACCEPTED', 'CANCELED', 'RETURNED'];

const taskDashboardSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  priority: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  store: { select: { id: true, name: true, isActive: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffTaskSelect;

const checklistDashboardSelect = {
  id: true,
  title: true,
  shiftKind: true,
  status: true,
  scheduledAt: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  scoreTotal: true,
  scoreEarned: true,
  failedItems: true,
  blockingIssues: true,
  sectionsSnapshot: true,
  answers: true,
  reviewComment: true,
  store: { select: { id: true, name: true, isActive: true } },
  assignedToUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffChecklistRunSelect;

type TaskDashboardRow = Prisma.StaffTaskGetPayload<{
  select: typeof taskDashboardSelect;
}>;

type ChecklistDashboardRow = Prisma.StaffChecklistRunGetPayload<{
  select: typeof checklistDashboardSelect;
}>;

type StoreOption = { id: string; name: string; isActive: boolean };
type UserOption = { id: string; email: string; fullName: string | null };

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type StaffOperationsDashboardQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  search?: string;
};

type ResolvedStaffOperationsDashboardFilters = {
  dateFrom: string;
  dateTo: string;
  start: Date;
  end: Date;
  storeId: string | null;
  userId: string | null;
  search: string | null;
};

export type StaffOperationsDashboard = {
  filters: {
    dateFrom: string;
    dateTo: string;
    storeId: string | null;
    userId: string | null;
    search: string | null;
  };
  summary: StaffOperationsSummary;
  clubs: StaffOperationsRating[];
  employees: StaffOperationsEmployeeRating[];
  recurringIssues: StaffOperationsRecurringIssue[];
  latestRisks: StaffOperationsRiskItem[];
  stores: StoreOption[];
  users: UserOption[];
};

export type StaffOperationsSummary = {
  totalSignals: number;
  tasksTotal: number;
  checklistsTotal: number;
  doneOnTime: number;
  overdue: number;
  failedItems: number;
  returned: number;
  unchecked: number;
  readinessBlocked: number;
  recurringIssues: number;
  operationalScore: number;
  riskLevel: RiskLevel;
};

export type StaffOperationsRating = {
  id: string;
  label: string;
  caption: string | null;
  score: number;
  riskLevel: RiskLevel;
  tasksTotal: number;
  checklistsTotal: number;
  doneOnTime: number;
  overdue: number;
  failedItems: number;
  returned: number;
  unchecked: number;
  readinessBlocked: number;
  readinessAttention: number;
  repeatedIssues: number;
  scorePercent: number;
  href: string | null;
};

export type StaffOperationsEmployeeRating = StaffOperationsRating & {
  user: UserOption | null;
  readinessStatus: StaffReadinessStatus | null;
  readinessPercent: number | null;
  trainingBlockers: number;
};

export type StaffOperationsRecurringIssue = {
  id: string;
  title: string;
  scopeLabel: string;
  club: StoreOption | null;
  employee: UserOption | null;
  shiftKind: string;
  occurrences: number;
  failedRuns: number;
  firstSeen: string;
  lastSeen: string;
  latestRunTitle: string;
  riskLevel: RiskLevel;
  href: string;
};

export type StaffOperationsRiskItem = {
  id: string;
  kind:
    | 'TASK_OVERDUE'
    | 'TASK_UNCHECKED'
    | 'CHECKLIST_RETURNED'
    | 'CHECKLIST_FAILED'
    | 'CHECKLIST_UNCHECKED';
  title: string;
  detail: string;
  severity: RiskLevel;
  date: string;
  store: StoreOption | null;
  user: UserOption | null;
  href: string;
};

type DisciplineMetrics = {
  tasksTotal: number;
  taskDone: number;
  taskDoneOnTime: number;
  taskOverdue: number;
  taskUnchecked: number;
  checklistsTotal: number;
  checklistAccepted: number;
  checklistDoneOnTime: number;
  checklistOverdue: number;
  checklistReturned: number;
  checklistUnchecked: number;
  failedItems: number;
  readinessBlocked: number;
  readinessAttention: number;
  repeatedIssues: number;
  scoreTotal: number;
  scoreEarned: number;
};

type RatingDraft = DisciplineMetrics & {
  id: string;
  label: string;
  caption: string | null;
  href: string | null;
};

type EmployeeRatingDraft = RatingDraft & {
  user: UserOption | null;
  readinessStatus: StaffReadinessStatus | null;
  readinessPercent: number | null;
  trainingBlockers: number;
};

type FailedIssue = {
  title: string;
  date: Date;
  run: ChecklistDashboardRow;
};

@Injectable()
export class StaffOperationsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffReadinessReportService: StaffReadinessReportService,
  ) {}

  async getDashboard(
    user: AuthenticatedUser,
    query: StaffOperationsDashboardQuery = {},
  ): Promise<StaffOperationsDashboard> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);

    const [tasks, checklists, stores, users, readiness] = await Promise.all([
      this.prisma.staffTask.findMany({
        where: this.buildTaskWhere(tenantId, filters),
        select: taskDashboardSelect,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 5000,
      }),
      this.prisma.staffChecklistRun.findMany({
        where: this.buildChecklistWhere(tenantId, filters),
        select: checklistDashboardSelect,
        orderBy: [
          { submittedAt: 'desc' },
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
      this.staffReadinessReportService.getReport(user, {
        storeId: filters.storeId ?? undefined,
        userId: filters.userId ?? undefined,
        search: filters.search ?? undefined,
        status: 'all',
        role: 'all',
      }),
    ]);

    const now = new Date();
    const summaryMetrics = this.createMetrics();
    const clubDrafts = new Map<string, RatingDraft>();
    const employeeDrafts = new Map<string, EmployeeRatingDraft>();

    tasks.forEach((task) => {
      this.addTaskToMetrics(summaryMetrics, task, now);
      this.addTaskToMetrics(
        this.getClubDraft(clubDrafts, task.store, null),
        task,
        now,
      );
      this.addTaskToMetrics(
        this.getEmployeeDraft(employeeDrafts, task.assignedToUser),
        task,
        now,
      );
    });

    checklists.forEach((run) => {
      this.addChecklistToMetrics(summaryMetrics, run, now);
      this.addChecklistToMetrics(
        this.getClubDraft(clubDrafts, run.store, null),
        run,
        now,
      );
      this.addChecklistToMetrics(
        this.getEmployeeDraft(employeeDrafts, run.assignedToUser),
        run,
        now,
      );
    });

    this.applyReadinessRows(
      readiness.rows,
      clubDrafts,
      employeeDrafts,
      filters.storeId,
    );

    const recurringIssues = this.buildRecurringIssues(checklists);
    this.applyRecurringIssues(recurringIssues, clubDrafts, employeeDrafts);
    summaryMetrics.repeatedIssues = recurringIssues.length;

    return {
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        userId: filters.userId,
        search: filters.search,
      },
      summary: this.toSummary(summaryMetrics),
      clubs: this.finalizeRatings(clubDrafts),
      employees: this.finalizeEmployeeRatings(employeeDrafts),
      recurringIssues,
      latestRisks: this.buildLatestRisks(tasks, checklists, now),
      stores,
      users,
    };
  }

  private resolveFilters(
    query: StaffOperationsDashboardQuery,
  ): ResolvedStaffOperationsDashboardFilters {
    const dateTo =
      this.normalizeDate(query.dateTo) ?? this.toDateOnly(new Date());
    const dateFrom =
      this.normalizeDate(query.dateFrom) ??
      this.toDateOnly(this.addDays(new Date(`${dateTo}T00:00:00.000Z`), -29));
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

  private buildTaskWhere(
    tenantId: string,
    filters: ResolvedStaffOperationsDashboardFilters,
  ): Prisma.StaffTaskWhereInput {
    const where: Prisma.StaffTaskWhereInput = {
      tenantId,
      OR: [
        { dueAt: { gte: filters.start, lte: filters.end } },
        { createdAt: { gte: filters.start, lte: filters.end } },
        { completedAt: { gte: filters.start, lte: filters.end } },
        { updatedAt: { gte: filters.start, lte: filters.end } },
        {
          status: { notIn: taskClosedStatuses },
          dueAt: { lte: filters.end },
        },
      ],
    };

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private buildChecklistWhere(
    tenantId: string,
    filters: ResolvedStaffOperationsDashboardFilters,
  ): Prisma.StaffChecklistRunWhereInput {
    const where: Prisma.StaffChecklistRunWhereInput = {
      tenantId,
      OR: [
        { scheduledAt: { gte: filters.start, lte: filters.end } },
        { submittedAt: { gte: filters.start, lte: filters.end } },
        { reviewedAt: { gte: filters.start, lte: filters.end } },
        { createdAt: { gte: filters.start, lte: filters.end } },
        { updatedAt: { gte: filters.start, lte: filters.end } },
        {
          status: { notIn: checklistClosedStatuses },
          scheduledAt: { lte: filters.end },
        },
      ],
    };

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            {
              reviewComment: { contains: filters.search, mode: 'insensitive' },
            },
          ],
        },
      ];
    }

    return where;
  }

  private createMetrics(): DisciplineMetrics {
    return {
      tasksTotal: 0,
      taskDone: 0,
      taskDoneOnTime: 0,
      taskOverdue: 0,
      taskUnchecked: 0,
      checklistsTotal: 0,
      checklistAccepted: 0,
      checklistDoneOnTime: 0,
      checklistOverdue: 0,
      checklistReturned: 0,
      checklistUnchecked: 0,
      failedItems: 0,
      readinessBlocked: 0,
      readinessAttention: 0,
      repeatedIssues: 0,
      scoreTotal: 0,
      scoreEarned: 0,
    };
  }

  private addTaskToMetrics(
    metrics: DisciplineMetrics,
    task: TaskDashboardRow,
    now: Date,
  ) {
    metrics.tasksTotal += 1;

    if (task.status === 'DONE') {
      metrics.taskDone += 1;

      if (!task.dueAt || (task.completedAt && task.completedAt <= task.dueAt)) {
        metrics.taskDoneOnTime += 1;
      }
    }

    if (task.status === 'ON_REVIEW') {
      metrics.taskUnchecked += 1;
    }

    if (
      task.dueAt &&
      task.dueAt < now &&
      !taskClosedStatuses.includes(task.status)
    ) {
      metrics.taskOverdue += 1;
    }
  }

  private addChecklistToMetrics(
    metrics: DisciplineMetrics,
    run: ChecklistDashboardRow,
    now: Date,
  ) {
    metrics.checklistsTotal += 1;
    metrics.scoreTotal += run.scoreTotal;
    metrics.scoreEarned += run.scoreEarned;
    metrics.failedItems += run.failedItems;

    if (run.status === 'ACCEPTED') {
      metrics.checklistAccepted += 1;

      if (run.failedItems === 0) {
        metrics.checklistDoneOnTime += 1;
      }
    }

    if (run.status === 'RETURNED') {
      metrics.checklistReturned += 1;
    }

    if (run.status === 'ON_REVIEW') {
      metrics.checklistUnchecked += 1;
    }

    if (
      run.scheduledAt &&
      run.scheduledAt < now &&
      !checklistClosedStatuses.includes(run.status)
    ) {
      metrics.checklistOverdue += 1;
    }
  }

  private getClubDraft(
    drafts: Map<string, RatingDraft>,
    store: StoreOption | null,
    href: string | null,
  ) {
    const id = store?.id ?? 'network';
    const existing = drafts.get(id);

    if (existing) {
      return existing;
    }

    const draft: RatingDraft = {
      id,
      label: store?.name ?? 'Вся сеть / клуб не указан',
      caption: store?.isActive === false ? 'неактивный клуб' : null,
      href,
      ...this.createMetrics(),
    };
    drafts.set(id, draft);

    return draft;
  }

  private getEmployeeDraft(
    drafts: Map<string, EmployeeRatingDraft>,
    user: UserOption | null,
  ) {
    const id = user?.id ?? 'unassigned';
    const existing = drafts.get(id);

    if (existing) {
      return existing;
    }

    const draft: EmployeeRatingDraft = {
      id,
      label: user?.fullName ?? user?.email ?? 'Не назначен',
      caption: user?.email ?? null,
      href: user ? `/staff/operations-dashboard?userId=${user.id}` : null,
      user,
      readinessStatus: null,
      readinessPercent: null,
      trainingBlockers: 0,
      ...this.createMetrics(),
    };
    drafts.set(id, draft);

    return draft;
  }

  private applyReadinessRows(
    rows: StaffReadinessRow[],
    clubDrafts: Map<string, RatingDraft>,
    employeeDrafts: Map<string, EmployeeRatingDraft>,
    filteredStoreId: string | null,
  ) {
    rows.forEach((row) => {
      const employee = this.getEmployeeDraft(employeeDrafts, row.user);
      employee.readinessStatus = row.readinessStatus;
      employee.readinessPercent = row.readinessPercent;
      employee.trainingBlockers = row.blockers.length;

      if (row.readinessStatus === 'BLOCKED') {
        employee.readinessBlocked += 1;
      } else if (row.readinessStatus === 'ATTENTION') {
        employee.readinessAttention += 1;
      }

      const stores = row.user.stores.length > 0 ? row.user.stores : [null];
      stores
        .filter((store) => !filteredStoreId || store?.id === filteredStoreId)
        .forEach((store) => {
          const club = this.getClubDraft(clubDrafts, store, null);

          if (row.readinessStatus === 'BLOCKED') {
            club.readinessBlocked += 1;
          } else if (row.readinessStatus === 'ATTENTION') {
            club.readinessAttention += 1;
          }
        });
    });
  }

  private buildRecurringIssues(
    checklists: ChecklistDashboardRow[],
  ): StaffOperationsRecurringIssue[] {
    const issuesByKey = new Map<
      string,
      FailedIssue & { occurrences: number; runIds: Set<string> }
    >();

    checklists.forEach((run) => {
      this.extractFailedIssues(run).forEach((issue) => {
        const key = [
          run.store?.id ?? 'network',
          run.assignedToUser?.id ?? 'unassigned',
          run.shiftKind,
          issue.title.toLowerCase(),
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

    return Array.from(issuesByKey.entries())
      .filter(([, issue]) => issue.occurrences > 1)
      .map(([key, issue]) => {
        const riskLevel: RiskLevel =
          issue.occurrences >= 5
            ? 'HIGH'
            : issue.occurrences >= 3
              ? 'MEDIUM'
              : 'LOW';

        return {
          id: key,
          title: issue.title,
          scopeLabel: [
            issue.run.store?.name ?? 'Вся сеть / клуб не указан',
            issue.run.assignedToUser?.fullName ??
              issue.run.assignedToUser?.email ??
              'не назначен',
            this.shiftKindLabel(issue.run.shiftKind),
          ].join(' · '),
          club: issue.run.store,
          employee: issue.run.assignedToUser,
          shiftKind: issue.run.shiftKind,
          occurrences: issue.occurrences,
          failedRuns: issue.runIds.size,
          firstSeen: issue.date.toISOString(),
          lastSeen: this.activityDate(issue.run).toISOString(),
          latestRunTitle: issue.run.title,
          riskLevel,
          href: `/staff/checklists?search=${encodeURIComponent(issue.title)}`,
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 12);
  }

  private applyRecurringIssues(
    issues: StaffOperationsRecurringIssue[],
    clubDrafts: Map<string, RatingDraft>,
    employeeDrafts: Map<string, EmployeeRatingDraft>,
  ) {
    issues.forEach((issue) => {
      this.getClubDraft(clubDrafts, issue.club, null).repeatedIssues += 1;
      this.getEmployeeDraft(employeeDrafts, issue.employee).repeatedIssues += 1;
    });
  }

  private extractFailedIssues(run: ChecklistDashboardRow): FailedIssue[] {
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
          itemId ??
          'Пункт чеклиста';

        return { title, date, run } satisfies FailedIssue;
      })
      .filter((issue): issue is FailedIssue => Boolean(issue));
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
          this.normalizeOptionalString(itemRecord.title) ?? 'Пункт чеклиста';
        const title = sectionTitle
          ? `${sectionTitle}: ${itemTitle}`
          : itemTitle;
        map.set(`${sectionId}::${itemId}`, title);
      });
    });

    return map;
  }

  private buildLatestRisks(
    tasks: TaskDashboardRow[],
    checklists: ChecklistDashboardRow[],
    now: Date,
  ): StaffOperationsRiskItem[] {
    const risks: StaffOperationsRiskItem[] = [];

    tasks.forEach((task) => {
      if (
        task.dueAt &&
        task.dueAt < now &&
        !taskClosedStatuses.includes(task.status)
      ) {
        risks.push({
          id: `task-overdue:${task.id}`,
          kind: 'TASK_OVERDUE',
          title: task.title,
          detail: `Задача просрочена, статус ${task.status}`,
          severity:
            task.priority === 'URGENT' || task.priority === 'HIGH'
              ? 'HIGH'
              : 'MEDIUM',
          date: task.dueAt.toISOString(),
          store: task.store,
          user: task.assignedToUser,
          href: `/staff/tasks?search=${encodeURIComponent(task.title)}`,
        });
      }

      if (task.status === 'ON_REVIEW') {
        risks.push({
          id: `task-unchecked:${task.id}`,
          kind: 'TASK_UNCHECKED',
          title: task.title,
          detail: 'Задача ждет проверки результата',
          severity: 'MEDIUM',
          date: (task.completedAt ?? task.updatedAt).toISOString(),
          store: task.store,
          user: task.assignedToUser,
          href: `/staff/tasks?search=${encodeURIComponent(task.title)}`,
        });
      }
    });

    checklists.forEach((run) => {
      if (run.status === 'RETURNED') {
        risks.push({
          id: `checklist-returned:${run.id}`,
          kind: 'CHECKLIST_RETURNED',
          title: run.title,
          detail: run.reviewComment ?? 'Чеклист возвращен на доработку',
          severity: 'HIGH',
          date: (run.reviewedAt ?? this.activityDate(run)).toISOString(),
          store: run.store,
          user: run.assignedToUser,
          href: `/staff/checklists?search=${encodeURIComponent(run.title)}`,
        });
      }

      if (run.failedItems > 0) {
        risks.push({
          id: `checklist-failed:${run.id}`,
          kind: 'CHECKLIST_FAILED',
          title: run.title,
          detail: `Провалено пунктов: ${run.failedItems}`,
          severity: run.failedItems >= 3 ? 'HIGH' : 'MEDIUM',
          date: this.activityDate(run).toISOString(),
          store: run.store,
          user: run.assignedToUser,
          href: `/staff/checklists?search=${encodeURIComponent(run.title)}`,
        });
      }

      if (run.status === 'ON_REVIEW') {
        risks.push({
          id: `checklist-unchecked:${run.id}`,
          kind: 'CHECKLIST_UNCHECKED',
          title: run.title,
          detail: 'Выполнение чеклиста ждет проверки',
          severity: 'MEDIUM',
          date: (run.submittedAt ?? run.updatedAt).toISOString(),
          store: run.store,
          user: run.assignedToUser,
          href: `/staff/checklists?search=${encodeURIComponent(run.title)}`,
        });
      }
    });

    return risks
      .sort((a, b) => {
        const severityDiff =
          this.severityWeight(b.severity) - this.severityWeight(a.severity);

        if (severityDiff !== 0) {
          return severityDiff;
        }

        return new Date(b.date).getTime() - new Date(a.date).getTime();
      })
      .slice(0, 12);
  }

  private toSummary(metrics: DisciplineMetrics): StaffOperationsSummary {
    const overdue = metrics.taskOverdue + metrics.checklistOverdue;
    const unchecked = metrics.taskUnchecked + metrics.checklistUnchecked;
    const returned = metrics.checklistReturned;
    const doneOnTime = metrics.taskDoneOnTime + metrics.checklistDoneOnTime;
    const score = this.scoreMetrics(metrics);
    const totalSignals =
      metrics.tasksTotal +
      metrics.checklistsTotal +
      metrics.readinessBlocked +
      metrics.failedItems +
      metrics.repeatedIssues;

    return {
      totalSignals,
      tasksTotal: metrics.tasksTotal,
      checklistsTotal: metrics.checklistsTotal,
      doneOnTime,
      overdue,
      failedItems: metrics.failedItems,
      returned,
      unchecked,
      readinessBlocked: metrics.readinessBlocked,
      recurringIssues: metrics.repeatedIssues,
      operationalScore: score,
      riskLevel: this.riskLevel(
        score,
        overdue + returned + unchecked + metrics.failedItems,
      ),
    };
  }

  private finalizeRatings(drafts: Map<string, RatingDraft>) {
    return Array.from(drafts.values())
      .map((draft) => this.finalizeRating(draft))
      .sort((a, b) => a.score - b.score || b.overdue - a.overdue)
      .slice(0, 20);
  }

  private finalizeEmployeeRatings(drafts: Map<string, EmployeeRatingDraft>) {
    return Array.from(drafts.values())
      .map((draft) => ({
        ...this.finalizeRating(draft),
        user: draft.user,
        readinessStatus: draft.readinessStatus,
        readinessPercent: draft.readinessPercent,
        trainingBlockers: draft.trainingBlockers,
      }))
      .sort((a, b) => a.score - b.score || b.overdue - a.overdue)
      .slice(0, 30);
  }

  private finalizeRating(draft: RatingDraft): StaffOperationsRating {
    const overdue = draft.taskOverdue + draft.checklistOverdue;
    const unchecked = draft.taskUnchecked + draft.checklistUnchecked;
    const doneOnTime = draft.taskDoneOnTime + draft.checklistDoneOnTime;
    const score = this.scoreMetrics(draft);
    const risks =
      overdue +
      unchecked +
      draft.checklistReturned +
      draft.failedItems +
      draft.readinessBlocked +
      draft.repeatedIssues;

    return {
      id: draft.id,
      label: draft.label,
      caption: draft.caption,
      score,
      riskLevel: this.riskLevel(score, risks),
      tasksTotal: draft.tasksTotal,
      checklistsTotal: draft.checklistsTotal,
      doneOnTime,
      overdue,
      failedItems: draft.failedItems,
      returned: draft.checklistReturned,
      unchecked,
      readinessBlocked: draft.readinessBlocked,
      readinessAttention: draft.readinessAttention,
      repeatedIssues: draft.repeatedIssues,
      scorePercent:
        draft.scoreTotal > 0
          ? Math.round((draft.scoreEarned / draft.scoreTotal) * 100)
          : 100,
      href: draft.href,
    };
  }

  private scoreMetrics(metrics: DisciplineMetrics) {
    const workload = Math.max(metrics.tasksTotal + metrics.checklistsTotal, 1);
    const penalty =
      metrics.taskOverdue * 12 +
      metrics.checklistOverdue * 12 +
      metrics.checklistReturned * 10 +
      metrics.failedItems * 4 +
      (metrics.taskUnchecked + metrics.checklistUnchecked) * 6 +
      metrics.readinessBlocked * 10 +
      metrics.readinessAttention * 4 +
      metrics.repeatedIssues * 8;
    const reward = Math.min(
      metrics.taskDoneOnTime + metrics.checklistDoneOnTime,
      workload,
    );

    return Math.min(
      Math.max(
        100 - Math.round(penalty / workload) + Math.round(reward / workload),
        0,
      ),
      100,
    );
  }

  private riskLevel(score: number, risks: number): RiskLevel {
    if (score < 65 || risks >= 8) {
      return 'HIGH';
    }

    if (score < 85 || risks > 0) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private severityWeight(severity: RiskLevel) {
    if (severity === 'HIGH') {
      return 3;
    }

    if (severity === 'MEDIUM') {
      return 2;
    }

    return 1;
  }

  private activityDate(run: ChecklistDashboardRow) {
    return (
      run.submittedAt ?? run.reviewedAt ?? run.scheduledAt ?? run.createdAt
    );
  }

  private shiftKindLabel(value: string) {
    const labels: Record<string, string> = {
      OPENING: 'открытие',
      CLOSING: 'закрытие',
      CASH: 'касса',
      BAR: 'бар',
      PC_ZONE: 'PC-зона',
      CLEANLINESS: 'чистота',
      INCIDENT: 'инцидент',
      INVENTORY: 'передача ТМЦ',
      CUSTOM: 'другое',
    };

    return labels[value] ?? value;
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

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
