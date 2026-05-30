"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffTrainingCourse,
  StaffTrainingCourseStatus,
  StaffTrainingCourseStep,
  StaffTrainingCourseStepType,
  StaffTrainingCoursesReport,
  StaffTrainingRoleScope,
} from "@/lib/staff-training-courses";

const statusLabels: Record<StaffTrainingCourseStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffTrainingRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

const stepTypeLabels: Record<StaffTrainingCourseStepType, string> = {
  ARTICLE: "Статья",
  TEXT: "Текст",
  LINK: "Ссылка",
  TASK: "Задание",
};

type DraftCourse = {
  id: string | null;
  title: string;
  description: string;
  roleScope: StaffTrainingRoleScope;
  status: StaffTrainingCourseStatus;
  required: boolean;
  dueDays: string;
  storeId: string;
  steps: StaffTrainingCourseStep[];
};

const seedCourses: Array<Omit<DraftCourse, "id" | "storeId">> = [
  {
    title: "Онбординг администратора",
    description:
      "Базовый маршрут для нового администратора: смена, сервис, касса и первые рабочие задачи.",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    required: true,
    dueDays: "7",
    steps: [
      {
        id: "step-shift-start",
        title: "Изучить стандарт старта смены",
        type: "TEXT",
        articleId: null,
        content:
          "Разберите порядок проверки рабочего места, кассы, бара, бронирований и фиксации отклонений.",
        url: null,
        required: true,
      },
      {
        id: "step-first-task",
        title: "Выполнить первую сменную задачу",
        type: "TASK",
        articleId: null,
        content:
          "Создайте или закройте учебную задачу по итогам проверки смены вместе со старшим администратором.",
        url: null,
        required: true,
      },
    ],
  },
  {
    title: "Старший администратор: контроль смены",
    description:
      "Маршрут для старшей смены: чеклисты, контроль задач, бар и передача проблем управляющему.",
    roleScope: "SENIOR_ADMINISTRATOR",
    status: "DRAFT",
    required: true,
    dueDays: "10",
    steps: [
      {
        id: "step-checklists",
        title: "Проверить чеклисты смены",
        type: "TEXT",
        articleId: null,
        content:
          "Сверьте обязательные пункты открытия, пикового времени и закрытия смены.",
        url: null,
        required: true,
      },
      {
        id: "step-control",
        title: "Разобрать отклонения",
        type: "TASK",
        articleId: null,
        content:
          "Зафиксируйте одно отклонение как задачу и назначьте ответственного.",
        url: null,
        required: true,
      },
    ],
  },
  {
    title: "Менеджер по стандартам: аттестация",
    description:
      "Короткий курс для подготовки к проверке стандартов, регламентов и качества работы администраторов.",
    roleScope: "STANDARDS_MANAGER",
    status: "DRAFT",
    required: false,
    dueDays: "",
    steps: [
      {
        id: "step-standard-review",
        title: "Собрать материалы аттестации",
        type: "TASK",
        articleId: null,
        content:
          "Выберите регламент, чеклист и две статьи базы знаний, которые попадут в проверку.",
        url: null,
        required: true,
      },
    ],
  },
];

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDraft(): DraftCourse {
  return {
    id: null,
    title: "",
    description: "",
    roleScope: "ALL_STAFF",
    status: "DRAFT",
    required: true,
    dueDays: "",
    storeId: "",
    steps: [],
  };
}

function fromCourse(row: StaffTrainingCourse): DraftCourse {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    roleScope: row.roleScope,
    status: row.status,
    required: row.required,
    dueDays: row.dueDays?.toString() ?? "",
    storeId: row.store?.id ?? "",
    steps: row.steps,
  };
}

function emptyStep(): StaffTrainingCourseStep {
  return {
    id: uid("step"),
    title: "",
    type: "TEXT",
    articleId: null,
    content: "",
    url: null,
    required: true,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function StaffTrainingCoursesWorkspace({
  report,
}: {
  report: StaffTrainingCoursesReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftCourse>(() =>
    report.rows[0] ? fromCourse(report.rows[0]) : defaultDraft(),
  );
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );

  function updateDraft(patch: Partial<DraftCourse>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function loadSeed(seed: Omit<DraftCourse, "id" | "storeId">) {
    setDraft({ ...seed, id: null, storeId: "" });
    setMessage("Шаблон курса загружен. Проверьте шаги и сохраните.");
    setError(null);
  }

  function addStep() {
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, emptyStep()],
    }));
  }

  function updateStep(stepId: string, patch: Partial<StaffTrainingCourseStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step,
      ),
    }));
  }

  function removeStep(stepId: string) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== stepId),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      setError("Укажите название курса.");
      return;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      roleScope: draft.roleScope,
      status: draft.status,
      required: draft.required,
      dueDays: draft.dueDays.trim() || null,
      storeId: draft.storeId || null,
      steps: draft.steps
        .map((step) => ({
          ...step,
          title: step.title.trim(),
          articleId: step.articleId || null,
          content: step.content?.trim() || null,
          url: step.url?.trim() || null,
        }))
        .filter(
          (step) => step.title || step.articleId || step.content || step.url,
        ),
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/staff/training-courses/${draft.id}`
          : "/api/staff/training-courses",
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
        throw new Error(data?.message ?? "Не удалось сохранить курс");
      }

      const saved = (await response.json()) as StaffTrainingCourse;
      setDraft(fromCourse(saved));
      setMessage("Курс сохранен.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {report.canManageTraining ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Быстрый старт
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Шаблоны учебных маршрутов
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDraft(defaultDraft())}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Новый курс
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {seedCourses.map((seed) => (
              <button
                key={seed.title}
                type="button"
                onClick={() => loadSeed(seed)}
                className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
              >
                <span className="text-sm font-semibold">{seed.title}</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  {seed.description}
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
              <h2 className="mt-1 text-lg font-semibold">Учебные курсы</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {report.rows.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Курсов пока нет. Создайте первый маршрут обучения справа.
              </p>
            ) : (
              report.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(fromCourse(row))}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    {report.canManageTraining ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {statusLabels[row.status]}
                      </span>
                    ) : null}
                    {row.required ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                        обяз.
                      </span>
                    ) : null}
                  </span>
                  {row.description ? (
                    <span className="mt-2 block text-sm text-zinc-600 dark:text-zinc-400">
                      {row.description}
                    </span>
                  ) : null}
                  <span className="mt-2 block text-xs text-zinc-500">
                    {roleScopeLabels[row.roleScope]} ·{" "}
                    {row.store?.name ?? "Вся сеть"} · шагов: {row.stepsCount} ·{" "}
                    обновлен {formatDate(row.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {report.canManageTraining ? (
            <form onSubmit={save}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Конструктор
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.id ? "Редактирование курса" : "Новый курс"}
                  </h2>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Сохраняем..." : "Сохранить курс"}
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
                    placeholder="Например: онбординг администратора"
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
                        status: event.target.value as StaffTrainingCourseStatus,
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

              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Роль
                  </span>
                  <select
                    value={draft.roleScope}
                    onChange={(event) =>
                      updateDraft({
                        roleScope: event.target.value as StaffTrainingRoleScope,
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

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Срок, дней
                  </span>
                  <input
                    inputMode="numeric"
                    value={draft.dueDays}
                    onChange={(event) =>
                      updateDraft({ dueDays: event.target.value })
                    }
                    placeholder="7"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="flex h-11 items-center gap-2 self-end rounded-md border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(event) =>
                      updateDraft({ required: event.target.checked })
                    }
                  />
                  Обязательный
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
                  placeholder="Для кого курс, чему он учит и когда назначается."
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Шаги курса
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Добавьте статьи базы знаний, ссылки, задания или
                      текстовые блоки в порядке прохождения.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addStep}
                    className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Добавить шаг
                  </button>
                </div>

                {draft.steps.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                    Шагов пока нет. Курс можно сохранить как заготовку и
                    наполнить позже.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.steps.map((step, index) => (
                      <CourseStepEditor
                        key={step.id}
                        index={index}
                        step={step}
                        report={report}
                        onUpdate={(patch) => updateStep(step.id, patch)}
                        onRemove={() => removeStep(step.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </form>
          ) : selectedCourse ? (
            <CoursePreview course={selectedCourse} report={report} />
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              Выберите курс слева.
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

function CourseStepEditor({
  index,
  step,
  report,
  onUpdate,
  onRemove,
}: {
  index: number;
  step: StaffTrainingCourseStep;
  report: StaffTrainingCoursesReport;
  onUpdate: (patch: Partial<StaffTrainingCourseStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50">
      <div className="grid gap-3 lg:grid-cols-[1fr_10rem_auto]">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Шаг {index + 1}
          </span>
          <input
            value={step.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            placeholder="Название шага"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">Тип</span>
          <select
            value={step.type}
            onChange={(event) => {
              const type = event.target.value as StaffTrainingCourseStepType;
              onUpdate({
                type,
                articleId: type === "ARTICLE" ? step.articleId : null,
                url: type === "LINK" ? step.url : null,
              });
            }}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {Object.entries(stepTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
            <input
              type="checkbox"
              checked={step.required}
              onChange={(event) => onUpdate({ required: event.target.checked })}
            />
            Обяз.
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Убрать
          </button>
        </div>
      </div>

      {step.type === "ARTICLE" ? (
        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Материал базы знаний
          </span>
          <select
            value={step.articleId ?? ""}
            onChange={(event) => onUpdate({ articleId: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Выберите статью</option>
            {report.knowledgeArticles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.category} · {article.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {step.type === "LINK" ? (
        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Ссылка
          </span>
          <input
            value={step.url ?? ""}
            onChange={(event) => onUpdate({ url: event.target.value })}
            placeholder="https://..."
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      ) : null}

      {step.type === "TEXT" || step.type === "TASK" ? (
        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            {step.type === "TASK" ? "Задание" : "Текст"}
          </span>
          <textarea
            value={step.content ?? ""}
            onChange={(event) => onUpdate({ content: event.target.value })}
            rows={3}
            placeholder={
              step.type === "TASK"
                ? "Что сотрудник должен сделать и как показать результат."
                : "Что сотрудник должен прочитать на этом шаге."
            }
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      ) : null}
    </div>
  );
}

function CoursePreview({
  course,
  report,
}: {
  course: StaffTrainingCourse;
  report: StaffTrainingCoursesReport;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Курс
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{course.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {roleScopeLabels[course.roleScope]} · {course.store?.name ?? "Вся сеть"}
        {course.dueDays ? ` · срок ${course.dueDays} дн.` : ""}
      </p>
      {course.description ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          {course.description}
        </p>
      ) : null}
      {course.steps.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {course.steps.map((step, index) => (
            <li
              key={step.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {index + 1}
                </span>
                <span className="font-semibold">{step.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {stepTypeLabels[step.type]}
                </span>
                {step.required ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                    обязательно
                  </span>
                ) : null}
              </div>
              {step.type === "ARTICLE" && step.articleId ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {articleTitle(report, step.articleId)}
                </p>
              ) : null}
              {step.content ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {step.content}
                </p>
              ) : null}
              {step.url ? (
                <a
                  href={step.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                >
                  Открыть ссылку
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          В курсе пока нет шагов.
        </p>
      )}
    </div>
  );
}

function articleTitle(report: StaffTrainingCoursesReport, id: string) {
  const article = report.knowledgeArticles.find((item) => item.id === id);

  return article ? `${article.category} · ${article.title}` : "Статья базы знаний";
}
