import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";
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
  type StaffChecklistAnswerStatus,
  type StaffChecklistReport,
  type StaffChecklistRun,
  type StaffChecklistTemplateOption,
} from "@/lib/staff-checklists";
import {
  getStaffShiftWorkspaceProfile,
  type StaffDirectoryMember,
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

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function startChecklistFromTemplate(formData: FormData) {
  "use server";

  const templateId = String(formData.get("templateId") ?? "").trim();
  const storeId = String(formData.get("storeId") ?? "").trim();

  if (!templateId) {
    redirect("/staff/shift-workspace?checklistStartError=template");
  }

  const response = await fetch(`${getApiUrl()}/staff/checklists`, {
    method: "POST",
    headers: {
      ...(await getAuthHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      templateId,
      storeId: storeId || null,
    }),
  });

  if (!response.ok) {
    const message = encodeURIComponent(await readApiError(response));
    redirect(`/staff/shift-workspace?checklistStartError=${message}`);
  }

  const run = (await response.json()) as StaffChecklistRun;
  redirect(`/staff/shift-workspace?checklistRunId=${encodeURIComponent(run.id)}`);
}

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function todayDateInput() {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function buildLangameBindingChatHref({
  storeId,
  staffName,
  clubName,
}: {
  storeId: string | null;
  staffName: string;
  clubName: string;
}) {
  const params = new URLSearchParams();

  if (storeId) {
    params.set("storeId", storeId);
  }

  params.set(
    "draft",
    `Прошу привязать учетную запись ${staffName}, клуб ${clubName}.`,
  );

  return `/staff/team-chat?${params.toString()}`;
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
      ["OPEN", "IN_PROGRESS", "RETURNED", "ESCALATED"].includes(run.status) &&
      (run.assignedToUser?.id === userId || !run.assignedToUser),
  );
}

function filterClubChecklistRows(rows: StaffChecklistRun[], storeId: string | null) {
  return rows.filter((run) => !run.store?.id || !storeId || run.store.id === storeId);
}

function filterClubChecklistTemplates(
  rows: StaffChecklistTemplateOption[],
  storeId: string | null,
) {
  return rows.filter((template) => !template.store?.id || !storeId || template.store.id === storeId);
}

function findCurrentChecklistRun(
  activeRows: StaffChecklistRun[],
  shift: StaffOperatorShiftDetail | null,
) {
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

type ChecklistItemState = "done" | "overdue" | "active" | "planned";

type ChecklistTodoItem = {
  id: string;
  sectionTitle: string;
  title: string;
  instruction: string | null;
  answerStatus: StaffChecklistAnswerStatus | null;
  state: ChecklistItemState;
};

const answerStatusLabels: Record<StaffChecklistAnswerStatus, string> = {
  PASS: "Выполнено",
  FAILED: "Проблема",
  NOT_APPLICABLE: "Не применимо",
};

function buildChecklistTodoItems(run: StaffChecklistRun | null) {
  if (!run) {
    return [];
  }

  const answerMap = new Map(
    run.answers.map((answer) => [`${answer.sectionId}:${answer.itemId}`, answer]),
  );
  let activeAssigned = false;

  return run.sections.flatMap((section) =>
    section.items.map((item) => {
      const answer = answerMap.get(`${section.id}:${item.id}`) ?? null;
      let state: ChecklistItemState = "planned";

      if (answer?.status) {
        state = "done";
      } else if (run.isOverdue) {
        state = "overdue";
      } else if (!activeAssigned) {
        state = "active";
        activeAssigned = true;
      }

      return {
        id: `${section.id}:${item.id}`,
        sectionTitle: section.title,
        title: item.title,
        instruction: item.instruction,
        answerStatus: answer?.status ?? null,
        state,
      };
    }),
  );
}

function checklistTodoSummary(items: ChecklistTodoItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.state] += 1;

      return summary;
    },
    { done: 0, overdue: 0, active: 0, planned: 0 },
  );
}

function currentTodoItem(items: ChecklistTodoItem[]) {
  return (
    items.find((item) => item.state === "active") ??
    items.find((item) => item.state === "overdue") ??
    items.find((item) => item.state === "planned") ??
    items[0] ??
    null
  );
}

function checklistItemStateLabel(item: ChecklistTodoItem) {
  if (item.answerStatus) {
    return answerStatusLabels[item.answerStatus];
  }

  const labels: Record<ChecklistItemState, string> = {
    done: "Выполнено",
    overdue: "Просрочено",
    active: "Активно",
    planned: "Запланировано",
  };

  return labels[item.state];
}

function checklistItemStateTone(item: ChecklistTodoItem) {
  if (item.answerStatus === "FAILED") {
    return "red";
  }

  if (item.answerStatus === "NOT_APPLICABLE") {
    return "amber";
  }

  const tones: Record<ChecklistItemState, "emerald" | "red" | "cyan" | "blue"> = {
    done: "emerald",
    overdue: "red",
    active: "cyan",
    planned: "blue",
  };

  return tones[item.state];
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

function canReviewStaffTaskQueue(user: {
  role: string;
  isPlatformAdmin: boolean;
}) {
  return (
    user.isPlatformAdmin ||
    [
      "OWNER",
      "ADMIN",
      "MANAGER",
      "CLUB_MANAGER",
      "STANDARDS_MANAGER",
    ].includes(user.role)
  );
}

export default async function StaffShiftWorkspacePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const selectedChecklistId = searchParam(params.checklistRunId);
  const isChecklistPickerOpen = searchParam(params.checklistPicker) === "1";
  const checklistStartError = searchParam(params.checklistStartError);

  if (!can(user, "view_staff_shift_workspace")) {
    redirect("/dashboard");
  }

  const today = todayDateInput();
  const canReviewStaffTasks = canReviewStaffTaskQueue(user);
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
  const reviewTasksPromise = canReviewStaffTasks
    ? safeValue(
        getStaffTaskReport({
          view: "approval",
          status: "ON_REVIEW",
          sort: "dueAt",
          direction: "asc",
          pageSize: "4",
        }),
        emptyTaskReport,
      )
    : Promise.resolve(emptyTaskReport);
  const checklistsPromise = safeValue(
    getStaffChecklistReport({
      status: "all",
    }),
    emptyChecklistReport,
  );
  const profilePromise = safeValue(
    getStaffShiftWorkspaceProfile(),
    { staffMember: null },
  );

  const [myTasks, reviewTasks, checklists, profile] = await Promise.all([
    myTasksPromise,
    reviewTasksPromise,
    checklistsPromise,
    profilePromise,
  ]);
  const staffMember = profile.staffMember;
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
  const activeTasks = myTasks.rows.filter(isActiveTask);
  const nextTasks = activeTasks.slice(0, 5);
  const staffStoreId = staffMember?.store?.id ?? null;
  const activeChecklists = filterClubChecklistRows(
    activeChecklistRows(checklists.rows, user.id),
    staffStoreId,
  );
  const availableChecklistTemplates = filterClubChecklistTemplates(
    checklists.checklistTemplates,
    staffStoreId,
  );
  const recommendedChecklist = findCurrentChecklistRun(activeChecklists, currentShift);
  const selectedChecklist = isChecklistPickerOpen
    ? null
    : selectedChecklistId
      ? activeChecklists.find((run) => run.id === selectedChecklistId) ??
        recommendedChecklist ??
        activeChecklists[0] ??
        null
      : recommendedChecklist ?? activeChecklists[0] ?? null;
  const selectedChecklistItems = buildChecklistTodoItems(selectedChecklist);
  const selectedChecklistSummary = checklistTodoSummary(selectedChecklistItems);
  const selectedChecklistCurrentItem = currentTodoItem(selectedChecklistItems);
  const selectedChecklistProgress = checklistProgress(selectedChecklist);
  const isShiftActive = Boolean(currentShift && !currentShift.stoppedAt);
  const hasLangameBinding = Boolean(staffMember?.externalUserId);
  const staffName = staffMember?.displayName ?? user.fullName ?? user.email;
  const canManageDirectory = can(user, "manage_staff_directory");
  const langameBindingChatHref = buildLangameBindingChatHref({
    storeId: staffStoreId,
    staffName,
    clubName: currentClubName,
  });
  const headerActionHref = canManageDirectory
    ? "/staff/directory"
    : "/staff/tasks?view=my&status=all";
  const headerActionLabel = canManageDirectory
    ? "Профиль сотрудника"
    : "Мои задачи";
  const profileIssueHref = canManageDirectory
    ? "/staff/directory"
    : hasLangameBinding
      ? "/staff/team-chat"
      : langameBindingChatHref;
  const profileIssueAction = canManageDirectory
    ? "Проверить привязку"
    : "Написать в чат";
  const shiftStatusLabel = isShiftActive
    ? "Смена активна"
    : currentShift
      ? "Последняя смена"
      : "Открытая смена не найдена";
  const taskControlCount =
    activeTasks.length +
    checklists.summary.returned +
    checklists.summary.overdue +
    (canReviewStaffTasks
      ? reviewTasks.summary.onReview + reviewTasks.summary.overdue
      : 0);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 sm:py-8 dark:bg-[#090d12] dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Моя смена"
          items={[{ href: "/staff", label: "Персонал" }]}
        />

        <header className="mt-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                {roleWorkspaceName(user.role)}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Рабочий экран администратора смены: сначала действия и проверки,
                затем выручка, гости, регламент и быстрые разделы.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff/shift-reports/new"
                target="_blank"
                className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Сформировать отчет
              </Link>
              {canManageDirectory ? (
                <Link
                  href={headerActionHref}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:text-emerald-200"
                >
                  {headerActionLabel}
                </Link>
              ) : null}
            </div>
          </div>

          <ShiftSummaryPanel
            clubName={currentClubName}
            staffName={staffName}
            roleLabel={getRoleLabel(user.role)}
            shiftStatusLabel={shiftStatusLabel}
            isShiftActive={isShiftActive}
            totalRevenue={currentTotalRevenue}
            barRevenue={currentBarRevenue}
            guests={currentGuests}
            shift={currentShift}
          />
        </header>

        {!hasLangameBinding || !currentShift ? (
          <StatusBanner
            title={
              hasLangameBinding
                ? "Активная смена не найдена"
                : "Сотрудник не привязан к Langame"
            }
            description={
              hasLangameBinding
                ? "Langame user_id указан, но открытая смена по этому сотруднику сейчас не найдена."
                : "У учетной записи нет Langame user_id, поэтому LeetPlus не может определить текущую смену, выручку, гостей и бар."
            }
            href={profileIssueHref}
            action={profileIssueAction}
          />
        ) : null}

        <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <WorkPanel
            selectedChecklist={selectedChecklist}
            recommendedChecklist={recommendedChecklist}
            checklists={activeChecklists}
            checklistTemplates={availableChecklistTemplates}
            checklistStartError={checklistStartError ?? null}
            staffStoreId={staffStoreId}
            checklistProgress={selectedChecklistProgress}
            checklistItems={selectedChecklistItems}
            checklistSummary={selectedChecklistSummary}
            currentItem={selectedChecklistCurrentItem}
            overdueCount={myTasks.summary.overdue + checklists.summary.overdue}
          />
          <TaskControlPanel
            tasks={nextTasks}
            totalCount={taskControlCount}
            myOnReview={myTasks.summary.onReview}
            reviewQueue={reviewTasks.summary.onReview}
            returnedChecklists={checklists.summary.returned}
            overdueReviews={reviewTasks.summary.overdue}
            myOverdueTasks={myTasks.summary.overdue}
            overdueChecklists={checklists.summary.overdue}
            canReviewStaffTasks={canReviewStaffTasks}
          />
        </section>

        <section className="mt-4">
          <TrainingPanel role={user.role} />
        </section>

        <section
          aria-label="Быстрые разделы"
          className="mt-4 grid w-fit max-w-full grid-cols-3 gap-2"
        >
          <WorkspaceLink
            title="Обучение"
            description="Курсы и материалы"
            href="/staff/training-courses"
            accent="cyan"
            icon="training"
          />
          <WorkspaceLink
            title="Командный чат"
            description="Обсуждения и новости"
            href="/staff/team-chat"
            accent="violet"
            icon="chat"
          />
          <WorkspaceLink
            title="База знаний"
            description="Инструкции и документы"
            href="/staff/knowledge-base"
            accent="amber"
            icon="knowledge"
          />
        </section>
      </div>
    </main>
  );
}

function ShiftSummaryPanel({
  clubName,
  staffName,
  roleLabel,
  shiftStatusLabel,
  isShiftActive,
  totalRevenue,
  barRevenue,
  guests,
  shift,
}: {
  clubName: string;
  staffName: string;
  roleLabel: string;
  shiftStatusLabel: string;
  isShiftActive: boolean;
  totalRevenue: number | null;
  barRevenue: number | null;
  guests: { unique: number; visits: number } | null;
  shift: StaffOperatorShiftDetail | null;
}) {
  return (
    <section className="mt-4 min-w-0 overflow-hidden border-y border-zinc-200 py-3 dark:border-zinc-800">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1fr]">
        <SummaryCell label="Клуб" value={clubName} />
        <SummaryCell label="Сотрудник" value={staffName} />
        <SummaryCell label="Роль" value={roleLabel} />
        <SummaryCell
          label="Смена"
          value={shiftStatusLabel}
          tone={isShiftActive ? "good" : "muted"}
        />
      </div>
      <div className="mt-3 grid min-w-0 gap-x-6 gap-y-3 border-t border-zinc-200 pt-3 sm:grid-cols-2 xl:grid-cols-4 dark:border-zinc-800">
        <SummaryMetric
          label="Выручка"
          value={totalRevenue === null ? "нет данных" : formatMoney(totalRevenue)}
          hint={totalRevenue === null ? "нужна активная смена" : "оплаты, возвраты и бар"}
        />
        <SummaryMetric
          label="Бар"
          value={barRevenue === null ? "нет данных" : formatMoney(barRevenue)}
          hint={barRevenue === null ? "нет продаж в смене" : "товары в окне смены"}
        />
        <SummaryMetric
          label="Гости"
          value={guests === null ? "нет данных" : formatNumber(guests.unique)}
          hint={guests === null ? "нет сессий" : `${formatNumber(guests.visits)} сессий`}
        />
        <SummaryMetric
          label="Окно"
          value={shift?.startedAt ? formatShiftWindow(shift) : "нет смены"}
          hint={shift ? `длительность ${formatShiftDuration(shift)}` : "смена не найдена"}
        />
      </div>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "muted";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-200"
      : tone === "muted"
        ? "text-zinc-700 dark:text-zinc-300"
        : "text-zinc-950 dark:text-zinc-100";

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-500">
        {label}
      </p>
      <p className={["mt-1 truncate text-sm font-semibold", toneClass].join(" ")}>
        {value}
      </p>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-500">
          {label}
        </p>
        <p className="truncate text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
          {value}
        </p>
      </div>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-500">
        {hint}
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
    <section className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/35 dark:bg-amber-500/10">
      <div>
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-100/75">
          {description}
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-400/40 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10"
      >
        {action}
      </Link>
    </section>
  );
}

function WorkPanel({
  selectedChecklist,
  recommendedChecklist,
  checklists,
  checklistTemplates,
  checklistStartError,
  staffStoreId,
  checklistProgress,
  checklistItems,
  checklistSummary,
  currentItem,
  overdueCount,
}: {
  selectedChecklist: StaffChecklistRun | null;
  recommendedChecklist: StaffChecklistRun | null;
  checklists: StaffChecklistRun[];
  checklistTemplates: StaffChecklistTemplateOption[];
  checklistStartError: string | null;
  staffStoreId: string | null;
  checklistProgress: { done: number; total: number; percent: number };
  checklistItems: ChecklistTodoItem[];
  checklistSummary: ReturnType<typeof checklistTodoSummary>;
  currentItem: ChecklistTodoItem | null;
  overdueCount: number;
}) {
  const templateChoices = checklistTemplates;
  const recommendedTemplateId = recommendedChecklist
    ? null
    : (templateChoices[0]?.id ?? null);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/5 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
          Что нужно сделать на смене
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff/shift-regulations"
            className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-200 dark:hover:border-emerald-500/50 dark:hover:text-emerald-200"
          >
            Регламент смены
          </Link>
          <Link
            href="/staff/checklists"
            className="inline-flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
          >
            Все чек-листы
          </Link>
        </div>
      </div>

      {selectedChecklist ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-500">
                  Основной чек-лист
                </p>
                <h3 className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-100">
                  {selectedChecklist.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                  {checklistStatusLabel(selectedChecklist.status)} ·{" "}
                  {selectedChecklist.store?.name ?? "вся сеть"} ·{" "}
                  {formatDateTime(selectedChecklist.scheduledAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/shift-workspace?checklistPicker=1"
                  className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-300 dark:hover:border-emerald-500/40"
                >
                  Сменить
                </Link>
                <Link
                  href={`/staff/checklists?runId=${selectedChecklist.id}#run-${selectedChecklist.id}`}
                  className="inline-flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                >
                  Открыть
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <ChecklistCounter label="Выполнено" value={checklistSummary.done} tone="emerald" />
              <ChecklistCounter label="Просрочено" value={checklistSummary.overdue} tone="red" />
              <ChecklistCounter label="Активно" value={checklistSummary.active} tone="cyan" />
              <ChecklistCounter label="Запланировано" value={checklistSummary.planned} tone="blue" />
            </div>
            <div className="mt-4 rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-500">
                  Актуальное действие
                </p>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-500">
                  {formatNumber(checklistProgress.done)} из{" "}
                  {formatNumber(checklistProgress.total)} · {checklistProgress.percent}%
                </p>
              </div>
              {currentItem ? (
                <div className="mt-3">
                  <StatusPill
                    label={checklistItemStateLabel(currentItem)}
                    tone={checklistItemStateTone(currentItem)}
                  />
                  <p className="mt-3 text-base font-semibold text-zinc-950 dark:text-zinc-100">
                    {currentItem.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                    {currentItem.sectionTitle}
                  </p>
                  {currentItem.instruction ? (
                    <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {currentItem.instruction}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
                  В чек-листе пока нет пунктов.
                </p>
              )}
            </div>
            {checklistItems.length > 0 ? (
              <details
                open
                className="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-transparent"
              >
                <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Показать все действия чек-листа
                </summary>
                <div className="mt-3 space-y-2">
                  {checklistItems.map((item) => (
                    <ChecklistTodoRow key={item.id} item={item} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">
                Основной чек-лист на смену не выбран
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-500">
                Сначала выберите действующий чек-лист клуба. После выбора здесь появятся актуальное действие, весь список дел и счетчики статусов.
              </p>
            </div>
            <details className="min-w-0 max-w-full lg:min-w-80">
              <summary className="flex min-h-10 w-full cursor-pointer list-none items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-center text-sm font-semibold leading-5 text-white transition hover:bg-emerald-500 [&::-webkit-details-marker]:hidden">
                Выбрать чек-лист
              </summary>
              <div className="mt-3 min-w-0 max-w-full space-y-2 overflow-hidden rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                {checklistStartError ? (
                  <p className="rounded-md bg-red-50 px-2 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-200">
                    {checklistStartError === "template"
                      ? "Сначала выберите чек-лист."
                      : checklistStartError}
                  </p>
                ) : null}
                {checklists.length === 0 && templateChoices.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-zinc-500 dark:text-zinc-500">
                    Для этого клуба пока нет активных чек-листов.
                  </p>
                ) : (
                  <>
                    {checklists.map((run) => (
                      <ChecklistChoiceRow
                        key={run.id}
                        run={run}
                        isRecommended={run.id === recommendedChecklist?.id}
                      />
                    ))}
                    {templateChoices.map((template) => (
                      <ChecklistTemplateChoiceRow
                        key={template.id}
                        template={template}
                        storeId={staffStoreId}
                        isRecommended={template.id === recommendedTemplateId}
                      />
                    ))}
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      )}

      {overdueCount > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href="/staff/tasks?view=my&status=OVERDUE"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700 transition hover:border-red-300 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 dark:hover:border-red-400/50"
          >
            Просрочено: {formatNumber(overdueCount)}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ChecklistCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "cyan" | "blue";
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200",
  };

  return (
    <div className={["rounded-md px-3 py-2", tones[tone]].join(" ")}>
      <p className="text-[11px] font-bold uppercase opacity-75">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function ChecklistChoiceRow({
  run,
  isRecommended,
}: {
  run: StaffChecklistRun;
  isRecommended: boolean;
}) {
  return (
    <Link
      href={`/staff/shift-workspace?checklistRunId=${run.id}`}
      className="block min-w-0 max-w-full rounded-md border border-zinc-200 px-3 py-2 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            {run.title}
          </p>
          <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-500">
            {run.store?.name ?? "вся сеть"} · {formatDateTime(run.scheduledAt)}
          </p>
        </div>
        {isRecommended ? <StatusPill label="Рекомендован" tone="emerald" /> : null}
      </div>
    </Link>
  );
}

function ChecklistTemplateChoiceRow({
  template,
  storeId,
  isRecommended,
}: {
  template: StaffChecklistTemplateOption;
  storeId: string | null;
  isRecommended: boolean;
}) {
  return (
    <form action={startChecklistFromTemplate}>
      <input type="hidden" name="templateId" value={template.id} />
      {storeId ? <input type="hidden" name="storeId" value={storeId} /> : null}
      <button
        type="submit"
        className="block w-full min-w-0 max-w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/15"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              {template.title}
            </p>
            <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-500">
              {template.store?.name ?? "вся сеть"} · v{template.version} ·{" "}
              {formatNumber(template.itemsCount)} пунктов
            </p>
          </div>
          {isRecommended ? (
            <StatusPill label="Рекомендован" tone="emerald" />
          ) : null}
        </div>
      </button>
    </form>
  );
}

function ChecklistTodoRow({ item }: { item: ChecklistTodoItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          {item.title}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-500">
          {item.sectionTitle}
        </p>
      </div>
      <StatusPill
        label={checklistItemStateLabel(item)}
        tone={checklistItemStateTone(item)}
      />
    </div>
  );
}

function TaskControlPanel({
  tasks,
  totalCount,
  myOnReview,
  reviewQueue,
  returnedChecklists,
  overdueReviews,
  myOverdueTasks,
  overdueChecklists,
  canReviewStaffTasks,
}: {
  tasks: StaffTask[];
  totalCount: number;
  myOnReview: number;
  reviewQueue: number;
  returnedChecklists: number;
  overdueReviews: number;
  myOverdueTasks: number;
  overdueChecklists: number;
  canReviewStaffTasks: boolean;
}) {
  const rows = canReviewStaffTasks
    ? [
        {
          title: "Мои задачи на проверке",
          description: "Выполнены мной и ожидают проверяющего",
          count: myOnReview,
          href: "/staff/tasks?view=my&status=ON_REVIEW",
          tone: "cyan" as const,
        },
        {
          title: "Задачи команды на проверке",
          description: "Работы, которые можно принять или вернуть",
          count: reviewQueue,
          href: "/staff/tasks?view=approval&status=ON_REVIEW",
          tone: "blue" as const,
        },
        {
          title: "Чек-листы на доработке",
          description: "Вернулись с замечаниями, нужно исправить",
          count: returnedChecklists,
          href: "/staff/checklists?status=RETURNED",
          tone: "amber" as const,
        },
        {
          title: "Просроченные проверки",
          description: "Работы команды с истекшим сроком",
          count: overdueReviews,
          href: "/staff/tasks?view=approval&status=OVERDUE",
          tone: "red" as const,
        },
      ]
    : [
        {
          title: "Задачи ждут проверки",
          description: "Я выполнил и отправил проверяющему",
          count: myOnReview,
          href: "/staff/tasks?view=my&status=ON_REVIEW",
          tone: "cyan" as const,
        },
        {
          title: "Чек-листы на доработке",
          description: "Вернулись с замечаниями, нужно исправить",
          count: returnedChecklists,
          href: "/staff/checklists?status=RETURNED",
          tone: "amber" as const,
        },
        {
          title: "Просроченные задачи",
          description: "Мои задачи с истекшим сроком",
          count: myOverdueTasks,
          href: "/staff/tasks?view=my&status=OVERDUE",
          tone: "red" as const,
        },
        {
          title: "Просроченные чек-листы",
          description: "Мои чек-листы с истекшим сроком",
          count: overdueChecklists,
          href: "/staff/checklists?status=OVERDUE",
          tone: "red" as const,
        },
      ];

  if (totalCount === 0) {
    return (
      <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Мои задачи и контроль
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
              Активных задач и проверок нет
            </p>
          </div>
          <StatusPill label="0" tone="emerald" />
        </div>
        <Link
          href="/staff/tasks?view=my&status=all"
          className="mt-3 inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-300 dark:hover:border-emerald-500/40"
        >
          Открыть список задач
        </Link>
      </section>
    );
  }

  const visibleRows = rows.filter((row) => row.count > 0);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/5 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
            Мои задачи и контроль
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Выполнение моих задач, возвраты и проверки
          </p>
        </div>
        <StatusPill label={formatNumber(totalCount)} tone="cyan" />
      </div>
      <div className="mt-5 space-y-2">
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
        {visibleRows.map((row) => (
          <ReviewRow
            key={row.href}
            title={row.title}
            description={row.description}
            count={row.count}
            href={row.href}
            tone={row.tone}
          />
        ))}
      </div>
      <Link
        href="/staff/tasks?view=my&status=all"
        className="mt-4 inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-300 dark:hover:border-emerald-500/40"
      >
        Все мои задачи
      </Link>
    </section>
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
      className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 transition hover:border-emerald-300 hover:bg-emerald-50 sm:grid-cols-[1fr_auto_auto] sm:items-center dark:border-zinc-800 dark:bg-transparent dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          {title}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-500">
          {meta}
        </p>
      </div>
      <StatusPill label={status} tone={tone} />
      <span
        className={[
          "text-right text-sm font-semibold",
          isAlert ? "text-red-600 dark:text-red-300" : "text-zinc-500",
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
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200",
    emerald:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
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
      className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-transparent dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          {title}
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          {description}
        </p>
      </div>
      <StatusPill label={formatNumber(count)} tone={tone} />
    </Link>
  );
}

function TrainingPanel({ role }: { role: string }) {
  const isTrainee = role === "TRAINEE";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
            {isTrainee ? "Обучение стажера" : "Обучение и аттестация"}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            {isTrainee
              ? "Первым делом пройдите материалы адаптации и закрепите регламенты смены."
              : "Быстрый доступ к назначенным материалам, тестам и подтверждениям."}
          </p>
        </div>
        <Link
          href="/staff/training-courses"
          className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-200 dark:hover:bg-emerald-500/10"
        >
          Перейти к обучению
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Фокус сейчас
          </p>
          <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
            {isTrainee ? "Стандарты сервиса в клубе" : "Актуальные материалы роли"}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            {isTrainee ? "Начните с открытия смены и общения с гостем." : "Проверьте новые инструкции и аттестации."}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            Следующий шаг
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-500">
            Откройте обучение, завершите назначенный модуль и вернитесь к
            задачам смены.
          </p>
        </div>
      </div>
    </section>
  );
}

function WorkspaceLink({
  title,
  description,
  href,
  accent,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  accent: "emerald" | "cyan" | "violet" | "amber" | "teal";
  icon: WorkspaceLinkIcon;
}) {
  const accents: Record<typeof accent, string> = {
    emerald:
      "border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100 dark:border-emerald-500/15 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15",
    cyan: "border-cyan-100 bg-cyan-50 text-cyan-700 hover:border-cyan-200 hover:bg-cyan-100 dark:border-cyan-500/15 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/15",
    violet:
      "border-violet-100 bg-violet-50 text-violet-700 hover:border-violet-200 hover:bg-violet-100 dark:border-violet-500/15 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/15",
    amber:
      "border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-200 hover:bg-amber-100 dark:border-amber-500/15 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15",
    teal: "border-teal-100 bg-teal-50 text-teal-700 hover:border-teal-200 hover:bg-teal-100 dark:border-teal-500/15 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/15",
  };
  const accessibleLabel = `${title}. ${description}`;

  return (
    <Link
      href={href}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={[
        "grid h-12 w-12 place-items-center rounded-lg border shadow-sm shadow-zinc-950/5 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 sm:h-14 sm:w-14 dark:shadow-none dark:focus-visible:ring-emerald-300 dark:focus-visible:ring-offset-zinc-950",
        accents[accent],
      ].join(" ")}
    >
      <WorkspaceLinkIconView icon={icon} />
      <span className="sr-only">{title}</span>
    </Link>
  );
}

type WorkspaceLinkIcon = "regulations" | "training" | "chat" | "knowledge" | "tasks";

function WorkspaceLinkIconView({ icon }: { icon: WorkspaceLinkIcon }) {
  const common = {
    className: "h-5 w-5 sm:h-6 sm:w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (icon === "regulations") {
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="m9.5 13 1.5 1.5 3.5-4" />
        <path d="M9 18h6" />
      </svg>
    );
  }

  if (icon === "training") {
    return (
      <svg {...common}>
        <path d="m3 8 9-4 9 4-9 4z" />
        <path d="M7 10.5V15c0 1.6 2.2 3 5 3s5-1.4 5-3v-4.5" />
        <path d="M21 8v5" />
      </svg>
    );
  }

  if (icon === "chat") {
    return (
      <svg {...common}>
        <path d="M5 6.5h14a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2H9l-5 3v-3.5a2 2 0 0 1-1-1.7V8.5a2 2 0 0 1 2-2z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  if (icon === "knowledge") {
    return (
      <svg {...common}>
        <path d="M5 4.5h6.5A2.5 2.5 0 0 1 14 7v14a3 3 0 0 0-3-2.5H5z" />
        <path d="M19 4.5h-5.5A2.5 2.5 0 0 0 11 7v14a3 3 0 0 1 3-2.5h5z" />
        <path d="M8 8h3" />
        <path d="M15 8h2" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 4h14v17H5z" />
      <path d="m8 9 1.5 1.5L12 8" />
      <path d="M14 10h3" />
      <path d="m8 15 1.5 1.5L12 14" />
      <path d="M14 16h3" />
    </svg>
  );
}
