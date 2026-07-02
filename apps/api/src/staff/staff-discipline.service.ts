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
import {
  buildStaffExportFile,
  formatStaffDateTime,
  resolveStaffExportFormat,
  staffUserLabel,
  type StaffExportCell,
  type StaffExportFile,
} from './staff-export';

const adminRoles = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;

const selfDisciplineRoles = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;

const policyManagerRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STANDARDS_MANAGER,
] as const;

const recordStatuses = ['ACTIVE', 'CANCELED', 'RESET'] as const;

const defaultDisciplineRules = [
  ['Чистота', 'Мусор или грязь на игровых местах (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязные мышки (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязные клавиатуры (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязные наушники (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязные мониторы (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязное кресло (2 и более)', 250, 500, 750],
  ['Чистота', 'Грязный кальян', 250, 500, 750],
  ['Чистота', 'Невынос мусора после смены', 250, 500, 750],
  ['Взаимодействие', 'Неверная встреча нового гостя', 500, 750, 1000],
  ['Взаимодействие', 'Грубое отношение к гостям', 750, 1250, 1500],
  [
    'Взаимодействие',
    'Не передали информацию о получении новых устройств, поставки и т.д.',
    250,
    500,
    750,
  ],
  [
    'Взаимодействие',
    'Обман или намеренный ввод в заблуждение руководства',
    750,
    1500,
    2700,
  ],
  [
    'Взаимодействие',
    'Игнорирование сообщения в ТГ от гостей или отсутствие обратного звонка в течение 30 минут',
    300,
    600,
    900,
  ],
  [
    'Взаимодействие',
    'Неправильный телефонный разговор или не отправлена ссылка на скачивание Langame',
    300,
    600,
    900,
  ],
  [
    'Соблюдение регламента',
    'Выполнение задач регламента не по таймингу без объективной причины',
    250,
    500,
    750,
  ],
  [
    'Соблюдение регламента',
    'Употребление продукции бара без оплаты или воровство',
    500,
    1000,
    1500,
  ],
  [
    'Соблюдение регламента',
    'Не выход на смену без предупреждения и без объективных причин',
    1000,
    1500,
    2000,
  ],
  [
    'Соблюдение регламента',
    'Не убрано место в течение 30 минут после ухода гостя без объективной причины',
    300,
    600,
    900,
  ],
  [
    'Соблюдение регламента',
    'Невыполнение задач регламента смены',
    500,
    1000,
    1500,
  ],
  [
    'Соблюдение регламента',
    'Пропуск проверки работы уборщицы или отсутствие записи в листе уборки по вине администратора',
    250,
    500,
    1000,
  ],
  [
    'Соблюдение регламента',
    'Пропуск своевременного заказа нужной продукции или материалов клуба',
    500,
    750,
    1000,
  ],
  [
    'Соблюдение регламента',
    'Несоблюдение любых пунктов регламента работы',
    500,
    750,
    1000,
  ],
] as const;

type StaffDisciplineLevel =
  | 'WARNING_1'
  | 'WARNING_2'
  | 'FINE_1'
  | 'FINE_2'
  | 'FINE_3';
type StaffDisciplineRecordStatus = (typeof recordStatuses)[number];
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type StaffDisciplineAccessMode = 'MANAGE' | 'SELF';
type StoreOption = { id: string; name: string; isActive: boolean };

type StaffDisciplineAccess = {
  mode: StaffDisciplineAccessMode;
  userId: string | null;
  canManage: boolean;
  canExport: boolean;
};

export type StaffDisciplineQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  status?: StaffDisciplineRecordStatus | 'all';
  search?: string;
};

export type StaffDisciplineExportQuery = StaffDisciplineQuery & {
  format?: string;
};

export type StaffAdministratorRatingsQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  search?: string;
};

export type StaffDisciplinePolicyDto = {
  storeId?: string | null;
  enabled?: boolean;
};

export type StaffDisciplineRecordDto = {
  ruleId?: string;
  storeId?: string | null;
  userId?: string;
  occurredAt?: string | null;
  comment?: string | null;
};

export type StaffDisciplineRecordUpdateDto = {
  status?: StaffDisciplineRecordStatus;
  comment?: string | null;
};

type ResolvedDisciplineFilters = {
  dateFrom: string;
  dateTo: string;
  start: Date;
  end: Date;
  storeId: string | null;
  userId: string | null;
  status: StaffDisciplineRecordStatus | 'all';
  search: string | null;
};

const disciplineRecordInclude = {
  rule: { select: { id: true, category: true, title: true } },
  store: { select: { id: true, name: true, isActive: true } },
  user: { select: { id: true, email: true, fullName: true, role: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffDisciplineRecordInclude;

type StaffDisciplineRecordRow = Prisma.StaffDisciplineRecordGetPayload<{
  include: typeof disciplineRecordInclude;
}>;

@Injectable()
export class StaffDisciplineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getReport(user: AuthenticatedUser, query: StaffDisciplineQuery = {}) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureDefaultRules(tenantId);
    const access = this.resolveDisciplineAccess(user);
    const filters = this.resolveFilters(query, access.userId);

    const [rules, records, stores, users, policies] = await Promise.all([
      this.prisma.staffDisciplineRule.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.staffDisciplineRecord.findMany({
        where: this.buildRecordWhere(tenantId, filters),
        include: disciplineRecordInclude,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: this.buildDisciplineUserWhere(tenantId, access),
        select: { id: true, email: true, fullName: true, role: true },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
      this.prisma.staffDisciplinePolicy.findMany({
        where: { tenantId },
        orderBy: [{ storeId: 'asc' }],
      }),
    ]);

    return {
      access: {
        mode: access.mode,
        canManage: access.canManage,
        canExport: access.canExport,
      },
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        userId: filters.userId,
        status: filters.status,
        search: filters.search,
      },
      summary: this.buildDisciplineSummary(records, rules, stores, policies),
      policies: this.toPolicyResponses(stores, policies),
      rules: rules.map((rule) => ({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        firstFineAmount: this.toNumber(rule.firstFineAmount),
        secondFineAmount: this.toNumber(rule.secondFineAmount),
        thirdFineAmount: this.toNumber(rule.thirdFineAmount),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
      })),
      records: records.map((record) => this.toRecordResponse(record)),
      stores,
      users,
    };
  }

  async exportRecords(
    user: AuthenticatedUser,
    query: StaffDisciplineExportQuery = {},
  ): Promise<StaffExportFile> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureDefaultRules(tenantId);
    const access = this.resolveDisciplineAccess(user);

    if (!access.canExport) {
      throw new ForbiddenException(
        'Only managers can export discipline records',
      );
    }

    const filters = this.resolveFilters(query);
    const format = resolveStaffExportFormat(query.format);
    const records = await this.prisma.staffDisciplineRecord.findMany({
      where: this.buildRecordWhere(tenantId, filters),
      include: disciplineRecordInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 10000,
    });

    return buildStaffExportFile({
      format,
      fileNameBase: 'leetplus-staff-violations',
      sheetName: 'Violations',
      rows: [
        [
          'ID',
          'Дата',
          'Сотрудник',
          'Email',
          'Роль',
          'Клуб',
          'Категория',
          'Нарушение',
          'Уровень',
          'Сумма штрафа',
          'Статус',
          'Кто создал',
          'Комментарий',
          'Создано',
          'Обновлено',
        ],
        ...records.map((record) => this.toDisciplineExportRow(record)),
      ],
      widths: [36, 20, 28, 28, 24, 24, 24, 46, 18, 16, 16, 28, 42, 20, 20],
    });
  }

  async updatePolicy(user: AuthenticatedUser, dto: StaffDisciplinePolicyDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const storeId = await this.resolveStoreId(tenantId, dto.storeId ?? null);
    const enabled = dto.enabled === true;
    await this.assertCanManagePolicy(user, tenantId, storeId);

    const existing = await this.prisma.staffDisciplinePolicy.findFirst({
      where: { tenantId, storeId },
      select: { id: true },
    });

    const policy = existing
      ? await this.prisma.staffDisciplinePolicy.update({
          where: { id: existing.id },
          data: { enabled, updatedByUserId: user.id },
        })
      : await this.prisma.staffDisciplinePolicy.create({
          data: { tenantId, storeId, enabled, updatedByUserId: user.id },
        });

    return {
      id: policy.id,
      storeId: policy.storeId,
      enabled: policy.enabled,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async createRecord(user: AuthenticatedUser, dto: StaffDisciplineRecordDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.assertCanManageRecords(user);
    const ruleId = this.normalizeRequiredString(dto.ruleId, 'ruleId');
    const targetUserId = this.normalizeRequiredString(dto.userId, 'userId');
    const storeId = await this.resolveStoreId(tenantId, dto.storeId ?? null);

    if (!(await this.isDisciplineEnabled(tenantId, storeId))) {
      throw new BadRequestException(
        'Discipline system is disabled for this scope',
      );
    }

    const [rule, targetUser] = await Promise.all([
      this.prisma.staffDisciplineRule.findFirst({
        where: { id: ruleId, tenantId, isActive: true },
      }),
      this.prisma.user.findFirst({
        where: { id: targetUserId, tenantId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (!rule) {
      throw new NotFoundException('Discipline rule not found');
    }

    if (!targetUser) {
      throw new NotFoundException('Employee not found');
    }

    const next = await this.resolveNextRecordLevel(
      tenantId,
      targetUserId,
      rule,
    );
    const occurredAt =
      this.resolveOptionalDateTime(dto.occurredAt) ?? new Date();
    const comment = this.normalizeOptionalString(dto.comment);

    const created = await this.prisma.staffDisciplineRecord.create({
      data: {
        tenantId,
        ruleId: rule.id,
        storeId,
        userId: targetUserId,
        createdByUserId: user.id,
        occurredAt,
        categorySnapshot: rule.category,
        ruleTitleSnapshot: rule.title,
        level: next.level,
        amount: next.amount,
        comment,
      },
      include: disciplineRecordInclude,
    });

    return this.toRecordResponse(created);
  }

  async updateRecord(
    user: AuthenticatedUser,
    id: string,
    dto: StaffDisciplineRecordUpdateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    this.assertCanManageRecords(user);
    const current = await this.prisma.staffDisciplineRecord.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Discipline record not found');
    }

    const status = dto.status
      ? this.resolveRecordStatus(dto.status)
      : undefined;
    const updated = await this.prisma.staffDisciplineRecord.update({
      where: { id: current.id },
      data: {
        ...(status ? { status } : {}),
        ...(dto.comment !== undefined
          ? { comment: this.normalizeOptionalString(dto.comment) }
          : {}),
      },
      include: disciplineRecordInclude,
    });

    return this.toRecordResponse(updated);
  }

  async getAdministratorRatings(
    user: AuthenticatedUser,
    query: StaffAdministratorRatingsQuery = {},
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureDefaultRules(tenantId);
    const filters = this.resolveFilters({ ...query, status: 'ACTIVE' });

    const [
      users,
      checklists,
      regulations,
      acknowledgements,
      assessments,
      records,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: this.buildAdministratorWhere(tenantId, filters),
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          storeAccesses: {
            select: {
              store: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
      this.prisma.staffChecklistRun.findMany({
        where: {
          tenantId,
          assignedToUserId: { not: null },
          OR: [
            { scheduledAt: { gte: filters.start, lte: filters.end } },
            { submittedAt: { gte: filters.start, lte: filters.end } },
            { reviewedAt: { gte: filters.start, lte: filters.end } },
            { createdAt: { gte: filters.start, lte: filters.end } },
          ],
          ...(filters.storeId ? { storeId: filters.storeId } : {}),
        },
        select: {
          assignedToUserId: true,
          status: true,
          scoreTotal: true,
          scoreEarned: true,
          failedItems: true,
        },
        take: 10000,
      }),
      this.prisma.staffShiftRegulation.findMany({
        where: {
          tenantId,
          status: 'PUBLISHED',
          ...(filters.storeId
            ? { OR: [{ storeId: filters.storeId }, { storeId: null }] }
            : {}),
        },
        select: { id: true, storeId: true, roleScope: true, version: true },
      }),
      this.prisma.staffShiftRegulationAcknowledgement.findMany({
        where: { tenantId },
        select: { regulationId: true, userId: true, version: true },
      }),
      this.prisma.staffAssessmentResult.findMany({
        where: {
          tenantId,
          OR: [{ submittedAt: { lte: filters.end } }, { submittedAt: null }],
        },
        select: {
          userId: true,
          status: true,
          score: true,
          passed: true,
          submittedAt: true,
          createdAt: true,
        },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10000,
      }),
      this.prisma.staffDisciplineRecord.findMany({
        where: this.buildRecordWhere(tenantId, filters),
        select: {
          userId: true,
          level: true,
          amount: true,
          categorySnapshot: true,
        },
        take: 10000,
      }),
    ]);

    const checklistByUser = this.groupChecklistsByUser(checklists);
    const acknowledgementsSet = new Set(
      acknowledgements.map(
        (ack) => `${ack.userId}:${ack.regulationId}:${ack.version}`,
      ),
    );
    const assessmentByUser = new Map<string, (typeof assessments)[number]>();
    assessments.forEach((result) => {
      if (!assessmentByUser.has(result.userId)) {
        assessmentByUser.set(result.userId, result);
      }
    });
    const disciplineByUser = this.groupDisciplineByUser(records);

    const rows = users.map((row) => {
      const stores = row.storeAccesses.map((access) => access.store);
      const requiredRegulations = regulations.filter((regulation) =>
        this.isRegulationRequiredForUser(regulation, row.role, stores),
      );
      const acknowledged = requiredRegulations.filter((regulation) =>
        acknowledgementsSet.has(
          `${row.id}:${regulation.id}:${regulation.version}`,
        ),
      ).length;
      const checklist =
        checklistByUser.get(row.id) ?? this.emptyChecklistRating();
      const assessment = assessmentByUser.get(row.id) ?? null;
      const discipline =
        disciplineByUser.get(row.id) ?? this.emptyDisciplineRating();
      const regulationScore =
        requiredRegulations.length > 0
          ? Math.round((acknowledged / requiredRegulations.length) * 100)
          : 100;
      const checklistScore =
        checklist.scoreTotal > 0
          ? Math.round((checklist.scoreEarned / checklist.scoreTotal) * 100)
          : checklist.total > 0
            ? Math.round((checklist.accepted / checklist.total) * 100)
            : 100;
      const attestationScore = assessment ? assessment.score : 100;
      const disciplineScore = Math.max(
        0,
        100 -
          discipline.warnings * 7 -
          discipline.fines * 12 -
          Math.round(discipline.fineAmount / 100),
      );
      const score = Math.round(
        regulationScore * 0.25 +
          checklistScore * 0.35 +
          attestationScore * 0.25 +
          disciplineScore * 0.15,
      );

      return {
        id: row.id,
        user: {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          role: row.role,
          stores,
        },
        score,
        riskLevel: this.ratingRisk(score, assessment, discipline, checklist),
        regulations: {
          required: requiredRegulations.length,
          acknowledged,
          score: regulationScore,
        },
        checklists: {
          total: checklist.total,
          accepted: checklist.accepted,
          returned: checklist.returned,
          failedItems: checklist.failedItems,
          score: checklistScore,
        },
        attestation: {
          status: assessment?.status ?? 'NO_DATA',
          passed: assessment?.passed ?? null,
          score: assessment?.score ?? null,
          submittedAt: assessment?.submittedAt?.toISOString() ?? null,
        },
        discipline: {
          warnings: discipline.warnings,
          fines: discipline.fines,
          fineAmount: discipline.fineAmount,
          byCategory: Array.from(discipline.byCategory.entries()).map(
            ([category, value]) => ({ category, ...value }),
          ),
          score: disciplineScore,
        },
      };
    });

    rows.sort(
      (a, b) => b.score - a.score || a.discipline.fines - b.discipline.fines,
    );

    return {
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
        search: filters.search,
      },
      summary: {
        administrators: rows.length,
        averageScore:
          rows.length > 0
            ? Math.round(
                rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
              )
            : 100,
        warnings: rows.reduce((sum, row) => sum + row.discipline.warnings, 0),
        fines: rows.reduce((sum, row) => sum + row.discipline.fines, 0),
        fineAmount: rows.reduce(
          (sum, row) => sum + row.discipline.fineAmount,
          0,
        ),
        attestationProblems: rows.filter(
          (row) =>
            row.attestation.passed === false ||
            row.attestation.status === 'FAILED',
        ).length,
      },
      rows,
      stores: await this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    };
  }

  private async ensureDefaultRules(tenantId: string) {
    const count = await this.prisma.staffDisciplineRule.count({
      where: { tenantId },
    });

    if (count > 0) {
      return;
    }

    await this.prisma.staffDisciplineRule.createMany({
      data: defaultDisciplineRules.map((rule, index) => ({
        tenantId,
        category: rule[0],
        title: rule[1],
        firstFineAmount: rule[2],
        secondFineAmount: rule[3],
        thirdFineAmount: rule[4],
        sortOrder: index + 1,
      })),
      skipDuplicates: true,
    });
  }

  private buildRecordWhere(
    tenantId: string,
    filters: ResolvedDisciplineFilters,
  ): Prisma.StaffDisciplineRecordWhereInput {
    const where: Prisma.StaffDisciplineRecordWhereInput = {
      tenantId,
      occurredAt: { gte: filters.start, lte: filters.end },
    };

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { categorySnapshot: { contains: filters.search, mode: 'insensitive' } },
        {
          ruleTitleSnapshot: { contains: filters.search, mode: 'insensitive' },
        },
        { comment: { contains: filters.search, mode: 'insensitive' } },
        {
          user: { fullName: { contains: filters.search, mode: 'insensitive' } },
        },
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private buildDisciplineUserWhere(
    tenantId: string,
    access: StaffDisciplineAccess,
  ): Prisma.UserWhereInput {
    if (access.mode === 'SELF' && access.userId) {
      return {
        tenantId,
        id: access.userId,
        isActive: true,
      };
    }

    return {
      tenantId,
      isActive: true,
      role: {
        in: [
          UserRole.CLUB_ADMINISTRATOR,
          UserRole.SENIOR_ADMINISTRATOR,
          UserRole.CLUB_MANAGER,
        ],
      },
    };
  }

  private buildAdministratorWhere(
    tenantId: string,
    filters: ResolvedDisciplineFilters,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      tenantId,
      isActive: true,
      role: { in: [...adminRoles] },
    };

    if (filters.storeId) {
      where.storeAccesses = { some: { storeId: filters.storeId } };
    }

    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async resolveNextRecordLevel(
    tenantId: string,
    userId: string,
    rule: {
      id: string;
      category: string;
      firstFineAmount: Prisma.Decimal;
      secondFineAmount: Prisma.Decimal;
      thirdFineAmount: Prisma.Decimal;
    },
  ): Promise<{ level: StaffDisciplineLevel; amount: number }> {
    const [categoryRecords, ruleFines] = await Promise.all([
      this.prisma.staffDisciplineRecord.findMany({
        where: {
          tenantId,
          userId,
          categorySnapshot: rule.category,
          status: 'ACTIVE',
        },
        select: { level: true },
      }),
      this.prisma.staffDisciplineRecord.count({
        where: {
          tenantId,
          userId,
          ruleId: rule.id,
          status: 'ACTIVE',
          level: { startsWith: 'FINE' },
        },
      }),
    ]);
    const warnings = categoryRecords.filter((record) =>
      record.level.startsWith('WARNING'),
    ).length;

    if (warnings === 0) {
      return { level: 'WARNING_1', amount: 0 };
    }

    if (warnings === 1) {
      return { level: 'WARNING_2', amount: 0 };
    }

    if (ruleFines === 0) {
      return { level: 'FINE_1', amount: this.toNumber(rule.firstFineAmount) };
    }

    if (ruleFines === 1) {
      return { level: 'FINE_2', amount: this.toNumber(rule.secondFineAmount) };
    }

    return { level: 'FINE_3', amount: this.toNumber(rule.thirdFineAmount) };
  }

  private buildDisciplineSummary(
    records: StaffDisciplineRecordRow[],
    rules: Array<{ isActive: boolean }>,
    stores: StoreOption[],
    policies: Array<{ storeId: string | null; enabled: boolean }>,
  ) {
    const warnings = records.filter((record) =>
      record.level.startsWith('WARNING'),
    );
    const fines = records.filter((record) => record.level.startsWith('FINE'));
    const activePolicies = this.toPolicyResponses(stores, policies).filter(
      (policy) => policy.enabled,
    );

    return {
      activeRules: rules.filter((rule) => rule.isActive).length,
      rulesTotal: rules.length,
      recordsTotal: records.length,
      warnings: warnings.length,
      fines: fines.length,
      fineAmount: fines.reduce(
        (sum, record) => sum + this.toNumber(record.amount),
        0,
      ),
      enabledScopes: activePolicies.length,
      disabledScopes: stores.length + 1 - activePolicies.length,
    };
  }

  private toPolicyResponses(
    stores: StoreOption[],
    policies: Array<{ id?: string; storeId: string | null; enabled: boolean }>,
  ) {
    const networkPolicy = policies.find((policy) => policy.storeId === null);
    const networkEnabled = networkPolicy?.enabled ?? true;
    const storePolicies = new Map(
      policies
        .filter((policy) => policy.storeId !== null)
        .map((policy) => [policy.storeId, policy]),
    );

    return [
      {
        id: networkPolicy?.id ?? null,
        scope: 'NETWORK',
        storeId: null,
        storeName: null,
        label: 'Вся сеть',
        enabled: networkEnabled,
        inheritedFromNetwork: false,
      },
      ...stores.map((store) => {
        const policy = storePolicies.get(store.id);

        return {
          id: policy?.id ?? null,
          scope: 'STORE',
          storeId: store.id,
          storeName: store.name,
          label: store.name,
          enabled: policy?.enabled ?? networkEnabled,
          inheritedFromNetwork: !policy,
        };
      }),
    ];
  }

  private toRecordResponse(record: StaffDisciplineRecordRow) {
    return {
      id: record.id,
      occurredAt: record.occurredAt.toISOString(),
      category: record.categorySnapshot,
      ruleTitle: record.ruleTitleSnapshot,
      level: record.level as StaffDisciplineLevel,
      amount: this.toNumber(record.amount),
      status: record.status as StaffDisciplineRecordStatus,
      comment: record.comment,
      rule: record.rule,
      store: record.store,
      user: record.user,
      createdByUser: record.createdByUser,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toDisciplineExportRow(
    record: StaffDisciplineRecordRow,
  ): StaffExportCell[] {
    const response = this.toRecordResponse(record);

    return [
      response.id,
      formatStaffDateTime(response.occurredAt),
      response.user.fullName ?? response.user.email,
      response.user.email,
      this.userRoleLabel(response.user.role),
      response.store?.name ?? null,
      response.category,
      response.ruleTitle,
      this.disciplineLevelLabel(response.level),
      response.amount,
      this.disciplineStatusLabel(response.status),
      staffUserLabel(response.createdByUser),
      response.comment,
      formatStaffDateTime(response.createdAt),
      formatStaffDateTime(response.updatedAt),
    ];
  }

  private disciplineLevelLabel(level: StaffDisciplineLevel) {
    const labels: Record<StaffDisciplineLevel, string> = {
      WARNING_1: 'Предупреждение 1',
      WARNING_2: 'Предупреждение 2',
      FINE_1: 'Штраф 1',
      FINE_2: 'Штраф 2',
      FINE_3: 'Штраф 3',
    };

    return labels[level];
  }

  private disciplineStatusLabel(status: StaffDisciplineRecordStatus) {
    const labels: Record<StaffDisciplineRecordStatus, string> = {
      ACTIVE: 'Активно',
      CANCELED: 'Отменено',
      RESET: 'Сброшено',
    };

    return labels[status];
  }

  private userRoleLabel(role: UserRole) {
    const labels: Partial<Record<UserRole, string>> = {
      OWNER: 'Владелец',
      ADMIN: 'Администратор платформы',
      MANAGER: 'Управляющий',
      CLUB_MANAGER: 'Управляющий клубом',
      STANDARDS_MANAGER: 'Менеджер по стандартам',
      SENIOR_ADMINISTRATOR: 'Старший администратор',
      CLUB_ADMINISTRATOR: 'Администратор клуба',
    };

    return labels[role] ?? role;
  }

  private groupChecklistsByUser(
    rows: Array<{
      assignedToUserId: string | null;
      status: string;
      scoreTotal: number;
      scoreEarned: number;
      failedItems: number;
    }>,
  ) {
    const map = new Map<string, ReturnType<typeof this.emptyChecklistRating>>();

    rows.forEach((row) => {
      if (!row.assignedToUserId) {
        return;
      }

      const current =
        map.get(row.assignedToUserId) ?? this.emptyChecklistRating();
      current.total += 1;
      current.scoreTotal += row.scoreTotal;
      current.scoreEarned += row.scoreEarned;
      current.failedItems += row.failedItems;

      if (row.status === 'ACCEPTED') {
        current.accepted += 1;
      }

      if (row.status === 'RETURNED') {
        current.returned += 1;
      }

      map.set(row.assignedToUserId, current);
    });

    return map;
  }

  private groupDisciplineByUser(
    rows: Array<{
      userId: string;
      level: string;
      amount: Prisma.Decimal;
      categorySnapshot: string;
    }>,
  ) {
    const map = new Map<
      string,
      ReturnType<typeof this.emptyDisciplineRating>
    >();

    rows.forEach((row) => {
      const current = map.get(row.userId) ?? this.emptyDisciplineRating();
      const category = current.byCategory.get(row.categorySnapshot) ?? {
        warnings: 0,
        fines: 0,
        fineAmount: 0,
      };

      if (row.level.startsWith('WARNING')) {
        current.warnings += 1;
        category.warnings += 1;
      }

      if (row.level.startsWith('FINE')) {
        current.fines += 1;
        current.fineAmount += this.toNumber(row.amount);
        category.fines += 1;
        category.fineAmount += this.toNumber(row.amount);
      }

      current.byCategory.set(row.categorySnapshot, category);
      map.set(row.userId, current);
    });

    return map;
  }

  private emptyChecklistRating() {
    return {
      total: 0,
      accepted: 0,
      returned: 0,
      failedItems: 0,
      scoreTotal: 0,
      scoreEarned: 0,
    };
  }

  private emptyDisciplineRating() {
    return {
      warnings: 0,
      fines: 0,
      fineAmount: 0,
      byCategory: new Map<
        string,
        { warnings: number; fines: number; fineAmount: number }
      >(),
    };
  }

  private isRegulationRequiredForUser(
    regulation: { storeId: string | null; roleScope: string },
    role: UserRole,
    stores: StoreOption[],
  ) {
    const storeMatches =
      !regulation.storeId ||
      stores.length === 0 ||
      stores.some((store) => store.id === regulation.storeId);

    if (!storeMatches) {
      return false;
    }

    return (
      regulation.roleScope === 'ALL_STAFF' ||
      regulation.roleScope === 'ADMINISTRATOR' ||
      regulation.roleScope === role
    );
  }

  private ratingRisk(
    score: number,
    assessment: { passed: boolean; status: string } | null,
    discipline: { fines: number; warnings: number },
    checklist: { failedItems: number; returned: number },
  ): RiskLevel {
    if (
      score < 65 ||
      assessment?.passed === false ||
      discipline.fines >= 3 ||
      checklist.failedItems >= 5
    ) {
      return 'HIGH';
    }

    if (
      score < 85 ||
      discipline.fines > 0 ||
      discipline.warnings > 0 ||
      checklist.returned > 0
    ) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private resolveDisciplineAccess(
    user: AuthenticatedUser,
  ): StaffDisciplineAccess {
    const isSelfMode = selfDisciplineRoles.includes(
      user.role as (typeof selfDisciplineRoles)[number],
    );

    return {
      mode: isSelfMode ? 'SELF' : 'MANAGE',
      userId: isSelfMode ? user.id : null,
      canManage: !isSelfMode,
      canExport: !isSelfMode,
    };
  }

  private assertCanManageRecords(user: AuthenticatedUser) {
    if (this.resolveDisciplineAccess(user).canManage) {
      return;
    }

    throw new ForbiddenException(
      'Only managers can create or update discipline records',
    );
  }

  private async isDisciplineEnabled(tenantId: string, storeId: string | null) {
    const policies = await this.prisma.staffDisciplinePolicy.findMany({
      where: { tenantId, OR: [{ storeId }, { storeId: null }] },
      select: { storeId: true, enabled: true },
    });
    const network = policies.find((policy) => policy.storeId === null);
    const store = storeId
      ? policies.find((policy) => policy.storeId === storeId)
      : null;

    return store?.enabled ?? network?.enabled ?? true;
  }

  private async assertCanManagePolicy(
    user: AuthenticatedUser,
    tenantId: string,
    storeId: string | null,
  ) {
    if (
      policyManagerRoles.includes(
        user.role as (typeof policyManagerRoles)[number],
      )
    ) {
      return;
    }

    if (user.role !== UserRole.CLUB_MANAGER || !storeId) {
      throw new ForbiddenException(
        'Only network owner or club manager can update discipline policy',
      );
    }

    const access = await this.prisma.userStoreAccess.findFirst({
      where: { userId: user.id, storeId, user: { tenantId } },
      select: { id: true },
    });

    if (!access) {
      throw new ForbiddenException(
        'Club manager can update only own club policy',
      );
    }
  }

  private resolveFilters(
    query: StaffDisciplineQuery,
    forcedUserId?: string | null,
  ): ResolvedDisciplineFilters {
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
      userId: forcedUserId ?? this.normalizeOptionalString(query.userId),
      status: query.status ? this.resolveStatusFilter(query.status) : 'ACTIVE',
      search: this.normalizeOptionalString(query.search),
    };
  }

  private resolveStatusFilter(value: unknown) {
    if (
      value === 'all' ||
      recordStatuses.includes(value as StaffDisciplineRecordStatus)
    ) {
      return value as StaffDisciplineRecordStatus | 'all';
    }

    return 'ACTIVE';
  }

  private resolveRecordStatus(value: unknown): StaffDisciplineRecordStatus {
    if (recordStatuses.includes(value as StaffDisciplineRecordStatus)) {
      return value as StaffDisciplineRecordStatus;
    }

    throw new BadRequestException('Invalid discipline record status');
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

  private resolveOptionalDateTime(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid occurredAt date');
    }

    return date;
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

  private toNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
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
