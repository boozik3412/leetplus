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

const administratorRoles = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;

const salarySchemeStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const salaryPeriodTypes = ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'CUSTOM'] as const;
const salaryRoleScopes = [
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_ADMINISTRATOR',
] as const;

const salaryManagerRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
] as const;

const defaultBonusRules = {
  taskDoneOnTimeAmount: 0,
  acceptedChecklistAmount: 0,
  perfectChecklistAmount: 0,
  noViolationAmount: 0,
};

const defaultPenaltyRules = {
  overdueTaskAmount: 0,
  returnedChecklistAmount: 0,
  failedChecklistItemAmount: 0,
  warningAmount: 0,
  includeDisciplineFines: true,
};

const salarySchemeSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  createdByUserId: true,
  title: true,
  description: true,
  status: true,
  roleScope: true,
  periodType: true,
  fixedAmount: true,
  hourlyRate: true,
  shiftRate: true,
  bonusRules: true,
  penaltyRules: true,
  createdAt: true,
  updatedAt: true,
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffSalarySchemeSelect;

type StaffSalarySchemeRow = Prisma.StaffSalarySchemeGetPayload<{
  select: typeof salarySchemeSelect;
}>;

type SalarySchemeStatus = (typeof salarySchemeStatuses)[number];
type SalaryPeriodType = (typeof salaryPeriodTypes)[number];
type SalaryRoleScope = (typeof salaryRoleScopes)[number];
type StoreOption = { id: string; name: string; isActive: boolean };
type SalaryBonusRules = typeof defaultBonusRules;
type SalaryPenaltyRules = typeof defaultPenaltyRules;

export type StaffSalaryQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  schemeId?: string;
  search?: string;
};

export type StaffSalarySchemeDto = {
  title?: string;
  description?: string | null;
  storeId?: string | null;
  status?: SalarySchemeStatus;
  roleScope?: SalaryRoleScope;
  periodType?: SalaryPeriodType;
  fixedAmount?: number | string | null;
  hourlyRate?: number | string | null;
  shiftRate?: number | string | null;
  bonusRules?: Partial<SalaryBonusRules> | null;
  penaltyRules?: Partial<SalaryPenaltyRules> | null;
};

type ResolvedSalaryFilters = {
  dateFrom: string;
  dateTo: string;
  start: Date;
  end: Date;
  storeId: string | null;
  userId: string | null;
  schemeId: string | null;
  search: string | null;
};

type SalaryFactBucket = {
  tasksTotal: number;
  tasksCompletedOnTime: number;
  tasksOverdue: number;
  checklistsTotal: number;
  checklistsAccepted: number;
  checklistsReturned: number;
  failedChecklistItems: number;
  warnings: number;
  fines: number;
  disciplineFineAmount: number;
  shiftIds: Set<string>;
};

@Injectable()
export class StaffSalaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getWorkspace(user: AuthenticatedUser, query: StaffSalaryQuery = {}) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.ensureSalaryAccess(user);
    const filters = this.resolveFilters(query);
    const allowedStoreIds = await this.resolveAllowedStoreIds(user, tenantId);
    this.ensureStoreAccess(user, filters.storeId, allowedStoreIds);

    const [stores, schemes, users] = await Promise.all([
      this.prisma.store.findMany({
        where: this.buildStoreWhere(tenantId, allowedStoreIds),
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.staffSalaryScheme.findMany({
        where: this.buildSchemeWhere(tenantId, allowedStoreIds),
        select: salarySchemeSelect,
        orderBy: [{ status: 'asc' }, { storeId: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.user.findMany({
        where: this.buildUserWhere(tenantId, filters, allowedStoreIds),
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          storeAccesses: {
            select: {
              store: { select: { id: true, name: true, isActive: true } },
            },
            orderBy: { store: { name: 'asc' } },
          },
        },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
    ]);

    const rows = await this.buildSalaryRows({
      tenantId,
      filters,
      schemes,
      users,
      allowedStoreIds,
    });

    return {
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        userId: filters.userId,
        schemeId: filters.schemeId,
        search: filters.search,
      },
      summary: {
        administrators: rows.length,
        activeSchemes: schemes.filter((scheme) => scheme.status === 'ACTIVE')
          .length,
        totalBaseAmount: this.sum(rows, 'baseAmount'),
        totalShiftAmount: this.sum(rows, 'shiftAmount'),
        totalHourlyAmount: this.sum(rows, 'hourlyAmount'),
        totalBonusAmount: this.sum(rows, 'bonusAmount'),
        totalPenaltyAmount: this.sum(rows, 'penaltyAmount'),
        totalNetAmount: this.sum(rows, 'netAmount'),
        shifts: rows.reduce((sum, row) => sum + row.shifts, 0),
        hours: this.roundMoney(rows.reduce((sum, row) => sum + row.hours, 0)),
      },
      schemes: schemes.map((scheme) => this.toSchemeResponse(scheme)),
      rows,
      stores,
      users: users.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role: row.role,
      })),
    };
  }

  async createScheme(user: AuthenticatedUser, dto: StaffSalarySchemeDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.ensureSalaryAccess(user);
    const allowedStoreIds = await this.resolveAllowedStoreIds(user, tenantId);
    const storeId = await this.resolveStoreId(tenantId, dto.storeId ?? null);
    this.ensureStoreAccess(user, storeId, allowedStoreIds, true);

    const title = this.normalizeRequiredString(dto.title, 'title');

    const scheme = await this.prisma.staffSalaryScheme.create({
      data: {
        tenantId,
        storeId,
        createdByUserId: user.id,
        title,
        description: this.normalizeOptionalString(dto.description),
        status: this.resolveSchemeStatus(dto.status ?? 'DRAFT'),
        roleScope: this.resolveRoleScope(dto.roleScope ?? 'ADMINISTRATOR'),
        periodType: this.resolvePeriodType(dto.periodType ?? 'MONTHLY'),
        fixedAmount: this.resolveMoney(dto.fixedAmount, 'fixedAmount'),
        hourlyRate: this.resolveMoney(dto.hourlyRate, 'hourlyRate'),
        shiftRate: this.resolveMoney(dto.shiftRate, 'shiftRate'),
        bonusRules: this.normalizeBonusRules(dto.bonusRules),
        penaltyRules: this.normalizePenaltyRules(dto.penaltyRules),
      },
      select: salarySchemeSelect,
    });

    return this.toSchemeResponse(scheme);
  }

  async updateScheme(
    user: AuthenticatedUser,
    id: string,
    dto: StaffSalarySchemeDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.ensureSalaryAccess(user);
    const allowedStoreIds = await this.resolveAllowedStoreIds(user, tenantId);
    const current = await this.prisma.staffSalaryScheme.findFirst({
      where: { tenantId, id },
      select: { id: true, storeId: true },
    });

    if (!current) {
      throw new NotFoundException('Salary scheme not found');
    }

    this.ensureStoreAccess(user, current.storeId, allowedStoreIds, true);
    const nextStoreId =
      dto.storeId === undefined
        ? current.storeId
        : await this.resolveStoreId(tenantId, dto.storeId);
    this.ensureStoreAccess(user, nextStoreId, allowedStoreIds, true);

    const data: Prisma.StaffSalarySchemeUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = this.normalizeRequiredString(dto.title, 'title');
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description);
    }

    if (dto.storeId !== undefined) {
      data.store = nextStoreId
        ? { connect: { id: nextStoreId } }
        : { disconnect: true };
    }

    if (dto.status !== undefined) {
      data.status = this.resolveSchemeStatus(dto.status);
    }

    if (dto.roleScope !== undefined) {
      data.roleScope = this.resolveRoleScope(dto.roleScope);
    }

    if (dto.periodType !== undefined) {
      data.periodType = this.resolvePeriodType(dto.periodType);
    }

    if (dto.fixedAmount !== undefined) {
      data.fixedAmount = this.resolveMoney(dto.fixedAmount, 'fixedAmount');
    }

    if (dto.hourlyRate !== undefined) {
      data.hourlyRate = this.resolveMoney(dto.hourlyRate, 'hourlyRate');
    }

    if (dto.shiftRate !== undefined) {
      data.shiftRate = this.resolveMoney(dto.shiftRate, 'shiftRate');
    }

    if (dto.bonusRules !== undefined) {
      data.bonusRules = this.normalizeBonusRules(dto.bonusRules);
    }

    if (dto.penaltyRules !== undefined) {
      data.penaltyRules = this.normalizePenaltyRules(dto.penaltyRules);
    }

    const scheme = await this.prisma.staffSalaryScheme.update({
      where: { id: current.id },
      data,
      select: salarySchemeSelect,
    });

    return this.toSchemeResponse(scheme);
  }

  private async buildSalaryRows(input: {
    tenantId: string;
    filters: ResolvedSalaryFilters;
    schemes: StaffSalarySchemeRow[];
    users: Array<{
      id: string;
      email: string;
      fullName: string | null;
      role: UserRole;
      storeAccesses: Array<{ store: StoreOption }>;
    }>;
    allowedStoreIds: string[] | null;
  }) {
    const userIds = input.users.map((row) => row.id);

    if (userIds.length === 0) {
      return [];
    }

    const [tasks, checklists, disciplineRecords] = await Promise.all([
      this.prisma.staffTask.findMany({
        where: {
          tenantId: input.tenantId,
          assignedToUserId: { in: userIds },
          ...this.buildStoreFactWhere(
            input.filters.storeId,
            input.allowedStoreIds,
          ),
          OR: [
            { createdAt: { gte: input.filters.start, lte: input.filters.end } },
            { dueAt: { gte: input.filters.start, lte: input.filters.end } },
            {
              completedAt: {
                gte: input.filters.start,
                lte: input.filters.end,
              },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          dueAt: true,
          completedAt: true,
          shiftId: true,
          assignedToUserId: true,
        },
      }),
      this.prisma.staffChecklistRun.findMany({
        where: {
          tenantId: input.tenantId,
          assignedToUserId: { in: userIds },
          ...this.buildStoreFactWhere(
            input.filters.storeId,
            input.allowedStoreIds,
          ),
          OR: [
            {
              createdAt: { gte: input.filters.start, lte: input.filters.end },
            },
            {
              scheduledAt: {
                gte: input.filters.start,
                lte: input.filters.end,
              },
            },
            {
              submittedAt: {
                gte: input.filters.start,
                lte: input.filters.end,
              },
            },
            {
              reviewedAt: { gte: input.filters.start, lte: input.filters.end },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          shiftId: true,
          assignedToUserId: true,
          failedItems: true,
        },
      }),
      this.prisma.staffDisciplineRecord.findMany({
        where: {
          tenantId: input.tenantId,
          userId: { in: userIds },
          status: 'ACTIVE',
          occurredAt: { gte: input.filters.start, lte: input.filters.end },
          ...this.buildStoreFactWhere(
            input.filters.storeId,
            input.allowedStoreIds,
          ),
        },
        select: {
          userId: true,
          level: true,
          amount: true,
        },
      }),
    ]);

    const buckets = new Map<string, SalaryFactBucket>();
    const getBucket = (userId: string) => {
      const existing = buckets.get(userId);

      if (existing) {
        return existing;
      }

      const created: SalaryFactBucket = {
        tasksTotal: 0,
        tasksCompletedOnTime: 0,
        tasksOverdue: 0,
        checklistsTotal: 0,
        checklistsAccepted: 0,
        checklistsReturned: 0,
        failedChecklistItems: 0,
        warnings: 0,
        fines: 0,
        disciplineFineAmount: 0,
        shiftIds: new Set<string>(),
      };
      buckets.set(userId, created);
      return created;
    };

    tasks.forEach((task) => {
      if (!task.assignedToUserId) {
        return;
      }

      const bucket = getBucket(task.assignedToUserId);
      bucket.tasksTotal += 1;

      if (this.isTaskDoneOnTime(task)) {
        bucket.tasksCompletedOnTime += 1;
      }

      if (this.isTaskOverdue(task, input.filters.end)) {
        bucket.tasksOverdue += 1;
      }

      if (task.shiftId) {
        bucket.shiftIds.add(task.shiftId);
      }
    });

    checklists.forEach((run) => {
      if (!run.assignedToUserId) {
        return;
      }

      const bucket = getBucket(run.assignedToUserId);
      bucket.checklistsTotal += 1;
      bucket.failedChecklistItems += run.failedItems;

      if (run.status === 'ACCEPTED') {
        bucket.checklistsAccepted += 1;
      }

      if (run.status === 'RETURNED') {
        bucket.checklistsReturned += 1;
      }

      if (run.shiftId) {
        bucket.shiftIds.add(run.shiftId);
      }
    });

    disciplineRecords.forEach((record) => {
      const bucket = getBucket(record.userId);

      if (record.level.startsWith('WARNING')) {
        bucket.warnings += 1;
      } else {
        bucket.fines += 1;
        bucket.disciplineFineAmount += this.toNumber(record.amount);
      }
    });

    const allShiftIds = Array.from(
      new Set(
        Array.from(buckets.values()).flatMap((bucket) =>
          Array.from(bucket.shiftIds),
        ),
      ),
    );
    const shifts =
      allShiftIds.length > 0
        ? await this.prisma.guestWorkingShift.findMany({
            where: { tenantId: input.tenantId, id: { in: allShiftIds } },
            select: {
              id: true,
              durationMinutes: true,
              startedAt: true,
              stoppedAt: true,
            },
          })
        : [];
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));

    return input.users.map((row) => {
      const bucket = buckets.get(row.id) ?? getBucket(row.id);
      const scheme = this.pickSchemeForUser(input.schemes, row, input.filters);
      const bonusRules = this.readBonusRules(scheme?.bonusRules);
      const penaltyRules = this.readPenaltyRules(scheme?.penaltyRules);
      const fixedAmount = this.toNumber(scheme?.fixedAmount);
      const hourlyRate = this.toNumber(scheme?.hourlyRate);
      const shiftRate = this.toNumber(scheme?.shiftRate);
      const shiftMetrics = this.resolveShiftMetrics(bucket, shiftById);
      const bonusAmount = this.roundMoney(
        bucket.tasksCompletedOnTime * bonusRules.taskDoneOnTimeAmount +
          bucket.checklistsAccepted * bonusRules.acceptedChecklistAmount +
          (bucket.checklistsTotal > 0 &&
          bucket.checklistsReturned === 0 &&
          bucket.failedChecklistItems === 0
            ? bonusRules.perfectChecklistAmount
            : 0) +
          (bucket.warnings === 0 && bucket.fines === 0
            ? bonusRules.noViolationAmount
            : 0),
      );
      const penaltyAmount = this.roundMoney(
        bucket.tasksOverdue * penaltyRules.overdueTaskAmount +
          bucket.checklistsReturned * penaltyRules.returnedChecklistAmount +
          bucket.failedChecklistItems * penaltyRules.failedChecklistItemAmount +
          bucket.warnings * penaltyRules.warningAmount +
          (penaltyRules.includeDisciplineFines
            ? bucket.disciplineFineAmount
            : 0),
      );
      const shiftAmount = this.roundMoney(shiftMetrics.shifts * shiftRate);
      const hourlyAmount = this.roundMoney(shiftMetrics.hours * hourlyRate);
      const netAmount = this.roundMoney(
        fixedAmount + shiftAmount + hourlyAmount + bonusAmount - penaltyAmount,
      );

      return {
        id: row.id,
        user: {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          role: row.role,
          stores: row.storeAccesses.map((access) => access.store),
        },
        scheme: scheme ? this.toSchemeResponse(scheme) : null,
        baseAmount: fixedAmount,
        shiftAmount,
        hourlyAmount,
        bonusAmount,
        penaltyAmount,
        netAmount,
        shifts: shiftMetrics.shifts,
        hours: shiftMetrics.hours,
        tasks: {
          total: bucket.tasksTotal,
          completedOnTime: bucket.tasksCompletedOnTime,
          overdue: bucket.tasksOverdue,
        },
        checklists: {
          total: bucket.checklistsTotal,
          accepted: bucket.checklistsAccepted,
          returned: bucket.checklistsReturned,
          failedItems: bucket.failedChecklistItems,
        },
        discipline: {
          warnings: bucket.warnings,
          fines: bucket.fines,
          fineAmount: this.roundMoney(bucket.disciplineFineAmount),
        },
        sourceWarnings: this.buildSourceWarnings(scheme, shiftMetrics.shifts),
      };
    });
  }

  private pickSchemeForUser(
    schemes: StaffSalarySchemeRow[],
    user: {
      id: string;
      role: UserRole;
      storeAccesses: Array<{ store: StoreOption }>;
    },
    filters: ResolvedSalaryFilters,
  ) {
    const visibleSchemes = filters.schemeId
      ? schemes.filter((scheme) => scheme.id === filters.schemeId)
      : schemes.filter((scheme) => scheme.status === 'ACTIVE');

    if (visibleSchemes.length === 0) {
      return null;
    }

    const userStoreIds = new Set(
      user.storeAccesses.map((access) => access.store.id),
    );
    const roleScope =
      user.role === UserRole.SENIOR_ADMINISTRATOR
        ? 'SENIOR_ADMINISTRATOR'
        : 'CLUB_ADMINISTRATOR';
    const scoped = visibleSchemes.filter(
      (scheme) =>
        scheme.roleScope === 'ADMINISTRATOR' || scheme.roleScope === roleScope,
    );
    const pool = scoped.length > 0 ? scoped : visibleSchemes;

    if (filters.storeId) {
      const storeScheme = pool.find(
        (scheme) => scheme.storeId === filters.storeId,
      );

      if (storeScheme) {
        return storeScheme;
      }
    }

    const userStoreScheme = pool.find(
      (scheme) => scheme.storeId && userStoreIds.has(scheme.storeId),
    );

    return (
      userStoreScheme ??
      pool.find((scheme) => scheme.storeId === null) ??
      pool[0] ??
      null
    );
  }

  private resolveShiftMetrics(
    bucket: SalaryFactBucket,
    shiftById: Map<
      string,
      {
        id: string;
        durationMinutes: number | null;
        startedAt: Date | null;
        stoppedAt: Date | null;
      }
    >,
  ) {
    const shifts: Array<{
      id: string;
      durationMinutes: number | null;
      startedAt: Date | null;
      stoppedAt: Date | null;
    }> = [];
    bucket.shiftIds.forEach((id) => {
      const shift = shiftById.get(id);

      if (shift) {
        shifts.push(shift);
      }
    });
    const minutes = shifts.reduce((sum, shift) => {
      if (shift.durationMinutes) {
        return sum + shift.durationMinutes;
      }

      if (shift.startedAt && shift.stoppedAt) {
        return (
          sum +
          Math.max(
            0,
            Math.round(
              (shift.stoppedAt.getTime() - shift.startedAt.getTime()) / 60000,
            ),
          )
        );
      }

      return sum;
    }, 0);

    return {
      shifts: shifts.length,
      hours: this.roundMoney(minutes / 60),
    };
  }

  private buildSourceWarnings(
    scheme: StaffSalarySchemeRow | null,
    linkedShifts: number,
  ) {
    const warnings: string[] = [];

    if (!scheme) {
      warnings.push(
        'Нет активной схемы зарплаты: расчет показывает только факты без начислений.',
      );
    }

    if (linkedShifts === 0) {
      warnings.push(
        'Смены учитываются только когда они связаны с задачей или чек-листом сотрудника.',
      );
    }

    return warnings;
  }

  private isTaskDoneOnTime(task: {
    status: string;
    dueAt: Date | null;
    completedAt: Date | null;
  }) {
    if (task.status !== 'DONE' || !task.completedAt) {
      return false;
    }

    return !task.dueAt || task.completedAt <= task.dueAt;
  }

  private isTaskOverdue(
    task: {
      status: string;
      dueAt: Date | null;
      completedAt: Date | null;
    },
    periodEnd: Date,
  ) {
    if (!task.dueAt || task.status === 'CANCELED') {
      return false;
    }

    if (task.completedAt) {
      return task.completedAt > task.dueAt;
    }

    return task.status !== 'DONE' && task.dueAt <= periodEnd;
  }

  private buildStoreWhere(tenantId: string, allowedStoreIds: string[] | null) {
    const where: Prisma.StoreWhereInput = { tenantId };

    if (allowedStoreIds) {
      where.id = { in: allowedStoreIds };
    }

    return where;
  }

  private buildSchemeWhere(tenantId: string, allowedStoreIds: string[] | null) {
    const where: Prisma.StaffSalarySchemeWhereInput = { tenantId };

    if (allowedStoreIds) {
      where.OR = [{ storeId: { in: allowedStoreIds } }, { storeId: null }];
    }

    return where;
  }

  private buildUserWhere(
    tenantId: string,
    filters: ResolvedSalaryFilters,
    allowedStoreIds: string[] | null,
  ) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      isActive: true,
      role: { in: [...administratorRoles] },
    };

    if (filters.userId) {
      where.id = filters.userId;
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { fullName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const storeId = filters.storeId;

    if (storeId) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { storeAccesses: { some: { storeId } } },
            { storeAccesses: { none: {} } },
          ],
        },
      ];
    } else if (allowedStoreIds) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { storeAccesses: { some: { storeId: { in: allowedStoreIds } } } },
            { storeAccesses: { none: {} } },
          ],
        },
      ];
    }

    return where;
  }

  private buildStoreFactWhere(
    storeId: string | null,
    allowedStoreIds: string[] | null,
  ) {
    if (storeId) {
      return { storeId };
    }

    if (allowedStoreIds) {
      return { storeId: { in: allowedStoreIds } };
    }

    return {};
  }

  private toSchemeResponse(scheme: StaffSalarySchemeRow) {
    return {
      id: scheme.id,
      storeId: scheme.storeId,
      title: scheme.title,
      description: scheme.description,
      status: scheme.status as SalarySchemeStatus,
      roleScope: scheme.roleScope as SalaryRoleScope,
      periodType: scheme.periodType as SalaryPeriodType,
      fixedAmount: this.toNumber(scheme.fixedAmount),
      hourlyRate: this.toNumber(scheme.hourlyRate),
      shiftRate: this.toNumber(scheme.shiftRate),
      bonusRules: this.readBonusRules(scheme.bonusRules),
      penaltyRules: this.readPenaltyRules(scheme.penaltyRules),
      store: scheme.store,
      createdByUser: scheme.createdByUser,
      createdAt: scheme.createdAt.toISOString(),
      updatedAt: scheme.updatedAt.toISOString(),
    };
  }

  private normalizeBonusRules(
    value: Partial<SalaryBonusRules> | null | undefined,
  ) {
    return {
      taskDoneOnTimeAmount:
        this.safeMoneyNumber(value?.taskDoneOnTimeAmount) ??
        defaultBonusRules.taskDoneOnTimeAmount,
      acceptedChecklistAmount:
        this.safeMoneyNumber(value?.acceptedChecklistAmount) ??
        defaultBonusRules.acceptedChecklistAmount,
      perfectChecklistAmount:
        this.safeMoneyNumber(value?.perfectChecklistAmount) ??
        defaultBonusRules.perfectChecklistAmount,
      noViolationAmount:
        this.safeMoneyNumber(value?.noViolationAmount) ??
        defaultBonusRules.noViolationAmount,
    };
  }

  private normalizePenaltyRules(
    value: Partial<SalaryPenaltyRules> | null | undefined,
  ) {
    return {
      overdueTaskAmount:
        this.safeMoneyNumber(value?.overdueTaskAmount) ??
        defaultPenaltyRules.overdueTaskAmount,
      returnedChecklistAmount:
        this.safeMoneyNumber(value?.returnedChecklistAmount) ??
        defaultPenaltyRules.returnedChecklistAmount,
      failedChecklistItemAmount:
        this.safeMoneyNumber(value?.failedChecklistItemAmount) ??
        defaultPenaltyRules.failedChecklistItemAmount,
      warningAmount:
        this.safeMoneyNumber(value?.warningAmount) ??
        defaultPenaltyRules.warningAmount,
      includeDisciplineFines: value?.includeDisciplineFines !== false,
    };
  }

  private readBonusRules(value: Prisma.JsonValue | null | undefined) {
    const rules = this.isPlainObject(value) ? value : {};
    return {
      taskDoneOnTimeAmount:
        this.safeMoneyNumber(rules.taskDoneOnTimeAmount) ??
        defaultBonusRules.taskDoneOnTimeAmount,
      acceptedChecklistAmount:
        this.safeMoneyNumber(rules.acceptedChecklistAmount) ??
        defaultBonusRules.acceptedChecklistAmount,
      perfectChecklistAmount:
        this.safeMoneyNumber(rules.perfectChecklistAmount) ??
        defaultBonusRules.perfectChecklistAmount,
      noViolationAmount:
        this.safeMoneyNumber(rules.noViolationAmount) ??
        defaultBonusRules.noViolationAmount,
    };
  }

  private readPenaltyRules(value: Prisma.JsonValue | null | undefined) {
    const rules = this.isPlainObject(value) ? value : {};
    const includeDisciplineFinesValue: unknown = rules.includeDisciplineFines;
    return {
      overdueTaskAmount:
        this.safeMoneyNumber(rules.overdueTaskAmount) ??
        defaultPenaltyRules.overdueTaskAmount,
      returnedChecklistAmount:
        this.safeMoneyNumber(rules.returnedChecklistAmount) ??
        defaultPenaltyRules.returnedChecklistAmount,
      failedChecklistItemAmount:
        this.safeMoneyNumber(rules.failedChecklistItemAmount) ??
        defaultPenaltyRules.failedChecklistItemAmount,
      warningAmount:
        this.safeMoneyNumber(rules.warningAmount) ??
        defaultPenaltyRules.warningAmount,
      includeDisciplineFines:
        typeof includeDisciplineFinesValue === 'boolean'
          ? includeDisciplineFinesValue
          : defaultPenaltyRules.includeDisciplineFines,
    };
  }

  private ensureSalaryAccess(user: AuthenticatedUser) {
    if (!salaryManagerRoles.some((role) => role === user.role)) {
      throw new ForbiddenException(
        'Salary module is available only to managers',
      );
    }
  }

  private async resolveAllowedStoreIds(
    user: AuthenticatedUser,
    tenantId: string,
  ) {
    if (user.role !== UserRole.CLUB_MANAGER) {
      return null;
    }

    const accesses = await this.prisma.userStoreAccess.findMany({
      where: { userId: user.id, user: { tenantId } },
      select: { storeId: true },
    });

    return accesses.map((access) => access.storeId);
  }

  private ensureStoreAccess(
    user: AuthenticatedUser,
    storeId: string | null,
    allowedStoreIds: string[] | null,
    requireStoreForClubManager = false,
  ) {
    if (!allowedStoreIds) {
      return;
    }

    if (!storeId) {
      if (requireStoreForClubManager) {
        throw new ForbiddenException(
          'Club manager can manage only club salary schemes',
        );
      }

      return;
    }

    if (!allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Club manager can access only own club salary data',
      );
    }

    void user;
  }

  private async resolveStoreId(tenantId: string, value: string | null) {
    const storeId = this.normalizeOptionalString(value);

    if (!storeId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { tenantId, id: storeId },
      select: { id: true },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store.id;
  }

  private resolveFilters(query: StaffSalaryQuery): ResolvedSalaryFilters {
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
      schemeId: this.normalizeOptionalString(query.schemeId),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private resolveSchemeStatus(value: unknown): SalarySchemeStatus {
    if (salarySchemeStatuses.includes(value as SalarySchemeStatus)) {
      return value as SalarySchemeStatus;
    }

    throw new BadRequestException('Invalid salary scheme status');
  }

  private resolvePeriodType(value: unknown): SalaryPeriodType {
    if (salaryPeriodTypes.includes(value as SalaryPeriodType)) {
      return value as SalaryPeriodType;
    }

    throw new BadRequestException('Invalid salary period type');
  }

  private resolveRoleScope(value: unknown): SalaryRoleScope {
    if (salaryRoleScopes.includes(value as SalaryRoleScope)) {
      return value as SalaryRoleScope;
    }

    throw new BadRequestException('Invalid salary role scope');
  }

  private resolveMoney(value: unknown, field: string) {
    const number = this.safeMoneyNumber(value);

    if (number === null) {
      return new Prisma.Decimal(0);
    }

    if (number < 0) {
      throw new BadRequestException(`${field} must be positive`);
    }

    return new Prisma.Decimal(number.toFixed(2));
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

  private normalizeRequiredString(value: unknown, field: string) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private normalizeOptionalString(value: unknown) {
    if (value === null || value === undefined || typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private safeMoneyNumber(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value.replace(',', '.'))
          : NaN;

    if (!Number.isFinite(number)) {
      return null;
    }

    return this.roundMoney(number);
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }

  private sum(rows: Array<Record<string, unknown>>, field: string) {
    return this.roundMoney(
      rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0),
    );
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
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
