"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  buildChecklistToday,
  dayKey,
  isRunClosed,
  runProgress,
  type TodayPerson,
  type TodayRun,
  type TodayTask,
} from "@/lib/checklist-today";
import type { StaffChecklistStatus } from "@/lib/staff-checklists";

type Props = {
  runs: TodayRun[];
  tasks: TodayTask[];
  /** Server time of the render, so server and first client render agree. */
  nowIso: string;
  /** false when the task report could not be loaded for this person. */
  tasksAvailable: boolean;
};

const statusLabels: Record<StaffChecklistStatus, string> = {
  OPEN: "Не начат",
  IN_PROGRESS: "Заполняется",
  ON_REVIEW: "Ждёт проверки",
  ACCEPTED: "Принят",
  RETURNED: "Вернули на доработку",
  ESCALATED: "Передан руководителю",
  CANCELED: "Отменён",
};

const subscribe = () => () => {};

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function runTone(run: TodayRun) {
  if (run.overdue > 0 && !isRunClosed(run)) {
    return {
      bar: "bg-red-500",
      text: "text-red-700 dark:text-red-300",
      label: "Просрочен",
    };
  }
  if (run.status === "RETURNED" || run.status === "ESCALATED") {
    return {
      bar: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-300",
      label: statusLabels[run.status],
    };
  }
  if (run.status === "ON_REVIEW") {
    return {
      bar: "bg-violet-500",
      text: "text-violet-700 dark:text-violet-300",
      label: statusLabels[run.status],
    };
  }
  if (run.status === "ACCEPTED") {
    return {
      bar: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
      label: statusLabels[run.status],
    };
  }
  return {
    bar: "bg-sky-500",
    text: "text-zinc-600 dark:text-zinc-300",
    label: statusLabels[run.status],
  };
}

export function ChecklistToday({ runs, tasks, nowIso, tasksAvailable }: Props) {
  // Server render: the UTC day of the request. In the browser: the viewer's
  // own day (a club in Yekaterinburg starts its day earlier than UTC).
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const timeZone = isClient ? undefined : "UTC";
  const today = dayKey(isClient ? new Date() : nowIso, timeZone);
  const data = buildChecklistToday(runs, tasks, { today, timeZone });

  if (data.people.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
          На сегодня чек-листов нет
        </p>
        <p className="mt-1">
          Они появляются, когда администратор открывает смену или когда
          чек-лист запускают вручную во вкладке{" "}
          <Link
            href="/staff/checklists?tab=all"
            className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            «Все чек-листы»
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <section
        aria-label="Итог за сегодня"
        className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="flex items-baseline gap-3">
          <span className="text-4xl font-semibold tabular-nums">
            {data.percent === null ? "—" : `${data.percent}%`}
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            обязательных пунктов выполнено
            <span className="block tabular-nums">
              {data.requiredDone} из {data.requiredTotal}
            </span>
          </span>
        </p>
        <ul className="flex flex-wrap gap-2 text-sm sm:ml-auto">
          <li className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900">
            {data.people.filter((person) => person.userId).length}{" "}
            {plural(
              data.people.filter((person) => person.userId).length,
              "человек",
              "человека",
              "человек",
            )}{" "}
            · {data.runs}{" "}
            {plural(data.runs, "чек-лист", "чек-листа", "чек-листов")}
          </li>
          {data.overdueRuns > 0 ? (
            <li className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200">
              Просрочено: {data.overdueRuns}
            </li>
          ) : null}
          {data.onReviewRuns > 0 ? (
            <li className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
              Ждут проверки: {data.onReviewRuns}
            </li>
          ) : null}
        </ul>
      </section>

      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.people.map((person) => (
          <li key={person.key}>
            <PersonCard person={person} tasksAvailable={tasksAvailable} />
          </li>
        ))}
      </ul>
    </>
  );
}

function PersonCard({
  person,
  tasksAvailable,
}: {
  person: TodayPerson;
  tasksAvailable: boolean;
}) {
  return (
    <article
      className={`flex h-full flex-col rounded-lg border bg-white p-4 dark:bg-zinc-950 ${
        person.overdueRuns > 0
          ? "border-red-300 dark:border-red-500/50"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
        >
          {person.userId ? initials(person.name) : "?"}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{person.name}</h3>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {person.stores.join(", ") || "Вся сеть"}
          </p>
        </div>
        {person.overdueRuns > 0 ? (
          <span className="ml-auto shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200">
            Просрочено
          </span>
        ) : null}
      </header>

      <ul className="mt-4 space-y-2">
        {person.runs.map((run) => {
          const tone = runTone(run);
          const percent = Math.round(runProgress(run) * 100);

          return (
            <li key={run.id}>
              <Link
                href={`/staff/checklists?tab=all&runId=${encodeURIComponent(run.id)}`}
                className="block rounded-md border border-zinc-200 p-3 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
                    {run.title}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                    {run.requiredItemsTotal > 0
                      ? `${run.requiredItemsDone} из ${run.requiredItemsTotal}`
                      : null}
                  </span>
                </span>
                <span
                  role="progressbar"
                  aria-label={`${run.title}: выполнено ${percent}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                >
                  <span
                    className={`block h-full rounded-full ${tone.bar}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className={`font-semibold ${tone.text}`}>
                    {tone.label}
                  </span>
                  {run.evidenceTotal > 0 ? (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      фото {run.evidenceDone} из {run.evidenceTotal}
                    </span>
                  ) : null}
                  {run.failedItems > 0 ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      замечаний: {run.failedItems}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {person.userId && tasksAvailable ? (
        <p className="mt-auto pt-3 text-sm">
          <Link
            href={`/staff/tasks?view=today&assignedToUserId=${encodeURIComponent(person.userId)}`}
            className="text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline dark:text-zinc-300 dark:hover:text-white"
          >
            {person.tasksTotal > 0
              ? `Задачи на сегодня: ${person.tasksDone} из ${person.tasksTotal}`
              : "Задач на сегодня нет"}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
