"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowSquareOut,
  ArrowUp,
  Books,
  CheckSquare,
  FileText,
  LinkSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SidePanel } from "@/components/side-panel";
import {
  EditablePage,
  FormatToolbar,
  formatSavedTime,
  type PageCommands,
} from "@/components/staff-document-page-editor";
import {
  KnowledgeArticleRichText,
  sanitizeKnowledgeContentHtml,
} from "@/components/staff-knowledge-rich-text";
import {
  courseSaveErrorMessage,
  courseSaveProblem,
  courseStatusLabels,
  courseTabTypeHints,
  courseTabTypeLabels,
  coursePayload,
  moveCourseTab,
  newCourseTab,
  type CourseDraft,
  type CourseTab,
  type CourseTabType,
} from "@/lib/learning-course-editor";
import {
  learningRoleScopeLabels,
  type LearningRoleScope,
} from "@/lib/learning-documents";

export type CourseEditorArticleOption = {
  id: string;
  title: string;
  category: string;
};

export type CourseEditorArticleContent = {
  id: string;
  title: string;
  folder: string;
  content: string | null;
  summary: string | null;
};

type SaveState =
  | { kind: "saved"; at: string | null }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "blocked"; message: string; tabId: string | null }
  | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 1200;

function newTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `step-${crypto.randomUUID()}`;
  }

  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function TabIcon({ type }: { type: CourseTabType }) {
  const className = "h-4 w-4 shrink-0";

  if (type === "TASK") {
    return <CheckSquare aria-hidden="true" className={className} />;
  }

  if (type === "ARTICLE") {
    return <Books aria-hidden="true" className={className} />;
  }

  if (type === "LINK") {
    return <LinkSimple aria-hidden="true" className={className} />;
  }

  return <FileText aria-hidden="true" className={className} />;
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export function StaffCourseDocumentEditor({
  courseId,
  initialDraft,
  initialUpdatedAt,
  canManage,
  accessScope,
  stores,
  articleOptions,
  articleContents,
}: {
  courseId: string;
  initialDraft: CourseDraft;
  initialUpdatedAt: string;
  canManage: boolean;
  accessScope: "NETWORK" | "STORES";
  stores: Array<{ id: string; name: string }>;
  articleOptions: CourseEditorArticleOption[];
  articleContents: CourseEditorArticleContent[];
}) {
  const [draft, setDraft] = useState<CourseDraft>(initialDraft);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialDraft.steps[0]?.id ?? null,
  );
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "saved",
    at: initialUpdatedAt,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [commands, setCommands] = useState<PageCommands | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const activeTab =
    draft.steps.find((step) => step.id === activeTabId) ?? draft.steps[0];
  const articleById = new Map(articleContents.map((item) => [item.id, item]));

  const update = useCallback(
    (recipe: (current: CourseDraft) => CourseDraft) => {
      setDraft((current) => recipe(current));
      versionRef.current += 1;
      setSaveState({ kind: "pending" });
    },
    [],
  );

  const updateTab = useCallback(
    (id: string, patch: Partial<CourseTab>) =>
      update((current) => ({
        ...current,
        steps: current.steps.map((step) =>
          step.id === id ? { ...step, ...patch } : step,
        ),
      })),
    [update],
  );

  const save = useCallback(async () => {
    if (savingRef.current || versionRef.current === savedVersionRef.current) {
      return;
    }

    const current = draftRef.current;
    const problem = courseSaveProblem(current);

    if (problem) {
      setSaveState({
        kind: "blocked",
        message: problem.message,
        tabId: problem.tabId,
      });
      return;
    }

    const version = versionRef.current;
    savingRef.current = true;
    setSaveState({ kind: "saving" });

    try {
      const payload = coursePayload({
        ...current,
        steps: current.steps.map((step) =>
          step.type === "TEXT" || step.type === "TASK"
            ? { ...step, content: sanitizeKnowledgeContentHtml(step.content) }
            : step,
        ),
      });
      const response = await fetch(
        `/api/staff/training-courses/${encodeURIComponent(courseId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(courseSaveErrorMessage(data?.message));
      }

      const saved = (await response.json()) as { updatedAt?: string };
      savedVersionRef.current = version;
      setSaveState(
        versionRef.current === version
          ? { kind: "saved", at: saved.updatedAt ?? new Date().toISOString() }
          : { kind: "pending" },
      );
    } catch (caught) {
      setSaveState({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Не удалось сохранить. Проверьте соединение.",
      });
    } finally {
      savingRef.current = false;
    }
  }, [courseId]);

  useEffect(() => {
    if (!canManage || saveState.kind !== "pending") {
      return;
    }

    const timer = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [canManage, save, saveState, draft]);

  useEffect(() => {
    const unsaved =
      saveState.kind === "pending" ||
      saveState.kind === "saving" ||
      saveState.kind === "blocked" ||
      saveState.kind === "error";

    if (!unsaved) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState.kind]);

  function addTab(type: CourseTabType) {
    const tab = newCourseTab(type, newTabId());

    if (type === "ARTICLE" && articleOptions[0]) {
      tab.articleId = articleOptions[0].id;
      tab.title = articleOptions[0].title;
    }

    update((current) => ({ ...current, steps: [...current.steps, tab] }));
    setActiveTabId(tab.id);
    setAddMenuOpen(false);
  }

  function removeTab(id: string) {
    const index = draft.steps.findIndex((step) => step.id === id);
    const next = draft.steps.filter((step) => step.id !== id);
    update((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== id),
    }));
    setActiveTabId(next[Math.max(0, index - 1)]?.id ?? null);
    setConfirmDeleteId(null);
  }

  const saveLabel =
    saveState.kind === "saved"
      ? saveState.at
        ? `Все изменения сохранены в ${formatSavedTime(saveState.at)}`
        : "Все изменения сохранены"
      : saveState.kind === "saving"
        ? "Сохраняем…"
        : saveState.kind === "pending"
          ? "Есть несохранённые изменения"
          : saveState.kind === "blocked"
            ? `Не сохранено: ${saveState.message}`
            : `Не сохранено: ${saveState.message}`;
  const saveTone =
    saveState.kind === "blocked" || saveState.kind === "error"
      ? "text-amber-700 dark:text-amber-300"
      : "text-zinc-500 dark:text-zinc-400";

  const audience = [
    learningRoleScopeLabels[draft.roleScope],
    draft.storeId
      ? (stores.find((store) => store.id === draft.storeId)?.name ?? "Клуб")
      : "Вся сеть",
    draft.dueDays.trim() ? `${draft.dueDays.trim()} дн.` : "без срока",
    draft.required ? "обязательный" : "по желанию",
  ].join(" · ");

  return (
    <main className="min-h-dvh text-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-[var(--background)] px-4 py-2 dark:border-zinc-800 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href="/staff/learning"
            aria-label="К документам"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Books
            aria-hidden="true"
            className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
            weight="duotone"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label htmlFor="course-title" className="sr-only">
                Название курса
              </label>
              <input
                id="course-title"
                value={draft.title}
                readOnly={!canManage}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Название курса"
                className="min-w-[8rem] max-w-full rounded-md bg-transparent! px-1 text-lg font-medium [field-sizing:content] outline-none hover:bg-zinc-100! focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-900! sm:max-w-md"
              />
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  draft.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {courseStatusLabels[draft.status]}
              </span>
            </div>
            {canManage ? (
              <p
                role="status"
                aria-live="polite"
                className={`truncate px-1 text-xs ${saveTone}`}
                title={saveLabel}
              >
                {saveState.kind === "blocked" && saveState.tabId ? (
                  <button
                    type="button"
                    onClick={() => setActiveTabId(saveState.tabId)}
                    className="cursor-pointer underline"
                  >
                    {saveLabel}
                  </button>
                ) : saveState.kind === "error" ? (
                  <>
                    {saveLabel}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        savedVersionRef.current = -1;
                        void save();
                      }}
                      className="cursor-pointer font-semibold underline"
                    >
                      Повторить
                    </button>
                  </>
                ) : (
                  saveLabel
                )}
              </p>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="h-9 max-w-full cursor-pointer truncate rounded-full border border-zinc-300 px-3 text-left text-[13px] text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 sm:max-w-sm"
                title={`Для кого: ${audience}`}
              >
                Для кого: {audience}
              </button>
              {draft.status === "DRAFT" ? (
                <button
                  type="button"
                  onClick={() =>
                    update((current) => ({ ...current, status: "ACTIVE" }))
                  }
                  className="h-9 cursor-pointer rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  Опубликовать
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Для кого: {audience}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-start">
        <nav
          aria-label="Вкладки курса"
          className="lg:sticky lg:top-24 lg:w-72 lg:shrink-0"
        >
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold">Вкладки курса</h2>
            {canManage ? (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={addMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAddMenuOpen((value) => !value)}
                  className="flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-emerald-700 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" weight="bold" />
                  Вкладка
                </button>
                {addMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Добавить вкладку"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setAddMenuOpen(false);
                      }
                    }}
                    className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {(Object.keys(courseTabTypeLabels) as CourseTabType[]).map(
                      (type) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitem"
                          autoFocus={type === "TEXT"}
                          disabled={
                            type === "ARTICLE" && articleOptions.length === 0
                          }
                          onClick={() => addTab(type)}
                          className="flex w-full cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-left outline-none hover:bg-zinc-100 focus-visible:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900 dark:focus-visible:bg-zinc-900"
                        >
                          <span className="mt-0.5 text-emerald-700 dark:text-emerald-300">
                            <TabIcon type={type} />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-sm">
                              {courseTabTypeLabels[type]}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {type === "ARTICLE" && articleOptions.length === 0
                                ? "в базе знаний пока нет статей"
                                : courseTabTypeHints[type]}
                            </span>
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {draft.steps.map((step, index) => {
              const isActive = step.id === activeTab?.id;

              return (
                <li key={step.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setActiveTabId(step.id)}
                    className={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-full px-3 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isActive
                        ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-zinc-500">
                      {index + 1}
                    </span>
                    <TabIcon type={step.type} />
                    <span className="min-w-0 max-w-48 truncate lg:max-w-none lg:flex-1">
                      {step.title || "Без названия"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {draft.steps.length === 0 ? (
            <p className="px-2 text-sm text-zinc-500 dark:text-zinc-400">
              {canManage
                ? "В курсе пока нет вкладок. Добавьте первую кнопкой «Вкладка»."
                : "В курсе пока нет вкладок."}
            </p>
          ) : null}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab ? (
            <>
              {canManage &&
              (activeTab.type === "TEXT" || activeTab.type === "TASK") ? (
                <div className="sticky top-24 z-[5] mb-3">
                  <FormatToolbar
                    commands={commands}
                    disabled={!canManage}
                    onError={setPageError}
                  />
                </div>
              ) : null}
              <article className="mx-auto max-w-3xl rounded-sm border border-zinc-200 bg-white px-6 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-14 sm:py-12">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    Вкладка{" "}
                    {draft.steps.findIndex((step) => step.id === activeTab.id) +
                      1}{" "}
                    из {draft.steps.length} ·{" "}
                    {courseTabTypeLabels[activeTab.type]}
                  </span>
                  {canManage ? (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Переместить вкладку выше"
                        disabled={draft.steps[0]?.id === activeTab.id}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            steps: moveCourseTab(
                              current.steps,
                              activeTab.id,
                              -1,
                            ),
                          }))
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900"
                      >
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Переместить вкладку ниже"
                        disabled={draft.steps.at(-1)?.id === activeTab.id}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            steps: moveCourseTab(
                              current.steps,
                              activeTab.id,
                              1,
                            ),
                          }))
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900"
                      >
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === activeTab.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => removeTab(activeTab.id)}
                            className="h-7 cursor-pointer rounded-md bg-red-600 px-2 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            Удалить вкладку
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-7 cursor-pointer rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label="Удалить вкладку"
                          onClick={() => setConfirmDeleteId(activeTab.id)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          <Trash aria-hidden="true" className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  ) : null}
                </div>

                <label htmlFor="course-tab-title" className="sr-only">
                  Название вкладки
                </label>
                <input
                  id="course-tab-title"
                  key={`title-${activeTab.id}`}
                  value={activeTab.title}
                  readOnly={!canManage}
                  onChange={(event) =>
                    updateTab(activeTab.id, { title: event.target.value })
                  }
                  placeholder="Название вкладки"
                  className="mb-4 w-full bg-transparent! text-2xl font-semibold leading-9 text-zinc-950 outline-none placeholder:text-zinc-400 focus-visible:ring-0 dark:text-zinc-50 sm:text-[28px]"
                />

                {activeTab.type === "TASK" ? (
                  <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                    <CheckSquare
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0"
                    />
                    <p>
                      <b>Задание.</b> Сотрудник выполняет его на смене,
                      наставник отмечает выполнение в профиле обучения.
                    </p>
                  </div>
                ) : null}

                {activeTab.type === "TEXT" || activeTab.type === "TASK" ? (
                  canManage ? (
                    <EditablePage
                      key={activeTab.id}
                      initialContent={activeTab.content}
                      placeholder={
                        activeTab.type === "TASK"
                          ? "Опишите, что нужно сделать и как наставник поймёт, что задание выполнено."
                          : "Начните писать: правила, порядок действий, картинки…"
                      }
                      onChange={(html) =>
                        updateTab(activeTab.id, { content: html })
                      }
                      onCommandsReady={setCommands}
                      onError={setPageError}
                    />
                  ) : (
                    <KnowledgeArticleRichText
                      value={activeTab.content}
                      className="text-[15px]"
                    />
                  )
                ) : null}

                {activeTab.type === "ARTICLE" ? (
                  <div className="space-y-4">
                    {canManage ? (
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          Статья из базы знаний
                        </span>
                        <select
                          value={activeTab.articleId ?? ""}
                          onChange={(event) => {
                            const option = articleOptions.find(
                              (item) => item.id === event.target.value,
                            );
                            updateTab(activeTab.id, {
                              articleId: event.target.value || null,
                              title:
                                option &&
                                (!activeTab.title.trim() ||
                                  articleOptions.some(
                                    (item) => item.title === activeTab.title,
                                  ) ||
                                  activeTab.title === "Статья из базы знаний")
                                  ? option.title
                                  : activeTab.title,
                            });
                          }}
                          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">Выберите статью</option>
                          {articleOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title} · {option.category}
                            </option>
                          ))}
                        </select>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          Статья вставляется целиком. Её правят в базе знаний, и
                          курс сразу показывает новую версию.
                        </span>
                      </label>
                    ) : null}
                    {activeTab.articleId ? (
                      articleById.get(activeTab.articleId) ? (
                        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                              Статья ·{" "}
                              {articleById.get(activeTab.articleId)?.folder}
                            </span>
                            <Link
                              href={`/staff/knowledge-base?articleId=${encodeURIComponent(activeTab.articleId)}`}
                              className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                            >
                              Открыть статью
                              <ArrowSquareOut
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                            </Link>
                          </div>
                          <KnowledgeArticleRichText
                            value={
                              articleById.get(activeTab.articleId)?.content ??
                              articleById.get(activeTab.articleId)?.summary
                            }
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          Текст статьи недоступен для вашей роли или клуба.
                        </p>
                      )
                    ) : null}
                  </div>
                ) : null}

                {activeTab.type === "LINK" ? (
                  <div className="space-y-4">
                    {canManage ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm font-medium">
                            Адрес ссылки
                          </span>
                          <input
                            type="url"
                            inputMode="url"
                            value={activeTab.url ?? ""}
                            onChange={(event) =>
                              updateTab(activeTab.id, {
                                url: event.target.value,
                              })
                            }
                            placeholder="https://"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm font-medium">
                            Что посмотреть по ссылке{" "}
                            <span className="font-normal text-zinc-500">
                              (необязательно)
                            </span>
                          </span>
                          <textarea
                            value={activeTab.content ?? ""}
                            onChange={(event) =>
                              updateTab(activeTab.id, {
                                content: event.target.value,
                              })
                            }
                            rows={3}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </label>
                      </>
                    ) : activeTab.content ? (
                      <p className="whitespace-pre-line text-[15px] leading-7">
                        {activeTab.content}
                      </p>
                    ) : null}
                    {activeTab.url && /^https?:\/\//i.test(activeTab.url) ? (
                      <a
                        href={activeTab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                      >
                        Открыть ссылку
                        <ArrowSquareOut
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {canManage ? (
                  <label className="mt-8 flex cursor-pointer items-center gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={activeTab.required}
                      onChange={(event) =>
                        updateTab(activeTab.id, {
                          required: event.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-emerald-600"
                    />
                    Обязательная вкладка
                  </label>
                ) : null}

                <p
                  role="alert"
                  className="mt-2 min-h-5 text-sm text-red-700 dark:text-red-300"
                >
                  {pageError}
                </p>
              </article>
            </>
          ) : (
            <div className="mx-auto max-w-3xl rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              {canManage
                ? "Добавьте первую вкладку: страницу с текстом, задание, статью из базы знаний или ссылку."
                : "В курсе пока нет вкладок."}
            </div>
          )}
        </div>
      </div>

      {canManage ? (
        <SidePanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Для кого курс"
          eyebrow="Настройки курса"
          footer={
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="h-10 w-full cursor-pointer rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Готово
            </button>
          }
        >
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Кому назначать</span>
              <select
                value={draft.roleScope}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    roleScope: event.target.value as LearningRoleScope,
                  }))
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {(
                  Object.keys(learningRoleScopeLabels) as LearningRoleScope[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {learningRoleScopeLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Клуб</span>
              <select
                value={draft.storeId}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    storeId: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {accessScope === "NETWORK" ? (
                  <option value="">Вся сеть</option>
                ) : null}
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Срок прохождения, дней
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.dueDays}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    dueDays: event.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                placeholder="без срока"
                aria-describedby="course-due-hint"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span
                id="course-due-hint"
                className="block text-xs text-zinc-500"
              >
                Считается от дня, когда сотруднику назначили курс. От 0 до 365.
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    required: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-emerald-600"
              />
              Обязательный курс
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Коротко о курсе</span>
              <textarea
                value={draft.description}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Состояние</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    status: event.target.value as CourseDraft["status"],
                  }))
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {(
                  Object.keys(courseStatusLabels) as CourseDraft["status"][]
                ).map((value) => (
                  <option key={value} value={value}>
                    {courseStatusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Изменения сохраняются сами. Назначить курс конкретным сотрудникам
              и отметить прохождение можно в «Профилях обучения».
            </p>
          </div>
        </SidePanel>
      ) : null}
    </main>
  );
}
