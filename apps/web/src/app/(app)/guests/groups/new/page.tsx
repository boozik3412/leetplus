import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { NewGuestGroupFlow } from "@/components/new-guest-group-flow";
import { requirePageAccess } from "@/lib/auth";
import { getGuestFilterOptions } from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Only a path inside the cabinet may be a return target. */
function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

export default async function NewGuestGroupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePageAccess("/guests/groups/new");
  const params = await searchParams;
  const returnTo = safeReturnTo(first(params.returnTo));
  const stores = await getGuestFilterOptions()
    .then((options) =>
      options.stores.map((store) => ({ id: store.id, name: store.name })),
    )
    .catch(() => []);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <ReportBreadcrumbs
          current="Новая группа"
          items={[{ href: "/guests?tab=groups", label: "Группы гостей" }]}
        />
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Новая группа гостей
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Группа — это список гостей, которым вы хотите что-то предложить:
          вернуть, поблагодарить, позвать на турнир. Несколько коротких шагов, и
          её можно выбрать в кампании.
        </p>
        <div className="mt-6">
          <NewGuestGroupFlow
            stores={stores}
            defaultStoreId={first(params.storeId) ?? ""}
            returnTo={returnTo}
          />
        </div>
      </div>
    </main>
  );
}
