import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuestSupportTicketStatus, IntegrationProvider } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { SUPPORT_TELEGRAM_TICKET_KIND } from '../guest-portal/guest-support-thread';
import {
  GuestsService,
  type GuestDashboardRow,
} from '../guests/guests.service';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  storeFloorPlanAlertText,
  storeFloorPlanSeatHints,
  type StoreFloorPlanHint,
} from './store-floor-plan-attention';
import { StoreFloorPlanLiveService } from './store-floor-plan-live.service';

export type StoreFloorPlanAttentionSeat = {
  number: number;
  /** LeetPlus guest card, for a link; null for a guest without a card. */
  guestId: string | null;
  guestName: string | null;
  hints: StoreFloorPlanHint[];
};

export type StoreFloorPlanAlert = {
  id: string;
  ticketNumber: string;
  /** Computer the guest sits at now; null when the guest is not at one. */
  number: number | null;
  guestName: string | null;
  channel: 'TELEGRAM' | 'APP';
  text: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  lastActivityAt: string;
};

export type StoreFloorPlanAttentionView = {
  storeId: string;
  generatedAt: string;
  /** NO_CAPABILITY: only session hints (time ending), no guests or alerts. */
  guestAccess: 'AVAILABLE' | 'NO_CAPABILITY';
  seats: StoreFloorPlanAttentionSeat[];
  alerts: StoreFloorPlanAlert[];
};

export type StoreFloorPlanAlertUpdateDto = { status?: unknown };

type SeatCard = { id: string; externalGuestId: string; isStaff: boolean };

type CacheEntry = {
  expiresAt: number;
  value: Promise<StoreFloorPlanAttentionView>;
};

/** Same window as the live read, so a new guest message shows within it. */
const ATTENTION_TTL_MS = 15_000;
const CACHE_LIMIT = 200;
/** Open guest messages older than this are left to the «Поддержка» queue. */
const OPEN_ALERT_WINDOW_MS = 12 * 60 * 60_000;
/** Resolved messages stay on the scheme a little while, greyed out. */
const RESOLVED_ALERT_WINDOW_MS = 60 * 60_000;
const OPEN_ALERTS_SHOWN = 20;
const RESOLVED_ALERTS_SHOWN = 3;

function canViewScheme(user: AuthenticatedUser) {
  return (
    user.isPlatformAdmin ||
    user.role === 'OWNER' ||
    hasCapability(user, 'view_club_scheme')
  );
}

function canViewGuests(user: AuthenticatedUser) {
  return (
    user.isPlatformAdmin ||
    user.role === 'OWNER' ||
    hasCapability(user, 'view_guests')
  );
}

/**
 * «Схема клуба» for the administrator: hints about the guests sitting in the
 * club and the guests' messages of the club in real time. Reads the shared
 * live Langame snapshot and the LeetPlus database; writes only the status of
 * a guest message of this club («Иду» / «Решено»).
 */
@Injectable()
export class StoreFloorPlanAttentionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly liveService: StoreFloorPlanLiveService,
    private readonly guestsService: GuestsService,
  ) {}

  async get(
    storeId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanAttentionView> {
    // The live read checks the fresh store scope of the viewer every time.
    const seated = await this.liveService.seatedGuests(storeId, user, now);
    const guestAccess = canViewGuests(user);
    const key = `${seated.tenantId}:${seated.storeId}:${guestAccess ? 'guests' : 'seats'}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now.getTime()) return hit.value;
    if (this.cache.size >= CACHE_LIMIT) {
      for (const [entryKey, entry] of this.cache) {
        if (entry.expiresAt <= now.getTime()) this.cache.delete(entryKey);
      }
      if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    }
    const value = this.build(seated, guestAccess, now);
    this.cache.set(key, { expiresAt: now.getTime() + ATTENTION_TTL_MS, value });
    value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }

  /** «Иду» (IN_PROGRESS) or «Решено» (RESOLVED) on a message of this club. */
  async updateAlert(
    storeId: string,
    ticketId: string,
    dto: StoreFloorPlanAlertUpdateDto,
    user: AuthenticatedUser,
    now = new Date(),
  ) {
    const status =
      dto.status === 'IN_PROGRESS' || dto.status === 'RESOLVED'
        ? (dto.status as GuestSupportTicketStatus)
        : null;
    if (!status) {
      throw new BadRequestException('Некорректный статус обращения.');
    }
    if (!canViewGuests(user) || !canViewScheme(user)) {
      throw new ForbiddenException('Нет доступа к обращениям гостей.');
    }
    const scope = await this.freshStoreScopeService.resolveRequestedStoreIds(
      user,
      [storeId],
    );
    const ticket = await this.prisma.guestSupportTicket.findFirst({
      where: { id: ticketId, tenantId: scope.tenantId, storeId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }
    if (ticket.status === status) {
      return { id: ticket.id, status: ticket.status };
    }
    const allowed =
      status === 'IN_PROGRESS'
        ? ticket.status === 'NEW'
        : ticket.status === 'NEW' || ticket.status === 'IN_PROGRESS';
    if (!allowed) {
      throw new ConflictException('Обращение уже закрыто. Обновите схему.');
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.guestSupportTicket.updateMany({
        where: {
          id: ticket.id,
          tenantId: ticket.tenantId,
          status: ticket.status,
        },
        data: {
          status,
          resolvedAt: status === 'RESOLVED' ? now : null,
          closedAt: null,
          lastActivityAt: now,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Обращение уже изменил другой сотрудник. Обновите схему.',
        );
      }
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: user.id,
          action: 'UPDATED_FROM_CLUB_SCHEME',
          metadata: { previousStatus: ticket.status, status, storeId },
        },
      });
    });
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${ticket.tenantId}:${storeId}:`)) {
        this.cache.delete(key);
      }
    }
    return { id: ticket.id, status };
  }

  private async build(
    seated: Awaited<ReturnType<StoreFloorPlanLiveService['seatedGuests']>>,
    guestAccess: boolean,
    now: Date,
  ): Promise<StoreFloorPlanAttentionView> {
    const { tenantId, storeId, domain } = seated;
    const langameIds = guestAccess
      ? Array.from(
          new Set(
            seated.seats
              .map((seat) => seat.langameGuestId)
              .filter((id): id is string => Boolean(id)),
          ),
        )
      : [];
    const [cards, tickets] = await Promise.all([
      langameIds.length > 0 && domain
        ? this.prisma.guest.findMany({
            where: {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalGuestId: { in: langameIds },
            },
            select: { id: true, externalGuestId: true, isStaff: true },
          })
        : Promise.resolve<SeatCard[]>([]),
      guestAccess
        ? this.loadTickets(tenantId, storeId, now)
        : Promise.resolve([]),
    ]);
    const cardByLangameId = new Map<string, SeatCard>(
      cards.map((card) => [card.externalGuestId, card]),
    );
    const ticketGuestIds = tickets
      .map((ticket) => ticket.guestId)
      .filter((id): id is string => Boolean(id));
    const rows = guestAccess
      ? await this.guestsService.floorPlanGuestRows(
          tenantId,
          Array.from(
            new Set([...cards.map((card) => card.id), ...ticketGuestIds]),
          ),
        )
      : [];
    const rowById = new Map<string, GuestDashboardRow>(
      rows.map((row) => [row.id, row]),
    );
    const previousVisits = await this.previousVisits(
      tenantId,
      seated.seats.flatMap((seat) => {
        const card = seat.langameGuestId
          ? cardByLangameId.get(seat.langameGuestId)
          : undefined;
        return card ? [{ guestId: card.id, before: seat.startedAt }] : [];
      }),
    );

    const seatByGuestId = new Map<string, number>();
    const seats: StoreFloorPlanAttentionSeat[] = [];
    for (const seat of seated.seats) {
      const card = seat.langameGuestId
        ? cardByLangameId.get(seat.langameGuestId)
        : undefined;
      const row = card ? (rowById.get(card.id) ?? null) : null;
      if (card) seatByGuestId.set(card.id, seat.number);
      const hints = storeFloorPlanSeatHints({
        now,
        timeZone: seated.timeZone,
        startedAt: seat.startedAt,
        endsAt: seat.endsAt,
        purchases: seat.purchases,
        guestAccess,
        isStaff: card?.isStaff ?? false,
        newGuest: guestAccess && Boolean(seat.langameGuestId) && !card,
        row,
        previousVisitAt: card ? (previousVisits.get(card.id) ?? null) : null,
      });
      seats.push({
        number: seat.number,
        guestId: guestAccess && card ? card.id : null,
        guestName: guestAccess && row ? row.displayName : null,
        hints,
      });
    }

    const alerts: StoreFloorPlanAlert[] = tickets.map((ticket) => {
      const lastGuestLine = ticket.comments[0]?.body ?? null;
      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        number: ticket.guestId
          ? (seatByGuestId.get(ticket.guestId) ?? null)
          : null,
        guestName: ticket.guestId
          ? (rowById.get(ticket.guestId)?.displayName ?? null)
          : null,
        channel:
          ticket.kind === SUPPORT_TELEGRAM_TICKET_KIND ? 'TELEGRAM' : 'APP',
        text: storeFloorPlanAlertText(lastGuestLine ?? ticket.description),
        status:
          ticket.status === 'RESOLVED'
            ? 'RESOLVED'
            : ticket.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : 'NEW',
        createdAt: ticket.createdAt.toISOString(),
        lastActivityAt: ticket.lastActivityAt.toISOString(),
      };
    });

    // An open message of a guest at a computer is the marker of that computer.
    for (const alert of alerts) {
      if (alert.number === null || alert.status === 'RESOLVED') continue;
      const seat = seats.find((item) => item.number === alert.number);
      if (!seat || seat.hints.some((hint) => hint.key === 'GUEST_MESSAGE')) {
        continue;
      }
      seat.hints.unshift({
        key: 'GUEST_MESSAGE',
        tone: 'ALERT',
        alertId: alert.id,
        title:
          alert.status === 'IN_PROGRESS' ? 'Обращение · идут' : 'Обращение',
        hint: alert.text,
      });
    }

    return {
      storeId,
      generatedAt: now.toISOString(),
      guestAccess: guestAccess ? 'AVAILABLE' : 'NO_CAPABILITY',
      seats: seats.filter((seat) => seat.hints.length > 0),
      alerts,
    };
  }

  private async loadTickets(tenantId: string, storeId: string, now: Date) {
    const select = {
      id: true,
      ticketNumber: true,
      guestId: true,
      kind: true,
      description: true,
      status: true,
      createdAt: true,
      lastActivityAt: true,
      comments: {
        where: { authorUserId: null },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { body: true },
      },
    };
    const [open, resolved] = await Promise.all([
      this.prisma.guestSupportTicket.findMany({
        where: {
          tenantId,
          storeId,
          status: { in: ['NEW', 'IN_PROGRESS'] },
          lastActivityAt: {
            gte: new Date(now.getTime() - OPEN_ALERT_WINDOW_MS),
          },
        },
        orderBy: { lastActivityAt: 'desc' },
        take: OPEN_ALERTS_SHOWN,
        select,
      }),
      this.prisma.guestSupportTicket.findMany({
        where: {
          tenantId,
          storeId,
          status: 'RESOLVED',
          resolvedAt: {
            gte: new Date(now.getTime() - RESOLVED_ALERT_WINDOW_MS),
          },
        },
        orderBy: { resolvedAt: 'desc' },
        take: RESOLVED_ALERTS_SHOWN,
        select,
      }),
    ]);
    return [...open, ...resolved];
  }

  /** Start of each guest's visit before the running session. */
  private async previousVisits(
    tenantId: string,
    guests: Array<{ guestId: string; before: Date }>,
  ) {
    const found = await Promise.all(
      guests.map(async ({ guestId, before }) => {
        const session = await this.prisma.guestSession.findFirst({
          where: {
            tenantId,
            guestId,
            // The running session may already be synced: skip it.
            startedAt: { lt: new Date(before.getTime() - 60_000) },
          },
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true },
        });
        return [guestId, session?.startedAt ?? null] as const;
      }),
    );
    return new Map(found);
  }
}
