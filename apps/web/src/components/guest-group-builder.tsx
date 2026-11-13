"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultGuestGroupChoice,
  guestGroupFilters,
  guestGroupName,
  guestGroupSentence,
  guestGroupTemplate,
  guestGroupTemplates,
  type GuestGroupChoice,
} from "@/lib/guest-group-builder";
import { guestsWord, pluralize } from "@/lib/guest-insights";
import type { GuestAudience } from "@/lib/guests";

type BuilderStore = { id: string; name: string };

type BuilderStep = "who" | "where" | "consent" | "save";

const allBuilderSteps: Array<{ id: BuilderStep; label: string }> = [
  { id: "who", label: "Кого собираем" },
  { id: "where", label: "В каком клубе" },
  { id: "consent", label: "Кому можно писать" },
  { id: "save", label: "Проверить" },
];

type Counts = { all: number; consented: number } | null;

function guestsCount(value: number) {
  return pluralize(value, guestsWord);
}

async function countGuests(
  filters: ReturnType<typeof guestGroupFilters>,
  signal: AbortSignal,
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set("pageSize", "10");
  const response = await fetch(`/api/guests?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error("count failed");
  }
  const body = (await response.json()) as { totalRows?: number };
  return body.totalRows ?? 0;
}

/**
 * «Новая группа гостей» in four short steps: who, which club (skipped for a
 * single club), whom we may message, check and save. Each step is one question with a plain
 * explanation; the number of guests that fit is shown as the choice changes.
 */
export function GuestGroupBuilder({
  stores,
  defaultStoreId = "",
  onCreated,
  onCancel,
  cancelLabel = "Отмена",
}: {
  stores: BuilderStore[];
  defaultStoreId?: string;
  onCreated: (audience: GuestAudience) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [step, setStep] = useState<BuilderStep>("who");
  const [choice, setChoice] = useState<GuestGroupChoice>({
    ...defaultGuestGroupChoice,
    storeId: stores.some((store) => store.id === defaultStoreId)
      ? defaultStoreId
      : "",
  });
  const [counts, setCounts] = useState<Counts>(null);
  const [countKey, setCountKey] = useState<string | null>(null);
  const [countError, setCountError] = useState(false);
  const [customName, setCustomName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName =
    stores.find((store) => store.id === choice.storeId)?.name ?? null;
  const suggestedName = guestGroupName(choice, storeName);
  const name = customName ?? suggestedName;
  const template = guestGroupTemplate(choice.template);
  // With one club there is nothing to choose, so that step is left out.
  const builderSteps =
    stores.length > 1
      ? allBuilderSteps
      : allBuilderSteps.filter((item) => item.id !== "where");
  const stepIndex = builderSteps.findIndex((item) => item.id === step);

  // Counting ignores the consent choice: both numbers come back at once, so
  // step 3 can show how many of the group may be messaged.
  const baseKey = `${choice.template}|${choice.storeId}`;
  const counting = countKey !== baseKey && !countError;
  const currentCount =
    counts && countKey === baseKey
      ? choice.onlyConsented
        ? counts.consented
        : counts.all
      : null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const base = { ...choice, onlyConsented: false };
      setCountError(false);
      Promise.all([
        countGuests(guestGroupFilters(base), controller.signal),
        countGuests(
          guestGroupFilters({ ...base, onlyConsented: true }),
          controller.signal,
        ),
      ])
        .then(([all, consented]) => {
          if (controller.signal.aborted) return;
          setCounts({ all, consented });
          setCountKey(baseKey);
        })
        .catch(() => {
          if (!controller.signal.aborted) setCountError(true);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // The key holds every input of the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const countLine = useMemo(() => {
    if (countError) return "Не удалось посчитать гостей";
    if (counting || currentCount === null) return "Считаем гостей…";
    return `Подходит: ${guestsCount(currentCount)}`;
  }, [countError, counting, currentCount]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Назовите группу");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/guests/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed.slice(0, 80),
          description: guestGroupSentence(choice, storeName).slice(0, 200),
          filters: guestGroupFilters(choice),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "Не удалось сохранить группу");
      }
      onCreated((await response.json()) as GuestAudience);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось сохранить группу",
      );
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<GuestGroupChoice>) {
    setChoice((current) => ({ ...current, ...patch }));
  }

  const nextStep = builderSteps[stepIndex + 1] ?? null;
  const previousStep = builderSteps[stepIndex - 1] ?? null;
  const emptyGroup = currentCount === 0;

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-white p-2 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-950">
        {builderSteps.map((item, index) => {
          const isActive = item.id === step;
          const isPassed = index < stepIndex;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setStep(item.id)}
                aria-current={isActive ? "step" : undefined}
                className={[
                  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition",
                  isActive
                    ? "bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-500/10"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold",
                    isActive
                      ? "bg-emerald-500 text-white"
                      : isPassed
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
                  ].join(" ")}
                >
                  {isPassed ? "✓" : index + 1}
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        {step === "who" ? (
          <div className="space-y-4">
            <StepTitle
              title="Кого собираем в группу"
              text="Выберите, каких гостей позвать. Система сама найдёт их по визитам за последние три месяца, вручную ничего отбирать не нужно."
            />
            <div
              role="radiogroup"
              aria-label="Кого собираем"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {guestGroupTemplates.map((item) => {
                const selected = item.key === choice.template;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ template: item.key })}
                    className={[
                      "flex flex-col items-start gap-1 rounded-xl border p-3 sm:min-h-24 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                      selected
                        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/70 dark:bg-emerald-500/10"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
                    ].join(" ")}
                  >
                    <strong className="text-sm">{item.title}</strong>
                    <span className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                      {item.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-white">
                Идея для кампании:
              </span>{" "}
              {template.idea}
            </p>
          </div>
        ) : null}

        {step === "where" ? (
          <div className="space-y-4">
            <StepTitle
              title="В каком клубе"
              text="Только гости выбранного клуба или вся сеть. Визиты смотрим за последние три месяца, как и во всём разделе «Гости»."
            />
            <div className="flex flex-wrap gap-2">
              {[{ id: "", name: "Вся сеть" }, ...stores].map((store) => (
                <ChoiceChip
                  key={store.id || "all"}
                  selected={choice.storeId === store.id}
                  onClick={() => update({ storeId: store.id })}
                >
                  {store.name}
                </ChoiceChip>
              ))}
            </div>
          </div>
        ) : null}

        {step === "consent" ? (
          <div className="space-y-4">
            <StepTitle
              title="Кому можно писать"
              text="Сообщения в Telegram и SMS можно отправлять только гостям, которые на это согласились. Для звонка администратора или акции в клубе подойдут все."
            />
            <div
              role="radiogroup"
              aria-label="Кому можно писать"
              className="grid gap-2 sm:grid-cols-2"
            >
              <ConsentOption
                selected={!choice.onlyConsented}
                onClick={() => update({ onlyConsented: false })}
                title="Все гости группы"
                text="Для звонков, акций в клубе и задач администратору."
                count={counts && !counting ? counts.all : null}
              />
              <ConsentOption
                selected={choice.onlyConsented}
                onClick={() => update({ onlyConsented: true })}
                title="Только с согласием на сообщения"
                text="Для рассылок в Telegram и SMS."
                count={counts && !counting ? counts.consented : null}
              />
            </div>
          </div>
        ) : null}

        {step === "save" ? (
          <div className="space-y-4">
            <StepTitle
              title="Проверьте и сохраните"
              text="Группа запомнит этих гостей на сегодня и сама не обновляется. Её можно выбрать в кампании или промо-наборе."
            />
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-3xl font-semibold tabular-nums">
                {currentCount === null ? "…" : guestsCount(currentCount)}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {guestGroupSentence(choice, storeName)}
              </p>
              {emptyGroup ? (
                <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  Под эти условия сейчас никто не подходит. Вернитесь назад и
                  выберите другой период, клуб или группу.
                </p>
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Название группы
              </span>
              <input
                value={name}
                onChange={(event) => setCustomName(event.target.value)}
                maxLength={80}
                className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
            </label>
          </div>
        ) : null}
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {previousStep ? (
            <button
              type="button"
              onClick={() => setStep(previousStep.id)}
              className="min-h-10 rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Назад
            </button>
          ) : onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-10 rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {cancelLabel}
            </button>
          ) : null}
          <span
            aria-live="polite"
            className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400"
          >
            {countLine}
          </span>
        </div>
        {nextStep ? (
          <button
            type="button"
            onClick={() => setStep(nextStep.id)}
            className="min-h-10 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            Далее: {nextStep.label}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || emptyGroup || currentCount === null}
            className="min-h-10 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить группу"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {text}
      </p>
    </div>
  );
}

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "min-h-10 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        selected
          ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/70 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ConsentOption({
  selected,
  onClick,
  title,
  text,
  count,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text: string;
  count: number | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={[
        "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        selected
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/70 dark:bg-emerald-500/10"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      <strong className="text-sm">{title}</strong>
      <span className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        {text}
      </span>
      <span className="mt-1 text-lg font-semibold tabular-nums">
        {count === null ? "…" : guestsCount(count)}
      </span>
    </button>
  );
}
