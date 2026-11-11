// Plain per-club view of the Langame connection for «Подключения»
// (UX plan, step 2.2). It reads the same settings the support page /sync
// shows and never invents a status the import did not report.
import type {
  LangameSettings,
  LangameSourceSettings,
  LangameSyncJob,
} from "./langame-settings";

export type LangameClubConnectionState =
  | "OK"
  | "PARTIAL"
  | "FAILED"
  | "WAITING"
  | "NOT_CONNECTED";

export type LangameClubConnection = {
  storeId: string;
  storeName: string;
  domain: string | null;
  state: LangameClubConnectionState;
  lastLoadedAt: string | null;
  /** Plain words for the owner; null when the state label says it all. */
  note: string | null;
};

export const langameConnectionStateLabels: Record<
  LangameClubConnectionState,
  string
> = {
  OK: "Данные приходят",
  PARTIAL: "Загружено не всё",
  FAILED: "Ошибка загрузки",
  WAITING: "Ждёт первой загрузки",
  NOT_CONNECTED: "Не подключён",
};

function latestJobByDomain(jobs: LangameSyncJob[]) {
  const latest = new Map<string, LangameSyncJob>();

  for (const job of jobs) {
    const current = latest.get(job.domain);

    if (!current || job.startedAt > current.startedAt) {
      latest.set(job.domain, job);
    }
  }

  return latest;
}

function sourceFor(
  store: LangameSettings["stores"][number],
  sources: LangameSourceSettings[],
) {
  return (
    sources.find((source) => source.id === store.integrationSourceId) ??
    sources.find(
      (source) =>
        store.externalDomain !== null && source.domain === store.externalDomain,
    ) ??
    null
  );
}

export function langameClubConnections(
  settings: Pick<LangameSettings, "stores" | "sources" | "syncJobs">,
): LangameClubConnection[] {
  const latestJobs = latestJobByDomain(settings.syncJobs);

  return settings.stores
    .map((store): LangameClubConnection => {
      const source = sourceFor(store, settings.sources);
      const domain = source?.domain ?? store.externalDomain ?? null;

      if (!source || !domain || !source.isActive) {
        return {
          storeId: store.id,
          storeName: store.name,
          domain,
          state: "NOT_CONNECTED",
          lastLoadedAt: null,
          note: !domain
            ? "Адрес клуба в Langame не задан."
            : source
              ? "Адрес клуба в Langame выключен в настройках."
              : "Адрес клуба не добавлен в настройки подключения.",
        };
      }

      const job = latestJobs.get(domain) ?? null;
      const lastLoadedAt = source.lastSyncedAt;

      if (!job) {
        return {
          storeId: store.id,
          storeName: store.name,
          domain,
          state: lastLoadedAt ? "OK" : "WAITING",
          lastLoadedAt,
          note: null,
        };
      }

      return {
        storeId: store.id,
        storeName: store.name,
        domain,
        state:
          job.status === "SUCCESS"
            ? "OK"
            : job.status === "PARTIAL"
              ? "PARTIAL"
              : "FAILED",
        lastLoadedAt,
        note:
          job.status === "SUCCESS"
            ? null
            : job.status === "PARTIAL"
              ? "Часть разделов не загрузилась, остальные данные свежие."
              : "Последняя загрузка не удалась, показаны прошлые данные.",
      };
    })
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "ru"));
}

/** One line above the table: is everything fine. */
export function langameConnectionVerdict(
  hasApiKey: boolean,
  clubs: LangameClubConnection[],
) {
  if (!hasApiKey) {
    return {
      tone: "danger" as const,
      text: "Ключ доступа Langame не задан, данные клубов не загружаются.",
    };
  }

  if (clubs.length === 0) {
    return {
      tone: "warning" as const,
      text: "В сети пока нет клубов, подключённых к Langame.",
    };
  }

  const problems = clubs.filter((club) => club.state !== "OK").length;

  if (problems === 0) {
    return {
      tone: "good" as const,
      text: "Все клубы подключены, данные приходят.",
    };
  }

  return {
    tone: "warning" as const,
    text: `Нужна проверка: ${problems} из ${clubs.length} клубов.`,
  };
}
