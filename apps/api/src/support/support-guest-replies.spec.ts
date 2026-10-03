import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';

type Row = Record<string, unknown>;

const actor = {
  id: 'user-a',
  tenantId: 'tenant-a',
  role: UserRole.ADMIN,
} as never;

function existingTicket(overrides: Row = {}) {
  return {
    id: 'ticket-a',
    tenantId: 'tenant-a',
    ticketNumber: 'LP-BUG-A1B2C3D4',
    status: 'NEW',
    assignedToUserId: null,
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

function fixture(ticket: Row | null = existingTicket()) {
  const tx = {
    guestSupportTicket: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestSupportTicketComment: {
      create: jest.fn().mockResolvedValue({
        id: 'comment-1',
        body: 'Ответ',
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
        authorUser: { id: 'user-a', fullName: 'Admin', email: 'a@x.invalid' },
      }),
    },
    guestSupportTicketAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    guestSupportTicket: {
      findFirst: jest.fn().mockResolvedValue(ticket),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestSupportTicketAuditEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    userRoleOverride: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new SupportTicketsService(
    prisma as never,
    { resolve: jest.fn(() => ({ tenantId: 'tenant-a' })) } as never,
    new ConfigService({}),
    { decrypt: jest.fn() } as never,
  );
  return { service, prisma, tx };
}

function audits(tx: ReturnType<typeof fixture>['tx']) {
  return (
    tx.guestSupportTicketAuditEvent.create.mock.calls as unknown as Array<
      [{ data: { action: string; metadata: Row } }]
    >
  ).map(([args]) => args.data);
}

describe('SupportTicketsService replies to the guest', () => {
  it('keeps comments internal by default', async () => {
    const { service, tx } = fixture();

    const comment = await service.addTenantComment(actor, 'ticket-a', {
      body: 'Проверить логи начисления',
    });

    expect(comment.visibility).toBe('INTERNAL');
    expect(audits(tx)).toEqual([
      expect.objectContaining({
        action: 'COMMENT_ADDED',
        metadata: { platformScope: false, visibility: 'INTERNAL' },
      }),
    ]);
    expect(tx.guestSupportTicket.updateMany).not.toHaveBeenCalled();
  });

  it('publishes a reply to the guest and takes a NEW ticket into work', async () => {
    const { service, tx } = fixture();

    const comment = await service.addTenantComment(actor, 'ticket-a', {
      body: 'Начислили кейс повторно, проверьте раздел наград.',
      visibility: 'PUBLIC',
    });

    expect(comment.visibility).toBe('PUBLIC');
    expect(audits(tx).map((event) => event.action)).toEqual([
      'COMMENT_ADDED',
      'PUBLIC_REPLY_SENT',
      'UPDATED_BY_SUPPORT',
    ]);
    expect(audits(tx)[1]?.metadata).toEqual({
      commentId: 'comment-1',
      platformScope: false,
    });
    expect(tx.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ticket-a', tenantId: 'tenant-a' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }) as Row,
    });
  });

  it('does not change the status of a ticket already in work', async () => {
    const { service, tx } = fixture(existingTicket({ status: 'IN_PROGRESS' }));

    await service.addTenantComment(actor, 'ticket-a', {
      body: 'Уточните, пожалуйста, время визита.',
      visibility: 'PUBLIC',
    });

    expect(audits(tx).map((event) => event.action)).toEqual([
      'COMMENT_ADDED',
      'PUBLIC_REPLY_SENT',
    ]);
    expect(tx.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ticket-a', tenantId: 'tenant-a' },
      data: { lastActivityAt: expect.any(Date) as Date },
    });
  });

  it('rejects an unknown visibility and a ticket of another tenant', async () => {
    const { service } = fixture();
    await expect(
      service.addTenantComment(actor, 'ticket-a', {
        body: 'Текст',
        visibility: 'EVERYONE' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const foreign = fixture(null);
    await expect(
      foreign.service.addTenantComment(actor, 'ticket-b', {
        body: 'Текст',
        visibility: 'PUBLIC',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(foreign.prisma.guestSupportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-b', tenantId: 'tenant-a' },
      }),
    );
  });

  it('answers and resolves in one compare-and-set transaction', async () => {
    const { service, tx } = fixture(existingTicket({ status: 'IN_PROGRESS' }));

    const result = await service.resolveTenantTicketWithReply(
      actor,
      'ticket-a',
      { body: 'Исправили, бонусы начислены.' },
    );

    expect(result).toMatchObject({ status: 'RESOLVED' });
    expect(tx.guestSupportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-a',
        tenantId: 'tenant-a',
        status: 'IN_PROGRESS',
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedAt: expect.any(Date) as Date,
      }) as Row,
    });
    expect(audits(tx)).toEqual([
      expect.objectContaining({ action: 'PUBLIC_REPLY_SENT' }),
      expect.objectContaining({
        action: 'UPDATED_BY_SUPPORT',
        metadata: expect.objectContaining({
          previousStatus: 'IN_PROGRESS',
          status: 'RESOLVED',
          reason: 'RESOLVED_WITH_REPLY',
        }) as Row,
      }),
    ]);
  });

  it('writes nothing when another specialist changed the ticket first', async () => {
    const { service, tx } = fixture();
    tx.guestSupportTicket.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolveTenantTicketWithReply(actor, 'ticket-a', {
        body: 'Исправили.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestSupportTicketComment.create).not.toHaveBeenCalled();
    expect(tx.guestSupportTicketAuditEvent.create).not.toHaveBeenCalled();
  });

  it('refuses to resolve an already finished ticket', async () => {
    const { service, prisma } = fixture(existingTicket({ status: 'CLOSED' }));

    await expect(
      service.resolveTenantTicketWithReply(actor, 'ticket-a', {
        body: 'Исправили.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('labels comments for staff and flags tickets waiting for an answer', async () => {
    const { service, prisma } = fixture(null);
    const row = {
      id: 'ticket-a',
      tenantId: 'tenant-a',
      status: 'IN_PROGRESS',
      profile: {
        contactMasked: '***1234',
        phoneEncrypted: null,
        guest: null,
      },
      guest: {
        fullNameMasked: 'I. P.',
        fullNameEncrypted: null,
        phoneMasked: '***1234',
        phoneEncrypted: null,
      },
      comments: [
        { id: 'comment-internal' },
        { id: 'comment-public' },
        { id: 'comment-guest' },
      ],
    };
    prisma.guestSupportTicket.findMany.mockImplementation(
      (args: { orderBy?: unknown }) =>
        Promise.resolve(args.orderBy ? [row] : [{ id: 'ticket-a' }]),
    );
    prisma.guestSupportTicketAuditEvent.findMany.mockResolvedValue([
      {
        ticketId: 'ticket-a',
        action: 'PUBLIC_REPLY_SENT',
        metadata: { commentId: 'comment-public' },
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      },
      {
        ticketId: 'ticket-a',
        action: 'GUEST_MESSAGE_ADDED',
        metadata: { commentId: 'comment-guest' },
        createdAt: new Date('2026-10-02T11:00:00.000Z'),
      },
    ]);

    const report = await service.getTenantTickets(actor, {
      status: 'awaiting',
    });

    const pageQuery = (
      prisma.guestSupportTicket.findMany.mock.calls as unknown as Array<
        [{ orderBy?: unknown; where: Row }]
      >
    ).find(([args]) => args.orderBy)?.[0];
    expect(pageQuery?.where).toMatchObject({
      tenantId: 'tenant-a',
      status: { in: ['NEW', 'IN_PROGRESS'] },
      id: { in: ['ticket-a'] },
    });
    expect(report.summary.awaitingStaff).toBe(1);
    expect(
      (report.rows[0]?.comments ?? []).map(
        (comment: { visibility: string }) => comment.visibility,
      ),
    ).toEqual(['INTERNAL', 'PUBLIC', 'GUEST']);
    expect(report.rows[0]?.guestThread).toMatchObject({
      awaitingStaff: true,
      unreadByGuest: true,
      feedback: null,
    });
  });
});
