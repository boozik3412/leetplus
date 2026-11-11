"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Date and time in the viewer's own time zone (server render shows UTC). */
export function LocalDateTime({
  value,
  empty = "—",
}: {
  value: string | null;
  empty?: string;
}) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!value) {
    return <>{empty}</>;
  }

  const date = new Date(value);
  const text = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(isClient ? {} : { timeZone: "UTC" }),
  }).format(date);

  return <time dateTime={value}>{text}</time>;
}
