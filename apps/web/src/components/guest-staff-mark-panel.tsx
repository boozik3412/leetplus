"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { InsightBadge } from "@/components/guest-insight-ui";
import { formatDateTime } from "@/lib/guest-insights";
import type { GuestStaffMark } from "@/lib/guests";

const autoReasonLabels: Record<string, string> = {
  STAFF_PHONE_MATCH: "Телефон совпал с сотрудником из раздела «Персонал»",
  LANGAME_STAFF_PHONE_MATCH: "Телефон совпал с администратором Langame",
};

const excludedFrom = "аналитики гостей, рейтинга, статистики игры и «Эффекта»";

/**
 * «Сотрудник клуба» on the guest card: marks the person as staff of the
 * network so they stop affecting guest analytics and game statistics. The
 * game and its rewards keep working for them.
 */
export function GuestStaffMarkPanel({
  guestId,
  staffMark,
  canManage,
}: {
  guestId: string;
  staffMark: GuestStaffMark;
  canManage: boolean;
}) {
  const router = useRouter();
  const noteId = useId();
  const errorId = useId();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"mark" | "unmark" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(isStaff: boolean) {
    setPending(isStaff ? "mark" : "unmark");
    setError(null);

    try {
      const response = await fetch(`/api/guests/${guestId}/staff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStaff, note }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(
          payload?.message ??
            "Не удалось сохранить отметку. Обновите страницу и попробуйте ещё раз.",
        );
        return;
      }

      setNote("");
      router.refresh();
    } catch {
      setError(
        "Не удалось сохранить отметку: нет связи с сервером. Попробуйте ещё раз.",
      );
    } finally {
      setPending(null);
    }
  }

  const auto = staffMark.autoDetected;
  const lastEvent = staffMark.events[0] ?? null;

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Сотрудник клуба
        </h2>
        {staffMark.isStaff ? (
          <InsightBadge tone="warning">Не в расчётах</InsightBadge>
        ) : auto ? (
          <InsightBadge tone="info">Похоже на сотрудника</InsightBadge>
        ) : null}
      </div>

      {staffMark.isStaff ? (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Отмечен как сотрудник
          {staffMark.markedBy ? ` · ${staffMark.markedBy}` : ""}
          {staffMark.markedAt ? ` · ${formatDateTime(staffMark.markedAt)}` : ""}
          . Исключён из {excludedFrom}. Играть и получать награды может.
        </p>
      ) : auto ? (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {autoReasonLabels[auto.reason] ?? "Телефон совпал с сотрудником"}
          {auto.matchedAt ? ` (${formatDateTime(auto.matchedAt)})` : ""}. В
          рейтинг и статистику игры он уже не попадает, а в аналитике гостей
          пока учитывается. Подтвердите, кто это.
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {canManage
            ? `Отметьте, если это сотрудник: он перестанет влиять на показатели ${excludedFrom}.`
            : "Не отмечен как сотрудник."}
        </p>
      )}

      {!staffMark.isStaff && staffMark.inAdminGroup ? (
        <p className="mt-2 text-xs text-zinc-500">
          Гость в группе администраторов Langame, поэтому в аналитике гостей уже
          не учитывается.
        </p>
      ) : null}
      {staffMark.confirmedGuest ? (
        <p className="mt-2 text-xs text-zinc-500">
          Подтверждено, что это гость: автоматическая отметка по телефону
          выключена.
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-sm" htmlFor={noteId}>
            <span className="text-xs font-medium text-zinc-500">
              Комментарий (необязательно)
            </span>
            <input
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Например: администратор клуба на Радищева"
              aria-describedby={error ? errorId : undefined}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {staffMark.isStaff ? (
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => save(false)}
                className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                {pending === "unmark" ? "Сохранение..." : "Снять отметку"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => save(true)}
                  className="cursor-pointer rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                >
                  {pending === "mark"
                    ? "Сохранение..."
                    : "Отметить как сотрудника"}
                </button>
                {auto ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => save(false)}
                    className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {pending === "unmark" ? "Сохранение..." : "Это гость"}
                  </button>
                ) : null}
              </>
            )}
          </div>
          {error ? (
            <p
              id={errorId}
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          Изменить отметку может пользователь с доступом ко всей сети и правом
          «Гости и CRM: действия».
        </p>
      )}

      {staffMark.events.length > 0 ? (
        <details className="mt-3 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">
            История отметок
            {lastEvent
              ? ` · последняя ${formatDateTime(lastEvent.createdAt)}`
              : ""}
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {staffMark.events.map((event) => (
              <li key={event.id} className="leading-5">
                <span className="tabular-nums">
                  {formatDateTime(event.createdAt)}
                </span>{" "}
                ·{" "}
                {event.isStaff ? "отмечен сотрудником" : "снята отметка, гость"}
                {event.createdBy ? ` · ${event.createdBy}` : ""}
                {event.note ? ` · «${event.note}»` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
