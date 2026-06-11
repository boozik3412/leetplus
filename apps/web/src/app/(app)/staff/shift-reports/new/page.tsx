import { redirect } from "next/navigation";
import Link from "next/link";
import { StaffShiftReportEditor } from "@/components/staff-shift-report-editor";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getStaffShiftReportDraft,
  type StaffShiftReportDraft,
} from "@/lib/staff-shift-reports";

export default async function NewStaffShiftReportPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_staff_shift_workspace")) {
    redirect("/dashboard");
  }

  let draft: StaffShiftReportDraft | null = null;
  let draftError: string | null = null;

  try {
    draft = await getStaffShiftReportDraft();
  } catch (error) {
    draftError =
      error instanceof Error
        ? error.message
        : "Не удалось сформировать черновик отчета.";
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 sm:py-8 dark:bg-[#090d12] dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Отчет по смене"
          items={[
            { href: "/staff", label: "Персонал" },
            { href: "/staff/shift-workspace", label: "Моя смена" },
          ]}
        />

        <header className="mt-3">
          <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Персонал
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Отчет по смене
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Проверьте текст, заполните недостающие финансовые поля и приложите
            дополнительные файлы перед отправкой в канал “Отчетность”.
          </p>
        </header>

        <section className="mt-6">
          {draft ? (
            <StaffShiftReportEditor draft={draft} />
          ) : (
            <ShiftReportDraftError message={draftError} />
          )}
        </section>
      </div>
    </main>
  );
}

function ShiftReportDraftError({ message }: { message: string | null }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="text-sm font-semibold uppercase tracking-wide">
        Черновик отчета не сформирован
      </p>
      <h2 className="mt-2 text-2xl font-semibold">
        Не удалось собрать данные смены
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6">
        Отчет не потерян: вернитесь на домашнюю страницу смены или повторите
        попытку. Если ошибка повторится, часть данных Langame или чек-листов
        требует проверки.
      </p>
      {message ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-zinc-950/50">
          {message}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/staff/shift-workspace"
          className="inline-flex h-10 items-center justify-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:border-amber-500 dark:border-amber-500/40 dark:bg-zinc-950 dark:text-amber-100"
        >
          Вернуться к смене
        </Link>
        <Link
          href="/staff/shift-reports/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Повторить
        </Link>
      </div>
    </div>
  );
}
