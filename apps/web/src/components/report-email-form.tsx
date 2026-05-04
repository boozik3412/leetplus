"use client";

import { FormEvent, useState } from "react";

type ReportEmailFormProps = {
  defaultEmail: string;
  from: string;
  to: string;
  storeId: string | null;
};

type ErrorResponse = {
  message?: string | string[];
};

type SuccessResponse = {
  recipientEmail: string;
  fileName: string;
};

const REPORT_EXPORT_DESCRIPTION =
  "Будет отправлен сводный файл за выбранный период: операционная сводка, рекомендации, OOS, товары без продаж, остатки, ABC, ТОП SKU/поставщиков и ассортимент.";

function normalizeErrorMessage(message: string) {
  const normalized = message.trim();

  if (!normalized || /internal server error/i.test(normalized)) {
    return "Не удалось отправить отчёт: почтовый сервер недоступен или не настроен.";
  }

  return normalized;
}

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data
  ) {
    const message = (data as ErrorResponse).message;

    if (typeof message === "string") {
      return normalizeErrorMessage(message);
    }

    if (Array.isArray(message)) {
      return normalizeErrorMessage(message.join(", "));
    }
  }

  return "Не удалось отправить отчёт";
}

export function ReportEmailForm({
  defaultEmail,
  from,
  to,
  storeId,
}: ReportEmailFormProps) {
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
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data as ErrorResponse));
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
      className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Отправить сводный отчёт на email
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-zinc-500">
          {REPORT_EXPORT_DESCRIPTION}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_160px_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">
            Email получателя
          </span>
          <input
            name="recipientEmail"
            type="email"
            defaultValue={defaultEmail}
            required
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Формат</span>
          <select
            name="format"
            defaultValue="xlsx"
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="xlsx">XLSX</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSubmitting ? "Отправка..." : "Отправить"}
        </button>
      </div>

      {success ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Сводный отчёт {success.fileName} отправлен на{" "}
          {success.recipientEmail}.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
