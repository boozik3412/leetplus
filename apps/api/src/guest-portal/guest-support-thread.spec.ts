import {
  SUPPORT_AUTO_CLOSE_MS,
  SUPPORT_REOPEN_WINDOW_MS,
  closeStaleResolvedSupportTickets,
  effectiveSupportTicket,
  summarizeSupportThread,
  supportGuestTicketState,
} from './guest-support-thread';

const at = (iso: string) => new Date(iso);

describe('guest support thread', () => {
  it('marks a support reply unread until the guest opens it', () => {
    const reply = {
      action: 'PUBLIC_REPLY_SENT',
      metadata: { commentId: 'comment-1' },
      createdAt: at('2026-10-01T10:00:00.000Z'),
    };
    expect(summarizeSupportThread([reply]).unread).toBe(true);

    const read = summarizeSupportThread([
      reply,
      {
        action: 'GUEST_READ',
        metadata: {},
        createdAt: at('2026-10-01T10:05:00.000Z'),
      },
    ]);
    expect(read.unread).toBe(false);
    expect([...read.publicCommentIds]).toEqual(['comment-1']);

    const answeredAgain = summarizeSupportThread([
      reply,
      {
        action: 'GUEST_READ',
        metadata: {},
        createdAt: at('2026-10-01T10:05:00.000Z'),
      },
      {
        action: 'PUBLIC_REPLY_SENT',
        metadata: { commentId: 'comment-2' },
        createdAt: at('2026-10-01T11:00:00.000Z'),
      },
    ]);
    expect(answeredAgain.unread).toBe(true);
  });

  it('waits for staff after a guest message or "did not help", in event order', () => {
    const guestMessage = {
      action: 'GUEST_MESSAGE_ADDED',
      metadata: { commentId: 'guest-1' },
      createdAt: at('2026-10-01T12:00:00.000Z'),
    };
    const reply = {
      action: 'PUBLIC_REPLY_SENT',
      metadata: { commentId: 'comment-1' },
      createdAt: at('2026-10-01T12:30:00.000Z'),
    };

    // Input order must not matter.
    expect(summarizeSupportThread([reply, guestMessage]).awaitingStaff).toBe(
      false,
    );
    expect(summarizeSupportThread([guestMessage]).awaitingStaff).toBe(true);

    const notHelped = summarizeSupportThread([
      reply,
      {
        action: 'GUEST_FEEDBACK',
        metadata: { value: 'NOT_HELPED', comment: 'Кейс так и не открылся' },
        createdAt: at('2026-10-01T13:00:00.000Z'),
      },
    ]);
    expect(notHelped.awaitingStaff).toBe(true);
    expect(notHelped.feedback).toEqual({
      value: 'NOT_HELPED',
      comment: 'Кейс так и не открылся',
      at: at('2026-10-01T13:00:00.000Z'),
    });

    const helped = summarizeSupportThread([
      reply,
      {
        action: 'GUEST_FEEDBACK',
        metadata: { value: 'HELPED' },
        createdAt: at('2026-10-01T13:00:00.000Z'),
      },
    ]);
    expect(helped.awaitingStaff).toBe(false);
    expect(helped.feedback?.value).toBe('HELPED');
  });

  it('ignores feedback with an unknown value', () => {
    const summary = summarizeSupportThread([
      {
        action: 'GUEST_FEEDBACK',
        metadata: { value: 'MAYBE' },
        createdAt: at('2026-10-01T13:00:00.000Z'),
      },
    ]);
    expect(summary.feedback).toBeNull();
    expect(summary.awaitingStaff).toBe(false);
  });

  it('treats a resolved ticket as closed exactly 7 days after resolution', () => {
    const resolvedAt = at('2026-10-01T10:00:00.000Z');
    const ticket = { status: 'RESOLVED' as const, resolvedAt, closedAt: null };

    expect(
      effectiveSupportTicket(
        ticket,
        new Date(resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS - 1),
      ).status,
    ).toBe('RESOLVED');
    expect(
      effectiveSupportTicket(
        ticket,
        new Date(resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS),
      ),
    ).toEqual({
      status: 'CLOSED',
      resolvedAt,
      closedAt: new Date(resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS),
    });
  });

  it('lets the guest reply and reopen only within 7 days after close', () => {
    const closedAt = at('2026-10-01T10:00:00.000Z');
    const ticket = {
      status: 'CLOSED' as const,
      resolvedAt: at('2026-09-30T10:00:00.000Z'),
      closedAt,
    };
    const thread = {
      feedback: null,
      lastPublicReplyAt: at('2026-09-30T10:00:00.000Z'),
    };

    const inside = supportGuestTicketState(
      ticket,
      thread,
      new Date(closedAt.getTime() + SUPPORT_REOPEN_WINDOW_MS),
    );
    expect(inside).toMatchObject({
      status: 'CLOSED',
      statusLabel: 'Закрыто',
      canReply: true,
      replyReopens: true,
      canGiveFeedback: true,
    });

    const outside = supportGuestTicketState(
      ticket,
      thread,
      new Date(closedAt.getTime() + SUPPORT_REOPEN_WINDOW_MS + 1),
    );
    expect(outside).toMatchObject({
      canReply: false,
      replyReopens: false,
      canGiveFeedback: false,
    });
  });

  it('keeps the reopen window anchored to the logical auto-close moment', () => {
    const resolvedAt = at('2026-10-01T10:00:00.000Z');
    const ticket = { status: 'RESOLVED' as const, resolvedAt, closedAt: null };
    const thread = { feedback: null, lastPublicReplyAt: resolvedAt };
    const deadline =
      resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS + SUPPORT_REOPEN_WINDOW_MS;

    expect(
      supportGuestTicketState(ticket, thread, new Date(deadline)).canReply,
    ).toBe(true);
    expect(
      supportGuestTicketState(ticket, thread, new Date(deadline + 1)).canReply,
    ).toBe(false);
  });

  it('asks for feedback once per resolution and only after a public answer', () => {
    const resolvedAt = at('2026-10-01T10:00:00.000Z');
    const now = at('2026-10-02T10:00:00.000Z');
    const ticket = { status: 'RESOLVED' as const, resolvedAt, closedAt: null };

    expect(
      supportGuestTicketState(
        ticket,
        { feedback: null, lastPublicReplyAt: null },
        now,
      ).canGiveFeedback,
    ).toBe(false);
    expect(
      supportGuestTicketState(
        ticket,
        {
          feedback: {
            value: 'HELPED',
            comment: null,
            at: at('2026-10-01T11:00:00.000Z'),
          },
          lastPublicReplyAt: resolvedAt,
        },
        now,
      ).canGiveFeedback,
    ).toBe(false);
    // An answer from an earlier resolution does not count for this one.
    expect(
      supportGuestTicketState(
        ticket,
        {
          feedback: {
            value: 'NOT_HELPED',
            comment: null,
            at: at('2026-09-28T11:00:00.000Z'),
          },
          lastPublicReplyAt: resolvedAt,
        },
        now,
      ).canGiveFeedback,
    ).toBe(true);
  });

  it('never offers feedback or reopen on an active ticket', () => {
    expect(
      supportGuestTicketState(
        { status: 'IN_PROGRESS', resolvedAt: null, closedAt: null },
        { feedback: null, lastPublicReplyAt: at('2026-10-01T10:00:00.000Z') },
        at('2026-10-02T10:00:00.000Z'),
      ),
    ).toEqual({
      status: 'IN_PROGRESS',
      statusLabel: 'Разбираемся',
      canReply: true,
      replyReopens: false,
      canGiveFeedback: false,
    });
  });

  it('auto-closes each stale ticket with a compare-and-set on its resolution time', async () => {
    const resolvedAt = at('2026-09-20T10:00:00.000Z');
    const now = at('2026-10-03T10:00:00.000Z');
    const db = {
      guestSupportTicket: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ticket-a', tenantId: 'tenant-a', resolvedAt },
          { id: 'ticket-b', tenantId: 'tenant-a', resolvedAt },
        ]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      guestSupportTicketAuditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    await expect(
      closeStaleResolvedSupportTickets(
        db as never,
        { tenantId: 'tenant-a', profileId: 'profile-a' },
        now,
      ),
    ).resolves.toBe(1);

    expect(db.guestSupportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          profileId: 'profile-a',
          status: 'RESOLVED',
          resolvedAt: { lte: new Date(now.getTime() - SUPPORT_AUTO_CLOSE_MS) },
        },
      }),
    );
    const closedAt = new Date(resolvedAt.getTime() + SUPPORT_AUTO_CLOSE_MS);
    expect(db.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-a',
        tenantId: 'tenant-a',
        status: 'RESOLVED',
        resolvedAt,
      },
      data: { status: 'CLOSED', closedAt, lastActivityAt: now },
    });
    // The row a concurrent reopen won keeps no AUTO_CLOSED audit.
    expect(db.guestSupportTicketAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(db.guestSupportTicketAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-a',
        actorUserId: null,
        action: 'AUTO_CLOSED',
      }) as Record<string, unknown>,
    });
  });
});
