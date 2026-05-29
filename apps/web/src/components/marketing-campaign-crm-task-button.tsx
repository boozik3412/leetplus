"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type MarketingCampaignCrmTaskButtonProps = {
  campaignId: string;
  className?: string;
};

export function MarketingCampaignCrmTaskButton({
  campaignId,
  className,
}: MarketingCampaignCrmTaskButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTask() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/marketing/campaigns/${campaignId}/crm-task`,
        { method: "POST" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Не удалось создать CRM-задачу");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("Не удалось создать CRM-задачу");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={createTask}
        disabled={isSaving || isPending}
        className={
          className ??
          "inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70"
        }
      >
        {isSaving || isPending ? "Создаем..." : "Создать CRM-задачу"}
      </button>
      {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
    </div>
  );
}
