"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LEADERBOARD_BOARD_LABELS,
  formatFormula,
  formatLeaderboardValue,
  type GuestLeaderboardBoard,
} from "@/lib/guest-leaderboard";

type Prize =
  | { kind: "BONUS"; amount: number }
  | { kind: "LOOT_BOX"; lootBoxId: string }
  | { kind: "CUSTOM"; label: string };

type Config = {
  version: 1;
  networkEnabled: boolean;
  disabledStoreIds: string[];
  boards: Record<GuestLeaderboardBoard, boolean>;
  formula: {
    hourPoints: number;
    questPoints: number;
    casePoints: number;
    checkInPoints: number;
  };
  prizes: Record<string, Partial<Record<GuestLeaderboardBoard, Array<Prize | null>>>>;
  excludedProfileIds: string[];
};

type Settings = {
  enabled: boolean;
  revision: number;
  updatedAt: string | null;
  config: Config;
  stores: Array<{ id: string; name: string; timeZone: string | null }>;
  lootBoxes: Array<{ id: string; name: string; status: string }>;
  networkTimeZone: string;
};

type Standings = {
  scopeKey: string;
  board: GuestLeaderboardBoard;
  period: { key: string; label: string; resultsLabel: string; daysLeft: number };
  totalPlayers: number;
  rows: Array<{
    rank: number;
    profileId: string;
    publicName: string;
    displayName: string | null;
    contactMasked: string | null;
    hasNickname: boolean;
    value: number;
    storeName: string | null;
  }>;
  excluded: Array<{
    profileId: string;
    displayName: string | null;
    contactMasked: string | null;
  }>;
};

const BOARDS: GuestLeaderboardBoard[] = ["points", "hours", "sessions", "quests", "cases"];
const BOARD_HINTS: Record<GuestLeaderboardBoard, string> = {
  points: "главная · очки по формуле",
  hours: "главная · время в игре",
  sessions: "сессии от 30 минут",
  quests: "задания и шаги Battle Pass",
  cases: "открытые кейсы",
};
const NETWORK = "network";
const API = "/api/guests/gamification/leaderboard";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  if (!response.ok) {
    let message = "Запрос не выполнен.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
      if (Array.isArray(payload.message)) message = payload.message.join(" ");
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function Card({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h3>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Switch({
  checked,
  label,
  hint,
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span>
        <span className="block text-sm font-medium text-zinc-950 dark:text-white">{label}</span>
        {hint ? (
          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="h-5 w-9 shrink-0 cursor-pointer accent-emerald-600"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function prizeKind(prize: Prize | null | undefined) {
  return prize?.kind ?? "NONE";
}

function PrizeEditor({
  prize,
  lootBoxes,
  label,
  onChange,
}: {
  prize: Prize | null;
  lootBoxes: Settings["lootBoxes"];
  label: string;
  onChange: (prize: Prize | null) => void;
}) {
  const kind = prizeKind(prize);
  const inputClass =
    "min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white";

  return (
    <div className="grid gap-2">
      <select
        aria-label={`${label}: тип приза`}
        className={inputClass}
        value={kind}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "NONE") onChange(null);
          if (next === "BONUS") onChange({ kind: "BONUS", amount: 500 });
          if (next === "LOOT_BOX") {
            onChange({ kind: "LOOT_BOX", lootBoxId: lootBoxes[0]?.id ?? "" });
          }
          if (next === "CUSTOM") onChange({ kind: "CUSTOM", label: "" });
        }}
      >
        <option value="NONE">— не задан</option>
        <option value="BONUS">Бонусы</option>
        <option value="LOOT_BOX" disabled={lootBoxes.length === 0}>
          Кейс
        </option>
        <option value="CUSTOM">Свой приз</option>
      </select>
      {prize?.kind === "BONUS" ? (
        <input
          type="number"
          min={1}
          step={1}
          aria-label={`${label}: сумма бонусов`}
          className={inputClass}
          value={prize.amount}
          onChange={(event) =>
            onChange({ kind: "BONUS", amount: Math.max(0, Math.round(Number(event.target.value) || 0)) })
          }
        />
      ) : null}
      {prize?.kind === "LOOT_BOX" ? (
        <select
          aria-label={`${label}: кейс`}
          className={inputClass}
          value={prize.lootBoxId}
          onChange={(event) => onChange({ kind: "LOOT_BOX", lootBoxId: event.target.value })}
        >
          {lootBoxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
              {box.status !== "ACTIVE" ? ` (${box.status.toLowerCase()})` : ""}
            </option>
          ))}
        </select>
      ) : null}
      {prize?.kind === "CUSTOM" ? (
        <input
          type="text"
          maxLength={80}
          placeholder="Например, 2 часа игры"
          aria-label={`${label}: текст приза`}
          className={inputClass}
          value={prize.label}
          onChange={(event) => onChange({ kind: "CUSTOM", label: event.target.value })}
        />
      ) : null}
    </div>
  );
}

export function GuestGamificationLeaderboardTab({
  canManage,
}: {
  canManage: boolean;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; config: Config } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    pending: boolean;
    message: string | null;
    error: boolean;
  }>({ pending: false, message: null, error: false });
  const [prizeScope, setPrizeScope] = useState(NETWORK);

  // `keepDraft`: a moderation action changed only the exclusions and the
  // revision; unsaved edits of the form stay.
  const [reloadRequest, setReloadRequest] = useState({ nonce: 0, keepDraft: false });
  const load = useCallback((keepDraft = false) => {
    setReloadRequest((current) => ({ nonce: current.nonce + 1, keepDraft }));
  }, []);

  useEffect(() => {
    let active = true;
    requestJson<Settings>(`${API}/settings`)
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setDraft((current) =>
          reloadRequest.keepDraft && current
            ? {
                ...current,
                config: {
                  ...current.config,
                  excludedProfileIds: next.config.excludedProfileIds,
                },
              }
            : { enabled: next.enabled, config: next.config },
        );
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Не удалось загрузить настройки.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reloadRequest]);

  const dirty = useMemo(
    () =>
      Boolean(
        settings &&
          draft &&
          JSON.stringify({ enabled: settings.enabled, config: settings.config }) !==
            JSON.stringify(draft),
      ),
    [settings, draft],
  );

  function updateConfig(update: (config: Config) => Config) {
    setDraft((current) => (current ? { ...current, config: update(current.config) } : current));
    setSaveState({ pending: false, message: null, error: false });
  }

  async function save() {
    if (!settings || !draft) return;
    setSaveState({ pending: true, message: null, error: false });
    try {
      const next = await requestJson<Settings>(`${API}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: draft.enabled,
          revision: settings.revision,
          config: draft.config,
        }),
      });
      setSettings(next);
      setDraft({ enabled: next.enabled, config: next.config });
      setSaveState({ pending: false, message: "Настройки сохранены.", error: false });
    } catch (error) {
      setSaveState({
        pending: false,
        message: error instanceof Error ? error.message : "Не удалось сохранить.",
        error: true,
      });
    }
  }

  if (loadError && !settings) {
    return (
      <div
        role="alert"
        className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200"
      >
        <p className="font-semibold">Настройки рейтинга недоступны</p>
        <p className="mt-1">{loadError}</p>
        <button type="button" onClick={() => load()} className="mt-3 font-semibold underline underline-offset-4">
          Повторить
        </button>
      </div>
    );
  }

  if (!settings || !draft) {
    return <div className="mt-6 h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />;
  }

  const config = draft.config;
  const scopeOptions = [
    { key: NETWORK, label: "Сеть" },
    ...settings.stores.map((store) => ({ key: store.id, label: store.name })),
  ];
  const prizeSet = config.prizes[prizeScope] ?? {};

  function setPrize(board: GuestLeaderboardBoard, place: number, prize: Prize | null) {
    updateConfig((current) => {
      const scopeSet = { ...(current.prizes[prizeScope] ?? {}) };
      const places = [...(scopeSet[board] ?? [null, null, null])];
      places[place] = prize;
      scopeSet[board] = places;
      return { ...current, prizes: { ...current.prizes, [prizeScope]: scopeSet } };
    });
  }

  return (
    <section className="mt-6 space-y-5" aria-labelledby="leaderboard-title">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="max-w-3xl">
          <h2 id="leaderboard-title" className="text-xl font-semibold text-zinc-950 dark:text-white">
            Рейтинг гостей
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Гости видят место в своём клубе и в сети по часам, сессиям, заданиям, кейсам и общему
            зачёту. Рейтинг обнуляется 1-го числа; считается только игра после входа в игровой
            профиль, сотрудники и тестовые профили не участвуют.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-medium dark:border-zinc-800">
            <input
              type="checkbox"
              role="switch"
              className="h-5 w-9 accent-emerald-600"
              checked={draft.enabled}
              disabled={!canManage}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, enabled: event.target.checked } : current))
              }
            />
            Рейтинг включён
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canManage || !dirty || saveState.pending}
            className="min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveState.pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
        {!canManage ? (
          <p className="w-full text-sm text-zinc-600 dark:text-zinc-400">
            Изменять рейтинг может сотрудник с правом «Геймификация: правила».
          </p>
        ) : null}
        {saveState.message ? (
          <p
            role={saveState.error ? "alert" : "status"}
            className={`w-full text-sm ${saveState.error ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}
          >
            {saveState.message}
          </p>
        ) : null}
      </header>

      <fieldset disabled={!canManage} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <Card
        title="Где показываем рейтинг"
        description="Выключенный клуб не получает свою таблицу, но его игра продолжает считаться в рейтинге сети."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Switch
            label="Рейтинг сети"
            hint="все клубы вместе"
            checked={config.networkEnabled}
            onChange={(value) => updateConfig((current) => ({ ...current, networkEnabled: value }))}
          />
          {settings.stores.map((store) => (
            <Switch
              key={store.id}
              label={store.name}
              hint="рейтинг клуба"
              checked={!config.disabledStoreIds.includes(store.id)}
              onChange={(value) =>
                updateConfig((current) => ({
                  ...current,
                  disabledStoreIds: value
                    ? current.disabledStoreIds.filter((id) => id !== store.id)
                    : [...current.disabledStoreIds, store.id],
                }))
              }
            />
          ))}
        </div>
      </Card>

      <Card
        title="Таблицы"
        description="«Общий зачёт» и «Часы» — главные: их место гость видит на главном экране игры. Остальные открываются в рейтинге."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BOARDS.map((board) => (
            <Switch
              key={board}
              label={LEADERBOARD_BOARD_LABELS[board]}
              hint={BOARD_HINTS[board]}
              checked={config.boards[board]}
              onChange={(value) =>
                updateConfig((current) => ({
                  ...current,
                  boards: { ...current.boards, [board]: value },
                }))
              }
            />
          ))}
        </div>
      </Card>

      <Card
        title="Формула общего зачёта"
        description="Сколько очков даёт каждое действие. Гость видит эту формулу под таблицей."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["hourPoints", "1 час игры"],
              ["questPoints", "Задание"],
              ["casePoints", "Открытый кейс"],
              ["checkInPoints", "Чекин"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {label}
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                value={config.formula[key]}
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    formula: {
                      ...current.formula,
                      [key]: Math.max(0, Math.round(Number(event.target.value) || 0)),
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          У гостя: «Очки: {formatFormula(config.formula)}»
        </p>
      </Card>

      <Card
        title="Призы месяца"
        description="Призы за 1–3 места задаются отдельно для сети и каждого клуба. Если приз не задан, гость не видит блок призов у этой таблицы."
        aside={
          <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Для чего призы
            <select
              className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              value={prizeScope}
              onChange={(event) => setPrizeScope(event.target.value)}
            >
              {scopeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] gap-2" role="table" aria-label="Призы за места">
            <div role="row" className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-3 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              <span role="columnheader">Таблица</span>
              <span role="columnheader">1-е место</span>
              <span role="columnheader">2-е место</span>
              <span role="columnheader">3-е место</span>
            </div>
            {BOARDS.filter((board) => config.boards[board]).map((board) => (
              <div
                key={board}
                role="row"
                className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] items-start gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
              >
                <span role="rowheader" className="pt-2 text-sm font-medium text-zinc-950 dark:text-white">
                  {LEADERBOARD_BOARD_LABELS[board]}
                </span>
                {[0, 1, 2].map((place) => (
                  <PrizeEditor
                    key={place}
                    label={`${LEADERBOARD_BOARD_LABELS[board]}, ${place + 1}-е место`}
                    prize={prizeSet[board]?.[place] ?? null}
                    lootBoxes={settings.lootBoxes}
                    onChange={(prize) => setPrize(board, place, prize)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      </fieldset>

      <StandingsCard
        canManage={canManage}
        stores={settings.stores}
        enabledBoards={BOARDS.filter((board) => config.boards[board])}
        onChanged={() => load(true)}
      />
    </section>
  );
}

function StandingsCard({
  canManage,
  stores,
  enabledBoards,
  onChanged,
}: {
  canManage: boolean;
  stores: Settings["stores"];
  enabledBoards: GuestLeaderboardBoard[];
  onChanged: () => void;
}) {
  const [scope, setScope] = useState(NETWORK);
  const [board, setBoard] = useState<GuestLeaderboardBoard>("points");
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams({ scope, board });
    requestJson<Standings>(`${API}/standings?${search.toString()}`)
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить места.");
        }
      });
    return () => {
      active = false;
    };
  }, [scope, board, reload]);

  async function act(profileId: string, path: string, body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setPendingId(profileId);
    try {
      await requestJson(`${API}/profiles/${encodeURIComponent(profileId)}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      setReload((value) => value + 1);
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Действие не выполнено.");
    } finally {
      setPendingId(null);
    }
  }

  const selectClass =
    "min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white";

  return (
    <Card
      title={data ? `Сейчас · ${data.period.label}` : "Сейчас"}
      description={
        data
          ? `Итоги ${data.period.resultsLabel}. Игроков в таблице: ${data.totalPlayers}. Исключённый игрок не виден в таблицах и не получает призы.`
          : undefined
      }
      aside={
        <div className="flex flex-wrap gap-2">
          <select aria-label="Сеть или клуб" className={selectClass} value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value={NETWORK}>Сеть</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Таблица"
            className={selectClass}
            value={board}
            onChange={(event) => setBoard(event.target.value as GuestLeaderboardBoard)}
          >
            {(enabledBoards.length ? enabledBoards : BOARDS).map((item) => (
              <option key={item} value={item}>
                {LEADERBOARD_BOARD_LABELS[item]}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {data && data.rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">В этом месяце в таблице пока никого нет.</p>
      ) : null}
      {data && data.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Место</th>
                <th className="py-2 pr-3 font-semibold">Гость видит</th>
                <th className="py-2 pr-3 font-semibold">Профиль</th>
                <th className="py-2 pr-3 font-semibold">Клуб</th>
                <th className="py-2 pr-3 font-semibold">Результат</th>
                {canManage ? <th className="py-2 font-semibold">Модерация</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.profileId} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-3 font-semibold">{row.rank}</td>
                  <td className="py-2 pr-3">{row.publicName}</td>
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                    {row.displayName ?? "—"} {row.contactMasked ? `· ${row.contactMasked}` : ""}
                  </td>
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">{row.storeName ?? "—"}</td>
                  <td className="py-2 pr-3 font-medium">{formatLeaderboardValue(data.board, row.value)}</td>
                  {canManage ? (
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {row.hasNickname ? (
                        <button
                          type="button"
                          disabled={pendingId === row.profileId}
                          onClick={() =>
                            void act(row.profileId, "reset-nickname", undefined, `Сбросить ник «${row.publicName}»? Гость будет виден как «Игрок ••1234».`)
                          }
                          className="min-h-9 rounded-lg border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700"
                        >
                          Сбросить ник
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pendingId === row.profileId}
                        onClick={() =>
                          void act(row.profileId, "exclusion", { excluded: true }, `Исключить «${row.publicName}» из рейтинга?`)
                        }
                        className="min-h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                      >
                        Исключить
                      </button>
                    </div>
                  </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.excluded.length ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Исключены из рейтинга</h4>
          <ul className="mt-2 grid gap-2">
            {data.excluded.map((row) => (
              <li
                key={row.profileId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span>
                  {row.displayName ?? "Без имени"} {row.contactMasked ? `· ${row.contactMasked}` : ""}
                </span>
                <button
                  type="button"
                  disabled={!canManage || pendingId === row.profileId}
                  onClick={() => void act(row.profileId, "exclusion", { excluded: false })}
                  className="min-h-9 rounded-lg border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700"
                >
                  Вернуть в рейтинг
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
