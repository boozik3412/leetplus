"use client";

import { useEffect, useState } from "react";
import type { StaffNotificationsSummary } from "@/lib/staff-notifications";

// Sidebar badge for game prizes that the club has to hand over by hand.
// The summary endpoint also refreshes the hand-off signals, so a new claim in
// the guest wallet reaches the badge within one poll while LeetPlus is open.

export const rewardIssuesChangedEvent = "leetplus:reward-issues-changed";

const pollIntervalMs = 60_000;

export function notifyRewardIssuesChanged() {
  window.dispatchEvent(new Event(rewardIssuesChangedEvent));
}

export function useRewardIssueBadge(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let disabled = false;

    async function poll() {
      if (disabled) {
        return;
      }

      try {
        const response = await fetch("/api/staff/notifications/summary", {
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          disabled = true;
          return;
        }
        if (!response.ok) {
          return;
        }
        const summary = (await response.json()) as StaffNotificationsSummary;
        if (!cancelled) {
          setCount(summary.rewardIssues);
        }
      } catch {
        // Offline or a deploy in progress: keep the last known badge.
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);
    const refresh = () => void poll();
    window.addEventListener(rewardIssuesChangedEvent, refresh);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(rewardIssuesChangedEvent, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled]);

  return enabled ? count : 0;
}

export function rewardIssuesLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const phrase =
    mod10 === 1 && mod100 !== 11
      ? "приз ждёт выдачи"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "приза ждут выдачи"
        : "призов ждут выдачи";
  return `${count} ${phrase}`;
}
