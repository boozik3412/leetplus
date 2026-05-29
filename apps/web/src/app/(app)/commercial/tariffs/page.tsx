import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";

const tariffLevels = [
  {
    name: "Базовая аналитика",
    audience: "Один клуб или сеть на старте контроля",
    promise: "Понять продажи, остатки, маржу и базовые риски без ручных Excel.",
    includes: [
      "дашборд сети и клубов",
      "товары, категории, поставщики и остатки",
      "базовые отчеты по продажам, OOS и no-sales",
      "ручная синхронизация Langame",
    ],
    upgrade: "Когда нужны управленческие отчеты, план-факт и поставщики.",
  },
  {
    name: "Расширенные отчеты",
    audience: "Сеть, где уже управляют ассортиментом по цифрам",
    promise: "Разбирать деньги в риске, оборачиваемость, план-факт и поставщиков.",
    includes: [
      "гибридный отчет денег в риске",
      "оборачиваемость и замороженный запас",
      "план-факт по сети, клубам, категориям и поставщикам",
      "карточка поставщика и экспорт отчетов",
    ],
    upgrade: "Когда отчеты должны превращаться в задачи и решения.",
  },
  {
    name: "Рекомендации",
    audience: "Коммерческий директор, закупщик и управляющие клубов",
    promise: "Получать очередь действий с ответственными ролями и эффектом.",
    includes: [
      "финансовый эффект рекомендаций",
      "workflow статусов: новая, в работе, выполнена, отклонена",
      "роли ответственных",
      "действия из отчетов и дашборда",
    ],
    upgrade: "Когда нужно регулярное управление без ежедневного ручного просмотра.",
  },
  {
    name: "Регулярные дайджесты",
    audience: "Собственник и руководители, которым нужен контроль по расписанию",
    promise: "Получать ежедневные и еженедельные письма без входа в систему.",
    includes: [
      "ежедневный email-дайджест",
      "еженедельный коммерческий отчет с XLSX",
      "API-side scheduler",
      "журнал запусков и защита от дублей",
    ],
    upgrade: "Когда нужна продаваемая витрина ценности и аудит сети.",
  },
  {
    name: "Ассортиментный аудит",
    audience: "Сеть, которая продает LeetPlus как управленческий контур",
    promise: "Показать потери, возможности роста и качество матрицы на одном экране.",
    includes: [
      "коммерческий аудит сети",
      "матрица обязательных SKU",
      "прямые переходы в отчеты",
      "демо-режим без подключения Langame",
    ],
    upgrade: "Дальше расширяется в персонал, CRM, маркетинг и операционный контроль.",
  },
];

const packagingRows = [
  ["Кому продаем", "владелец сети, коммерческий директор, управляющий"],
  ["Главный аргумент", "LeetPlus показывает деньги и следующий шаг, а не только таблицы"],
  ["Точка входа", "демо-режим или коммерческий аудит на реальных данных"],
  ["Критерий расширения", "появилась потребность в задачах, регулярном контроле или CRM"],
];

export default async function CommercialTariffsPage() {
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
            Тарифные уровни
          </span>
        </div>

        <section className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Коммерческая упаковка
            </p>
            <h1 className="text-3xl font-black tracking-normal text-zinc-950 dark:text-white sm:text-4xl">
              Тарифные уровни LeetPlus
            </h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
              Уровни показывают, как продукт растет от базовой аналитики к
              рекомендациям, регулярному контролю и ассортиментному аудиту.
              Цены можно добавить позже, сейчас фиксируем ценность пакетов.
            </p>
          </div>
          <Link
            href="/commercial/demo"
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-bold text-zinc-950 transition hover:bg-emerald-400"
          >
            Открыть демо-режим
          </Link>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          {tariffLevels.map((level, index) => (
            <article
              key={level.name}
              className="flex min-h-full flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Уровень {index + 1}
                </p>
                <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:border-zinc-800">
                  {index === 0 ? "старт" : "рост"}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-black tracking-normal text-zinc-950 dark:text-white">
                {level.name}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-zinc-700 dark:text-zinc-200">
                {level.audience}
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {level.promise}
              </p>
              <div className="mt-4 flex-1 space-y-2">
                {level.includes.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300"
                  >
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-200 pt-3 text-sm leading-6 text-zinc-500 dark:border-zinc-800">
                {level.upgrade}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                позиционирование
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                Как объяснять ценность
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Тарифы не должны выглядеть как список закрытых страниц. Каждый
                уровень добавляет новый управленческий контур.
              </p>
            </div>
            <div className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
              {packagingRows.map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-2 py-3 text-sm sm:grid-cols-[11rem_1fr]"
                >
                  <p className="font-bold text-zinc-950 dark:text-white">
                    {label}
                  </p>
                  <p className="leading-6 text-zinc-600 dark:text-zinc-300">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                маршрут продажи
              </p>
              <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
                От первого показа к подключению
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Коммерческая упаковка связывает демо, тариф и реальный аудит в
                один спокойный сценарий.
              </p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <StepCard
                title="Показать демо"
                text="Объяснить ценность без ожидания API-ключей и исторической синхронизации."
                href="/commercial/demo"
                action="Демо-режим"
              />
              <StepCard
                title="Выбрать уровень"
                text="Зафиксировать, какие рабочие контуры нужны клиенту сейчас."
                href="/commercial/tariffs"
                action="Тарифы"
              />
              <StepCard
                title="Проверить на данных"
                text="Подключить Langame и показать коммерческий аудит уже по сети клиента."
                href="/commercial/audit"
                action="Аудит"
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function StepCard({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex min-h-full flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <h3 className="text-base font-black tracking-normal text-zinc-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {text}
      </p>
      <Link
        href={href}
        className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-semibold text-zinc-900 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
      >
        {action}
      </Link>
    </div>
  );
}
