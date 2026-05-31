import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffOnboardingPlanStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type StaffOnboardingRoleScope =
  | "ALL_STAFF"
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_MANAGER"
  | "MANAGER"
  | "STANDARDS_MANAGER";
export type StaffOnboardingStepType =
  | "COURSE"
  | "TASK_TEMPLATE"
  | "CHECKLIST_TEMPLATE"
  | "REGULATION"
  | "TEXT"
  | "LINK";

export type StaffOnboardingStep = {
  id: string;
  title: string;
  type: StaffOnboardingStepType;
  day: number | null;
  courseId: string | null;
  taskTemplateId: string | null;
  checklistTemplateId: string | null;
  regulationId: string | null;
  content: string | null;
  url: string | null;
  required: boolean;
};

export type StaffOnboardingOption = {
  id: string;
  title: string;
  status: string;
  roleScope: string | null;
  store: StaffTaskStore | null;
};

export type StaffOnboardingPlan = {
  id: string;
  title: string;
  description: string | null;
  roleScope: StaffOnboardingRoleScope;
  status: StaffOnboardingPlanStatus;
  durationDays: number | null;
  steps: StaffOnboardingStep[];
  stepsCount: number;
  coursesCount: number;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffOnboardingFilters = {
  status?: StaffOnboardingPlanStatus | "all";
  roleScope?: StaffOnboardingRoleScope | "all";
  storeId?: string;
  search?: string;
};

export type StaffOnboardingReport = {
  filters: Required<Pick<StaffOnboardingFilters, "status" | "roleScope">> & {
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    stepsCount: number;
    coursesCount: number;
    tasksCount: number;
  };
  canManageOnboarding: boolean;
  rows: StaffOnboardingPlan[];
  stores: StaffTaskStore[];
  courses: StaffOnboardingOption[];
  taskTemplates: StaffOnboardingOption[];
  checklistTemplates: StaffOnboardingOption[];
  regulations: StaffOnboardingOption[];
};

export async function getStaffOnboardingReport(
  filters: StaffOnboardingFilters = {},
): Promise<StaffOnboardingReport> {
  const response = await fetch(`${getApiUrl()}/staff/onboarding${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff onboarding plans");
  }

  return response.json() as Promise<StaffOnboardingReport>;
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
