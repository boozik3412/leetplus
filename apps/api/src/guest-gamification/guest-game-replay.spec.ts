import {
  evaluateGuestGameLedgerRule,
  type GuestGameLedgerFact,
  type GuestGameLedgerRule,
} from './guest-game-rule-evaluator';

const STORE_ID = 'store-pushkinskaya';
const EXTERNAL_DOMAIN = 'network.langame.example';
const TIME_ZONE = 'Asia/Yekaterinburg';

function rule(
  overrides: Partial<GuestGameLedgerRule> = {},
): GuestGameLedgerRule {
  return {
    type: 'LOOT_BOX',
    id: 'case-weekend',
    title: 'КЕЙС «WEEKEND»',
    triggerKind: 'SESSION_START',
    sessionType: 'packet_hours',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    activatedAt: new Date('2026-07-01T00:00:00.000Z'),
    periodFrom: null,
    periodTo: null,
    periodRules: null,
    storeIds: [STORE_ID],
    externalDomains: [EXTERNAL_DOMAIN],
    progressTarget: null,
    progressUnit: null,
    ...overrides,
  };
}

function fact(
  factType: string,
  happenedAt: string,
  overrides: Partial<GuestGameLedgerFact> = {},
): GuestGameLedgerFact {
  return {
    id: `replay:${factType}:${happenedAt}`,
    factType,
    confidence: 'EXACT',
    happenedAt: new Date(happenedAt),
    createdAt: new Date(happenedAt),
    storeId: STORE_ID,
    externalDomain: EXTERNAL_DOMAIN,
    tariffName: null,
    tariffType: null,
    amount: null,
    durationMinutes: null,
    evidence: null,
    store: { timeZone: TIME_ZONE },
    ...overrides,
  };
}

describe('Игровой журнал: обезличенный replay-набор', () => {
  it('блокирует Weekend в пятницу даже при подтвержденном пакете', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        periodRules: { weekdayMode: 'WEEKENDS', weekdays: [0, 6] },
      }),
      [
        fact('PACKAGE_OR_SUBSCRIPTION_USED', '2026-07-10T12:00:00.000Z', {
          id: 'replay:guest-0646:session-531431',
          tariffName: 'обезличенный абонемент часов',
          tariffType: 'package_or_subscription',
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toContain('день недели');
  });

  it('разрешает Weekend в субботу по тому же типу факта', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        periodRules: { weekdayMode: 'WEEKENDS', weekdays: [0, 6] },
      }),
      [
        fact('PACKAGE_OR_SUBSCRIPTION_USED', '2026-07-11T12:00:00.000Z', {
          tariffType: 'package_or_subscription',
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
  });

  it('разрешает утренний кейс внутри локального окна клуба', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        id: 'case-morning',
        title: 'КЕЙС «УТРО»',
        sessionType: null,
        periodRules: {
          weekdayMode: 'ANY',
          hours: ['08:00-14:00'],
        },
      }),
      [fact('SESSION_STARTED', '2026-07-06T04:00:00.000Z')],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
  });

  it('блокирует утренний кейс после окончания локального окна', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        id: 'case-morning',
        title: 'КЕЙС «УТРО»',
        sessionType: null,
        periodRules: {
          weekdayMode: 'ANY',
          hours: ['08:00-14:00'],
        },
      }),
      [fact('SESSION_STARTED', '2026-07-06T10:00:00.000Z')],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toContain('время');
  });

  it('матчит покупку товара для товарного события', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        id: 'bar-purchase',
        title: 'Покупка в баре',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
      }),
      [fact('PRODUCT_PURCHASED', '2026-07-10T11:11:00.000Z')],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
  });

  it('не использует факт из другого клуба', () => {
    const result = evaluateGuestGameLedgerRule(
      rule(),
      [
        fact('PACKAGE_OR_SUBSCRIPTION_USED', '2026-07-11T12:00:00.000Z', {
          storeId: 'store-kholmogorova',
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toContain('другому');
  });

  it('sums only hourly play time after activation and compares it with the target', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        id: 'play-120-hourly-minutes',
        title: 'Play 120 minutes on hourly billing',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        activatedAt: new Date('2026-07-10T10:00:00.000Z'),
        progressTarget: 120,
        progressUnit: 'minute',
        periodRules: {
          metric: { aggregation: 'duration', target: 120 },
        },
      }),
      [
        fact('HOURLY_PLAY_TIME_ACCUMULATED', '2026-07-10T09:00:00.000Z', {
          durationMinutes: 90,
        }),
        fact('HOURLY_PLAY_TIME_ACCUMULATED', '2026-07-10T11:00:00.000Z', {
          durationMinutes: 70,
        }),
        fact('HOURLY_PLAY_TIME_ACCUMULATED', '2026-07-10T13:00:00.000Z', {
          durationMinutes: 50,
        }),
        fact(
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
          '2026-07-10T12:00:00.000Z',
          { durationMinutes: 500 },
        ),
      ],
      STORE_ID,
      new Date('2026-07-10T14:00:00.000Z'),
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({
      aggregation: 'duration',
      current: 120,
      target: 120,
      unit: 'minute',
      matchedFacts: 2,
    });
  });

  it('blocks accumulated play time while the target is not reached', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'packet_hours',
        progressTarget: 120,
        progressUnit: 'minute',
        periodRules: { metric: { aggregation: 'duration', target: 120 } },
      }),
      [
        fact(
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
          '2026-07-11T12:00:00.000Z',
          { durationMinutes: 75 },
        ),
      ],
      STORE_ID,
      new Date('2026-07-11T13:00:00.000Z'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({ current: 75, target: 120 });
  });

  it('matches selected products and aggregates their spend', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 500,
        progressUnit: 'rub',
        periodRules: {
          metric: {
            aggregation: 'sum',
            target: 500,
            externalProductIds: ['langame-product-1'],
          },
        },
      }),
      [
        fact('PRODUCT_PURCHASED', '2026-07-10T11:11:00.000Z', {
          amount: 200,
          evidence: { productId: 'langame-product-1', productName: 'Cola' },
        }),
        fact('PRODUCT_PURCHASED', '2026-07-10T12:11:00.000Z', {
          amount: 300,
          evidence: { productId: 'langame-product-1', productName: 'Cola' },
        }),
        fact('PRODUCT_PURCHASED', '2026-07-10T13:11:00.000Z', {
          amount: 1000,
          evidence: { productId: 'another-product', productName: 'Pizza' },
        }),
      ],
      STORE_ID,
      new Date('2026-07-10T14:00:00.000Z'),
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({ current: 500, target: 500 });
    expect(result.facts).toHaveLength(2);
  });

  it('keeps Langame and LeetPlus category selectors isolated in shadow replay', () => {
    const facts = [
      fact('PRODUCT_PURCHASED', '2026-07-10T11:11:00.000Z', {
        id: 'purchase-drink',
        amount: 200,
        evidence: {
          productId: 'langame-product-1',
          categoryId: 'leetplus-drinks',
          externalCategoryKey: 'network.langame.example:9',
        },
      }),
      fact('PRODUCT_PURCHASED', '2026-07-10T12:11:00.000Z', {
        id: 'purchase-rental',
        amount: 300,
        evidence: {
          productId: 'langame-product-2',
          categoryId: 'leetplus-rental',
          externalCategoryKey: 'network.langame.example:12',
        },
      }),
    ];
    const langame = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 2,
        periodRules: {
          purchaseSource: 'CATEGORY',
          categoryCatalogSource: 'LANGAME',
          metric: {
            aggregation: 'count',
            target: 2,
            purchaseSource: 'CATEGORY',
            categoryCatalogSource: 'LANGAME',
            productMatch: 'ALL',
            externalCategoryKeys: [
              'network.langame.example:9',
              'network.langame.example:12',
            ],
            categorySelections: [
              { externalCategoryKeys: ['network.langame.example:9'] },
              { externalCategoryKeys: ['network.langame.example:12'] },
            ],
          },
        },
      }),
      facts,
      STORE_ID,
    );
    const leetplus = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 2,
        periodRules: {
          purchaseSource: 'CATEGORY',
          categoryCatalogSource: 'LEETPLUS',
          metric: {
            aggregation: 'count',
            target: 2,
            purchaseSource: 'CATEGORY',
            categoryCatalogSource: 'LEETPLUS',
            productMatch: 'ALL',
            categoryIds: ['leetplus-drinks', 'leetplus-rental'],
            categorySelections: [
              { categoryIds: ['leetplus-drinks'] },
              { categoryIds: ['leetplus-rental'] },
            ],
          },
        },
      }),
      facts,
      STORE_ID,
    );

    expect(langame).toMatchObject({ status: 'MATCHED' });
    expect(leetplus).toMatchObject({ status: 'MATCHED' });
    expect(langame.facts).toHaveLength(2);
    expect(leetplus.facts).toHaveLength(2);
  });

  it('reports insufficient data when a configured product category is absent from facts', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 1,
        progressUnit: 'purchase',
        periodRules: {
          metric: { categoryIds: ['drinks'], target: 1 },
        },
      }),
      [
        fact('PRODUCT_PURCHASED', '2026-07-10T11:11:00.000Z', {
          amount: 200,
          evidence: { productId: 'langame-product-1', productName: 'Cola' },
        }),
      ],
      STORE_ID,
      new Date('2026-07-10T14:00:00.000Z'),
    );

    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.blockers.join(' ')).toContain('categoryIds');
  });

  it('matches one balance topup that reaches the configured minimum amount', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'BALANCE_TOPUP',
        sessionType: null,
        progressTarget: 1,
        progressUnit: 'topup',
        periodRules: {
          metric: {
            aggregation: 'count',
            target: 1,
            amountComparison: 'AT_LEAST',
            topupAmount: 500,
          },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:11:00.000Z', {
          amount: 500,
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({ current: 1, target: 1 });
  });

  it('matches an exact balance topup amount for a club-visible mission', () => {
    const topupRule = rule({
      type: 'MISSION',
      triggerKind: 'BALANCE_TOPUP',
      sessionType: null,
      progressTarget: 1,
      progressUnit: 'topup',
      periodRules: {
        metric: {
          aggregation: 'count',
          target: 1,
          amountComparison: 'EXACT',
          topupAmount: 500,
        },
      },
    });
    const result = evaluateGuestGameLedgerRule(
      topupRule,
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:11:00.000Z', {
          amount: 500,
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
    );
    const differentAmount = evaluateGuestGameLedgerRule(
      topupRule,
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:11:00.000Z', {
          amount: 501,
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
    expect(differentAmount.status).toBe('BLOCKED');
  });

  it('does not treat another fact without a club as domain scoped', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
      }),
      [
        fact('PRODUCT_PURCHASED', '2026-07-10T11:11:00.000Z', {
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('does not match a balance topup from another Langame domain', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'BALANCE_TOPUP',
        sessionType: null,
        progressTarget: 1,
        progressUnit: 'topup',
        periodRules: {
          metric: { aggregation: 'count', target: 1 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:11:00.000Z', {
          storeId: null,
          externalDomain: 'another.langame.example',
          store: null,
          amount: 500,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toContain('домен');
  });

  it('counts repeated balance topups independently', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'ACCOUNT_TOPUP',
        sessionType: null,
        progressTarget: 3,
        progressUnit: 'topup',
        periodRules: {
          metric: { aggregation: 'count', target: 3 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:00:00.000Z', {
          amount: 100,
          storeId: null,
          store: null,
        }),
        fact('BALANCE_TOPUP', '2026-07-11T11:00:00.000Z', {
          amount: 200,
          storeId: null,
          store: null,
        }),
        fact('BALANCE_TOPUP', '2026-07-12T11:00:00.000Z', {
          amount: 300,
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({ current: 3, target: 3 });
  });

  it('sums balance topups over the configured period', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'DEPOSIT',
        sessionType: null,
        progressTarget: 1000,
        progressUnit: 'rub',
        periodRules: {
          metric: { aggregation: 'sum', target: 1000, windowDays: 30 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-10T11:00:00.000Z', {
          amount: 400,
          storeId: null,
          store: null,
        }),
        fact('BALANCE_TOPUP', '2026-07-12T11:00:00.000Z', {
          amount: 600,
          storeId: null,
          store: null,
        }),
      ],
      STORE_ID,
      new Date('2026-07-15T00:00:00.000Z'),
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({ current: 1000, target: 1000 });
  });
});
