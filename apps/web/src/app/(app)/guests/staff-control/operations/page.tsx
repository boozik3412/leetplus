import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffOperations,
  getStaffControlFilterOptions,
  type StaffOperationKind,
  type StaffOperationsFilters,
  type StaffOperationSortKey,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const kindLabels: Record<StaffOperationKind | "all", string> = {
  all: "Все операции",
  refunds: "Возвраты и отмены",
  discounts: "Скидки и бонусы",
  cash: "Касса и деньги",
  guest: "Гости",
  service: "Смены и услуги",
  other: "Прочее",
};

const kindDescriptions: Record<StaffOperationKind, string> = {
  refunds: "Операции, которые могут требовать проверки возврата, отмены или сторно.",
  discounts: "Скидки, бонусы, промо и другие операции, влияющие на маржу.",
  cash: "Денежные движения: оплаты, пополнения, баланс и кассовые действия.",
  guest: "Действия с гостями и клиентскими профилями.",
  service: "Сервисные операции вокруг смен, сессий, тарифов и услуг.",
  other: "Типы операций, которые пока не попали в понятные категории.",
};

const sortLabels: Record<StaffOperationSortKey, string> = {
  amount: "Сумма",
  count: "Количество",
  lastSeen: "Последняя операция",
  type: "Тип операции",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatRubles(value: number) {
  return `${formatNumber(value)} руб`;
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function isKind(value: string | undefined): value is StaffOperationKind | "all" {
  return (
    value === "all" ||
    value === "refunds" ||
    value === "discounts" ||
    value === "cash" ||
    value === "guest" ||
    value === "service" ||
    value === "other"
  );
}

function isSortKey(value: string | undefined): value is StaffOperationSortKey {
  return (
    value === "amount" ||
    value === "count" ||
    value === "lastSeen" ||
    value === "type"
  );
}

function resolveFilters(params: Awaited<SearchParams>): StaffOperationsFilters {
  const kind = searchParam(params.kind);
  const sort = searchParam(params.sort);
  const direction = searchParam(params.direction);

  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    kind: isKind(kind) ? kind : "all",
    search: searchParam(params.search)?.trim(),
    sort: isSortKey(sort) ? sort : "amount",
    direction: direction === "asc" ? "asc" : "desc",
  };
}

function staffControlHref(report: {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
}) {
  const params = new URLSearchParams();
  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }

  return `/staff/staff-control?${params.toString()}`;
}

function operationsExportHref(report: {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  kind: StaffOperationKind | "all";
  search: string | null;
  sort: StaffOperationSortKey;
  direction: "asc" | "desc";
}) {
  const params = new URLSearchParams();
  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }
  params.set("kind", report.kind);
  params.set("sort", report.sort);
  params.set("direction", report.direction);
  if (report.search) {
    params.set("search", report.search);
  }

  return `/api/guests/staff-control/operations/export?${params.toString()}`;
}

function sortHref(
  report: {
    periodFrom: string;
    periodTo: string;
    storeId: string | null;
    kind: StaffOperationKind | "all";
    search: string | null;
    sort: StaffOperationSortKey;
    direction: "asc" | "desc";
  },
  sort: StaffOperationSortKey,
) {
  const params = new URLSearchParams();
  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }
  params.set("kind", report.kind);
  params.set("sort", sort);
  params.set(
    "direction",
    report.sort === sort && report.direction === "desc" ? "asc" : "desc",
  );
  if (report.search) {
    params.set("search", report.search);
  }

  return `/staff/staff-control/operations?${params.toString()}`;
}

export default async function StaffOperationsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const [report, options] = await Promise.all([
    getStaffOperations(filters),
    getStaffControlFilterOptions(),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Операционный журнал"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: staffControlHref(report), label: "Контроль персонала" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Операционный журнал
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Срез all_operations_log за период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}. Это контрольный слой для
              возвратов, отмен, скидок, бонусов и кассовых действий; привязки к
              конкретному администратору здесь пока нет.
            </p>
          </div>
          <Link
            href={operationsExportHref(report)}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-400/50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            CSV
          </Link>
          <Link
            href={staffControlHref(report)}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Назад в контроль персонала
          </Link>
        </header>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-12">
            <FilterInput
              label="С даты"
              name="dateFrom"
              type="date"
              defaultValue={report.periodFrom}
            />
            <FilterInput
              label="По дату"
              name="dateTo"
              type="date"
              defaultValue={report.periodTo}
            />
            <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.storeId ?? ""}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {options.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Категория
              </span>
              <select
                name="kind"
                defaultValue={report.kind}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Сортировка
              </span>
              <select
                name="sort"
                defaultValue={report.sort}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Направление
              </span>
              <select
                name="direction"
                defaultValue={report.direction}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm lg:col-span-10">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.search ?? ""}
                placeholder="тип операции, клуб, домен"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <button className="h-10 self-end rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 lg:col-span-2">
              Применить
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Операции"
            value={formatNumber(report.totalCount)}
            caption={kindLabels[report.kind]}
          />
          <SummaryCard
            label="Сумма"
            value={formatRubles(report.totalAmount)}
            caption="по выбранным операциям"
          />
          <SummaryCard
            label="Категорий"
            value={formatNumber(report.kindSummary.length)}
            caption="по смысловым группам"
          />
          <SummaryCard
            label="Типов операций"
            value={formatNumber(report.rows.length)}
            caption="после фильтров"
          />
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">Смысловые группы</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Быстрый способ понять, где искать управленческие риски.
            </p>
          </div>
          {report.kindSummary.length > 0 ? (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {report.kindSummary.map((row) => (
                <KindCard key={row.kind} row={row} report={report} />
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Операций за период не найдено.
            </p>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              Типы операций: {formatNumber(report.rows.length)}
            </h2>
          </div>
          {report.rows.length > 0 ? (
            <>
              <div className="grid gap-3 p-4 lg:hidden">
                {report.rows.map((row) => (
                  <OperationCard key={row.type} row={row} />
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full table-fixed divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[16%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        <SortLink report={report} sort="type" />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Категория
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <SortLink report={report} sort="count" />
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <SortLink report={report} sort="amount" />
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <SortLink report={report} sort="lastSeen" />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Источники
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {report.rows.map((row) => (
                      <tr key={row.type} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50">
                        <td className="px-4 py-4 align-top font-medium">
                          <span className="break-words">{row.type}</span>
                        </td>
                        <td className="px-4 py-4 align-top text-zinc-600 dark:text-zinc-300">
                          {kindLabels[row.kind]}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {formatNumber(row.count)}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {formatRubles(row.amount)}
                        </td>
                        <td className="px-4 py-4 text-right align-top text-zinc-600 dark:text-zinc-300">
                          {formatDateTime(row.lastSeenAt)}
                        </td>
                        <td className="px-4 py-4 align-top text-xs text-zinc-500">
                          <p className="truncate">
                            {row.storeNames.join(", ") || "вся сеть"}
                          </p>
                          <p className="mt-1 truncate">
                            {row.externalDomains.join(", ") || "источник"}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Операций по выбранным условиям не найдено.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{caption}</p>
    </div>
  );
}

function KindCard({
  row,
  report,
}: {
  row: { kind: StaffOperationKind; count: number; amount: number };
  report: {
    periodFrom: string;
    periodTo: string;
    storeId: string | null;
    search: string | null;
    sort: StaffOperationSortKey;
    direction: "asc" | "desc";
  };
}) {
  const params = new URLSearchParams();
  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }
  params.set("kind", row.kind);
  params.set("sort", report.sort);
  params.set("direction", report.direction);
  if (report.search) {
    params.set("search", report.search);
  }

  return (
    <Link
      href={`/staff/staff-control/operations?${params.toString()}`}
      className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
        {kindLabels[row.kind]}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatRubles(row.amount)}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {formatNumber(row.count)} операций
      </p>
      <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
        {kindDescriptions[row.kind]}
      </p>
    </Link>
  );
}

function OperationCard({
  row,
}: {
  row: {
    type: string;
    kind: StaffOperationKind;
    count: number;
    amount: number;
    lastSeenAt: string | null;
    storeNames: string[];
    externalDomains: string[];
  };
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-semibold">{row.type}</p>
          <p className="mt-1 text-sm text-zinc-500">{kindLabels[row.kind]}</p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          {formatRubles(row.amount)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-zinc-500">Количество</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {formatNumber(row.count)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-zinc-500">Последняя</dt>
          <dd className="mt-1 font-semibold">{formatDateTime(row.lastSeenAt)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-zinc-500">
        {row.storeNames.join(", ") || "вся сеть"} ·{" "}
        {row.externalDomains.join(", ") || "источник"}
      </p>
    </article>
  );
}

function SortLink({
  report,
  sort,
}: {
  report: Parameters<typeof sortHref>[0];
  sort: StaffOperationSortKey;
}) {
  const isActive = report.sort === sort;

  return (
    <Link
      href={sortHref(report, sort)}
      className="inline-flex items-center gap-1 text-zinc-600 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-300"
    >
      <span>{sortLabels[sort]}</span>
      <span className="text-[10px]">
        {isActive ? (report.direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </Link>
  );
}

function FilterInput({
  label,
  name,
  type,
  defaultValue,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
      <span className="text-xs font-medium uppercase text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
