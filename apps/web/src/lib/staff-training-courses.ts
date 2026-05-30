import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffTrainingCourseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type StaffTrainingRoleScope =
  | "ALL_STAFF"
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_MANAGER"
  | "MANAGER"
  | "STANDARDS_MANAGER";
export type StaffTrainingCourseStepType = "ARTICLE" | "TEXT" | "LINK" | "TASK";

export type StaffTrainingCourseStep = {
  id: string;
  title: string;
  type: StaffTrainingCourseStepType;
  articleId: string | null;
  content: string | null;
  url: string | null;
  required: boolean;
};

export type StaffTrainingKnowledgeArticleOption = {
  id: string;
  title: string;
  category: string;
  roleScope: StaffTrainingRoleScope;
  status: string;
  store: StaffTaskStore | null;
};

export type StaffTrainingCourse = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffTrainingRoleScope;
  status: StaffTrainingCourseStatus;
  required: boolean;
  dueDays: number | null;
  steps: StaffTrainingCourseStep[];
  stepsCount: number;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffTrainingCoursesFilters = {
  status?: StaffTrainingCourseStatus | "all";
  roleScope?: StaffTrainingRoleScope | "all";
  required?: "true" | "false" | "all";
  storeId?: string;
  search?: string;
};

export type StaffTrainingCoursesReport = {
  filters: Required<
    Pick<StaffTrainingCoursesFilters, "status" | "roleScope" | "required">
  > & {
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    required: number;
    stepsCount: number;
  };
  canManageTraining: boolean;
  rows: StaffTrainingCourse[];
  stores: StaffTaskStore[];
  knowledgeArticles: StaffTrainingKnowledgeArticleOption[];
};

export async function getStaffTrainingCoursesReport(
  filters: StaffTrainingCoursesFilters = {},
): Promise<StaffTrainingCoursesReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/training-courses${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff training courses");
  }

  return response.json() as Promise<StaffTrainingCoursesReport>;
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
