import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffTrainingProgressStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WAIVED";

export type StaffTrainingProfileRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "CLUB_MANAGER"
  | "STANDARDS_MANAGER"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_ADMINISTRATOR";

export type StaffTrainingProfileStatusFilter =
  | "all"
  | "overdue"
  | "in_progress"
  | "completed"
  | "missing_attestation";

export type StaffTrainingProfileUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: StaffTrainingProfileRole;
  isActive: boolean;
  stores: StaffTaskStore[];
};

export type StaffTrainingProfileCourse = {
  id: string;
  title: string;
  description: string | null;
  roleScope:
    | "ALL_STAFF"
    | "ADMINISTRATOR"
    | "SENIOR_ADMINISTRATOR"
    | "CLUB_MANAGER"
    | "MANAGER"
    | "STANDARDS_MANAGER";
  required: boolean;
  dueDays: number | null;
  stepsCount: number;
  store: StaffTaskStore | null;
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
  roleScope: StaffTrainingProfileCourse["roleScope"];
  assessmentKind: "TEST" | "ATTESTATION";
  passThreshold: number;
  store: StaffTaskStore | null;
  status: "PASSED" | "FAILED" | "PENDING" | "EXPIRED";
  latestResult: {
    id: string;
    attemptNumber: number;
    score: number;
    passed: boolean;
    submittedAt: string | null;
    expiresAt: string | null;
  } | null;
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

export type StaffTrainingProfilesFilters = {
  userId?: string;
  role?: StaffTrainingProfileRole | "all";
  storeId?: string;
  status?: StaffTrainingProfileStatusFilter;
  search?: string;
};

export type StaffTrainingProfilesReport = {
  filters: Required<Pick<StaffTrainingProfilesFilters, "role" | "status">> & {
    userId: string | null;
    storeId: string | null;
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
  stores: StaffTaskStore[];
};

export async function getStaffTrainingProfilesReport(
  filters: StaffTrainingProfilesFilters = {},
): Promise<StaffTrainingProfilesReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/training-profiles${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff training profiles");
  }

  return response.json() as Promise<StaffTrainingProfilesReport>;
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
