"use client";

import { useState, type ReactNode } from "react";
import type {
  StaffChecklistExecutionMetrics,
  StaffChecklistExecutionReport,
  StaffChecklistExecutionRun,
  StaffChecklistStatus,
} from "@/lib/staff-checklists";
import type {
  StaffTask,
  StaffTaskGroup,
  StaffTaskReport,
  StaffTaskStatus,
} from "@/lib/staff-tasks";

type OverviewGroup = {
  key: string;
  label: string;
  caption: string | null;
  checklist: StaffChecklistExecutionMetrics;
  tasks: StaffTaskGroup;
  activeAdmins: number;
  kind: "club" | "employee";
};

type ModalState =
  | { type: "club"; key: string }
  | { type: "employee"; key: string }
  | null;

type ShiftSnapshot = {
  key: string;
  startedAt: string | null;
  stoppedAt: string | null;
  storeName: string | null;
  admins: string[];
  runs: StaffChecklistExecutionRun[];
};

const emptyChecklistMetrics: StaffChecklistExecutionMetrics = {
  total: 0,
  open: 0,
  inProgress: 0,
  onReview: 0,
  accepted: 0,
  returned: 0,
  escalated: 0,
  canceled: 0,
  overdue: 0,
  failedItems: 0,
  blockingIssues: 0,
  scoreTotal: 0,
  scoreEarned: 0,
  scorePercent: 0,
  requiredItemsTotal: 0,
  requiredItemsDone: 0,
  requiredPercent: 0,
  evidenceTotal: 0,
  evidenceDone: 0,
  evidencePercent: 0,
};

const emptyTaskGroup: StaffTaskGroup = {
  key: "empty",
  label: "Нет задач",
  hint: null,
  total: 0,
  open: 0,
  inProgress: 0,
  onReview: 0,
  done: 0,
  overdue: 0,
  canceled: 0,
  filter: {},
};

const checklistStatusLabels: Record<StaffChecklistStatus, string> = {
  OPEN: "Новый",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Принят",
  RETURNED: "Возвращен",
  ESCALATED: "Эскалация",
  CANCELED: "Отменен",
};

const taskStatusLabels: Record<StaffTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  DONE: "Готово",
  CANCELED: "Отменена",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function userName(user: StaffChecklistExecutionRun["assignedToUser"]) {
  return user?.fullName ?? user?.email ?? "Сотрудник не указан";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value)}%`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratioPercent(done: number, total: number) {
  return total > 0 ? (done / total) * 100 : 0;
}

function activeChecklistCount(metrics: StaffChecklistExecutionMetrics) {
  return (
    metrics.open +
    metrics.inProgress +
    metrics.onReview +
    metrics.returned +
    metrics.escalated
  );
}

function activeTaskCount(metrics: Pick<StaffTaskGroup, "open" | "inProgress" | "onReview">) {
  return metrics.open + metrics.inProgress + metrics.onReview;
}

function taskCompletionPercent(metrics: Pick<StaffTaskGroup, "total" | "done" | "canceled">) {
  return ratioPercent(metrics.done, Math.max(metrics.total - metrics.canceled, 0));
}

function checklistRunTime(run: StaffChecklistExecutionRun) {
  return run.submittedAt ?? run.scheduledAt ?? run.shift?.startedAt ?? null;
}

function checklistProgress(run: StaffChecklistExecutionRun) {
  return `${formatNumber(run.requiredItemsDone)}/${formatNumber(
    run.requiredItemsTotal,
  )} пунктов`;
}

function getChecklistSortTime(run: StaffChecklistExecutionRun) {
  const value = checklistRunTime(run);

  return value ? new Date(value).getTime() : 0;
}

function operationsDetailHref(userId: string) {
  return `/staff/operations-dashboard?userId=${encodeURIComponent(userId)}`;
}

function checklistDetailHref(userId: string) {
  return `/staff/checklists/report?assignedToUserId=${encodeURIComponent(
    userId,
  )}`;
}

function taskDetailHref(userId: string) {
  return `/staff/tasks?assignedToUserId=${encodeURIComponent(
    userId,
  )}&view=byShift`;
}

function isActiveChecklistRun(run: StaffChecklistExecutionRun) {
  return ["OPEN", "IN_PROGRESS", "ON_REVIEW", "RETURNED", "ESCALATED"].includes(
    run.status,
  );
}

function isActiveTask(task: StaffTask) {
  return !["DONE", "CANCELED"].includes(task.status);
}

function getTaskStoreKey(task: StaffTask) {
  return task.store?.id ?? task.shift?.store?.id ?? "network";
}

function getChecklistStoreKey(run: StaffChecklistExecutionRun) {
  return run.store?.id ?? run.shift?.store?.id ?? "network";
}

function getClubRuns(
  checklists: StaffChecklistExecutionReport,
  group: OverviewGroup,
) {
  return checklists.runs.filter((run) => getChecklistStoreKey(run) === group.key);
}

function getClubTasks(tasks: StaffTaskReport, group: OverviewGroup) {
  return tasks.rows.filter((task) => getTaskStoreKey(task) === group.key);
}

function getEmployeeRuns(
  checklists: StaffChecklistExecutionReport,
  group: OverviewGroup,
) {
  return checklists.runs.filter((run) => run.assignedToUser?.id === group.key);
}

function getEmployeeTasks(tasks: StaffTaskReport, group: OverviewGroup) {
  return tasks.rows.filter((task) => task.assignedToUser?.id === group.key);
}

function taskTime(task: StaffTask) {
  return task.dueAt ?? task.completedAt ?? task.updatedAt ?? task.createdAt;
}

function getTaskSortTime(task: StaffTask) {
  const value = taskTime(task);

  return value ? new Date(value).getTime() : 0;
}

function sortRunsByRecent(runs: StaffChecklistExecutionRun[]) {
  return [...runs].sort(
    (left, right) => getChecklistSortTime(right) - getChecklistSortTime(left),
  );
}

function sortTasksByRecent(tasks: StaffTask[]) {
  return [...tasks].sort(
    (left, right) => getTaskSortTime(right) - getTaskSortTime(left),
  );
}

function taskAssigneeName(task: StaffTask) {
  return (
    task.assignedToUser?.fullName ??
    task.assignedToUser?.email ??
    "Не назначен"
  );
}

function hasChecklistControlGap(group: OverviewGroup) {
  return (
    group.kind === "club" &&
    group.activeAdmins > 0 &&
    activeChecklistCount(group.checklist) === 0
  );
}

function buildShiftSnapshots(runs: StaffChecklistExecutionRun[]) {
  const shifts = new Map<string, ShiftSnapshot>();

  runs.forEach((run) => {
    const key = run.shift?.id ?? `run:${run.id}`;
    const current = shifts.get(key) ?? {
      key,
      startedAt: run.shift?.startedAt ?? checklistRunTime(run),
      stoppedAt: run.shift?.stoppedAt ?? null,
      storeName: run.shift?.store?.name ?? run.store?.name ?? null,
      admins: [],
      runs: [],
    };

    current.runs.push(run);
    current.admins = uniqueStrings([
      ...current.admins,
      userName(run.assignedToUser),
    ]);
    shifts.set(key, current);
  });

  return Array.from(shifts.values()).sort((left, right) => {
    const leftTime = left.startedAt ? new Date(left.startedAt).getTime() : 0;
    const rightTime = right.startedAt ? new Date(right.startedAt).getTime() : 0;

    return rightTime - leftTime;
  });
}

function checklistStatusClass(status: StaffChecklistStatus, overdue: number) {
  if (overdue > 0 || status === "ESCALATED") {
    return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-900/70";
  }

  if (status === "ACCEPTED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-900/70";
  }

  if (status === "ON_REVIEW") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-900/70";
  }

  if (status === "RETURNED") {
    return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-900/70";
  }

  return "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700";
}

function taskStatusClass(status: StaffTaskStatus, isOverdue: boolean) {
  if (isOverdue) {
    return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-900/70";
  }

  if (status === "DONE") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-900/70";
  }

  if (status === "ON_REVIEW") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-900/70";
  }

  return "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700";
}

function buildActiveAdminSets(
  checklists: StaffChecklistExecutionReport,
  tasks: StaffTaskReport,
) {
  const total = new Set<string>();
  const byClub = new Map<string, Set<string>>();

  checklists.runs.forEach((run) => {
    const userId = run.assignedToUser?.id;

    if (!userId || !isActiveChecklistRun(run)) {
      return;
    }

    total.add(userId);

    const storeKey = getChecklistStoreKey(run);
    const clubSet = byClub.get(storeKey) ?? new Set<string>();
    clubSet.add(userId);
    byClub.set(storeKey, clubSet);
  });

  tasks.rows.forEach((task) => {
    const userId = task.assignedToUser?.id;

    if (!userId || !isActiveTask(task)) {
      return;
    }

    total.add(userId);

    const storeKey = getTaskStoreKey(task);
    const clubSet = byClub.get(storeKey) ?? new Set<string>();
    clubSet.add(userId);
    byClub.set(storeKey, clubSet);
  });

  return { total, byClub };
}

function activeShiftCount(
  checklists: StaffChecklistExecutionReport,
  tasks: StaffTaskReport,
) {
  const shifts = new Set<string>();

  checklists.runs.forEach((run) => {
    if (run.shift && !run.shift.stoppedAt) {
      shifts.add(run.shift.id);
    }
  });

  tasks.rows.forEach((task) => {
    if (task.shift && !task.shift.stoppedAt) {
      shifts.add(task.shift.id);
    }
  });

  return shifts.size;
}

function mergeByClub(
  checklists: StaffChecklistExecutionReport,
  tasks: StaffTaskReport,
  activeAdminsByClub: Map<string, Set<string>>,
) {
  const groups = new Map<string, OverviewGroup>();

  checklists.byClub.forEach((group) => {
    groups.set(group.key, {
      key: group.key,
      label: group.label,
      caption: group.caption,
      checklist: group,
      tasks: { ...emptyTaskGroup, key: group.key, label: group.label },
      activeAdmins: activeAdminsByClub.get(group.key)?.size ?? 0,
      kind: "club",
    });
  });

  tasks.groups.byClub.forEach((group) => {
    const current = groups.get(group.key);

    groups.set(group.key, {
      key: group.key,
      label: current?.label ?? group.label,
      caption: current?.caption ?? group.hint,
      checklist: current?.checklist ?? emptyChecklistMetrics,
      tasks: group,
      activeAdmins: activeAdminsByClub.get(group.key)?.size ?? current?.activeAdmins ?? 0,
      kind: "club",
    });
  });

  return Array.from(groups.values()).sort(compareOverviewGroups);
}

function mergeByEmployee(
  checklists: StaffChecklistExecutionReport,
  tasks: StaffTaskReport,
) {
  const groups = new Map<string, OverviewGroup>();

  checklists.byEmployee.forEach((group) => {
    groups.set(group.key, {
      key: group.key,
      label: group.label,
      caption: group.caption,
      checklist: group,
      tasks: { ...emptyTaskGroup, key: group.key, label: group.label },
      activeAdmins: activeChecklistCount(group) > 0 ? 1 : 0,
      kind: "employee",
    });
  });

  tasks.groups.byEmployee.forEach((group) => {
    const current = groups.get(group.key);

    groups.set(group.key, {
      key: group.key,
      label: current?.label ?? group.label,
      caption: current?.caption ?? group.hint,
      checklist: current?.checklist ?? emptyChecklistMetrics,
      tasks: group,
      activeAdmins:
        current?.activeAdmins ?? (activeTaskCount(group) > 0 ? 1 : 0),
      kind: "employee",
    });
  });

  return Array.from(groups.values())
    .filter((group) => group.key !== "unassigned")
    .sort(compareOverviewGroups);
}

function compareOverviewGroups(left: OverviewGroup, right: OverviewGroup) {
  const leftIssues =
    left.checklist.overdue +
    left.checklist.blockingIssues +
    left.tasks.overdue;
  const rightIssues =
    right.checklist.overdue +
    right.checklist.blockingIssues +
    right.tasks.overdue;

  if (rightIssues !== leftIssues) {
    return rightIssues - leftIssues;
  }

  const rightActive =
    activeChecklistCount(right.checklist) + activeTaskCount(right.tasks);
  const leftActive =
    activeChecklistCount(left.checklist) + activeTaskCount(left.tasks);

  return rightActive - leftActive || left.label.localeCompare(right.label);
}

function progressTone(value: number) {
  if (value >= 85) {
    return "bg-emerald-500";
  }

  if (value >= 55) {
    return "bg-cyan-500";
  }

  if (value > 0) {
    return "bg-amber-500";
  }

  return "bg-zinc-300 dark:bg-zinc-700";
}

function MiniProgress({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  const percent = clampPercent(value);

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-semibold uppercase text-zinc-500">
          {label}
        </span>
        <span className="font-semibold text-zinc-950 dark:text-zinc-100">
          {formatPercent(percent)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${progressTone(percent)}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function OperationsRow({
  group,
  onOpen,
}: {
  group: OverviewGroup;
  onOpen: () => void;
}) {
  const checklistPercent = group.checklist.requiredPercent;
  const taskPercent = taskCompletionPercent(group.tasks);
  const activityCount =
    group.kind === "club"
      ? group.activeAdmins
      : activeChecklistCount(group.checklist) + activeTaskCount(group.tasks);
  const activityLabel = group.kind === "club" ? "админов" : "активных";
  const checklistGap = hasChecklistControlGap(group);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-3 border-t border-zinc-100 py-3 text-left transition first:border-t-0 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:border-zinc-800 dark:hover:bg-zinc-900/70 sm:grid-cols-[minmax(0,1.35fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem] sm:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          {group.label}
        </p>
        {group.caption ? (
          <p className="mt-1 truncate text-xs text-zinc-500">{group.caption}</p>
        ) : null}
        {checklistGap ? (
          <p className="mt-1 inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-900/70">
            Нет активного чек-листа на смене
          </p>
        ) : null}
      </div>
      <div className="inline-flex w-fit items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        <span>{formatNumber(activityCount)}</span>
        <span className="font-medium text-zinc-500">{activityLabel}</span>
      </div>
      <MiniProgress
        label="Чек-листы"
        value={checklistPercent}
        detail={`${formatNumber(group.checklist.requiredItemsDone)}/${formatNumber(
          group.checklist.requiredItemsTotal,
        )} пунктов`}
      />
      <MiniProgress
        label="Задачи"
        value={taskPercent}
        detail={`${formatNumber(group.tasks.done)}/${formatNumber(
          Math.max(group.tasks.total - group.tasks.canceled, 0),
        )} закрыто`}
      />
      <span
        aria-hidden="true"
        className="hidden size-6 items-center justify-center rounded-full border border-zinc-200 text-sm text-zinc-500 transition group-hover:border-emerald-300 group-hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400 sm:inline-flex"
      >
        →
      </span>
    </button>
  );
}

function Metric({
  label,
  value,
  caption,
  tone = "default",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-300"
          : "text-zinc-950 dark:text-zinc-100";

  return (
    <div className="min-w-0 border-t border-zinc-100 pt-3 dark:border-zinc-800 lg:border-t-0 lg:pt-0">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">{caption}</p>
    </div>
  );
}

function DetailsBlock({
  title,
  count,
  children,
  open,
}: {
  title: string;
  count: number;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="group rounded-md border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/60"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs text-zinc-500 ring-1 ring-zinc-200 transition dark:bg-zinc-900 dark:ring-zinc-800">
            <span className="transition-transform group-open:rotate-90">›</span>
          </span>
          <span className="truncate">{title}</span>
        </span>
        <span className="inline-flex shrink-0 items-center rounded-full bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          {formatNumber(count)}
        </span>
      </summary>
      <div className="px-3 pb-2">{children}</div>
    </details>
  );
}

function StatusPill({
  status,
  overdue,
}: {
  status: StaffChecklistStatus;
  overdue: number;
}) {
  return (
    <span
      className={[
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
        checklistStatusClass(status, overdue),
      ].join(" ")}
    >
      {overdue > 0 ? "Просрочен" : checklistStatusLabels[status]}
    </span>
  );
}

function TaskStatusPill({ task }: { task: StaffTask }) {
  return (
    <span
      className={[
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
        taskStatusClass(task.status, task.isOverdue),
      ].join(" ")}
    >
      {task.isOverdue ? "Просрочена" : taskStatusLabels[task.status]}
    </span>
  );
}

function AttentionNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-amber-800/80 dark:text-amber-100/75">
        {children}
      </p>
    </div>
  );
}

function RecentChecklistItem({ run }: { run: StaffChecklistExecutionRun }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{run.title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDateTime(checklistRunTime(run))}
            {run.shift?.store?.name || run.store?.name
              ? ` · ${run.shift?.store?.name ?? run.store?.name}`
              : ""}
          </p>
        </div>
        <StatusPill status={run.status} overdue={run.overdue} />
      </div>
      <div className="mt-3">
        <MiniProgress
          label="Прогресс пунктов"
          value={run.requiredPercent}
          detail={checklistProgress(run)}
        />
      </div>
    </div>
  );
}

function RecentTaskItem({ task }: { task: StaffTask }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{task.title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDateTime(taskTime(task))}
            {task.store?.name || task.shift?.store?.name
              ? ` · ${task.store?.name ?? task.shift?.store?.name}`
              : ""}
          </p>
        </div>
        <TaskStatusPill task={task} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Ответственный: {taskAssigneeName(task)}
      </p>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string | null;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Детализация
            </p>
            <h3 className="mt-1 truncate text-xl font-semibold tracking-tight">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-200 text-lg text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(88vh-5.5rem)] overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function ClubModal({
  group,
  checklists,
  recentChecklists,
  tasks,
  recentTasks,
  fallbackMode,
  onClose,
}: {
  group: OverviewGroup;
  checklists: StaffChecklistExecutionReport;
  recentChecklists: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks: StaffTaskReport;
  fallbackMode: boolean;
  onClose: () => void;
}) {
  const currentRuns = sortRunsByRecent(getClubRuns(checklists, group));
  const currentTasks = sortTasksByRecent(getClubTasks(tasks, group));
  const recentRuns = sortRunsByRecent(getClubRuns(recentChecklists, group));
  const fallbackRuns = currentRuns.length > 0 ? currentRuns : recentRuns;
  const fallbackTasks =
    currentTasks.length > 0
      ? currentTasks
      : sortTasksByRecent(getClubTasks(recentTasks, group));
  const shifts = buildShiftSnapshots(fallbackRuns).slice(0, 3);
  const showingFallback = fallbackMode || currentRuns.length === 0 || currentTasks.length === 0;

  return (
    <ModalShell title={group.label} subtitle={group.caption} onClose={onClose}>
      <div className="mb-4 space-y-3">
        {showingFallback ? (
          <AttentionNote title="За сегодня мало данных">
            Показываем последнюю активность за период: до 2 чек-листов и до 2 задач, чтобы было видно, когда клуб последний раз работал по контролю.
          </AttentionNote>
        ) : null}
        {hasChecklistControlGap(group) ? (
          <AttentionNote title="Нужна проверка чек-листа">
            В клубе есть активный администратор, но нет активного чек-листа на смене. Это точка внимания: администраторы не должны работать без чек-листа.
          </AttentionNote>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Чек-листы"
          value={formatPercent(group.checklist.requiredPercent)}
          caption={`${formatNumber(group.checklist.requiredItemsDone)}/${formatNumber(
            group.checklist.requiredItemsTotal,
          )} пунктов`}
          tone={group.checklist.requiredPercent >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Задачи"
          value={formatPercent(taskCompletionPercent(group.tasks))}
          caption={`${formatNumber(group.tasks.done)}/${formatNumber(
            Math.max(group.tasks.total - group.tasks.canceled, 0),
          )} закрыто`}
          tone={taskCompletionPercent(group.tasks) >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Админы"
          value={formatNumber(group.activeAdmins)}
          caption="активных на сменах"
          tone={group.activeAdmins > 0 ? "good" : "default"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold uppercase text-zinc-500">
            Последние чек-листы
          </h4>
          <div className="mt-3 space-y-2">
            {fallbackRuns.length > 0 ? (
              fallbackRuns.slice(0, 2).map((run) => (
                <RecentChecklistItem key={run.id} run={run} />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                За период чек-листы по клубу не найдены.
              </p>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase text-zinc-500">
            Последние задачи
          </h4>
          <div className="mt-3 space-y-2">
            {fallbackTasks.length > 0 ? (
              fallbackTasks.slice(0, 2).map((task) => (
                <RecentTaskItem key={task.id} task={task} />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                За период задачи по клубу не найдены.
              </p>
            )}
          </div>
        </div>
      </div>

      {shifts.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold uppercase text-zinc-500">
            Последние смены
          </h4>
          <div className="mt-3 space-y-2">
            {shifts.map((shift) => (
              <div
                key={shift.key}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <p className="text-sm font-semibold">
                  {shift.storeName ?? group.label}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDateTime(shift.startedAt)}
                  {shift.stoppedAt
                    ? ` - ${formatDateTime(shift.stoppedAt)}`
                    : " - смена открыта"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {shift.admins.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

function EmployeeModal({
  group,
  checklists,
  recentChecklists,
  tasks,
  recentTasks,
  fallbackMode,
  onClose,
}: {
  group: OverviewGroup;
  checklists: StaffChecklistExecutionReport;
  recentChecklists: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks: StaffTaskReport;
  fallbackMode: boolean;
  onClose: () => void;
}) {
  const currentRuns = sortRunsByRecent(getEmployeeRuns(checklists, group));
  const currentTasks = sortTasksByRecent(getEmployeeTasks(tasks, group));
  const recentRuns = sortRunsByRecent(getEmployeeRuns(recentChecklists, group));
  const displayRuns = currentRuns.length > 0 ? currentRuns : recentRuns;
  const displayTasks =
    currentTasks.length > 0
      ? currentTasks
      : sortTasksByRecent(getEmployeeTasks(recentTasks, group));
  const showingFallback = fallbackMode || currentRuns.length === 0 || currentTasks.length === 0;

  return (
    <ModalShell
      title={group.label}
      subtitle={group.caption}
      onClose={onClose}
    >
      {showingFallback ? (
        <div className="mb-4">
          <AttentionNote title="За сегодня мало данных">
            Показываем последнюю активность сотрудника за период: до 2 чек-листов и до 2 задач. Полную историю можно открыть через детализацию.
          </AttentionNote>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Чек-листы"
          value={formatPercent(group.checklist.requiredPercent)}
          caption={`${formatNumber(group.checklist.requiredItemsDone)}/${formatNumber(
            group.checklist.requiredItemsTotal,
          )} пунктов`}
          tone={group.checklist.requiredPercent >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Задачи"
          value={formatPercent(taskCompletionPercent(group.tasks))}
          caption={`${formatNumber(group.tasks.done)}/${formatNumber(
            Math.max(group.tasks.total - group.tasks.canceled, 0),
          )} закрыто`}
          tone={taskCompletionPercent(group.tasks) >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Внимание"
          value={formatNumber(
            group.checklist.overdue +
              group.checklist.blockingIssues +
              group.tasks.overdue,
          )}
          caption="просрочки и блокеры"
          tone={
            group.checklist.overdue +
              group.checklist.blockingIssues +
              group.tasks.overdue >
            0
              ? "bad"
              : "good"
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={operationsDetailHref(group.key)}
          className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          Детализация
        </a>
        <a
          href={checklistDetailHref(group.key)}
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          История чек-листов
        </a>
        <a
          href={taskDetailHref(group.key)}
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Задачи по сменам
        </a>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold uppercase text-zinc-500">
            Последние чек-листы
          </h4>
          <div className="mt-3 space-y-2">
            {displayRuns.length > 0 ? (
              displayRuns.slice(0, 2).map((run) => (
                <RecentChecklistItem key={run.id} run={run} />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                За период чек-листы по сотруднику не найдены.
              </p>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase text-zinc-500">
            Последние задачи
          </h4>
          <div className="mt-3 space-y-2">
            {displayTasks.length > 0 ? (
              displayTasks.slice(0, 2).map((task) => (
                <RecentTaskItem key={task.id} task={task} />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                За период задачи по сотруднику не найдены.
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export function StaffShiftOperationsOverview({
  checklists,
  recentChecklists,
  tasks,
  recentTasks,
  dateLabel,
}: {
  checklists: StaffChecklistExecutionReport;
  recentChecklists?: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks?: StaffTaskReport;
  dateLabel: string;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const activeAdmins = buildActiveAdminSets(checklists, tasks);
  const clubGroups = mergeByClub(checklists, tasks, activeAdmins.byClub);
  const employeeGroups = mergeByEmployee(checklists, tasks);
  const modalChecklists = recentChecklists ?? checklists;
  const modalTasks = recentTasks ?? tasks;
  const recentActiveAdmins = buildActiveAdminSets(modalChecklists, modalTasks);
  const recentClubGroups = mergeByClub(
    modalChecklists,
    modalTasks,
    recentActiveAdmins.byClub,
  );
  const recentEmployeeGroups = mergeByEmployee(modalChecklists, modalTasks);
  const hasCurrentRows = checklists.summary.total > 0 || tasks.summary.total > 0;
  const useFallbackGroups =
    !hasCurrentRows && (recentClubGroups.length > 0 || recentEmployeeGroups.length > 0);
  const displayClubGroups = useFallbackGroups ? recentClubGroups : clubGroups;
  const displayEmployeeGroups = useFallbackGroups
    ? recentEmployeeGroups
    : employeeGroups;
  const selectedGroup = modal
    ? (modal.type === "club" ? displayClubGroups : displayEmployeeGroups).find(
        (group) => group.key === modal.key,
      ) ?? null
    : null;
  const shiftsCount = activeShiftCount(checklists, tasks);
  const taskWorkTotal = Math.max(tasks.summary.total - tasks.summary.canceled, 0);
  const taskPercent = ratioPercent(tasks.summary.done, taskWorkTotal);
  const checklistActive = activeChecklistCount(checklists.summary);
  const taskActive = activeTaskCount(tasks.summary);
  const noChecklistWorkflow =
    checklists.summary.accepted + checklistActive === 0;
  const riskCount =
    checklists.summary.overdue +
    checklists.summary.blockingIssues +
    tasks.summary.overdue;

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/40 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
      <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Операционный контроль
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Администраторы на сменах
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Текущий срез по чек-листам и задачам за {dateLabel}: сначала
            общий итог, ниже раскрытие по клубам и сотрудникам.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Сегодня
        </div>
      </div>

      <div className="grid gap-4 py-4 lg:grid-cols-4">
        <Metric
          label="Админы в работе"
          value={formatNumber(activeAdmins.total.size)}
          caption={`${formatNumber(shiftsCount)} смен Langame, ${formatNumber(
            clubGroups.length,
          )} клуба`}
          tone={activeAdmins.total.size > 0 ? "good" : "default"}
        />
        <Metric
          label="Чек-листы"
          value={formatPercent(checklists.summary.requiredPercent)}
          caption={`${formatNumber(
            checklists.summary.requiredItemsDone,
          )}/${formatNumber(checklists.summary.requiredItemsTotal)} пунктов`}
          tone={checklists.summary.requiredPercent >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Задачи"
          value={formatPercent(taskPercent)}
          caption={`${formatNumber(tasks.summary.done)}/${formatNumber(
            taskWorkTotal,
          )} закрыто`}
          tone={taskPercent >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Требуют внимания"
          value={formatNumber(riskCount)}
          caption={`${formatNumber(checklists.summary.overdue + tasks.summary.overdue)} просрочено`}
          tone={riskCount > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 lg:grid-cols-2">
        <MiniProgress
          label="Выполнение чек-листов"
          value={checklists.summary.requiredPercent}
          detail={`${formatNumber(checklists.summary.accepted)} принято, ${formatNumber(
            checklistActive,
          )} в работе, ${formatNumber(checklists.summary.onReview)} на проверке`}
        />
        <MiniProgress
          label="Выполнение задач"
          value={taskPercent}
          detail={`${formatNumber(taskActive)} активных, ${formatNumber(
            tasks.summary.onReview,
          )} на проверке, ${formatNumber(tasks.summary.overdue)} просрочено`}
        />
      </div>

      {noChecklistWorkflow ? (
        <div className="mt-3">
          <AttentionNote title="Чек-листы не запущены">
            В текущем срезе нет принятых, активных или отправленных на проверку чек-листов. Если администраторы находятся на смене, это некорректный режим работы и требует проверки.
          </AttentionNote>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DetailsBlock title="По клубам" count={displayClubGroups.length} open>
          {useFallbackGroups ? (
            <div className="mb-2">
              <AttentionNote title="Сегодня нет активного контроля">
                Ниже показана последняя активность за период. Откройте клуб, чтобы увидеть последние 2 чек-листа и 2 задачи.
              </AttentionNote>
            </div>
          ) : null}
          {displayClubGroups.length > 0 ? (
            displayClubGroups.map((group) => (
              <OperationsRow
                key={group.key}
                group={group}
                onOpen={() => setModal({ type: "club", key: group.key })}
              />
            ))
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              За сегодня нет сменных чек-листов и задач.
            </p>
          )}
        </DetailsBlock>

        <DetailsBlock title="По администраторам" count={displayEmployeeGroups.length}>
          {useFallbackGroups ? (
            <div className="mb-2">
              <AttentionNote title="Сегодня нет активного контроля">
                Ниже показаны сотрудники с последней активностью за период. В детализации видны последние чек-листы и задачи.
              </AttentionNote>
            </div>
          ) : null}
          {displayEmployeeGroups.length > 0 ? (
            displayEmployeeGroups.slice(0, 12).map((group) => (
              <OperationsRow
                key={group.key}
                group={group}
                onOpen={() => setModal({ type: "employee", key: group.key })}
              />
            ))
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              Пока нет назначенных чек-листов или задач.
            </p>
          )}
        </DetailsBlock>
      </div>

      {modal && selectedGroup && modal.type === "club" ? (
        <ClubModal
          group={selectedGroup}
          checklists={checklists}
          recentChecklists={modalChecklists}
          tasks={tasks}
          recentTasks={modalTasks}
          fallbackMode={useFallbackGroups}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal && selectedGroup && modal.type === "employee" ? (
        <EmployeeModal
          group={selectedGroup}
          checklists={checklists}
          recentChecklists={modalChecklists}
          tasks={tasks}
          recentTasks={modalTasks}
          fallbackMode={useFallbackGroups}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}
