"use client";

// The page of a document in «Обучение и база знаний»: a Docs-like format
// toolbar and an uncontrolled contenteditable body. Shared by the course
// and article editors.

import {
  Image as ImageIcon,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextItalic,
  TextUnderline,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { uploadStaffImage } from "@/components/staff-attachment-upload";
import { knowledgeContentToEditableHtml } from "@/components/staff-knowledge-rich-text";

export function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export type PageCommands = {
  run: (command: string, value?: string) => void;
  insertImage: (file: File) => Promise<void>;
  insertLink: (url: string) => void;
};

function ToolbarButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-700 outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

export function FormatToolbar({
  commands,
  disabled,
  onError,
}: {
  commands: PageCommands | null;
  disabled: boolean;
  onError: (message: string | null) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const [uploading, setUploading] = useState(false);
  const fieldId = useId();

  if (!commands || disabled) {
    return null;
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = linkValue.trim();

    if (!/^https?:\/\/\S+$/i.test(url)) {
      onError("Ссылка должна начинаться с https://");
      return;
    }

    commands?.insertLink(url);
    setLinkOpen(false);
    setLinkValue("https://");
    onError(null);
  }

  return (
    <div
      role="toolbar"
      aria-label="Оформление текста"
      className="relative flex flex-wrap items-center gap-0.5 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900"
    >
      <label className="sr-only" htmlFor={`${fieldId}-style`}>
        Стиль текста
      </label>
      <select
        id={`${fieldId}-style`}
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            commands.run("formatBlock", event.target.value);
          }
          event.target.value = "";
        }}
        className="h-8 cursor-pointer rounded-md bg-transparent px-2 text-sm text-zinc-700 outline-none hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <option value="" disabled>
          Стиль текста
        </option>
        <option value="p">Обычный текст</option>
        <option value="h2">Заголовок 1</option>
        <option value="h3">Заголовок 2</option>
        <option value="h4">Заголовок 3</option>
      </select>
      <span
        aria-hidden="true"
        className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700"
      />
      <ToolbarButton
        label="Жирный (Ctrl+B)"
        onPress={() => commands.run("bold")}
      >
        <TextB aria-hidden="true" className="h-4 w-4" weight="bold" />
      </ToolbarButton>
      <ToolbarButton
        label="Курсив (Ctrl+I)"
        onPress={() => commands.run("italic")}
      >
        <TextItalic aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Подчёркнутый (Ctrl+U)"
        onPress={() => commands.run("underline")}
      >
        <TextUnderline aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <span
        aria-hidden="true"
        className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700"
      />
      <ToolbarButton
        label="Маркированный список"
        onPress={() => commands.run("insertUnorderedList")}
      >
        <ListBullets aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Нумерованный список"
        onPress={() => commands.run("insertOrderedList")}
      >
        <ListNumbers aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Важная заметка"
        onPress={() => commands.run("formatBlock", "blockquote")}
      >
        <Quotes aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <span
        aria-hidden="true"
        className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700"
      />
      <ToolbarButton
        label="Ссылка"
        onPress={() => setLinkOpen((value) => !value)}
      >
        <LinkSimple aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label={uploading ? "Картинка загружается" : "Картинка"}
        onPress={() => imageInputRef.current?.click()}
      >
        <ImageIcon aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (!file) {
            return;
          }

          setUploading(true);
          onError(null);

          try {
            await commands.insertImage(file);
          } catch (caught) {
            onError(
              caught instanceof Error
                ? caught.message
                : "Не удалось загрузить картинку",
            );
          } finally {
            setUploading(false);
          }
        }}
      />
      {uploading ? (
        <span className="ml-2 text-xs text-zinc-500" role="status">
          Загружаем картинку…
        </span>
      ) : null}

      {linkOpen ? (
        <form
          onSubmit={submitLink}
          className="absolute left-0 top-full z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        >
          <label htmlFor={`${fieldId}-link`} className="sr-only">
            Адрес ссылки
          </label>
          <input
            id={`${fieldId}-link`}
            type="url"
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setLinkOpen(false);
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Вставить
          </button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Text of a course tab or an article as an editable page. Uncontrolled on purpose: the browser
 * owns the DOM while the person types; the parent only receives HTML.
 * Mount it with a key per document, so switching loads the new content.
 */
export function EditablePage({
  initialContent,
  placeholder,
  label = "Текст вкладки",
  onChange,
  onCommandsReady,
  onError,
}: {
  initialContent: string | null;
  placeholder: string;
  label?: string;
  onChange: (html: string) => void;
  onCommandsReady: (commands: PageCommands | null) => void;
  onError: (message: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const emit = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    setIsEmpty(!element.textContent?.trim() && !element.querySelector("img"));
    onChange(element.innerHTML);
  }, [onChange]);

  const rememberRange = useCallback(() => {
    const selection = window.getSelection();
    const element = ref.current;

    if (
      selection &&
      selection.rangeCount > 0 &&
      element?.contains(selection.anchorNode)
    ) {
      rangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreRange = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    element.focus({ preventScroll: true });
    const selection = window.getSelection();

    if (rangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(rangeRef.current);
    }
  }, []);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    element.innerHTML = knowledgeContentToEditableHtml(initialContent);
    setIsEmpty(!element.textContent?.trim() && !element.querySelector("img"));
    document.execCommand("defaultParagraphSeparator", false, "p");
    // Only on mount: later the DOM is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberRange);
    return () => document.removeEventListener("selectionchange", rememberRange);
  }, [rememberRange]);

  useEffect(() => {
    const insertImage = async (file: File) => {
      const attachment = await uploadStaffImage(file);
      restoreRange();
      const image = document.createElement("img");
      image.src = attachment.url;
      image.alt = attachment.fileName;
      document.execCommand("insertHTML", false, image.outerHTML);
      emit();
    };

    onCommandsReady({
      run(command, value) {
        restoreRange();
        document.execCommand(
          command,
          false,
          command === "formatBlock" && value ? `<${value}>` : value,
        );
        emit();
      },
      insertImage,
      insertLink(url) {
        restoreRange();
        const selection = window.getSelection();

        if (selection && selection.isCollapsed) {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.textContent = url;
          document.execCommand("insertHTML", false, anchor.outerHTML);
        } else {
          document.execCommand("createLink", false, url);
        }

        emit();
      },
    });

    return () => onCommandsReady(null);
  }, [emit, onCommandsReady, restoreRange]);

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/"),
    );

    if (!file) {
      return;
    }

    event.preventDefault();
    rememberRange();

    try {
      const attachment = await uploadStaffImage(file);
      restoreRange();
      const image = document.createElement("img");
      image.src = attachment.url;
      image.alt = attachment.fileName;
      document.execCommand("insertHTML", false, image.outerHTML);
      emit();
      onError(null);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Не удалось вставить картинку",
      );
    }
  }

  return (
    <div className="relative">
      {isEmpty ? (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 text-zinc-400"
        >
          {placeholder}
        </p>
      ) : null}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={rememberRange}
        onPaste={handlePaste}
        className="course-page min-h-64 text-[15px] leading-7 text-zinc-800 outline-none dark:text-zinc-200 [&_a]:text-emerald-700 [&_a]:underline dark:[&_a]:text-emerald-300 [&_blockquote]:my-3 [&_blockquote]:rounded-md [&_blockquote]:border [&_blockquote]:border-emerald-200 [&_blockquote]:bg-emerald-50 [&_blockquote]:px-4 [&_blockquote]:py-2 dark:[&_blockquote]:border-emerald-500/30 dark:[&_blockquote]:bg-emerald-500/10 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-semibold [&_img]:my-3 [&_img]:max-h-[480px] [&_img]:max-w-full [&_img]:rounded-md [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
