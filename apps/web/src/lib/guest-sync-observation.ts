export type ObservedGuestSync = {
  status: string;
  running: boolean;
  latestRun: {
    status: string;
    diagnostics: { endpointErrors: Record<string, string> };
  } | null;
};

export function guestSyncDisplayStatus(sync: ObservedGuestSync | null) {
  if (!sync) return "UNKNOWN";
  if (sync.running) return "RUNNING";
  const status = sync.latestRun?.status ?? sync.status;
  if (
    status === "SUCCESS" &&
    Object.keys(sync.latestRun?.diagnostics.endpointErrors ?? {}).length > 0
  ) {
    return "PARTIAL";
  }
  return status;
}

export function guestSyncCompletionMessage(sync: ObservedGuestSync | null) {
  const status = guestSyncDisplayStatus(sync);
  if (status === "RUNNING") {
    return "Гости ещё загружаются. Статус обновляется автоматически, пока открыта страница.";
  }
  if (status === "PARTIAL") {
    return "Гостевые данные загружены частично. Доступные разделы сохранены; ограничения показаны ниже.";
  }
  return null;
}

export async function observeGuestSync<T extends ObservedGuestSync>({
  fetchStatus,
  wait,
  attempts,
  onStatus,
}: {
  fetchStatus: () => Promise<T>;
  wait: () => Promise<void>;
  attempts: number;
  onStatus?: (status: T) => void;
}): Promise<T> {
  let latest: T | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait();
    latest = await fetchStatus();
    onStatus?.(latest);
    if (!latest.running && latest.latestRun) return latest;
  }
  if (latest?.running) return latest;
  throw new Error(
    "Не удалось подтвердить состояние загрузки гостей. Обновите статус на странице.",
  );
}
