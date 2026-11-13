"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { guestGroupFiltersSummary } from "@/lib/guest-group-builder";
import { guestListHref } from "@/lib/guest-insights";
import type { GuestAudience } from "@/lib/guests";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

/**
 * «Гости → Группы»: saved guest groups as plain cards. A new group is made
 * on /guests/groups/new step by step; each card leads to a campaign for it.
 */
export function GuestGroupsList({
  audiences,
  stores,
  createdId,
  canCreateCampaign,
}: {
  audiences: GuestAudience[];
  stores: Array<{ id: string; name: string }>;
  createdId: string | null;
  canCreateCampaign: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  // A just-saved group goes first, so it is seen right after saving.
  const ordered = createdId
    ? [
        ...audiences.filter((audience) => audience.id === createdId),
        ...audiences.filter((audience) => audience.id !== createdId),
      ]
    : audiences;

  async function deleteGroup(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/guests/audiences/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error();
      }
      setConfirmId(null);
      router.refresh();
    } catch {
      setError("Не удалось удалить группу");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Группы гостей</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Группа — это список гостей, которым вы хотите что-то предложить.
            Соберите её по шагам и выберите в кампании.
          </p>
        </div>
        <Link
          href="/guests/groups/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Новая группа
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {audiences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          Групп пока нет. Начните с «Давно не приходили»: это гости, которых
          проще всего вернуть подарком или скидкой.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {ordered.map((audience) => {
            const isNew = audience.id === createdId;
            const confirming = confirmId === audience.id;
            return (
              <article
                key={audience.id}
                className={[
                  "flex min-w-0 flex-col gap-3 rounded-lg border bg-white p-4 dark:bg-zinc-950",
                  isNew
                    ? "border-emerald-400 ring-1 ring-emerald-400/50 dark:border-emerald-500/70"
                    : "border-zinc-200 dark:border-zinc-800",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold break-words">
                      {audience.name}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {guestGroupFiltersSummary(audience.filters, storeNames)}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <strong className="block text-lg font-semibold tabular-nums">
                      {formatNumber(audience.guestsCount)}
                    </strong>
                    <span className="text-xs text-zinc-500">гостей</span>
                  </span>
                </div>
                {isNew ? (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Группа сохранена
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2">
                  {canCreateCampaign ? (
                    <Link
                      href={`/marketing/new?audience=${encodeURIComponent(audience.id)}`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                    >
                      Создать кампанию
                    </Link>
                  ) : null}
                  <Link
                    href={guestListHref({ ...audience.filters, page: "1" })}
                    className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Список гостей
                  </Link>
                  {confirming ? (
                    <span className="flex w-full items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                      Удалить группу?
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="min-h-9 rounded-lg px-3 font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Нет
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGroup(audience.id)}
                          disabled={deletingId === audience.id}
                          className="min-h-9 rounded-lg bg-red-600 px-3 font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          {deletingId === audience.id ? "Удаляем…" : "Удалить"}
                        </button>
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(audience.id)}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
