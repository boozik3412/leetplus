import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuestSupportTicketStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { roleCapabilities, type AccessCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { GUEST_BUG_REPORT_TOPICS } from '../guest-portal/guest-support.service';

export const SUPPORT_TICKET_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportTicketTopic = (typeof GUEST_BUG_REPORT_TOPICS)[number];

export type SupportTicketsQuery = {
  status?: SupportTicketStatus | 'all';
  topic?: SupportTicketTopic | 'all';
  tenantId?: string;
  assignedToUserId?: string;
  search?: string;
  pageSize?: string;
};

export type SupportTicketUpdateDto = {
  status?: SupportTicketStatus;
  assignedToUserId?: string | null;
};

export type SupportTicketCommentDto = { body?: string };

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
  ) {}

  getTenantTickets(user: AuthenticatedUser, query: SupportTicketsQuery) {
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getTickets({ kind: 'TENANT', tenantId }, query);
  }

  getPlatformTickets(query: SupportTicketsQuery) {
    const tenantId = normalizeOptionalUuid(query.tenantId, 'tenantId');
    return this.getTickets({ kind: 'PLATFORM', tenantId }, query);
  }

  updateTenantTicket(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketUpdateDto,
  ) {
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.updateTicket(user, { kind: 'TENANT', tenantId }, id, dto);
  }

  updatePlatformTicket(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketUpdateDto,
  ) {
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
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.addComment(user, { kind: 'TENANT', tenantId }, id, dto);
  }

  addPlatformComment(
    user: AuthenticatedUser,
    id: string,
    dto: SupportTicketCommentDto,
  ) {
    return this.addComment(user, { kind: 'PLATFORM', tenantId: null }, id, dto);
  }

  getTenantAttachment(
    user: AuthenticatedUser,
    ticketId: string,
    attachmentId: string,
  ) {
    const { tenantId } = this.tenantContextService.resolve(user);
    return this.getAttachment(
      { kind: 'TENANT', tenantId },
      ticketId,
      attachmentId,
    );
  }

  getPlatformAttachment(ticketId: string, attachmentId: string) {
    return this.getAttachment(
      { kind: 'PLATFORM', tenantId: null },
      ticketId,
      attachmentId,
    );
  }

  private async getTickets(scope: TicketScope, query: SupportTicketsQuery) {
    const filters = normalizeFilters(query);
    const tenantId =
      scope.kind === 'TENANT' ? scope.tenantId : (scope.tenantId ?? undefined);
    const where: Prisma.GuestSupportTicketWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.status === 'all' ? {} : { status: filters.status }),
      ...(filters.topic === 'all' ? {} : { topic: filters.topic }),
      ...(filters.assignedToUserId
        ? { assignedToUserId: filters.assignedToUserId }
        : {}),
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

    const summaryWhere: Prisma.GuestSupportTicketWhereInput = tenantId
      ? { tenantId }
      : {};
    const [rows, summaryRows, candidateUsers, roleOverrides, tenants] =
      await Promise.all([
        this.prisma.guestSupportTicket.findMany({
          where,
          orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
          take: filters.pageSize,
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
            store: { select: { id: true, name: true } },
            profile: {
              select: { id: true, displayName: true, contactMasked: true },
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
        this.prisma.user.findMany({
          where: {
            isActive: true,
            ...(scope.kind === 'TENANT'
              ? { tenantId: scope.tenantId }
              : {
                  OR: [
                    { isPlatformAdmin: true },
                    ...(tenantId ? [{ tenantId }] : []),
                  ],
                }),
          },
          orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
          select: assigneeSelection,
        }),
        this.prisma.userRoleOverride.findMany({
          where: tenantId ? { tenantId } : undefined,
          select: { tenantId: true, role: true, permissions: true },
        }),
        scope.kind === 'PLATFORM'
          ? this.prisma.tenant.findMany({
              orderBy: { name: 'asc' },
              select: { id: true, name: true, slug: true },
            })
          : Promise.resolve([]),
      ]);

    const overrideMap = new Map(
      roleOverrides.map((override) => [
        `${override.tenantId}:${override.role}`,
        override.permissions,
      ]),
    );
    const users = candidateUsers
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

    const counts = Object.fromEntries(
      SUPPORT_TICKET_STATUSES.map((status) => [status, 0]),
    ) as Record<SupportTicketStatus, number>;
    for (const row of summaryRows) {
      if (SUPPORT_TICKET_STATUSES.includes(row.status)) {
        counts[row.status] = row._count._all;
      }
    }

    return {
      scope: scope.kind,
      filters,
      statuses: SUPPORT_TICKET_STATUSES,
      topics: GUEST_BUG_REPORT_TOPICS,
      summary: {
        ...counts,
        active: counts.NEW + counts.IN_PROGRESS,
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      },
      tenants,
      users,
      rows,
    };
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
      },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }

    const status =
      dto.status === undefined ? undefined : normalizeStatus(dto.status);
    if (dto.assignedToUserId !== undefined && dto.assignedToUserId !== null) {
      await this.assertValidAssignee(
        ticket.tenantId,
        dto.assignedToUserId,
        scope.kind === 'PLATFORM',
      );
    }

    if (status === undefined && dto.assignedToUserId === undefined) {
      throw new BadRequestException('Не указаны изменения обращения.');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.guestSupportTicket.update({
        where: { id: ticket.id },
        data: {
          ...(status ? statusTimestamps(status, now) : {}),
          ...(dto.assignedToUserId !== undefined
            ? { assignedToUserId: dto.assignedToUserId }
            : {}),
          lastActivityAt: now,
        },
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
    const body = typeof dto.body === 'string' ? dto.body.trim() : '';
    if (!body || body.length > 2000) {
      throw new BadRequestException(
        'Комментарий должен содержать от 1 до 2000 символов.',
      );
    }
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: {
        id,
        ...(scope.kind === 'TENANT' ? { tenantId: scope.tenantId } : {}),
      },
      select: { id: true, tenantId: true },
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
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorUser: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });
      await tx.guestSupportTicket.update({
        where: { id: ticket.id },
        data: { lastActivityAt: now },
      });
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: user.id,
          action: 'COMMENT_ADDED',
          metadata: { platformScope: scope.kind === 'PLATFORM' },
        },
      });
      return comment;
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

function normalizeFilters(query: SupportTicketsQuery) {
  const status =
    query.status &&
    (query.status === 'all' || SUPPORT_TICKET_STATUSES.includes(query.status))
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
  return {
    status,
    topic,
    tenantId: query.tenantId?.trim() || null,
    assignedToUserId: query.assignedToUserId?.trim() || null,
    search: query.search?.trim().slice(0, 200) || null,
    pageSize,
  };
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
  const permissions =
    candidate.customRole?.permissions ??
    roleOverridePermissions ??
    roleCapabilities[candidate.role];
  return permissions.includes(
    'manage_support_tickets' satisfies AccessCapability,
  );
}
