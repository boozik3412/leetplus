import Link from "next/link";

const setupSteps = [
  {
    title: "Замените название сети",
    description: "Вместо временного названия «Сеть 1» укажите своё.",
    href: "/settings#network-profile",
    action: "Открыть настройки сети",
  },
  {
    title: "Проверьте первый клуб",
    description:
      "Замените «Компьютерный клуб 1» и проверьте город и часовой пояс Europe/Moscow.",
    href: "/stores",
    action: "Настроить клуб",
  },
  {
    title: "Подключите Langame",
    description:
      "Добавьте API-ключ и домены клубов. Ключ хранится зашифрованно и не показывается повторно.",
    href: "/settings#langame",
    action: "Подключить Langame",
  },
] as const;

export function TenantOnboardingNotice() {
  return (
    <section
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5 dark:border-amber-800 dark:bg-amber-950/30"
      aria-labelledby="tenant-onboarding-title"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Первичная настройка
      </p>
      <h1
        id="tenant-onboarding-title"
        className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50"
      >
        Заполните данные своей сети
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/80 dark:text-amber-100/80">
        Аккаунт уже создан, но названия и часовой пояс пока временные. Перед
        загрузкой рабочих данных выполните три шага.
      </p>

      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        {setupSteps.map((step, index) => (
          <li
            key={step.href}
            className="flex flex-col rounded-lg border border-amber-200 bg-white p-4 dark:border-amber-900 dark:bg-zinc-950"
          >
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {index + 1}. {step.title}
            </p>
            <p className="mt-2 flex-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {step.description}
            </p>
            <Link
              href={step.href}
              className="mt-4 inline-flex text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
