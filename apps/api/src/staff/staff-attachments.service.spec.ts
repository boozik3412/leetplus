import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import {
  STAFF_ATTACHMENT_MAX_BYTES,
  STAFF_ATTACHMENT_PENDING_TTL_MS,
  StaffAttachmentsService,
} from './staff-attachments.service';
import type { StaffTeamChatService } from './staff-team-chat.service';
import type { StaffTasksService } from './staff-tasks.service';

const user: AuthenticatedUser = {
  id: 'user-a1',
  email: 'user-a1@example.test',
  fullName: 'User A1',
  role: UserRole.CLUB_MANAGER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
  permissions: [
    'view_staff_standards',
    'view_staff_training',
    'view_staff_knowledge',
  ],
};

type AttachmentMetadata = {
  state: 'PENDING' | 'BOUND' | 'UNRESOLVED' | 'QUARANTINED';
  uploadedByUserId: string;
  pendingExpiresAt: Date | null;
  bindings: Array<{
    resourceKind:
      | 'CHAT_MESSAGE'
      | 'STAFF_TASK'
      | 'CHECKLIST_RUN'
      | 'KNOWLEDGE_ARTICLE'
      | 'SHIFT_REGULATION'
      | 'TRAINING_COURSE'
      | 'ONBOARDING_PLAN';
    resourceId: string;
  }>;
};

type AttachmentCreateArgs = {
  data: {
    tenantId: string;
    uploadedByUserId: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    data: Uint8Array;
    state: string;
    pendingExpiresAt: Date;
    stateReasonCode: string | null;
    stateChangedAt: Date;
  };
  select: unknown;
};

type AttachmentFindArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
};

describe('StaffAttachmentsService', () => {
  function createSubject(
    aclMode: 'LEGACY' | 'SHADOW' | 'ENFORCED' = 'ENFORCED',
  ) {
    const create = jest.fn<(args: AttachmentCreateArgs) => Promise<unknown>>();
    const findResults: unknown[] = [];
    const findFirstArgs: AttachmentFindArgs[] = [];
    const events: string[] = [];
    const findFirst = (args: AttachmentFindArgs) => {
      findFirstArgs.push(args);
      events.push(findFirstArgs.length === 1 ? 'metadata-query' : 'blob-query');
      return Promise.resolve(findResults.shift());
    };
    const queryRaw = jest
      .fn()
      .mockImplementation((query: { values: unknown[] }) => {
        events.push('authority-lock');
        return Promise.resolve([
          { attachmentId: query.values[2], userId: query.values[0] },
        ]);
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const parentFindFirst = jest.fn().mockResolvedValue(null);
    const tx = {
      staffAttachment: { findFirst, updateMany },
      staffChecklistRun: { findFirst: parentFindFirst },
      staffKnowledgeArticle: { findFirst: parentFindFirst },
      staffShiftRegulation: { findFirst: parentFindFirst },
      staffTrainingCourse: { findFirst: parentFindFirst },
      staffOnboardingPlan: { findFirst: parentFindFirst },
      $queryRaw: queryRaw,
    };
    const transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    const prisma = {
      staffAttachment: { create },
      $transaction: transaction,
    };
    const resolve = jest.fn().mockReturnValue({
      tenantId: 'tenant-a',
      tenantSlug: 'tenant-a',
    });
    const tenantContext = { resolve };
    const config = {
      get: jest.fn((key: string) =>
        key === 'STAFF_ATTACHMENT_ACL_MODE' ? aclMode : undefined,
      ),
    };
    const canReadAnyAttachmentMessage = jest.fn().mockImplementation(() => {
      events.push('chat-authorizer');
      return Promise.resolve(false);
    });
    const teamChat = { canReadAnyAttachmentMessage };
    const canReadAnyAttachmentTask = jest.fn().mockReturnValue(false);
    const staffTasks = { canReadAnyAttachmentTask };
    const resolveFreshStoreScope = jest.fn().mockResolvedValue({
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      mode: 'NETWORK',
      allowedStoreIds: [],
    });
    const service = new StaffAttachmentsService(
      prisma as unknown as PrismaService,
      config as never,
      tenantContext,
      teamChat as unknown as StaffTeamChatService,
      staffTasks as unknown as StaffTasksService,
      { resolve: resolveFreshStoreScope } as never,
    );

    return {
      service,
      create,
      findResults,
      findFirstArgs,
      queryRaw,
      updateMany,
      transaction,
      tx,
      resolve,
      config,
      canReadAnyAttachmentMessage,
      canReadAnyAttachmentTask,
      parentFindFirst,
      resolveFreshStoreScope,
      events,
    };
  }

  function pendingMetadata(
    overrides: Partial<AttachmentMetadata> = {},
  ): AttachmentMetadata {
    return {
      state: 'PENDING',
      uploadedByUserId: user.id,
      pendingExpiresAt: new Date(Date.now() + 60_000),
      bindings: [],
      ...overrides,
    };
  }

  const attachmentBlob = {
    fileName: 'evidence.png',
    contentType: 'image/png',
    data: Uint8Array.from(Buffer.from('attachment-data')),
  };

  it('creates an uploader-owned PENDING attachment with a 24-hour TTL', async () => {
    const { service, create } = createSubject();
    const now = new Date('2026-07-27T08:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const expiresAt = new Date(now.getTime() + STAFF_ATTACHMENT_PENDING_TTL_MS);
    create.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'evidence.png',
      contentType: 'image/png',
      byteSize: 4,
      createdAt: now,
      pendingExpiresAt: expiresAt,
      uploadedByUser: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    });

    try {
      await expect(
        service.createAttachment(user, {
          originalname: '..\\evidence.png',
          mimetype: 'image/png',
          buffer: Buffer.from('data'),
        }),
      ).resolves.toEqual({
        id: 'attachment-1',
        fileName: 'evidence.png',
        contentType: 'image/png',
        byteSize: 4,
        url: '/staff/attachments/attachment-1',
        createdAt: now.toISOString(),
        pendingExpiresAt: expiresAt.toISOString(),
        uploadedByUser: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-a',
          uploadedByUserId: user.id,
          fileName: '.. evidence.png',
          contentType: 'image/png',
          byteSize: 4,
          data: Uint8Array.from(Buffer.from('data')),
          state: 'PENDING',
          pendingExpiresAt: expiresAt,
          stateReasonCode: null,
          stateChangedAt: now,
        },
        select: {
          id: true,
          fileName: true,
          contentType: true,
          byteSize: true,
          createdAt: true,
          pendingExpiresAt: true,
          uploadedByUser: {
            select: { id: true, email: true, fullName: true },
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['missing file', undefined],
    ['empty file', { buffer: Buffer.alloc(0) }],
  ])('rejects a %s', async (_label, file) => {
    const { service, create } = createSubject();

    await expect(service.createAttachment(user, file)).rejects.toThrow(
      new BadRequestException('File is required'),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an oversized file before persistence', async () => {
    const { service, create } = createSubject();

    await expect(
      service.createAttachment(user, {
        buffer: Buffer.alloc(STAFF_ATTACHMENT_MAX_BYTES + 1),
      }),
    ).rejects.toThrow(new BadRequestException('File is too large'));
    expect(create).not.toHaveBeenCalled();
  });

  it('lets the exact uploader read an unexpired PENDING attachment', async () => {
    const {
      service,
      findResults,
      findFirstArgs,
      canReadAnyAttachmentMessage,
      transaction,
    } = createSubject();
    findResults.push(pendingMetadata(), attachmentBlob);

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(findFirstArgs).toHaveLength(2);
    const metadataQuery = findFirstArgs[0];
    expect(metadataQuery?.where).toEqual({
      id: 'attachment-1',
      tenantId: 'tenant-a',
    });
    expect(metadataQuery?.select).not.toHaveProperty('data');
    expect(findFirstArgs[1]).toEqual({
      where: {
        id: 'attachment-1',
        tenantId: 'tenant-a',
        state: 'PENDING',
      },
      select: {
        fileName: true,
        contentType: true,
        data: true,
      },
    });
    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
  });

  it('fails before metadata or blob reads when the authority rows cannot be locked', async () => {
    const { service, queryRaw, findFirstArgs } = createSubject();
    queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findFirstArgs).toHaveLength(0);
  });

  it('denies another uploader and never loads the blob', async () => {
    const { service, findResults, findFirstArgs, canReadAnyAttachmentMessage } =
      createSubject();
    findResults.push(pendingMetadata({ uploadedByUserId: 'user-a2' }));

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirstArgs).toHaveLength(1);
    const metadataQuery = findFirstArgs[0];
    expect(metadataQuery?.where).toEqual({
      id: 'attachment-1',
      tenantId: 'tenant-a',
    });
    expect(metadataQuery?.select).not.toHaveProperty('data');
    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
  });

  it('quarantines an expired PENDING attachment before denying it', async () => {
    const { service, findResults, findFirstArgs, updateMany } = createSubject();
    const now = new Date('2026-07-27T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    findResults.push(
      pendingMetadata({
        pendingExpiresAt: new Date(now.getTime() - 1),
      }),
    );

    try {
      await expect(
        service.getAttachment(user, 'attachment-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'attachment-1',
          tenantId: 'tenant-a',
          state: 'PENDING',
          pendingExpiresAt: { lte: now },
        },
        data: {
          state: 'QUARANTINED',
          pendingExpiresAt: null,
          stateReasonCode: 'PENDING_EXPIRED',
          stateChangedAt: now,
        },
      });
      expect(findFirstArgs).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('denies a PENDING attachment without an expiry', async () => {
    const { service, findResults, findFirstArgs, updateMany } = createSubject();
    findResults.push(pendingMetadata({ pendingExpiresAt: null }));

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(findFirstArgs).toHaveLength(1);
  });

  it('returns not found on a tenant-scoped metadata miss', async () => {
    const { service, findResults, findFirstArgs, canReadAnyAttachmentMessage } =
      createSubject();
    findResults.push(null);

    await expect(
      service.getAttachment(user, 'foreign-attachment'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirstArgs).toHaveLength(1);
    expect(findFirstArgs[0]?.where).toEqual({
      id: 'foreign-attachment',
      tenantId: 'tenant-a',
    });
    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
  });

  it('loads a BOUND blob only after the chat parent authorizer allows it', async () => {
    const {
      service,
      findResults,
      findFirstArgs,
      canReadAnyAttachmentMessage,
      tx,
      events,
    } = createSubject();
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [
          { resourceKind: 'CHAT_MESSAGE', resourceId: 'message-1' },
          { resourceKind: 'STAFF_TASK', resourceId: 'task-1' },
          { resourceKind: 'CHAT_MESSAGE', resourceId: 'message-2' },
        ],
      }),
      attachmentBlob,
    );
    canReadAnyAttachmentMessage.mockImplementation(() => {
      events.push('chat-authorizer');
      return Promise.resolve(true);
    });

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(canReadAnyAttachmentMessage).toHaveBeenCalledWith(
      user,
      ['message-1', 'message-2'],
      tx,
    );
    expect(events).toEqual([
      'authority-lock',
      'metadata-query',
      'chat-authorizer',
      'blob-query',
    ]);
    const blobQuery = findFirstArgs[1];
    expect(blobQuery?.where.state).toBe('BOUND');
  });

  it('denies a BOUND attachment when the chat parent authorizer denies it', async () => {
    const { service, findResults, findFirstArgs, canReadAnyAttachmentMessage } =
      createSubject();
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [
          { resourceKind: 'CHAT_MESSAGE', resourceId: 'message-denied' },
        ],
      }),
    );
    canReadAnyAttachmentMessage.mockResolvedValue(false);

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(canReadAnyAttachmentMessage).toHaveBeenCalledTimes(1);
    expect(findFirstArgs).toHaveLength(1);
    const metadataQuery = findFirstArgs[0];
    expect(metadataQuery?.where).toEqual({
      id: 'attachment-1',
      tenantId: 'tenant-a',
    });
    expect(metadataQuery?.select).not.toHaveProperty('data');
  });

  it('loads a task evidence blob only after the task parent authorizer allows it', async () => {
    const {
      service,
      findResults,
      canReadAnyAttachmentMessage,
      canReadAnyAttachmentTask,
      tx,
      findFirstArgs,
    } = createSubject();
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [
          { resourceKind: 'STAFF_TASK', resourceId: 'task-1' },
          { resourceKind: 'STAFF_TASK', resourceId: 'task-2' },
        ],
      }),
      attachmentBlob,
    );
    canReadAnyAttachmentTask.mockResolvedValue(true);

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
    expect(canReadAnyAttachmentTask).toHaveBeenCalledWith(
      user,
      ['task-1', 'task-2'],
      tx,
    );
    expect(findFirstArgs).toHaveLength(2);
  });

  it('denies task evidence when the live task parent scope denies it', async () => {
    const { service, findResults, canReadAnyAttachmentTask, findFirstArgs } =
      createSubject();
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [{ resourceKind: 'STAFF_TASK', resourceId: 'task-denied' }],
      }),
    );
    canReadAnyAttachmentTask.mockResolvedValue(false);

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(canReadAnyAttachmentTask).toHaveBeenCalledTimes(1);
    expect(findFirstArgs).toHaveLength(1);
  });

  it.each([
    ['CHECKLIST_RUN', 'staffChecklistRun', 'checklist-1'],
    ['KNOWLEDGE_ARTICLE', 'staffKnowledgeArticle', 'article-1'],
    ['SHIFT_REGULATION', 'staffShiftRegulation', 'regulation-1'],
    ['TRAINING_COURSE', 'staffTrainingCourse', 'course-1'],
    ['ONBOARDING_PLAN', 'staffOnboardingPlan', 'plan-1'],
  ] as const)(
    'loads a %s attachment only after fresh NETWORK parent authorization',
    async (resourceKind, delegateName, resourceId) => {
      const {
        service,
        findResults,
        tx,
        resolveFreshStoreScope,
        canReadAnyAttachmentMessage,
        canReadAnyAttachmentTask,
      } = createSubject();
      const parentDelegate = tx[delegateName];
      parentDelegate.findFirst.mockResolvedValueOnce({ id: resourceId });
      findResults.push(
        pendingMetadata({
          state: 'BOUND',
          pendingExpiresAt: null,
          bindings: [{ resourceKind, resourceId }],
        }),
        attachmentBlob,
      );

      await expect(
        service.getAttachment(user, 'attachment-1'),
      ).resolves.toEqual({
        fileName: attachmentBlob.fileName,
        contentType: attachmentBlob.contentType,
        buffer: Buffer.from(attachmentBlob.data),
      });

      expect(resolveFreshStoreScope).toHaveBeenCalledWith(user);
      expect(parentDelegate.findFirst).toHaveBeenCalledWith({
        where: {
          id: { in: [resourceId] },
          tenantId: 'tenant-a',
        },
        select: { id: true },
      });
      expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
      expect(canReadAnyAttachmentTask).not.toHaveBeenCalled();
    },
  );

  it('keeps network-only parent files hidden from a STORES subject', async () => {
    const {
      service,
      findResults,
      findFirstArgs,
      parentFindFirst,
      resolveFreshStoreScope,
    } = createSubject();
    const storeUser: AuthenticatedUser = {
      ...user,
      accessScope: 'STORES',
      allowedStoreIds: ['store-a1'],
    };
    resolveFreshStoreScope.mockResolvedValueOnce({
      userId: storeUser.id,
      tenantId: storeUser.tenantId,
      tenantSlug: storeUser.tenantSlug,
      mode: 'STORES',
      allowedStoreIds: ['store-a1'],
    });
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [
          { resourceKind: 'KNOWLEDGE_ARTICLE', resourceId: 'article-1' },
        ],
      }),
    );

    await expect(
      service.getAttachment(storeUser, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(parentFindFirst).not.toHaveBeenCalled();
    expect(findFirstArgs).toHaveLength(1);
  });

  it('fails before parent or blob reads when NETWORK authority is stale', async () => {
    const {
      service,
      findResults,
      findFirstArgs,
      parentFindFirst,
      resolveFreshStoreScope,
    } = createSubject();
    resolveFreshStoreScope.mockRejectedValueOnce(
      new UnauthorizedException('Authorization scope is stale'),
    );
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [{ resourceKind: 'TRAINING_COURSE', resourceId: 'course-1' }],
      }),
    );

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(parentFindFirst).not.toHaveBeenCalled();
    expect(findFirstArgs).toHaveLength(1);
  });

  it.each(['UNRESOLVED', 'QUARANTINED'] as const)(
    'fails closed for a %s attachment',
    async (state) => {
      const {
        service,
        findResults,
        findFirstArgs,
        canReadAnyAttachmentMessage,
      } = createSubject();
      findResults.push(
        pendingMetadata({
          state,
          pendingExpiresAt: null,
        }),
      );

      await expect(
        service.getAttachment(user, 'attachment-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
      expect(findFirstArgs).toHaveLength(1);
    },
  );

  it('keeps the legacy tenant reader available during the EXPAND rollout', async () => {
    const { service, findResults, findFirstArgs, canReadAnyAttachmentMessage } =
      createSubject('LEGACY');
    findResults.push(
      pendingMetadata({
        state: 'UNRESOLVED',
        pendingExpiresAt: null,
      }),
      attachmentBlob,
    );

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
    expect(findFirstArgs[1]?.where).toEqual({
      id: 'attachment-1',
      tenantId: 'tenant-a',
    });
  });

  it('observes strict denial without quarantining or blocking in SHADOW mode', async () => {
    const { service, findResults, findFirstArgs, updateMany } =
      createSubject('SHADOW');
    findResults.push(
      pendingMetadata({
        pendingExpiresAt: new Date(Date.now() - 1),
      }),
      attachmentBlob,
    );

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(findFirstArgs[1]?.where).toEqual({
      id: 'attachment-1',
      tenantId: 'tenant-a',
    });
  });

  it('does not turn a shadow authorizer failure into an attachment outage', async () => {
    const { service, findResults, canReadAnyAttachmentMessage, findFirstArgs } =
      createSubject('SHADOW');
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [{ resourceKind: 'CHAT_MESSAGE', resourceId: 'message-1' }],
      }),
      attachmentBlob,
    );
    canReadAnyAttachmentMessage.mockRejectedValue(
      new Error('shadow authorizer failed'),
    );

    await expect(service.getAttachment(user, 'attachment-1')).resolves.toEqual({
      fileName: attachmentBlob.fileName,
      contentType: attachmentBlob.contentType,
      buffer: Buffer.from(attachmentBlob.data),
    });

    expect(findFirstArgs).toHaveLength(2);
  });

  it('fails closed for an orphaned BOUND attachment', async () => {
    const {
      service,
      findResults,
      findFirstArgs,
      canReadAnyAttachmentMessage,
      canReadAnyAttachmentTask,
    } = createSubject();
    findResults.push(
      pendingMetadata({
        state: 'BOUND',
        pendingExpiresAt: null,
        bindings: [],
      }),
    );

    await expect(
      service.getAttachment(user, 'attachment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(canReadAnyAttachmentMessage).not.toHaveBeenCalled();
    expect(canReadAnyAttachmentTask).not.toHaveBeenCalled();
    expect(findFirstArgs).toHaveLength(1);
  });
});
