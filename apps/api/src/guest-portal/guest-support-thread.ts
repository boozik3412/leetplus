import type { GuestSupportTicketStatus, Prisma } from '@prisma/client';

// Guest-visible support conversation, kept in the existing support tables:
// every comment is internal unless an audit event explicitly publishes it to
// the guest (PUBLIC_REPLY_SENT) or records it as the guest's own message
// (GUEST_MESSAGE_ADDED). Read markers and "did it help" answers are audit
// events too, so the feature needs no schema change.
export const SUPPORT_THREAD_ACTIONS = Object.freeze({
  PUBLIC_REPLY: 'PUBLIC_REPLY_SENT',
  GUEST_MESSAGE: 'GUEST_MESSAGE_ADDED',
  GUEST_READ: 'GUEST_READ',
  GUEST_FEEDBACK: 'GUEST_FEEDBACK',
  REOPENED_BY_GUEST: 'REOPENED_BY_GUEST',
  AUTO_CLOSED: 'AUTO_CLOSED',
});

export const SUPPORT_THREAD_ACTION_LIST = Object.values(SUPPORT_THREAD_ACTIONS);

export const SUPPORT_PUBLIC_AUTHOR_LABEL = 'Поддержка LeetPlus';
export const SUPPORT_AUTO_CLOSE_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPPORT_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPPORT_GUEST_MESSAGE_MAX_LENGTH = 1000;
export const SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH = 500;

export type SupportGuestFeedbackValue = 'HELPED' | 'NOT_HELPED';

export const SUPPORT_GUEST_STATUS_LABELS: Record<
  GuestSupportTicketStatus,
  string
> = {
  NEW: 'Получено',
  IN_PROGRESS: 'Разбираемся',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
};

export type SupportThreadEvent = {
  action: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

export type SupportThreadSummary = {
  publicCommentIds: Set<string>;
  guestCommentIds: Set<string>;
  lastPublicReplyAt: Date | null;
  lastGuestReadAt: Date | null;
  lastGuestActivityAt: Date | null;
  feedback: {
    value: SupportGuestFeedbackValue;
    comment: string | null;
    at: Date;
  } | null;
  // The guest spoke last (message or "did not help") and nobody answered.
  awaitingStaff: boolean;
  unread: boolean;
};

export function summarizeSupportThread(
  events: readonly SupportThreadEvent[],
): SupportThreadSummary {
  const ordered = [...events].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const summary: SupportThreadSummary = {
    publicCommentIds: new Set(),
    guestCommentIds: new Set(),
    lastPublicReplyAt: null,
    lastGuestReadAt: null,
    lastGuestActivityAt: null,
    feedback: null,
    awaitingStaff: false,
    unread: false,
  };

  for (const event of ordered) {
    const metadata = record(event.metadata);
    const commentId = text(metadata.commentId);
    switch (event.action) {
      case SUPPORT_THREAD_ACTIONS.PUBLIC_REPLY:
        if (commentId) summary.publicCommentIds.add(commentId);
        summary.lastPublicReplyAt = event.createdAt;
        summary.awaitingStaff = false;
        break;
      case SUPPORT_THREAD_ACTIONS.GUEST_MESSAGE:
        if (commentId) summary.guestCommentIds.add(commentId);
        summary.lastGuestActivityAt = event.createdAt;
        summary.awaitingStaff = true;
        break;
      case SUPPORT_THREAD_ACTIONS.GUEST_READ:
        summary.lastGuestReadAt = event.createdAt;
        break;
      case SUPPORT_THREAD_ACTIONS.GUEST_FEEDBACK: {
        const value = metadata.value;
        if (value === 'HELPED' || value === 'NOT_HELPED') {
          summary.feedback = {
            value,
            comment: text(metadata.comment),
            at: event.createdAt,
          };
          summary.lastGuestActivityAt = event.createdAt;
          summary.awaitingStaff = value === 'NOT_HELPED';
        }
        break;
      }
      default:
        break;
    }
  }

  summary.unread = Boolean(
    summary.lastPublicReplyAt &&
    (!summary.lastGuestReadAt ||
      summary.lastPublicReplyAt.getTime() > summary.lastGuestReadAt.getTime()),
  );
  return summary;
}

export type SupportTicketLifecycleInput = {
  status: GuestSupportTicketStatus;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

export type SupportGuestTicketState = {
  status: GuestSupportTicketStatus;
  statusLabel: string;
  canReply: boolean;
  replyReopens: boolean;
  canGiveFeedback: boolean;
};

// A resolved ticket the guest never reacted to closes itself after 7 days;
// the logical close moment is resolvedAt + 7 days even if the sweep runs
// later, so the guest's reopen window is the same for every reader.
export function supportTicketAutoCloseAt(ticket: SupportTicketLifecycleInput) {
  return ticket.status === 'RESOLVED' && ticket.resolvedAt
    ? new Date(ticket.resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS)
    : null;
}

export function effectiveSupportTicket(
  ticket: SupportTicketLifecycleInput,
  now: Date,
): SupportTicketLifecycleInput {
  const autoCloseAt = supportTicketAutoCloseAt(ticket);
  return autoCloseAt && autoCloseAt.getTime() <= now.getTime()
    ? { status: 'CLOSED', resolvedAt: ticket.resolvedAt, closedAt: autoCloseAt }
    : ticket;
}

export function supportGuestTicketState(
  ticket: SupportTicketLifecycleInput,
  thread: Pick<SupportThreadSummary, 'feedback' | 'lastPublicReplyAt'>,
  now: Date,
): SupportGuestTicketState {
  const effective = effectiveSupportTicket(ticket, now);
  const withinReopenWindow =
    effective.status !== 'CLOSED' ||
    Boolean(
      effective.closedAt &&
      now.getTime() - effective.closedAt.getTime() <= SUPPORT_REOPEN_WINDOW_MS,
    );
  const finished =
    effective.status === 'RESOLVED' || effective.status === 'CLOSED';
  const finishedAt =
    effective.status === 'RESOLVED' ? effective.resolvedAt : effective.closedAt;
  // One answer per resolution: a new resolution after a reopen asks again.
  const answeredThisResolution = Boolean(
    thread.feedback &&
    finishedAt &&
    thread.feedback.at.getTime() >= finishedAt.getTime() - 1000,
  );

  return {
    status: effective.status,
    statusLabel: SUPPORT_GUEST_STATUS_LABELS[effective.status],
    canReply: withinReopenWindow,
    replyReopens: finished && withinReopenWindow,
    canGiveFeedback:
      finished &&
      withinReopenWindow &&
      Boolean(thread.lastPublicReplyAt) &&
      !answeredThisResolution,
  };
}

export type SupportAutoCloseClient = {
  guestSupportTicket: Pick<
    Prisma.TransactionClient['guestSupportTicket'],
    'findMany' | 'updateMany'
  >;
  guestSupportTicketAuditEvent: Pick<
    Prisma.TransactionClient['guestSupportTicketAuditEvent'],
    'create'
  >;
};

// Persists auto-close for resolved tickets that waited 7 days. Each row is a
// compare-and-set on its exact resolvedAt, so a concurrent reopen or staff
// change wins and nothing is closed twice.
export async function closeStaleResolvedSupportTickets(
  db: SupportAutoCloseClient,
  scope: { tenantId?: string; profileId?: string },
  now: Date,
) {
  const due = await db.guestSupportTicket.findMany({
    where: {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.profileId ? { profileId: scope.profileId } : {}),
      status: 'RESOLVED',
      resolvedAt: { lte: new Date(now.getTime() - SUPPORT_AUTO_CLOSE_MS) },
    },
    select: { id: true, tenantId: true, resolvedAt: true },
    take: 100,
  });
  let closed = 0;
  for (const ticket of due) {
    if (!ticket.resolvedAt) continue;
    const closedAt = new Date(
      ticket.resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS,
    );
    const changed = await db.guestSupportTicket.updateMany({
      where: {
        id: ticket.id,
        tenantId: ticket.tenantId,
        status: 'RESOLVED',
        resolvedAt: ticket.resolvedAt,
      },
      data: { status: 'CLOSED', closedAt, lastActivityAt: now },
    });
    if (changed.count !== 1) continue;
    closed += 1;
    await db.guestSupportTicketAuditEvent.create({
      data: {
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        actorUserId: null,
        action: SUPPORT_THREAD_ACTIONS.AUTO_CLOSED,
        metadata: {
          previousStatus: 'RESOLVED',
          status: 'CLOSED',
          resolvedAt: ticket.resolvedAt.toISOString(),
          closedAt: closedAt.toISOString(),
        },
      },
    });
  }
  return closed;
}

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
