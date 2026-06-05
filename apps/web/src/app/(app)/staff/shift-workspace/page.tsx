import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffOperators,
  type StaffOperatorReport,
  type StaffOperatorReportRow,
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
  getStaffNotificationsReport,
  type StaffNotificationsReport,
} from "@/lib/staff-notifications";
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

const emptyNotificationsReport: StaffNotificationsReport = {
  filters: {
    status: "OPEN",
    severity: "all",
    sourceType: "all",
    storeId: null,
    search: null,
    pageSize: 5,
  },
  summary: {
    total: 0,
    open: 0,
    acknowledged: 0,
    resolved: 0,
    critical: 0,
    warning: 0,
    info: 0,
  },
  rows: [],
  stores: [],
  sourceTypes: [],
  severities: [],
  statuses: [],
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

function shiftRevenue(row: StaffOperatorReportRow | null) {
  if (!row) {
    return null;
  }

  return row.shiftPaymentAmount - row.shiftRefundAmount;
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
  const todayTasksPromise = safeValue(
    getStaffTaskReport({
      view: "today",
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
  const notificationsPromise = safeValue(
    getStaffNotificationsReport({
      status: "OPEN",
      pageSize: "5",
    }),
    emptyNotificationsReport,
  );
  const directoryPromise = safeValue(
    getStaffDirectoryReport({
      status: "all",
      search: user.email,
    }),
    emptyDirectoryReport,
  );

  const [myTasks, todayTasks, checklists, notifications, directory] =
    await Promise.all([
      myTasksPromise,
      todayTasksPromise,
      checklistsPromise,
      notificationsPromise,
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
  const currentShiftRevenue = shiftRevenue(shiftRow);
  const activeTaskCount =
    myTasks.summary.open + myTasks.summary.inProgress + myTasks.summary.onReview;
  const activeChecklistCount =
    checklists.summary.open +
    checklists.summary.inProgress +
    checklists.summary.onReview +
    checklists.summary.returned +
    checklists.summary.escalated;
  const nextTasks = myTasks.rows
    .filter((task) => task.status !== "DONE" && task.status !== "CANCELED")
    .slice(0, 5);
  const nextChecklists = checklists.rows
    .filter(
      (run) =>
        run.status !== "ACCEPTED" &&
        run.status !== "CANCELED" &&
        (run.assignedToUser?.id === user.id || !run.assignedToUser),
    )
    .slice(0, 3);

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
                Моя смена
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Рабочий экран администратора: ближайшие задачи, регламенты,
                чек-листы, обучение, связь и выручка текущей смены без
                управленческих KPI сети.
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
                {staffMember?.store?.name ?? "клуб не привязан"} ·{" "}
                {staffMember?.externalUserId
                  ? `Langame user_id ${staffMember.externalUserId}`
                  : "нет привязки к Langame"}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Мои задачи"
            value={formatNumber(activeTaskCount)}
            hint={`${formatNumber(myTasks.summary.overdue)} просрочено`}
            href="/staff/tasks?view=my&status=all&sort=dueAt&direction=asc"
            tone={myTasks.summary.overdue > 0 ? "danger" : "good"}
          />
          <MetricCard
            label="Сегодня по сменам"
            value={formatNumber(todayTasks.summary.total)}
            hint="общий тайминг задач"
            href="/staff/tasks?view=today&status=all&sort=dueAt&direction=asc"
          />
          <MetricCard
            label="Чек-листы"
            value={formatNumber(activeChecklistCount)}
            hint={`${formatNumber(checklists.summary.overdue)} просрочено`}
            href="/staff/checklists"
            tone={checklists.summary.overdue > 0 ? "danger" : "neutral"}
          />
          <MetricCard
            label="Выручка смены"
            value={
              currentShiftRevenue === null
                ? "нет связки"
                : formatMoney(currentShiftRevenue)
            }
            hint={
              shiftRow
                ? `${formatNumber(shiftRow.shiftsCount)} смен за день`
                : "нужна привязка Langame"
            }
            href="/guests/staff-control"
            tone={currentShiftRevenue === null ? "neutral" : "good"}
          />
          <MetricCard
            label="Уведомления"
            value={formatNumber(notifications.summary.open)}
            hint={`${formatNumber(notifications.summary.critical)} критичных`}
            href="/staff/notifications"
            tone={notifications.summary.critical > 0 ? "danger" : "neutral"}
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
              Деньги текущего оператора
            </h2>
            {shiftRow ? (
              <div className="mt-4 grid gap-3">
                <ShiftMoneyRow
                  label="Оплаты"
                  value={formatMoney(shiftRow.shiftPaymentAmount)}
                />
                <ShiftMoneyRow
                  label="Возвраты"
                  value={formatMoney(shiftRow.shiftRefundAmount)}
                />
                <ShiftMoneyRow
                  label="Инкассация"
                  value={formatMoney(shiftRow.shiftIncassAmount)}
                />
                <ShiftMoneyRow
                  label="Бар"
                  value={formatMoney(shiftRow.barRevenue)}
                />
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-sm leading-6 text-zinc-500 dark:border-zinc-800">
                Чтобы показывать выручку конкретной смены, привяжите
                сотрудника к Langame `working_shifts.user_id` в справочнике
                персонала.
              </p>
            )}
            <Link
              href="/guests/staff-control"
              className="mt-4 inline-flex rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Открыть смены
            </Link>
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
