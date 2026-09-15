import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { StaffReadinessReportService } from './staff-readiness-report.service';
import {
  StaffTrainingProfilesService,
  type StaffTrainingProfileUser,
} from './staff-training-profiles.service';
import {
  staffPriorityKinds,
  type StaffPriorityKind,
  type StaffPriorityScope,
  type StaffPriorityMetric,
  type StaffPrioritySummary,
  type StaffPriorityItem,
  type StaffPriorityDetails,
  type StaffPriorityQuery,
  type StaffPriorityItemsQuery,
} from './staff-priorities.contract';

const units = (kind: StaffPriorityKind): StaffPriorityMetric['unit'] =>
  kind === 'TASKS_OVERDUE'
    ? 'TASKS'
    : kind.startsWith('CHECKLISTS')
      ? 'CHECKLISTS'
      : 'EMPLOYEES';
const unavailable = (
  kind: StaffPriorityKind,
  reason: string,
  failed = false,
): StaffPriorityMetric => ({
  kind,
  value: null,
  state: failed ? 'FAILED' : 'UNAVAILABLE',
  reason,
  unit: units(kind),
  coverage: null,
});
const known = (
  kind: StaffPriorityKind,
  value: number,
): StaffPriorityMetric => ({
  kind,
  value,
  state: 'AVAILABLE',
  reason: null,
  unit: units(kind),
  coverage: { observed: value, total: value, limitCodes: [] },
});
type AssignmentResult = {
  metric: StaffPriorityMetric;
  items: StaffPriorityItem[];
};

/** Read-only current obligations. This intentionally retains NETWORK admission. */
@Injectable()
export class StaffPrioritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshScope: FreshStoreScopeService,
    private readonly profiles: StaffTrainingProfilesService,
    private readonly readiness: StaffReadinessReportService,
  ) {}

  private async scope(
    user: AuthenticatedUser,
    query: StaffPriorityQuery,
  ): Promise<StaffPriorityScope> {
    await this.freshScope.assertNetwork(user);
    const requested =
      query.storeIds === undefined
        ? undefined
        : Array.isArray(query.storeIds)
          ? query.storeIds
          : [query.storeIds];
    const accepted = await this.freshScope.resolveRequestedStoreIds(
      user,
      requested,
    );
    const active = await this.prisma.store.findMany({
      where: { tenantId: accepted.tenantId, isActive: true },
      select: { id: true },
    });
    const storeIds = [
      ...(accepted.effectiveStoreIds ?? active.map((row) => row.id)),
    ].sort();
    return {
      storeIds,
      includesNetworkAssignments: active.every((row) =>
        storeIds.includes(row.id),
      ),
    };
  }

  private canRead(user: AuthenticatedUser, kind: StaffPriorityKind) {
    if (!hasCapability(user, 'view_staff_control')) return false;
    if (kind === 'TASKS_OVERDUE')
      return hasCapability(user, 'view_staff_tasks');
    if (kind.startsWith('CHECKLISTS'))
      return hasCapability(user, 'view_staff_standards');
    return (
      hasCapability(user, 'view_staff_training') &&
      hasCapability(user, 'manage_staff_training') &&
      (kind !== 'REGULATIONS_UNACKNOWLEDGED' ||
        hasCapability(user, 'view_staff_standards'))
    );
  }

  private storeWhere(scope: StaffPriorityScope) {
    return {
      OR: [
        { storeId: { in: scope.storeIds } },
        ...(scope.includesNetworkAssignments ? [{ storeId: null }] : []),
      ],
    };
  }

  private taskWhere(
    user: AuthenticatedUser,
    scope: StaffPriorityScope,
    now: Date,
  ) {
    return {
      tenantId: user.tenantId,
      ...this.storeWhere(scope),
      status: { notIn: ['DONE', 'CANCELED'] },
      dueAt: { lt: now },
    };
  }

  private checklistWhere(
    user: AuthenticatedUser,
    scope: StaffPriorityScope,
    now: Date,
    kind: StaffPriorityKind,
  ) {
    return {
      tenantId: user.tenantId,
      ...this.storeWhere(scope),
      status: {
        in:
          kind === 'CHECKLISTS_REVIEW'
            ? ['ON_REVIEW']
            : ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ESCALATED'],
      },
      scheduledAt: { lt: now },
    };
  }

  private async count(
    user: AuthenticatedUser,
    scope: StaffPriorityScope,
    now: Date,
    kind: StaffPriorityKind,
  ): Promise<StaffPriorityMetric> {
    if (!this.canRead(user, kind))
      return unavailable(kind, 'Нет доступа к этому разделу персонала.');
    try {
      const value =
        kind === 'TASKS_OVERDUE'
          ? await this.prisma.staffTask.count({
              where: this.taskWhere(user, scope, now),
            })
          : await this.prisma.staffChecklistRun.count({
              where: this.checklistWhere(user, scope, now, kind),
            });
      return known(kind, value);
    } catch {
      return unavailable(
        kind,
        'Не удалось прочитать текущие обязательства.',
        true,
      );
    }
  }

  private async assignments(
    user: AuthenticatedUser,
    scope: StaffPriorityScope,
  ): Promise<
    Record<
      'TRAINING_INCOMPLETE' | 'REGULATIONS_UNACKNOWLEDGED',
      AssignmentResult
    >
  > {
    const trainingKind = 'TRAINING_INCOMPLETE';
    const regulationKind = 'REGULATIONS_UNACKNOWLEDGED';
    const result: Record<
      typeof trainingKind | typeof regulationKind,
      AssignmentResult
    > = {
      [trainingKind]: {
        metric: unavailable(
          trainingKind,
          'Нужен доступ к управлению обучением сотрудников.',
        ),
        items: [],
      },
      [regulationKind]: {
        metric: unavailable(
          regulationKind,
          'Нужен доступ к обучению и стандартам сотрудников.',
        ),
        items: [],
      },
    };
    if (!this.canRead(user, trainingKind)) return result;
    try {
      const regulationsAllowed = this.canRead(user, regulationKind);
      const report = regulationsAllowed
        ? await this.readiness.getReport(user)
        : await this.profiles.getProfiles(user);
      const rows = report.rows.filter(
        (row) =>
          row.user.isActive &&
          (row.user.stores.some((store) => scope.storeIds.includes(store.id)) ||
            (scope.includesNetworkAssignments &&
              row.user.accessScope === 'NETWORK' &&
              row.user.stores.length === 0)),
      );
      const inScope = (store: { id: string } | null) =>
        store === null || scope.storeIds.includes(store.id);
      for (const kind of [trainingKind, regulationKind] as const) {
        if (!this.canRead(user, kind)) continue;
        const items: StaffPriorityItem[] = [];
        for (const row of rows) {
          const missingCourses = row.courses
            .filter(
              (course) =>
                course.required &&
                inScope(course.store) &&
                !['COMPLETED', 'WAIVED'].includes(course.progress.status),
            )
            .map(({ id, title }) => ({ id, title }));
          const missingRegulations =
            'regulations' in row
              ? row.regulations
                  .filter(
                    (regulation) =>
                      inScope(regulation.store) && !regulation.acknowledged,
                  )
                  .map(({ id, title, version }) => ({ id, title, version }))
              : [];
          if (
            (kind === trainingKind ? missingCourses : missingRegulations)
              .length === 0
          )
            continue;
          const stores = row.user.stores.filter((store) =>
            scope.storeIds.includes(store.id),
          );
          items.push({
            id: row.user.id,
            title: row.user.fullName ?? row.user.email,
            status: null,
            dueAt: null,
            store: stores.length === 1 ? stores[0] : null,
            employee: {
              id: row.user.id,
              name: row.user.fullName ?? row.user.email,
            },
            ...(kind === trainingKind
              ? { missingCourses }
              : { missingRegulations }),
            target: {
              type:
                kind === trainingKind
                  ? 'TRAINING_PROFILE'
                  : 'REGULATION_CATALOG',
              userId: row.user.id,
            },
          });
        }
        items.sort((left, right) =>
          left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
        );
        const coverage = report.priorityCoverage;
        const limitCodes = [
          ...(report.rows.some(
            (row: { user: StaffTrainingProfileUser }) =>
              row.user.isActive &&
              !(
                (row.user.accessScope === 'NETWORK' &&
                  row.user.stores.length === 0) ||
                (row.user.accessScope === 'STORES' &&
                  row.user.stores.length > 0)
              ),
          )
            ? ['EMPLOYEE_SCOPE_UNKNOWN']
            : []),
          ...(coverage?.employeesComplete === true ? [] : ['EMPLOYEES_LIMIT']),
          ...(kind === trainingKind
            ? coverage?.coursesComplete === true
              ? []
              : ['COURSES_LIMIT']
            : coverage &&
                'regulationsComplete' in coverage &&
                coverage.regulationsComplete === true
              ? []
              : ['REGULATIONS_LIMIT']),
        ];
        // Progress and acknowledgements are read without a history cap. Every
        // admitted gap is proven; capped employee/catalog lists only hide gaps.
        const metric =
          limitCodes.length === 0
            ? known(kind, items.length)
            : items.length > 0
              ? {
                  ...known(kind, items.length),
                  state: 'PARTIAL' as const,
                  reason:
                    'Показана подтверждённая часть: проверьте полноту списка и привязку сотрудников к клубам.',
                  coverage: { observed: items.length, total: null, limitCodes },
                }
              : {
                  ...unavailable(
                    kind,
                    'Список ограничен: отсутствие незавершённых обязательств не подтверждено.',
                  ),
                  coverage: { observed: 0, total: null, limitCodes },
                };
        result[kind] = { metric, items };
      }
    } catch {
      for (const kind of [trainingKind, regulationKind] as const)
        if (this.canRead(user, kind))
          result[kind].metric = unavailable(
            kind,
            'Не удалось проверить обучение сотрудников.',
            true,
          );
    }
    return result;
  }

  async getSummary(
    user: AuthenticatedUser,
    query: StaffPriorityQuery = {},
  ): Promise<StaffPrioritySummary> {
    const scope = await this.scope(user, query);
    const now = new Date();
    const [tasks, checklists, reviews, assignments] = await Promise.all([
      this.count(user, scope, now, 'TASKS_OVERDUE'),
      this.count(user, scope, now, 'CHECKLISTS_OVERDUE'),
      this.count(user, scope, now, 'CHECKLISTS_REVIEW'),
      this.assignments(user, scope),
    ]);
    return {
      scope,
      evaluatedAt: now.toISOString(),
      metrics: {
        TASKS_OVERDUE: tasks,
        CHECKLISTS_OVERDUE: checklists,
        CHECKLISTS_REVIEW: reviews,
        TRAINING_INCOMPLETE: assignments.TRAINING_INCOMPLETE.metric,
        REGULATIONS_UNACKNOWLEDGED:
          assignments.REGULATIONS_UNACKNOWLEDGED.metric,
      },
    };
  }

  async getItems(
    user: AuthenticatedUser,
    query: StaffPriorityItemsQuery,
  ): Promise<StaffPriorityDetails> {
    if (!staffPriorityKinds.includes(query.kind as StaffPriorityKind))
      throw new BadRequestException('Unsupported priority kind');
    const kind = query.kind as StaffPriorityKind;
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('Invalid page limit');
    const scope = await this.scope(user, query);
    const now = new Date();
    const cursorScope = createHash('sha256')
      .update(JSON.stringify([user.tenantId, user.id, kind, scope]))
      .digest('hex');
    let afterId = '';
    if (query.cursor !== undefined) {
      try {
        if (query.cursor.length > 8192) throw new Error();
        const cursor = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString(),
        ) as { scope?: unknown; id?: unknown };
        if (
          cursor.scope !== cursorScope ||
          typeof cursor.id !== 'string' ||
          !cursor.id ||
          cursor.id.length > 200
        )
          throw new Error();
        afterId = cursor.id;
      } catch {
        throw new BadRequestException('Invalid priority cursor');
      }
    }
    let metric: StaffPriorityMetric;
    let items: StaffPriorityItem[] = [];
    if (
      kind === 'TRAINING_INCOMPLETE' ||
      kind === 'REGULATIONS_UNACKNOWLEDGED'
    ) {
      const assignment = (await this.assignments(user, scope))[kind];
      metric = assignment.metric;
      items = assignment.items
        .filter((item) => item.id > afterId)
        .slice(0, limit + 1);
    } else {
      metric = await this.count(user, scope, now, kind);
      if (metric.state === 'AVAILABLE') {
        try {
          const select = {
            id: true,
            title: true,
            status: true,
            store: { select: { id: true, name: true } },
            assignedToUser: { select: { id: true, fullName: true } },
          } as const;
          if (kind === 'TASKS_OVERDUE') {
            const rows = await this.prisma.staffTask.findMany({
              where: {
                ...this.taskWhere(user, scope, now),
                ...(afterId ? { id: { gt: afterId } } : {}),
              },
              select: { ...select, dueAt: true },
              orderBy: { id: 'asc' },
              take: limit + 1,
            });
            items = rows.map((row) => ({
              id: row.id,
              title: row.title,
              status: row.status,
              store: row.store,
              dueAt: row.dueAt?.toISOString() ?? null,
              employee: row.assignedToUser
                ? {
                    id: row.assignedToUser.id,
                    name: row.assignedToUser.fullName,
                  }
                : null,
              target: { type: 'TASK', id: row.id },
            }));
          } else {
            const rows = await this.prisma.staffChecklistRun.findMany({
              where: {
                ...this.checklistWhere(user, scope, now, kind),
                ...(afterId ? { id: { gt: afterId } } : {}),
              },
              select: { ...select, scheduledAt: true },
              orderBy: { id: 'asc' },
              take: limit + 1,
            });
            items = rows.map((row) => ({
              id: row.id,
              title: row.title,
              status: row.status,
              store: row.store,
              dueAt: row.scheduledAt?.toISOString() ?? null,
              employee: row.assignedToUser
                ? {
                    id: row.assignedToUser.id,
                    name: row.assignedToUser.fullName,
                  }
                : null,
              target: { type: 'CHECKLIST', id: row.id },
            }));
          }
        } catch {
          metric = unavailable(
            kind,
            'Не удалось прочитать список обязательств.',
            true,
          );
        }
      }
    }
    const hasMore = items.length > limit;
    items = items.slice(0, limit);
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({
            scope: cursorScope,
            id: items[items.length - 1].id,
          }),
        ).toString('base64url')
      : null;
    return {
      scope,
      evaluatedAt: now.toISOString(),
      kind,
      metric,
      items,
      page: { limit, hasMore, nextCursor },
    };
  }
}
