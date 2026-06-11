"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  StaffChecklistRun,
  StaffChecklistStatus,
  StaffChecklistTemplateOption,
} from "@/lib/staff-checklists";

const statusLabels: Record<StaffChecklistStatus, string> = {
  OPEN: "Новый",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Принят",
  RETURNED: "Возвращен",
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
}: {
  report: StaffChecklistReport;
  focusRunId?: string | null;
  canCreateRuns?: boolean;
  canReviewRuns?: boolean;
}) {
  const router = useRouter();
  const initialRunId =
    (focusRunId && report.rows.some((run) => run.id === focusRunId)
      ? focusRunId
      : report.rows[0]?.id) ?? "";
  const [selectedRunId, setSelectedRunId] = useState(initialRunId);
  const selectedRun =
    report.rows.find((run) => run.id === selectedRunId) ??
    report.rows[0] ??
    null;
  const sourceOptions = useMemo<ChecklistSourceOption[]>(
    () =>
      canCreateRuns
        ? [
            ...report.publishedRegulations.map((regulation) => ({
              ...regulation,
              key: `regulation:${regulation.id}`,
              kind: "REGULATION" as const,
            })),
            ...report.checklistTemplates.map((template) => ({
              ...template,
              key: `template:${template.id}`,
              kind: "TEMPLATE" as const,
            })),
          ]
        : [],
    [canCreateRuns, report.checklistTemplates, report.publishedRegulations],
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
        assignedToUserId: assignedToUserId || null,
        scheduledAt: scheduledAt || null,
      }),
    });

    setIsPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const run = (await response.json()) as StaffChecklistRun;
    setSelectedRunId(run.id);
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
            {report.rows.map((run) => (
              <button
                key={run.id}
                id={`run-${run.id}`}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
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
                      {run.store?.name ?? "Вся сеть"} ·{" "}
                      {formatDateTime(run.scheduledAt)}
                    </p>
                  </div>
                  <span className={statusClass(run.status, run.isOverdue)}>
                    {run.isOverdue ? "Просрочен" : statusLabels[run.status]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {selectedRun ? (
          <ChecklistRunEditor
            key={selectedRun.id}
            run={selectedRun}
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
    };
    const fallbackMessage = status
      ? (successMessages[status] ?? "Чеклист обновлен.")
      : "Чеклист обновлен.";
    setMessage(successMessage ?? fallbackMessage);
    router.refresh();
  }

  async function submitAnswer(
    sectionId: string,
    itemId: string,
    evidenceRequired = false,
  ) {
    const currentAnswer = answersByKey.get(`${sectionId}::${itemId}`);

    if (currentAnswer?.completedAt) {
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
            completedAt: null,
          }
        : answer,
    );
    const nextStatus =
      run.status === "OPEN" || run.status === "RETURNED"
        ? "IN_PROGRESS"
        : undefined;

    await updateRun(
      nextStatus,
      nextAnswers,
      "Пункт отправлен. Время выполнения зафиксировано.",
    );
  }

  return (
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
                const evidenceAttachments = getEvidenceAttachments(answer);
                const hasEvidence = answerHasEvidence(answer);

                return (
                  <div key={item.id} className="px-3 py-3 sm:px-4">
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
                              disabled={isPending || isSubmitted}
                              className="h-10 w-full min-w-32 whitespace-nowrap rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                              title={
                                isSubmitted
                                  ? "Пункт уже отправлен"
                                  : item.evidenceRequired && !hasEvidence
                                    ? "Перед отправкой понадобится доказательство"
                                    : "Зафиксировать выполнение пункта"
                              }
                            >
                              {isSubmitted ? "Отправлено" : "Отправить"}
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
                                      href={attachment.url}
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
