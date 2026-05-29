import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";

const demoMetrics = [
  {
    label: "Выручка сети",
    value: "4,8 млн руб",
    note: "+11,7% к прошлому месяцу",
    tone: "emerald",
  },
  {
    label: "Деньги в риске",
    value: "684 тыс. руб",
    note: "дефицит и замороженный запас",
    tone: "rose",
  },
  {
    label: "Потенциал действий",
    value: "312 тыс. руб",
    note: "оцененный эффект первых задач",
    tone: "sky",
  },
  {
    label: "Повторные визиты",
    value: "42%",
    note: "+6 п.п. после CRM-контактов",
    tone: "amber",
  },
];

const storySteps = [
  {
    title: "Сигнал",
    text: "Система показывает коммерческую проблему языком денег: где теряем прибыль, гостей или загрузку.",
  },
  {
    title: "Сценарий",
    text: "Пользователь открывает рабочий маршрут: гости, ассортимент, маркетинг или персонал.",
  },
  {
    title: "Действие",
    text: "LeetPlus переводит сигнал в задачу, кампанию, промо-набор или отчет для ответственного.",
  },
  {
    title: "Эффект",
    text: "Результат возвращается в витрину: выручка, маржа, визиты, бар, загрузка и качество исполнения.",
  },
];

const scenarioRows = [
  {
    area: "Гости и CRM",
    signal: "1 460 гостей в риске, VIP без визитов 21 день",
    action: "Сохранить группу, назначить контакт и запустить кампанию",
    effect: "+96 возвратов, 214 тыс. руб выручки",
  },
  {
    area: "Ассортимент",
    signal: "OOS по топ-SKU и 410 тыс. руб в медленном запасе",
    action: "Разобрать дефицит, пополнение и замороженные позиции",
    effect: "минус 18% OOS, 136 тыс. руб высвобождено",
  },
  {
    area: "Маркетинг",
    signal: "Слабая загрузка до 16:00 и низкая доля бара",
    action: "Собрать промо-набор и привязать к группе гостей",
    effect: "+7,4% загрузки, +82 тыс. руб бара",
  },
  {
    area: "Персонал",
    signal: "Длинные смены, возвраты и низкий средний чек",
    action: "Открыть администраторов, смены и операции",
    effect: "контроль риска по сменам и кассе",
  },
];

const demoClubs = [
  ["Центральный клуб", "1,9 млн руб", "68%", "182 тыс. руб"],
  ["Северный клуб", "1,3 млн руб", "54%", "141 тыс. руб"],
  ["Южный клуб", "930 тыс. руб", "49%", "226 тыс. руб"],
  ["Арена", "710 тыс. руб", "61%", "135 тыс. руб"],
];

export default async function CommercialDemoPage() {
  await requireCurrentUser();

  return (
    <main className="min-h-full bg-zinc-50 px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard" className="transition hover:text-emerald-500">
            Дашборд
          </Link>
          <span>/</span>
          <span>Управление</span>
          <span>/</span>
          <span className="text-zinc-800 dark:text-zinc-200">
            Демо-режим
          </span>
        </div>

        <section className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Коммерческая витрина
            </p>
            <h1 className="text-3xl font-black tracking-normal text-zinc-950 dark:text-white sm:text-4xl">
              Демо-режим без подключения Langame
            </h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
              Подготовленный набор данных показывает ценность LeetPlus до
              настройки API: управленческий сигнал, рабочий сценарий, действие
              и измеримый эффект.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Данные демонстрационные, синхронизация не нужна
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {demoMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                история продажи
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                От сигнала к эффекту
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Демо-режим нужен для первого показа продукта, когда у клиента
                еще нет подключенных источников Langame.
              </p>
            </div>
            <div className="mt-5 grid gap-3">
              {storySteps.map((step, index) => (
                <div
                  key={step.title}
                  className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950 text-sm font-bold text-white dark:bg-emerald-400 dark:text-zinc-950">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-950 dark:text-white">
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {step.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                сценарии сети
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                Что видит владелец
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Один экран связывает гостей, ассортимент, маркетинг и персонал
                в понятные управленческие маршруты.
              </p>
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="hidden grid-cols-[0.8fr_1.2fr_1.2fr_0.9fr] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/70 md:grid">
                <span>Блок</span>
                <span>Сигнал</span>
                <span>Действие</span>
                <span>Эффект</span>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {scenarioRows.map((row) => (
                  <div
                    key={row.area}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[0.8fr_1.2fr_1.2fr_0.9fr] md:gap-4"
                  >
                    <p className="font-bold text-zinc-950 dark:text-white">
                      {row.area}
                    </p>
                    <p className="leading-6 text-zinc-600 dark:text-zinc-300">
                      {row.signal}
                    </p>
                    <p className="leading-6 text-zinc-600 dark:text-zinc-300">
                      {row.action}
                    </p>
                    <p className="font-semibold leading-6 text-emerald-700 dark:text-emerald-300">
                      {row.effect}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                демо-сеть
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                Клубы и коммерческий фокус
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Показ строится не на сырых таблицах, а на сравнении клубов и
                управленческих действиях.
              </p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {demoClubs.map(([club, revenue, load, risk]) => (
                <div
                  key={club}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
                >
                  <p className="text-sm font-bold text-zinc-950 dark:text-white">
                    {club}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Выручка
                      </dt>
                      <dd className="mt-1 font-semibold">{revenue}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Загрузка
                      </dt>
                      <dd className="mt-1 font-semibold">{load}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Риск
                      </dt>
                      <dd className="mt-1 font-semibold text-rose-600 dark:text-rose-300">
                        {risk}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                следующий шаг
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                После демо
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Когда клиент готов, демонстрационные данные заменяются
                реальной синхронизацией Langame, а ценность проверяется на
                коммерческом аудите.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/commercial/audit"
                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-bold text-zinc-950 transition hover:bg-emerald-400"
              >
                Открыть аудит на реальных данных
              </Link>
              <Link
                href="/commercial/tariffs"
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
              >
                Посмотреть тарифные уровни
              </Link>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  const toneClass =
    {
      emerald: "text-emerald-600 dark:text-emerald-300",
      rose: "text-rose-600 dark:text-rose-300",
      sky: "text-sky-600 dark:text-sky-300",
      amber: "text-amber-600 dark:text-amber-300",
    }[tone] ?? "text-zinc-950 dark:text-white";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-black tracking-normal ${toneClass}`}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {note}
      </p>
    </div>
  );
}
