import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffOperationsRiskLevel,
} from "./staff-operations-dashboard";
import type { StaffTaskStore } from "./staff-tasks";
import type { StaffTrainingProfileUser } from "./staff-training-profiles";

export type StaffAiAssistantFilters = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  search?: string;
};

export type StaffAiInsight = {
  id: string;
  title: string;
  detail: string;
  tone: StaffOperationsRiskLevel;
  href: string | null;
};

export type StaffAiActionDraft = {
  id: string;
  title: string;
  detail: string;
  actionType:
    | "TASK"
    | "CHECKLIST"
    | "KNOWLEDGE_MATERIAL"
    | "TRAINING"
    | "RETEST"
    | "REVIEW";
  priority: StaffOperationsRiskLevel;
  sourceHref: string | null;
};

export type StaffAiChecklistDraft = {
  id: string;
  title: string;
  sourceTitle: string;
  sourceStatus: string;
  shiftKind: string;
  roleScope: string;
  store: StaffTaskStore | null;
  sectionsCount: number;
  itemsCount: number;
  requiredItems: number;
  evidenceItems: number;
  checklistItems: Array<{
    title: string;
    sectionTitle: string;
    required: boolean;
    evidenceRequired: boolean;
    score: number;
  }>;
  publicationGuard: string;
  sourceHref: string;
};

export type StaffAiInstructionDraft = {
  id: string;
  title: string;
  sourceTitle: string;
  shiftKind: string;
  store: StaffTaskStore | null;
  shortSteps: string[];
  controlPoints: string[];
  sourceHref: string;
};

export type StaffAiTaskDecompositionDraft = {
  id: string;
  title: string;
  priority: StaffOperationsRiskLevel;
  dueInDays: number;
  tasks: Array<{ title: string; detail: string; href: string | null }>;
  sourceHref: string | null;
};

export type StaffAiWeakSpotRecommendation = {
  id: string;
  title: string;
  detail: string;
  scopeLabel: string;
  occurrences: number;
  failedRuns: number;
  priority: StaffOperationsRiskLevel;
  recommendedAction: "KNOWLEDGE_MATERIAL" | "RETEST" | "FOLLOW_UP_TASK";
  matchedMaterials: Array<{ id: string; title: string; href: string }>;
  matchedCourses: Array<{ id: string; title: string; href: string }>;
  matchedAssessments: Array<{ id: string; title: string; href: string }>;
  sourceHref: string;
};

export type StaffAiAssistantReport = {
  filters: Required<Pick<StaffAiAssistantFilters, "dateFrom" | "dateTo">> & {
    storeId: string | null;
    userId: string | null;
    search: string | null;
  };
  generatedAt: string;
  dataPolicy: {
    mode: "LOCAL_DETERMINISTIC";
    notes: string[];
  };
  managerSummary: {
    title: string;
    periodLabel: string;
    highlights: StaffAiInsight[];
    risks: StaffAiInsight[];
    recommendedActions: StaffAiActionDraft[];
  };
  checklistDrafts: StaffAiChecklistDraft[];
  shiftInstructionDrafts: StaffAiInstructionDraft[];
  taskDecompositionDrafts: StaffAiTaskDecompositionDraft[];
  weakSpotRecommendations: StaffAiWeakSpotRecommendation[];
  sourceCoverage: {
    tasks: number;
    checklists: number;
    recurringIssues: number;
    regulations: number;
    knowledgeMaterials: number;
    trainingCourses: number;
    assessments: number;
    disciplineRecords: number;
  };
  stores: StaffTaskStore[];
  users: Array<Pick<StaffTrainingProfileUser, "id" | "email" | "fullName">>;
};

export async function getStaffAiAssistantReport(
  filters: StaffAiAssistantFilters = {},
): Promise<StaffAiAssistantReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/ai-assistant${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff AI assistant report");
  }

  return response.json() as Promise<StaffAiAssistantReport>;
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
