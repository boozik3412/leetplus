"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  staffShiftRegulationTemplates,
  type StaffShiftRegulationTemplate,
} from "@/lib/staff-shift-regulation-templates";
import type {
  StaffShiftItemValueType,
  StaffShiftKind,
  StaffShiftRegulation,
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

type DraftRegulation = {
  id: string | null;
  title: string;
  description: string;
  shiftKind: StaffShiftKind;
  status: StaffShiftRegulationStatus;
  roleScope: StaffShiftRoleScope;
  storeId: string;
  effectiveFrom: string;
  sections: StaffShiftRegulationSection[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
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
    sections: row.sections,
  };
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

export function StaffShiftRegulationBuilder({
  rows,
  stores,
}: {
  rows: StaffShiftRegulation[];
  stores: StaffShiftRegulationStore[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRegulation>(() =>
    rows[0] ? fromRegulation(rows[0]) : defaultDraft(),
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const items = draft.sections.flatMap((section) => section.items);

    return {
      sections: draft.sections.length,
      items: items.length,
      required: items.filter((item) => item.required).length,
      evidence: items.filter((item) => item.evidenceRequired).length,
      score: items.reduce((sum, item) => sum + item.score, 0),
    };
  }, [draft.sections]);

  function updateDraft(patch: Partial<DraftRegulation>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function applyTemplate(template: StaffShiftRegulationTemplate) {
    setDraft(draftFromTemplate(template));
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

  async function save(statusOverride?: StaffShiftRegulationStatus) {
    const title = draft.title.trim();

    if (!title) {
      setError("Укажите название регламента.");
      return;
    }

    if (draft.sections.length === 0) {
      setError("Добавьте хотя бы один раздел.");
      return;
    }

    const hasItems = draft.sections.some((section) =>
      section.items.some((item) => item.title.trim()),
    );

    if (!hasItems) {
      setError("Добавьте хотя бы один пункт регламента.");
      return;
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
      setDraft(fromRegulation(saved));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
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
            onClick={() => setDraft(defaultDraft())}
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
                onClick={() => setDraft(fromRegulation(row))}
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
                  {row.sectionsCount} разд., {row.itemsCount} пунктов, v{row.version}
                </p>
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
              Опубликовать
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => save("ARCHIVED")}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                В архив
              </button>
            ) : null}
          </div>
        </div>

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
              Обязательных: {totals.required}, с доказательством: {totals.evidence}
            </p>
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
      </section>
    </div>
  );
}
