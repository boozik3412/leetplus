"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GuestListFilters } from "@/lib/guests";

type Props = {
  label: string;
  audienceName: string;
  audienceFilters: GuestListFilters;
  taskTitle: string;
  taskDescription: string | null;
  compact?: boolean;
};

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done"; taskId: string; guestsCount: number }
  | { kind: "error"; message: string };

async function readMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = payload?.message;

  return Array.isArray(message) ? message.join(", ") : message;
}

/**
 * Turns a dashboard signal into a CRM task in two idempotent-enough steps:
 * snapshot the matching guests as a saved group, then attach a task to it.
 * Uses the existing /api/guests/audiences BFF routes (manage_guest_crm).
 */
export function GuestSignalTaskButton({
  label,
  audienceName,
  audienceFilters,
  taskTitle,
  taskDescription,
  compact = false,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function createTask() {
    setState({ kind: "saving" });

    try {
      const audienceResponse = await fetch("/api/guests/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: audienceName.slice(0, 80),
          description: taskDescription,
          filters: audienceFilters,
        }),
      });

      if (!audienceResponse.ok) {
        setState({
          kind: "error",
          message:
            (await readMessage(audienceResponse)) ??
            "Не удалось сохранить группу гостей",
        });
        return;
      }

      const audience = (await audienceResponse.json()) as {
        id: string;
        guestsCount: number;
      };
      const taskResponse = await fetch(
        `/api/guests/audiences/${audience.id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: taskTitle,
            description: taskDescription,
          }),
        },
      );

      if (!taskResponse.ok) {
        setState({
          kind: "error",
          message:
            (await readMessage(taskResponse)) ??
            "Группа создана, но задачу сохранить не удалось",
        });
        return;
      }

      const task = (await taskResponse.json()) as { id: string };
      setState({
        kind: "done",
        taskId: task.id,
        guestsCount: audience.guestsCount,
      });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Не удалось создать CRM-задачу" });
    }
  }

  if (state.kind === "done") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
        Задача создана ({state.guestsCount} гостей)
        <Link
          href="/guests/crm/tasks?status=all"
          className="font-semibold underline underline-offset-2"
        >
          Открыть задачи
        </Link>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void createTask()}
        disabled={state.kind === "saving"}
        className={[
          "inline-flex items-center justify-center rounded-full bg-zinc-950 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300",
          compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        ].join(" ")}
      >
        {state.kind === "saving" ? "Создаём..." : label}
      </button>
      {state.kind === "error" ? (
        <span className="text-xs text-rose-600 dark:text-rose-300">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}
