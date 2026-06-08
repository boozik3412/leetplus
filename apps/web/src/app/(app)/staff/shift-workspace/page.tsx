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
import { getRoleLabel } from "@/lib/roles";
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
    taskId: null,
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
    runId: null,
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
  return `${formatNumber(value)} ₽`;
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

function shiftDurationProgress(shift: StaffOperatorShiftDetail | null) {
  if (!shift) {
    return 0;
  }

  return Math.min(Math.round((shift.durationHours / 12) * 100), 100);
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

function isActiveTask(task: StaffTask) {
  return task.status !== "DONE" && task.status !== "CANCELED";
}

function roleWorkspaceName(role: string) {
  if (role === "TRAINEE") {
    return "Домашняя страница стажера";
  }

  if (role === "SENIOR_ADMINISTRATOR") {
    return "Домашняя страница старшего администратора";
  }

  return "Домашняя страница смены";
}

export default async function StaffShiftWorkspacePage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_staff_shift_workspace")) {
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
  const reviewTasksPromise = safeValue(
    getStaffTaskReport({
      view: "approval",
      status: "ON_REVIEW",
      sort: "dueAt",
      direction: "asc",
      pageSize: "4",
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

  const [myTasks, reviewTasks, checklists, directory] = await Promise.all([
    myTasksPromise,
    reviewTasksPromise,
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
    "Клуб не привязан";
  const activeChecklistCount =
    checklists.summary.open +
    checklists.summary.inProgress +
    checklists.summary.onReview +
    checklists.summary.returned +
    checklists.summary.escalated;
  const activeTasks = myTasks.rows.filter(isActiveTask);
  const nextTasks = activeTasks.slice(0, 5);
  const activeChecklists = activeChecklistRows(checklists.rows, user.id);
  const currentChecklist = findCurrentChecklistRun(
    checklists.rows,
    currentShift,
    user.id,
  );
  const currentChecklistProgress = checklistProgress(currentChecklist);
  const nextChecklists = activeChecklists
    .filter((run) => run.id !== currentChecklist?.id)
    .slice(0, 2);
  const isShiftActive = Boolean(currentShift && !currentShift.stoppedAt);
  const hasLangameBinding = Boolean(staffMember?.externalUserId);
  const staffName = staffMember?.displayName ?? user.fullName ?? user.email;
  const shiftStatusLabel = isShiftActive
    ? "Смена активна"
    : currentShift
      ? "Последняя смена"
      : "Смена не найдена";

  return (
    <main className="min-h-screen bg-[#090d12] px-4 py-6 text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Моя смена"
          items={[{ href: "/staff", label: "Персонал" }]}
        />

        <header className="mt-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {roleWorkspaceName(user.role)}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Рабочий экран администратора смены: сначала действия и проверки,
                затем выручка, гости, регламент и быстрые разделы.
              </p>
            </div>
            <Link
              href="/staff/directory"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 px-4 text-sm font-semibold text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Профиль сотрудника
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ContextChip label="Клуб" value={currentClubName} />
            <ContextChip label="Сотрудник" value={staffName} />
            <ContextChip label="Роль" value={getRoleLabel(user.role)} />
            <ContextChip
              label="Смена"
              value={shiftStatusLabel}
              tone={isShiftActive ? "good" : "muted"}
            />
          </div>
        </header>

        {!hasLangameBinding || !currentShift ? (
          <StatusBanner
            title={
              hasLangameBinding
                ? "Активная смена не найдена"
                : "Клуб не привязан к Langame"
            }
            description={
              hasLangameBinding
                ? "Данные по выручке, гостям и окну смены появятся после активной смены в Langame."
                : "Выручка, гости, бар и окно смены недоступны без привязки сотрудника к Langame user_id."
            }
            href="/staff/directory"
            action="Проверить привязку"
          />
        ) : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <WorkPanel
            currentChecklist={currentChecklist}
            checklistProgress={currentChecklistProgress}
            tasks={nextTasks}
            checklists={nextChecklists}
            overdueCount={myTasks.summary.overdue + checklists.summary.overdue}
          />
          <ReviewPanel
            myOnReview={myTasks.summary.onReview}
            reviewQueue={reviewTasks.summary.onReview}
            returnedChecklists={checklists.summary.returned}
            overdueReviews={reviewTasks.summary.overdue}
          />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Выручка смены"
            value={
              currentTotalRevenue === null
                ? "нет данных"
                : formatMoney(currentTotalRevenue)
            }
            detail={
              currentTotalRevenue === null
                ? "нужна активная смена"
                : "оплаты минус возвраты плюс бар"
            }
            accent="emerald"
            progress={currentTotalRevenue ? 72 : 0}
          />
          <MetricCard
            title="Бар"
            value={
              currentBarRevenue === null
                ? "нет данных"
                : formatMoney(currentBarRevenue)
            }
            detail={
              currentBarRevenue === null
                ? "нет продаж в окне смены"
                : "товарная часть текущей смены"
            }
            accent="amber"
            progress={currentBarRevenue ? 64 : 0}
          />
          <MetricCard
            title="Гости"
            value={
              currentGuests === null
                ? "нет данных"
                : formatNumber(currentGuests.unique)
            }
            detail={
              currentGuests === null
                ? "нет сессий в смене"
                : `${formatNumber(currentGuests.visits)} игровых сессий`
            }
            accent="cyan"
            progress={currentGuests ? 58 : 0}
          />
          <MetricCard
            title="Окно смены"
            value={currentShift?.startedAt ? formatShiftWindow(currentShift) : "нет смены"}
            detail={
              currentShift
                ? `Прошло ${formatShiftDuration(currentShift)}`
                : "смена не найдена"
            }
            accent="violet"
            progress={shiftDurationProgress(currentShift)}
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <RegulationPanel
            run={currentChecklist}
            progress={currentChecklistProgress}
            activeChecklistCount={activeChecklistCount}
          />
          <TrainingPanel role={user.role} />
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <WorkspaceLink
            title="Регламенты"
            description="Чек-листы и стандарты"
            href="/staff/shift-regulations"
            accent="emerald"
          />
          <WorkspaceLink
            title="Обучение"
            description="Курсы и материалы"
            href="/staff/training-courses"
            accent="cyan"
          />
          <WorkspaceLink
            title="Командный чат"
            description="Обсуждения и новости"
            href="/staff/team-chat"
            accent="violet"
          />
          <WorkspaceLink
            title="База знаний"
            description="Инструкции и документы"
            href="/staff/knowledge-base"
            accent="amber"
          />
          <WorkspaceLink
            title="Мои задачи"
            description="Все мои задачи"
            href="/staff/tasks?view=my&status=all"
            accent="teal"
          />
        </section>
      </div>
    </main>
  );
}

function ContextChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "muted";
}) {
  return (
    <div
      className={[
        "rounded-lg border px-4 py-3",
        tone === "good"
          ? "border-emerald-500/35 bg-emerald-500/10"
          : tone === "muted"
            ? "border-zinc-800 bg-zinc-900/50"
            : "border-zinc-800 bg-zinc-900/70",
      ].join(" ")}
    >
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-100">
        {value}
      </p>
    </div>
  );
}

function StatusBanner({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <section className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-amber-200">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-amber-100/75">
          {description}
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-400/40 px-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/10"
      >
        {action}
      </Link>
    </section>
  );
}

function WorkPanel({
  currentChecklist,
  checklistProgress,
  tasks,
  checklists,
  overdueCount,
}: {
  currentChecklist: StaffChecklistRun | null;
  checklistProgress: { done: number; total: number; percent: number };
  tasks: StaffTask[];
  checklists: StaffChecklistRun[];
  overdueCount: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">
          Что нужно сделать на смене
        </h2>
        <Link
          href="/staff/tasks?view=my&status=all"
          className="text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
        >
          Открыть задачи
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[17rem_1fr]">
        <ChecklistDial
          title="Прогресс чек-листа"
          progress={checklistProgress}
          run={currentChecklist}
        />
        <div className="space-y-2">
          {tasks.length === 0 && checklists.length === 0 ? (
            <EmptyState
              title="На смену пока ничего не назначено"
              description="Когда появятся задачи или чек-листы, они окажутся в этом списке."
            />
          ) : null}
          {tasks.map((task) => (
            <ActionRow
              key={task.id}
              title={task.title}
              status={taskStatusLabel(task.status)}
              meta={`${formatDateTime(task.dueAt)} · ${task.store?.name ?? "вся сеть"}`}
              href={`/staff/tasks?taskId=${task.id}`}
              isAlert={task.isOverdue || task.priority === "URGENT"}
              tone={task.status === "ON_REVIEW" ? "cyan" : "blue"}
            />
          ))}
          {checklists.map((run) => (
            <ActionRow
              key={run.id}
              title={run.title}
              status={checklistStatusLabel(run.status)}
              meta={`${formatDateTime(run.scheduledAt)} · ${run.store?.name ?? "вся сеть"}`}
              href="/staff/checklists"
              isAlert={run.isOverdue || run.status === "ESCALATED"}
              tone="emerald"
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          href="/staff/tasks?view=my&status=OVERDUE"
          className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 font-semibold text-red-200 transition hover:border-red-400/50"
        >
          Просрочено: {formatNumber(overdueCount)}
        </Link>
        <Link
          href="/staff/checklists"
          className="rounded-md border border-zinc-800 px-3 py-2 font-semibold text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-200"
        >
          Открыть чек-листы
        </Link>
      </div>
    </section>
  );
}

function ReviewPanel({
  myOnReview,
  reviewQueue,
  returnedChecklists,
  overdueReviews,
}: {
  myOnReview: number;
  reviewQueue: number;
  returnedChecklists: number;
  overdueReviews: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-5">
      <h2 className="text-xl font-semibold text-white">Что проверить</h2>
      <div className="mt-5 space-y-2">
        <ReviewRow
          title="На проверке у меня"
          description="Мои задачи ждут подтверждения"
          count={myOnReview}
          href="/staff/tasks?view=my&status=ON_REVIEW"
          tone="cyan"
        />
        <ReviewRow
          title="Проверка администраторов"
          description="Работы, которые можно принять"
          count={reviewQueue}
          href="/staff/tasks?view=approval&status=ON_REVIEW"
          tone="blue"
        />
        <ReviewRow
          title="Возвращено на доработку"
          description="Чек-листы с замечаниями"
          count={returnedChecklists}
          href="/staff/checklists?status=RETURNED"
          tone="amber"
        />
        <ReviewRow
          title="Просроченные проверки"
          description="Требуют внимания"
          count={overdueReviews}
          href="/staff/tasks?view=approval&status=OVERDUE"
          tone="red"
        />
      </div>
    </section>
  );
}

function ChecklistDial({
  title,
  progress,
  run,
}: {
  title: string;
  progress: { done: number; total: number; percent: number };
  run: StaffChecklistRun | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-sm text-zinc-400">{title}</p>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-emerald-300">
            {progress.percent}%
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {formatNumber(progress.done)} из {formatNumber(progress.total)}{" "}
            пунктов
          </p>
        </div>
        <div
          className="grid size-20 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#34d399 ${progress.percent}%, #1f2937 0)`,
          }}
        >
          <div className="size-14 rounded-full bg-zinc-950" />
        </div>
      </div>
      <p className="mt-5 line-clamp-2 text-sm font-semibold text-zinc-200">
        {run?.title ?? "Нет активного чек-листа"}
      </p>
    </div>
  );
}

function ActionRow({
  title,
  status,
  meta,
  href,
  isAlert,
  tone,
}: {
  title: string;
  status: string;
  meta: string;
  href: string;
  isAlert: boolean;
  tone: "blue" | "cyan" | "emerald";
}) {
  return (
    <Link
      href={href}
      className="grid gap-3 rounded-md border border-zinc-800 px-3 py-2.5 transition hover:border-emerald-500/40 hover:bg-emerald-500/5 sm:grid-cols-[1fr_auto_auto] sm:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{meta}</p>
      </div>
      <StatusPill label={status} tone={tone} />
      <span
        className={[
          "text-right text-sm font-semibold",
          isAlert ? "text-red-300" : "text-zinc-500",
        ].join(" ")}
      >
        {isAlert ? "!" : "—"}
      </span>
    </Link>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "cyan" | "emerald" | "amber" | "red";
}) {
  const classes: Record<typeof tone, string> = {
    blue: "bg-blue-500/15 text-blue-200",
    cyan: "bg-cyan-500/15 text-cyan-200",
    emerald: "bg-emerald-500/15 text-emerald-200",
    amber: "bg-amber-500/15 text-amber-200",
    red: "bg-red-500/15 text-red-200",
  };

  return (
    <span
      className={[
        "w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
        classes[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ReviewRow({
  title,
  description,
  count,
  href,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  href: string;
  tone: "blue" | "cyan" | "amber" | "red";
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 px-4 py-3 transition hover:border-emerald-500/40 hover:bg-emerald-500/5"
    >
      <div>
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      <StatusPill label={formatNumber(count)} tone={tone} />
    </Link>
  );
}

function MetricCard({
  title,
  value,
  detail,
  accent,
  progress,
}: {
  title: string;
  value: string;
  detail: string;
  accent: "emerald" | "amber" | "cyan" | "violet";
  progress: number;
}) {
  const colors: Record<typeof accent, string> = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    cyan: "bg-cyan-400",
    violet: "bg-violet-400",
  };

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 min-h-8 text-2xl font-semibold tabular-nums text-white">
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-500">{detail}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={["h-full rounded-full", colors[accent]].join(" ")}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </section>
  );
}

function RegulationPanel({
  run,
  progress,
  activeChecklistCount,
}: {
  run: StaffChecklistRun | null;
  progress: { done: number; total: number; percent: number };
  activeChecklistCount: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Регламент смены</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Чек-лист, обязательные пункты и результат последней проверки.
          </p>
        </div>
        <Link
          href="/staff/checklists"
          className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
        >
          Открыть регламент
        </Link>
      </div>

      {run ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{run.title}</p>
            <p className="mt-2 text-sm text-zinc-500">
              {checklistStatusLabel(run.status)} · выполнено{" "}
              {formatNumber(progress.done)} из {formatNumber(progress.total)}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <InfoLine label="Активных чек-листов" value={formatNumber(activeChecklistCount)} />
            <InfoLine label="Проблемных пунктов" value={formatNumber(run.blockingIssues.length)} />
            <InfoLine label="Доказательств" value={`${formatNumber(run.evidenceDone)}/${formatNumber(run.evidenceTotal)}`} />
          </div>
        </div>
      ) : (
        <EmptyState
          title="Нет активного чек-листа"
          description="Если регламент обязателен для смены, назначьте его через раздел регламентов и чек-листов."
        />
      )}
    </section>
  );
}

function TrainingPanel({ role }: { role: string }) {
  const isTrainee = role === "TRAINEE";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {isTrainee ? "Обучение стажера" : "Обучение и аттестация"}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {isTrainee
              ? "Первым делом пройдите материалы адаптации и закрепите регламенты смены."
              : "Быстрый доступ к назначенным материалам, тестам и подтверждениям."}
          </p>
        </div>
        <Link
          href="/staff/training-courses"
          className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
        >
          Перейти к обучению
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-sm text-zinc-400">Фокус сейчас</p>
          <p className="mt-2 text-lg font-semibold text-zinc-100">
            {isTrainee ? "Стандарты сервиса в клубе" : "Актуальные материалы роли"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {isTrainee ? "Начните с открытия смены и общения с гостем." : "Проверьте новые инструкции и аттестации."}
          </p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-semibold text-zinc-100">Следующий шаг</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Откройте обучение, завершите назначенный модуль и вернитесь к
            задачам смены.
          </p>
        </div>
      </div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 px-3 py-2">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-5">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}

function WorkspaceLink({
  title,
  description,
  href,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  accent: "emerald" | "cyan" | "violet" | "amber" | "teal";
}) {
  const accents: Record<typeof accent, string> = {
    emerald: "from-emerald-500/20 text-emerald-200",
    cyan: "from-cyan-500/20 text-cyan-200",
    violet: "from-violet-500/20 text-violet-200",
    amber: "from-amber-500/20 text-amber-200",
    teal: "from-teal-500/20 text-teal-200",
  };

  return (
    <Link
      href={href}
      className="group rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/40"
    >
      <div
        className={[
          "mb-4 grid size-10 place-items-center rounded-md bg-gradient-to-br to-zinc-900",
          accents[accent],
        ].join(" ")}
      >
        <span className="text-sm font-bold">{title.slice(0, 1)}</span>
      </div>
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </Link>
  );
}
