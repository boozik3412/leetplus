import type {
  GuestCommunicationConsentStatus,
  GuestCrmStatus,
} from '@prisma/client';
import type {
  GuestChurnRiskLevel,
  GuestDashboardRow,
  GuestListQuery,
  GuestRfmSegment,
} from './guests.service';

/**
 * Pure, framework-free calculations shared by the guest dashboard, the guest
 * card and the CSV export. Everything here works on already built
 * `GuestDashboardRow` values, so it is unit-testable without Prisma.
 *
 * Thresholds reuse definitions that already exist in the guest module
 * (segment risk = 14 days, retention window = 7 days, RFM segments) instead of
 * introducing new coefficients; each signal explains its own condition.
 */

export const GUEST_GAME_IDLE_DAYS = 14;
export const GUEST_REWARD_EXPIRING_DAYS = 7;
export const GUEST_SECOND_VISIT_WINDOW_DAYS = 7;
export const GUEST_RETURNED_GAP_DAYS = 30;
export const GUEST_GAME_XP_PER_LEVEL = 500;

export type GuestGameEngagement =
  | 'ACTIVE'
  | 'IDLE'
  | 'NOT_ACTIVATED'
  | 'PROFILE_INACTIVE';

export type GuestGameProfileBrief = {
  profileId: string;
  status: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  registeredAt: string;
  gameActivatedAt: string | null;
  lastGameActivityAt: string | null;
  isStaffTest: boolean;
  channels: { telegram: boolean; max: boolean };
  phoneConsentStatus: GuestCommunicationConsentStatus;
  engagement: GuestGameEngagement;
  gameEventsInPeriod: number;
  pendingRewards: number;
  rewardsExpiringSoon: number;
  nearestRewardExpiresAt: string | null;
  oldestPendingRewardAt: string | null;
  rewardsQualifiedInPeriod: number;
  rewardsPaidInPeriod: number;
  rewardsPaidTotal: number;
  lastRewardAt: string | null;
  bonusConfirmedInPeriod: number;
  bonusConfirmedTotal: number;
  bonusPendingAmount: number;
};

export type GuestGameStatusFilter =
  | 'any'
  | 'registered'
  | 'not_registered'
  | 'active'
  | 'idle'
  | 'pending_rewards';

export type GuestRecommendedActionKey =
  | 'MANUAL'
  | 'WIN_BACK'
  | 'REACTIVATE'
  | 'SECOND_VISIT'
  | 'CLAIM_REWARD'
  | 'INVITE_TO_GAME'
  | 'KEEP_WARM'
  | 'SOFT_TOUCH'
  | 'OBSERVE';

export type GuestRecommendedAction = {
  key: GuestRecommendedActionKey;
  label: string;
  reason: string;
};

export type GuestMetricComparison = {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

export type GuestsComparisonMetricKey =
  | 'activeGuests'
  | 'newGuests'
  | 'repeatGuests'
  | 'riskGuests'
  | 'lostGuests'
  | 'sessionsCount'
  | 'playHours'
  | 'transactionAmount'
  | 'barRevenue'
  | 'revenue'
  | 'arpu';

export type GuestsComparisonSummary = {
  previousPeriodFrom: string;
  previousPeriodTo: string;
  metrics: Record<GuestsComparisonMetricKey, GuestMetricComparison>;
};

export type GuestsKpiSummary = {
  revenue: number;
  arpu: number | null;
  averageCheck: number | null;
  averageCheckBase: number;
  visitFrequency: number | null;
  barBuyersShare: number | null;
  barRevenuePerActiveGuest: number | null;
  repeatShare: number | null;
  returnedGuests: number;
  quietGuests: number;
  valueAtRisk: number;
  lostValue: number;
};

export type GuestsHealthSummary = {
  rfm: Array<{
    segment: GuestRfmSegment;
    guests: number;
    guestsPercent: number;
    revenue: number;
    revenuePercent: number;
  }>;
  churn: Array<{
    level: GuestChurnRiskLevel;
    guests: number;
    guestsPercent: number;
    valueAtRisk: number;
  }>;
  consent: Array<{
    status: GuestCommunicationConsentStatus;
    guests: number;
    guestsPercent: number;
  }>;
  crm: Array<{ status: GuestCrmStatus; guests: number }>;
};

export type GuestCohortStats = {
  guests: number;
  repeatShare: number | null;
  averageVisitDays: number | null;
  averageSessions: number | null;
  averageRevenue: number | null;
  averageBarRevenue: number | null;
  riskShare: number | null;
};

export type GuestsGamificationSummary =
  | {
      available: true;
      funnel: {
        guests: number;
        registered: number;
        activated: number;
        activeInPeriod: number;
        withRewardsInPeriod: number;
        withConfirmedBonusesInPeriod: number;
      };
      shares: {
        registeredPercent: number | null;
        activatedPercent: number | null;
        activePercent: number | null;
      };
      rewards: {
        pendingWalletItems: number;
        guestsWithPendingRewards: number;
        expiringSoonItems: number;
        qualifiedInPeriod: number;
        paidInPeriod: number;
        bonusConfirmedAmountInPeriod: number;
        bonusPendingAmount: number;
      };
      profiles: {
        unlinked: number;
        staffTest: number;
        idle: number;
        notActivated: number;
      };
      effect: {
        registered: GuestCohortStats;
        notRegistered: GuestCohortStats;
        note: string;
      };
      topPlayers: GuestDashboardRow[];
    }
  | { available: false; reason: 'NO_CAPABILITY' | 'NOT_CONFIGURED' };

export type GuestsCrmQueueSummary = {
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  unassignedTasks: number;
  followUpsDue: number;
  followUpsOverdue: number;
};

export type GuestSignalKey =
  | 'VIP_AT_RISK'
  | 'NEW_WITHOUT_SECOND_VISIT'
  | 'BONUS_WITHOUT_ACTIVITY'
  | 'REWARDS_WAITING_CLAIM'
  | 'REWARDS_EXPIRING'
  | 'PLAYERS_GONE_IDLE'
  | 'ACTIVE_NOT_REGISTERED'
  | 'CONSENT_MISSING_VALUABLE'
  | 'CRM_FOLLOWUPS_DUE'
  | 'CRM_TASKS_OVERDUE'
  | 'UNLINKED_GAME_PROFILES';

export type GuestSignalTone = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export type GuestSignalGuest = {
  id: string;
  displayName: string;
  meta: string;
  amount: number | null;
};

export type GuestSignal = {
  key: GuestSignalKey;
  tone: GuestSignalTone;
  title: string;
  condition: string;
  count: number;
  amount: number | null;
  amountLabel: string | null;
  listFilters: GuestSignalListFilters | null;
  href: string | null;
  guests: GuestSignalGuest[];
  action: GuestSignalAction;
};

export type GuestSignalListFilters = Pick<
  GuestListQuery,
  | 'signal'
  | 'segment'
  | 'crmStatus'
  | 'gameStatus'
  | 'churnRisk'
  | 'rfm'
  | 'consent'
  | 'sort'
  | 'direction'
>;

export type GuestSignalContext = {
  periodToDate: Date;
  now: Date;
};

export type GuestSignalAction = {
  kind: 'CREATE_TASK' | 'OPEN_LIST' | 'OPEN_TASKS' | 'OPEN_GAME';
  label: string;
  taskTitle: string | null;
  taskDescription: string | null;
};

export type GuestActionItem = {
  key: GuestSignalKey;
  priority: number;
  tone: GuestSignalTone;
  title: string;
  description: string;
  count: number;
  amount: number | null;
  href: string | null;
  listFilters: GuestSignalListFilters | null;
  action: GuestSignalAction;
};

export type GuestBehaviorSummary = {
  favoriteStoreName: string | null;
  favoriteStoreVisits: number;
  favoriteWeekday: number | null;
  favoriteHour: number | null;
  weekdays: Array<{ weekday: number; sessions: number }>;
  hours: Array<{ hour: number; sessions: number }>;
  sessionsPer30Days: number | null;
  averageIntervalDays: number | null;
  daysSinceLastVisit: number | null;
  sampleSessions: number;
  sampleFrom: string | null;
};

type GameWalletFact = {
  status: string;
  availableAt: Date;
  expiresAt: Date;
};

type GameRewardFact = {
  status: string;
  qualifiedAt: Date;
  paidAt: Date | null;
};

type GameLedgerFact = {
  status: string;
  amount: number;
  confirmedAt: Date | null;
};

type GameEventFact = {
  occurredAt: Date;
};

export type GuestGameProfileFacts = {
  profileId: string;
  status: string;
  level: number;
  xp: number;
  createdAt: Date;
  gameActivatedAt: Date | null;
  lastActivityAt: Date | null;
  isStaffTest: boolean;
  telegramIdentity: string | null;
  maxIdentity: string | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
  wallet: GameWalletFact[];
  rewards: GameRewardFact[];
  ledger: GameLedgerFact[];
  events: GameEventFact[];
};

export type GuestInsightPeriod = {
  fromDate: Date;
  toDate: Date;
  from: string;
  to: string;
};

const DAY_MS = 86_400_000;

function toIso(value: Date | null | undefined) {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(part: number, total: number) {
  return total > 0 ? round((part / total) * 100, 1) : null;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function xpToNextLevel(xp: number, level: number) {
  const nextThreshold = Math.max(level, 1) * GUEST_GAME_XP_PER_LEVEL;
  return Math.max(0, nextThreshold - Math.max(0, xp));
}

export function buildGuestGameProfileBrief(
  facts: GuestGameProfileFacts,
  period: GuestInsightPeriod,
  now: Date,
): GuestGameProfileBrief {
  const expiringBoundary = new Date(
    now.getTime() + GUEST_REWARD_EXPIRING_DAYS * DAY_MS,
  );
  const pendingWallet = facts.wallet.filter(
    (item) =>
      (item.status === 'PENDING' || item.status === 'FAILED') &&
      item.expiresAt > now,
  );
  const rewardsExpiringSoon = pendingWallet.filter(
    (item) => item.expiresAt <= expiringBoundary,
  ).length;
  const nearestRewardExpiresAt = pendingWallet.reduce<Date | null>(
    (best, item) =>
      best === null || item.expiresAt < best ? item.expiresAt : best,
    null,
  );
  const oldestPendingRewardAt = pendingWallet.reduce<Date | null>(
    (best, item) =>
      best === null || item.availableAt < best ? item.availableAt : best,
    null,
  );
  const rewardsQualifiedInPeriod = facts.rewards.filter(
    (reward) =>
      reward.status !== 'CANCELED' &&
      reward.qualifiedAt >= period.fromDate &&
      reward.qualifiedAt <= period.toDate,
  ).length;
  const paidRewards = facts.rewards.filter(
    (reward) => reward.status === 'PAID' && reward.paidAt,
  );
  const rewardsPaidInPeriod = paidRewards.filter(
    (reward) =>
      (reward.paidAt as Date) >= period.fromDate &&
      (reward.paidAt as Date) <= period.toDate,
  ).length;
  const lastRewardAt = paidRewards.reduce<Date | null>(
    (best, reward) =>
      best === null || (reward.paidAt as Date) > best ? reward.paidAt : best,
    null,
  );
  const confirmedLedger = facts.ledger.filter(
    (entry) => entry.status === 'CONFIRMED',
  );
  const bonusConfirmedInPeriod = confirmedLedger
    .filter(
      (entry) =>
        entry.confirmedAt &&
        entry.confirmedAt >= period.fromDate &&
        entry.confirmedAt <= period.toDate,
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const bonusConfirmedTotal = confirmedLedger.reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  const bonusPendingAmount = facts.ledger
    .filter(
      (entry) =>
        entry.status === 'PENDING' ||
        entry.status === 'PROCESSING' ||
        entry.status === 'RECONCILIATION_REQUIRED',
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const trustedEvents = facts.gameActivatedAt
    ? facts.events.filter(
        (event) => event.occurredAt >= (facts.gameActivatedAt as Date),
      )
    : [];
  const gameEventsInPeriod = trustedEvents.filter(
    (event) =>
      event.occurredAt >= period.fromDate && event.occurredAt <= period.toDate,
  ).length;
  const lastGameActivityAt = trustedEvents.reduce<Date | null>(
    (best, event) =>
      best === null || event.occurredAt > best ? event.occurredAt : best,
    facts.lastActivityAt,
  );
  const engagement: GuestGameEngagement =
    facts.status !== 'ACTIVE'
      ? 'PROFILE_INACTIVE'
      : !facts.gameActivatedAt
        ? 'NOT_ACTIVATED'
        : lastGameActivityAt &&
            daysBetween(lastGameActivityAt, period.toDate) <
              GUEST_GAME_IDLE_DAYS
          ? 'ACTIVE'
          : 'IDLE';

  return {
    profileId: facts.profileId,
    status: facts.status,
    level: facts.level,
    xp: facts.xp,
    xpToNextLevel: xpToNextLevel(facts.xp, facts.level),
    registeredAt: facts.createdAt.toISOString(),
    gameActivatedAt: toIso(facts.gameActivatedAt),
    lastGameActivityAt: toIso(lastGameActivityAt),
    isStaffTest: facts.isStaffTest,
    channels: {
      telegram: Boolean(facts.telegramIdentity),
      max: Boolean(facts.maxIdentity),
    },
    phoneConsentStatus: facts.phoneConsentStatus,
    engagement,
    gameEventsInPeriod,
    pendingRewards: pendingWallet.length,
    rewardsExpiringSoon,
    nearestRewardExpiresAt: toIso(nearestRewardExpiresAt),
    oldestPendingRewardAt: toIso(oldestPendingRewardAt),
    rewardsQualifiedInPeriod,
    rewardsPaidInPeriod,
    rewardsPaidTotal: paidRewards.length,
    lastRewardAt: toIso(lastRewardAt),
    bonusConfirmedInPeriod: round(bonusConfirmedInPeriod),
    bonusConfirmedTotal: round(bonusConfirmedTotal),
    bonusPendingAmount: round(bonusPendingAmount),
  };
}

export function resolveGuestGameStatusFilter(
  value: string | undefined,
): GuestGameStatusFilter {
  const allowed: GuestGameStatusFilter[] = [
    'any',
    'registered',
    'not_registered',
    'active',
    'idle',
    'pending_rewards',
  ];

  return allowed.includes(value as GuestGameStatusFilter)
    ? (value as GuestGameStatusFilter)
    : 'any';
}

export function matchesGuestGameStatus(
  row: Pick<GuestDashboardRow, 'gameProfile'>,
  filter: GuestGameStatusFilter,
) {
  const profile = row.gameProfile;

  switch (filter) {
    case 'registered':
      return profile !== null;
    case 'not_registered':
      return profile === null;
    case 'active':
      return profile?.engagement === 'ACTIVE';
    case 'idle':
      return (
        profile !== null &&
        (profile.engagement === 'IDLE' ||
          profile.engagement === 'NOT_ACTIVATED')
      );
    case 'pending_rewards':
      return (profile?.pendingRewards ?? 0) > 0;
    default:
      return true;
  }
}

export function recommendGuestAction(
  row: Pick<
    GuestDashboardRow,
    | 'nextAction'
    | 'segment'
    | 'churnRisk'
    | 'rfm'
    | 'visitsDays'
    | 'gameProfile'
    | 'crmStatus'
  >,
): GuestRecommendedAction {
  if (row.nextAction) {
    return {
      key: 'MANUAL',
      label: row.nextAction,
      reason: 'Задано вручную в CRM',
    };
  }

  if (row.crmStatus === 'DO_NOT_CONTACT') {
    return {
      key: 'OBSERVE',
      label: 'Не беспокоить',
      reason: 'Гость запретил коммуникации',
    };
  }

  if (row.churnRisk.level === 'HIGH' || row.segment === 'risk') {
    return {
      key: 'WIN_BACK',
      label: 'Связаться и предложить повод вернуться',
      reason: row.churnRisk.reason,
    };
  }

  if (row.segment === 'lost' || row.churnRisk.level === 'LOST') {
    return {
      key: 'REACTIVATE',
      label: 'Проверить контакт и подготовить реактивацию',
      reason: `нет активности ${row.churnRisk.daysSinceActivity ?? '60+'} дн.`,
    };
  }

  if (row.segment === 'new' && row.visitsDays <= 1) {
    return {
      key: 'SECOND_VISIT',
      label: 'Закрепить первый повторный визит',
      reason: 'новый гость без второго дня активности',
    };
  }

  if ((row.gameProfile?.pendingRewards ?? 0) > 0) {
    return {
      key: 'CLAIM_REWARD',
      label: 'Напомнить о неполученной награде в игре',
      reason: `${row.gameProfile?.pendingRewards} награда(ы) ждут получения`,
    };
  }

  if (
    row.gameProfile === null &&
    (row.segment === 'repeat' || row.segment === 'active')
  ) {
    return {
      key: 'INVITE_TO_GAME',
      label: 'Пригласить в игровой модуль',
      reason: 'играет в клубе, но не зарегистрирован в игре',
    };
  }

  if (row.rfm.segment === 'CHAMPION' || row.rfm.segment === 'LOYAL') {
    return {
      key: 'KEEP_WARM',
      label: 'Поблагодарить и предложить VIP-повод',
      reason: `RFM ${row.rfm.totalScore}/15`,
    };
  }

  if (row.segment === 'quiet') {
    return {
      key: 'SOFT_TOUCH',
      label: 'Добавить в мягкую коммуникацию',
      reason: 'нет фактов активности в периоде',
    };
  }

  return {
    key: 'OBSERVE',
    label: 'Плановое наблюдение',
    reason: 'сигналов риска нет',
  };
}

export function isVipRow(row: Pick<GuestDashboardRow, 'rfm' | 'crmStatus'>) {
  return (
    row.crmStatus === 'VIP' ||
    row.rfm.segment === 'CHAMPION' ||
    row.rfm.segment === 'LOYAL'
  );
}

export function buildGuestKpiSummary(input: {
  rows: GuestDashboardRow[];
  activeGuests: number;
  repeatGuests: number;
  transactionAmount: number;
  barRevenue: number;
  transactionsCount: number;
  barSalesCount: number;
  returnedGuests: number;
}): GuestsKpiSummary {
  const revenue = round(input.transactionAmount + input.barRevenue);
  const activeRows = input.rows.filter(
    (row) =>
      row.segment === 'active' ||
      row.segment === 'repeat' ||
      row.segment === 'new',
  );
  const visitDays = activeRows.reduce((sum, row) => sum + row.visitsDays, 0);
  const barBuyers = activeRows.filter((row) => row.barRevenue > 0).length;
  const averageCheckBase = input.transactionsCount + input.barSalesCount;
  const valueAtRisk = input.rows
    .filter(
      (row) =>
        row.churnRisk.level === 'HIGH' || row.churnRisk.level === 'MEDIUM',
    )
    .reduce((sum, row) => sum + row.churnRisk.valueAtRisk, 0);
  const lostValue = input.rows
    .filter((row) => row.churnRisk.level === 'LOST')
    .reduce((sum, row) => sum + row.churnRisk.valueAtRisk, 0);

  return {
    revenue,
    arpu: input.activeGuests > 0 ? round(revenue / input.activeGuests) : null,
    averageCheck:
      averageCheckBase > 0 ? round(revenue / averageCheckBase) : null,
    averageCheckBase,
    visitFrequency:
      activeRows.length > 0 ? round(visitDays / activeRows.length, 1) : null,
    barBuyersShare: percent(barBuyers, activeRows.length),
    barRevenuePerActiveGuest:
      input.activeGuests > 0
        ? round(input.barRevenue / input.activeGuests)
        : null,
    repeatShare: percent(input.repeatGuests, input.activeGuests),
    returnedGuests: input.returnedGuests,
    quietGuests: input.rows.filter((row) => row.segment === 'quiet').length,
    valueAtRisk: round(valueAtRisk),
    lostValue: round(lostValue),
  };
}

export function buildMetricComparison(
  current: number,
  previous: number,
): GuestMetricComparison {
  const delta = round(current - previous);

  return {
    current: round(current),
    previous: round(previous),
    delta,
    deltaPercent:
      previous !== 0 ? round((delta / Math.abs(previous)) * 100, 1) : null,
  };
}

export function buildGuestHealthSummary(
  rows: GuestDashboardRow[],
): GuestsHealthSummary {
  const rfmOrder: GuestRfmSegment[] = [
    'CHAMPION',
    'LOYAL',
    'PROMISING',
    'NEED_ATTENTION',
    'AT_RISK',
    'LOST',
  ];
  const churnOrder: GuestChurnRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'LOST'];
  const consentOrder: GuestCommunicationConsentStatus[] = [
    'GRANTED',
    'UNKNOWN',
    'DENIED',
    'UNSUBSCRIBED',
  ];
  const crmOrder: GuestCrmStatus[] = [
    'NONE',
    'WATCH',
    'CONTACT',
    'INVITED',
    'LOYAL',
    'VIP',
    'PROBLEM',
    'DO_NOT_CONTACT',
  ];
  const totalGuests = rows.length;
  const totalRevenue = rows.reduce(
    (sum, row) => sum + row.transactionAmount + row.barRevenue,
    0,
  );

  return {
    rfm: rfmOrder.map((segment) => {
      const segmentRows = rows.filter((row) => row.rfm.segment === segment);
      const revenue = segmentRows.reduce(
        (sum, row) => sum + row.transactionAmount + row.barRevenue,
        0,
      );

      return {
        segment,
        guests: segmentRows.length,
        guestsPercent: percent(segmentRows.length, totalGuests) ?? 0,
        revenue: round(revenue),
        revenuePercent: percent(revenue, totalRevenue) ?? 0,
      };
    }),
    churn: churnOrder.map((level) => {
      const levelRows = rows.filter((row) => row.churnRisk.level === level);

      return {
        level,
        guests: levelRows.length,
        guestsPercent: percent(levelRows.length, totalGuests) ?? 0,
        valueAtRisk: round(
          levelRows.reduce((sum, row) => sum + row.churnRisk.valueAtRisk, 0),
        ),
      };
    }),
    consent: consentOrder.map((status) => {
      const count = rows.filter(
        (row) => row.phoneConsentStatus === status,
      ).length;

      return {
        status,
        guests: count,
        guestsPercent: percent(count, totalGuests) ?? 0,
      };
    }),
    crm: crmOrder
      .map((status) => ({
        status,
        guests: rows.filter((row) => row.crmStatus === status).length,
      }))
      .filter((entry) => entry.guests > 0),
  };
}

export function buildGuestCohortStats(
  rows: GuestDashboardRow[],
): GuestCohortStats {
  const guests = rows.length;

  if (guests === 0) {
    return {
      guests: 0,
      repeatShare: null,
      averageVisitDays: null,
      averageSessions: null,
      averageRevenue: null,
      averageBarRevenue: null,
      riskShare: null,
    };
  }

  const repeat = rows.filter(
    (row) => row.visitsDays >= 2 || row.sessionsCount >= 2,
  ).length;
  const risk = rows.filter(
    (row) => row.churnRisk.level === 'HIGH' || row.churnRisk.level === 'LOST',
  ).length;

  return {
    guests,
    repeatShare: percent(repeat, guests),
    averageVisitDays: round(
      rows.reduce((sum, row) => sum + row.visitsDays, 0) / guests,
      1,
    ),
    averageSessions: round(
      rows.reduce((sum, row) => sum + row.sessionsCount, 0) / guests,
      1,
    ),
    averageRevenue: round(
      rows.reduce(
        (sum, row) => sum + row.transactionAmount + row.barRevenue,
        0,
      ) / guests,
    ),
    averageBarRevenue: round(
      rows.reduce((sum, row) => sum + row.barRevenue, 0) / guests,
    ),
    riskShare: percent(risk, guests),
  };
}

export function buildGuestsGamificationSummary(input: {
  rows: GuestDashboardRow[];
  unlinkedProfiles: number;
}): GuestsGamificationSummary {
  const rows = input.rows;
  const registeredRows = rows.filter((row) => row.gameProfile !== null);
  const realRegisteredRows = registeredRows.filter(
    (row) => !row.gameProfile?.isStaffTest,
  );
  const activatedRows = realRegisteredRows.filter(
    (row) => row.gameProfile?.gameActivatedAt,
  );
  const activeRows = activatedRows.filter(
    (row) => (row.gameProfile?.gameEventsInPeriod ?? 0) > 0,
  );
  const withRewardsRows = realRegisteredRows.filter(
    (row) => (row.gameProfile?.rewardsPaidInPeriod ?? 0) > 0,
  );
  const withBonusRows = realRegisteredRows.filter(
    (row) => (row.gameProfile?.bonusConfirmedInPeriod ?? 0) > 0,
  );
  const pendingRows = registeredRows.filter(
    (row) => (row.gameProfile?.pendingRewards ?? 0) > 0,
  );
  const guestsInClub = rows.filter(
    (row) =>
      row.segment === 'active' ||
      row.segment === 'repeat' ||
      row.segment === 'new',
  );
  const idle = registeredRows.filter(
    (row) =>
      row.gameProfile?.engagement === 'IDLE' &&
      guestsInClub.some((guest) => guest.id === row.id),
  ).length;
  const notActivated = registeredRows.filter(
    (row) => row.gameProfile?.engagement === 'NOT_ACTIVATED',
  ).length;
  const registeredEffectRows = realRegisteredRows.filter((row) =>
    guestsInClub.some((guest) => guest.id === row.id),
  );
  const notRegisteredEffectRows = guestsInClub.filter(
    (row) => row.gameProfile === null,
  );

  return {
    available: true,
    funnel: {
      guests: rows.length,
      registered: realRegisteredRows.length,
      activated: activatedRows.length,
      activeInPeriod: activeRows.length,
      withRewardsInPeriod: withRewardsRows.length,
      withConfirmedBonusesInPeriod: withBonusRows.length,
    },
    shares: {
      registeredPercent: percent(realRegisteredRows.length, rows.length),
      activatedPercent: percent(
        activatedRows.length,
        realRegisteredRows.length,
      ),
      activePercent: percent(activeRows.length, activatedRows.length),
    },
    rewards: {
      pendingWalletItems: registeredRows.reduce(
        (sum, row) => sum + (row.gameProfile?.pendingRewards ?? 0),
        0,
      ),
      guestsWithPendingRewards: pendingRows.length,
      expiringSoonItems: registeredRows.reduce(
        (sum, row) => sum + (row.gameProfile?.rewardsExpiringSoon ?? 0),
        0,
      ),
      qualifiedInPeriod: realRegisteredRows.reduce(
        (sum, row) => sum + (row.gameProfile?.rewardsQualifiedInPeriod ?? 0),
        0,
      ),
      paidInPeriod: realRegisteredRows.reduce(
        (sum, row) => sum + (row.gameProfile?.rewardsPaidInPeriod ?? 0),
        0,
      ),
      bonusConfirmedAmountInPeriod: round(
        realRegisteredRows.reduce(
          (sum, row) => sum + (row.gameProfile?.bonusConfirmedInPeriod ?? 0),
          0,
        ),
      ),
      bonusPendingAmount: round(
        registeredRows.reduce(
          (sum, row) => sum + (row.gameProfile?.bonusPendingAmount ?? 0),
          0,
        ),
      ),
    },
    profiles: {
      unlinked: input.unlinkedProfiles,
      staffTest: registeredRows.length - realRegisteredRows.length,
      idle,
      notActivated,
    },
    effect: {
      registered: buildGuestCohortStats(registeredEffectRows),
      notRegistered: buildGuestCohortStats(notRegisteredEffectRows),
      note: 'Сравнение активных в периоде гостей с игровым профилем и без него. Это корреляция, а не причинный эффект: контрольной группы и attribution window пока нет.',
    },
    topPlayers: [...realRegisteredRows]
      .sort((first, second) => {
        const levelDiff =
          (second.gameProfile?.level ?? 0) - (first.gameProfile?.level ?? 0);
        if (levelDiff !== 0) return levelDiff;
        return (second.gameProfile?.xp ?? 0) - (first.gameProfile?.xp ?? 0);
      })
      .slice(0, 6),
  };
}

function signalGuest(
  row: GuestDashboardRow,
  meta: string,
  amount: number | null = null,
): GuestSignalGuest {
  return { id: row.id, displayName: row.displayName, meta, amount };
}

function topBy(
  rows: GuestDashboardRow[],
  score: (row: GuestDashboardRow) => number,
  limit = 5,
) {
  return [...rows]
    .sort((first, second) => score(second) - score(first))
    .slice(0, limit);
}

type GuestSignalPredicate = (
  row: GuestDashboardRow,
  context: GuestSignalContext,
) => boolean;

function endOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) +
      DAY_MS -
      1,
  );
}

const guestSignalPredicates: Partial<
  Record<GuestSignalKey, GuestSignalPredicate>
> = {
  VIP_AT_RISK: (row) =>
    isVipRow(row) &&
    (row.churnRisk.level === 'HIGH' || row.churnRisk.level === 'MEDIUM') &&
    row.crmStatus !== 'DO_NOT_CONTACT',
  NEW_WITHOUT_SECOND_VISIT: (row, context) =>
    row.segment === 'new' &&
    row.visitsDays <= 1 &&
    row.insertedAt !== null &&
    daysBetween(new Date(row.insertedAt), context.periodToDate) >=
      GUEST_SECOND_VISIT_WINDOW_DAYS &&
    row.crmStatus !== 'DO_NOT_CONTACT',
  BONUS_WITHOUT_ACTIVITY: (row) => row.bonusLoad.status === 'RISK',
  REWARDS_WAITING_CLAIM: (row) => (row.gameProfile?.pendingRewards ?? 0) > 0,
  REWARDS_EXPIRING: (row) => (row.gameProfile?.rewardsExpiringSoon ?? 0) > 0,
  PLAYERS_GONE_IDLE: (row) =>
    row.gameProfile?.engagement === 'IDLE' &&
    (row.segment === 'active' ||
      row.segment === 'repeat' ||
      row.segment === 'new'),
  ACTIVE_NOT_REGISTERED: (row) =>
    row.gameProfile === null &&
    row.segment === 'repeat' &&
    row.crmStatus !== 'DO_NOT_CONTACT',
  CONSENT_MISSING_VALUABLE: (row) =>
    isVipRow(row) &&
    row.phoneConsentStatus === 'UNKNOWN' &&
    row.crmStatus !== 'DO_NOT_CONTACT',
  CRM_FOLLOWUPS_DUE: (row, context) =>
    row.nextContactAt !== null &&
    row.crmStatus !== 'DO_NOT_CONTACT' &&
    new Date(row.nextContactAt) <= endOfUtcDay(context.now),
};

export const guestSignalKeys: GuestSignalKey[] = [
  'VIP_AT_RISK',
  'NEW_WITHOUT_SECOND_VISIT',
  'BONUS_WITHOUT_ACTIVITY',
  'REWARDS_WAITING_CLAIM',
  'REWARDS_EXPIRING',
  'PLAYERS_GONE_IDLE',
  'ACTIVE_NOT_REGISTERED',
  'CONSENT_MISSING_VALUABLE',
  'CRM_FOLLOWUPS_DUE',
  'CRM_TASKS_OVERDUE',
  'UNLINKED_GAME_PROFILES',
];

export function resolveGuestSignalFilter(
  value: string | undefined,
): GuestSignalKey | null {
  return value && guestSignalKeys.includes(value as GuestSignalKey)
    ? (value as GuestSignalKey)
    : null;
}

/** Row-level predicate shared by the dashboard signals and the list filter. */
export function matchesGuestSignal(
  row: GuestDashboardRow,
  key: GuestSignalKey,
  context: GuestSignalContext,
) {
  const predicate = guestSignalPredicates[key];
  return predicate ? predicate(row, context) : false;
}

export function buildGuestSignals(input: {
  rows: GuestDashboardRow[];
  crmQueue: GuestsCrmQueueSummary;
  gamification: GuestsGamificationSummary | null;
  now: Date;
  periodToDate: Date;
}): { attention: GuestSignal[]; actions: GuestActionItem[] } {
  const { rows, crmQueue, gamification } = input;
  const attention: GuestSignal[] = [];
  const gameAvailable = gamification?.available === true;
  const context: GuestSignalContext = {
    periodToDate: input.periodToDate,
    now: input.now,
  };
  const select = (key: GuestSignalKey) =>
    rows.filter((row) => matchesGuestSignal(row, key, context));

  const vipAtRisk = select('VIP_AT_RISK');
  if (vipAtRisk.length > 0) {
    const amount = round(
      vipAtRisk.reduce((sum, row) => sum + row.churnRisk.valueAtRisk, 0),
    );
    attention.push({
      key: 'VIP_AT_RISK',
      tone: 'CRITICAL',
      title: 'VIP в риске оттока',
      condition:
        'RFM «Чемпион»/«Лояльный» или CRM-статус VIP, при этом риск оттока высокий или требует наблюдения',
      count: vipAtRisk.length,
      amount,
      amountLabel: 'деньги периода под риском',
      listFilters: { signal: 'VIP_AT_RISK', sort: 'ltv' },
      href: null,
      guests: topBy(vipAtRisk, (row) => row.churnRisk.valueAtRisk).map((row) =>
        signalGuest(row, row.churnRisk.reason, row.churnRisk.valueAtRisk),
      ),
      action: {
        kind: 'CREATE_TASK',
        label: 'Создать задачу «вернуть VIP»',
        taskTitle: 'Вернуть VIP-гостей в риске оттока',
        taskDescription:
          'Персонально связаться с ценными гостями, у которых пауза дольше обычного ритма визитов, и предложить повод вернуться.',
      },
    });
  }

  const newWithoutSecond = select('NEW_WITHOUT_SECOND_VISIT');
  if (newWithoutSecond.length > 0) {
    attention.push({
      key: 'NEW_WITHOUT_SECOND_VISIT',
      tone: 'WARNING',
      title: 'Новые гости без второго визита',
      condition: `Зарегистрированы в периоде более ${GUEST_SECOND_VISIT_WINDOW_DAYS} дней назад и имеют не больше одного дня активности`,
      count: newWithoutSecond.length,
      amount: null,
      amountLabel: null,
      listFilters: {
        signal: 'NEW_WITHOUT_SECOND_VISIT',
        sort: 'registered',
        direction: 'asc',
      },
      href: null,
      guests: topBy(
        newWithoutSecond,
        (row) => -new Date(row.insertedAt ?? 0).getTime(),
      ).map((row) =>
        signalGuest(
          row,
          `регистрация ${daysBetween(new Date(row.insertedAt ?? 0), input.periodToDate)} дн. назад`,
        ),
      ),
      action: {
        kind: 'CREATE_TASK',
        label: 'Создать задачу «второй визит»',
        taskTitle: 'Закрепить второй визит новых гостей',
        taskDescription:
          'Отправить оффер на второй визит новичкам, которые пришли один раз и не вернулись за неделю.',
      },
    });
  }

  const bonusInactive = select('BONUS_WITHOUT_ACTIVITY');
  if (bonusInactive.length > 0) {
    attention.push({
      key: 'BONUS_WITHOUT_ACTIVITY',
      tone: 'WARNING',
      title: 'Бонусы лежат без активности',
      condition:
        'Бонусный остаток больше нуля у гостей в сегментах «В риске» и «Потерянные»',
      count: bonusInactive.length,
      amount: round(
        bonusInactive.reduce(
          (sum, row) => sum + row.bonusLoad.currentBalance,
          0,
        ),
      ),
      amountLabel: 'бонусов у неактивных гостей',
      listFilters: { signal: 'BONUS_WITHOUT_ACTIVITY', sort: 'bonusLoad' },
      href: null,
      guests: topBy(bonusInactive, (row) => row.bonusLoad.currentBalance).map(
        (row) =>
          signalGuest(
            row,
            `активность ${row.churnRisk.daysSinceActivity ?? '—'} дн. назад`,
            row.bonusLoad.currentBalance,
          ),
      ),
      action: {
        kind: 'CREATE_TASK',
        label: 'Создать задачу «напомнить о бонусах»',
        taskTitle: 'Напомнить о бонусах неактивным гостям',
        taskDescription:
          'Связаться с гостями, у которых есть бонусный остаток, но нет визитов, и предложить его использовать.',
      },
    });
  }

  if (gameAvailable) {
    const waitingClaim = select('REWARDS_WAITING_CLAIM');
    if (waitingClaim.length > 0) {
      attention.push({
        key: 'REWARDS_WAITING_CLAIM',
        tone: 'OPPORTUNITY',
        title: 'Награды ждут получения',
        condition:
          'В кошельке игрового профиля есть неполученные награды (30-дневный срок ещё не истёк)',
        count: waitingClaim.length,
        amount: waitingClaim.reduce(
          (sum, row) => sum + (row.gameProfile?.pendingRewards ?? 0),
          0,
        ),
        amountLabel: 'наград в кошельках',
        listFilters: {
          signal: 'REWARDS_WAITING_CLAIM',
          sort: 'pendingRewards',
        },
        href: null,
        guests: topBy(
          waitingClaim,
          (row) => row.gameProfile?.pendingRewards ?? 0,
        ).map((row) =>
          signalGuest(
            row,
            `${row.gameProfile?.pendingRewards} награда(ы), срок до ${row.gameProfile?.nearestRewardExpiresAt?.slice(0, 10) ?? '—'}`,
          ),
        ),
        action: {
          kind: 'CREATE_TASK',
          label: 'Создать задачу «напомнить о награде»',
          taskTitle: 'Напомнить о неполученных наградах',
          taskDescription:
            'Гости выполнили условия игры, но не забрали награду: напомнить в клубе или в мессенджере.',
        },
      });
    }

    const expiring = select('REWARDS_EXPIRING');
    if (expiring.length > 0) {
      attention.push({
        key: 'REWARDS_EXPIRING',
        tone: 'CRITICAL',
        title: 'Награды сгорают на этой неделе',
        condition: `Срок неполученной награды истекает в ближайшие ${GUEST_REWARD_EXPIRING_DAYS} дней`,
        count: expiring.length,
        amount: expiring.reduce(
          (sum, row) => sum + (row.gameProfile?.rewardsExpiringSoon ?? 0),
          0,
        ),
        amountLabel: 'наград сгорит',
        listFilters: { signal: 'REWARDS_EXPIRING', sort: 'pendingRewards' },
        href: null,
        guests: topBy(
          expiring,
          (row) =>
            -new Date(row.gameProfile?.nearestRewardExpiresAt ?? 0).getTime(),
        ).map((row) =>
          signalGuest(
            row,
            `сгорает ${row.gameProfile?.nearestRewardExpiresAt?.slice(0, 10) ?? '—'}`,
          ),
        ),
        action: {
          kind: 'OPEN_LIST',
          label: 'Открыть список',
          taskTitle: null,
          taskDescription: null,
        },
      });
    }

    const idlePlayers = select('PLAYERS_GONE_IDLE');
    if (idlePlayers.length > 0) {
      attention.push({
        key: 'PLAYERS_GONE_IDLE',
        tone: 'WARNING',
        title: 'Играют в клубе, но выпали из игры',
        condition: `Гость активен в клубе, а в игровом профиле нет доверенных событий ${GUEST_GAME_IDLE_DAYS}+ дней`,
        count: idlePlayers.length,
        amount: null,
        amountLabel: null,
        listFilters: { signal: 'PLAYERS_GONE_IDLE', sort: 'sessions' },
        href: null,
        guests: topBy(idlePlayers, (row) => row.sessionsCount).map((row) =>
          signalGuest(
            row,
            `последнее игровое событие ${row.gameProfile?.lastGameActivityAt?.slice(0, 10) ?? 'нет'}`,
          ),
        ),
        action: {
          kind: 'OPEN_GAME',
          label: 'Проверить задания и чекин',
          taskTitle: null,
          taskDescription: null,
        },
      });
    }

    const notRegistered = select('ACTIVE_NOT_REGISTERED');
    if (notRegistered.length > 0) {
      attention.push({
        key: 'ACTIVE_NOT_REGISTERED',
        tone: 'OPPORTUNITY',
        title: 'Повторные гости без игрового профиля',
        condition: 'Сегмент «Повторные» и нет связанного GuestGameProfile',
        count: notRegistered.length,
        amount: null,
        amountLabel: null,
        listFilters: { signal: 'ACTIVE_NOT_REGISTERED', sort: 'sessions' },
        href: null,
        guests: topBy(notRegistered, (row) => row.sessionsCount).map((row) =>
          signalGuest(row, `${row.sessionsCount} сессий за период`),
        ),
        action: {
          kind: 'CREATE_TASK',
          label: 'Создать задачу «пригласить в игру»',
          taskTitle: 'Пригласить повторных гостей в игровой модуль',
          taskDescription:
            'Гости регулярно играют в клубе, но не зарегистрированы в игре: предложить регистрацию через Telegram или QR в клубе.',
        },
      });
    }
  }

  const consentMissing = select('CONSENT_MISSING_VALUABLE');
  if (consentMissing.length > 0) {
    attention.push({
      key: 'CONSENT_MISSING_VALUABLE',
      tone: 'INFO',
      title: 'Ценные гости без согласия на связь',
      condition:
        'RFM «Чемпион»/«Лояльный» или VIP, статус согласия на коммуникации не определён',
      count: consentMissing.length,
      amount: null,
      amountLabel: null,
      listFilters: { signal: 'CONSENT_MISSING_VALUABLE', sort: 'ltv' },
      href: null,
      guests: topBy(consentMissing, (row) => row.ltv.totalRevenue).map((row) =>
        signalGuest(row, `LTV ${round(row.ltv.totalRevenue, 0)} руб`),
      ),
      action: {
        kind: 'CREATE_TASK',
        label: 'Создать задачу «получить согласие»',
        taskTitle: 'Получить согласие на коммуникации у ценных гостей',
        taskDescription:
          'Уточнить согласие на сообщения при следующем визите или через игровой модуль, чтобы можно было отправлять офферы.',
      },
    });
  }

  if (
    gameAvailable &&
    gamification?.available &&
    gamification.profiles.unlinked > 0
  ) {
    attention.push({
      key: 'UNLINKED_GAME_PROFILES',
      tone: 'INFO',
      title: 'Игровые профили без гостя Langame',
      condition:
        'GuestGameProfile без guestId: телефон не сопоставлен с базой гостей',
      count: gamification.profiles.unlinked,
      amount: null,
      amountLabel: null,
      listFilters: null,
      href: '/gamification/log',
      guests: [],
      action: {
        kind: 'OPEN_GAME',
        label: 'Проверить привязки',
        taskTitle: null,
        taskDescription: null,
      },
    });
  }

  const actions: GuestActionItem[] = [];
  let priority = 1;

  if (crmQueue.overdueTasks > 0) {
    actions.push({
      key: 'CRM_TASKS_OVERDUE',
      priority: priority++,
      tone: 'CRITICAL',
      title: 'Закрыть просроченные CRM-задачи',
      description:
        'Задачи со сроком в прошлом остаются открытыми или в работе.',
      count: crmQueue.overdueTasks,
      amount: null,
      href: '/guests/crm/tasks?status=all&sort=dueAt&direction=asc',
      listFilters: null,
      action: {
        kind: 'OPEN_TASKS',
        label: 'Открыть задачи',
        taskTitle: null,
        taskDescription: null,
      },
    });
  }

  if (crmQueue.followUpsDue > 0) {
    actions.push({
      key: 'CRM_FOLLOWUPS_DUE',
      priority: priority++,
      tone: 'WARNING',
      title: 'Связаться с гостями по плану контакта',
      description: 'У гостей в CRM наступила дата следующего контакта.',
      count: crmQueue.followUpsDue,
      amount: null,
      href: null,
      listFilters: { signal: 'CRM_FOLLOWUPS_DUE', sort: 'lastActivity' },
      action: {
        kind: 'OPEN_LIST',
        label: 'Открыть список',
        taskTitle: null,
        taskDescription: null,
      },
    });
  }

  const toneRank: Record<GuestSignalTone, number> = {
    CRITICAL: 0,
    WARNING: 1,
    OPPORTUNITY: 2,
    INFO: 3,
  };

  [...attention]
    .sort((first, second) => toneRank[first.tone] - toneRank[second.tone])
    .forEach((signal) => {
      actions.push({
        key: signal.key,
        priority: priority++,
        tone: signal.tone,
        title: signal.action.taskTitle ?? signal.title,
        description: signal.condition,
        count: signal.count,
        amount: signal.amount,
        href: signal.href,
        listFilters: signal.listFilters,
        action: signal.action,
      });
    });

  return { attention, actions };
}

export function countReturnedGuests(
  rows: Array<{
    hasPeriodActivity: boolean;
    firstPeriodActivityAt: Date | null;
    lastActivityBeforePeriodAt: Date | null;
    firstRevenueAt: Date | null;
  }>,
  periodFrom: Date,
) {
  return rows.filter((row) => {
    if (!row.hasPeriodActivity || !row.firstPeriodActivityAt) {
      return false;
    }

    if (row.lastActivityBeforePeriodAt) {
      return (
        daysBetween(
          row.lastActivityBeforePeriodAt,
          row.firstPeriodActivityAt,
        ) >= GUEST_RETURNED_GAP_DAYS
      );
    }

    return (
      row.firstRevenueAt !== null &&
      daysBetween(row.firstRevenueAt, periodFrom) >= GUEST_RETURNED_GAP_DAYS
    );
  }).length;
}

export function buildGuestBehaviorSummary(input: {
  sessions: Array<{ startedAt: Date | null; storeName: string | null }>;
  primaryStoreName: string | null;
  primaryStoreVisits: number;
  expectedIntervalDays: number | null;
  daysSinceActivity: number | null;
  sampleFrom: Date | null;
  now: Date;
}): GuestBehaviorSummary {
  const weekdays = new Map<number, number>();
  const hours = new Map<number, number>();
  let sampleSessions = 0;

  for (const session of input.sessions) {
    if (!session.startedAt) continue;
    sampleSessions += 1;
    const weekday = ((session.startedAt.getUTCDay() + 6) % 7) + 1;
    const hour = session.startedAt.getUTCHours();
    weekdays.set(weekday, (weekdays.get(weekday) ?? 0) + 1);
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }

  const pick = (map: Map<number, number>) =>
    [...map.entries()].sort(
      (first, second) => second[1] - first[1] || first[0] - second[0],
    )[0]?.[0] ?? null;
  const sampleDays =
    input.sampleFrom !== null
      ? Math.max(1, daysBetween(input.sampleFrom, input.now) + 1)
      : null;

  return {
    favoriteStoreName: input.primaryStoreName,
    favoriteStoreVisits: input.primaryStoreVisits,
    favoriteWeekday: pick(weekdays),
    favoriteHour: pick(hours),
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      sessions: weekdays.get(weekday) ?? 0,
    })),
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sessions: hours.get(hour) ?? 0,
    })),
    sessionsPer30Days:
      sampleDays !== null && sampleSessions > 0
        ? round((sampleSessions / sampleDays) * 30, 1)
        : null,
    averageIntervalDays: input.expectedIntervalDays,
    daysSinceLastVisit: input.daysSinceActivity,
    sampleSessions,
    sampleFrom: toIso(input.sampleFrom),
  };
}

export function buildCrmQueueSummary(input: {
  tasks: Array<{
    status: string;
    dueAt: Date | null;
    assignedToUserId: string | null;
  }>;
  rows: Array<{ nextContactAt: string | null; crmStatus: GuestCrmStatus }>;
  now: Date;
}): GuestsCrmQueueSummary {
  const startOfToday = new Date(
    Date.UTC(
      input.now.getUTCFullYear(),
      input.now.getUTCMonth(),
      input.now.getUTCDate(),
    ),
  );
  const endOfToday = new Date(startOfToday.getTime() + DAY_MS - 1);
  const active = input.tasks.filter(
    (task) => task.status === 'OPEN' || task.status === 'IN_PROGRESS',
  );
  const followUps = input.rows.filter(
    (row) =>
      row.nextContactAt !== null &&
      row.crmStatus !== 'DO_NOT_CONTACT' &&
      new Date(row.nextContactAt) <= endOfToday,
  );

  return {
    openTasks: active.filter((task) => task.status === 'OPEN').length,
    inProgressTasks: active.filter((task) => task.status === 'IN_PROGRESS')
      .length,
    overdueTasks: active.filter(
      (task) => task.dueAt !== null && task.dueAt < startOfToday,
    ).length,
    dueTodayTasks: active.filter(
      (task) =>
        task.dueAt !== null &&
        task.dueAt >= startOfToday &&
        task.dueAt <= endOfToday,
    ).length,
    unassignedTasks: active.filter((task) => task.assignedToUserId === null)
      .length,
    followUpsDue: followUps.length,
    followUpsOverdue: followUps.filter(
      (row) => new Date(row.nextContactAt as string) < startOfToday,
    ).length,
  };
}

export function gameEngagementLabel(engagement: GuestGameEngagement) {
  const labels: Record<GuestGameEngagement, string> = {
    ACTIVE: 'Играет',
    IDLE: 'Выпал из игры',
    NOT_ACTIVATED: 'Не активировал',
    PROFILE_INACTIVE: 'Профиль остановлен',
  };

  return labels[engagement];
}
