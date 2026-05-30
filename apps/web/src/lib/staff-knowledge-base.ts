import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffKnowledgeArticleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
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

export type StaffKnowledgeArticle = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  tags: string[];
  materials: StaffKnowledgeMaterial[];
  materialsCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffKnowledgeBaseFilters = {
  status?: StaffKnowledgeArticleStatus | "all";
  roleScope?: StaffKnowledgeRoleScope | "all";
  category?: string;
  storeId?: string;
  search?: string;
};

export type StaffKnowledgeBaseReport = {
  filters: Required<Pick<StaffKnowledgeBaseFilters, "status" | "roleScope">> & {
    category: string | null;
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    materialsCount: number;
  };
  canManageKnowledge: boolean;
  categories: string[];
  rows: StaffKnowledgeArticle[];
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
