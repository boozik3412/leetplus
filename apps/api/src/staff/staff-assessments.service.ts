import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const assessmentStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const assessmentKinds = ['TEST', 'ATTESTATION'] as const;
const roleScopes = [
  'ALL_STAFF',
  'ADMINISTRATOR',
  'SENIOR_ADMINISTRATOR',
  'CLUB_MANAGER',
  'MANAGER',
  'STANDARDS_MANAGER',
] as const;
const questionTypes = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TEXT'] as const;

export type StaffAssessmentStatus = (typeof assessmentStatuses)[number];
export type StaffAssessmentKind = (typeof assessmentKinds)[number];
export type StaffAssessmentRoleScope = (typeof roleScopes)[number];
export type StaffAssessmentQuestionType = (typeof questionTypes)[number];
export type StaffAssessmentResultStatus = 'PASSED' | 'FAILED';

export type StaffAssessmentsQuery = {
  status?: StaffAssessmentStatus | 'all';
  roleScope?: StaffAssessmentRoleScope | 'all';
  assessmentKind?: StaffAssessmentKind | 'all';
  storeId?: string;
  resultUserId?: string;
  search?: string;
};

export type StaffAssessmentDto = {
  title?: string;
  description?: string | null;
  roleScope?: StaffAssessmentRoleScope;
  status?: StaffAssessmentStatus;
  assessmentKind?: StaffAssessmentKind;
  passThreshold?: number | string;
  retakeLimit?: number | string | null;
  expiresInDays?: number | string | null;
  timeLimitMinutes?: number | string | null;
  storeId?: string | null;
  questions?: unknown;
};

export type StaffAssessmentSubmitDto = {
  answers?: unknown;
};

export type StaffAssessmentQuestionOption = {
  id: string;
  label: string;
};

export type StaffAssessmentQuestion = {
  id: string;
  title: string;
  type: StaffAssessmentQuestionType;
  options: StaffAssessmentQuestionOption[];
  correctOptionIds: string[];
  points: number;
  required: boolean;
};

export type StaffAssessmentAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  text: string | null;
  correct: boolean | null;
  pointsEarned: number;
  pointsAvailable: number;
};

export type StaffAssessmentReport = {
  filters: {
    status: StaffAssessmentStatus | 'all';
    roleScope: StaffAssessmentRoleScope | 'all';
    assessmentKind: StaffAssessmentKind | 'all';
    storeId: string | null;
    resultUserId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    tests: number;
    attestations: number;
    questionsCount: number;
    resultAttempts: number;
    passedAttempts: number;
    failedAttempts: number;
    expiredResults: number;
    passRate: number;
  };
  canManageAssessments: boolean;
  rows: StaffAssessmentResponse[];
  results: StaffAssessmentResultResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: StaffAssessmentUserOption[];
};

export type StaffAssessmentResponse = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffAssessmentRoleScope;
  status: StaffAssessmentStatus;
  assessmentKind: StaffAssessmentKind;
  passThreshold: number;
  retakeLimit: number | null;
  expiresInDays: number | null;
  timeLimitMinutes: number | null;
  questions: StaffAssessmentQuestion[];
  questionsCount: number;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  resultSummary: {
    attempts: number;
    passed: number;
    failed: number;
    expired: number;
    passRate: number;
  };
  latestResult: StaffAssessmentResultResponse | null;
};

export type StaffAssessmentResultResponse = {
  id: string;
  assessmentId: string;
  attemptNumber: number;
  status: StaffAssessmentResultStatus;
  score: number;
  passed: boolean;
  answers: StaffAssessmentAnswer[];
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
  user: StaffAssessmentUserOption;
  reviewedByUser: StaffAssessmentUserOption | null;
  assessment: {
    id: string;
    title: string;
    assessmentKind: StaffAssessmentKind;
    passThreshold: number;
  };
};

export type StaffAssessmentUserOption = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
};

const assessmentInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffAssessmentInclude;

const resultInclude = {
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  },
  reviewedByUser: {
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  },
  assessment: {
    select: {
      id: true,
      title: true,
      assessmentKind: true,
      passThreshold: true,
    },
  },
} satisfies Prisma.StaffAssessmentResultInclude;

type StaffAssessmentRow = Prisma.StaffAssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;

type StaffAssessmentResultRow = Prisma.StaffAssessmentResultGetPayload<{
  include: typeof resultInclude;
}>;

@Injectable()
export class StaffAssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getAssessments(
    user: AuthenticatedUser,
    query: StaffAssessmentsQuery = {},
  ): Promise<StaffAssessmentReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const canManageAssessments = this.canManageAssessments(user);
    const filters = this.resolveFilters(query, canManageAssessments);
    const visibleStoreIds = canManageAssessments
      ? null
      : await this.getCurrentUserStoreAccessIds(tenantId, user.id);
    const where = this.buildWhere(
      tenantId,
      user,
      filters,
      canManageAssessments,
      visibleStoreIds,
    );

    const [rows, stores, users] = await Promise.all([
      this.prisma.staffAssessment.findMany({
        where,
        include: assessmentInclude,
        orderBy: [
          { status: 'asc' },
          { assessmentKind: 'asc' },
          { updatedAt: 'desc' },
        ],
        take: 200,
      }),
      this.prisma.store.findMany({
        where: {
          tenantId,
          ...(visibleStoreIds && visibleStoreIds.length > 0
            ? { id: { in: visibleStoreIds } }
            : {}),
        },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      canManageAssessments
        ? this.prisma.user.findMany({
            where: { tenantId },
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              isActive: true,
            },
            orderBy: [
              { isActive: 'desc' },
              { fullName: 'asc' },
              { email: 'asc' },
            ],
            take: 300,
          })
        : Promise.resolve([]),
    ]);
    const assessmentIds = rows.map((row) => row.id);
    const resultRows =
      assessmentIds.length > 0
        ? await this.prisma.staffAssessmentResult.findMany({
            where: {
              tenantId,
              assessmentId: { in: assessmentIds },
              ...(canManageAssessments
                ? filters.resultUserId
                  ? { userId: filters.resultUserId }
                  : {}
                : { userId: user.id }),
            },
            include: resultInclude,
            orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
            take: 500,
          })
        : [];
    const resultResponses = resultRows.map((row) => this.toResultResponse(row));
    const responseRows = rows.map((row) =>
      this.toAssessmentResponse(row, resultResponses, user.id),
    );

    return {
      filters,
      summary: this.buildSummary(responseRows, resultResponses),
      canManageAssessments,
      rows: responseRows,
      results: resultResponses,
      stores,
      users,
    };
  }

  async createAssessment(user: AuthenticatedUser, dto: StaffAssessmentDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageAssessments(user)) {
      throw new BadRequestException('Assessment editing is not allowed');
    }

    const normalized = await this.normalizeAssessmentData(tenantId, dto, {
      requireTitle: true,
    });
    const created = await this.prisma.staffAssessment.create({
      data: {
        ...(normalized.data as Prisma.StaffAssessmentUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
      },
      include: assessmentInclude,
    });

    return this.toAssessmentResponse(created, [], user.id);
  }

  async updateAssessment(
    user: AuthenticatedUser,
    id: string,
    dto: StaffAssessmentDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageAssessments(user)) {
      throw new BadRequestException('Assessment editing is not allowed');
    }

    const current = await this.prisma.staffAssessment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Assessment not found');
    }

    const normalized = await this.normalizeAssessmentData(tenantId, dto, {
      requireTitle: false,
    });
    const updated = await this.prisma.staffAssessment.update({
      where: { id: current.id },
      data: normalized.data,
      include: assessmentInclude,
    });

    return this.toAssessmentResponse(updated, [], user.id);
  }

  async submitResult(
    user: AuthenticatedUser,
    assessmentId: string,
    dto: StaffAssessmentSubmitDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const assessment = await this.prisma.staffAssessment.findFirst({
      where: { id: assessmentId, tenantId, status: 'ACTIVE' },
      include: assessmentInclude,
    });

    if (!assessment) {
      throw new NotFoundException('Active assessment not found');
    }

    if (
      !this.canManageAssessments(user) &&
      !this.visibleRoleScopes(user.role).includes(
        assessment.roleScope as StaffAssessmentRoleScope,
      )
    ) {
      throw new BadRequestException(
        'Assessment is not available for this role',
      );
    }

    if (!this.canManageAssessments(user)) {
      const visibleStoreIds = await this.getCurrentUserStoreAccessIds(
        tenantId,
        user.id,
      );

      if (
        assessment.storeId &&
        visibleStoreIds.length > 0 &&
        !visibleStoreIds.includes(assessment.storeId)
      ) {
        throw new BadRequestException(
          'Assessment is not available for this club',
        );
      }
    }

    const questions = this.normalizeQuestionsFromStorage(assessment.questions);

    if (questions.length === 0) {
      throw new BadRequestException('Assessment has no questions');
    }

    const previousAttempts = await this.prisma.staffAssessmentResult.count({
      where: { tenantId, assessmentId: assessment.id, userId: user.id },
    });

    if (
      assessment.retakeLimit !== null &&
      previousAttempts >= assessment.retakeLimit
    ) {
      throw new BadRequestException('Attempt limit has been reached');
    }

    const answers = this.normalizeAnswers(dto.answers, questions);
    const grading = this.gradeAnswers(
      questions,
      answers,
      assessment.passThreshold,
    );
    const submittedAt = new Date();
    const expiresAt =
      grading.passed && assessment.expiresInDays
        ? this.addDays(submittedAt, assessment.expiresInDays)
        : null;
    const created = await this.prisma.staffAssessmentResult.create({
      data: {
        tenantId,
        assessmentId: assessment.id,
        userId: user.id,
        attemptNumber: previousAttempts + 1,
        status: grading.passed ? 'PASSED' : 'FAILED',
        score: grading.score,
        passed: grading.passed,
        answers: grading.answers,
        submittedAt,
        expiresAt,
      },
      include: resultInclude,
    });

    return this.toResultResponse(created);
  }

  private resolveFilters(
    query: StaffAssessmentsQuery,
    canManageAssessments: boolean,
  ): StaffAssessmentReport['filters'] {
    const status = this.resolveOne(
      query.status,
      ['all', ...assessmentStatuses] as const,
      canManageAssessments ? 'all' : 'ACTIVE',
    );

    return {
      status: canManageAssessments ? status : 'ACTIVE',
      roleScope: this.resolveOne(
        query.roleScope,
        ['all', ...roleScopes] as const,
        'all',
      ),
      assessmentKind: this.resolveOne(
        query.assessmentKind,
        ['all', ...assessmentKinds] as const,
        'all',
      ),
      storeId: this.normalizeOptionalString(query.storeId),
      resultUserId: canManageAssessments
        ? this.normalizeOptionalString(query.resultUserId)
        : null,
      search: this.normalizeOptionalString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    user: AuthenticatedUser,
    filters: StaffAssessmentReport['filters'],
    canManageAssessments: boolean,
    visibleStoreIds: string[] | null,
  ): Prisma.StaffAssessmentWhereInput {
    const where: Prisma.StaffAssessmentWhereInput = { tenantId };
    const and: Prisma.StaffAssessmentWhereInput[] = [];

    if (filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.roleScope !== 'all') {
      where.roleScope = filters.roleScope;
    }

    if (filters.assessmentKind !== 'all') {
      where.assessmentKind = filters.assessmentKind;
    }

    if (!canManageAssessments) {
      where.status = 'ACTIVE';
      where.roleScope = { in: this.visibleRoleScopes(user.role) };

      if (visibleStoreIds && visibleStoreIds.length > 0) {
        and.push({
          OR: [{ storeId: null }, { storeId: { in: visibleStoreIds } }],
        });
      }
    }

    if (filters.storeId) {
      where.storeId = filters.storeId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private buildSummary(
    rows: StaffAssessmentResponse[],
    results: StaffAssessmentResultResponse[],
  ): StaffAssessmentReport['summary'] {
    const now = Date.now();
    const passedAttempts = results.filter((result) => result.passed).length;
    const failedAttempts = results.filter((result) => !result.passed).length;
    const expiredResults = results.filter(
      (result) =>
        result.passed &&
        result.expiresAt !== null &&
        new Date(result.expiresAt).getTime() < now,
    ).length;

    return {
      total: rows.length,
      active: rows.filter((row) => row.status === 'ACTIVE').length,
      draft: rows.filter((row) => row.status === 'DRAFT').length,
      archived: rows.filter((row) => row.status === 'ARCHIVED').length,
      tests: rows.filter((row) => row.assessmentKind === 'TEST').length,
      attestations: rows.filter((row) => row.assessmentKind === 'ATTESTATION')
        .length,
      questionsCount: rows.reduce((sum, row) => sum + row.questionsCount, 0),
      resultAttempts: results.length,
      passedAttempts,
      failedAttempts,
      expiredResults,
      passRate:
        results.length > 0
          ? Math.round((passedAttempts / results.length) * 100)
          : 0,
    };
  }

  private async normalizeAssessmentData(
    tenantId: string,
    dto: StaffAssessmentDto,
    options: { requireTitle: boolean },
  ): Promise<{ data: Prisma.StaffAssessmentUncheckedUpdateInput }> {
    const data: Prisma.StaffAssessmentUncheckedUpdateInput = {};

    if (dto.title !== undefined || options.requireTitle) {
      data.title = this.normalizeRequiredString(
        dto.title,
        'Assessment title is required',
      ).slice(0, 180);
    }

    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalString(dto.description)?.slice(
        0,
        2000,
      );
    }

    if (dto.roleScope !== undefined || options.requireTitle) {
      data.roleScope = this.resolveOne(
        dto.roleScope,
        roleScopes,
        'ADMINISTRATOR',
      );
    }

    if (dto.status !== undefined || options.requireTitle) {
      data.status = this.resolveOne(dto.status, assessmentStatuses, 'DRAFT');
    }

    if (dto.assessmentKind !== undefined || options.requireTitle) {
      data.assessmentKind = this.resolveOne(
        dto.assessmentKind,
        assessmentKinds,
        'TEST',
      );
    }

    if (dto.passThreshold !== undefined || options.requireTitle) {
      data.passThreshold = this.normalizeBoundedInt(
        dto.passThreshold,
        1,
        100,
        80,
        'Pass threshold must be between 1 and 100',
      );
    }

    if (dto.retakeLimit !== undefined || options.requireTitle) {
      data.retakeLimit = this.normalizeOptionalBoundedInt(
        dto.retakeLimit,
        1,
        20,
        3,
        'Attempt limit must be between 1 and 20',
      );
    }

    if (dto.expiresInDays !== undefined || options.requireTitle) {
      data.expiresInDays = this.normalizeOptionalBoundedInt(
        dto.expiresInDays,
        1,
        1095,
        null,
        'Expiration days must be between 1 and 1095',
      );
    }

    if (dto.timeLimitMinutes !== undefined || options.requireTitle) {
      data.timeLimitMinutes = this.normalizeOptionalBoundedInt(
        dto.timeLimitMinutes,
        5,
        480,
        null,
        'Time limit must be between 5 and 480 minutes',
      );
    }

    if (dto.storeId !== undefined) {
      data.storeId = await this.resolveStoreId(tenantId, dto.storeId);
    }

    if (dto.questions !== undefined || options.requireTitle) {
      const questions = this.normalizeQuestions(dto.questions);
      data.questions = questions;
      data.questionsCount = questions.length;
    }

    return { data };
  }

  private normalizeQuestions(value: unknown): StaffAssessmentQuestion[] {
    const rawQuestions = Array.isArray(value) ? value.slice(0, 80) : [];
    const questions: StaffAssessmentQuestion[] = [];

    rawQuestions.forEach((question, index) => {
      const record = this.asRecord(question);
      const title = this.normalizeOptionalString(record.title);

      if (!title) {
        return;
      }

      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        questionTypes,
        'SINGLE_CHOICE',
      );
      const options = this.normalizeQuestionOptions(record.options);
      const correctOptionIds = this.normalizeCorrectOptionIds(
        record.correctOptionIds,
        options,
        type,
      );

      if (type !== 'TEXT' && options.length < 2) {
        throw new BadRequestException(
          'Choice question must have at least two options',
        );
      }

      if (type !== 'TEXT' && correctOptionIds.length === 0) {
        throw new BadRequestException(
          'Choice question must have a correct answer',
        );
      }

      questions.push({
        id: this.normalizeOptionalString(record.id) ?? `question-${index + 1}`,
        title: title.slice(0, 240),
        type,
        options: type === 'TEXT' ? [] : options,
        correctOptionIds: type === 'TEXT' ? [] : correctOptionIds,
        points: this.normalizeBoundedInt(
          record.points,
          1,
          100,
          1,
          'Question points must be between 1 and 100',
        ),
        required: this.normalizeBoolean(record.required, true),
      });
    });

    return questions;
  }

  private normalizeQuestionOptions(value: unknown) {
    const rawOptions = Array.isArray(value) ? value.slice(0, 12) : [];

    return rawOptions
      .map((option, index) => {
        const record = this.asRecord(option);
        const label = this.normalizeOptionalString(record.label);

        if (!label) {
          return null;
        }

        return {
          id: this.normalizeOptionalString(record.id) ?? `option-${index + 1}`,
          label: label.slice(0, 240),
        };
      })
      .filter((option): option is StaffAssessmentQuestionOption =>
        Boolean(option),
      );
  }

  private normalizeCorrectOptionIds(
    value: unknown,
    options: StaffAssessmentQuestionOption[],
    type: StaffAssessmentQuestionType,
  ) {
    if (type === 'TEXT') {
      return [];
    }

    const optionIds = new Set(options.map((option) => option.id));
    const rawIds = Array.isArray(value) ? value : [];
    const ids = rawIds
      .map((id) => this.normalizeOptionalString(id))
      .filter((id): id is string => Boolean(id))
      .filter((id) => optionIds.has(id));

    return Array.from(
      new Set(type === 'SINGLE_CHOICE' ? ids.slice(0, 1) : ids),
    );
  }

  private normalizeQuestionsFromStorage(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 80).map((question, index) => {
      const record = this.asRecord(question);
      const type = this.resolveOne(
        this.normalizeOptionalString(record.type),
        questionTypes,
        'SINGLE_CHOICE',
      );

      return {
        id: this.normalizeOptionalString(record.id) ?? `question-${index + 1}`,
        title:
          this.normalizeOptionalString(record.title) ?? `Вопрос ${index + 1}`,
        type,
        options: this.normalizeQuestionOptions(record.options),
        correctOptionIds: Array.isArray(record.correctOptionIds)
          ? record.correctOptionIds
              .map((id) => this.normalizeOptionalString(id))
              .filter((id): id is string => Boolean(id))
          : [],
        points: this.normalizeBoundedInt(
          record.points,
          1,
          100,
          1,
          'Question points must be between 1 and 100',
        ),
        required: this.normalizeBoolean(record.required, true),
      };
    });
  }

  private normalizeAnswers(
    value: unknown,
    questions: StaffAssessmentQuestion[],
  ) {
    const rawAnswers = Array.isArray(value) ? value : [];
    const rawByQuestion = new Map<string, Record<string, unknown>>();

    rawAnswers.forEach((answer) => {
      const record = this.asRecord(answer);
      const questionId = this.normalizeOptionalString(record.questionId);

      if (questionId) {
        rawByQuestion.set(questionId, record);
      }
    });

    return questions.map((question) => {
      const record = rawByQuestion.get(question.id) ?? {};
      const optionIds = new Set(question.options.map((option) => option.id));
      const selectedOptionIds = Array.isArray(record.selectedOptionIds)
        ? record.selectedOptionIds
            .map((id) => this.normalizeOptionalString(id))
            .filter((id): id is string => Boolean(id))
            .filter((id) => optionIds.has(id))
        : [];
      const uniqueSelected =
        question.type === 'SINGLE_CHOICE'
          ? Array.from(new Set(selectedOptionIds)).slice(0, 1)
          : Array.from(new Set(selectedOptionIds));
      const text = this.normalizeOptionalString(record.text);

      if (
        question.required &&
        question.type !== 'TEXT' &&
        uniqueSelected.length === 0
      ) {
        throw new BadRequestException(
          'Required question has no selected answer',
        );
      }

      if (question.required && question.type === 'TEXT' && !text) {
        throw new BadRequestException('Required text question has no answer');
      }

      return {
        questionId: question.id,
        selectedOptionIds: question.type === 'TEXT' ? [] : uniqueSelected,
        text: question.type === 'TEXT' ? text : null,
        correct: null,
        pointsEarned: 0,
        pointsAvailable: question.type === 'TEXT' ? 0 : question.points,
      } satisfies StaffAssessmentAnswer;
    });
  }

  private gradeAnswers(
    questions: StaffAssessmentQuestion[],
    answers: StaffAssessmentAnswer[],
    passThreshold: number,
  ) {
    const questionById = new Map(
      questions.map((question) => [question.id, question]),
    );
    let earnedPoints = 0;
    let totalPoints = 0;
    const gradedAnswers = answers.map((answer) => {
      const question = questionById.get(answer.questionId);

      if (!question || question.type === 'TEXT') {
        return answer;
      }

      const correct = this.sameSet(
        question.correctOptionIds,
        answer.selectedOptionIds,
      );
      totalPoints += question.points;

      if (correct) {
        earnedPoints += question.points;
      }

      return {
        ...answer,
        correct,
        pointsEarned: correct ? question.points : 0,
        pointsAvailable: question.points,
      };
    });
    const score =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    return {
      answers: gradedAnswers,
      score,
      passed: score >= passThreshold,
    };
  }

  private toAssessmentResponse(
    row: StaffAssessmentRow,
    results: StaffAssessmentResultResponse[],
    currentUserId: string,
  ): StaffAssessmentResponse {
    const rowResults = results.filter(
      (result) => result.assessmentId === row.id,
    );
    const latestResult =
      rowResults.find((result) => result.user.id === currentUserId) ??
      rowResults[0] ??
      null;
    const passed = rowResults.filter((result) => result.passed).length;
    const failed = rowResults.filter((result) => !result.passed).length;
    const expired = rowResults.filter(
      (result) =>
        result.passed &&
        result.expiresAt !== null &&
        new Date(result.expiresAt).getTime() < Date.now(),
    ).length;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      roleScope: row.roleScope as StaffAssessmentRoleScope,
      status: row.status as StaffAssessmentStatus,
      assessmentKind: row.assessmentKind as StaffAssessmentKind,
      passThreshold: row.passThreshold,
      retakeLimit: row.retakeLimit,
      expiresInDays: row.expiresInDays,
      timeLimitMinutes: row.timeLimitMinutes,
      questions: this.normalizeQuestionsFromStorage(row.questions),
      questionsCount: row.questionsCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      createdByUser: row.createdByUser,
      resultSummary: {
        attempts: rowResults.length,
        passed,
        failed,
        expired,
        passRate:
          rowResults.length > 0
            ? Math.round((passed / rowResults.length) * 100)
            : 0,
      },
      latestResult,
    };
  }

  private toResultResponse(
    row: StaffAssessmentResultRow,
  ): StaffAssessmentResultResponse {
    return {
      id: row.id,
      assessmentId: row.assessmentId,
      attemptNumber: row.attemptNumber,
      status: row.status as StaffAssessmentResultStatus,
      score: row.score,
      passed: row.passed,
      answers: this.normalizeAnswersFromStorage(row.answers),
      startedAt: row.startedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      reviewComment: row.reviewComment,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      user: row.user,
      reviewedByUser: row.reviewedByUser,
      assessment: {
        id: row.assessment.id,
        title: row.assessment.title,
        assessmentKind: row.assessment.assessmentKind as StaffAssessmentKind,
        passThreshold: row.assessment.passThreshold,
      },
    };
  }

  private normalizeAnswersFromStorage(value: unknown): StaffAssessmentAnswer[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 80).map((answer) => {
      const record = this.asRecord(answer);

      return {
        questionId: this.normalizeOptionalString(record.questionId) ?? '',
        selectedOptionIds: Array.isArray(record.selectedOptionIds)
          ? record.selectedOptionIds
              .map((id) => this.normalizeOptionalString(id))
              .filter((id): id is string => Boolean(id))
          : [],
        text: this.normalizeOptionalString(record.text),
        correct: typeof record.correct === 'boolean' ? record.correct : null,
        pointsEarned: this.normalizeBoundedInt(
          record.pointsEarned,
          0,
          100,
          0,
          'Points earned must be between 0 and 100',
        ),
        pointsAvailable: this.normalizeBoundedInt(
          record.pointsAvailable,
          0,
          100,
          0,
          'Points available must be between 0 and 100',
        ),
      };
    });
  }

  private canManageAssessments(user: AuthenticatedUser) {
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

  private async getCurrentUserStoreAccessIds(tenantId: string, userId: string) {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { storeAccesses: { select: { storeId: true } } },
    });

    return row?.storeAccesses.map((access) => access.storeId) ?? [];
  }

  private visibleRoleScopes(role: UserRole): StaffAssessmentRoleScope[] {
    const scopes: StaffAssessmentRoleScope[] = ['ALL_STAFF'];

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

  private normalizeBoundedInt(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
    message: string,
  ) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const parsed = Number.parseInt(String(value), 10);

    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(message);
    }

    return parsed;
  }

  private normalizeOptionalBoundedInt(
    value: unknown,
    min: number,
    max: number,
    fallback: number | null,
    message: string,
  ) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    return this.normalizeBoundedInt(value, min, max, fallback ?? min, message);
  }

  private sameSet(expected: string[], actual: string[]) {
    if (expected.length !== actual.length) {
      return false;
    }

    const expectedSet = new Set(expected);
    return actual.every((id) => expectedSet.has(id));
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
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
}
