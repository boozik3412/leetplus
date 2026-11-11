import { GuestMissionWizard } from "@/components/guest-mission-wizard";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getGuestAudiences } from "@/lib/guests";
import { getGuestGamificationWorkspace } from "@/lib/guest-gamification";
import { getMarketingPromoBundles } from "@/lib/marketing";
import { can } from "@/lib/permissions";
import { getStores } from "@/lib/stores";

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default async function GuestMissionWizardPage({
  searchParams,
}: {
  searchParams: Promise<{
    missionId?: string | string[];
    taskType?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const initialMissionId = Array.isArray(params.missionId)
    ? params.missionId[0]
    : params.missionId;
  const requestedTaskType = Array.isArray(params.taskType)
    ? params.taskType[0]
    : params.taskType;
  const initialTaskType =
    requestedTaskType === "CHECK_IN" ? "CHECK_IN" : undefined;
  const user = await requireCurrentUser();

  if (!can(user, "manage_guest_game_rules")) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ReportBreadcrumbs
            current={initialMissionId ? "Изменение задания" : "Новая механика"}
            items={[{ href: "/gamification", label: "Игровой модуль" }]}
          />
          <h1 className="mt-6 text-2xl font-black">Нет доступа</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Для создания и запуска игровых механик нужно право «Геймификация:
            правила».
          </p>
        </div>
      </main>
    );
  }

  const [workspace, audiences, stores, promoBundles] = await Promise.all([
    safeValue(getGuestGamificationWorkspace(), null),
    safeValue(getGuestAudiences(), []),
    safeValue(getStores(), []),
    safeValue(getMarketingPromoBundles(), []),
  ]);

  const lootBoxes =
    workspace?.lootBoxes.filter(
      (lootBox) =>
        lootBox.status === "ACTIVE" &&
        (lootBox.usageKind === "REWARD_TEMPLATE" ||
          lootBox.usageKind === "BOTH"),
    ) ?? [];

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <ReportBreadcrumbs
          current={initialMissionId ? "Изменение задания" : "Новая механика"}
          items={[{ href: "/gamification", label: "Игровой модуль" }]}
        />
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          {initialMissionId ? "Изменение задания" : "Новая механика"}
        </h1>
        <p className="mb-5 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Выберите шаблон или начните с чистого листа: что поощряем, какая
          награда, для кого и как гость это увидит. Предпросмотр показывает,
          как задание будет выглядеть у гостя.
        </p>
        <GuestMissionWizard
          stores={stores}
          audiences={audiences}
          lootBoxes={lootBoxes}
          initialMissionId={initialMissionId ?? null}
          initialTaskType={initialTaskType}
          promoBundles={promoBundles.filter(
            (bundle) => bundle.status === "ACTIVE",
          )}
        />
      </div>
    </main>
  );
}
