import Link from "next/link";
import type { GuestListFilters, GuestSignal } from "@/lib/guests";
import {
  formatNumber,
  formatRubles,
  guestListAnchorHref,
  guestsWord,
  pluralize,
  signalListFilters,
  signalTone,
  signalToneLabels,
} from "@/lib/guest-insights";
import {
  EmptyNote,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  PillLink,
} from "@/components/guest-insight-ui";
import { GuestSignalTaskButton } from "@/components/guest-signal-task-button";

type Scope = Pick<
  GuestListFilters,
  "dateFrom" | "dateTo" | "storeId" | "guestGroupId"
>;

function signalHref(signal: GuestSignal, scope: Scope) {
  if (signal.href) {
    return signal.href;
  }

  return guestListAnchorHref(signalListFilters(scope, signal.listFilters));
}

function audienceName(signal: GuestSignal, periodTo: string) {
  return `${signal.title} · ${periodTo}`;
}

export function GuestAttentionPanel({
  signals,
  scope,
  periodTo,
  canManageCrm,
}: {
  signals: GuestSignal[];
  scope: Scope;
  periodTo: string;
  canManageCrm: boolean;
}) {
  return (
    <InsightCard>
      <InsightCardHeader
        eyebrow="Главное внимание"
        title="Где сейчас теряются деньги и гости"
        description="Каждый сигнал считается по фактам Langame и игрового модуля за выбранный период. Условие показано под заголовком, список открывается ровно с теми же гостями."
        aside={
          <InsightBadge tone="neutral">
            {pluralize(signals.length, ["сигнал", "сигнала", "сигналов"])}
          </InsightBadge>
        }
      />
      {signals.length === 0 ? (
        <div className="p-5">
          <EmptyNote>
            Подтверждённых сигналов нет: VIP не в риске, новички вернулись,
            бонусы и награды не зависли.
          </EmptyNote>
        </div>
      ) : (
        <ul className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {signals.map((signal) => {
            const href = signalHref(signal, scope);
            const listFilters = signalListFilters(scope, signal.listFilters);

            return (
              <li
                key={signal.key}
                className="flex flex-col rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <InsightBadge tone={signalTone(signal.tone)}>
                    {signalToneLabels[signal.tone]}
                  </InsightBadge>
                  {signal.amount !== null && signal.amountLabel ? (
                    <span className="text-right text-xs text-zinc-500">
                      <span className="block font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                        {signal.amountLabel.includes("наград")
                          ? formatNumber(signal.amount)
                          : formatRubles(signal.amount)}
                      </span>
                      {signal.amountLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950 dark:text-zinc-50">
                  {formatNumber(signal.count)}
                  <span className="ml-2 text-sm font-medium text-zinc-500">
                    {signal.key === "UNLINKED_GAME_PROFILES"
                      ? "профилей"
                      : pluralize(signal.count, guestsWord).replace(
                          /^[\d\s  ]+/,
                          "",
                        )}
                  </span>
                </p>
                <h3 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {signal.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {signal.condition}
                </p>
                {signal.guests.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                    {signal.guests.slice(0, 3).map((guest) => (
                      <li
                        key={guest.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <Link
                          href={`/guests/${guest.id}`}
                          className="min-w-0 truncate font-medium text-zinc-800 hover:text-emerald-700 dark:text-zinc-200 dark:hover:text-emerald-300"
                        >
                          {guest.displayName}
                        </Link>
                        <span className="shrink-0 text-zinc-500">
                          {guest.amount !== null
                            ? formatRubles(guest.amount)
                            : guest.meta}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <PillLink href={href}>
                    {signal.href ? signal.action.label : "Открыть список"}
                  </PillLink>
                  {signal.action.kind === "CREATE_TASK" &&
                  canManageCrm &&
                  signal.action.taskTitle ? (
                    <GuestSignalTaskButton
                      compact
                      label="Создать задачу"
                      audienceName={audienceName(signal, periodTo)}
                      audienceFilters={listFilters}
                      taskTitle={signal.action.taskTitle}
                      taskDescription={signal.action.taskDescription}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCard>
  );
}
