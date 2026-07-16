import {
  missionEvaluationPolicy,
  normalizeMissionWizardConditions,
  validateMissionWizard,
} from './guest-game-mission-contract';

const common = {
  name: 'Задание',
  storeIds: ['store-1'],
  periodFrom: '2026-07-15T00:00:00.000Z',
  periodTo: '2026-08-15T00:00:00.000Z',
  reward: { type: 'NONE', xpEnabled: false },
};

describe('guest mission wizard contract', () => {
  it('assigns supplemental policy only to balance top-ups', () => {
    expect(missionEvaluationPolicy('BALANCE_TOPUP')).toBe(
      'LEDGER_SUPPLEMENTAL',
    );
    expect(missionEvaluationPolicy('APP_OPEN')).toBe('LIVE_PRIMARY');
    expect(missionEvaluationPolicy('PLAY_TIME')).toBe('LIVE_PRIMARY');
    expect(missionEvaluationPolicy('PRODUCT_PURCHASE')).toBe('LIVE_PRIMARY');
    expect(missionEvaluationPolicy('CHECK_IN')).toBe('LIVE_PRIMARY');
  });

  it('normalizes app open as a parameterless live condition', () => {
    const conditions = normalizeMissionWizardConditions({
      ...common,
      taskType: 'APP_OPEN',
      conditions: {
        sessionType: 'PACKAGE_OR_SUBSCRIPTION',
        metric: {
          target: 99,
          windowDays: 30,
          hours: ['09:00-21:00'],
        },
      },
    });

    expect(conditions).toMatchObject({
      schemaVersion: 2,
      taskType: 'APP_OPEN',
      sessionType: 'ANY',
      metric: {
        eventTypes: ['APP_OPEN'],
        aggregation: 'exists',
        target: 1,
        unit: 'открытие',
      },
    });
    expect(conditions.metric).not.toHaveProperty('hours');
    expect(conditions.metric).not.toHaveProperty('windowDays');
  });

  it('normalizes an exact single top-up without trusting client policy', () => {
    const conditions = normalizeMissionWizardConditions({
      ...common,
      taskType: 'BALANCE_TOPUP',
      conditions: {
        metric: {
          topupMode: 'SINGLE',
          amountComparison: 'EXACT',
          amount: 500,
        },
      },
    });

    expect(conditions).toMatchObject({
      schemaVersion: 2,
      taskType: 'BALANCE_TOPUP',
      metric: {
        eventTypes: ['BALANCE_TOPUP'],
        aggregation: 'exists',
        target: 1,
        exactSpendAmount: 500,
      },
    });
  });

  it('normalizes check-in streaks and preserves the domain warning', () => {
    const checkIn = normalizeMissionWizardConditions({
      ...common,
      taskType: 'CHECK_IN',
      conditions: { metric: { checkInMode: 'STREAK', days: 7 } },
    });
    const topup = validateMissionWizard({
      ...common,
      taskType: 'BALANCE_TOPUP',
      conditions: {
        metric: {
          topupMode: 'PERIOD_TOTAL',
          totalAmount: 1_000,
        },
      },
    });

    expect(checkIn).toMatchObject({
      metric: { aggregation: 'streak', target: 7 },
    });
    expect(topup).toMatchObject({
      ready: true,
      evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
      source: 'ACTIVITY_LEDGER',
    });
    expect(topup.warnings).toHaveLength(1);
  });

  it('accepts synced category selections and keeps exact tariff dictionaries blocked', () => {
    const category = validateMissionWizard({
      ...common,
      taskType: 'PRODUCT_PURCHASE',
      conditions: {
        purchaseSource: 'CATEGORY',
        metric: { categoryIds: ['category-1'], target: 1 },
      },
    });
    const tariff = validateMissionWizard({
      ...common,
      taskType: 'PLAY_TIME',
      conditions: {
        tariffTypeIds: ['tariff-1'],
        metric: { target: 60 },
      },
    });

    expect(category.ready).toBe(true);
    expect(tariff.ready).toBe(false);
  });

  it('keeps the selected category catalog explicit in the v2 contract', () => {
    const leetplus = normalizeMissionWizardConditions({
      ...common,
      taskType: 'PRODUCT_PURCHASE',
      conditions: {
        purchaseSource: 'CATEGORY',
        categoryCatalogSource: 'LEETPLUS',
        metric: { categoryIds: ['category-1'], target: 1 },
      },
    });
    const legacyDefault = normalizeMissionWizardConditions({
      ...common,
      taskType: 'PRODUCT_PURCHASE',
      conditions: {
        purchaseSource: 'CATEGORY',
        metric: { categoryIds: ['category-1'], target: 1 },
      },
    });

    expect(leetplus).toMatchObject({
      purchaseSource: 'CATEGORY',
      categoryCatalogSource: 'LEETPLUS',
      metric: { categoryCatalogSource: 'LEETPLUS' },
    });
    expect(legacyDefault).toMatchObject({
      categoryCatalogSource: 'LANGAME',
      metric: { categoryCatalogSource: 'LANGAME' },
    });
  });
});
