import {
  BadRequestException,
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
  staffYesNo,
  type StaffExportCell,
  type StaffExportFile,
} from './staff-export';

const progressStatuses = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'WAIVED',
] as const;
const roleScopes = [
  'ALL_STAFF',
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_MANAGER',
  'MANAGER',
  'STANDARDS_MANAGER',
] as const;
const staffRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
  UserRole.TRAINEE,
] as const;

export type StaffTrainingProgressStatus = (typeof progressStatuses)[number];
export type StaffTrainingProfileRoleScope = (typeof roleScopes)[number];

export type StaffTrainingProfilesQuery = {
  userId?: string;
  role?: UserRole | 'all';
  storeId?: string;
  status?:
    | 'all'
    | 'overdue'
    | 'in_progress'
    | 'completed'
    | 'missing_attestation';
  search?: string;
};

export type StaffTrainingProfilesExportQuery = StaffTrainingProfilesQuery & {
  format?: string;
};

export type StaffTrainingProgressDto = {
  userId?: string;
  courseId?: string;
  status?: StaffTrainingProgressStatus;
  progressPercent?: number | string;
  dueAt?: string | null;
  certificateExpiresAt?: string | null;
  comment?: string | null;
};

export type StaffTrainingProfileReport = {
  filters: {
    userId: string | null;
    role: UserRole | 'all';
    storeId: string | null;
    status:
      | 'all'
      | 'overdue'
      | 'in_progress'
      | 'completed'
      | 'missing_attestation';
    search: string | null;
  };
  summary: {
    employees: number;
    assignedCourses: number;
    completedCourses: number;
    overdueCourses: number;
    averageProgressPercent: number;
    pendingAssessments: number;
    failedAssessments: number;
    validCertificates: number;
    expiredCertificates: number;
  };
  canManageTraining: boolean;
  rows: StaffTrainingProfileRow[];
  users: StaffTrainingProfileUser[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffTrainingProfileUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffTrainingProfileRow = {
  user: StaffTrainingProfileUser;
  assignedCoursesCount: number;
  requiredCoursesCount: number;
  completedCoursesCount: number;
  overdueCoursesCount: number;
  progressPercent: number;
  pendingAssessmentsCount: number;
  failedAssessmentsCount: number;
  validCertificatesCount: number;
  expiredCertificatesCount: number;
  courses: StaffTrainingProfileCourse[];
  assessments: StaffTrainingProfileAssessment[];
};

export type StaffTrainingProfileCourse = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffTrainingProfileRoleScope;
  required: boolean;
  dueDays: number | null;
  stepsCount: number;
  store: { id: string; name: string; isActive: boolean } | null;
  progress: {
    status: StaffTrainingProgressStatus;
    progressPercent: number;
    dueAt: string | null;
    overdue: boolean;
    startedAt: string | null;
    completedAt: string | null;
    certificateIssuedAt: string | null;
    certificateExpiresAt: string | null;
    comment: string | null;
    updatedAt: string | null;
    updatedByUser: {
      id: string;
      email: string;
      fullName: string | null;
    } | null;
  };
};

export type StaffTrainingProfileAssessment = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffTrainingProfileRoleScope;
  assessmentKind: 'TEST' | 'ATTESTATION';
  passThreshold: number;
  store: { id: string; name: string; isActive: boolean } | null;
  status: 'PASSED' | 'FAILED' | 'PENDING' | 'EXPIRED';
  latestResult: {
    id: string;
    attemptNumber: number;
    score: number;
    passed: boolean;
    submittedAt: string | null;
    expiresAt: string | null;
  } | null;
};

const courseInclude = {
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffTrainingCourseInclude;

const assessmentInclude = {
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffAssessmentInclude;

const progressInclude = {
  updatedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffTrainingProgressInclude;

const userInclude = {
  storeAccesses: {
    include: {
      store: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: { store: { name: 'asc' } },
  },
} satisfies Prisma.UserInclude;

type StaffTrainingCourseRow = Prisma.StaffTrainingCourseGetPayload<{
  include: typeof courseInclude;
}>;
type StaffAssessmentRow = Prisma.StaffAssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;
type StaffTrainingProgressRow = Prisma.StaffTrainingProgressGetPayload<{
  include: typeof progressInclude;
}>;
type StaffTrainingUserRow = Prisma.UserGetPayload<{
  include: typeof userInclude;
}>;
type StaffAssessmentResultRow = Prisma.StaffAssessmentResultGetPayload<{
  select: {
    id: true;
    assessmentId: true;
    userId: true;
    attemptNumber: true;
    score: true;
    passed: true;
    submittedAt: true;
    expiresAt: true;
    createdAt: true;
  };
}>;

@Injectable()
export class StaffTrainingProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getProfiles(
    user: AuthenticatedUser,
    query: StaffTrainingProfilesQuery = {},
  ): Promise<StaffTrainingProfileReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageTraining = this.canManageTraining(user);
    const filters = this.resolveFilters(query, canManageTraining);
    const usersWhere = this.buildUsersWhere(
      tenantId,
      user,
      filters,
      canManageTraining,
    );

    const [users, courses, assessments, stores] = await Promise.all([
      this.prisma.user.findMany({
        where: usersWhere,
        include: userInclude,
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }, { email: 'asc' }],
        take: 300,
      }),
      this.prisma.staffTrainingCourse.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          roleScope: {
            in: this.visibleRoleScopes(user.role, canManageTraining),
          },
        },
        include: courseInclude,
        orderBy: [{ required: 'desc' }, { roleScope: 'asc' }, { title: 'asc' }],
        take: 400,
      }),
      this.prisma.staffAssessment.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          roleScope: {
            in: this.visibleRoleScopes(user.role, canManageTraining),
          },
        },
        include: assessmentInclude,
        orderBy: [
          { assessmentKind: 'asc' },
          { roleScope: 'asc' },
          { title: 'asc' },
        ],
        take: 400,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    ]);
    const userIds = users.map((row) => row.id);
    const courseIds = courses.map((row) => row.id);
    const assessmentIds = assessments.map((row) => row.id);
    const [progressRows, resultRows] = await Promise.all([
      userIds.length > 0 && courseIds.length > 0
        ? this.prisma.staffTrainingProgress.findMany({
            where: {
              tenantId,
              userId: { in: userIds },
              courseId: { in: courseIds },
            },
            include: progressInclude,
          })
        : Promise.resolve([]),
      userIds.length > 0 && assessmentIds.length > 0
        ? this.prisma.staffAssessmentResult.findMany({
            where: {
              tenantId,
              userId: { in: userIds },
              assessmentId: { in: assessmentIds },
            },
            select: {
              id: true,
              assessmentId: true,
              userId: true,
              attemptNumber: true,
              score: true,
              passed: true,
              submittedAt: true,
              expiresAt: true,
              createdAt: true,
            },
            orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1000,
          })
        : Promise.resolve([]),
    ]);
    const progressByUserCourse = this.mapProgress(progressRows);
    const resultsByUserAssessment = this.mapResults(resultRows);
    const rows = users
      .map((row) =>
        this.toProfileRow(
          row,
          courses,
          assessments,
          progressByUserCourse,
          resultsByUserAssessment,
        ),
      )
      .filter((row) => this.matchesStatus(row, filters.status));

    return {
      filters,
      summary: this.buildSummary(rows),
      canManageTraining,
      rows,
      users: users.map((row) => this.toUser(row)),
      stores,
    };
  }

  async exportProfiles(
    user: AuthenticatedUser,
    query: StaffTrainingProfilesExportQuery = {},
  ): Promise<StaffExportFile> {
    const report = await this.getProfiles(user, query);
    const format = resolveStaffExportFormat(query.format);

    return buildStaffExportFile({
      format,
      fileNameBase: 'leetplus-staff-training-results',
      sheetName: 'Training',
      rows: [
        [
          'Тип строки',
          'Сотрудник',
          'Email',
          'Роль',
          'Клубы',
          'Материал',
          'Тип',
          'Статус',
          'Прогресс, %',
          'Дедлайн',
          'Просрочено',
          'Завершено / сдано',
          'Сертификат до',
          'Балл',
          'Комментарий',
        ],
        ...this.buildTrainingExportRows(report.rows),
      ],
      widths: [18, 28, 28, 24, 34, 34, 18, 20, 14, 20, 14, 20, 20, 12, 42],
    });
  }

  async updateProgress(user: AuthenticatedUser, dto: StaffTrainingProgressDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageTraining = this.canManageTraining(user);
    const userId = this.normalizeOptionalString(dto.userId) ?? user.id;
    const courseId = this.normalizeRequiredString(
      dto.courseId,
      'Course is required',
    );

    if (!canManageTraining && userId !== user.id) {
      throw new BadRequestException('Training progress editing is not allowed');
    }

    const [targetUser, course, current] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, tenantId },
        include: userInclude,
      }),
      this.prisma.staffTrainingCourse.findFirst({
        where: { id: courseId, tenantId, status: 'ACTIVE' },
        include: courseInclude,
      }),
      this.prisma.staffTrainingProgress.findFirst({
        where: { tenantId, userId, courseId },
        include: progressInclude,
      }),
    ]);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (!course) {
      throw new NotFoundException('Active training course not found');
    }

    if (!this.courseMatchesUser(course, targetUser)) {
      throw new BadRequestException('Course is not assigned to this user');
    }

    const status = this.resolveOne(
      dto.status,
      progressStatuses,
      current?.status
        ? (current.status as StaffTrainingProgressStatus)
        : 'IN_PROGRESS',
    );
    const now = new Date();
    const progressPercent = this.normalizeProgressPercent(
      dto.progressPercent,
      status,
      current?.progressPercent,
    );
    const data: Prisma.StaffTrainingProgressUncheckedCreateInput = {
      tenantId,
      courseId,
      userId,
      updatedByUserId: user.id,
      status,
      progressPercent,
      dueAt:
        dto.dueAt !== undefined
          ? this.normalizeOptionalDate(dto.dueAt, 'Due date is invalid')
          : (current?.dueAt ?? null),
      startedAt:
        status === 'NOT_STARTED'
          ? null
          : (current?.startedAt ?? (status === 'IN_PROGRESS' ? now : null)),
      completedAt:
        status === 'COMPLETED' || status === 'WAIVED'
          ? (current?.completedAt ?? now)
          : status === 'NOT_STARTED'
            ? null
            : (current?.completedAt ?? null),
      certificateIssuedAt:
        status === 'COMPLETED'
          ? (current?.certificateIssuedAt ?? now)
          : status === 'NOT_STARTED'
            ? null
            : (current?.certificateIssuedAt ?? null),
      certificateExpiresAt:
        dto.certificateExpiresAt !== undefined
          ? this.normalizeOptionalDate(
              dto.certificateExpiresAt,
              'Certificate expiration date is invalid',
            )
          : (current?.certificateExpiresAt ?? null),
      comment:
        dto.comment !== undefined
          ? (this.normalizeOptionalString(dto.comment)?.slice(0, 1000) ?? null)
          : (current?.comment ?? null),
    };
    const saved = await this.prisma.staffTrainingProgress.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: data,
      update: data,
      include: progressInclude,
    });

    return this.toCourseProgressResponse(course, targetUser, saved);
  }

  private resolveFilters(
    query: StaffTrainingProfilesQuery,
    canManageTraining: boolean,
  ): StaffTrainingProfileReport['filters'] {
    return {
      userId: canManageTraining
        ? this.normalizeOptionalString(query.userId)
        : null,
      role: this.resolveRoleFilter(query.role),
      storeId: this.normalizeOptionalString(query.storeId),
      status: this.resolveOne(
        query.status,
        [
          'all',
          'overdue',
          'in_progress',
          'completed',
          'missing_attestation',
        ] as const,
        'all',
      ),
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildUsersWhere(
    tenantId: string,
    user: AuthenticatedUser,
    filters: StaffTrainingProfileReport['filters'],
    canManageTraining: boolean,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      tenantId,
      role: { in: [...staffRoles] },
    };

    if (!canManageTraining) {
      where.id = user.id;
      return where;
    }

    if (filters.userId) {
      where.id = filters.userId;
    }

    if (filters.role !== 'all') {
      where.role = filters.role;
    }

    if (filters.storeId) {
      where.OR = [
        { storeAccesses: { some: { storeId: filters.storeId } } },
        { storeAccesses: { none: {} } },
      ];
    }

    if (filters.search) {
      const search = filters.search;
      where.AND = [
        {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private toProfileRow(
    user: StaffTrainingUserRow,
    courses: StaffTrainingCourseRow[],
    assessments: StaffAssessmentRow[],
    progressByUserCourse: Map<string, StaffTrainingProgressRow>,
    resultsByUserAssessment: Map<string, StaffAssessmentResultRow>,
  ): StaffTrainingProfileRow {
    const profileUser = this.toUser(user);
    const assignedCourses = courses
      .filter((course) => this.courseMatchesUser(course, user))
      .map((course) =>
        this.toCourseProgressResponse(
          course,
          user,
          progressByUserCourse.get(this.joinKey(user.id, course.id)) ?? null,
        ),
      );
    const assignedAssessments = assessments
      .filter((assessment) => this.assessmentMatchesUser(assessment, user))
      .map((assessment) =>
        this.toAssessmentProfile(
          assessment,
          resultsByUserAssessment.get(this.joinKey(user.id, assessment.id)) ??
            null,
        ),
      );
    const completedCourses = assignedCourses.filter((course) =>
      ['COMPLETED', 'WAIVED'].includes(course.progress.status),
    );
    const overdueCourses = assignedCourses.filter(
      (course) => course.progress.overdue,
    );
    const pendingAssessments = assignedAssessments.filter(
      (assessment) =>
        assessment.status === 'PENDING' || assessment.status === 'EXPIRED',
    );
    const failedAssessments = assignedAssessments.filter(
      (assessment) => assessment.status === 'FAILED',
    );
    const validCertificates = assignedCourses.filter(
      (course) =>
        course.progress.certificateIssuedAt !== null &&
        !this.isExpired(course.progress.certificateExpiresAt),
    ).length;
    const validAssessmentCertificates = assignedAssessments.filter(
      (assessment) => assessment.status === 'PASSED',
    ).length;
    const expiredCertificates =
      assignedCourses.filter((course) =>
        this.isExpired(course.progress.certificateExpiresAt),
      ).length +
      assignedAssessments.filter(
        (assessment) => assessment.status === 'EXPIRED',
      ).length;

    return {
      user: profileUser,
      assignedCoursesCount: assignedCourses.length,
      requiredCoursesCount: assignedCourses.filter((course) => course.required)
        .length,
      completedCoursesCount: completedCourses.length,
      overdueCoursesCount: overdueCourses.length,
      progressPercent:
        assignedCourses.length > 0
          ? Math.round(
              assignedCourses.reduce(
                (sum, course) => sum + course.progress.progressPercent,
                0,
              ) / assignedCourses.length,
            )
          : 0,
      pendingAssessmentsCount: pendingAssessments.length,
      failedAssessmentsCount: failedAssessments.length,
      validCertificatesCount: validCertificates + validAssessmentCertificates,
      expiredCertificatesCount: expiredCertificates,
      courses: assignedCourses,
      assessments: assignedAssessments,
    };
  }

  private toCourseProgressResponse(
    course: StaffTrainingCourseRow,
    user: StaffTrainingUserRow,
    progress: StaffTrainingProgressRow | null,
  ): StaffTrainingProfileCourse {
    const status = this.resolveOne(
      progress?.status,
      progressStatuses,
      'NOT_STARTED',
    );
    const dueAt = progress?.dueAt ?? this.deriveDueDate(user.createdAt, course);
    const progressPercent =
      status === 'COMPLETED' || status === 'WAIVED'
        ? 100
        : status === 'NOT_STARTED'
          ? 0
          : this.boundPercent(progress?.progressPercent ?? 0);

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      roleScope: course.roleScope as StaffTrainingProfileRoleScope,
      required: course.required,
      dueDays: course.dueDays,
      stepsCount: course.stepsCount,
      store: course.store,
      progress: {
        status,
        progressPercent,
        dueAt: dueAt?.toISOString() ?? null,
        overdue:
          dueAt !== null &&
          dueAt.getTime() < Date.now() &&
          status !== 'COMPLETED' &&
          status !== 'WAIVED',
        startedAt: progress?.startedAt?.toISOString() ?? null,
        completedAt: progress?.completedAt?.toISOString() ?? null,
        certificateIssuedAt:
          progress?.certificateIssuedAt?.toISOString() ?? null,
        certificateExpiresAt:
          progress?.certificateExpiresAt?.toISOString() ?? null,
        comment: progress?.comment ?? null,
        updatedAt: progress?.updatedAt?.toISOString() ?? null,
        updatedByUser: progress?.updatedByUser ?? null,
      },
    };
  }

  private toAssessmentProfile(
    assessment: StaffAssessmentRow,
    result: StaffAssessmentResultRow | null,
  ): StaffTrainingProfileAssessment {
    const expired =
      result?.passed === true &&
      result.expiresAt !== null &&
      result.expiresAt.getTime() < Date.now();
    const status = result
      ? expired
        ? 'EXPIRED'
        : result.passed
          ? 'PASSED'
          : 'FAILED'
      : 'PENDING';

    return {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      roleScope: assessment.roleScope as StaffTrainingProfileRoleScope,
      assessmentKind: assessment.assessmentKind as 'TEST' | 'ATTESTATION',
      passThreshold: assessment.passThreshold,
      store: assessment.store,
      status,
      latestResult: result
        ? {
            id: result.id,
            attemptNumber: result.attemptNumber,
            score: result.score,
            passed: result.passed,
            submittedAt: result.submittedAt?.toISOString() ?? null,
            expiresAt: result.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private buildTrainingExportRows(
    rows: StaffTrainingProfileRow[],
  ): StaffExportCell[][] {
    return rows.flatMap((profile) => {
      const base = this.trainingExportBase(profile);
      const exportRows: StaffExportCell[][] = [];

      if (profile.courses.length === 0 && profile.assessments.length === 0) {
        exportRows.push([
          'Профиль',
          ...base,
          null,
          null,
          null,
          profile.progressPercent,
          null,
          null,
          null,
          null,
          null,
        ]);
      }

      profile.courses.forEach((course) => {
        exportRows.push([
          'Курс',
          ...base,
          course.title,
          course.required ? 'Обязательный курс' : 'Курс',
          this.trainingProgressLabel(course.progress.status),
          course.progress.progressPercent,
          formatStaffDateTime(course.progress.dueAt),
          staffYesNo(course.progress.overdue),
          formatStaffDateTime(course.progress.completedAt),
          formatStaffDateTime(course.progress.certificateExpiresAt),
          null,
          course.progress.comment,
        ]);
      });

      profile.assessments.forEach((assessment) => {
        exportRows.push([
          assessment.assessmentKind === 'ATTESTATION' ? 'Аттестация' : 'Тест',
          ...base,
          assessment.title,
          this.assessmentKindLabel(assessment.assessmentKind),
          this.assessmentStatusLabel(assessment.status),
          null,
          null,
          staffYesNo(assessment.status === 'EXPIRED'),
          formatStaffDateTime(assessment.latestResult?.submittedAt ?? null),
          formatStaffDateTime(assessment.latestResult?.expiresAt ?? null),
          assessment.latestResult?.score ?? null,
          null,
        ]);
      });

      return exportRows;
    });
  }

  private trainingExportBase(profile: StaffTrainingProfileRow) {
    return [
      profile.user.fullName ?? profile.user.email,
      profile.user.email,
      this.userRoleLabel(profile.user.role),
      profile.user.stores.map((store) => store.name).join(', ') || 'Вся сеть',
    ];
  }

  private trainingProgressLabel(status: StaffTrainingProgressStatus) {
    const labels: Record<StaffTrainingProgressStatus, string> = {
      NOT_STARTED: 'Не начато',
      IN_PROGRESS: 'В обучении',
      COMPLETED: 'Завершено',
      WAIVED: 'Зачтено вручную',
    };

    return labels[status];
  }

  private assessmentKindLabel(
    kind: StaffTrainingProfileAssessment['assessmentKind'],
  ) {
    return kind === 'ATTESTATION' ? 'Аттестация' : 'Тест';
  }

  private assessmentStatusLabel(
    status: StaffTrainingProfileAssessment['status'],
  ) {
    const labels: Record<StaffTrainingProfileAssessment['status'], string> = {
      PASSED: 'Сдано',
      FAILED: 'Не сдано',
      PENDING: 'Ожидает',
      EXPIRED: 'Истекло',
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
      TRAINEE: 'Стажер',
    };

    return labels[role] ?? role;
  }

  private buildSummary(rows: StaffTrainingProfileRow[]) {
    const assignedCourses = rows.reduce(
      (sum, row) => sum + row.assignedCoursesCount,
      0,
    );

    return {
      employees: rows.length,
      assignedCourses,
      completedCourses: rows.reduce(
        (sum, row) => sum + row.completedCoursesCount,
        0,
      ),
      overdueCourses: rows.reduce(
        (sum, row) => sum + row.overdueCoursesCount,
        0,
      ),
      averageProgressPercent:
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, row) => sum + row.progressPercent, 0) /
                rows.length,
            )
          : 0,
      pendingAssessments: rows.reduce(
        (sum, row) => sum + row.pendingAssessmentsCount,
        0,
      ),
      failedAssessments: rows.reduce(
        (sum, row) => sum + row.failedAssessmentsCount,
        0,
      ),
      validCertificates: rows.reduce(
        (sum, row) => sum + row.validCertificatesCount,
        0,
      ),
      expiredCertificates: rows.reduce(
        (sum, row) => sum + row.expiredCertificatesCount,
        0,
      ),
    };
  }

  private matchesStatus(
    row: StaffTrainingProfileRow,
    status: StaffTrainingProfileReport['filters']['status'],
  ) {
    if (status === 'all') {
      return true;
    }

    if (status === 'overdue') {
      return row.overdueCoursesCount > 0;
    }

    if (status === 'in_progress') {
      return row.courses.some(
        (course) => course.progress.status === 'IN_PROGRESS',
      );
    }

    if (status === 'completed') {
      return (
        row.assignedCoursesCount > 0 &&
        row.completedCoursesCount === row.assignedCoursesCount &&
        row.pendingAssessmentsCount === 0 &&
        row.failedAssessmentsCount === 0
      );
    }

    return row.pendingAssessmentsCount > 0 || row.failedAssessmentsCount > 0;
  }

  private mapProgress(rows: StaffTrainingProgressRow[]) {
    return new Map(
      rows.map((row) => [this.joinKey(row.userId, row.courseId), row]),
    );
  }

  private mapResults(rows: StaffAssessmentResultRow[]) {
    const resultMap = new Map<string, StaffAssessmentResultRow>();

    rows.forEach((row) => {
      const key = this.joinKey(row.userId, row.assessmentId);

      if (!resultMap.has(key)) {
        resultMap.set(key, row);
      }
    });

    return resultMap;
  }

  private courseMatchesUser(
    course: StaffTrainingCourseRow,
    user: StaffTrainingUserRow,
  ) {
    return (
      this.roleMatchesScope(
        user.role,
        course.roleScope as StaffTrainingProfileRoleScope,
      ) && this.storeMatchesUser(course.store?.id ?? null, user)
    );
  }

  private assessmentMatchesUser(
    assessment: StaffAssessmentRow,
    user: StaffTrainingUserRow,
  ) {
    return (
      this.roleMatchesScope(
        user.role,
        assessment.roleScope as StaffTrainingProfileRoleScope,
      ) && this.storeMatchesUser(assessment.store?.id ?? null, user)
    );
  }

  private roleMatchesScope(
    role: UserRole,
    scope: StaffTrainingProfileRoleScope,
  ) {
    if (scope === 'ALL_STAFF') {
      return staffRoles.includes(role as (typeof staffRoles)[number]);
    }

    if (scope === 'ADMINISTRATOR') {
      return (
        role === UserRole.CLUB_ADMINISTRATOR ||
        role === UserRole.SENIOR_ADMINISTRATOR ||
        role === UserRole.TRAINEE
      );
    }

    if (scope === 'SENIOR_ADMINISTRATOR') {
      return role === UserRole.SENIOR_ADMINISTRATOR;
    }

    if (scope === 'CLUB_MANAGER') {
      return role === UserRole.CLUB_MANAGER;
    }

    if (scope === 'MANAGER') {
      return (
        role === UserRole.OWNER ||
        role === UserRole.ADMIN ||
        role === UserRole.MANAGER
      );
    }

    return role === UserRole.STANDARDS_MANAGER;
  }

  private storeMatchesUser(storeId: string | null, user: StaffTrainingUserRow) {
    if (!storeId) {
      return true;
    }

    if (user.storeAccesses.length === 0) {
      return true;
    }

    return user.storeAccesses.some((access) => access.storeId === storeId);
  }

  private visibleRoleScopes(role: UserRole, canManageTraining: boolean) {
    if (canManageTraining) {
      return [...roleScopes];
    }

    const scopes: StaffTrainingProfileRoleScope[] = ['ALL_STAFF'];

    if (role === UserRole.CLUB_ADMINISTRATOR || role === UserRole.TRAINEE) {
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

  private normalizeProgressPercent(
    value: number | string | undefined,
    status: StaffTrainingProgressStatus,
    fallback?: number,
  ) {
    if (status === 'COMPLETED' || status === 'WAIVED') {
      return 100;
    }

    if (status === 'NOT_STARTED') {
      return 0;
    }

    if (value === undefined || value === '') {
      return this.boundPercent(fallback ?? 10);
    }

    const parsed = Number.parseInt(String(value), 10);

    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Progress percent is invalid');
    }

    return Math.min(Math.max(parsed, 1), 99);
  }

  private boundPercent(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(Math.max(Math.round(value), 0), 100);
  }

  private deriveDueDate(userCreatedAt: Date, course: StaffTrainingCourseRow) {
    if (!course.required || course.dueDays === null) {
      return null;
    }

    return this.addDays(userCreatedAt, course.dueDays);
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private isExpired(value: string | null) {
    return value !== null && new Date(value).getTime() < Date.now();
  }

  private toUser(user: StaffTrainingUserRow): StaffTrainingProfileUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      stores: user.storeAccesses.map((access) => access.store),
    };
  }

  private resolveRoleFilter(value: UserRole | 'all' | undefined) {
    if (!value || value === 'all') {
      return 'all';
    }

    if (staffRoles.includes(value as (typeof staffRoles)[number])) {
      return value;
    }

    throw new BadRequestException(`Unsupported value: ${value}`);
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

  private normalizeOptionalDate(value: unknown, message: string) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(message);
    }

    return parsed;
  }

  private joinKey(first: string, second: string) {
    return `${first}:${second}`;
  }

  private canManageTraining(user: AuthenticatedUser) {
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
}
