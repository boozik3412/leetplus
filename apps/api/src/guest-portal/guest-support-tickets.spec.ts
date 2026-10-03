import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GuestSupportService } from './guest-support.service';

const context = { tenantId: 'tenant-a', profileId: 'profile-a' };
const ticketNumber = 'LP-BUG-A1B2C3D4';
const key = 'reply:request-1234';

type Row = Record<string, unknown>;

function ticketRow(overrides: Row = {}) {
  return {
    id: 'ticket-a',
    tenantId: 'tenant-a',
    ticketNumber,
    topic: 'GAME_MODULE',
    description: 'Кейс не открывается после нажатия.',
    status: 'IN_PROGRESS',
    resolvedAt: null,
    closedAt: null,
    lastActivityAt: new Date('2026-10-01T10:00:00.000Z'),
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

function reply(commentId: string, iso: string) {
  return {
    ticketId: 'ticket-a',
    action: 'PUBLIC_REPLY_SENT',
    metadata: { commentId },
    createdAt: new Date(iso),
  };
}

function fixture({
  mode = 'LIVE',
  ticket = ticketRow(),
  events = [],
}: { mode?: string; ticket?: Row | null; events?: Row[] } = {}) {
  const db = {
    guestSupportTicket: {
      findFirst: jest.fn().mockResolvedValue(ticket),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestSupportTicketComment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    guestSupportTicketAuditEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(events),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((callback: (client: typeof db) => unknown) =>
      callback(db),
    ),
  };
  const config = {
    get: jest.fn((name: string) =>
      name === 'GUEST_BUG_REPORTING_MODE' ? mode : undefined,
    ),
  };
  const service = new GuestSupportService(
    prisma as never,
    config as unknown as ConfigService,
  );
  return { service, prisma, db };
}

function auditActions(db: ReturnType<typeof fixture>['db']) {
  return (
    db.guestSupportTicketAuditEvent.create.mock.calls as unknown as Array<
      [{ data: { action: string; metadata: Row } }]
    >
  ).map(([args]) => args.data);
}

describe('GuestSupportService guest ticket thread', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-03T10:00:00.000Z') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('fails closed while bug reporting is not LIVE', async () => {
    const { service, prisma } = fixture({ mode: 'OFF' });

    await expect(service.listTickets(context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.guestSupportTicket.findMany).not.toHaveBeenCalled();
  });

  it('lists only the tickets of the verified game profile with unread replies', async () => {
    const { service, prisma } = fixture({
      events: [reply('comment-1', '2026-10-02T10:00:00.000Z')],
    });
    prisma.guestSupportTicket.findMany
      .mockResolvedValueOnce([]) // auto-close sweep
      .mockResolvedValueOnce([ticketRow()]);

    const list = await service.listTickets(context);

    expect(prisma.guestSupportTicket.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', profileId: 'profile-a' },
      }),
    );
    expect(list).toEqual({
      unreadCount: 1,
      tickets: [
        {
          ticketNumber,
          topic: 'GAME_MODULE',
          topicLabel: expect.any(String) as string,
          status: 'IN_PROGRESS',
          statusLabel: 'Разбираемся',
          createdAt: '2026-10-01T09:00:00.000Z',
          lastActivityAt: '2026-10-01T10:00:00.000Z',
          lastReplyAt: '2026-10-02T10:00:00.000Z',
          unread: true,
        },
      ],
    });
  });

  it('shows the guest only published replies and own messages, never internal notes', async () => {
    const { service, prisma } = fixture({
      events: [
        reply('comment-public', '2026-10-02T10:00:00.000Z'),
        {
          ticketId: 'ticket-a',
          action: 'GUEST_MESSAGE_ADDED',
          metadata: { commentId: 'comment-guest' },
          createdAt: new Date('2026-10-02T11:00:00.000Z'),
        },
      ],
    });
    prisma.guestSupportTicketComment.findMany.mockResolvedValue([
      {
        id: 'comment-guest',
        body: 'Спасибо, проверю вечером',
        createdAt: new Date('2026-10-02T11:00:00.000Z'),
      },
      {
        id: 'comment-public',
        body: 'Начислили кейс повторно',
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      },
    ]);

    const thread = await service.getTicket(context, ticketNumber);

    expect(prisma.guestSupportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', profileId: 'profile-a', ticketNumber },
      }),
    );
    expect(prisma.guestSupportTicketComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          ticketId: 'ticket-a',
          id: { in: ['comment-public', 'comment-guest'] },
        },
      }),
    );
    expect(
      thread.messages.map(({ id, author, authorLabel }) => ({
        id,
        author,
        authorLabel,
      })),
    ).toEqual([
      { id: 'description', author: 'GUEST', authorLabel: 'Вы' },
      {
        id: 'comment-public',
        author: 'SUPPORT',
        authorLabel: 'Поддержка LeetPlus',
      },
      { id: 'comment-guest', author: 'GUEST', authorLabel: 'Вы' },
    ]);
    // Staff identity is never part of the guest payload.
    expect(JSON.stringify(thread)).not.toMatch(/authorUser|email|fullName/);
  });

  it('does not query comments when nothing was published to the guest', async () => {
    const { service, prisma } = fixture();

    const thread = await service.getTicket(context, ticketNumber);

    expect(prisma.guestSupportTicketComment.findMany).not.toHaveBeenCalled();
    expect(thread.messages).toHaveLength(1);
  });

  it('rejects a malformed ticket number without touching the database', async () => {
    const { service, prisma } = fixture();

    await expect(
      service.getTicket(context, "LP-BUG-1' OR 1=1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.guestSupportTicket.findFirst).not.toHaveBeenCalled();
  });

  it('records a read marker only when there is an unread reply', async () => {
    const unread = fixture({
      events: [reply('comment-1', '2026-10-02T10:00:00.000Z')],
    });
    await unread.service.markTicketRead(context, ticketNumber);
    expect(auditActions(unread.db).map((event) => event.action)).toEqual([
      'GUEST_READ',
    ]);

    const read = fixture({
      events: [
        reply('comment-1', '2026-10-02T10:00:00.000Z'),
        {
          ticketId: 'ticket-a',
          action: 'GUEST_READ',
          metadata: {},
          createdAt: new Date('2026-10-02T12:00:00.000Z'),
        },
      ],
    });
    await read.service.markTicketRead(context, ticketNumber);
    expect(read.db.guestSupportTicketAuditEvent.create).not.toHaveBeenCalled();
  });

  it('adds a guest message to an active ticket without changing its status', async () => {
    const { service, db } = fixture();

    await service.addGuestMessage(
      context,
      ticketNumber,
      { body: '  Проблема повторилась сегодня  ' },
      key,
    );

    const comment = (
      db.guestSupportTicketComment.create.mock.calls as unknown as Array<
        [{ data: Row }]
      >
    )[0]?.[0].data;
    expect(comment).toMatchObject({
      tenantId: 'tenant-a',
      ticketId: 'ticket-a',
      authorUserId: null,
      body: 'Проблема повторилась сегодня',
    });
    expect(auditActions(db)).toEqual([
      expect.objectContaining({
        action: 'GUEST_MESSAGE_ADDED',
        metadata: { commentId: comment?.id, profileId: 'profile-a' },
      }),
    ]);
    expect(db.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-a',
        tenantId: 'tenant-a',
        status: 'IN_PROGRESS',
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      data: { lastActivityAt: expect.any(Date) as Date },
    });
  });

  it('replays the same message idempotently', async () => {
    const { service, db } = fixture();
    db.guestSupportTicketComment.findUnique.mockResolvedValue({ id: 'x' });

    await service.addGuestMessage(
      context,
      ticketNumber,
      { body: 'Проблема повторилась' },
      key,
    );

    expect(db.guestSupportTicketComment.create).not.toHaveBeenCalled();
    expect(db.guestSupportTicket.updateMany).not.toHaveBeenCalled();
  });

  it('reopens a ticket closed less than 7 days ago when the guest replies', async () => {
    const { service, db } = fixture({
      ticket: ticketRow({
        status: 'CLOSED',
        resolvedAt: new Date('2026-09-30T10:00:00.000Z'),
        closedAt: new Date('2026-10-01T10:00:00.000Z'),
      }),
    });

    await service.addGuestMessage(
      context,
      ticketNumber,
      { body: 'Опять не работает' },
      key,
    );

    expect(db.guestSupportTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CLOSED' }) as Row,
        data: expect.objectContaining({
          status: 'NEW',
          resolvedAt: null,
          closedAt: null,
        }) as Row,
      }),
    );
    expect(auditActions(db).map((event) => event.action)).toEqual([
      'GUEST_MESSAGE_ADDED',
      'REOPENED_BY_GUEST',
    ]);
  });

  it('refuses a reply more than 7 days after close', async () => {
    const { service, db } = fixture({
      ticket: ticketRow({
        status: 'CLOSED',
        closedAt: new Date('2026-09-26T09:59:59.000Z'),
      }),
    });

    await expect(
      service.addGuestMessage(
        context,
        ticketNumber,
        { body: 'Опять не работает' },
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.guestSupportTicketComment.create).not.toHaveBeenCalled();
  });

  it('enforces the per-profile message limit and validates the text', async () => {
    const limited = fixture();
    limited.db.guestSupportTicketAuditEvent.count.mockResolvedValue(10);
    await expect(
      limited.service.addGuestMessage(
        context,
        ticketNumber,
        { body: 'Ещё одно сообщение' },
        key,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(limited.db.guestSupportTicketAuditEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        action: 'GUEST_MESSAGE_ADDED',
        ticket: { profileId: 'profile-a' },
      }) as Row,
    });

    const { service } = fixture();
    await expect(
      service.addGuestMessage(context, ticketNumber, { body: ' ' }, key),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.addGuestMessage(
        context,
        ticketNumber,
        { body: 'x'.repeat(1001) },
        key,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.addGuestMessage(context, ticketNumber, { body: 'Текст' }, 'bad'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes a resolved ticket when the guest confirms the answer helped', async () => {
    const { service, db } = fixture({
      ticket: ticketRow({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-10-02T10:00:00.000Z'),
      }),
      events: [reply('comment-1', '2026-10-02T10:00:00.000Z')],
    });

    await service.giveFeedback(context, ticketNumber, { value: 'HELPED' }, key);

    expect(auditActions(db)).toEqual([
      expect.objectContaining({
        action: 'GUEST_FEEDBACK',
        metadata: expect.objectContaining({
          value: 'HELPED',
          previousStatus: 'RESOLVED',
        }) as Row,
      }),
    ]);
    expect(db.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-a',
        tenantId: 'tenant-a',
        status: 'RESOLVED',
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      data: expect.objectContaining({ status: 'CLOSED' }) as Row,
    });
  });

  it('returns the ticket to the queue with the comment when the answer did not help', async () => {
    const { service, db } = fixture({
      ticket: ticketRow({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-10-02T10:00:00.000Z'),
      }),
      events: [reply('comment-1', '2026-10-02T10:00:00.000Z')],
    });

    await service.giveFeedback(
      context,
      ticketNumber,
      { value: 'NOT_HELPED', comment: 'Бонусы так и не пришли' },
      key,
    );

    expect(db.guestSupportTicketComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorUserId: null,
        body: 'Бонусы так и не пришли',
      }) as Row,
    });
    expect(auditActions(db).map((event) => event.action)).toEqual([
      'GUEST_MESSAGE_ADDED',
      'GUEST_FEEDBACK',
      'REOPENED_BY_GUEST',
    ]);
    expect(db.guestSupportTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'NEW' }) as Row,
      }),
    );
  });

  it('refuses feedback without a published answer, twice, or with an unknown value', async () => {
    const unanswered = fixture({
      ticket: ticketRow({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-10-02T10:00:00.000Z'),
      }),
    });
    await expect(
      unanswered.service.giveFeedback(
        context,
        ticketNumber,
        { value: 'HELPED' },
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const answered = fixture({
      ticket: ticketRow({
        status: 'CLOSED',
        resolvedAt: new Date('2026-10-02T10:00:00.000Z'),
        closedAt: new Date('2026-10-02T12:00:00.000Z'),
      }),
      events: [
        reply('comment-1', '2026-10-02T10:00:00.000Z'),
        {
          ticketId: 'ticket-a',
          action: 'GUEST_FEEDBACK',
          metadata: { value: 'HELPED' },
          createdAt: new Date('2026-10-02T12:00:00.000Z'),
        },
      ],
    });
    await expect(
      answered.service.giveFeedback(
        context,
        ticketNumber,
        { value: 'NOT_HELPED' },
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      fixture().service.giveFeedback(
        context,
        ticketNumber,
        { value: 'MAYBE' },
        key,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
