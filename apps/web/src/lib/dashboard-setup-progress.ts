import { getApiUrl, getAuthHeaders } from "./api";
import { normalizeSetupProgress, type SetupProgress } from "./setup-progress";

/** Never throws: the checklist is optional and must not break the summary. */
export async function getSetupProgress(): Promise<SetupProgress | null> {
  try {
    const response = await fetch(`${getApiUrl()}/dashboard/setup-progress`, {
      cache: "no-store",
      headers: await getAuthHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return normalizeSetupProgress(await response.json());
  } catch {
    return null;
  }
}
