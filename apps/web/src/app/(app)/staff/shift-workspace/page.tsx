import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffOperators,
  type StaffOperatorReport,
  type StaffOperatorReportRow,
  type StaffOperatorShiftDetail,
} from "@/lib/guests";
import { can } from "@/lib/permissions";
import {
  getStaffChecklistReport,
  type StaffChecklistReport,
  type StaffChecklistRun,
} from "@/lib/staff-checklists";
import {
  getStaffDirectoryReport,
  type StaffDirectoryMember,
  type StaffDirectoryReport,
} from "@/lib/staff-directory";
import {
  getStaffTaskReport,
  type StaffTask,
  type StaffTaskReport,
} from "@/lib/staff-tasks";

const emptyTaskReport: StaffTaskReport = {
  filters: {
    view: "my",
    status: "all",
    type: "all",
    priority: "all",
    sort: "dueAt",
    direction: "asc",
    storeId: null,
    shiftId: null,
    assignedToUserId: null,
    observerUserId: null,
    search: null,
    dueFrom: null,
    dueTo: null,
    pageSize: 8,
  },
  summary: {
    total: 0,
    open: 0,
    inProgress: 0,
    onReview: 0,
    done: 0,
    overdue: 0,
    canceled: 0,
  },
  quickViews: [],
  groups: {
    byClub: [],
    byEmployee: [],
    byShift: [],
    byStatus: [],
  },
  rows: [],
  users: [],
  stores: [],
};

const emptyChecklistReport: StaffChecklistReport = {
  filters: {
    status: "all",
    shiftKind: "all",
    regulationId: null,
    storeId: null,
    assignedToUserId: null,
    search: null,
  },
  summary: {
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
  },
  rows: [],
  publishedRegulations: [],
  checklistTemplates: [],
  stores: [],
  users: [],
};

const emptyDirectoryReport: StaffDirectoryReport = {
  filters: {
    status: "all",
    role: "all",
    storeId: null,
    search: null,
  },
  canManageDirectory: false,
  summary: {
    total: 0,
    active: 0,
    onboarding: 0,
    suspended: 0,
    dismissed: 0,
    linkedAccounts: 0,
    linkedLangameUsers: 0,
  },
  rows: [],
  stores: [],
  users: [],
  legacyMappings: [],
};

const emptyOperatorReport: StaffOperatorReport = {
  periodFrom: "",
  periodTo: "",
  storeId: null,
  status: "linked",
  anomaly: null,
  search: null,
  sort: "cash",
  direction: "desc",
  rows: [],
  staffOptions: [],
};

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function todayDateInput() {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoney(value: number) {
  return `${formatNumber(value)} руб`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "срок не задан";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function taskStatusLabel(status: StaffTask["status"]) {
  const labels: Record<StaffTask["status"], string> = {
    OPEN: "Новая",
    IN_PROGRESS: "В работе",
    ON_REVIEW: "На проверке",
    DONE: "Готово",
    CANCELED: "Отменена",
  };

  return labels[status];
}

function checklistStatusLabel(status: StaffChecklistRun["status"]) {
  const labels: Record<StaffChecklistRun["status"], string> = {
    OPEN: "Открыт",
    IN_PROGRESS: "В работе",
    ON_REVIEW: "На проверке",
    ACCEPTED: "Принят",
    RETURNED: "Возвращен",
    ESCALATED: "Эскалация",
    CANCELED: "Отменен",
  };

  return labels[status];
}

function findCurrentStaffMember(
  rows: StaffDirectoryMember[],
  user: { id: string; email: string },
) {
  return (
    rows.find((member) => member.user?.id === user.id) ??
    rows.find((member) => member.user?.email === user.email) ??
    rows.find((member) => member.email === user.email) ??
    null
  );
}

function findShiftRow(
  rows: StaffOperatorReportRow[],
  staffMember: StaffDirectoryMember | null,
) {
  if (!staffMember?.externalUserId) {
    return null;
  }

  return (
    rows.find(
      (row) =>
        row.externalUserId === staffMember.externalUserId &&
        (!staffMember.externalDomain ||
          row.externalDomain === staffMember.externalDomain),
    ) ??
    rows.find((row) => row.externalUserId === staffMember.externalUserId) ??
    null
  );
}

function timeValue(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function findCurrentShiftDetail(row: StaffOperatorReportRow | null) {
  const details = row?.shiftDetails ?? [];

  if (details.length === 0) {
    return null;
  }

  const activeShift = details
    .filter((shift) => !shift.stoppedAt)
    .sort(
      (first, second) =>
        timeValue(second.startedAt) - timeValue(first.startedAt),
    )[0];

  if (activeShift) {
    return activeShift;
  }

  return (
    [...details].sort(
      (first, second) =>
        timeValue(second.stoppedAt ?? second.startedAt) -
        timeValue(first.stoppedAt ?? first.startedAt),
    )[0] ?? null
  );
}

function currentShiftTotalRevenue(
  row: StaffOperatorReportRow | null,
  shift: StaffOperatorShiftDetail | null,
) {
  if (shift) {
    return shift.paymentAmount - shift.refundAmount + shift.barRevenue;
  }

  if (!row) {
    return null;
  }

  return row.shiftPaymentAmount - row.shiftRefundAmount + row.barRevenue;
}

function currentShiftBarRevenue(
  row: StaffOperatorReportRow | null,
  shift: StaffOperatorShiftDetail | null,
) {
  if (shift) {
    return shift.barRevenue;
  }

  return row?.barRevenue ?? null;
}

function currentShiftGuests(
  row: StaffOperatorReportRow | null,
  shift: StaffOperatorShiftDetail | null,
) {
  if (shift) {
    return {
      unique: shift.uniqueGuestsCount,
      visits: shift.guestVisitsCount,
    };
  }

  if (!row) {
    return null;
  }

  return {
    unique: row.uniqueGuestsCount,
    visits: row.guestVisitsCount,
  };
}

function formatShiftWindow(shift: StaffOperatorShiftDetail | null) {
  if (!shift?.startedAt) {
    return "смена не найдена";
  }

  const started = formatDateTime(shift.startedAt);
  const stopped = shift.stoppedAt ? formatDateTime(shift.stoppedAt) : "идет";

  return `${started} -> ${stopped}`;
}

function formatShiftDuration(shift: StaffOperatorShiftDetail | null) {
  if (!shift) {
    return "нет данных";
  }

  return `${formatNumber(shift.durationHours)} ч`;
}

function activeChecklistRows(rows: StaffChecklistRun[], userId: string) {
  return rows.filter(
    (run) =>
      run.status !== "ACCEPTED" &&
      run.status !== "CANCELED" &&
      (run.assignedToUser?.id === userId || !run.assignedToUser),
  );
}

function findCurrentChecklistRun(
  rows: StaffChecklistRun[],
  shift: StaffOperatorShiftDetail | null,
  userId: string,
) {
  const activeRows = activeChecklistRows(rows, userId);

  if (shift?.externalShiftId) {
    const byShift = activeRows.find(
      (run) => run.shift?.externalShiftId === shift.externalShiftId,
    );

    if (byShift) {
      return byShift;
    }
  }

  return (
    activeRows.sort(
      (first, second) =>
        timeValue(second.startedAt ?? second.scheduledAt) -
        timeValue(first.startedAt ?? first.scheduledAt),
    )[0] ?? null
  );
}

function checklistProgress(run: StaffChecklistRun | null) {
  if (!run) {
    return { done: 0, total: 0, percent: 0 };
  }

  if (run.requiredItemsTotal <= 0) {
    return {
      done: run.requiredItemsDone,
      total: run.requiredItemsTotal,
      percent: run.status === "ACCEPTED" ? 100 : 0,
    };
  }

  return {
    done: run.requiredItemsDone,
    total: run.requiredItemsTotal,
    percent: Math.round((run.requiredItemsDone / run.requiredItemsTotal) * 100),
  };
}

export default async function StaffShiftWorkspacePage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_staff")) {
    redirect("/dashboard");
  }

  const today = todayDateInput();
  const myTasksPromise = safeValue(
    getStaffTaskReport({
      view: "my",
      status: "all",
      sort: "dueAt",
      direction: "asc",
      pageSize: "8",
    }),
    emptyTaskReport,
  );
  const checklistsPromise = safeValue(
    getStaffChecklistReport({
      status: "all",
      assignedToUserId: user.id,
    }),
    emptyChecklistReport,
  );
  const directoryPromise = safeValue(
    getStaffDirectoryReport({
      status: "all",
      search: user.email,
    }),
    emptyDirectoryReport,
  );

  const [myTasks, checklists, directory] = await Promise.all([
    myTasksPromise,
    checklistsPromise,
    directoryPromise,
  ]);
  const staffMember = findCurrentStaffMember(directory.rows, user);
  const shiftReport = staffMember?.externalUserId
    ? await safeValue(
        getStaffOperators({
          dateFrom: today,
          dateTo: today,
          status: "linked",
          search: staffMember.externalUserId,
          sort: "cash",
          direction: "desc",
        }),
        emptyOperatorReport,
      )
    : emptyOperatorReport;
  const shiftRow = findShiftRow(shiftReport.rows, staffMember);
  const currentShift = findCurrentShiftDetail(shiftRow);
  const currentTotalRevenue = currentShiftTotalRevenue(shiftRow, currentShift);
  const currentBarRevenue = currentShiftBarRevenue(shiftRow, currentShift);
  const currentGuests = currentShiftGuests(shiftRow, currentShift);
  const currentClubName =
    currentShift?.storeName ??
    staffMember?.store?.name ??
    shiftRow?.storeNames[0] ??
    "клуб не привязан";
  const activeChecklistCount =
    checklists.summary.open +
    checklists.summary.inProgress +
    checklists.summary.onReview +
    checklists.summary.returned +
    checklists.summary.escalated;
  const nextTasks = myTasks.rows
    .filter((task) => task.status !== "DONE" && task.status !== "CANCELED")
    .slice(0, 5);
  const activeChecklists = activeChecklistRows(checklists.rows, user.id);
  const currentChecklist = findCurrentChecklistRun(
    checklists.rows,
    currentShift,
    user.id,
  );
  const currentChecklistProgress = checklistProgress(currentChecklist);
  const nextChecklists = activeChecklists.slice(0, 3);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Моя смена"
          items={[{ href: "/staff", label: "Персонал" }]}
        />

        <header className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                Персонал
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {currentClubName}: домашняя страница смены
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Рабочий экран администратора и старшего администратора:
                выручка, бар, гости, текущая смена, чек-лист и ближайшие
                задачи без управленческих KPI сети.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs font-bold uppercase text-zinc-500">
                Сотрудник
              </p>
              <p className="mt-2 text-lg font-semibold">
                {staffMember?.displayName ?? user.fullName ?? user.email}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {currentClubName} ·{" "}
                {staffMember?.externalUserId
                  ? `Langame user_id ${staffMember.externalUserId}`
                  : "нет привязки к Langame"}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Общая выручка смены"
            value={
              currentTotalRevenue === null
                ? "нет связки"
                : formatMoney(currentTotalRevenue)
            }
            hint={
              currentShift
                ? "игровые списания и бар за смену"
                : "нужна привязка Langame"
            }
            href="/staff/shift-workspace"
            tone={currentTotalRevenue === null ? "neutral" : "good"}
          />
          <MetricCard
            label="Выручка бара"
            value={
              currentBarRevenue === null
                ? "нет данных"
                : formatMoney(currentBarRevenue)
            }
            hint={
              currentShift
                ? "продажи, попавшие в окно смены"
                : "нет активной смены"
            }
            href="/staff/shift-workspace"
            tone={
              currentBarRevenue && currentBarRevenue > 0 ? "good" : "neutral"
            }
          />
          <MetricCard
            label="Гостей на смене"
            value={
              currentGuests === null
                ? "нет данных"
                : formatNumber(currentGuests.unique)
            }
            hint={
              currentGuests === null
                ? "нет смены или сессий"
                : `${formatNumber(currentGuests.visits)} игровых сессий`
            }
            href="/staff/shift-workspace"
          />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <CurrentShiftPanel shift={currentShift} shiftRow={shiftRow} />
          <ChecklistProgressPanel
            run={currentChecklist}
            progress={currentChecklistProgress}
            activeChecklistCount={activeChecklistCount}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Ближайшие действия
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Что сделать на смене
                </h2>
              </div>
              <Link
                href="/staff/tasks?view=my&status=all&sort=dueAt&direction=asc"
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Все задачи
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {nextTasks.length === 0 && nextChecklists.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800">
                  На текущий момент нет назначенных задач или чек-листов.
                </p>
              ) : null}
              {nextTasks.map((task) => (
                <ActionRow
                  key={task.id}
                  label={taskStatusLabel(task.status)}
                  title={task.title}
                  meta={[
                    formatDateTime(task.dueAt),
                    task.store?.name ?? "вся сеть",
                  ].join(" · ")}
                  href={`/staff/tasks?view=my&search=${encodeURIComponent(
                    task.title,
                  )}`}
                  isAlert={task.isOverdue || task.priority === "URGENT"}
                />
              ))}
              {nextChecklists.map((run) => (
                <ActionRow
                  key={run.id}
                  label={checklistStatusLabel(run.status)}
                  title={run.title}
                  meta={[
                    formatDateTime(run.scheduledAt),
                    run.store?.name ?? "вся сеть",
                    `${formatNumber(run.requiredItemsDone)}/${formatNumber(
                      run.requiredItemsTotal,
                    )} пунктов`,
                  ].join(" · ")}
                  href="/staff/checklists"
                  isAlert={run.isOverdue || run.status === "ESCALATED"}
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Выручка и смена
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Детализация текущей смены
            </h2>
            {shiftRow || currentShift ? (
              <div className="mt-4 grid gap-3">
                <ShiftMoneyRow
                  label="Оплаты"
                  value={formatMoney(
                    currentShift?.paymentAmount ??
                      shiftRow?.shiftPaymentAmount ??
                      0,
                  )}
                />
                <ShiftMoneyRow
                  label="Возвраты"
                  value={formatMoney(
                    currentShift?.refundAmount ??
                      shiftRow?.shiftRefundAmount ??
                      0,
                  )}
                />
                <ShiftMoneyRow
                  label="Инкассация"
                  value={formatMoney(
                    currentShift?.incassAmount ??
                      shiftRow?.shiftIncassAmount ??
                      0,
                  )}
                />
                <ShiftMoneyRow
                  label="Бар"
                  value={formatMoney(
                    currentShift?.barRevenue ?? shiftRow?.barRevenue ?? 0,
                  )}
                />
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-sm leading-6 text-zinc-500 dark:border-zinc-800">
                Чтобы показывать выручку конкретной смены, привяжите
                сотрудника к Langame `working_shifts.user_id` в справочнике
                персонала.
              </p>
            )}
          </section>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-4">
          <WorkspaceLink
            title="Регламенты и чек-листы"
            description="Открыть сменные стандарты, чек-листы и подтверждения."
            href="/staff/shift-regulations"
          />
          <WorkspaceLink
            title="Обучение и аттестация"
            description="Перейти к назначенным тестам и материалам."
            href="/staff/assessments"
          />
          <WorkspaceLink
            title="Командный чат"
            description="Написать в доступные каналы смены или клуба."
            href="/staff/team-chat"
          />
          <WorkspaceLink
            title="База знаний"
            description="Открыть материалы, доступные вашей роли."
            href="/staff/knowledge-base"
          />
        </section>
      </div>
    </main>
  );
}

function CurrentShiftPanel({
  shift,
  shiftRow,
}: {
  shift: StaffOperatorShiftDetail | null;
  shiftRow: StaffOperatorReportRow | null;
}) {
  const storeName =
    shift?.storeName ?? shiftRow?.storeNames[0] ?? "клуб не привязан";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">
            Текущая смена
          </p>
          <h2 className="mt-2 text-xl font-semibold">{storeName}</h2>
        </div>
        <span
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold",
            shift && !shift.stoppedAt
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
          ].join(" ")}
        >
          {shift && !shift.stoppedAt ? "идет сейчас" : "последняя смена"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ShiftFact label="Окно смены" value={formatShiftWindow(shift)} />
        <ShiftFact label="Длительность" value={formatShiftDuration(shift)} />
        <ShiftFact
          label="Смен за сутки"
          value={formatNumber(shiftRow?.shiftsCount ?? 0)}
        />
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-500">
        Показатели считаются только по клубу и временному окну смены
        администратора. Списки гостей и управленческие отчеты здесь не
        раскрываются.
      </p>
    </section>
  );
}

function ChecklistProgressPanel({
  run,
  progress,
  activeChecklistCount,
}: {
  run: StaffChecklistRun | null;
  progress: { done: number; total: number; percent: number };
  activeChecklistCount: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">
            Регламент и чек-лист
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {run?.regulation?.title ??
              run?.template?.title ??
              run?.title ??
              "Нет активного чек-листа"}
          </h2>
        </div>
        <Link
          href="/staff/checklists"
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
        >
          Открыть
        </Link>
      </div>

      {run ? (
        <>
          <div className="mt-5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-zinc-500">
                {checklistStatusLabel(run.status)}
              </span>
              <span className="font-semibold tabular-nums">
                {progress.percent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ShiftFact
              label="Пункты"
              value={`${formatNumber(progress.done)}/${formatNumber(progress.total)}`}
            />
            <ShiftFact
              label="Проблемы"
              value={formatNumber(run.blockingIssues.length)}
            />
            <ShiftFact
              label="Активных"
              value={formatNumber(activeChecklistCount)}
            />
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-sm leading-6 text-zinc-500 dark:border-zinc-800">
          Для этой смены пока нет назначенного чек-листа. Если регламент должен
          быть обязательным, его нужно назначить через раздел регламентов и
          чек-листов.
        </p>
      )}
    </section>
  );
}

function ShiftFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  tone?: "neutral" | "good" | "danger";
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm dark:bg-zinc-950",
        tone === "good"
          ? "border-emerald-200 dark:border-emerald-900/70"
          : tone === "danger"
            ? "border-red-200 dark:border-red-900/70"
            : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-zinc-500">{hint}</p>
    </Link>
  );
}

function ActionRow({
  label,
  title,
  meta,
  href,
  isAlert,
}: {
  label: string;
  title: string;
  meta: string;
  href: string;
  isAlert: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "block rounded-lg border px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10",
        isAlert
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            isAlert
              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
          ].join(" ")}
        >
          {label}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm text-zinc-500">{meta}</p>
    </Link>
  );
}

function ShiftMoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function WorkspaceLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
    </Link>
  );
}
