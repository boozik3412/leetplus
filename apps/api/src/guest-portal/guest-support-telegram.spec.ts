import type { ConfigService } from '@nestjs/config';
import { GuestSupportService } from './guest-support.service';

type Row = Record<string, unknown>;

const context = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  profileId: 'profile-a',
  guestId: 'guest-a',
};

function telegramTicket(overrides: Row = {}) {
  return {
    id: 'ticket-tg',
    tenantId: 'tenant-a',
    ticketNumber: 'LP-BUG-TG000001',
    topic: 'OTHER',
    description: 'Первое сообщение',
    status: 'IN_PROGRESS',
    resolvedAt: null,
    closedAt: null,
    lastActivityAt: new Date('2026-11-12T09:00:00.000Z'),
    createdAt: new Date('2026-11-12T08:00:00.000Z'),
    updatedAt: new Date('2026-11-12T09:00:00.000Z'),
    store: { name: 'Клуб' },
    ...overrides,
  };
}

function fixture({
  mode = 'LIVE',
  latest = null as Row | null,
  openedToday = 0,
} = {}) {
  const db = {
    guestSupportTicket: {
      findMany: jest.fn().mockResolvedValue(latest ? [latest] : []),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(openedToday),
      create: jest.fn().mockResolvedValue({
        id: 'ticket-new',
        ticketNumber: 'LP-BUG-NEW00001',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestSupportTicketComment: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    guestSupportTicketAuditEvent: {
      findMany: jest.fn().mockResolvedValue([]),
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
  return { service, db };
}

describe('GuestSupportService Telegram messages', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00.000Z') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('opens a Telegram conversation for the first message', async () => {
    const { service, db } = fixture();

    const result = await service.recordTelegramMessage(
      context,
      '  Можно забронировать ПК?  ',
      'update:1',
    );

    expect(result).toEqual({
      status: 'CREATED',
      ticketNumber: 'LP-BUG-NEW00001',
    });
    expect(db.guestSupportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'TELEGRAM',
          topic: 'OTHER',
          storeId: 'store-a',
          description: 'Можно забронировать ПК?',
          idempotencyKey: 'telegram:update:1',
        }) as Row,
      }),
    );
  });

  it('adds later messages to the open conversation', async () => {
    const { service, db } = fixture({ latest: telegramTicket() });

    const result = await service.recordTelegramMessage(
      context,
      'И ещё вопрос',
      'update:2',
    );

    expect(result).toEqual({
      status: 'APPENDED',
      ticketNumber: 'LP-BUG-TG000001',
    });
    expect(db.guestSupportTicketComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-tg',
        authorUserId: null,
        body: 'И ещё вопрос',
      }) as Row,
    });
    expect(db.guestSupportTicket.create).not.toHaveBeenCalled();
  });

  it('does not add a redelivered Telegram update twice', async () => {
    const { service, db } = fixture({ latest: telegramTicket() });
    db.guestSupportTicketComment.findUnique.mockResolvedValue({ id: 'seen' });

    await expect(
      service.recordTelegramMessage(context, 'И ещё вопрос', 'update:2'),
    ).resolves.toMatchObject({ status: 'APPENDED' });
    expect(db.guestSupportTicketComment.create).not.toHaveBeenCalled();
  });

  it('reopens a recently resolved conversation', async () => {
    const { service } = fixture({
      latest: telegramTicket({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-11-11T10:00:00.000Z'),
      }),
    });

    await expect(
      service.recordTelegramMessage(context, 'Снова не работает', 'update:3'),
    ).resolves.toMatchObject({ status: 'REOPENED' });
  });

  it('starts a new conversation after a long-closed one', async () => {
    const { service, db } = fixture({
      latest: telegramTicket({
        status: 'CLOSED',
        resolvedAt: new Date('2026-10-01T10:00:00.000Z'),
        closedAt: new Date('2026-10-01T10:00:00.000Z'),
      }),
    });

    await expect(
      service.recordTelegramMessage(context, 'Новый вопрос', 'update:4'),
    ).resolves.toMatchObject({ status: 'CREATED' });
    expect(db.guestSupportTicket.create).toHaveBeenCalled();
  });

  it('turns limits and bad input into statuses instead of errors', async () => {
    await expect(
      fixture({ openedToday: 20 }).service.recordTelegramMessage(
        context,
        'Привет',
        'update:5',
      ),
    ).resolves.toEqual({ status: 'RATE_LIMITED' });
    await expect(
      fixture().service.recordTelegramMessage(context, '   ', 'update:6'),
    ).resolves.toEqual({ status: 'EMPTY' });
    await expect(
      fixture().service.recordTelegramMessage(
        context,
        'x'.repeat(1001),
        'update:7',
      ),
    ).resolves.toEqual({ status: 'TOO_LONG' });
    await expect(
      fixture({ mode: 'OFF' }).service.recordTelegramMessage(
        context,
        'Привет',
        'update:8',
      ),
    ).resolves.toEqual({ status: 'DISABLED' });
  });
});
