"use client";

import { useState } from "react";

type DigestType = "DAILY" | "WEEKLY";

type SuccessResponse = {
  type: DigestType;
  recipientEmail: string;
  from: string;
  to: string;
  attachmentFileName: string | null;
};

type ErrorResponse = {
  message?: string | string[];
};

const DIGEST_LABELS: Record<DigestType, string> = {
  DAILY: "Вчерашний дайджест",
  WEEKLY: "Недельный отчет",
};

function errorMessage(data: unknown) {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as ErrorResponse).message;

    if (Array.isArray(message)) {
      return message.join(", ");
    }

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Не удалось отправить дайджест";
}

export function ReportDigestForm({ defaultEmail }: { defaultEmail: string }) {
  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);
  const [pendingType, setPendingType] = useState<DigestType | null>(null);
  const [success, setSuccess] = useState<SuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendDigest(type: DigestType) {
    setPendingType(type);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/reports/digests/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          recipientEmail,
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(errorMessage(data));
        return;
      }

      setSuccess(data as SuccessResponse);
    } catch {
      setError("API недоступен");
    } finally {
      setPendingType(null);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Регулярные дайджесты
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
            Короткая сводка по сети и список действий из рекомендаций.
          </p>
        </div>
        <label className="block w-full lg:w-80">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email получателя
          </span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(["DAILY", "WEEKLY"] as const).map((type) => (
          <button
            key={type}
            type="button"
            disabled={pendingType !== null}
            onClick={() => void sendDigest(type)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-500/10"
          >
            <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              {DIGEST_LABELS[type]}
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              {type === "DAILY"
                ? "Деньги, маржа, OOS, списания, SKU без продаж."
                : "Динамика к прошлой неделе и XLSX во вложении."}
            </span>
            <span className="mt-3 inline-flex rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
              {pendingType === type ? "Отправка..." : "Отправить"}
            </span>
          </button>
        ))}
      </div>

      {success ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {DIGEST_LABELS[success.type]} за {success.from} - {success.to} отправлен
          на {success.recipientEmail}.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
