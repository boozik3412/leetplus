import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffChecklistExecutionReport,
  type StaffChecklistExecutionGroup,
  type StaffChecklistExecutionReportFilters,
  type StaffChecklistExecutionRun,
  type StaffChecklistFilterStatus,
  type StaffChecklistShiftKind,
  type StaffChecklistStatus,
} from "@/lib/staff-checklists";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffChecklistFilterStatus, string> = {
  all: "Все статусы",
  OPEN: "Новые",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Приняты",
  RETURNED: "Возвращены",
  CANCELED: "Отменены",
  OVERDUE: "Просрочены",
};

const runStatusLabels: Record<StaffChecklistStatus, string> = {
  OPEN: "Новый",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Принят",
  RETURNED: "Возвращен",
  CANCELED: "Отменен",
};

const shiftKindLabels: Record<StaffChecklistShiftKind | "all", string> = {
  all: "Все типы",
  OPENING: "Открытие",
  CLOSING: "Закрытие",
  CASH: "Касса",
  BAR: "Бар",
  PC_ZONE: "PC-зона",
  CLEANLINESS: "Чистота",
  INCIDENT: "Инцидент",
  INVENTORY: "Передача ТМЦ",
  CUSTOM: "Другое",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffChecklistFilterStatus {
  return (
    value === "all" ||
    value === "OPEN" ||
    value === "IN_PROGRESS" ||
    value === "ON_REVIEW" ||
    value === "ACCEPTED" ||
    value === "RETURNED" ||
    value === "CANCELED" ||
    value === "OVERDUE"
  );
}

function isShiftKind(
  value: string | undefined,
): value is StaffChecklistShiftKind | "all" {
  return (
    value === "all" ||
    value === "OPENING" ||
    value === "CLOSING" ||
    value === "CASH" ||
    value === "BAR" ||
    value === "PC_ZONE" ||
    value === "CLEANLINESS" ||
    value === "INCIDENT" ||
    value === "INVENTORY" ||
    value === "CUSTOM"
  );
}

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffChecklistExecutionReportFilters {
  const status = searchParam(params.status);
  const shiftKind = searchParam(params.shiftKind);

  return {
    status: isStatus(status) ? status : "all",
    shiftKind: isShiftKind(shiftKind) ? shiftKind : "all",
    storeId: searchParam(params.storeId),
    assignedToUserId: searchParam(params.assignedToUserId),
    search: searchParam(params.search)?.trim(),
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: StaffChecklistStatus, overdue: number) {
  const base = "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold";

  if (overdue > 0) {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  if (status === "ACCEPTED") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "ON_REVIEW") {
    return `${base} bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200`;
  }

  if (status === "RETURNED") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300`;
}

export default async function StaffChecklistExecutionReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffChecklistExecutionReport(filters);
  const summaryCards = [
    { label: "Выполнений", value: report.summary.total },
    { label: "Принято", value: report.summary.accepted },
    { label: "Просрочено", value: report.summary.overdue },
    { label: "Проблемных пунктов", value: report.summary.failedItems },
    { label: "Средняя оценка", value: `${report.summary.scorePercent}%` },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Отчет по чеклистам"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
            { href: "/staff/checklists", label: "Чеклисты смены" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Отчет по выполнению чеклистов
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Контроль выполнения по клубам, сменам, сотрудникам и конкретным
              чеклистам. В отчет попадают созданные выполнения регламентов и
              шаблонов чеклистов.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/checklists"
              className="inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Открыть выполнения
            </Link>
            <Link
              href="/staff/checklist-templates"
              className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              Шаблоны
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-semibold uppercase text-zinc-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {typeof card.value === "number"
                  ? formatNumber(card.value)
                  : card.value}
              </p>
            </div>
          ))}
        </section>

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                С даты
              </span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={report.filters.dateFrom ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                По дату
              </span>
              <input
                type="date"
                name="dateTo"
                defaultValue={report.filters.dateTo ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>

            <SelectField
              label="Статус"
              name="status"
              defaultValue={report.filters.status}
              options={statusLabels}
            />
            <SelectField
              label="Тип смены"
              name="shiftKind"
              defaultValue={report.filters.shiftKind}
              options={shiftKindLabels}
            />

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Все клубы</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Сотрудник
              </span>
              <select
                name="assignedToUserId"
                defaultValue={report.filters.assignedToUserId ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Все сотрудники</option>
                {report.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName ?? user.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Название чеклиста"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Применить
            </button>
          </div>
        </form>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <GroupTable title="По клубам" rows={report.byClub} />
          <GroupTable title="По сотрудникам" rows={report.byEmployee} />
          <GroupTable title="По чеклистам" rows={report.byChecklist} />
          <GroupTable title="По сменам" rows={report.byShift} />
        </div>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Выполнения
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Последние чеклисты в выборке
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Чеклист</th>
                  <th className="px-4 py-3 font-medium">Клуб / смена</th>
                  <th className="px-4 py-3 font-medium">Сотрудник</th>
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 text-right font-medium">Оценка</th>
                  <th className="px-4 py-3 text-right font-medium">Проблемы</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {report.runs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-zinc-500"
                    >
                      Выполнений по выбранным фильтрам пока нет.
                    </td>
                  </tr>
                ) : null}
                {report.runs.map((run) => (
                  <ExecutionRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Record<string, string>;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-zinc-500">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        {Object.entries(options).map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function GroupTable({
  title,
  rows,
}: {
  title: string;
  rows: StaffChecklistExecutionGroup[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Разрез</th>
              <th className="px-4 py-3 text-right font-medium">Всего</th>
              <th className="px-4 py-3 text-right font-medium">Принято</th>
              <th className="px-4 py-3 text-right font-medium">Проблемы</th>
              <th className="px-4 py-3 text-right font-medium">Оценка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-zinc-500"
                >
                  Нет данных в выбранном периоде.
                </td>
              </tr>
            ) : null}
            {rows.slice(0, 20).map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3">
                  <p className="font-medium">{row.label}</p>
                  {row.caption ? (
                    <p className="mt-1 text-xs text-zinc-500">{row.caption}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">{formatNumber(row.total)}</td>
                <td className="px-4 py-3 text-right">
                  {formatNumber(row.accepted)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={
                      row.failedItems > 0
                        ? "font-semibold text-red-600 dark:text-red-300"
                        : "text-zinc-500"
                    }
                  >
                    {formatNumber(row.failedItems)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{row.scorePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExecutionRow({ run }: { run: StaffChecklistExecutionRun }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          href={`/staff/checklists?search=${encodeURIComponent(run.title)}`}
          className="font-medium text-zinc-950 transition hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-300"
        >
          {run.title}
        </Link>
        <div className="mt-1 flex flex-wrap gap-2">
          <span className={statusClass(run.status, run.overdue)}>
            {run.overdue > 0 ? "Просрочен" : runStatusLabels[run.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">
            {run.checklist.type === "REGULATION"
              ? "регламент"
              : run.checklist.type === "TEMPLATE"
                ? "шаблон"
                : "разовый"}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <p>{run.store?.name ?? "Вся сеть / клуб не указан"}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {run.shift ? `Смена ${run.shift.externalShiftId}` : "смена не привязана"}
        </p>
      </td>
      <td className="px-4 py-3">
        {run.assignedToUser?.fullName ?? run.assignedToUser?.email ?? "не назначен"}
      </td>
      <td className="px-4 py-3">{formatDate(run.activityDate)}</td>
      <td className="px-4 py-3 text-right">
        {formatNumber(run.scoreEarned)}/{formatNumber(run.scoreTotal)}
        <p className="mt-1 text-xs text-zinc-500">{run.scorePercent}%</p>
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={
            run.failedItems > 0
              ? "font-semibold text-red-600 dark:text-red-300"
              : "text-zinc-500"
          }
        >
          {formatNumber(run.failedItems)}
        </span>
      </td>
    </tr>
  );
}
