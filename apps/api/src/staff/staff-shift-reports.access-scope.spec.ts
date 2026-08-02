import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { StaffShiftReportsService } from './staff-shift-reports.service';

const tenantId = 'tenant-a';

const storeActorA1 = {
  id: 'manager-a1',
  email: 'manager-a1@example.test',
  fullName: 'A1 Manager',
  role: UserRole.MANAGER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'STORES',
  allowedStoreIds: ['a1'],
} satisfies AuthenticatedUser;

const storeActorA1A2 = {
  ...storeActorA1,
  id: 'manager-a1-a2',
  email: 'manager-a1-a2@example.test',
  fullName: 'A1/A2 Manager',
  allowedStoreIds: ['a1', 'a2'],
} satisfies AuthenticatedUser;

type HarnessOptions = {
  shiftResult?: Record<string, unknown> | null;
  attachmentError?: Error;
};

type ShiftMessageCreateArgs = {
  data: {
    tenantId: string;
    authorUserId: string;
    storeId: string | null;
  };
};

function createHarness(options: HarnessOptions = {}) {
  let messageCreateArgs: ShiftMessageCreateArgs | undefined;
  const createMessage = jest.fn((args: ShiftMessageCreateArgs) => {
    messageCreateArgs = args;
    return Promise.resolve({ id: 'message-1' });
  });
  const tx = {
    staffChatMessage: {
      create: createMessage,
    },
  };
  let transactionCommitted = false;
  const transaction = jest.fn(
    async <T>(callback: (client: typeof tx) => Promise<T>) => {
      const result = await callback(tx);
      transactionCommitted = true;
      return result;
    },
  );
  const storeFindFirst = jest.fn(
    ({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(
        where.tenantId === tenantId && where.id === 'a1'
          ? { id: 'a1' }
          : null,
      ),
  );
  const guestWorkingShiftFindFirst = jest
    .fn()
    .mockResolvedValue(options.shiftResult ?? null);
  const reportingChannelUpsert = jest
    .fn()
    .mockResolvedValue({ id: 'reporting-channel' });
  const bindPendingChatAttachments = options.attachmentError
    ? jest.fn().mockRejectedValue(options.attachmentError)
    : jest.fn().mockResolvedValue(undefined);
  const prisma = {
    store: { findFirst: storeFindFirst },
    guestWorkingShift: { findFirst: guestWorkingShiftFindFirst },
    staffChatChannel: { upsert: reportingChannelUpsert },
    $transaction: transaction,
  };
  const tenantContextService = {
    resolve: jest.fn().mockReturnValue({
      tenantId,
      tenantSlug: 'tenant-a',
    }),
  };
  const attachmentBindingsService = {
    bindPendingChatAttachments,
  };
  const service = new StaffShiftReportsService(
    prisma as never,
    tenantContextService,
    new AccessScopeService(),
    {} as never,
    {} as never,
    attachmentBindingsService as never,
  );

  return {
    service,
    prisma,
    tx,
    storeFindFirst,
    guestWorkingShiftFindFirst,
    reportingChannelUpsert,
    transaction,
    bindPendingChatAttachments,
    wasTransactionCommitted: () => transactionCommitted,
    getMessageCreateArgs: () => messageCreateArgs,
  };
}

describe('StaffShiftReportsService sendReport AccessScope', () => {
  it('sends an A1 report and binds its attachments inside the same transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.sendReport(storeActorA1, {
        body: 'Shift report',
        storeId: 'a1',
        attachmentIds: ['attachment-1'],
      }),
    ).resolves.toEqual({
      channelId: 'reporting-channel',
      messageId: 'message-1',
      chatHref: '/staff/team-chat?channelId=reporting-channel',
    });

    expect(harness.storeFindFirst).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId },
      select: { id: true },
    });
    const messageCreate = harness.getMessageCreateArgs();
    expect(messageCreate).toBeDefined();
    if (!messageCreate) {
      throw new Error('Expected shift report message create call');
    }
    expect(messageCreate.data).toMatchObject({
      tenantId,
      authorUserId: storeActorA1.id,
      storeId: 'a1',
    });
    expect(harness.bindPendingChatAttachments).toHaveBeenCalledWith(
      harness.tx,
      {
        tenantId,
        actorUserId: storeActorA1.id,
        messageId: 'message-1',
        attachmentIds: ['attachment-1'],
      },
    );
    expect(harness.wasTransactionCommitted()).toBe(true);
  });

  it('rejects explicit A2 before querying stores or creating a message', async () => {
    const harness = createHarness();

    await expect(
      harness.service.sendReport(storeActorA1, {
        body: 'Shift report',
        storeId: 'a2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.storeFindFirst).not.toHaveBeenCalled();
    expect(harness.guestWorkingShiftFindFirst).not.toHaveBeenCalled();
    expect(harness.reportingChannelUpsert).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.tx.staffChatMessage.create).not.toHaveBeenCalled();
  });

  it('does not fall back to a tenant-wide lookup for an A2 shift', async () => {
    const harness = createHarness();

    await expect(
      harness.service.sendReport(storeActorA1, {
        body: 'Shift report',
        shiftId: 'shift-a2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.guestWorkingShiftFindFirst).toHaveBeenCalledTimes(1);
    expect(harness.guestWorkingShiftFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'shift-a2',
          tenantId,
          storeId: 'a1',
        },
      }),
    );
    expect(harness.reportingChannelUpsert).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('requires a store when a STORES actor has multiple allowed stores', async () => {
    const harness = createHarness();

    await expect(
      harness.service.sendReport(storeActorA1A2, {
        body: 'Shift report',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.storeFindFirst).not.toHaveBeenCalled();
    expect(harness.guestWorkingShiftFindFirst).not.toHaveBeenCalled();
    expect(harness.reportingChannelUpsert).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('propagates attachment rejection without committing the transaction', async () => {
    const attachmentError = new NotFoundException('Attachment not found');
    const harness = createHarness({ attachmentError });

    await expect(
      harness.service.sendReport(storeActorA1, {
        body: 'Shift report',
        storeId: 'a1',
        attachmentIds: ['attachment-ok', 'attachment-bad'],
      }),
    ).rejects.toBe(attachmentError);

    expect(harness.bindPendingChatAttachments).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        attachmentIds: ['attachment-ok', 'attachment-bad'],
      }),
    );
    expect(harness.wasTransactionCommitted()).toBe(false);
  });
});
