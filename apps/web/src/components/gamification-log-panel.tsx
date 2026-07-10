"use client";

import { FormEvent, useMemo, useState } from "react";

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
  payload: unknown;
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
  };
  ledger: {
    status: string;
    reason: string | null;
    evidenceCount: number;
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
    limit: number;
    stores: StoreOption[];
  };
  syncState: Record<string, unknown> | null;
  gameTimeline: TimelineItem[];
  langameTimeline: TimelineItem[];
  comparison: ComparisonRow[];
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

  if (["SUCCESS", "MATCHED", "SYNCED", "PAID", "APPROVED"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  }

  if (["BLOCKED", "FAILED", "MISMATCH", "NO_MATCH"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200";
  }

  if (["STARTED", "PARTIAL", "INSUFFICIENT_DATA", "NO_DECISION"].includes(normalized)) {
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
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [data, setData] = useState<LogResponse | null>(null);
  const [tab, setTab] = useState<TabId>("game");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [storeId, setStoreId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState("100");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stores = data?.filters.stores ?? [];
  const activeTimeline = tab === "game" ? data?.gameTimeline : data?.langameTimeline;

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
      setError(requestError instanceof Error ? requestError.message : "Ошибка поиска");
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
      setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки");
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
      setError(requestError instanceof Error ? requestError.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <form className="grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={runSearch}>
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
                  <span>активность: {formatDate(data.profile.lastActivityAt)}</span>
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
                    onChange={(event) => setSort(event.target.value as "desc" | "asc")}
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
                  Игровой: {summary.game} · Langame: {summary.langame} · Проверки: {summary.comparison}
                </div>
              ) : null}
            </div>

            {tab === "comparison" ? (
              <ComparisonList rows={data.comparison} />
            ) : (
              <TimelineList items={activeTimeline ?? []} />
            )}
          </div>

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
                  <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                    {item.status}
                  </span>
                ) : null}
                {item.storeName ? (
                  <span className="text-xs text-zinc-500">{item.storeName}</span>
                ) : null}
              </div>
              <h3 className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-100">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {item.description ?? item.reasonText ?? item.entityName ?? item.kind}
              </p>
              {item.reasonCode ? (
                <p className="mt-2 text-xs text-zinc-500">
                  reasonCode: {item.reasonCode}
                </p>
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

function ComparisonList({ rows }: { rows: ComparisonRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        Нет активных правил или недостаточно данных для сравнения.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
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
                <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.verdict)}`}>
                  {row.verdict}
                </span>
              </div>
              <h3 className="mt-2 text-base font-semibold">{row.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                {row.ruleId} · {row.triggerKind ?? "без события"} · {row.sessionType ?? "любой тип"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Боевая логика
              </p>
              <div className={`mt-2 inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.current.status)}`}>
                {row.current.status}
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {row.current.reason}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                evidence: {row.current.evidenceCount} · latest: {formatDate(row.current.latestAt)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Ledger-слой Langame
              </p>
              <div className={`mt-2 inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusClass(row.ledger.status)}`}>
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
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
