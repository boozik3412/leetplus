import { getApiUrl, getAuthHeaders } from "./api";

export type LangameSourceSettings = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  isActive: boolean;
  lastSyncedAt: string | null;
};

export type LangameSettings = {
  hasApiKey: boolean;
  domains: string[];
  sources: LangameSourceSettings[];
};

export async function getLangameSettings(): Promise<LangameSettings> {
  const response = await fetch(`${getApiUrl()}/integrations/langame/settings`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch LAngame settings");
  }

  return response.json() as Promise<LangameSettings>;
}
