"use client";

import type { ReactNode } from "react";
import {
  formSectionClass,
  fieldClass,
  statusPillToneClasses,
} from "./constants";
import type { StatusPillTone } from "./types";

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${formSectionClass} space-y-3`}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function OptionSelect({
  options,
  value,
  onChange,
  preservedLabel,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  preservedLabel: string;
}) {
  const hasCurrentOption = options.some((option) => option.value === value);

  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {!hasCurrentOption && value ? (
        <option value={value}>
          {preservedLabel}: {value}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value || "empty"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function OptionHelp({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}

export function ToggleField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-zinc-950 dark:text-white">
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold text-zinc-950 dark:text-white">{title}</h2>
  );
}

export function StatusMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusPillTone;
}) {
  return (
    <span
      className={[
        "rounded-full px-2 py-1 text-xs font-bold ring-1",
        statusPillToneClasses[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {text}
    </div>
  );
}
