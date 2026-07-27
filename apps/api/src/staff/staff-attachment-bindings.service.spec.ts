import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { StaffAttachmentBindingsService } from './staff-attachment-bindings.service';

const now = new Date('2026-07-27T12:00:00.000Z');

type BindingCreateManyArgs = {
  data: Array<{
    tenantId: string;
    attachmentId: string;
    candidateAttachmentId: string;
    resourceKind: string;
    resourceId: string;
    state: string;
    source: string;
    sourceKey: string;
    createdByUserId: string;
    resolvedAt: Date;
  }>;
  skipDuplicates: boolean;
};

function createHarness(
  rows: Array<{
    id: string;
    tenantId: string;
    uploadedByUserId: string | null;
    state: string;
    pendingExpiresAt: Date | null;
  }>,
) {
  let bindingCreateArgs: BindingCreateManyArgs | undefined;
  const createBindings = jest.fn((args: BindingCreateManyArgs) => {
    bindingCreateArgs = args;
    return Promise.resolve({ count: rows.length });
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    staffChatMessageAttachment: {
      createMany: jest.fn().mockResolvedValue({ count: rows.length }),
    },
    staffAttachmentBinding: {
      createMany: createBindings,
    },
    staffAttachment: {
      updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
    },
  };

  return {
    service: new StaffAttachmentBindingsService(),
    tx: tx as unknown as Prisma.TransactionClient,
    mocks: tx,
    getBindingCreateArgs: () => bindingCreateArgs,
  };
}

describe('StaffAttachmentBindingsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('atomically dual-writes chat links and transitions every pending blob', async () => {
    const rows = [
      {
        id: 'attachment-1',
        tenantId: 'tenant-a',
        uploadedByUserId: 'user-a',
        state: 'PENDING',
        pendingExpiresAt: new Date(now.getTime() + 60_000),
      },
      {
        id: 'attachment-2',
        tenantId: 'tenant-a',
        uploadedByUserId: 'user-a',
        state: 'PENDING',
        pendingExpiresAt: new Date(now.getTime() + 60_000),
      },
    ];
    const { service, tx, mocks, getBindingCreateArgs } = createHarness(rows);

    await service.bindPendingChatAttachments(tx, {
      tenantId: 'tenant-a',
      actorUserId: 'user-a',
      messageId: 'message-a',
      attachmentIds: ['attachment-1', 'attachment-2', 'attachment-1'],
    });

    expect(mocks.staffChatMessageAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-a',
          messageId: 'message-a',
          attachmentId: 'attachment-1',
        },
        {
          tenantId: 'tenant-a',
          messageId: 'message-a',
          attachmentId: 'attachment-2',
        },
      ],
      skipDuplicates: true,
    });
    const bindingCall = getBindingCreateArgs();
    expect(bindingCall).toBeDefined();
    if (!bindingCall) {
      throw new Error('Expected binding createMany call');
    }
    expect(bindingCall.data).toHaveLength(2);
    expect(bindingCall.data[0]).toMatchObject({
      tenantId: 'tenant-a',
      attachmentId: 'attachment-1',
      candidateAttachmentId: 'attachment-1',
      resourceKind: 'CHAT_MESSAGE',
      resourceId: 'message-a',
      state: 'BOUND',
      source: 'NATIVE',
      createdByUserId: 'user-a',
      resolvedAt: now,
    });
    expect(bindingCall.data[0].sourceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.staffAttachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['attachment-1', 'attachment-2'] },
        tenantId: 'tenant-a',
        uploadedByUserId: 'user-a',
        state: 'PENDING',
        pendingExpiresAt: { gt: now },
      },
      data: {
        state: 'BOUND',
        pendingExpiresAt: null,
        stateReasonCode: null,
        stateChangedAt: now,
      },
    });
  });

  it.each([
    {
      label: 'missing',
      rows: [],
    },
    {
      label: 'foreign tenant',
      rows: [
        {
          id: 'attachment-1',
          tenantId: 'tenant-b',
          uploadedByUserId: 'user-a',
          state: 'PENDING',
          pendingExpiresAt: new Date(now.getTime() + 60_000),
        },
      ],
    },
    {
      label: 'foreign uploader',
      rows: [
        {
          id: 'attachment-1',
          tenantId: 'tenant-a',
          uploadedByUserId: 'user-b',
          state: 'PENDING',
          pendingExpiresAt: new Date(now.getTime() + 60_000),
        },
      ],
    },
    {
      label: 'already bound',
      rows: [
        {
          id: 'attachment-1',
          tenantId: 'tenant-a',
          uploadedByUserId: 'user-a',
          state: 'BOUND',
          pendingExpiresAt: null,
        },
      ],
    },
    {
      label: 'expired',
      rows: [
        {
          id: 'attachment-1',
          tenantId: 'tenant-a',
          uploadedByUserId: 'user-a',
          state: 'PENDING',
          pendingExpiresAt: new Date(now.getTime() - 1),
        },
      ],
    },
  ])('rejects $label attachment before any write', async ({ rows }) => {
    const { service, tx, mocks } = createHarness(rows);

    await expect(
      service.bindPendingChatAttachments(tx, {
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        messageId: 'message-a',
        attachmentIds: ['attachment-1'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mocks.staffChatMessageAttachment.createMany).not.toHaveBeenCalled();
    expect(mocks.staffAttachmentBinding.createMany).not.toHaveBeenCalled();
    expect(mocks.staffAttachment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a failed compare-and-set so the outer parent transaction rolls back', async () => {
    const { service, tx, mocks } = createHarness([
      {
        id: 'attachment-1',
        tenantId: 'tenant-a',
        uploadedByUserId: 'user-a',
        state: 'PENDING',
        pendingExpiresAt: new Date(now.getTime() + 60_000),
      },
    ]);
    mocks.staffAttachment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.bindPendingChatAttachments(tx, {
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        messageId: 'message-a',
        attachmentIds: ['attachment-1'],
      }),
    ).rejects.toThrow('Attachment is not available');
  });
});
