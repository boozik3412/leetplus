import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const statisticsGranularities = ['DAY', 'WEEK', 'MONTH'] as const;
const statisticsSourceKinds = [
  'LOOT_BOX',
  'MISSION',
  'CHECK_IN',
  'BATTLE_PASS',
  'OTHER',
] as const;
const trustedActivitySources = [
  'LANGAME',
  'API_IMPORT',
  'SYSTEM',
  'CHECK_IN',
] as const;
const bonusRewardTypes = [
  'BONUS',
  'BONUS_POINTS',
  'BONUS_BALANCE',
  'LOYALTY_BONUS',
] as const;
const maximumStatisticsRangeMs = 730 * 24 * 60 * 60 * 1000;

export type GuestGamificationStatisticsGranularity =
  (typeof statisticsGranularities)[number];
export type GuestGamificationStatisticsSourceKind =
  (typeof statisticsSourceKinds)[number];

export type GuestGamificationStatisticsQuery = {
  from?: string;
  to?: string;
  granularity?: string;
  storeIds?: string;
  rewardTypes?: string;
  sourceKinds?: string;
};

export type GuestGamificationStatisticsComparison = {
  current: number;
  previous: number;
  delta: number;
  trendPercent: number | null;
};

export type GuestGamificationStatistics = {
  meta: {
    generatedAt: string;
    latestDataAt: string | null;
    timeZone: string;
    timeZoneSource: 'SELECTED_STORE' | 'PRIMARY_STORE' | 'UTC_FALLBACK';
    granularity: GuestGamificationStatisticsGranularity;
    period: { from: string; to: string };
    previousPeriod: { from: string; to: string };
    filters: {
      stores: Array<{ id: string; name: string }>;
      rewardTypes: string[];
      sourceKinds: GuestGamificationStatisticsSourceKind[];
    };
    scopeNote: string | null;
  };
  summary: {
    registrations: GuestGamificationStatisticsComparison;
    activeUsers: GuestGamificationStatisticsComparison;
    deliveredRewards: GuestGamificationStatisticsComparison;
    confirmedBonuses: GuestGamificationStatisticsComparison & {
      operations: number;
      previousOperations: number;
    };
    otherDeliveredRewards: number;
  };
  series: Array<{
    bucketStart: string;
    registrations: number;
    activeUsers: number;
    deliveredRewards: number;
    confirmedBonusAmount: number;
    confirmedBonusOperations: number;
  }>;
  rewardTypes: Array<{
    type: string;
    label: string;
    count: number;
    amount: number;
  }>;
  sources: Array<{
    sourceKind: GuestGamificationStatisticsSourceKind;
    label: string;
    count: number;
  }>;
  lifecycle: {
    qualified: number;
    claimed: number;
    delivered: number;
  };
  definitions: Array<{
    key: string;
    label: string;
    description: string;
  }>;
};

type SeriesRow = {
  bucketStart: string;
  registrations?: number;
  activeUsers?: number;
  deliveredRewards?: number;
  confirmedBonusAmount?: number;
  confirmedBonusOperations?: number;
};

type ComparisonRow = {
  current: number;
  previous: number;
};

type RewardComparisonRow = ComparisonRow & {
  qualified: number;
  claimed: number;
  delivered: number;
  otherDelivered: number;
};

type BonusComparisonRow = {
  current: number;
  previous: number;
  currentOperations: number;
  previousOperations: number;
};

type RewardTypeRow = {
  type: string;
  count: number;
  amount: number;
};

type SourceRow = {
  sourceKind: GuestGamificationStatisticsSourceKind;
  count: number;
};

type FreshnessRow = { latestDataAt: Date | null };

@Injectable()
export class GuestGamificationStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(
    user: AuthenticatedUser,
    query: GuestGamificationStatisticsQuery = {},
  ): Promise<GuestGamificationStatistics> {
    const range = resolveStatisticsRange(query);
    const requestedStoreIds = csvValues(query.storeIds, 50);
    const rewardTypes = csvValues(query.rewardTypes, 40).map((value) =>
      value.toUpperCase(),
    );
    const sourceKinds = resolveSourceKinds(query.sourceKinds);
    const stores = await this.resolveStores(user, requestedStoreIds);
    const timeZone = resolveStatisticsTimeZone(stores.selected, stores.all);
    const sql = statisticsSqlFragments({
      tenantId: user.tenantId,
      range,
      timeZone: timeZone.value,
      storeIds: stores.selected.map((store) => store.id),
      rewardTypes,
      sourceKinds,
    });

    const [
      profileSeries,
      rewardSeries,
      bonusSeries,
      registrationComparisonRows,
      activeComparisonRows,
      rewardComparisonRows,
      bonusComparisonRows,
      rewardTypeRows,
      sourceRows,
      freshnessRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<SeriesRow[]>(sql.profileSeries),
      this.prisma.$queryRaw<SeriesRow[]>(sql.rewardSeries),
      this.prisma.$queryRaw<SeriesRow[]>(sql.bonusSeries),
      this.prisma.$queryRaw<ComparisonRow[]>(sql.registrationComparison),
      this.prisma.$queryRaw<ComparisonRow[]>(sql.activeComparison),
      this.prisma.$queryRaw<RewardComparisonRow[]>(sql.rewardComparison),
      this.prisma.$queryRaw<BonusComparisonRow[]>(sql.bonusComparison),
      this.prisma.$queryRaw<RewardTypeRow[]>(sql.rewardTypes),
      this.prisma.$queryRaw<SourceRow[]>(sql.sources),
      this.prisma.$queryRaw<FreshnessRow[]>(sql.freshness),
    ]);

    const registrationComparison = firstRow(registrationComparisonRows, {
      current: 0,
      previous: 0,
    });
    const activeComparison = firstRow(activeComparisonRows, {
      current: 0,
      previous: 0,
    });
    const rewardComparison = firstRow(rewardComparisonRows, {
      current: 0,
      previous: 0,
      qualified: 0,
      claimed: 0,
      delivered: 0,
      otherDelivered: 0,
    });
    const bonusComparison = firstRow(bonusComparisonRows, {
      current: 0,
      previous: 0,
      currentOperations: 0,
      previousOperations: 0,
    });

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        latestDataAt: freshnessRows[0]?.latestDataAt?.toISOString() ?? null,
        timeZone: timeZone.value,
        timeZoneSource: timeZone.source,
        granularity: range.granularity,
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
        previousPeriod: {
          from: range.previousFrom.toISOString(),
          to: range.from.toISOString(),
        },
        filters: {
          stores: stores.selected.map(({ id, name }) => ({ id, name })),
          rewardTypes,
          sourceKinds,
        },
        scopeNote:
          stores.selected.length > 0
            ? 'Регистрации привязаны к выбранным клубам по первому доступному игровому факту. События без клубного измерения остаются только в общей статистике сети.'
            : null,
      },
      summary: {
        registrations: comparison(registrationComparison),
        activeUsers: comparison(activeComparison),
        deliveredRewards: comparison(rewardComparison),
        confirmedBonuses: {
          ...comparison({
            current: bonusComparison.current,
            previous: bonusComparison.previous,
          }),
          operations: numeric(bonusComparison.currentOperations),
          previousOperations: numeric(bonusComparison.previousOperations),
        },
        otherDeliveredRewards: numeric(rewardComparison.otherDelivered),
      },
      series: mergeSeries(profileSeries, rewardSeries, bonusSeries),
      rewardTypes: rewardTypeRows.map((row) => ({
        type: row.type,
        label: rewardTypeLabel(row.type),
        count: numeric(row.count),
        amount: numeric(row.amount),
      })),
      sources: sourceRows.map((row) => ({
        sourceKind: row.sourceKind,
        label: sourceKindLabel(row.sourceKind),
        count: numeric(row.count),
      })),
      lifecycle: {
        qualified: numeric(rewardComparison.qualified),
        claimed: numeric(rewardComparison.claimed),
        delivered: numeric(rewardComparison.delivered),
      },
      definitions: statisticsDefinitions,
    };
  }

  private async resolveStores(user: AuthenticatedUser, requested: string[]) {
    const all = await this.prisma.store.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, timeZone: true },
      orderBy: { name: 'asc' },
    });
    const selected = requested.length
      ? all.filter((store) => requested.includes(store.id))
      : [];

    if (selected.length !== requested.length) {
      throw new BadRequestException('Один или несколько клубов не найдены.');
    }

    return { all, selected };
  }
}

const statisticsDefinitions = [
  {
    key: 'registrations',
    label: 'Регистрации',
    description:
      'Новые игровые профили, созданные в периоде. Тестовые профили сотрудников исключены.',
  },
  {
    key: 'activeUsers',
    label: 'Активные пользователи',
    description:
      'Уникальные активированные игровые профили хотя бы с одним доверенным игровым событием в периоде. Ручные события не учитываются.',
  },
  {
    key: 'deliveredRewards',
    label: 'Выданные награды',
    description:
      'Уникальные награды с финальным статусом PAID по времени фактической выдачи. Wallet и ledger повторно не суммируются.',
  },
  {
    key: 'confirmedBonuses',
    label: 'Выданные бонусы',
    description:
      'Сумма подтвержденных операций EARN из GAMIFICATION в bonus ledger. Ожидающие и ошибочные операции не учитываются.',
  },
] satisfies GuestGamificationStatistics['definitions'];

function resolveStatisticsRange(query: GuestGamificationStatisticsQuery) {
  const to = parseDate(query.to) ?? new Date();
  const from =
    parseDate(query.from) ?? new Date(to.getTime() - 30 * 86_400_000);

  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException(
      'Начало периода должно быть раньше окончания.',
    );
  }
  if (to.getTime() - from.getTime() > maximumStatisticsRangeMs) {
    throw new BadRequestException(
      'Период статистики не может превышать 730 дней.',
    );
  }

  const requested = query.granularity?.trim().toUpperCase();
  const duration = to.getTime() - from.getTime();
  const automatic =
    duration <= 45 * 86_400_000
      ? 'DAY'
      : duration <= 240 * 86_400_000
        ? 'WEEK'
        : 'MONTH';
  const granularity = statisticsGranularities.includes(
    requested as GuestGamificationStatisticsGranularity,
  )
    ? (requested as GuestGamificationStatisticsGranularity)
    : automatic;

  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - duration),
    granularity,
  };
}

function parseDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException('Некорректная дата периода статистики.');
  }
  return date;
}

function csvValues(value: string | undefined, limit: number) {
  if (!value?.trim()) return [];
  const result = [...new Set(value.split(',').map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, limit);
  return result;
}

function resolveSourceKinds(value: string | undefined) {
  const requested = csvValues(value, statisticsSourceKinds.length).map((item) =>
    item.toUpperCase(),
  );
  const invalid = requested.find(
    (item) =>
      !statisticsSourceKinds.includes(
        item as GuestGamificationStatisticsSourceKind,
      ),
  );
  if (invalid) {
    throw new BadRequestException(`Неизвестный источник награды: ${invalid}.`);
  }
  return requested as GuestGamificationStatisticsSourceKind[];
}

function resolveStatisticsTimeZone(
  selected: Array<{ timeZone: string | null }>,
  all: Array<{ timeZone: string | null }>,
) {
  const selectedTimeZones = [
    ...new Set(selected.map((item) => item.timeZone)),
  ].filter((value): value is string => validTimeZone(value));
  if (selectedTimeZones.length === 1) {
    return {
      value: selectedTimeZones[0],
      source: 'SELECTED_STORE' as const,
    };
  }

  const primary = all.find((item) => validTimeZone(item.timeZone))?.timeZone;
  return primary
    ? { value: primary, source: 'PRIMARY_STORE' as const }
    : { value: 'UTC', source: 'UTC_FALLBACK' as const };
}

function validTimeZone(value: string | null): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function statisticsSqlFragments(input: {
  tenantId: string;
  range: ReturnType<typeof resolveStatisticsRange>;
  timeZone: string;
  storeIds: string[];
  rewardTypes: string[];
  sourceKinds: GuestGamificationStatisticsSourceKind[];
}) {
  const { tenantId, range, timeZone, storeIds, rewardTypes, sourceKinds } =
    input;
  const truncUnit = Prisma.raw(`'${range.granularity.toLowerCase()}'`);
  const step = Prisma.raw(
    range.granularity === 'DAY'
      ? "interval '1 day'"
      : range.granularity === 'WEEK'
        ? "interval '1 week'"
        : "interval '1 month'",
  );
  const bucketCte = Prisma.sql`
    buckets AS (
      SELECT generate_series(
        date_trunc(${truncUnit}, ${range.from}::timestamptz AT TIME ZONE ${timeZone}),
        date_trunc(${truncUnit}, (${range.to}::timestamptz - interval '1 millisecond') AT TIME ZONE ${timeZone}),
        ${step}
      ) AS bucket
    )`;
  const eventStorePredicate = storeIds.length
    ? Prisma.sql`AND (
        event_row."payload" ->> 'storeId' IN (${Prisma.join(storeIds)})
        OR event_row."payload" ->> 'selectedStoreId' IN (${Prisma.join(storeIds)})
        OR EXISTS (
          SELECT 1 FROM "GuestGameRuleDecision" scope_decision
          WHERE scope_decision."eventId" = event_row.id
            AND scope_decision."storeId" IN (${Prisma.join(storeIds)})
        )
      )`
    : Prisma.empty;
  const profileStorePredicate = storeIds.length
    ? Prisma.sql`AND EXISTS (
        SELECT 1
        FROM "GuestGameEvent" event_row
        WHERE event_row."tenantId" = ${tenantId}
          AND event_row."profileId" = profile_row.id
          ${eventStorePredicate}
      )`
    : Prisma.empty;
  const rewardStorePredicate = storeIds.length
    ? Prisma.sql`AND reward_row."storeId" IN (${Prisma.join(storeIds)})`
    : Prisma.empty;
  const ledgerStorePredicate = storeIds.length
    ? Prisma.sql`AND ledger_row."storeId" IN (${Prisma.join(storeIds)})`
    : Prisma.empty;
  const rewardTypePredicate = rewardTypes.length
    ? Prisma.sql`AND UPPER(reward_row."rewardType") IN (${Prisma.join(rewardTypes)})`
    : Prisma.empty;
  const sourceExpression = Prisma.sql`CASE
    WHEN reward_row."seasonId" IS NOT NULL THEN 'BATTLE_PASS'
    WHEN reward_row."lootBoxId" IS NOT NULL THEN 'LOOT_BOX'
    WHEN reward_row."missionId" IS NOT NULL
      AND (mission_row."missionType" = 'CHECK_IN' OR mission_row."triggerKind" = 'CHECK_IN')
      THEN 'CHECK_IN'
    WHEN reward_row."missionId" IS NOT NULL THEN 'MISSION'
    ELSE 'OTHER'
  END`;
  const sourcePredicate = sourceKinds.length
    ? Prisma.sql`AND (${sourceExpression}) IN (${Prisma.join(sourceKinds)})`
    : Prisma.empty;
  const bonusVisible =
    rewardTypes.length === 0 ||
    rewardTypes.some((type) =>
      (bonusRewardTypes as readonly string[]).includes(type),
    );
  const bonusTypePredicate = bonusVisible
    ? Prisma.empty
    : Prisma.sql`AND FALSE`;
  const bonusSourcePredicate = sourceKinds.length
    ? Prisma.sql`AND (${sourceExpression}) IN (${Prisma.join(sourceKinds)})`
    : Prisma.empty;
  const trustedSources = Prisma.join([...trustedActivitySources]);
  const bonusTypes = Prisma.join([...bonusRewardTypes]);

  return {
    profileSeries: Prisma.sql`
      WITH ${bucketCte},
      registrations AS (
        SELECT date_trunc(${truncUnit}, profile_row."createdAt" AT TIME ZONE ${timeZone}) AS bucket,
               COUNT(*)::int AS value
        FROM "GuestGameProfile" profile_row
        WHERE profile_row."tenantId" = ${tenantId}
          AND profile_row."isStaffTest" = FALSE
          AND profile_row."createdAt" >= ${range.from}
          AND profile_row."createdAt" < ${range.to}
          ${profileStorePredicate}
        GROUP BY 1
      ),
      active_users AS (
        SELECT date_trunc(${truncUnit}, event_row."occurredAt" AT TIME ZONE ${timeZone}) AS bucket,
               COUNT(DISTINCT event_row."profileId")::int AS value
        FROM "GuestGameEvent" event_row
        JOIN "GuestGameProfile" profile_row ON profile_row.id = event_row."profileId"
        WHERE event_row."tenantId" = ${tenantId}
          AND profile_row."isStaffTest" = FALSE
          AND profile_row."gameActivatedAt" IS NOT NULL
          AND event_row."occurredAt" >= profile_row."gameActivatedAt"
          AND event_row.source IN (${trustedSources})
          AND event_row."occurredAt" >= ${range.from}
          AND event_row."occurredAt" < ${range.to}
          ${eventStorePredicate}
        GROUP BY 1
      )
      SELECT bucket.bucket::date::text AS "bucketStart",
             COALESCE(registrations.value, 0)::int AS registrations,
             COALESCE(active_users.value, 0)::int AS "activeUsers"
      FROM buckets bucket
      LEFT JOIN registrations ON registrations.bucket = bucket.bucket
      LEFT JOIN active_users ON active_users.bucket = bucket.bucket
      ORDER BY bucket.bucket ASC`,

    rewardSeries: Prisma.sql`
      WITH ${bucketCte},
      delivered AS (
        SELECT date_trunc(${truncUnit}, reward_row."paidAt" AT TIME ZONE ${timeZone}) AS bucket,
               COUNT(DISTINCT reward_row.id)::int AS value
        FROM "GuestGameReward" reward_row
        LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = reward_row."profileId"
        LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
        WHERE reward_row."tenantId" = ${tenantId}
          AND reward_row.status = 'PAID'
          AND reward_row."paidAt" >= ${range.from}
          AND reward_row."paidAt" < ${range.to}
          AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
          ${rewardStorePredicate}
          ${rewardTypePredicate}
          ${sourcePredicate}
        GROUP BY 1
      )
      SELECT bucket.bucket::date::text AS "bucketStart",
             COALESCE(delivered.value, 0)::int AS "deliveredRewards"
      FROM buckets bucket
      LEFT JOIN delivered ON delivered.bucket = bucket.bucket
      ORDER BY bucket.bucket ASC`,

    bonusSeries: Prisma.sql`
      WITH ${bucketCte},
      delivered AS (
        SELECT date_trunc(${truncUnit}, ledger_row."confirmedAt" AT TIME ZONE ${timeZone}) AS bucket,
               COALESCE(SUM(ledger_row.amount), 0)::double precision AS amount,
               COUNT(DISTINCT ledger_row.id)::int AS operations
        FROM "GuestBonusLedgerEntry" ledger_row
        LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = ledger_row."profileId"
        LEFT JOIN "GuestGameReward" reward_row ON reward_row.id = ledger_row."rewardId"
        LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
        WHERE ledger_row."tenantId" = ${tenantId}
          AND ledger_row.status = 'CONFIRMED'
          AND ledger_row."entryType" = 'EARN'
          AND ledger_row.source = 'GAMIFICATION'
          AND ledger_row."confirmedAt" >= ${range.from}
          AND ledger_row."confirmedAt" < ${range.to}
          AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
          ${ledgerStorePredicate}
          ${bonusTypePredicate}
          ${bonusSourcePredicate}
        GROUP BY 1
      )
      SELECT bucket.bucket::date::text AS "bucketStart",
             COALESCE(delivered.amount, 0)::double precision AS "confirmedBonusAmount",
             COALESCE(delivered.operations, 0)::int AS "confirmedBonusOperations"
      FROM buckets bucket
      LEFT JOIN delivered ON delivered.bucket = bucket.bucket
      ORDER BY bucket.bucket ASC`,

    registrationComparison: Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE profile_row."createdAt" >= ${range.from}
            AND profile_row."createdAt" < ${range.to}
        )::int AS current,
        COUNT(*) FILTER (
          WHERE profile_row."createdAt" >= ${range.previousFrom}
            AND profile_row."createdAt" < ${range.from}
        )::int AS previous
      FROM "GuestGameProfile" profile_row
      WHERE profile_row."tenantId" = ${tenantId}
        AND profile_row."isStaffTest" = FALSE
        ${profileStorePredicate}`,

    activeComparison: Prisma.sql`
      SELECT
        COUNT(DISTINCT event_row."profileId") FILTER (
          WHERE event_row."occurredAt" >= ${range.from}
            AND event_row."occurredAt" < ${range.to}
        )::int AS current,
        COUNT(DISTINCT event_row."profileId") FILTER (
          WHERE event_row."occurredAt" >= ${range.previousFrom}
            AND event_row."occurredAt" < ${range.from}
        )::int AS previous
      FROM "GuestGameEvent" event_row
      JOIN "GuestGameProfile" profile_row ON profile_row.id = event_row."profileId"
      WHERE event_row."tenantId" = ${tenantId}
        AND profile_row."isStaffTest" = FALSE
        AND profile_row."gameActivatedAt" IS NOT NULL
        AND event_row."occurredAt" >= profile_row."gameActivatedAt"
        AND event_row.source IN (${trustedSources})
        AND event_row."occurredAt" >= ${range.previousFrom}
        AND event_row."occurredAt" < ${range.to}
        ${eventStorePredicate}`,

    rewardComparison: Prisma.sql`
      SELECT
        COUNT(DISTINCT reward_row.id) FILTER (
          WHERE reward_row.status = 'PAID'
            AND reward_row."paidAt" >= ${range.from}
            AND reward_row."paidAt" < ${range.to}
        )::int AS current,
        COUNT(DISTINCT reward_row.id) FILTER (
          WHERE reward_row.status = 'PAID'
            AND reward_row."paidAt" >= ${range.previousFrom}
            AND reward_row."paidAt" < ${range.from}
        )::int AS previous,
        COUNT(DISTINCT reward_row.id) FILTER (
          WHERE reward_row.status NOT IN ('CANCELED', 'EXPIRED')
            AND reward_row."qualifiedAt" >= ${range.from}
            AND reward_row."qualifiedAt" < ${range.to}
        )::int AS qualified,
        COUNT(DISTINCT wallet_row."rewardId") FILTER (
          WHERE wallet_row."claimedAt" >= ${range.from}
            AND wallet_row."claimedAt" < ${range.to}
        )::int AS claimed,
        COUNT(DISTINCT reward_row.id) FILTER (
          WHERE reward_row.status = 'PAID'
            AND reward_row."paidAt" >= ${range.from}
            AND reward_row."paidAt" < ${range.to}
        )::int AS delivered,
        COUNT(DISTINCT reward_row.id) FILTER (
          WHERE reward_row.status = 'PAID'
            AND reward_row."paidAt" >= ${range.from}
            AND reward_row."paidAt" < ${range.to}
            AND UPPER(reward_row."rewardType") NOT IN (${bonusTypes})
        )::int AS "otherDelivered"
      FROM "GuestGameReward" reward_row
      LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = reward_row."profileId"
      LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
      LEFT JOIN "GuestGameRewardWalletItem" wallet_row ON wallet_row."rewardId" = reward_row.id
      WHERE reward_row."tenantId" = ${tenantId}
        AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
        AND (
          reward_row."qualifiedAt" >= ${range.previousFrom}
          OR reward_row."paidAt" >= ${range.previousFrom}
          OR wallet_row."claimedAt" >= ${range.from}
        )
        ${rewardStorePredicate}
        ${rewardTypePredicate}
        ${sourcePredicate}`,

    bonusComparison: Prisma.sql`
      SELECT
        COALESCE(SUM(ledger_row.amount) FILTER (
          WHERE ledger_row."confirmedAt" >= ${range.from}
            AND ledger_row."confirmedAt" < ${range.to}
        ), 0)::double precision AS current,
        COALESCE(SUM(ledger_row.amount) FILTER (
          WHERE ledger_row."confirmedAt" >= ${range.previousFrom}
            AND ledger_row."confirmedAt" < ${range.from}
        ), 0)::double precision AS previous,
        COUNT(DISTINCT ledger_row.id) FILTER (
          WHERE ledger_row."confirmedAt" >= ${range.from}
            AND ledger_row."confirmedAt" < ${range.to}
        )::int AS "currentOperations",
        COUNT(DISTINCT ledger_row.id) FILTER (
          WHERE ledger_row."confirmedAt" >= ${range.previousFrom}
            AND ledger_row."confirmedAt" < ${range.from}
        )::int AS "previousOperations"
      FROM "GuestBonusLedgerEntry" ledger_row
      LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = ledger_row."profileId"
      LEFT JOIN "GuestGameReward" reward_row ON reward_row.id = ledger_row."rewardId"
      LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
      WHERE ledger_row."tenantId" = ${tenantId}
        AND ledger_row.status = 'CONFIRMED'
        AND ledger_row."entryType" = 'EARN'
        AND ledger_row.source = 'GAMIFICATION'
        AND ledger_row."confirmedAt" >= ${range.previousFrom}
        AND ledger_row."confirmedAt" < ${range.to}
        AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
        ${ledgerStorePredicate}
        ${bonusTypePredicate}
        ${bonusSourcePredicate}`,

    rewardTypes: Prisma.sql`
      SELECT UPPER(reward_row."rewardType") AS type,
             COUNT(DISTINCT reward_row.id)::int AS count,
             COALESCE(SUM(reward_row."rewardAmount"), 0)::double precision AS amount
      FROM "GuestGameReward" reward_row
      LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = reward_row."profileId"
      LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
      WHERE reward_row."tenantId" = ${tenantId}
        AND reward_row.status = 'PAID'
        AND reward_row."paidAt" >= ${range.from}
        AND reward_row."paidAt" < ${range.to}
        AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
        ${rewardStorePredicate}
        ${rewardTypePredicate}
        ${sourcePredicate}
      GROUP BY UPPER(reward_row."rewardType")
      ORDER BY count DESC, type ASC`,

    sources: Prisma.sql`
      SELECT (${sourceExpression}) AS "sourceKind",
             COUNT(DISTINCT reward_row.id)::int AS count
      FROM "GuestGameReward" reward_row
      LEFT JOIN "GuestGameProfile" profile_row ON profile_row.id = reward_row."profileId"
      LEFT JOIN "GuestGameMission" mission_row ON mission_row.id = reward_row."missionId"
      WHERE reward_row."tenantId" = ${tenantId}
        AND reward_row.status = 'PAID'
        AND reward_row."paidAt" >= ${range.from}
        AND reward_row."paidAt" < ${range.to}
        AND COALESCE(profile_row."isStaffTest", FALSE) = FALSE
        ${rewardStorePredicate}
        ${rewardTypePredicate}
        ${sourcePredicate}
      GROUP BY 1
      ORDER BY count DESC, "sourceKind" ASC`,

    freshness: Prisma.sql`
      SELECT GREATEST(
        (SELECT MAX(event_row."occurredAt") FROM "GuestGameEvent" event_row WHERE event_row."tenantId" = ${tenantId}),
        (SELECT MAX(reward_row."updatedAt") FROM "GuestGameReward" reward_row WHERE reward_row."tenantId" = ${tenantId}),
        (SELECT MAX(ledger_row."updatedAt") FROM "GuestBonusLedgerEntry" ledger_row WHERE ledger_row."tenantId" = ${tenantId})
      ) AS "latestDataAt"`,
  };
}

function mergeSeries(...groups: SeriesRow[][]) {
  const points = new Map<
    string,
    GuestGamificationStatistics['series'][number]
  >();
  for (const group of groups) {
    for (const row of group) {
      const point = points.get(row.bucketStart) ?? {
        bucketStart: row.bucketStart,
        registrations: 0,
        activeUsers: 0,
        deliveredRewards: 0,
        confirmedBonusAmount: 0,
        confirmedBonusOperations: 0,
      };
      point.registrations = numeric(row.registrations ?? point.registrations);
      point.activeUsers = numeric(row.activeUsers ?? point.activeUsers);
      point.deliveredRewards = numeric(
        row.deliveredRewards ?? point.deliveredRewards,
      );
      point.confirmedBonusAmount = numeric(
        row.confirmedBonusAmount ?? point.confirmedBonusAmount,
      );
      point.confirmedBonusOperations = numeric(
        row.confirmedBonusOperations ?? point.confirmedBonusOperations,
      );
      points.set(row.bucketStart, point);
    }
  }
  return [...points.values()].sort((left, right) =>
    left.bucketStart.localeCompare(right.bucketStart),
  );
}

function firstRow<T>(rows: T[], fallback: T) {
  return rows[0] ?? fallback;
}

function comparison(row: ComparisonRow): GuestGamificationStatisticsComparison {
  const current = numeric(row.current);
  const previous = numeric(row.previous);
  return {
    current,
    previous,
    delta: current - previous,
    trendPercent:
      previous === 0
        ? null
        : Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

function numeric(value: number | bigint | Prisma.Decimal | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function sourceKindLabel(source: GuestGamificationStatisticsSourceKind) {
  return (
    {
      LOOT_BOX: 'Лутбоксы',
      MISSION: 'Задания',
      CHECK_IN: 'Чекин',
      BATTLE_PASS: 'Battle Pass',
      OTHER: 'Другие источники',
    } as const
  )[source];
}

function rewardTypeLabel(type: string) {
  const labels: Record<string, string> = {
    BONUS: 'Бонусы',
    BONUS_POINTS: 'Бонусы',
    BONUS_BALANCE: 'Бонусы на баланс',
    LOYALTY_BONUS: 'Бонусы лояльности',
    BALANCE: 'Деньги на баланс',
    MONEY_BALANCE: 'Деньги на баланс',
    XP: 'Опыт',
    PROMOCODE: 'Промокоды',
    FREE_HOURS: 'Игровое время',
    CASHIER_CODE: 'Код кассиру',
    MERCH: 'Физические призы',
    PHYSICAL_PRIZE: 'Физические призы',
    LOOT_BOX_ENTITLEMENT: 'Права на открытие кейса',
    BATTLE_PASS_REWARD: 'Награды Battle Pass',
  };
  return labels[type] ?? type.replaceAll('_', ' ');
}
