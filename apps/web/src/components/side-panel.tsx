"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line above the title, e.g. «Задача CRM». */
  eyebrow?: string;
  children: ReactNode;
  /** Sticky actions at the bottom: the primary button goes last. */
  footer?: ReactNode;
};

/**
 * Right-hand panel for creating or editing one record next to a list or board.
 * Built on the native <dialog>: focus moves inside and back to the trigger,
 * Esc closes it, the page behind is inert. On phones it takes the full width.
 */
export function SidePanel({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 text-zinc-950 backdrop:bg-zinc-950/50 sm:max-w-md dark:text-zinc-100"
    >
      <div className="flex h-full flex-col border-l border-zinc-200 bg-white shadow-xl motion-safe:animate-[side-panel-in_160ms_ease-out] dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {eyebrow}
              </p>
            ) : null}
            <h2
              id={titleId}
              className="mt-0.5 text-lg font-semibold leading-6 [overflow-wrap:anywhere]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
