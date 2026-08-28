import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  GuestSupportService,
  stripImageMetadata,
} from './guest-support.service';

describe('GuestSupportService', () => {
  function fixture(mode = 'LIVE') {
    const tx = {
      guestSupportTicket: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          ticketNumber: 'LP-BUG-A1B2C3D4',
          createdAt: new Date('2026-08-28T10:00:00.000Z'),
        }),
      },
      guestSupportAttachment: { create: jest.fn().mockResolvedValue({}) },
      guestSupportTicketAuditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      guestSupportTicket: { findUnique: jest.fn() },
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GUEST_BUG_REPORTING_MODE') return mode;
        if (key === 'RELEASE_SHA') return 'a'.repeat(40);
        return undefined;
      }),
    };
    const service = new GuestSupportService(
      prisma as never,
      config as unknown as ConfigService,
    );
    return { service, prisma, tx };
  }

  const context = {
    tenantId: 'tenant-a',
    storeId: 'store-a',
    profileId: 'profile-a',
    guestId: 'guest-a',
    idempotencyKey: 'bug:request-1234',
    userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1.15',
  };
  const input = {
    topic: 'INTERFACE_AND_DISPLAY',
    description:
      'После нажатия на карточку экран остаётся пустым и действие не выполняется.',
    route: '/game#home',
    viewport: '390x844',
    timeZone: 'Asia/Yekaterinburg',
  };

  it('fails closed while the runtime switch is OFF', async () => {
    const { service, prisma } = fixture('OFF');

    await expect(
      service.createBugReport(context, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes only the dedicated support ticket, attachment and audit rows', async () => {
    const { service, tx } = fixture();
    const file = {
      originalname: 'screen.png',
      mimetype: 'image/png',
      buffer: pngWithTextMetadata(),
    };

    await expect(
      service.createBugReport(context, input, file),
    ).resolves.toEqual({
      ticketNumber: 'LP-BUG-A1B2C3D4',
      createdAt: '2026-08-28T10:00:00.000Z',
    });

    expect(tx.guestSupportTicket.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_profileId_idempotencyKey: {
          tenantId: 'tenant-a',
          profileId: 'profile-a',
          idempotencyKey: 'bug:request-1234',
        },
      },
      select: { ticketNumber: true, createdAt: true },
    });
    const ticketCalls = tx.guestSupportTicket.create.mock
      .calls as unknown as Array<
      [
        {
          data: Record<string, unknown>;
        },
      ]
    >;
    expect(ticketCalls).toHaveLength(1);
    expect(ticketCalls[0]?.[0].data).toMatchObject({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      profileId: 'profile-a',
      guestId: 'guest-a',
      topic: 'INTERFACE_AND_DISPLAY',
      browser: 'Safari',
      device: 'iPhone',
    });
    const attachmentCalls = tx.guestSupportAttachment.create.mock
      .calls as unknown as Array<
      [{ data: { data: Uint8Array; byteSize: number; state: string } }]
    >;
    const attachmentData = attachmentCalls[0]?.[0].data;
    expect(attachmentData).toBeDefined();
    if (!attachmentData) throw new Error('attachment create call is missing');
    expect(attachmentData.state).toBe('AVAILABLE');
    expect(attachmentData.byteSize).toBe(attachmentData.data.byteLength);
    expect(Buffer.from(attachmentData.data).includes(Buffer.from('tEXt'))).toBe(
      false,
    );
    expect(tx.guestSupportTicketAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('returns the original receipt for a repeated profile-scoped idempotency key', async () => {
    const { service, tx } = fixture();
    tx.guestSupportTicket.findUnique.mockResolvedValue({
      ticketNumber: 'LP-BUG-11223344',
      createdAt: new Date('2026-08-28T10:05:00.000Z'),
    });

    await expect(service.createBugReport(context, input)).resolves.toEqual({
      ticketNumber: 'LP-BUG-11223344',
      createdAt: '2026-08-28T10:05:00.000Z',
    });
    expect(tx.guestSupportTicket.count).not.toHaveBeenCalled();
    expect(tx.guestSupportTicket.create).not.toHaveBeenCalled();
  });

  it('enforces the authenticated profile hourly limit', async () => {
    const { service, tx } = fixture();
    tx.guestSupportTicket.count.mockResolvedValueOnce(5);

    await expect(service.createBugReport(context, input)).rejects.toMatchObject(
      {
        status: 429,
      },
    );
    expect(tx.guestSupportTicket.create).not.toHaveBeenCalled();
  });

  it('rejects a claimed image type that does not match the file signature', async () => {
    const { service } = fixture();

    await expect(
      service.createBugReport(context, input, {
        originalname: 'fake.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('strips PNG metadata while retaining image data and the terminal chunk', () => {
    const stripped = stripImageMetadata(pngWithTextMetadata(), 'image/png');

    expect(stripped.includes(Buffer.from('tEXt'))).toBe(false);
    expect(stripped.includes(Buffer.from('IDAT'))).toBe(true);
    expect(stripped.includes(Buffer.from('IEND'))).toBe(true);
  });
});

function pngWithTextMetadata() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('tEXt', Buffer.from('author\0private')),
    pngChunk('IDAT', Buffer.from([0x00])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(kind: string, data: Buffer) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(kind, 4, 'ascii');
  data.copy(chunk, 8);
  return chunk;
}
