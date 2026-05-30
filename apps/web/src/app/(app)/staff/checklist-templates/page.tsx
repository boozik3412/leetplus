import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffChecklistTemplateBuilder } from "@/components/staff-checklist-template-builder";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffChecklistTemplateReport,
  type StaffChecklistTemplateFilterStatus,
  type StaffChecklistTemplateFilters,
} from "@/lib/staff-checklist-templates";
import type { StaffChecklistShiftKind } from "@/lib/staff-checklists";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffChecklistTemplateFilterStatus, string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  ACTIVE: "Активные",
  ARCHIVED: "Архив",
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

function isStatus(
  value: string | undefined,
): value is StaffChecklistTemplateFilterStatus {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "ACTIVE" ||
    value === "ARCHIVED"
  );
}

function isShiftKind(value: string | undefined): value is StaffChecklistShiftKind | "all" {
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
): StaffChecklistTemplateFilters {
  const status = searchParam(params.status);
  const shiftKind = searchParam(params.shiftKind);

  return {
    status: isStatus(status) ? status : "all",
    shiftKind: isShiftKind(shiftKind) ? shiftKind : "all",
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffChecklistTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffChecklistTemplateReport(filters);
  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "Черновики", value: report.summary.draft },
    { label: "Пункты", value: report.summary.itemsCount },
    { label: "Доказательства", value: report.summary.evidenceItemsCount },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Шаблоны чеклистов"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Задачи персонала" },
            { href: "/staff/checklists", label: "Чеклисты смены" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Шаблоны чеклистов
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Соберите чеклист без привязки к конкретной смене: разделы, пункты,
              обязательность, доказательства и баллы. Активный шаблон можно
              выбрать при запуске чеклиста смены.
            </p>
          </div>
          <Link
            href="/staff/checklists"
            className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            Запуски чеклистов
          </Link>
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
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_2fr_auto]">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={report.filters.status}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Тип смены
              </span>
              <select
                name="shiftKind"
                defaultValue={report.filters.shiftKind}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(shiftKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
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
                placeholder="Название, описание или регламент"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>

            <div className="flex items-end">
              <button className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400">
                Показать
              </button>
            </div>
          </div>
        </form>

        <section className="mt-6">
          <StaffChecklistTemplateBuilder report={report} />
        </section>
      </div>
    </main>
  );
}
