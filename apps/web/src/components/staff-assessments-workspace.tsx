"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffAssessment,
  StaffAssessmentKind,
  StaffAssessmentQuestion,
  StaffAssessmentQuestionOption,
  StaffAssessmentQuestionType,
  StaffAssessmentsReport,
  StaffAssessmentRoleScope,
  StaffAssessmentStatus,
} from "@/lib/staff-assessments";

const statusLabels: Record<StaffAssessmentStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  ARCHIVED: "Архив",
};

const kindLabels: Record<StaffAssessmentKind, string> = {
  TEST: "Тест",
  ATTESTATION: "Аттестация",
};

const roleScopeLabels: Record<StaffAssessmentRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

const questionTypeLabels: Record<StaffAssessmentQuestionType, string> = {
  SINGLE_CHOICE: "Один ответ",
  MULTI_CHOICE: "Несколько ответов",
  TEXT: "Текст",
};

type DraftAssessment = {
  id: string | null;
  title: string;
  description: string;
  roleScope: StaffAssessmentRoleScope;
  status: StaffAssessmentStatus;
  assessmentKind: StaffAssessmentKind;
  passThreshold: string;
  retakeLimit: string;
  expiresInDays: string;
  timeLimitMinutes: string;
  storeId: string;
  questions: StaffAssessmentQuestion[];
};

type DraftAnswer = {
  selectedOptionIds: string[];
  text: string;
};

const seedAssessments: Array<Omit<DraftAssessment, "id" | "storeId">> = [
  {
    title: "Администратор: касса, смена и сервис",
    description:
      "Базовый тест перед самостоятельной сменой: касса, порядок открытия, коммуникация с гостем и фиксация отклонений.",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    assessmentKind: "TEST",
    passThreshold: "80",
    retakeLimit: "3",
    expiresInDays: "180",
    timeLimitMinutes: "25",
    questions: [
      choiceQuestion("shift-start", "Что нужно проверить перед открытием смены?", [
        "Кассу, рабочее место, брони и готовность бара",
        "Только наличие администратора на месте",
        "Только остатки энергетиков",
      ]),
      choiceQuestion("guest-conflict", "Что делать при конфликте с гостем?", [
        "Сохранить спокойствие, зафиксировать факт и передать управляющему",
        "Удалить гостя из клуба без фиксации",
        "Закрыть вопрос устно без записи",
      ]),
    ],
  },
  {
    title: "Старший администратор: контроль смены",
    description:
      "Проверка готовности старшего администратора контролировать чеклисты, задачи, бар и передачу проблем управляющему.",
    roleScope: "SENIOR_ADMINISTRATOR",
    status: "DRAFT",
    assessmentKind: "ATTESTATION",
    passThreshold: "85",
    retakeLimit: "2",
    expiresInDays: "120",
    timeLimitMinutes: "30",
    questions: [
      choiceQuestion("checklists", "Какие отклонения нужно фиксировать задачей?", [
        "Просроченный чеклист, кассовое расхождение, сбой бара или жалобу гостя",
        "Только просьбы управляющего",
        "Только технические сбои ПК",
      ]),
      textQuestion("handover", "Опишите, что должно попасть в передачу смены."),
    ],
  },
  {
    title: "Менеджер по стандартам: регламенты и обучение",
    description:
      "Проверка для менеджера по стандартам: регламенты, чеклисты, обучение, контроль администраторов и аттестации.",
    roleScope: "STANDARDS_MANAGER",
    status: "DRAFT",
    assessmentKind: "ATTESTATION",
    passThreshold: "90",
    retakeLimit: "2",
    expiresInDays: "365",
    timeLimitMinutes: "45",
    questions: [
      choiceQuestion("regulation-update", "Что должно происходить после важного обновления регламента?", [
        "Повторное ознакомление или назначение пересдачи",
        "Только сообщение в чате",
        "Ничего, если регламент опубликован",
      ]),
      textQuestion("quality-loop", "Как выстроить цикл контроля качества администраторов?"),
    ],
  },
];

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function option(label: string, index: number): StaffAssessmentQuestionOption {
  return {
    id: `option-${index + 1}`,
    label,
  };
}

function choiceQuestion(
  id: string,
  title: string,
  labels: string[],
): StaffAssessmentQuestion {
  const options = labels.map(option);

  return {
    id,
    title,
    type: "SINGLE_CHOICE",
    options,
    correctOptionIds: [options[0].id],
    points: 1,
    required: true,
  };
}

function textQuestion(id: string, title: string): StaffAssessmentQuestion {
  return {
    id,
    title,
    type: "TEXT",
    options: [],
    correctOptionIds: [],
    points: 1,
    required: true,
  };
}

function defaultDraft(): DraftAssessment {
  return {
    id: null,
    title: "",
    description: "",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    assessmentKind: "TEST",
    passThreshold: "80",
    retakeLimit: "3",
    expiresInDays: "",
    timeLimitMinutes: "",
    storeId: "",
    questions: [],
  };
}

function fromAssessment(row: StaffAssessment): DraftAssessment {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    roleScope: row.roleScope,
    status: row.status,
    assessmentKind: row.assessmentKind,
    passThreshold: row.passThreshold.toString(),
    retakeLimit: row.retakeLimit?.toString() ?? "",
    expiresInDays: row.expiresInDays?.toString() ?? "",
    timeLimitMinutes: row.timeLimitMinutes?.toString() ?? "",
    storeId: row.store?.id ?? "",
    questions: row.questions,
  };
}

function emptyQuestion(): StaffAssessmentQuestion {
  const options = [option("Вариант 1", 0), option("Вариант 2", 1)];

  return {
    id: uid("question"),
    title: "",
    type: "SINGLE_CHOICE",
    options,
    correctOptionIds: [options[0].id],
    points: 1,
    required: true,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "не задано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function StaffAssessmentsWorkspace({
  report,
}: {
  report: StaffAssessmentsReport;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftAssessment>(() =>
    report.rows[0] ? fromAssessment(report.rows[0]) : defaultDraft(),
  );
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [isPending, setIsPending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAssessment = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? report.rows[0] ?? null,
    [draft.id, report.rows],
  );
  const selectedResults = useMemo(
    () =>
      selectedAssessment
        ? report.results.filter(
            (result) => result.assessmentId === selectedAssessment.id,
          )
        : [],
    [report.results, selectedAssessment],
  );

  function updateDraft(patch: Partial<DraftAssessment>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function loadSeed(seed: Omit<DraftAssessment, "id" | "storeId">) {
    setDraft({ ...seed, id: null, storeId: "" });
    setMessage("Шаблон аттестации загружен. Проверьте вопросы и сохраните.");
    setError(null);
  }

  function selectAssessment(row: StaffAssessment) {
    setDraft(fromAssessment(row));
    setAnswers({});
    setMessage(null);
    setError(null);
  }

  function addQuestion() {
    setDraft((current) => ({
      ...current,
      questions: [...current.questions, emptyQuestion()],
    }));
  }

  function updateQuestion(
    questionId: string,
    patch: Partial<StaffAssessmentQuestion>,
  ) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? { ...question, ...patch } : question,
      ),
    }));
  }

  function removeQuestion(questionId: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== questionId),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      setError("Укажите название теста или аттестации.");
      return;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      roleScope: draft.roleScope,
      status: draft.status,
      assessmentKind: draft.assessmentKind,
      passThreshold: draft.passThreshold,
      retakeLimit: draft.retakeLimit.trim() || null,
      expiresInDays: draft.expiresInDays.trim() || null,
      timeLimitMinutes: draft.timeLimitMinutes.trim() || null,
      storeId: draft.storeId || null,
      questions: draft.questions
        .map((question) => ({
          ...question,
          title: question.title.trim(),
          options:
            question.type === "TEXT"
              ? []
              : question.options
                  .map((item) => ({ ...item, label: item.label.trim() }))
                  .filter((item) => item.label),
          correctOptionIds:
            question.type === "TEXT" ? [] : question.correctOptionIds,
        }))
        .filter((question) => question.title),
    };

    try {
      const response = await fetch(
        draft.id ? `/api/staff/assessments/${draft.id}` : "/api/staff/assessments",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось сохранить аттестацию");
      }

      const saved = (await response.json()) as StaffAssessment;
      setDraft(fromAssessment(saved));
      setMessage("Тест или аттестация сохранены.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAssessment) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/staff/assessments/${selectedAssessment.id}/results`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: selectedAssessment.questions.map((question) => ({
              questionId: question.id,
              selectedOptionIds: answers[question.id]?.selectedOptionIds ?? [],
              text: answers[question.id]?.text ?? null,
            })),
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось отправить результат");
      }

      setAnswers({});
      setMessage("Попытка сохранена в истории результатов.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateAnswer(questionId: string, patch: Partial<DraftAnswer>) {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        selectedOptionIds: current[questionId]?.selectedOptionIds ?? [],
        text: current[questionId]?.text ?? "",
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-6">
      {report.canManageAssessments ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Быстрый старт
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Шаблоны тестов и аттестаций
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDraft(defaultDraft())}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Новая аттестация
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {seedAssessments.map((seed) => (
              <button
                key={seed.title}
                type="button"
                onClick={() => loadSeed(seed)}
                className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
              >
                <span className="text-sm font-semibold">{seed.title}</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  {seed.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каталог
              </p>
              <h2 className="mt-1 text-lg font-semibold">Тесты и аттестации</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {formatNumber(report.rows.length)}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Тестов пока нет. Создайте первую проверку справа.
              </p>
            ) : (
              report.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectAssessment(row)}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {kindLabels[row.assessmentKind]}
                    </span>
                    {report.canManageAssessments ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {statusLabels[row.status]}
                      </span>
                    ) : null}
                  </span>
                  {row.description ? (
                    <span className="mt-2 block text-sm text-zinc-600 dark:text-zinc-400">
                      {row.description}
                    </span>
                  ) : null}
                  <span className="mt-2 block text-xs text-zinc-500">
                    {roleScopeLabels[row.roleScope]} · {row.store?.name ?? "Вся сеть"} ·
                    порог {row.passThreshold}% · попыток{" "}
                    {row.retakeLimit ?? "без лимита"} · вопросов {row.questionsCount}
                  </span>
                  {row.latestResult ? (
                    <span className="mt-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Последняя попытка: {row.latestResult.score}% ·{" "}
                      {row.latestResult.passed ? "сдано" : "не сдано"}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          {report.canManageAssessments ? (
            <AssessmentEditor
              draft={draft}
              report={report}
              isPending={isPending}
              onSave={save}
              onUpdate={updateDraft}
              onAddQuestion={addQuestion}
              onUpdateQuestion={updateQuestion}
              onRemoveQuestion={removeQuestion}
            />
          ) : selectedAssessment ? (
            <AssessmentPreview assessment={selectedAssessment} />
          ) : null}

          {selectedAssessment ? (
            <AttemptPanel
              assessment={selectedAssessment}
              answers={answers}
              isSubmitting={isSubmitting}
              results={selectedResults}
              onSubmit={submitAttempt}
              onUpdateAnswer={updateAnswer}
            />
          ) : null}

          {message ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function AssessmentEditor({
  draft,
  report,
  isPending,
  onSave,
  onUpdate,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
}: {
  draft: DraftAssessment;
  report: StaffAssessmentsReport;
  isPending: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (patch: Partial<DraftAssessment>) => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (
    questionId: string,
    patch: Partial<StaffAssessmentQuestion>,
  ) => void;
  onRemoveQuestion: (questionId: string) => void;
}) {
  return (
    <form
      onSubmit={onSave}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Конструктор
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {draft.id ? "Редактирование проверки" : "Новая проверка"}
          </h2>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Название
          </span>
          <input
            value={draft.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            placeholder="Например: аттестация администратора"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">Тип</span>
          <select
            value={draft.assessmentKind}
            onChange={(event) =>
              onUpdate({
                assessmentKind: event.target.value as StaffAssessmentKind,
              })
            }
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Статус
          </span>
          <select
            value={draft.status}
            onChange={(event) =>
              onUpdate({ status: event.target.value as StaffAssessmentStatus })
            }
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">Роль</span>
          <select
            value={draft.roleScope}
            onChange={(event) =>
              onUpdate({ roleScope: event.target.value as StaffAssessmentRoleScope })
            }
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {Object.entries(roleScopeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">Клуб</span>
          <select
            value={draft.storeId}
            onChange={(event) => onUpdate({ storeId: event.target.value })}
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Вся сеть</option>
            {report.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        <NumberField
          label="Порог, %"
          value={draft.passThreshold}
          placeholder="80"
          onChange={(value) => onUpdate({ passThreshold: value })}
        />
        <NumberField
          label="Попыток"
          value={draft.retakeLimit}
          placeholder="3"
          onChange={(value) => onUpdate({ retakeLimit: value })}
        />
        <NumberField
          label="Срок, дней"
          value={draft.expiresInDays}
          placeholder="180"
          onChange={(value) => onUpdate({ expiresInDays: value })}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[12rem_1fr]">
        <NumberField
          label="Лимит, мин"
          value={draft.timeLimitMinutes}
          placeholder="30"
          onChange={(value) => onUpdate({ timeLimitMinutes: value })}
        />
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Описание
          </span>
          <input
            value={draft.description}
            onChange={(event) => onUpdate({ description: event.target.value })}
            placeholder="Что проверяем и когда назначается пересдача."
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Вопросы
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Выборочные вопросы проверяются автоматически. Текстовые ответы
              сохраняются в истории как доказательство прохождения.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddQuestion}
            className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Добавить вопрос
          </button>
        </div>

        {draft.questions.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
            Вопросов пока нет. Черновик можно сохранить, но проходить его будет
            можно только после добавления вопросов.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {draft.questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                index={index}
                question={question}
                onUpdate={(patch) => onUpdateQuestion(question.id, patch)}
                onRemove={() => onRemoveQuestion(question.id)}
              />
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase text-zinc-500">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function QuestionEditor({
  index,
  question,
  onUpdate,
  onRemove,
}: {
  index: number;
  question: StaffAssessmentQuestion;
  onUpdate: (patch: Partial<StaffAssessmentQuestion>) => void;
  onRemove: () => void;
}) {
  function updateType(type: StaffAssessmentQuestionType) {
    if (type === "TEXT") {
      onUpdate({ type, options: [], correctOptionIds: [] });
      return;
    }

    const options =
      question.options.length >= 2
        ? question.options
        : [option("Вариант 1", 0), option("Вариант 2", 1)];
    onUpdate({
      type,
      options,
      correctOptionIds:
        question.correctOptionIds.length > 0
          ? question.correctOptionIds.slice(0, type === "SINGLE_CHOICE" ? 1 : 12)
          : [options[0].id],
    });
  }

  function updateOption(optionId: string, label: string) {
    onUpdate({
      options: question.options.map((item) =>
        item.id === optionId ? { ...item, label } : item,
      ),
    });
  }

  function addOption() {
    onUpdate({
      options: [
        ...question.options,
        { id: uid("option"), label: `Вариант ${question.options.length + 1}` },
      ],
    });
  }

  function removeOption(optionId: string) {
    const options = question.options.filter((item) => item.id !== optionId);
    onUpdate({
      options,
      correctOptionIds: question.correctOptionIds.filter((id) => id !== optionId),
    });
  }

  function toggleCorrect(optionId: string) {
    if (question.type === "SINGLE_CHOICE") {
      onUpdate({ correctOptionIds: [optionId] });
      return;
    }

    const exists = question.correctOptionIds.includes(optionId);
    onUpdate({
      correctOptionIds: exists
        ? question.correctOptionIds.filter((id) => id !== optionId)
        : [...question.correctOptionIds, optionId],
    });
  }

  return (
    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50">
      <div className="grid gap-3 lg:grid-cols-[1fr_10rem_7rem_auto]">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Вопрос {index + 1}
          </span>
          <input
            value={question.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            placeholder="Текст вопроса"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">Тип</span>
          <select
            value={question.type}
            onChange={(event) =>
              updateType(event.target.value as StaffAssessmentQuestionType)
            }
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {Object.entries(questionTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <NumberField
          label="Баллы"
          value={question.points.toString()}
          placeholder="1"
          onChange={(value) => onUpdate({ points: Number(value) || 1 })}
        />

        <div className="flex items-end gap-2">
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(event) => onUpdate({ required: event.target.checked })}
            />
            Обяз.
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Убрать
          </button>
        </div>
      </div>

      {question.type !== "TEXT" ? (
        <div className="mt-3 space-y-2">
          {question.options.map((item) => (
            <div key={item.id} className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
                <input
                  type="checkbox"
                  checked={question.correctOptionIds.includes(item.id)}
                  onChange={() => toggleCorrect(item.id)}
                />
                верный
              </label>
              <input
                value={item.label}
                onChange={(event) => updateOption(item.id, event.target.value)}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => removeOption(item.id)}
                className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Удалить
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Добавить вариант
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AssessmentPreview({ assessment }: { assessment: StaffAssessment }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Проверка
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{assessment.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {kindLabels[assessment.assessmentKind]} ·{" "}
        {roleScopeLabels[assessment.roleScope]} · порог{" "}
        {assessment.passThreshold}% · попыток{" "}
        {assessment.retakeLimit ?? "без лимита"}
      </p>
      {assessment.description ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          {assessment.description}
        </p>
      ) : null}
    </section>
  );
}

function AttemptPanel({
  assessment,
  answers,
  results,
  isSubmitting,
  onSubmit,
  onUpdateAnswer,
}: {
  assessment: StaffAssessment;
  answers: Record<string, DraftAnswer>;
  results: StaffAssessmentsReport["results"];
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateAnswer: (questionId: string, patch: Partial<DraftAnswer>) => void;
}) {
  const isAvailable = assessment.status === "ACTIVE";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Прохождение
          </p>
          <h2 className="mt-1 text-lg font-semibold">Попытка и история</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Результат считается по выборочным вопросам. Срок действия:{" "}
            {assessment.expiresInDays
              ? `${assessment.expiresInDays} дней`
              : "не ограничен"}
            .
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          Сдано: {assessment.resultSummary.passed} · попыток:{" "}
          {assessment.resultSummary.attempts}
        </div>
      </div>

      {isAvailable && assessment.questions.length > 0 ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {assessment.questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {index + 1}
                </span>
                <span className="font-semibold">{question.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {questionTypeLabels[question.type]}
                </span>
              </div>

              {question.type === "TEXT" ? (
                <textarea
                  value={answers[question.id]?.text ?? ""}
                  onChange={(event) =>
                    onUpdateAnswer(question.id, { text: event.target.value })
                  }
                  rows={3}
                  placeholder="Ответ или комментарий"
                  className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              ) : (
                <div className="mt-3 space-y-2">
                  {question.options.map((item) => {
                    const selected =
                      answers[question.id]?.selectedOptionIds.includes(item.id) ??
                      false;

                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <input
                          type={
                            question.type === "SINGLE_CHOICE"
                              ? "radio"
                              : "checkbox"
                          }
                          name={question.id}
                          checked={selected}
                          onChange={() => {
                            if (question.type === "SINGLE_CHOICE") {
                              onUpdateAnswer(question.id, {
                                selectedOptionIds: [item.id],
                              });
                              return;
                            }

                            const current =
                              answers[question.id]?.selectedOptionIds ?? [];
                            onUpdateAnswer(question.id, {
                              selectedOptionIds: selected
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            });
                          }}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Сохраняем..." : "Сдать попытку"}
          </button>
        </form>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          Прохождение доступно после публикации активной проверки с вопросами.
        </p>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold">История результатов</h3>
        {results.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
            Результатов пока нет.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Попытка {result.attemptNumber} · {result.score}%
                  </span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      result.passed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200",
                    ].join(" ")}
                  >
                    {result.passed ? "сдано" : "не сдано"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {result.user.fullName ?? result.user.email} · отправлено{" "}
                  {formatDate(result.submittedAt)} · действует до{" "}
                  {formatDate(result.expiresAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
