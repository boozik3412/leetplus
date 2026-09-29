"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  supportTicketTopicLabels,
  type SupportQueueSummary,
} from "@/lib/staff-support-tickets";

// Sidebar badges and optional browser notifications for the support queues.
// The page polls a light summary endpoint; it works only while a LeetPlus tab
// is open and never sends anything outside the browser.

export const supportQueueChangedEvent = "leetplus:support-queue-changed";

const pollIntervalMs = 60_000;
const desktopPreferenceKey = "leetplus:support-desktop-notifications";
const desktopPreferenceEvent = "leetplus:support-desktop-preference";

const supportQueueSources = [
  { href: "/support", endpoint: "/api/support/bug-reports/summary" },
  {
    href: "/administration/support-tickets",
    endpoint: "/api/admin/support-tickets/summary",
  },
] as const;

export type SupportQueueBadges = Partial<Record<string, number>>;

export function notifySupportQueueChanged() {
  window.dispatchEvent(new Event(supportQueueChangedEvent));
}

export function useSupportQueueBadges(visibleHrefs: readonly string[]) {
  const [badges, setBadges] = useState<SupportQueueBadges>({});
  const latestSeenRef = useRef<Record<string, string | null>>({});
  const visibleKey = visibleHrefs.join("|");

  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split("|") : []);
    const sources = supportQueueSources.filter((source) =>
      visible.has(source.href),
    );

    if (sources.length === 0) {
      return;
    }

    const disabled = new Set<string>();
    const notifiedTickets = new Set<string>();
    let cancelled = false;

    async function poll() {
      for (const source of sources) {
        if (disabled.has(source.endpoint)) {
          continue;
        }

        let summary: SupportQueueSummary;
        try {
          const response = await fetch(source.endpoint, { cache: "no-store" });
          if (response.status === 401 || response.status === 403) {
            disabled.add(source.endpoint);
            continue;
          }
          if (!response.ok) {
            continue;
          }
          summary = (await response.json()) as SupportQueueSummary;
        } catch {
          continue;
        }

        if (cancelled) {
          return;
        }

        setBadges((current) =>
          current[source.href] === summary.NEW
            ? current
            : { ...current, [source.href]: summary.NEW },
        );
        announceNewTicket(source.href, summary, latestSeenRef.current, notifiedTickets);
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);
    const refresh = () => void poll();
    window.addEventListener(supportQueueChangedEvent, refresh);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(supportQueueChangedEvent, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [visibleKey]);

  return badges;
}

function announceNewTicket(
  href: string,
  summary: SupportQueueSummary,
  latestSeen: Record<string, string | null>,
  notifiedTickets: Set<string>,
) {
  const latest = summary.latestNew;
  const hadBaseline = href in latestSeen;
  const previous = latestSeen[href] ?? null;
  latestSeen[href] = latest?.createdAt ?? previous;

  // The first poll after a page load only sets the baseline.
  if (!hadBaseline || !latest || (previous && latest.createdAt <= previous)) {
    return;
  }
  // A platform admin in a tenant context polls both queues for one ticket.
  if (notifiedTickets.has(latest.ticketNumber) || !canShowDesktopNotice()) {
    return;
  }
  notifiedTickets.add(latest.ticketNumber);

  const notification = new Notification(
    `Новое обращение гостя ${latest.ticketNumber}`,
    {
      body: [
        supportTicketTopicLabels[latest.topic] ?? "Обращение",
        latest.storeName,
      ].join(" · "),
      tag: `leetplus-support-${latest.ticketNumber}`,
    },
  );
  notification.onclick = () => {
    window.focus();
    window.location.assign(
      `${href}?status=active&search=${encodeURIComponent(latest.ticketNumber)}`,
    );
    notification.close();
  };
}

export type DesktopNoticeState = "unsupported" | "denied" | "off" | "on";

function canShowDesktopNotice() {
  return readDesktopNoticeState() === "on";
}

function readDesktopNoticeState(): DesktopNoticeState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  let preference: string | null = null;
  try {
    preference = window.localStorage.getItem(desktopPreferenceKey);
  } catch {
    preference = null;
  }
  return Notification.permission === "granted" && preference === "on"
    ? "on"
    : "off";
}

function subscribeDesktopNoticeState(onChange: () => void) {
  window.addEventListener(desktopPreferenceEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(desktopPreferenceEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDesktopNoticeState() {
  return useSyncExternalStore(
    subscribeDesktopNoticeState,
    readDesktopNoticeState,
    () => "off" as DesktopNoticeState,
  );
}

export async function setDesktopNotices(enabled: boolean) {
  if (enabled && "Notification" in window) {
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      window.dispatchEvent(new Event(desktopPreferenceEvent));
      return;
    }
  }
  try {
    window.localStorage.setItem(desktopPreferenceKey, enabled ? "on" : "off");
  } catch {
    // Private mode: the notice simply stays off.
  }
  window.dispatchEvent(new Event(desktopPreferenceEvent));
}
