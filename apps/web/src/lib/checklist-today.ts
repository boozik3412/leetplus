import type {
  StaffChecklistExecutionRun,
  StaffChecklistStatus,
} from "./staff-checklists";
import type { StaffTask } from "./staff-tasks";

/**
 * «Чек-листы → Сегодня»: one card per person on shift with their checklists
 * for today and today's tasks. Pure, so the day boundary (the viewer's own
 * time zone) and the sorting are tested without a browser.
 */

export type TodayRun = Pick<
  StaffChecklistExecutionRun,
  | "id"
  | "title"
  | "status"
  | "activityDate"
  | "requiredItemsDone"
  | "requiredItemsTotal"
  | "evidenceDone"
  | "evidenceTotal"
  | "failedItems"
  | "overdue"
  | "store"
  | "assignedToUser"
>;

export type TodayTask = Pick<StaffTask, "id" | "status" | "dueAt"> & {
  assignedToUser: { id: string } | null;
};

export type TodayPerson = {
  key: string;
  userId: string | null;
  name: string;
  stores: string[];
  runs: TodayRun[];
  requiredDone: number;
  requiredTotal: number;
  overdueRuns: number;
  onReviewRuns: number;
  tasksDone: number;
  tasksTotal: number;
};

export type ChecklistToday = {
  people: TodayPerson[];
  requiredDone: number;
  requiredTotal: number;
  /** null when nothing is due today, so the page says so instead of 0 %. */
  percent: number | null;
  runs: number;
  overdueRuns: number;
  onReviewRuns: number;
};

const closedStatuses = new Set<StaffChecklistStatus>(["ACCEPTED", "CANCELED"]);

/** `YYYY-MM-DD` of an instant in a time zone (undefined = the runtime's). */
export function dayKey(value: string | Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** `YYYY-MM-DD` shifted by whole days, for API date filters around today. */
export function shiftDayKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isRunClosed(run: Pick<TodayRun, "status">) {
  return closedStatuses.has(run.status);
}

/** Today's runs plus older ones that are overdue and still not closed. */
export function isTodayRun(run: TodayRun, today: string, timeZone?: string) {
  if (run.status === "CANCELED") return false;
  if (dayKey(run.activityDate, timeZone) === today) return true;
  return run.overdue > 0 && !isRunClosed(run);
}

export function runProgress(run: TodayRun) {
  if (run.requiredItemsTotal > 0) {
    return run.requiredItemsDone / run.requiredItemsTotal;
  }

  return run.status === "ACCEPTED" || run.status === "ON_REVIEW" ? 1 : 0;
}

function runOrder(run: TodayRun) {
  if (run.overdue > 0 && !isRunClosed(run)) return 0;
  if (run.status === "RETURNED" || run.status === "ESCALATED") return 1;
  if (!isRunClosed(run) && run.status !== "ON_REVIEW") return 2;
  if (run.status === "ON_REVIEW") return 3;
  return 4;
}

export function buildChecklistToday(
  runs: readonly TodayRun[],
  tasks: readonly TodayTask[],
  { today, timeZone }: { today: string; timeZone?: string },
): ChecklistToday {
  const people = new Map<string, TodayPerson>();

  const personFor = (
    user: { id: string; fullName: string | null; email: string } | null,
  ) => {
    const key = user?.id ?? "unassigned";
    let person = people.get(key);

    if (!person) {
      person = {
        key,
        userId: user?.id ?? null,
        name: user ? (user.fullName ?? user.email) : "Без ответственного",
        stores: [],
        runs: [],
        requiredDone: 0,
        requiredTotal: 0,
        overdueRuns: 0,
        onReviewRuns: 0,
        tasksDone: 0,
        tasksTotal: 0,
      };
      people.set(key, person);
    }

    return person;
  };

  for (const run of runs) {
    if (!isTodayRun(run, today, timeZone)) continue;

    const person = personFor(run.assignedToUser);
    person.runs.push(run);
    person.requiredDone += run.requiredItemsDone;
    person.requiredTotal += run.requiredItemsTotal;
    if (run.overdue > 0 && !isRunClosed(run)) person.overdueRuns += 1;
    if (run.status === "ON_REVIEW") person.onReviewRuns += 1;
    if (run.store && !person.stores.includes(run.store.name)) {
      person.stores.push(run.store.name);
    }
  }

  // Tasks only add to people who have checklists today: the card is about
  // the shift, the full task list lives in «Задачи персонала».
  for (const task of tasks) {
    if (!task.dueAt || task.status === "CANCELED") continue;
    if (dayKey(task.dueAt, timeZone) !== today) continue;
    const person = people.get(task.assignedToUser?.id ?? "unassigned");
    if (!person || !person.userId) continue;
    person.tasksTotal += 1;
    if (task.status === "DONE") person.tasksDone += 1;
  }

  const list = [...people.values()];

  for (const person of list) {
    person.runs.sort(
      (left, right) =>
        runOrder(left) - runOrder(right) ||
        left.activityDate.localeCompare(right.activityDate),
    );
  }

  list.sort((left, right) => {
    if ((left.userId === null) !== (right.userId === null)) {
      return left.userId === null ? 1 : -1;
    }
    if (left.overdueRuns !== right.overdueRuns) {
      return right.overdueRuns - left.overdueRuns;
    }
    const leftShare = left.requiredTotal ? left.requiredDone / left.requiredTotal : 1;
    const rightShare = right.requiredTotal
      ? right.requiredDone / right.requiredTotal
      : 1;
    return leftShare - rightShare || left.name.localeCompare(right.name, "ru");
  });

  const requiredDone = list.reduce((sum, person) => sum + person.requiredDone, 0);
  const requiredTotal = list.reduce(
    (sum, person) => sum + person.requiredTotal,
    0,
  );

  return {
    people: list,
    requiredDone,
    requiredTotal,
    percent:
      requiredTotal > 0 ? Math.round((requiredDone / requiredTotal) * 100) : null,
    runs: list.reduce((sum, person) => sum + person.runs.length, 0),
    overdueRuns: list.reduce((sum, person) => sum + person.overdueRuns, 0),
    onReviewRuns: list.reduce((sum, person) => sum + person.onReviewRuns, 0),
  };
}
