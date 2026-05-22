"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const guestSyncPollIntervalMs = 4000;
const guestSyncPollAttempts = 75;
const guestAutoSyncStorageKey = "leetplus.dashboard.guestAutoSyncStartedAt";
const loginAutoSyncDateKey = "leetplus.login.autoSyncDate";

type SyncResult = {
  sourceResults?: unknown[];
};

type GuestSyncStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  running: boolean;
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
        if (hasLoginAutoSyncStartedToday()) {
          return;
        }

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

    async function syncGuestFoundation() {
      try {
        const currentStatus = await fetchGuestSyncStatus(controller.signal);

        if (currentStatus?.running) {
          await waitForGuestSyncCompletion(controller.signal);

          if (!controller.signal.aborted) {
            router.refresh();
          }

          return;
        }

        if (hasStartedGuestAutoSyncRecently()) {
          return;
        }

        markGuestAutoSyncStarted();

        const response = await fetch(
          "/api/integrations/langame/guests/foundation/sync/start",
          {
            method: "POST",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          clearGuestAutoSyncStarted();
          return;
        }

        await waitForGuestSyncCompletion(controller.signal);

        if (!controller.signal.aborted) {
          router.refresh();
        }
      } catch {
        // Guest data powers dashboard cards, but sync errors must not block the page.
      }
    }

    void syncStaleSources();
    void syncGuestFoundation();

    return () => controller.abort();
  }, [router]);

  return null;
}

async function waitForGuestSyncCompletion(signal: AbortSignal) {
  await sleep(guestSyncPollIntervalMs, signal);

  for (let attempt = 0; attempt < guestSyncPollAttempts; attempt += 1) {
    if (signal.aborted) {
      return null;
    }

    const syncStatus = await fetchGuestSyncStatus(signal);

    if (syncStatus && !syncStatus.running) {
      return syncStatus;
    }

    await sleep(guestSyncPollIntervalMs, signal);
  }

  return null;
}

async function fetchGuestSyncStatus(signal: AbortSignal) {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/status",
    { cache: "no-store", signal },
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<GuestSyncStatus>;
}

function hasLoginAutoSyncStartedToday() {
  return (
    window.localStorage.getItem(loginAutoSyncDateKey) ===
    new Date().toISOString().slice(0, 10)
  );
}

function hasStartedGuestAutoSyncRecently() {
  const startedAt = Number(window.sessionStorage.getItem(guestAutoSyncStorageKey));

  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return false;
  }

  const oneHourMs = 60 * 60 * 1000;

  return Date.now() - startedAt < oneHourMs;
}

function markGuestAutoSyncStarted() {
  window.sessionStorage.setItem(guestAutoSyncStorageKey, String(Date.now()));
}

function clearGuestAutoSyncStarted() {
  window.sessionStorage.removeItem(guestAutoSyncStorageKey);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
