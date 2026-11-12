import { MarketingVisitRatingsPanel } from "@/components/marketing-visit-ratings-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { getVisitRatingReport, type VisitRatingReport } from "@/lib/marketing";
import { can } from "@/lib/permissions";
import { visitRatingPeriods } from "@/lib/visit-rating-periods";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

export default async function MarketingVisitRatingsPage({
  searchParams,
}: PageProps) {
  const user = await requirePageAccess("/marketing/visit-ratings");
  const { days: daysParam } = await searchParams;
  const requested = Number(daysParam);
  const days = visitRatingPeriods.includes(
    requested as (typeof visitRatingPeriods)[number],
  )
    ? requested
    : 30;

  let report: VisitRatingReport | null = null;
  try {
    report = await getVisitRatingReport(days);
  } catch {
    report = null;
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Оценки визитов"
          items={[
            { href: "/dashboard", label: "Сводка" },
            { href: "/marketing", label: "Кампании" },
          ]}
        />
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Telegram-бот
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Оценки визитов
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          После визита бот спрашивает гостя, как ему было в клубе, от 1 до 5.
          Здесь средняя оценка по клубам и гости, которым не понравилось.
        </p>

        {report ? (
          <MarketingVisitRatingsPanel
            report={report}
            canManage={
              can(user, "manage_marketing") && user.accessScope === "NETWORK"
            }
          />
        ) : (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            Не удалось загрузить оценки. Обновите страницу; если ошибка
            повторится, напишите в поддержку.
          </div>
        )}
      </div>
    </main>
  );
}
