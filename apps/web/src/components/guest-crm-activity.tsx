import Link from "next/link";
import type { GuestCrmTask, GuestDetail } from "@/lib/guests";
import {
  crmStatusLabels,
  crmStatusTone,
  formatDate,
  formatDateTime,
} from "@/lib/guest-insights";
import {
  EmptyNote,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
} from "@/components/guest-insight-ui";
import { GuestCrmQuickActions } from "@/components/guest-crm-quick-actions";

const taskStatusLabels: Record<GuestCrmTask["status"], string> = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Закрыта",
  CANCELED: "Отменена",
};

function taskTone(task: GuestCrmTask, now: Date) {
  if (task.status === "DONE") return "good" as const;
  if (task.status === "CANCELED") return "neutral" as const;
  if (task.dueAt && new Date(task.dueAt) < now) return "danger" as const;
  if (task.status === "IN_PROGRESS") return "info" as const;
  return "warning" as const;
}

export function GuestCrmActivity({
  guest,
  canManageCommunications,
}: {
  guest: GuestDetail;
  canManageCommunications: boolean;
}) {
  const now = new Date();
  const activeTasks = guest.crmTasks.filter(
    (task) => task.status === "OPEN" || task.status === "IN_PROGRESS",
  );
  const closedTasks = guest.crmTasks.filter(
    (task) => task.status === "DONE" || task.status === "CANCELED",
  );

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Работа с гостем"
        title="Задачи, контакты и история"
        description="Задачи и касания создаются в LeetPlus и не затираются синхронизацией Langame."
        aside={
          <Link
            href="/guests/crm/tasks?status=all"
            className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
          >
            Все задачи CRM
          </Link>
        }
      />
      <div className="space-y-4 p-4">
        {canManageCommunications ? (
          <GuestCrmQuickActions
            guestId={guest.id}
            defaultTaskTitle={
              guest.recommendedAction.key === "MANUAL" ||
              guest.recommendedAction.key === "OBSERVE"
                ? `Связаться: ${guest.displayName}`
                : `${guest.recommendedAction.label}: ${guest.displayName}`
            }
          />
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Открытые задачи
          </p>
          {activeTasks.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Открытых задач нет.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {activeTasks.map((task) => (
                <li key={task.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-zinc-500">
                      {task.assignedToUser
                        ? task.assignedToUser.displayName
                        : "без ответственного"}
                      {task.audience ? ` · группа ${task.audience.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <InsightBadge tone={taskTone(task, now)}>
                      {taskStatusLabels[task.status]}
                    </InsightBadge>
                    <p className="mt-1 text-zinc-500">
                      {task.dueAt ? `срок ${formatDate(task.dueAt)}` : "без срока"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            История контактов
          </p>
          {guest.contactEvents.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Касаний ещё не было.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {guest.contactEvents.map((event) => (
                <li key={event.id} className="py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">
                      {event.channel}
                      {event.result ? ` · ${event.result}` : ""}
                    </p>
                    <p className="shrink-0 text-xs text-zinc-500">
                      {formatDateTime(event.contactedAt)}
                    </p>
                  </div>
                  {event.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                      {event.note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-400">
                    {event.marketingCampaign
                      ? `кампания ${event.marketingCampaign.name} · `
                      : ""}
                    {event.createdBy ?? "Система"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            История CRM-статусов
          </p>
          {guest.crmEvents.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">CRM-статус ещё не менялся.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {guest.crmEvents.map((event) => (
                <li key={event.id} className="py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <InsightBadge tone={crmStatusTone(event.status)}>
                        {crmStatusLabels[event.status]}
                      </InsightBadge>
                      {event.nextAction ? (
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {event.nextAction}
                        </span>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-zinc-500">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                  {event.nextContactAt ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Контакт: {formatDate(event.nextContactAt)}
                    </p>
                  ) : null}
                  {event.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                      {event.note}
                    </p>
                  ) : null}
                  {event.createdBy ? (
                    <p className="mt-1 text-xs text-zinc-400">Изменил: {event.createdBy}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {closedTasks.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Закрытые задачи ({closedTasks.length})
            </summary>
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {closedTasks.map((task) => (
                <li key={task.id} className="flex items-start justify-between gap-3 py-2">
                  <p className="text-sm">{task.title}</p>
                  <p className="shrink-0 text-xs text-zinc-500">
                    {taskStatusLabels[task.status]} ·{" "}
                    {formatDate(task.completedAt ?? task.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {!canManageCommunications ? (
          <EmptyNote>
            Создание задач и запись контактов доступны с правом «Коммуникации:
            управление» в сетевом режиме.
          </EmptyNote>
        ) : null}
      </div>
    </InsightCard>
  );
}
