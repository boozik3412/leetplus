"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  ADMIN_RATING_ADJUSTMENTS_URL,
  ADMIN_RATING_RULE_POINTS,
  adminRatingCancelUrl,
  type AdminRatingAdjustmentBody,
  type AdminRatingItem,
} from "@/lib/staff-admin-rating";

/**
 * Reviewer decisions on the administrator rating: forgive one penalty item,
 * cancel a decision, give a bonus or a penalty. Shown only when the API says
 * the viewer may adjust (canAdjust).
 */

async function send(url: string, body?: AdminRatingAdjustmentBody) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(data?.message)
      ? data?.message.join(", ")
      : data?.message;
    throw new Error(message || "Не удалось сохранить решение");
  }
}

function useDecisionRequest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, body?: AdminRatingAdjustmentBody) {
    setPending(true);
    setError(null);
    try {
      await send(url, body);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run };
}

const linkButton =
  "rounded text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 dark:text-emerald-300";
const primaryButton =
  "inline-flex min-h-9 items-center rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-950";

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
      {error}
    </p>
  );
}

/** «Простить» on a penalty item: asks for the reason first. */
export function ForgiveItemControl({
  userId,
  item,
}: {
  userId: string;
  item: AdminRatingItem;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useDecisionRequest();
  const inputId = useId();

  if (!item.targetId) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={linkButton}
        onClick={() => setOpen(true)}
      >
        Простить
      </button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item.targetId) return;
    const ok = await run(ADMIN_RATING_ADJUSTMENTS_URL, {
      userId,
      kind: "FORGIVE",
      targetKind: item.kind,
      targetId: item.targetId,
      reason: reason.trim(),
    });
    if (ok) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900/70 dark:bg-emerald-500/10"
    >
      <label htmlFor={inputId} className="text-xs font-semibold">
        Почему прощаете? Причину увидят в разборе балла
      </label>
      <input
        id={inputId}
        className={`${inputClass} mt-1`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        required
        autoFocus
        placeholder="Например: ждали поставку, согласовано со мной"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButton}
          disabled={pending || !reason.trim()}
        >
          {pending ? "Сохраняю…" : `Простить ${Math.abs(item.basePoints)}`}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Отмена
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

/** «Вернуть» a forgiven item or «Отменить» a bonus / penalty. */
export function CancelDecisionButton({
  adjustmentId,
  label,
}: {
  adjustmentId: string;
  label: string;
}) {
  const { pending, error, run } = useDecisionRequest();

  return (
    <span>
      <button
        type="button"
        className={linkButton}
        disabled={pending}
        onClick={() => void run(adminRatingCancelUrl(adjustmentId))}
      >
        {pending ? "Отменяю…" : label}
      </button>
      <ErrorText error={error} />
    </span>
  );
}

function todayInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** «Изменить балл»: a bonus or a penalty of 1–10 points with a reason. */
export function AdjustScoreForm({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const max = ADMIN_RATING_RULE_POINTS.adjustmentMaxPoints;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"BONUS" | "PENALTY">("BONUS");
  const [points, setPoints] = useState(5);
  const [date, setDate] = useState(todayInput);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useDecisionRequest();
  const formId = useId();

  if (!open) {
    return (
      <button
        type="button"
        className={`${secondaryButton} mt-3`}
        onClick={() => setOpen(true)}
      >
        Изменить балл
      </button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(ADMIN_RATING_ADJUSTMENTS_URL, {
      userId,
      kind,
      points,
      reason: reason.trim(),
      occurredAt: date,
    });
    if (ok) {
      setOpen(false);
      setReason("");
      setPoints(5);
    }
  }

  const clamp = (value: number) => Math.max(1, Math.min(max, value));

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${formId}-title`}
      className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <h4 id={`${formId}-title`} className="text-sm font-semibold">
        Изменить балл · {name}
      </h4>
      <div
        role="radiogroup"
        aria-label="Что сделать"
        className="mt-2 inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
      >
        {(
          [
            ["BONUS", "Поощрить"],
            ["PENALTY", "Снизить"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={[
              "min-h-8 rounded px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
              kind === value
                ? value === "BONUS"
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white"
                : "text-zinc-600 dark:text-zinc-300",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <span id={`${formId}-points`} className="block text-xs text-zinc-500">
            Баллы
          </span>
          <div
            className="mt-1 inline-flex items-center gap-1"
            role="group"
            aria-labelledby={`${formId}-points`}
          >
            <button
              type="button"
              className={secondaryButton}
              aria-label="Меньше"
              onClick={() => setPoints((value) => clamp(value - 1))}
              disabled={points <= 1}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={max}
              value={points}
              onChange={(event) =>
                setPoints(clamp(Math.round(Number(event.target.value) || 1)))
              }
              aria-labelledby={`${formId}-points`}
              className={`${inputClass} w-16 text-center tabular-nums`}
            />
            <button
              type="button"
              className={secondaryButton}
              aria-label="Больше"
              onClick={() => setPoints((value) => clamp(value + 1))}
              disabled={points >= max}
            >
              +
            </button>
          </div>
        </div>
        <label className="block text-xs text-zinc-500">
          Дата
          <input
            type="date"
            value={date}
            max={todayInput()}
            onChange={(event) => setDate(event.target.value)}
            className={`${inputClass} mt-1 w-40`}
            required
          />
        </label>
      </div>
      <label className="mt-3 block text-xs text-zinc-500">
        Причина (обязательно)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          required
          rows={2}
          className={`${inputClass} mt-1 min-h-14`}
          placeholder={
            kind === "BONUS"
              ? "Например: вышла на подмену в ночь"
              : "Например: жалоба гостя на грубость"
          }
        />
      </label>
      <p className="mt-1 text-xs text-zinc-500">
        От 1 до {max} баллов за раз. Итог остаётся от 0 до 100; при равном балле
        выше тот, у кого больше поощрений.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButton}
          disabled={pending || !reason.trim()}
        >
          {pending
            ? "Сохраняю…"
            : `${kind === "BONUS" ? "Поощрить +" : "Снизить −"}${points}`}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Отмена
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
