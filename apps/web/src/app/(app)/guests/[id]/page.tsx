import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { GuestCrmForm, crmStatusLabel } from "@/components/guest-crm-form";
import { getGuest, type GuestDetail, type GuestSegment } from "@/lib/guests";

type PageParams = Promise<{ id: string }>;

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRubles(value: number | null) {
  return `${formatNumber(value ?? 0)} руб`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function segmentLabel(segment: GuestSegment) {
  const labels: Record<GuestSegment, string> = {
    active: "Активный",
    new: "Новый",
    repeat: "Повторный",
    risk: "В риске",
    lost: "Потерянный",
    quiet: "Тихий",
  };

  return labels[segment];
}

export default async function GuestPage({ params }: { params: PageParams }) {
  await requireCurrentUser();
  const { id } = await params;
  const guest = await getGuest(id).catch(() => null);

  if (!guest) {
    notFound();
  }

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/guests"
          className="text-sm font-medium text-zinc-500 hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          Назад к гостям
        </Link>

        <section className="mt-4 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
            <div>
              <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                Карточка гостя
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {guest.displayName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge>{segmentLabel(guest.segment)}</Badge>
                <Badge>{guest.guestGroupName ?? "группа не определена"}</Badge>
                <Badge>{guest.externalDomain ?? "источник не определен"}</Badge>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                ФИО и телефон показываются полностью для авторизованных
                пользователей. Документы гостя в интерфейсе не показываются.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dl className="grid gap-3 text-sm">
                <Info label="Контакт" value={guest.contact} />
                <Info label="Внешний ID" value={guest.externalGuestId} />
                <Info
                  label="Регистрация"
                  value={formatDate(guest.insertedAt)}
                />
                <Info
                  label="Последняя активность"
                  value={formatDate(guest.lastActivityAt)}
                />
              </dl>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Сессии"
            value={formatNumber(guest.sessionsCount)}
            caption={`${formatNumber(guest.playHours, 1)} часов игры`}
          />
          <Metric
            label="Активных дней"
            value={formatNumber(guest.visitsDays)}
            caption="в выбранном foundation-окне"
          />
          <Metric
            label="Деньги"
            value={formatRubles(guest.transactionAmount + guest.barRevenue)}
            caption={`бар ${formatRubles(guest.barRevenue)}`}
          />
          <Metric
            label="Накопленные часы"
            value={
              guest.currentCountHours === null
                ? "нет данных"
                : `${formatNumber(guest.currentCountHours, 1)} ч`
            }
            caption="поле LAngame current_count_hours"
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <GuestCrmForm guest={guest} />
          <CrmHistoryPanel guest={guest} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <SessionsPanel guest={guest} />
          <TransactionsPanel guest={guest} />
        </section>

        <SalesPanel guest={guest} />
      </div>
    </main>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-500">{caption}</p>
    </div>
  );
}

function CrmHistoryPanel({ guest }: { guest: GuestDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">История CRM</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Последние ручные изменения по гостю.
        </p>
      </div>
      {guest.crmEvents.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {guest.crmEvents.map((event) => (
            <div key={event.id} className="px-5 py-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{crmStatusLabel(event.status)}</p>
                  {event.nextAction ? (
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {event.nextAction}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-right text-xs text-zinc-500">
                  {formatDateTime(event.createdAt)}
                </p>
              </div>
              {event.nextContactAt ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Контакт: {formatDate(event.nextContactAt)}
                </p>
              ) : null}
              {event.note ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                  {event.note}
                </p>
              ) : null}
              {event.createdBy ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Изменил: {event.createdBy}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">CRM-истории пока нет.</p>
      )}
    </section>
  );
}

function SessionsPanel({ guest }: { guest: GuestDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Последние сессии</h2>
      </div>
      {guest.sessions.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {guest.sessions.map((session) => (
            <div key={session.id} className="grid gap-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {formatDateTime(session.startedAt)}
                </span>
                <span className="tabular-nums text-zinc-500">
                  {session.durationMinutes === null
                    ? "нет длительности"
                    : `${formatNumber(session.durationMinutes)} мин`}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {session.storeName ??
                  session.externalDomain ??
                  "клуб не определен"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Сессий пока нет.</p>
      )}
    </section>
  );
}

function TransactionsPanel({ guest }: { guest: GuestDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Денежные операции</h2>
      </div>
      {guest.transactions.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {guest.transactions.map((transaction) => (
            <div key={transaction.id} className="grid gap-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {formatDateTime(transaction.happenedAt)}
                </span>
                <span className="tabular-nums">
                  {formatRubles(transaction.amount)}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {transaction.type ?? "тип не определен"} ·{" "}
                {transaction.storeName ??
                  transaction.externalDomain ??
                  "клуб не определен"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Денежных операций пока нет.
        </p>
      )}
    </section>
  );
}

function SalesPanel({ guest }: { guest: GuestDetail }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Покупки бара</h2>
      </div>
      {guest.sales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Дата</th>
                <th className="px-4 py-3 text-left font-semibold">Товар</th>
                <th className="px-4 py-3 text-left font-semibold">Клуб</th>
                <th className="px-4 py-3 text-right font-semibold">Шт</th>
                <th className="px-4 py-3 text-right font-semibold">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {guest.sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="px-4 py-3">{formatDate(sale.saleDate)}</td>
                  <td className="px-4 py-3 font-medium">{sale.productName}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {sale.storeName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(sale.quantity, 1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(sale.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Связанных покупок бара пока нет.
        </p>
      )}
    </section>
  );
}
