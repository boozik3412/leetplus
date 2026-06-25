"use client";

import { useState, type ReactNode } from "react";
import type {
  StaffChecklistExecutionMetrics,
  StaffChecklistExecutionReport,
  StaffChecklistExecutionRun,
  StaffChecklistStatus,
} from "@/lib/staff-checklists";
import type { StaffOperationsStaffControlShift } from "@/lib/staff-operations-dashboard";
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
  shiftIds: string[];
  missingChecklistShifts: number;
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
  missingChecklist: boolean;
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

function getClubRuns(
  checklists: StaffChecklistExecutionReport,
  group: OverviewGroup,
) {
  const shiftIds = getGroupShiftIds(group);

  return checklists.runs.filter(
    (run) => run.shift?.id && shiftIds.has(run.shift.id),
  );
}

function getClubTasks(tasks: StaffTaskReport, group: OverviewGroup) {
  const shiftIds = getGroupShiftIds(group);

  return tasks.rows.filter((task) => task.shift?.id && shiftIds.has(task.shift.id));
}

function getEmployeeRuns(
  checklists: StaffChecklistExecutionReport,
  group: OverviewGroup,
) {
  return getClubRuns(checklists, group);
}

function getEmployeeTasks(tasks: StaffTaskReport, group: OverviewGroup) {
  return getClubTasks(tasks, group);
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
  return group.missingChecklistShifts > 0;
}

function staffShiftStoreKey(shift: StaffOperationsStaffControlShift) {
  return shift.store?.id ?? "network";
}

function staffShiftEmployeeKey(shift: StaffOperationsStaffControlShift) {
  if (shift.employee?.id) {
    return shift.employee.id;
  }

  if (shift.externalUserId) {
    return `external:${shift.externalDomain ?? "unknown"}:${shift.externalUserId}`;
  }

  return `shift:${shift.id}`;
}

function staffShiftLabel(shift: StaffOperationsStaffControlShift) {
  return (
    shift.staffLabel ??
    shift.employee?.fullName ??
    shift.employee?.email ??
    (shift.externalUserId ? `user_id ${shift.externalUserId}` : null) ??
    "Администратор не определен"
  );
}

function staffShiftCaption(shift: StaffOperationsStaffControlShift) {
  return (
    shift.employee?.email ??
    (shift.externalUserId ? `Langame user_id ${shift.externalUserId}` : null)
  );
}

function getGroupShiftIds(group: OverviewGroup) {
  return new Set(group.shiftIds);
}

function buildShiftSnapshots(
  shifts: StaffOperationsStaffControlShift[],
  runs: StaffChecklistExecutionRun[],
) {
  const runsByShift = new Map<string, StaffChecklistExecutionRun[]>();

  runs.forEach((run) => {
    if (!run.shift?.id) {
      return;
    }

    const current = runsByShift.get(run.shift.id) ?? [];
    current.push(run);
    runsByShift.set(run.shift.id, current);
  });

  return shifts
    .map((shift): ShiftSnapshot => {
      const shiftRuns = sortRunsByRecent(runsByShift.get(shift.id) ?? []);

      return {
        key: shift.id,
        startedAt: shift.startedAt,
        stoppedAt: shift.stoppedAt,
        storeName: shift.store?.name ?? null,
        admins: [staffShiftLabel(shift)],
        runs: shiftRuns,
        missingChecklist: !shiftRuns.some((run) => run.status !== "CANCELED"),
      };
    })
    .sort((left, right) => {
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

function mergeChecklistRunsForShifts(
  actualShifts: StaffOperationsStaffControlShift[],
  reports: Array<StaffChecklistExecutionReport | undefined>,
) {
  const shiftIds = new Set(actualShifts.map((shift) => shift.id));
  const runs = new Map<string, StaffChecklistExecutionRun>();

  reports.forEach((report) => {
    report?.runs.forEach((run) => {
      if (run.shift?.id && shiftIds.has(run.shift.id)) {
        runs.set(run.id, run);
      }
    });
  });

  return Array.from(runs.values());
}

function mergeTasksForShifts(
  actualShifts: StaffOperationsStaffControlShift[],
  reports: Array<StaffTaskReport | undefined>,
) {
  const shiftIds = new Set(actualShifts.map((shift) => shift.id));
  const rows = new Map<string, StaffTask>();

  reports.forEach((report) => {
    report?.rows.forEach((task) => {
      if (task.shift?.id && shiftIds.has(task.shift.id)) {
        rows.set(task.id, task);
      }
    });
  });

  return Array.from(rows.values());
}

function addChecklistRunToMetrics(
  metrics: StaffChecklistExecutionMetrics,
  run: StaffChecklistExecutionRun,
) {
  metrics.total += 1;
  metrics.open += run.status === "OPEN" ? 1 : 0;
  metrics.inProgress += run.status === "IN_PROGRESS" ? 1 : 0;
  metrics.onReview += run.status === "ON_REVIEW" ? 1 : 0;
  metrics.accepted += run.status === "ACCEPTED" ? 1 : 0;
  metrics.returned += run.status === "RETURNED" ? 1 : 0;
  metrics.escalated += run.status === "ESCALATED" ? 1 : 0;
  metrics.canceled += run.status === "CANCELED" ? 1 : 0;
  metrics.overdue += run.overdue;
  metrics.failedItems += run.failedItems;
  metrics.blockingIssues += run.blockingIssues;
  metrics.scoreTotal += run.scoreTotal;
  metrics.scoreEarned += run.scoreEarned;
  metrics.requiredItemsTotal += run.requiredItemsTotal;
  metrics.requiredItemsDone += run.requiredItemsDone;
  metrics.evidenceTotal += run.evidenceTotal;
  metrics.evidenceDone += run.evidenceDone;
}

function finalizeChecklistMetrics(metrics: StaffChecklistExecutionMetrics) {
  metrics.scorePercent = ratioPercent(metrics.scoreEarned, metrics.scoreTotal);
  metrics.requiredPercent = ratioPercent(
    metrics.requiredItemsDone,
    metrics.requiredItemsTotal,
  );
  metrics.evidencePercent = ratioPercent(metrics.evidenceDone, metrics.evidenceTotal);

  return metrics;
}

function buildChecklistMetricsFromRuns(runs: StaffChecklistExecutionRun[]) {
  const metrics = { ...emptyChecklistMetrics };

  runs.forEach((run) => addChecklistRunToMetrics(metrics, run));

  return finalizeChecklistMetrics(metrics);
}

function buildTaskGroupFromRows(
  key: string,
  label: string,
  hint: string | null,
  rows: StaffTask[],
): StaffTaskGroup {
  return rows.reduce<StaffTaskGroup>(
    (group, task) => {
      group.total += 1;
      group.open += task.status === "OPEN" ? 1 : 0;
      group.inProgress += task.status === "IN_PROGRESS" ? 1 : 0;
      group.onReview += task.status === "ON_REVIEW" ? 1 : 0;
      group.done += task.status === "DONE" ? 1 : 0;
      group.canceled += task.status === "CANCELED" ? 1 : 0;
      group.overdue += task.isOverdue ? 1 : 0;

      return group;
    },
    { ...emptyTaskGroup, key, label, hint },
  );
}

function groupRowsByShiftId<T extends { shift: { id: string } | null }>(rows: T[]) {
  const byShift = new Map<string, T[]>();

  rows.forEach((row) => {
    if (!row.shift?.id) {
      return;
    }

    const current = byShift.get(row.shift.id) ?? [];
    current.push(row);
    byShift.set(row.shift.id, current);
  });

  return byShift;
}

function buildActualShiftGroups(
  actualShifts: StaffOperationsStaffControlShift[],
  runs: StaffChecklistExecutionRun[],
  taskRows: StaffTask[],
  kind: OverviewGroup["kind"],
) {
  const groups = new Map<string, OverviewGroup>();
  const runsByShift = groupRowsByShiftId(runs);
  const tasksByShift = groupRowsByShiftId(taskRows);

  actualShifts.forEach((shift) => {
    const key = kind === "club" ? staffShiftStoreKey(shift) : staffShiftEmployeeKey(shift);
    const label =
      kind === "club" ? shift.store?.name ?? "Клуб не указан" : staffShiftLabel(shift);
    const caption =
      kind === "club"
        ? shift.store?.isActive === false
          ? "неактивный клуб"
          : null
        : staffShiftCaption(shift);
    const current = groups.get(key);

    if (current) {
      current.shiftIds.push(shift.id);
      current.activeAdmins =
        kind === "club"
          ? new Set([
              ...current.shiftIds
                .map((shiftId) =>
                  actualShifts.find((actualShift) => actualShift.id === shiftId),
                )
                .filter(Boolean)
                .map((actualShift) =>
                  staffShiftEmployeeKey(actualShift as StaffOperationsStaffControlShift),
                ),
            ]).size
          : current.shiftIds.length;
      return;
    }

    groups.set(key, {
      key,
      label,
      caption,
      checklist: emptyChecklistMetrics,
      tasks: { ...emptyTaskGroup, key, label, hint: caption },
      activeAdmins: 1,
      shiftIds: [shift.id],
      missingChecklistShifts: 0,
      kind,
    });
  });

  groups.forEach((group) => {
    const groupRuns = group.shiftIds.flatMap(
      (shiftId) => runsByShift.get(shiftId) ?? [],
    );
    const groupTasks = group.shiftIds.flatMap(
      (shiftId) => tasksByShift.get(shiftId) ?? [],
    );

    group.checklist = buildChecklistMetricsFromRuns(groupRuns);
    group.tasks = buildTaskGroupFromRows(
      group.key,
      group.label,
      group.caption,
      groupTasks,
    );
    group.missingChecklistShifts = group.shiftIds.filter((shiftId) => {
      const shiftRuns = runsByShift.get(shiftId) ?? [];

      return !shiftRuns.some((run) => run.status !== "CANCELED");
    }).length;
  });

  return Array.from(groups.values()).sort(compareOverviewGroups);
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
    right.activeAdmins +
    activeChecklistCount(right.checklist) +
    activeTaskCount(right.tasks);
  const leftActive =
    left.activeAdmins +
    activeChecklistCount(left.checklist) +
    activeTaskCount(left.tasks);

  return (
    rightActive - leftActive ||
    right.shiftIds.length - left.shiftIds.length ||
    left.label.localeCompare(right.label)
  );
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

function operationsActivityTitle(kind: OverviewGroup["kind"]) {
  return kind === "club" ? "Админы на смене" : "Открытые смены";
}

function RowProgress({
  value,
  detail,
}: {
  value: number;
  detail: string;
}) {
  const percent = clampPercent(value);

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs">
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

function OperationsRowsHeader({ kind }: { kind: OverviewGroup["kind"] }) {
  return (
    <div className="hidden border-t border-zinc-100 px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 sm:grid sm:grid-cols-[minmax(0,1.35fr)_7.5rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem] sm:items-center sm:gap-3">
      <span>{kind === "club" ? "Клуб" : "Администратор"}</span>
      <span>{operationsActivityTitle(kind)}</span>
      <span>Чек-листы</span>
      <span>Задачи</span>
      <span className="sr-only">Открыть</span>
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
    group.kind === "club" ? group.activeAdmins : group.shiftIds.length;
  const checklistGap = hasChecklistControlGap(group);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-3 border-t border-zinc-100 px-3 py-3 text-left transition first:border-t-0 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:border-zinc-800 dark:hover:bg-zinc-900/70 sm:grid-cols-[minmax(0,1.35fr)_7.5rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem] sm:items-center"
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
      <div
        className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        aria-label={`${operationsActivityTitle(group.kind)}: ${formatNumber(activityCount)}`}
        title={`${operationsActivityTitle(group.kind)}: ${formatNumber(activityCount)}`}
      >
        {formatNumber(activityCount)}
      </div>
      {checklistGap ? (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">
            Смена без чек-листа
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {formatNumber(group.missingChecklistShifts)} из{" "}
            {formatNumber(group.shiftIds.length)} открытых смен
          </p>
        </div>
      ) : (
        <RowProgress
          value={checklistPercent}
          detail={`${formatNumber(group.checklist.requiredItemsDone)}/${formatNumber(
            group.checklist.requiredItemsTotal,
          )} пунктов`}
        />
      )}
      <RowProgress
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
      <div className="pb-2">{children}</div>
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
  actualShifts,
  onClose,
}: {
  group: OverviewGroup;
  checklists: StaffChecklistExecutionReport;
  recentChecklists: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks: StaffTaskReport;
  actualShifts: StaffOperationsStaffControlShift[];
  onClose: () => void;
}) {
  const currentRuns = sortRunsByRecent(getClubRuns(checklists, group));
  const currentTasks = sortTasksByRecent(getClubTasks(tasks, group));
  const recentRuns = sortRunsByRecent(getClubRuns(recentChecklists, group));
  const fallbackRuns = sortRunsByRecent(
    Array.from(new Map([...currentRuns, ...recentRuns].map((run) => [run.id, run])).values()),
  );
  const fallbackTasks = sortTasksByRecent(
    Array.from(
      new Map(
        [...currentTasks, ...sortTasksByRecent(getClubTasks(recentTasks, group))].map(
          (task) => [task.id, task],
        ),
      ).values(),
    ),
  );
  const groupShiftIds = getGroupShiftIds(group);
  const shifts = buildShiftSnapshots(
    actualShifts.filter((shift) => groupShiftIds.has(shift.id)),
    fallbackRuns,
  ).slice(0, 6);

  return (
    <ModalShell title={group.label} subtitle={group.caption} onClose={onClose}>
      <div className="mb-4 space-y-3">
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
            Текущие открытые смены
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
                {shift.missingChecklist ? (
                  <p className="mt-2 inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-900/70">
                    Смена без чек-листа
                  </p>
                ) : null}
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
  onClose,
}: {
  group: OverviewGroup;
  checklists: StaffChecklistExecutionReport;
  recentChecklists: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks: StaffTaskReport;
  onClose: () => void;
}) {
  const currentRuns = sortRunsByRecent(getEmployeeRuns(checklists, group));
  const currentTasks = sortTasksByRecent(getEmployeeTasks(tasks, group));
  const recentRuns = sortRunsByRecent(getEmployeeRuns(recentChecklists, group));
  const displayRuns = sortRunsByRecent(
    Array.from(new Map([...currentRuns, ...recentRuns].map((run) => [run.id, run])).values()),
  );
  const displayTasks = sortTasksByRecent(
    Array.from(
      new Map(
        [...currentTasks, ...sortTasksByRecent(getEmployeeTasks(recentTasks, group))].map(
          (task) => [task.id, task],
        ),
      ).values(),
    ),
  );

  return (
    <ModalShell
      title={group.label}
      subtitle={group.caption}
      onClose={onClose}
    >
      {hasChecklistControlGap(group) ? (
        <div className="mb-4">
          <AttentionNote title="Нужна проверка чек-листа">
            У администратора есть открытая смена без сопоставленного чек-листа.
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
          Отчет по чек-листам
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
  actualShifts = [],
}: {
  checklists: StaffChecklistExecutionReport;
  recentChecklists?: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  recentTasks?: StaffTaskReport;
  actualShifts?: StaffOperationsStaffControlShift[];
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const actualRuns = mergeChecklistRunsForShifts(actualShifts, [
    checklists,
    recentChecklists,
  ]);
  const actualTasks = mergeTasksForShifts(actualShifts, [tasks, recentTasks]);
  const clubGroups = buildActualShiftGroups(
    actualShifts,
    actualRuns,
    actualTasks,
    "club",
  );
  const employeeGroups = buildActualShiftGroups(
    actualShifts,
    actualRuns,
    actualTasks,
    "employee",
  );
  const selectedGroup = modal
    ? (modal.type === "club" ? clubGroups : employeeGroups).find(
        (group) => group.key === modal.key,
      ) ?? null
    : null;
  const activeAdminKeys = new Set(actualShifts.map(staffShiftEmployeeKey));
  const shiftsCount = actualShifts.length;
  const checklistMetrics = buildChecklistMetricsFromRuns(actualRuns);
  const taskMetrics = buildTaskGroupFromRows(
    "actual-shifts",
    "Открытые смены",
    null,
    actualTasks,
  );
  const taskWorkTotal = Math.max(taskMetrics.total - taskMetrics.canceled, 0);
  const taskPercent = taskCompletionPercent(taskMetrics);
  const checklistActive = activeChecklistCount(checklistMetrics);
  const taskActive = activeTaskCount(taskMetrics);
  const missingChecklistShifts = clubGroups.reduce(
    (sum, group) => sum + group.missingChecklistShifts,
    0,
  );
  const noChecklistWorkflow = shiftsCount > 0 && checklistMetrics.total === 0;
  const riskCount =
    missingChecklistShifts +
    checklistMetrics.overdue +
    checklistMetrics.blockingIssues +
    taskMetrics.overdue;

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
            Текущий срез по открытым сменам Langame: чек-листы и задачи
            учитываются только когда они сопоставлены с конкретной открытой
            сменой.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Сейчас
        </div>
      </div>

      <div className="grid gap-4 py-4 lg:grid-cols-4">
        <Metric
          label="Админы в работе"
          value={formatNumber(activeAdminKeys.size)}
          caption={`${formatNumber(shiftsCount)} смен Langame, ${formatNumber(
            clubGroups.length,
          )} клуба`}
          tone={activeAdminKeys.size > 0 ? "good" : "default"}
        />
        <Metric
          label="Чек-листы"
          value={formatPercent(checklistMetrics.requiredPercent)}
          caption={
            missingChecklistShifts > 0
              ? `${formatNumber(missingChecklistShifts)} смен без чек-листа`
              : `${formatNumber(
                  checklistMetrics.requiredItemsDone,
                )}/${formatNumber(checklistMetrics.requiredItemsTotal)} пунктов`
          }
          tone={
            missingChecklistShifts > 0
              ? "bad"
              : checklistMetrics.requiredPercent >= 85
                ? "good"
                : "warn"
          }
        />
        <Metric
          label="Задачи"
          value={formatPercent(taskPercent)}
          caption={`${formatNumber(taskMetrics.done)}/${formatNumber(
            taskWorkTotal,
          )} закрыто`}
          tone={taskPercent >= 85 ? "good" : "warn"}
        />
        <Metric
          label="Требуют внимания"
          value={formatNumber(riskCount)}
          caption={`${formatNumber(
            checklistMetrics.overdue + taskMetrics.overdue,
          )} просрочено`}
          tone={riskCount > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 lg:grid-cols-2">
        <MiniProgress
          label="Выполнение чек-листов"
          value={checklistMetrics.requiredPercent}
          detail={`${formatNumber(checklistMetrics.accepted)} принято, ${formatNumber(
            checklistActive,
          )} в работе, ${formatNumber(checklistMetrics.onReview)} на проверке`}
        />
        <MiniProgress
          label="Выполнение задач"
          value={taskPercent}
          detail={`${formatNumber(taskActive)} активных, ${formatNumber(
            taskMetrics.onReview,
          )} на проверке, ${formatNumber(taskMetrics.overdue)} просрочено`}
        />
      </div>

      {noChecklistWorkflow ? (
        <div className="mt-3">
          <AttentionNote title="Смены без чек-листов">
            Сейчас есть открытые смены Langame, но нет сопоставленных запусков
            чек-листов. Такие смены показаны ниже как проблема контроля.
          </AttentionNote>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DetailsBlock title="По клубам" count={clubGroups.length} open>
          {clubGroups.length > 0 ? (
            <>
              <OperationsRowsHeader kind="club" />
              {clubGroups.map((group) => (
                <OperationsRow
                  key={group.key}
                  group={group}
                  onOpen={() => setModal({ type: "club", key: group.key })}
                />
              ))}
            </>
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              Сейчас нет открытых смен Langame.
            </p>
          )}
        </DetailsBlock>

        <DetailsBlock title="По администраторам" count={employeeGroups.length}>
          {employeeGroups.length > 0 ? (
            <>
              <OperationsRowsHeader kind="employee" />
              {employeeGroups.slice(0, 12).map((group) => (
                <OperationsRow
                  key={group.key}
                  group={group}
                  onOpen={() => setModal({ type: "employee", key: group.key })}
                />
              ))}
            </>
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              Сейчас нет администраторов на открытых сменах.
            </p>
          )}
        </DetailsBlock>
      </div>

      {modal && selectedGroup && modal.type === "club" ? (
        <ClubModal
          group={selectedGroup}
          checklists={checklists}
          recentChecklists={recentChecklists ?? checklists}
          tasks={tasks}
          recentTasks={recentTasks ?? tasks}
          actualShifts={actualShifts}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal && selectedGroup && modal.type === "employee" ? (
        <EmployeeModal
          group={selectedGroup}
          checklists={checklists}
          recentChecklists={recentChecklists ?? checklists}
          tasks={tasks}
          recentTasks={recentTasks ?? tasks}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}
