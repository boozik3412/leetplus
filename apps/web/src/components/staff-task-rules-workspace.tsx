"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffTaskRule,
  StaffTaskRuleCadence,
  StaffTaskRuleReport,
  StaffTaskRuleRunDueResult,
  StaffTaskRuleStatus,
} from "@/lib/staff-task-rules";
import type { StaffTaskPriority, StaffTaskType } from "@/lib/staff-tasks";

const cadenceLabels: Record<StaffTaskRuleCadence, string> = {
  DAILY: "Каждый день",
  WEEKLY: "Каждую неделю",
  MONTHLY: "Каждый месяц",
  OPENING_SHIFT: "Открытие смены",
  CLOSING_SHIFT: "Закрытие смены",
};

const statusLabels: Record<StaffTaskRuleStatus, string> = {
  ACTIVE: "Активно",
  PAUSED: "Пауза",
  ARCHIVED: "Архив",
};

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

const runStatusLabels: Record<string, string> = {
  STARTED: "В работе",
  SUCCESS: "Создана задача",
  SKIPPED: "Дубль пропущен",
  FAILED: "Ошибка",
};

const weekdayLabels = [
  ["1", "Понедельник"],
  ["2", "Вторник"],
  ["3", "Среда"],
  ["4", "Четверг"],
  ["5", "Пятница"],
  ["6", "Суббота"],
  ["7", "Воскресенье"],
] as const;

type DraftRule = {
  id: string | null;
  title: string;
  description: string;
  templateId: string;
  storeId: string;
  assignedToUserId: string;
  cadence: StaffTaskRuleCadence;
  status: StaffTaskRuleStatus;
  taskType: StaffTaskType;
  priority: StaffTaskPriority;
  timeOfDay: string;
  dayOfWeek: string;
  dayOfMonth: string;
  dueOffsetMinutes: string;
  labelsText: string;
};

function defaultDraft(): DraftRule {
  return {
    id: null,
    title: "",
    description: "",
    templateId: "",
    storeId: "",
    assignedToUserId: "",
    cadence: "DAILY",
    status: "ACTIVE",
    taskType: "RECURRING",
    priority: "NORMAL",
    timeOfDay: "10:00",
    dayOfWeek: "1",
    dayOfMonth: "1",
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

function labelsFromText(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function fromRule(row: StaffTaskRule): DraftRule {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    templateId: row.template?.id ?? "",
    storeId: row.store?.id ?? "",
    assignedToUserId: row.assignedToUser?.id ?? "",
    cadence: row.cadence,
    status: row.status,
    taskType: row.taskType,
    priority: row.priority,
    timeOfDay: row.timeOfDay ?? defaultTime(row.cadence),
    dayOfWeek: row.dayOfWeek?.toString() ?? "1",
    dayOfMonth: row.dayOfMonth?.toString() ?? "1",
    dueOffsetMinutes: row.dueOffsetMinutes?.toString() ?? "",
    labelsText: labelsToText(row.labels),
  };
}

function defaultTime(cadence: StaffTaskRuleCadence) {
  if (cadence === "OPENING_SHIFT") {
    return "09:00";
  }

  if (cadence === "CLOSING_SHIFT") {
    return "23:00";
  }

  return "10:00";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Не запланировано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function userLabel(user: { email: string; fullName: string | null } | null) {
  if (!user) {
    return "Не назначен";
  }

  return user.fullName || user.email;
}

export function StaffTaskRulesWorkspace({
  report,
}: {
  report: StaffTaskRuleReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRule>(() =>
    report.rows[0] ? fromRule(report.rows[0]) : defaultDraft(),
  );
  const [launchStoreId, setLaunchStoreId] = useState("");
  const [launchAssignedToUserId, setLaunchAssignedToUserId] = useState("");
  const [launchDueAt, setLaunchDueAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRunningDue, setIsRunningDue] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTaskHref, setLastTaskHref] = useState<string | null>(null);

  const selectedRule = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );

  function updateDraft(patch: Partial<DraftRule>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
    setLastTaskHref(null);
  }

  function startNew() {
    setDraft(defaultDraft());
    setLaunchStoreId("");
    setLaunchAssignedToUserId("");
    setLaunchDueAt("");
    setMessage("Новое правило готово к настройке.");
    setError(null);
    setLastTaskHref(null);
  }

  function selectRule(rule: StaffTaskRule) {
    setDraft(fromRule(rule));
    setLaunchStoreId("");
    setLaunchAssignedToUserId("");
    setLaunchDueAt("");
    setMessage(null);
    setError(null);
    setLastTaskHref(null);
  }

  function applyTemplate(templateId: string) {
    const template = report.templates.find((item) => item.id === templateId);

    updateDraft({
      templateId,
      title: template && !draft.title.trim() ? template.title : draft.title,
      taskType: template?.type ?? draft.taskType,
      priority: template?.priority ?? draft.priority,
      storeId: template?.storeId ?? draft.storeId,
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      setError("Укажите название правила.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    setLastTaskHref(null);

    const labels = labelsFromText(draft.labelsText);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      templateId: draft.templateId || null,
      storeId: draft.storeId || null,
      assignedToUserId: draft.assignedToUserId || null,
      cadence: draft.cadence,
      status: draft.status,
      taskType: draft.taskType,
      priority: draft.priority,
      timeOfDay: draft.timeOfDay || null,
      dayOfWeek: draft.cadence === "WEEKLY" ? draft.dayOfWeek || null : null,
      dayOfMonth: draft.cadence === "MONTHLY" ? draft.dayOfMonth || null : null,
      dueOffsetMinutes: draft.dueOffsetMinutes.trim() || null,
      labels: labels.length > 0 ? labels : null,
    };

    try {
      const response = await fetch(
        draft.id ? `/api/staff/task-rules/${draft.id}` : "/api/staff/task-rules",
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
        throw new Error(data?.message ?? "Не удалось сохранить правило");
      }

      const saved = (await response.json()) as StaffTaskRule;
      setDraft(fromRule(saved));
      setMessage("Правило сохранено.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить правило",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function launch() {
    if (!draft.id) {
      setError("Сначала сохраните правило.");
      return;
    }

    setIsLaunching(true);
    setError(null);
    setMessage(null);
    setLastTaskHref(null);

    try {
      const response = await fetch(`/api/staff/task-rules/${draft.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: launchStoreId || null,
          assignedToUserId: launchAssignedToUserId || null,
          dueAt: launchDueAt || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось создать задачу");
      }

      const created = (await response.json()) as { id: string; title: string };
      setMessage(`Создана задача: ${created.title}`);
      setLastTaskHref(`/staff/tasks?search=${encodeURIComponent(created.title)}`);
      router.refresh();
    } catch (launchError) {
      setError(
        launchError instanceof Error
          ? launchError.message
          : "Не удалось создать задачу",
      );
    } finally {
      setIsLaunching(false);
    }
  }

  async function runDueNow() {
    setIsRunningDue(true);
    setError(null);
    setMessage(null);
    setLastTaskHref(null);

    try {
      const response = await fetch("/api/staff/task-rules/run-due", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          data?.message ?? "Не удалось запустить регулярные правила",
        );
      }

      const result = (await response.json()) as StaffTaskRuleRunDueResult;
      setMessage(
        `Проверено правил: ${result.due}. Создано задач: ${result.created}. Пропущено дублей: ${result.skipped}. Ошибок: ${result.failed}.`,
      );
      router.refresh();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Не удалось запустить регулярные правила",
      );
    } finally {
      setIsRunningDue(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Каталог
            </p>
            <h2 className="mt-1 text-xl font-semibold">Правила задач</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runDueNow}
              disabled={isRunningDue}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {isRunningDue ? "Проверяем..." : "Запустить due"}
            </button>
            <button
              type="button"
              onClick={startNew}
              className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Новое правило
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {report.rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
              Регулярных правил пока нет. Создайте первое правило справа.
            </div>
          ) : (
            report.rows.map((rule) => {
              const isSelected = rule.id === draft.id;

              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => selectRule(rule)}
                  className={[
                    "w-full rounded-md border p-3 text-left transition",
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/70 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{rule.title}</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {cadenceLabels[rule.cadence]} ·{" "}
                        {rule.store?.name ?? "Вся сеть"} ·{" "}
                        {userLabel(rule.assignedToUser)}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {statusLabels[rule.status]}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 dark:text-zinc-400">
                    <span>Следующий запуск: {formatDateTime(rule.nextRunAt)}</span>
                    <span>Создано задач: {rule.tasksCreatedCount}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                Журнал автозапусков
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Последние проверки scheduler и защита от дублей.
              </p>
            </div>
            {report.summary.dueNow > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                Due: {report.summary.dueNow}
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {report.runs.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700">
                Автоматических запусков пока нет.
              </div>
            ) : (
              report.runs.slice(0, 8).map((run) => (
                <div
                  key={run.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{run.ruleTitle}</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        План: {formatDateTime(run.scheduledFor)} · запуск:{" "}
                        {formatDateTime(run.startedAt)}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {runStatusLabels[run.status] ?? run.status}
                    </span>
                  </div>
                  {run.createdTask ? (
                    <Link
                      href={`/staff/tasks?search=${encodeURIComponent(run.createdTask.title)}`}
                      className="mt-2 inline-flex text-xs font-semibold text-emerald-700 underline decoration-emerald-400 underline-offset-4 dark:text-emerald-300"
                    >
                      Открыть задачу
                    </Link>
                  ) : run.message ? (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {run.message}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Конструктор
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {draft.id ? "Редактирование правила" : "Новое регулярное правило"}
            </h2>
          </div>
          {selectedRule?.lastCreatedTask ? (
            <Link
              href={`/staff/tasks?search=${encodeURIComponent(selectedRule.lastCreatedTask.title)}`}
              className="text-sm font-semibold text-emerald-700 underline decoration-emerald-400 underline-offset-4 dark:text-emerald-300"
            >
              Последняя задача
            </Link>
          ) : null}
        </div>

        {(message || error) && (
          <div
            className={[
              "mt-4 rounded-md border px-3 py-2 text-sm",
              error
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
            ].join(" ")}
          >
            <span>{error ?? message}</span>
            {lastTaskHref ? (
              <Link className="ml-2 font-semibold underline" href={lastTaskHref}>
                Открыть
              </Link>
            ) : null}
          </div>
        )}

        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Название
              </span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="Например: Открытие смены"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Шаблон
              </span>
              <select
                value={draft.templateId}
                onChange={(event) => applyTemplate(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Без шаблона</option>
                {report.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Описание задачи
            </span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                updateDraft({ description: event.target.value })
              }
              rows={3}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <div className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Расписание
              </span>
              <select
                value={draft.cadence}
                onChange={(event) => {
                  const cadence = event.target.value as StaffTaskRuleCadence;
                  updateDraft({ cadence, timeOfDay: defaultTime(cadence) });
                }}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(cadenceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Время
              </span>
              <input
                type="time"
                value={draft.timeOfDay}
                onChange={(event) =>
                  updateDraft({ timeOfDay: event.target.value })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            {draft.cadence === "WEEKLY" ? (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  День недели
                </span>
                <select
                  value={draft.dayOfWeek}
                  onChange={(event) =>
                    updateDraft({ dayOfWeek: event.target.value })
                  }
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {weekdayLabels.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  День месяца
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  disabled={draft.cadence !== "MONTHLY"}
                  value={draft.dayOfMonth}
                  onChange={(event) =>
                    updateDraft({ dayOfMonth: event.target.value })
                  }
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                value={draft.storeId}
                onChange={(event) =>
                  updateDraft({ storeId: event.target.value })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                Исполнитель
              </span>
              <select
                value={draft.assignedToUserId}
                onChange={(event) =>
                  updateDraft({ assignedToUserId: event.target.value })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Не назначать</option>
                {report.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName || user.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Тип задачи
              </span>
              <select
                value={draft.taskType}
                onChange={(event) =>
                  updateDraft({ taskType: event.target.value as StaffTaskType })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                Статус
              </span>
              <select
                value={draft.status}
                onChange={(event) =>
                  updateDraft({
                    status: event.target.value as StaffTaskRuleStatus,
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Дедлайн, минут
              </span>
              <input
                type="number"
                min={0}
                max={10080}
                value={draft.dueOffsetMinutes}
                onChange={(event) =>
                  updateDraft({ dueOffsetMinutes: event.target.value })
                }
                placeholder="Напр. 60"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Метки
            </span>
            <input
              value={draft.labelsText}
              onChange={(event) =>
                updateDraft({ labelsText: event.target.value })
              }
              placeholder="смена, касса, стандарт"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Сохраняем..." : "Сохранить правило"}
            </button>
            {selectedRule?.nextRunAt ? (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Следующий запуск: {formatDateTime(selectedRule.nextRunAt)}
              </span>
            ) : null}
          </div>
        </form>

        {draft.id ? (
          <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Ручной запуск
            </p>
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
                  <option value="">Из правила</option>
                  {report.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Исполнитель
                </span>
                <select
                  value={launchAssignedToUserId}
                  onChange={(event) =>
                    setLaunchAssignedToUserId(event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">Из правила</option>
                  {report.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName || user.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Дедлайн
                </span>
                <input
                  type="datetime-local"
                  value={launchDueAt}
                  onChange={(event) => setLaunchDueAt(event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={launch}
              disabled={isLaunching}
              className="mt-3 h-10 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {isLaunching ? "Создаем..." : "Создать задачу сейчас"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
