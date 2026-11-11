import Link from "next/link";
import {
  setupStepCopy,
  type SetupProgress,
} from "@/lib/setup-progress";

// Made-up numbers that show a new owner what the summary will hold. Every
// tile carries the «пример» mark and disappears once real data arrives.
const exampleTiles = [
  { label: "Выручка бара за неделю", value: "104 979 ₽" },
  { label: "Визиты", value: "420" },
  { label: "Гостей в игре", value: "86" },
] as const;

function StepMark({ done, index }: { done: boolean; index: number }) {
  if (done) {
    return (
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4">
          <path
            d="M5 10.5 8.5 14 15 6.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
    >
      {index + 1}
    </span>
  );
}

export function TenantOnboardingNotice({
  progress,
}: {
  progress: SetupProgress;
}) {
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <section
      className="mt-6 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
      aria-labelledby="tenant-onboarding-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="tenant-onboarding-title"
          className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
        >
          Запуск сети
        </h2>
        <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
          Готово {progress.completed} из {progress.total}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Запуск сети"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-4 grid gap-2 lg:grid-cols-5">
        {progress.steps.map((step, index) => {
          const copy = setupStepCopy[step.key];
          return (
            <li
              key={step.key}
              className={[
                "flex gap-3 rounded-xl border p-3 lg:flex-col",
                step.done
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                  : "border-[var(--border-soft)]",
              ].join(" ")}
            >
              <StepMark done={step.done} index={index} />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {copy.title}
                  {step.done ? <span className="sr-only">: готово</span> : null}
                </p>
                <p className="mt-1 flex-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                  {copy.description}
                </p>
                {step.done ? null : (
                  <Link
                    href={copy.href}
                    className="mt-2 inline-flex self-start text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-300"
                  >
                    {copy.action}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {progress.hasData ? null : (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Так будет выглядеть сводка, когда из Langame придут первые продажи и
            сеансы. Пока это пример, ниже ваши настоящие нули.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {exampleTiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tile.label}
                  </p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    пример
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
