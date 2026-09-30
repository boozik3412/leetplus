import Link from "next/link";
import type { ReactNode } from "react";
import type { GuestMetricComparison } from "@/lib/guests";
import {
  badgeToneClass,
  deltaLabel,
  deltaTone,
  type BadgeTone,
} from "@/lib/guest-insights";

/**
 * Server-safe presentational primitives for the guest CRM screens. They carry
 * no state, so the same components render on the dashboard, the guest card
 * and the full report.
 */

export function InsightBadge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        badgeToneClass(tone),
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function InsightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

export function InsightCardHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-5 text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  caption,
  comparison,
  comparisonDirection = "up-is-good",
  tone = "neutral",
  formula,
  href,
}: {
  label: string;
  value: string;
  caption?: ReactNode;
  comparison?: GuestMetricComparison | null;
  comparisonDirection?: "up-is-good" | "down-is-good";
  tone?: "neutral" | "good" | "warning" | "danger";
  formula?: string;
  href?: string;
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-300"
          : "text-zinc-950 dark:text-zinc-50";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </p>
        {formula ? (
          <span
            title={formula}
            aria-label={formula}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-[11px] font-semibold text-zinc-500 dark:border-zinc-700"
          >
            ?
          </span>
        ) : null}
      </div>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight",
          valueClass,
        ].join(" ")}
      >
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        {comparison ? (
          <InsightBadge
            tone={deltaTone(comparison, comparisonDirection)}
            title="к предыдущему периоду той же длины"
          >
            {deltaLabel(comparison)}
          </InsightBadge>
        ) : null}
        {caption ? <span className="min-w-0">{caption}</span> : null}
      </div>
    </>
  );
  const className =
    "block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-950";

  if (href) {
    return (
      <Link
        href={href}
        className={`${className} hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10`}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

export function DistributionBars({
  rows,
  emptyLabel = "Нет данных",
}: {
  rows: Array<{
    key: string;
    label: string;
    value: number;
    percent: number;
    tone: BadgeTone;
    hint?: string;
    href?: string;
  }>;
  emptyLabel?: string;
}) {
  const barToneClass: Record<BadgeTone, string> = {
    neutral: "bg-zinc-400 dark:bg-zinc-500",
    good: "bg-emerald-500",
    info: "bg-sky-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    accent: "bg-violet-500",
  };
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const content = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm ${barToneClass[row.tone]}`}
                />
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                  {row.label}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                {row.value}
                <span className="ml-1 text-xs text-zinc-400">
                  {row.percent.toLocaleString("ru-RU", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  %
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className={`h-full rounded-full ${barToneClass[row.tone]}`}
                style={{ width: `${Math.max(row.value > 0 ? 2 : 0, row.percent)}%` }}
              />
            </div>
            {row.hint ? (
              <p className="mt-1 text-xs text-zinc-500">{row.hint}</p>
            ) : null}
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="block rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              >
                {content}
              </Link>
            ) : (
              <div className="px-1 py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      {children}
    </p>
  );
}

export function PillLink({
  href,
  children,
  tone = "neutral",
  external,
}: {
  href: string;
  children: ReactNode;
  tone?: "neutral" | "accent";
  external?: boolean;
}) {
  const className =
    tone === "accent"
      ? "inline-flex h-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
      : "inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
