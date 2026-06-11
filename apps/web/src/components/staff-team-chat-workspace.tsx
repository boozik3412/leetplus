"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import type {
  StaffChatAttachment,
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
  memberUserIds: string[];
};

type TaskDraftState = {
  messageId: string;
  title: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  dueAt: string;
  storeId: string;
};

type StaffTeamChatLiveState = {
  summary: StaffTeamChatReport["summary"];
  channels: Array<{
    id: string;
    updatedAt: string;
    messagesCount: number;
    unreadCount: number;
    pinnedCount: number;
    lastMessageAt: string | null;
  }>;
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
  CUSTOM: "Кастомный",
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
  memberUserIds: [],
};

const TEAM_CHAT_LIVE_REFRESH_MS = 12_000;
const SYSTEM_NOTIFICATION_CHANNEL_NAME = "Уведомления";

function getChannelReadSnapshot(channel: StaffChatChannel) {
  return `${channel.messagesCount}:${channel.lastMessageAt ?? ""}`;
}

function isSystemNotificationChannel(channel: StaffChatChannel | null) {
  return channel?.name === SYSTEM_NOTIFICATION_CHANNEL_NAME;
}

function getLiveChannelSignature(
  channels: Array<{
    id: string;
    updatedAt?: string;
    messagesCount: number;
    unreadCount: number;
    pinnedCount: number;
    lastMessageAt: string | null;
  }>,
) {
  return channels
    .map((channel) =>
      [
        channel.id,
        channel.updatedAt ?? "",
        channel.messagesCount,
        channel.unreadCount,
        channel.pinnedCount,
        channel.lastMessageAt ?? "",
      ].join(":"),
    )
    .sort()
    .join("|");
}

function getReportLiveSignature(report: StaffTeamChatReport) {
  return [
    report.summary.channels,
    report.summary.messages,
    report.summary.pinned,
    report.summary.unread,
    getLiveChannelSignature(report.channels),
  ].join(";");
}

function getLiveStateSignature(state: StaffTeamChatLiveState) {
  return [
    state.summary.channels,
    state.summary.messages,
    state.summary.pinned,
    state.summary.unread,
    getLiveChannelSignature(state.channels),
  ].join(";");
}

export function StaffTeamChatWorkspace({
  report,
  requestedChannelId,
  initialDraft,
}: {
  report: StaffTeamChatReport;
  requestedChannelId: string | null;
  initialDraft: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [channelForm, setChannelForm] =
    useState<ChannelFormState>(emptyChannelForm);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    StaffAttachmentUploadResult[]
  >([]);
  const [taskDraft, setTaskDraft] = useState<TaskDraftState | null>(null);
  const [taskPendingMessageId, setTaskPendingMessageId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locallyReadChannels, setLocallyReadChannels] = useState<
    Record<string, string>
  >({});
  const autoReadSignatureRef = useRef<string | null>(null);
  const initialDraftSignatureRef = useRef<string | null>(null);
  const selectedChannelId = requestedChannelId;
  const activeChannel = useMemo(() => {
    if (!selectedChannelId) {
      return null;
    }

    return (
      report.channels.find((channel) => channel.id === selectedChannelId) ??
      null
    );
  }, [selectedChannelId, report.channels]);
  const activeChannelIsSystem = isSystemNotificationChannel(activeChannel);

  useEffect(() => {
    const draft = initialDraft?.trim();

    if (!draft || !activeChannel || activeChannelIsSystem) {
      return;
    }

    const signature = `${activeChannel.id}:${draft}`;

    if (initialDraftSignatureRef.current === signature) {
      return;
    }

    initialDraftSignatureRef.current = signature;
    setForm((current) => {
      if (current.body.trim()) {
        return current;
      }

      return {
        ...current,
        body: draft,
        storeId: current.storeId || activeChannel.store?.id || "",
      };
    });
  }, [activeChannel, activeChannelIsSystem, initialDraft]);

  const activeUnreadSignature = useMemo(() => {
    if (!activeChannel) {
      return null;
    }

    const unreadMessageIds = report.messages
      .filter(
        (message) =>
          message.channelId === activeChannel.id && !message.isReadByMe,
      )
      .map((message) => message.id);

    if (activeChannel.unreadCount === 0 && unreadMessageIds.length === 0) {
      return null;
    }

    return [
      activeChannel.id,
      activeChannel.unreadCount,
      unreadMessageIds.join(","),
    ].join(":");
  }, [activeChannel, report.messages]);
  const markChannelLocallyRead = useCallback((channel: StaffChatChannel) => {
    setLocallyReadChannels((current) => {
      const snapshot = getChannelReadSnapshot(channel);

      if (current[channel.id] === snapshot) {
        return current;
      }

      return { ...current, [channel.id]: snapshot };
    });
  }, []);
  const postChannelRead = useCallback(
    async (channel: StaffChatChannel) => {
      const response = await fetch("/api/staff/team-chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id }),
      });

      if (response.ok) {
        markChannelLocallyRead(channel);
      }

      return response;
    },
    [markChannelLocallyRead],
  );
  const activeChannelLocallyRead = activeChannel
    ? locallyReadChannels[activeChannel.id] ===
      getChannelReadSnapshot(activeChannel)
    : false;
  const pinnedMessages = report.messages.filter((message) => message.isPinned);
  const liveSignature = useMemo(() => getReportLiveSignature(report), [report]);
  const liveSignatureRef = useRef(liveSignature);

  useEffect(() => {
    liveSignatureRef.current = liveSignature;
  }, [liveSignature]);

  useEffect(() => {
    let source: EventSource | null = null;
    let fallbackIntervalId: number | null = null;

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => router.refresh());
    };

    const stopFallback = () => {
      if (fallbackIntervalId === null) {
        return;
      }

      window.clearInterval(fallbackIntervalId);
      fallbackIntervalId = null;
    };

    const startFallback = () => {
      if (fallbackIntervalId !== null) {
        return;
      }

      fallbackIntervalId = window.setInterval(
        refreshIfVisible,
        TEAM_CHAT_LIVE_REFRESH_MS,
      );
    };

    const closeSource = () => {
      source?.close();
      source = null;
    };

    const openSource = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!("EventSource" in window)) {
        startFallback();
        return;
      }

      closeSource();
      stopFallback();

      const params = new URLSearchParams();

      if (selectedChannelId) {
        params.set("channelId", selectedChannelId);
      }

      const query = params.toString();
      source = new EventSource(
        `/api/staff/team-chat/events${query ? `?${query}` : ""}`,
      );

      source.addEventListener("team-chat-state", (event) => {
        try {
          const payload = JSON.parse(
            (event as MessageEvent<string>).data,
          ) as StaffTeamChatLiveState;
          const nextSignature = getLiveStateSignature(payload);

          if (
            nextSignature !== liveSignatureRef.current &&
            document.visibilityState === "visible"
          ) {
            liveSignatureRef.current = nextSignature;
            startTransition(() => router.refresh());
          }
        } catch {
          // Ignore malformed stream events and keep the current UI state.
        }
      });

      source.onerror = () => {
        closeSource();
        startFallback();
      };
    };

    const handleFocus = () => {
      if (!source) {
        openSource();
      }

      refreshIfVisible();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        openSource();
        refreshIfVisible();
        return;
      }

      closeSource();
    };

    openSource();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      closeSource();
      stopFallback();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, selectedChannelId, startTransition]);

  useEffect(() => {
    if (!activeChannel || !activeUnreadSignature) {
      return;
    }

    let cancelled = false;

    const markVisibleChannelRead = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (autoReadSignatureRef.current === activeUnreadSignature) {
        return;
      }

      autoReadSignatureRef.current = activeUnreadSignature;

      try {
        const response = await postChannelRead(activeChannel);

        if (cancelled) {
          return;
        }

        if (response.ok) {
          startTransition(() => router.refresh());
        } else {
          autoReadSignatureRef.current = null;
        }
      } catch {
        if (!cancelled) {
          autoReadSignatureRef.current = null;
        }
      }
    };

    void markVisibleChannelRead();
    window.addEventListener("focus", markVisibleChannelRead);
    document.addEventListener("visibilitychange", markVisibleChannelRead);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", markVisibleChannelRead);
      document.removeEventListener("visibilitychange", markVisibleChannelRead);
    };
  }, [
    activeChannel,
    activeUnreadSignature,
    postChannelRead,
    router,
    startTransition,
  ]);

  function handleAttachmentUploaded(attachment: StaffAttachmentUploadResult) {
    setPendingAttachments((current) => {
      if (current.some((item) => item.id === attachment.id)) {
        return current;
      }

      return [...current, attachment].slice(0, 5);
    });
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  }

  async function sendMessage() {
    setError(null);
    setSuccess(null);

    if (!activeChannel) {
      setError("Сначала нужен канал для сообщения.");
      return;
    }

    if (activeChannelIsSystem) {
      setError("В канал уведомлений сообщения добавляются автоматически.");
      return;
    }

    if (!form.body.trim() && pendingAttachments.length === 0) {
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
        attachmentIds: pendingAttachments.map((attachment) => attachment.id),
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
    setPendingAttachments([]);
    setShowMessageOptions(false);
    startTransition(() => router.refresh());
  }

  async function createChannel() {
    setError(null);
    setSuccess(null);

    if (!report.canManageChannels) {
      setError("Создание каналов недоступно для этой роли.");
      return;
    }

    if (!channelForm.name.trim()) {
      setError("Введите название канала.");
      return;
    }

    if (channelForm.scope === "STORE" && !channelForm.storeId) {
      setError("Для клубного канала выберите клуб.");
      return;
    }

    if (
      channelForm.scope === "CUSTOM" &&
      channelForm.memberUserIds.length === 0
    ) {
      setError("Для кастомного канала выберите сотрудников.");
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
        memberUserIds:
          channelForm.scope === "CUSTOM"
            ? channelForm.memberUserIds
            : undefined,
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

  function toggleChannelMember(userId: string) {
    setChannelForm((current) => {
      const selected = new Set(current.memberUserIds);

      if (selected.has(userId)) {
        selected.delete(userId);
      } else {
        selected.add(userId);
      }

      return { ...current, memberUserIds: Array.from(selected) };
    });
  }

  async function markChannelRead() {
    if (!activeChannel) {
      return;
    }

    setError(null);
    setSuccess(null);
    const response = await postChannelRead(activeChannel);

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

  const isChatOpen = Boolean(activeChannel);

  return (
    <div
      className={[
        "grid items-stretch gap-4 lg:grid-cols-1",
        isChatOpen
          ? "lg:min-h-[calc(100vh-15rem)] xl:min-h-[calc(100vh-13rem)]"
          : "w-full max-w-6xl",
      ].join(" ")}
    >
      {!isChatOpen ? (
        <aside className="space-y-5 lg:flex lg:flex-col">
          <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каналы
              </p>
              <h2 className="mt-1 text-xl font-semibold">Оперативная связь</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowChannelForm((value) => !value)}
              className={[
                "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200",
                report.canManageChannels ? "" : "hidden",
              ].join(" ")}
            >
              Новый
            </button>
          </div>

          <div className="mt-6 grid gap-x-8 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
            {report.channels.map((channel) => (
              <ChannelLink
                key={channel.id}
                channel={channel}
                active={channel.id === activeChannel?.id}
                unreadCount={
                  locallyReadChannels[channel.id] ===
                  getChannelReadSnapshot(channel)
                    ? 0
                    : channel.unreadCount
                }
              />
            ))}
          </div>

          {report.channels.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Каналы появятся после первого открытия раздела.
            </p>
          ) : null}
          </section>

          {showChannelForm && report.canManageChannels ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                      storeId: "",
                      memberUserIds: [],
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
              {channelForm.scope === "CUSTOM" ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-500">
                        Участники
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Выберите сотрудников, которые увидят этот канал.
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {channelForm.memberUserIds.length}
                    </span>
                  </div>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {report.users.map((user) => {
                      const checked = channelForm.memberUserIds.includes(
                        user.id,
                      );

                      return (
                        <label
                          key={user.id}
                          className={[
                            "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition",
                            checked
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-zinc-200 bg-white hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500",
                          ].join(" ")}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {user.fullName ?? user.email}
                            </span>
                            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {user.email}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChannelMember(user.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
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
      ) : null}

      {activeChannel ? (
        <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950 lg:h-[calc(100vh-13rem)]">
          <div className="shrink-0 border-b border-zinc-200/70 p-3 dark:border-zinc-800/70 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/staff/team-chat"
                aria-label="Закрыть текущий чат"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                ×
              </Link>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/25">
                {getChannelInitial(activeChannel)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {activeChannel.name}
                </h2>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {channelScopeLabel(activeChannel)}
                  {activeChannel.members.length > 0
                    ? ` · ${formatNumber(activeChannel.members.length)} участников`
                    : ""}
                  {activeChannel.lastMessageAt
                    ? ` · ${formatDateTime(activeChannel.lastMessageAt)}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff/tasks"
                className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-500 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-400 dark:hover:bg-sky-500/10 dark:hover:text-sky-200"
              >
                Открыть задачи
              </Link>
              <button
                type="button"
                onClick={() => startTransition(() => router.refresh())}
                className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
              >
                Обновить
              </button>
              <button
                type="button"
                onClick={markChannelRead}
                disabled={!activeChannel || isPending}
                className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
              >
                Прочитано
              </button>
            </div>
          </div>

          <div className="hidden">
            <Metric label="Каналы" value={report.summary.channels} />
            <Metric label="Сообщения" value={report.summary.messages} />
            <Metric label="Закреплено" value={report.summary.pinned} />
            <Metric label="Непрочитано" value={report.summary.unread} />
          </div>

          <form className="hidden" action="/staff/team-chat">
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
          <div className="mx-4 mt-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mx-4 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span>{success}</span>
            <Link className="font-semibold underline" href="/staff/tasks">
              Перейти к задачам
            </Link>
          </div>
        ) : null}

        {pinnedMessages.length > 0 ? (
          <details className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-600 transition hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-200">
              <span>Закреплено</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {formatNumber(pinnedMessages.length)}
              </span>
            </summary>
            <div className="mt-3 space-y-2">
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
                  allowTaskDraft={!activeChannelIsSystem}
                  forceRead={
                    activeChannelLocallyRead &&
                    message.channelId === activeChannel?.id
                  }
                />
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex-1 space-y-0 overflow-y-auto">
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
              allowTaskDraft={!activeChannelIsSystem}
              forceRead={
                activeChannelLocallyRead &&
                message.channelId === activeChannel?.id
              }
            />
          ))}

          {report.messages.length === 0 ? (
            <div className="px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400 sm:px-5">
              {activeChannelIsSystem
                ? "В этом канале пока нет уведомлений. Они появятся автоматически при назначении задач, курсов, изменении регламентов и других событиях."
                : "В этом канале пока нет сообщений. Напишите первое объявление, сменный комментарий или инцидент."}
            </div>
          ) : null}
        </div>

        {activeChannelIsSystem ? (
          <div className="shrink-0 border-t border-zinc-200/60 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-400 sm:px-5">
            Канал заполняется автоматически системными событиями LeetPlus.
          </div>
        ) : (
        <div className="shrink-0 border-t border-zinc-200/60 bg-transparent p-3 dark:border-zinc-800/60 sm:p-4">
          <div className="rounded-[24px] bg-zinc-100/90 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900/70 dark:ring-zinc-800/70">
            {pendingAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {pendingAttachments.map((attachment) => (
                  <span
                    key={attachment.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950/80 dark:text-zinc-200 dark:ring-zinc-800"
                  >
                    <span className="max-w-[220px] truncate">
                      {attachment.fileName}
                    </span>
                    <span className="text-zinc-400">
                      {formatBytes(attachment.byteSize)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="text-zinc-400 transition-colors hover:text-red-500"
                      aria-label="Убрать файл"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex h-11 items-center gap-2">
              <button
                type="button"
                aria-controls="message-format-options"
                aria-expanded={showMessageOptions}
                onClick={() => setShowMessageOptions((value) => !value)}
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-semibold leading-none transition-colors",
                  showMessageOptions
                    ? "bg-emerald-500 text-zinc-950"
                    : "bg-white text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-950/70 dark:text-zinc-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200",
                ].join(" ")}
              >
                +
              </button>
              <textarea
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                className="h-11 min-h-11 flex-1 resize-none overflow-hidden rounded-full border-0 bg-transparent px-2 py-3 text-sm leading-5 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                placeholder="Что нужно передать смене или управляющим?"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={
                  isPending ||
                  !activeChannel ||
                  (!form.body.trim() && pendingAttachments.length === 0)
                }
                className="h-11 shrink-0 rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отправить
              </button>
            </div>
            <div
              id="message-format-options"
              className={
                showMessageOptions
                  ? "mt-2 grid gap-2 rounded-2xl bg-white/70 p-3 dark:bg-zinc-950/50 sm:grid-cols-2 lg:grid-cols-[180px_180px_1fr_180px]"
                  : "hidden"
              }
            >
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
                className="w-full rounded-lg border border-zinc-200/80 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800/80"
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
                className="w-full rounded-lg border border-zinc-200/80 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800/80"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {pendingAttachments.length < 5 ? (
                <StaffAttachmentUpload
                  label="Файл"
                  buttonLabel="Прикрепить файл"
                  onUploaded={handleAttachmentUploaded}
                />
              ) : (
                <p className="flex min-h-10 items-center text-xs text-zinc-500 dark:text-zinc-400">
                  До 5 файлов в сообщении.
                </p>
              )}
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200/80 bg-transparent px-3 text-sm dark:border-zinc-800/80">
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
            </div>
          </div>
        </div>
        )}
        </section>
      ) : null}
    </div>
  );
}

function ChannelLink({
  channel,
  active,
  unreadCount,
}: {
  channel: StaffChatChannel;
  active: boolean;
  unreadCount: number;
}) {
  const href = `/staff/team-chat?channelId=${encodeURIComponent(channel.id)}`;

  return (
    <Link
      href={href}
      className={[
        "group flex min-h-20 items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        active
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100"
          : "hover:bg-zinc-100/70 dark:hover:bg-zinc-900/55",
      ].join(" ")}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 ring-1 ring-zinc-200 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700 group-hover:ring-emerald-200 dark:bg-zinc-900/70 dark:text-zinc-300 dark:ring-zinc-800/80 dark:group-hover:bg-emerald-500/15 dark:group-hover:text-emerald-200 dark:group-hover:ring-emerald-500/25">
        {getChannelInitial(channel)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{channel.name}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {channelScopeLabel(channel)}
            </p>
          </div>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-zinc-950">
            {formatNumber(unreadCount)}
          </span>
        ) : null}
        </div>
        <div className="mt-1 flex gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{formatNumber(channel.messagesCount)} сообщ.</span>
          {channel.pinnedCount > 0 ? (
            <span>{formatNumber(channel.pinnedCount)} закреп.</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function getChannelInitial(channel: StaffChatChannel) {
  if (channel.scope === "STORE") {
    return "К";
  }

  if (channel.scope === "ROLE") {
    return "Р";
  }

  if (channel.scope === "CUSTOM") {
    return "Г";
  }

  return "LP";
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
  allowTaskDraft = true,
  forceRead = false,
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
  allowTaskDraft?: boolean;
  forceRead?: boolean;
}) {
  const isTaskDraftOpen = taskDraft?.messageId === message.id && !compact;
  const isTaskPending = taskPendingMessageId === message.id;
  const authorName =
    message.authorUser?.fullName ?? message.authorUser?.email ?? "LeetPlus";
  const authorInitial = authorName.trim().slice(0, 1).toUpperCase() || "L";
  const messageContent = parseMessageAction(message.body);

  return (
    <article
      className={[
        "border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/20",
        message.priority === "URGENT"
          ? "border-red-200/70 dark:border-red-500/25"
          : message.priority === "HIGH"
            ? "border-amber-200/70 dark:border-amber-500/25"
            : "border-zinc-200/70 dark:border-zinc-900",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100/80 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {authorInitial}
          </div>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {message.authorUser?.fullName ??
                message.authorUser?.email ??
                "LeetPlus"}
            </p>
            <Badge>{kindLabels[message.kind]}</Badge>
            {message.priority !== "NORMAL" ? (
              <Badge tone={message.priority === "URGENT" ? "red" : "amber"}>
                {priorityLabels[message.priority]}
              </Badge>
            ) : null}
            {message.isPinned ? <Badge tone="emerald">Закреплено</Badge> : null}
            {!forceRead && !message.isReadByMe ? (
              <Badge tone="emerald">Новое</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTime(message.createdAt)}
            {message.store ? ` · ${message.store.name}` : ""}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!compact && allowTaskDraft ? (
            <button
              type="button"
              onClick={() => onOpenTaskDraft(message)}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:bg-sky-50 hover:text-sky-700 focus-visible:bg-sky-50 focus-visible:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/25 dark:text-zinc-400 dark:hover:bg-sky-500/10 dark:hover:text-sky-200 dark:focus-visible:bg-sky-500/10 dark:focus-visible:text-sky-100"
            >
              Создать задачу
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onTogglePinned(message)}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:bg-amber-50 hover:text-amber-700 focus-visible:bg-amber-50 focus-visible:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/25 dark:text-zinc-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-200 dark:focus-visible:bg-amber-500/10 dark:focus-visible:text-amber-100"
          >
            {message.isPinned ? "Открепить" : "Закрепить"}
          </button>
        </div>
      </div>
      <p
        className={[
          "whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100",
          compact ? "mt-2 line-clamp-3" : "mt-3 sm:ml-12",
        ].join(" ")}
      >
        {messageContent.body}
      </p>

      {messageContent.action ? (
        <div className={compact ? "mt-2" : "mt-3 sm:ml-12"}>
          <MessageActionLink action={messageContent.action} />
        </div>
      ) : null}

      {message.attachments.length > 0 ? (
        <div
          className={[
            "flex flex-wrap gap-2",
            compact ? "mt-2" : "mt-3 sm:ml-12",
          ].join(" ")}
        >
          {message.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={getAttachmentHref(attachment)}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-emerald-500/50 dark:hover:text-emerald-200"
              target="_blank"
              rel="noreferrer"
            >
              <span className="max-w-[260px] truncate">
                {attachment.fileName}
              </span>
              <span className="text-zinc-400">
                {formatBytes(attachment.byteSize)}
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {isTaskDraftOpen && taskDraft ? (
        <div className="mt-3 rounded-lg border border-emerald-200/70 p-3 dark:border-emerald-500/25">
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
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
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

function MessageActionLink({
  action,
}: {
  action: { label: string; href: string };
}) {
  const className =
    "inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15";

  if (action.href.startsWith("/")) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }

  return (
    <a href={action.href} className={className} target="_blank" rel="noreferrer">
      {action.label}
    </a>
  );
}

function parseMessageAction(body: string) {
  const lines = body.split("\n");
  const actionLineIndex = findLastTextLineIndex(lines);

  if (actionLineIndex === -1) {
    return { body, action: null };
  }

  const match = lines[actionLineIndex]
    ?.trim()
    .match(/^(Открыть [^:]{1,80}):\s*((?:\/|https?:\/\/)\S+)$/i);

  if (!match) {
    return { body, action: null };
  }

  const href = normalizeMessageActionHref(match[2]);

  if (!href) {
    return { body, action: null };
  }

  const visibleLines = lines.slice();
  visibleLines.splice(actionLineIndex, 1);

  while (visibleLines.length > 0 && !visibleLines[visibleLines.length - 1]?.trim()) {
    visibleLines.pop();
  }

  return {
    body: visibleLines.join("\n"),
    action: {
      label: match[1],
      href,
    },
  };
}

function findLastTextLineIndex(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim()) {
      return index;
    }
  }

  return -1;
}

function normalizeMessageActionHref(rawHref: string) {
  if (rawHref.startsWith("/")) {
    return rawHref;
  }

  try {
    const url = new URL(rawHref);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (
      url.hostname === "leetplus.ru" ||
      url.hostname === "www.leetplus.ru" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }

    return url.toString();
  } catch {
    return null;
  }
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

  if (channel.scope === "CUSTOM") {
    return `${formatNumber(channel.members.length)} участн.`;
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

  if (message.attachments.length > 0) {
    lines.push(
      "",
      "Вложения:",
      ...message.attachments.map(
        (attachment) =>
          `- ${attachment.fileName}: ${getAttachmentHref(attachment)}`,
      ),
    );
  }

  return lines.join("\n");
}

function getAttachmentHref(attachment: StaffChatAttachment) {
  if (attachment.url.startsWith("http") || attachment.url.startsWith("/api/")) {
    return attachment.url;
  }

  return `/api${attachment.url}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
