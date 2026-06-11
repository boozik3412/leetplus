import { redirect } from "next/navigation";
import { StaffShiftReportEditor } from "@/components/staff-shift-report-editor";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStaffShiftReportDraft } from "@/lib/staff-shift-reports";

export default async function NewStaffShiftReportPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_staff_shift_workspace")) {
    redirect("/dashboard");
  }

  const draft = await getStaffShiftReportDraft();

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
          <StaffShiftReportEditor draft={draft} />
        </section>
      </div>
    </main>
  );
}
