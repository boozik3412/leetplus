"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "idle" | "task" | "contact";

const contactChannels = ["Звонок", "Мессенджер", "Email", "Встреча", "Другое"];

async function readMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = payload?.message;

  return Array.isArray(message) ? message.join(", ") : message;
}

/**
 * Two-click CRM actions on the guest card: create a task for this guest and
 * log a manual contact. Both go through the existing communications BFF
 * routes (manage_communications, NETWORK scope) and refresh the card.
 */
export function GuestCrmQuickActions({
  guestId,
  defaultTaskTitle,
}: {
  guestId: string;
  defaultTaskTitle: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputClass =
    "h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  async function submit(path: string, body: Record<string, unknown>, done: string) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError((await readMessage(response)) ?? "Не удалось сохранить");
        return;
      }

      setNotice(done);
      setMode("idle");
      router.refresh();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setMode(mode === "task" ? "idle" : "task");
          }}
          className="inline-flex h-9 items-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          Новая задача
        </button>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setMode(mode === "contact" ? "idle" : "contact");
          }}
          className="inline-flex h-9 items-center rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Зафиксировать контакт
        </button>
        {notice ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </span>
        ) : null}
      </div>

      {mode === "task" ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_170px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void submit(
              "/api/guests/crm/tasks",
              {
                guestId,
                title: String(formData.get("title") ?? "").trim() || defaultTaskTitle,
                dueAt: String(formData.get("dueAt") ?? "") || null,
              },
              "Задача создана",
            );
          }}
        >
          <input
            name="title"
            defaultValue={defaultTaskTitle}
            placeholder="Что сделать"
            className={inputClass}
          />
          <input type="date" name="dueAt" className={inputClass} />
          <button
            disabled={saving}
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950"
          >
            {saving ? "Сохраняем..." : "Создать"}
          </button>
        </form>
      ) : null}

      {mode === "contact" ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void submit(
              "/api/guests/crm/contact-events",
              {
                guestId,
                channel: String(formData.get("channel") ?? "Звонок"),
                result: String(formData.get("result") ?? "").trim() || null,
                note: String(formData.get("note") ?? "").trim() || null,
                contactedAt: String(formData.get("contactedAt") ?? "") || null,
              },
              "Контакт записан",
            );
          }}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <select name="channel" className={inputClass} defaultValue="Звонок">
              {contactChannels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
            <input type="date" name="contactedAt" className={inputClass} />
            <input
              name="result"
              placeholder="Итог: договорились, не дозвонились, отказ"
              className={inputClass}
            />
          </div>
          <textarea
            name="note"
            rows={2}
            placeholder="Заметка"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div>
            <button
              disabled={saving}
              className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950"
            >
              {saving ? "Сохраняем..." : "Записать"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
