import { DailyReportMessages } from "@/components/daily-report-messages";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getDailyReport } from "@/lib/daily-report";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = rawDate && DATE_INPUT.test(rawDate) ? rawDate : null;
  const preview = await getDailyReport(date ?? undefined);

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <ReportBreadcrumbs current="Отчёт за сутки" />
        <div>
          <p className="text-sm font-medium text-emerald-700">Отчёты</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Отчёт за сутки
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Сутки клуба идут с 09:00 до 09:00 по местному времени. Так отчёт
            будет приходить в Telegram каждое утро: касса и смены, админы,
            гости, бар и товары, которые закончились.
          </p>
          <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Сутки, закрытые утром
              <input
                type="date"
                name="date"
                defaultValue={date ?? preview.report.clubs[0]?.reportDate}
                className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Показать
            </button>
          </form>
        </div>

        {preview.report.clubs.length ? (
          <DailyReportMessages
            key={date ?? "latest"}
            initial={preview}
            date={date}
          />
        ) : (
          <p className="mt-6 text-sm text-zinc-600">
            Нет клубов, доступных для отчёта.
          </p>
        )}
      </div>
    </main>
  );
}
