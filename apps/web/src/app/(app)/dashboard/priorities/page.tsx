import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantWorkspaceUser } from "@/lib/auth";
import { dashboardWorkspaceHref, getDefaultLandingPath } from "@/lib/landing";
import { getStaffPriorityItems } from "@/lib/staff-priorities";
import {
  staffPriorityKinds,
  staffPriorityLabels,
  staffPriorityTarget,
  type StaffPriorityKind,
} from "@/lib/staff-priorities-types";

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
export default async function StaffPriorityDetailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireTenantWorkspaceUser();
  const landing = getDefaultLandingPath(user);
  if (landing !== dashboardWorkspaceHref) redirect(landing);
  const params = await searchParams;
  const kind = first(params.kind) as StaffPriorityKind;
  if (!staffPriorityKinds.includes(kind)) redirect("/dashboard");
  const storeIds = params.storeIds
    ? Array.isArray(params.storeIds)
      ? params.storeIds
      : [params.storeIds]
    : [];
  const back = new URLSearchParams();
  storeIds.forEach((id) => back.append("storeIds", id));
  let result;
  let error: string | null = null;
  try {
    result = await getStaffPriorityItems(storeIds, kind, first(params.cursor));
  } catch (failure) {
    error =
      failure instanceof Error
        ? failure.message
        : "Не удалось прочитать список.";
  }
  const next = new URLSearchParams(back);
  next.set("kind", kind);
  if (result?.page.nextCursor) next.set("cursor", result.page.nextCursor);
  return (
    <main className="min-h-screen bg-[var(--background)] p-4 text-[var(--foreground)] sm:p-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/dashboard?${back}`}
          className="inline-flex min-h-10 items-center font-semibold text-emerald-700 dark:text-emerald-300"
        >
          ← Сводка
        </Link>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">
          {staffPriorityLabels[kind]}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Текущие обязательства выбранных клубов. Список обновляется при
          открытии; финансовый период к нему не применяется.
        </p>
        {kind === "CHECKLISTS_REVIEW" ? (
          <p className="mt-2 text-sm">
            Чек-листы сданы и ожидают проверки после планового срока выполнения.
            Отдельный срок проверки не задан.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-[var(--surface-muted)] p-4"
          >
            {error}
          </p>
        ) : null}
        {result ? (
          <>
            <p className="mt-4 text-sm">
              {result.metric.state === "PARTIAL" ? "Не менее " : "Всего: "}
              {result.metric.value ?? "—"} ·{" "}
              {result.metric.unit === "EMPLOYEES"
                ? "сотрудников"
                : result.metric.unit === "TASKS"
                  ? "задач"
                  : "чек-листов"}
            </p>
            {result.metric.reason ? (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                {result.metric.reason}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {result.scope.includesNetworkAssignments
                ? "Включены общесетевые обязательства."
                : "Общесетевые обязательства исключены из выборки клубов."}
            </p>
            <div className="mt-5 divide-y divide-[var(--border-soft)] rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)]">
              {result.items.map((item) => {
                const href = staffPriorityTarget(item);
                return (
                  <article key={item.id} className="p-4 sm:p-5">
                    <h2 className="font-semibold break-words">{item.title}</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {item.store?.name ??
                        (item.employee
                          ? "Обязательства сотрудника в выбранной выборке"
                          : "Общесетевая задача")}
                      {item.employee && item.employee.name !== item.title
                        ? ` · ${item.employee.name ?? "Сотрудник"}`
                        : ""}
                    </p>
                    {item.dueAt ? (
                      <p className="mt-1 text-sm">
                        Срок:{" "}
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Asia/Yekaterinburg",
                        }).format(new Date(item.dueAt))}{" "}
                        (Екатеринбург)
                      </p>
                    ) : null}
                    {item.missingCourses?.length ? (
                      <ul className="mt-2 list-inside list-disc text-sm leading-6">
                        {item.missingCourses.map((course) => (
                          <li key={course.id}>{course.title}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.missingRegulations?.length ? (
                      <ul className="mt-2 list-inside list-disc text-sm leading-6">
                        {item.missingRegulations.map((regulation) => (
                          <li key={regulation.id}>
                            {regulation.title} · версия {regulation.version}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {href ? (
                      <Link
                        href={href}
                        prefetch={false}
                        className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        {item.target?.type === "REGULATION_CATALOG"
                          ? "Каталог регламентов"
                          : "Открыть"}{" "}
                        →
                      </Link>
                    ) : null}
                  </article>
                );
              })}
              {!result.items.length ? (
                <p className="p-5 text-sm">
                  {result.metric.state === "AVAILABLE"
                    ? first(params.cursor)
                      ? "В этой части списка записей больше нет."
                      : "Таких обязательств сейчас нет."
                    : "Полнота списка не подтверждена."}
                </p>
              ) : null}
            </div>
            {result.page.nextCursor ? (
              <Link
                href={`/dashboard/priorities?${next}`}
                prefetch={false}
                className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[var(--border-soft)] px-4 font-semibold"
              >
                Следующие {result.page.limit} →
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
