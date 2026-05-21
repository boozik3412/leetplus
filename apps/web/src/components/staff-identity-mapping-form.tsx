"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StaffIdentityOption = {
  id: string;
  displayName: string;
  externalGuestId: string;
  externalDomain: string | null;
  guestGroupName: string | null;
};

type StaffIdentityMappingFormProps = {
  externalDomain: string | null;
  externalUserId: string;
  staffOptions: StaffIdentityOption[];
  mappingId?: string | null;
};

export function StaffIdentityMappingForm({
  externalDomain,
  externalUserId,
  staffOptions,
  mappingId = null,
}: StaffIdentityMappingFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/guests/staff-control/identity-mappings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalDomain,
            externalUserId,
            guestId: formData.get("guestId"),
            note: formData.get("note"),
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось сохранить привязку");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось сохранить привязку");
    } finally {
      setIsSaving(false);
    }
  }

  async function unlink() {
    if (!mappingId) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/guests/staff-control/identity-mappings/${mappingId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось снять привязку");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось снять привязку");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form action={submit} className="grid min-w-[260px] gap-2">
      <select
        name="guestId"
        required
        disabled={isSaving || staffOptions.length === 0}
        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
      >
        <option value="">Выбрать сотрудника</option>
        {staffOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.displayName} / ID {option.externalGuestId}
            {option.guestGroupName ? ` / ${option.guestGroupName}` : ""}
          </option>
        ))}
      </select>
      <input
        name="note"
        type="text"
        maxLength={1000}
        placeholder="Комментарий"
        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={isSaving || staffOptions.length === 0}
        className="h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
      >
        {isSaving ? "Сохраняю..." : "Привязать"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {mappingId ? (
        <button
          type="button"
          onClick={unlink}
          disabled={isSaving}
          className="h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Отвязать
        </button>
      ) : null}
    </form>
  );
}
