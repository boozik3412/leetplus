import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffTrainingProfileAssessment,
  StaffTrainingProfileCourse,
  StaffTrainingProfileRole,
  StaffTrainingProfileUser,
} from "./staff-training-profiles";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffReadinessStatus = "READY" | "ATTENTION" | "BLOCKED";

export type StaffReadinessStatusFilter =
  | "all"
  | "ready"
  | "attention"
  | "blocked"
  | "failed_tests"
  | "expired_attestations"
  | "pending_regulations";

export type StaffReadinessIssue = {
  source: "COURSE" | "ASSESSMENT" | "REGULATION";
  title: string;
  detail: string;
  href: string | null;
};

export type StaffReadinessRegulation = {
  id: string;
  title: string;
  roleScope: StaffTrainingProfileCourse["roleScope"];
  shiftKind: string;
  version: number;
  store: StaffTaskStore | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
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

export type StaffReadinessReportFilters = {
  userId?: string;
  role?: StaffTrainingProfileRole | "all";
  storeId?: string;
  status?: StaffReadinessStatusFilter;
  search?: string;
};

export type StaffReadinessReport = {
  filters: Required<Pick<StaffReadinessReportFilters, "role" | "status">> & {
    userId: string | null;
    storeId: string | null;
    search: string | null;
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
  stores: StaffTaskStore[];
};

export async function getStaffReadinessReport(
  filters: StaffReadinessReportFilters = {},
): Promise<StaffReadinessReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/readiness-report${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff readiness report");
  }

  return response.json() as Promise<StaffReadinessReport>;
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
