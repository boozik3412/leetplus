"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  sourceResults?: unknown[];
};

export function DashboardAutoSync() {
  const router = useRouter();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;
    const controller = new AbortController();

    async function syncStaleSources() {
      try {
        const response = await fetch("/api/integrations/langame/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "BACKFILL",
            catchUp: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as SyncResult;

        if ((result.sourceResults?.length ?? 0) > 0) {
          router.refresh();
        }
      } catch {
        // The dashboard must remain readable even if the background sync fails.
      }
    }

    void syncStaleSources();

    return () => controller.abort();
  }, [router]);

  return null;
}
