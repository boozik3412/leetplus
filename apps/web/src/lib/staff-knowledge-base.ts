import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffKnowledgeArticleStatus =
  | "DRAFT"
  | "REVIEW"
  | "RETURNED"
  | "PUBLISHED"
  | "ARCHIVED";
export type StaffKnowledgeRoleScope =
  | "ALL_STAFF"
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_MANAGER"
  | "MANAGER"
  | "STANDARDS_MANAGER";
export type StaffKnowledgeMaterialType =
  | "TEXT"
  | "FILE_LINK"
  | "IMAGE"
  | "VIDEO"
  | "EXTERNAL_LINK"
  | "OTHER";

export type StaffKnowledgeMaterial = {
  id: string;
  title: string;
  type: StaffKnowledgeMaterialType;
  url: string | null;
  content: string | null;
  note: string | null;
  required: boolean;
};

export type StaffKnowledgeRelatedLinkType =
  | "REGULATION"
  | "CHECKLIST"
  | "TRAINING"
  | "ONBOARDING"
  | "DISCIPLINE"
  | "TASK"
  | "OTHER";

export type StaffKnowledgeRelatedLink = {
  id: string;
  type: StaffKnowledgeRelatedLinkType;
  title: string;
  url: string | null;
  note: string | null;
};

export type StaffKnowledgeArticleVersion = {
  id: string;
  version: number;
  title: string;
  summary: string | null;
  folder: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  tags: string[];
  materialsCount: number;
  relatedLinksCount: number;
  createdAt: string;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffKnowledgeReadingSummary = {
  requiredCount: number;
  readCount: number;
  pendingCount: number;
  requiredByMe: boolean;
  readByMe: boolean;
  readAt: string | null;
};

export type StaffKnowledgeReadReceipt = {
  id: string;
  userId: string;
  version: number;
  note: string | null;
  readAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
  };
};

export type StaffKnowledgeArticle = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  folder: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  templateKey: string | null;
  requiresReading: boolean;
  tags: string[];
  materials: StaffKnowledgeMaterial[];
  relatedLinks: StaffKnowledgeRelatedLink[];
  materialsCount: number;
  version: number;
  reviewRequestedAt: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  returnedAt: string | null;
  revisionDueAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  approvedByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  readingSummary: StaffKnowledgeReadingSummary;
  readReceipts: StaffKnowledgeReadReceipt[];
  versions: StaffKnowledgeArticleVersion[];
  workflowEvents: StaffKnowledgeWorkflowEvent[];
};

export type StaffKnowledgeWorkflowEvent = {
  id: string;
  type: "CREATED" | "REVIEW_REQUESTED" | "RETURNED" | "PUBLISHED" | "ARCHIVED";
  title: string;
  detail: string | null;
  happenedAt: string;
  actor: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffKnowledgeArticleSuggestion = {
  id: string;
  issueTitle: string;
  title: string;
  detail: string;
  occurrences: number;
  failedRuns: number;
  firstSeen: string;
  lastSeen: string;
  latestRunTitle: string;
  shiftKind: string;
  store: StaffTaskStore | null;
  employee: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  href: string;
  draft: {
    title: string;
    summary: string;
    content: string;
    folder: string;
    category: string;
    roleScope: StaffKnowledgeRoleScope;
    templateKey: string;
    requiresReading: boolean;
    tags: string[];
    materials: StaffKnowledgeMaterial[];
    relatedLinks: StaffKnowledgeRelatedLink[];
    approvalNote: string;
  };
};

export type StaffKnowledgeBaseFilters = {
  status?: StaffKnowledgeArticleStatus | "all";
  roleScope?: StaffKnowledgeRoleScope | "all";
  folder?: string;
  category?: string;
  storeId?: string;
  search?: string;
  requiredReading?: "all" | "required" | "optional";
};

export type StaffKnowledgeBaseReport = {
  filters: Required<Pick<StaffKnowledgeBaseFilters, "status" | "roleScope">> & {
    category: string | null;
    folder: string | null;
    storeId: string | null;
    search: string | null;
    requiredReading: "all" | "required" | "optional";
  };
  summary: {
    total: number;
    published: number;
    draft: number;
    review: number;
    returned: number;
    archived: number;
    requiredReading: number;
    requiredAudience: number;
    readReceipts: number;
    pendingReads: number;
    materialsCount: number;
  };
  canManageKnowledge: boolean;
  canEditKnowledge: boolean;
  canReviewKnowledge: boolean;
  canPublishKnowledge: boolean;
  folders: string[];
  categories: string[];
  rows: StaffKnowledgeArticle[];
  articleSuggestions: StaffKnowledgeArticleSuggestion[];
  stores: StaffTaskStore[];
};

export async function getStaffKnowledgeBaseReport(
  filters: StaffKnowledgeBaseFilters = {},
): Promise<StaffKnowledgeBaseReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/knowledge-base${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff knowledge base");
  }

  return response.json() as Promise<StaffKnowledgeBaseReport>;
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
