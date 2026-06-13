"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import type {
  StaffShiftReportAttachment,
  StaffShiftReportDraft,
  StaffShiftReportSendResult,
} from "@/lib/staff-shift-reports";

function toReportAttachment(
  attachment: StaffAttachmentUploadResult,
): StaffShiftReportAttachment {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    createdAt: attachment.createdAt,
  };
}

function formatSize(value: number) {
  if (value <= 0) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

async function readResponseError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось отправить отчет";
  } catch {
    return "Не удалось отправить отчет";
  }
}

export function StaffShiftReportEditor({
  draft,
}: {
  draft: StaffShiftReportDraft;
}) {
  const [activeDraft, setActiveDraft] = useState(draft);
  const [body, setBody] = useState(draft.body);
  const [attachments, setAttachments] = useState(draft.attachments);
  const [isRefreshingDraft, setIsRefreshingDraft] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StaffShiftReportSendResult | null>(null);
  const attachmentIds = useMemo(
    () => attachments.map((attachment) => attachment.id),
    [attachments],
  );

  async function refreshDraft(shiftId: string | null) {
    setError(null);
    setResult(null);
    setIsRefreshingDraft(true);

    const url = new URL("/api/staff/shift-reports/draft", window.location.origin);

    if (shiftId) {
      url.searchParams.set("shiftId", shiftId);
    }

    const response = await fetch(url, { cache: "no-store" });
    setIsRefreshingDraft(false);

    if (!response.ok) {
      setError(await readResponseError(response));
      return;
    }

    const nextDraft = (await response.json()) as StaffShiftReportDraft;

    setActiveDraft(nextDraft);
    setBody(nextDraft.body);
    setAttachments(nextDraft.attachments);
  }

  function appendAttachment(attachment: StaffAttachmentUploadResult) {
    const nextAttachment = toReportAttachment(attachment);

    setAttachments((current) => [
      ...current.filter((item) => item.id !== nextAttachment.id),
      nextAttachment,
    ]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  }

  async function sendReport() {
    setError(null);
    setResult(null);

    if (!body.trim()) {
      setError("Заполните текст отчета перед отправкой.");
      return;
    }

    setIsSending(true);

    const response = await fetch("/api/staff/shift-reports/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        storeId: activeDraft.storeId,
        attachmentIds,
      }),
    });

    setIsSending(false);

    if (!response.ok) {
      setError(await readResponseError(response));
      return;
    }

    setResult((await response.json()) as StaffShiftReportSendResult);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Черновик отчета
          </p>
          <h2 className="mt-1 text-xl font-semibold">{activeDraft.clubName}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {activeDraft.dateLabel} · {activeDraft.dayPartLabel}
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <SummaryRow
            label="Администратор"
            value={activeDraft.administratorName}
          />
          <SummaryRow
            label="Чек-листы"
            value={`${activeDraft.checklists.length}`}
          />
          <SummaryRow label="Задачи" value={`${activeDraft.tasks.length}`} />
          <SummaryRow label="Файлы" value={`${attachments.length}`} />
        </div>

        {activeDraft.shiftOptions.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Смена Langame
              </span>
              <select
                value={activeDraft.selectedShiftId ?? ""}
                disabled={isRefreshingDraft}
                onChange={(event) =>
                  void refreshDraft(event.currentTarget.value || null)
                }
                className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Не выбрана</option>
                {activeDraft.shiftOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatShiftOption(option)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refreshDraft(activeDraft.selectedShiftId)}
              disabled={isRefreshingDraft}
              className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
            >
              {isRefreshingDraft ? "Обновляем..." : "Обновить данные"}
            </button>
          </div>
        ) : null}

        {activeDraft.syncWarnings.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Данные Langame нужно проверить</p>
            <p className="mt-1 text-xs leading-5">
              {activeDraft.syncWarnings.join(" ")}
            </p>
          </div>
        ) : null}

        {activeDraft.missingData.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Заполнить вручную</p>
            <p className="mt-1 text-xs leading-5">
              {activeDraft.missingData.join(", ")}.
            </p>
          </div>
        ) : null}

        <Link
          href="/staff/shift-workspace"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          Вернуться к смене
        </Link>
      </aside>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Отправка в канал “Отчетность”
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Отчет по смене</h2>
          </div>
          <button
            type="button"
            onClick={sendReport}
            disabled={isSending}
            className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Отправка..." : "Отправить отчет"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            Отчет отправлен.{" "}
            <Link className="font-semibold underline" href={result.chatHref}>
              Открыть канал
            </Link>
          </div>
        ) : null}

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase text-zinc-500">
            Текст отчета
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={18}
            className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-sm leading-6 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </label>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Фото и файлы отчета</p>
              <p className="mt-1 text-xs text-zinc-500">
                В отчет попадут вложения из чек-листов и файлы, добавленные ниже.
              </p>
            </div>
            <StaffAttachmentUpload
              label="Добавить файлы к отчету"
              buttonLabel="Добавить файлы"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              compressImages
              onUploaded={appendAttachment}
            />
          </div>

          {attachments.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                  >
                    {attachment.fileName}
                    {attachment.byteSize > 0
                      ? ` · ${formatSize(attachment.byteSize)}`
                      : ""}
                  </a>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-900"
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700">
              Вложений пока нет.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function formatShiftOption(
  option: StaffShiftReportDraft["shiftOptions"][number],
) {
  const status = option.status === "OPEN" ? "открыта" : "закрыта";
  const startedAt = option.startedAt
    ? new Date(option.startedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "без времени";

  return `${status} · ${startedAt} · ${option.operatorName}`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-900">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
