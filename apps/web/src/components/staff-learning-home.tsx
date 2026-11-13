"use client";

import {
  BookOpenText,
  Books,
  ChatsCircle,
  Exam,
  FileText,
  ListBullets,
  ListChecks,
  MagnifyingGlass,
  Megaphone,
  Plus,
  Scroll,
  SquaresFour,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  learningDocumentTypeLabels,
  learningTypeFilters,
  type LearningDocument,
  type LearningDocumentType,
  type LearningFilter,
  type LearningTemplate,
  type LearningThumbnailBlock,
} from "@/lib/learning-documents";

type Counts = Record<LearningFilter, number>;

const filterLabels: Record<LearningFilter, string> = {
  all: "Все",
  courses: "Курсы",
  regulations: "Регламенты",
  scripts: "Скрипты",
  checklists: "Чек-листы",
  articles: "Статьи",
  tests: "Тесты",
  drafts: "Черновики",
  "to-read": "Мне нужно прочитать",
};

const typeIcons: Record<
  LearningDocumentType,
  { icon: Icon; className: string }
> = {
  COURSE: {
    icon: Books,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  REGULATION: {
    icon: Scroll,
    className: "text-indigo-600 dark:text-indigo-400",
  },
  SCRIPT: {
    icon: ChatsCircle,
    className: "text-violet-600 dark:text-violet-400",
  },
  CHECKLIST: {
    icon: ListChecks,
    className: "text-teal-600 dark:text-teal-400",
  },
  ARTICLE: { icon: FileText, className: "text-sky-600 dark:text-sky-400" },
  NOTICE: {
    icon: Megaphone,
    className: "text-amber-600 dark:text-amber-400",
  },
  TEST: { icon: Exam, className: "text-rose-600 dark:text-rose-400" },
  ATTESTATION: { icon: Exam, className: "text-rose-600 dark:text-rose-400" },
};

const badgeClassNames = {
  green:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  gray: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

function homeHref(params: {
  type?: LearningFilter;
  q?: string;
  view?: "grid" | "list";
}) {
  const search = new URLSearchParams();

  if (params.type && params.type !== "all") {
    search.set("type", params.type);
  }

  if (params.q) {
    search.set("q", params.q);
  }

  if (params.view === "list") {
    search.set("view", "list");
  }

  const value = search.toString();
  return value ? `/staff/learning?${value}` : "/staff/learning";
}

function ThumbnailLine({ block }: { block: LearningThumbnailBlock }) {
  switch (block.kind) {
    case "title":
      return (
        <p className="mb-1.5 text-center text-[7px] font-bold uppercase leading-[9px] text-zinc-900 dark:text-zinc-100">
          {block.text}
        </p>
      );
    case "tabs":
      return (
        <p className="mb-1 truncate border-b border-zinc-200 text-[5.5px] leading-[8px] text-emerald-800 dark:border-zinc-700 dark:text-emerald-300">
          {block.text}
        </p>
      );
    case "heading":
      return (
        <p className="mb-0.5 mt-1 text-[6.5px] font-bold leading-[8px] text-zinc-900 dark:text-zinc-100">
          {block.text}
        </p>
      );
    case "item":
      return (
        <p className="pl-1.5 text-[5.5px] leading-[7.5px] text-zinc-600 dark:text-zinc-400">
          • {block.text}
        </p>
      );
    case "task":
      return (
        <p className="my-1 rounded-sm bg-emerald-100 px-1 py-0.5 text-[5.5px] leading-[7.5px] text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">
          {block.text}
        </p>
      );
    default:
      return (
        <p className="mb-1 text-[5.5px] leading-[7.5px] text-zinc-600 dark:text-zinc-400">
          {block.text}
        </p>
      );
  }
}

/** A tiny page with the document's first lines, like a document thumbnail. */
function PagePreview({
  blocks,
  className = "",
}: {
  blocks: LearningThumbnailBlock[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden bg-white px-3 pt-3 dark:bg-zinc-900 ${className}`}
    >
      {blocks.map((block, index) => (
        <ThumbnailLine key={index} block={block} />
      ))}
    </div>
  );
}

function TypeIcon({ type }: { type: LearningDocumentType }) {
  const { icon: TypeGlyph, className } = typeIcons[type];

  return (
    <TypeGlyph
      role="img"
      aria-label={learningDocumentTypeLabels[type]}
      className={`h-4 w-4 shrink-0 ${className}`}
      weight="duotone"
    />
  );
}

function Badge({ badge }: { badge: LearningDocument["badge"] }) {
  if (!badge) {
    return null;
  }

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClassNames[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

function newStepId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `step-${crypto.randomUUID()}`;
  }

  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function templateRequest(template: LearningTemplate, storeId: string | null) {
  switch (template.kind) {
    case "COURSE":
      return {
        url: "/api/staff/training-courses",
        failure: "Не удалось создать курс. Повторите ещё раз.",
        body: {
          title: template.course.title,
          description: template.course.description,
          roleScope: template.course.roleScope,
          status: "DRAFT",
          required: template.course.required,
          dueDays:
            template.course.dueDays === null
              ? null
              : String(template.course.dueDays),
          storeId,
          steps: template.course.steps.map((step) => ({
            id: newStepId(),
            title: step.title,
            type: step.type,
            articleId: null,
            content: step.content,
            url: null,
            required: true,
          })),
        },
      };
    case "TEST":
      return {
        url: "/api/staff/assessments",
        failure: "Не удалось создать тест. Повторите ещё раз.",
        body: {
          title: template.test.title,
          description: null,
          roleScope: template.test.roleScope,
          status: "DRAFT",
          assessmentKind: "TEST",
          storeId,
          questions: [],
        },
      };
    default:
      return {
        url: "/api/staff/knowledge-base",
        failure: "Не удалось создать документ. Повторите ещё раз.",
        body: {
          kind: "ARTICLE",
          title: template.article.title,
          summary: template.article.summary,
          content: template.article.content || null,
          folder: template.article.folder,
          category: template.article.category,
          roleScope: template.article.roleScope,
          status: "DRAFT",
          templateKey: template.article.templateKey,
          requiresReading: false,
          revisionSlaDays: null,
          storeId,
          tags: [],
          materials: [],
          relatedLinks: [],
          approvalNote: null,
        },
      };
  }
}

async function createFromTemplate(
  template: LearningTemplate,
  storeId: string | null,
) {
  const request = templateRequest(template, storeId);
  const response = await fetch(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(data?.message ?? request.failure);
  }

  const created = (await response.json()) as { id: string };
  const id = encodeURIComponent(created.id);

  switch (template.kind) {
    case "COURSE":
      return `/staff/learning/courses/${id}`;
    case "TEST":
      return `/staff/assessments?assessmentId=${id}`;
    default:
      return `/staff/learning/articles/${id}`;
  }
}

function TemplateRow({
  templates,
  defaultStoreId,
}: {
  templates: LearningTemplate[];
  defaultStoreId: string | null;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(template: LearningTemplate) {
    if (pendingKey) {
      return;
    }

    setPendingKey(template.key);
    setError(null);

    try {
      router.push(await createFromTemplate(template, defaultStoreId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать.",
      );
      setPendingKey(null);
    }
  }

  return (
    <section
      aria-labelledby="learning-create-title"
      className="border-b border-zinc-200 bg-zinc-100/70 py-5 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="learning-create-title"
          className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Создать
        </h2>
        <ul className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {templates.map((template) => {
            const isPending = pendingKey === template.key;

            return (
              <li key={template.key} className="w-28 shrink-0 sm:w-[7.5rem]">
                <button
                  type="button"
                  onClick={() => void create(template)}
                  disabled={pendingKey !== null}
                  aria-busy={isPending}
                  className="group flex w-full cursor-pointer flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:cursor-wait dark:focus-visible:ring-offset-zinc-900"
                >
                  <span className="relative block h-36 overflow-hidden rounded border border-zinc-300 bg-white transition group-hover:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 sm:h-40">
                    {template.thumbnail.length === 0 ? (
                      <span className="flex h-full items-center justify-center">
                        <Plus
                          aria-hidden="true"
                          className="h-11 w-11 text-emerald-600"
                          weight="bold"
                        />
                      </span>
                    ) : (
                      <PagePreview blocks={template.thumbnail} />
                    )}
                    {isPending ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200">
                        Создаём…
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium leading-4 text-zinc-900 dark:text-zinc-100">
                      {template.name}
                    </span>
                    <span className="block text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                      {template.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      </div>
    </section>
  );
}

function DocumentCard({ document }: { document: LearningDocument }) {
  return (
    <Link
      href={document.href}
      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white outline-none transition hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500"
    >
      <span className="block border-b border-zinc-200 dark:border-zinc-800">
        <PagePreview blocks={document.thumbnail} className="h-36 sm:h-40" />
      </span>
      <span className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
        <span
          className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
          title={document.title}
        >
          {document.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <TypeIcon type={document.type} />
          <span className="truncate">{document.meta}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge badge={document.badge} />
          <span
            className={`truncate text-xs ${
              document.noteTone === "attention"
                ? "font-medium text-amber-700 dark:text-amber-300"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
            title={document.note}
          >
            {document.note}
          </span>
        </span>
      </span>
    </Link>
  );
}

function DocumentRow({ document }: { document: LearningDocument }) {
  return (
    <li>
      <Link
        href={document.href}
        className="flex min-h-14 items-center gap-3 rounded-md px-3 py-2 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-900"
      >
        <TypeIcon type={document.type} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {document.title}
            </span>
            <Badge badge={document.badge} />
          </span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {document.meta}
          </span>
        </span>
        <span
          className={`hidden max-w-[40%] truncate text-xs sm:block ${
            document.noteTone === "attention"
              ? "font-medium text-amber-700 dark:text-amber-300"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {document.note}
        </span>
      </Link>
    </li>
  );
}

export function StaffLearningHome({
  documents,
  counts,
  filter,
  search,
  view,
  templates,
  defaultStoreId,
  loadFailed,
}: {
  documents: LearningDocument[];
  counts: Counts;
  filter: LearningFilter;
  search: string;
  view: "grid" | "list";
  templates: LearningTemplate[];
  defaultStoreId: string | null;
  loadFailed: boolean;
}) {
  // A type chip shows only when there is something of that type.
  const filters = (Object.keys(filterLabels) as LearningFilter[]).filter(
    (key) => !learningTypeFilters[key] || counts[key] > 0 || key === filter,
  );
  const isEmptyLibrary = counts.all === 0;

  return (
    <main className="min-h-dvh text-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <div className="flex items-center gap-2">
            <BookOpenText
              aria-hidden="true"
              className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
              weight="duotone"
            />
            <h1 className="text-xl font-semibold tracking-tight">
              Обучение и база знаний
            </h1>
          </div>
          <form
            role="search"
            action="/staff/learning"
            className="flex h-11 flex-1 items-center gap-2 rounded-full bg-zinc-100 px-4 focus-within:ring-2 focus-within:ring-emerald-500 dark:bg-zinc-900 sm:max-w-xl"
          >
            <MagnifyingGlass
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-zinc-500"
            />
            <label htmlFor="learning-search" className="sr-only">
              Поиск по документам
            </label>
            <input
              id="learning-search"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Поиск по документам"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
            />
            {filter !== "all" ? (
              <input type="hidden" name="type" value={filter} />
            ) : null}
            {view === "list" ? (
              <input type="hidden" name="view" value="list" />
            ) : null}
          </form>
        </div>
      </header>

      {templates.length > 0 ? (
        <TemplateRow templates={templates} defaultStoreId={defaultStoreId} />
      ) : null}

      <section
        aria-labelledby="learning-recent-title"
        className="mx-auto max-w-6xl px-4 py-5 sm:px-6"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2
            id="learning-recent-title"
            className="mr-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {search ? `Найдено по «${search}»` : "Недавние"}
          </h2>
          <nav aria-label="Что показать" className="flex flex-wrap gap-2">
            {filters.map((key) => {
              const isActive = filter === key;
              const highlight = key === "to-read" && counts[key] > 0;

              return (
                <Link
                  key={key}
                  href={homeHref({ type: key, q: search, view })}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-200"
                      : highlight
                        ? "border-amber-400 text-amber-800 hover:bg-amber-50 dark:border-amber-500/60 dark:text-amber-200 dark:hover:bg-amber-500/10"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {filterLabels[key]}
                  {key !== "all" ? (
                    <span className="ml-1.5 tabular-nums opacity-80">
                      {counts[key]}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={homeHref({ type: filter, q: search, view: "grid" })}
              aria-label="Плиткой"
              aria-current={view === "grid" ? "true" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                view === "grid"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <SquaresFour aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={homeHref({ type: filter, q: search, view: "list" })}
              aria-label="Списком"
              aria-current={view === "list" ? "true" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                view === "list"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <ListBullets aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {loadFailed ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            Часть документов не загрузилась.{" "}
            <Link
              href={homeHref({ type: filter, q: search, view })}
              className="font-semibold underline"
            >
              Повторить
            </Link>
          </div>
        ) : null}

        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
            <p className="text-base font-medium">
              {isEmptyLibrary
                ? "Здесь пока нет ни одного документа"
                : "Ничего не нашлось"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              {isEmptyLibrary
                ? templates.length > 0
                  ? "Начните с типа выше: например, «Регламент», «Чек-лист» или «Курс»."
                  : "Когда руководитель добавит регламенты и курсы, они появятся здесь."
                : filter === "to-read"
                  ? "Все обязательные статьи прочитаны."
                  : "Попробуйте другой запрос или покажите все документы."}
            </p>
            {!isEmptyLibrary && (filter !== "all" || search) ? (
              <Link
                href={homeHref({ view })}
                className="mt-4 inline-flex h-9 items-center rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Показать все
              </Link>
            ) : null}
          </div>
        ) : view === "list" ? (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {documents.map((document) => (
              <DocumentRow
                key={`${document.kind}-${document.id}`}
                document={document}
              />
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {documents.map((document) => (
              <li key={`${document.kind}-${document.id}`} className="min-w-0">
                <DocumentCard document={document} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
