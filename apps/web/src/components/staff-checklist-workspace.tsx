"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import type {
  StaffChecklistAnswer,
  StaffChecklistAnswerStatus,
  StaffChecklistEvidenceAttachment,
  StaffChecklistRegulationOption,
  StaffChecklistReport,
  StaffChecklistReviewThread,
  StaffChecklistReviewThreadMessage,
  StaffChecklistRun,
  StaffChecklistStatus,
  StaffChecklistTemplateOption,
} from "@/lib/staff-checklists";

const statusLabels: Record<StaffChecklistStatus, string> = {
  OPEN: "Новый",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Принят",
  RETURNED: "Возвращен в работу",
  ESCALATED: "Эскалирован",
  CANCELED: "Отменен",
};

const answerStatusLabels: Record<StaffChecklistAnswerStatus, string> = {
  PASS: "Выполнено",
  FAILED: "Проблема",
  NOT_APPLICABLE: "Не применимо",
};

const shiftKindLabels: Record<StaffChecklistRegulationOption["shiftKind"], string> = {
  OPENING: "Открытие",
  CLOSING: "Закрытие",
  CASH: "Касса",
  BAR: "Бар",
  PC_ZONE: "PC-зона",
  CLEANLINESS: "Чистота",
  INCIDENT: "Инцидент",
  INVENTORY: "Передача ТМЦ",
  CUSTOM: "Другое",
};

type ChecklistSourceOption =
  | (StaffChecklistRegulationOption & {
      key: string;
      kind: "REGULATION";
    })
  | (StaffChecklistTemplateOption & {
      key: string;
      kind: "TEMPLATE";
    });

type RunStatusGroupKey =
  | "IN_PROGRESS"
  | "ON_REVIEW"
  | "ACCEPTED"
  | "RETURNED"
  | "OTHER";

const runStatusGroups: Array<{ key: RunStatusGroupKey; label: string }> = [
  { key: "IN_PROGRESS", label: "В работе" },
  { key: "ON_REVIEW", label: "На проверке" },
  { key: "ACCEPTED", label: "Принят" },
  { key: "RETURNED", label: "Возвращен в работу" },
  { key: "OTHER", label: "Прочие" },
];

function getRunStatusGroupKey(status: StaffChecklistStatus): RunStatusGroupKey {
  if (
    status === "IN_PROGRESS" ||
    status === "ON_REVIEW" ||
    status === "ACCEPTED" ||
    status === "RETURNED"
  ) {
    return status;
  }

  return "OTHER";
}

function answerKey(answer: Pick<StaffChecklistAnswer, "sectionId" | "itemId">) {
  return `${answer.sectionId}::${answer.itemId}`;
}

function getEvidenceAttachments(answer: StaffChecklistAnswer | undefined) {
  return answer?.evidenceAttachments ?? [];
}

function answerHasEvidence(answer: StaffChecklistAnswer | undefined) {
  return Boolean(
    answer?.evidenceUrl || getEvidenceAttachments(answer).length > 0,
  );
}

function toEvidenceAttachment(
  attachment: StaffAttachmentUploadResult,
): StaffChecklistEvidenceAttachment {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    createdAt: attachment.createdAt,
  };
}

function formatAttachmentSize(value: number) {
  if (value <= 0) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function getAttachmentHref(attachment: StaffChecklistEvidenceAttachment) {
  const url = attachment.url.trim();

  if (url.startsWith("/api/")) {
    return url;
  }

  if (url.startsWith("/staff/attachments/")) {
    return `/api${url}`;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.pathname.startsWith("/api/staff/attachments/")) {
      return `${parsedUrl.pathname}${parsedUrl.search}`;
    }

    if (parsedUrl.pathname.startsWith("/staff/attachments/")) {
      return `/api${parsedUrl.pathname}${parsedUrl.search}`;
    }
  } catch {
    return url;
  }

  return url;
}

function isPreviewableImage(attachment: StaffChecklistEvidenceAttachment) {
  if (attachment.contentType.toLowerCase().startsWith("image/")) {
    return true;
  }

  return /\.(avif|gif|jpe?g|png|webp)$/i.test(attachment.fileName);
}

function statusClass(status: StaffChecklistStatus, isOverdue: boolean) {
  const base = "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold";

  if (isOverdue) {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  if (status === "ACCEPTED") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "ON_REVIEW") {
    return `${base} bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200`;
  }

  if (status === "RETURNED") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
  }

  if (status === "ESCALATED") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  if (status === "CANCELED") {
    return `${base} bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`;
  }

  return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "без срока";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompletionDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

async function readResponseError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось выполнить действие";
  } catch {
    return "Не удалось выполнить действие";
  }
}

export function StaffChecklistWorkspace({
  report,
  focusRunId,
  canCreateRuns = true,
  canReviewRuns = true,
  canAssignRuns = canCreateRuns,
  canStartFromRegulations = canCreateRuns,
}: {
  report: StaffChecklistReport;
  focusRunId?: string | null;
  canCreateRuns?: boolean;
  canReviewRuns?: boolean;
  canAssignRuns?: boolean;
  canStartFromRegulations?: boolean;
}) {
  const router = useRouter();
  const initialRunId =
    (focusRunId && report.rows.some((run) => run.id === focusRunId)
      ? focusRunId
      : report.rows[0]?.id) ?? "";
  const [selectedRunId, setSelectedRunId] = useState(initialRunId);
  const [openedRunId, setOpenedRunId] = useState(initialRunId);
  const selectedRun =
    report.rows.find((run) => run.id === selectedRunId) ??
    report.rows[0] ??
    null;
  const openedRun =
    report.rows.find((run) => run.id === openedRunId) ??
    report.rows.find((run) => run.id === selectedRunId) ??
    report.rows[0] ??
    null;

  function openRun(runId: string) {
    setSelectedRunId(runId);
    setOpenedRunId(runId);
  }

  function toggleRunGroup(groupKey: RunStatusGroupKey) {
    setExpandedRunGroups((current) => {
      const next = new Set(current);

      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  }

  const sourceOptions = useMemo<ChecklistSourceOption[]>(
    () =>
      canCreateRuns
        ? [
            ...(canStartFromRegulations
              ? report.publishedRegulations.map((regulation) => ({
                  ...regulation,
                  key: `regulation:${regulation.id}`,
                  kind: "REGULATION" as const,
                }))
              : []),
            ...report.checklistTemplates.map((template) => ({
              ...template,
              key: `template:${template.id}`,
              kind: "TEMPLATE" as const,
            })),
          ]
        : [],
    [
      canCreateRuns,
      canStartFromRegulations,
      report.checklistTemplates,
      report.publishedRegulations,
    ],
  );
  const [selectedSourceKey, setSelectedSourceKey] = useState(
    sourceOptions[0]?.key ?? "",
  );
  const selectedSource = sourceOptions.find(
    (source) => source.key === selectedSourceKey,
  );
  const [storeId, setStoreId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [expandedRunGroups, setExpandedRunGroups] = useState<
    Set<RunStatusGroupKey>
  >(() => new Set<RunStatusGroupKey>());
  const runGroups = useMemo(
    () =>
      runStatusGroups
        .map((group) => ({
          ...group,
          runs: report.rows.filter(
            (run) => getRunStatusGroupKey(run.status) === group.key,
          ),
        }))
        .filter((group) => group.runs.length > 0),
    [report.rows],
  );

  async function createRun() {
    if (!canCreateRuns) {
      setMessage("Создание чек-листов недоступно для вашей роли.");
      return;
    }

    if (!selectedSource) {
      setMessage("Сначала опубликуйте регламент или активируйте шаблон чеклиста.");
      return;
    }

    setIsPending(true);
    setMessage(null);

    const response = await fetch("/api/staff/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regulationId:
          selectedSource.kind === "REGULATION" ? selectedSource.id : null,
        templateId: selectedSource.kind === "TEMPLATE" ? selectedSource.id : null,
        storeId: storeId || null,
        assignedToUserId: canAssignRuns ? assignedToUserId || null : null,
        scheduledAt: scheduledAt || null,
      }),
    });

    setIsPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const run = (await response.json()) as StaffChecklistRun;
    openRun(run.id);
    setMessage("Чеклист смены создан.");
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {canCreateRuns ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                  Запуск
                </p>
                <h2 className="mt-1 text-lg font-semibold">Новый чеклист смены</h2>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {formatNumber(sourceOptions.length)} основ
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Основа чеклиста
                </span>
                <select
                  value={selectedSourceKey}
                  onChange={(event) => {
                    const value = event.target.value;
                    const next = sourceOptions.find(
                      (source) => source.key === value,
                    );

                    setSelectedSourceKey(value);
                    setStoreId(next?.store?.id ?? "");
                  }}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {sourceOptions.length === 0 ? (
                    <option value="">Нет регламентов или активных шаблонов</option>
                  ) : null}
                  {sourceOptions.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.kind === "REGULATION" ? "Регламент" : "Шаблон"} ·{" "}
                      {source.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                {selectedSource ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {shiftKindLabels[selectedSource.shiftKind]} · v
                      {selectedSource.version}
                    </p>
                    <p>
                      {formatNumber(selectedSource.itemsCount)} пунктов,{" "}
                      {formatNumber(selectedSource.requiredEvidenceItems)} с
                      доказательствами
                    </p>
                    <p>{selectedSource.store?.name ?? "Вся сеть"}</p>
                  </div>
                ) : (
                  "Опубликованный регламент или активный шаблон нужен, чтобы создать чеклист."
                )}
              </div>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Клуб
                </span>
                <select
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  disabled={Boolean(selectedSource?.store)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">Вся сеть / не указан</option>
                  {report.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>

              {canAssignRuns ? (
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">
                    Ответственный
                  </span>
                  <select
                    value={assignedToUserId}
                    onChange={(event) => setAssignedToUserId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <option value="">Не назначен</option>
                    {report.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName ?? user.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Плановое время
                </span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              </label>

              <button
                type="button"
                onClick={createRun}
                disabled={isPending || sourceOptions.length === 0}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Создать чеклист
              </button>
              {message ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  {message}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Выполнение
            </p>
            <h2 className="mt-1 text-lg font-semibold">Мои текущие чек-листы</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Здесь отображаются только чек-листы, назначенные вам или вашей
              смене. Создание и редактирование регламентов недоступно для этой
              роли.
            </p>
          </div>
        )}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Текущие выполнения
          </p>
          <div className="mt-2 space-y-2">
            {report.rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700">
                {canCreateRuns
                  ? "Выполнений пока нет. Создайте чеклист из регламента или шаблона."
                  : "Текущих чек-листов пока нет."}
              </p>
            ) : null}
            {runGroups.map((group) => {
              const isOpen = expandedRunGroups.has(group.key);

              return (
                <div key={group.key} className="space-y-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleRunGroup(group.key)}
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-emerald-500/10"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DisclosureChevron isOpen={isOpen} />
                      <span className="truncate">{group.label}</span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                      {formatNumber(group.runs.length)}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-2">
                      {group.runs.map((run) => (
                        <button
                          key={run.id}
                          id={`run-${run.id}`}
                          type="button"
                          onClick={() => openRun(run.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openRun(run.id);
                            }
                          }}
                          title="Открыть чек-лист"
                          className={[
                            "scroll-mt-24 w-full rounded-lg border px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10",
                            selectedRun?.id === run.id
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{run.title}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {run.assignedToUser?.fullName ??
                                  run.assignedToUser?.email ??
                                  "Не назначен"} · {run.store?.name ?? "Вся сеть"} ·{" "}
                                {formatDateTime(run.startedAt ?? run.scheduledAt)}
                              </p>
                            </div>
                            <span className={statusClass(run.status, run.isOverdue)}>
                              {run.isOverdue
                                ? "Просрочен"
                                : statusLabels[run.status]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {openedRun ? (
          <ChecklistRunEditor
            key={openedRun.id}
            run={openedRun}
            canReviewRun={canReviewRuns}
          />
        ) : (
          <div className="flex min-h-[24rem] items-center justify-center rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
            {canCreateRuns
              ? "Создайте первый чеклист смены из регламента или шаблона."
              : "Текущих чек-листов пока нет."}
          </div>
        )}
      </section>
    </div>
  );
}

function DisclosureChevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={[
        "h-4 w-4 shrink-0 transition-transform duration-200",
        isOpen ? "rotate-180" : "-rotate-90",
      ].join(" ")}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChecklistRunEditor({
  run,
  canReviewRun,
}: {
  run: StaffChecklistRun;
  canReviewRun: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<StaffChecklistAnswer[]>(run.answers);
  const [persistedAnswers, setPersistedAnswers] =
    useState<StaffChecklistAnswer[]>(run.answers);
  const [reviewComment, setReviewComment] = useState(run.reviewComment ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<StaffChecklistEvidenceAttachment | null>(null);
  const [discussionTarget, setDiscussionTarget] = useState<{
    sectionId: string;
    itemId: string;
  } | null>(null);
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionAttachmentUrl, setDiscussionAttachmentUrl] = useState("");
  const [discussionAttachments, setDiscussionAttachments] = useState<
    StaffChecklistEvidenceAttachment[]
  >([]);
  const [resolveComment, setResolveComment] = useState("");
  const [isDiscussionPending, setIsDiscussionPending] = useState(false);
  const previewAttachmentHref = previewAttachment
    ? getAttachmentHref(previewAttachment)
    : null;

  const answersByKey = useMemo(
    () => new Map(answers.map((answer) => [answerKey(answer), answer])),
    [answers],
  );
  const localBlockingIssues = useMemo(
    () =>
      run.sections.flatMap((section) =>
        section.items.flatMap((item) => {
          const answer = answersByKey.get(`${section.id}::${item.id}`);
          const issues: string[] = [];

          if (item.required && !answer?.status) {
            issues.push("нет результата");
          }

          if (item.evidenceRequired && !answerHasEvidence(answer)) {
            issues.push("нет ссылки на доказательство");
          }

          return issues.map((issue) => `${item.title}: ${issue}`);
        }),
      ),
    [answersByKey, run.sections],
  );
  const canCancelRun =
    run.status !== "ACCEPTED" &&
    run.status !== "CANCELED" &&
    (canReviewRun || run.status === "OPEN" || run.status === "IN_PROGRESS");
  const discussionContext = useMemo(() => {
    if (!discussionTarget) {
      return null;
    }

    const section = run.sections.find(
      (item) => item.id === discussionTarget.sectionId,
    );
    const item = section?.items.find(
      (currentItem) => currentItem.id === discussionTarget.itemId,
    );

    if (!section || !item) {
      return null;
    }

    const answer = answersByKey.get(`${section.id}::${item.id}`);
    const threads = answer?.reviewThreads ?? [];
    const openThread = threads.find((thread) => thread.status === "OPEN");

    return { section, item, answer, threads, openThread };
  }, [answersByKey, discussionTarget, run.sections]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("itemId");

    if (!itemId) {
      return;
    }

    const found = run.sections
      .flatMap((section) =>
        section.items.map((item) => ({
          sectionId: section.id,
          itemId: item.id,
        })),
      )
      .find((item) => item.itemId === itemId);

    if (!found) {
      return;
    }

    window.requestAnimationFrame(() => {
      setDiscussionTarget(found);
      document
        .getElementById(`item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [run.id, run.sections]);

  function patchAnswer(
    sectionId: string,
    itemId: string,
    patch: Partial<StaffChecklistAnswer>,
  ) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.sectionId === sectionId && answer.itemId === itemId
          ? { ...answer, ...patch }
          : answer,
      ),
    );
  }

  function appendEvidenceAttachment(
    sectionId: string,
    itemId: string,
    attachment: StaffAttachmentUploadResult,
  ) {
    const currentAnswer = answersByKey.get(`${sectionId}::${itemId}`);
    const nextAttachment = toEvidenceAttachment(attachment);
    const nextAttachments = [
      ...getEvidenceAttachments(currentAnswer).filter(
        (item) => item.id !== nextAttachment.id,
      ),
      nextAttachment,
    ].slice(0, 20);

    patchAnswer(sectionId, itemId, {
      evidenceUrl: currentAnswer?.evidenceUrl ?? nextAttachment.url,
      evidenceAttachments: nextAttachments,
    });
  }

  function removeEvidenceAttachment(
    sectionId: string,
    itemId: string,
    attachmentId: string,
  ) {
    const currentAnswer = answersByKey.get(`${sectionId}::${itemId}`);
    const nextAttachments = getEvidenceAttachments(currentAnswer).filter(
      (attachment) => attachment.id !== attachmentId,
    );
    const removedAttachment = getEvidenceAttachments(currentAnswer).find(
      (attachment) => attachment.id === attachmentId,
    );

    patchAnswer(sectionId, itemId, {
      evidenceAttachments: nextAttachments,
      evidenceUrl:
        currentAnswer?.evidenceUrl === removedAttachment?.url
          ? (nextAttachments[0]?.url ?? null)
          : (currentAnswer?.evidenceUrl ?? null),
    });
  }

  function appendDiscussionAttachment(attachment: StaffAttachmentUploadResult) {
    const nextAttachment = toEvidenceAttachment(attachment);

    setDiscussionAttachments((current) => [
      ...current.filter((item) => item.id !== nextAttachment.id),
      nextAttachment,
    ]);
  }

  function removeDiscussionAttachment(attachmentId: string) {
    setDiscussionAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }

  function closeDiscussion() {
    setDiscussionTarget(null);
    setDiscussionBody("");
    setDiscussionAttachmentUrl("");
    setDiscussionAttachments([]);
    setResolveComment("");
  }

  async function submitDiscussionMessage() {
    if (!discussionContext || !discussionTarget) {
      return;
    }

    if (
      !discussionBody.trim() &&
      !discussionAttachmentUrl.trim() &&
      discussionAttachments.length === 0
    ) {
      setMessage("Добавьте комментарий или доказательство.");
      return;
    }

    setIsDiscussionPending(true);
    setMessage(null);

    const response = await fetch(
      `/api/staff/checklists/${run.id}/items/${discussionTarget.itemId}/review-messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: discussionBody,
          attachmentUrl: discussionAttachmentUrl || null,
          attachments: discussionAttachments,
        }),
      },
    );

    setIsDiscussionPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const updatedRun = (await response.json()) as StaffChecklistRun;
    setAnswers(updatedRun.answers);
    setPersistedAnswers(updatedRun.answers);
    setDiscussionBody("");
    setDiscussionAttachmentUrl("");
    setDiscussionAttachments([]);
    setMessage("Комментарий по пункту добавлен.");
    router.refresh();
  }

  async function resolveDiscussionThread() {
    if (!discussionContext || !discussionTarget) {
      return;
    }

    setIsDiscussionPending(true);
    setMessage(null);

    const response = await fetch(
      `/api/staff/checklists/${run.id}/items/${discussionTarget.itemId}/review-resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: resolveComment || null }),
      },
    );

    setIsDiscussionPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const updatedRun = (await response.json()) as StaffChecklistRun;
    setAnswers(updatedRun.answers);
    setPersistedAnswers(updatedRun.answers);
    setResolveComment("");
    setMessage("Уточнение закрыто, пункт зачтен.");
    router.refresh();
  }

  async function updateRun(
    status?: StaffChecklistStatus,
    nextAnswers = answers,
    successMessage?: string,
  ) {
    setIsPending(true);
    setMessage(null);

    const response = await fetch(`/api/staff/checklists/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: nextAnswers,
        status,
        reviewComment,
      }),
    });

    setIsPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const updatedRun = (await response.json()) as StaffChecklistRun;
    setAnswers(updatedRun.answers);
    setPersistedAnswers(updatedRun.answers);
    setReviewComment(updatedRun.reviewComment ?? "");

    const successMessages: Partial<Record<StaffChecklistStatus, string>> = {
      ON_REVIEW: "Чеклист отправлен на проверку.",
      ACCEPTED: "Чеклист принят.",
      RETURNED: "Чеклист возвращен на доработку.",
      ESCALATED: "Чеклист эскалирован и отправлен в командный чат.",
      CANCELED: "Чеклист отменен.",
    };
    const fallbackMessage = status
      ? (successMessages[status] ?? "Чеклист обновлен.")
      : "Чеклист обновлен.";
    setMessage(successMessage ?? fallbackMessage);
    router.refresh();
  }

  async function cancelRun() {
    const confirmed = window.confirm(
      "Отменить некорректный чек-лист? Он останется в отчете со статусом \"Отменен\".",
    );

    if (!confirmed) {
      return;
    }

    await updateRun(
      "CANCELED",
      answers,
      "Чеклист отменен. Он останется в отчете со статусом \"Отменен\".",
    );
  }

  async function submitAnswer(
    sectionId: string,
    itemId: string,
    evidenceRequired = false,
  ) {
    const currentAnswer = answersByKey.get(`${sectionId}::${itemId}`);

    const canResubmitSubmittedItem =
      run.status === "RETURNED" || run.status === "ESCALATED";

    if (currentAnswer?.completedAt && !canResubmitSubmittedItem) {
      setMessage("Пункт уже отправлен.");
      return;
    }

    if (!currentAnswer?.status) {
      setMessage("Выберите результат пункта перед отправкой.");
      return;
    }

    if (evidenceRequired && !answerHasEvidence(currentAnswer)) {
      setMessage("Добавьте доказательство перед отправкой.");
      return;
    }

    const nextAnswers = persistedAnswers.map((answer) =>
      answer.sectionId === sectionId && answer.itemId === itemId
        ? {
            ...answer,
            value: currentAnswer.value,
            status: currentAnswer.status,
            note: currentAnswer.note,
            evidenceUrl: currentAnswer.evidenceUrl,
            evidenceAttachments: currentAnswer.evidenceAttachments ?? [],
            reviewThreads: currentAnswer.reviewThreads ?? [],
            completedAt: null,
          }
        : answer,
    );
    const nextStatus =
      run.status === "OPEN" ||
      run.status === "RETURNED" ||
      run.status === "ESCALATED"
        ? "IN_PROGRESS"
        : undefined;

    await updateRun(
      nextStatus,
      nextAnswers,
      "Пункт отправлен. Время выполнения зафиксировано.",
    );
  }

  return (
    <>
      <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Выполнение
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{run.title}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {run.regulation?.title ?? run.template?.title ?? "Чеклист"} · v
            {run.regulation ? run.regulationVersion : run.templateVersion} ·{" "}
            {shiftKindLabels[run.shiftKind]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusClass(run.status, run.isOverdue)}>
            {run.isOverdue ? "Просрочен" : statusLabels[run.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {formatNumber(run.scoreEarned)}/{formatNumber(run.scoreTotal)} баллов
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric
          label="Обязательные"
          value={`${formatNumber(run.requiredItemsDone)}/${formatNumber(run.requiredItemsTotal)}`}
        />
        <Metric
          label="Доказательства"
          value={`${formatNumber(run.evidenceDone)}/${formatNumber(run.evidenceTotal)}`}
        />
        <Metric
          label="Проблемы"
          value={formatNumber(run.failedItems)}
          tone={run.failedItems > 0 ? "bad" : "good"}
        />
        <Metric
          label="Блокеры сдачи"
          value={formatNumber(localBlockingIssues.length)}
          tone={localBlockingIssues.length > 0 ? "bad" : "good"}
        />
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {message}
        </div>
      ) : null}

      {localBlockingIssues.length > 0 ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="font-semibold">Что мешает отправить на проверку</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {localBlockingIssues.slice(0, 8).map((issue) => (
              <span
                key={issue}
                className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200"
              >
                {issue}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {run.sections.map((section) => (
          <div
            key={section.id}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold">{section.title}</p>
              {section.description ? (
                <p className="mt-1 text-sm text-zinc-500">
                  {section.description}
                </p>
              ) : null}
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {section.items.map((item) => {
                const answer = answersByKey.get(`${section.id}::${item.id}`);
                const completedAt = formatCompletionDateTime(
                  answer?.completedAt ?? null,
                );
                const isSubmitted = Boolean(answer?.completedAt);
                const canResubmitSubmittedItem =
                  run.status === "RETURNED" || run.status === "ESCALATED";
                const evidenceAttachments = getEvidenceAttachments(answer);
                const hasEvidence = answerHasEvidence(answer);
                const reviewThreads = answer?.reviewThreads ?? [];
                const openReviewThreads = reviewThreads.filter(
                  (thread) => thread.status === "OPEN",
                );
                const reviewMessagesCount = reviewThreads.reduce(
                  (sum, thread) => sum + thread.messages.length,
                  0,
                );

                return (
                  <div
                    key={item.id}
                    id={`item-${item.id}`}
                    className="scroll-mt-24 px-3 py-3 sm:px-4"
                  >
                    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                      <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_minmax(28rem,34rem)] xl:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 text-sm font-semibold leading-5 sm:text-base">
                              {item.title}
                            </p>
                            {item.required ? <Pill>обязательный</Pill> : null}
                            {item.evidenceRequired ? (
                              <Pill>доказательство</Pill>
                            ) : null}
                            {item.score > 0 ? <Pill>{item.score} балл.</Pill> : null}
                          </div>
                          {item.instruction ? (
                            <p className="mt-1 text-sm leading-5 text-zinc-500">
                              {item.instruction}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>
                              {answer?.status
                                ? answerStatusLabels[answer.status]
                                : "ждет результата"}
                            </span>
                            {completedAt ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                отправлено {completedAt}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="grid min-w-0 gap-2">
                          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,12rem)_minmax(12rem,1fr)] lg:grid-cols-[minmax(10rem,12rem)_minmax(14rem,1fr)_8rem]">
                            <select
                              value={answer?.status ?? ""}
                              onChange={(event) =>
                                patchAnswer(section.id, item.id, {
                                  status:
                                    event.target.value === ""
                                      ? null
                                      : (event.target
                                          .value as StaffChecklistAnswerStatus),
                                })
                              }
                              className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                            >
                              <option value="">Результат</option>
                              {Object.entries(answerStatusLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                            <input
                              value={answer?.value ?? ""}
                              onChange={(event) =>
                                patchAnswer(section.id, item.id, {
                                  value: event.target.value,
                                })
                              }
                              placeholder="Короткий результат или отметка"
                              className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                submitAnswer(
                                  section.id,
                                  item.id,
                                  item.evidenceRequired,
                                )
                              }
                              disabled={
                                isPending ||
                                (isSubmitted && !canResubmitSubmittedItem)
                              }
                              className="h-10 w-full min-w-32 whitespace-nowrap rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                              title={
                                isSubmitted && !canResubmitSubmittedItem
                                  ? "Пункт уже отправлен"
                                  : item.evidenceRequired && !hasEvidence
                                    ? "Перед отправкой понадобится доказательство"
                                    : "Зафиксировать выполнение пункта"
                              }
                            >
                              {isSubmitted && !canResubmitSubmittedItem
                                ? "Отправлено"
                                : isSubmitted
                                  ? "Отправить снова"
                                  : "Отправить"}
                            </button>
                          </div>
                          <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                            <summary className="cursor-pointer text-xs font-semibold uppercase text-zinc-500">
                              Доказательство и комментарий
                            </summary>
                            <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                              <input
                                value={answer?.evidenceUrl ?? ""}
                                onChange={(event) =>
                                  patchAnswer(section.id, item.id, {
                                    evidenceUrl: event.target.value,
                                  })
                                }
                                placeholder="Ссылка на фото/файл, если он уже загружен отдельно"
                                className="h-10 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                              />
                              <StaffAttachmentUpload
                                label="Добавить фото или файлы"
                                buttonLabel="Добавить фото"
                                className="min-w-0"
                                multiple
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                compressImages
                                onUploaded={(attachment) =>
                                  appendEvidenceAttachment(
                                    section.id,
                                    item.id,
                                    attachment,
                                  )
                                }
                              />
                            </div>
                            {evidenceAttachments.length > 0 ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {evidenceAttachments.map((attachment, index) => (
                                  <div
                                    key={`${attachment.id}-${index}`}
                                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                                  >
                                    <a
                                      href={getAttachmentHref(attachment)}
                                      onClick={(event) => {
                                        if (!isPreviewableImage(attachment)) {
                                          return;
                                        }

                                        event.preventDefault();
                                        setPreviewAttachment(attachment);
                                      }}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="min-w-0 truncate font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                                    >
                                      {attachment.fileName}
                                      {attachment.byteSize > 0
                                        ? ` · ${formatAttachmentSize(
                                            attachment.byteSize,
                                          )}`
                                        : ""}
                                    </a>
                                    {!isSubmitted ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeEvidenceAttachment(
                                            section.id,
                                            item.id,
                                            attachment.id,
                                          )
                                        }
                                        className="shrink-0 rounded-md px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-900"
                                      >
                                        Убрать
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <textarea
                              value={answer?.note ?? ""}
                              onChange={(event) =>
                                patchAnswer(section.id, item.id, {
                                  note: event.target.value,
                                })
                              }
                              placeholder="Комментарий по пункту"
                              rows={2}
                              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                            />
                          </details>
                          {canReviewRun || reviewThreads.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDiscussionTarget({
                                  sectionId: section.id,
                                  itemId: item.id,
                                })
                              }
                              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/15"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span aria-hidden="true">▸</span>
                                <span className="truncate">
                                  Необходимо уточнение
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {openReviewThreads.length > 0 ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-400/20 dark:text-amber-100">
                                    открыто {openReviewThreads.length}
                                  </span>
                                ) : null}
                                {reviewMessagesCount > 0 ? (
                                  <span className="rounded-full bg-white px-2 py-0.5 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                                    {reviewMessagesCount} коммент.
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <label className="block text-sm">
          <span className="text-xs font-semibold uppercase text-zinc-500">
            {canReviewRun ? "Комментарий проверки" : "Комментарий к выполнению"}
          </span>
          <textarea
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            placeholder={
              canReviewRun
                ? "Почему приняли, вернули или эскалировали чеклист"
                : "Что сделано, что важно проверить или где есть проблема"
            }
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton disabled={isPending} onClick={() => updateRun("IN_PROGRESS")}>
            Сохранить
          </ActionButton>
          <button
            type="button"
            onClick={() => updateRun("ON_REVIEW")}
            disabled={isPending || localBlockingIssues.length > 0}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отправить на проверку
          </button>
          {canCancelRun ? (
            <button
              type="button"
              onClick={cancelRun}
              disabled={isPending}
              title="Отменить некорректный чек-лист"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-100"
            >
              Отменить
            </button>
          ) : null}
          {canReviewRun ? (
            <>
              <button
                type="button"
                onClick={() => updateRun("ACCEPTED")}
                disabled={isPending || run.status !== "ON_REVIEW"}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
              >
                Принять
              </button>
              <button
                type="button"
                onClick={() => updateRun("RETURNED")}
                disabled={isPending || run.status !== "ON_REVIEW"}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
              >
                Вернуть
              </button>
              <button
                type="button"
                onClick={() => updateRun("ESCALATED")}
                disabled={isPending || run.status !== "ON_REVIEW"}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
              >
                Эскалировать
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
    {discussionContext ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Необходимо уточнение"
        onClick={closeDiscussion}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">
                Необходимо уточнение
              </p>
              <h3 className="mt-1 text-base font-semibold">
                {discussionContext.item.title}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {discussionContext.section.title}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDiscussion}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Свернуть
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {discussionContext.threads.length > 0 ? (
              <div className="space-y-3">
                {discussionContext.threads.map((thread) => (
                  <ReviewThreadCard
                    key={thread.id}
                    thread={thread}
                    onPreviewAttachment={setPreviewAttachment}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-800">
                Комментариев по пункту пока нет. Проверяющий может открыть
                уточнение, а администратор ответит здесь же.
              </div>
            )}
          </div>

          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="grid gap-2">
              <textarea
                value={discussionBody}
                onChange={(event) => setDiscussionBody(event.target.value)}
                rows={3}
                placeholder={
                  canReviewRun
                    ? "Что нужно уточнить или исправить по этому пункту"
                    : "Ответ на комментарий проверяющего"
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={discussionAttachmentUrl}
                  onChange={(event) =>
                    setDiscussionAttachmentUrl(event.target.value)
                  }
                  placeholder="Ссылка на фото/файл, если он уже загружен отдельно"
                  className="h-10 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
                <StaffAttachmentUpload
                  label="Фото или файл к уточнению"
                  buttonLabel="Добавить фото"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  compressImages
                  onUploaded={appendDiscussionAttachment}
                />
              </div>
              {discussionAttachments.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {discussionAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <span className="min-w-0 truncate font-semibold">
                        {attachment.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDiscussionAttachment(attachment.id)}
                        className="shrink-0 rounded-md px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-900"
                      >
                        Убрать
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2">
                {canReviewRun && discussionContext.openThread ? (
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <input
                      value={resolveComment}
                      onChange={(event) => setResolveComment(event.target.value)}
                      placeholder="Комментарий при зачете, если нужен"
                      className="h-10 min-w-56 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={resolveDiscussionThread}
                      disabled={isDiscussionPending}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                    >
                      Зачесть пункт
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={submitDiscussionMessage}
                  disabled={isDiscussionPending}
                  className="ml-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {previewAttachment && previewAttachmentHref ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр фото"
        onClick={() => setPreviewAttachment(null)}
      >
        <div
          className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">
                {previewAttachment.fileName}
              </p>
              {previewAttachment.byteSize > 0 ? (
                <p className="text-xs text-zinc-400">
                  {formatAttachmentSize(previewAttachment.byteSize)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={previewAttachmentHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900"
              >
                Открыть оригинал
              </a>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900"
              >
                Закрыть
              </button>
            </div>
          </div>
          <div className="flex max-h-[78vh] items-center justify-center overflow-auto bg-black p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewAttachmentHref}
              alt={previewAttachment.fileName}
              className="max-h-[74vh] max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

function ReviewThreadCard({
  thread,
  onPreviewAttachment,
}: {
  thread: StaffChecklistReviewThread;
  onPreviewAttachment: (attachment: StaffChecklistEvidenceAttachment) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={
            thread.status === "OPEN"
              ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-400/20 dark:text-amber-100"
              : "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-100"
          }
        >
          {thread.status === "OPEN" ? "Открыто" : "Зачтено"}
        </span>
        <span className="text-xs text-zinc-500">
          {formatCompletionDateTime(thread.createdAt)}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {thread.messages.map((message) => (
          <ReviewThreadMessageRow
            key={message.id}
            message={message}
            onPreviewAttachment={onPreviewAttachment}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewThreadMessageRow({
  message,
  onPreviewAttachment,
}: {
  message: StaffChecklistReviewThreadMessage;
  onPreviewAttachment: (attachment: StaffChecklistEvidenceAttachment) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{message.authorName}</p>
          {message.authorRole ? (
            <p className="text-xs text-zinc-500">{message.authorRole}</p>
          ) : null}
        </div>
        <span className="text-xs text-zinc-500">
          {formatCompletionDateTime(message.createdAt)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">
        {message.body}
      </p>
      {message.attachments.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {message.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={getAttachmentHref(attachment)}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!isPreviewableImage(attachment)) {
                  return;
                }

                event.preventDefault();
                onPreviewAttachment(attachment);
              }}
              className="min-w-0 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              {attachment.fileName}
              {attachment.byteSize > 0
                ? ` · ${formatAttachmentSize(attachment.byteSize)}`
                : ""}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "bad"
        ? "text-red-600 dark:text-red-300"
        : "text-zinc-950 dark:text-zinc-100";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      {children}
    </span>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}
