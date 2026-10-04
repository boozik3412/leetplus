"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closureHeadline,
  closurePeriodText,
  closureStatus,
  type StoreClosure,
} from "@/lib/store-closure-state";

type ErrorResponse = { message?: string | string[] };

type Mode = "idle" | "close" | "reopen";

export type StoreClosureIntent = { mode: "close" | "reopen"; date: string };

const REASON_MAX_LENGTH = 300;

const inputClass =
  "min-h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";
const buttonClass =
  "min-h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
const primaryClass =
  "min-h-10 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300";

function errorText(data: unknown) {
  const message =
    data && typeof data === "object" && "message" in data
      ? (data as ErrorResponse).message
      : null;
  if (Array.isArray(message)) return message.join(". ");
  return typeof message === "string" && message
    ? message
    : "Не удалось сохранить";
}

/**
 * Owner-declared closure of one club: mark it closed, give the day it opens
 * again, or remove a closure entered by mistake. The dashboards then stop
 * treating the closed days as a sales decline or idle computers.
 */
export function StoreClosureControl({
  storeId,
  storeName,
  today,
  closures,
  intent,
}: {
  storeId: string;
  storeName: string;
  /** Today in the club's time zone. */
  today: string;
  /** This club's closures, newest first. */
  closures: StoreClosure[];
  intent: StoreClosureIntent | null;
}) {
  const router = useRouter();
  const status = closureStatus(closures, today);
  const target = status.kind === "OPEN" ? null : status.closure;
  const startMode: Mode =
    intent?.mode === "close" && status.kind === "OPEN"
      ? "close"
      : intent?.mode === "reopen" && status.kind === "CLOSED"
        ? "reopen"
        : "idle";
  const [mode, setMode] = useState<Mode>(startMode);
  const [date, setDate] = useState(
    startMode === "idle" ? today : (intent?.date ?? today),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function send(url: string, method: string, body?: unknown) {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        setError(errorText(await response.json().catch(() => null)));
        return false;
      }
      return true;
    } catch {
      setError("Нет связи с сервером. Повторите попытку.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved =
      mode === "close"
        ? await send(`/api/stores/${storeId}/closures`, "POST", {
            closedFrom: date,
            reason: reason.trim() || null,
          })
        : target
          ? await send(
              `/api/stores/${storeId}/closures/${target.id}`,
              "PATCH",
              { reopenedOn: date },
            )
          : false;
    if (!saved) return;
    setMode("idle");
    setReason("");
    router.refresh();
  }

  async function handleDelete(closureId: string) {
    if (confirmDelete !== closureId) {
      setConfirmDelete(closureId);
      return;
    }
    if (await send(`/api/stores/${storeId}/closures/${closureId}`, "DELETE")) {
      setConfirmDelete(null);
      router.refresh();
    }
  }

  return (
    <div
      className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/70 p-3"
      data-store-closure={storeId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Закрытие клуба
          </p>
          <p className="mt-1 text-sm text-zinc-800">
            {closureHeadline(status)}
            {target?.reason ? ` · ${target.reason}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Дни закрытия не считаются падением продаж и простоем компьютеров в
            сводке.
          </p>
        </div>
        {mode === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {status.kind === "OPEN" ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setMode("close");
                  setDate(today);
                  setError(null);
                }}
              >
                Отметить закрытым
              </button>
            ) : null}
            {status.kind === "CLOSED" ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setMode("reopen");
                  setDate(today);
                  setError(null);
                }}
              >
                Клуб открыт
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode !== "idle" ? (
        <form
          onSubmit={handleSubmit}
          className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end"
          aria-label={
            mode === "close"
              ? `Отметить клуб «${storeName}» закрытым`
              : `Клуб «${storeName}» снова открыт`
          }
        >
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            {mode === "close"
              ? "Первый день закрытия"
              : "Первый рабочий день"}
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
          </label>
          {mode === "close" ? (
            <label className="grid gap-1 text-xs font-medium text-zinc-600">
              Причина (необязательно)
              <input
                type="text"
                value={reason}
                maxLength={REASON_MAX_LENGTH}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ремонт, аренда, сезон…"
                className={inputClass}
              />
            </label>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="submit" disabled={isSubmitting} className={primaryClass}>
              {isSubmitting ? "Сохраняем…" : "Сохранить"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              className={buttonClass}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Отмена
            </button>
          </span>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {closures.length ? (
        <ul className="mt-3 grid gap-1.5 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
          {closures.slice(0, 5).map((closure) => (
            <li
              key={closure.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                {closurePeriodText(closure)}
                {closure.reason ? ` · ${closure.reason}` : ""}
              </span>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleDelete(closure.id)}
                className="min-h-8 rounded-md px-2 font-medium text-zinc-500 hover:bg-white hover:text-red-700 disabled:cursor-not-allowed"
              >
                {confirmDelete === closure.id
                  ? "Точно удалить запись?"
                  : "Удалить запись"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
