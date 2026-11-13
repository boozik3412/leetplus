"use client";

import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  FileText,
  LinkSimple,
  ListBullets,
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
  articleAutosaveStatus,
  articleEditMode,
  articleNextSteps,
  articlePayload,
  articleSaveErrorMessage,
  articleSaveProblem,
  articleStatusLabels,
  type ArticleDraft,
  type ArticleRights,
  type ArticleStatus,
} from "@/lib/learning-article-editor";
import {
  learningRoleScopeLabels,
  type LearningRoleScope,
} from "@/lib/learning-documents";

export type ArticleEditorAttachment = {
  id: string;
  title: string;
  url: string | null;
  note: string | null;
};

export type ArticleEditorReading = {
  requiresReading: boolean;
  requiredCount: number;
  readCount: number;
  requiredByMe: boolean;
  readByMe: boolean;
};

type SaveState =
  | { kind: "saved"; at: string | null }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

type SavedArticle = {
  status?: ArticleStatus;
  updatedAt?: string;
  version?: number;
};

const AUTOSAVE_DELAY_MS = 1200;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

/** Headings of the page for the outline on the left, in order. */
function outlineOf(html: string) {
  const headings: Array<{ level: 2 | 3; text: string }> = [];
  const pattern = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    const text = match[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      headings.push({ level: match[1] === "2" ? 2 : 3, text });
    }
  }

  return headings;
}

export function StaffArticleDocumentEditor({
  articleId,
  initialDraft,
  initialStatus,
  initialUpdatedAt,
  version,
  publishedAt,
  rights,
  accessScope,
  stores,
  folders,
  attachments,
  reading,
}: {
  articleId: string;
  initialDraft: ArticleDraft;
  initialStatus: ArticleStatus;
  initialUpdatedAt: string;
  version: number;
  publishedAt: string | null;
  rights: ArticleRights;
  accessScope: "NETWORK" | "STORES";
  stores: Array<{ id: string; name: string }>;
  folders: string[];
  attachments: ArticleEditorAttachment[];
  reading: ArticleEditorReading;
}) {
  const [draft, setDraft] = useState<ArticleDraft>(initialDraft);
  const [status, setStatus] = useState<ArticleStatus>(initialStatus);
  const [currentVersion, setCurrentVersion] = useState(version);
  const [lastPublishedAt, setLastPublishedAt] = useState(publishedAt);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "saved",
    at: initialUpdatedAt,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commands, setCommands] = useState<PageCommands | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [readState, setReadState] = useState<
    "idle" | "pending" | "done" | "error"
  >(reading.readByMe ? "done" : "idle");

  const mode = articleEditMode(status, rights);
  const canChange = mode !== "read";
  const nextSteps = articleNextSteps(status, rights);

  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const draftRef = useRef(draft);
  const statusRef = useRef(status);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const update = useCallback(
    (recipe: (current: ArticleDraft) => ArticleDraft) => {
      setDraft((current) => recipe(current));
      versionRef.current += 1;
      setSaveState({ kind: "pending" });
    },
    [],
  );

  /** Sends the draft; with a target status it also moves the article on. */
  const send = useCallback(
    async (target?: ArticleStatus) => {
      if (savingRef.current) {
        return false;
      }

      const current = draftRef.current;
      const problem = articleSaveProblem(
        current,
        target === "PUBLISHED" ? "publish" : "save",
      );

      if (problem) {
        setSaveState({ kind: "blocked", message: problem });
        return false;
      }

      const version = versionRef.current;
      const nextStatus =
        target ?? articleAutosaveStatus(statusRef.current, rights);
      savingRef.current = true;
      setSaveState({ kind: "saving" });

      try {
        const response = await fetch(
          `/api/staff/knowledge-base/${encodeURIComponent(articleId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              articlePayload(
                {
                  ...current,
                  content: sanitizeKnowledgeContentHtml(current.content),
                },
                nextStatus,
              ),
            ),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(articleSaveErrorMessage(data?.message));
        }

        const saved = (await response.json()) as SavedArticle;
        savedVersionRef.current = version;

        if (saved.status) {
          setStatus(saved.status);
        }

        if (typeof saved.version === "number") {
          setCurrentVersion(saved.version);
        }

        if (nextStatus === "PUBLISHED") {
          setLastPublishedAt(new Date().toISOString());
        }

        setSaveState(
          versionRef.current === version
            ? { kind: "saved", at: saved.updatedAt ?? new Date().toISOString() }
            : { kind: "pending" },
        );
        return true;
      } catch (caught) {
        setSaveState({
          kind: "error",
          message:
            caught instanceof Error
              ? caught.message
              : "Не удалось сохранить. Проверьте соединение.",
        });
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [articleId, rights],
  );

  useEffect(() => {
    if (
      mode !== "autosave" ||
      saveState.kind !== "pending" ||
      versionRef.current === savedVersionRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => void send(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [mode, send, saveState, draft]);

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

  async function markRead() {
    setReadState("pending");

    try {
      const response = await fetch(
        `/api/staff/knowledge-base/${encodeURIComponent(articleId)}/read-receipts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: "Прочитано в «Обучении и базе знаний»",
          }),
        },
      );
      setReadState(response.ok ? "done" : "error");
    } catch {
      setReadState("error");
    }
  }

  const dirty = saveState.kind !== "saved";
  const saveLabel =
    mode === "publish"
      ? saveState.kind === "saving"
        ? "Публикуем…"
        : saveState.kind === "saved"
          ? `Версия ${currentVersion}${
              lastPublishedAt
                ? ` · опубликована ${formatDate(lastPublishedAt)}`
                : ""
            }`
          : saveState.kind === "pending"
            ? draft.requiresReading
              ? "Есть неопубликованные изменения. После публикации статью прочитают заново."
              : "Есть неопубликованные изменения"
            : `Не опубликовано: ${saveState.message}`
      : saveState.kind === "saved"
        ? saveState.at
          ? `Все изменения сохранены в ${formatSavedTime(saveState.at)}`
          : "Все изменения сохранены"
        : saveState.kind === "saving"
          ? "Сохраняем…"
          : saveState.kind === "pending"
            ? "Есть несохранённые изменения"
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
    draft.folder.trim() || "Общие",
    draft.requiresReading ? "прочитать обязательно" : "для справки",
  ].join(" · ");

  const outline = outlineOf(draft.content);

  function scrollToHeading(index: number) {
    const headings = document.querySelectorAll<HTMLElement>(
      "[data-article-page] h2, [data-article-page] h3",
    );
    const nonEmpty = Array.from(headings).filter((heading) =>
      heading.textContent?.trim(),
    );
    nonEmpty[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
          <FileText
            aria-hidden="true"
            className="h-7 w-7 text-sky-600 dark:text-sky-400"
            weight="duotone"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label htmlFor="article-title" className="sr-only">
                Название статьи
              </label>
              <input
                id="article-title"
                value={draft.title}
                readOnly={!canChange}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Название статьи"
                className="min-w-[8rem] max-w-full rounded-md bg-transparent! px-1 text-lg font-medium [field-sizing:content] outline-none hover:bg-zinc-100! focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-900! sm:max-w-md"
              />
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  status === "PUBLISHED"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : status === "RETURNED" || status === "REVIEW"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {articleStatusLabels[status]}
              </span>
            </div>
            {canChange ? (
              <p
                role="status"
                aria-live="polite"
                className={`truncate px-1 text-xs ${saveTone}`}
                title={saveLabel}
              >
                {saveLabel}
                {saveState.kind === "error" && mode === "autosave" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => void send()}
                      className="cursor-pointer font-semibold underline"
                    >
                      Повторить
                    </button>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="truncate px-1 text-xs text-zinc-500 dark:text-zinc-400">
                {status === "PUBLISHED"
                  ? `Версия ${currentVersion}${
                      lastPublishedAt
                        ? ` · опубликована ${formatDate(lastPublishedAt)}`
                        : ""
                    }`
                  : articleStatusLabels[status]}
              </p>
            )}
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {canChange ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="h-9 max-w-full cursor-pointer truncate rounded-full border border-zinc-300 px-3 text-left text-[13px] text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 sm:max-w-sm"
                title={`Для кого: ${audience}`}
              >
                Для кого: {audience}
              </button>
            ) : (
              <p className="max-w-full truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                Для кого: {audience}
              </p>
            )}
            {mode === "publish" ? (
              <button
                type="button"
                disabled={!dirty || saveState.kind === "saving"}
                onClick={() => void send("PUBLISHED")}
                className="h-9 cursor-pointer rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
              >
                Опубликовать изменения
              </button>
            ) : null}
            {mode !== "publish"
              ? nextSteps.map((step) => (
                  <button
                    key={step.status}
                    type="button"
                    disabled={saveState.kind === "saving"}
                    onClick={() => void send(step.status)}
                    className={
                      step.primary
                        ? "h-9 cursor-pointer rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        : "h-9 cursor-pointer rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }
                  >
                    {step.label}
                  </button>
                ))
              : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-start">
        <nav
          aria-label="Содержание статьи"
          className="hidden lg:sticky lg:top-24 lg:block lg:w-64 lg:shrink-0"
        >
          <h2 className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold">
            <ListBullets aria-hidden="true" className="h-4 w-4" />
            Содержание
          </h2>
          {outline.length > 0 ? (
            <ol className="space-y-0.5">
              {outline.map((heading, index) => (
                <li key={`${index}-${heading.text}`}>
                  <button
                    type="button"
                    onClick={() => scrollToHeading(index)}
                    className={`w-full cursor-pointer truncate rounded-md py-1.5 pr-2 text-left text-[13px] text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-900 ${
                      heading.level === 2 ? "pl-2" : "pl-6"
                    }`}
                  >
                    {heading.text}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-2 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
              {canChange
                ? "Заголовки статьи появятся здесь. Выберите «Заголовок 1» в стиле текста."
                : "В статье нет заголовков."}
            </p>
          )}
        </nav>

        <div className="min-w-0 flex-1">
          {canChange ? (
            <div className="sticky top-24 z-[5] mb-3">
              <FormatToolbar
                commands={commands}
                disabled={!canChange}
                onError={setPageError}
              />
            </div>
          ) : null}
          {pageError ? (
            <p
              role="alert"
              className="mx-auto mb-3 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            >
              {pageError}
            </p>
          ) : null}
          <article className="mx-auto max-w-3xl rounded-sm border border-zinc-200 bg-white px-6 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-14 sm:py-12">
            <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
              {draft.folder.trim() || "Общие"} · {articleStatusLabels[status]}
            </p>
            {canChange ? (
              <>
                <label htmlFor="article-summary" className="sr-only">
                  Коротко о статье
                </label>
                <textarea
                  id="article-summary"
                  value={draft.summary}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                  rows={1}
                  placeholder="Коротко о статье: о чём она и кому нужна"
                  className="mb-4 w-full resize-none border-0 bg-transparent! p-0 text-[15px] leading-6 text-zinc-600 outline-none [field-sizing:content] placeholder:text-zinc-400 dark:text-zinc-400"
                />
                <div data-article-page>
                  <EditablePage
                    initialContent={draft.content}
                    placeholder="Начните писать: правила, порядок действий, картинки…"
                    label="Текст статьи"
                    onChange={(html) =>
                      update((current) => ({ ...current, content: html }))
                    }
                    onCommandsReady={setCommands}
                    onError={setPageError}
                  />
                </div>
              </>
            ) : (
              <>
                {draft.summary.trim() ? (
                  <p className="mb-4 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
                    {draft.summary}
                  </p>
                ) : null}
                <div data-article-page>
                  <KnowledgeArticleRichText
                    value={draft.content}
                    className="text-[15px]"
                  />
                </div>
              </>
            )}

            {attachments.length > 0 ? (
              <section className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h2 className="mb-2 text-sm font-semibold">
                  Материалы и ссылки
                </h2>
                <ul className="space-y-1.5">
                  {attachments.map((item) => (
                    <li key={item.id} className="text-sm">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                        >
                          <LinkSimple aria-hidden="true" className="h-4 w-4" />
                          {item.title}
                        </a>
                      ) : (
                        <span className="font-medium">{item.title}</span>
                      )}
                      {item.note ? (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {" "}
                          · {item.note}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canChange ? (
                  <Link
                    href={`/staff/knowledge-base?articleId=${encodeURIComponent(articleId)}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                  >
                    Материалы правятся в прежнем редакторе
                    <ArrowSquareOut
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  </Link>
                ) : null}
              </section>
            ) : null}

            {status === "PUBLISHED" && reading.requiresReading ? (
              <section className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
                {reading.requiredByMe ? (
                  readState === "done" ? (
                    <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle
                        aria-hidden="true"
                        className="h-5 w-5"
                        weight="fill"
                      />
                      Вы прочитали эту версию
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={readState === "pending"}
                        onClick={() => void markRead()}
                        className="h-10 cursor-pointer rounded-full bg-emerald-600 px-4 font-semibold text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
                      >
                        Отметить прочитанным
                      </button>
                      {readState === "error" ? (
                        <span
                          role="alert"
                          className="text-amber-700 dark:text-amber-300"
                        >
                          Не удалось отметить. Попробуйте ещё раз.
                        </span>
                      ) : null}
                    </>
                  )
                ) : null}
                {rights.canManage ? (
                  <p className="text-zinc-500 dark:text-zinc-400">
                    Прочитали {reading.readCount} из {reading.requiredCount}
                  </p>
                ) : null}
              </section>
            ) : null}
          </article>
        </div>
      </div>

      {canChange ? (
        <SidePanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Для кого статья"
          eyebrow="Настройки статьи"
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
              <span className="text-sm font-medium">Кому она нужна</span>
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
                {accessScope === "NETWORK" || !draft.storeId ? (
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
              <span className="text-sm font-medium">Папка</span>
              <input
                value={draft.folder}
                list="article-folders"
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    folder: event.target.value,
                  }))
                }
                placeholder="Общие"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <datalist id="article-folders">
                {folders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.requiresReading}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    requiresReading: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span>
                Обязательно прочитать
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  Сотрудники из списка «Кому» увидят статью в «Мне нужно
                  прочитать» и отметят прочтение.
                </span>
              </span>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {mode === "publish"
                ? "Изменения настроек тоже вступят в силу после кнопки «Опубликовать изменения»."
                : "Изменения сохраняются сами."}
            </p>
          </div>
        </SidePanel>
      ) : null}
    </main>
  );
}
