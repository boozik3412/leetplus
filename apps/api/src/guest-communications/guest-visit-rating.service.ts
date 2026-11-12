import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { VISIT_RATING_LOW_SCORE_MAX } from '../guest-portal/guest-visit-rating-callback';
import {
  VISIT_RATING_DELAY_MS,
  VISIT_RATING_LOOKBACK_MS,
  VISIT_RATING_MIN_SESSION_MINUTES,
  VISIT_RATING_REPEAT_DAYS,
  VISIT_RATING_SEND_HOURS,
} from './guest-visit-rating';

export const VISIT_RATING_PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const RECENT_LOW_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type VisitRatingSettingsDto = { enabled?: unknown };

export type VisitRatingStoreRow = {
  storeId: string;
  storeName: string;
  asked: number;
  answered: number;
  average: number | null;
  low: number;
};

export type VisitRatingLowAnswer = {
  id: string;
  score: number;
  answeredAt: string;
  visitEndedAt: string;
  storeName: string | null;
  guestId: string | null;
  guestName: string | null;
};

export type VisitRatingReport = {
  settings: {
    enabled: boolean;
    enabledAt: string | null;
    lastRunAt: string | null;
    sendHours: { from: number; to: number };
    delayMinutes: number;
    lookbackHours: number;
    minSessionMinutes: number;
    repeatDays: number;
  };
  scope: 'NETWORK' | 'STORES';
  periodDays: number;
  // Guests the bot can ask now: a bot chat, not unsubscribed, not staff.
  reachableGuests: number;
  totals: {
    asked: number;
    answered: number;
    average: number | null;
    low: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
  stores: VisitRatingStoreRow[];
  recentLow: VisitRatingLowAnswer[];
};

type AggregateRow = {
  storeId: string | null;
  storeName: string | null;
  asked: number;
  answered: number;
  scoreSum: number;
  low: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
};

@Injectable()
export class GuestVisitRatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScope: FreshStoreScopeService,
  ) {}

  async report(
    user: AuthenticatedUser,
    periodValue: unknown,
    now = new Date(),
  ): Promise<VisitRatingReport> {
    const scope = await this.freshStoreScope.resolve(user);
    const tenantId = scope.tenantId;
    const periodDays = parsePeriod(periodValue);
    const from = new Date(now.getTime() - periodDays * DAY_MS);
    const storeIds =
      scope.mode === 'STORES' ? [...scope.allowedStoreIds] : null;
    const storeFilter = storeIds
      ? storeIds.length
        ? Prisma.sql`AND r."storeId" IN (${Prisma.join(storeIds)})`
        : Prisma.sql`AND false`
      : Prisma.empty;

    const [settings, rows, recentLow, reachable] = await Promise.all([
      this.prisma.guestVisitRatingSettings.findUnique({
        where: { tenantId },
        select: { enabled: true, enabledAt: true, lastRunAt: true },
      }),
      this.prisma.$queryRaw<AggregateRow[]>`
        SELECT
          r."storeId" AS "storeId",
          max(st."name") AS "storeName",
          count(*)::int AS "asked",
          count(r."score")::int AS "answered",
          coalesce(sum(r."score"), 0)::int AS "scoreSum",
          count(*) FILTER (WHERE r."score" <= ${VISIT_RATING_LOW_SCORE_MAX})::int AS "low",
          count(*) FILTER (WHERE r."score" = 1)::int AS "s1",
          count(*) FILTER (WHERE r."score" = 2)::int AS "s2",
          count(*) FILTER (WHERE r."score" = 3)::int AS "s3",
          count(*) FILTER (WHERE r."score" = 4)::int AS "s4",
          count(*) FILTER (WHERE r."score" = 5)::int AS "s5"
        FROM public."GuestVisitRating" r
        LEFT JOIN public."Store" st
          ON st."id" = r."storeId" AND st."tenantId" = r."tenantId"
        WHERE r."tenantId" = ${tenantId}
          AND r."visitEndedAt" >=
            (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          ${storeFilter}
        GROUP BY r."storeId"
      `,
      this.prisma.guestVisitRating.findMany({
        where: {
          tenantId,
          visitEndedAt: { gte: from },
          score: { lte: VISIT_RATING_LOW_SCORE_MAX },
          ...(storeIds ? { storeId: { in: storeIds } } : {}),
        },
        orderBy: [{ answeredAt: 'desc' }, { id: 'asc' }],
        take: RECENT_LOW_LIMIT,
        select: {
          id: true,
          score: true,
          answeredAt: true,
          visitEndedAt: true,
          storeId: true,
          guestId: true,
          profile: { select: { displayName: true } },
        },
      }),
      this.reachableGuests(tenantId, storeIds),
    ]);

    const storeNames = new Map(
      rows.map((row) => [row.storeId, row.storeName] as const),
    );
    const missingStoreIds = [
      ...new Set(recentLow.map((row) => row.storeId)),
    ].filter((id): id is string => !!id && !storeNames.has(id));
    if (missingStoreIds.length) {
      const stores = await this.prisma.store.findMany({
        where: { tenantId, id: { in: missingStoreIds } },
        select: { id: true, name: true },
      });
      for (const store of stores) storeNames.set(store.id, store.name);
    }
    const guestIds = [
      ...new Set(recentLow.map((row) => row.guestId).filter(Boolean)),
    ] as string[];
    const guests = guestIds.length
      ? await this.prisma.guest.findMany({
          where: { tenantId, id: { in: guestIds } },
          select: { id: true, fullNameMasked: true },
        })
      : [];
    const guestNames = new Map(
      guests.map((guest) => [guest.id, guest.fullNameMasked] as const),
    );

    const totals = rows.reduce(
      (sum, row) => ({
        asked: sum.asked + row.asked,
        answered: sum.answered + row.answered,
        scoreSum: sum.scoreSum + row.scoreSum,
        low: sum.low + row.low,
        s1: sum.s1 + row.s1,
        s2: sum.s2 + row.s2,
        s3: sum.s3 + row.s3,
        s4: sum.s4 + row.s4,
        s5: sum.s5 + row.s5,
      }),
      {
        asked: 0,
        answered: 0,
        scoreSum: 0,
        low: 0,
        s1: 0,
        s2: 0,
        s3: 0,
        s4: 0,
        s5: 0,
      },
    );

    return {
      settings: {
        enabled: settings?.enabled === true,
        enabledAt: settings?.enabledAt?.toISOString() ?? null,
        lastRunAt: settings?.lastRunAt?.toISOString() ?? null,
        sendHours: { ...VISIT_RATING_SEND_HOURS },
        delayMinutes: VISIT_RATING_DELAY_MS / 60_000,
        lookbackHours: VISIT_RATING_LOOKBACK_MS / 3_600_000,
        minSessionMinutes: VISIT_RATING_MIN_SESSION_MINUTES,
        repeatDays: VISIT_RATING_REPEAT_DAYS,
      },
      scope: scope.mode,
      periodDays,
      reachableGuests: reachable,
      totals: {
        asked: totals.asked,
        answered: totals.answered,
        average: average(totals.scoreSum, totals.answered),
        low: totals.low,
        distribution: {
          '1': totals.s1,
          '2': totals.s2,
          '3': totals.s3,
          '4': totals.s4,
          '5': totals.s5,
        },
      },
      stores: rows
        .filter((row): row is AggregateRow & { storeId: string } =>
          Boolean(row.storeId),
        )
        .map((row) => ({
          storeId: row.storeId,
          storeName: row.storeName ?? 'Клуб удалён',
          asked: row.asked,
          answered: row.answered,
          average: average(row.scoreSum, row.answered),
          low: row.low,
        }))
        .sort(
          (a, b) =>
            (a.average ?? 6) - (b.average ?? 6) ||
            a.storeName.localeCompare(b.storeName, 'ru'),
        ),
      recentLow: recentLow
        .filter((row) => row.score !== null && row.answeredAt)
        .map((row) => ({
          id: row.id,
          score: row.score as number,
          answeredAt: (row.answeredAt as Date).toISOString(),
          visitEndedAt: row.visitEndedAt.toISOString(),
          storeName: row.storeId ? (storeNames.get(row.storeId) ?? null) : null,
          guestId: row.guestId,
          guestName:
            (row.guestId ? guestNames.get(row.guestId) : null) ??
            row.profile.displayName ??
            null,
        })),
    };
  }

  // Switching ratings on asks every guest after each visit, so it is a
  // network decision (fresh NETWORK scope on the route).
  async saveSettings(
    user: AuthenticatedUser,
    dto: VisitRatingSettingsDto,
    now = new Date(),
  ): Promise<VisitRatingReport> {
    if (typeof dto?.enabled !== 'boolean') {
      throw new BadRequestException('Укажите, включить оценку визита или нет.');
    }
    const tenantId = user.tenantId;
    const enabled = dto.enabled;
    await this.prisma.guestVisitRatingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled,
        enabledAt: enabled ? now : null,
        enabledByUserId: enabled ? user.id : null,
      },
      update: enabled
        ? { enabled, enabledAt: now, enabledByUserId: user.id }
        : { enabled },
    });
    return this.report(user, DEFAULT_PERIOD, now);
  }

  private async reachableGuests(tenantId: string, storeIds: string[] | null) {
    if (storeIds && !storeIds.length) return 0;
    const storeFilter = storeIds
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM public."GuestSession" s
          WHERE s."tenantId" = ${tenantId}
            AND s."guestId" = g."id"
            AND s."storeId" IN (${Prisma.join(storeIds)})
        )`
      : Prisma.empty;
    const [row] = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(DISTINCT p."telegramIdentity")::int AS "count"
      FROM public."GuestGameProfile" p
      JOIN public."Guest" g
        ON g."id" = p."guestId" AND g."tenantId" = p."tenantId"
      WHERE p."tenantId" = ${tenantId}
        AND p."telegramIdentity" LIKE 'chat:%'
        AND p."status" NOT IN ('ARCHIVED', 'SUPERSEDED', 'MERGED_TELEGRAM_AUTH', 'PENDING_TELEGRAM_AUTH')
        AND p."phoneConsentStatus"::text NOT IN ('UNSUBSCRIBED', 'DENIED')
        AND g."isStaff" = false
        AND g."isDisabled" = false
        AND g."crmStatus" <> 'DO_NOT_CONTACT'
        ${storeFilter}
    `;
    return row?.count ?? 0;
  }
}

function parsePeriod(value: unknown) {
  const days = Number(value);
  return VISIT_RATING_PERIODS.includes(days as 7 | 30 | 90)
    ? days
    : DEFAULT_PERIOD;
}

function average(sum: number, count: number) {
  return count ? Math.round((sum / count) * 100) / 100 : null;
}
