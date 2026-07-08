"use client";

import { useState, type ChangeEvent } from "react";
import type {
  BrandingSettings,
  BrandingStoreLogo,
} from "@/lib/branding-settings";

const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить запрос";
}

export function BrandingSettingsForm({
  initialSettings,
}: {
  initialSettings: BrandingSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [tenantLogoUrl, setTenantLogoUrl] = useState(
    initialSettings.tenant.gameLogoUrl,
  );
  const [stores, setStores] = useState(initialSettings.stores);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveSettings() {
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantLogoUrl,
          storeLogos: stores.map((store) => ({
            storeId: store.id,
            logoUrl: store.gameLogoUrl,
          })),
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      const nextSettings = data as BrandingSettings;
      setSettings(nextSettings);
      setTenantLogoUrl(nextSettings.tenant.gameLogoUrl);
      setStores(nextSettings.stores);
      setSuccess("Логотипы игрового модуля сохранены.");
    } catch {
      setError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTenantLogoChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const dataUrl = await readLogoInput(event);

    if (dataUrl === undefined) {
      return;
    }

    setTenantLogoUrl(dataUrl);
    setSuccess(null);
    setError(null);
  }

  async function handleStoreLogoChange(
    storeId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const dataUrl = await readLogoInput(event);

    if (dataUrl === undefined) {
      return;
    }

    updateStoreLogo(storeId, dataUrl);
    setSuccess(null);
    setError(null);
  }

  function updateStoreLogo(storeId: string, logoUrl: string | null) {
    setStores((currentStores) =>
      currentStores.map((store) =>
        store.id === storeId ? { ...store, gameLogoUrl: logoUrl } : store,
      ),
    );
  }

  async function readLogoInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return undefined;
    }

    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      setError("Поддерживаются только PNG, JPG или WebP.");
      return undefined;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError("Файл логотипа должен быть не больше 512 КБ.");
      return undefined;
    }

    try {
      return await readFileAsDataUrl(file);
    } catch {
      setError("Не удалось прочитать файл логотипа.");
      return undefined;
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Игровой модуль
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Логотип клуба и сети
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Логотип клуба показывается в игре первым. Если у клуба логотип не
            задан, используется общий логотип сети.
          </p>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={isSaving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSaving ? "Сохранение..." : "Сохранить логотипы"}
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <LogoPanel
          title={settings.tenant.name}
          subtitle="Логотип сети"
          logoUrl={tenantLogoUrl}
          inheritedLogoUrl={null}
          uploadLabel="Загрузить"
          onChange={handleTenantLogoChange}
          onRemove={() => setTenantLogoUrl(null)}
        />

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Клубы
            </h3>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {stores.length}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {stores.map((store) => (
              <StoreLogoPanel
                key={store.id}
                store={store}
                inheritedLogoUrl={tenantLogoUrl}
                onChange={(event) => handleStoreLogoChange(store.id, event)}
                onRemove={() => updateStoreLogo(store.id, null)}
              />
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
    </section>
  );
}

function StoreLogoPanel({
  store,
  inheritedLogoUrl,
  onChange,
  onRemove,
}: {
  store: BrandingStoreLogo;
  inheritedLogoUrl: string | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <LogoPanel
      title={store.name}
      subtitle={store.address ?? (store.isActive ? "Активен" : "Отключен")}
      logoUrl={store.gameLogoUrl}
      inheritedLogoUrl={inheritedLogoUrl}
      uploadLabel={store.gameLogoUrl ? "Заменить" : "Загрузить"}
      onChange={onChange}
      onRemove={onRemove}
    />
  );
}

function LogoPanel({
  title,
  subtitle,
  logoUrl,
  inheritedLogoUrl,
  uploadLabel,
  onChange,
  onRemove,
}: {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  inheritedLogoUrl: string | null;
  uploadLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const previewUrl = logoUrl ?? inheritedLogoUrl;
  const inherited = !logoUrl && Boolean(inheritedLogoUrl);

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <LogoPreview logoUrl={previewUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {title}
            </p>
            {inherited ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                из сети
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900">
              {uploadLabel}
              <input
                type="file"
                accept={LOGO_ACCEPT}
                className="sr-only"
                onChange={onChange}
              />
            </label>
            {logoUrl ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Убрать
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoPreview({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : (
        <span>LP</span>
      )}
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
