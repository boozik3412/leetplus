"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SearchProfile = {
  profileId: string;
  guestId: string | null;
  displayName: string | null;
  contactMasked: string | null;
  externalGuestId: string | null;
  lastActivityAt: string | null;
};

type TimelineItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  description: string | null;
  status: string | null;
  happenedAt: string;
  storeId: string | null;
  storeName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  traceId: string | null;
  evaluationRunId: string | null;
  sourceHash: string | null;
  sessionExternalId: string | null;
  payload: unknown;
};

type QualitySnapshot = {
  id: string;
  measuredAt: string;
  syncLagSecondsMax: number | null;
  staleSyncCount: number;
  failedSyncCount: number;
  partialSyncCount: number;
  pendingJobCount: number;
  retryJobCount: number;
  failedJobCount: number;
  decisionRunCount: number;
  pairedDecisionCount: number;
  missingDecisionCount: number;
  mismatchedRunCount: number;
  decisionCoverage: number;
  shadowMismatchRate: number;
  confidenceCounts: Record<string, number> | null;
  syncStatusCounts: Record<string, number> | null;
  jobStatusCounts: Record<string, number> | null;
  eventMix: Record<string, number> | null;
};

type QualityAlert = {
  id: string;
  code: string;
  severity: string;
  status: string;
  message: string;
  details: unknown;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type MonitoringResponse = {
  latest: QualitySnapshot | null;
  history: QualitySnapshot[];
  alerts: QualityAlert[];
  thresholds: {
    syncLagSeconds: number;
    partialSeconds: number;
    mismatchRate: number;
  };
  staleBindings: Array<{
    id: string;
    profileId: string | null;
    displayName: string | null;
    contactMasked: string | null;
    externalDomain: string;
    externalGuestId: string;
    errorMessage: string | null;
    lastFinishedAt: string | null;
  }>;
  rollout: {
    targetSeconds: number;
    syncCleanSince: string | null;
    syncCleanSeconds: number;
    shadowQualifiedSince: string | null;
    shadowQualifiedSeconds: number;
    staleBindingCount: number;
    canaryReady: boolean;
    blockers: string[];
  };
  note: string | null;
};

type ComparisonRow = {
  ruleType: string;
  ruleId: string;
  title: string;
  triggerKind: string | null;
  sessionType: string | null;
  current: {
    status: string;
    reason: string | null;
    evidenceCount: number;
    latestAt: string | null;
    evaluationRunId: string | null;
    evaluatorVersion: string | null;
    traceId: string | null;
    source: string;
    storeId: string | null;
  };
  ledger: {
    status: string;
    reason: string | null;
    evidenceCount: number;
    evaluationRunId: string | null;
    evaluatorVersion: string | null;
    evaluatedAt: string | null;
    source: string;
    sourceFreshness: string;
    sourceFactKind: string | null;
    sourceConfidence: string | null;
    facts: Array<{
      id: string;
      factType: string;
      confidence: string | null;
      happenedAt: string | null;
      tariffName: string | null;
      tariffType: string | null;
    }>;
  };
  verdict: string;
  paired: boolean;
  differingConditions: string[];
};

type ComparisonSummary = {
  total: number;
  paired: number;
  decisionCoverage: number;
  pairCoverage: number;
  counts: Record<string, number>;
  mismatch: {
    total: number;
    byStore: Array<{ key: string; count: number }>;
    byRuleType: Array<{ key: string; count: number }>;
    bySource: Array<{ key: string; count: number }>;
    byConfidence: Array<{ key: string; count: number }>;
    byEvaluatorVersion: Array<{ key: string; count: number }>;
  };
};

type StoreOption = {
  id: string;
  name: string;
};

type LogResponse = {
  profile: {
    id: string;
    guestId: string | null;
    displayName: string | null;
    contactMasked: string | null;
    externalGuestId: string | null;
    level: number;
    xp: number;
    status: string;
    lastActivityAt: string | null;
    createdAt: string;
  };
  permissions: {
    canViewPii: boolean;
  };
  filters: {
    from: string | null;
    to: string | null;
    sort: "asc" | "desc";
    storeId: string | null;
    type: string | null;
    status: string | null;
    correlation: string | null;
    limit: number;
    stores: StoreOption[];
  };
  syncState: Record<string, unknown> | null;
  bindingRecovery: {
    status: string;
    candidates: Array<{
      guestId: string;
      externalDomain: string | null;
      externalGuestId: string | null;
      phoneMasked: string | null;
      lastActivityAt: string | null;
      lastSyncedAt: string | null;
      disabled: boolean | null;
      linkedProfileId: string | null;
    }>;
  } | null;
  gameTimeline: TimelineItem[];
  langameTimeline: TimelineItem[];
  comparison: ComparisonRow[];
  comparisonSummary: ComparisonSummary;
  retention: {
    policy: {
      rawRetentionDays: number;
      factRetentionDays: number;
      decisionRetentionDays: number;
      auditRetentionDays: number;
      liveCleanupEnabled: boolean;
      source?: string;
    };
    latestRun: {
      mode: string;
      status: string;
      candidates: unknown;
      deleted: unknown;
      startedAt: string;
      finishedAt: string | null;
      errorMessage: string | null;
    } | null;
  };
  notes: string[];
};

type TabId = "game" | "langame" | "comparison";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "game", label: "Игровой модуль" },
  { id: "langame", label: "Лог Langame" },
  { id: "comparison", label: "Сравнение проверок" },
];

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function compactJson(value: unknown) {
  if (value == null) {
    return "нет данных";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusClass(status: string | null | undefined) {
  const normalized = (status ?? "").toUpperCase();

  if (
    ["SUCCESS", "MATCH", "MATCHED", "SYNCED", "PAID", "APPROVED"].includes(
      normalized,
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  }

  if (
    ["BLOCKED", "ERROR", "FAILED", "MISMATCH", "NO_MATCH"].includes(normalized)
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200";
  }

  if (
    [
      "STARTED",
      "PARTIAL",
      "INSUFFICIENT_DATA",
      "INSUFFICIENT_SOURCE_DATA",
      "NOT_EVALUATED",
      "STALE_SOURCE",
      "STALE_BINDING",
    ].includes(normalized)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
}

async function readClientError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(", ");
    }

    return data.message ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

export function GamificationLogPanel() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [data, setData] = useState<LogResponse | null>(null);
  const [tab, setTab] = useState<TabId>("game");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [storeId, setStoreId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [correlation, setCorrelation] = useState("");
  const [limit, setLimit] = useState("100");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [relinkingGuestId, setRelinkingGuestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringResponse | null>(null);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [monitoringRefreshKey, setMonitoringRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMonitoring() {
      try {
        const response = await fetch(
          "/api/guests/gamification/log/monitoring",
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(await readClientError(response));
        }
        setMonitoring((await response.json()) as MonitoringResponse);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setMonitoringError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось загрузить мониторинг Игрового журнала",
          );
        }
      }
    }

    void loadMonitoring();
    return () => controller.abort();
  }, [monitoringRefreshKey]);

  const stores = data?.filters.stores ?? [];
  const activeTimeline =
    tab === "game" ? data?.gameTimeline : data?.langameTimeline;

  const summary = useMemo(() => {
    if (!data) {
      return null;
    }

    return {
      game: data.gameTimeline.length,
      langame: data.langameTimeline.length,
      comparison: data.comparison.length,
    };
  }, [data]);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(
        `/api/guests/gamification/log/search?q=${encodeURIComponent(search)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(await readClientError(response));
      }

      const payload = (await response.json()) as { items: SearchProfile[] };
      setResults(payload.items);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Ошибка поиска",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(profileId: string) {
    setError(null);
    setLoading(true);
    setSelectedProfileId(profileId);

    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (sort) params.set("sort", sort);
      if (storeId) params.set("storeId", storeId);
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (correlation) params.set("correlation", correlation);
      if (limit) params.set("limit", limit);

      const response = await fetch(
        `/api/guests/gamification/log/profiles/${encodeURIComponent(profileId)}?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(await readClientError(response));
      }

      setData((await response.json()) as LogResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Ошибка загрузки",
      );
    } finally {
      setLoading(false);
    }
  }

  async function syncProfile() {
    if (!selectedProfileId) {
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (storeId) params.set("storeId", storeId);
      const response = await fetch(
        `/api/guests/gamification/log/profiles/${encodeURIComponent(selectedProfileId)}/sync?${params.toString()}`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(await readClientError(response));
      }

      await loadProfile(selectedProfileId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Ошибка синхронизации",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function relinkProfile(candidateGuestId: string) {
    if (!selectedProfileId) return;
    setRelinkingGuestId(candidateGuestId);
    setError(null);

    try {
      const response = await fetch(
        `/api/guests/gamification/log/profiles/${encodeURIComponent(selectedProfileId)}/relink`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateGuestId }),
        },
      );
      if (!response.ok) {
        throw new Error(await readClientError(response));
      }
      setMonitoringRefreshKey((value) => value + 1);
      await loadProfile(selectedProfileId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Ошибка перепривязки Langame",
      );
    } finally {
      setRelinkingGuestId(null);
    }
  }

  return (
    <section className="space-y-5">
      <MonitoringPanel
        data={monitoring}
        error={monitoringError}
        onOpenProfile={(profileId) => void loadProfile(profileId)}
      />

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <form
          className="grid gap-3 lg:grid-cols-[1fr_auto]"
          onSubmit={runSearch}
        >
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Поиск гостя по телефону
            <input
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-cyan-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              minLength={3}
              placeholder="Например, 6330 или 9043180086"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="self-end rounded-lg bg-zinc-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-cyan-300 dark:text-zinc-950"
            disabled={loading}
            type="submit"
          >
            Найти
          </button>
        </form>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {results.map((profile) => (
              <button
                className={`rounded-lg border p-3 text-left transition hover:border-cyan-400 ${
                  selectedProfileId === profile.profileId
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                }`}
                key={profile.profileId}
                type="button"
                onClick={() => loadProfile(profile.profileId)}
              >
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  {profile.displayName ?? "Гость клуба"}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {profile.contactMasked ?? "телефон скрыт"}
                </div>
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  ID: {profile.externalGuestId ?? profile.profileId}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {data ? (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-300">
                  Карточка гостя
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {data.profile.displayName ?? "Гость клуба"}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{data.profile.contactMasked ?? "телефон скрыт"}</span>
                  <span>profileId: {data.profile.id}</span>
                  <span>guestId: {data.profile.guestId ?? "нет"}</span>
                  <span>Langame: {data.profile.externalGuestId ?? "нет"}</span>
                  <span>
                    активность: {formatDate(data.profile.lastActivityAt)}
                  </span>
                </div>
              </div>
              <button
                className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-800 disabled:opacity-60 dark:border-cyan-700 dark:text-cyan-200"
                disabled={syncing}
                type="button"
                onClick={syncProfile}
              >
                {syncing ? "Синхронизируем..." : "Обновить лог Langame"}
              </button>
            </div>

            {data.bindingRecovery ? (
              <BindingRecoveryPanel
                recovery={data.bindingRecovery}
                relinkingGuestId={relinkingGuestId}
                onRelink={(guestId) => void relinkProfile(guestId)}
              />
            ) : null}

            <form
              className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (selectedProfileId) {
                  loadProfile(selectedProfileId);
                }
              }}
            >
              <label className="text-xs font-semibold uppercase text-zinc-500">
                С даты
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                До даты
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                >
                  <option value="">Все клубы</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Тип
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  placeholder="LOOT_BOX_OPEN"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Статус
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  placeholder="BLOCKED"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Сортировка
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as "desc" | "asc")
                    }
                  >
                    <option value="desc">Сначала новые</option>
                    <option value="asc">Сначала старые</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Лимит
                  <input
                    className="mt-1 w-20 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                  />
                </label>
              </div>
              <label className="text-xs font-semibold uppercase text-zinc-500 md:col-span-2 xl:col-span-6">
                Корреляция
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm normal-case dark:border-zinc-800 dark:bg-zinc-900"
                  placeholder="traceId, evaluationRunId, sessionExternalId или sourceHash"
                  value={correlation}
                  onChange={(event) => setCorrelation(event.target.value)}
                />
              </label>
              <button
                className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white md:col-span-2 xl:col-span-6 dark:bg-cyan-300 dark:text-zinc-950"
                disabled={loading}
                type="submit"
              >
                Применить фильтры
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
              {tabs.map((item) => (
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    tab === item.id
                      ? "bg-zinc-950 text-white dark:bg-cyan-300 dark:text-zinc-950"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
              {summary ? (
                <div className="ml-auto text-sm text-zinc-500 dark:text-zinc-400">
                  Игровой: {summary.game} · Langame: {summary.langame} ·
                  Проверки: {summary.comparison}
                </div>
              ) : null}
            </div>

            {tab === "comparison" ? (
              <ComparisonList
                rows={data.comparison}
                summary={data.comparisonSummary}
              />
            ) : (
              <TimelineList items={activeTimeline ?? []} />
            )}
          </div>

          <RetentionPanel retention={data.retention} />

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function BindingRecoveryPanel({
  recovery,
  relinkingGuestId,
  onRelink,
}: {
  recovery: NonNullable<LogResponse["bindingRecovery"]>;
  relinkingGuestId: string | null;
  onRelink: (guestId: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-amber-200 pt-4 dark:border-amber-900">
      <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">
        Требуется перепривязка Langame
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Старый внешний ID больше не существует. Выберите актуального гостя,
        найденного по тому же защищенному номеру телефона.
      </p>
      {recovery.candidates.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {recovery.candidates.map((candidate) => {
            const unavailable = Boolean(
              candidate.disabled || candidate.linkedProfileId,
            );
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                key={candidate.guestId}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {candidate.phoneMasked ?? "телефон скрыт"} · ID{" "}
                    {candidate.externalGuestId ?? "нет"}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {candidate.externalDomain ?? "домен не указан"} · активность{" "}
                    {formatDate(candidate.lastActivityAt)}
                  </p>
                  {candidate.linkedProfileId ? (
                    <p className="mt-1 text-xs text-rose-600">
                      Уже связан с профилем {candidate.linkedProfileId}
                    </p>
                  ) : null}
                </div>
                <button
                  className="shrink-0 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-cyan-300 dark:text-zinc-950"
                  disabled={unavailable || relinkingGuestId !== null}
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Перепривязать профиль к Langame ID ${candidate.externalGuestId ?? candidate.guestId}? Старые события сохранятся в журнале.`,
                      )
                    ) {
                      onRelink(candidate.guestId);
                    }
                  }}
                >
                  {relinkingGuestId === candidate.guestId
                    ? "Привязываем..."
                    : "Выбрать"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Кандидаты пока не найдены. Сначала обновите справочник гостей Langame,
          затем повторите поиск.
        </p>
      )}
    </div>
  );
}

function MonitoringPanel({
  data,
  error,
  onOpenProfile,
}: {
  data: MonitoringResponse | null;
  error: string | null;
  onOpenProfile: (profileId: string) => void;
}) {
  if (error) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        Мониторинг Игрового журнала недоступен: {error}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        Загружаем состояние Игрового журнала...
      </section>
    );
  }

  const snapshot = data.latest;
  if (!snapshot) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {data.note ?? "Первый снимок мониторинга еще не сформирован."}
      </section>
    );
  }

  const backlog =
    snapshot.pendingJobCount + snapshot.retryJobCount + snapshot.failedJobCount;
  const confidence = Object.entries(snapshot.confidenceCounts ?? {}).sort(
    (left, right) => right[1] - left[1],
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-300">
            Качество Игрового журнала
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Синхронизация и решения за 24 часа
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Снимок: {formatDate(snapshot.measuredAt)} · история:{" "}
            {data.history.length}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(
            data.alerts.length ? "PARTIAL" : "SUCCESS",
          )}`}
        >
          {data.alerts.length
            ? `Открытых алертов: ${data.alerts.length}`
            : "Отклонений не найдено"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MonitoringMetric
          label="Максимальный лаг sync"
          value={formatDuration(snapshot.syncLagSecondsMax)}
          detail={`порог ${formatDuration(data.thresholds.syncLagSeconds)}`}
          status={snapshot.staleSyncCount ? "PARTIAL" : "SUCCESS"}
        />
        <MonitoringMetric
          label="Очередь синхронизации"
          value={String(backlog)}
          detail={`${snapshot.pendingJobCount} pending · ${snapshot.retryJobCount} retry · ${snapshot.failedJobCount} failed`}
          status={
            snapshot.failedJobCount ? "FAILED" : backlog ? "PARTIAL" : "SUCCESS"
          }
        />
        <MonitoringMetric
          label="Покрытие решений"
          value={`${Math.round(snapshot.decisionCoverage * 100)}%`}
          detail={`${snapshot.pairedDecisionCount} пар из ${snapshot.decisionRunCount} запусков`}
          status={snapshot.missingDecisionCount ? "PARTIAL" : "SUCCESS"}
        />
        <MonitoringMetric
          label="Расхождение LIVE / SHADOW"
          value={`${(snapshot.shadowMismatchRate * 100).toFixed(1)}%`}
          detail={`${snapshot.mismatchedRunCount} запусков · порог ${(data.thresholds.mismatchRate * 100).toFixed(1)}%`}
          status={
            snapshot.shadowMismatchRate > data.thresholds.mismatchRate
              ? "FAILED"
              : "SUCCESS"
          }
        />
        <MonitoringMetric
          label="Чистый shadow-период"
          value={formatDuration(data.rollout.shadowQualifiedSeconds)}
          detail={`цель ${formatDuration(data.rollout.targetSeconds)}`}
          status={data.rollout.canaryReady ? "SUCCESS" : "PARTIAL"}
        />
      </div>

      {!data.rollout.canaryReady ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="font-semibold uppercase">Блокеры canary</span>
          {data.rollout.blockers.map((blocker) => (
            <span
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              key={blocker}
            >
              {rolloutBlockerLabel(blocker)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Открытые алерты
          </p>
          {data.alerts.length ? (
            <div className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {data.alerts.map((alert) => (
                <details className="p-3" key={alert.id}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(
                            alert.severity === "CRITICAL"
                              ? "FAILED"
                              : "PARTIAL",
                          )}`}
                        >
                          {alert.severity}
                        </span>
                        <span className="text-sm font-semibold">
                          {alert.code}
                        </span>
                      </div>
                      <time className="text-xs text-zinc-500">
                        {formatDate(alert.lastSeenAt)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {alert.message}
                    </p>
                  </summary>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">
                    {compactJson({
                      occurrences: alert.occurrences,
                      firstSeenAt: alert.firstSeenAt,
                      details: alert.details,
                    })}
                  </pre>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              Активных отклонений по заданным порогам нет.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Уверенность фактов
          </p>
          <div className="mt-2 space-y-2">
            {confidence.length ? (
              confidence.map(([key, value]) => (
                <div
                  className="flex items-center justify-between border-b border-zinc-200 pb-2 text-sm last:border-0 dark:border-zinc-800"
                  key={key}
                >
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {key}
                  </span>
                  <strong>{value}</strong>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">Фактов за 24 часа нет.</p>
            )}
          </div>
        </div>
      </div>

      {data.staleBindings.length ? (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Устаревшие привязки Langame
          </p>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {data.staleBindings.map((binding) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
                key={binding.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {binding.displayName ?? "Гость клуба"} ·{" "}
                    {binding.contactMasked ?? "телефон скрыт"}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {binding.externalDomain} · ID {binding.externalGuestId}
                  </p>
                </div>
                {binding.profileId ? (
                  <button
                    className="shrink-0 rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-100"
                    type="button"
                    onClick={() => onOpenProfile(binding.profileId!)}
                  >
                    Исправить
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function rolloutBlockerLabel(value: string) {
  const labels: Record<string, string> = {
    SYNC_CLEAN_WINDOW: "14 дней без ошибок sync",
    NO_SHADOW_DECISIONS: "нет парных shadow-решений",
    DECISION_COVERAGE: "покрытие решений ниже 99.9%",
    SHADOW_MISMATCH: "расхождения выше порога",
    SHADOW_QUALIFIED_WINDOW: "shadow-окно короче 14 дней",
    STALE_BINDINGS: "есть устаревшие привязки",
  };
  return labels[value] ?? value;
}

function MonitoringMetric({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
        <span
          className={`mt-0.5 size-2 shrink-0 rounded-full border ${statusClass(status)}`}
          aria-label={status}
        />
      </div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds == null) {
    return "нет данных";
  }

  if (seconds < 60) {
    return `${seconds} сек`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} мин`;
  }

  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function RetentionPanel({
  retention,
}: {
  retention: LogResponse["retention"];
}) {
  const policy = retention.policy;
  const run = retention.latestRun;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Хранение Игрового журнала
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Raw: {policy.rawRetentionDays} дней · факты:{" "}
            {policy.factRetentionDays} · решения: {policy.decisionRetentionDays}{" "}
            · audit: {policy.auditRetentionDays}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(
            policy.liveCleanupEnabled ? "SUCCESS" : "PARTIAL",
          )}`}
        >
          {policy.liveCleanupEnabled
            ? "LIVE разрешен tenant-политикой"
            : "только dry-run"}
        </span>
      </div>
      {run ? (
        <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <summary className="cursor-pointer text-sm font-semibold">
            Последний запуск: {run.mode} · {run.status} ·{" "}
            {formatDate(run.startedAt)}
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">
            {compactJson({
              candidates: run.candidates,
              deleted: run.deleted,
              finishedAt: run.finishedAt,
              errorMessage: run.errorMessage,
            })}
          </pre>
        </details>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Retention еще не запускался. После миграции scheduler создаст первый
          безопасный dry-run отчет.
        </p>
      )}
    </section>
  );
}

function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        По выбранным фильтрам событий нет.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <article
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70"
          key={`${item.source}:${item.id}`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {item.source}
                </span>
                {item.status ? (
                  <span
                    className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                ) : null}
                {item.storeName ? (
                  <span className="text-xs text-zinc-500">
                    {item.storeName}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-100">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {item.description ??
                  item.reasonText ??
                  item.entityName ??
                  item.kind}
              </p>
              {item.reasonCode ? (
                <p className="mt-2 text-xs text-zinc-500">
                  reasonCode: {item.reasonCode}
                </p>
              ) : null}
              {timelineCorrelationEntries(item).length ? (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {timelineCorrelationEntries(item).map(([label, value]) => (
                    <span key={label}>
                      {label}: <code>{value}</code>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <time className="text-sm font-medium text-zinc-500">
              {formatDate(item.happenedAt)}
            </time>
          </div>
          <details className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <summary className="cursor-pointer text-sm font-semibold">
              Payload / evidence
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
              {compactJson(item.payload)}
            </pre>
          </details>
        </article>
      ))}
    </div>
  );
}

function timelineCorrelationEntries(
  item: TimelineItem,
): Array<[string, string]> {
  return [
    ["traceId", item.traceId],
    ["evaluationRunId", item.evaluationRunId],
    ["sessionExternalId", item.sessionExternalId],
    ["sourceHash", item.sourceHash],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function ComparisonList({
  rows,
  summary,
}: {
  rows: ComparisonRow[];
  summary: ComparisonSummary;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        Нет активных правил или недостаточно данных для сравнения.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ComparisonMetric
          label="Парные проверки"
          value={`${summary.paired} / ${summary.total}`}
        />
        <ComparisonMetric
          label="Покрытие LIVE"
          value={`${Math.round(summary.decisionCoverage * 100)}%`}
        />
        <ComparisonMetric
          label="Покрытие пар"
          value={`${Math.round(summary.pairCoverage * 100)}%`}
        />
        <ComparisonMetric
          label="Расхождения"
          value={String(summary.mismatch.total)}
        />
      </div>
      {rows.map((row) => (
        <article
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70"
          key={`${row.ruleType}:${row.ruleId}`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {row.ruleType}
                </span>
                <span
                  className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.verdict)}`}
                >
                  {row.verdict}
                </span>
              </div>
              <h3 className="mt-2 text-base font-semibold">{row.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                {row.ruleId} · {row.triggerKind ?? "без события"} ·{" "}
                {row.sessionType ?? "любой тип"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Боевая логика
              </p>
              <div
                className={`mt-2 inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.current.status)}`}
              >
                {row.current.status}
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {row.current.reason}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                evidence: {row.current.evidenceCount} · latest:{" "}
                {formatDate(row.current.latestAt)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {row.current.source} · run:{" "}
                {row.current.evaluationRunId ?? "нет"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Ledger-слой Langame
              </p>
              <div
                className={`mt-2 inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.ledger.status)}`}
              >
                {row.ledger.status}
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {row.ledger.reason}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-zinc-500">
                  Факты-источники: {row.ledger.evidenceCount}
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
                  {compactJson(row.ledger.facts)}
                </pre>
              </details>
              <p className="mt-2 text-xs text-zinc-500">
                {row.ledger.source} · freshness: {row.ledger.sourceFreshness} ·
                run: {row.ledger.evaluationRunId ?? "нет"}
              </p>
            </div>
          </div>
          {row.differingConditions.length ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Отличающиеся условия: {row.differingConditions.join("; ")}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ComparisonMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
