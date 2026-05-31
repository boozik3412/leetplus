"use client";

import { useMemo, useState } from "react";

export type StaffTemplatePreviewValueType =
  | "CHECKBOX"
  | "TEXT"
  | "NUMBER"
  | "PHOTO_LINK"
  | "FILE_LINK"
  | "SELECT"
  | "TIMESTAMP";

export type StaffTemplatePreviewItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffTemplatePreviewValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffTemplatePreviewSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffTemplatePreviewItem[];
};

export type StaffTemplatePreviewAttachment = {
  id: string;
  title: string;
  type: string;
  url: string;
  note: string | null;
  required: boolean;
};

type PreviewAnswer = {
  value: string;
  checked: boolean;
  evidence: string;
};

const valueTypeLabels: Record<StaffTemplatePreviewValueType, string> = {
  CHECKBOX: "Да/нет",
  TEXT: "Текст",
  NUMBER: "Число",
  PHOTO_LINK: "Фото",
  FILE_LINK: "Файл",
  SELECT: "Выбор",
  TIMESTAMP: "Время",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function isAnswered(item: StaffTemplatePreviewItem, answer?: PreviewAnswer) {
  if (!answer) {
    return false;
  }

  if (item.valueType === "CHECKBOX") {
    return answer.checked;
  }

  return answer.value.trim().length > 0;
}

function hasEvidence(answer?: PreviewAnswer) {
  return Boolean(answer?.evidence.trim());
}

function defaultAnswer(): PreviewAnswer {
  return {
    value: "",
    checked: false,
    evidence: "",
  };
}

export function StaffTemplatePreview({
  title,
  description,
  roleLabel,
  scopeLabel,
  shiftKindLabel,
  statusLabel,
  sections,
  attachments = [],
}: {
  title: string;
  description: string | null;
  roleLabel: string;
  scopeLabel: string;
  shiftKindLabel: string;
  statusLabel: string;
  sections: StaffTemplatePreviewSection[];
  attachments?: StaffTemplatePreviewAttachment[];
}) {
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});

  const summary = useMemo(() => {
    const items = sections.flatMap((section) => section.items);
    const required = items.filter((item) => item.required);
    const evidence = items.filter((item) => item.evidenceRequired);
    const answeredRequired = required.filter((item) =>
      isAnswered(item, answers[item.id]),
    );
    const evidenceReady = evidence.filter((item) => hasEvidence(answers[item.id]));

    return {
      items,
      required,
      evidence,
      answeredRequired,
      evidenceReady,
      score: items.reduce((sum, item) => sum + Number(item.score || 0), 0),
    };
  }, [answers, sections]);

  function patchAnswer(itemId: string, patch: Partial<PreviewAnswer>) {
    setAnswers((current) => ({
      ...current,
      [itemId]: {
        ...defaultAnswer(),
        ...current[itemId],
        ...patch,
      },
    }));
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Тестовый предпросмотр
          </p>
          <h3 className="mt-1 text-lg font-semibold">{title || "Новый шаблон"}</h3>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {description}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Проход не сохраняет чеклист, ознакомление, задачу или другой
            операционный факт. Он нужен только для проверки текста, обязательных
            полей, доказательств и employee-facing вида.
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
        <PreviewMetric label="Роль" value={roleLabel} />
        <PreviewMetric label="Контур" value={scopeLabel} />
        <PreviewMetric label="Смена" value={shiftKindLabel} />
        <PreviewMetric label="Статус" value={statusLabel} />
        <PreviewMetric
          label="Готовность"
          value={`${formatNumber(summary.answeredRequired.length)}/${formatNumber(
            summary.required.length,
          )}`}
        />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <ProgressCard
          label="Обязательные пункты"
          value={`${formatNumber(summary.answeredRequired.length)} из ${formatNumber(
            summary.required.length,
          )}`}
          tone={
            summary.answeredRequired.length === summary.required.length
              ? "good"
              : "warn"
          }
        />
        <ProgressCard
          label="Доказательства"
          value={`${formatNumber(summary.evidenceReady.length)} из ${formatNumber(
            summary.evidence.length,
          )}`}
          tone={summary.evidenceReady.length === summary.evidence.length ? "good" : "warn"}
        />
        <ProgressCard label="Баллы шаблона" value={formatNumber(summary.score)} />
      </div>

      {attachments.length > 0 ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950">
          <p className="text-xs font-bold uppercase text-zinc-500">
            Материалы, которые увидит сотрудник
          </p>
          <div className="mt-2 grid gap-2">
            {attachments
              .filter((attachment) => attachment.title.trim() && attachment.url.trim())
              .map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-zinc-200 p-3 text-sm transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
                >
                  <span className="font-semibold">{attachment.title}</span>
                  {attachment.required ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                      обязательно
                    </span>
                  ) : null}
                  {attachment.note ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      {attachment.note}
                    </span>
                  ) : null}
                </a>
              ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.id}
            className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Раздел {sectionIndex + 1}
                </p>
                <h4 className="mt-1 font-semibold">{section.title || "Раздел"}</h4>
                {section.description ? (
                  <p className="mt-1 text-sm text-zinc-500">
                    {section.description}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {formatNumber(section.items.length)} пунктов
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {section.items.map((item, itemIndex) => (
                <PreviewItemCard
                  key={item.id}
                  item={item}
                  itemIndex={itemIndex}
                  answer={answers[item.id] ?? defaultAnswer()}
                  onPatch={(patch) => patchAnswer(item.id, patch)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
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

function ProgressCard({
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

function PreviewItemCard({
  item,
  itemIndex,
  answer,
  onPatch,
}: {
  item: StaffTemplatePreviewItem;
  itemIndex: number;
  answer: PreviewAnswer;
  onPatch: (patch: Partial<PreviewAnswer>) => void;
}) {
  const answered = isAnswered(item, answer);
  const evidenceReady = !item.evidenceRequired || hasEvidence(answer);

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">
            Пункт {itemIndex + 1}
          </p>
          <h5 className="mt-1 font-semibold">{item.title || "Пункт"}</h5>
          {item.instruction ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              {item.instruction}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {valueTypeLabels[item.valueType]}
          </span>
          {item.required ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
              обязательно
            </span>
          ) : null}
          {item.evidenceRequired ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
              доказательство
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PreviewControl item={item} answer={answer} onPatch={onPatch} />
        <label className="block text-sm">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Тестовое доказательство
          </span>
          <input
            value={answer.evidence}
            onChange={(event) => onPatch({ evidence: event.target.value })}
            placeholder={
              item.evidenceRequired
                ? "Ссылка, фото, файл или комментарий"
                : "Не обязательно"
            }
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span
          className={[
            "rounded-full px-2.5 py-1 font-semibold",
            !item.required || answered
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
          ].join(" ")}
        >
          {item.required
            ? answered
              ? "обязательное заполнено"
              : "ждет ответа"
            : "необязательное"}
        </span>
        <span
          className={[
            "rounded-full px-2.5 py-1 font-semibold",
            evidenceReady
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
          ].join(" ")}
        >
          {evidenceReady ? "доказательство ок" : "нужно доказательство"}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {formatNumber(item.score)} балл.
        </span>
      </div>
    </div>
  );
}

function PreviewControl({
  item,
  answer,
  onPatch,
}: {
  item: StaffTemplatePreviewItem;
  answer: PreviewAnswer;
  onPatch: (patch: Partial<PreviewAnswer>) => void;
}) {
  if (item.valueType === "CHECKBOX") {
    return (
      <div className="text-sm">
        <span className="text-xs font-bold uppercase text-zinc-500">
          Ответ сотрудника
        </span>
        <button
          type="button"
          aria-pressed={answer.checked}
          onClick={() => onPatch({ checked: !answer.checked })}
          className={[
            "mt-1 h-10 rounded-md px-3 text-sm font-semibold transition",
            answer.checked
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          {answer.checked ? "Выполнено" : "Отметить выполнение"}
        </button>
      </div>
    );
  }

  if (item.valueType === "TEXT") {
    return (
      <label className="block text-sm">
        <span className="text-xs font-bold uppercase text-zinc-500">
          Ответ сотрудника
        </span>
        <textarea
          value={answer.value}
          onChange={(event) => onPatch({ value: event.target.value })}
          rows={2}
          placeholder="Введите тестовый ответ"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
    );
  }

  if (item.valueType === "SELECT") {
    return (
      <label className="block text-sm">
        <span className="text-xs font-bold uppercase text-zinc-500">
          Ответ сотрудника
        </span>
        <select
          value={answer.value}
          onChange={(event) => onPatch({ value: event.target.value })}
          className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">Выберите тестовый вариант</option>
          <option value="done">Готово</option>
          <option value="needs-review">Нужна проверка</option>
          <option value="failed">Не выполнено</option>
        </select>
      </label>
    );
  }

  return (
    <label className="block text-sm">
      <span className="text-xs font-bold uppercase text-zinc-500">
        Ответ сотрудника
      </span>
      <input
        type={item.valueType === "NUMBER" ? "number" : item.valueType === "TIMESTAMP" ? "datetime-local" : "text"}
        value={answer.value}
        onChange={(event) => onPatch({ value: event.target.value })}
        placeholder={
          item.valueType === "PHOTO_LINK"
            ? "Ссылка на фото"
            : item.valueType === "FILE_LINK"
              ? "Ссылка на файл"
              : undefined
        }
        className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
