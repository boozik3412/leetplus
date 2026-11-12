"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VisitRatingReport } from "@/lib/marketing";
import { visitRatingPeriods } from "@/lib/visit-rating-periods";

type Props = {
  report: VisitRatingReport;
  canManage: boolean;
};

type ApiError = { message?: string | string[] } | null;

const scores = ["5", "4", "3", "2", "1"] as const;

async function readError(response: Response) {
  if (response.status === 403) {
    return "Включать оценку визита может сотрудник с доступом ко всей сети клубов.";
  }
  const data = (await response.json().catch(() => null)) as ApiError;
  const message = Array.isArray(data?.message)
    ? data?.message.join(" ")
    : data?.message;
  return message || "Не удалось сохранить. Попробуйте ещё раз.";
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatAverage(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("ru-RU", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// «спросить 1 гостя», «спросить 5 гостей».
function guestsWord(count: number) {
  return count % 10 === 1 && count % 100 !== 11 ? "гостя" : "гостей";
}

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function scoreTone(score: number) {
  if (score <= 2) {
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  }
  if (score === 3) {
    return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
}

export function MarketingVisitRatingsPanel({ report, canManage }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { settings, totals } = report;

  async function setEnabled(enabled: boolean) {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const response = await fetch("/api/marketing/visit-ratings/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setConfirming(false);
      setNotice(
        enabled
          ? "Оценка визита включена. Первые вопросы уйдут гостям, чей визит закончится с этого момента."
          : "Оценка визита выключена. Новые вопросы гостям больше не отправляются.",
      );
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6">
      <section
        aria-labelledby="visit-rating-settings"
        className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="visit-rating-settings" className="text-base font-semibold">
            Вопрос после визита
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              settings.enabled
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {settings.enabled ? "Включён" : "Выключен"}
          </span>
        </div>
        <ul className="mt-3 grid gap-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <li>
            Бот спрашивает через {settings.delayMinutes} минут после конца
            сессии, если гость играл от {settings.minSessionMinutes} минут и не
            начал новую.
          </li>
          <li>
            Только с {settings.sendHours.from}:00 до {settings.sendHours.to}:00
            по времени клуба и не чаще раза в {settings.repeatDays} дней на
            гостя.
          </li>
          <li>
            Сотрудники, отписавшиеся и гости с пометкой «не связываться» вопрос
            не получают.
          </li>
          <li>
            После оценки 1–3 бот просит написать, что пошло не так. Ответ придёт
            в{" "}
            <Link
              href="/support"
              className="font-semibold text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
            >
              сообщения гостей
            </Link>
            .
          </li>
        </ul>
        <p className="mt-3 text-sm">
          Сейчас бот может спросить{" "}
          <span className="font-semibold tabular-nums">
            {formatNumber(report.reachableGuests)}
          </span>{" "}
          {guestsWord(report.reachableGuests)}: у них есть чат с ботом.
        </p>

        {canManage ? (
          settings.enabled ? (
            <button
              type="button"
              onClick={() => setEnabled(false)}
              disabled={pending}
              className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {pending ? "Выключаем..." : "Выключить вопрос"}
            </button>
          ) : confirming ? (
            <div className="mt-4 rounded-md border border-emerald-500 p-3">
              <p className="text-sm font-semibold">
                Включить? Бот будет спрашивать каждого гостя с чатом после
                визита во всех клубах сети.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEnabled(true)}
                  disabled={pending}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {pending ? "Включаем..." : "Да, включить"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              Включить вопрос после визита
            </button>
          )
        ) : (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Включает и выключает владелец или маркетолог с доступом ко всей
            сети.
          </p>
        )}
        {settings.enabled && settings.enabledAt ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Включён {formatDate(settings.enabledAt)}
            {settings.lastRunAt
              ? `; последняя проверка ${formatDate(settings.lastRunAt)}`
              : "; первая проверка в ближайшие минуты"}
            .
          </p>
        ) : null}
        <div aria-live="polite">
          {error ? (
            <p
              role="alert"
              className="mt-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
              {notice}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Визиты за {report.periodDays} дней
          {report.scope === "STORES" ? " в ваших клубах" : ""}
        </h2>
        <nav aria-label="Период" className="flex gap-1">
          {visitRatingPeriods.map((days) => {
            const active = days === report.periodDays;
            return (
              <Link
                key={days}
                href={`/marketing/visit-ratings?days=${days}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {days} дней
              </Link>
            );
          })}
        </nav>
      </div>

      {totals.asked === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {settings.enabled
            ? "За этот период бот ещё никого не спрашивал. Вопросы появятся, когда гости с чатом закончат визит."
            : "Оценок пока нет. Включите вопрос после визита, и здесь появятся оценки гостей по клубам."}
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Средняя оценка
              </dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {formatAverage(totals.average)}
                <span className="text-base font-normal text-zinc-500">
                  {" "}
                  из 5
                </span>
              </dd>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Ответили
              </dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {percent(totals.answered, totals.asked)}%
              </dd>
              <dd className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {formatNumber(totals.answered)} из {formatNumber(totals.asked)}{" "}
                спрошенных
              </dd>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Оценки 1–3
              </dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {formatNumber(totals.low)}
              </dd>
              <dd className="text-xs text-zinc-500 dark:text-zinc-400">
                гостям что-то не понравилось
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section
              aria-labelledby="visit-rating-distribution"
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h3
                id="visit-rating-distribution"
                className="text-sm font-semibold"
              >
                Как оценивают
              </h3>
              <ul className="mt-3 grid gap-2">
                {scores.map((score) => {
                  const count = totals.distribution[score];
                  const width = percent(count, totals.answered);
                  return (
                    <li
                      key={score}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm"
                    >
                      <span className="font-semibold tabular-nums">
                        {score}
                      </span>
                      <span
                        className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-emerald-500"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        {formatNumber(count)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              aria-labelledby="visit-rating-stores"
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h3 id="visit-rating-stores" className="text-sm font-semibold">
                По клубам
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Сначала клубы с самой низкой средней оценкой.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        Клуб
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-right font-semibold"
                      >
                        Спросили
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-right font-semibold"
                      >
                        Ответили
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-right font-semibold"
                      >
                        Средняя
                      </th>
                      <th scope="col" className="py-2 text-right font-semibold">
                        Оценки 1–3
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stores.map((store) => (
                      <tr
                        key={store.storeId}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                      >
                        <td className="py-2 pr-3">{store.storeName}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatNumber(store.asked)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatNumber(store.answered)}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                          {formatAverage(store.average)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatNumber(store.low)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section
            aria-labelledby="visit-rating-low"
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 id="visit-rating-low" className="text-sm font-semibold">
              Кому не понравилось
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Последние оценки 1–3. Что именно не так, гость мог написать в{" "}
              <Link
                href="/support"
                className="font-semibold text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
              >
                сообщениях гостей
              </Link>
              .
            </p>
            {report.recentLow.length ? (
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
                {report.recentLow.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span
                      className={`inline-flex min-w-16 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${scoreTone(row.score)}`}
                    >
                      Оценка {row.score}
                    </span>
                    {row.guestId ? (
                      <Link
                        href={`/guests/${row.guestId}`}
                        className="min-w-0 font-semibold text-zinc-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-100"
                      >
                        {row.guestName ?? "Гость"}
                      </Link>
                    ) : (
                      <span className="min-w-0 font-semibold">
                        {row.guestName ?? "Гость"}
                      </span>
                    )}
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {row.storeName ?? "Клуб удалён"}
                    </span>
                    <span className="text-zinc-500 tabular-nums dark:text-zinc-400 sm:ml-auto">
                      {formatDate(row.answeredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                За этот период низких оценок нет.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
