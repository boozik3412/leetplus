import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  StaffTrainingProfilesService,
  type StaffTrainingProfileAssessment,
  type StaffTrainingProfileCourse,
  type StaffTrainingProfileReport,
  type StaffTrainingProfileRoleScope,
  type StaffTrainingProfileRow,
  type StaffTrainingProfileUser,
} from './staff-training-profiles.service';

const readinessStatusFilters = [
  'all',
  'ready',
  'attention',
  'blocked',
  'failed_tests',
  'expired_attestations',
  'pending_regulations',
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

export type StaffReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED';
export type StaffReadinessStatusFilter =
  (typeof readinessStatusFilters)[number];

export type StaffReadinessReportQuery = {
  userId?: string;
  role?: UserRole | 'all';
  storeId?: string;
  status?: StaffReadinessStatusFilter;
  search?: string;
};

export type StaffReadinessReport = {
  filters: Omit<StaffTrainingProfileReport['filters'], 'status'> & {
    status: StaffReadinessStatusFilter;
  };
  summary: {
    employees: number;
    ready: number;
    attention: number;
    blocked: number;
    averageReadinessPercent: number;
    requiredCourseGaps: number;
    overdueCourses: number;
    failedTests: number;
    failedAttestations: number;
    expiredAttestations: number;
    pendingAssessments: number;
    pendingRegulations: number;
  };
  canManageReadiness: boolean;
  rows: StaffReadinessRow[];
  users: StaffTrainingProfileUser[];
  stores: StaffTrainingProfileReport['stores'];
};

export type StaffReadinessRow = {
  user: StaffTrainingProfileUser;
  readinessStatus: StaffReadinessStatus;
  readinessPercent: number;
  requiredCoursesCount: number;
  completedRequiredCoursesCount: number;
  requiredCourseGapsCount: number;
  overdueCoursesCount: number;
  assessmentsCount: number;
  passedAssessmentsCount: number;
  pendingAssessmentsCount: number;
  failedTestsCount: number;
  failedAttestationsCount: number;
  expiredAttestationsCount: number;
  assignedRegulationsCount: number;
  acknowledgedRegulationsCount: number;
  pendingRegulationsCount: number;
  blockers: StaffReadinessIssue[];
  warnings: StaffReadinessIssue[];
  nextActions: string[];
  courses: StaffTrainingProfileCourse[];
  assessments: StaffTrainingProfileAssessment[];
  regulations: StaffReadinessRegulation[];
};

export type StaffReadinessIssue = {
  source: 'COURSE' | 'ASSESSMENT' | 'REGULATION';
  title: string;
  detail: string;
  href: string | null;
};

export type StaffReadinessRegulation = {
  id: string;
  title: string;
  roleScope: StaffTrainingProfileRoleScope;
  shiftKind: string;
  version: number;
  store: { id: string; name: string; isActive: boolean } | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
};

const regulationInclude = {
  store: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.StaffShiftRegulationInclude;

type StaffShiftRegulationRow = Prisma.StaffShiftRegulationGetPayload<{
  include: typeof regulationInclude;
}>;
type StaffShiftRegulationAcknowledgementRow =
  Prisma.StaffShiftRegulationAcknowledgementGetPayload<{
    select: {
      regulationId: true;
      userId: true;
      version: true;
      acknowledgedAt: true;
    };
  }>;

@Injectable()
export class StaffReadinessReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffTrainingProfilesService: StaffTrainingProfilesService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: StaffReadinessReportQuery = {},
  ): Promise<StaffReadinessReport> {
    const readinessStatus = this.resolveStatusFilter(query.status);
    const profileReport = await this.staffTrainingProfilesService.getProfiles(
      user,
      {
        userId: query.userId,
        role: query.role,
        storeId: query.storeId,
        search: query.search,
        status: 'all',
      },
    );
    const userIds = profileReport.rows.map((row) => row.user.id);
    const regulations = await this.getPublishedRegulations(
      user.tenantId,
      user.role,
      profileReport.canManageTraining,
    );
    const acknowledgementRows =
      userIds.length > 0 && regulations.length > 0
        ? await this.prisma.staffShiftRegulationAcknowledgement.findMany({
            where: {
              tenantId: user.tenantId,
              userId: { in: userIds },
              regulationId: { in: regulations.map((row) => row.id) },
            },
            select: {
              regulationId: true,
              userId: true,
              version: true,
              acknowledgedAt: true,
            },
          })
        : [];
    const acknowledgementMap = this.mapAcknowledgements(acknowledgementRows);
    const rows = profileReport.rows
      .map((row) => this.toReadinessRow(row, regulations, acknowledgementMap))
      .filter((row) => this.matchesStatus(row, readinessStatus));

    return {
      filters: {
        ...profileReport.filters,
        status: readinessStatus,
      },
      summary: this.buildSummary(rows),
      canManageReadiness: profileReport.canManageTraining,
      rows,
      users: profileReport.users,
      stores: profileReport.stores,
    };
  }

  private async getPublishedRegulations(
    tenantId: string,
    role: UserRole,
    canManageReadiness: boolean,
  ) {
    return this.prisma.staffShiftRegulation.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
        roleScope: {
          in: this.visibleRoleScopes(role, canManageReadiness),
        },
      },
      include: regulationInclude,
      orderBy: [
        { roleScope: 'asc' },
        { shiftKind: 'asc' },
        { publishedAt: 'desc' },
        { title: 'asc' },
      ],
      take: 400,
    });
  }

  private toReadinessRow(
    profile: StaffTrainingProfileRow,
    regulations: StaffShiftRegulationRow[],
    acknowledgementMap: Map<string, StaffShiftRegulationAcknowledgementRow>,
  ): StaffReadinessRow {
    const requiredCourses = profile.courses.filter((course) => course.required);
    const completedRequiredCourses = requiredCourses.filter((course) =>
      this.isCourseCompleted(course),
    );
    const requiredCourseGaps = requiredCourses.filter(
      (course) => !this.isCourseCompleted(course),
    );
    const overdueCourses = requiredCourseGaps.filter(
      (course) => course.progress.overdue,
    );
    const assignedRegulations = regulations
      .filter((regulation) =>
        this.regulationMatchesUser(regulation, profile.user),
      )
      .map((regulation) =>
        this.toRegulationReadiness(
          regulation,
          acknowledgementMap.get(
            this.regulationKey(
              profile.user.id,
              regulation.id,
              regulation.version,
            ),
          ) ?? null,
        ),
      );
    const pendingRegulations = assignedRegulations.filter(
      (regulation) => !regulation.acknowledged,
    );
    const passedAssessments = profile.assessments.filter(
      (assessment) => assessment.status === 'PASSED',
    );
    const pendingAssessments = profile.assessments.filter(
      (assessment) => assessment.status === 'PENDING',
    );
    const failedTests = profile.assessments.filter(
      (assessment) =>
        assessment.assessmentKind === 'TEST' && assessment.status === 'FAILED',
    );
    const failedAttestations = profile.assessments.filter(
      (assessment) =>
        assessment.assessmentKind === 'ATTESTATION' &&
        assessment.status === 'FAILED',
    );
    const expiredAttestations = profile.assessments.filter(
      (assessment) =>
        assessment.assessmentKind === 'ATTESTATION' &&
        assessment.status === 'EXPIRED',
    );
    const expiredTests = profile.assessments.filter(
      (assessment) =>
        assessment.assessmentKind === 'TEST' && assessment.status === 'EXPIRED',
    );
    const blockers = [
      ...overdueCourses.map((course) =>
        this.courseIssue(course, 'Просрочен обязательный курс'),
      ),
      ...failedTests.map((assessment) =>
        this.assessmentIssue(assessment, 'Тест не сдан'),
      ),
      ...failedAttestations.map((assessment) =>
        this.assessmentIssue(assessment, 'Аттестация не сдана'),
      ),
      ...expiredTests.map((assessment) =>
        this.assessmentIssue(assessment, 'Истек результат теста'),
      ),
      ...expiredAttestations.map((assessment) =>
        this.assessmentIssue(assessment, 'Истекла аттестация'),
      ),
      ...pendingAssessments.map((assessment) =>
        this.assessmentIssue(
          assessment,
          assessment.assessmentKind === 'ATTESTATION'
            ? 'Аттестация не пройдена'
            : 'Тест не пройден',
        ),
      ),
      ...pendingRegulations.map((regulation) =>
        this.regulationIssue(regulation),
      ),
    ];
    const warnings = requiredCourseGaps
      .filter((course) => !course.progress.overdue)
      .map((course) =>
        this.courseIssue(course, 'Обязательный курс еще не завершен'),
      );
    const readinessStatus: StaffReadinessStatus =
      blockers.length > 0
        ? 'BLOCKED'
        : warnings.length > 0
          ? 'ATTENTION'
          : 'READY';

    return {
      user: profile.user,
      readinessStatus,
      readinessPercent: this.calculateReadinessPercent({
        requiredCoursesCount: requiredCourses.length,
        completedRequiredCoursesCount: completedRequiredCourses.length,
        assessmentsCount: profile.assessments.length,
        passedAssessmentsCount: passedAssessments.length,
        assignedRegulationsCount: assignedRegulations.length,
        acknowledgedRegulationsCount:
          assignedRegulations.length - pendingRegulations.length,
      }),
      requiredCoursesCount: requiredCourses.length,
      completedRequiredCoursesCount: completedRequiredCourses.length,
      requiredCourseGapsCount: requiredCourseGaps.length,
      overdueCoursesCount: overdueCourses.length,
      assessmentsCount: profile.assessments.length,
      passedAssessmentsCount: passedAssessments.length,
      pendingAssessmentsCount:
        pendingAssessments.length +
        expiredTests.length +
        expiredAttestations.length,
      failedTestsCount: failedTests.length,
      failedAttestationsCount: failedAttestations.length,
      expiredAttestationsCount: expiredAttestations.length,
      assignedRegulationsCount: assignedRegulations.length,
      acknowledgedRegulationsCount:
        assignedRegulations.length - pendingRegulations.length,
      pendingRegulationsCount: pendingRegulations.length,
      blockers,
      warnings,
      nextActions: this.buildNextActions(blockers, warnings),
      courses: requiredCourseGaps,
      assessments: profile.assessments.filter(
        (assessment) => assessment.status !== 'PASSED',
      ),
      regulations: assignedRegulations,
    };
  }

  private calculateReadinessPercent(input: {
    requiredCoursesCount: number;
    completedRequiredCoursesCount: number;
    assessmentsCount: number;
    passedAssessmentsCount: number;
    assignedRegulationsCount: number;
    acknowledgedRegulationsCount: number;
  }) {
    const courseScore =
      input.requiredCoursesCount > 0
        ? Math.round(
            (input.completedRequiredCoursesCount / input.requiredCoursesCount) *
              35,
          )
        : 35;
    const assessmentScore =
      input.assessmentsCount > 0
        ? Math.round(
            (input.passedAssessmentsCount / input.assessmentsCount) * 40,
          )
        : 40;
    const regulationScore =
      input.assignedRegulationsCount > 0
        ? Math.round(
            (input.acknowledgedRegulationsCount /
              input.assignedRegulationsCount) *
              25,
          )
        : 25;

    return Math.min(
      Math.max(courseScore + assessmentScore + regulationScore, 0),
      100,
    );
  }

  private buildNextActions(
    blockers: StaffReadinessIssue[],
    warnings: StaffReadinessIssue[],
  ) {
    const issues = [...blockers, ...warnings];
    const actions: string[] = [];

    if (issues.some((issue) => issue.source === 'COURSE')) {
      actions.push('Закрыть обязательные курсы и обновить прогресс обучения.');
    }

    if (issues.some((issue) => issue.source === 'ASSESSMENT')) {
      actions.push('Назначить пересдачу теста или аттестации.');
    }

    if (issues.some((issue) => issue.source === 'REGULATION')) {
      actions.push('Подтвердить актуальную версию регламента смены.');
    }

    return actions.length > 0
      ? actions
      : ['Сотрудник готов к смене по текущим правилам допуска.'];
  }

  private toRegulationReadiness(
    regulation: StaffShiftRegulationRow,
    acknowledgement: StaffShiftRegulationAcknowledgementRow | null,
  ): StaffReadinessRegulation {
    return {
      id: regulation.id,
      title: regulation.title,
      roleScope: regulation.roleScope as StaffTrainingProfileRoleScope,
      shiftKind: regulation.shiftKind,
      version: regulation.version,
      store: regulation.store,
      acknowledged: Boolean(acknowledgement),
      acknowledgedAt: acknowledgement?.acknowledgedAt.toISOString() ?? null,
      effectiveFrom: regulation.effectiveFrom?.toISOString() ?? null,
      publishedAt: regulation.publishedAt?.toISOString() ?? null,
    };
  }

  private courseIssue(
    course: StaffTrainingProfileCourse,
    detail: string,
  ): StaffReadinessIssue {
    return {
      source: 'COURSE',
      title: course.title,
      detail,
      href: '/staff/training-profiles',
    };
  }

  private assessmentIssue(
    assessment: StaffTrainingProfileAssessment,
    detail: string,
  ): StaffReadinessIssue {
    return {
      source: 'ASSESSMENT',
      title: assessment.title,
      detail,
      href: '/staff/assessments',
    };
  }

  private regulationIssue(
    regulation: StaffReadinessRegulation,
  ): StaffReadinessIssue {
    return {
      source: 'REGULATION',
      title: regulation.title,
      detail: `Не подтверждена версия ${regulation.version}`,
      href: '/staff/shift-regulations',
    };
  }

  private buildSummary(
    rows: StaffReadinessRow[],
  ): StaffReadinessReport['summary'] {
    return {
      employees: rows.length,
      ready: rows.filter((row) => row.readinessStatus === 'READY').length,
      attention: rows.filter((row) => row.readinessStatus === 'ATTENTION')
        .length,
      blocked: rows.filter((row) => row.readinessStatus === 'BLOCKED').length,
      averageReadinessPercent:
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, row) => sum + row.readinessPercent, 0) /
                rows.length,
            )
          : 0,
      requiredCourseGaps: rows.reduce(
        (sum, row) => sum + row.requiredCourseGapsCount,
        0,
      ),
      overdueCourses: rows.reduce(
        (sum, row) => sum + row.overdueCoursesCount,
        0,
      ),
      failedTests: rows.reduce((sum, row) => sum + row.failedTestsCount, 0),
      failedAttestations: rows.reduce(
        (sum, row) => sum + row.failedAttestationsCount,
        0,
      ),
      expiredAttestations: rows.reduce(
        (sum, row) => sum + row.expiredAttestationsCount,
        0,
      ),
      pendingAssessments: rows.reduce(
        (sum, row) => sum + row.pendingAssessmentsCount,
        0,
      ),
      pendingRegulations: rows.reduce(
        (sum, row) => sum + row.pendingRegulationsCount,
        0,
      ),
    };
  }

  private matchesStatus(
    row: StaffReadinessRow,
    status: StaffReadinessStatusFilter,
  ) {
    if (status === 'all') {
      return true;
    }

    if (status === 'ready') {
      return row.readinessStatus === 'READY';
    }

    if (status === 'attention') {
      return row.readinessStatus === 'ATTENTION';
    }

    if (status === 'blocked') {
      return row.readinessStatus === 'BLOCKED';
    }

    if (status === 'failed_tests') {
      return row.failedTestsCount > 0 || row.failedAttestationsCount > 0;
    }

    if (status === 'expired_attestations') {
      return row.expiredAttestationsCount > 0;
    }

    return row.pendingRegulationsCount > 0;
  }

  private mapAcknowledgements(rows: StaffShiftRegulationAcknowledgementRow[]) {
    return new Map(
      rows.map((row) => [
        this.regulationKey(row.userId, row.regulationId, row.version),
        row,
      ]),
    );
  }

  private regulationMatchesUser(
    regulation: StaffShiftRegulationRow,
    user: StaffTrainingProfileUser,
  ) {
    return (
      this.roleMatchesScope(
        user.role,
        regulation.roleScope as StaffTrainingProfileRoleScope,
      ) && this.storeMatchesUser(regulation.store?.id ?? null, user)
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

  private storeMatchesUser(
    storeId: string | null,
    user: StaffTrainingProfileUser,
  ) {
    if (!storeId) {
      return true;
    }

    if (user.stores.length === 0) {
      return true;
    }

    return user.stores.some((store) => store.id === storeId);
  }

  private visibleRoleScopes(role: UserRole, canManageReadiness: boolean) {
    if (canManageReadiness) {
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

  private isCourseCompleted(course: StaffTrainingProfileCourse) {
    return (
      course.progress.status === 'COMPLETED' ||
      course.progress.status === 'WAIVED'
    );
  }

  private regulationKey(userId: string, regulationId: string, version: number) {
    return `${userId}:${regulationId}:${version}`;
  }

  private resolveStatusFilter(value: string | null | undefined) {
    if (!value) {
      return 'all';
    }

    if (readinessStatusFilters.includes(value as StaffReadinessStatusFilter)) {
      return value as StaffReadinessStatusFilter;
    }

    throw new BadRequestException(`Unsupported value: ${value}`);
  }
}
