"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";

type RichTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; alt: string; url: string };

export type KnowledgeReadingWindowMetric = {
  label: string;
  value: string;
};

export type KnowledgeReadingWindowMaterial = {
  id: string;
  title: string;
  type: string;
  typeLabel: string;
  url?: string | null;
  content?: string | null;
  note?: string | null;
  required?: boolean;
};

export type KnowledgeReadingWindowLink = {
  id: string;
  title: string;
  typeLabel: string;
  url?: string | null;
  note?: string | null;
};

export type KnowledgeReadingWindowData = {
  id?: string | null;
  eyebrow?: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  metrics?: KnowledgeReadingWindowMetric[];
  tags?: string[];
  materials?: KnowledgeReadingWindowMaterial[];
  relatedLinks?: KnowledgeReadingWindowLink[];
  reading?: {
    requiresReading: boolean;
    requiredByMe: boolean;
    readByMe: boolean;
    readAt?: string | null;
    readCount: number;
    requiredCount: number;
    pendingCount: number;
  };
  edit?: {
    articleId?: string | null;
    label?: string;
    mode?: "opener" | "inline";
  };
};

function isSafeUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url) {
    return false;
  }

  return (
    url.startsWith("/") ||
    /^https?:\/\//i.test(url) ||
    /^mailto:/i.test(url)
  );
}

function isSafeImageUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url) {
    return false;
  }

  return url.startsWith("/") || /^https?:\/\//i.test(url);
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string | null | undefined) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function parseRichText(value: string | null | undefined): RichTextBlock[] {
  const lines = (value ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: RichTextBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "image",
        alt: imageMatch[1] ?? "",
        url: imageMatch[2] ?? "",
      });
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length >= 3 ? 3 : 2,
        text: headingMatch[2],
      });
      return;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      list.push(listMatch[1]);
      return;
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quoteMatch[1] });
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (linkMatch && isSafeUrl(linkMatch[2])) {
      const href = linkMatch[2].trim();
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={href}
          target={href.startsWith("/") ? undefined : "_blank"}
          rel={href.startsWith("/") ? undefined : "noreferrer"}
          className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-600 dark:text-emerald-300"
        >
          {linkMatch[1]}
        </a>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`bold-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={`italic-${match.index}`}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderInlineHtml(text: string) {
  return escapeHtml(text).replace(
    /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g,
    (token) => {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

      if (linkMatch && isSafeUrl(linkMatch[2])) {
        const href = linkMatch[2].trim();
        const target = href.startsWith("/") ? "" : ' target="_blank" rel="noreferrer"';

        return `<a href="${escapeAttribute(href)}"${target}>${escapeHtml(linkMatch[1])}</a>`;
      }

      if (token.startsWith("**") && token.endsWith("**")) {
        return `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
      }

      if (token.startsWith("*") && token.endsWith("*")) {
        return `<em>${escapeHtml(token.slice(1, -1))}</em>`;
      }

      return token;
    },
  );
}

export function KnowledgeArticleRichText({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const blocks = parseRichText(value);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div
      className={["space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300", className]
        .filter(Boolean)
        .join(" ")}
    >
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 2 ? "h3" : "h4";

          return (
            <Tag
              key={`heading-${index}`}
              className="pt-2 text-base font-semibold text-zinc-950 dark:text-zinc-100"
            >
              {renderInline(block.text)}
            </Tag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={`quote-${index}`}
              className="border-l-4 border-emerald-300 bg-emerald-50/60 px-3 py-2 text-zinc-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-zinc-200"
            >
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "image") {
          if (!isSafeImageUrl(block.url)) {
            return (
              <p key={`image-${index}`} className="text-xs text-zinc-500">
                {block.alt || "Изображение"}: некорректная ссылка
              </p>
            );
          }

          return (
            <figure key={`image-${index}`} className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
              <img
                src={block.url}
                alt={block.alt || "Изображение статьи"}
                className="max-h-[520px] w-full object-contain"
                loading="lazy"
              />
              {block.alt ? (
                <figcaption className="px-3 py-2 text-xs text-zinc-500">
                  {block.alt}
                </figcaption>
              ) : null}
            </figure>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function richTextToHtml(value: string | null | undefined) {
  const blocks = parseRichText(value);

  if (blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => {
      if (block.type === "heading") {
        const tag = block.level === 2 ? "h2" : "h3";
        return `<${tag}>${renderInlineHtml(block.text)}</${tag}>`;
      }

      if (block.type === "quote") {
        return `<blockquote>${renderInlineHtml(block.text)}</blockquote>`;
      }

      if (block.type === "list") {
        return `<ul>${block.items
          .map((item) => `<li>${renderInlineHtml(item)}</li>`)
          .join("")}</ul>`;
      }

      if (block.type === "image") {
        if (!isSafeImageUrl(block.url)) {
          return "";
        }

        return `<figure><img src="${escapeAttribute(block.url)}" alt="${escapeAttribute(
          block.alt || "Изображение статьи",
        )}" loading="lazy"/>${block.alt ? `<figcaption>${escapeHtml(block.alt)}</figcaption>` : ""}</figure>`;
      }

      return `<p>${renderInlineHtml(block.text)}</p>`;
    })
    .join("");
}

export function StaffKnowledgeRichTextEditor({
  value,
  onChange,
  onImageUploaded,
}: {
  value: string;
  onChange: (value: string) => void;
  onImageUploaded?: (attachment: StaffAttachmentUploadResult) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: value.length, end: value.length, scrollTop: 0 });

  function rememberSelection() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    };
  }

  function keepTextareaSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    rememberSelection();
  }

  function replaceSelection(
    formatter: (selected: string) => string,
    fallback: string,
  ) {
    const textarea = textareaRef.current;
    const selection = textarea
      ? {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
          scrollTop: textarea.scrollTop,
        }
      : selectionRef.current;
    const start = Math.min(selection.start, value.length);
    const end = Math.min(selection.end, value.length);
    const selected = value.slice(start, end);
    const replacement = formatter(selected || fallback);
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    const hasSelectedText = end > start;
    const nextSelectionStart = hasSelectedText ? start : start + replacement.length;
    const nextSelectionEnd = hasSelectedText
      ? start + replacement.length
      : nextSelectionStart;

    onChange(nextValue);
    window.requestAnimationFrame(() => {
      if (!textarea) {
        return;
      }

      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      textarea.scrollTop = selection.scrollTop;
      selectionRef.current = {
        start: nextSelectionStart,
        end: nextSelectionEnd,
        scrollTop: selection.scrollTop,
      };
    });
  }

  function prefixLines(prefix: string, fallback: string) {
    replaceSelection(
      (selected) =>
        selected
          .split("\n")
          .map((line) => (line.trim() ? `${prefix}${line}` : line))
          .join("\n"),
      fallback,
    );
  }

  function insertSnippet(snippet: string) {
    replaceSelection(() => snippet, snippet);
  }

  function insertLink() {
    const href = window.prompt("Ссылка", "https://");

    if (!href) {
      return;
    }

    replaceSelection((selected) => `[${selected}](${href})`, "текст ссылки");
  }

  function handleImageUploaded(attachment: StaffAttachmentUploadResult) {
    insertSnippet(`![${attachment.fileName}](${attachment.url})`);
    onImageUploaded?.(attachment);
  }

  return (
    <div className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={() => prefixLines("## ", "Заголовок")}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-bold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Заголовок"
        >
          H2
        </button>
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={() => replaceSelection((selected) => `**${selected}**`, "важный текст")}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-bold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Жирный"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={() => replaceSelection((selected) => `*${selected}*`, "акцент")}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold italic transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Курсив"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={() => prefixLines("- ", "Пункт списка")}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Список"
        >
          Список
        </button>
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={() => prefixLines("> ", "Важная заметка")}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Цитата"
        >
          Цитата
        </button>
        <button
          type="button"
          onMouseDown={keepTextareaSelection}
          onClick={insertLink}
          className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Ссылка"
        >
          Ссылка
        </button>
        <StaffAttachmentUpload
          label="Вставить картинку"
          buttonLabel="Картинка"
          accept="image/*"
          compressImages
          className="[&>button]:h-8"
          onUploaded={handleImageUploaded}
        />
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onSelect={rememberSelection}
        rows={10}
        placeholder="Стандарт, инструкция, порядок действий или короткий учебный материал."
        className="min-h-72 w-full resize-y rounded-b-lg bg-white px-3 py-2 text-sm leading-6 outline-none dark:bg-zinc-950"
      />
    </div>
  );
}

function renderMaterialHtml(material: KnowledgeReadingWindowMaterial) {
  const image =
    material.type === "IMAGE" && isSafeImageUrl(material.url)
      ? `<img class="material-image" src="${escapeAttribute(material.url)}" alt="${escapeAttribute(
          material.title || "Изображение",
        )}" loading="lazy"/>`
      : "";
  const link = material.url
    ? `<a href="${escapeAttribute(material.url)}" target="_blank" rel="noreferrer">Открыть материал</a>`
    : "";

  return `<article class="card"><div class="card-head"><strong>${escapeHtml(
    material.title || "Материал",
  )}</strong><span>${escapeHtml(material.typeLabel)}</span>${
    material.required ? "<span>обязательно</span>" : ""
  }</div>${image}${material.content ? `<p>${escapeHtml(material.content).replace(/\n/g, "<br/>")}</p>` : ""}${link}${
    material.note ? `<small>${escapeHtml(material.note)}</small>` : ""
  }</article>`;
}

function renderLinkHtml(link: KnowledgeReadingWindowLink) {
  const href = link.url && isSafeUrl(link.url) ? link.url : null;
  const target = href?.startsWith("/") ? "" : ' target="_blank" rel="noreferrer"';

  return `<article class="card"><div class="card-head"><strong>${escapeHtml(
    link.title || "Связанный материал",
  )}</strong><span>${escapeHtml(link.typeLabel)}</span></div>${
    link.note ? `<p>${escapeHtml(link.note)}</p>` : ""
  }${href ? `<a href="${escapeAttribute(href)}"${target}>Открыть связанный раздел</a>` : ""}</article>`;
}

function buildReadingWindowHtml(data: KnowledgeReadingWindowData) {
  const metrics = data.metrics ?? [];
  const tags = data.tags ?? [];
  const materials = data.materials ?? [];
  const links = data.relatedLinks ?? [];
  const editMode = data.edit?.mode ?? "opener";
  const editButton = data.edit
    ? `<button id="edit-article" type="button">${escapeHtml(data.edit.label ?? "Редактировать")}</button>`
    : "";
  const inlineEditor =
    editMode === "inline"
      ? `<section id="inline-editor" class="editor hidden" aria-label="Редактирование предпросмотра">
      <label>Название<input id="edit-title" type="text" value="${escapeAttribute(data.title || "")}" /></label>
      <label>Кратко<textarea id="edit-summary" rows="3">${escapeHtml(data.summary ?? "")}</textarea></label>
      <div class="editor-toolbar" aria-label="Форматирование текста">
        <button type="button" data-format="heading">H2</button>
        <button type="button" data-format="bold">B</button>
        <button type="button" data-format="italic">I</button>
        <button type="button" data-format="list">Список</button>
        <button type="button" data-format="quote">Цитата</button>
        <button type="button" data-format="link">Ссылка</button>
      </div>
      <label>Основной текст<textarea id="edit-content" rows="18">${escapeHtml(data.content ?? "")}</textarea></label>
      <div class="editor-actions">
        <button id="apply-preview-edit" type="button">Применить</button>
        <button id="cancel-preview-edit" type="button">Отмена</button>
      </div>
      <p id="edit-status"></p>
    </section>`
      : "";
  const readButton =
    data.id && data.reading?.requiresReading && data.reading.requiredByMe && !data.reading.readByMe
      ? `<button id="mark-read" type="button">Отметить прочтение</button>`
      : "";
  const readingSummary = data.reading?.requiresReading
    ? `<section class="reading"><strong>${
        data.reading.readByMe ? "Прочитано" : "Требует прочтения"
      }</strong><span>Прочитали ${data.reading.readCount}/${data.reading.requiredCount}; ждут ${data.reading.pendingCount}</span>${readButton}<p id="read-status"></p></section>`
    : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.title || "Статья базы знаний")}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #18181b; background: #f7f7f4; }
    body { margin: 0; padding: 32px 18px; }
    main { max-width: 860px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; background: #fff; padding: 32px; box-shadow: 0 16px 40px rgba(24,24,27,.08); }
    .eyebrow { margin: 0 0 8px; color: #047857; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 34px; line-height: 1.15; }
    .summary { margin-top: 18px; padding: 14px 16px; border: 1px solid #e4e4e7; border-radius: 10px; background: #fafafa; color: #52525b; line-height: 1.65; }
    .metrics, .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .metrics span, .tags span, .card-head span { border-radius: 999px; background: #f4f4f5; padding: 6px 10px; color: #52525b; font-size: 12px; font-weight: 700; }
    .body { margin-top: 24px; line-height: 1.75; font-size: 16px; }
    .body h2 { margin: 28px 0 10px; font-size: 22px; }
    .body h3 { margin: 22px 0 8px; font-size: 18px; }
    .body p { margin: 0 0 14px; }
    .body blockquote { margin: 18px 0; border-left: 4px solid #34d399; background: #ecfdf5; padding: 12px 16px; color: #3f3f46; }
    .body img, .material-image { display: block; max-width: 100%; max-height: 620px; object-fit: contain; margin: 0 auto; border-radius: 10px; }
    figure { margin: 20px 0; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; background: #fafafa; }
    figcaption { padding: 10px 14px; color: #71717a; font-size: 12px; }
    a { color: #047857; font-weight: 700; }
    .section-title { margin: 28px 0 10px; color: #71717a; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .card { border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px; margin-top: 10px; }
    .card p { color: #52525b; line-height: 1.6; }
    .card small { display: block; margin-top: 8px; color: #71717a; }
    .card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .reading { display: grid; gap: 8px; margin-top: 18px; border: 1px solid #a7f3d0; border-radius: 10px; background: #ecfdf5; padding: 14px; color: #065f46; }
    .top-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .hidden { display: none !important; }
    #edit-article { width: fit-content; border: 1px solid #10b981; border-radius: 8px; background: #10b981; padding: 10px 14px; color: #052e16; font-weight: 800; cursor: pointer; }
    #mark-read { width: fit-content; border: 0; border-radius: 8px; background: #10b981; padding: 10px 14px; color: #052e16; font-weight: 800; cursor: pointer; }
    .editor { display: grid; gap: 12px; margin-top: 20px; border: 1px solid #a7f3d0; border-radius: 12px; background: #f0fdf4; padding: 16px; }
    .editor label { display: grid; gap: 6px; color: #3f3f46; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .editor input, .editor textarea { width: 100%; box-sizing: border-box; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; padding: 10px 12px; color: #18181b; font: 14px/1.55 Inter, Arial, sans-serif; outline: none; text-transform: none; }
    .editor textarea { resize: vertical; }
    .editor-toolbar, .editor-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .editor-toolbar button, .editor-actions button { border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; padding: 9px 12px; color: #18181b; font-weight: 800; cursor: pointer; }
    #apply-preview-edit { border-color: #10b981; background: #10b981; color: #052e16; }
    #edit-status { margin: 0; color: #047857; font-size: 13px; font-weight: 700; }
    #read-status { margin: 0; font-size: 13px; }
    @media print { body { background: #fff; padding: 0; } main { box-shadow: none; border: 0; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">${escapeHtml(data.eyebrow ?? "База знаний")}</p>
    <h1 id="article-title">${escapeHtml(data.title || "Новая статья")}</h1>
    ${editButton ? `<div class="top-actions">${editButton}</div>` : ""}
    <div id="article-summary" class="summary${data.summary ? "" : " hidden"}">${escapeHtml(data.summary)}</div>
    ${metrics.length > 0 ? `<div class="metrics">${metrics
      .map((metric) => `<span>${escapeHtml(metric.label)}: ${escapeHtml(metric.value)}</span>`)
      .join("")}</div>` : ""}
    ${readingSummary}
    ${tags.length > 0 ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    <section id="article-body" class="body${data.content ? "" : " hidden"}">${data.content ? richTextToHtml(data.content) : ""}</section>
    ${inlineEditor}
    ${materials.length > 0 ? `<h2 class="section-title">Материалы</h2>${materials.map(renderMaterialHtml).join("")}` : ""}
    ${links.length > 0 ? `<h2 class="section-title">Связанные разделы</h2>${links.map(renderLinkHtml).join("")}` : ""}
  </main>
</body>
</html>`;
}

function wireKnowledgeReadingWindow(
  popup: Window,
  data: KnowledgeReadingWindowData,
) {
  const doc = popup.document;
  const editMode = data.edit?.mode ?? "opener";
  const editableDraft = {
    articleId: data.edit?.articleId ?? data.id ?? null,
    title: data.title ?? "",
    summary: data.summary ?? "",
    content: data.content ?? "",
  };
  let currentDraft = editableDraft;
  const editButton = doc.getElementById("edit-article") as HTMLButtonElement | null;
  const readButton = doc.getElementById("mark-read") as HTMLButtonElement | null;
  const readStatus = doc.getElementById("read-status");
  const inlineEditor = doc.getElementById("inline-editor");
  const editTitle = doc.getElementById("edit-title") as HTMLInputElement | null;
  const editSummary = doc.getElementById("edit-summary") as HTMLTextAreaElement | null;
  const editContent = doc.getElementById("edit-content") as HTMLTextAreaElement | null;
  const applyPreviewEdit = doc.getElementById(
    "apply-preview-edit",
  ) as HTMLButtonElement | null;
  const cancelPreviewEdit = doc.getElementById(
    "cancel-preview-edit",
  ) as HTMLButtonElement | null;
  const editStatus = doc.getElementById("edit-status");
  const articleTitle = doc.getElementById("article-title");
  const articleSummary = doc.getElementById("article-summary");
  const articleBody = doc.getElementById("article-body");

  function setPreviewValue(nextDraft: typeof editableDraft) {
    currentDraft = nextDraft;

    if (articleTitle) {
      articleTitle.textContent = nextDraft.title || "Новая статья";
    }

    popup.document.title = nextDraft.title || "Статья базы знаний";

    if (articleSummary) {
      if (nextDraft.summary) {
        articleSummary.textContent = nextDraft.summary;
        articleSummary.classList.remove("hidden");
      } else {
        articleSummary.textContent = "";
        articleSummary.classList.add("hidden");
      }
    }

    if (articleBody) {
      if (nextDraft.content) {
        articleBody.innerHTML = richTextToHtml(nextDraft.content);
        articleBody.classList.remove("hidden");
      } else {
        articleBody.innerHTML = "";
        articleBody.classList.add("hidden");
      }
    }
  }

  function showInlineEditor() {
    if (!inlineEditor || !editTitle || !editSummary || !editContent) {
      return;
    }

    editTitle.value = currentDraft.title || "";
    editSummary.value = currentDraft.summary || "";
    editContent.value = currentDraft.content || "";
    inlineEditor.classList.remove("hidden");

    if (editStatus) {
      editStatus.textContent = "";
    }

    editTitle.focus({ preventScroll: true });
    inlineEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hideInlineEditor() {
    inlineEditor?.classList.add("hidden");
  }

  function replaceEditorSelection(
    formatter: (value: string) => string,
    fallback: string,
  ) {
    if (!editContent) {
      return;
    }

    const start = editContent.selectionStart ?? editContent.value.length;
    const end = editContent.selectionEnd ?? editContent.value.length;
    const selected = editContent.value.slice(start, end) || fallback;
    const scrollTop = editContent.scrollTop;
    const replacement = formatter(selected);
    editContent.value =
      editContent.value.slice(0, start) +
      replacement +
      editContent.value.slice(end);
    editContent.focus({ preventScroll: true });
    editContent.setSelectionRange(start, start + replacement.length);
    editContent.scrollTop = scrollTop;
  }

  doc.querySelectorAll<HTMLButtonElement>("[data-format]").forEach((tool) => {
    tool.addEventListener("mousedown", (event) => event.preventDefault());
    tool.addEventListener("click", () => {
      const format = tool.getAttribute("data-format");

      if (format === "heading") {
        replaceEditorSelection((value) => `## ${value}`, "Заголовок");
      }

      if (format === "bold") {
        replaceEditorSelection((value) => `**${value}**`, "важный текст");
      }

      if (format === "italic") {
        replaceEditorSelection((value) => `*${value}*`, "акцент");
      }

      if (format === "list") {
        replaceEditorSelection(
          (value) =>
            value
              .split("\n")
              .map((line) => (line.trim() ? `- ${line}` : line))
              .join("\n"),
          "Пункт списка",
        );
      }

      if (format === "quote") {
        replaceEditorSelection(
          (value) =>
            value
              .split("\n")
              .map((line) => (line.trim() ? `> ${line}` : line))
              .join("\n"),
          "Важная заметка",
        );
      }

      if (format === "link") {
        const href = popup.prompt("Ссылка");

        if (href) {
          replaceEditorSelection(
            (value) => `[${value}](${href.trim()})`,
            "текст ссылки",
          );
        }
      }
    });
  });

  editButton?.addEventListener("click", () => {
    if (editMode === "inline") {
      showInlineEditor();
      return;
    }

    window.postMessage(
      {
        type: "staff-knowledge-edit-article",
        articleId: data.edit?.articleId ?? data.id ?? null,
      },
      window.location.origin,
    );
    window.focus();
  });

  applyPreviewEdit?.addEventListener("click", () => {
    if (!editTitle || !editSummary || !editContent) {
      return;
    }

    const nextDraft = {
      articleId: currentDraft.articleId,
      title: editTitle.value.trim(),
      summary: editSummary.value.trim(),
      content: editContent.value.trim(),
    };

    if (!nextDraft.title) {
      if (editStatus) {
        editStatus.textContent = "Укажите название статьи.";
      }

      return;
    }

    setPreviewValue(nextDraft);
    window.postMessage(
      { type: "staff-knowledge-preview-draft-updated", ...nextDraft },
      window.location.origin,
    );

    if (editStatus) {
      editStatus.textContent =
        "Правки применены к предпросмотру и черновику.";
    }
  });

  cancelPreviewEdit?.addEventListener("click", hideInlineEditor);

  readButton?.addEventListener("click", async () => {
    if (!data.id || !readStatus) {
      return;
    }

    readButton.disabled = true;
    readStatus.textContent = "Отмечаем прочтение...";

    try {
      const response = await fetch(
        `/api/staff/knowledge-base/${encodeURIComponent(
          data.id,
        )}/read-receipts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "Прочитано из режима чтения" }),
        },
      );

      if (!response.ok) {
        throw new Error("Не удалось отметить прочтение");
      }

      readStatus.textContent = "Прочтение отмечено.";
      readButton.remove();
    } catch (error) {
      readStatus.textContent =
        error instanceof Error ? error.message : "Ошибка запроса";
      readButton.disabled = false;
    }
  });
}

export function openKnowledgeReadingWindow(data: KnowledgeReadingWindowData) {
  const popup = window.open("", "_blank", "width=980,height=900");

  if (!popup) {
    return false;
  }

  popup.document.open();
  popup.document.write(buildReadingWindowHtml(data));
  popup.document.close();
  wireKnowledgeReadingWindow(popup, data);
  popup.focus();

  return true;
}
