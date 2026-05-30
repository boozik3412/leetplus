"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffKnowledgeArticle,
  StaffKnowledgeArticleStatus,
  StaffKnowledgeBaseReport,
  StaffKnowledgeMaterial,
  StaffKnowledgeMaterialType,
  StaffKnowledgeRoleScope,
} from "@/lib/staff-knowledge-base";

const statusLabels: Record<StaffKnowledgeArticleStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликовано",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffKnowledgeRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

const materialTypeLabels: Record<StaffKnowledgeMaterialType, string> = {
  TEXT: "Текст",
  FILE_LINK: "Файл",
  IMAGE: "Изображение",
  VIDEO: "Видео",
  EXTERNAL_LINK: "Ссылка",
  OTHER: "Другое",
};

type DraftArticle = {
  id: string | null;
  title: string;
  summary: string;
  content: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  storeId: string;
  tagsText: string;
  materials: StaffKnowledgeMaterial[];
};

const seedArticles: Array<Omit<DraftArticle, "id" | "storeId">> = [
  {
    title: "Старт смены администратора",
    summary:
      "Короткая памятка: что проверить в первые минуты смены и что обязательно зафиксировать.",
    content:
      "Проверьте рабочее место, кассу, бар, чистоту, активные брони и состояние зала. Если есть отклонения, создайте задачу или зафиксируйте комментарий в чеклисте смены.",
    category: "Смена",
    roleScope: "ADMINISTRATOR",
    status: "PUBLISHED",
    tagsText: "смена, открытие, стандарт",
    materials: [
      {
        id: "material-start-check",
        title: "Что приложить к проверке",
        type: "TEXT",
        url: null,
        content:
          "Фото кассовой зоны, комментарий по расхождениям и ссылка на задачу, если нужна помощь управляющего.",
        note: null,
        required: true,
      },
    ],
  },
  {
    title: "Работа с конфликтным гостем",
    summary:
      "Порядок действий, когда гость недоволен услугой, оплатой, местом или поведением другого посетителя.",
    content:
      "Сначала выслушайте гостя без спора, зафиксируйте факт, предложите понятное решение в рамках полномочий и передайте управляющему, если ситуация влияет на деньги, безопасность или репутацию клуба.",
    category: "Сервис",
    roleScope: "ALL_STAFF",
    status: "DRAFT",
    tagsText: "сервис, конфликт, гости",
    materials: [],
  },
  {
    title: "Проверка бара перед пиком",
    summary:
      "Как быстро убедиться, что бар готов к вечерней загрузке и не потеряет продажи.",
    content:
      "Проверьте наличие ходовых позиций, ценники, чистоту витрины и товары с низким остатком. По дефициту создайте задачу закупки или пополнения.",
    category: "Бар",
    roleScope: "SENIOR_ADMINISTRATOR",
    status: "DRAFT",
    tagsText: "бар, продажи, остатки",
    materials: [],
  },
];

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDraft(): DraftArticle {
  return {
    id: null,
    title: "",
    summary: "",
    content: "",
    category: "Общие стандарты",
    roleScope: "ALL_STAFF",
    status: "DRAFT",
    storeId: "",
    tagsText: "",
    materials: [],
  };
}

function fromArticle(row: StaffKnowledgeArticle): DraftArticle {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? "",
    content: row.content ?? "",
    category: row.category,
    roleScope: row.roleScope,
    status: row.status,
    storeId: row.store?.id ?? "",
    tagsText: row.tags.join(", "),
    materials: row.materials,
  };
}

function tagsFromText(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "не опубликовано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StaffKnowledgeBaseWorkspace({
  report,
}: {
  report: StaffKnowledgeBaseReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftArticle>(() =>
    report.rows[0] ? fromArticle(report.rows[0]) : defaultDraft(),
  );
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedArticle = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );

  function updateDraft(patch: Partial<DraftArticle>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function loadSeed(seed: Omit<DraftArticle, "id" | "storeId">) {
    setDraft({ ...seed, id: null, storeId: "" });
    setMessage("Черновик загружен. Проверьте текст и сохраните статью.");
    setError(null);
  }

  function addMaterial() {
    setDraft((current) => ({
      ...current,
      materials: [
        ...current.materials,
        {
          id: uid("material"),
          title: "",
          type: "TEXT",
          url: null,
          content: "",
          note: "",
          required: false,
        },
      ],
    }));
  }

  function updateMaterial(
    materialId: string,
    patch: Partial<StaffKnowledgeMaterial>,
  ) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId ? { ...material, ...patch } : material,
      ),
    }));
  }

  function removeMaterial(materialId: string) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.filter((material) => material.id !== materialId),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      setError("Укажите название статьи.");
      return;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    const payload = {
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      content: draft.content.trim() || null,
      category: draft.category.trim() || "Общие стандарты",
      roleScope: draft.roleScope,
      status: draft.status,
      storeId: draft.storeId || null,
      tags: tagsFromText(draft.tagsText),
      materials: draft.materials
        .map((material) => ({
          ...material,
          title: material.title.trim(),
          url: material.url?.trim() || null,
          content: material.content?.trim() || null,
          note: material.note?.trim() || null,
        }))
        .filter(
          (material) => material.title || material.url || material.content,
        ),
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/staff/knowledge-base/${draft.id}`
          : "/api/staff/knowledge-base",
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
        throw new Error(data?.message ?? "Не удалось сохранить статью");
      }

      const saved = (await response.json()) as StaffKnowledgeArticle;
      setDraft(fromArticle(saved));
      setMessage("Статья сохранена.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {report.canManageKnowledge ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Быстрый старт
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Заготовки для базы знаний
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDraft(defaultDraft())}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Новая статья
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {seedArticles.map((seed) => (
              <button
                key={seed.title}
                type="button"
                onClick={() => loadSeed(seed)}
                className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
              >
                <span className="text-sm font-semibold">{seed.title}</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  {seed.summary}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каталог
              </p>
              <h2 className="mt-1 text-lg font-semibold">Статьи и материалы</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {report.rows.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Материалов пока нет. Руководитель или менеджер по стандартам
                может создать первую статью справа.
              </p>
            ) : (
              report.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(fromArticle(row))}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    {report.canManageKnowledge ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {statusLabels[row.status]}
                      </span>
                    ) : null}
                  </span>
                  {row.summary ? (
                    <span className="mt-2 block text-sm text-zinc-600 dark:text-zinc-400">
                      {row.summary}
                    </span>
                  ) : null}
                  <span className="mt-2 block text-xs text-zinc-500">
                    {row.category} · {roleScopeLabels[row.roleScope]} ·{" "}
                    {row.store?.name ?? "Вся сеть"} · материалов:{" "}
                    {row.materialsCount}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {report.canManageKnowledge ? (
            <form onSubmit={save}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Конструктор
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.id ? "Редактирование статьи" : "Новая статья"}
                  </h2>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Название
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft({ title: event.target.value })
                    }
                    placeholder="Например: работа с конфликтным гостем"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Статус
                  </span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft({
                        status: event.target.value as StaffKnowledgeArticleStatus,
                      })
                    }
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Категория
                  </span>
                  <input
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft({ category: event.target.value })
                    }
                    placeholder="Смена, сервис, касса"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Видимость
                  </span>
                  <select
                    value={draft.roleScope}
                    onChange={(event) =>
                      updateDraft({
                        roleScope: event.target.value as StaffKnowledgeRoleScope,
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
                    Клуб
                  </span>
                  <select
                    value={draft.storeId}
                    onChange={(event) =>
                      updateDraft({ storeId: event.target.value })
                    }
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Вся сеть</option>
                    {report.stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Кратко
                </span>
                <input
                  value={draft.summary}
                  onChange={(event) =>
                    updateDraft({ summary: event.target.value })
                  }
                  placeholder="О чем статья и когда ее читать"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Основной текст
                </span>
                <textarea
                  value={draft.content}
                  onChange={(event) =>
                    updateDraft({ content: event.target.value })
                  }
                  rows={8}
                  placeholder="Стандарт, инструкция, порядок действий или короткий учебный материал."
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Теги
                </span>
                <input
                  value={draft.tagsText}
                  onChange={(event) =>
                    updateDraft({ tagsText: event.target.value })
                  }
                  placeholder="смена, сервис, касса"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Учебные материалы
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Текстовые блоки, видео, изображения, файлы и внешние
                      ссылки к этой статье.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMaterial}
                    className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Добавить материал
                  </button>
                </div>

                {draft.materials.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                    Материалов пока нет. Статья может состоять только из текста.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.materials.map((material, index) => (
                      <div
                        key={material.id}
                        className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50"
                      >
                        <div className="grid gap-3 lg:grid-cols-[1fr_10rem_1fr_auto]">
                          <label className="space-y-1">
                            <span className="text-xs font-bold uppercase text-zinc-500">
                              Материал {index + 1}
                            </span>
                            <input
                              value={material.title}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="Название"
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            />
                          </label>

                          <label className="space-y-1">
                            <span className="text-xs font-bold uppercase text-zinc-500">
                              Тип
                            </span>
                            <select
                              value={material.type}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  type: event.target
                                    .value as StaffKnowledgeMaterialType,
                                })
                              }
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            >
                              {Object.entries(materialTypeLabels).map(
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
                              Ссылка
                            </span>
                            <input
                              value={material.url ?? ""}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  url: event.target.value,
                                })
                              }
                              placeholder="https://..."
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            />
                          </label>

                          <div className="flex items-end gap-2">
                            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
                              <input
                                type="checkbox"
                                checked={material.required}
                                onChange={(event) =>
                                  updateMaterial(material.id, {
                                    required: event.target.checked,
                                  })
                                }
                              />
                              Обяз.
                            </label>
                            <button
                              type="button"
                              onClick={() => removeMaterial(material.id)}
                              className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            >
                              Убрать
                            </button>
                          </div>
                        </div>

                        <label className="mt-3 block space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Текст материала
                          </span>
                          <textarea
                            value={material.content ?? ""}
                            onChange={(event) =>
                              updateMaterial(material.id, {
                                content: event.target.value,
                              })
                            }
                            rows={3}
                            placeholder="Заполните для текстового материала или добавьте пояснение к ссылке."
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>

                        <label className="mt-3 block space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Примечание
                          </span>
                          <input
                            value={material.note ?? ""}
                            onChange={(event) =>
                              updateMaterial(material.id, {
                                note: event.target.value,
                              })
                            }
                            placeholder="Что сотрудник должен вынести из материала"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>
          ) : selectedArticle ? (
            <ArticlePreview article={selectedArticle} />
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              Выберите материал слева.
            </p>
          )}

          {message ? (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ArticlePreview({ article }: { article: StaffKnowledgeArticle }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Материал
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{article.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {article.category} · {roleScopeLabels[article.roleScope]} ·{" "}
        опубликовано: {formatDateTime(article.publishedAt)}
      </p>
      {article.summary ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          {article.summary}
        </p>
      ) : null}
      {article.content ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          {article.content}
        </p>
      ) : null}
      {article.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {article.materials.length > 0 ? (
        <div className="mt-5 space-y-2">
          {article.materials.map((material) => (
            <div
              key={material.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{material.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {materialTypeLabels[material.type]}
                </span>
                {material.required ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                    обязательно
                  </span>
                ) : null}
              </div>
              {material.content ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {material.content}
                </p>
              ) : null}
              {material.url ? (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                >
                  Открыть материал
                </a>
              ) : null}
              {material.note ? (
                <p className="mt-2 text-xs text-zinc-500">{material.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
