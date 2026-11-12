import { BadRequestException } from '@nestjs/common';
import { GuestTelegramOutboxService } from './guest-telegram-outbox.service';

type Row = Record<string, unknown>;

const NOW = new Date('2026-11-12T10:00:00.000Z');
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';

function fixture({
  candidates = [] as Row[],
  rows = [] as Row[],
  allowed = true,
  claimCount = 1,
} = {}) {
  const outbox = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest
      .fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(rows),
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
  };
  const admission = {
    evaluate: jest.fn().mockResolvedValue({ allowed }),
  };
  const service = new GuestTelegramOutboxService(
    { guestTelegramOutboxMessage: outbox } as never,
    admission as never,
  );
  return { service, outbox, admission };
}

function claimedRow(overrides: Row = {}) {
  return {
    id: ID_A,
    tenantId: 'tenant-a',
    kind: 'SUPPORT_REPLY',
    text: 'Ответ клуба',
    replyMarkup: null,
    profile: {
      telegramIdentity: 'chat:123456',
      status: 'ACTIVE',
      phoneConsentStatus: 'GRANTED',
    },
    ...overrides,
  };
}

describe('GuestTelegramOutboxService', () => {
  it('queues a message once per source key', async () => {
    const { service, outbox } = fixture();

    await service.enqueue({ guestTelegramOutboxMessage: outbox } as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      profileId: 'profile-a',
      kind: 'SUPPORT_REPLY',
      sourceKey: 'support-comment:c1',
      text: '  Ответ  ',
    });

    expect(outbox.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sourceKey: 'support-comment:c1',
          text: 'Ответ',
        }) as Row,
      ],
      skipDuplicates: true,
    });
  });

  it('claims due messages with a lease and returns the chat to the poller', async () => {
    const { service, outbox } = fixture({
      candidates: [{ id: ID_A, status: 'QUEUED', attempts: 0 }],
      rows: [claimedRow()],
    });

    const result = await service.claim({ limit: 5 }, NOW);

    expect(outbox.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 5 }),
    );
    expect(outbox.updateMany).toHaveBeenCalledWith({
      where: { id: ID_A, status: 'QUEUED', attempts: 0 },
      data: expect.objectContaining({
        status: 'SENDING',
        attempts: { increment: 1 },
        leaseExpiresAt: new Date('2026-11-12T10:02:00.000Z'),
      }) as Row,
    });
    expect(result.messages).toEqual([
      {
        id: ID_A,
        claimToken: expect.any(String) as string,
        chatId: '123456',
        text: 'Ответ клуба',
        replyMarkup: null,
      },
    ]);
  });

  it('does not hand over a message another poller claimed first', async () => {
    const { service } = fixture({
      candidates: [{ id: ID_A, status: 'QUEUED', attempts: 0 }],
      claimCount: 0,
    });

    await expect(service.claim({}, NOW)).resolves.toEqual({
      messages: [],
      skipped: 0,
    });
  });

  it.each([
    [
      'no Telegram chat',
      {
        profile: {
          telegramIdentity: null,
          status: 'ACTIVE',
          phoneConsentStatus: 'GRANTED',
        },
      },
      true,
      'SKIPPED',
      'NO_TELEGRAM_CHAT',
    ],
    [
      'a merged profile',
      {
        profile: {
          telegramIdentity: 'chat:1',
          status: 'MERGED_TELEGRAM_AUTH',
          phoneConsentStatus: 'GRANTED',
        },
      },
      true,
      'SKIPPED',
      'PROFILE_INACTIVE',
    ],
    [
      'a campaign to an unsubscribed guest',
      {
        kind: 'CAMPAIGN',
        profile: {
          telegramIdentity: 'chat:1',
          status: 'ACTIVE',
          phoneConsentStatus: 'UNSUBSCRIBED',
        },
      },
      true,
      'SKIPPED',
      'GUEST_UNSUBSCRIBED',
    ],
    [
      'a network without outbound',
      {},
      false,
      'BLOCKED',
      'TENANT_OUTBOUND_DENIED',
    ],
  ])('does not send %s', async (_name, overrides, allowed, status, code) => {
    const { service, outbox } = fixture({
      candidates: [{ id: ID_A, status: 'QUEUED', attempts: 0 }],
      rows: [claimedRow(overrides)],
      allowed,
    });

    const result = await service.claim({}, NOW);

    expect(result).toEqual({ messages: [], skipped: 1 });
    expect(outbox.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: ID_A, status: 'SENDING' }) as Row,
      data: expect.objectContaining({ status, lastErrorCode: code }) as Row,
    });
  });

  it('still sends a staff reply to a guest who unsubscribed from news', async () => {
    const { service } = fixture({
      candidates: [{ id: ID_A, status: 'QUEUED', attempts: 0 }],
      rows: [
        claimedRow({
          profile: {
            telegramIdentity: 'chat:9',
            status: 'ACTIVE',
            phoneConsentStatus: 'UNSUBSCRIBED',
          },
        }),
      ],
    });

    const result = await service.claim({}, NOW);

    expect(result.messages.map((message) => message.chatId)).toEqual(['9']);
  });

  it('records a sent message and releases the claim', async () => {
    const { service, outbox } = fixture();
    outbox.findFirst.mockResolvedValue({ attempts: 1 });

    const result = await service.report(
      {
        results: [
          {
            id: ID_A,
            claimToken: TOKEN,
            outcome: 'SENT',
            telegramMessageId: 77,
          },
        ],
      },
      NOW,
    );

    expect(result).toEqual({ applied: 1, ignored: 0 });
    expect(outbox.updateMany).toHaveBeenCalledWith({
      where: { id: ID_A, claimToken: TOKEN, status: 'SENDING' },
      data: {
        claimToken: null,
        leaseExpiresAt: null,
        status: 'SENT',
        sentAt: NOW,
        telegramMessageId: '77',
        lastErrorCode: null,
      },
    });
  });

  it('retries with backoff and Telegram retry_after, then gives up', async () => {
    const { service, outbox } = fixture();
    outbox.findFirst
      .mockResolvedValueOnce({ attempts: 2 })
      .mockResolvedValueOnce({ attempts: 5 });

    await service.report(
      {
        results: [
          {
            id: ID_A,
            claimToken: TOKEN,
            outcome: 'RETRY',
            errorCode: 'TELEGRAM_429',
            retryAfterSeconds: 300,
          },
          { id: ID_B, claimToken: TOKEN, outcome: 'RETRY' },
        ],
      },
      NOW,
    );

    expect(outbox.updateMany).toHaveBeenNthCalledWith(1, {
      where: expect.any(Object) as Row,
      data: expect.objectContaining({
        status: 'QUEUED',
        nextAttemptAt: new Date('2026-11-12T10:05:00.000Z'),
        lastErrorCode: 'TELEGRAM_429',
      }) as Row,
    });
    expect(outbox.updateMany).toHaveBeenNthCalledWith(2, {
      where: expect.any(Object) as Row,
      data: expect.objectContaining({
        status: 'FAILED',
        lastErrorCode: 'TELEGRAM_RETRY_EXHAUSTED',
      }) as Row,
    });
  });

  it('ignores a report for a claim that is no longer held', async () => {
    const { service, outbox } = fixture();
    outbox.findFirst.mockResolvedValue(null);

    await expect(
      service.report({
        results: [{ id: ID_A, claimToken: TOKEN, outcome: 'BLOCKED' }],
      }),
    ).resolves.toEqual({ applied: 0, ignored: 1 });
    expect(outbox.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed reports', async () => {
    const { service } = fixture();

    await expect(
      service.report({
        results: [{ id: 'x', claimToken: TOKEN, outcome: 'SENT' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.report({
        results: [{ id: ID_A, claimToken: TOKEN, outcome: 'DONE' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
