import type {
  StaffChecklistExecutionMetrics,
  StaffChecklistExecutionReport,
  StaffChecklistExecutionRun,
} from "@/lib/staff-checklists";
import type {
  StaffTask,
  StaffTaskGroup,
  StaffTaskReport,
} from "@/lib/staff-tasks";

type OverviewGroup = {
  key: string;
  label: string;
  caption: string | null;
  checklist: StaffChecklistExecutionMetrics;
  tasks: StaffTaskGroup;
  activeAdmins: number;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
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

function OperationsRow({ group }: { group: OverviewGroup }) {
  const checklistPercent = group.checklist.requiredPercent;
  const taskPercent = taskCompletionPercent(group.tasks);

  return (
    <div className="grid gap-3 border-t border-zinc-100 py-3 first:border-t-0 dark:border-zinc-800 sm:grid-cols-[minmax(0,1.35fr)_5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          {group.label}
        </p>
        {group.caption ? (
          <p className="mt-1 truncate text-xs text-zinc-500">{group.caption}</p>
        ) : null}
      </div>
      <div className="inline-flex w-fit items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        <span>{formatNumber(group.activeAdmins)}</span>
        <span className="font-medium text-zinc-500">в работе</span>
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
    </div>
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
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="group rounded-md border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/60"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        <span>{title}</span>
        <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          {formatNumber(count)}
        </span>
      </summary>
      <div className="px-3 pb-2">{children}</div>
    </details>
  );
}

export function StaffShiftOperationsOverview({
  checklists,
  tasks,
  dateLabel,
}: {
  checklists: StaffChecklistExecutionReport;
  tasks: StaffTaskReport;
  dateLabel: string;
}) {
  const activeAdmins = buildActiveAdminSets(checklists, tasks);
  const clubGroups = mergeByClub(checklists, tasks, activeAdmins.byClub);
  const employeeGroups = mergeByEmployee(checklists, tasks);
  const shiftsCount = activeShiftCount(checklists, tasks);
  const taskWorkTotal = Math.max(tasks.summary.total - tasks.summary.canceled, 0);
  const taskPercent = ratioPercent(tasks.summary.done, taskWorkTotal);
  const checklistActive = activeChecklistCount(checklists.summary);
  const taskActive = activeTaskCount(tasks.summary);
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

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DetailsBlock title="По клубам" count={clubGroups.length} open>
          {clubGroups.length > 0 ? (
            clubGroups.map((group) => (
              <OperationsRow key={group.key} group={group} />
            ))
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              За сегодня нет сменных чек-листов и задач.
            </p>
          )}
        </DetailsBlock>

        <DetailsBlock title="По администраторам" count={employeeGroups.length}>
          {employeeGroups.length > 0 ? (
            employeeGroups.slice(0, 12).map((group) => (
              <OperationsRow key={group.key} group={group} />
            ))
          ) : (
            <p className="py-3 text-sm text-zinc-500">
              Пока нет назначенных чек-листов или задач.
            </p>
          )}
        </DetailsBlock>
      </div>
    </section>
  );
}
