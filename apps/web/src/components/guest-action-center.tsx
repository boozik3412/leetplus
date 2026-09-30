import type {
  GuestActionItem,
  GuestListFilters,
  GuestsCrmQueueSummary,
} from "@/lib/guests";
import {
  formatNumber,
  guestListAnchorHref,
  signalListFilters,
  signalTone,
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

function actionHref(action: GuestActionItem, scope: Scope) {
  if (action.href) {
    return action.href;
  }

  if (action.action.kind === "OPEN_GAME") {
    return "/gamification?tab=missions";
  }

  return guestListAnchorHref(signalListFilters(scope, action.listFilters));
}

function QueueStat({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "danger";
  href: string;
}) {
  const valueClass =
    tone === "danger" && value > 0
      ? "text-rose-700 dark:text-rose-300"
      : tone === "warning" && value > 0
        ? "text-amber-700 dark:text-amber-300"
        : "text-zinc-950 dark:text-zinc-50";

  return (
    <a
      href={href}
      className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2 transition-colors hover:border-emerald-200 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-emerald-500/30"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>
        {formatNumber(value)}
      </p>
    </a>
  );
}

export function GuestActionCenter({
  actions,
  crmQueue,
  scope,
  periodTo,
  canManageCrm,
}: {
  actions: GuestActionItem[];
  crmQueue: GuestsCrmQueueSummary;
  scope: Scope;
  periodTo: string;
  canManageCrm: boolean;
}) {
  const visible = actions.slice(0, 5);
  const rest = actions.slice(5);

  return (
    <InsightCard className="flex h-full flex-col">
      <InsightCardHeader
        eyebrow="Что сделать сегодня"
        title="Очередь действий"
        description="Порядок — это порядок работы: сначала просроченное в CRM, затем сигналы по срочности."
      />
      <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-4">
        <QueueStat
          label="Открытые"
          value={crmQueue.openTasks + crmQueue.inProgressTasks}
          tone="neutral"
          href="/guests/crm/tasks?status=all"
        />
        <QueueStat
          label="Просрочено"
          value={crmQueue.overdueTasks}
          tone="danger"
          href="/guests/crm/tasks?status=all&sort=dueAt&direction=asc"
        />
        <QueueStat
          label="Сегодня"
          value={crmQueue.dueTodayTasks}
          tone="warning"
          href="/guests/crm/tasks?status=all&sort=dueAt&direction=asc"
        />
        <QueueStat
          label="Без ответственного"
          value={crmQueue.unassignedTasks}
          tone="warning"
          href="/guests/crm/tasks?status=all"
        />
      </div>
      {actions.length === 0 ? (
        <div className="p-4">
          <EmptyNote>
            Очередь пуста: просроченных задач и подтверждённых сигналов нет.
          </EmptyNote>
        </div>
      ) : (
        <ol className="divide-y divide-zinc-100 px-4 pb-2 pt-3 dark:divide-zinc-800">
          {visible.map((action) => (
            <ActionRow
              key={action.key}
              action={action}
              scope={scope}
              periodTo={periodTo}
              canManageCrm={canManageCrm}
            />
          ))}
        </ol>
      )}
      {rest.length > 0 ? (
        <details className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Ещё {formatNumber(rest.length)}
          </summary>
          <ol className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {rest.map((action) => (
              <ActionRow
                key={action.key}
                action={action}
                scope={scope}
                periodTo={periodTo}
                canManageCrm={canManageCrm}
              />
            ))}
          </ol>
        </details>
      ) : null}
    </InsightCard>
  );
}

function ActionRow({
  action,
  scope,
  periodTo,
  canManageCrm,
}: {
  action: GuestActionItem;
  scope: Scope;
  periodTo: string;
  canManageCrm: boolean;
}) {
  const href = actionHref(action, scope);

  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white dark:bg-emerald-400 dark:text-zinc-950">
        {action.priority}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {action.title}
          </p>
          <InsightBadge tone={signalTone(action.tone)}>
            {formatNumber(action.count)}
          </InsightBadge>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {action.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PillLink href={href}>
            {action.action.kind === "OPEN_TASKS"
              ? "Открыть задачи"
              : action.action.kind === "OPEN_GAME"
                ? action.action.label
                : "Открыть список"}
          </PillLink>
          {action.action.kind === "CREATE_TASK" &&
          canManageCrm &&
          action.action.taskTitle ? (
            <GuestSignalTaskButton
              compact
              label={action.action.label}
              audienceName={`${action.title} · ${periodTo}`}
              audienceFilters={signalListFilters(scope, action.listFilters)}
              taskTitle={action.action.taskTitle}
              taskDescription={action.action.taskDescription}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}
