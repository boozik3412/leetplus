import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffAssessmentStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type StaffAssessmentKind = "TEST" | "ATTESTATION";
export type StaffAssessmentRoleScope =
  | "ALL_STAFF"
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_MANAGER"
  | "MANAGER"
  | "STANDARDS_MANAGER";
export type StaffAssessmentQuestionType =
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "TEXT";
export type StaffAssessmentResultStatus = "PASSED" | "FAILED";

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

export type StaffAssessmentUserOption = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
};

export type StaffAssessmentResult = {
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

export type StaffAssessment = {
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
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  resultSummary: {
    attempts: number;
    passed: number;
    failed: number;
    expired: number;
    passRate: number;
  };
  latestResult: StaffAssessmentResult | null;
};

export type StaffAssessmentsFilters = {
  status?: StaffAssessmentStatus | "all";
  roleScope?: StaffAssessmentRoleScope | "all";
  assessmentKind?: StaffAssessmentKind | "all";
  storeId?: string;
  resultUserId?: string;
  search?: string;
};

export type StaffAssessmentsReport = {
  filters: Required<
    Pick<StaffAssessmentsFilters, "status" | "roleScope" | "assessmentKind">
  > & {
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
  rows: StaffAssessment[];
  results: StaffAssessmentResult[];
  stores: StaffTaskStore[];
  users: StaffAssessmentUserOption[];
};

export async function getStaffAssessmentsReport(
  filters: StaffAssessmentsFilters = {},
): Promise<StaffAssessmentsReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/assessments${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff assessments");
  }

  return response.json() as Promise<StaffAssessmentsReport>;
}

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const value = params.toString();
  return value ? `?${value}` : "";
}
