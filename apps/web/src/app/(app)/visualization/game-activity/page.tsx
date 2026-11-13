import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { fetchWithTimeout, getApiUrl, getAuthHeaders } from "@/lib/api";
import { ensurePageAccess, requireCurrentUser } from "@/lib/auth";
import {
  gameCompletionStatusLabel,
  gameCompletionStatusTone,
  gameCompletionTypeLabel,
  type GameCompletion,
  type GameCompletions,
} from "@/lib/game-completions";

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

type Loaded =
  | { ok: true; data: GameCompletions }
  | { ok: false; status: number | null };

// Rewards the club's guests got in the open shift. The API picks the period
// (the Langame shift, or today) the same way the game module block counts it.
async function loadCompletions(storeId: string): Promise<Loaded> {
  try {
    const response = await fetchWithTimeout(
      `${getApiUrl()}/stores/${encodeURIComponent(storeId)}/floor-plan/live/game-completions`,
      { cache: "no-store", headers: await getAuthHeaders() },
    );
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as GameCompletions };
  } catch {
    return { ok: false, status: null };
  }
}

function formatter(
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions,
) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      ...options,
      timeZone: timeZone ?? undefined,
    });
  } catch {
    return new Intl.DateTimeFormat("ru-RU", options);
  }
}

export default async function GameActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCurrentUser();
  ensurePageAccess(user, "/visualization/game-activity");
  const storeId = first((await searchParams).store) ?? "";
  const loaded = storeId ? await loadCompletions(storeId) : null;
  const data = loaded?.ok ? loaded.data : null;

  return (
    <main className="px-4 py-6 text-zinc-950 sm:px-6 sm:py-8 dark:text-zinc-50">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Выполнено за смену"
          items={[
            { href: "/dashboard", label: "Сводка" },
            {
              href: storeId
                ? `/visualization?store=${encodeURIComponent(storeId)}`
                : "/visualization",
              label: "Визуализация клубов",
            },
          ]}
        />
        {data ? (
          <Completions data={data} />
        ) : (
          <Failure
            storeId={storeId}
            status={loaded && !loaded.ok ? loaded.status : null}
          />
        )}
      </div>
    </main>
  );
}

function Completions({ data }: { data: GameCompletions }) {
  const date = formatter(data.timeZone, {
    day: "2-digit",
    month: "2-digit",
  });
  const time = formatter(data.timeZone, { hour: "2-digit", minute: "2-digit" });
  const since = new Date(data.since);
  const count = (kind: GameCompletion["kind"]) =>
    data.items.filter((item) => item.kind === kind).length;
  const showGuest = data.guestAccess === "AVAILABLE";

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {data.period === "SHIFT"
            ? "Выполнено за смену"
            : "Выполнено за сегодня"}
          {data.storeName ? ` · ${data.storeName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
          {data.period === "SHIFT" ? "Смена с " : "С "}
          {time.format(since)} {date.format(since)}
          {" · "}
          {data.items.length}{" "}
          {plural(data.items.length, "награда", "награды", "наград")}
          {": "}
          {count("MISSION")} за миссии, {count("CASE")} из кейсов
          {count("SEASON") ? `, ${count("SEASON")} за сезон` : ""}
          {count("MANUAL") ? `, ${count("MANUAL")} вручную` : ""}
        </p>
        {!showGuest ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Имена и телефоны гостей видны ролям с доступом к разделу «Гости».
          </p>
        ) : null}
        {data.truncated ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Показаны последние {data.items.length} наград смены.
          </p>
        ) : null}
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {data.period === "SHIFT" ? "В этой смене" : "Сегодня"} гости ещё не
          выполнили ни одной миссии и не открыли ни одного кейса.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
              <tr>
                <th className="px-4 py-3" scope="col">
                  Дата и время
                </th>
                {showGuest ? (
                  <th className="px-4 py-3" scope="col">
                    Гость
                  </th>
                ) : null}
                <th className="px-4 py-3" scope="col">
                  Тип задания
                </th>
                <th className="px-4 py-3" scope="col">
                  Задание
                </th>
                <th className="px-4 py-3" scope="col">
                  Награда
                </th>
                <th className="px-4 py-3" scope="col">
                  Статус награды
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const at = new Date(item.qualifiedAt);
                return (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-100 align-top dark:border-zinc-800"
                  >
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <span className="font-medium">{time.format(at)}</span>
                      <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                        {date.format(at)}
                      </span>
                    </td>
                    {showGuest ? (
                      <td className="px-4 py-3">
                        <GuestCell guest={item.guest} />
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {gameCompletionTypeLabel(item)}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <div className="font-medium">
                        {item.title ?? "Без задания"}
                      </div>
                      {item.description ? (
                        <div className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                          {item.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{item.reward.label}</td>
                    <td className="px-4 py-3">
                      <StatusChip item={item} time={time} date={date} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function GuestCell({ guest }: { guest: GameCompletion["guest"] }) {
  if (!guest) {
    return <span className="text-zinc-500 dark:text-zinc-400">Не указан</span>;
  }
  return (
    <>
      {guest.id ? (
        <Link
          className="font-medium text-zinc-950 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:text-zinc-50"
          href={`/guests/${encodeURIComponent(guest.id)}`}
        >
          {guest.name}
        </Link>
      ) : (
        <span className="font-medium">{guest.name}</span>
      )}
      <div className="mt-0.5 text-zinc-600 tabular-nums dark:text-zinc-400">
        {guest.phone ?? "нет телефона"}
      </div>
    </>
  );
}

const TONE_CLASSES = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  waiting:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  open: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
} as const;

function StatusChip({
  item,
  time,
  date,
}: {
  item: GameCompletion;
  time: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
}) {
  const tone = gameCompletionStatusTone(item.reward.status);
  const paidAt = item.reward.paidAt ? new Date(item.reward.paidAt) : null;
  const expiresAt = item.reward.expiresAt
    ? new Date(item.reward.expiresAt)
    : null;
  return (
    <>
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
      >
        {gameCompletionStatusLabel(item.reward)}
      </span>
      {paidAt ? (
        <div className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
          выдано {time.format(paidAt)} {date.format(paidAt)}
        </div>
      ) : expiresAt && item.reward.status !== "PAID" ? (
        <div className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
          забрать до {date.format(expiresAt)}
        </div>
      ) : null}
    </>
  );
}

function Failure({
  storeId,
  status,
}: {
  storeId: string;
  status: number | null;
}) {
  const text = !storeId
    ? "Откройте список из блока «Игровой модуль» на схеме клуба."
    : status === 403 || status === 404
      ? "Этот клуб недоступен вашей учётной записи."
      : "Не удалось загрузить выполненные активности. Обновите страницу через минуту.";
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h1 className="text-base font-semibold">Выполнено за смену</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
        {text}
      </p>
    </div>
  );
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
