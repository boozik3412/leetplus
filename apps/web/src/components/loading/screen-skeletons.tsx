import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { LoaderMark } from "./loader-mark";
import { LoadingRegion } from "./loading-region";
import { Sk, SkCard } from "./skeleton";

const SOURCE_DOTS = [0, 0.3, 0.6, 0.9, 1.2] as const;

/** Rows of a table: every cell is a shimmering bar, the wave runs downward. */
function SkTable({
  rows = 8,
  columns = 4,
  className = "",
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const template = {
    gridTemplateColumns: `1.6fr ${"1fr ".repeat(columns - 1).trim()}`,
  };
  return (
    <div className={`flex flex-col gap-3.5 ${className}`} aria-hidden="true">
      <div
        className="grid gap-3 border-b border-[var(--border-soft)] pb-3"
        style={template}
      >
        {Array.from({ length: columns }, (_, column) => (
          <Sk key={column} className="h-3 w-3/4" delay={column * 0.05} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid items-center gap-3" style={template}>
          {Array.from({ length: columns }, (_, column) => (
            <Sk
              key={column}
              className={`h-3 ${column === 0 ? "w-4/5" : "w-2/3"}`}
              delay={row * 0.08 + column * 0.04}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkKpis({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkCard key={index} className="flex flex-col gap-2.5 p-4">
          <Sk className="h-3 w-24" delay={index * 0.1} />
          <Sk className="h-7 w-28" delay={index * 0.1 + 0.05} />
          <Sk className="h-[11px] w-20" delay={index * 0.1 + 0.1} />
        </SkCard>
      ))}
    </div>
  );
}

function SkFilters({ widths }: { widths: readonly number[] }) {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {widths.map((width, index) => (
        <Sk
          key={index}
          className="h-10 rounded-xl"
          style={{ width }}
          delay={index * 0.1}
        />
      ))}
    </div>
  );
}

/** Loading state of «Рост продаж товаров» (/assortment/dashboard). */
export function AssortmentSkeleton() {
  return (
    <LoadingRegion label="Загружаем ассортимент.">
      <main className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <ReportBreadcrumbs
            current="Ассортимент"
            items={[{ href: "/dashboard", label: "Дашборд" }]}
          />
          <header className="mt-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Рост продаж товаров
                </h1>
                <Sk className="h-3.5 w-36" />
              </div>
              <Sk className="h-11 w-36 rounded-xl" delay={0.1} />
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-3 shadow-sm">
              <SkFilters widths={[150, 210, 170, 160, 110]} />
            </div>
          </header>

          <div className="mt-5 flex flex-col gap-5">
            <div
              aria-hidden="true"
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300"
            >
              Источники данных
              <span className="flex gap-2">
                {SOURCE_DOTS.map((delay) => (
                  <i
                    key={delay}
                    className="lp-dot"
                    style={{ ["--d" as string]: `${delay}s` }}
                  />
                ))}
              </span>
              <Sk className="h-3 w-56" />
            </div>
            <SkKpis count={4} />
            <div className="grid gap-5 xl:grid-cols-2">
              <SkCard className="flex flex-col gap-4 p-5">
                <Sk className="h-4 w-48" />
                <div className="lp-eq" aria-hidden="true">
                  {[60, 48, 70, 76, 66, 52, 72, 58].map((height, i) => (
                    <b
                      key={i}
                      style={{
                        height: `${height}%`,
                        ["--d" as string]: `${i * 0.12}s`,
                      }}
                    />
                  ))}
                </div>
              </SkCard>
              <SkCard className="flex flex-col gap-4 p-5">
                <Sk className="h-4 w-56" />
                <SkTable rows={6} columns={3} />
              </SkCard>
            </div>
          </div>

          <section className="mt-8 border-t border-[var(--border-soft)] pt-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
              Детализация
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Категории под выбранными фильтрами
            </h2>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <SkCard className="p-5">
                <SkTable rows={5} columns={3} />
              </SkCard>
              <SkCard className="p-5">
                <SkTable rows={5} columns={3} />
              </SkCard>
            </div>
          </section>
        </div>
      </main>
    </LoadingRegion>
  );
}

/** Loading state of the guest screens (/guests and its sub-screens). */
export function GuestsSkeleton() {
  return (
    <LoadingRegion label="Загружаем гостей.">
      <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Клиентская база
            </h1>
            <div className="mt-3 flex max-w-3xl flex-col gap-2">
              <Sk className="h-3.5 w-full" />
              <Sk className="h-3.5 w-2/3" delay={0.1} />
            </div>
          </header>
          <div className="mt-5 flex flex-col gap-5">
            <SkFilters widths={[150, 210, 170, 140]} />
            <SkKpis count={4} />
            <SkCard className="p-5">
              <div aria-hidden="true" className="flex flex-col gap-4">
                {Array.from({ length: 7 }, (_, row) => (
                  <div
                    key={row}
                    className="grid grid-cols-[38px_minmax(0,1fr)_64px] items-center gap-3"
                  >
                    <Sk className="h-[38px] w-[38px] rounded-full" delay={row * 0.08} />
                    <div className="flex flex-col gap-1.5">
                      <Sk className="h-3 w-36" delay={row * 0.08 + 0.05} />
                      <Sk className="h-2.5 w-52" delay={row * 0.08 + 0.1} />
                    </div>
                    <Sk className="h-3 w-full" delay={row * 0.08 + 0.1} />
                  </div>
                ))}
              </div>
            </SkCard>
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}

/** Loading state of report tables: a title, filters and a table. */
export function TableSkeleton({
  title = "Готовим отчёт",
  hint = "Собираем данные и строим таблицу.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <LoadingRegion label={`${title}.`}>
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-4">
            <LoaderMark size={44} bare />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {hint}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-5">
            <SkFilters widths={[130, 170, 150, 110]} />
            <SkCard className="p-5">
              <SkTable rows={10} columns={5} />
            </SkCard>
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}

/** Generic heavy page: title, filters, KPI row and a table. */
export function PageSkeleton({
  label = "Загружаем раздел.",
  kpis = 4,
}: {
  label?: string;
  kpis?: number;
}) {
  return (
    <LoadingRegion label={label}>
      <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2" aria-hidden="true">
            <Sk className="h-3 w-16" />
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <Sk className="h-3 w-24" delay={0.1} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Sk className="h-8 w-72 rounded-xl" />
            <Sk className="h-3.5 w-96" delay={0.1} />
          </div>
          <div className="mt-5 flex flex-col gap-5">
            <SkFilters widths={[150, 190, 160, 120]} />
            <SkKpis count={kpis} />
            <SkCard className="p-5">
              <SkTable rows={8} columns={4} />
            </SkCard>
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}

/** Loading state of a summary drill-down (clubs and days of one metric). */
export function DetailsSkeleton() {
  return (
    <LoadingRegion label="Открываем детализацию.">
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            ← Вернуться к сводке
          </p>
          <SkCard className="mt-5 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              Детализация · агрегаты по клубам и дням
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Sk className="h-8 w-2/3 rounded-xl" />
              <Sk className="h-3.5 w-1/2" delay={0.1} />
              <Sk className="mt-2 h-10 w-56 rounded-xl" delay={0.2} />
              <Sk className="h-3.5 w-3/4" delay={0.3} />
            </div>
          </SkCard>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <SkCard className="p-5">
              <h2 className="text-lg font-semibold">По клубам</h2>
              <SkTable className="mt-4" rows={4} columns={2} />
            </SkCard>
            <SkCard className="p-5">
              <h2 className="text-lg font-semibold">По дням</h2>
              <SkTable className="mt-4" rows={7} columns={2} />
            </SkCard>
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}
