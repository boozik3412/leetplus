"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  StaffChecklistItemValueType,
  StaffChecklistShiftKind,
} from "@/lib/staff-checklists";
import type {
  StaffChecklistTemplate,
  StaffChecklistTemplateReport,
  StaffChecklistTemplateRoleScope,
  StaffChecklistTemplateSection,
  StaffChecklistTemplateStatus,
} from "@/lib/staff-checklist-templates";
import {
  staffChecklistTemplatePacks,
  type StaffChecklistTemplatePack,
} from "@/lib/staff-checklist-template-packs";

const statusLabels: Record<StaffChecklistTemplateStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  ARCHIVED: "Архив",
};

const shiftKindLabels: Record<StaffChecklistShiftKind, string> = {
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

const roleScopeLabels: Record<StaffChecklistTemplateRoleScope, string> = {
  ADMINISTRATOR: "Администратор",
  SENIOR_ADMINISTRATOR: "Старший администратор",
  MANAGER: "Управляющий",
  ALL_STAFF: "Все сотрудники",
};

const valueTypeLabels: Record<StaffChecklistItemValueType, string> = {
  CHECKBOX: "Да/нет",
  TEXT: "Текст",
  NUMBER: "Число",
  PHOTO_LINK: "Фото",
  FILE_LINK: "Файл",
  SELECT: "Выбор",
  TIMESTAMP: "Время",
};

type DraftTemplate = {
  id: string | null;
  title: string;
  description: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: StaffChecklistTemplateRoleScope;
  status: StaffChecklistTemplateStatus;
  storeId: string;
  sourceRegulationId: string;
  sections: StaffChecklistTemplateSection[];
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function defaultSections(): StaffChecklistTemplateSection[] {
  return [
    {
      id: createId("section"),
      title: "Подготовка смены",
      description: "Проверка готовности администратора, зоны и рабочих сервисов.",
      items: [
        {
          id: createId("item"),
          title: "Проверить рабочую зону",
          instruction: "Касса, стойка, рабочие сервисы и видимые проблемы.",
          valueType: "CHECKBOX",
          required: true,
          evidenceRequired: false,
          score: 2,
        },
        {
          id: createId("item"),
          title: "Проверить гостевую зону",
          instruction: "Зал, периферия, чистота столов и готовность к гостям.",
          valueType: "CHECKBOX",
          required: true,
          evidenceRequired: false,
          score: 2,
        },
      ],
    },
  ];
}

function clonePackSections(
  sections: StaffChecklistTemplateSection[],
): StaffChecklistTemplateSection[] {
  return sections.map((section) => ({
    ...section,
    id: createId(section.id || "section"),
    items: section.items.map((item) => ({
      ...item,
      id: createId(item.id || "item"),
    })),
  }));
}

function toDraft(template: StaffChecklistTemplate | null): DraftTemplate {
  if (!template) {
    return {
      id: null,
      title: "Новый шаблон чеклиста",
      description: "",
      shiftKind: "OPENING",
      roleScope: "ADMINISTRATOR",
      status: "DRAFT",
      storeId: "",
      sourceRegulationId: "",
      sections: defaultSections(),
    };
  }

  return {
    id: template.id,
    title: template.title,
    description: template.description ?? "",
    shiftKind: template.shiftKind,
    roleScope: template.roleScope,
    status: template.status,
    storeId: template.store?.id ?? "",
    sourceRegulationId: template.sourceRegulation?.id ?? "",
    sections: template.sections,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function getPackItemsCount(pack: StaffChecklistTemplatePack) {
  return pack.sections.reduce((sum, section) => sum + section.items.length, 0);
}

async function readResponseError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось выполнить действие";
  } catch {
    return "Не удалось выполнить действие";
  }
}

export function StaffChecklistTemplateBuilder({
  report,
}: {
  report: StaffChecklistTemplateReport;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(report.rows[0]?.id ?? "");
  const selectedTemplate =
    report.rows.find((template) => template.id === selectedId) ??
    report.rows[0] ??
    null;
  const [draft, setDraft] = useState<DraftTemplate>(() =>
    toDraft(selectedTemplate),
  );
  const [sourceRegulationId, setSourceRegulationId] = useState(
    report.publishedRegulations[0]?.id ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const summary = useMemo(() => {
    const items = draft.sections.flatMap((section) => section.items);

    return {
      sections: draft.sections.length,
      items: items.length,
      required: items.filter((item) => item.required).length,
      evidence: items.filter((item) => item.evidenceRequired).length,
      score: items.reduce((sum, item) => sum + Number(item.score || 0), 0),
    };
  }, [draft.sections]);

  function loadTemplate(template: StaffChecklistTemplate | null) {
    setSelectedId(template?.id ?? "");
    setDraft(toDraft(template));
    setMessage(null);
  }

  function loadTemplatePack(pack: StaffChecklistTemplatePack) {
    setSelectedId("");
    setDraft({
      id: null,
      title: pack.title,
      description: pack.description,
      shiftKind: pack.shiftKind,
      roleScope: pack.roleScope,
      status: "DRAFT",
      storeId: "",
      sourceRegulationId: "",
      sections: clonePackSections(pack.sections),
    });
    setMessage("Пак загружен в конструктор. Проверьте клуб, пункты и сохраните как шаблон.");
  }

  function patchDraft(patch: Partial<DraftTemplate>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchSection(
    sectionId: string,
    patch: Partial<StaffChecklistTemplateSection>,
  ) {
    patchDraft({
      sections: draft.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    });
  }

  function addSection() {
    patchDraft({
      sections: [
        ...draft.sections,
        {
          id: createId("section"),
          title: "Новый раздел",
          description: "",
          items: [
            {
              id: createId("item"),
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
    });
  }

  function removeSection(sectionId: string) {
    if (draft.sections.length === 1) {
      setMessage("В шаблоне должен остаться хотя бы один раздел.");
      return;
    }

    patchDraft({
      sections: draft.sections.filter((section) => section.id !== sectionId),
    });
  }

  function patchItem(
    sectionId: string,
    itemId: string,
    patch: Partial<StaffChecklistTemplateSection["items"][number]>,
  ) {
    patchDraft({
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : section,
      ),
    });
  }

  function addItem(sectionId: string) {
    patchDraft({
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: [
                ...section.items,
                {
                  id: createId("item"),
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
    });
  }

  function removeItem(sectionId: string, itemId: string) {
    patchDraft({
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items:
                section.items.length === 1
                  ? section.items
                  : section.items.filter((item) => item.id !== itemId),
            }
          : section,
      ),
    });
  }

  async function saveTemplate(status?: StaffChecklistTemplateStatus) {
    setIsPending(true);
    setMessage(null);

    const payload = {
      title: draft.title,
      description: draft.description || null,
      shiftKind: draft.shiftKind,
      roleScope: draft.roleScope,
      status: status ?? draft.status,
      storeId: draft.storeId || null,
      sourceRegulationId: draft.sourceRegulationId || null,
      sections: draft.sections,
    };
    const response = await fetch(
      draft.id
        ? `/api/staff/checklist-templates/${draft.id}`
        : "/api/staff/checklist-templates",
      {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setIsPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const template = (await response.json()) as StaffChecklistTemplate;
    setSelectedId(template.id);
    setDraft(toDraft(template));
    setMessage(status === "ACTIVE" ? "Шаблон активирован." : "Шаблон сохранен.");
    router.refresh();
  }

  async function createFromRegulation() {
    if (!sourceRegulationId) {
      setMessage("Выберите опубликованный регламент.");
      return;
    }

    setIsPending(true);
    setMessage(null);

    const response = await fetch("/api/staff/checklist-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceRegulationId,
        status: "DRAFT",
      }),
    });

    setIsPending(false);

    if (!response.ok) {
      setMessage(await readResponseError(response));
      return;
    }

    const template = (await response.json()) as StaffChecklistTemplate;
    setSelectedId(template.id);
    setDraft(toDraft(template));
    setMessage("Шаблон создан из регламента.");
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Каталог
            </p>
            <h2 className="mt-1 text-lg font-semibold">Шаблоны</h2>
          </div>
          <button
            type="button"
            onClick={() => loadTemplate(null)}
            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Новый
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Из регламента
            </span>
            <select
              value={sourceRegulationId}
              onChange={(event) => setSourceRegulationId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              {report.publishedRegulations.length === 0 ? (
                <option value="">Нет опубликованных регламентов</option>
              ) : null}
              {report.publishedRegulations.map((regulation) => (
                <option key={regulation.id} value={regulation.id}>
                  {regulation.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={createFromRegulation}
            disabled={isPending || report.publishedRegulations.length === 0}
            className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            Создать копию
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Готовые паки
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Возьмите основу под типовой контроль и отредактируйте под клуб.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {staffChecklistTemplatePacks.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {staffChecklistTemplatePacks.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => loadTemplatePack(pack)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-emerald-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{pack.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {pack.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {shiftKindLabels[pack.shiftKind]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {formatNumber(pack.sections.length)} раздела ·{" "}
                  {formatNumber(getPackItemsCount(pack))} пунктов
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {report.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-5 text-sm text-zinc-500 dark:border-zinc-700">
              Шаблонов пока нет.
            </p>
          ) : null}
          {report.rows.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => loadTemplate(template)}
              className={[
                "w-full rounded-lg border px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10",
                draft.id === template.id
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{template.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {shiftKindLabels[template.shiftKind]} ·{" "}
                    {template.store?.name ?? "Вся сеть"}
                  </p>
                </div>
                <StatusBadge status={template.status} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {formatNumber(template.itemsCount)} пунктов ·{" "}
                {formatNumber(template.evidenceItemsCount)} доказ.
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Конструктор
            </p>
            <h2 className="mt-1 text-xl font-semibold">{draft.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Metric label="Разделы" value={summary.sections} />
            <Metric label="Пункты" value={summary.items} />
            <Metric label="Обяз." value={summary.required} />
            <Metric label="Доказ." value={summary.evidence} />
            <Metric label="Баллы" value={summary.score} />
          </div>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            {message}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Название
            </span>
            <input
              value={draft.title}
              onChange={(event) => patchDraft({ title: event.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Клуб
            </span>
            <select
              value={draft.storeId}
              onChange={(event) => patchDraft({ storeId: event.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">Вся сеть</option>
              {report.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Тип смены
            </span>
            <select
              value={draft.shiftKind}
              onChange={(event) =>
                patchDraft({
                  shiftKind: event.target.value as StaffChecklistShiftKind,
                })
              }
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              {Object.entries(shiftKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Для кого
            </span>
            <select
              value={draft.roleScope}
              onChange={(event) =>
                patchDraft({
                  roleScope: event.target.value as StaffChecklistTemplateRoleScope,
                })
              }
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              {Object.entries(roleScopeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm lg:col-span-2">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Описание
            </span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                patchDraft({ description: event.target.value })
              }
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {draft.sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              <div className="grid gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  value={section.title}
                  onChange={(event) =>
                    patchSection(section.id, { title: event.target.value })
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-950"
                />
                <input
                  value={section.description ?? ""}
                  onChange={(event) =>
                    patchSection(section.id, {
                      description: event.target.value,
                    })
                  }
                  placeholder="Короткое назначение раздела"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Убрать
                </button>
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_8rem_8rem_7rem_auto]"
                  >
                    <input
                      value={item.title}
                      onChange={(event) =>
                        patchItem(section.id, item.id, {
                          title: event.target.value,
                        })
                      }
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <input
                      value={item.instruction ?? ""}
                      onChange={(event) =>
                        patchItem(section.id, item.id, {
                          instruction: event.target.value,
                        })
                      }
                      placeholder="Что именно проверить"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <select
                      value={item.valueType}
                      onChange={(event) =>
                        patchItem(section.id, item.id, {
                          valueType: event.target
                            .value as StaffChecklistItemValueType,
                        })
                      }
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      {Object.entries(valueTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={item.score}
                      onChange={(event) =>
                        patchItem(section.id, item.id, {
                          score: Number(event.target.value),
                        })
                      }
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={item.required}
                        onChange={(checked) =>
                          patchItem(section.id, item.id, { required: checked })
                        }
                      >
                        Обяз.
                      </Toggle>
                      <Toggle
                        checked={item.evidenceRequired}
                        onChange={(checked) =>
                          patchItem(section.id, item.id, {
                            evidenceRequired: checked,
                          })
                        }
                      >
                        Доказ.
                      </Toggle>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(section.id, item.id)}
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => addItem(section.id)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Добавить пункт
                </button>
                <span className="ml-3 text-xs font-semibold text-zinc-500">
                  Раздел {sectionIndex + 1}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addSection}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            Добавить раздел
          </button>
          <button
            type="button"
            onClick={() => saveTemplate("DRAFT")}
            disabled={isPending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => saveTemplate("ACTIVE")}
            disabled={isPending}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            Активировать
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={() => saveTemplate("ARCHIVED")}
              disabled={isPending}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              В архив
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: StaffChecklistTemplateStatus }) {
  const className =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
      : status === "ARCHIVED"
        ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {statusLabels[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-right dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[10px] font-semibold uppercase text-zinc-500">
        {label}
      </p>
      <p className="text-sm font-semibold">{formatNumber(value)}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        "rounded-full px-2.5 py-1 text-xs font-semibold transition",
        checked
          ? "bg-emerald-500 text-zinc-950"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
