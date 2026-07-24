"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { startNavigationFeedback } from "@/components/navigation-feedback";
import { StaffMaterialPreview } from "@/components/staff-material-preview";
import type {
  StaffTaskPriority,
  StaffTaskType,
} from "@/lib/staff-tasks";
import type {
  StaffTaskTemplate,
  StaffTaskTemplateReport,
  StaffTaskTemplateStatus,
} from "@/lib/staff-task-templates";

const typeLabels: Record<StaffTaskType, string> = {
  ONE_TIME: "Разовая",
  SHIFT: "На смену",
  RECURRING: "Повторяемая",
  LONG_TERM: "Долгосрочная",
  PERSONAL: "Личная",
  CLUB: "Для клуба",
  ROLE: "Для роли",
};

const priorityLabels: Record<StaffTaskPriority, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

const statusLabels: Record<StaffTaskTemplateStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  ARCHIVED: "Архив",
};

type DraftTemplate = {
  id: string | null;
  title: string;
  description: string;
  type: StaffTaskType;
  priority: StaffTaskPriority;
  status: StaffTaskTemplateStatus;
  storeId: string;
  dueOffsetMinutes: string;
  labelsText: string;
};

type TaskTemplatePack = Omit<DraftTemplate, "id" | "storeId"> & {
  note: string;
};

const templatePacks: TaskTemplatePack[] = [
  {
    title: "Открытие смены",
    description:
      "Проверить готовность клуба к открытию: касса, рабочие места, чистота, бар, первые брони и видимость администратора в зале.",
    type: "SHIFT",
    priority: "HIGH",
    status: "ACTIVE",
    dueOffsetMinutes: "30",
    labelsText: "открытие, смена, стандарт",
    note: "Ежедневный старт смены без ручного набора текста.",
  },
  {
    title: "Проверка кассы и инкассации",
    description:
      "Сверить кассу, безналичные операции, возвраты, инкассацию и приложить короткий комментарий по расхождениям.",
    type: "SHIFT",
    priority: "HIGH",
    status: "ACTIVE",
    dueOffsetMinutes: "60",
    labelsText: "касса, инкассация, контроль",
    note: "Для смен с кассовой ответственностью.",
  },
  {
    title: "Пополнение бара",
    description:
      "Проверить полку бара, ходовые позиции, ценники и нехватку SKU. При дефиците создать отдельную задачу закупки.",
    type: "CLUB",
    priority: "NORMAL",
    status: "ACTIVE",
    dueOffsetMinutes: "120",
    labelsText: "бар, остатки, ассортимент",
    note: "Операционный контроль бара в клубе.",
  },
  {
    title: "Разбор нарушения стандарта",
    description:
      "Зафиксировать факт нарушения, ответственного, первопричину, доказательство и действие, которое предотвращает повтор.",
    type: "ONE_TIME",
    priority: "URGENT",
    status: "ACTIVE",
    dueOffsetMinutes: "60",
    labelsText: "нарушение, стандарт, эскалация",
    note: "Быстрый шаблон для инцидентов и возвратов с проверки.",
  },
];

function defaultDraft(): DraftTemplate {
  return {
    id: null,
    title: "",
    description: "",
    type: "SHIFT",
    priority: "NORMAL",
    status: "DRAFT",
    storeId: "",
    dueOffsetMinutes: "",
    labelsText: "",
  };
}

function labelsToText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .join(", ");
}

function fromTemplate(row: StaffTaskTemplate): DraftTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    type: row.type,
    priority: row.priority,
    status: row.status,
    storeId: row.store?.id ?? "",
    dueOffsetMinutes: row.dueOffsetMinutes?.toString() ?? "",
    labelsText: labelsToText(row.labels),
  };
}

function labelsFromText(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 20);
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

export function StaffTaskTemplateBuilder({
  report,
}: {
  report: StaffTaskTemplateReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftTemplate>(() =>
    report.rows[0] ? fromTemplate(report.rows[0]) : defaultDraft(),
  );
  const [launchStoreId, setLaunchStoreId] = useState("");
  const [launchAssignedToUserId, setLaunchAssignedToUserId] = useState("");
  const [launchDueAt, setLaunchDueAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );

  function updateDraft(patch: Partial<DraftTemplate>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function loadPack(pack: TaskTemplatePack) {
    setDraft({
      ...pack,
      id: null,
      storeId: "",
    });
    setMessage("Пак загружен как новый шаблон. Проверьте поля и сохраните.");
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      setError("Укажите название шаблона.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const labels = labelsFromText(draft.labelsText);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      type: draft.type,
      priority: draft.priority,
      status: draft.status,
      storeId: draft.storeId || null,
      dueOffsetMinutes: draft.dueOffsetMinutes.trim() || null,
      labels: labels.length > 0 ? labels : null,
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/staff/task-templates/${draft.id}`
          : "/api/staff/task-templates",
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
        throw new Error(data?.message ?? "Не удалось сохранить шаблон");
      }

      const saved = (await response.json()) as StaffTaskTemplate;
      setDraft(fromTemplate(saved));
      setMessage("Шаблон сохранен.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsSaving(false);
    }
  }

  async function launchTask() {
    if (!draft.id) {
      setError("Сначала сохраните шаблон.");
      return;
    }

    setIsLaunching(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/staff/task-templates/${draft.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: launchStoreId || undefined,
          assignedToUserId: launchAssignedToUserId || null,
          dueAt: launchDueAt ? new Date(launchDueAt).toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось создать задачу");
      }

      setMessage("Задача создана из шаблона.");
      startNavigationFeedback();
      router.push("/staff/tasks");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsLaunching(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Готовые паки
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Типовые операции клуба
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setDraft(defaultDraft())}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Новый шаблон
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templatePacks.map((pack) => (
            <button
              key={pack.title}
              type="button"
              onClick={() => loadPack(pack)}
              className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
            >
              <span className="text-sm font-semibold">{pack.title}</span>
              <span className="mt-2 block text-xs leading-5 text-zinc-500">
                {pack.note}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каталог
              </p>
              <h2 className="mt-1 text-lg font-semibold">Шаблоны задач</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {report.rows.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Шаблонов пока нет. Возьмите готовый пак или создайте первый
                шаблон вручную.
              </p>
            ) : (
              report.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(fromTemplate(row))}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {statusLabels[row.status]}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-zinc-500">
                    {typeLabels[row.type]} · {priorityLabels[row.priority]} ·{" "}
                    {row.store?.name ?? "Вся сеть"} · задач создано:{" "}
                    {row.tasksCreatedCount}
                  </span>
                  {row.dueOffsetMinutes !== null ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Дедлайн по умолчанию через {row.dueOffsetMinutes} мин.
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form onSubmit={save}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Конструктор
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {draft.id ? "Редактирование шаблона" : "Новый шаблон"}
                </h2>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Сохраняем..." : "Сохранить шаблон"}
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
                  placeholder="Например: открытие смены"
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
                      status: event.target.value as StaffTaskTemplateStatus,
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

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Описание
              </span>
              <textarea
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                rows={4}
                placeholder="Что нужно сделать, какой результат приложить, какие критерии проверки."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Тип
                </span>
                <select
                  value={draft.type}
                  onChange={(event) =>
                    updateDraft({ type: event.target.value as StaffTaskType })
                  }
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Приоритет
                </span>
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    updateDraft({
                      priority: event.target.value as StaffTaskPriority,
                    })
                  }
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
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

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Дедлайн, мин
                </span>
                <input
                  value={draft.dueOffsetMinutes}
                  onChange={(event) =>
                    updateDraft({ dueOffsetMinutes: event.target.value })
                  }
                  inputMode="numeric"
                  placeholder="60"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Метки
              </span>
              <input
                value={draft.labelsText}
                onChange={(event) =>
                  updateDraft({ labelsText: event.target.value })
                }
                placeholder="касса, смена, стандарт"
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </form>

          <div className="mt-5">
            <StaffMaterialPreview
              title={draft.title}
              description={draft.description}
              metrics={[
                { label: "Тип", value: typeLabels[draft.type] },
                { label: "Приоритет", value: priorityLabels[draft.priority] },
                {
                  label: "Контур",
                  value: draft.storeId
                    ? report.stores.find((store) => store.id === draft.storeId)
                        ?.name ?? "Клуб"
                    : "Вся сеть",
                },
                { label: "Статус", value: statusLabels[draft.status] },
                {
                  label: "Дедлайн",
                  value: draft.dueOffsetMinutes.trim()
                    ? `через ${draft.dueOffsetMinutes.trim()} мин.`
                    : "без срока",
                },
              ]}
              tags={labelsFromText(draft.labelsText)}
              steps={[
                {
                  id: "task-template-preview",
                  title: draft.title || "Задача из шаблона",
                  typeLabel: typeLabels[draft.type],
                  content:
                    draft.description ||
                    "Описание пока не заполнено. Добавьте ожидаемый результат и критерии проверки.",
                  required: true,
                },
              ]}
              emptyLabel="Описание задачи пока не заполнено."
            />
          </div>

          {selectedTemplate ? (
            <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Запуск из шаблона
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {selectedTemplate.updatedAt
                      ? `Обновлен ${formatDateTime(selectedTemplate.updatedAt)}`
                      : "Готов к запуску"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={launchTask}
                  disabled={isLaunching || selectedTemplate.status === "ARCHIVED"}
                  className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                >
                  {isLaunching ? "Создаем..." : "Создать задачу"}
                </button>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Клуб
                  </span>
                  <select
                    value={launchStoreId}
                    onChange={(event) => setLaunchStoreId(event.target.value)}
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Из шаблона</option>
                    {report.stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Ответственный
                  </span>
                  <select
                    value={launchAssignedToUserId}
                    onChange={(event) =>
                      setLaunchAssignedToUserId(event.target.value)
                    }
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Не назначен</option>
                    {report.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName ?? user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Дедлайн
                  </span>
                  <input
                    value={launchDueAt}
                    onChange={(event) => setLaunchDueAt(event.target.value)}
                    type="datetime-local"
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              </div>
            </div>
          ) : null}

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
