"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  StaffChatChannel,
  StaffChatChannelScope,
  StaffChatMessage,
  StaffChatMessageKind,
  StaffChatMessagePriority,
  StaffChatStore,
  StaffTeamChatReport,
} from "@/lib/staff-team-chat";

type FormState = {
  body: string;
  kind: StaffChatMessageKind;
  priority: StaffChatMessagePriority;
  isPinned: boolean;
  storeId: string;
};

type ChannelFormState = {
  name: string;
  description: string;
  scope: StaffChatChannelScope;
  storeId: string;
  roleScope: string;
};

type TaskDraftState = {
  messageId: string;
  title: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  dueAt: string;
  storeId: string;
};

const kindLabels: Record<StaffChatMessageKind, string> = {
  MESSAGE: "Сообщение",
  ANNOUNCEMENT: "Объявление",
  INCIDENT: "Инцидент",
};

const priorityLabels: Record<StaffChatMessagePriority, string> = {
  NORMAL: "Обычное",
  HIGH: "Важное",
  URGENT: "Срочно",
};

const taskPriorityLabels: Record<TaskDraftState["priority"], string> = {
  NORMAL: "Обычный",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

const scopeLabels: Record<StaffChatChannelScope, string> = {
  NETWORK: "Вся сеть",
  STORE: "Клуб",
  ROLE: "Роль",
};

const emptyForm: FormState = {
  body: "",
  kind: "MESSAGE",
  priority: "NORMAL",
  isPinned: false,
  storeId: "",
};

const emptyChannelForm: ChannelFormState = {
  name: "",
  description: "",
  scope: "NETWORK",
  storeId: "",
  roleScope: "ALL_STAFF",
};

export function StaffTeamChatWorkspace({
  report,
}: {
  report: StaffTeamChatReport;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [channelForm, setChannelForm] =
    useState<ChannelFormState>(emptyChannelForm);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraftState | null>(null);
  const [taskPendingMessageId, setTaskPendingMessageId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const activeChannel = useMemo(
    () =>
      report.channels.find((channel) => channel.id === report.activeChannelId) ??
      report.channels[0] ??
      null,
    [report.activeChannelId, report.channels],
  );
  const pinnedMessages = report.messages.filter((message) => message.isPinned);

  async function sendMessage() {
    setError(null);
    setSuccess(null);

    if (!activeChannel) {
      setError("Сначала нужен канал для сообщения.");
      return;
    }

    if (!form.body.trim()) {
      setError("Введите текст сообщения.");
      return;
    }

    const response = await fetch("/api/staff/team-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: activeChannel.id,
        body: form.body,
        kind: form.kind,
        priority: form.priority,
        isPinned: form.isPinned,
        storeId: form.storeId || undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось отправить сообщение.");
      return;
    }

    setForm(emptyForm);
    startTransition(() => router.refresh());
  }

  async function createChannel() {
    setError(null);
    setSuccess(null);

    if (!channelForm.name.trim()) {
      setError("Введите название канала.");
      return;
    }

    if (channelForm.scope === "STORE" && !channelForm.storeId) {
      setError("Для клубного канала выберите клуб.");
      return;
    }

    const response = await fetch("/api/staff/team-chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: channelForm.name,
        description: channelForm.description || undefined,
        scope: channelForm.scope,
        storeId:
          channelForm.scope === "STORE" ? channelForm.storeId : undefined,
        roleScope:
          channelForm.scope === "ROLE" ? channelForm.roleScope : undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось создать канал.");
      return;
    }

    setChannelForm(emptyChannelForm);
    setShowChannelForm(false);
    startTransition(() => router.refresh());
  }

  async function markChannelRead() {
    if (!activeChannel) {
      return;
    }

    setError(null);
    setSuccess(null);
    const response = await fetch("/api/staff/team-chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: activeChannel.id }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось отметить сообщения.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function togglePinned(message: StaffChatMessage) {
    setError(null);
    setSuccess(null);
    const response = await fetch(
      `/api/staff/team-chat/messages/${encodeURIComponent(message.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !message.isPinned }),
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(payload?.message ?? "Не удалось обновить закрепление.");
      return;
    }

    startTransition(() => router.refresh());
  }

  function openTaskDraft(message: StaffChatMessage) {
    setError(null);
    setSuccess(null);
    setTaskDraft({
      messageId: message.id,
      title: buildTaskTitle(message),
      priority: message.priority === "NORMAL" ? "NORMAL" : message.priority,
      dueAt: "",
      storeId: message.store?.id ?? "",
    });
  }

  async function createTaskFromMessage(message: StaffChatMessage) {
    if (!taskDraft || taskDraft.messageId !== message.id) {
      return;
    }

    const title = taskDraft.title.trim();

    if (!title) {
      setError("Укажите название задачи.");
      return;
    }

    const dueAtDate = taskDraft.dueAt ? new Date(taskDraft.dueAt) : null;

    if (dueAtDate && Number.isNaN(dueAtDate.getTime())) {
      setError("Проверьте дату дедлайна.");
      return;
    }

    const dueAt = dueAtDate ? dueAtDate.toISOString() : null;
    const sourceUrl = `/staff/team-chat?channelId=${encodeURIComponent(
      message.channelId,
    )}`;
    setTaskPendingMessageId(message.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/staff/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: buildTaskDescription(message, activeChannel),
          type: taskDraft.storeId ? "CLUB" : "ONE_TIME",
          priority: taskDraft.priority,
          dueAt,
          storeId: taskDraft.storeId || null,
          labels: {
            source: "team_chat",
            staffChatMessageId: message.id,
            staffChatChannelId: message.channelId,
            staffChatChannelName: activeChannel?.name ?? null,
            sourceUrl,
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось создать задачу.");
      }

      setTaskDraft(null);
      setSuccess("Задача создана из сообщения. Она появилась в задачах персонала.");
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса.");
    } finally {
      setTaskPendingMessageId(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каналы
              </p>
              <h2 className="mt-1 text-lg font-semibold">Оперативная связь</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowChannelForm((value) => !value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Новый
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {report.channels.map((channel) => (
              <ChannelLink
                key={channel.id}
                channel={channel}
                active={channel.id === activeChannel?.id}
              />
            ))}
          </div>

          {report.channels.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Каналы появятся после первого открытия раздела.
            </p>
          ) : null}
        </section>

        {showChannelForm ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Новый канал
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Название
                </span>
                <input
                  value={channelForm.name}
                  onChange={(event) =>
                    setChannelForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                  placeholder="Например, Ночная смена"
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Описание
                </span>
                <input
                  value={channelForm.description}
                  onChange={(event) =>
                    setChannelForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                  placeholder="Для чего этот канал"
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Доступ
                </span>
                <select
                  value={channelForm.scope}
                  onChange={(event) =>
                    setChannelForm((current) => ({
                      ...current,
                      scope: event.target.value as StaffChatChannelScope,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {Object.entries(scopeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {channelForm.scope === "STORE" ? (
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">
                    Клуб
                  </span>
                  <select
                    value={channelForm.storeId}
                    onChange={(event) =>
                      setChannelForm((current) => ({
                        ...current,
                        storeId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <option value="">Выберите клуб</option>
                    {report.stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {channelForm.scope === "ROLE" ? (
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">
                    Роль
                  </span>
                  <select
                    value={channelForm.roleScope}
                    onChange={(event) =>
                      setChannelForm((current) => ({
                        ...current,
                        roleScope: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {report.roleScopes.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={createChannel}
                disabled={isPending}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Создать канал
              </button>
            </div>
          </section>
        ) : null}
      </aside>

      <section className="min-w-0 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Лента
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                {activeChannel?.name ?? "Командный чат"}
              </h2>
              {activeChannel?.description ? (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {activeChannel.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff/tasks"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Открыть задачи
              </Link>
              <button
                type="button"
                onClick={() => startTransition(() => router.refresh())}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Обновить
              </button>
              <button
                type="button"
                onClick={markChannelRead}
                disabled={!activeChannel || isPending}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Прочитано
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
            <Metric label="Каналы" value={report.summary.channels} />
            <Metric label="Сообщения" value={report.summary.messages} />
            <Metric label="Закреплено" value={report.summary.pinned} />
            <Metric label="Непрочитано" value={report.summary.unread} />
          </div>

          <form className="mt-4 flex flex-wrap gap-2" action="/staff/team-chat">
            {activeChannel ? (
              <input type="hidden" name="channelId" value={activeChannel.id} />
            ) : null}
            <input
              name="search"
              defaultValue={report.filters.search ?? ""}
              className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="Поиск по сообщениям"
            />
            <select
              name="pinned"
              defaultValue={report.filters.pinned ? "true" : ""}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">Все сообщения</option>
              <option value="true">Только закрепленные</option>
            </select>
            <button
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              type="submit"
            >
              Найти
            </button>
          </form>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span>{success}</span>
            <Link className="font-semibold underline" href="/staff/tasks">
              Перейти к задачам
            </Link>
          </div>
        ) : null}

        {pinnedMessages.length > 0 ? (
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800 sm:p-5">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Закреплено
            </p>
            <div className="mt-3 grid gap-2">
              {pinnedMessages.map((message) => (
                <MessageCard
                  key={`pinned-${message.id}`}
                  message={message}
                  compact
                  stores={report.stores}
                  taskDraft={taskDraft}
                  taskPendingMessageId={taskPendingMessageId}
                  onTogglePinned={togglePinned}
                  onOpenTaskDraft={openTaskDraft}
                  onCancelTaskDraft={() => setTaskDraft(null)}
                  onTaskDraftChange={setTaskDraft}
                  onCreateTask={createTaskFromMessage}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="max-h-[620px] space-y-3 overflow-y-auto p-4 sm:p-5">
          {report.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              stores={report.stores}
              taskDraft={taskDraft}
              taskPendingMessageId={taskPendingMessageId}
              onTogglePinned={togglePinned}
              onOpenTaskDraft={openTaskDraft}
              onCancelTaskDraft={() => setTaskDraft(null)}
              onTaskDraftChange={setTaskDraft}
              onCreateTask={createTaskFromMessage}
            />
          ))}

          {report.messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              В этом канале пока нет сообщений. Напишите первое объявление,
              сменный комментарий или инцидент.
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px]">
            <textarea
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              className="min-h-24 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="Что нужно передать смене или управляющим?"
            />
            <div className="space-y-2">
              <select
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as StaffChatMessageKind,
                    isPinned:
                      event.target.value === "ANNOUNCEMENT" ||
                      current.isPinned,
                  }))
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as StaffChatMessagePriority,
                  }))
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isPinned: event.target.checked,
                    }))
                  }
                />
                Закрепить
              </label>
              <button
                type="button"
                onClick={sendMessage}
                disabled={isPending || !activeChannel}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChannelLink({
  channel,
  active,
}: {
  channel: StaffChatChannel;
  active: boolean;
}) {
  const href = `/staff/team-chat?channelId=${encodeURIComponent(channel.id)}`;

  return (
    <Link
      href={href}
      className={[
        "block rounded-lg border px-3 py-3 text-sm transition",
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-200 hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:bg-zinc-900/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{channel.name}</p>
          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {channelScopeLabel(channel)}
          </p>
        </div>
        {channel.unreadCount > 0 ? (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-zinc-950">
            {formatNumber(channel.unreadCount)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{formatNumber(channel.messagesCount)} сообщ.</span>
        {channel.pinnedCount > 0 ? (
          <span>{formatNumber(channel.pinnedCount)} закреп.</span>
        ) : null}
      </div>
    </Link>
  );
}

function MessageCard({
  message,
  stores,
  compact = false,
  taskDraft,
  taskPendingMessageId,
  onTogglePinned,
  onOpenTaskDraft,
  onCancelTaskDraft,
  onTaskDraftChange,
  onCreateTask,
}: {
  message: StaffChatMessage;
  stores: StaffChatStore[];
  compact?: boolean;
  taskDraft: TaskDraftState | null;
  taskPendingMessageId: string | null;
  onTogglePinned: (message: StaffChatMessage) => void;
  onOpenTaskDraft: (message: StaffChatMessage) => void;
  onCancelTaskDraft: () => void;
  onTaskDraftChange: (draft: TaskDraftState) => void;
  onCreateTask: (message: StaffChatMessage) => void;
}) {
  const isTaskDraftOpen = taskDraft?.messageId === message.id && !compact;
  const isTaskPending = taskPendingMessageId === message.id;

  return (
    <article
      className={[
        "rounded-lg border p-3",
        message.priority === "URGENT"
          ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
          : message.priority === "HIGH"
            ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
            : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {message.authorUser?.fullName ??
                message.authorUser?.email ??
                "Сотрудник"}
            </p>
            <Badge>{kindLabels[message.kind]}</Badge>
            {message.priority !== "NORMAL" ? (
              <Badge tone={message.priority === "URGENT" ? "red" : "amber"}>
                {priorityLabels[message.priority]}
              </Badge>
            ) : null}
            {message.isPinned ? <Badge tone="emerald">Закреплено</Badge> : null}
            {!message.isReadByMe ? <Badge tone="emerald">Новое</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTime(message.createdAt)}
            {message.store ? ` · ${message.store.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!compact ? (
            <button
              type="button"
              onClick={() => onOpenTaskDraft(message)}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Создать задачу
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onTogglePinned(message)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
          >
            {message.isPinned ? "Открепить" : "Закрепить"}
          </button>
        </div>
      </div>
      <p
        className={[
          "whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100",
          compact ? "mt-2 line-clamp-3" : "mt-3",
        ].join(" ")}
      >
        {message.body}
      </p>

      {isTaskDraftOpen && taskDraft ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-500/30 dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Задача из сообщения
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Текст сообщения сохранится в описании, а связь с чатом попадет
                в служебные метки задачи.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelTaskDraft}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold transition hover:border-zinc-400 dark:border-zinc-700"
            >
              Закрыть
            </button>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_150px_170px_170px]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Что сделать
              </span>
              <input
                value={taskDraft.title}
                onChange={(event) =>
                  onTaskDraftChange({
                    ...taskDraft,
                    title: event.target.value,
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Приоритет
              </span>
              <select
                value={taskDraft.priority}
                onChange={(event) =>
                  onTaskDraftChange({
                    ...taskDraft,
                    priority: event.target.value as TaskDraftState["priority"],
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(taskPriorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                value={taskDraft.storeId}
                onChange={(event) =>
                  onTaskDraftChange({
                    ...taskDraft,
                    storeId: event.target.value,
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Дедлайн
              </span>
              <input
                value={taskDraft.dueAt}
                type="datetime-local"
                onChange={(event) =>
                  onTaskDraftChange({
                    ...taskDraft,
                    dueAt: event.target.value,
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCreateTask(message)}
              disabled={isTaskPending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTaskPending ? "Создаем..." : "Создать задачу"}
            </button>
            <Link
              href="/staff/tasks"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:hover:border-emerald-500"
            >
              Задачи персонала
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "emerald" | "amber" | "red";
}) {
  const classes = {
    zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    emerald:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    amber:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function channelScopeLabel(channel: StaffChatChannel) {
  if (channel.scope === "STORE") {
    return channel.store?.name ?? "Канал клуба";
  }

  if (channel.scope === "ROLE") {
    return channel.roleScope ?? "Канал роли";
  }

  return "Вся сеть";
}

function buildTaskTitle(message: StaffChatMessage) {
  const firstLine = message.body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const base = firstLine ?? "Сообщение из командного чата";
  const clipped = base.length > 80 ? `${base.slice(0, 77)}...` : base;
  return `Из чата: ${clipped}`;
}

function buildTaskDescription(
  message: StaffChatMessage,
  channel: StaffChatChannel | null,
) {
  const author =
    message.authorUser?.fullName ?? message.authorUser?.email ?? "Сотрудник";
  const lines = [
    "Источник: командный чат LeetPlus.",
    `Канал: ${channel?.name ?? message.channelId}`,
    `Автор: ${author}`,
    `Дата сообщения: ${formatDateTime(message.createdAt)}`,
    message.store ? `Клуб: ${message.store.name}` : "Клуб: вся сеть",
    "",
    "Сообщение:",
    message.body,
  ];

  return lines.join("\n");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}
