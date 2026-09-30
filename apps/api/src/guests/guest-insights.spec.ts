import {
  buildCrmQueueSummary,
  buildGuestBehaviorSummary,
  buildGuestGameProfileBrief,
  buildGuestHealthSummary,
  buildGuestKpiSummary,
  buildGuestSignals,
  buildGuestsGamificationSummary,
  buildMetricComparison,
  countReturnedGuests,
  matchesGuestGameStatus,
  matchesGuestSignal,
  recommendGuestAction,
  resolveGuestGameStatusFilter,
  resolveGuestSignalFilter,
  xpToNextLevel,
  type GuestGameProfileBrief,
  type GuestGameProfileFacts,
  type GuestsGamificationSummary,
} from './guest-insights';
import type { GuestDashboardRow } from './guests.service';

const periodFrom = new Date('2026-07-01T00:00:00.000Z');
const periodTo = new Date('2026-09-30T23:59:59.999Z');
const now = new Date('2026-09-30T12:00:00.000Z');
const period = {
  fromDate: periodFrom,
  toDate: periodTo,
  from: '2026-07-01',
  to: '2026-09-30',
};

function gameProfile(
  overrides: Partial<GuestGameProfileBrief> = {},
): GuestGameProfileBrief {
  return {
    profileId: 'profile-1',
    status: 'ACTIVE',
    level: 2,
    xp: 640,
    xpToNextLevel: 360,
    registeredAt: '2026-08-01T00:00:00.000Z',
    gameActivatedAt: '2026-08-01T00:00:00.000Z',
    lastGameActivityAt: '2026-09-28T00:00:00.000Z',
    isStaffTest: false,
    channels: { telegram: true, max: false },
    phoneConsentStatus: 'GRANTED',
    engagement: 'ACTIVE',
    gameEventsInPeriod: 4,
    pendingRewards: 0,
    rewardsExpiringSoon: 0,
    nearestRewardExpiresAt: null,
    oldestPendingRewardAt: null,
    rewardsQualifiedInPeriod: 1,
    rewardsPaidInPeriod: 1,
    rewardsPaidTotal: 1,
    lastRewardAt: '2026-09-10T00:00:00.000Z',
    bonusConfirmedInPeriod: 150,
    bonusConfirmedTotal: 150,
    bonusPendingAmount: 0,
    ...overrides,
  };
}

function row(overrides: Partial<GuestDashboardRow> = {}): GuestDashboardRow {
  const base: GuestDashboardRow = {
    id: 'guest-1',
    externalDomain: 'club.langame.test',
    externalGuestId: '100',
    primaryStoreId: 'store-1',
    primaryStoreName: 'Клуб 1',
    primaryStoreVisits: 5,
    guestGroupName: null,
    displayName: 'Иван',
    contact: '+7***0001',
    insertedAt: '2026-01-10T00:00:00.000Z',
    lastActivityAt: '2026-09-28T00:00:00.000Z',
    sessionsCount: 6,
    visitsDays: 5,
    playHours: 12,
    recentSessionsCount: 6,
    recentVisitsDays: 5,
    recentPlayHours: 12,
    currentCountHours: null,
    transactionAmount: 4000,
    barRevenue: 800,
    ltv: {
      totalRevenue: 25000,
      transactionRevenue: 20000,
      barRevenue: 5000,
      revenueDays: 30,
      firstRevenueAt: '2026-01-12T00:00:00.000Z',
      lastRevenueAt: '2026-09-28T00:00:00.000Z',
      averageRevenuePerRevenueDay: 833,
      averageRevenuePerCalendarDay: 96,
    },
    bonusLoad: {
      currentBalance: 0,
      latestSnapshotAt: null,
      balanceToLtvPercent: null,
      status: 'NONE',
    },
    rfm: {
      recencyDays: 2,
      frequency: 6,
      monetary: 4800,
      recencyScore: 5,
      frequencyScore: 4,
      monetaryScore: 3,
      totalScore: 12,
      segment: 'LOYAL',
    },
    churnRisk: {
      level: 'LOW',
      score: 10,
      daysSinceActivity: 2,
      expectedIntervalDays: 7,
      thresholdDays: 11,
      valueAtRisk: 0,
      reason: 'нет активности 2 дн.; обычный интервал 7 дн.',
    },
    segment: 'repeat',
    crmStatus: 'NONE',
    crmNote: null,
    nextAction: null,
    nextContactAt: null,
    crmUpdatedAt: null,
    phoneConsentStatus: 'GRANTED',
    gameProfile: null,
    recommendedAction: { key: 'OBSERVE', label: '', reason: '' },
  };
  const merged = { ...base, ...overrides };
  merged.recommendedAction = recommendGuestAction(merged);

  return merged;
}

describe('guest insights: game profile brief', () => {
  const facts: GuestGameProfileFacts = {
    profileId: 'profile-1',
    status: 'ACTIVE',
    level: 2,
    xp: 640,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    gameActivatedAt: new Date('2026-08-02T00:00:00.000Z'),
    lastActivityAt: new Date('2026-08-02T00:00:00.000Z'),
    isStaffTest: false,
    telegramIdentity: 'tg:1',
    maxIdentity: null,
    phoneConsentStatus: 'GRANTED',
    wallet: [
      {
        status: 'PENDING',
        availableAt: new Date('2026-09-20T00:00:00.000Z'),
        expiresAt: new Date('2026-10-03T00:00:00.000Z'),
      },
      {
        status: 'PENDING',
        availableAt: new Date('2026-09-25T00:00:00.000Z'),
        expiresAt: new Date('2026-10-25T00:00:00.000Z'),
      },
      {
        status: 'CLAIMED',
        availableAt: new Date('2026-09-01T00:00:00.000Z'),
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ],
    rewards: [
      {
        status: 'PAID',
        qualifiedAt: new Date('2026-09-05T00:00:00.000Z'),
        paidAt: new Date('2026-09-06T00:00:00.000Z'),
      },
      {
        status: 'PAID',
        qualifiedAt: new Date('2026-05-05T00:00:00.000Z'),
        paidAt: new Date('2026-05-06T00:00:00.000Z'),
      },
      {
        status: 'CANCELED',
        qualifiedAt: new Date('2026-09-07T00:00:00.000Z'),
        paidAt: null,
      },
    ],
    ledger: [
      {
        status: 'CONFIRMED',
        amount: 100,
        confirmedAt: new Date('2026-09-06T00:00:00.000Z'),
      },
      {
        status: 'CONFIRMED',
        amount: 50,
        confirmedAt: new Date('2026-05-06T00:00:00.000Z'),
      },
      { status: 'PENDING', amount: 30, confirmedAt: null },
    ],
    events: [
      { occurredAt: new Date('2026-08-01T12:00:00.000Z') },
      { occurredAt: new Date('2026-09-27T12:00:00.000Z') },
    ],
  };

  it('aggregates wallet, rewards, ledger and trusted events for the period', () => {
    const brief = buildGuestGameProfileBrief(facts, period, now);

    expect(brief.pendingRewards).toBe(2);
    expect(brief.rewardsExpiringSoon).toBe(1);
    expect(brief.nearestRewardExpiresAt).toBe('2026-10-03T00:00:00.000Z');
    expect(brief.rewardsQualifiedInPeriod).toBe(1);
    expect(brief.rewardsPaidInPeriod).toBe(1);
    expect(brief.rewardsPaidTotal).toBe(2);
    expect(brief.bonusConfirmedInPeriod).toBe(100);
    expect(brief.bonusConfirmedTotal).toBe(150);
    expect(brief.bonusPendingAmount).toBe(30);
    expect(brief.gameEventsInPeriod).toBe(1);
    expect(brief.lastGameActivityAt).toBe('2026-09-27T12:00:00.000Z');
    expect(brief.engagement).toBe('ACTIVE');
    expect(brief.xpToNextLevel).toBe(360);
    expect(brief.channels).toEqual({ telegram: true, max: false });
  });

  it('ignores events before activation and marks idle profiles', () => {
    const brief = buildGuestGameProfileBrief(
      {
        ...facts,
        gameActivatedAt: new Date('2026-09-01T00:00:00.000Z'),
        lastActivityAt: null,
        events: [{ occurredAt: new Date('2026-08-20T00:00:00.000Z') }],
      },
      period,
      now,
    );

    expect(brief.gameEventsInPeriod).toBe(0);
    expect(brief.lastGameActivityAt).toBeNull();
    expect(brief.engagement).toBe('IDLE');
  });

  it('marks profiles without a trusted APP_OPEN as not activated', () => {
    const brief = buildGuestGameProfileBrief(
      { ...facts, gameActivatedAt: null },
      period,
      now,
    );

    expect(brief.engagement).toBe('NOT_ACTIVATED');
  });

  it('computes xp to the next level from the 500 XP step', () => {
    expect(xpToNextLevel(0, 1)).toBe(500);
    expect(xpToNextLevel(640, 2)).toBe(360);
    expect(xpToNextLevel(1000, 3)).toBe(500);
  });
});

describe('guest insights: filters and recommendations', () => {
  it('resolves game status and signal filters safely', () => {
    expect(resolveGuestGameStatusFilter('registered')).toBe('registered');
    expect(resolveGuestGameStatusFilter('weird')).toBe('any');
    expect(resolveGuestSignalFilter('VIP_AT_RISK')).toBe('VIP_AT_RISK');
    expect(resolveGuestSignalFilter('nope')).toBeNull();
  });

  it('matches game status filters', () => {
    const registered = row({ gameProfile: gameProfile() });
    const pending = row({ gameProfile: gameProfile({ pendingRewards: 2 }) });
    const idle = row({ gameProfile: gameProfile({ engagement: 'IDLE' }) });

    expect(matchesGuestGameStatus(row(), 'not_registered')).toBe(true);
    expect(matchesGuestGameStatus(registered, 'registered')).toBe(true);
    expect(matchesGuestGameStatus(registered, 'active')).toBe(true);
    expect(matchesGuestGameStatus(idle, 'idle')).toBe(true);
    expect(matchesGuestGameStatus(pending, 'pending_rewards')).toBe(true);
    expect(matchesGuestGameStatus(registered, 'pending_rewards')).toBe(false);
  });

  it('prefers the manual CRM next action and respects do-not-contact', () => {
    expect(row({ nextAction: 'Позвонить' }).recommendedAction.key).toBe(
      'MANUAL',
    );
    expect(row({ crmStatus: 'DO_NOT_CONTACT' }).recommendedAction.key).toBe(
      'OBSERVE',
    );
  });

  it('recommends actions in priority order', () => {
    expect(
      row({ churnRisk: { ...row().churnRisk, level: 'HIGH' } })
        .recommendedAction.key,
    ).toBe('WIN_BACK');
    expect(row({ segment: 'lost' }).recommendedAction.key).toBe('REACTIVATE');
    expect(row({ segment: 'new', visitsDays: 1 }).recommendedAction.key).toBe(
      'SECOND_VISIT',
    );
    expect(
      row({ gameProfile: gameProfile({ pendingRewards: 1 }) }).recommendedAction
        .key,
    ).toBe('CLAIM_REWARD');
    expect(row().recommendedAction.key).toBe('INVITE_TO_GAME');
    expect(
      row({
        gameProfile: gameProfile(),
        rfm: { ...row().rfm, segment: 'CHAMPION' },
      }).recommendedAction.key,
    ).toBe('KEEP_WARM');
    expect(
      row({
        segment: 'quiet',
        gameProfile: gameProfile(),
        rfm: { ...row().rfm, segment: 'NEED_ATTENTION' },
      }).recommendedAction.key,
    ).toBe('SOFT_TOUCH');
  });
});

describe('guest insights: KPI, comparison and health', () => {
  it('derives ARPU, average check and shares from period totals', () => {
    const rows = [
      row({ id: 'a', segment: 'repeat', barRevenue: 500, visitsDays: 4 }),
      row({ id: 'b', segment: 'active', barRevenue: 0, visitsDays: 1 }),
      row({ id: 'c', segment: 'lost', visitsDays: 0 }),
    ];
    const kpi = buildGuestKpiSummary({
      rows,
      activeGuests: 2,
      repeatGuests: 1,
      transactionAmount: 9000,
      barRevenue: 1000,
      transactionsCount: 8,
      barSalesCount: 2,
      returnedGuests: 1,
    });

    expect(kpi.revenue).toBe(10000);
    expect(kpi.arpu).toBe(5000);
    expect(kpi.averageCheck).toBe(1000);
    expect(kpi.averageCheckBase).toBe(10);
    expect(kpi.visitFrequency).toBe(2.5);
    expect(kpi.barBuyersShare).toBe(50);
    expect(kpi.repeatShare).toBe(50);
    expect(kpi.returnedGuests).toBe(1);
  });

  it('computes deltas and handles a zero previous value', () => {
    expect(buildMetricComparison(120, 100)).toEqual({
      current: 120,
      previous: 100,
      delta: 20,
      deltaPercent: 20,
    });
    expect(buildMetricComparison(5, 0).deltaPercent).toBeNull();
  });

  it('distributes guests by RFM, churn, consent and CRM status', () => {
    const rows = [
      row({ id: 'a' }),
      row({
        id: 'b',
        rfm: { ...row().rfm, segment: 'AT_RISK' },
        churnRisk: { ...row().churnRisk, level: 'HIGH', valueAtRisk: 4800 },
        phoneConsentStatus: 'UNKNOWN',
        crmStatus: 'VIP',
      }),
    ];
    const health = buildGuestHealthSummary(rows);

    expect(health.rfm.find((entry) => entry.segment === 'LOYAL')?.guests).toBe(
      1,
    );
    expect(
      health.rfm.find((entry) => entry.segment === 'AT_RISK')?.guests,
    ).toBe(1);
    expect(
      health.churn.find((entry) => entry.level === 'HIGH')?.valueAtRisk,
    ).toBe(4800);
    expect(
      health.consent.find((entry) => entry.status === 'UNKNOWN')?.guests,
    ).toBe(1);
    expect(health.crm).toEqual([
      { status: 'NONE', guests: 1 },
      { status: 'VIP', guests: 1 },
    ]);
  });

  it('counts returned guests after a 30+ day gap', () => {
    const returned = countReturnedGuests(
      [
        {
          hasPeriodActivity: true,
          firstPeriodActivityAt: new Date('2026-07-10T00:00:00.000Z'),
          lastActivityBeforePeriodAt: new Date('2026-05-01T00:00:00.000Z'),
          firstRevenueAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          hasPeriodActivity: true,
          firstPeriodActivityAt: new Date('2026-07-02T00:00:00.000Z'),
          lastActivityBeforePeriodAt: new Date('2026-06-28T00:00:00.000Z'),
          firstRevenueAt: null,
        },
        {
          hasPeriodActivity: true,
          firstPeriodActivityAt: new Date('2026-08-02T00:00:00.000Z'),
          lastActivityBeforePeriodAt: null,
          firstRevenueAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          hasPeriodActivity: false,
          firstPeriodActivityAt: null,
          lastActivityBeforePeriodAt: null,
          firstRevenueAt: null,
        },
      ],
      periodFrom,
    );

    expect(returned).toBe(2);
  });
});

describe('guest insights: gamification summary and signals', () => {
  it('builds the funnel and cohort comparison from rows', () => {
    const rows = [
      row({ id: 'a', gameProfile: gameProfile() }),
      row({
        id: 'b',
        gameProfile: gameProfile({
          profileId: 'p2',
          gameActivatedAt: null,
          engagement: 'NOT_ACTIVATED',
          gameEventsInPeriod: 0,
          rewardsPaidInPeriod: 0,
          bonusConfirmedInPeriod: 0,
          pendingRewards: 1,
        }),
      }),
      row({ id: 'c', gameProfile: gameProfile({ isStaffTest: true }) }),
      row({ id: 'd', segment: 'active', visitsDays: 1, sessionsCount: 1 }),
    ];
    const summary = buildGuestsGamificationSummary({
      rows,
      unlinkedProfiles: 3,
    });

    expect(summary.available).toBe(true);
    if (!summary.available) return;
    expect(summary.funnel).toEqual({
      guests: 4,
      registered: 2,
      activated: 1,
      activeInPeriod: 1,
      withRewardsInPeriod: 1,
      withConfirmedBonusesInPeriod: 1,
    });
    expect(summary.rewards.pendingWalletItems).toBe(1);
    expect(summary.profiles).toEqual({
      unlinked: 3,
      staffTest: 1,
      idle: 0,
      notActivated: 1,
    });
    expect(summary.effect.registered.guests).toBe(2);
    expect(summary.effect.notRegistered.guests).toBe(1);
    expect(summary.effect.notRegistered.repeatShare).toBe(0);
    expect(summary.topPlayers.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('produces attention signals with shared predicates and ordered actions', () => {
    const rows = [
      row({
        id: 'vip',
        rfm: { ...row().rfm, segment: 'CHAMPION' },
        churnRisk: { ...row().churnRisk, level: 'HIGH', valueAtRisk: 4800 },
      }),
      row({
        id: 'newbie',
        segment: 'new',
        visitsDays: 1,
        insertedAt: '2026-09-10T00:00:00.000Z',
      }),
      row({
        id: 'bonus',
        segment: 'risk',
        bonusLoad: {
          currentBalance: 700,
          latestSnapshotAt: null,
          balanceToLtvPercent: null,
          status: 'RISK',
        },
      }),
      row({
        id: 'pending',
        gameProfile: gameProfile({ pendingRewards: 2, rewardsExpiringSoon: 1 }),
      }),
      row({ id: 'idle', gameProfile: gameProfile({ engagement: 'IDLE' }) }),
      row({ id: 'invite', segment: 'repeat' }),
      row({
        id: 'consent',
        rfm: { ...row().rfm, segment: 'LOYAL' },
        phoneConsentStatus: 'UNKNOWN',
        gameProfile: gameProfile(),
      }),
      row({ id: 'due', nextContactAt: '2026-09-29T10:00:00.000Z' }),
    ];
    const gamification = buildGuestsGamificationSummary({
      rows,
      unlinkedProfiles: 2,
    }) as Extract<GuestsGamificationSummary, { available: true }>;
    const crmQueue = buildCrmQueueSummary({
      tasks: [
        {
          status: 'OPEN',
          dueAt: new Date('2026-09-20T00:00:00.000Z'),
          assignedToUserId: null,
        },
        {
          status: 'IN_PROGRESS',
          dueAt: new Date('2026-09-30T10:00:00.000Z'),
          assignedToUserId: 'u1',
        },
        {
          status: 'DONE',
          dueAt: new Date('2026-09-01T00:00:00.000Z'),
          assignedToUserId: 'u1',
        },
      ],
      rows,
      now,
    });
    const { attention, actions } = buildGuestSignals({
      rows,
      crmQueue,
      gamification,
      now,
      periodToDate: periodTo,
    });
    const keys = attention.map((signal) => signal.key);

    expect(keys).toEqual([
      'VIP_AT_RISK',
      'NEW_WITHOUT_SECOND_VISIT',
      'BONUS_WITHOUT_ACTIVITY',
      'REWARDS_WAITING_CLAIM',
      'REWARDS_EXPIRING',
      'PLAYERS_GONE_IDLE',
      'ACTIVE_NOT_REGISTERED',
      'CONSENT_MISSING_VALUABLE',
      'UNLINKED_GAME_PROFILES',
    ]);
    expect(crmQueue).toEqual({
      openTasks: 1,
      inProgressTasks: 1,
      overdueTasks: 1,
      dueTodayTasks: 1,
      unassignedTasks: 1,
      followUpsDue: 1,
      followUpsOverdue: 1,
    });
    expect(actions.slice(0, 3).map((action) => action.key)).toEqual([
      'CRM_TASKS_OVERDUE',
      'CRM_FOLLOWUPS_DUE',
      'VIP_AT_RISK',
    ]);
    expect(actions.map((action) => action.priority)).toEqual(
      actions.map((_, index) => index + 1),
    );

    for (const signal of attention) {
      if (!signal.listFilters?.signal) continue;
      const matched = rows.filter((candidate) =>
        matchesGuestSignal(candidate, signal.listFilters?.signal as never, {
          periodToDate: periodTo,
          now,
        }),
      );
      expect(matched).toHaveLength(signal.count);
    }
  });

  it('skips game signals when the game projection is unavailable', () => {
    const rows = [
      row({ id: 'pending', gameProfile: gameProfile({ pendingRewards: 2 }) }),
    ];
    const { attention } = buildGuestSignals({
      rows,
      crmQueue: buildCrmQueueSummary({ tasks: [], rows, now }),
      gamification: { available: false, reason: 'NO_CAPABILITY' },
      now,
      periodToDate: periodTo,
    });

    expect(attention).toEqual([]);
  });
});

describe('guest insights: behavior', () => {
  it('finds favorite weekday and hour from session starts', () => {
    const behavior = buildGuestBehaviorSummary({
      sessions: [
        { startedAt: new Date('2026-09-04T18:30:00.000Z'), storeName: 'A' }, // Friday
        { startedAt: new Date('2026-09-11T18:10:00.000Z'), storeName: 'A' }, // Friday
        { startedAt: new Date('2026-09-13T12:00:00.000Z'), storeName: 'A' }, // Sunday
        { startedAt: null, storeName: null },
      ],
      primaryStoreName: 'A',
      primaryStoreVisits: 3,
      expectedIntervalDays: 6,
      daysSinceActivity: 2,
      sampleFrom: new Date('2026-07-02T12:00:00.000Z'),
      now,
    });

    expect(behavior.favoriteWeekday).toBe(5);
    expect(behavior.favoriteHour).toBe(18);
    expect(behavior.sampleSessions).toBe(3);
    expect(behavior.sessionsPer30Days).toBe(1);
    expect(behavior.weekdays).toHaveLength(7);
    expect(behavior.hours).toHaveLength(24);
  });
});
