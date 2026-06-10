"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  staffShiftRegulationTemplates,
  type StaffShiftRegulationTemplate,
} from "@/lib/staff-shift-regulation-templates";
import { useUnsavedDraftPrompt } from "@/hooks/use-unsaved-draft-prompt";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import { StaffTemplatePreview } from "@/components/staff-template-preview";
import type {
  StaffShiftRegulationAttachment,
  StaffShiftRegulationAttachmentType,
  StaffShiftItemValueType,
  StaffShiftKind,
  StaffShiftRegulation,
  StaffShiftRegulationAssessmentOption,
  StaffShiftRegulationItem,
  StaffShiftRegulationSection,
  StaffShiftRegulationStatus,
  StaffShiftRegulationStore,
  StaffShiftRoleScope,
} from "@/lib/staff-shift-regulations";

const shiftKindLabels: Record<StaffShiftKind, string> = {
  OPENING: "Открытие смены",
  CLOSING: "Закрытие смены",
  CASH: "Касса",
  BAR: "Бар",
  PC_ZONE: "PC-зона",
  CLEANLINESS: "Чистота",
  INCIDENT: "Инциденты",
  INVENTORY: "Передача остатков",
  CUSTOM: "Свой регламент",
};

const statusLabels: Record<StaffShiftRegulationStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffShiftRoleScope, string> = {
  ADMINISTRATOR: "Администратор",
  SENIOR_ADMINISTRATOR: "Старший администратор",
  MANAGER: "Менеджер",
  ALL_STAFF: "Весь персонал",
};

const valueTypeLabels: Record<StaffShiftItemValueType, string> = {
  CHECKBOX: "Да/нет",
  TEXT: "Текст",
  NUMBER: "Число",
  PHOTO_LINK: "Ссылка на фото",
  FILE_LINK: "Ссылка на файл",
  SELECT: "Выбор",
  TIMESTAMP: "Время",
};

const attachmentTypeLabels: Record<StaffShiftRegulationAttachmentType, string> =
  {
    DOCUMENT: "Документ",
    IMAGE: "Изображение",
    VIDEO: "Видео",
    FILE_LINK: "Файл",
    EXTERNAL_LINK: "Ссылка",
    OTHER: "Другое",
  };

const assessmentKindLabels: Record<string, string> = {
  TEST: "Тест",
  ATTESTATION: "Аттестация",
};

type DraftRegulation = {
  id: string | null;
  title: string;
  description: string;
  shiftKind: StaffShiftKind;
  status: StaffShiftRegulationStatus;
  roleScope: StaffShiftRoleScope;
  storeId: string;
  effectiveFrom: string;
  requiresAssessmentRetake: boolean;
  assessmentId: string;
  attachments: StaffShiftRegulationAttachment[];
  sections: StaffShiftRegulationSection[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function attachmentTypeFromUpload(
  attachment: StaffAttachmentUploadResult,
): StaffShiftRegulationAttachmentType {
  if (attachment.contentType.startsWith("image/")) {
    return "IMAGE";
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

  return "FILE_LINK";
}

function cloneSections(sections: StaffShiftRegulationSection[]) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));
}

function draftFromTemplate(
  template: StaffShiftRegulationTemplate,
): DraftRegulation {
  return {
    id: null,
    title: template.title,
    description: template.description,
    shiftKind: template.shiftKind,
    status: "DRAFT",
    roleScope: template.roleScope,
    storeId: "",
    effectiveFrom: "",
    requiresAssessmentRetake: false,
    assessmentId: "",
    attachments: [],
    sections: cloneSections(template.sections),
  };
}

function defaultDraft(): DraftRegulation {
  return {
    id: null,
    title: "Открытие смены администратора",
    description: "Единый порядок подготовки клуба к рабочему дню.",
    shiftKind: "OPENING",
    status: "DRAFT",
    roleScope: "ADMINISTRATOR",
    storeId: "",
    effectiveFrom: "",
    requiresAssessmentRetake: false,
    assessmentId: "",
    attachments: [],
    sections: [
      {
        id: uid("section"),
        title: "Подготовка смены",
        description: "Что нужно проверить до приема гостей.",
        items: [
          {
            id: uid("item"),
            title: "Сверить кассу и терминал",
            instruction:
              "Проверить стартовый остаток, работоспособность терминала и порядок в кассовой зоне.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: uid("item"),
            title: "Проверить зал и рабочие места",
            instruction:
              "Осмотреть ПК, периферию, чистоту столов, проходов и зоны ожидания.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
        ],
      },
    ],
  };
}

function fromRegulation(row: StaffShiftRegulation): DraftRegulation {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    shiftKind: row.shiftKind,
    status: row.status,
    roleScope: row.roleScope,
    storeId: row.store?.id ?? "",
    effectiveFrom: row.effectiveFrom?.slice(0, 16) ?? "",
    requiresAssessmentRetake: row.requiresAssessmentRetake,
    assessmentId: row.assessmentId ?? "",
    attachments: row.attachments,
    sections: row.sections,
  };
}

function draftSnapshot(draft: DraftRegulation) {
  return JSON.stringify(draft);
}

function formatAssessmentOption(
  assessment: StaffShiftRegulationAssessmentOption,
) {
  const kind = assessmentKindLabels[assessment.assessmentKind] ?? "Проверка";
  return `${kind}: ${assessment.title}${
    assessment.store ? ` · ${assessment.store.name}` : " · вся сеть"
  }`;
}

function statusClass(status: StaffShiftRegulationStatus) {
  if (status === "PUBLISHED") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  }

  if (status === "ARCHIVED") {
    return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  }

  return "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StaffShiftRegulationBuilder({
  rows,
  stores,
  assessments,
  currentUserId,
  currentUserRole,
}: {
  rows: StaffShiftRegulation[];
  stores: StaffShiftRegulationStore[];
  assessments: StaffShiftRegulationAssessmentOption[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const initialDraft = rows[0] ? fromRegulation(rows[0]) : defaultDraft();
  const [draft, setDraft] = useState<DraftRegulation>(() =>
    initialDraft,
  );
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState(() =>
    draftSnapshot(initialDraft),
  );
  const [isPending, setIsPending] = useState(false);
  const [acknowledgementPendingId, setAcknowledgementPendingId] = useState<
    string | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isConstructorOpen, setIsConstructorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageRegulations = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "CLUB_MANAGER",
    "STANDARDS_MANAGER",
    "SENIOR_ADMINISTRATOR",
  ].includes(currentUserRole);
  const canForceDeleteRegulations = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "CLUB_MANAGER",
  ].includes(currentUserRole);
  const selectedRow = draft.id
    ? rows.find((row) => row.id === draft.id) ?? null
    : null;
  const canDeleteSelectedRegulation = Boolean(
    selectedRow &&
      (canForceDeleteRegulations ||
        selectedRow.createdByUser?.id === currentUserId),
  );
  const selectedStoreName =
    stores.find((store) => store.id === draft.storeId)?.name ?? "Вся сеть";
  const currentDraftSnapshot = useMemo(() => draftSnapshot(draft), [draft]);
  const hasUnsavedChanges =
    canManageRegulations &&
    !isPending &&
    !deletingId &&
    currentDraftSnapshot !== savedDraftSnapshot;

  const totals = useMemo(() => {
    const items = draft.sections.flatMap((section) => section.items);

    return {
      sections: draft.sections.length,
      items: items.length,
      required: items.filter((item) => item.required).length,
      evidence: items.filter((item) => item.evidenceRequired).length,
      score: items.reduce((sum, item) => sum + item.score, 0),
      attachments: draft.attachments.filter(
        (attachment) => attachment.title.trim() && attachment.url.trim(),
      ).length,
    };
  }, [draft.attachments, draft.sections]);

  function updateDraft(patch: Partial<DraftRegulation>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function loadRegulation(row: StaffShiftRegulation | null) {
    const nextDraft = row ? fromRegulation(row) : defaultDraft();
    setDraft(nextDraft);
    setSavedDraftSnapshot(draftSnapshot(nextDraft));
    setIsConstructorOpen(true);
    setError(null);
  }

  function applyTemplate(template: StaffShiftRegulationTemplate) {
    setDraft(draftFromTemplate(template));
    setIsConstructorOpen(true);
    setError(null);
  }

  function updateSection(
    sectionId: string,
    patch: Partial<StaffShiftRegulationSection>,
  ) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    }));
  }

  function updateItem(
    sectionId: string,
    itemId: string,
    patch: Partial<StaffShiftRegulationItem>,
  ) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : section,
      ),
    }));
  }

  function addSection() {
    setDraft((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          id: uid("section"),
          title: "Новый раздел",
          description: "",
          items: [
            {
              id: uid("item"),
              title: "Новый пункт",
              instruction: "",
              valueType: "CHECKBOX",
              required: true,
              evidenceRequired: false,
              score: 1,
            },
          ],
        },
      ],
    }));
  }

  function removeSection(sectionId: string) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId),
    }));
  }

  function addItem(sectionId: string) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: [
                ...section.items,
                {
                  id: uid("item"),
                  title: "Новый пункт",
                  instruction: "",
                  valueType: "CHECKBOX",
                  required: true,
                  evidenceRequired: false,
                  score: 1,
                },
              ],
            }
          : section,
      ),
    }));
  }

  function removeItem(sectionId: string, itemId: string) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.filter((item) => item.id !== itemId),
            }
          : section,
      ),
    }));
  }

  function addAttachment() {
    setDraft((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        {
          id: uid("attachment"),
          title: "",
          type: "DOCUMENT",
          url: "",
          note: "",
          required: false,
        },
      ],
    }));
  }

  function updateAttachment(
    attachmentId: string,
    patch: Partial<StaffShiftRegulationAttachment>,
  ) {
    setDraft((current) => ({
      ...current,
      attachments: current.attachments.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, ...patch }
          : attachment,
      ),
    }));
  }

  function removeAttachment(attachmentId: string) {
    setDraft((current) => ({
      ...current,
      attachments: current.attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      ),
    }));
  }

  async function save(statusOverride?: StaffShiftRegulationStatus) {
    if (!canManageRegulations) {
      setError("Редактирование регламентов доступно управляющим ролям.");
      return false;
    }

    const title = draft.title.trim();

    if (!title) {
      setError("Укажите название регламента.");
      return false;
    }

    if (draft.sections.length === 0) {
      setError("Добавьте хотя бы один раздел.");
      return false;
    }

    const hasItems = draft.sections.some((section) =>
      section.items.some((item) => item.title.trim()),
    );

    if (!hasItems) {
      setError("Добавьте хотя бы один пункт регламента.");
      return false;
    }

    const incompleteAttachment = draft.attachments.find((attachment) => {
      const title = attachment.title.trim();
      const url = attachment.url.trim();

      return (title || url) && (!title || !url);
    });

    if (incompleteAttachment) {
      setError("Для каждого материала укажите название и ссылку.");
      return false;
    }

    if (draft.requiresAssessmentRetake && !draft.assessmentId) {
      setError("Выберите активный тест или аттестацию для пересдачи после публикации.");
      return false;
    }

    setIsPending(true);
    setError(null);

    const payload = {
      title,
      description: draft.description.trim() || null,
      shiftKind: draft.shiftKind,
      status: statusOverride ?? draft.status,
      roleScope: draft.roleScope,
      storeId: draft.storeId || null,
      effectiveFrom: draft.effectiveFrom
        ? new Date(draft.effectiveFrom).toISOString()
        : null,
      requiresAssessmentRetake: draft.requiresAssessmentRetake,
      assessmentId: draft.requiresAssessmentRetake ? draft.assessmentId : null,
      attachments: draft.attachments
        .map((attachment) => ({
          ...attachment,
          title: attachment.title.trim(),
          url: attachment.url.trim(),
          note: attachment.note?.trim() || null,
        }))
        .filter((attachment) => attachment.title && attachment.url),
      sections: draft.sections.map((section) => ({
        ...section,
        title: section.title.trim() || "Раздел",
        description: section.description?.trim() || null,
        items: section.items
          .map((item) => ({
            ...item,
            title: item.title.trim(),
            instruction: item.instruction?.trim() || null,
            score: Number.isFinite(item.score) ? item.score : 1,
          }))
          .filter((item) => item.title),
      })),
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/staff/shift-regulations/${draft.id}`
          : "/api/staff/shift-regulations",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось сохранить регламент");
      }

      const saved = (await response.json()) as StaffShiftRegulation;
      const savedDraft = fromRegulation(saved);
      setDraft(savedDraft);
      setSavedDraftSnapshot(draftSnapshot(savedDraft));
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
      return false;
    } finally {
      setIsPending(false);
    }
  }

  async function acknowledge(row: StaffShiftRegulation) {
    setAcknowledgementPendingId(row.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/staff/shift-regulations/${encodeURIComponent(
          row.id,
        )}/acknowledgements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось подтвердить регламент");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setAcknowledgementPendingId(null);
    }
  }

  async function deleteRegulation(row: StaffShiftRegulation) {
    if (!canDeleteSelectedRegulation) {
      setError(
        "Удалить регламент может автор, управляющий клубом, управляющий сети или владелец.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Удалить регламент "${row.title}" навсегда? Он исчезнет из каталога, а история выполненных чек-листов останется сохраненной.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(row.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/staff/shift-regulations/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось удалить регламент");
      }

      const nextRow = rows.find((candidate) => candidate.id !== row.id);
      const nextDraft = nextRow ? fromRegulation(nextRow) : defaultDraft();
      setDraft(nextDraft);
      setSavedDraftSnapshot(draftSnapshot(nextDraft));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setDeletingId(null);
    }
  }

  const { prompt: unsavedDraftPrompt, guardAction } = useUnsavedDraftPrompt({
    enabled: hasUnsavedChanges,
    onSaveDraft: () => save("DRAFT"),
  });

  return (
    <>
      {unsavedDraftPrompt}
      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Каталог
            </p>
            <h2 className="mt-1 text-lg font-semibold">Регламенты смены</h2>
          </div>
          <button
            type="button"
            onClick={() => guardAction(() => loadRegulation(null))}
            disabled={!canManageRegulations}
            className="h-9 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Новый
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Шаблоны из регламента
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Дневная и ночная смена администратора по текущему файлу.
          </p>
          <div className="mt-3 space-y-2">
            {staffShiftRegulationTemplates.map((template) => {
              const sectionsCount = template.sections.length;
              const itemsCount = template.sections.reduce(
                (sum, section) => sum + section.items.length,
                0,
              );
              const isCurrentTemplate =
                !draft.id && draft.title === template.title;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className={[
                    "w-full rounded-md border p-3 text-left transition hover:border-emerald-500/70 hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
                    isCurrentTemplate
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                  ].join(" ")}
                >
                  <span className="block text-sm font-semibold">
                    {template.subtitle}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {sectionsCount} разделов, {itemsCount} пунктов
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              Пока нет сохраненных регламентов.
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => guardAction(() => loadRegulation(row))}
                className={[
                  "w-full rounded-md border p-3 text-left transition hover:border-emerald-500/70 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10",
                  draft.id === row.id
                    ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10"
                    : "border-zinc-200 dark:border-zinc-800",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{row.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(
                      row.status,
                    )}`}
                  >
                    {statusLabels[row.status]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {shiftKindLabels[row.shiftKind]} · {row.store?.name ?? "Вся сеть"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {row.sectionsCount} разд., {row.itemsCount} пунктов,{" "}
                  материалов: {row.attachmentsCount}, v{row.version}
                </p>
                {row.requiresAssessmentRetake ? (
                  <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                    Пересдача:{" "}
                    {row.assessment ? row.assessment.title : "проверка не выбрана"}
                  </p>
                ) : null}
                {row.status === "PUBLISHED" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>
                      Ознакомились:{" "}
                      {row.acknowledgementSummary.acknowledgedCount}/
                      {row.acknowledgementSummary.requiredCount}
                    </span>
                    {row.acknowledgementSummary.pendingCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                        ждут {row.acknowledgementSummary.pendingCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Конструктор
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {draft.id ? "Редактирование регламента" : "Новый регламент"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsConstructorOpen((current) => !current)}
              className={[
                "h-10 rounded-md border px-3 text-sm font-semibold transition",
                isConstructorOpen
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900",
              ].join(" ")}
            >
              {isConstructorOpen ? "Свернуть" : "Открыть конструктор"}
            </button>
            {isConstructorOpen ? (
              <button
                type="button"
                onClick={() => setIsPreviewOpen((current) => !current)}
                className={[
                  "h-10 rounded-md border px-3 text-sm font-semibold transition",
                  isPreviewOpen
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                {isPreviewOpen ? "Скрыть предпросмотр" : "Предпросмотр"}
              </button>
            ) : null}
            {selectedRow?.status === "PUBLISHED" && canManageRegulations ? (
              <Link
                href={`/staff/checklist-templates?sourceRegulationId=${encodeURIComponent(
                  selectedRow.id,
                )}`}
                className="inline-flex h-10 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
              >
                Создать чек-лист
              </Link>
            ) : null}
            {canManageRegulations ? (
              <>
                {isConstructorOpen ? (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => save("DRAFT")}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Сохранить черновик
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => save("PUBLISHED")}
                      className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectedRow?.status === "PUBLISHED"
                        ? "Опубликовать новую версию"
                        : "Опубликовать"}
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
            {draft.id && canManageRegulations && isConstructorOpen ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => save("ARCHIVED")}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                В архив
              </button>
            ) : null}
            {selectedRow && canDeleteSelectedRegulation ? (
              <button
                type="button"
                disabled={Boolean(deletingId) || isPending}
                onClick={() => deleteRegulation(selectedRow)}
                className="h-10 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-200 dark:hover:bg-red-950/30"
              >
                {deletingId === selectedRow.id
                  ? "Удаляем..."
                  : "Удалить навсегда"}
              </button>
            ) : null}
            {selectedRow?.status === "PUBLISHED" &&
            selectedRow.acknowledgementSummary.requiredByMe &&
            !selectedRow.acknowledgementSummary.acknowledgedByMe ? (
              <button
                type="button"
                disabled={acknowledgementPendingId === selectedRow.id}
                onClick={() => acknowledge(selectedRow)}
                className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acknowledgementPendingId === selectedRow.id
                  ? "Подтверждаем..."
                  : "Подтвердить ознакомление"}
              </button>
            ) : null}
          </div>
        </div>

        {isConstructorOpen ? (
          <>
        {selectedRow?.status === "PUBLISHED" ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Ознакомление
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Версия v{selectedRow.version}. Требуется подтверждение для
                  сотрудников выбранной роли и клуба.
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">
                  {selectedRow.acknowledgementSummary.acknowledgedCount}/
                  {selectedRow.acknowledgementSummary.requiredCount}
                </p>
                <p className="text-xs text-zinc-500">
                  ждут: {selectedRow.acknowledgementSummary.pendingCount}
                </p>
              </div>
            </div>
            {selectedRow.acknowledgementSummary.acknowledgedByMe ? (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                Вы подтвердили ознакомление{" "}
                {formatDateTime(selectedRow.acknowledgementSummary.acknowledgedAt)}.
              </p>
            ) : null}
            {selectedRow.requiresAssessmentRetake ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="font-semibold">После этой версии требуется пересдача</p>
                <p className="mt-1 text-xs">
                  {selectedRow.assessment
                    ? formatAssessmentOption(selectedRow.assessment)
                    : "Связанная проверка была удалена или архивирована."}
                </p>
              </div>
            ) : null}
            {selectedRow.acknowledgements.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedRow.acknowledgements.slice(0, 8).map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
                  >
                    {item.user.fullName ?? item.user.email}
                  </span>
                ))}
              </div>
            ) : null}
            {selectedRow.attachments.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {selectedRow.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-zinc-200 bg-white p-3 text-sm transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-emerald-500/10"
                  >
                    <span className="font-semibold">{attachment.title}</span>
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {attachmentTypeLabels[attachment.type]}
                    </span>
                    {attachment.required ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                        обязательно
                      </span>
                    ) : null}
                    {attachment.note ? (
                      <span className="mt-1 block text-xs text-zinc-500">
                        {attachment.note}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedRow ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  История версий
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Опубликованные снимки регламента. Чеклисты и ознакомления
                  остаются привязаны к своей версии.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                v{selectedRow.version}
              </span>
            </div>

            {selectedRow.versions.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {selectedRow.versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          v{version.version} · {version.title}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {shiftKindLabels[version.shiftKind]} ·{" "}
                          {roleScopeLabels[version.roleScope]} ·{" "}
                          {version.store?.name ?? "Вся сеть"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        {version.version === selectedRow.version ? (
                          <span className="mb-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                            текущая
                          </span>
                        ) : null}
                        <p>{formatDateTime(version.publishedAt)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {version.sectionsCount} разд., {version.itemsCount}{" "}
                      пунктов, с доказательством:{" "}
                      {version.requiredEvidenceItems}
                      {version.attachmentsCount > 0
                        ? ` · материалов: ${version.attachmentsCount}`
                        : ""}
                      {version.requiresAssessmentRetake
                        ? ` · пересдача: ${
                            version.assessmentTitle ?? "проверка не выбрана"
                          }`
                        : ""}
                      {version.createdByUser
                        ? ` · опубликовал ${
                            version.createdByUser.fullName ??
                            version.createdByUser.email
                          }`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                История начнет фиксироваться при публикации следующей версии.
              </p>
            )}
          </div>
        ) : null}

        {isPreviewOpen ? (
          <div className="mt-4">
            <StaffTemplatePreview
              title={draft.title}
              description={draft.description || null}
              roleLabel={roleScopeLabels[draft.roleScope]}
              scopeLabel={selectedStoreName}
              shiftKindLabel={shiftKindLabels[draft.shiftKind]}
              statusLabel={statusLabels[draft.status]}
              sections={draft.sections}
              attachments={draft.attachments}
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr]">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Название
            </span>
            <input
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Тип смены
            </span>
            <select
              value={draft.shiftKind}
              onChange={(event) =>
                updateDraft({ shiftKind: event.target.value as StaffShiftKind })
              }
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {Object.entries(shiftKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Клуб
            </span>
            <select
              value={draft.storeId}
              onChange={(event) => updateDraft({ storeId: event.target.value })}
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Вся сеть</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Роль
            </span>
            <select
              value={draft.roleScope}
              onChange={(event) =>
                updateDraft({
                  roleScope: event.target.value as StaffShiftRoleScope,
                })
              }
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {Object.entries(roleScopeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Действует с
            </span>
            <input
              type="datetime-local"
              value={draft.effectiveFrom}
              onChange={(event) =>
                updateDraft({ effectiveFrom: event.target.value })
              }
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Структура
            </p>
            <p className="mt-1 font-semibold">
              {totals.sections} разд. · {totals.items} пунктов · {totals.score} баллов
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Обязательных: {totals.required}, с доказательством:{" "}
              {totals.evidence}, материалов: {totals.attachments}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
            <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm transition hover:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-950">
              <input
                type="checkbox"
                checked={draft.requiresAssessmentRetake}
                onChange={(event) =>
                  updateDraft({
                    requiresAssessmentRetake: event.target.checked,
                    assessmentId: event.target.checked ? draft.assessmentId : "",
                  })
                }
                className="mt-1"
              />
              <span>
                <span className="block text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Контроль знаний
                </span>
                <span className="mt-1 block font-semibold">
                  Требовать пересдачу после публикации
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  Новая версия регламента останется с обязательным ознакомлением, а сотрудник увидит связанный тест или аттестацию как следующий контроль.
                </span>
              </span>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Тест или аттестация
              </span>
              <select
                value={draft.assessmentId}
                disabled={!draft.requiresAssessmentRetake || assessments.length === 0}
                onChange={(event) =>
                  updateDraft({ assessmentId: event.target.value })
                }
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">
                  {assessments.length === 0
                    ? "Сначала создайте активный тест"
                    : "Выберите проверку"}
                </option>
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {formatAssessmentOption(assessment)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Описание
          </span>
          <textarea
            rows={2}
            value={draft.description}
            onChange={(event) =>
              updateDraft({ description: event.target.value })
            }
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Материалы регламента
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Прикрепите ссылки на файл регламента, фото-инструкцию, видео или
                внешний документ. При публикации материалы попадут в снимок версии.
              </p>
            </div>
            <button
              type="button"
              onClick={addAttachment}
              className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Добавить материал
            </button>
          </div>

          {draft.attachments.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              Материалов пока нет. Можно оставить пустым или добавить ссылку на
              актуальный документ, видеоразбор или чек-лист стандарта.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {draft.attachments.map((attachment, attachmentIndex) => (
                <div
                  key={attachment.id}
                  className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50"
                >
                  <div className="grid gap-3 lg:grid-cols-[1fr_11rem_1.5fr_auto]">
                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase text-zinc-500">
                        Материал {attachmentIndex + 1}
                      </span>
                      <input
                        value={attachment.title}
                        onChange={(event) =>
                          updateAttachment(attachment.id, {
                            title: event.target.value,
                          })
                        }
                        placeholder="Например: регламент смены PDF"
                        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase text-zinc-500">
                        Тип
                      </span>
                      <select
                        value={attachment.type}
                        onChange={(event) =>
                          updateAttachment(attachment.id, {
                            type: event.target
                              .value as StaffShiftRegulationAttachmentType,
                          })
                        }
                        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {Object.entries(attachmentTypeLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase text-zinc-500">
                        Ссылка
                      </span>
                      <input
                        value={attachment.url}
                        onChange={(event) =>
                          updateAttachment(attachment.id, {
                            url: event.target.value,
                          })
                        }
                        placeholder="https://..."
                        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <StaffAttachmentUpload
                        label="Загрузить материал"
                        buttonLabel="Загрузить файл"
                        onUploaded={(uploaded) =>
                          updateAttachment(attachment.id, {
                            title: attachment.title || uploaded.fileName,
                            type: attachmentTypeFromUpload(uploaded),
                            url: uploaded.url,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
                        <input
                          type="checkbox"
                          checked={attachment.required}
                          onChange={(event) =>
                            updateAttachment(attachment.id, {
                              required: event.target.checked,
                            })
                          }
                        />
                        Обяз.
                      </label>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        Убрать
                      </button>
                    </div>
                  </div>

                  <label className="mt-3 block space-y-1">
                    <span className="text-xs font-bold uppercase text-zinc-500">
                      Примечание
                    </span>
                    <input
                      value={attachment.note ?? ""}
                      onChange={(event) =>
                        updateAttachment(attachment.id, {
                          note: event.target.value,
                        })
                      }
                      placeholder="Что сотрудник должен посмотреть в материале"
                      className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Секции и пункты</h3>
          <button
            type="button"
            onClick={addSection}
            className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Добавить раздел
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {draft.sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr_auto]">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Раздел {sectionIndex + 1}
                  </span>
                  <input
                    value={section.title}
                    onChange={(event) =>
                      updateSection(section.id, { title: event.target.value })
                    }
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Назначение раздела
                  </span>
                  <input
                    value={section.description ?? ""}
                    onChange={(event) =>
                      updateSection(section.id, {
                        description: event.target.value,
                      })
                    }
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => addItem(section.id)}
                    className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    + пункт
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(section.id)}
                    className="h-10 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {section.items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50"
                  >
                    <div className="grid gap-3 xl:grid-cols-[1.2fr_1.5fr_150px_100px_auto]">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-zinc-500">
                          Пункт {itemIndex + 1}
                        </span>
                        <input
                          value={item.title}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              title: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-zinc-500">
                          Инструкция
                        </span>
                        <input
                          value={item.instruction ?? ""}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              instruction: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-zinc-500">
                          Контроль
                        </span>
                        <select
                          value={item.valueType}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              valueType: event.target
                                .value as StaffShiftItemValueType,
                            })
                          }
                          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          {Object.entries(valueTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-zinc-500">
                          Баллы
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.score}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              score: Number.parseInt(event.target.value, 10) || 0,
                            })
                          }
                          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeItem(section.id, item.id)}
                          className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              required: event.target.checked,
                            })
                          }
                        />
                        Обязательный
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.evidenceRequired}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              evidenceRequired: event.target.checked,
                            })
                          }
                        />
                        Требует доказательство
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Конструктор свернут
                </p>
                <p className="mt-1 leading-6">
                  Откройте его только когда нужно изменить структуру регламента,
                  разделы, пункты, материалы или параметры публикации.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConstructorOpen(true)}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
              >
                Открыть конструктор
              </button>
            </div>
          </div>
        )}
      </section>
      </div>
    </>
  );
}
