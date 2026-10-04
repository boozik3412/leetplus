import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestSupportTicketStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH,
  SUPPORT_GUEST_MESSAGE_MAX_LENGTH,
  SUPPORT_PUBLIC_AUTHOR_LABEL,
  SUPPORT_THREAD_ACTION_LIST,
  SUPPORT_THREAD_ACTIONS,
  closeStaleResolvedSupportTickets,
  summarizeSupportThread,
  supportGuestTicketState,
  type SupportGuestFeedbackValue,
} from './guest-support-thread';

export const GUEST_BUG_REPORT_MAX_BYTES = 5 * 1024 * 1024;
export const GUEST_BUG_REPORT_MIN_DESCRIPTION_LENGTH = 20;
export const GUEST_BUG_REPORT_MAX_DESCRIPTION_LENGTH = 2000;
export const GUEST_BUG_REPORT_MULTIPART_LIMITS = Object.freeze({
  fileSize: GUEST_BUG_REPORT_MAX_BYTES,
  files: 1,
  fields: 6,
  fieldSize: 4 * 1024,
  // Busboy emits partsLimit when the counter reaches the configured value.
  // Six text fields plus one optional file therefore need an exclusive cap of 8.
  parts: 8,
});

export const GUEST_BUG_REPORT_TOPICS = [
  'GAME_MODULE',
  'MISSIONS_AND_BATTLE_PASS',
  'LOOT_BOXES_AND_REWARDS',
  'BALANCE_AND_PAYMENTS',
  'AUTH_AND_PROFILE',
  'INTERFACE_AND_DISPLAY',
  'OTHER',
] as const;

export type GuestBugReportTopic = (typeof GUEST_BUG_REPORT_TOPICS)[number];

export const GUEST_BUG_REPORT_TOPIC_LABELS: Record<
  GuestBugReportTopic,
  string
> = {
  GAME_MODULE: 'Игровой модуль',
  MISSIONS_AND_BATTLE_PASS: 'Задания и боевой пропуск',
  LOOT_BOXES_AND_REWARDS: 'Лутбоксы и награды',
  BALANCE_AND_PAYMENTS: 'Баланс и платежи',
  AUTH_AND_PROFILE: 'Авторизация и профиль',
  INTERFACE_AND_DISPLAY: 'Интерфейс и отображение',
  OTHER: 'Другое',
};

const oneHourMs = 60 * 60 * 1000;
const oneDayMs = 24 * oneHourMs;

export type GuestBugReportUploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type GuestBugReportInput = {
  topic?: unknown;
  description?: unknown;
  route?: unknown;
  viewport?: unknown;
  timeZone?: unknown;
  // Club the problem is about; defaults to the club selected in the module.
  storeId?: unknown;
};

export type GuestBugReportContext = {
  tenantId: string;
  storeId: string;
  // Club selected in the game module when it differs from `storeId`.
  reportedFromStoreId?: string | null;
  profileId: string;
  guestId: string | null;
  idempotencyKey: string | undefined;
  userAgent: string | undefined;
};

export type GuestBugReportResponse = {
  ticketNumber: string;
  createdAt: string;
};

export type GuestSupportTicketContext = {
  tenantId: string;
  profileId: string;
};

export type GuestSupportTicketListItem = {
  ticketNumber: string;
  topic: string;
  topicLabel: string;
  storeName: string;
  status: GuestSupportTicketStatus;
  statusLabel: string;
  createdAt: string;
  lastActivityAt: string;
  lastReplyAt: string | null;
  unread: boolean;
};

export type GuestSupportTicketList = {
  tickets: GuestSupportTicketListItem[];
  unreadCount: number;
};

export type GuestSupportTicketThread = {
  ticket: GuestSupportTicketListItem & {
    canReply: boolean;
    replyReopens: boolean;
    canGiveFeedback: boolean;
    feedback: { value: SupportGuestFeedbackValue; at: string } | null;
  };
  messages: Array<{
    id: string;
    author: 'GUEST' | 'SUPPORT';
    authorLabel: string;
    body: string;
    createdAt: string;
  }>;
};

type GuestThreadEvent = {
  action: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

const GUEST_SUPPORT_TICKET_NUMBER = /^LP-BUG-[0-9A-F]{8}$/;
const GUEST_MESSAGES_PER_HOUR = 10;
const GUEST_MESSAGES_PER_DAY = 30;
const guestThreadTicketSelect = {
  id: true,
  tenantId: true,
  ticketNumber: true,
  topic: true,
  description: true,
  status: true,
  resolvedAt: true,
  closedAt: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
  store: { select: { name: true } },
} satisfies Prisma.GuestSupportTicketSelect;
type GuestThreadTicket = Prisma.GuestSupportTicketGetPayload<{
  select: typeof guestThreadTicketSelect;
}>;

@Injectable()
export class GuestSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createBugReport(
    context: GuestBugReportContext,
    input: GuestBugReportInput,
    file?: GuestBugReportUploadFile,
  ): Promise<GuestBugReportResponse> {
    if (!isGuestBugReportingLive(this.configService)) {
      throw new NotFoundException('Отправка сообщений о проблемах недоступна.');
    }

    const topic = normalizeTopic(input.topic);
    const description = normalizeDescription(input.description);
    const idempotencyKey = normalizeIdempotencyKey(context.idempotencyKey);
    const route = normalizeRoute(input.route);
    const viewport = normalizeViewport(input.viewport);
    const timeZone = normalizeTimeZone(input.timeZone);
    const client = normalizeClient(context.userAgent);
    const attachment = normalizeAttachment(file);
    const now = new Date();
    const releaseSha = normalizeReleaseSha(
      this.configService.get<string>('RELEASE_SHA'),
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.guestSupportTicket.findUnique({
              where: {
                tenantId_profileId_idempotencyKey: {
                  tenantId: context.tenantId,
                  profileId: context.profileId,
                  idempotencyKey,
                },
              },
              select: { ticketNumber: true, createdAt: true },
            });

            if (existing) {
              return {
                ticketNumber: existing.ticketNumber,
                createdAt: existing.createdAt.toISOString(),
              };
            }

            const hourlyCount = await tx.guestSupportTicket.count({
              where: {
                tenantId: context.tenantId,
                profileId: context.profileId,
                createdAt: { gte: new Date(now.getTime() - oneHourMs) },
              },
            });
            if (hourlyCount >= 5) {
              throw new HttpException(
                'Слишком много обращений. Повторите попытку позднее.',
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }

            const dailyCount = await tx.guestSupportTicket.count({
              where: {
                tenantId: context.tenantId,
                profileId: context.profileId,
                createdAt: { gte: new Date(now.getTime() - oneDayMs) },
              },
            });
            if (dailyCount >= 20) {
              throw new HttpException(
                'Дневной лимит обращений исчерпан. Повторите попытку позднее.',
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }

            const ticketNumber = `LP-BUG-${randomUUID()
              .replace(/-/g, '')
              .slice(0, 8)
              .toUpperCase()}`;
            const ticket = await tx.guestSupportTicket.create({
              data: {
                ticketNumber,
                tenantId: context.tenantId,
                storeId: context.storeId,
                profileId: context.profileId,
                guestId: context.guestId,
                idempotencyKey,
                topic,
                description,
                route,
                releaseSha,
                browser: client.browser,
                device: client.device,
                viewport,
                timeZone,
              },
              select: { id: true, ticketNumber: true, createdAt: true },
            });

            if (attachment) {
              await tx.guestSupportAttachment.create({
                data: {
                  tenantId: context.tenantId,
                  ticketId: ticket.id,
                  fileName: attachment.fileName,
                  contentType: attachment.contentType,
                  byteSize: attachment.buffer.length,
                  contentSha256: attachment.contentSha256,
                  data: Uint8Array.from(attachment.buffer),
                  state: 'AVAILABLE',
                  processedAt: now,
                },
              });
            }

            await tx.guestSupportTicketAuditEvent.create({
              data: {
                tenantId: context.tenantId,
                ticketId: ticket.id,
                action: 'CREATED_BY_GUEST',
                metadata: {
                  topic,
                  storeId: context.storeId,
                  ...(context.reportedFromStoreId &&
                  context.reportedFromStoreId !== context.storeId
                    ? { reportedFromStoreId: context.reportedFromStoreId }
                    : {}),
                  profileId: context.profileId,
                  hasAttachment: Boolean(attachment),
                },
              },
            });

            return {
              ticketNumber: ticket.ticketNumber,
              createdAt: ticket.createdAt.toISOString(),
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await this.prisma.guestSupportTicket.findUnique({
            where: {
              tenantId_profileId_idempotencyKey: {
                tenantId: context.tenantId,
                profileId: context.profileId,
                idempotencyKey,
              },
            },
            select: { ticketNumber: true, createdAt: true },
          });
          if (existing) {
            return {
              ticketNumber: existing.ticketNumber,
              createdAt: existing.createdAt.toISOString(),
            };
          }
          if (attempt < 2) {
            continue;
          }
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ServiceUnavailableException(
      'Не удалось зарегистрировать обращение. Повторите попытку.',
    );
  }

  async listTickets(
    context: GuestSupportTicketContext,
  ): Promise<GuestSupportTicketList> {
    this.assertTicketsAvailable();
    const now = new Date();
    await closeStaleResolvedSupportTickets(this.prisma, context, now);
    const tickets = await this.prisma.guestSupportTicket.findMany({
      where: { tenantId: context.tenantId, profileId: context.profileId },
      select: guestThreadTicketSelect,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    const events = await this.threadEvents(
      this.prisma,
      context.tenantId,
      tickets.map((ticket) => ticket.id),
    );
    const items = tickets.map((ticket) =>
      this.listItem(ticket, events.get(ticket.id) ?? [], now),
    );
    return {
      tickets: items,
      unreadCount: items.filter((item) => item.unread).length,
    };
  }

  async getTicket(
    context: GuestSupportTicketContext,
    ticketNumber: unknown,
  ): Promise<GuestSupportTicketThread> {
    this.assertTicketsAvailable();
    const now = new Date();
    const ticket = await this.findGuestTicket(
      this.prisma,
      context,
      ticketNumber,
    );
    const events =
      (await this.threadEvents(this.prisma, context.tenantId, [ticket.id])).get(
        ticket.id,
      ) ?? [];
    const thread = summarizeSupportThread(events);
    const commentIds = [...thread.publicCommentIds, ...thread.guestCommentIds];
    const comments = commentIds.length
      ? await this.prisma.guestSupportTicketComment.findMany({
          where: {
            tenantId: context.tenantId,
            ticketId: ticket.id,
            id: { in: commentIds },
          },
          select: { id: true, body: true, createdAt: true },
        })
      : [];
    const state = supportGuestTicketState(ticket, thread, now);

    return {
      ticket: {
        ...this.listItem(ticket, events, now),
        canReply: state.canReply,
        replyReopens: state.replyReopens,
        canGiveFeedback: state.canGiveFeedback,
        feedback: thread.feedback
          ? {
              value: thread.feedback.value,
              at: thread.feedback.at.toISOString(),
            }
          : null,
      },
      messages: [
        {
          id: 'description',
          author: 'GUEST' as const,
          authorLabel: 'Вы',
          body: ticket.description,
          createdAt: ticket.createdAt.toISOString(),
        },
        ...comments
          .map((comment) => {
            const fromGuest = thread.guestCommentIds.has(comment.id);
            return {
              id: comment.id,
              author: fromGuest ? ('GUEST' as const) : ('SUPPORT' as const),
              authorLabel: fromGuest ? 'Вы' : SUPPORT_PUBLIC_AUTHOR_LABEL,
              body: comment.body,
              createdAt: comment.createdAt.toISOString(),
            };
          })
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      ],
    };
  }

  async markTicketRead(
    context: GuestSupportTicketContext,
    ticketNumber: unknown,
  ) {
    this.assertTicketsAvailable();
    const ticket = await this.findGuestTicket(
      this.prisma,
      context,
      ticketNumber,
    );
    const events =
      (await this.threadEvents(this.prisma, context.tenantId, [ticket.id])).get(
        ticket.id,
      ) ?? [];
    if (summarizeSupportThread(events).unread) {
      await this.prisma.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: context.tenantId,
          ticketId: ticket.id,
          actorUserId: null,
          action: SUPPORT_THREAD_ACTIONS.GUEST_READ,
          metadata: { profileId: context.profileId },
          createdAt: new Date(),
        },
      });
    }
    return { ok: true as const };
  }

  async addGuestMessage(
    context: GuestSupportTicketContext,
    ticketNumber: unknown,
    input: { body?: unknown },
    idempotencyKey: string | undefined,
  ): Promise<GuestSupportTicketThread> {
    this.assertTicketsAvailable();
    const body = guestThreadText(
      input.body,
      2,
      SUPPORT_GUEST_MESSAGE_MAX_LENGTH,
      `Сообщение должно содержать от 2 до ${SUPPORT_GUEST_MESSAGE_MAX_LENGTH} символов.`,
    );
    const key = normalizeIdempotencyKey(idempotencyKey);

    await this.withSerializableRetry(async (tx) => {
      const now = new Date();
      const ticket = await this.findGuestTicket(tx, context, ticketNumber);
      const commentId = guestOperationUuid('guest-message', ticket.id, key);
      const replay = await tx.guestSupportTicketComment.findUnique({
        where: { id: commentId },
        select: { id: true },
      });
      if (replay) {
        return;
      }
      await this.assertGuestMessageLimits(tx, context, now);
      const events =
        (await this.threadEvents(tx, context.tenantId, [ticket.id])).get(
          ticket.id,
        ) ?? [];
      const state = supportGuestTicketState(
        ticket,
        summarizeSupportThread(events),
        now,
      );
      if (!state.canReply) {
        throw new ConflictException(
          'Обращение закрыто больше 7 дней назад. Если проблема повторилась, отправьте новое сообщение через «Сообщить о проблеме».',
        );
      }
      await tx.guestSupportTicketComment.create({
        data: {
          id: commentId,
          tenantId: context.tenantId,
          ticketId: ticket.id,
          authorUserId: null,
          body,
          createdAt: now,
        },
      });
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: context.tenantId,
          ticketId: ticket.id,
          actorUserId: null,
          action: SUPPORT_THREAD_ACTIONS.GUEST_MESSAGE,
          metadata: { commentId, profileId: context.profileId },
          createdAt: now,
        },
      });
      await this.touchOrReopen(
        tx,
        ticket,
        state.replyReopens,
        'GUEST_MESSAGE',
        now,
      );
    });

    return this.getTicket(context, ticketNumber);
  }

  async giveFeedback(
    context: GuestSupportTicketContext,
    ticketNumber: unknown,
    input: { value?: unknown; comment?: unknown },
    idempotencyKey: string | undefined,
  ): Promise<GuestSupportTicketThread> {
    this.assertTicketsAvailable();
    const value = input.value;
    if (value !== 'HELPED' && value !== 'NOT_HELPED') {
      throw new BadRequestException('Выберите, помог ли ответ.');
    }
    const rawComment =
      typeof input.comment === 'string' ? input.comment.trim() : '';
    const comment = rawComment
      ? guestThreadText(
          rawComment,
          1,
          SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH,
          `Комментарий должен быть не длиннее ${SUPPORT_FEEDBACK_COMMENT_MAX_LENGTH} символов.`,
        )
      : null;
    const key = normalizeIdempotencyKey(idempotencyKey);

    await this.withSerializableRetry(async (tx) => {
      const now = new Date();
      const ticket = await this.findGuestTicket(tx, context, ticketNumber);
      const feedbackId = guestOperationUuid('guest-feedback', ticket.id, key);
      const replay = await tx.guestSupportTicketAuditEvent.findUnique({
        where: { id: feedbackId },
        select: { id: true },
      });
      if (replay) {
        return;
      }
      const events =
        (await this.threadEvents(tx, context.tenantId, [ticket.id])).get(
          ticket.id,
        ) ?? [];
      const state = supportGuestTicketState(
        ticket,
        summarizeSupportThread(events),
        now,
      );
      if (!state.canGiveFeedback) {
        throw new ConflictException(
          'Оценить можно только решённое обращение, по которому ещё нет вашего ответа.',
        );
      }
      let commentId: string | null = null;
      if (comment) {
        commentId = guestOperationUuid(
          'guest-feedback-comment',
          ticket.id,
          key,
        );
        await tx.guestSupportTicketComment.create({
          data: {
            id: commentId,
            tenantId: context.tenantId,
            ticketId: ticket.id,
            authorUserId: null,
            body: comment,
            createdAt: now,
          },
        });
        await tx.guestSupportTicketAuditEvent.create({
          data: {
            tenantId: context.tenantId,
            ticketId: ticket.id,
            actorUserId: null,
            action: SUPPORT_THREAD_ACTIONS.GUEST_MESSAGE,
            metadata: { commentId, profileId: context.profileId },
            createdAt: now,
          },
        });
      }
      const at = new Date(now.getTime() + 1);
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          id: feedbackId,
          tenantId: context.tenantId,
          ticketId: ticket.id,
          actorUserId: null,
          action: SUPPORT_THREAD_ACTIONS.GUEST_FEEDBACK,
          metadata: {
            value,
            comment,
            commentId,
            profileId: context.profileId,
            previousStatus: ticket.status,
          },
          createdAt: at,
        },
      });
      if (value === 'NOT_HELPED') {
        await this.touchOrReopen(tx, ticket, true, 'NOT_HELPED', at);
      } else if (ticket.status === 'RESOLVED') {
        const closed = await tx.guestSupportTicket.updateMany({
          where: {
            id: ticket.id,
            tenantId: ticket.tenantId,
            status: 'RESOLVED',
            updatedAt: ticket.updatedAt,
          },
          data: { status: 'CLOSED', closedAt: at, lastActivityAt: at },
        });
        if (closed.count !== 1) {
          throw new ConflictException(
            'Обращение изменилось. Обновите страницу.',
          );
        }
      }
    });

    return this.getTicket(context, ticketNumber);
  }

  private assertTicketsAvailable() {
    if (!isGuestBugReportingLive(this.configService)) {
      throw new NotFoundException('Раздел обращений недоступен.');
    }
  }

  private async findGuestTicket(
    db: Pick<Prisma.TransactionClient, 'guestSupportTicket'>,
    context: GuestSupportTicketContext,
    ticketNumber: unknown,
  ): Promise<GuestThreadTicket> {
    const number = typeof ticketNumber === 'string' ? ticketNumber.trim() : '';
    const ticket = GUEST_SUPPORT_TICKET_NUMBER.test(number)
      ? await db.guestSupportTicket.findFirst({
          where: {
            tenantId: context.tenantId,
            profileId: context.profileId,
            ticketNumber: number,
          },
          select: guestThreadTicketSelect,
        })
      : null;
    if (!ticket) {
      throw new NotFoundException('Обращение не найдено.');
    }
    return ticket;
  }

  private async threadEvents(
    db: Pick<Prisma.TransactionClient, 'guestSupportTicketAuditEvent'>,
    tenantId: string,
    ticketIds: string[],
  ) {
    const grouped = new Map<string, GuestThreadEvent[]>();
    if (!ticketIds.length) return grouped;
    const rows = await db.guestSupportTicketAuditEvent.findMany({
      where: {
        tenantId,
        ticketId: { in: ticketIds },
        action: { in: [...SUPPORT_THREAD_ACTION_LIST] },
      },
      select: { ticketId: true, action: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      const list = grouped.get(row.ticketId) ?? [];
      list.push(row);
      grouped.set(row.ticketId, list);
    }
    return grouped;
  }

  private listItem(
    ticket: GuestThreadTicket,
    events: GuestThreadEvent[],
    now: Date,
  ): GuestSupportTicketListItem {
    const thread = summarizeSupportThread(events);
    const state = supportGuestTicketState(ticket, thread, now);
    return {
      ticketNumber: ticket.ticketNumber,
      topic: ticket.topic,
      topicLabel:
        GUEST_BUG_REPORT_TOPIC_LABELS[ticket.topic as GuestBugReportTopic] ??
        'Другое',
      storeName: ticket.store.name,
      status: state.status,
      statusLabel: state.statusLabel,
      createdAt: ticket.createdAt.toISOString(),
      lastActivityAt: ticket.lastActivityAt.toISOString(),
      lastReplyAt: thread.lastPublicReplyAt?.toISOString() ?? null,
      unread: thread.unread,
    };
  }

  private async assertGuestMessageLimits(
    tx: Prisma.TransactionClient,
    context: GuestSupportTicketContext,
    now: Date,
  ) {
    const messagesSince = (windowMs: number) =>
      tx.guestSupportTicketAuditEvent.count({
        where: {
          tenantId: context.tenantId,
          action: SUPPORT_THREAD_ACTIONS.GUEST_MESSAGE,
          createdAt: { gte: new Date(now.getTime() - windowMs) },
          ticket: { profileId: context.profileId },
        },
      });
    if ((await messagesSince(oneHourMs)) >= GUEST_MESSAGES_PER_HOUR) {
      throw new HttpException(
        'Слишком много сообщений. Повторите попытку позднее.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if ((await messagesSince(oneDayMs)) >= GUEST_MESSAGES_PER_DAY) {
      throw new HttpException(
        'Дневной лимит сообщений исчерпан. Повторите попытку завтра.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // A guest reply or "did not help" on a finished ticket sends it back to the
  // support queue as NEW; otherwise it only refreshes the activity time.
  private async touchOrReopen(
    tx: Prisma.TransactionClient,
    ticket: GuestThreadTicket,
    reopen: boolean,
    reason: 'GUEST_MESSAGE' | 'NOT_HELPED',
    now: Date,
  ) {
    const changed = await tx.guestSupportTicket.updateMany({
      where: {
        id: ticket.id,
        tenantId: ticket.tenantId,
        status: ticket.status,
        updatedAt: ticket.updatedAt,
      },
      data: reopen
        ? {
            status: 'NEW',
            resolvedAt: null,
            closedAt: null,
            lastActivityAt: now,
          }
        : { lastActivityAt: now },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Обращение изменилось. Обновите страницу.');
    }
    if (reopen) {
      await tx.guestSupportTicketAuditEvent.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorUserId: null,
          action: SUPPORT_THREAD_ACTIONS.REOPENED_BY_GUEST,
          metadata: { previousStatus: ticket.status, status: 'NEW', reason },
          createdAt: now,
        },
      });
    }
  }

  private async withSerializableRetry(
    work: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        return;
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002')
        ) {
          continue;
        }
        throw error;
      }
    }
  }
}

export function isGuestBugReportingLive(configService: ConfigService) {
  return (
    configService
      .get<string>('GUEST_BUG_REPORTING_MODE')
      ?.trim()
      .toUpperCase() === 'LIVE'
  );
}

function normalizeTopic(value: unknown): GuestBugReportTopic {
  if (
    typeof value !== 'string' ||
    !GUEST_BUG_REPORT_TOPICS.includes(value as GuestBugReportTopic)
  ) {
    throw new BadRequestException('Выберите тему обращения.');
  }
  return value as GuestBugReportTopic;
}

function normalizeDescription(value: unknown) {
  const description = typeof value === 'string' ? value.trim() : '';
  if (
    description.length < GUEST_BUG_REPORT_MIN_DESCRIPTION_LENGTH ||
    description.length > GUEST_BUG_REPORT_MAX_DESCRIPTION_LENGTH
  ) {
    throw new BadRequestException(
      `Описание должно содержать от ${GUEST_BUG_REPORT_MIN_DESCRIPTION_LENGTH} до ${GUEST_BUG_REPORT_MAX_DESCRIPTION_LENGTH} символов.`,
    );
  }
  return description;
}

function normalizeIdempotencyKey(value: string | undefined) {
  const key = value?.trim() ?? '';
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) {
    throw new BadRequestException('Некорректный ключ отправки обращения.');
  }
  return key;
}

function normalizeRoute(value: unknown) {
  const route = typeof value === 'string' ? value.trim() : '';
  if (!route) {
    return null;
  }
  if (
    route.length > 240 ||
    !route.startsWith('/') ||
    route.includes('?') ||
    /[\r\n\0]/.test(route)
  ) {
    throw new BadRequestException('Некорректный маршрут страницы.');
  }
  return route;
}

function normalizeViewport(value: unknown) {
  const viewport = typeof value === 'string' ? value.trim() : '';
  return /^\d{2,5}x\d{2,5}$/.test(viewport) ? viewport : null;
}

function normalizeTimeZone(value: unknown) {
  const timeZone = typeof value === 'string' ? value.trim() : '';
  return timeZone &&
    timeZone.length <= 80 &&
    /^[A-Za-z0-9_+\-/]+$/.test(timeZone)
    ? timeZone
    : null;
}

function normalizeReleaseSha(value: string | undefined) {
  const releaseSha = value?.trim() ?? '';
  return /^[A-Fa-f0-9]{7,64}$/.test(releaseSha) ? releaseSha : null;
}

export function normalizeClient(userAgent: string | undefined) {
  const ua = userAgent?.slice(0, 500) ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /CriOS\//.test(ua)
        ? 'Chrome iOS'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /FxiOS\//.test(ua)
            ? 'Firefox iOS'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : ua
                  ? 'Другой'
                  : null;
  const device = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? 'Android phone'
          : 'Android tablet'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : ua
                ? 'Другое'
                : null;

  return { browser, device };
}

function normalizeAttachment(file: GuestBugReportUploadFile | undefined) {
  const source = file?.buffer;
  if (!source?.length) {
    return null;
  }
  if (source.length > GUEST_BUG_REPORT_MAX_BYTES) {
    throw new BadRequestException('Изображение превышает 5 МБ.');
  }

  const contentType = detectImageContentType(source);
  if (!contentType) {
    throw new BadRequestException('Разрешены только JPG, PNG и WebP.');
  }
  if (file?.mimetype && file.mimetype !== contentType) {
    throw new BadRequestException(
      'Тип вложения не соответствует содержимому файла.',
    );
  }
  const buffer = stripImageMetadata(source, contentType);
  if (!buffer.length || buffer.length > GUEST_BUG_REPORT_MAX_BYTES) {
    throw new BadRequestException('Некорректный размер изображения.');
  }
  const extension =
    contentType === 'image/jpeg'
      ? '.jpg'
      : contentType === 'image/png'
        ? '.png'
        : '.webp';
  const base = (file?.originalname ?? 'bug-screenshot')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N} ._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return {
    fileName: `${base || 'bug-screenshot'}${extension}`,
    contentType,
    buffer,
    contentSha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function detectImageContentType(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png' as const;
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg' as const;
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp' as const;
  }
  return null;
}

export function stripImageMetadata(
  source: Buffer,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
) {
  if (contentType === 'image/jpeg') {
    return stripJpegMetadata(source);
  }
  if (contentType === 'image/png') {
    return stripPngMetadata(source);
  }
  return stripWebpMetadata(source);
}

function stripJpegMetadata(source: Buffer) {
  if (
    source.length < 4 ||
    source[0] !== 0xff ||
    source[1] !== 0xd8 ||
    source[source.length - 2] !== 0xff ||
    source[source.length - 1] !== 0xd9
  ) {
    throw invalidImage();
  }

  const chunks = [source.subarray(0, 2)];
  let offset = 2;
  while (offset + 1 < source.length) {
    const markerStart = offset;
    if (source[offset] !== 0xff) {
      throw invalidImage();
    }
    while (offset < source.length && source[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= source.length) {
      throw invalidImage();
    }
    const marker = source[offset];
    offset += 1;
    if (marker === 0xda) {
      if (offset + 2 > source.length) {
        throw invalidImage();
      }
      const length = source.readUInt16BE(offset);
      const scanStart = offset + length;
      if (length < 2 || scanStart > source.length - 2) {
        throw invalidImage();
      }
      chunks.push(source.subarray(markerStart));
      return Buffer.concat(chunks);
    }
    if (marker === 0xd9 || marker === 0x00) {
      throw invalidImage();
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      chunks.push(source.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > source.length) {
      throw invalidImage();
    }
    const length = source.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > source.length - 2) {
      throw invalidImage();
    }
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) {
      chunks.push(source.subarray(markerStart, end));
    }
    offset = end;
  }
  throw invalidImage();
}

function stripPngMetadata(source: Buffer) {
  const chunks = [source.subarray(0, 8)];
  const blocked = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let offset = 8;
  let chunkIndex = 0;
  let foundImageData = false;
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > source.length) {
      throw invalidImage();
    }
    const kind = source.subarray(offset + 4, offset + 8).toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(kind)) {
      throw invalidImage();
    }
    if (chunkIndex === 0 && (kind !== 'IHDR' || length !== 13)) {
      throw invalidImage();
    }
    if (kind === 'IDAT') {
      foundImageData = true;
    }
    if (!blocked.has(kind)) {
      chunks.push(source.subarray(offset, end));
    }
    offset = end;
    chunkIndex += 1;
    if (kind === 'IEND') {
      if (length !== 0 || offset !== source.length || !foundImageData) {
        throw invalidImage();
      }
      return Buffer.concat(chunks);
    }
  }
  throw invalidImage();
}

function stripWebpMetadata(source: Buffer) {
  if (source.readUInt32LE(4) !== source.length - 8) {
    throw invalidImage();
  }
  const chunks: Buffer[] = [];
  let offset = 12;
  let foundImageData = false;
  while (offset + 8 <= source.length) {
    const kind = source.subarray(offset, offset + 4).toString('ascii');
    const length = source.readUInt32LE(offset + 4);
    const paddedLength = length + (length % 2);
    const end = offset + 8 + paddedLength;
    if (end > source.length) {
      throw invalidImage();
    }
    foundImageData ||= kind === 'VP8 ' || kind === 'VP8L' || kind === 'VP8X';
    if (kind !== 'EXIF' && kind !== 'XMP ') {
      const chunk = Buffer.from(source.subarray(offset, end));
      if (kind === 'VP8X' && chunk.length >= 9) {
        chunk[8] &= ~0x0c;
      }
      chunks.push(chunk);
    }
    offset = end;
  }
  if (offset !== source.length || !foundImageData) {
    throw invalidImage();
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function invalidImage() {
  return new BadRequestException(
    'Файл повреждён или не является изображением.',
  );
}

function guestThreadText(
  value: unknown,
  min: number,
  max: number,
  message: string,
) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max || text.includes('\u0000')) {
    throw new BadRequestException(message);
  }
  return text;
}

function guestOperationUuid(kind: string, ticketId: string, key: string) {
  const hex = createHash('sha256')
    .update(`${kind}:${ticketId}:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
