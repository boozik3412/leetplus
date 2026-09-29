"use client";

import { useState } from "react";
import type { TenantAccessSummary } from "@/lib/admin-overview";

type AccessMode = "OPEN_ENDED" | "UNTIL" | "CLOSE_NOW";

type TenantAccessPanelTenant = {
  id: string;
  slug: string;
  customerStage: "INTERNAL" | "PILOT" | "BETA" | "LIVE";
  access: TenantAccessSummary;
};

const stageLabels: Record<TenantAccessPanelTenant["customerStage"], string> = {
  INTERNAL: "внутренняя сеть",
  PILOT: "пилот",
  BETA: "бета",
  LIVE: "LIVE",
};

const modeLabels: Record<AccessMode, string> = {
  OPEN_ENDED: "Бессрочно, до отдельного решения",
  UNTIL: "До даты",
  CLOSE_NOW: "Закрыть доступ сейчас",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultUntilValue(access: TenantAccessSummary) {
  const base =
    access.state === "ACTIVE_UNTIL" && access.endsAt
      ? new Date(access.endsAt)
      : new Date();

  return toDateTimeLocalValue(new Date(base.getTime() + 30 * DAY_MS));
}

function defaultMode(access: TenantAccessSummary): AccessMode {
  return access.state === "OPEN_ENDED" ? "UNTIL" : "OPEN_ENDED";
}

export function tenantAccessBadge(access: TenantAccessSummary): {
  label: string;
  className: string;
} {
  const ok =
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  const warn =
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  const bad = "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200";
  const neutral =
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";

  switch (access.state) {
    case "NOT_TIME_BOUND":
      return { label: "Доступ без срока", className: ok };
    case "OPEN_ENDED":
      return { label: "Доступ бессрочно", className: ok };
    case "ACTIVE_UNTIL":
      return {
        label: `Доступ до ${formatDateTime(access.endsAt)}`,
        className: access.daysLeft !== null && access.daysLeft <= 7 ? warn : ok,
      };
    case "EXPIRED":
      return { label: "Доступ закрыт", className: bad };
    case "NOT_STARTED":
      return { label: "Доступ ещё не начался", className: warn };
    case "NOT_CONFIGURED":
      return { label: "Срок не задан", className: neutral };
  }
}

function describeAccess(tenant: TenantAccessPanelTenant) {
  const { access } = tenant;

  switch (access.state) {
    case "NOT_TIME_BOUND":
      return `Стадия «${stageLabels[tenant.customerStage]}»: вход не ограничен сроком.`;
    case "NOT_CONFIGURED":
      return "Сеть ещё не активирована: срок доступа появится при активации.";
    case "OPEN_ENDED":
      return `Вход открыт бессрочно — до отдельного решения администратора. Действует с ${formatDateTime(access.startsAt)}.`;
    case "ACTIVE_UNTIL":
      return `Вход открыт до ${formatDateTime(access.endsAt)} (осталось ${access.daysLeft} дн.). После этого сотрудники сети не смогут войти.`;
    case "EXPIRED":
      return `Вход закрыт с ${formatDateTime(access.endsAt)}: сотрудники сети не могут авторизоваться.`;
    case "NOT_STARTED":
      return `Доступ начнётся ${formatDateTime(access.startsAt)}.`;
  }
}

const apiErrorMessages: Record<string, string> = {
  "Tenant slug confirmation is required":
    "Введите slug сети в поле подтверждения.",
  "reason must contain 10-500 characters":
    "Укажите причину: от 10 до 500 символов.",
  "Tenant access window has changed; reload the page":
    "Срок доступа уже изменился. Обновите страницу и повторите.",
  "Tenant access is already open-ended": "Доступ уже бессрочный.",
  "Tenant access is already closed": "Доступ уже закрыт.",
  "Tenant access already ends then": "Доступ уже заканчивается в это время.",
  "accessUntil must be in the future":
    "Дата окончания доступа должна быть в будущем.",
  "Tenant access must end after it starts":
    "Дата окончания должна быть позже начала доступа.",
};

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message;
    return message ? (apiErrorMessages[message] ?? message) : "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

export function TenantAccessPanel({
  tenant,
  onChanged,
}: {
  tenant: TenantAccessPanelTenant;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<AccessMode>(() =>
    defaultMode(tenant.access),
  );
  const [until, setUntil] = useState(() => defaultUntilValue(tenant.access));
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const badge = tenantAccessBadge(tenant.access);
  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950";

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  async function submit() {
    clearFeedback();

    let accessUntil: string | undefined;
    if (mode === "UNTIL") {
      const parsed = new Date(until);
      if (!until || Number.isNaN(parsed.getTime())) {
        setError("Укажите дату и время окончания доступа.");
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        setError("Дата окончания доступа должна быть в будущем.");
        return;
      }
      accessUntil = parsed.toISOString();
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/tenants/${tenant.id}/access-window`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            accessUntil,
            expectedExecutionRevision: tenant.access.executionRevision,
            reason,
            confirmation,
            requestId: crypto.randomUUID(),
          }),
        },
      );

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setReason("");
      setConfirmation("");
      setMessage(
        mode === "CLOSE_NOW"
          ? "Доступ сети закрыт. Изменение записано в журнал аудита."
          : "Срок доступа сохранён. Изменение записано в журнал аудита.",
      );
      await onChanged();
    } catch {
      setError("Не удалось отправить запрос. Проверьте соединение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Срок доступа сети
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {describeAccess(tenant)}
          </p>
        </div>
        <span
          className={[
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            badge.className,
          ].join(" ")}
        >
          {badge.label}
        </span>
      </div>

      {tenant.access.manageable ? (
        <div className="mt-3 grid gap-3">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Новый срок
            </span>
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as AccessMode);
                clearFeedback();
              }}
              className={inputClass}
            >
              {(["OPEN_ENDED", "UNTIL", "CLOSE_NOW"] as const).map((option) => (
                <option key={option} value={option}>
                  {modeLabels[option]}
                </option>
              ))}
            </select>
          </label>

          {mode === "UNTIL" ? (
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Доступ открыт до
              </span>
              <input
                type="datetime-local"
                value={until}
                onChange={(event) => {
                  setUntil(event.target.value);
                  clearFeedback();
                }}
                className={inputClass}
              />
            </label>
          ) : null}

          {mode === "CLOSE_NOW" ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
              Сотрудники сети сразу потеряют доступ к платформе, в том числе в
              уже открытых вкладках. Данные сети не удаляются, доступ можно
              вернуть здесь же.
            </p>
          ) : null}

          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Причина
            </span>
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                clearFeedback();
              }}
              rows={2}
              placeholder="Например: тестовая сеть, доступ без срока до отдельного решения"
              className={inputClass}
            />
          </label>

          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Подтверждение slug
            </span>
            <input
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                clearFeedback();
              }}
              placeholder={tenant.slug}
              className={inputClass}
            />
          </label>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submit()}
            className={[
              "w-fit rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
              mode === "CLOSE_NOW"
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
            ].join(" ")}
          >
            {isSubmitting
              ? "Сохраняем…"
              : mode === "CLOSE_NOW"
                ? "Закрыть доступ"
                : "Сохранить срок доступа"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
