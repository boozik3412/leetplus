import { LoadingRegion } from "./loading-region";
import { Sk, SkCard } from "./skeleton";

const BAR_HEIGHTS = [58, 46, 66, 74, 70, 44, 68] as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
      {children}
    </span>
  );
}

function SkSignal({ delay }: { delay: number }) {
  return (
    <div className="grid grid-cols-[4px_minmax(0,1fr)] gap-3 rounded-xl bg-[var(--surface-muted)] py-3 pr-3">
      <Sk className="rounded-full" delay={delay} />
      <div className="flex min-w-0 flex-col gap-2">
        <Sk className="h-2.5 w-32" delay={delay} />
        <Sk className="h-3.5 w-60" delay={delay + 0.1} />
        <Sk className="h-[11px] w-11/12" delay={delay + 0.2} />
        <Sk className="mt-0.5 h-8 w-32 rounded-lg" delay={delay + 0.3} />
      </div>
    </div>
  );
}

function SkClub({ delay }: { delay: number }) {
  return (
    <SkCard className="flex min-w-0 flex-col gap-3.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <Sk className="h-3.5 w-32" delay={delay} />
        <Sk className="h-3 w-10" delay={delay} />
      </div>
      <div className="flex items-baseline gap-2.5">
        <Sk className="h-7 w-36" delay={delay} />
        <Sk className="h-3.5 w-14" delay={delay} />
      </div>
      <div className="grid gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        {["Визиты", "Покупок на визит", "Средний чек бара"].map((label, i) => (
          <div key={label} className="flex items-center justify-between gap-2">
            {label}
            <Sk className="h-3 w-20" delay={delay + i * 0.1} />
          </div>
        ))}
      </div>
      <Sk className="h-2.5 rounded-full" delay={delay} />
      <Sk className="h-[42px] rounded-xl" delay={delay + 0.2} />
    </SkCard>
  );
}

function SkRing({ delay }: { delay: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 96 96" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke="var(--lp-skeleton-base)"
          strokeWidth="10"
        />
        <circle
          className="lp-ring-fill"
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke="var(--lp-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ ["--d" as string]: `${delay}s` }}
        />
      </svg>
      <Sk className="h-2.5 w-16" delay={delay} />
    </div>
  );
}

/** Loading state of «Сводка сети»: the page's real layout, data as shimmer. */
export function SummarySkeleton() {
  return (
    <LoadingRegion label="Загружаем сводку сети.">
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Сводка сети
              </h1>
              <div className="mt-2 flex flex-col gap-2">
                <Sk className="h-3.5 w-[430px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <Sk className="h-12 rounded-2xl lg:h-10 lg:w-36 lg:rounded-xl" />
              <Sk
                className="h-12 rounded-2xl lg:h-10 lg:w-52 lg:rounded-xl"
                delay={0.1}
              />
            </div>
          </header>

          <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 xl:col-span-2 xl:row-start-1">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                {[190, 230, 210].map((width, index) => (
                  <span key={width} className="inline-flex items-center gap-2">
                    <i
                      className="lp-dot"
                      style={{ ["--d" as string]: `${index * 0.45}s` }}
                    />
                    <Sk className="h-3" style={{ width }} delay={index * 0.1} />
                  </span>
                ))}
                <span className="text-zinc-500 dark:text-zinc-400 lg:ml-auto">
                  Покупка — продажи одному гостю в одну минуту
                </span>
              </div>
            </div>

            <div className="min-w-0 xl:col-start-1 xl:row-start-2">
              <SkCard className="flex flex-col gap-5 p-5">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-end">
                  <div className="flex min-w-0 flex-col gap-2.5">
                    <h2 className="text-sm text-zinc-600 dark:text-zinc-300">
                      Выручка бара и товаров
                    </h2>
                    <Sk className="h-[52px] w-72 rounded-2xl" />
                    <Sk className="h-3.5 w-64" delay={0.1} />
                    <Sk className="h-3 w-[26rem]" delay={0.2} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <svg
                      viewBox="0 0 300 84"
                      className="h-20 w-full"
                      preserveAspectRatio="none"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 50 L48 44 L92 52 L136 36 L180 40 L224 34 L268 46 L296 40"
                        stroke="var(--lp-skeleton-shine)"
                        strokeWidth="2"
                        strokeDasharray="4 5"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        className="lp-spark"
                        d="M4 62 L48 54 L92 60 L136 42 L180 46 L224 30 L268 54 L296 24"
                        pathLength="100"
                        stroke="var(--lp-accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <Sk className="h-2.5 w-32 self-end" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {["Визиты", "Покупок в баре", "Средний чек бара"].map(
                    (label, i) => (
                      <div
                        key={label}
                        className="flex min-w-0 flex-col gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-3 sm:px-4"
                      >
                        <span className="text-xs leading-4 text-zinc-600 dark:text-zinc-300">
                          {label}
                        </span>
                        <Sk className="h-6 w-20" delay={i * 0.1} />
                        <Sk className="h-3 w-14" delay={i * 0.1 + 0.1} />
                      </div>
                    ),
                  )}
                </div>
              </SkCard>
            </div>

            <div className="min-w-0 xl:col-start-1 xl:row-start-3">
              <SkCard className="flex flex-col gap-5 p-5 sm:p-6">
                <div>
                  <h2 className="text-lg font-semibold">Дерево выручки</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Почему изменился бар: трафик × конверсия × чек
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-[repeat(3,minmax(0,1fr))_auto_minmax(0,1.15fr)] md:items-stretch">
                  {[
                    ["Трафик", "Визиты"],
                    ["Конверсия", "Покупок на визит"],
                    ["Чек", "Средний чек бара"],
                  ].map(([title, caption], i) => (
                    <div
                      key={title}
                      className="flex flex-col gap-2 rounded-2xl border border-[var(--border-soft)] p-4"
                    >
                      <Label>{title}</Label>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">
                        {caption}
                      </span>
                      <Sk className="h-7 w-24" delay={i * 0.1} />
                      <Sk className="h-[11px] w-32" delay={i * 0.1 + 0.1} />
                    </div>
                  ))}
                  <div
                    aria-hidden="true"
                    className="hidden items-center justify-center text-2xl text-zinc-400 md:flex"
                  >
                    =
                  </div>
                  <div className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-muted)] p-4">
                    <Label>Результат</Label>
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">
                      Бар по покупкам
                    </span>
                    <Sk className="h-7 w-32" delay={0.3} />
                    <Sk className="h-[11px] w-36" delay={0.4} />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">
                    Вклад каждого множителя в изменение, ₽
                  </span>
                  {[
                    ["Трафик", "w-[18%]"],
                    ["Конверсия", "w-[62%]"],
                    ["Чек", "w-[26%]"],
                  ].map(([label, width], i) => (
                    <div
                      key={label}
                      className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-3.5 text-sm"
                    >
                      <span>{label}</span>
                      <Sk className={`h-3.5 ${width}`} delay={i * 0.1} />
                      <Sk className="h-3 w-16 justify-self-end" delay={i * 0.1} />
                    </div>
                  ))}
                </div>
              </SkCard>
            </div>

            <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-2">
              <SkCard className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Требует внимания</h2>
                  <div className="flex gap-1.5">
                    <Sk className="h-6 w-16" />
                    <Sk className="h-6 w-[72px]" delay={0.1} />
                    <Sk className="h-6 w-14" delay={0.2} />
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {[0, 0.1, 0.2, 0.3].map((delay) => (
                    <SkSignal key={delay} delay={delay} />
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2.5 border-t border-[var(--border-soft)] pt-4">
                  <Sk className="h-3 w-80" />
                  <p className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                    <span aria-hidden="true" className="lp-spinner h-3.5 w-3.5" />
                    Проверяем персонал…
                  </p>
                </div>
              </SkCard>
            </div>

            <div className="min-w-0 xl:col-span-2 xl:row-start-4">
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">Клубы · главный рычаг</h2>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">
                    Сначала те, где есть что исправить
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 0.1, 0.2, 0.3].map((delay) => (
                    <SkClub key={delay} delay={delay} />
                  ))}
                </div>
              </section>
            </div>

            <div className="min-w-0 xl:col-start-1 xl:row-start-5">
              <SkCard className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Динамика по дням</h2>
                    <Sk className="mt-2 h-3 w-40" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {["Бар и товары", "Визиты", "Конверсия", "Чек"].map(
                      (tab, i) => (
                        <span
                          key={tab}
                          className={`rounded-lg px-3 py-1.5 ${i === 0 ? "bg-[var(--surface-muted)]" : ""}`}
                        >
                          {tab}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div className="lp-eq">
                  {BAR_HEIGHTS.map((height, i) => (
                    <b
                      key={i}
                      style={{
                        height: `${height}%`,
                        ["--d" as string]: `${i * 0.12}s`,
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-around gap-3">
                  {BAR_HEIGHTS.map((_, i) => (
                    <Sk key={i} className="h-2.5 w-7" delay={i * 0.1} />
                  ))}
                </div>
              </SkCard>
            </div>

            <div className="min-w-0 xl:col-start-2 xl:row-start-5">
              <SkCard className="flex flex-col gap-4 p-5">
                <div>
                  <h2 className="text-lg font-semibold">Гости и загрузка</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Загрузка — оценка: сыгранные часы / (текущее число ПК × 24 ч
                    × дни); клубы работают круглосуточно.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SkRing delay={0} />
                  <SkRing delay={0.25} />
                  <SkRing delay={0.5} />
                </div>
                <div className="grid gap-2.5 border-t border-[var(--border-soft)] pt-3 text-sm">
                  {["Уникальные гости", "Визитов на гостя", "Сыграно часов"].map(
                    (label, i) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400"
                      >
                        {label}
                        <Sk className="h-3 w-20" delay={i * 0.1} />
                      </div>
                    ),
                  )}
                </div>
              </SkCard>
            </div>
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}
