import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const channelScopes = ['NETWORK', 'STORE', 'ROLE', 'CUSTOM'] as const;
const messageKinds = ['MESSAGE', 'ANNOUNCEMENT', 'INCIDENT'] as const;
const messagePriorities = ['NORMAL', 'HIGH', 'URGENT'] as const;
const roleScopes = ['ALL_STAFF', 'MANAGERS', 'ADMINISTRATORS'] as const;
const STAFF_CHAT_MESSAGE_MAX_ATTACHMENTS = 20;
export const STAFF_CHAT_NOTIFICATION_CHANNEL_NAME = 'Уведомления';
export const STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION =
  'Системные уведомления о назначении задач, курсов, изменениях регламентов и других событиях персонала.';
export const STAFF_CHAT_REPORTING_CHANNEL_NAME = 'Отчетность';
export const STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION =
  'Итоговые отчеты администраторов по сменам: чек-листы, задачи, вложения и ручные комментарии перед сдачей смены.';
const defaultNetworkChannels = [
  {
    name: 'Информация и объявления',
    description:
      'Официальные объявления, регламенты и важные сообщения для всей сети.',
  },
  {
    name: STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
    description: STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
  },
  {
    name: STAFF_CHAT_REPORTING_CHANNEL_NAME,
    description: STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION,
  },
  {
    name: 'Техническая поддержка',
    description:
      'Вопросы по оборудованию, кассе, сервисам, доступам и срочным техническим проблемам.',
  },
  {
    name: 'Общение',
    description:
      'Рабочее общение команды без привязки к конкретному клубу или задаче.',
  },
] as const;
const primaryDefaultChannelName = defaultNetworkChannels[0].name;

export type StaffChatChannelScope = (typeof channelScopes)[number];
export type StaffChatMessageKind = (typeof messageKinds)[number];
export type StaffChatMessagePriority = (typeof messagePriorities)[number];
export type StaffChatRoleScope =
  | (typeof roleScopes)[number]
  | keyof typeof UserRole;

export type StaffTeamChatQuery = {
  channelId?: string;
  storeId?: string;
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
  memberUserIds?: string[] | null;
};

export type StaffChatMessageDto = {
  channelId?: string | null;
  body?: string | null;
  kind?: StaffChatMessageKind;
  priority?: StaffChatMessagePriority;
  storeId?: string | null;
  isPinned?: boolean;
  attachmentIds?: string[] | null;
  mentionedUserIds?: string[] | null;
};

export type StaffChatSystemNotificationDto = {
  title: string;
  message?: string | null;
  storeId?: string | null;
  actorUserId?: string | null;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  actionLabel?: string | null;
  actionHref?: string | null;
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
    storeId: string | null;
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
  users: StaffChatUserResponse[];
  roleScopes: Array<{ value: StaffChatRoleScope; label: string }>;
  canManageChannels: boolean;
};

export type StaffTeamChatLiveState = {
  generatedAt: string;
  activeChannelId: string | null;
  summary: StaffTeamChatReport['summary'];
  channels: Array<{
    id: string;
    updatedAt: string;
    messagesCount: number;
    unreadCount: number;
    mentionUnreadCount: number;
    pinnedCount: number;
    lastMessageAt: string | null;
  }>;
};

export type StaffChatUserResponse = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
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
  members: StaffChatUserResponse[];
  messagesCount: number;
  unreadCount: number;
  mentionUnreadCount: number;
  pinnedCount: number;
  lastMessageAt: string | null;
};

export type StaffChatMessageAttachmentResponse = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
  uploadedByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffChatMessageResponse = {
  id: string;
  channelId: string;
  body: string;
  kind: StaffChatMessageKind;
  priority: StaffChatMessagePriority;
  isPinned: boolean;
  isReadByMe: boolean;
  mentionedMe: boolean;
  createdAt: string;
  updatedAt: string;
  authorUser: { id: string; email: string; fullName: string | null } | null;
  store: { id: string; name: string; isActive: boolean } | null;
  attachments: StaffChatMessageAttachmentResponse[];
  mentions: StaffChatUserResponse[];
};

const channelInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  createdByUser: { select: { id: true, email: true, fullName: true } },
  members: {
    include: {
      user: { select: { id: true, email: true, fullName: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.StaffChatChannelInclude;

const messageInclude = {
  authorUser: { select: { id: true, email: true, fullName: true } },
  store: { select: { id: true, name: true, isActive: true } },
  readReceipts: { select: { userId: true } },
  attachments: {
    include: {
      attachment: {
        select: {
          id: true,
          fileName: true,
          contentType: true,
          byteSize: true,
          createdAt: true,
          uploadedByUser: {
            select: { id: true, email: true, fullName: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  mentions: {
    include: {
      mentionedUser: {
        select: { id: true, email: true, fullName: true, role: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
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
  mentionUnreadCount: number;
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
    await this.ensureDefaultChannels(tenantId);
    const accessWhere = await this.buildAccessibleChannelWhere(user, tenantId);
    const filters = this.resolveFilters(query);

    const channels = await this.prisma.staffChatChannel.findMany({
      where: accessWhere,
      include: channelInclude,
      orderBy: [{ isDefault: 'desc' }, { scope: 'asc' }, { name: 'asc' }],
    });

    const storeChannel = filters.storeId
      ? channels.find(
          (channel) =>
            channel.scope === 'STORE' && channel.storeId === filters.storeId,
        )
      : null;

    const activeChannel =
      channels.find((channel) => channel.id === filters.channelId) ??
      storeChannel ??
      channels.find((channel) => channel.name === primaryDefaultChannelName) ??
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

    const [stores, users] = await Promise.all([
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, email: true, fullName: true, role: true },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      }),
    ]);

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
      messages: messages.map((message) =>
        this.toMessageResponse(message, user.id),
      ),
      stores,
      users,
      roleScopes: [
        { value: 'ALL_STAFF', label: 'Весь персонал' },
        { value: 'MANAGERS', label: 'Управляющие и менеджеры' },
        { value: 'ADMINISTRATORS', label: 'Администраторы смены' },
        { value: 'STANDARDS_MANAGER', label: 'Менеджеры по стандартам' },
        { value: 'CLUB_ADMINISTRATOR', label: 'Администраторы клуба' },
        { value: 'SENIOR_ADMINISTRATOR', label: 'Старшие администраторы' },
      ],
      canManageChannels: this.canManageChannels(user.role),
    };
  }

  async getLiveState(
    user: AuthenticatedUser,
    query: StaffTeamChatQuery = {},
  ): Promise<StaffTeamChatLiveState> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const accessWhere = await this.buildAccessibleChannelWhere(user, tenantId);
    const filters = this.resolveFilters(query);

    const channels = await this.prisma.staffChatChannel.findMany({
      where: accessWhere,
      select: { id: true, updatedAt: true },
      orderBy: [{ isDefault: 'desc' }, { scope: 'asc' }, { name: 'asc' }],
    });
    const channelIds = channels.map((channel) => channel.id);
    const stats = await this.buildChannelStats(tenantId, user.id, channelIds);
    const totals = Array.from(stats.values()).reduce(
      (acc, item) => ({
        messages: acc.messages + item.messagesCount,
        pinned: acc.pinned + item.pinnedCount,
        unread: acc.unread + item.unreadCount,
      }),
      { messages: 0, pinned: 0, unread: 0 },
    );

    return {
      generatedAt: new Date().toISOString(),
      activeChannelId:
        filters.channelId && channelIds.includes(filters.channelId)
          ? filters.channelId
          : null,
      summary: {
        channels: channels.length,
        ...totals,
      },
      channels: channels.map((channel) => {
        const item = stats.get(channel.id);

        return {
          id: channel.id,
          updatedAt: channel.updatedAt.toISOString(),
          messagesCount: item?.messagesCount ?? 0,
          unreadCount: item?.unreadCount ?? 0,
          mentionUnreadCount: item?.mentionUnreadCount ?? 0,
          pinnedCount: item?.pinnedCount ?? 0,
          lastMessageAt: item?.lastMessageAt ?? null,
        };
      }),
    };
  }

  async createChannel(user: AuthenticatedUser, dto: StaffChatChannelDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!this.canManageChannels(user.role)) {
      throw new BadRequestException('Channel management is not allowed');
    }

    const data = await this.normalizeChannelData(tenantId, user, dto);
    const memberUserIds =
      data.scope === 'CUSTOM'
        ? await this.resolveChannelMemberUserIds(
            tenantId,
            dto.memberUserIds,
            user.id,
          )
        : [];

    try {
      const channel = await this.prisma.$transaction(async (tx) => {
        const created = await tx.staffChatChannel.create({
          data: {
            ...data,
            tenantId,
            createdByUserId: user.id,
          },
          select: { id: true },
        });

        if (memberUserIds.length > 0) {
          await tx.staffChatChannelMember.createMany({
            data: memberUserIds.map((userId) => ({
              tenantId,
              channelId: created.id,
              userId,
              addedByUserId: user.id,
            })),
            skipDuplicates: true,
          });
        }

        return tx.staffChatChannel.findUniqueOrThrow({
          where: { id: created.id },
          include: channelInclude,
        });
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
    await this.ensureDefaultChannels(tenantId);
    const channel = await this.resolveAccessibleChannel(
      user,
      tenantId,
      dto.channelId,
    );

    if (channel.name === STAFF_CHAT_NOTIFICATION_CHANNEL_NAME) {
      throw new BadRequestException(
        'System notification channel does not accept manual messages',
      );
    }

    const attachmentIds = await this.resolveMessageAttachmentIds(
      tenantId,
      user.id,
      dto.attachmentIds,
    );
    const mentionedUserIds = await this.resolveMentionedUserIds(
      tenantId,
      dto.mentionedUserIds,
    );
    const data = await this.normalizeMessageData(
      tenantId,
      channel,
      dto,
      attachmentIds.length > 0,
    );

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffChatMessage.create({
        data: {
          ...data,
          tenantId,
          channelId: channel.id,
          authorUserId: user.id,
        },
        select: { id: true },
      });

      if (attachmentIds.length > 0) {
        await Promise.all(
          attachmentIds.map((attachmentId) =>
            tx.staffChatMessageAttachment.create({
              data: {
                tenantId,
                messageId: created.id,
                attachmentId,
              },
            }),
          ),
        );
      }

      if (mentionedUserIds.length > 0) {
        await tx.staffChatMention.createMany({
          data: mentionedUserIds.map((mentionedUserId) => ({
            tenantId,
            messageId: created.id,
            mentionedUserId,
          })),
          skipDuplicates: true,
        });

        const notificationUserIds = mentionedUserIds.filter(
          (mentionedUserId) => mentionedUserId !== user.id,
        );

        if (notificationUserIds.length > 0) {
          const authorLabel = user.fullName?.trim() || user.email;

          await tx.staffNotification.createMany({
            data: notificationUserIds.map((targetUserId) => ({
              tenantId,
              storeId: data.storeId ?? channel.storeId ?? null,
              targetUserId,
              sourceType: 'TEAM_CHAT',
              sourceId: created.id,
              severity: 'INFO',
              status: 'OPEN',
              title: `Вас упомянули в чате: ${channel.name}`.slice(0, 240),
              message: [
                `Автор: ${authorLabel}`,
                (data.storeId ?? channel.storeId)
                  ? 'Клуб: канал клуба'
                  : 'Клуб: вся сеть',
                data.body.slice(0, 700),
              ].join('\n'),
              actionLabel: 'Открыть чат',
              actionHref: `/staff/team-chat?channelId=${encodeURIComponent(channel.id)}`,
              dedupeKey: `team-chat:${created.id}:mention:${targetUserId}`,
              metadata: {
                channelId: channel.id,
                mentionedUserId: targetUserId,
                authorUserId: user.id,
              },
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.staffChatMessage.findUniqueOrThrow({
        where: { id: created.id },
        include: messageInclude,
      });
    });

    await this.markMessagesRead(user.id, tenantId, channel.id, [message.id]);

    return this.toMessageResponse(message, user.id);
  }

  async createSystemNotification(
    tenantId: string,
    dto: StaffChatSystemNotificationDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const channelId = await this.ensureNotificationChannel(client, tenantId);
    const severity = dto.severity ?? 'INFO';

    return client.staffChatMessage.create({
      data: {
        tenantId,
        channelId,
        authorUserId: null,
        storeId: dto.storeId ?? null,
        body: this.buildSystemNotificationBody(dto),
        kind: 'ANNOUNCEMENT',
        priority: this.resolveSystemNotificationPriority(severity),
        isPinned: severity === 'CRITICAL',
      },
      select: { id: true },
    });
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
      storeId: this.normalizeOptionalString(query.storeId),
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
        mentionUnreadCount: 0,
        pinnedCount: 0,
        lastMessageAt: null,
      });
    });

    if (channelIds.length === 0) {
      return stats;
    }

    const [
      messageCounts,
      pinnedCounts,
      unreadCounts,
      mentionUnreadCounts,
      latestMessages,
    ] = await Promise.all([
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
          OR: [{ authorUserId: null }, { authorUserId: { not: userId } }],
          readReceipts: { none: { userId } },
        },
        _count: { _all: true },
      }),
      this.prisma.staffChatMention.findMany({
        where: {
          tenantId,
          mentionedUserId: userId,
          message: {
            tenantId,
            channelId: { in: channelIds },
            OR: [{ authorUserId: null }, { authorUserId: { not: userId } }],
            readReceipts: { none: { userId } },
          },
        },
        select: { message: { select: { channelId: true } } },
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

    mentionUnreadCounts.forEach((row) => {
      const item = stats.get(row.message.channelId);
      if (item) {
        item.mentionUnreadCount += 1;
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

  private async ensureNotificationChannel(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
  ) {
    const channel = await client.staffChatChannel.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
        },
      },
      create: {
        tenantId,
        name: STAFF_CHAT_NOTIFICATION_CHANNEL_NAME,
        description: STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
        scope: 'NETWORK',
        isDefault: true,
      },
      update: {
        description: STAFF_CHAT_NOTIFICATION_CHANNEL_DESCRIPTION,
        isDefault: true,
        isArchived: false,
        scope: 'NETWORK',
        storeId: null,
        roleScope: null,
      },
      select: { id: true },
    });

    return channel.id;
  }

  private buildSystemNotificationBody(dto: StaffChatSystemNotificationDto) {
    const lines = [
      this.normalizeRequiredString(dto.title, 'Notification title', 240),
      this.normalizeOptionalString(dto.message, 3200),
      dto.actionLabel && dto.actionHref
        ? `${this.normalizeOptionalString(dto.actionLabel, 80)}: ${this.normalizeOptionalString(dto.actionHref, 500)}`
        : null,
    ];

    return lines.filter(Boolean).join('\n\n').slice(0, 4000);
  }

  private resolveSystemNotificationPriority(
    severity: StaffChatSystemNotificationDto['severity'],
  ): StaffChatMessagePriority {
    if (severity === 'CRITICAL') {
      return 'URGENT';
    }

    if (severity === 'WARNING') {
      return 'HIGH';
    }

    return 'NORMAL';
  }

  private async ensureDefaultChannels(tenantId: string) {
    const stores = await this.prisma.store.findMany({
      where: { tenantId },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    const storeNameCounts = stores.reduce((acc, store) => {
      acc.set(store.name, (acc.get(store.name) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    return this.prisma.$transaction(async (tx) => {
      await tx.staffChatChannel.updateMany({
        where: { tenantId, name: 'Вся сеть', isDefault: true },
        data: { isDefault: false },
      });

      let primaryChannelId: string | null = null;

      for (const defaultChannel of defaultNetworkChannels) {
        const channel = await tx.staffChatChannel.upsert({
          where: {
            tenantId_name: {
              tenantId,
              name: defaultChannel.name,
            },
          },
          create: {
            tenantId,
            name: defaultChannel.name,
            description: defaultChannel.description,
            scope: 'NETWORK',
            isDefault: true,
          },
          update: {
            description: defaultChannel.description,
            isDefault: true,
            isArchived: false,
            scope: 'NETWORK',
            storeId: null,
            roleScope: null,
          },
          select: { id: true },
        });

        if (defaultChannel.name === primaryDefaultChannelName) {
          primaryChannelId = channel.id;
        }
      }

      for (const store of stores) {
        const name = this.buildStoreChannelName(
          store.name,
          (storeNameCounts.get(store.name) ?? 0) > 1 ? store.id : null,
        );
        const description = `Операционный канал клуба ${store.name}.`;
        const existing = await tx.staffChatChannel.findFirst({
          where: {
            tenantId,
            scope: 'STORE',
            storeId: store.id,
            isDefault: true,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.staffChatChannel.update({
            where: { id: existing.id },
            data: {
              name,
              description,
              isDefault: true,
              isArchived: false,
              scope: 'STORE',
              roleScope: null,
            },
          });
          continue;
        }

        await tx.staffChatChannel.upsert({
          where: {
            tenantId_name: {
              tenantId,
              name,
            },
          },
          create: {
            tenantId,
            name,
            description,
            scope: 'STORE',
            storeId: store.id,
            isDefault: true,
          },
          update: {
            description,
            scope: 'STORE',
            storeId: store.id,
            roleScope: null,
            isDefault: true,
            isArchived: false,
          },
          select: { id: true },
        });
      }

      return primaryChannelId;
    });
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
        { scope: 'CUSTOM', members: { some: { userId: user.id } } },
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
      (await this.ensureDefaultChannels(tenantId));

    if (!targetId) {
      throw new NotFoundException('Chat channel not found');
    }

    const channel = await this.prisma.staffChatChannel.findFirst({
      where: {
        AND: [accessWhere, { id: targetId }],
      },
      select: {
        id: true,
        name: true,
        scope: true,
        storeId: true,
        roleScope: true,
      },
    });

    if (!channel) {
      throw new NotFoundException('Chat channel not found');
    }

    return channel;
  }

  private async normalizeChannelData(
    tenantId: string,
    user: AuthenticatedUser,
    dto: StaffChatChannelDto,
  ): Promise<Omit<Prisma.StaffChatChannelUncheckedCreateInput, 'tenantId'>> {
    const name = this.normalizeRequiredString(dto.name, 'Channel name', 80);
    const description = this.normalizeOptionalString(dto.description, 240);
    const scope = this.resolveOne(dto.scope, channelScopes, 'NETWORK');
    const storeId =
      scope === 'STORE'
        ? await this.resolveStoreIdForChannel(tenantId, user, dto.storeId)
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
    hasAttachments = false,
  ): Promise<Omit<Prisma.StaffChatMessageUncheckedCreateInput, 'tenantId'>> {
    const body = hasAttachments
      ? (this.normalizeOptionalString(dto.body, 4000) ?? 'Вложение')
      : this.normalizeRequiredString(dto.body, 'Message text', 4000);
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

  private async resolveMessageAttachmentIds(
    tenantId: string,
    userId: string,
    values: string[] | null | undefined,
  ) {
    const requestedIds = Array.isArray(values)
      ? Array.from(
          new Set(
            values
              .map((value) => this.normalizeOptionalString(value))
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    if (requestedIds.length > STAFF_CHAT_MESSAGE_MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `No more than ${STAFF_CHAT_MESSAGE_MAX_ATTACHMENTS} attachments are allowed`,
      );
    }

    if (requestedIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.staffAttachment.findMany({
      where: {
        tenantId,
        uploadedByUserId: userId,
        id: { in: requestedIds },
      },
      select: { id: true },
    });
    const availableIds = new Set(rows.map((row) => row.id));

    if (requestedIds.some((id) => !availableIds.has(id))) {
      throw new BadRequestException('Attachment is not available');
    }

    return requestedIds;
  }

  private async resolveMentionedUserIds(
    tenantId: string,
    values: string[] | null | undefined,
  ) {
    const requestedIds = Array.isArray(values)
      ? Array.from(
          new Set(
            values
              .map((value) => this.normalizeOptionalString(value))
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    if (requestedIds.length > 20) {
      throw new BadRequestException('No more than 20 mentions are allowed');
    }

    if (requestedIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, id: { in: requestedIds } },
      select: { id: true },
    });
    const availableIds = new Set(rows.map((row) => row.id));

    if (requestedIds.some((id) => !availableIds.has(id))) {
      throw new BadRequestException('Mentioned users must be active users');
    }

    return requestedIds;
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

  private async resolveStoreIdForChannel(
    tenantId: string,
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const storeId = await this.resolveStoreId(tenantId, value);

    if (this.canSeeAllChannels(user.role)) {
      return storeId;
    }

    const userStoreIds = await this.getUserStoreIds(user.id);

    if (userStoreIds.length === 0 || userStoreIds.includes(storeId)) {
      return storeId;
    }

    throw new BadRequestException('Store channel is not available for user');
  }

  private async resolveChannelMemberUserIds(
    tenantId: string,
    values: string[] | null | undefined,
    creatorUserId: string,
  ) {
    const requestedIds = Array.isArray(values)
      ? values
          .map((value) => this.normalizeOptionalString(value))
          .filter((value): value is string => Boolean(value))
      : [];
    const ids = Array.from(new Set([creatorUserId, ...requestedIds]));

    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(users.map((item) => item.id));

    if (ids.some((id) => !foundIds.has(id))) {
      throw new BadRequestException('Channel members must be active users');
    }

    return ids;
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
          UserRole.TRAINEE,
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

  private canManageChannels(role: UserRole) {
    return (
      [
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.CLUB_MANAGER,
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

  private buildStoreChannelName(storeName: string, storeId?: string | null) {
    const suffix = storeId ? ` (${storeId.slice(0, 8)})` : '';
    return this.normalizeRequiredString(
      `Клуб: ${storeName}${suffix}`,
      'Store channel',
      80,
    );
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
      members: channel.members.map((member) => member.user),
      messagesCount: stats?.messagesCount ?? 0,
      unreadCount: stats?.unreadCount ?? 0,
      mentionUnreadCount: stats?.mentionUnreadCount ?? 0,
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
      mentionedMe: message.mentions.some(
        (mention) => mention.mentionedUser.id === userId,
      ),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      authorUser: message.authorUser,
      store: message.store,
      attachments: message.attachments.map(({ attachment }) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
        url: `/staff/attachments/${attachment.id}`,
        createdAt: attachment.createdAt.toISOString(),
        uploadedByUser: attachment.uploadedByUser,
      })),
      mentions: message.mentions.map((mention) => mention.mentionedUser),
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
