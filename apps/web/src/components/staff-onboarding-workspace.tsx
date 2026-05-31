"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffOnboardingPlan,
  StaffOnboardingPlanStatus,
  StaffOnboardingReport,
  StaffOnboardingRoleScope,
  StaffOnboardingStep,
  StaffOnboardingStepType,
} from "@/lib/staff-onboarding";

const statusLabels: Record<StaffOnboardingPlanStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffOnboardingRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

const stepTypeLabels: Record<StaffOnboardingStepType, string> = {
  COURSE: "Курс",
  TASK_TEMPLATE: "Шаблон задачи",
  CHECKLIST_TEMPLATE: "Чеклист",
  REGULATION: "Регламент",
  TEXT: "Текст",
  LINK: "Ссылка",
};

type DraftPlan = {
  id: string | null;
  title: string;
  description: string;
  roleScope: StaffOnboardingRoleScope;
  status: StaffOnboardingPlanStatus;
  durationDays: string;
  storeId: string;
  steps: StaffOnboardingStep[];
};

const seedPlans: Array<Omit<DraftPlan, "id" | "storeId">> = [
  {
    title: "Новый администратор: первые 7 дней",
    description:
      "Базовый маршрут адаптации: знакомство со стандартами, регламентом смены, чеклистами и первыми задачами.",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    durationDays: "7",
    steps: [
      {
        id: "step-day-1-brief",
        title: "День 1: вводный инструктаж",
        type: "TEXT",
        day: 1,
        courseId: null,
        taskTemplateId: null,
        checklistTemplateId: null,
        regulationId: null,
        content:
          "Показать рабочее место, кассу, бар, зал, правила связи со старшим администратором и управляющим.",
        url: null,
        required: true,
      },
      {
        id: "step-day-2-task",
        title: "День 2: первая сменная задача",
        type: "TEXT",
        day: 2,
        courseId: null,
        taskTemplateId: null,
        checklistTemplateId: null,
        regulationId: null,
        content:
          "Сотрудник выполняет учебную задачу и прикладывает доказательство выполнения.",
        url: null,
        required: true,
      },
    ],
  },
  {
    title: "Ночная смена: адаптация администратора",
    description:
      "Маршрут для администратора, который выходит в ночные смены: безопасность, касса, закрытие и передача смены.",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    durationDays: "5",
    steps: [
      {
        id: "step-night-rules",
        title: "Правила ночной смены",
        type: "TEXT",
        day: 1,
        courseId: null,
        taskTemplateId: null,
        checklistTemplateId: null,
        regulationId: null,
        content:
          "Разберите порядок контроля зала, гостей, кассы, инцидентов и передачи смены утром.",
        url: null,
        required: true,
      },
    ],
  },
  {
    title: "Администратор -> старший администратор",
    description:
      "Переходный маршрут для сотрудника, который начинает контролировать смену и качество выполнения чеклистов.",
    roleScope: "SENIOR_ADMINISTRATOR",
    status: "DRAFT",
    durationDays: "14",
    steps: [
      {
        id: "step-control-checklists",
        title: "Контроль чеклистов смены",
        type: "TEXT",
        day: 1,
        courseId: null,
        taskTemplateId: null,
        checklistTemplateId: null,
        regulationId: null,
        content:
          "Старший администратор учится принимать сменные чеклисты, возвращать на доработку и создавать follow-up задачи.",
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

function defaultDraft(): DraftPlan {
  return {
    id: null,
    title: "",
    description: "",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    durationDays: "7",
    storeId: "",
    steps: [],
  };
}

function fromPlan(row: StaffOnboardingPlan): DraftPlan {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    roleScope: row.roleScope,
    status: row.status,
    durationDays: row.durationDays?.toString() ?? "",
    storeId: row.store?.id ?? "",
    steps: row.steps,
  };
}

function emptyStep(): StaffOnboardingStep {
  return {
    id: uid("step"),
    title: "",
    type: "TEXT",
    day: null,
    courseId: null,
    taskTemplateId: null,
    checklistTemplateId: null,
    regulationId: null,
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

export function StaffOnboardingWorkspace({
  report,
}: {
  report: StaffOnboardingReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftPlan>(() =>
    report.rows[0] ? fromPlan(report.rows[0]) : defaultDraft(),
  );
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );

  function updateDraft(patch: Partial<DraftPlan>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function loadSeed(seed: Omit<DraftPlan, "id" | "storeId">) {
    setDraft({ ...seed, id: null, storeId: "" });
    setMessage("Шаблон онбординга загружен. Настройте шаги и сохраните.");
    setError(null);
  }

  function addStep() {
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, emptyStep()],
    }));
  }

  function updateStep(stepId: string, patch: Partial<StaffOnboardingStep>) {
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
      setError("Укажите название маршрута.");
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
      durationDays: draft.durationDays.trim() || null,
      storeId: draft.storeId || null,
      steps: draft.steps
        .map((step) => ({
          ...step,
          title: step.title.trim(),
          day: step.day ?? null,
          courseId: step.courseId || null,
          taskTemplateId: step.taskTemplateId || null,
          checklistTemplateId: step.checklistTemplateId || null,
          regulationId: step.regulationId || null,
          content: step.content?.trim() || null,
          url: step.url?.trim() || null,
        }))
        .filter(
          (step) =>
            step.title ||
            step.content ||
            step.url ||
            step.courseId ||
            step.taskTemplateId ||
            step.checklistTemplateId ||
            step.regulationId,
        ),
    };

    try {
      const response = await fetch(
        draft.id ? `/api/staff/onboarding/${draft.id}` : "/api/staff/onboarding",
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
        throw new Error(data?.message ?? "Не удалось сохранить маршрут");
      }

      const saved = (await response.json()) as StaffOnboardingPlan;
      setDraft(fromPlan(saved));
      setMessage("Маршрут онбординга сохранен.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {report.canManageOnboarding ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Быстрый старт
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Шаблоны адаптации
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDraft(defaultDraft())}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Новый маршрут
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {seedPlans.map((seed) => (
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
              <h2 className="mt-1 text-lg font-semibold">
                Маршруты онбординга
              </h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {report.rows.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Маршрутов пока нет. Создайте первый путь адаптации справа.
              </p>
            ) : (
              report.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(fromPlan(row))}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    {report.canManageOnboarding ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {statusLabels[row.status]}
                      </span>
                    ) : null}
                    {row.durationDays ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                        {row.durationDays} дн.
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
          {report.canManageOnboarding ? (
            <form onSubmit={save}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Конструктор
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.id ? "Редактирование маршрута" : "Новый маршрут"}
                  </h2>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Сохраняем..." : "Сохранить маршрут"}
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
                    placeholder="Например: новый администратор - первые 7 дней"
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
                        status: event.target.value as StaffOnboardingPlanStatus,
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
                    Роль
                  </span>
                  <select
                    value={draft.roleScope}
                    onChange={(event) =>
                      updateDraft({
                        roleScope: event.target.value as StaffOnboardingRoleScope,
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
                    Длительность, дней
                  </span>
                  <input
                    inputMode="numeric"
                    value={draft.durationDays}
                    onChange={(event) =>
                      updateDraft({ durationDays: event.target.value })
                    }
                    placeholder="7"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
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
                  placeholder="Что сотрудник должен освоить и кто контролирует прохождение."
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Шаги адаптации
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Свяжите план с курсами, регламентами, чеклистами,
                      шаблонами задач, ссылками и текстовыми инструкциями.
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
                    Шагов пока нет. Добавьте хотя бы вводный текст или курс,
                    когда маршрут будет готов к публикации.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.steps.map((step, index) => (
                      <OnboardingStepEditor
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
          ) : selectedPlan ? (
            <OnboardingPreview plan={selectedPlan} report={report} />
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              Выберите маршрут слева.
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

function OnboardingStepEditor({
  index,
  step,
  report,
  onUpdate,
  onRemove,
}: {
  index: number;
  step: StaffOnboardingStep;
  report: StaffOnboardingReport;
  onUpdate: (patch: Partial<StaffOnboardingStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50">
      <div className="grid gap-3 lg:grid-cols-[1fr_9rem_8rem_auto]">
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
              const type = event.target.value as StaffOnboardingStepType;
              onUpdate({
                type,
                courseId: type === "COURSE" ? step.courseId : null,
                taskTemplateId:
                  type === "TASK_TEMPLATE" ? step.taskTemplateId : null,
                checklistTemplateId:
                  type === "CHECKLIST_TEMPLATE"
                    ? step.checklistTemplateId
                    : null,
                regulationId: type === "REGULATION" ? step.regulationId : null,
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

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">День</span>
          <input
            inputMode="numeric"
            value={step.day ?? ""}
            onChange={(event) =>
              onUpdate({
                day: event.target.value ? Number(event.target.value) : null,
              })
            }
            placeholder="1"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
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

      <StepReferenceEditor step={step} report={report} onUpdate={onUpdate} />
    </div>
  );
}

function StepReferenceEditor({
  step,
  report,
  onUpdate,
}: {
  step: StaffOnboardingStep;
  report: StaffOnboardingReport;
  onUpdate: (patch: Partial<StaffOnboardingStep>) => void;
}) {
  if (step.type === "COURSE") {
    return (
      <OptionSelect
        label="Курс обучения"
        value={step.courseId ?? ""}
        options={report.courses}
        onChange={(value) => onUpdate({ courseId: value })}
      />
    );
  }

  if (step.type === "TASK_TEMPLATE") {
    return (
      <OptionSelect
        label="Шаблон задачи"
        value={step.taskTemplateId ?? ""}
        options={report.taskTemplates}
        onChange={(value) => onUpdate({ taskTemplateId: value })}
      />
    );
  }

  if (step.type === "CHECKLIST_TEMPLATE") {
    return (
      <OptionSelect
        label="Шаблон чеклиста"
        value={step.checklistTemplateId ?? ""}
        options={report.checklistTemplates}
        onChange={(value) => onUpdate({ checklistTemplateId: value })}
      />
    );
  }

  if (step.type === "REGULATION") {
    return (
      <OptionSelect
        label="Регламент"
        value={step.regulationId ?? ""}
        options={report.regulations}
        onChange={(value) => onUpdate({ regulationId: value })}
      />
    );
  }

  if (step.type === "LINK") {
    return (
      <>
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
        <StepContentArea step={step} onUpdate={onUpdate} />
      </>
    );
  }

  return <StepContentArea step={step} onUpdate={onUpdate} />;
}

function OptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: StaffOnboardingReport["courses"];
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block space-y-1">
      <span className="text-xs font-bold uppercase text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="">Выберите элемент</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title} · {option.store?.name ?? "Вся сеть"} ·{" "}
            {option.status}
          </option>
        ))}
      </select>
    </label>
  );
}

function StepContentArea({
  step,
  onUpdate,
}: {
  step: StaffOnboardingStep;
  onUpdate: (patch: Partial<StaffOnboardingStep>) => void;
}) {
  return (
    <label className="mt-3 block space-y-1">
      <span className="text-xs font-bold uppercase text-zinc-500">
        {step.type === "LINK" ? "Комментарий" : "Текст шага"}
      </span>
      <textarea
        value={step.content ?? ""}
        onChange={(event) => onUpdate({ content: event.target.value })}
        rows={3}
        placeholder="Что сотрудник должен сделать или изучить на этом шаге."
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function OnboardingPreview({
  plan,
  report,
}: {
  plan: StaffOnboardingPlan;
  report: StaffOnboardingReport;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Маршрут
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{plan.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {roleScopeLabels[plan.roleScope]} · {plan.store?.name ?? "Вся сеть"}
        {plan.durationDays ? ` · ${plan.durationDays} дн.` : ""}
      </p>
      {plan.description ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          {plan.description}
        </p>
      ) : null}
      {plan.steps.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {plan.steps.map((step, index) => (
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
                {step.day ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    день {step.day}
                  </span>
                ) : null}
                {step.required ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                    обязательно
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {stepReferenceTitle(report, step)}
              </p>
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
          В маршруте пока нет шагов.
        </p>
      )}
    </div>
  );
}

function stepReferenceTitle(
  report: StaffOnboardingReport,
  step: StaffOnboardingStep,
) {
  if (step.type === "COURSE") {
    return optionTitle(report.courses, step.courseId, "Курс обучения");
  }

  if (step.type === "TASK_TEMPLATE") {
    return optionTitle(report.taskTemplates, step.taskTemplateId, "Шаблон задачи");
  }

  if (step.type === "CHECKLIST_TEMPLATE") {
    return optionTitle(
      report.checklistTemplates,
      step.checklistTemplateId,
      "Шаблон чеклиста",
    );
  }

  if (step.type === "REGULATION") {
    return optionTitle(report.regulations, step.regulationId, "Регламент");
  }

  return step.type === "LINK" ? "Внешняя ссылка" : "Текстовая инструкция";
}

function optionTitle(
  options: StaffOnboardingReport["courses"],
  id: string | null,
  fallback: string,
) {
  const option = options.find((item) => item.id === id);

  return option ? `${option.title} · ${option.store?.name ?? "Вся сеть"}` : fallback;
}
