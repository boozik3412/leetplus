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
import { roleCapabilities, type AccessCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { GUEST_BUG_REPORT_TOPICS } from '../guest-portal/guest-support.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';

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
    return this.getTickets({ kind: 'TENANT', tenantId }, query);
  }

  getPlatformTickets(query: SupportTicketsQuery) {
    this.assertSupportSchemaReady();
    const tenantId = normalizeOptionalUuid(query.tenantId, 'tenantId');
    return this.getTickets({ kind: 'PLATFORM', tenantId }, query);
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
      rows: rows.map((row) => this.projectTicketContact(row)),
    };
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
  const permissions =
    candidate.customRole?.permissions ??
    roleOverridePermissions ??
    roleCapabilities[candidate.role];
  return permissions.includes(
    'manage_support_tickets' satisfies AccessCapability,
  );
}
