import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const administratorRoles = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;

const salarySchemeStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const salaryPeriodTypes = ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'CUSTOM'] as const;
const salaryCalculationPeriodModes = ['MONTH', 'CUSTOM'] as const;
const salaryRoleScopes = [
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_ADMINISTRATOR',
] as const;

const salaryManagerRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STANDARDS_MANAGER,
] as const;

type SalaryProductSaleBonusRule = {
  productId: string;
  amount: number;
};

type SalaryBonusRules = {
  taskDoneOnTimeAmount: number;
  acceptedChecklistAmount: number;
  perfectChecklistAmount: number;
  noViolationAmount: number;
  barRevenuePercent: number;
  productSaleBonuses: SalaryProductSaleBonusRule[];
};

const defaultBonusRules: SalaryBonusRules = {
  taskDoneOnTimeAmount: 0,
  acceptedChecklistAmount: 0,
  perfectChecklistAmount: 0,
  noViolationAmount: 0,
  barRevenuePercent: 0,
  productSaleBonuses: [],
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
type SalaryCalculationPeriodMode =
  (typeof salaryCalculationPeriodModes)[number];
type SalaryRoleScope = (typeof salaryRoleScopes)[number];
type StoreOption = { id: string; name: string; isActive: boolean };
type SalaryPenaltyRules = typeof defaultPenaltyRules;

type QueryValue = string | string[] | undefined;

export type StaffSalaryQuery = {
  dateFrom?: QueryValue;
  dateTo?: QueryValue;
  storeId?: QueryValue;
  storeIds?: QueryValue;
  userId?: QueryValue;
  userIds?: QueryValue;
  schemeId?: QueryValue;
  search?: QueryValue;
  calculate?: QueryValue;
  periodMode?: QueryValue;
  month?: QueryValue;
  roleScope?: QueryValue;
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
  calculate: boolean;
  periodMode: SalaryCalculationPeriodMode;
  month: string;
  dateFrom: string;
  dateTo: string;
  start: Date;
  end: Date;
  storeId: string | null;
  storeIds: string[] | null;
  userId: string | null;
  userIds: string[];
  roleScope: SalaryRoleScope;
  schemeId: string | null;
  search: string | null;
};

export type StaffSalaryPeriodDto = StaffSalaryQuery;

export type StaffSalaryPeriodAdjustmentDto = {
  shiftDelta?: number | string | null;
  shiftCount?: number | string | null;
  bonusAmount?: number | string | null;
  penaltyAmount?: number | string | null;
  comment?: string | null;
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

type SalaryUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  storeAccesses: Array<{ store: StoreOption }>;
  staffMember: {
    id: string;
    displayName: string;
    storeId: string | null;
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    externalUserId: string | null;
    store: StoreOption | null;
  } | null;
};

type SalaryShiftRow = {
  id: string;
  storeId: string | null;
  durationMinutes: number | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalUserId: string | null;
  store: StoreOption | null;
};

type SalarySaleRow = {
  id: string;
  storeId: string;
  productId: string;
  saleDate: Date;
  quantity: Prisma.Decimal;
  revenue: Prisma.Decimal;
  productNameAtSale: string | null;
  product: {
    id: string;
    name: string;
    article: string;
    category: { name: string } | null;
  };
};

type SalaryProductBonusLine = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  totalAmount: number;
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
    this.ensureStoreFilterAccess(user, filters.storeIds, allowedStoreIds);

    const [stores, schemes, users, products] = await Promise.all([
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
          staffMember: {
            select: {
              id: true,
              displayName: true,
              storeId: true,
              externalProvider: true,
              externalDomain: true,
              externalUserId: true,
              store: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
      this.buildSalaryProductOptions(tenantId, filters, allowedStoreIds),
    ]);

    const calculationUsers = filters.calculate
      ? this.filterCalculationUsers(users, filters)
      : [];
    const rows = await this.buildSalaryRows({
      tenantId,
      filters,
      schemes,
      users: calculationUsers,
      allowedStoreIds,
    });
    const periods = await this.prisma.staffSalaryPeriod.findMany({
      where: { tenantId },
      orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
      take: 24,
    });

    return {
      filters: {
        calculate: filters.calculate,
        periodMode: filters.periodMode,
        month: filters.month,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        storeIds: filters.storeIds ?? [],
        userId: filters.userId,
        userIds: filters.userIds,
        roleScope: filters.roleScope,
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
        openShifts: rows.reduce((sum, row) => sum + row.openShifts, 0),
        hours: this.roundMoney(rows.reduce((sum, row) => sum + row.hours, 0)),
      },
      schemes: schemes.map((scheme) => this.toSchemeResponse(scheme)),
      rows,
      periods: periods.map((period) => this.toPeriodResponse(period)),
      stores,
      products,
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
    users: SalaryUserRow[];
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
            input.filters.storeIds,
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
            input.filters.storeIds,
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
            input.filters.storeIds,
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
    const identityFilters = input.users
      .map((row) => {
        const member = row.staffMember;

        if (!member?.externalDomain || !member.externalUserId) {
          return null;
        }

        return {
          userId: row.id,
          externalProvider:
            member.externalProvider ?? IntegrationProvider.LANGAME,
          externalDomain: member.externalDomain,
          externalUserId: member.externalUserId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const userIdByShiftIdentity = new Map(
      identityFilters.map((row) => [
        this.salaryExternalIdentityKey(
          row.externalProvider,
          row.externalDomain,
          row.externalUserId,
        ),
        row.userId,
      ]),
    );
    const shiftWhereParts: Prisma.GuestWorkingShiftWhereInput[] = [];

    if (allShiftIds.length > 0) {
      shiftWhereParts.push({
        id: { in: allShiftIds },
        startedAt: { gte: input.filters.start, lte: input.filters.end },
      });
    }

    if (identityFilters.length > 0) {
      shiftWhereParts.push({
        startedAt: { gte: input.filters.start, lte: input.filters.end },
        OR: identityFilters.map((row) => ({
          externalProvider: row.externalProvider,
          externalDomain: row.externalDomain,
          externalUserId: row.externalUserId,
        })),
      });
    }

    const shifts: SalaryShiftRow[] =
      shiftWhereParts.length > 0
        ? await this.prisma.guestWorkingShift.findMany({
            where: {
              tenantId: input.tenantId,
              ...this.buildStoreFactWhere(
                input.filters.storeIds,
                input.allowedStoreIds,
              ),
              OR: shiftWhereParts,
            },
            select: {
              id: true,
              storeId: true,
              durationMinutes: true,
              startedAt: true,
              stoppedAt: true,
              externalProvider: true,
              externalDomain: true,
              externalUserId: true,
              store: { select: { id: true, name: true, isActive: true } },
            },
          })
        : [];
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));

    shifts.forEach((shift) => {
      const userId = userIdByShiftIdentity.get(
        this.salaryExternalIdentityKey(
          shift.externalProvider,
          shift.externalDomain,
          shift.externalUserId,
        ),
      );

      if (userId) {
        getBucket(userId).shiftIds.add(shift.id);
      }
    });

    const salesByShiftId = await this.buildSalesByShift(input.tenantId, shifts);

    return input.users.map((row) => {
      const bucket = buckets.get(row.id) ?? getBucket(row.id);
      const scheme = this.pickSchemeForUser(input.schemes, row, input.filters);
      const bonusRules = this.readBonusRules(scheme?.bonusRules);
      const penaltyRules = this.readPenaltyRules(scheme?.penaltyRules);
      const fixedAmount = this.toNumber(scheme?.fixedAmount);
      const hourlyRate = this.toNumber(scheme?.hourlyRate);
      const shiftRate = this.toNumber(scheme?.shiftRate);
      const shiftMetrics = this.resolveShiftMetrics(bucket, shiftById);
      const salesMetrics = this.resolveSalesMetrics(
        bucket,
        salesByShiftId,
        bonusRules,
      );
      const hasExternalIdentity = Boolean(
        this.salaryExternalIdentityKey(
          row.staffMember?.externalProvider ?? null,
          row.staffMember?.externalDomain ?? null,
          row.staffMember?.externalUserId ?? null,
        ),
      );
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
            : 0) +
          salesMetrics.barRevenueBonusAmount +
          salesMetrics.productSaleBonusAmount,
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
        openShifts: shiftMetrics.openShifts,
        hours: shiftMetrics.hours,
        shiftStores: shiftMetrics.stores,
        sales: {
          barRevenue: salesMetrics.barRevenue,
          barRevenueBonusAmount: salesMetrics.barRevenueBonusAmount,
          productSaleBonusAmount: salesMetrics.productSaleBonusAmount,
          productSaleBonuses: salesMetrics.productSaleBonuses,
        },
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
        sourceWarnings: this.buildSourceWarnings(
          scheme,
          shiftMetrics,
          hasExternalIdentity,
        ),
      };
    });
  }

  async createPeriod(user: AuthenticatedUser, dto: StaffSalaryPeriodDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.ensureSalaryAccess(user);
    const filters = this.resolveFilters({ ...dto, calculate: '1' });
    const allowedStoreIds = await this.resolveAllowedStoreIds(user, tenantId);
    this.ensureStoreFilterAccess(user, filters.storeIds, allowedStoreIds);
    const [schemes, users] = await Promise.all([
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
          staffMember: {
            select: {
              id: true,
              displayName: true,
              storeId: true,
              externalProvider: true,
              externalDomain: true,
              externalUserId: true,
              store: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
    ]);
    const rows = await this.buildSalaryRows({
      tenantId,
      filters,
      schemes,
      users: this.filterCalculationUsers(users, filters),
      allowedStoreIds,
    });
    const totals = this.buildPeriodTotals(rows);
    const period = await this.prisma.staffSalaryPeriod.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        title: this.buildPeriodTitle(filters),
        periodMode: filters.periodMode,
        dateFrom: filters.start,
        dateTo: filters.end,
        storeIds: filters.storeIds ?? [],
        roleScope: filters.roleScope,
        userIds: filters.userIds,
        rows: rows,
        ...totals,
      },
    });

    return this.toPeriodResponse(period);
  }

  async updatePeriodRowAdjustment(
    user: AuthenticatedUser,
    periodId: string,
    userId: string,
    dto: StaffSalaryPeriodAdjustmentDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.ensureSalaryAccess(user);
    const period = await this.prisma.staffSalaryPeriod.findFirst({
      where: { tenantId, id: periodId },
    });

    if (!period) {
      throw new NotFoundException('Salary period not found');
    }

    const rows = this.normalizePeriodRows(period.rows).map((row) => {
      if (row.id !== userId) {
        return row;
      }

      const originalShifts =
        this.safeMoneyNumber(row.originalShifts) ??
        this.safeMoneyNumber(row.shifts) ??
        0;
      const requestedShiftCount = this.safeMoneyNumber(dto.shiftCount);

      return this.applyPeriodRowAdjustment(row, {
        shiftDelta:
          requestedShiftCount === null
            ? (this.safeMoneyNumber(dto.shiftDelta) ?? 0)
            : requestedShiftCount - originalShifts,
        bonusAmount: this.safeMoneyNumber(dto.bonusAmount) ?? 0,
        penaltyAmount: this.safeMoneyNumber(dto.penaltyAmount) ?? 0,
        comment: this.normalizeOptionalString(dto.comment),
      });
    });
    const totals = this.buildPeriodTotals(rows);
    const updated = await this.prisma.staffSalaryPeriod.update({
      where: { id: period.id },
      data: {
        rows: rows as unknown as Prisma.InputJsonValue,
        ...totals,
      },
    });

    return this.toPeriodResponse(updated);
  }

  private async buildSalesByShift(tenantId: string, shifts: SalaryShiftRow[]) {
    const closedShifts = shifts
      .filter((shift) => shift.storeId && shift.startedAt && shift.stoppedAt)
      .sort(
        (left, right) =>
          (left.startedAt?.getTime() ?? 0) - (right.startedAt?.getTime() ?? 0),
      );

    if (closedShifts.length === 0) {
      return new Map<string, SalarySaleRow[]>();
    }

    const sales = await this.prisma.salesFact.findMany({
      where: {
        tenantId,
        isCanceled: false,
        OR: closedShifts.map((shift) => ({
          storeId: shift.storeId as string,
          saleDate: {
            gte: shift.startedAt as Date,
            lte: shift.stoppedAt as Date,
          },
        })),
      },
      select: {
        id: true,
        storeId: true,
        productId: true,
        saleDate: true,
        quantity: true,
        revenue: true,
        productNameAtSale: true,
        product: {
          select: {
            id: true,
            name: true,
            article: true,
            category: { select: { name: true } },
          },
        },
      },
    });
    const shiftsByStoreId = new Map<string, SalaryShiftRow[]>();

    closedShifts.forEach((shift) => {
      const rows = shiftsByStoreId.get(shift.storeId as string) ?? [];
      rows.push(shift);
      shiftsByStoreId.set(shift.storeId as string, rows);
    });

    const salesByShiftId = new Map<string, SalarySaleRow[]>();

    sales.forEach((sale) => {
      const matchingShift = (shiftsByStoreId.get(sale.storeId) ?? []).find(
        (shift) =>
          shift.startedAt &&
          shift.stoppedAt &&
          sale.saleDate >= shift.startedAt &&
          sale.saleDate <= shift.stoppedAt,
      );

      if (!matchingShift) {
        return;
      }

      const rows = salesByShiftId.get(matchingShift.id) ?? [];
      rows.push(sale);
      salesByShiftId.set(matchingShift.id, rows);
    });

    return salesByShiftId;
  }

  private resolveSalesMetrics(
    bucket: SalaryFactBucket,
    salesByShiftId: Map<string, SalarySaleRow[]>,
    bonusRules: SalaryBonusRules,
  ) {
    const sales = Array.from(bucket.shiftIds).flatMap(
      (shiftId) => salesByShiftId.get(shiftId) ?? [],
    );
    const barRevenue = this.roundMoney(
      sales.reduce((sum, sale) => sum + this.toNumber(sale.revenue), 0),
    );
    const barRevenueBonusAmount = this.roundMoney(
      (barRevenue * bonusRules.barRevenuePercent) / 100,
    );
    const saleQuantityByProductId = new Map<
      string,
      { productName: string; quantity: number }
    >();

    sales.forEach((sale) => {
      const current = saleQuantityByProductId.get(sale.productId) ?? {
        productName: sale.productNameAtSale ?? sale.product.name,
        quantity: 0,
      };
      current.quantity = this.roundMoney(
        current.quantity + this.toNumber(sale.quantity),
      );
      saleQuantityByProductId.set(sale.productId, current);
    });

    const productSaleBonuses: SalaryProductBonusLine[] =
      bonusRules.productSaleBonuses
        .map((rule) => {
          const sale = saleQuantityByProductId.get(rule.productId);
          const quantity = sale?.quantity ?? 0;
          const totalAmount = this.roundMoney(quantity * rule.amount);

          return {
            productId: rule.productId,
            productName: sale?.productName ?? 'Товар не продавался',
            quantity,
            amount: rule.amount,
            totalAmount,
          };
        })
        .filter((row) => row.quantity > 0 && row.totalAmount > 0);
    const productSaleBonusAmount = this.roundMoney(
      productSaleBonuses.reduce((sum, row) => sum + row.totalAmount, 0),
    );

    return {
      barRevenue,
      barRevenueBonusAmount,
      productSaleBonusAmount,
      productSaleBonuses,
    };
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

    const selectedStoreIds = filters.storeIds ?? [];

    if (selectedStoreIds.length === 1) {
      const storeScheme = pool.find(
        (scheme) => scheme.storeId === selectedStoreIds[0],
      );

      if (storeScheme) {
        return storeScheme;
      }
    }

    const scopedUserStoreIds =
      selectedStoreIds.length > 0
        ? new Set(
            Array.from(userStoreIds).filter((storeId) =>
              selectedStoreIds.includes(storeId),
            ),
          )
        : userStoreIds;
    const userStoreScheme = pool.find(
      (scheme) => scheme.storeId && scopedUserStoreIds.has(scheme.storeId),
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
    shiftById: Map<string, SalaryShiftRow>,
  ) {
    const shifts: SalaryShiftRow[] = [];
    const stores = new Map<string, StoreOption>();
    bucket.shiftIds.forEach((id) => {
      const shift = shiftById.get(id);

      if (shift) {
        shifts.push(shift);

        if (shift.store) {
          stores.set(shift.store.id, shift.store);
        }
      }
    });

    let closedShifts = 0;
    let openShifts = 0;
    const minutes = shifts.reduce((sum, shift) => {
      if (!shift.stoppedAt) {
        openShifts += 1;
        return sum;
      }

      closedShifts += 1;

      if (shift.durationMinutes) {
        return sum + shift.durationMinutes;
      }

      if (shift.startedAt) {
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
      shifts: closedShifts,
      openShifts,
      hours: this.roundMoney(minutes / 60),
      stores: Array.from(stores.values()).sort((left, right) =>
        left.name.localeCompare(right.name, 'ru'),
      ),
    };
  }

  private buildSourceWarnings(
    scheme: StaffSalarySchemeRow | null,
    shiftMetrics: { shifts: number; openShifts: number },
    hasExternalIdentity: boolean,
  ) {
    const warnings: string[] = [];
    const usesShiftFacts =
      !scheme ||
      this.toNumber(scheme.shiftRate) > 0 ||
      this.toNumber(scheme.hourlyRate) > 0;

    if (!scheme) {
      warnings.push(
        'Нет активных правил зарплаты: расчет показывает только факты без начислений.',
      );
    } else if (scheme.status === 'DRAFT') {
      warnings.push(
        'Выбран черновик правил. Для автоподбора и рабочего расчета переведите правила в статус «Активна».',
      );
    }

    if (usesShiftFacts && !hasExternalIdentity && shiftMetrics.shifts === 0) {
      warnings.push(
        'У сотрудника не указан Langame user_id: смены не попадут в расчет.',
      );
    } else if (usesShiftFacts && !hasExternalIdentity) {
      warnings.push(
        'Langame user_id не указан, поэтому смены найдены только через связанные задачи или чек-листы.',
      );
    }

    if (
      usesShiftFacts &&
      shiftMetrics.shifts === 0 &&
      shiftMetrics.openShifts === 0
    ) {
      warnings.push(
        'Закрытых смен Langame за период не найдено. Проверьте клуб, период и привязку сотрудника к Langame.',
      );
    }

    if (shiftMetrics.openShifts > 0) {
      warnings.push(
        'Есть открытые смены Langame: они появятся в начислениях после закрытия смены.',
      );
    }

    return warnings;
  }

  private salaryExternalIdentityKey(
    provider: IntegrationProvider | null,
    domain: string | null,
    userId: string | null,
  ) {
    if (!domain || !userId) {
      return null;
    }

    return `${provider ?? IntegrationProvider.LANGAME}:${domain}:${userId}`;
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

  private filterCalculationUsers(
    users: SalaryUserRow[],
    filters: ResolvedSalaryFilters,
  ) {
    if (filters.userIds.length > 0) {
      const selected = new Set(filters.userIds);
      return users.filter((row) => selected.has(row.id));
    }

    if (filters.roleScope === 'SENIOR_ADMINISTRATOR') {
      return users.filter((row) => row.role === UserRole.SENIOR_ADMINISTRATOR);
    }

    if (filters.roleScope === 'CLUB_ADMINISTRATOR') {
      return users.filter((row) => row.role === UserRole.CLUB_ADMINISTRATOR);
    }

    return users;
  }

  private buildStoreWhere(tenantId: string, allowedStoreIds: string[] | null) {
    const where: Prisma.StoreWhereInput = { tenantId };

    if (allowedStoreIds) {
      where.id = { in: allowedStoreIds };
    }

    return where;
  }

  private async buildSalaryProductOptions(
    tenantId: string,
    filters: ResolvedSalaryFilters,
    allowedStoreIds: string[] | null,
  ) {
    const storeFactWhere = this.buildStoreFactWhere(
      filters.storeIds,
      allowedStoreIds,
    );
    const productWhere: Prisma.ProductWhereInput = {
      tenantId,
      isActive: true,
    };

    if (filters.storeIds || allowedStoreIds) {
      productWhere.salesFacts = {
        some: {
          tenantId,
          isCanceled: false,
          ...storeFactWhere,
        },
      };
    }

    const products = await this.prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        article: true,
        name: true,
        salePrice: true,
        category: { select: { name: true } },
      },
      orderBy: [{ name: 'asc' }, { article: 'asc' }],
      take: 500,
    });
    const productIds = products.map((product) => product.id);
    const salesFacts =
      productIds.length > 0
        ? await this.prisma.salesFact.findMany({
            where: {
              tenantId,
              productId: { in: productIds },
              isCanceled: false,
              ...storeFactWhere,
            },
            select: {
              productId: true,
              store: { select: { id: true, name: true, isActive: true } },
            },
            distinct: ['productId', 'storeId'],
          })
        : [];
    const storesByProductId = new Map<string, Map<string, StoreOption>>();

    salesFacts.forEach((fact) => {
      const stores =
        storesByProductId.get(fact.productId) ?? new Map<string, StoreOption>();
      stores.set(fact.store.id, fact.store);
      storesByProductId.set(fact.productId, stores);
    });

    return products.map((product) => ({
      id: product.id,
      article: product.article,
      name: product.name,
      categoryName: product.category?.name ?? null,
      salePrice: this.toNumber(product.salePrice),
      stores: Array.from(
        storesByProductId.get(product.id)?.values() ?? [],
      ).sort((left, right) => left.name.localeCompare(right.name, 'ru')),
    }));
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

    const storeIds = filters.storeIds;

    if (storeIds && storeIds.length > 0) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { storeAccesses: { some: { storeId: { in: storeIds } } } },
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
    storeIds: string[] | null,
    allowedStoreIds: string[] | null,
  ) {
    const targetStoreIds =
      storeIds && storeIds.length > 0 ? storeIds : allowedStoreIds;

    if (!targetStoreIds || targetStoreIds.length === 0) {
      return {};
    }

    if (targetStoreIds.length === 1) {
      return { storeId: targetStoreIds[0] };
    }

    return { storeId: { in: targetStoreIds } };
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
      barRevenuePercent:
        this.safePercentNumber(value?.barRevenuePercent) ??
        defaultBonusRules.barRevenuePercent,
      productSaleBonuses: this.normalizeProductSaleBonuses(
        value?.productSaleBonuses,
      ),
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
      barRevenuePercent:
        this.safePercentNumber(rules.barRevenuePercent) ??
        defaultBonusRules.barRevenuePercent,
      productSaleBonuses: this.normalizeProductSaleBonuses(
        rules.productSaleBonuses,
      ),
    };
  }

  private normalizeProductSaleBonuses(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    const rows = new Map<string, SalaryProductSaleBonusRule>();

    value.forEach((item) => {
      if (!this.isPlainObject(item)) {
        return;
      }

      const productId = this.normalizeOptionalString(item.productId);
      const amount = this.safeMoneyNumber(item.amount);

      if (!productId || amount === null || amount <= 0) {
        return;
      }

      rows.set(productId, { productId, amount });
    });

    return Array.from(rows.values());
  }

  private buildPeriodTotals(rows: Array<Record<string, unknown>>) {
    return {
      totalEmployees: rows.length,
      totalBaseAmount: this.toSignedDecimal(this.sum(rows, 'baseAmount')),
      totalShiftAmount: this.toSignedDecimal(this.sum(rows, 'shiftAmount')),
      totalHourlyAmount: this.toSignedDecimal(this.sum(rows, 'hourlyAmount')),
      totalBonusAmount: this.toSignedDecimal(this.sum(rows, 'bonusAmount')),
      totalPenaltyAmount: this.toSignedDecimal(this.sum(rows, 'penaltyAmount')),
      totalNetAmount: this.toSignedDecimal(this.sum(rows, 'netAmount')),
    };
  }

  private toSignedDecimal(value: number) {
    return new Prisma.Decimal(this.roundMoney(value).toFixed(2));
  }

  private buildPeriodTitle(filters: ResolvedSalaryFilters) {
    if (filters.periodMode === 'MONTH') {
      return `Зарплата за ${filters.month}`;
    }

    return `Зарплата за ${filters.dateFrom} - ${filters.dateTo}`;
  }

  private toPeriodResponse(period: {
    id: string;
    title: string;
    status: string;
    periodMode: string;
    dateFrom: Date;
    dateTo: Date;
    storeIds: string[];
    roleScope: string;
    userIds: string[];
    rows: Prisma.JsonValue;
    totalEmployees: number;
    totalBaseAmount: Prisma.Decimal;
    totalShiftAmount: Prisma.Decimal;
    totalHourlyAmount: Prisma.Decimal;
    totalBonusAmount: Prisma.Decimal;
    totalPenaltyAmount: Prisma.Decimal;
    totalNetAmount: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: period.id,
      title: period.title,
      status: period.status,
      periodMode: period.periodMode,
      dateFrom: this.toDateOnly(period.dateFrom),
      dateTo: this.toDateOnly(period.dateTo),
      storeIds: period.storeIds,
      roleScope: period.roleScope,
      userIds: period.userIds,
      rows: this.normalizePeriodRows(period.rows),
      totalEmployees: period.totalEmployees,
      totalBaseAmount: this.toNumber(period.totalBaseAmount),
      totalShiftAmount: this.toNumber(period.totalShiftAmount),
      totalHourlyAmount: this.toNumber(period.totalHourlyAmount),
      totalBonusAmount: this.toNumber(period.totalBonusAmount),
      totalPenaltyAmount: this.toNumber(period.totalPenaltyAmount),
      totalNetAmount: this.toNumber(period.totalNetAmount),
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    };
  }

  private normalizePeriodRows(value: Prisma.JsonValue) {
    return Array.isArray(value)
      ? (value as Array<Record<string, unknown>>)
      : [];
  }

  private applyPeriodRowAdjustment(
    row: Record<string, unknown>,
    adjustment: {
      shiftDelta: number;
      bonusAmount: number;
      penaltyAmount: number;
      comment: string | null;
    },
  ) {
    const scheme = this.isPlainObject(row.scheme) ? row.scheme : {};
    const shiftRate = this.safeMoneyNumber(scheme.shiftRate) ?? 0;
    const originalShifts =
      this.safeMoneyNumber(row.originalShifts) ??
      this.safeMoneyNumber(row.shifts) ??
      0;
    const nextShifts = Math.max(0, originalShifts + adjustment.shiftDelta);
    const shiftAmount = this.roundMoney(nextShifts * shiftRate);
    const baseAmount = this.safeMoneyNumber(row.baseAmount) ?? 0;
    const hourlyAmount = this.safeMoneyNumber(row.hourlyAmount) ?? 0;
    const originalBonusAmount =
      this.safeMoneyNumber(row.originalBonusAmount) ??
      this.safeMoneyNumber(row.bonusAmount) ??
      0;
    const originalPenaltyAmount =
      this.safeMoneyNumber(row.originalPenaltyAmount) ??
      this.safeMoneyNumber(row.penaltyAmount) ??
      0;
    const bonusAmount = this.roundMoney(
      originalBonusAmount + adjustment.bonusAmount,
    );
    const penaltyAmount = this.roundMoney(
      originalPenaltyAmount + adjustment.penaltyAmount,
    );

    return {
      ...row,
      originalShifts,
      originalBonusAmount,
      originalPenaltyAmount,
      shifts: nextShifts,
      shiftAmount,
      bonusAmount,
      penaltyAmount,
      netAmount: this.roundMoney(
        baseAmount + shiftAmount + hourlyAmount + bonusAmount - penaltyAmount,
      ),
      manualAdjustment: adjustment,
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
        'Salary module is available only to standards managers and higher',
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

  private ensureStoreFilterAccess(
    user: AuthenticatedUser,
    storeIds: string[] | null,
    allowedStoreIds: string[] | null,
  ) {
    if (!allowedStoreIds || !storeIds || storeIds.length === 0) {
      return;
    }

    if (storeIds.some((storeId) => !allowedStoreIds.includes(storeId))) {
      throw new ForbiddenException(
        'Club manager can access only own club salary data',
      );
    }

    void user;
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
    const periodMode = this.resolveCalculationPeriodMode(query.periodMode);
    const month =
      this.normalizeMonth(query.month) ?? this.toMonthOnly(new Date());
    const range =
      periodMode === 'MONTH'
        ? this.monthDateRange(month)
        : {
            dateFrom:
              this.normalizeDate(query.dateFrom) ??
              this.toDateOnly(
                this.addDays(
                  new Date(
                    `${this.normalizeDate(query.dateTo) ?? this.toDateOnly(new Date())}T00:00:00.000Z`,
                  ),
                  -29,
                ),
              ),
            dateTo:
              this.normalizeDate(query.dateTo) ?? this.toDateOnly(new Date()),
          };
    const start = new Date(`${range.dateFrom}T00:00:00.000Z`);
    const end = new Date(`${range.dateTo}T23:59:59.999Z`);

    if (start > end) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const storeIds = this.normalizeIdList(query.storeIds ?? query.storeId);
    const userIds = this.normalizeIdList(query.userIds ?? query.userId);

    return {
      calculate: this.normalizeBooleanFlag(query.calculate),
      periodMode,
      month,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      start,
      end,
      storeId: storeIds.length === 1 ? storeIds[0] : null,
      storeIds: storeIds.length > 0 ? storeIds : null,
      userId: userIds.length === 1 ? userIds[0] : null,
      userIds,
      roleScope: this.resolveOptionalRoleScope(query.roleScope),
      schemeId: this.normalizeOptionalString(
        this.firstQueryValue(query.schemeId),
      ),
      search: this.normalizeOptionalString(this.firstQueryValue(query.search)),
    };
  }

  private resolveCalculationPeriodMode(
    value: QueryValue,
  ): SalaryCalculationPeriodMode {
    const normalized = this.normalizeOptionalString(
      this.firstQueryValue(value),
    );

    if (
      salaryCalculationPeriodModes.includes(
        normalized as SalaryCalculationPeriodMode,
      )
    ) {
      return normalized as SalaryCalculationPeriodMode;
    }

    return 'MONTH';
  }

  private resolveOptionalRoleScope(value: QueryValue): SalaryRoleScope {
    const normalized = this.normalizeOptionalString(
      this.firstQueryValue(value),
    );

    if (!normalized) {
      return 'ADMINISTRATOR';
    }

    return this.resolveRoleScope(normalized);
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

  private normalizeDate(value: QueryValue) {
    const normalized = this.normalizeOptionalString(
      this.firstQueryValue(value),
    );

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

  private normalizeMonth(value: QueryValue) {
    const normalized = this.normalizeOptionalString(
      this.firstQueryValue(value),
    );

    if (!normalized) {
      return null;
    }

    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('Month must use YYYY-MM format');
    }

    return normalized;
  }

  private monthDateRange(month: string) {
    const [year, monthValue] = month.split('-').map(Number);
    const dateFrom = `${month}-01`;
    const dateTo = this.toDateOnly(new Date(Date.UTC(year, monthValue, 0)));

    return { dateFrom, dateTo };
  }

  private toMonthOnly(date: Date) {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}`;
  }

  private normalizeIdList(value: QueryValue) {
    return Array.from(
      new Set(
        (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === 'string')
          .flatMap((item) => item.split(','))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizeBooleanFlag(value: QueryValue) {
    const normalized = this.normalizeOptionalString(
      this.firstQueryValue(value),
    );
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  private firstQueryValue(value: QueryValue) {
    return Array.isArray(value) ? value[0] : value;
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

  private safePercentNumber(value: unknown) {
    const number = this.safeMoneyNumber(value);

    if (number === null || number < 0) {
      return null;
    }

    return Math.min(number, 100);
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
