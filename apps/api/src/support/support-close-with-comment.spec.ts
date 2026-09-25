import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportTicketsService } from './support-tickets.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const profileId = '22222222-2222-4222-8222-222222222222';
const ticketId = '33333333-3333-4333-8333-333333333333';
const requestId = 'f7c20ca8-2bd4-4d5a-89b8-4b9e2bce369c';
const expectedAt = '2026-09-23T10:03:34.084Z';
const body =
  'Проверили выдачу кейса и бонусов; обращение закрыто без повторного начисления.';
const dto = {
  tenantId,
  profileId,
  ticketNumber: 'LP-BUG-ABCDEF12',
  expectedUpdatedAt: expectedAt,
  expectedDescriptionMd5: '26f1524bcd64db713a027c377fb10f76',
  requestId,
  body,
};

function fixture() {
  const tx = {
    guestSupportTicketAuditEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    guestSupportTicketComment: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
    guestSupportTicket: {
      findFirst: jest.fn().mockResolvedValue({
        id: ticketId,
        description: 'Fixture support ticket description',
        status: 'NEW',
        updatedAt: new Date(expectedAt),
      }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: ticketId,
        ticketNumber: dto.ticketNumber,
        status: 'CLOSED',
        updatedAt: new Date(),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new SupportTicketsService(
    prisma as never,
    {} as never,
    new ConfigService({}),
    {} as never,
  );
  const actor = { id: '44444444-4444-4444-8444-444444444444' } as never;
  return { service, prisma, tx, actor };
}

describe('atomic platform ticket close with comment', () => {
  it('atomically closes once with one comment and one audit', async () => {
    const { service, tx, actor } = fixture();
    const result = await service.closePlatformTicketWithComment(
      actor,
      ticketId,
      dto,
    );
    expect(result.replayed).toBe(false);
    expect(tx.guestSupportTicket.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.guestSupportTicketComment.create).toHaveBeenCalledTimes(1);
    expect(tx.guestSupportTicketAuditEvent.create).toHaveBeenCalledTimes(1);
    const created = (
      tx.guestSupportTicketAuditEvent.create.mock.calls as unknown as Array<
        [
          {
            data: {
              tenantId: string;
              ticketId: string;
              actorUserId: string;
              action: string;
              metadata: {
                requestId: string;
                expectedDescriptionMd5: string;
                status: string;
              };
            };
          },
        ]
      >
    )[0]?.[0]?.data;
    expect(created?.tenantId).toBe(tenantId);
    expect(created?.ticketId).toBe(ticketId);
    expect(created?.actorUserId).toBe('44444444-4444-4444-8444-444444444444');
    expect(created?.action).toBe('CLOSED_WITH_COMMENT');
    expect(created?.metadata).toMatchObject({
      requestId,
      expectedDescriptionMd5: dto.expectedDescriptionMd5,
      status: 'CLOSED',
    });
  });

  it('rejects a stale concurrent update without creating comment or audit', async () => {
    const { service, tx, actor } = fixture();
    tx.guestSupportTicket.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.closePlatformTicketWithComment(actor, ticketId, dto),
    ).rejects.toThrow(ConflictException);
    expect(tx.guestSupportTicketComment.create).not.toHaveBeenCalled();
    expect(tx.guestSupportTicketAuditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a changed description before any write', async () => {
    const { service, tx, actor } = fixture();
    tx.guestSupportTicket.findFirst.mockResolvedValue({
      description: 'changed',
      status: 'NEW',
      updatedAt: new Date(expectedAt),
    });
    await expect(
      service.closePlatformTicketWithComment(actor, ticketId, dto),
    ).rejects.toThrow(ConflictException);
    expect(tx.guestSupportTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.guestSupportTicketComment.create).not.toHaveBeenCalled();
  });

  it('rejects another tenant or profile without any write', async () => {
    const { service, tx, actor } = fixture();
    tx.guestSupportTicket.findFirst.mockResolvedValue(null);
    await expect(
      service.closePlatformTicketWithComment(actor, ticketId, dto),
    ).rejects.toThrow(NotFoundException);
    expect(tx.guestSupportTicket.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an existing operation receipt with the wrong body or actor', async () => {
    const { service, tx, actor } = fixture();
    tx.guestSupportTicketAuditEvent.findUnique.mockResolvedValue({
      tenantId,
      ticketId,
      actorUserId: '44444444-4444-4444-8444-444444444444',
      action: 'CLOSED_WITH_COMMENT',
      metadata: { requestId, bodySha256: 'wrong' },
    });
    tx.guestSupportTicketComment.findUnique.mockResolvedValue({
      tenantId,
      ticketId,
      authorUserId: '44444444-4444-4444-8444-444444444444',
      body,
    });
    await expect(
      service.closePlatformTicketWithComment(actor, ticketId, dto),
    ).rejects.toThrow(ConflictException);
    expect(tx.guestSupportTicket.updateMany).not.toHaveBeenCalled();
  });
});
