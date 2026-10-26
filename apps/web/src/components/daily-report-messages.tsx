"use client";

import { useState } from "react";
import {
  commentaryStatusText,
  parseTelegramHtml,
  type DailyReportPreview,
} from "@/lib/daily-report-view";

function TelegramMessage({ message }: { message: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      {parseTelegramHtml(message).map((segment, index) => {
        if (segment.bold && segment.italic) {
          return (
            <strong key={index}>
              <em>{segment.text}</em>
            </strong>
          );
        }
        if (segment.bold) return <strong key={index}>{segment.text}</strong>;
        if (segment.italic) {
          return (
            <em key={index} className="text-zinc-500">
              {segment.text}
            </em>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </div>
  );
}

export function DailyReportMessages({
  initial,
  date,
}: {
  initial: DailyReportPreview;
  date: string | null;
}) {
  const [preview, setPreview] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = commentaryStatusText(preview.commentary);

  async function requestCommentary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/daily/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(date ? { date } : {}),
      });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      setPreview((await response.json()) as DailyReportPreview);
    } catch {
      setError("Не удалось получить разбор ИИ. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={requestCommentary}
          disabled={loading || preview.commentary?.status === "OK"}
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
        >
          {loading
            ? "ИИ разбирает сутки…"
            : preview.commentary?.status === "OK"
              ? "Разбор ИИ готов"
              : "Добавить разбор ИИ"}
        </button>
        <span className="text-xs text-zinc-500">
          Разбор пишет модель Cloud.ru по готовым цифрам, обычно до минуты.
        </span>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-amber-700">{status}</p> : null}
      {preview.messages.map((message, index) => (
        <TelegramMessage key={index} message={message} />
      ))}
    </div>
  );
}
