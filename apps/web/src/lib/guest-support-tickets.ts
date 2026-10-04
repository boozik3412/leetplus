// Guest-facing view of support tickets. Shared by the BFF (which projects the
// API response through these functions) and the client dialog.

export const GUEST_SUPPORT_TICKET_NUMBER = /^LP-BUG-[0-9A-F]{8}$/;
export const GUEST_SUPPORT_MESSAGE_MAX_LENGTH = 1000;
export const GUEST_SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH = 500;
// Fired after a new bug report so the "Мои обращения" badge refreshes.
export const GUEST_SUPPORT_TICKETS_CHANGED_EVENT =
  "leetplus:guest-support-tickets-changed";

export type GuestSupportTicketStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

export type GuestSupportTicketListItem = {
  ticketNumber: string;
  topicLabel: string;
  // A guest's game profile spans the network; the club tells tickets apart.
  storeName: string;
  status: GuestSupportTicketStatus;
  statusLabel: string;
  createdAt: string;
  lastActivityAt: string;
  lastReplyAt: string | null;
  unread: boolean;
};

export type GuestSupportTicketList = {
  tickets: GuestSupportTicketListItem[];
  unreadCount: number;
};

export type GuestSupportFeedbackValue = "HELPED" | "NOT_HELPED";

export type GuestSupportTicketMessage = {
  id: string;
  author: "GUEST" | "SUPPORT";
  authorLabel: string;
  body: string;
  createdAt: string;
};

export type GuestSupportTicketThread = {
  ticket: GuestSupportTicketListItem & {
    canReply: boolean;
    replyReopens: boolean;
    canGiveFeedback: boolean;
    feedback: { value: GuestSupportFeedbackValue; at: string } | null;
  };
  messages: GuestSupportTicketMessage[];
};

const STATUSES = new Set<string>(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export function projectGuestSupportTicketList(
  value: unknown,
): GuestSupportTicketList | null {
  const data = record(value);
  if (!data || !Array.isArray(data.tickets)) return null;
  const tickets: GuestSupportTicketListItem[] = [];
  for (const item of data.tickets) {
    const ticket = projectListItem(item);
    if (!ticket) return null;
    tickets.push(ticket);
  }
  return {
    tickets,
    unreadCount: tickets.filter((ticket) => ticket.unread).length,
  };
}

export function projectGuestSupportTicketThread(
  value: unknown,
): GuestSupportTicketThread | null {
  const data = record(value);
  const ticketData = record(data?.ticket);
  const base = projectListItem(ticketData);
  if (!data || !ticketData || !base || !Array.isArray(data.messages)) {
    return null;
  }
  const feedbackData = record(ticketData.feedback);
  const feedbackValue = feedbackData?.value;
  const feedback: GuestSupportTicketThread["ticket"]["feedback"] =
    (feedbackValue === "HELPED" || feedbackValue === "NOT_HELPED") &&
    typeof feedbackData?.at === "string"
      ? { value: feedbackValue, at: feedbackData.at }
      : null;
  if (
    typeof ticketData.canReply !== "boolean" ||
    typeof ticketData.replyReopens !== "boolean" ||
    typeof ticketData.canGiveFeedback !== "boolean"
  ) {
    return null;
  }
  const messages: GuestSupportTicketMessage[] = [];
  for (const item of data.messages) {
    const message = record(item);
    if (
      !message ||
      typeof message.id !== "string" ||
      (message.author !== "GUEST" && message.author !== "SUPPORT") ||
      typeof message.authorLabel !== "string" ||
      typeof message.body !== "string" ||
      typeof message.createdAt !== "string"
    ) {
      return null;
    }
    messages.push({
      id: message.id,
      author: message.author,
      authorLabel: message.authorLabel,
      body: message.body,
      createdAt: message.createdAt,
    });
  }
  return {
    ticket: {
      ...base,
      canReply: ticketData.canReply,
      replyReopens: ticketData.replyReopens,
      canGiveFeedback: ticketData.canGiveFeedback,
      feedback,
    },
    messages,
  };
}

function projectListItem(value: unknown): GuestSupportTicketListItem | null {
  const item = record(value);
  if (
    !item ||
    typeof item.ticketNumber !== "string" ||
    !GUEST_SUPPORT_TICKET_NUMBER.test(item.ticketNumber) ||
    typeof item.topicLabel !== "string" ||
    typeof item.storeName !== "string" ||
    typeof item.status !== "string" ||
    !STATUSES.has(item.status) ||
    typeof item.statusLabel !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.lastActivityAt !== "string" ||
    (item.lastReplyAt !== null && typeof item.lastReplyAt !== "string") ||
    typeof item.unread !== "boolean"
  ) {
    return null;
  }
  return {
    ticketNumber: item.ticketNumber,
    topicLabel: item.topicLabel,
    storeName: item.storeName,
    status: item.status as GuestSupportTicketStatus,
    statusLabel: item.statusLabel,
    createdAt: item.createdAt,
    lastActivityAt: item.lastActivityAt,
    lastReplyAt: item.lastReplyAt,
    unread: item.unread,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
