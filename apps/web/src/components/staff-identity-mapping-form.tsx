"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type StaffIdentityOption = {
  id: string;
  displayName: string;
  externalGuestId: string;
  externalDomain: string | null;
  guestGroupName: string | null;
};

type StaffIdentityMappingFormProps = {
  externalDomain: string | null;
  externalUserId: string;
  staffOptions: StaffIdentityOption[];
  mappingId?: string | null;
  variant?: "stacked" | "inline";
  operatorName?: string | null;
  shiftCount?: number;
  storeNames?: string[];
  lastShiftLabel?: string | null;
  showContext?: boolean;
};

type StaffIdentityMappingEvent = {
  id: string;
  mappingId: string | null;
  action: string;
  externalDomain: string | null;
  externalUserId: string;
  previousGuestId: string | null;
  nextGuestId: string | null;
  note: string | null;
  updatedShifts: number;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string | null;
    email: string;
  } | null;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");

const eventActionLabels: Record<string, string> = {
  LINK: "Привязка создана",
  RELINK: "Перепривязка",
  UPDATE: "Связь обновлена",
  UNLINK: "Связь снята",
  ROLLBACK: "Откат решения",
};

const eventDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatEventDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : eventDateFormatter.format(date);
}

export function StaffIdentityMappingForm({
  externalDomain,
  externalUserId,
  staffOptions,
  mappingId = null,
  variant = "stacked",
  operatorName = null,
  shiftCount,
  storeNames = [],
  lastShiftLabel = null,
  showContext = true,
}: StaffIdentityMappingFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [events, setEvents] = useState<StaffIdentityMappingEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [rollingBackEventId, setRollingBackEventId] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const isInline = variant === "inline";
  const selectedStaff = useMemo(
    () => staffOptions.find((option) => option.id === selectedGuestId),
    [selectedGuestId, staffOptions],
  );
  const displayOperator = operatorName?.trim() || `user_id ${externalUserId}`;
  const normalizedStoreNames = storeNames
    .map((storeName) => storeName.trim())
    .filter(Boolean);
  const shiftCountLabel =
    typeof shiftCount === "number" ? numberFormatter.format(shiftCount) : null;

  const eventsQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (mappingId) {
      params.set("mappingId", mappingId);
    } else {
      if (externalDomain) {
        params.set("externalDomain", externalDomain);
      }

      params.set("externalUserId", externalUserId);
    }

    params.set("limit", "5");

    return params.toString();
  }, [externalDomain, externalUserId, mappingId]);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      setIsLoadingEvents(true);
      setEventsError(null);

      try {
        const response = await fetch(
          `/api/guests/staff-control/identity-mappings/events?${eventsQuery}`,
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(payload?.message ?? "Не удалось загрузить журнал");
        }

        const payload = (await response.json().catch(() => [])) as
          | StaffIdentityMappingEvent[]
          | null;

        if (isMounted) {
          setEvents(Array.isArray(payload) ? payload : []);
        }
      } catch (eventError) {
        if (isMounted) {
          setEvents([]);
          setEventsError(
            eventError instanceof Error
              ? eventError.message
              : "Не удалось загрузить журнал",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingEvents(false);
        }
      }
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, [eventsQuery, historyVersion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const guestId = String(formData.get("guestId") ?? "");

    if (!guestId) {
      setError("Выберите сотрудника для привязки");
      return;
    }

    if (!selectedStaff) {
      setError("Выбранная карточка сотрудника недоступна");
      return;
    }

    const confirmed = window.confirm(
      [
        `Привязать Langame user_id ${externalUserId} (${displayOperator}) к сотруднику ${selectedStaff.displayName}?`,
        shiftCountLabel ? `Смен в текущей выборке: ${shiftCountLabel}.` : null,
        "После сохранения закрытые смены этого user_id будут учитываться в аналитике выбранного сотрудника.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/guests/staff-control/identity-mappings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalDomain,
            externalUserId,
            guestId,
            note: formData.get("note"),
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось сохранить привязку");
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        updatedShifts?: number;
      } | null;
      setSuccess(
        `Привязка сохранена. Обновлено смен: ${payload?.updatedShifts ?? 0}.`,
      );
      setHistoryVersion((value) => value + 1);
      router.refresh();
    } catch {
      setError("Не удалось сохранить привязку");
    } finally {
      setIsSaving(false);
    }
  }

  async function rollbackEvent(event: StaffIdentityMappingEvent) {
    const note = window.prompt(
      "Комментарий к откату",
      "Откат ошибочной привязки",
    );

    if (note === null) {
      return;
    }

    const confirmed = window.confirm(
      [
        `Откатить последнее решение по Langame user_id ${event.externalUserId}?`,
        event.previousGuestId
          ? "Связь вернется к предыдущему сотруднику."
          : "Связь будет снята, а смены снова станут без привязки.",
      ].join("\n\n"),
    );

    if (!confirmed) {
      return;
    }

    setRollingBackEventId(event.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/guests/staff-control/identity-mappings/events/${event.id}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось откатить решение по привязке");
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        updatedShifts?: number;
      } | null;
      setSuccess(
        `Откат выполнен. Обновлено смен: ${payload?.updatedShifts ?? 0}.`,
      );
      setHistoryVersion((value) => value + 1);
      router.refresh();
    } catch {
      setError("Не удалось откатить решение по привязке");
    } finally {
      setRollingBackEventId(null);
    }
  }

  async function unlink() {
    if (!mappingId) {
      return;
    }

    const confirmed = window.confirm(
      [
        `Снять привязку Langame user_id ${externalUserId} (${displayOperator})?`,
        "Смены перестанут подтягиваться к карточке сотрудника до новой привязки.",
      ].join("\n\n"),
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/guests/staff-control/identity-mappings/${mappingId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось снять привязку");
        return;
      }

      setSuccess("Привязка снята.");
      setHistoryVersion((value) => value + 1);
      router.refresh();
    } catch {
      setError("Не удалось снять привязку");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={[
        "grid w-full min-w-0 gap-2",
        isInline
          ? "lg:grid-cols-[minmax(14rem,1.15fr)_minmax(11rem,0.8fr)_auto_auto] lg:items-end"
          : "",
      ].join(" ")}
    >
      {showContext ? (
        <div className="min-w-0 rounded-md border border-zinc-200 bg-white/70 p-3 text-xs text-zinc-600 lg:col-span-full dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                {displayOperator}
              </p>
              <p className="mt-1 text-zinc-500">
                Langame user_id {externalUserId}
                {externalDomain ? ` · ${externalDomain}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              {mappingId ? "Связь есть" : "Требует привязки"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <ContextValue label="Смен в выборке" value={shiftCountLabel ?? "не рассчитано"} />
            <ContextValue
              label="Клубы"
              value={
                normalizedStoreNames.length > 0
                  ? normalizedStoreNames.join(", ")
                  : "клуб не определен"
              }
            />
            <ContextValue label="Последняя смена" value={lastShiftLabel || "не найдена"} />
          </div>
        </div>
      ) : null}

      <label className="grid min-w-0 gap-1">
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Карточка сотрудника LeetPlus
        </span>
        <select
          name="guestId"
          required
          value={selectedGuestId}
          onChange={(event) => {
            setSelectedGuestId(event.target.value);
            setSuccess(null);
            setError(null);
          }}
          disabled={isSaving || staffOptions.length === 0}
          className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
        >
          <option value="">Выберите карточку сотрудника</option>
          {staffOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName} / ID {option.externalGuestId}
              {option.guestGroupName ? ` / ${option.guestGroupName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1">
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Комментарий
        </span>
        <input
          name="note"
          type="text"
          maxLength={1000}
          placeholder="Например: сверено по закрытым сменам"
          className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <button
        type="submit"
        disabled={isSaving || staffOptions.length === 0 || !selectedGuestId}
        className="h-10 w-full min-w-0 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300 lg:w-auto lg:whitespace-nowrap"
      >
        {isSaving ? "Сохраняю..." : mappingId ? "Обновить связь" : "Привязать"}
      </button>
      {mappingId ? (
        <button
          type="button"
          onClick={unlink}
          disabled={isSaving}
          className="h-10 w-full min-w-0 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:whitespace-nowrap dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Снять связь
        </button>
      ) : null}
      {staffOptions.length === 0 ? (
        <p className="text-xs font-medium text-amber-700 lg:col-span-full dark:text-amber-300">
          Нет доступных карточек сотрудников для привязки. Создайте или откройте карточку в справочнике сотрудников.
        </p>
      ) : null}
      {selectedStaff ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 lg:col-span-full dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
          После сохранения Langame user_id {externalUserId} будет привязан к сотруднику {selectedStaff.displayName}. В отчетах staff-control смены этого user_id будут учитываться за выбранного сотрудника.
        </div>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-red-600 lg:col-span-full">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs font-medium text-emerald-700 lg:col-span-full dark:text-emerald-300">
          {success}
        </p>
      ) : null}
      <MappingEventsPanel
        events={events}
        error={eventsError}
        isLoading={isLoadingEvents}
        rollingBackEventId={rollingBackEventId}
        onRollback={rollbackEvent}
        className="lg:col-span-full"
      />
    </form>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-zinc-800 dark:text-zinc-200" title={value}>
        {value}
      </p>
    </div>
  );
}


function MappingEventsPanel({
  events,
  error,
  isLoading,
  rollingBackEventId,
  onRollback,
  className = "",
}: {
  events: StaffIdentityMappingEvent[];
  error: string | null;
  isLoading: boolean;
  rollingBackEventId: string | null;
  onRollback: (event: StaffIdentityMappingEvent) => void;
  className?: string;
}) {
  return (
    <details
      className={[
        "group rounded-md border border-zinc-200 bg-white/70 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-semibold text-zinc-700 marker:hidden dark:text-zinc-200">
        <span>Журнал решений по привязке</span>
        <span className="inline-flex items-center gap-2 text-zinc-500">
          {isLoading
            ? "загрузка"
            : `${numberFormatter.format(events.length)} последних`}
          <span className="text-base leading-none transition group-open:rotate-180">
            v
          </span>
        </span>
      </summary>
      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        {error ? (
          <p className="font-medium text-amber-700 dark:text-amber-300">
            {error}
          </p>
        ) : null}
        {!error && !isLoading && events.length === 0 ? (
          <p>Решений по этому Langame user_id пока нет.</p>
        ) : null}
        {events.length > 0 ? (
          <ol className="space-y-2">
            {events.map((event, index) => {
              const canRollback = index === 0 && event.action !== "ROLLBACK";
              const author =
                event.createdBy?.fullName?.trim() ||
                event.createdBy?.email ||
                "система";

              return (
                <li
                  key={event.id}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-zinc-950 dark:text-zinc-100">
                      {eventActionLabels[event.action] ?? event.action}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-500">
                        {formatEventDate(event.createdAt)}
                      </p>
                      {canRollback ? (
                        <button
                          type="button"
                          onClick={() => onRollback(event)}
                          disabled={rollingBackEventId === event.id}
                          className="rounded-full border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/70 dark:text-amber-300 dark:hover:bg-amber-950/30"
                        >
                          {rollingBackEventId === event.id ? "Откат..." : "Откатить"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1">
                    {author}
                    {event.updatedShifts > 0
                      ? ` · перенесено смен: ${numberFormatter.format(event.updatedShifts)}`
                      : " · смены не переносились"}
                  </p>
                  {event.note ? (
                    <p className="mt-1 text-zinc-500">{event.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </details>
  );
}
