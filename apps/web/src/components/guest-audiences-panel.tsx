"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GuestAudience, GuestListFilters } from "@/lib/guests";

type GuestAudiencesPanelProps = {
  currentFilters: GuestListFilters;
  totalRows: number;
  audiences: GuestAudience[];
};

export function GuestAudiencesPanel({
  currentFilters,
  totalRows,
  audiences,
}: GuestAudiencesPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveAudience() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Введите название аудитории");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          filters: sanitizeFilters(currentFilters),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось сохранить аудиторию");
        return;
      }

      setName("");
      router.refresh();
    } catch {
      setError("Не удалось сохранить аудиторию");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAudience(id: string) {
    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/guests/audiences/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось удалить аудиторию");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось удалить аудиторию");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Аудитории
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Сохраненные выборки гостей
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Текущий фильтр содержит {formatNumber(totalRows)} гостей. Снимок
            сохранит состав аудитории для будущих CRM-действий.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] lg:w-[34rem]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Например: реактивация VIP"
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={saveAudience}
            disabled={isSaving}
            className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Сохраняю..." : "Сохранить аудиторию"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {audiences.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {audiences.map((audience) => (
            <article
              key={audience.id}
              className="flex min-w-0 flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {audience.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {filterSummary(audience.filters)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {formatNumber(audience.guestsCount)}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href={reportHref(audience.filters)}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                >
                  Открыть
                </Link>
                <button
                  type="button"
                  onClick={() => deleteAudience(audience.id)}
                  disabled={deletingId === audience.id}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {deletingId === audience.id ? "Удаляю..." : "Удалить"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800">
          Сохраненных аудиторий пока нет.
        </p>
      )}
    </section>
  );
}

function sanitizeFilters(filters: GuestListFilters): Omit<GuestListFilters, "page"> {
  const cleaned = { ...filters };
  delete cleaned.page;

  return cleaned;
}

function reportHref(filters: Omit<GuestListFilters, "page">) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  params.set("page", "1");

  return `/guests/report?${params.toString()}`;
}

function filterSummary(filters: Omit<GuestListFilters, "page">) {
  const parts = [
    filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} - ${filters.dateTo}`
      : null,
    filters.segment ? `сегмент: ${filters.segment}` : null,
    filters.crmStatus ? `CRM: ${filters.crmStatus}` : null,
    filters.search ? `поиск: ${filters.search}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Базовая выборка";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}
