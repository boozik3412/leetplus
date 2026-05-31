import { PlatformAdministrationWorkspace } from "@/components/platform-administration-workspace";
import { getAdminOverview } from "@/lib/admin-overview";
import { requireCurrentUser } from "@/lib/auth";

export default async function PlatformAdministrationPage() {
  const user = await requireCurrentUser();

  if (!user.isPlatformAdmin) {
    return (
      <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Раздел администрирования платформы доступен только пользователю с
            правами администратора LeetPlus.
          </p>
        </div>
      </main>
    );
  }

  const overview = await getAdminOverview();

  return <PlatformAdministrationWorkspace overview={overview} />;
}
