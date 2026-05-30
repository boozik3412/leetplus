import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const channelScopes = ['NETWORK', 'STORE', 'ROLE'] as const;
const messageKinds = ['MESSAGE', 'ANNOUNCEMENT', 'INCIDENT'] as const;
const messagePriorities = ['NORMAL', 'HIGH', 'URGENT'] as const;
const roleScopes = ['ALL_STAFF', 'MANAGERS', 'ADMINISTRATORS'] as const;

export type StaffChatChannelScope = (typeof channelScopes)[number];
export type StaffChatMessageKind = (typeof messageKinds)[number];
export type StaffChatMessagePriority = (typeof messagePriorities)[number];
export type StaffChatRoleScope =
  | (typeof roleScopes)[number]
  | keyof typeof UserRole;

export type StaffTeamChatQuery = {
  channelId?: string;
  search?: string;
  pinned?: string;
  pageSize?: string;
};

export type StaffChatChannelDto = {
  name?: string;
  description?: string | null;
  scope?: StaffChatChannelScope;
  storeId?: string | null;
  roleScope?: StaffChatRoleScope | null;
};

export type StaffChatMessageDto = {
  channelId?: string | null;
  body?: string | null;
  kind?: StaffChatMessageKind;
  priority?: StaffChatMessagePriority;
  storeId?: string | null;
  isPinned?: boolean;
};

export type StaffChatReadDto = {
  channelId?: string | null;
  messageId?: string | null;
};

export type StaffChatMessageUpdateDto = {
  isPinned?: boolean;
};

export type StaffTeamChatReport = {
  filters: {
    channelId: string | null;
    search: string | null;
    pinned: boolean;
    pageSize: number;
  };
  summary: {
    channels: number;
    messages: number;
    pinned: number;
    unread: number;
  };
  activeChannelId: string | null;
  channels: StaffChatChannelResponse[];
  messages: StaffChatMessageResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  roleScopes: Array<{ value: StaffChatRoleScope; label: string }>;
};

export type StaffChatChannelResponse = {
  id: string;
  name: string;
  description: string | null;
  scope: StaffChatChannelScope;
  roleScope: string | null;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  createdByUser: { id: string; email: string; fullName: string | null } | null;
  messagesCount: number;
  unreadCount: number;
  pinnedCount: number;
  lastMessageAt: string | null;
};

export type StaffChatMessageResponse = {
  id: string;
  channelId: string;
  body: string;
  kind: StaffChatMessageKind;
  priority: StaffChatMessagePriority;
  isPinned: boolean;
  isReadByMe: boolean;
  createdAt: string;
  updatedAt: string;
  authorUser: { id: string; email: string; fullName: string | null } | null;
  store: { id: string; name: string; isActive: boolean } | null;
};

const channelInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffChatChannelInclude;

const messageInclude = {
  authorUser: { select: { id: true, email: true, fullName: true } },
  store: { select: { id: true, name: true, isActive: true } },
  readReceipts: { select: { userId: true } },
} satisfies Prisma.StaffChatMessageInclude;

type StaffChatChannelRow = Prisma.StaffChatChannelGetPayload<{
  include: typeof channelInclude;
}>;

type StaffChatMessageRow = Prisma.StaffChatMessageGetPayload<{
  include: typeof messageInclude;
}>;

type ChannelStats = {
  messagesCount: number;
  unreadCount: number;
  pinnedCount: number;
  lastMessageAt: string | null;
};

@Injectable()
export class StaffTeamChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: StaffTeamChatQuery = {},
  ): Promise<StaffTeamChatReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureDefaultChannel(tenantId);
    const accessWhere = await this.buildAccessibleChannelWhere(user, tenantId);
    const filters = this.resolveFilters(query);

    const channels = await this.prisma.staffChatChannel.findMany({
      where: accessWhere,
      include: channelInclude,
      orderBy: [{ isDefault: 'desc' }, { scope: 'asc' }, { name: 'asc' }],
    });

    const activeChannel =
      channels.find((channel) => channel.id === filters.channelId) ??
      channels.find((channel) => channel.isDefault) ??
      channels[0] ??
      null;

    const stats = await this.buildChannelStats(
      tenantId,
      user.id,
      channels.map((channel) => channel.id),
    );

    const messages = activeChannel
      ? await this.prisma.staffChatMessage.findMany({
          where: this.buildMessageWhere(tenantId, activeChannel.id, filters),
          include: messageInclude,
          orderBy: { createdAt: 'desc' },
          take: filters.pageSize,
        })
      : [];

    const stores = await this.prisma.store.findMany({
      where: { tenantId },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    const totals = Array.from(stats.values()).reduce(
      (acc, item) => ({
        messages: acc.messages + item.messagesCount,
        pinned: acc.pinned + item.pinnedCount,
        unread: acc.unread + item.unreadCount,
      }),
      { messages: 0, pinned: 0, unread: 0 },
    );

    return {
      filters: {
        ...filters,
        channelId: activeChannel?.id ?? null,
      },
      summary: {
        channels: channels.length,
        ...totals,
      },
      activeChannelId: activeChannel?.id ?? null,
      channels: channels.map((channel) =>
        this.toChannelResponse(channel, stats.get(channel.id)),
      ),
      messages: messages
        .map((message) => this.toMessageResponse(message, user.id))
        .reverse(),
      stores,
      roleScopes: [
        { value: 'ALL_STAFF', label: 'Весь персонал' },
        { value: 'MANAGERS', label: 'Управляющие и менеджеры' },
        { value: 'ADMINISTRATORS', label: 'Администраторы смены' },
        { value: 'STANDARDS_MANAGER', label: 'Менеджеры по стандартам' },
        { value: 'CLUB_ADMINISTRATOR', label: 'Администраторы клуба' },
        { value: 'SENIOR_ADMINISTRATOR', label: 'Старшие администраторы' },
      ],
    };
  }

  async createChannel(user: AuthenticatedUser, dto: StaffChatChannelDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeChannelData(tenantId, dto);

    try {
      const channel = await this.prisma.staffChatChannel.create({
        data: {
          ...data,
          tenantId,
          createdByUserId: user.id,
        },
        include: channelInclude,
      });

      return this.toChannelResponse(channel);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Channel with this name already exists');
      }

      throw error;
    }
  }

  async createMessage(user: AuthenticatedUser, dto: StaffChatMessageDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureDefaultChannel(tenantId);
    const channel = await this.resolveAccessibleChannel(
      user,
      tenantId,
      dto.channelId,
    );
    const data = await this.normalizeMessageData(tenantId, channel, dto);

    const message = await this.prisma.staffChatMessage.create({
      data: {
        ...data,
        tenantId,
        channelId: channel.id,
        authorUserId: user.id,
      },
      include: messageInclude,
    });

    await this.markMessagesRead(user.id, tenantId, channel.id, [message.id]);

    return this.toMessageResponse(message, user.id);
  }

  async updateMessage(
    user: AuthenticatedUser,
    id: string,
    dto: StaffChatMessageUpdateDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const message = await this.prisma.staffChatMessage.findFirst({
      where: { id, tenantId },
      select: { id: true, channelId: true },
    });

    if (!message) {
      throw new NotFoundException('Chat message not found');
    }

    await this.resolveAccessibleChannel(user, tenantId, message.channelId);

    const updated = await this.prisma.staffChatMessage.update({
      where: { id: message.id },
      data: { isPinned: Boolean(dto.isPinned) },
      include: messageInclude,
    });

    return this.toMessageResponse(updated, user.id);
  }

  async markRead(user: AuthenticatedUser, dto: StaffChatReadDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const channel = await this.resolveAccessibleChannel(
      user,
      tenantId,
      dto.channelId,
    );

    const messageId = this.normalizeOptionalString(dto.messageId);
    const messageIds = messageId
      ? [await this.resolveMessageId(tenantId, channel.id, messageId)]
      : (
          await this.prisma.staffChatMessage.findMany({
            where: {
              tenantId,
              channelId: channel.id,
              authorUserId: { not: user.id },
              readReceipts: { none: { userId: user.id } },
            },
            select: { id: true },
            take: 1000,
          })
        ).map((message) => message.id);

    const count = await this.markMessagesRead(
      user.id,
      tenantId,
      channel.id,
      messageIds,
    );

    return { channelId: channel.id, marked: count };
  }

  private resolveFilters(
    query: StaffTeamChatQuery,
  ): StaffTeamChatReport['filters'] {
    const pageSize = Math.min(
      Math.max(Number.parseInt(query.pageSize ?? '80', 10) || 80, 20),
      200,
    );

    return {
      channelId: this.normalizeOptionalString(query.channelId),
      search: this.normalizeOptionalString(query.search),
      pinned: query.pinned === 'true' || query.pinned === '1',
      pageSize,
    };
  }

  private buildMessageWhere(
    tenantId: string,
    channelId: string,
    filters: StaffTeamChatReport['filters'],
  ): Prisma.StaffChatMessageWhereInput {
    const where: Prisma.StaffChatMessageWhereInput = { tenantId, channelId };

    if (filters.search) {
      where.body = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.pinned) {
      where.isPinned = true;
    }

    return where;
  }

  private async buildChannelStats(
    tenantId: string,
    userId: string,
    channelIds: string[],
  ) {
    const stats = new Map<string, ChannelStats>();

    channelIds.forEach((channelId) => {
      stats.set(channelId, {
        messagesCount: 0,
        unreadCount: 0,
        pinnedCount: 0,
        lastMessageAt: null,
      });
    });

    if (channelIds.length === 0) {
      return stats;
    }

    const [messageCounts, pinnedCounts, unreadCounts, latestMessages] =
      await Promise.all([
        this.prisma.staffChatMessage.groupBy({
          by: ['channelId'],
          where: { tenantId, channelId: { in: channelIds } },
          _count: { _all: true },
        }),
        this.prisma.staffChatMessage.groupBy({
          by: ['channelId'],
          where: { tenantId, channelId: { in: channelIds }, isPinned: true },
          _count: { _all: true },
        }),
        this.prisma.staffChatMessage.groupBy({
          by: ['channelId'],
          where: {
            tenantId,
            channelId: { in: channelIds },
            authorUserId: { not: userId },
            readReceipts: { none: { userId } },
          },
          _count: { _all: true },
        }),
        this.prisma.staffChatMessage.findMany({
          where: { tenantId, channelId: { in: channelIds } },
          distinct: ['channelId'],
          orderBy: [{ channelId: 'asc' }, { createdAt: 'desc' }],
          select: { channelId: true, createdAt: true },
        }),
      ]);

    messageCounts.forEach((row) => {
      const item = stats.get(row.channelId);
      if (item) {
        item.messagesCount = row._count._all;
      }
    });

    pinnedCounts.forEach((row) => {
      const item = stats.get(row.channelId);
      if (item) {
        item.pinnedCount = row._count._all;
      }
    });

    unreadCounts.forEach((row) => {
      const item = stats.get(row.channelId);
      if (item) {
        item.unreadCount = row._count._all;
      }
    });

    latestMessages.forEach((message) => {
      const item = stats.get(message.channelId);
      if (item) {
        item.lastMessageAt = message.createdAt.toISOString();
      }
    });

    return stats;
  }

  private async ensureDefaultChannel(tenantId: string) {
    const existing = await this.prisma.staffChatChannel.findFirst({
      where: { tenantId, isDefault: true, scope: 'NETWORK' },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.staffChatChannel.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: 'Вся сеть',
        },
      },
      create: {
        tenantId,
        name: 'Вся сеть',
        description: 'Операционные объявления и сообщения для всей сети.',
        scope: 'NETWORK',
        isDefault: true,
      },
      update: {
        isDefault: true,
        isArchived: false,
        scope: 'NETWORK',
      },
      select: { id: true },
    });

    return created.id;
  }

  private async buildAccessibleChannelWhere(
    user: AuthenticatedUser,
    tenantId: string,
  ): Promise<Prisma.StaffChatChannelWhereInput> {
    if (this.canSeeAllChannels(user.role)) {
      return { tenantId, isArchived: false };
    }

    const storeIds = await this.getUserStoreIds(user.id);
    const roleScopeValues = this.resolveRoleScopeValues(user.role);
    const storeChannelWhere: Prisma.StaffChatChannelWhereInput =
      storeIds.length > 0
        ? { scope: 'STORE', storeId: { in: storeIds } }
        : { scope: 'STORE' };

    return {
      tenantId,
      isArchived: false,
      OR: [
        { scope: 'NETWORK' },
        storeChannelWhere,
        { scope: 'ROLE', roleScope: { in: roleScopeValues } },
      ],
    };
  }

  private async resolveAccessibleChannel(
    user: AuthenticatedUser,
    tenantId: string,
    channelId?: string | null,
  ) {
    const accessWhere = await this.buildAccessibleChannelWhere(user, tenantId);
    const targetId =
      this.normalizeOptionalString(channelId) ??
      (await this.ensureDefaultChannel(tenantId));

    const channel = await this.prisma.staffChatChannel.findFirst({
      where: {
        AND: [accessWhere, { id: targetId }],
      },
      select: { id: true, scope: true, storeId: true, roleScope: true },
    });

    if (!channel) {
      throw new NotFoundException('Chat channel not found');
    }

    return channel;
  }

  private async normalizeChannelData(
    tenantId: string,
    dto: StaffChatChannelDto,
  ): Promise<Omit<Prisma.StaffChatChannelUncheckedCreateInput, 'tenantId'>> {
    const name = this.normalizeRequiredString(dto.name, 'Channel name', 80);
    const description = this.normalizeOptionalString(dto.description, 240);
    const scope = this.resolveOne(dto.scope, channelScopes, 'NETWORK');
    const storeId =
      scope === 'STORE'
        ? await this.resolveStoreId(tenantId, dto.storeId)
        : null;
    const roleScope =
      scope === 'ROLE' ? this.resolveRoleScope(dto.roleScope) : null;

    return {
      name,
      description,
      scope,
      storeId,
      roleScope,
      isDefault: false,
      isArchived: false,
    };
  }

  private async normalizeMessageData(
    tenantId: string,
    channel: { storeId: string | null },
    dto: StaffChatMessageDto,
  ): Promise<Omit<Prisma.StaffChatMessageUncheckedCreateInput, 'tenantId'>> {
    const body = this.normalizeRequiredString(dto.body, 'Message text', 4000);
    const kind = this.resolveOne(dto.kind, messageKinds, 'MESSAGE');
    const priority = this.resolveOne(
      dto.priority,
      messagePriorities,
      kind === 'INCIDENT' ? 'URGENT' : 'NORMAL',
    );
    const requestedStoreId = this.normalizeOptionalString(dto.storeId);
    const storeId = requestedStoreId
      ? await this.resolveStoreId(tenantId, requestedStoreId)
      : channel.storeId;

    return {
      body,
      kind,
      priority,
      storeId,
      isPinned: Boolean(dto.isPinned) || kind === 'ANNOUNCEMENT',
      channelId: '',
    };
  }

  private async markMessagesRead(
    userId: string,
    tenantId: string,
    channelId: string,
    messageIds: string[],
  ) {
    const ids = Array.from(new Set(messageIds.filter(Boolean)));

    if (ids.length === 0) {
      return 0;
    }

    const result = await this.prisma.staffChatReadReceipt.createMany({
      data: ids.map((messageId) => ({
        tenantId,
        channelId,
        messageId,
        userId,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  private async resolveStoreId(tenantId: string, value?: string | null) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      throw new BadRequestException('Store is required for club channel');
    }

    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('Store not found');
    }

    return store.id;
  }

  private async resolveMessageId(
    tenantId: string,
    channelId: string,
    messageId: string,
  ) {
    const message = await this.prisma.staffChatMessage.findFirst({
      where: { id: messageId, tenantId, channelId },
      select: { id: true },
    });

    if (!message) {
      throw new NotFoundException('Chat message not found');
    }

    return message.id;
  }

  private resolveRoleScope(value?: string | null): StaffChatRoleScope {
    const normalized = this.normalizeOptionalString(value);
    const allowed = [
      ...roleScopes,
      ...Object.values(UserRole),
    ] as StaffChatRoleScope[];

    if (normalized && allowed.includes(normalized as StaffChatRoleScope)) {
      return normalized as StaffChatRoleScope;
    }

    throw new BadRequestException('Role scope is required for role channel');
  }

  private resolveRoleScopeValues(role: UserRole) {
    const values = new Set<string>(['ALL_STAFF', role]);

    if (
      (
        [
          UserRole.OWNER,
          UserRole.ADMIN,
          UserRole.MANAGER,
          UserRole.CLUB_MANAGER,
          UserRole.STANDARDS_MANAGER,
        ] as UserRole[]
      ).includes(role)
    ) {
      values.add('MANAGERS');
    }

    if (
      (
        [
          UserRole.SENIOR_ADMINISTRATOR,
          UserRole.CLUB_ADMINISTRATOR,
        ] as UserRole[]
      ).includes(role)
    ) {
      values.add('ADMINISTRATORS');
    }

    return Array.from(values);
  }

  private canSeeAllChannels(role: UserRole) {
    return (
      [
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.STANDARDS_MANAGER,
      ] as UserRole[]
    ).includes(role);
  }

  private async getUserStoreIds(userId: string) {
    const accesses = await this.prisma.userStoreAccess.findMany({
      where: { userId },
      select: { storeId: true },
    });

    return accesses.map((access) => access.storeId);
  }

  private toChannelResponse(
    channel: StaffChatChannelRow,
    stats?: ChannelStats,
  ): StaffChatChannelResponse {
    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      scope: channel.scope as StaffChatChannelScope,
      roleScope: channel.roleScope,
      isDefault: channel.isDefault,
      isArchived: channel.isArchived,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      store: channel.store,
      createdByUser: channel.createdByUser,
      messagesCount: stats?.messagesCount ?? 0,
      unreadCount: stats?.unreadCount ?? 0,
      pinnedCount: stats?.pinnedCount ?? 0,
      lastMessageAt: stats?.lastMessageAt ?? null,
    };
  }

  private toMessageResponse(
    message: StaffChatMessageRow,
    userId: string,
  ): StaffChatMessageResponse {
    return {
      id: message.id,
      channelId: message.channelId,
      body: message.body,
      kind: message.kind as StaffChatMessageKind,
      priority: message.priority as StaffChatMessagePriority,
      isPinned: message.isPinned,
      isReadByMe:
        message.authorUser?.id === userId ||
        message.readReceipts.some((receipt) => receipt.userId === userId),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      authorUser: message.authorUser,
      store: message.store,
    };
  }

  private normalizeRequiredString(
    value: string | null | undefined,
    label: string,
    maxLength: number,
  ) {
    const normalized = this.normalizeOptionalString(value, maxLength);

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private normalizeOptionalString(
    value: string | null | undefined,
    maxLength = 200,
  ) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    return normalized.slice(0, maxLength);
  }

  private resolveOne<T extends readonly string[]>(
    value: string | undefined | null,
    allowed: T,
    fallback: T[number],
  ): T[number] {
    return allowed.includes(value ?? '') ? (value as T[number]) : fallback;
  }
}
