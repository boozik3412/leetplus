"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SaveDraftResult = boolean | void | Promise<boolean | void>;

type UnsavedDraftPromptOptions = {
  enabled: boolean;
  onSaveDraft?: () => SaveDraftResult;
  title?: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  stayLabel?: string;
};

type GuardedAction = () => void;

export function useUnsavedDraftPrompt({
  enabled,
  onSaveDraft,
  title = "Есть несохраненные изменения",
  message = "Хотите сохранить черновик перед выходом?",
  saveLabel = "Сохранить черновик",
  discardLabel = "Выйти без сохранения",
  stayLabel = "Остаться",
}: UnsavedDraftPromptOptions): {
  prompt: ReactNode;
  guardAction: (action: GuardedAction) => boolean;
} {
  const enabledRef = useRef(enabled);
  const saveDraftRef = useRef(onSaveDraft);
  const pendingActionRef = useRef<GuardedAction | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    saveDraftRef.current = onSaveDraft;
  }, [enabled, onSaveDraft]);

  const guardAction = useCallback((action: GuardedAction) => {
    if (!enabledRef.current) {
      action();
      return true;
    }

    pendingActionRef.current = action;
    setSaveError(null);
    setIsOpen(true);
    return false;
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!enabledRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!enabledRef.current || event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (
        anchor.target &&
        anchor.target.toLowerCase() !== "_self" ||
        anchor.hasAttribute("download") ||
        anchor.dataset.unsavedPromptIgnore === "true"
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);

      if (nextUrl.origin !== currentUrl.origin) {
        return;
      }

      if (
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search
      ) {
        return;
      }

      event.preventDefault();
      guardAction(() => {
        window.location.assign(nextUrl.href);
      });
    }

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [guardAction]);

  const runPendingAction = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    enabledRef.current = false;
    setIsOpen(false);
    setSaveError(null);
    action?.();
  }, []);

  const leaveWithoutSaving = useCallback(() => {
    runPendingAction();
  }, [runPendingAction]);

  const saveAndLeave = useCallback(async () => {
    const saveDraft = saveDraftRef.current;

    if (!saveDraft) {
      leaveWithoutSaving();
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await saveDraft();

      if (result === false) {
        setSaveError("Не удалось сохранить черновик. Проверьте поля формы.");
        return;
      }

      runPendingAction();
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Не удалось сохранить черновик.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [leaveWithoutSaving, runPendingAction]);

  const stay = useCallback(() => {
    pendingActionRef.current = null;
    setIsOpen(false);
    setSaveError(null);
  }, []);

  const prompt = isOpen ? (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-zinc-950/55 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-draft-title"
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 id="unsaved-draft-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {message}
        </p>
        {saveError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {saveError}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={leaveWithoutSaving}
            disabled={isSaving}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {discardLabel}
          </button>
          <button
            type="button"
            onClick={stay}
            disabled={isSaving}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {stayLabel}
          </button>
          <button
            type="button"
            onClick={saveAndLeave}
            disabled={isSaving}
            className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Сохраняю..." : saveLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { prompt, guardAction };
}
