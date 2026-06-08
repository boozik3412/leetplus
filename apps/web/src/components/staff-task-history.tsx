"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import type { AuthUser } from "@/lib/auth";
import type { StaffTask, StaffTaskStatus } from "@/lib/staff-tasks";

const baseStatusOptions: Array<{ value: StaffTaskStatus | ""; label: string }> = [
  { value: "", label: "Оставить текущий статус" },
  { value: "IN_PROGRESS", label: "Перевести в работу" },
  { value: "ON_REVIEW", label: "Передать на проверку" },
  { value: "DONE", label: "Отметить готово" },
  { value: "CANCELED", label: "Отменить" },
];

const reviewerRoles = new Set<AuthUser["role"]>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
]);
const statusManagerRoles = new Set<AuthUser["role"]>([
  ...reviewerRoles,
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
]);

const evidenceTypeLabels: Record<string, string> = {
  LINK: "Ссылка",
  PHOTO: "Фото",
  DOCUMENT: "Документ",
  VIDEO: "Видео",
  OTHER: "Другое",
};

const auditLabels: Record<string, string> = {
  CREATED: "Создана",
  UPDATED: "Обновлена",
  STATUS_CHANGED: "Статус изменен",
  COMMENT_ADDED: "Комментарий",
  EVIDENCE_ADDED: "Доказательство",
};

function evidenceTypeFromAttachment(attachment: StaffAttachmentUploadResult) {
  if (attachment.contentType.startsWith("image/")) {
    return "PHOTO";
  }

  if (attachment.contentType.startsWith("video/")) {
    return "VIDEO";
  }

  if (
    attachment.contentType.includes("pdf") ||
    attachment.contentType.includes("document") ||
    attachment.contentType.includes("word")
  ) {
    return "DOCUMENT";
  }

  return "OTHER";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function userName(
  user: { email: string; fullName: string | null } | null,
  fallback = "Система",
) {
  return user?.fullName ?? user?.email ?? fallback;
}

function getStatusOptions(
  task: StaffTask,
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  const canMove = canMoveTask(task, currentUser);

  return baseStatusOptions.filter((option) => {
    if (!option.value) {
      return true;
    }

    if (task.status === "DONE" || task.status === "CANCELED") {
      return false;
    }

    if (option.value === "DONE") {
      return task.status === "ON_REVIEW" && canApproveTask(task, currentUser);
    }

    if (option.value === "IN_PROGRESS") {
      if (task.status === "OPEN") {
        return canMove;
      }

      return task.status === "ON_REVIEW" && canReturnTask(task, currentUser);
    }

    if (option.value === "ON_REVIEW") {
      return task.status === "IN_PROGRESS" && canMove;
    }

    return option.value === "CANCELED" && canCancelTask(currentUser);
  });
}

function canApproveTask(
  task: StaffTask,
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return (
    task.assignedToUser?.id !== currentUser.id &&
    (currentUser.isPlatformAdmin || reviewerRoles.has(currentUser.role))
  );
}

function canReturnTask(
  task: StaffTask,
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return canMoveTask(task, currentUser);
}

function canMoveTask(
  task: StaffTask,
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return (
    task.assignedToUser?.id === currentUser.id ||
    currentUser.isPlatformAdmin ||
    reviewerRoles.has(currentUser.role)
  );
}

function canCancelTask(
  currentUser: Pick<AuthUser, "role" | "isPlatformAdmin">,
) {
  return currentUser.isPlatformAdmin || statusManagerRoles.has(currentUser.role);
}

export function StaffTaskHistory({
  task,
  currentUser,
}: {
  task: StaffTask;
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceType, setEvidenceType] = useState("LINK");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    const evidenceUrl = String(form.get("evidenceUrl") ?? "").trim();
    const status = String(form.get("status") ?? "").trim();

    if (!body && !evidenceUrl && !status) {
      setError("Добавьте комментарий или ссылку на доказательство.");
      return;
    }

    setIsPending(true);
    setError(null);

    const payload = {
      body: body || null,
      evidenceUrl: evidenceUrl || null,
      evidenceType: String(form.get("evidenceType") ?? "").trim() || null,
      evidenceLabel: String(form.get("evidenceLabel") ?? "").trim() || null,
      status: status || undefined,
    };

    try {
      const response = await fetch(`/api/staff/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          data?.message ?? "Не удалось добавить подтверждение",
        );
      }

      event.currentTarget.reset();
      setEvidenceUrl("");
      setEvidenceLabel("");
      setEvidenceType("LINK");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  const latestAudit = task.auditEvents.slice(0, 4);
  const statusOptions = getStatusOptions(task, currentUser);

  return (
    <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 transition hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300">
        История и подтверждение
        <span className="ml-2 text-xs font-normal text-zinc-500">
          {task.comments.length} коммент., {task.auditEvents.length} событий
        </span>
      </summary>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Комментарий или результат
            </span>
            <textarea
              name="body"
              rows={3}
              placeholder="Что сделано, что проверено, что осталось проконтролировать"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Ссылка на доказательство
              </span>
              <input
                name="evidenceUrl"
                type="url"
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="https://..."
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <StaffAttachmentUpload
                label="Загрузить доказательство"
                buttonLabel="Загрузить файл"
                onUploaded={(attachment) => {
                  setEvidenceUrl(attachment.url);
                  setEvidenceLabel((current) => current || attachment.fileName);
                  setEvidenceType(evidenceTypeFromAttachment(attachment));
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Название доказательства
              </span>
              <input
                name="evidenceLabel"
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder="Фото кассы, чек, акт"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Тип доказательства
              </span>
              <select
                name="evidenceType"
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(evidenceTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                После добавления
              </span>
              <select
                name="status"
                defaultValue=""
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {statusOptions.map((option) => (
                  <option key={option.value || "same"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isPending}
                className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
              >
                {isPending ? "Сохраняем..." : "Добавить"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </form>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">
              Последние комментарии
            </p>
            {task.comments.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Пока нет подтверждений выполнения.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {task.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>{userName(comment.authorUser, "Автор скрыт")}</span>
                      <span>{formatDateTime(comment.createdAt)}</span>
                    </div>
                    {comment.body ? (
                      <p className="mt-2 leading-5 text-zinc-700 dark:text-zinc-200">
                        {comment.body}
                      </p>
                    ) : null}
                    {comment.evidenceUrl ? (
                      <a
                        href={comment.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                      >
                        {comment.evidenceLabel ||
                          evidenceTypeLabels[comment.evidenceType ?? "LINK"] ||
                          "Открыть доказательство"}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">
              Журнал действий
            </p>
            <div className="mt-2 space-y-1.5">
              {latestAudit.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md bg-white px-3 py-2 text-xs dark:bg-zinc-950"
                >
                  <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                    {auditLabels[event.action] ?? event.action}
                  </p>
                  {event.message ? (
                    <p className="mt-0.5 text-zinc-500">{event.message}</p>
                  ) : null}
                  <p className="mt-0.5 text-zinc-500">
                    {userName(event.actorUser)} · {formatDateTime(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
