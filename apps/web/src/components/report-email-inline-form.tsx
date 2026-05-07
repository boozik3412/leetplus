"use client";

import { FormEvent, useState } from "react";

type ReportEmailInlineFormProps = {
  defaultEmail: string;
  from: string;
  to: string;
  storeId: string | null;
  report?: string;
  extraPayload?: Record<string, string | number | null | undefined>;
  buttonLabel?: string;
};

type ErrorResponse = {
  message?: string | string[];
};

type SuccessResponse = {
  recipientEmail: string;
  fileName: string;
};

function normalizeErrorMessage(message: string) {
  const normalized = message.trim();

  if (!normalized || /internal server error/i.test(normalized)) {
    return "Не удалось отправить отчет: почтовый сервер недоступен или не настроен.";
  }

  return normalized;
}

function getErrorMessage(data: unknown) {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as ErrorResponse).message;

    if (typeof message === "string") {
      return normalizeErrorMessage(message);
    }

    if (Array.isArray(message)) {
      return normalizeErrorMessage(message.join(", "));
    }
  }

  return "Не удалось отправить отчет";
}

export function ReportEmailInlineForm({
  defaultEmail,
  from,
  to,
  storeId,
  report,
  extraPayload,
  buttonLabel = "Отправить на email",
}: ReportEmailInlineFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const recipientEmail = String(formData.get("recipientEmail") ?? "");
    const format = String(formData.get("format") ?? "xlsx");

    try {
      const response = await fetch("/api/reports/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientEmail,
          format,
          from,
          to,
          ...(storeId ? { storeId } : {}),
          ...(report ? { report } : {}),
          ...(extraPayload ?? {}),
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      setSuccess(data as SuccessResponse);
    } catch {
      setError("API недоступен");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-w-full flex-wrap items-end gap-2"
    >
      <label className="block min-w-52">
        <span className="sr-only">Email получателя</span>
        <input
          name="recipientEmail"
          type="email"
          defaultValue={defaultEmail}
          required
          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
        />
      </label>
      <label className="block">
        <span className="sr-only">Формат</span>
        <select
          name="format"
          defaultValue="xlsx"
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
        >
          <option value="xlsx">XLSX</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        {isSubmitting ? "Отправка..." : buttonLabel}
      </button>
      {success ? (
        <span className="basis-full text-sm text-emerald-600">
          Отправлен {success.fileName} на {success.recipientEmail}
        </span>
      ) : null}
      {error ? (
        <span className="basis-full text-sm text-red-600">{error}</span>
      ) : null}
    </form>
  );
}
