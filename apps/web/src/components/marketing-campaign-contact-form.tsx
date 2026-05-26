"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type MarketingCampaignContactFormProps = {
  campaignId: string;
  audienceName: string | null;
};

const defaultForm = {
  channel: "Звонок",
  result: "",
  note: "",
  contactedAt: "",
};

export function MarketingCampaignContactForm({
  campaignId,
  audienceName,
}: MarketingCampaignContactFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveContact() {
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/guests/crm/contact-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketingCampaignId: campaignId,
          channel: form.channel,
          result: form.result || null,
          note: form.note || null,
          contactedAt: form.contactedAt || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Не удалось сохранить контакт");
        return;
      }

      setForm(defaultForm);
      setMessage("Контакт сохранен в кампании.");
      startTransition(() => router.refresh());
    } catch {
      setError("Не удалось сохранить контакт");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              Результат контакта
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Сохраняется прямо в кампанию
              {audienceName ? ` и группу "${audienceName}"` : ""}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
          >
            {isOpen ? "Свернуть" : "Зафиксировать контакт"}
          </button>
        </div>

        {isOpen ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Канал
              <select
                value={form.channel}
                onChange={(event) =>
                  setForm((value) => ({ ...value, channel: event.target.value }))
                }
                className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              >
                <option>Звонок</option>
                <option>Сообщение</option>
                <option>Мессенджер</option>
                <option>Email</option>
                <option>Личная встреча</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Дата контакта
              <input
                type="datetime-local"
                value={form.contactedAt}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    contactedAt: event.target.value,
                  }))
                }
                className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </label>

            <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:col-span-2">
              Результат
              <input
                value={form.result}
                onChange={(event) =>
                  setForm((value) => ({ ...value, result: event.target.value }))
                }
                placeholder="дозвонились, обещал прийти, нет ответа"
                className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600"
              />
            </label>

            <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:col-span-2">
              Комментарий
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm((value) => ({ ...value, note: event.target.value }))
                }
                rows={3}
                placeholder="Что важно помнить по контакту"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600"
              />
            </label>

            {error ? (
              <p className="text-sm font-semibold text-red-500 sm:col-span-2">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-sm font-semibold text-emerald-500 sm:col-span-2">
                {message}
              </p>
            ) : null}

            <button
              type="button"
              disabled={isSaving || isPending}
              onClick={saveContact}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70 sm:col-span-2"
            >
              {isSaving || isPending
                ? "Сохраняем..."
                : "Записать результат"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
