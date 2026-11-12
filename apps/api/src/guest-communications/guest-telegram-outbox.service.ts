import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, TenantModule } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionService,
  type TenantExecutionRequirement,
} from '../tenancy/tenant-execution-admission.service';

// Messages LeetPlus sends to a guest through the guest Telegram bot. The
// corporate API only queues rows here; the bot poller on the Telegram edge
// (the one process with Telegram egress) claims them by service token, sends
// them and reports the outcome.

export const GUEST_TELEGRAM_OUTBOX_KINDS = [
  'SUPPORT_REPLY',
  // Club news from a marketing campaign: every guest who has not unsubscribed.
  'CAMPAIGN_NEWS',
  // Promotions: only guests who said yes in the bot («Акции клуба»).
  'CAMPAIGN_PROMO',
  // «Оценка визита» after a Langame session; respects the unsubscribe.
  'VISIT_RATING',
] as const;
export type GuestTelegramOutboxKind =
  (typeof GUEST_TELEGRAM_OUTBOX_KINDS)[number];

export const GUEST_TELEGRAM_OUTBOX_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'BLOCKED',
  'SKIPPED',
] as const;
export type GuestTelegramOutboxStatus =
  (typeof GUEST_TELEGRAM_OUTBOX_STATUSES)[number];

// Telegram allows 4096 characters per message; the rest is headroom for the
// club signature added around staff text.
export const GUEST_TELEGRAM_OUTBOX_TEXT_MAX = 4000;
export const GUEST_TELEGRAM_OUTBOX_MAX_ATTEMPTS = 5;
export const GUEST_TELEGRAM_OUTBOX_LEASE_MS = 2 * 60 * 1000;
export const GUEST_TELEGRAM_OUTBOX_CLAIM_MAX = 50;
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 30 * 60 * 1000;
const RETRY_AFTER_MAX_SECONDS = 3600;
const ERROR_CODE_MAX = 64;

const OUTBOX_SEND_REQUIREMENTS = [
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const satisfies readonly TenantExecutionRequirement[];

const TELEGRAM_CHAT_IDENTITY = /^chat:(-?\d{1,20})$/;
export const GUEST_TELEGRAM_CAMPAIGN_CONTACT_CHANNEL = 'Telegram-бот';
const INACTIVE_PROFILE_STATUSES = new Set([
  'ARCHIVED',
  'SUPERSEDED',
  'MERGED_TELEGRAM_AUTH',
]);

export type GuestTelegramOutboxEnqueueInput = {
  tenantId: string;
  storeId: string | null;
  profileId: string;
  kind: GuestTelegramOutboxKind;
  sourceKey: string;
  text: string;
  replyMarkup?: Prisma.InputJsonValue | null;
  supportTicketId?: string | null;
  supportCommentId?: string | null;
  marketingCampaignId?: string | null;
  createdByUserId?: string | null;
};

export type GuestTelegramOutboxClaimDto = { limit?: unknown };

export type GuestTelegramOutboxClaimedMessage = {
  id: string;
  claimToken: string;
  chatId: string;
  text: string;
  replyMarkup: Prisma.JsonValue | null;
};

export type GuestTelegramOutboxClaimResult = {
  messages: GuestTelegramOutboxClaimedMessage[];
  skipped: number;
};

export const GUEST_TELEGRAM_OUTBOX_OUTCOMES = [
  'SENT',
  'RETRY',
  'FAILED',
  'BLOCKED',
] as const;
export type GuestTelegramOutboxOutcome =
  (typeof GUEST_TELEGRAM_OUTBOX_OUTCOMES)[number];

export type GuestTelegramOutboxReportDto = {
  results?: unknown;
};

export type GuestTelegramOutboxReportResult = {
  applied: number;
  ignored: number;
};

type ParsedReport = {
  id: string;
  claimToken: string;
  outcome: GuestTelegramOutboxOutcome;
  telegramMessageId: string | null;
  errorCode: string | null;
  retryAfterSeconds: number | null;
};

type OutboxWriter = Pick<
  Prisma.TransactionClient,
  'guestTelegramOutboxMessage'
>;

@Injectable()
export class GuestTelegramOutboxService {
  private readonly logger = new Logger(GuestTelegramOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantExecutionAdmission: TenantExecutionAdmissionService,
  ) {}

  // Idempotent by (tenantId, sourceKey): queuing the same staff reply twice
  // keeps one message.
  async enqueue(db: OutboxWriter, input: GuestTelegramOutboxEnqueueInput) {
    const text = input.text.trim();
    if (!text) {
      throw new BadRequestException('Пустое сообщение для Telegram.');
    }
    await db.guestTelegramOutboxMessage.createMany({
      data: [
        {
          tenantId: input.tenantId,
          storeId: input.storeId,
          profileId: input.profileId,
          kind: input.kind,
          sourceKey: input.sourceKey,
          text: text.slice(0, GUEST_TELEGRAM_OUTBOX_TEXT_MAX),
          replyMarkup: input.replyMarkup ?? Prisma.DbNull,
          supportTicketId: input.supportTicketId ?? null,
          supportCommentId: input.supportCommentId ?? null,
          marketingCampaignId: input.marketingCampaignId ?? null,
          createdByUserId: input.createdByUserId ?? null,
        },
      ],
      skipDuplicates: true,
    });
  }

  async claim(
    dto: GuestTelegramOutboxClaimDto,
    now = new Date(),
  ): Promise<GuestTelegramOutboxClaimResult> {
    const limit = claimLimit(dto?.limit);
    const candidates = await this.prisma.guestTelegramOutboxMessage.findMany({
      where: {
        OR: [
          { status: 'QUEUED', nextAttemptAt: { lte: now } },
          // A poller that died mid-send leaves its lease behind.
          { status: 'SENDING', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true, status: true, attempts: true },
    });

    const claimed: Array<{ id: string; claimToken: string }> = [];
    for (const candidate of candidates) {
      const claimToken = randomUUID();
      const updated = await this.prisma.guestTelegramOutboxMessage.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          attempts: candidate.attempts,
        },
        data: {
          status: 'SENDING',
          claimToken,
          leaseExpiresAt: new Date(
            now.getTime() + GUEST_TELEGRAM_OUTBOX_LEASE_MS,
          ),
          attempts: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        claimed.push({ id: candidate.id, claimToken });
      }
    }
    if (!claimed.length) {
      return { messages: [], skipped: 0 };
    }

    const rows = await this.prisma.guestTelegramOutboxMessage.findMany({
      where: { id: { in: claimed.map((row) => row.id) } },
      select: {
        id: true,
        tenantId: true,
        kind: true,
        text: true,
        replyMarkup: true,
        profile: {
          select: {
            telegramIdentity: true,
            status: true,
            phoneConsentStatus: true,
            promoConsentStatus: true,
          },
        },
      },
    });
    const tokens = new Map(claimed.map((row) => [row.id, row.claimToken]));
    const tenantAllowed = new Map<string, boolean>();
    const messages: GuestTelegramOutboxClaimedMessage[] = [];
    let skipped = 0;

    for (const row of rows) {
      const claimToken = tokens.get(row.id);
      if (!claimToken) continue;

      if (!tenantAllowed.has(row.tenantId)) {
        const decision = await this.tenantExecutionAdmission.evaluate(
          row.tenantId,
          OUTBOX_SEND_REQUIREMENTS,
          now,
        );
        tenantAllowed.set(row.tenantId, decision.allowed);
      }

      const skipReason = outboxSkipReason(row, tenantAllowed.get(row.tenantId));
      const chatId = row.profile.telegramIdentity?.match(
        TELEGRAM_CHAT_IDENTITY,
      )?.[1];
      if (skipReason || !chatId) {
        skipped += 1;
        await this.prisma.guestTelegramOutboxMessage.updateMany({
          where: { id: row.id, claimToken, status: 'SENDING' },
          data: {
            status:
              skipReason === 'TENANT_OUTBOUND_DENIED' ? 'BLOCKED' : 'SKIPPED',
            lastErrorCode: skipReason ?? 'NO_TELEGRAM_CHAT',
            claimToken: null,
            leaseExpiresAt: null,
          },
        });
        continue;
      }

      messages.push({
        id: row.id,
        claimToken,
        chatId,
        text: row.text,
        replyMarkup: row.replyMarkup ?? null,
      });
    }

    return { messages, skipped };
  }

  async report(
    dto: GuestTelegramOutboxReportDto,
    now = new Date(),
  ): Promise<GuestTelegramOutboxReportResult> {
    const reports = parseReports(dto?.results);
    let applied = 0;
    let ignored = 0;

    for (const report of reports) {
      const row = await this.prisma.guestTelegramOutboxMessage.findFirst({
        where: {
          id: report.id,
          claimToken: report.claimToken,
          status: 'SENDING',
        },
        select: {
          attempts: true,
          tenantId: true,
          marketingCampaignId: true,
          createdByUserId: true,
          profile: { select: { guestId: true } },
        },
      });
      if (!row) {
        ignored += 1;
        continue;
      }

      const data = reportUpdate(report, row.attempts, now);
      const updated = await this.prisma.guestTelegramOutboxMessage.updateMany({
        where: {
          id: report.id,
          claimToken: report.claimToken,
          status: 'SENDING',
        },
        data,
      });
      if (updated.count === 1) {
        applied += 1;
        if (report.outcome === 'SENT' && row.marketingCampaignId) {
          // The message is already delivered; a failed journal write must
          // not fail the poller's report for the rest of the batch.
          await this.recordCampaignContact(row, now).catch((error: unknown) =>
            this.logger.warn(
              `Campaign contact for outbox ${report.id} not recorded: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      } else {
        ignored += 1;
      }
    }

    return { applied, ignored };
  }

  // A delivered campaign message is a contact in the campaign's «Эффект»
  // (no result: delivery is not a reply from the guest).
  private async recordCampaignContact(
    row: {
      tenantId: string;
      marketingCampaignId: string | null;
      createdByUserId: string | null;
      profile: { guestId: string | null };
    },
    now: Date,
  ) {
    if (!row.marketingCampaignId || !row.profile.guestId) return;
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id: row.marketingCampaignId, tenantId: row.tenantId },
      select: { audienceId: true },
    });
    if (!campaign) return;
    await this.prisma.guestCrmContactEvent.create({
      data: {
        tenantId: row.tenantId,
        guestId: row.profile.guestId,
        audienceId: campaign.audienceId,
        marketingCampaignId: row.marketingCampaignId,
        createdByUserId: row.createdByUserId,
        channel: GUEST_TELEGRAM_CAMPAIGN_CONTACT_CHANNEL,
        note: 'Рассылка доставлена в Telegram.',
        contactedAt: now,
      },
    });
  }
}

function outboxSkipReason(
  row: {
    kind: string;
    profile: {
      status: string;
      phoneConsentStatus: string;
      promoConsentStatus: string;
    };
  },
  tenantAllowed: boolean | undefined,
) {
  if (!tenantAllowed) return 'TENANT_OUTBOUND_DENIED';
  if (INACTIVE_PROFILE_STATUSES.has(row.profile.status)) {
    return 'PROFILE_INACTIVE';
  }
  // A staff reply answers the guest's own message; anything else respects
  // the guest's unsubscribe.
  if (
    row.kind !== 'SUPPORT_REPLY' &&
    (row.profile.phoneConsentStatus === 'UNSUBSCRIBED' ||
      row.profile.phoneConsentStatus === 'DENIED')
  ) {
    return 'GUEST_UNSUBSCRIBED';
  }
  // The guest may have withdrawn the promo "yes" after the campaign queued.
  if (
    row.kind === 'CAMPAIGN_PROMO' &&
    row.profile.promoConsentStatus !== 'GRANTED'
  ) {
    return 'NO_PROMO_CONSENT';
  }
  return null;
}

function reportUpdate(
  report: ParsedReport,
  attempts: number,
  now: Date,
): Prisma.GuestTelegramOutboxMessageUpdateManyMutationInput {
  const released = { claimToken: null, leaseExpiresAt: null };
  switch (report.outcome) {
    case 'SENT':
      return {
        ...released,
        status: 'SENT',
        sentAt: now,
        telegramMessageId: report.telegramMessageId,
        lastErrorCode: null,
      };
    case 'BLOCKED':
      return {
        ...released,
        status: 'BLOCKED',
        lastErrorCode: report.errorCode ?? 'TELEGRAM_BLOCKED',
      };
    case 'FAILED':
      return {
        ...released,
        status: 'FAILED',
        lastErrorCode: report.errorCode ?? 'TELEGRAM_FAILED',
      };
    case 'RETRY': {
      if (attempts >= GUEST_TELEGRAM_OUTBOX_MAX_ATTEMPTS) {
        return {
          ...released,
          status: 'FAILED',
          lastErrorCode: report.errorCode ?? 'TELEGRAM_RETRY_EXHAUSTED',
        };
      }
      const backoffMs = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1),
      );
      const retryAfterMs = (report.retryAfterSeconds ?? 0) * 1000;
      return {
        ...released,
        status: 'QUEUED',
        nextAttemptAt: new Date(
          now.getTime() + Math.max(backoffMs, retryAfterMs),
        ),
        lastErrorCode: report.errorCode ?? 'TELEGRAM_RETRY',
      };
    }
  }
}

function claimLimit(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(GUEST_TELEGRAM_OUTBOX_CLAIM_MAX, Math.trunc(parsed));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReports(value: unknown): ParsedReport[] {
  if (!Array.isArray(value) || value.length > GUEST_TELEGRAM_OUTBOX_CLAIM_MAX) {
    throw new BadRequestException('results must be an array of at most 50.');
  }
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const claimToken = typeof row.claimToken === 'string' ? row.claimToken : '';
    const outcome = row.outcome;
    if (
      !UUID.test(id) ||
      !UUID.test(claimToken) ||
      !GUEST_TELEGRAM_OUTBOX_OUTCOMES.includes(
        outcome as GuestTelegramOutboxOutcome,
      )
    ) {
      throw new BadRequestException('Invalid outbox report.');
    }
    return {
      id,
      claimToken,
      outcome: outcome as GuestTelegramOutboxOutcome,
      telegramMessageId: boundedToken(row.telegramMessageId, 32),
      errorCode: boundedToken(row.errorCode, ERROR_CODE_MAX),
      retryAfterSeconds: retryAfter(row.retryAfterSeconds),
    };
  });
}

function boundedToken(value: unknown, max: number) {
  const text =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  return text && /^[A-Za-z0-9_.:-]+$/.test(text) ? text.slice(0, max) : null;
}

function retryAfter(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(RETRY_AFTER_MAX_SECONDS, Math.trunc(parsed));
}
