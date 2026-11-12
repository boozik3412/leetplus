"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreFields } from "@/components/more-fields";
import type { GuestDashboardRow, GuestListResponse } from "@/lib/guests";
import type {
  MarketingMission,
  MarketingMissionReward,
  MarketingMissionRewardStatus,
} from "@/lib/marketing";
import {
  buildRewardReasons,
  rewardReasonPreset,
  type RewardReason,
} from "@/lib/manual-rewards";

type Props = {
  missions: MarketingMission[];
  rewards: MarketingMissionReward[];
  canCreateGameMissions: boolean;
};

type GuestCandidate = Pick<
  GuestDashboardRow,
  | "id"
  | "displayName"
  | "contact"
  | "externalDomain"
  | "externalGuestId"
  | "primaryStoreName"
  | "lastActivityAt"
>;

type ListFilter = "open" | "all";

const fieldClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

const statusLabels: Record<MarketingMissionRewardStatus, string> = {
  PENDING: "к выдаче",
  APPROVED: "к выдаче",
  PAID: "выдано",
  CANCELED: "отменено",
};

const statusTone: Record<MarketingMissionRewardStatus, string> = {
  PENDING:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  APPROVED:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  CANCELED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

function isOpen(reward: MarketingMissionReward) {
  return reward.status === "PENDING" || reward.status === "APPROVED";
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = Array.isArray(body?.message)
    ? body?.message.join(", ")
    : body?.message;

  return message || fallback;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatRubles(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  )} ₽`;
}

export function ManualRewardsPanel({
  missions: initialMissions,
  rewards: initialRewards,
  canCreateGameMissions,
}: Props) {
  const [missions, setMissions] = useState(initialMissions);
  const [rewards, setRewards] = useState(initialRewards);
  const reasons = useMemo(() => buildRewardReasons(missions), [missions]);

  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    query: string;
    rows: GuestCandidate[];
    error: string | null;
  } | null>(null);
  const [guest, setGuest] = useState<GuestCandidate | null>(null);
  const [rewardLabel, setRewardLabel] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [reasonKey, setReasonKey] = useState(reasons[0]?.key ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("open");

  const openCount = rewards.filter(isOpen).length;
  const visibleRewards = useMemo(
    () => (filter === "open" ? rewards.filter(isOpen) : rewards),
    [filter, rewards],
  );

  const searchQuery = guest ? "" : query.trim();
  const searchActive = searchQuery.length >= 3;
  const currentResult =
    searchActive && searchResult?.query === searchQuery ? searchResult : null;
  const candidates = currentResult?.rows ?? [];
  const searchError = currentResult?.error ?? null;
  const searching = searchActive && !currentResult;

  useEffect(() => {
    if (searchQuery.length < 3) return;

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          search: searchQuery,
          pageSize: "10",
        });
        const response = await fetch(`/api/guests?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Нет доступа к списку гостей. Попросите владельца выдать доступ к разделу «Гости»."
              : await readError(response, "Не удалось найти гостя"),
          );
        }

        const body = (await response.json()) as GuestListResponse;
        setSearchResult({ query: searchQuery, rows: body.rows, error: null });
      } catch (caught) {
        setSearchResult({
          query: searchQuery,
          rows: [],
          error:
            caught instanceof Error ? caught.message : "Не удалось найти гостя",
        });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  async function reload() {
    const [missionsResponse, rewardsResponse] = await Promise.all([
      fetch("/api/marketing/promo-scenarios", { cache: "no-store" }),
      fetch("/api/marketing/promo-scenario-rewards", { cache: "no-store" }),
    ]);

    if (!missionsResponse.ok || !rewardsResponse.ok) {
      throw new Error("Не удалось обновить список наград");
    }

    setMissions((await missionsResponse.json()) as MarketingMission[]);
    setRewards((await rewardsResponse.json()) as MarketingMissionReward[]);
  }

  async function resolveMissionId(reason: RewardReason) {
    if (reason.missionId) return reason.missionId;

    const preset = rewardReasonPreset(reason.missionType);
    const response = await fetch("/api/marketing/promo-scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: reason.label,
        status: "ACTIVE",
        missionType: preset.missionType,
        triggerKind: "MANUAL",
        rewardType: "MANUAL",
        manualApprovalRequired: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await readError(response, "Не удалось сохранить основание"),
      );
    }

    return ((await response.json()) as MarketingMission).id;
  }

  async function issueReward(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const reason = reasons.find((item) => item.key === reasonKey);

    if (!guest) {
      setError("Выберите гостя: найдите его по телефону или имени.");
      return;
    }
    if (!rewardLabel.trim()) {
      setError("Напишите, какую награду выдаёте, например «500 бонусов».");
      return;
    }
    if (!reason) {
      setError("Выберите основание.");
      return;
    }

    setSaving(true);

    try {
      const missionId = await resolveMissionId(reason);
      const response = await fetch("/api/marketing/promo-scenario-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          guestId: guest.id,
          guestExternalId: guest.externalGuestId,
          externalDomain: guest.externalDomain,
          rewardLabel: rewardLabel.trim(),
          rewardAmount: rewardAmount.trim() || null,
          note: note.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readError(response, "Не удалось добавить награду"),
        );
      }

      await reload();
      setNotice(
        `Награда добавлена: ${guest.displayName}. Начислите её в Langame и отметьте «Выдано».`,
      );
      setGuest(null);
      setQuery("");
      setRewardLabel("");
      setRewardAmount("");
      setNote("");
      setFilter("open");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(
    reward: MarketingMissionReward,
    status: MarketingMissionRewardStatus,
  ) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/marketing/promo-scenario-rewards/${encodeURIComponent(reward.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readError(response, "Не удалось обновить статус"),
        );
      }

      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка статуса");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-black tracking-normal text-zinc-950 dark:text-white">
          Ручные награды
        </h1>
        <p className="max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
          Награды, которые нельзя проверить автоматически: гость привёл друга,
          выиграл турнир, отмечает день рождения. Администратор добавляет
          награду здесь, начисляет её в Langame и отмечает «Выдано».
        </p>
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Покупка в баре, визиты, игровые часы и пополнения видны в Langame.
            За них награду начисляет игровой модуль сам, через задания.
          </p>
          {canCreateGameMissions ? (
            <Link
              href="/gamification/missions/wizard"
              className="shrink-0 cursor-pointer rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-500 dark:hover:text-zinc-950"
            >
              Создать задание
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form
          onSubmit={issueReward}
          className="space-y-4 self-start rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-lg font-black text-zinc-950 dark:text-white">
            Выдать награду
          </h2>

          <div className="space-y-1.5">
            <label
              htmlFor="reward-guest"
              className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"
            >
              Гость
            </label>
            {guest ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    {guest.displayName}
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-300">
                    {[guest.contact, guest.primaryStoreName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGuest(null)}
                  className="shrink-0 cursor-pointer rounded text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
                >
                  Изменить
                </button>
              </div>
            ) : (
              <>
                <input
                  id="reward-guest"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Телефон, имя или ID в Langame"
                  aria-describedby="reward-guest-help"
                  className={fieldClass}
                />
                <p
                  id="reward-guest-help"
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {searching
                    ? "Ищем…"
                    : (searchError ??
                      (candidates.length > 0
                        ? "Выберите гостя из списка."
                        : query.trim().length >= 3
                          ? "Никого не нашли. Проверьте номер целиком, с 7 или 8 в начале."
                          : "Введите хотя бы 3 символа."))}
                </p>
                {candidates.length > 0 ? (
                  <ul className="max-h-64 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => setGuest(candidate)}
                          className="flex w-full cursor-pointer flex-col items-start px-3 py-2 text-left text-sm transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                        >
                          <span className="font-semibold text-zinc-950 dark:text-white">
                            {candidate.displayName}
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-300">
                            {[
                              candidate.contact,
                              candidate.primaryStoreName,
                              candidate.lastActivityAt
                                ? `был ${formatDate(candidate.lastActivityAt)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reward-label"
              className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"
            >
              Награда
            </label>
            <input
              id="reward-label"
              value={rewardLabel}
              onChange={(event) => setRewardLabel(event.target.value)}
              placeholder="500 бонусов"
              maxLength={160}
              className={fieldClass}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reward-reason"
              className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"
            >
              Основание
            </label>
            <select
              id="reward-reason"
              value={reasonKey}
              onChange={(event) => setReasonKey(event.target.value)}
              className={fieldClass}
            >
              {reasons.map((reason) => (
                <option key={reason.key} value={reason.key}>
                  {reason.label}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Комментарий к основанию"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Комментарий: кого привёл, какой турнир"
              rows={2}
              maxLength={2000}
              className={fieldClass}
            />
          </div>

          <MoreFields>
            <div className="space-y-1.5">
              <label
                htmlFor="reward-amount"
                className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"
              >
                Во сколько обходится сети, ₽
              </label>
              <input
                id="reward-amount"
                inputMode="decimal"
                value={rewardAmount}
                onChange={(event) => setRewardAmount(event.target.value)}
                placeholder="Например, 300"
                aria-describedby="reward-amount-help"
                className={fieldClass}
              />
              <p
                id="reward-amount-help"
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                Нужно для учёта бюджета на награды. Можно не заполнять.
              </p>
            </div>
          </MoreFields>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
            >
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Добавить к выдаче"}
          </button>
        </form>

        <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-zinc-950 dark:text-white">
              Выдачи
            </h2>
            <div
              role="group"
              aria-label="Какие награды показать"
              className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
            >
              {(
                [
                  ["open", `К выдаче · ${openCount}`],
                  ["all", `Все · ${rewards.length}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    filter === value
                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white"
                      : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleRewards.length > 0 ? (
            <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
              {visibleRewards.map((reward) => (
                <li
                  key={reward.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      {reward.rewardLabel}
                      {reward.rewardAmount > 0 ? (
                        <span className="ml-2 font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatRubles(reward.rewardAmount)}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-zinc-700 dark:text-zinc-200">
                      {reward.guest?.displayName ??
                        reward.guestExternalId ??
                        "Гость не указан"}
                      {reward.guest?.phoneMasked
                        ? ` · ${reward.guest.phoneMasked}`
                        : ""}
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {reward.mission.name}
                      {reward.note ? ` · ${reward.note}` : ""} ·{" "}
                      {formatDate(reward.createdAt)}
                      {reward.createdBy
                        ? `, добавил ${reward.createdBy.displayName}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[reward.status]}`}
                    >
                      {statusLabels[reward.status]}
                    </span>
                    {isOpen(reward) ? (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setStatus(reward, "PAID")}
                          className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Выдано
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setStatus(reward, "CANCELED")}
                          className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-rose-400 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-rose-300"
                        >
                          Отменить
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              {filter === "open"
                ? "Все награды выданы. Новая появится здесь, когда её добавят слева."
                : "Наград пока не было. Добавьте первую в форме слева."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
