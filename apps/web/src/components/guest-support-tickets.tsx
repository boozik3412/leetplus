"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  GUEST_SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH,
  GUEST_SUPPORT_MESSAGE_MAX_LENGTH,
  GUEST_SUPPORT_TICKETS_CHANGED_EVENT,
  type GuestSupportFeedbackValue,
  type GuestSupportTicketList,
  type GuestSupportTicketListItem,
  type GuestSupportTicketThread,
} from "@/lib/guest-support-tickets";
import shell from "./guest-bug-report.module.css";
import styles from "./guest-support-tickets.module.css";

const REFRESH_INTERVAL_MS = 90_000;
const TOAST_DURATION_MS = 9_000;
const SEEN_REPLIES_KEY = "leetplus:guest-support-seen-replies";

// "Мои обращения": the guest's tickets, support replies signed as
// "Поддержка LeetPlus", a reply box and the "did it help" question.
export function GuestSupportTickets() {
  const [list, setList] = useState<GuestSupportTicketList | null>(null);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<GuestSupportTicketThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<GuestSupportTicketListItem | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const response = await fetch("/api/guest-support/tickets", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const next = (await response.json()) as GuestSupportTicketList;
      setList(next);
      const fresh = next.tickets.find(
        (ticket) => ticket.unread && !replySeen(ticket),
      );
      if (fresh) {
        markReplySeen(fresh);
        setToast(fresh);
      }
    } catch {
      // The badge is a convenience; the game keeps working without it.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshList(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshList();
      }
    }, REFRESH_INTERVAL_MS);
    const onChanged = () => void refreshList();
    window.addEventListener(GUEST_SUPPORT_TICKETS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onChanged);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener(
        GUEST_SUPPORT_TICKETS_CHANGED_EVENT,
        onChanged,
      );
      document.removeEventListener("visibilitychange", onChanged);
    };
  }, [refreshList]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setThread(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDialog();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, open]);

  async function openTicket(ticketNumber: string) {
    setOpen(true);
    setToast(null);
    setError(null);
    setLoadingThread(true);
    try {
      const response = await fetch(
        `/api/guest-support/tickets/${encodeURIComponent(ticketNumber)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | (GuestSupportTicketThread & { message?: string })
        | null;
      if (!response.ok || !payload?.ticket) {
        throw new Error(payload?.message || "Не удалось открыть обращение.");
      }
      setThread(payload);
      if (payload.ticket.unread) {
        void fetch(
          `/api/guest-support/tickets/${encodeURIComponent(ticketNumber)}/read`,
          { method: "POST" },
        ).then(() => refreshList());
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось открыть обращение.",
      );
    } finally {
      setLoadingThread(false);
    }
  }

  function openList() {
    setOpen(true);
    setThread(null);
    setError(null);
    void refreshList();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeDialog();
  }

  function handleThreadChanged(next: GuestSupportTicketThread) {
    setThread(next);
    void refreshList();
  }

  if (!list || list.tickets.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`${shell.trigger} ${styles.trigger}`}
        aria-label={
          list.unreadCount
            ? `Мои обращения, новых ответов: ${list.unreadCount}`
            : "Мои обращения"
        }
        title="Мои обращения"
        onClick={openList}
      >
        <ChatIcon />
        {list.unreadCount ? (
          <span className={styles.badge} aria-hidden="true">
            {list.unreadCount > 9 ? "9+" : list.unreadCount}
          </span>
        ) : null}
      </button>

      {toast && !open
        ? createPortal(
            <div className={styles.toast} role="status">
              <span>
                Поддержка LeetPlus ответила на обращение{" "}
                <strong>{toast.ticketNumber}</strong>
              </span>
              <button
                type="button"
                onClick={() => void openTicket(toast.ticketNumber)}
              >
                Открыть
              </button>
              <button
                type="button"
                className={styles.toastClose}
                aria-label="Скрыть уведомление"
                onClick={() => setToast(null)}
              >
                ×
              </button>
            </div>,
            document.body,
          )
        : null}

      {open
        ? createPortal(
            <div className={shell.backdrop} onMouseDown={handleBackdropClick}>
              <section
                className={`${shell.dialog} ${styles.dialog}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="guestSupportTicketsTitle"
              >
                <button
                  type="button"
                  className={shell.close}
                  aria-label="Закрыть"
                  onClick={closeDialog}
                >
                  ×
                </button>
                {thread ? (
                  <TicketThread
                    thread={thread}
                    onBack={() => {
                      setThread(null);
                      setError(null);
                    }}
                    onChanged={handleThreadChanged}
                  />
                ) : (
                  <div className={styles.body}>
                    <p className={shell.eyebrow}>Поддержка LeetPlus</p>
                    <h2 id="guestSupportTicketsTitle">Мои обращения</h2>
                    {error ? (
                      <p className={shell.error} role="alert">
                        {error}
                      </p>
                    ) : null}
                    <ul className={styles.list}>
                      {list.tickets.map((ticket) => (
                        <li key={ticket.ticketNumber}>
                          <button
                            type="button"
                            disabled={loadingThread}
                            onClick={() => void openTicket(ticket.ticketNumber)}
                          >
                            <span className={styles.listHead}>
                              <strong>{ticket.ticketNumber}</strong>
                              <StatusChip
                                status={ticket.status}
                                label={ticket.statusLabel}
                              />
                            </span>
                            <span className={styles.listTopic}>
                              {ticket.topicLabel}
                            </span>
                            <span className={styles.listMeta}>
                              {ticket.unread ? (
                                <em>Новый ответ</em>
                              ) : ticket.lastReplyAt ? (
                                <>Ответ {formatDate(ticket.lastReplyAt)}</>
                              ) : (
                                <>Отправлено {formatDate(ticket.createdAt)}</>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TicketThread({
  thread,
  onBack,
  onChanged,
}: {
  thread: GuestSupportTicketThread;
  onBack: () => void;
  onChanged: (next: GuestSupportTicketThread) => void;
}) {
  const { ticket } = thread;
  const [reply, setReply] = useState("");
  const [feedbackChoice, setFeedbackChoice] =
    useState<GuestSupportFeedbackValue | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replyKeyRef = useRef(createIdempotencyKey("reply"));
  const feedbackKeyRef = useRef(createIdempotencyKey("feedback"));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread.messages.length]);

  async function send(
    action: "messages" | "feedback",
    key: string,
    body: Record<string, string>,
  ) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/guest-support/tickets/${encodeURIComponent(ticket.ticketNumber)}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | (GuestSupportTicketThread & { message?: string })
        | null;
      if (!response.ok || !payload?.ticket) {
        throw new Error(payload?.message || "Не удалось отправить.");
      }
      onChanged(payload);
      return true;
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Не удалось отправить.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = reply.trim();
    if (body.length < 2) {
      setError("Напишите сообщение.");
      return;
    }
    if (await send("messages", replyKeyRef.current, { body })) {
      setReply("");
      replyKeyRef.current = createIdempotencyKey("reply");
    }
  }

  async function handleFeedback(value: GuestSupportFeedbackValue) {
    const comment = value === "NOT_HELPED" ? feedbackComment.trim() : "";
    if (
      await send("feedback", feedbackKeyRef.current, {
        value,
        ...(comment ? { comment } : {}),
      })
    ) {
      setFeedbackChoice(null);
      setFeedbackComment("");
      feedbackKeyRef.current = createIdempotencyKey("feedback");
    }
  }

  return (
    <div className={styles.body}>
      <button type="button" className={styles.back} onClick={onBack}>
        ← Все обращения
      </button>
      <p className={shell.eyebrow}>{ticket.topicLabel}</p>
      <h2 id="guestSupportTicketsTitle" className={styles.threadTitle}>
        {ticket.ticketNumber}
        <StatusChip status={ticket.status} label={ticket.statusLabel} />
      </h2>

      <div className={styles.messages}>
        {thread.messages.map((message) => (
          <article
            key={message.id}
            className={
              message.author === "SUPPORT" ? styles.support : styles.guest
            }
          >
            <header>
              <strong>{message.authorLabel}</strong>
              <time dateTime={message.createdAt}>
                {formatDate(message.createdAt)}
              </time>
            </header>
            <p>{message.body}</p>
          </article>
        ))}
        {!thread.messages.some((message) => message.author === "SUPPORT") ? (
          <p className={styles.waiting}>
            Мы получили обращение. Ответ появится здесь — мы покажем уведомление
            в игровом модуле.
          </p>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {ticket.canGiveFeedback ? (
        <div className={styles.feedback}>
          <p>Помог ли ответ?</p>
          {feedbackChoice === "NOT_HELPED" ? (
            <>
              <textarea
                value={feedbackComment}
                maxLength={GUEST_SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH}
                placeholder="Что осталось не так? Необязательно"
                onChange={(event) => setFeedbackComment(event.target.value)}
              />
              <div className={styles.feedbackActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={submitting}
                  onClick={() => setFeedbackChoice(null)}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className={shell.submit}
                  disabled={submitting}
                  onClick={() => void handleFeedback("NOT_HELPED")}
                >
                  {submitting ? "Отправляем…" : "Вернуть в работу"}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.feedbackActions}>
              <button
                type="button"
                className={shell.submit}
                disabled={submitting}
                onClick={() => void handleFeedback("HELPED")}
              >
                Да, решено
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={submitting}
                onClick={() => setFeedbackChoice("NOT_HELPED")}
              >
                Нет, не помогло
              </button>
            </div>
          )}
        </div>
      ) : ticket.feedback ? (
        <p className={styles.feedbackDone}>
          {ticket.feedback.value === "HELPED"
            ? "Вы отметили, что ответ помог. Спасибо!"
            : "Вы отметили, что ответ не помог — мы вернулись к обращению."}
        </p>
      ) : null}

      {ticket.canReply ? (
        <form className={styles.reply} onSubmit={handleReply}>
          <textarea
            value={reply}
            maxLength={GUEST_SUPPORT_MESSAGE_MAX_LENGTH}
            placeholder="Написать в поддержку"
            onChange={(event) => setReply(event.target.value)}
          />
          {ticket.replyReopens ? (
            <small>Обращение снова откроется, и мы его проверим.</small>
          ) : null}
          <button type="submit" className={shell.submit} disabled={submitting}>
            {submitting ? "Отправляем…" : "Отправить"}
          </button>
        </form>
      ) : (
        <p className={styles.closedNote}>
          Обращение закрыто больше 7 дней назад. Если проблема повторилась,
          сообщите о ней заново.
        </p>
      )}

      {error ? (
        <p className={shell.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className={styles.status} data-status={status}>
      {label}
    </span>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5H4.5z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function createIdempotencyKey(kind: string) {
  if (typeof crypto.randomUUID === "function") {
    return `${kind}:${crypto.randomUUID()}`;
  }
  return `${kind}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

// Remembers which replies already produced a toast in this browser session.
const seenInMemory = new Set<string>();

function replySeen(ticket: GuestSupportTicketListItem) {
  if (seenInMemory.has(`${ticket.ticketNumber}:${ticket.lastReplyAt}`)) {
    return true;
  }
  try {
    const seen = JSON.parse(
      window.sessionStorage.getItem(SEEN_REPLIES_KEY) ?? "[]",
    ) as unknown;
    return (
      Array.isArray(seen) &&
      seen.includes(`${ticket.ticketNumber}:${ticket.lastReplyAt}`)
    );
  } catch {
    return false;
  }
}

function markReplySeen(ticket: GuestSupportTicketListItem) {
  seenInMemory.add(`${ticket.ticketNumber}:${ticket.lastReplyAt}`);
  try {
    const seen = JSON.parse(
      window.sessionStorage.getItem(SEEN_REPLIES_KEY) ?? "[]",
    ) as unknown;
    const next = Array.isArray(seen) ? seen.slice(-49) : [];
    next.push(`${ticket.ticketNumber}:${ticket.lastReplyAt}`);
    window.sessionStorage.setItem(SEEN_REPLIES_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; the in-memory set still covers this page.
  }
}
