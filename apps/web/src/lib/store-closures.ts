import { getApiUrl, getAuthHeaders } from "./api";
import type { StoreClosure } from "./store-closure-state";

export type { StoreClosure } from "./store-closure-state";

/** Recent closures of all clubs; null when the API cannot answer. */
export async function getStoreClosures(): Promise<StoreClosure[] | null> {
  try {
    const response = await fetch(`${getApiUrl()}/stores/closures`, {
      cache: "no-store",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) return null;
    return (await response.json()) as StoreClosure[];
  } catch {
    return null;
  }
}
