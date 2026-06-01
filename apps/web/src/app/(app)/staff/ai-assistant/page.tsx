import Link from "next/link";
import type { ReactNode } from "react";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffAiAssistantReport,
  type StaffAiActionDraft,
  type StaffAiAssistantFilters,
  type StaffAiChecklistDraft,
  type StaffAiInsight,
  type StaffAiInstructionDraft,
  type StaffAiTaskDecompositionDraft,
  type StaffAiWeakSpotRecommendation,
} from "@/lib/staff-ai-assistant";
import type { StaffOperationsRiskLevel } from "@/lib/staff-operations-dashboard";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const riskLabels: Record<StaffOperationsRiskLevel, string> = {
  LOW: "Норма",
  MEDIUM: "Внимание",
  HIGH: "Риск",
};

const actionLabels: Record<StaffAiActionDraft["actionType"], string> = {
  TASK: "Задача",
  CHECKLIST: "Чек-лист",
  KNOWLEDGE_MATERIAL: "Материал",
  TRAINING: "Обучение",
  RETEST: "Retest",
  REVIEW: "Разбор",
};

const recommendationLabels: Record<
  StaffAiWeakSpotRecommendation["recommendedAction"],
  string
> = {
  KNOWLEDGE_MATERIAL: "Создать материал",
  RETEST: "Назначить retest",
  FOLLOW_UP_TASK: "Поставить задачу",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(params: Awaited<SearchParams>): StaffAiAssistantFilters {
  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    userId: searchParam(params.userId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function riskClass(level: StaffOperationsRiskLevel) {
  if (level === "HIGH") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200";
  }

  if (level === "MEDIUM") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-200";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-500/10 dark:text-emerald-200";
}

export default async function StaffAiAssistantPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffAiAssistantReport(filters);
  const coverage = [
    { label: "Задачи", value: report.sourceCoverage.tasks },
    { label: "Чек-листы", value: report.sourceCoverage.checklists },
    { label: "Повторы", value: report.sourceCoverage.recurringIssues },
    { label: "Регламенты", value: report.sourceCoverage.regulations },
    { label: "База знаний", value: report.sourceCoverage.knowledgeMaterials },
    { label: "Обучение", value: report.sourceCoverage.trainingCourses },
    { label: "Аттестации", value: report.sourceCoverage.assessments },
    { label: "Нарушения", value: report.sourceCoverage.disciplineRecords },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="AI-помощник"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              AI-помощник персонала
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Черновики чек-листов, короткие инструкции, разбор слабых мест и
              недельная сводка руководителя. Ничего не публикуется и не
              назначается автоматически.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/operations-dashboard"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Дисциплина
            </Link>
            <Link
              href="/staff/knowledge-base"
              className="inline-flex h-10 items-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              База знаний
            </Link>
          </div>
        </header>

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                С даты
              </span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={report.filters.dateFrom}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                По дату
              </span>
              <input
                type="date"
                name="dateTo"
                defaultValue={report.filters.dateTo}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                Сотрудник
              </span>
              <select
                name="userId"
                defaultValue={report.filters.userId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все сотрудники</option>
                {report.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName ?? user.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm lg:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Поиск
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  name="search"
                  defaultValue={report.filters.search ?? ""}
                  placeholder="Регламент, чек-лист, слабое место"
                  className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                  Показать
                </button>
              </div>
            </label>
          </div>
        </form>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
          {coverage.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(item.value)}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <ManagerSummaryPanel
            generatedAt={report.generatedAt}
            summary={report.managerSummary}
          />
          <DataPolicyPanel notes={report.dataPolicy.notes} />
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <ChecklistDraftsPanel drafts={report.checklistDrafts} />
          <InstructionDraftsPanel drafts={report.shiftInstructionDrafts} />
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <WeakSpotsPanel rows={report.weakSpotRecommendations} />
          <TaskDecompositionsPanel rows={report.taskDecompositionDrafts} />
        </section>
      </div>
    </main>
  );
}

function ManagerSummaryPanel({
  generatedAt,
  summary,
}: {
  generatedAt: string;
  summary: Awaited<ReturnType<typeof getStaffAiAssistantReport>>["managerSummary"];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            {summary.periodLabel}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{summary.title}</h2>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">
          {formatDateTime(generatedAt)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InsightGroup title="Что хорошо" rows={summary.highlights} />
        <InsightGroup title="Что проверить" rows={summary.risks} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Рекомендуемые действия</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {summary.recommendedActions.map((action) => (
            <ActionDraftCard key={action.id} action={action} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DataPolicyPanel({ notes }: { notes: string[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Контроль публикации
      </p>
      <h2 className="mt-1 text-lg font-semibold">Без автодействий</h2>
      <div className="mt-4 space-y-3">
        {notes.map((note) => (
          <div
            key={note}
            className="rounded-lg border border-zinc-200 p-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
          >
            {note}
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightGroup({ title, rows }: { title: string; rows: StaffAiInsight[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <MaybeLink
            key={row.id}
            href={row.href}
            className="block rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{row.title}</p>
              <RiskPill level={row.tone} />
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {row.detail}
            </p>
          </MaybeLink>
        ))}
      </div>
    </div>
  );
}

function ActionDraftCard({ action }: { action: StaffAiActionDraft }) {
  return (
    <MaybeLink
      href={action.sourceHref}
      className="block rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{action.title}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-zinc-500">
            {actionLabels[action.actionType]}
          </p>
        </div>
        <RiskPill level={action.priority} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{action.detail}</p>
    </MaybeLink>
  );
}

function ChecklistDraftsPanel({ drafts }: { drafts: StaffAiChecklistDraft[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Черновики чек-листов</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Из регламентов
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {drafts.length > 0 ? (
          drafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{draft.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {draft.store?.name ?? "вся сеть"} · {draft.shiftKind} ·{" "}
                    {draft.sourceStatus}
                  </p>
                </div>
                <Link
                  href={draft.sourceHref}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Источник
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <Metric label="Разделы" value={draft.sectionsCount} />
                <Metric label="Пункты" value={draft.itemsCount} />
                <Metric label="Обяз." value={draft.requiredItems} />
                <Metric label="Доказ." value={draft.evidenceItems} />
              </div>
              <div className="mt-3 space-y-2">
                {draft.checklistItems.slice(0, 4).map((item) => (
                  <p key={`${draft.id}:${item.sectionTitle}:${item.title}`} className="text-xs leading-5 text-zinc-500">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {item.sectionTitle}:
                    </span>{" "}
                    {item.title}
                  </p>
                ))}
              </div>
              <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900/70">
                {draft.publicationGuard}
              </p>
            </div>
          ))
        ) : (
          <EmptyState text="Нет регламентов, из которых можно собрать черновик чек-листа по текущим фильтрам." />
        )}
      </div>
    </section>
  );
}

function InstructionDraftsPanel({
  drafts,
}: {
  drafts: StaffAiInstructionDraft[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Короткие инструкции смены</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Для briefing
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {drafts.length > 0 ? (
          drafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{draft.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {draft.store?.name ?? "вся сеть"} · {draft.shiftKind}
                  </p>
                </div>
                <Link
                  href={draft.sourceHref}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Регламент
                </Link>
              </div>
              <ol className="mt-3 space-y-2 text-xs leading-5 text-zinc-500">
                {draft.shortSteps.slice(0, 5).map((step, index) => (
                  <li key={`${draft.id}:step:${step}`} className="flex gap-2">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {draft.controlPoints.length > 0 ? (
                <div className="mt-3 rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/70">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    Контроль
                  </p>
                  <div className="mt-2 space-y-1">
                    {draft.controlPoints.slice(0, 3).map((point) => (
                      <p key={`${draft.id}:control:${point}`} className="text-xs leading-5 text-zinc-500">
                        {point}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState text="Нет регламентов с пунктами для короткой инструкции." />
        )}
      </div>
    </section>
  );
}

function WeakSpotsPanel({ rows }: { rows: StaffAiWeakSpotRecommendation[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Повторяющиеся слабые места</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Обучение и retest
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.scopeLabel}
                  </p>
                </div>
                <RiskPill level={row.priority} />
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">{row.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {recommendationLabels[row.recommendedAction]}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {row.occurrences} повторов
                </span>
              </div>
              <RelatedLinks
                title="Найденные материалы"
                links={[
                  ...row.matchedMaterials,
                  ...row.matchedCourses,
                  ...row.matchedAssessments,
                ]}
              />
              <Link
                href={row.sourceHref}
                className="mt-3 inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Открыть источник
              </Link>
            </div>
          ))
        ) : (
          <EmptyState text="Повторяющиеся провалы по выбранному периоду не найдены." />
        )}
      </div>
    </section>
  );
}

function TaskDecompositionsPanel({
  rows,
}: {
  rows: StaffAiTaskDecompositionDraft[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Декомпозиция задач</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Черновики
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Срок черновика: {row.dueInDays} дн.
                  </p>
                </div>
                <RiskPill level={row.priority} />
              </div>
              <div className="mt-3 space-y-2">
                {row.tasks.map((task) => (
                  <MaybeLink
                    key={`${row.id}:${task.title}`}
                    href={task.href}
                    className="block rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-600 transition hover:bg-emerald-50 dark:bg-zinc-900/70 dark:text-zinc-400 dark:hover:bg-emerald-500/10"
                  >
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {task.title}
                    </span>
                    <br />
                    {task.detail}
                  </MaybeLink>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Нет текущих рисков, из которых нужно собрать задачи." />
        )}
      </div>
    </section>
  );
}

function RelatedLinks({
  title,
  links,
}: {
  title: string;
  links: Array<{ id: string; title: string; href: string }>;
}) {
  if (links.length === 0) {
    return (
      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
        Подходящих материалов пока нет.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase text-zinc-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.slice(0, 4).map((link) => (
          <Link
            key={link.id}
            href={link.href}
            className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {link.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/70">
      <span className="block text-zinc-500">{label}</span>
      <span className="font-semibold">{formatNumber(value)}</span>
    </div>
  );
}

function RiskPill({ level }: { level: StaffOperationsRiskLevel }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase",
        riskClass(level),
      ].join(" ")}
    >
      {riskLabels[level]}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
      {text}
    </div>
  );
}

function MaybeLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: ReactNode;
}) {
  if (!href) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
