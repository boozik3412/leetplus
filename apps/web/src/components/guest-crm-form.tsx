"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GuestCrmStatus, GuestDetail } from "@/lib/guests";

const crmStatuses: Array<{ value: GuestCrmStatus; label: string }> = [
  { value: "NONE", label: "Без статуса" },
  { value: "WATCH", label: "Наблюдать" },
  { value: "CONTACT", label: "Связаться" },
  { value: "INVITED", label: "Приглашен" },
  { value: "LOYAL", label: "Лояльный" },
  { value: "VIP", label: "VIP" },
  { value: "PROBLEM", label: "Проблема" },
  { value: "DO_NOT_CONTACT", label: "Не беспокоить" },
];

export function crmStatusLabel(value: GuestCrmStatus) {
  return crmStatuses.find((status) => status.value === value)?.label ?? value;
}

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function GuestCrmForm({ guest }: { guest: GuestDetail }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/guests/${guest.id}/crm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crmStatus: formData.get("crmStatus"),
          nextAction: formData.get("nextAction"),
          nextContactAt: formData.get("nextContactAt"),
          crmNote: formData.get("crmNote"),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось сохранить CRM-данные");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось сохранить CRM-данные");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      action={submit}
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">CRM</h2>
        <p className="text-sm text-zinc-500">
          Ручные поля LeetPlus не перезаписываются синхронизацией Langame.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Статус
          </span>
          <select
            name="crmStatus"
            defaultValue={guest.crmStatus}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {crmStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Дата следующего контакта
          </span>
          <input
            type="date"
            name="nextContactAt"
            defaultValue={toDateInputValue(guest.nextContactAt)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-xs font-medium uppercase text-zinc-500">
          Следующее действие
        </span>
        <input
          name="nextAction"
          defaultValue={guest.nextAction ?? ""}
          placeholder="Например: позвонить, пригласить на турнир, уточнить проблему"
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-xs font-medium uppercase text-zinc-500">
          Заметка
        </span>
        <textarea
          name="crmNote"
          defaultValue={guest.crmNote ?? ""}
          rows={4}
          className="resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={isSaving}
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          {isSaving ? "Сохранение..." : "Сохранить"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
