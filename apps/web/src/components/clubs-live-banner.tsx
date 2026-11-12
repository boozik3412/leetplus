"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clubFloorPlanPreviewUrl } from "@/lib/club-floor-plan-templates";
import {
  clubLiveState,
  clubLiveTotals,
  guestsLabel,
  type ClubLiveState,
} from "@/lib/club-live-summary";

export type BannerClub = { id: string; name: string; template: string };

const REFRESH_MS = 60_000;
const ROTATE_MS = 7_000;

function timeLabel(date: Date) {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * «Сейчас в клубах» on «Сводка»: a still of the hall and what Langame says
 * about the clubs right now. The numbers load after the page is shown and
 * refresh once a minute while the tab is visible, so the summary itself
 * never waits for Langame.
 */
export function ClubsLiveBanner({ clubs }: { clubs: BannerClub[] }) {
  const [states, setStates] = useState<Record<string, ClubLiveState>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState(clubs[0]?.id ?? "");
  const [autoRotate, setAutoRotate] = useState(clubs.length > 1);
  const clubIds = clubs.map((club) => club.id).join(",");
  const rootRef = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const ids = clubIds ? clubIds.split(",") : [];
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(
              `/api/stores/${encodeURIComponent(id)}/floor-plan/live`,
              { cache: "no-store", signal },
            );
            return [
              id,
              clubLiveState(response.ok ? await response.json() : null),
            ] as const;
          } catch {
            return [id, clubLiveState(null)] as const;
          }
        }),
      );
      if (!signal.aborted) {
        setStates(Object.fromEntries(results));
        setUpdatedAt(new Date());
      }
    },
    [clubIds],
  );

  useEffect(() => {
    const controller = new AbortController();
    const first = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(controller.signal);
      }
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (
      !autoRotate ||
      clubs.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      if (rootRef.current?.matches(":hover, :focus-within")) {
        return;
      }
      setSelectedId((current) => {
        const index = clubs.findIndex((club) => club.id === current);
        return clubs[(index + 1) % clubs.length]?.id ?? current;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [autoRotate, clubs]);

  if (clubs.length === 0) {
    return null;
  }

  const selected = clubs.find((club) => club.id === selectedId) ?? clubs[0];
  const loaded = updatedAt !== null;
  const totals = clubLiveTotals(
    clubs.map((club) => states[club.id]).filter(Boolean),
  );
  const visualizationHref = `/visualization?store=${encodeURIComponent(selected.id)}`;
  const headline = !loaded
    ? null
    : totals.clubs === 0
      ? "Langame сейчас не отвечает"
      : totals.guests !== null
        ? `${guestsLabel(totals.guests)} · ${totals.busy} из ${totals.total} ПК`
        : `${totals.busy} из ${totals.total} ПК заняты`;

  return (
    <section
      ref={rootRef}
      aria-label="Сейчас в клубах"
      className="relative mt-5 isolate overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#071317] text-white shadow-sm"
    >
      <Link
        href={visualizationHref}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-y-0 right-0 left-0 sm:left-[34%]"
      >
        {clubs.map((club) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={club.id}
            src={clubFloorPlanPreviewUrl(club.template)}
            alt=""
            decoding="async"
            className={[
              "absolute inset-0 h-full w-full scale-105 object-contain object-center transition-opacity duration-700 motion-reduce:transition-none sm:object-[60%_55%]",
              club.id === selected.id ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        ))}
      </Link>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#071317] via-[#071317]/85 to-[#071317]/10 sm:via-[#071317]/60 sm:to-transparent"
      />

      <div className="pointer-events-none relative flex min-h-[13rem] flex-col gap-3 p-5 sm:min-h-[13.5rem] sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-teal-200 uppercase">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Сейчас в клубах
          {updatedAt ? (
            <span className="font-normal tracking-normal text-zinc-400 normal-case">
              · {timeLabel(updatedAt)}
            </span>
          ) : null}
        </p>

        {headline ? (
          <p className="max-w-xl text-2xl leading-tight font-semibold text-balance tabular-nums sm:text-3xl">
            {headline}
          </p>
        ) : (
          <span
            aria-label="Загружаем данные клубов"
            className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none"
          />
        )}

        <div className="pointer-events-auto mt-auto flex flex-wrap items-end gap-2 sm:pr-56">
          {clubs.map((club) => {
            const state = states[club.id];
            const active = club.id === selected.id;
            return (
              <button
                key={club.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelectedId(club.id);
                  setAutoRotate(false);
                }}
                className={[
                  "inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm tabular-nums backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300",
                  active
                    ? "border-teal-300/70 bg-teal-300/15 text-white"
                    : "border-white/15 bg-white/5 text-zinc-200 hover:border-white/30 hover:bg-white/10",
                ].join(" ")}
              >
                <span className="truncate">{club.name}</span>
                <span className="shrink-0 text-zinc-300">
                  {!state
                    ? "…"
                    : state.status === "LIVE"
                      ? `${state.busy}/${state.total} ПК`
                      : "нет данных"}
                </span>
              </button>
            );
          })}
          <Link
            href={visualizationHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ffffff] px-4 text-sm font-semibold whitespace-nowrap text-[#071317] shadow-sm transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:absolute sm:right-5 sm:bottom-5"
          >
            Открыть визуализацию
            <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
