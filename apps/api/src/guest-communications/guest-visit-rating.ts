import { Prisma, TenantModule } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  visitRatingQuestion,
  visitRatingReplyMarkup,
} from '../guest-portal/guest-visit-rating-callback';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  TenantExecutionAdmissionService,
  TenantExecutionRequirement,
} from '../tenancy/tenant-execution-admission.service';
import { networkTimeZone } from '../guest-leaderboard/guest-leaderboard-core';
import { localHour } from './guest-telegram-automation';

// «Оценка визита»: after a guest's Langame session ends, the guest Telegram
// bot asks for a 1–5 rating of the visit. The worker only queues the question
// (GuestVisitRating row + VISIT_RATING outbox message); the bot poller sends
// it, and the guest's tap comes back through the public bot webhook.

/** The visit is over: no new session for this long after the last one. */
export const VISIT_RATING_DELAY_MS = 30 * 60 * 1000;
/** Do not ask about a visit that ended longer ago than this. */
export const VISIT_RATING_LOOKBACK_MS = 6 * 60 * 60 * 1000;
/** Shorter sessions are not a visit worth asking about. */
export const VISIT_RATING_MIN_SESSION_MINUTES = 20;
/** One question per guest per this many days. */
export const VISIT_RATING_REPEAT_DAYS = 7;
export const VISIT_RATING_RUN_INTERVAL_MS = 5 * 60 * 1000;
export const VISIT_RATING_MAX_PER_RUN = 300;
/** Local network hours when the bot may ask (from inclusive, to exclusive). */
export const VISIT_RATING_SEND_HOURS = { from: 11, to: 22 } as const;
export const VISIT_RATING_OUTBOX_KIND = 'VISIT_RATING' as const;

const DAY_MS = 24 * 60 * 60 * 1000;
// A visit can span the night; sessions that started earlier than this before
// the lookback window cannot be the guest's last one inside it.
const SESSION_START_HORIZON_MS = 36 * 60 * 60 * 1000;
const UNREACHABLE_PROFILE_STATUSES = [
  'ARCHIVED',
  'SUPERSEDED',
  'MERGED_TELEGRAM_AUTH',
  'PENDING_TELEGRAM_AUTH',
];

const SEND_REQUIREMENTS = [
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const satisfies readonly TenantExecutionRequirement[];

type Prisma$ = Pick<
  PrismaService,
  | '$queryRaw'
  | '$transaction'
  | 'guestVisitRating'
  | 'guestVisitRatingSettings'
  | 'guestTelegramOutboxMessage'
  | 'store'
>;

export type VisitRatingCandidate = {
  sessionId: string;
  guestId: string;
  storeId: string;
  storeName: string | null;
  stoppedAt: Date;
  profileId: string;
  telegramIdentity: string;
};

export function visitRatingSourceKey(ratingId: string) {
  return `visit-rating:${ratingId}`;
}

export function withinVisitRatingHours(now: Date, timeZone: string) {
  const hour = localHour(now, timeZone);
  return (
    hour >= VISIT_RATING_SEND_HOURS.from && hour < VISIT_RATING_SEND_HOURS.to
  );
}

/**
 * Guests whose last Langame session ended 30 minutes to 6 hours ago, with a
 * reachable bot chat, not asked in the last 7 days. Staff, disabled guests,
 * «не связываться» and unsubscribed chats are never asked. One row per chat.
 */
export async function findVisitRatingCandidates(
  prisma: Pick<PrismaService, '$queryRaw'>,
  input: { tenantId: string; now: Date; limit: number },
): Promise<VisitRatingCandidate[]> {
  const { tenantId, now, limit } = input;
  const utc = (date: Date) =>
    Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const endedAfter = new Date(now.getTime() - VISIT_RATING_LOOKBACK_MS);
  const endedBefore = new Date(now.getTime() - VISIT_RATING_DELAY_MS);
  const startedAfter = new Date(
    endedAfter.getTime() - SESSION_START_HORIZON_MS,
  );
  const askedAfter = new Date(
    now.getTime() - VISIT_RATING_REPEAT_DAYS * DAY_MS,
  );
  const rows = await prisma.$queryRaw<VisitRatingCandidate[]>`
    WITH last_session AS (
      SELECT DISTINCT ON (s."guestId")
        s."id", s."guestId", s."storeId", s."startedAt", s."stoppedAt"
      FROM public."GuestSession" s
      WHERE s."tenantId" = ${tenantId}
        AND s."guestId" IS NOT NULL
        AND s."startedAt" > ${utc(startedAfter)}
        AND s."startedAt" <= ${utc(now)}
      ORDER BY s."guestId", s."startedAt" DESC, s."id" DESC
    )
    SELECT
      ls."id" AS "sessionId",
      ls."guestId" AS "guestId",
      ls."storeId" AS "storeId",
      st."name" AS "storeName",
      ls."stoppedAt" AS "stoppedAt",
      p."id" AS "profileId",
      p."telegramIdentity" AS "telegramIdentity"
    FROM last_session ls
    JOIN public."Guest" g
      ON g."id" = ls."guestId" AND g."tenantId" = ${tenantId}
    JOIN public."Store" st
      ON st."id" = ls."storeId" AND st."tenantId" = ${tenantId}
    JOIN LATERAL (
      SELECT p."id", p."telegramIdentity"
      FROM public."GuestGameProfile" p
      WHERE p."tenantId" = ${tenantId}
        AND p."guestId" = ls."guestId"
        AND p."telegramIdentity" LIKE 'chat:%'
        AND p."status" NOT IN (${Prisma.join(UNREACHABLE_PROFILE_STATUSES)})
        AND p."phoneConsentStatus"::text NOT IN ('UNSUBSCRIBED', 'DENIED')
      ORDER BY p."updatedAt" DESC, p."id"
      LIMIT 1
    ) p ON true
    WHERE ls."stoppedAt" IS NOT NULL
      AND ls."stoppedAt" > ${utc(endedAfter)}
      AND ls."stoppedAt" <= ${utc(endedBefore)}
      AND ls."stoppedAt" - ls."startedAt"
        >= make_interval(mins => ${VISIT_RATING_MIN_SESSION_MINUTES}::int)
      AND g."isStaff" = false
      AND g."isDisabled" = false
      AND g."crmStatus" <> 'DO_NOT_CONTACT'
      AND NOT EXISTS (
        SELECT 1 FROM public."GuestVisitRating" r
        WHERE r."tenantId" = ${tenantId}
          AND (r."guestSessionId" = ls."id"
            OR (r."profileId" = p."id" AND r."askedAt" > ${utc(askedAfter)}))
      )
    ORDER BY ls."stoppedAt", ls."id"
    LIMIT ${limit * 2}
  `;
  const seenChats = new Set<string>();
  const candidates: VisitRatingCandidate[] = [];
  for (const row of rows) {
    if (seenChats.has(row.telegramIdentity)) continue;
    seenChats.add(row.telegramIdentity);
    candidates.push(row);
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export type VisitRatingRunLogger = {
  log: (message: string) => void;
  warn: (message: string) => void;
};

export type VisitRatingRunResult = {
  tenants: number;
  queued: number;
  failed: string[];
};

/**
 * One worker pass over every network with visit ratings switched on: at most
 * every 5 minutes per network, only in the network's daytime, at most 300
 * questions per pass. A failure of one network does not stop the others.
 */
export async function runVisitRatingAsksOnce(
  services: {
    prisma: Prisma$;
    admission: Pick<TenantExecutionAdmissionService, 'evaluate'>;
  },
  now: Date,
  logger: VisitRatingRunLogger,
): Promise<VisitRatingRunResult> {
  const { prisma, admission } = services;
  const result: VisitRatingRunResult = { tenants: 0, queued: 0, failed: [] };
  const settings = await prisma.guestVisitRatingSettings.findMany({
    where: { enabled: true },
    select: { tenantId: true, enabledByUserId: true, lastRunAt: true },
    orderBy: { tenantId: 'asc' },
  });

  for (const tenant of settings) {
    if (
      tenant.lastRunAt &&
      now.getTime() - tenant.lastRunAt.getTime() < VISIT_RATING_RUN_INTERVAL_MS
    ) {
      continue;
    }
    try {
      const timeZone = networkTimeZone(
        await prisma.store.findMany({
          where: { tenantId: tenant.tenantId },
          select: { name: true, timeZone: true },
        }),
      );
      if (!withinVisitRatingHours(now, timeZone)) continue;
      const decision = await admission.evaluate(
        tenant.tenantId,
        SEND_REQUIREMENTS,
        now,
      );
      if (!decision.allowed) continue;

      result.tenants += 1;
      const candidates = await findVisitRatingCandidates(prisma, {
        tenantId: tenant.tenantId,
        now,
        limit: VISIT_RATING_MAX_PER_RUN,
      });
      let queued = 0;
      if (candidates.length) {
        queued = await queueVisitRatings(prisma, {
          tenantId: tenant.tenantId,
          createdByUserId: tenant.enabledByUserId,
          candidates,
          now,
        });
      }
      await prisma.guestVisitRatingSettings.updateMany({
        where: { tenantId: tenant.tenantId, enabled: true },
        data: { lastRunAt: now },
      });
      result.queued += queued;
      if (queued > 0) {
        logger.log(`Visit ratings ${tenant.tenantId}: asked ${queued} guests`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Visit ratings ${tenant.tenantId} failed: ${message}`);
      result.failed.push(tenant.tenantId);
    }
  }
  return result;
}

/**
 * Stores one question per candidate and queues its bot message in the same
 * transaction. A session asked about meanwhile (unique per session) is
 * skipped together with its message.
 */
export async function queueVisitRatings(
  prisma: Prisma$,
  input: {
    tenantId: string;
    createdByUserId: string | null;
    candidates: VisitRatingCandidate[];
    now: Date;
  },
) {
  const { tenantId, createdByUserId, candidates, now } = input;
  const byId = new Map<string, VisitRatingCandidate>(
    candidates.map((candidate) => [randomUUID(), candidate]),
  );
  return prisma.$transaction(async (tx) => {
    const created = await tx.guestVisitRating.createManyAndReturn({
      data: [...byId].map(([id, candidate]) => ({
        id,
        tenantId,
        storeId: candidate.storeId,
        profileId: candidate.profileId,
        guestId: candidate.guestId,
        guestSessionId: candidate.sessionId,
        visitEndedAt: candidate.stoppedAt,
        askedAt: now,
      })),
      select: { id: true },
      skipDuplicates: true,
    });
    if (!created.length) return 0;
    const messages = await tx.guestTelegramOutboxMessage.createMany({
      data: created.map(({ id }) => {
        const candidate = byId.get(id)!;
        return {
          tenantId,
          storeId: candidate.storeId,
          profileId: candidate.profileId,
          kind: VISIT_RATING_OUTBOX_KIND,
          sourceKey: visitRatingSourceKey(id),
          text: visitRatingQuestion(candidate.storeName),
          replyMarkup: visitRatingReplyMarkup(id),
          createdByUserId,
          nextAttemptAt: now,
        };
      }),
      skipDuplicates: true,
    });
    return messages.count;
  });
}
