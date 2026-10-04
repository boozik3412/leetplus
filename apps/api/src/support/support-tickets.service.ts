import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { GuestSupportTicketStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  hasCapability,
  resolveUserCapabilities,
  type AccessCapability,
} from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { GUEST_BUG_REPORT_TOPICS } from '../guest-portal/guest-support.service';
import {
  SUPPORT_THREAD_ACTION_LIST,
  SUPPORT_THREAD_ACTIONS,
  closeStaleResolvedSupportTickets,
  summarizeSupportThread,
  type SupportThreadSummary,
} from '../guest-portal/guest-support-thread';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import {
  buildSupportGuestRewards,
  supportGuestRewardsSince,
  type SupportTicketGuestRewards,
} from './support-guest-rewards';

export const SUPPORT_TICKET_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportTicketTopic = (typeof GUEST_BUG_REPORT_TOPICS)[number];

// Tickets that still need a support action. The queue view lists them oldest
// first, so the guest who has waited longest is handled first.
export const SUPPORT_TICKET_ACTIVE_STATUSES = [
  'NEW',
  'IN_PROGRESS',
] as const satisfies readonly SupportTicketStatus[];

// 'awaiting' = active tickets where the guest spoke last.
export type SupportTicketStatusFilter =
  | SupportTicketStatus
  | 'active'
  | 'awaiting'
  | 'all';

// Besides a user id, the assignee filter accepts `none` (unassigned) and `me`.
export type SupportTicketAssigneeFilter = 'none' | 'me' | (string & {});

export type SupportTicketsQuery = {
  status?: SupportTicketStatusFilter;
  topic?: SupportTicketTopic | 'all';
  tenantId?: string;
  // Club of the ticket; a guest's game profile spans every club of a network.
  storeId?: string;
  assignedToUserId?: SupportTicketAssigneeFilter;
  search?: string;
  pageSize?: string;
};

export type SupportTicketUpdateDto = {
  status?: SupportTicketStatus;
  assignedToUserId?: string | null;
};

export type SupportTicketCommentDto = {
  body?: string;
  // PUBLIC comments are shown to the guest as "Поддержка LeetPlus".
  visibility?: 'INTERNAL' | 'PUBLIC';
};

export type SupportTicketResolveWithReplyDto = { body?: string };

export type SupportTicketCloseWithCommentDto = {
  tenantId?: string;
  profileId?: string;
  ticketNumber?: string;
  expectedUpdatedAt?: string;
  expectedDescriptionMd5?: string;
  requestId?: string;
  body?: string;
};

type TicketScope =
  | { kind: 'TENANT'; tenantId: string }
  | { kind: 'PLATFORM'; tenantId: string | null };

const assigneeSelection = {
  id: true,
  tenantId: true,
  fullName: true,
  email: true,
  role: true,
  isPlatformAdmin: true,
  customRole: { select: { permissions: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  getTenantTickets(user: AuthenticatedUser, query: SupportTicketsQuery) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getTickets(user, { kind: 'TENANT', tenantId }, query);
  }

  getPlatformTickets(user: AuthenticatedUser, query: SupportTicketsQuery) {
    this.assertSupportSchemaReady();
    const tenantId = normalizeOptionalUuid(query.tenantId, 'tenantId');
    return this.getTickets(user, { kind: 'PLATFORM', tenantId }, query);
  }

  getTenantQueueSummary(user: AuthenticatedUser) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getQueueSummary(user, { kind: 'TENANT', tenantId });
  }

  getPlatformQueueSummary(user: AuthenticatedUser) {
    this.assertSupportSchemaReady();
    return this.getQueueSummary(user, { kind: 'PLATFORM', tenantId: null });
  }

  updateTenantTicket(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketUpdateDto,
  ) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.updateTicket(user, { kind: 'TENANT', tenantId }, id, dto);
  }

  updatePlatformTicket(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketUpdateDto,
  ) {
    this.assertSupportSchemaReady();
    return this.updateTicket(
      user,
      { kind: 'PLATFORM', tenantId: null },
      id,
      dto,
    );
  }

  addTenantComment(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketCommentDto,
  ) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.addComment(user, { kind: 'TENANT', tenantId }, id, dto);
  }

  addPlatformComment(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketCommentDto,
  ) {
    this.assertSupportSchemaReady();
    return this.addComment(user, { kind: 'PLATFORM', tenantId: null }, id, dto);
  }

  resolveTenantTicketWithReply(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketResolveWithReplyDto,
  ) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.resolveWithReply(user, { kind: 'TENANT', tenantId }, id, dto);
  }

  resolvePlatformTicketWithReply(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketResolveWithReplyDto,
  ) {
    this.assertSupportSchemaReady();
    return this.resolveWithReply(
      user,
      { kind: 'PLATFORM', tenantId: null },
      id,
      dto,
    );
  }

  async closePlatformTicketWithComment(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketCloseWithCommentDto,
  ) {
    this.assertSupportSchemaReady();
    const tenantId = requiredUuid(dto.tenantId, 'tenantId');
    const profileId = requiredUuid(dto.profileId, 'profileId');
    const requestId = requiredUuid(dto.requestId, 'requestId');
    const ticketId = requiredUuid(id, 'id');
    const ticketNumber = dto.ticketNumber?.trim() ?? '';
    const body = dto.body?.trim() ?? '';
    const expectedUpdatedAt = parseExpectedDate(dto.expectedUpdatedAt);
    const descriptionMd5 = dto.expectedDescriptionMd5?.toLowerCase() ?? '';
    if (!/^LP-BUG-[0-9A-F]{8}$/.test(ticketNumber)) {
      throw new BadRequestException('Укажите точный номер обращения.');
    }
    if (!/^[0-9a-f]{32}$/.test(descriptionMd5)) {
      throw new BadRequestException(
        'Укажите MD5 исходного описания обращения.',
      );
    }
    if (!body || body.length > 2000) {
      throw new BadRequestException(
        'Комментарий должен содержать от 1 до 2000 символов.',
      );
    }
    const bodySha256 = createHash('sha256').update(body).digest('hex');
    const auditId = operationUuid('support-close-audit', ticketId, requestId);
    const commentId = operationUuid(
      'support-close-comment',
      ticketId,
      requestId,
    );

    return this.prisma.$transaction(async (tx) => {
      const previousAudit = await tx.guestSupportTicketAuditEvent.findUnique({
        where: { id: auditId },
        select: {
          tenantId: true,
          ticketId: true,
          actorUserId: true,
          action: true,
          metadata: true,
        },
      });
      if (previousAudit) {
        const metadata = previousAudit.metadata as Record<
          string,
          unknown
        > | null;
        const comment = await tx.guestSupportTicketComment.findUnique({
          where: { id: commentId },
          select: {
            tenantId: true,
            ticketId: true,
            authorUserId: true,
            body: true,
          },
        });
        const ticket = await tx.guestSupportTicket.findFirst({
          where: {
            id: ticketId,
            tenantId,
            profileId,
            ticketNumber,
            status: 'CLOSED',
          },
          select: {
            id: true,
            ticketNumber: true,
            status: true,
            updatedAt: true,
          },
        });
        if (
          previousAudit.tenantId === tenantId &&
          previousAudit.ticketId === ticketId &&
          previousAudit.actorUserId === user.id &&
          previousAudit.action === 'CLOSED_WITH_COMMENT' &&
          metadata?.requestId === requestId &&
          metadata?.expectedUpdatedAt === expectedUpdatedAt.toISOString() &&
          metadata?.expectedDescriptionMd5 === descriptionMd5 &&
          metadata?.bodySha256 === bodySha256 &&
          comment?.tenantId === tenantId &&
          comment.ticketId === ticketId &&
          comment.authorUserId === user.id &&
          comment.body === body &&
          ticket
        ) {
          return { ...ticket, commentId, auditId, replayed: true };
        }
        throw new ConflictException(
          'Повтор операции не совпадает с сохранённым результатом.',
        );
      }

      const ticket = await tx.guestSupportTicket.findFirst({
        where: { id: ticketId, tenantId, profileId, ticketNumber },
        select: { id: true, description: true, status: true, updatedAt: true },
      });
      if (!ticket) throw new NotFoundException('Обращение не найдено.');
      if (
        ticket.status !== 'NEW' ||
        ticket.updatedAt.getTime() !== expectedUpdatedAt.getTime() ||
        createHash('md5').update(ticket.description).digest('hex') !==
          descriptionMd5
      ) {
        throw new ConflictException(
          'Обращение изменилось после проверки. Обновите данные.',
        );
      }

      const now = new Date();
      const updated = await tx.guestSupportTicket.updateMany({
        where: {
          id: ticketId,
          tenantId,
          profileId,
          ticketNumber,
          status: 'NEW',
          updatedAt: expectedUpdatedAt,
        },
        data: {
          status: 'CLOSED',
          resolvedAt: null,
          closedAt: now,
          lastActivityAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Обращение изменилось одновременно с закрытием.',
        );
      }
      await tx.guestSupportTicketComment.create({
        data: {
          id: commentId,
          tenantId,
          ticketId,
          authorUserId: user.id,
          body,
        },
      });
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          id: auditId,
          tenantId,
          ticketId,
          actorUserId: user.id,
          action: 'CLOSED_WITH_COMMENT',
          metadata: {
            requestId,
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            expectedDescriptionMd5: descriptionMd5,
            bodySha256,
            previousStatus: 'NEW',
            status: 'CLOSED',
            platformScope: true,
            commentId,
          },
        },
      });
      const result = await tx.guestSupportTicket.findFirstOrThrow({
        where: { id: ticketId, tenantId, profileId, status: 'CLOSED' },
        select: { id: true, ticketNumber: true, status: true, updatedAt: true },
      });
      return { ...result, commentId, auditId, replayed: false };
    });
  }

  getTenantAttachment(
    user: AuthenticatedUser,
    ticketId: string,
    attachmentId: string,
  ) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getAttachment(
      { kind: 'TENANT', tenantId },
      ticketId,
      attachmentId,
    );
  }

  getTenantTicketGuestRewards(user: AuthenticatedUser, id: string) {
    this.assertSupportSchemaReady();
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getGuestRewards({ kind: 'TENANT', tenantId }, id);
  }

  getPlatformTicketGuestRewards(id: string) {
    this.assertSupportSchemaReady();
    return this.getGuestRewards({ kind: 'PLATFORM', tenantId: null }, id);
  }

  getPlatformAttachment(ticketId: string, attachmentId: string) {
    this.assertSupportSchemaReady();
    return this.getAttachment(
      { kind: 'PLATFORM', tenantId: null },
      ticketId,
      attachmentId,
    );
  }

  private assertSupportSchemaReady() {
    if (
      this.configService
        .get<string>('GUEST_SUPPORT_SCHEMA_BRIDGE_MODE')
        ?.trim()
        .toUpperCase() === 'ALLOW_CURRENT_187'
    ) {
      throw new NotFoundException('Раздел поддержки временно недоступен.');
    }
  }

  private async getTickets(
    user: AuthenticatedUser,
    scope: TicketScope,
    query: SupportTicketsQuery,
  ) {
    const filters = normalizeFilters(query);
    const tenantId = scopeTenantId(scope);
    const summaryWhere: Prisma.GuestSupportTicketWhereInput = tenantId
      ? { tenantId }
      : {};
    await closeStaleResolvedSupportTickets(
      this.prisma,
      tenantId ? { tenantId } : {},
      new Date(),
    );
    const awaitingIds =
      filters.status === 'awaiting'
        ? await this.awaitingStaffTicketIds(summaryWhere)
        : null;
    const where: Prisma.GuestSupportTicketWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...statusWhere(filters.status),
      ...(awaitingIds ? { id: { in: awaitingIds } } : {}),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.topic === 'all' ? {} : { topic: filters.topic }),
      ...assigneeWhere(filters.assignedToUserId, user.id),
      ...(filters.search
        ? {
            OR: [
              {
                ticketNumber: { contains: filters.search, mode: 'insensitive' },
              },
              {
                description: { contains: filters.search, mode: 'insensitive' },
              },
              {
                profile: {
                  displayName: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                profile: {
                  contactMasked: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                store: {
                  name: { contains: filters.search, mode: 'insensitive' },
                },
              },
              {
                tenant: {
                  name: { contains: filters.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, summaryRows, queue, tenants, stores] = await Promise.all([
      this.prisma.guestSupportTicket.findMany({
        where,
        orderBy: isQueueView(filters.status)
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ lastActivityAt: 'desc' }, { id: 'desc' }],
        take: filters.pageSize,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          store: { select: { id: true, name: true } },
          profile: {
            select: {
              id: true,
              displayName: true,
              contactMasked: true,
              phoneEncrypted: true,
              guest: {
                select: {
                  fullNameMasked: true,
                  fullNameEncrypted: true,
                  phoneMasked: true,
                  phoneEncrypted: true,
                },
              },
            },
          },
          guest: {
            select: {
              fullNameMasked: true,
              fullNameEncrypted: true,
              phoneMasked: true,
              phoneEncrypted: true,
            },
          },
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
          attachments: {
            where: { state: 'AVAILABLE' },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              fileName: true,
              contentType: true,
              byteSize: true,
            },
          },
          comments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              body: true,
              createdAt: true,
              authorUser: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
          auditEvents: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              action: true,
              metadata: true,
              createdAt: true,
              actorUser: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
        },
      }),
      this.prisma.guestSupportTicket.groupBy({
        by: ['status'],
        where: summaryWhere,
        _count: { _all: true },
      }),
      this.getActiveQueueFacts(summaryWhere, user.id),
      scope.kind === 'PLATFORM'
        ? this.prisma.tenant.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true },
          })
        : Promise.resolve([]),
      this.ticketStores(summaryWhere),
    ]);

    // Without a network filter the platform view offers the specialists of
    // every network on the page, so a ticket can go to its own club team.
    const assigneeTenantIds =
      scope.kind === 'TENANT'
        ? [scope.tenantId]
        : tenantId
          ? [tenantId]
          : [...new Set(rows.map((row) => row.tenantId))];
    const [users, threads, reportedFrom] = await Promise.all([
      this.getAssigneeCandidates(scope, assigneeTenantIds),
      this.threadSummaries(rows.map((row) => row.id)),
      this.reportedFromStores(rows),
    ]);
    const counts = countByStatus(summaryRows);

    return {
      scope: scope.kind,
      filters,
      statuses: SUPPORT_TICKET_STATUSES,
      topics: GUEST_BUG_REPORT_TOPICS,
      summary: {
        ...counts,
        active: counts.NEW + counts.IN_PROGRESS,
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        unassigned: queue.unassigned,
        mine: queue.mine,
        awaitingStaff: queue.awaitingStaff,
        oldestActiveCreatedAt: queue.oldestActiveCreatedAt,
      },
      tenants,
      stores,
      users,
      rows: rows.map((row) => ({
        ...projectGuestThread(
          this.projectTicketContact(row),
          threads.get(row.id),
        ),
        reportedFromStore: reportedFrom.get(row.id) ?? null,
      })),
    };
  }

  // Clubs that have tickets in the current scope, for the club filter.
  private async ticketStores(where: Prisma.GuestSupportTicketWhereInput) {
    const groups = await this.prisma.guestSupportTicket.groupBy({
      by: ['storeId'],
      where,
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const group of groups as Array<{
      storeId?: string;
      _count?: { _all?: number };
    }>) {
      if (group.storeId) {
        counts.set(group.storeId, group._count?._all ?? 0);
      }
    }
    if (!counts.size) return [];
    const stores = await this.prisma.store.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: { id: true, name: true, tenant: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return stores.map((store) => ({
      id: store.id,
      name: store.name,
      tenantName: store.tenant.name,
      tickets: counts.get(store.id) ?? 0,
    }));
  }

  // The guest picks the club the problem is about; when it differs from the
  // club selected in the game module, the card says where it was sent from.
  private async reportedFromStores(
    rows: Array<{ id: string; tenantId: string; storeId: string }>,
  ) {
    const result = new Map<string, { id: string; name: string }>();
    if (!rows.length) return result;
    const events = await this.prisma.guestSupportTicketAuditEvent.findMany({
      where: {
        ticketId: { in: rows.map((row) => row.id) },
        action: 'CREATED_BY_GUEST',
      },
      select: { ticketId: true, metadata: true },
    });
    const fromByTicket = new Map<string, string>();
    for (const event of events) {
      const metadata =
        event.metadata &&
        typeof event.metadata === 'object' &&
        !Array.isArray(event.metadata)
          ? event.metadata
          : {};
      const from = metadata.reportedFromStoreId;
      const row = rows.find((item) => item.id === event.ticketId);
      if (typeof from === 'string' && row && from !== row.storeId) {
        fromByTicket.set(event.ticketId, from);
      }
    }
    if (!fromByTicket.size) return result;
    const stores = await this.prisma.store.findMany({
      where: { id: { in: [...new Set(fromByTicket.values())] } },
      select: { id: true, name: true, tenantId: true },
    });
    for (const [ticketId, storeId] of fromByTicket) {
      const row = rows.find((item) => item.id === ticketId);
      const store = stores.find(
        (item) => item.id === storeId && item.tenantId === row?.tenantId,
      );
      if (store) result.set(ticketId, { id: store.id, name: store.name });
    }
    return result;
  }

  private async getGuestRewards(
    scope: TicketScope,
    id: string,
  ): Promise<SupportTicketGuestRewards> {
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: {
        id,
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        profileId: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }
    const wallet = await this.prisma.guestGameRewardWalletItem.findMany({
      where: {
        tenantId: ticket.tenantId,
        profileId: ticket.profileId,
        createdAt: { gte: supportGuestRewardsSince(ticket.createdAt) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
      select: {
        id: true,
        storeId: true,
        kind: true,
        sourceKind: true,
        title: true,
        rewardLabel: true,
        status: true,
        createdAt: true,
        claimedAt: true,
        expiresAt: true,
        reward: {
          select: { status: true, rewardAmount: true, paidAt: true },
        },
      },
    });
    const otherStoreIds = [
      ...new Set(
        wallet
          .map((item) => item.storeId)
          .filter(
            (storeId): storeId is string =>
              Boolean(storeId) && storeId !== ticket.store.id,
          ),
      ),
    ];
    const stores = otherStoreIds.length
      ? await this.prisma.store.findMany({
          where: { tenantId: ticket.tenantId, id: { in: otherStoreIds } },
          select: { id: true, name: true },
        })
      : [];
    return buildSupportGuestRewards({
      ticket,
      wallet,
      storeNames: new Map(stores.map((store) => [store.id, store.name])),
      now: new Date(),
    });
  }

  private async getQueueSummary(user: AuthenticatedUser, scope: TicketScope) {
    const tenantId = scopeTenantId(scope);
    const where: Prisma.GuestSupportTicketWhereInput = tenantId
      ? { tenantId }
      : {};
    await closeStaleResolvedSupportTickets(
      this.prisma,
      tenantId ? { tenantId } : {},
      new Date(),
    );
    const [statusRows, queue, latestNew] = await Promise.all([
      this.prisma.guestSupportTicket.groupBy({
        by: ['status'],
        where: {
          ...where,
          status: { in: [...SUPPORT_TICKET_ACTIVE_STATUSES] },
        },
        _count: { _all: true },
      }),
      this.getActiveQueueFacts(where, user.id),
      this.prisma.guestSupportTicket.findFirst({
        where: { ...where, status: 'NEW' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          ticketNumber: true,
          topic: true,
          createdAt: true,
          store: { select: { name: true } },
          tenant: { select: { name: true } },
        },
      }),
    ]);
    const counts = countByStatus(statusRows);

    return {
      scope: scope.kind,
      NEW: counts.NEW,
      IN_PROGRESS: counts.IN_PROGRESS,
      active: counts.NEW + counts.IN_PROGRESS,
      unassigned: queue.unassigned,
      mine: queue.mine,
      awaitingStaff: queue.awaitingStaff,
      oldestActiveCreatedAt: queue.oldestActiveCreatedAt,
      latestNew: latestNew
        ? {
            id: latestNew.id,
            ticketNumber: latestNew.ticketNumber,
            topic: latestNew.topic,
            createdAt: latestNew.createdAt.toISOString(),
            storeName: latestNew.store.name,
            tenantName: latestNew.tenant.name,
          }
        : null,
    };
  }

  private async getActiveQueueFacts(
    where: Prisma.GuestSupportTicketWhereInput,
    userId: string,
  ) {
    const active: Prisma.GuestSupportTicketWhereInput = {
      ...where,
      status: { in: [...SUPPORT_TICKET_ACTIVE_STATUSES] },
    };
    const [unassigned, mine, oldest, awaiting] = await Promise.all([
      this.prisma.guestSupportTicket.count({
        where: { ...active, assignedToUserId: null },
      }),
      this.prisma.guestSupportTicket.count({
        where: { ...active, assignedToUserId: userId },
      }),
      this.prisma.guestSupportTicket.findFirst({
        where: active,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true },
      }),
      this.awaitingStaffTicketIds(where),
    ]);
    return {
      unassigned,
      mine,
      awaitingStaff: awaiting.length,
      oldestActiveCreatedAt: oldest?.createdAt.toISOString() ?? null,
    };
  }

  // Active tickets whose last word in the guest conversation is the guest's
  // (a message or "did not help") and that nobody has answered yet.
  private async awaitingStaffTicketIds(
    where: Prisma.GuestSupportTicketWhereInput,
  ) {
    const active = await this.prisma.guestSupportTicket.findMany({
      where: { ...where, status: { in: [...SUPPORT_TICKET_ACTIVE_STATUSES] } },
      select: { id: true },
      take: 500,
    });
    const threads = await this.threadSummaries(active.map((row) => row.id));
    return active
      .map((row) => row.id)
      .filter((id) => threads.get(id)?.awaitingStaff);
  }

  private async threadSummaries(ticketIds: string[]) {
    const summaries = new Map<string, SupportThreadSummary>();
    if (!ticketIds.length) return summaries;
    const events = await this.prisma.guestSupportTicketAuditEvent.findMany({
      where: {
        ticketId: { in: ticketIds },
        action: { in: [...SUPPORT_THREAD_ACTION_LIST] },
      },
      select: { ticketId: true, action: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const grouped = new Map<string, typeof events>();
    for (const event of events) {
      grouped.set(event.ticketId, [
        ...(grouped.get(event.ticketId) ?? []),
        event,
      ]);
    }
    for (const id of ticketIds) {
      summaries.set(id, summarizeSupportThread(grouped.get(id) ?? []));
    }
    return summaries;
  }

  private async getAssigneeCandidates(scope: TicketScope, tenantIds: string[]) {
    const [candidateUsers, roleOverrides] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          ...(scope.kind === 'TENANT'
            ? { tenantId: scope.tenantId }
            : {
                OR: [
                  { isPlatformAdmin: true },
                  ...(tenantIds.length
                    ? [{ tenantId: { in: tenantIds } }]
                    : []),
                ],
              }),
        },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
        select: assigneeSelection,
      }),
      this.prisma.userRoleOverride.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, role: true, permissions: true },
      }),
    ]);

    const overrideMap = new Map(
      roleOverrides.map((override) => [
        `${override.tenantId}:${override.role}`,
        override.permissions,
      ]),
    );
    return candidateUsers
      .filter((candidate) =>
        canManageSupportCandidate(
          candidate,
          overrideMap.get(`${candidate.tenantId}:${candidate.role}`) ?? null,
        ),
      )
      .map((candidate) => ({
        id: candidate.id,
        tenantId: candidate.tenantId,
        fullName: candidate.fullName,
        email: candidate.email,
        isPlatformAdmin: candidate.isPlatformAdmin,
      }));
  }

  private projectTicketContact<
    T extends {
      guest: {
        fullNameMasked: string | null;
        fullNameEncrypted: string | null;
        phoneMasked: string | null;
        phoneEncrypted: string | null;
      } | null;
      profile: {
        id: string;
        displayName: string | null;
        contactMasked: string | null;
        phoneEncrypted: string | null;
        guest: {
          fullNameMasked: string | null;
          fullNameEncrypted: string | null;
          phoneMasked: string | null;
          phoneEncrypted: string | null;
        } | null;
      };
    },
  >(row: T) {
    const { guest: ticketGuest, profile: sourceProfile, ...ticket } = row;
    const {
      phoneEncrypted: profilePhoneEncrypted,
      guest: currentProfileGuest,
      ...profile
    } = sourceProfile;
    const guest = ticketGuest ?? currentProfileGuest;

    return {
      ...ticket,
      profile: {
        ...profile,
        fullName:
          this.decryptPii(guest?.fullNameEncrypted) ??
          guest?.fullNameMasked ??
          profile.displayName,
        phone:
          this.decryptPii(profilePhoneEncrypted) ??
          this.decryptPii(guest?.phoneEncrypted) ??
          profile.contactMasked ??
          guest?.phoneMasked ??
          null,
      },
    };
  }

  private decryptPii(value: string | null | undefined) {
    if (!value) return null;

    try {
      return this.secretEncryptionService.decrypt(value, 'pii').trim() || null;
    } catch {
      // A damaged legacy value must not make the whole support queue unavailable.
      return null;
    }
  }

  private async updateTicket(
    user: AuthenticatedUser,
    scope: TicketScope,
    id: string,
    dto: SupportTicketUpdateDto,
  ) {
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: {
        id,
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        ticketNumber: true,
        status: true,
        assignedToUserId: true,
        updatedAt: true,
      },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }

    const status =
      dto.status === undefined ? undefined : normalizeStatus(dto.status);
    if (status === undefined && dto.assignedToUserId === undefined) {
      throw new BadRequestException('Не указаны изменения обращения.');
    }

    const statusChanged = status !== undefined && status !== ticket.status;
    const assigneeChanged =
      dto.assignedToUserId !== undefined &&
      dto.assignedToUserId !== ticket.assignedToUserId;
    if (!statusChanged && !assigneeChanged) {
      // Re-selecting the current value must not reset resolvedAt/closedAt or
      // add an empty audit event.
      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        assignedToUserId: ticket.assignedToUserId,
        updatedAt: ticket.updatedAt,
      };
    }
    if (assigneeChanged && dto.assignedToUserId) {
      await this.assertValidAssignee(
        ticket.tenantId,
        dto.assignedToUserId,
        scope.kind === 'PLATFORM',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set against the values read above: when two specialists
      // take the same ticket at once, the second one gets a conflict instead
      // of silently overwriting the first.
      const changed = await tx.guestSupportTicket.updateMany({
        where: {
          id: ticket.id,
          tenantId: ticket.tenantId,
          status: ticket.status,
          assignedToUserId: ticket.assignedToUserId,
        },
        data: {
          ...(statusChanged && status ? statusTimestamps(status, now) : {}),
          ...(assigneeChanged
            ? { assignedToUserId: dto.assignedToUserId }
            : {}),
          lastActivityAt: now,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Обращение уже изменил другой сотрудник. Обновите страницу.',
        );
      }
      const updated = await tx.guestSupportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          assignedToUserId: true,
          updatedAt: true,
        },
      });
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: user.id,
          action: 'UPDATED_BY_SUPPORT',
          metadata: {
            previousStatus: ticket.status,
            status: updated.status,
            previousAssignedToUserId: ticket.assignedToUserId,
            assignedToUserId: updated.assignedToUserId,
            platformScope: scope.kind === 'PLATFORM',
          },
        },
      });
      return updated;
    });
  }

  private async addComment(
    user: AuthenticatedUser,
    scope: TicketScope,
    id: string,
    dto: SupportTicketCommentDto,
  ) {
    const body = supportCommentBody(dto.body);
    if (
      dto.visibility !== undefined &&
      dto.visibility !== 'INTERNAL' &&
      dto.visibility !== 'PUBLIC'
    ) {
      throw new BadRequestException('Некорректная видимость комментария.');
    }
    const isPublic = dto.visibility === 'PUBLIC';
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: {
        id,
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: { id: true, tenantId: true, status: true, updatedAt: true },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.guestSupportTicketComment.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          authorUserId: user.id,
          body,
          createdAt: now,
        },
        select: commentSelection,
      });
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: user.id,
          action: 'COMMENT_ADDED',
          metadata: {
            platformScope: scope.kind === 'PLATFORM',
            visibility: isPublic ? 'PUBLIC' : 'INTERNAL',
          },
          createdAt: now,
        },
      });
      if (!isPublic) {
        await tx.guestSupportTicket.update({
          where: { id: ticket.id },
          data: { lastActivityAt: now },
        });
        return { ...comment, visibility: 'INTERNAL' as const };
      }

      await this.publishReply(
        tx,
        user,
        scope,
        ticket.tenantId,
        ticket.id,
        comment.id,
        now,
      );
      // Answering the guest means the ticket is being handled.
      const takeInWork = ticket.status === 'NEW';
      await tx.guestSupportTicket.updateMany({
        where: { id: ticket.id, tenantId: ticket.tenantId },
        data: {
          lastActivityAt: now,
          ...(takeInWork ? statusTimestamps('IN_PROGRESS', now) : {}),
        },
      });
      if (takeInWork) {
        await tx.guestSupportTicketAuditEvent.create({
          data: {
            tenantId: ticket.tenantId,
            ticketId: ticket.id,
            actorUserId: user.id,
            action: 'UPDATED_BY_SUPPORT',
            metadata: {
              previousStatus: 'NEW',
              status: 'IN_PROGRESS',
              platformScope: scope.kind === 'PLATFORM',
              reason: 'PUBLIC_REPLY',
            },
            createdAt: now,
          },
        });
      }
      return { ...comment, visibility: 'PUBLIC' as const };
    });
  }

  private async resolveWithReply(
    user: AuthenticatedUser,
    scope: TicketScope,
    id: string,
    dto: SupportTicketResolveWithReplyDto,
  ) {
    const body = supportCommentBody(dto.body);
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: {
        id,
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        ticketNumber: true,
        status: true,
        assignedToUserId: true,
        updatedAt: true,
      },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }
    if (ticket.status !== 'NEW' && ticket.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Обращение уже решено или закрыто. Ответьте гостю обычным ответом.',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.guestSupportTicket.updateMany({
        where: {
          id: ticket.id,
          tenantId: ticket.tenantId,
          status: ticket.status,
          updatedAt: ticket.updatedAt,
        },
        data: { ...statusTimestamps('RESOLVED', now), lastActivityAt: now },
      });
      if (resolved.count !== 1) {
        throw new ConflictException(
          'Обращение уже изменил другой сотрудник. Обновите страницу.',
        );
      }
      const comment = await tx.guestSupportTicketComment.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          authorUserId: user.id,
          body,
          createdAt: now,
        },
        select: commentSelection,
      });
      await this.publishReply(
        tx,
        user,
        scope,
        ticket.tenantId,
        ticket.id,
        comment.id,
        now,
      );
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: user.id,
          action: 'UPDATED_BY_SUPPORT',
          metadata: {
            previousStatus: ticket.status,
            status: 'RESOLVED',
            previousAssignedToUserId: ticket.assignedToUserId,
            assignedToUserId: ticket.assignedToUserId,
            platformScope: scope.kind === 'PLATFORM',
            reason: 'RESOLVED_WITH_REPLY',
          },
          createdAt: now,
        },
      });
      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: 'RESOLVED' as const,
        comment: { ...comment, visibility: 'PUBLIC' as const },
      };
    });
  }

  private async publishReply(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    scope: TicketScope,
    tenantId: string,
    ticketId: string,
    commentId: string,
    now: Date,
  ) {
    await tx.guestSupportTicketAuditEvent.create({
      data: {
        tenantId,
        ticketId,
        actorUserId: user.id,
        action: SUPPORT_THREAD_ACTIONS.PUBLIC_REPLY,
        metadata: { commentId, platformScope: scope.kind === 'PLATFORM' },
        createdAt: now,
      },
    });
  }

  private async getAttachment(
    scope: TicketScope,
    ticketId: string,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.guestSupportAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        state: 'AVAILABLE',
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        fileName: true,
        contentType: true,
        byteSize: true,
        data: true,
      },
    });
    if (!attachment) {
      throw new NotFoundException('Вложение не найдено.');
    }
    return {
      ...attachment,
      data: Buffer.from(attachment.data),
    };
  }

  private async assertValidAssignee(
    tenantId: string,
    userId: string,
    platformScope: boolean,
  ) {
    const candidate = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        ...(platformScope
          ? { OR: [{ tenantId }, { isPlatformAdmin: true }] }
          : { tenantId }),
      },
      select: assigneeSelection,
    });

    const override =
      candidate && !candidate.isPlatformAdmin && !candidate.customRole
        ? await this.prisma.userRoleOverride.findUnique({
            where: {
              tenantId_role: { tenantId, role: candidate.role },
            },
            select: { permissions: true },
          })
        : null;
    if (
      !candidate ||
      !canManageSupportCandidate(
        candidate,
        candidate.tenantId === tenantId
          ? (override?.permissions ?? null)
          : null,
      )
    ) {
      throw new BadRequestException(
        'Ответственный не найден или не имеет доступа.',
      );
    }
  }
}

const commentSelection = {
  id: true,
  body: true,
  createdAt: true,
  authorUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.GuestSupportTicketCommentSelect;

function supportCommentBody(value: unknown) {
  const body = typeof value === 'string' ? value.trim() : '';
  if (!body || body.length > 2000) {
    throw new BadRequestException(
      'Комментарий должен содержать от 1 до 2000 символов.',
    );
  }
  return body;
}

// Staff see every comment; this only labels which ones the guest sees and
// what the guest did with the answer.
function projectGuestThread<T extends { comments: Array<{ id: string }> }>(
  row: T,
  thread: SupportThreadSummary | undefined,
) {
  return {
    ...row,
    comments: row.comments.map((comment) => ({
      ...comment,
      visibility: thread?.publicCommentIds.has(comment.id)
        ? ('PUBLIC' as const)
        : thread?.guestCommentIds.has(comment.id)
          ? ('GUEST' as const)
          : ('INTERNAL' as const),
    })),
    guestThread: {
      awaitingStaff: thread?.awaitingStaff ?? false,
      unreadByGuest: thread?.unread ?? false,
      lastPublicReplyAt: thread?.lastPublicReplyAt?.toISOString() ?? null,
      lastGuestReadAt: thread?.lastGuestReadAt?.toISOString() ?? null,
      feedback: thread?.feedback
        ? {
            value: thread.feedback.value,
            comment: thread.feedback.comment,
            at: thread.feedback.at.toISOString(),
          }
        : null,
    },
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeFilters(query: SupportTicketsQuery) {
  const status: SupportTicketStatusFilter =
    query.status &&
    (query.status === 'all' ||
      query.status === 'active' ||
      query.status === 'awaiting' ||
      SUPPORT_TICKET_STATUSES.includes(query.status))
      ? query.status
      : 'all';
  const topic =
    query.topic &&
    (query.topic === 'all' || GUEST_BUG_REPORT_TOPICS.includes(query.topic))
      ? query.topic
      : 'all';
  const pageSize = Math.min(
    Math.max(Number.parseInt(query.pageSize ?? '100', 10) || 100, 1),
    200,
  );
  const storeId = query.storeId?.trim() ?? '';
  return {
    status,
    topic,
    tenantId: query.tenantId?.trim() || null,
    storeId: UUID_PATTERN.test(storeId) ? storeId : null,
    assignedToUserId: query.assignedToUserId?.trim() || null,
    search: query.search?.trim().slice(0, 200) || null,
    pageSize,
  };
}

function scopeTenantId(scope: TicketScope) {
  return scope.kind === 'TENANT'
    ? scope.tenantId
    : (scope.tenantId ?? undefined);
}

function statusWhere(
  status: SupportTicketStatusFilter,
): Prisma.GuestSupportTicketWhereInput {
  if (status === 'all') return {};
  if (status === 'active' || status === 'awaiting') {
    return { status: { in: [...SUPPORT_TICKET_ACTIVE_STATUSES] } };
  }
  return { status };
}

function isQueueView(status: SupportTicketStatusFilter) {
  return (
    status === 'active' ||
    status === 'awaiting' ||
    SUPPORT_TICKET_ACTIVE_STATUSES.some((active) => active === status)
  );
}

function assigneeWhere(
  filter: string | null,
  currentUserId: string,
): Prisma.GuestSupportTicketWhereInput {
  if (!filter) return {};
  if (filter === 'none') return { assignedToUserId: null };
  if (filter === 'me') return { assignedToUserId: currentUserId };
  return { assignedToUserId: filter };
}

function countByStatus(
  rows: ReadonlyArray<{
    status: GuestSupportTicketStatus;
    _count: { _all: number };
  }>,
) {
  const counts = Object.fromEntries(
    SUPPORT_TICKET_STATUSES.map((status) => [status, 0]),
  ) as Record<SupportTicketStatus, number>;
  for (const row of rows) {
    if (SUPPORT_TICKET_STATUSES.includes(row.status)) {
      counts[row.status] = row._count._all;
    }
  }
  return counts;
}

function normalizeStatus(value: string): GuestSupportTicketStatus {
  if (!SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)) {
    throw new BadRequestException('Некорректный статус обращения.');
  }
  return value as GuestSupportTicketStatus;
}

function normalizeOptionalUuid(value: string | undefined, label: string) {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new BadRequestException(`Некорректный параметр ${label}.`);
  }
  return normalized;
}

function requiredUuid(value: string | undefined, label: string) {
  const uuid = normalizeOptionalUuid(value, label);
  if (!uuid) throw new BadRequestException(`Укажите параметр ${label}.`);
  return uuid;
}

function parseExpectedDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new BadRequestException('Укажите точный expectedUpdatedAt в UTC.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new BadRequestException('Некорректный expectedUpdatedAt.');
  }
  return date;
}

function operationUuid(kind: string, resourceId: string, requestId: string) {
  const hex = createHash('sha256')
    .update(`${kind}:${resourceId}:${requestId}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function statusTimestamps(status: GuestSupportTicketStatus, now: Date) {
  if (status === 'RESOLVED') {
    return { status, resolvedAt: now, closedAt: null };
  }
  if (status === 'CLOSED') {
    return { status, resolvedAt: null, closedAt: now };
  }
  return { status, resolvedAt: null, closedAt: null };
}

function canManageSupportCandidate(
  candidate: Prisma.UserGetPayload<{ select: typeof assigneeSelection }>,
  roleOverridePermissions: readonly string[] | null,
) {
  if (candidate.isPlatformAdmin) return true;
  // Same resolution as the request guard: OWNER/ADMIN keep the support
  // minimum even with a custom role or a tenant role override.
  const permissions = resolveUserCapabilities({
    role: candidate.role,
    customRole: candidate.customRole,
    roleOverride: roleOverridePermissions
      ? { permissions: [...roleOverridePermissions] }
      : null,
  });
  return hasCapability(
    { permissions },
    'manage_support_tickets' satisfies AccessCapability,
  );
}
