import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { lastValueFrom, toArray } from 'rxjs';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { StaffTeamChatController } from './staff-team-chat.controller';
import { StaffTeamChatService } from './staff-team-chat.service';

const tenantId = 'tenant-a';
const now = new Date('2026-07-27T09:00:00.000Z');

const networkActor = {
  id: 'network-manager',
  email: 'network-manager@example.test',
  fullName: 'Network Manager',
  role: UserRole.MANAGER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const storeActor = {
  ...networkActor,
  id: 'store-a1-manager',
  email: 'store-a1-manager@example.test',
  fullName: 'Store A1 Manager',
  accessScope: 'STORES',
  allowedStoreIds: ['a1'],
} satisfies AuthenticatedUser;

function channelRow(
  id: string,
  scope: 'NETWORK' | 'STORE' | 'ROLE' | 'CUSTOM',
  storeId: string | null = null,
  memberUsers: AuthenticatedUser[] = [],
) {
  return {
    id,
    tenantId,
    createdByUserId: null,
    storeId,
    name: id,
    description: null,
    scope,
    roleScope: null,
    isDefault: scope === 'NETWORK',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    store: storeId
      ? { id: storeId, name: storeId.toUpperCase(), isActive: true }
      : null,
    createdByUser: null,
    members: memberUsers.map((member) => ({
      id: `${id}:${member.id}`,
      tenantId,
      channelId: id,
      userId: member.id,
      createdAt: now,
      user: {
        id: member.id,
        email: member.email,
        fullName: member.fullName,
        role: member.role,
      },
    })),
  };
}

function messageRow(
  id: string,
  channelId: string,
  storeId: string | null,
  author = storeActor,
) {
  return {
    id,
    tenantId,
    channelId,
    authorUserId: author.id,
    storeId,
    knowledgeArticleId: null,
    body: id,
    kind: 'MESSAGE',
    priority: 'NORMAL',
    isPinned: false,
    dedupeKey: null,
    createdAt: now,
    updatedAt: now,
    channel: { name: channelId },
    authorUser: {
      id: author.id,
      email: author.email,
      fullName: author.fullName,
    },
    store: storeId
      ? { id: storeId, name: storeId.toUpperCase(), isActive: true }
      : null,
    knowledgeArticle: null,
    readReceipts: [],
    attachments: [],
    editHistory: [],
    mentions: [],
    _count: { editHistory: 0 },
  };
}

function createHarness(options?: {
  channels?: ReturnType<typeof channelRow>[];
  directChannel?: ReturnType<typeof channelRow> | null;
  directMessage?: unknown;
  reportMessages?: unknown[];
}) {
  const stores = [
    { id: 'a1', name: 'A1', isActive: true },
    { id: 'a2', name: 'A2', isActive: true },
  ];
  const directChannel = options?.directChannel ?? null;
  const prisma = {
    store: {
      findMany: jest.fn((args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return Promise.resolve(
          ids ? stores.filter((store) => ids.includes(store.id)) : stores,
        );
      }),
      findFirst: jest.fn(
        (args?: { where?: { id?: string; tenantId?: string } }) => {
          const id = args?.where?.id;
          return Promise.resolve(
            args?.where?.tenantId === tenantId &&
              stores.some((store) => store.id === id)
              ? { id }
              : null,
          );
        },
      ),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: storeActor.id,
          email: storeActor.email,
          fullName: storeActor.fullName,
          role: storeActor.role,
        },
      ]),
    },
    staffChatChannel: {
      findMany: jest.fn().mockResolvedValue(options?.channels ?? []),
      findFirst: jest.fn((args?: { where?: { AND?: unknown } }) => {
        if (args?.where?.AND) {
          return Promise.resolve(directChannel);
        }

        return Promise.resolve(null);
      }),
      upsert: jest.fn().mockResolvedValue({ id: 'default-network' }),
      update: jest.fn().mockResolvedValue({ id: 'store-channel' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
    },
    staffChatMessage: {
      findMany: jest.fn((args?: { distinct?: string[] }) =>
        Promise.resolve(args?.distinct ? [] : (options?.reportMessages ?? [])),
      ),
      findFirst: jest.fn().mockResolvedValue(options?.directMessage ?? null),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    staffChatMention: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    staffChatReadReceipt: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    staffChatChannelMember: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    staffChatMessageAttachment: {
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    staffChatMessageEdit: {
      create: jest.fn(),
    },
    staffAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffNotification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    staffKnowledgeArticleReadReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestWorkingShift: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((input: unknown) => {
    if (typeof input === 'function') {
      return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }

    return Promise.all(input as Promise<unknown>[]);
  });
  const tenantContextService = {
    resolve: jest.fn().mockReturnValue({
      tenantId,
      tenantSlug: 'tenant-a',
    }),
  };
  const service = new StaffTeamChatService(
    prisma as never,
    tenantContextService,
    new AccessScopeService(),
  );

  return { prisma, service };
}

type RecordedMock = {
  mock: {
    calls: unknown[][];
  };
};

function recordedCall<T>(
  mock: RecordedMock,
  callIndex: number,
  argumentIndex = 0,
) {
  return mock.mock.calls[callIndex]?.[argumentIndex] as T | undefined;
}

function serializedCall(
  mock: RecordedMock,
  callIndex: number,
  argumentIndex = 0,
) {
  return JSON.stringify(recordedCall(mock, callIndex, argumentIndex));
}

describe('StaffTeamChatService AccessScope boundary', () => {
  it('preserves tenant-wide channel and message predicates for NETWORK', async () => {
    const channels = [
      channelRow('network', 'NETWORK'),
      channelRow('store-a1', 'STORE', 'a1'),
      channelRow('store-a2', 'STORE', 'a2'),
    ];
    const { prisma, service } = createHarness({ channels });

    const report = await service.getReport(networkActor, {
      channelId: 'network',
    });

    expect(report.channels.map((channel) => channel.id)).toEqual([
      'network',
      'store-a1',
      'store-a2',
    ]);
    expect(serializedCall(prisma.staffChatChannel.findMany, 0)).not.toContain(
      '"storeId":{"in"',
    );
    expect(serializedCall(prisma.staffChatMessage.findMany, 0)).not.toContain(
      '"storeId":{"in"',
    );
  });

  it('uses allowed stores for channel list, message list, options and all stats', async () => {
    const channels = [
      channelRow('network', 'NETWORK'),
      channelRow('store-a1', 'STORE', 'a1'),
    ];
    const { prisma, service } = createHarness({ channels });

    const report = await service.getReport(storeActor, {
      channelId: 'network',
    });

    expect(report.stores.map((store) => store.id)).toEqual(['a1']);
    const channelQuery = serializedCall(prisma.staffChatChannel.findMany, 0);
    expect(channelQuery).toContain('"storeId":{"in":["a1"]}');
    expect(channelQuery).not.toContain('"a2"');
    expect(serializedCall(prisma.staffChatMessage.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );

    for (
      let index = 0;
      index < prisma.staffChatMessage.groupBy.mock.calls.length;
      index += 1
    ) {
      expect(serializedCall(prisma.staffChatMessage.groupBy, index)).toContain(
        '"storeId":{"in":["a1"]}',
      );
    }
    expect(serializedCall(prisma.staffChatMention.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
    expect(serializedCall(prisma.staffChatMessage.findMany, 1)).toContain(
      '"storeId":{"in":["a1"]}',
    );
  });

  it('rejects an explicit foreign store filter with 403 semantics', async () => {
    const { service } = createHarness();

    await expect(
      service.getReport(storeActor, { storeId: 'a2' }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.getLiveState(networkActor, { storeId: 'tenant-b-store' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fails closed if an invalid empty STORES scope reaches the service', async () => {
    const { service } = createHarness();
    const invalidActor = {
      ...storeActor,
      allowedStoreIds: [],
    } satisfies AuthenticatedUser;

    await expect(service.getLiveState(invalidActor)).rejects.toThrow(
      'Invalid authorization scope',
    );
  });

  it('masks an out-of-scope direct channel UUID as 404', async () => {
    const { service } = createHarness({
      channels: [channelRow('store-a1', 'STORE', 'a1')],
    });

    await expect(
      service.getReport(storeActor, { channelId: 'store-a2' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not grant a STORES manager role-wide access to a foreign CUSTOM channel', async () => {
    const channelId = 'custom-foreign';
    const { prisma, service } = createHarness();

    await expect(service.getReport(storeActor, { channelId })).rejects.toThrow(
      NotFoundException,
    );

    const listQuery = serializedCall(prisma.staffChatChannel.findMany, 0);
    expect(listQuery).toContain(
      `"scope":"CUSTOM","members":{"some":{"userId":"${storeActor.id}"}}`,
    );
    expect(listQuery).not.toContain('"name":{"not":');

    await expect(
      service.createMessage(storeActor, {
        channelId,
        body: 'Must stay private',
      }),
    ).rejects.toThrow(NotFoundException);

    const directQuery = prisma.staffChatChannel.findFirst.mock.calls
      .map((call) => JSON.stringify(call[0]))
      .find((call) => call.includes(`"id":"${channelId}"`));
    expect(directQuery).toContain(
      `"scope":"CUSTOM","members":{"some":{"userId":"${storeActor.id}"}}`,
    );
    expect(directQuery).not.toContain('"name":{"not":');
  });

  it('allows a STORES member to use CUSTOM while keeping messages store-bound', async () => {
    const channel = channelRow('custom-member', 'CUSTOM', null, [storeActor]);
    const created = messageRow('custom-member-message', channel.id, 'a1');
    const { prisma, service } = createHarness({
      channels: [channel],
      directChannel: channel,
    });
    prisma.staffChatMessage.create.mockResolvedValue({ id: created.id });
    prisma.staffChatMessage.findUniqueOrThrow.mockResolvedValue(created);

    const report = await service.getReport(storeActor, {
      channelId: channel.id,
    });

    expect(report.channels.map((visibleChannel) => visibleChannel.id)).toEqual([
      channel.id,
    ]);
    expect(report.channels[0]?.members.map((member) => member.id)).toEqual([
      storeActor.id,
    ]);
    expect(serializedCall(prisma.staffChatChannel.findMany, 0)).toContain(
      `"scope":"CUSTOM","members":{"some":{"userId":"${storeActor.id}"}}`,
    );
    expect(serializedCall(prisma.staffChatMessage.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );

    await service.createMessage(storeActor, {
      channelId: channel.id,
      body: 'A1 private update',
    });

    const createCall = recordedCall<{
      data: {
        tenantId: string;
        channelId: string;
        storeId: string | null;
      };
    }>(prisma.staffChatMessage.create, 0);
    expect(createCall?.data).toMatchObject({
      tenantId,
      channelId: channel.id,
      storeId: 'a1',
    });
  });

  it('preserves NETWORK manager access to non-member CUSTOM channels', async () => {
    const channel = channelRow('custom-network', 'CUSTOM');
    const created = messageRow(
      'custom-network-message',
      channel.id,
      null,
      networkActor,
    );
    const { prisma, service } = createHarness({
      channels: [channel],
      directChannel: channel,
    });
    prisma.staffChatMessage.create.mockResolvedValue({ id: created.id });
    prisma.staffChatMessage.findUniqueOrThrow.mockResolvedValue(created);

    const report = await service.getReport(networkActor, {
      channelId: channel.id,
    });
    expect(report.channels.map((visibleChannel) => visibleChannel.id)).toEqual([
      channel.id,
    ]);
    expect(serializedCall(prisma.staffChatChannel.findMany, 0)).toContain(
      '"name":{"not":',
    );

    await service.createMessage(networkActor, {
      channelId: channel.id,
      body: 'Network-wide custom update',
    });

    const createCall = recordedCall<{
      data: {
        tenantId: string;
        channelId: string;
        storeId: string | null;
      };
    }>(prisma.staffChatMessage.create, 0);
    expect(createCall?.data).toMatchObject({
      tenantId,
      channelId: channel.id,
      storeId: null,
    });
  });

  it('applies the same scope to live-state channels, counts, unread and latest', async () => {
    const channels = [
      channelRow('network', 'NETWORK'),
      channelRow('store-a1', 'STORE', 'a1'),
    ];
    const { prisma, service } = createHarness({ channels });

    await service.getLiveState(storeActor, { channelId: 'network' });

    expect(serializedCall(prisma.staffChatChannel.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
    for (
      let index = 0;
      index < prisma.staffChatMessage.groupBy.mock.calls.length;
      index += 1
    ) {
      expect(serializedCall(prisma.staffChatMessage.groupBy, index)).toContain(
        '"storeId":{"in":["a1"]}',
      );
    }
    expect(serializedCall(prisma.staffChatMention.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
    expect(serializedCall(prisma.staffChatMessage.findMany, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
  });

  it('binds a store-scoped message to the single allowed store', async () => {
    const channel = channelRow('network', 'NETWORK');
    const created = messageRow('message-a1', channel.id, 'a1');
    const { prisma, service } = createHarness({ directChannel: channel });
    prisma.staffChatMessage.create.mockResolvedValue({ id: created.id });
    prisma.staffChatMessage.findUniqueOrThrow.mockResolvedValue(created);

    await service.createMessage(storeActor, {
      channelId: channel.id,
      body: 'A1 update',
    });

    const createCall = recordedCall<{
      data: {
        tenantId: string;
        channelId: string;
        storeId: string | null;
      };
    }>(prisma.staffChatMessage.create, 0);
    expect(createCall?.data).toMatchObject({
      tenantId,
      channelId: channel.id,
      storeId: 'a1',
    });
  });

  it('rejects both foreign message binding and STORE-channel override', async () => {
    const networkChannel = channelRow('network', 'NETWORK');
    const networkHarness = createHarness({
      directChannel: networkChannel,
    });

    await expect(
      networkHarness.service.createMessage(storeActor, {
        channelId: networkChannel.id,
        body: 'Foreign',
        storeId: 'a2',
      }),
    ).rejects.toThrow(ForbiddenException);

    const storeChannel = channelRow('store-a1', 'STORE', 'a1');
    const storeHarness = createHarness({ directChannel: storeChannel });

    await expect(
      storeHarness.service.createMessage(storeActor, {
        channelId: storeChannel.id,
        body: 'Override',
        storeId: 'a2',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('masks an out-of-scope message UUID on update', async () => {
    const { prisma, service } = createHarness({
      directMessage: null,
    });

    await expect(
      service.updateMessage(storeActor, 'message-a2', {
        isPinned: true,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(serializedCall(prisma.staffChatMessage.findFirst, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
  });

  it('marks only an in-scope direct message as read', async () => {
    const channel = channelRow('store-a1', 'STORE', 'a1');
    const { prisma, service } = createHarness({
      directChannel: channel,
      directMessage: { id: 'message-a1' },
    });
    prisma.staffChatReadReceipt.createMany.mockResolvedValue({ count: 1 });

    await expect(
      service.markRead(storeActor, {
        channelId: channel.id,
        messageId: 'message-a1',
      }),
    ).resolves.toEqual({ channelId: channel.id, marked: 1 });
    expect(serializedCall(prisma.staffChatMessage.findFirst, 0)).toContain(
      '"storeId":{"in":["a1"]}',
    );
    expect(prisma.staffChatReadReceipt.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId,
          channelId: channel.id,
          messageId: 'message-a1',
          userId: storeActor.id,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('masks an out-of-scope direct read target as 404', async () => {
    const channel = channelRow('store-a1', 'STORE', 'a1');
    const { service } = createHarness({
      directChannel: channel,
      directMessage: null,
    });

    await expect(
      service.markRead(storeActor, {
        channelId: channel.id,
        messageId: 'message-a2',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('StaffTeamChatController scope refresh boundary', () => {
  it('closes each SSE response after one state so reconnect reruns guards', async () => {
    const state = {
      generatedAt: now.toISOString(),
      activeChannelId: null,
      summary: { channels: 0, messages: 0, pinned: 0, unread: 0 },
      channels: [],
    };
    const getLiveState = jest.fn().mockResolvedValue(state);
    const controller = new StaffTeamChatController({
      getLiveState,
    } as never);

    const events = await lastValueFrom(
      controller.events(storeActor, {}).pipe(toArray()),
    );

    expect(events).toEqual([
      {
        type: 'team-chat-state',
        retry: 5_000,
        data: state,
      },
    ]);
    expect(getLiveState).toHaveBeenCalledTimes(1);
  });
});
