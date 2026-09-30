import { LoaderMark } from "./loader-mark";

const SOURCES = ["Продажи", "Визиты", "Гости", "Остатки"] as const;

const DEFAULT_STATUS = [
  "Проверяем сессию…",
  "Подключаем клубы сети…",
  "Собираем данные…",
] as const;

// Tips are real product behaviour, one line each; keep them short and true.
const TIPS = [
  "нажмите на множитель в дереве выручки — откроются клубы и дни.",
  "«Поставить задачу» заполнит форму по сигналу, останется выбрать ответственных.",
  "продажи считаются по местным суткам клуба, как и визиты.",
] as const;

/**
 * Brand loader: LP orbit, what we are assembling (four sources, no percent),
 * rotating status lines and a product tip. For the entry and for screens
 * without a skeleton of their own.
 */
export function BrandLoader({
  title = "Загружаем LeetPlus",
  status = DEFAULT_STATUS,
  fullScreen = false,
  tips = true,
}: {
  title?: string;
  status?: readonly string[];
  fullScreen?: boolean;
  tips?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      className={`flex items-center justify-center bg-[var(--background)] px-6 py-10 text-[var(--foreground)] ${
        fullScreen ? "min-h-dvh" : "min-h-[70vh]"
      }`}
    >
      <div className="flex max-w-full flex-col items-center gap-6 text-center">
        <span role="status" className="sr-only">
          {title}
        </span>
        <LoaderMark size={96} />
        <div className="flex flex-col items-center gap-2" aria-hidden="true">
          <p className="text-[22px] font-semibold leading-7">{title}</p>
          <div className="lp-say h-[22px] w-[min(380px,86vw)] text-sm text-zinc-600 dark:text-zinc-300">
            {status.slice(0, 3).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="flex flex-wrap justify-center gap-2"
        >
          {SOURCES.map((source, index) => (
            <span key={source} className="lp-source">
              <i style={{ ["--d" as string]: `${index * 0.45}s` }} />
              {source}
            </span>
          ))}
        </div>
        {tips ? (
          <div
            aria-hidden="true"
            className="lp-say h-10 w-[min(460px,88vw)] text-[13px] leading-5 text-zinc-500 dark:text-zinc-400"
            style={{ ["--t" as string]: "10.8s" }}
          >
            {TIPS.map((tip) => (
              <span key={tip}>
                <b className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Подсказка
                </b>{" "}
                · {tip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
