"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

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
  variant?: "stacked" | "inline";
};

export function StaffIdentityMappingForm({
  externalDomain,
  externalUserId,
  staffOptions,
  mappingId = null,
  variant = "stacked",
}: StaffIdentityMappingFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const isInline = variant === "inline";
  const selectedStaff = useMemo(
    () => staffOptions.find((option) => option.id === selectedGuestId),
    [selectedGuestId, staffOptions],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const guestId = String(formData.get("guestId") ?? "");

    if (!guestId) {
      setError("Выберите сотрудника для привязки");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/guests/staff-control/identity-mappings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalDomain,
            externalUserId,
            guestId,
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

      const payload = (await response.json().catch(() => null)) as {
        updatedShifts?: number;
      } | null;
      setSuccess(
        `Привязка сохранена. Обновлено смен: ${payload?.updatedShifts ?? 0}.`,
      );
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
    setSuccess(null);

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

      setSuccess("Привязка снята.");
      router.refresh();
    } catch {
      setError("Не удалось снять привязку");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={[
        "grid w-full min-w-0 gap-2",
        isInline
          ? "lg:grid-cols-[minmax(14rem,1.15fr)_minmax(11rem,0.8fr)_auto_auto] lg:items-start"
          : "",
      ].join(" ")}
    >
      <label className="min-w-0">
        <span className="sr-only">Выбрать сотрудника</span>
        <select
          name="guestId"
          required
          value={selectedGuestId}
          onChange={(event) => {
            setSelectedGuestId(event.target.value);
            setSuccess(null);
            setError(null);
          }}
          disabled={isSaving || staffOptions.length === 0}
          className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
        >
          <option value="">Выберите карточку сотрудника</option>
          {staffOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName} / ID {option.externalGuestId}
              {option.guestGroupName ? ` / ${option.guestGroupName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <input
        name="note"
        type="text"
        maxLength={1000}
        placeholder="Комментарий к привязке"
        className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={isSaving || staffOptions.length === 0 || !selectedGuestId}
        className="h-10 w-full min-w-0 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300 lg:w-auto lg:whitespace-nowrap"
      >
        {isSaving ? "Сохраняю..." : mappingId ? "Обновить" : "Привязать"}
      </button>
      {mappingId ? (
        <button
          type="button"
          onClick={unlink}
          disabled={isSaving}
          className="h-10 w-full min-w-0 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:whitespace-nowrap dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Отвязать
        </button>
      ) : null}
      {selectedStaff ? (
        <p className="text-xs text-zinc-500 lg:col-span-full">
          Будет создана связь: Langame user_id {externalUserId} - {selectedStaff.displayName}.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-red-600 lg:col-span-full">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs font-medium text-emerald-700 lg:col-span-full dark:text-emerald-300">
          {success}
        </p>
      ) : null}
    </form>
  );
}
