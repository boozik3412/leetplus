import Link from "next/link";
import { redirect } from "next/navigation";
import { LegalEntityInfo } from "@/components/legal-entity-info";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getDefaultLandingPath(user));
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6">
          <p className="text-lg font-black">LeetPlus</p>
          <nav aria-label="Публичная навигация" className="flex gap-3">
            <Link
              className="flex min-h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 transition hover:bg-white"
              href="/play"
            >
              Квесты
            </Link>
            <Link
              className="flex min-h-10 items-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
              href="/login"
            >
              Войти
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-700">
              LeetPlus для компьютерных клубов
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              Управленческий контур для ассортимента, гостей и клубных квестов.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
              Сервис помогает сетям клубов работать с данными Langame,
              контролировать продажи, остатки, гостевую аналитику и игровые
              бонусы в одном рабочем интерфейсе.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="flex min-h-11 items-center rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700"
                href="/play"
              >
                Регистрация в квестах
              </Link>
              <Link
                className="flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100"
                href="/login"
              >
                Вход для команды
              </Link>
            </div>
          </div>

          <LegalEntityInfo />
        </div>
      </section>
    </main>
  );
}
