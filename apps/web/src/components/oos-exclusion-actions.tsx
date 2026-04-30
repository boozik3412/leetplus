"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductOosExclusionType } from "@/lib/reports";

export function OosExclusionActions({ productId }: { productId: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function addExclusion(type: ProductOosExclusionType) {
    setIsSaving(true);

    try {
      await fetch("/api/reports/oos-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, type }),
      });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isSaving}
        onClick={() => addExclusion("SERVICE")}
        title="Позиция будет помечена как услуга и исключена из OOS-рекомендаций. Продажи и цены не изменятся."
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
      >
        Сделать услугой
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => addExclusion("OOS_EXCLUDED")}
        title="Позиция будет исключена из OOS-рекомендаций без пометки как услуга. Продажи и цены не изменятся."
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
      >
        В исключение
      </button>
    </div>
  );
}

export function OosExclusionRestoreButton({ id }: { id: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function restore() {
    setIsSaving(true);

    try {
      await fetch(`/api/reports/oos-exclusions/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isSaving}
      onClick={restore}
      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
    >
      {isSaving ? "..." : "Восстановить"}
    </button>
  );
}
