"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

// Per-club game logo on the clubs page. The guest game shows the club's own
// logo first and falls back to the network logo from Settings when it is empty.
export function StoreLogoControl({
  storeId,
  storeName,
  logoUrl,
}: {
  storeId: string;
  storeName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveLogo(nextLogoUrl: string | null) {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameLogoUrl: nextLogoUrl }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        setError(
          typeof data?.message === "string"
            ? data.message
            : "Не удалось сохранить логотип",
        );
        return;
      }

      setCurrentLogoUrl(nextLogoUrl);
      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      setError("Поддерживаются только PNG, JPG или WebP.");
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError("Файл логотипа должен быть не больше 512 КБ.");
      return;
    }

    let dataUrl: string;

    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      setError("Не удалось прочитать файл логотипа.");
      return;
    }

    await saveLogo(dataUrl);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950">
        {currentLogoUrl ? (
          // Data URL preview; next/image adds nothing for inline images.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentLogoUrl}
            alt={`Логотип ${storeName}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span>LP</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-950">
          Логотип клуба в игре
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {currentLogoUrl
            ? "Гости видят этот логотип в выборе клуба и в игре."
            : "Не задан: гости видят общий логотип сети из Настроек."}{" "}
          PNG, JPG или WebP до 512 КБ.
        </p>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <label
          className={`inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${
            isSaving ? "pointer-events-none text-zinc-400" : "cursor-pointer"
          }`}
        >
          {isSaving
            ? "Сохранение..."
            : currentLogoUrl
              ? "Заменить"
              : "Загрузить"}
          <input
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            disabled={isSaving}
            onChange={handleChange}
          />
        </label>
        {currentLogoUrl ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => saveLogo(null)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            Убрать
          </button>
        ) : null}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Invalid file result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read error"));
    reader.readAsDataURL(file);
  });
}
