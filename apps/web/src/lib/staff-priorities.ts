import "server-only";
import {
  getApiUrl,
  getAuthHeaders,
  fetchWithTimeout,
  readJsonWithTimeout,
} from "./api";
import type {
  StaffPriorityDetails,
  StaffPriorityKind,
  StaffPriorityLoad,
  StaffPrioritySummary,
} from "./staff-priorities-types";

async function read<T>(
  path: string,
  storeIds: readonly string[],
  extra: Record<string, string> = {},
): Promise<T> {
  const params = new URLSearchParams(extra);
  storeIds.forEach((id) => params.append("storeIds", id));
  const response = await fetchWithTimeout(
    `${getApiUrl()}/staff/operations-dashboard/priorities${path}?${params}`,
    { cache: "no-store", headers: await getAuthHeaders() },
    8000,
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Нет доступа к сводке персонала."
        : response.status === 404
          ? "Сводка персонала ещё не поддерживается источником."
          : "Не удалось проверить персонал.",
    );
  return readJsonWithTimeout<T>(response, 8000);
}

export async function getStaffPriorities(
  storeIds: readonly string[],
): Promise<StaffPriorityLoad> {
  try {
    const data = await read<StaffPrioritySummary>("", storeIds);
    if (
      JSON.stringify([...data.scope.storeIds].sort()) !==
      JSON.stringify([...storeIds].sort())
    )
      throw new Error("Источник вернул другую выборку клубов.");
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Не удалось проверить персонал.",
    };
  }
}

export function getStaffPriorityItems(
  storeIds: readonly string[],
  kind: StaffPriorityKind,
  cursor?: string,
) {
  return read<StaffPriorityDetails>("/items", storeIds, {
    kind,
    ...(cursor ? { cursor } : {}),
  });
}
