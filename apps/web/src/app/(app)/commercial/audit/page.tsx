import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { ReportLoadingLink } from "@/components/report-loading-link";
import { requireCurrentUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";
import {
  buildMoneyLossReport,
  type DataGap,
  type LossPart,
  type LossPartKey,
} from "@/lib/money-loss-report";
import { can } from "@/lib/permissions";
import {
  getAssortmentMatrixReport,
  getOperationalReport,
  type ReportRecommendation,
} from "@/lib/reports";

const PERIOD_DAYS = 14;

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ₽`;
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match ? `${match[3]}.${match[2]}` : value;
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function daysCount(count: number) {
  return `${count} ${plural(count, "дня", "дней", "дней")}`;
}

function goodsCount(count: number) {
  return `${count} ${plural(count, "товар", "товара", "товаров")}`;
}

const PART_TONE: Record<LossPartKey, { bar: string; dot: string }> = {
  deficit: { bar: "bg-rose-500", dot: "bg-rose-500" },
  writeOffs: { bar: "bg-amber-500", dot: "bg-amber-500" },
  missingMandatory: { bar: "bg-sky-500", dot: "bg-sky-500" },
};

export default async function MoneyLossPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_reports")) {
    redirect(getDefaultLandingPath(user));
  }

  const filters = lastFullDaysRange(PERIOD_DAYS);
  const [operationalReport, matrixReport] = await Promise.all([
    getOperationalReport(filters),
    getAssortmentMatrixReport(filters),
  ]);

  const report = buildMoneyLossReport({
    outOfStockRows: operationalReport.outOfStockRiskProducts,
    noSalesRows: operationalReport.productsWithoutSales,
    writeOffAmount: operationalReport.writeOffAmount,
    recommendations: operationalReport.recommendations,
    matrixRows: matrixReport.rows,
    marginCoverage: operationalReport.marginCoverage,
    healthStates: [
      operationalReport.assortmentHealth?.outOfStock.state,
      operationalReport.assortmentHealth?.noSales[21].state,
    ],
  });
  const queueHref = `/reports/recommendations/table?${new URLSearchParams(
    filters,
  ).toString()}`;

  return (
    <main className="min-h-full bg-zinc-50 px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ReportBreadcrumbs
          current="Где теряем деньги"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/reports", label: "Отчёты" },
          ]}
        />

        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-3xl font-black tracking-normal text-zinc-950 dark:text-white">
              Где теряем деньги
            </h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
              Сколько сеть недополучила за {PERIOD_DAYS} дней, из чего это
              складывается и что сделать в первую очередь.
            </p>
          </div>
          <p className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {formatDateLabel(filters.from)} – {formatDateLabel(filters.to)}
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <LossCard total={report.totalLoss} parts={report.parts} />
          <FrozenCard
            amount={report.frozen.amount}
            skuCount={report.frozen.skuCount}
            unvaluedCount={report.frozen.unvaluedCount}
            noSalesDays={operationalReport.noSalesDays}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <ActionsCard
            actions={report.actions}
            effect={report.actionsEffect}
            queueHref={queueHref}
          />
          <GapsCard gaps={report.gaps} />
        </section>
      </div>
    </main>
  );
}

function LossCard({ total, parts }: { total: number; parts: LossPart[] }) {
  const barParts = parts.filter((part) => part.amount > 0);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        Теряем за {PERIOD_DAYS} дней
      </p>
      <p className="mt-1 text-4xl font-black tabular-nums tracking-normal text-rose-600 dark:text-rose-300">
        {formatMoney(total)}
      </p>

      {barParts.length > 0 ? (
        <div
          className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          aria-hidden
        >
          {barParts.map((part) => (
            <div
              key={part.key}
              className={PART_TONE[part.key].bar}
              style={{ width: `${(part.amount / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
        {parts.map((part) => (
          <li key={part.key} className="py-3">
            <LossPartRow part={part} total={total} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LossPartRow({ part, total }: { part: LossPart; total: number }) {
  const share =
    total > 0 && part.amount > 0 ? Math.round((part.amount / total) * 100) : 0;
  const notes: string[] = [];

  if (part.unvaluedCount > 0) {
    notes.push(`ещё ${goodsCount(part.unvaluedCount)} без оценки`);
  }
  if (part.estimate && part.amount > 0) {
    notes.push("оценка");
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 pt-0.5 text-sm font-semibold text-zinc-950 dark:text-white">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${PART_TONE[part.key].dot}`}
            aria-hidden
          />
          {part.label}
        </p>
        <div className="shrink-0 text-right">
          {part.unavailable ? (
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              не загружено
            </p>
          ) : (
            <p className="text-lg font-black tabular-nums text-zinc-950 dark:text-white">
              {formatMoney(part.amount)}
              {share > 0 ? (
                <span className="ml-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  {share}%
                </span>
              ) : null}
            </p>
          )}
          {notes.length > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {notes.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {part.hint}
      </p>
      <ReportLoadingLink
        href={part.href}
        className="inline-flex cursor-pointer items-center gap-1 rounded text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
      >
        Подробнее
        <ArrowRight
          size={14}
          aria-hidden
          className="ml-1 inline align-[-2px]"
        />
      </ReportLoadingLink>
    </div>
  );
}

function FrozenCard({
  amount,
  skuCount,
  unvaluedCount,
  noSalesDays,
}: {
  amount: number;
  skuCount: number;
  unvaluedCount: number;
  noSalesDays: number;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        Заморожено в остатке
      </p>
      <p className="mt-1 text-3xl font-black tabular-nums tracking-normal text-amber-600 dark:text-amber-300">
        {formatMoney(amount)}
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {skuCount > 0
          ? `Без продаж ${daysCount(noSalesDays)} и дольше: ${goodsCount(skuCount)}. Эти деньги не потеряны, их можно вернуть распродажей или возвратом поставщику.`
          : `Товаров без продаж ${daysCount(noSalesDays)} и дольше нет.`}
      </p>
      {unvaluedCount > 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Ещё {goodsCount(unvaluedCount)} без входящей цены не вошли в сумму.
        </p>
      ) : null}
      <ReportLoadingLink
        href="/products/stock-value?view=frozen"
        className="mt-auto inline-flex cursor-pointer items-center gap-1 self-start rounded pt-4 text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
      >
        Открыть «Деньги в остатке»
        <ArrowRight
          size={14}
          aria-hidden
          className="ml-1 inline align-[-2px]"
        />
      </ReportLoadingLink>
    </section>
  );
}

function ActionsCard({
  actions,
  effect,
  queueHref,
}: {
  actions: ReportRecommendation[];
  effect: number;
  queueHref: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
          Что сделать в первую очередь
        </h2>
        {actions.length > 0 ? (
          <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            вернёт до {formatMoney(effect)}
          </p>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {actions.map((action, index) => (
            <li
              key={action.id}
              className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                  {action.title}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                  {action.storeName ?? "Вся сеть"} · {action.action}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatMoney(action.effectAmount)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          <CheckCircle size={18} aria-hidden className="text-emerald-600" />
          Срочных действий нет: всё, что нашли, уже в работе или сделано.
        </p>
      )}

      <ReportLoadingLink
        href={queueHref}
        className="mt-4 inline-flex cursor-pointer items-center gap-1 rounded text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
      >
        Вся очередь действий
        <ArrowRight
          size={14}
          aria-hidden
          className="ml-1 inline align-[-2px]"
        />
      </ReportLoadingLink>
    </section>
  );
}

function GapsCard({ gaps }: { gaps: DataGap[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
        Чтобы цифры были точнее
      </h2>
      {gaps.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {gaps.map((gap) => (
            <li key={gap.key} className="flex gap-3">
              <WarningCircle
                size={20}
                aria-hidden
                className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                  {gap.text}
                </p>
                <ReportLoadingLink
                  href={gap.href}
                  className="inline-flex cursor-pointer items-center gap-1 rounded text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
                >
                  {gap.actionLabel}
                  <ArrowRight
                    size={14}
                    aria-hidden
                    className="ml-1 inline align-[-2px]"
                  />
                </ReportLoadingLink>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <CheckCircle size={18} aria-hidden className="text-emerald-600" />
          Данных хватает: цены, обязательные товары и списания на месте.
        </p>
      )}
    </section>
  );
}
