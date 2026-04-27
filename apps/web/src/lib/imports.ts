import { getApiUrl, getAuthHeaders } from "./api";

export type ImportJob = {
  id: string;
  type: string;
  sourceFileName: string | null;
  status: "COMPLETED" | "FAILED" | string;
  totalRows: number;
  validRows: number;
  importedRows: number;
  errorsCount: number;
  createdAt: string;
  user: {
    email: string;
    fullName: string | null;
  } | null;
};

export async function getImportJobs(): Promise<ImportJob[]> {
  const response = await fetch(`${getApiUrl()}/imports`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch import jobs");
  }

  return response.json() as Promise<ImportJob[]>;
}
