"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type {
  StaffNotification,
  StaffNotificationSeverity,
  StaffNotificationSourceType,
  StaffNotificationStatus,
  StaffNotificationsReport,
} from "@/lib/staff-notifications";

const statusLabels: Record<StaffNotificationStatus, string> = {
  OPEN: "Новые",
  ACKNOWLEDGED: "Приняты",
  RESOLVED: "Закрыты",
};

const severityLabels: Record<StaffNotificationSeverity, string> = {
  INFO: "Инфо",
  WARNING: "Важно",
  CRITICAL: "Критично",
};

const sourceLabels: Record<StaffNotificationSourceType, string> = {
  TASK: "Задача",
  CHECKLIST: "Чек-лист",
  RECURRING_RULE: "Регулярное правило",
  TEAM_CHAT: "Командный чат",
  KNOWLEDGE_BASE: "База знаний",
  OPERATIONS_DASHBOARD: "Опер. дашборд",
};

const NOTIFICATION_DISPLAY_TIME_ZONE = "Asia/Yekaterinburg";

export function StaffNotificationsWorkspace({
  report,
}: {
  report: StaffNotificationsReport;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function syncSignals() {
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/staff/notifications/sync-signals", {
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось обновить сигналы.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { activeSignals?: number; resolvedStale?: number }
      | null;
    setSuccess(
      `Сигналы обновлены: активных ${payload?.activeSignals ?? 0}, закрыто устаревших ${payload?.resolvedStale ?? 0}.`,
    );
    startTransition(() => router.refresh());
  }

  async function mutateNotification(
    notification: StaffNotification,
    action: "acknowledge" | "resolve",
  ) {
    setError(null);
    setSuccess(null);
    const response = await fetch(
      `/api/staff/notifications/${encodeURIComponent(notification.id)}/${action}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось обновить уведомление.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Новые" value={report.summary.open} tone="emerald" />
        <MetricCard
          label="Критичные"
          value={report.summary.critical}
          tone="red"
        />
        <MetricCard label="Важные" value={report.summary.warning} tone="amber" />
        <MetricCard
          label="Приняты"
          value={report.summary.acknowledged}
          tone="zinc"
        />
        <MetricCard
          label="Закрыты"
          value={report.summary.resolved}
          tone="zinc"
        />
        <MetricCard label="Всего" value={report.summary.total} tone="zinc" />
      </div>

      <form className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-6">
        <label className="space-y-1 text-xs font-semibold uppercase text-zinc-500 md:col-span-1">
          Статус
          <select
            name="status"
            defaultValue={report.filters.status}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="all">Все</option>
            {report.statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase text-zinc-500 md:col-span-1">
          Критичность
          <select
            name="severity"
            defaultValue={report.filters.severity}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="all">Все</option>
            {report.severities.map((severity) => (
              <option key={severity} value={severity}>
                {severityLabels[severity]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase text-zinc-500 md:col-span-1">
          Источник
          <select
            name="sourceType"
            defaultValue={report.filters.sourceType}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="all">Все</option>
            {report.sourceTypes.map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {sourceLabels[sourceType]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase text-zinc-500 md:col-span-1">
          Клуб
          <select
            name="storeId"
            defaultValue={report.filters.storeId ?? ""}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Вся сеть</option>
            {report.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase text-zinc-500 md:col-span-2">
          Поиск
          <input
            name="search"
            defaultValue={report.filters.search ?? ""}
            placeholder="Название, текст или источник"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 md:col-span-6">
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Применить
          </button>
          <Link
            href="/staff/notifications"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
          >
            Сбросить
          </Link>
          <button
            type="button"
            onClick={syncSignals}
            disabled={isPending}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
          >
            Обновить сигналы
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          {success}
        </p>
      ) : null}

      <div className="space-y-3">
        {report.rows.length > 0 ? (
          report.rows.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              disabled={isPending}
              onAcknowledge={() =>
                mutateNotification(notification, "acknowledge")
              }
              onResolve={() => mutateNotification(notification, "resolve")}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            По текущим фильтрам уведомлений нет.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "amber" | "zinc";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "red"
        ? "text-red-400"
        : tone === "amber"
          ? "text-amber-400"
          : "text-zinc-950 dark:text-zinc-100";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function NotificationRow({
  notification,
  disabled,
  onAcknowledge,
  onResolve,
}: {
  notification: StaffNotification;
  disabled: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Badge tone={severityTone(notification.severity)}>
              {severityLabels[notification.severity]}
            </Badge>
            <Badge tone="zinc">{statusLabels[notification.status]}</Badge>
            <Badge tone="zinc">{sourceLabels[notification.sourceType]}</Badge>
            {notification.store ? (
              <Badge tone="zinc">{notification.store.name}</Badge>
            ) : null}
            {notification.targetUser ? (
              <Badge tone="zinc">
                {notification.targetUser.fullName ??
                  notification.targetUser.email}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-snug text-zinc-950 dark:text-zinc-100">
            {notification.title}
          </h2>
          {notification.message ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {notification.message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>Создано: {formatDateTime(notification.createdAt)}</span>
            <span>Обновлено: {formatDateTime(notification.updatedAt)}</span>
            {notification.acknowledgedByUser ? (
              <span>
                Принял:{" "}
                {notification.acknowledgedByUser.fullName ??
                  notification.acknowledgedByUser.email}
              </span>
            ) : null}
            {notification.resolvedByUser ? (
              <span>
                Закрыл:{" "}
                {notification.resolvedByUser.fullName ??
                  notification.resolvedByUser.email}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {notification.actionHref ? (
            <Link
              href={notification.actionHref}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              {notification.actionLabel ?? "Открыть"}
            </Link>
          ) : null}
          {notification.status === "OPEN" ? (
            <button
              type="button"
              onClick={onAcknowledge}
              disabled={disabled}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Принять
            </button>
          ) : null}
          {notification.status !== "RESOLVED" ? (
            <button
              type="button"
              onClick={onResolve}
              disabled={disabled}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              Закрыть
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "emerald" | "red" | "amber" | "zinc";
}) {
  const className =
    tone === "red"
      ? "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-300"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
        : tone === "emerald"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function severityTone(severity: StaffNotificationSeverity) {
  if (severity === "CRITICAL") {
    return "red";
  }

  if (severity === "WARNING") {
    return "amber";
  }

  return "emerald";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NOTIFICATION_DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}
