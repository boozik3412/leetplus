"use client";

import { useEffect, useState } from "react";

export const STORE_DELETE_CONFIRMATION = "УДАЛИТЬ";

type StoreDataCount = { label: string; count: number };

type StoreDeletionPreview = {
  store: {
    id: string;
    name: string;
    isActive: boolean;
    langameLinked: boolean;
  };
  deletes: StoreDataCount[];
  archives: StoreDataCount[];
  detaches: StoreDataCount[];
  blockers: string[];
  warnings: string[];
};

type Step = "loading" | "review" | "final";

/**
 * Two confirmations before a club is deleted for good: the exact club name
 * after reviewing what goes away, then the word «УДАЛИТЬ» on a separate step.
 */
export function StoreDeletionFlow({
  storeName,
  previewUrl,
  deleteUrl,
  onDeleted,
  onCancel,
}: {
  storeName: string;
  previewUrl: string;
  deleteUrl: string;
  onDeleted: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [preview, setPreview] = useState<StoreDeletionPreview | null>(null);
  const [typedName, setTypedName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(previewUrl, { cache: "no-store" });
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setError(await readError(response));
        setStep("review");
        return;
      }
      setPreview((await response.json()) as StoreDeletionPreview);
      setStep("review");
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  const exactName = preview?.store.name ?? storeName;
  const nameMatches = typedName.trim() === exactName.trim();
  const blocked = !preview || preview.blockers.length > 0;

  async function deleteStore() {
    setIsDeleting(true);
    setError(null);
    const response = await fetch(deleteUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: typedName.trim(),
        confirmation: confirmation.trim(),
      }),
    });
    if (!response.ok) {
      setError(await readError(response));
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    await onDeleted();
  }

  return (
    <div
      role="dialog"
      aria-label={`Удаление клуба ${storeName}`}
      className="grid w-full max-w-md gap-3 rounded-lg border border-red-500/30 bg-red-50 p-3 text-left text-xs text-zinc-700 dark:bg-red-950/30 dark:text-zinc-200"
    >
      {step === "loading" ? <p>Считаем, что связано с клубом…</p> : null}

      {step === "review" && preview ? (
        <>
          <p className="text-sm font-semibold text-red-700 dark:text-red-200">
            Удаление клуба «{preview.store.name}» нельзя отменить
          </p>
          <PreviewList
            title="Удалится вместе с клубом"
            rows={preview.deletes}
            empty="своих данных у клуба нет"
          />
          <PreviewList
            title="Уйдёт в архив без клуба (не станет общим для сети)"
            rows={preview.archives}
          />
          <PreviewList
            title="Останется в истории сети без клуба"
            rows={preview.detaches}
          />
          {preview.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-md border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              {warning}
            </p>
          ))}
          {preview.blockers.length > 0 ? (
            <div className="rounded-md border border-red-500/40 bg-white px-2 py-1.5 dark:bg-zinc-950">
              <p className="font-semibold">Сейчас удалить нельзя:</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : (
            <label className="grid gap-1">
              <span>
                Шаг 1 из 2. Введите название клуба:{" "}
                <span className="font-semibold">{preview.store.name}</span>
              </span>
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                aria-label={`Название клуба ${storeName} для подтверждения`}
                autoComplete="off"
                className="rounded-md border border-red-500/30 bg-white px-2 py-1.5 text-sm outline-none dark:bg-zinc-950"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {blocked ? null : (
              <button
                type="button"
                disabled={!nameMatches}
                onClick={() => {
                  setError(null);
                  setStep("final");
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Дальше
              </button>
            )}
            <CancelButton onCancel={onCancel} />
          </div>
        </>
      ) : null}

      {step === "final" && preview ? (
        <>
          <p className="text-sm font-semibold text-red-700 dark:text-red-200">
            Шаг 2 из 2. Последнее подтверждение
          </p>
          <p>
            Клуб «{preview.store.name}» и его данные удалятся навсегда. Если
            сомневаетесь, отправьте клуб в архив. Чтобы удалить, введите{" "}
            <span className="font-semibold">{STORE_DELETE_CONFIRMATION}</span>.
          </p>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={STORE_DELETE_CONFIRMATION}
            aria-label={`Подтверждение удаления клуба ${storeName}`}
            autoComplete="off"
            className="rounded-md border border-red-500/30 bg-white px-2 py-1.5 text-sm outline-none dark:bg-zinc-950"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                isDeleting || confirmation.trim() !== STORE_DELETE_CONFIRMATION
              }
              onClick={() => void deleteStore()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Удаляем…" : "Удалить клуб навсегда"}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmation("");
                setError(null);
                setStep("review");
              }}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
            >
              Назад
            </button>
            <CancelButton onCancel={onCancel} disabled={isDeleting} />
          </div>
        </>
      ) : null}

      {step === "review" && !preview ? (
        <div className="flex flex-wrap gap-2">
          <CancelButton onCancel={onCancel} />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-white px-2 py-1.5 text-red-700 dark:bg-zinc-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PreviewList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: StoreDataCount[];
  empty?: string;
}) {
  if (rows.length === 0 && !empty) {
    return null;
  }
  return (
    <div>
      <p className="font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1">
          {rows.map((row) => (
            <li
              key={row.label}
              className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {row.label}: {row.count.toLocaleString("ru-RU")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CancelButton({
  onCancel,
  disabled,
}: {
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCancel}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
    >
      Отмена
    </button>
  );
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(". ");
    }
    return data.message ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}
