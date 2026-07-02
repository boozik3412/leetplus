"use client";

import { useMemo, useState } from "react";
import { KnowledgeArticleRichText } from "@/components/staff-knowledge-rich-text";

export type StaffMaterialPreviewMetric = {
  label: string;
  value: string;
};

export type StaffMaterialPreviewStep = {
  id: string;
  title: string;
  typeLabel: string;
  referenceLabel?: string | null;
  content?: string | null;
  url?: string | null;
  required?: boolean;
  dayLabel?: string | null;
};

export type StaffMaterialPreviewAttachment = {
  id: string;
  title: string;
  typeLabel: string;
  url?: string | null;
  content?: string | null;
  note?: string | null;
  required?: boolean;
};

type PreviewAnswer = {
  done: boolean;
  evidence: string;
};

function defaultAnswer(): PreviewAnswer {
  return {
    done: false,
    evidence: "",
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function StaffMaterialPreview({
  eyebrow = "Тестовый предпросмотр",
  title,
  description,
  body,
  metrics,
  tags = [],
  steps,
  attachments = [],
  emptyLabel = "В материале пока нет шагов.",
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  body?: string | null;
  metrics: StaffMaterialPreviewMetric[];
  tags?: string[];
  steps: StaffMaterialPreviewStep[];
  attachments?: StaffMaterialPreviewAttachment[];
  emptyLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});

  const summary = useMemo(() => {
    const requiredSteps = steps.filter((step) => step.required);
    const completedSteps = steps.filter((step) => answers[step.id]?.done);
    const completedRequired = requiredSteps.filter((step) => answers[step.id]?.done);
    const evidenceCount = steps.filter((step) => answers[step.id]?.evidence.trim()).length;

    return {
      requiredSteps,
      completedSteps,
      completedRequired,
      evidenceCount,
    };
  }, [answers, steps]);

  function patchAnswer(stepId: string, patch: Partial<PreviewAnswer>) {
    setAnswers((current) => ({
      ...current,
      [stepId]: {
        ...defaultAnswer(),
        ...current[stepId],
        ...patch,
      },
    }));
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {title.trim() || "Новый материал"}
          </h3>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {description}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Тестовый проход не создает задачи, прогресс обучения, факт ознакомления
            или операционную запись. Он нужен, чтобы проверить вид для сотрудника,
            обязательные шаги, ссылки и доказательства до публикации.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAnswers({})}
          className="h-10 shrink-0 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
        >
          Сбросить тест
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <PreviewMetric
            key={`${metric.label}-${metric.value}`}
            label={metric.label}
            value={metric.value}
          />
        ))}
        <PreviewMetric
          label="Готовность"
          value={`${formatNumber(summary.completedRequired.length)}/${formatNumber(
            summary.requiredSteps.length,
          )}`}
        />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <PreviewProgress
          label="Шаги пройдены"
          value={`${formatNumber(summary.completedSteps.length)} из ${formatNumber(
            steps.length,
          )}`}
          tone={summary.completedSteps.length === steps.length ? "good" : "warn"}
        />
        <PreviewProgress
          label="Обязательные"
          value={`${formatNumber(summary.completedRequired.length)} из ${formatNumber(
            summary.requiredSteps.length,
          )}`}
          tone={
            summary.completedRequired.length === summary.requiredSteps.length
              ? "good"
              : "warn"
          }
        />
        <PreviewProgress
          label="Комментарии"
          value={`${formatNumber(summary.evidenceCount)} заполнено`}
        />
      </div>

      {body ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950">
          <p className="text-xs font-bold uppercase text-zinc-500">
            Основной материал
          </p>
          <KnowledgeArticleRichText value={body} className="mt-2" />
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-emerald-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-emerald-500/20"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {steps.length === 0 ? (
          <p className="rounded-md border border-dashed border-emerald-200 bg-white p-3 text-sm text-zinc-500 dark:border-emerald-500/20 dark:bg-zinc-950">
            {emptyLabel}
          </p>
        ) : (
          steps.map((step, index) => (
            <PreviewStep
              key={step.id}
              step={step}
              index={index}
              answer={answers[step.id] ?? defaultAnswer()}
              onPatch={(patch) => patchAnswer(step.id, patch)}
            />
          ))
        )}
      </div>

      {attachments.length > 0 ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950">
          <p className="text-xs font-bold uppercase text-zinc-500">
            Материалы и вложения
          </p>
          <div className="mt-2 space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {attachment.title || "Материал"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {attachment.typeLabel}
                  </span>
                  {attachment.required ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                      обязательно
                    </span>
                  ) : null}
                </div>
                {attachment.content ? (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {attachment.content}
                  </p>
                ) : null}
                {attachment.url ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                  >
                    Открыть материал
                  </a>
                ) : null}
                {attachment.note ? (
                  <p className="mt-2 text-xs text-zinc-500">{attachment.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-500/20 dark:bg-zinc-950">
      <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function PreviewProgress({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const className =
    tone === "good"
      ? "border-emerald-200 bg-emerald-100/70 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className={`rounded-lg border px-3 py-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase opacity-75">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function PreviewStep({
  step,
  index,
  answer,
  onPatch,
}: {
  step: StaffMaterialPreviewStep;
  index: number;
  answer: PreviewAnswer;
  onPatch: (patch: Partial<PreviewAnswer>) => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Шаг {index + 1}
          </p>
          <h4 className="mt-1 font-semibold">{step.title || "Шаг"}</h4>
          {step.referenceLabel ? (
            <p className="mt-1 text-sm text-zinc-500">{step.referenceLabel}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {step.typeLabel}
          </span>
          {step.dayLabel ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {step.dayLabel}
            </span>
          ) : null}
          {step.required ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
              обязательно
            </span>
          ) : null}
        </div>
      </div>

      {step.content ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {step.content}
        </p>
      ) : null}
      {step.url ? (
        <a
          href={step.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
        >
          Открыть ссылку
        </a>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
        <button
          type="button"
          aria-pressed={answer.done}
          onClick={() => onPatch({ done: !answer.done })}
          className={[
            "h-10 rounded-md px-3 text-sm font-semibold transition",
            answer.done
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          {answer.done ? "Пройдено" : "Отметить прохождение"}
        </button>
        <input
          value={answer.evidence}
          onChange={(event) => onPatch({ evidence: event.target.value })}
          placeholder="Тестовый комментарий, ссылка или доказательство"
          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
    </div>
  );
}
