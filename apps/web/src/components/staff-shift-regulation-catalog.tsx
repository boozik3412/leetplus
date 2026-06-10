"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  StaffShiftItemValueType,
  StaffShiftKind,
  StaffShiftRegulation,
  StaffShiftRegulationAttachmentType,
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
  PHOTO_LINK: "Фото",
  FILE_LINK: "Файл",
  SELECT: "Выбор",
  TIMESTAMP: "Время",
};

const attachmentTypeLabels: Record<StaffShiftRegulationAttachmentType, string> = {
  DOCUMENT: "Документ",
  IMAGE: "Изображение",
  VIDEO: "Видео",
  FILE_LINK: "Файл",
  EXTERNAL_LINK: "Ссылка",
  OTHER: "Материал",
};

function formatDateTime(value: string | null) {
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

function acknowledgementLabel(row: StaffShiftRegulation) {
  if (!row.acknowledgementSummary.requiredByMe) {
    return "Ознакомление не требуется";
  }

  if (row.acknowledgementSummary.acknowledgedByMe) {
    return "Ознакомлен";
  }

  return "Ждет ознакомления";
}

function acknowledgementClass(row: StaffShiftRegulation) {
  if (!row.acknowledgementSummary.requiredByMe) {
    return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }

  if (row.acknowledgementSummary.acknowledgedByMe) {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  }

  return "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200";
}

function countItems(row: StaffShiftRegulation) {
  return row.sections.reduce((sum, section) => sum + section.items.length, 0);
}

export function StaffShiftRegulationCatalog({
  rows,
}: {
  rows: StaffShiftRegulation[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    rows[0]?.id ?? null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  async function acknowledge(row: StaffShiftRegulation) {
    setPendingId(row.id);
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
        throw new Error(data?.message ?? "Не удалось подтвердить ознакомление");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Опубликованных регламентов пока нет. Когда управляющий или менеджер по
        стандартам опубликует материал, он появится в этом каталоге.
      </div>
    );
  }

  if (!selectedRow) {
    return null;
  }

  const effectiveFrom = formatDateTime(selectedRow.effectiveFrom);
  const publishedAt = formatDateTime(selectedRow.publishedAt);
  const acknowledgedAt = formatDateTime(
    selectedRow.acknowledgementSummary.acknowledgedAt,
  );
  const shouldAcknowledge =
    selectedRow.acknowledgementSummary.requiredByMe &&
    !selectedRow.acknowledgementSummary.acknowledgedByMe;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Каталог
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Регламенты смены
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {rows.length}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((row) => {
            const isSelected = row.id === selectedRow.id;

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`w-full min-w-0 rounded-lg border p-3 text-left transition ${
                  isSelected
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900/70"
                }`}
              >
                <span className="block truncate text-sm font-semibold">
                  {row.title}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {shiftKindLabels[row.shiftKind]} · {row.store?.name ?? "вся сеть"}
                </span>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${acknowledgementClass(
                    row,
                  )}`}
                >
                  {acknowledgementLabel(row)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Опубликованный регламент
            </p>
            <h2 className="mt-1 break-words text-2xl font-semibold">
              {selectedRow.title}
            </h2>
            {selectedRow.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {selectedRow.description}
              </p>
            ) : null}
          </div>

          {shouldAcknowledge ? (
            <button
              type="button"
              onClick={() => acknowledge(selectedRow)}
              disabled={pendingId === selectedRow.id}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pendingId === selectedRow.id ? "Подтверждаем..." : "Ознакомлен"}
            </button>
          ) : (
            <span
              className={`inline-flex h-10 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold ${acknowledgementClass(
                selectedRow,
              )}`}
            >
              {acknowledgedAt ? `Ознакомлен ${acknowledgedAt}` : acknowledgementLabel(selectedRow)}
            </span>
          )}
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Тип", shiftKindLabels[selectedRow.shiftKind]],
            ["Кому", roleScopeLabels[selectedRow.roleScope]],
            ["Клуб", selectedRow.store?.name ?? "Вся сеть"],
            ["Версия", `v${selectedRow.version}`],
            ["Пунктов", countItems(selectedRow)],
            ["Доказательств", selectedRow.requiredEvidenceItems],
            ["Действует с", effectiveFrom ?? "сразу после публикации"],
            ["Опубликован", publishedAt ?? "дата не указана"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <p className="text-[11px] font-bold uppercase text-zinc-500">
                {label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {selectedRow.requiresAssessmentRetake ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            После изменения регламента требуется повторная проверка знаний:
            {" "}
            <span className="font-semibold">
              {selectedRow.assessment?.title ?? "проверка будет назначена отдельно"}
            </span>
            .
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <div className="min-w-0 space-y-4">
            {selectedRow.sections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                В регламенте пока нет разделов.
              </div>
            ) : (
              selectedRow.sections.map((section, sectionIndex) => (
                <section
                  key={section.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div>
                    <p className="text-xs font-bold uppercase text-zinc-500">
                      Раздел {sectionIndex + 1}
                    </p>
                    <h3 className="mt-1 break-words text-lg font-semibold">
                      {section.title}
                    </h3>
                    {section.description ? (
                      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {section.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={item.id}
                        className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/60"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                            {itemIndex + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold">
                              {item.title}
                            </p>
                            {item.instruction ? (
                              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                                {item.instruction}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                                {valueTypeLabels[item.valueType]}
                              </span>
                              {item.required ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                  Обязательный
                                </span>
                              ) : null}
                              {item.evidenceRequired ? (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                                  Нужно доказательство
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <aside className="min-w-0 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-base font-semibold">Материалы</h3>
            {selectedRow.attachments.length === 0 ? (
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Вложения к этому регламенту не добавлены.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {selectedRow.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block min-w-0 rounded-md border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
                  >
                    <span className="block truncate text-sm font-semibold">
                      {attachment.title}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {attachmentTypeLabels[attachment.type]}
                      {attachment.required ? " · обязательно" : ""}
                    </span>
                    {attachment.note ? (
                      <span className="mt-2 block text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                        {attachment.note}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
