import {
  evaluateGuestGameLedgerRule,
  guestGameRuleDomainTimeZones,
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
    domainTimeZones: { [EXTERNAL_DOMAIN]: TIME_ZONE },
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

describe('ledger event parity and historical recovery', () => {
  const morningRule = () =>
    rule({
      id: 'case-morning',
      title: 'Morning case',
      sessionType: null,
      periodRules: { weekdayMode: 'ANY', hours: ['08:00-14:00'] },
    });

  const comebackRule = () =>
    rule({
      id: 'case-comeback',
      title: 'Comeback case',
      sessionType: null,
    });

  it.each(['PRODUCT_PURCHASE', 'APP_OPEN'])(
    'does not unlock Morning from historical sessions while evaluating %s',
    (sourceEventType) => {
      const oldMorningSession = fact(
        'SESSION_STARTED',
        '2026-07-06T04:00:00.000Z',
        {
          sourceExternalId: 'old-session',
          sessionExternalId: 'old-session',
        },
      );

      const parity = evaluateGuestGameLedgerRule(
        morningRule(),
        [oldMorningSession],
        STORE_ID,
        new Date('2026-07-20T12:00:00.000Z'),
        {
          mode: 'EVENT_PARITY',
          sourceEventType,
          sourceFactId: 'current-non-session-event',
          occurredAt: new Date('2026-07-20T12:00:00.000Z'),
        },
      );
      const recovery = evaluateGuestGameLedgerRule(
        morningRule(),
        [oldMorningSession],
        STORE_ID,
        new Date('2026-07-20T12:00:00.000Z'),
        { mode: 'HISTORICAL_RECOVERY' },
      );

      expect(parity.status).toBe('BLOCKED');
      expect(parity.blockers.join(' ')).toContain('EVENT_TRIGGER_MISMATCH');
      expect(recovery.status).toBe('MATCHED');
    },
  );

  it('unlocks Morning only from the correlated current morning session', () => {
    const current = fact('SESSION_STARTED', '2026-07-20T04:00:00.000Z', {
      sourceExternalId: 'session-morning-current',
      sessionExternalId: 'session-morning-current',
    });
    const historical = fact('SESSION_STARTED', '2026-07-06T04:00:00.000Z', {
      sourceExternalId: 'session-morning-old',
      sessionExternalId: 'session-morning-old',
    });

    const matched = evaluateGuestGameLedgerRule(
      morningRule(),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'SESSION_START',
        sourceFactId: 'session-morning-current',
        occurredAt: current.happenedAt,
      },
    );
    const unrelated = evaluateGuestGameLedgerRule(
      morningRule(),
      [historical],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'SESSION_START',
        sourceFactId: 'session-morning-current',
        occurredAt: current.happenedAt,
      },
    );

    expect(matched.status).toBe('MATCHED');
    expect(matched.facts.map((item) => item.id)).toEqual([current.id]);
    expect(unrelated.status).toBe('NO_MATCH');
    expect(unrelated.blockers).toContain('EVENT_PARITY_CURRENT_FACT_NOT_FOUND');
  });

  it('correlates Weekend package evidence close to the current session start', () => {
    const currentPackageEvidence = fact(
      'PACKAGE_OR_SUBSCRIPTION_USED',
      '2026-07-11T12:00:05.000Z',
      { tariffType: 'package_or_subscription' },
    );
    const stalePackageEvidence = fact(
      'PACKAGE_OR_SUBSCRIPTION_USED',
      '2026-07-04T12:00:00.000Z',
      { tariffType: 'package_or_subscription' },
    );
    const weekendRule = rule({
      periodRules: { weekdayMode: 'WEEKENDS', weekdays: [0, 6] },
    });

    const result = evaluateGuestGameLedgerRule(
      weekendRule,
      [stalePackageEvidence, currentPackageEvidence],
      STORE_ID,
      new Date('2026-07-11T12:00:00.000Z'),
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'SESSION_START',
        sourceFactId: 'session-weekend-current',
        occurredAt: new Date('2026-07-11T12:00:00.000Z'),
        correlationWindowMs: 10_000,
      },
    );

    expect(result.status).toBe('MATCHED');
    expect(result.facts.map((item) => item.id)).toEqual([
      currentPackageEvidence.id,
    ]);
  });

  it('correlates batched play time by its stable external session id', () => {
    const current = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T10:15:00.000Z',
      {
        id: 'ledger-play-time-fact',
        sourceExternalId: 'langame-session-strong-1',
        sessionExternalId: 'langame-session-strong-1',
        durationMinutes: 75,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        id: 'play-time-60',
        title: 'Play for 60 minutes',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 60,
        progressUnit: 'minute',
        periodRules: {
          metric: { aggregation: 'duration', target: 60 },
        },
      }),
      [current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PLAY_HOUR',
        sourceFactId: 'session:database-row-1:play-time',
        sourceExternalId: 'langame-session-strong-1',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('MATCHED');
    expect(result.facts.map((item) => item.id)).toEqual([current.id]);
    expect(result.progress).toMatchObject({ current: 75, target: 60 });
  });

  it('correlates a batched product purchase by its stable external sale id', () => {
    const current = fact('PRODUCT_PURCHASED', '2026-07-20T10:20:00.000Z', {
      id: 'ledger-product-purchase-fact',
      sourceExternalId: 'langame-sale-strong-1',
      amount: 249,
      evidence: { productId: 'langame-product-1', productName: 'Energy' },
    });

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        id: 'buy-any-product',
        title: 'Buy a product',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 1,
        progressUnit: 'purchase',
        periodRules: { metric: { target: 1 } },
      }),
      [current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PRODUCT_PURCHASE',
        sourceFactId: 'product-expense:database-row-1',
        sourceExternalId: 'langame-sale-strong-1',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('MATCHED');
    expect(result.facts.map((item) => item.id)).toEqual([current.id]);
    expect(result.progress).toMatchObject({ current: 1, target: 1 });
  });

  it('keeps Comeback historical recovery separate from current event parity', () => {
    const historical = fact('SESSION_STARTED', '2026-07-13T14:52:03.000Z', {
      sourceExternalId: 'session-comeback-old',
      sessionExternalId: 'session-comeback-old',
    });

    const appOpenParity = evaluateGuestGameLedgerRule(
      comebackRule(),
      [historical],
      STORE_ID,
      new Date('2026-07-20T12:00:00.000Z'),
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'APP_OPEN',
        sourceFactId: 'app-open-current',
        occurredAt: new Date('2026-07-20T12:00:00.000Z'),
      },
    );
    const recovery = evaluateGuestGameLedgerRule(
      comebackRule(),
      [historical],
      STORE_ID,
      new Date('2026-07-20T12:00:00.000Z'),
      { mode: 'HISTORICAL_RECOVERY' },
    );

    expect(appOpenParity.status).toBe('BLOCKED');
    expect(recovery.status).toBe('MATCHED');
  });

  it('does not let an old in-window fact unlock a cumulative rule when the current fact is outside the local time window', () => {
    const historical = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T04:00:00.000Z',
      {
        sourceExternalId: 'play-time-old-in-window',
        sessionExternalId: 'play-time-old-in-window',
        durationMinutes: 60,
      },
    );
    const current = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T12:00:00.000Z',
      {
        sourceExternalId: 'play-time-current-outside-window',
        sessionExternalId: 'play-time-current-outside-window',
        durationMinutes: 5,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 60,
        progressUnit: 'minute',
        periodRules: {
          hours: ['08:00-14:00'],
          metric: { aggregation: 'duration', target: 60 },
        },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PLAY_HOUR',
        sourceExternalId: 'play-time-current-outside-window',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE');
    expect(result.blockers.join(' ')).toContain('время');
  });

  it('does not let a historical fact hide that the current cumulative event belongs to another club', () => {
    const historical = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T04:00:00.000Z',
      { durationMinutes: 60 },
    );
    const current = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T05:00:00.000Z',
      {
        storeId: 'store-radischeva',
        sourceExternalId: 'play-time-current-other-store',
        sessionExternalId: 'play-time-current-other-store',
        durationMinutes: 5,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 60,
        progressUnit: 'minute',
        periodRules: {
          metric: { aggregation: 'duration', target: 60 },
        },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PLAY_HOUR',
        sourceExternalId: 'play-time-current-other-store',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE');
    expect(result.blockers.join(' ')).toContain('клуб');
  });

  it('requires the correlated current session to pass its per-session minimum before historical aggregation', () => {
    const historical = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T04:00:00.000Z',
      { durationMinutes: 60 },
    );
    const current = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T05:00:00.000Z',
      {
        sourceExternalId: 'play-time-current-too-short',
        sessionExternalId: 'play-time-current-too-short',
        durationMinutes: 10,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 60,
        progressUnit: 'minute',
        periodRules: {
          metric: {
            aggregation: 'duration',
            target: 60,
            minSessionMinutes: 60,
          },
        },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PLAY_HOUR',
        sourceExternalId: 'play-time-current-too-short',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE');
    expect(result.blockers.join(' ')).toContain('shorter than 60 minutes');
  });

  it('requires the correlated current event to pass the configured weekday', () => {
    const historical = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-18T05:00:00.000Z',
      { durationMinutes: 60 },
    );
    const current = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T05:00:00.000Z',
      {
        sourceExternalId: 'play-time-current-weekday',
        sessionExternalId: 'play-time-current-weekday',
        durationMinutes: 5,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 60,
        progressUnit: 'minute',
        periodRules: {
          weekdayMode: 'WEEKENDS',
          metric: { aggregation: 'duration', target: 60 },
        },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PLAY_HOUR',
        sourceExternalId: 'play-time-current-weekday',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE');
    expect(result.blockers.join(' ')).toContain('день недели');
  });

  it('requires the correlated purchase itself to match selected products', () => {
    const historical = fact('PRODUCT_PURCHASED', '2026-07-20T04:00:00.000Z', {
      sourceExternalId: 'purchase-old-selected',
      amount: 200,
      evidence: { externalProductId: 'product-selected' },
    });
    const current = fact('PRODUCT_PURCHASED', '2026-07-20T05:00:00.000Z', {
      sourceExternalId: 'purchase-current-other',
      amount: 200,
      evidence: { externalProductId: 'product-other' },
    });

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PRODUCT_PURCHASE',
        sessionType: null,
        progressTarget: 2,
        progressUnit: 'purchase',
        periodRules: {
          metric: {
            aggregation: 'count',
            target: 2,
            externalProductIds: ['product-selected'],
          },
        },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'PRODUCT_PURCHASE',
        sourceExternalId: 'purchase-current-other',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE');
    expect(result.blockers.join(' ')).toContain('Покупки не соответствуют');
  });

  it('does not correlate a current package marker to an hourly session rule', () => {
    const historical = fact(
      'HOURLY_SESSION_STARTED',
      '2026-07-20T04:00:00.000Z',
      { sourceExternalId: 'hourly-session-old' },
    );
    const current = fact(
      'PACKAGE_OR_SUBSCRIPTION_USED',
      '2026-07-20T05:00:00.000Z',
      { sourceExternalId: 'package-session-current' },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'SESSION_START',
        sessionType: 'regular_session',
        progressTarget: 2,
        progressUnit: 'session',
        periodRules: { metric: { aggregation: 'count', target: 2 } },
      }),
      [historical, current],
      STORE_ID,
      current.happenedAt ?? current.createdAt,
      {
        mode: 'EVENT_PARITY',
        sourceEventType: 'SESSION_START',
        sourceExternalId: 'package-session-current',
        occurredAt: current.happenedAt,
      },
    );

    expect(result.status).toBe('NO_MATCH');
    expect(result.blockers).toContain('EVENT_PARITY_CURRENT_FACT_NOT_FOUND');
  });

  it('counts the canonical session anchor only when package evidence duplicates one physical session', () => {
    const sessionStarted = fact('SESSION_STARTED', '2026-07-20T05:00:00.000Z', {
      sourceExternalId: 'physical-session-1',
      sessionExternalId: 'physical-session-1',
    });
    const packageMarker = fact(
      'PACKAGE_OR_SUBSCRIPTION_USED',
      '2026-07-20T05:00:01.000Z',
      {
        sourceExternalId: 'physical-session-1',
        sessionExternalId: 'physical-session-1',
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'SESSION_START',
        sessionType: null,
        progressTarget: 2,
        progressUnit: 'session',
        periodRules: { metric: { aggregation: 'count', target: 2 } },
      }),
      [sessionStarted, packageMarker],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({ current: 1, target: 2 });
    expect(result.facts.map((item) => item.id)).toEqual([sessionStarted.id]);
  });

  it('counts two SESSION_STARTED facts with the same stable session identity only once', () => {
    const first = fact('SESSION_STARTED', '2026-07-20T05:00:00.000Z', {
      id: 'session-duplicate-first',
      sourceExternalId: 'source-row-first',
      sessionExternalId: 'physical-session-duplicate',
    });
    const second = fact('SESSION_STARTED', '2026-07-20T05:00:01.000Z', {
      id: 'session-duplicate-second',
      sourceExternalId: 'source-row-second',
      sessionExternalId: 'physical-session-duplicate',
    });

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'SESSION_START',
        sessionType: null,
        progressTarget: 2,
        progressUnit: 'session',
        periodRules: { metric: { aggregation: 'count', target: 2 } },
      }),
      [first, second],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({ current: 1, target: 2 });
    expect(result.facts).toHaveLength(1);
  });

  it('does not merge session facts that have no strong identity', () => {
    const first = fact('SESSION_STARTED', '2026-07-20T05:00:00.000Z');
    const second = fact('SESSION_STARTED', '2026-07-20T05:01:00.000Z');

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'SESSION_START',
        sessionType: null,
        progressTarget: 2,
        progressUnit: 'session',
        periodRules: { metric: { aggregation: 'count', target: 2 } },
      }),
      [first, second],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({ current: 2, target: 2 });
  });

  it('uses the maximum exact duration once for duplicate facts of one physical session', () => {
    const first = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T05:00:00.000Z',
      {
        id: 'duration-snapshot-30',
        sessionExternalId: 'physical-session-duration',
        durationMinutes: 30,
      },
    );
    const second = fact(
      'HOURLY_PLAY_TIME_ACCUMULATED',
      '2026-07-20T05:30:00.000Z',
      {
        id: 'duration-snapshot-60',
        sessionExternalId: 'physical-session-duration',
        durationMinutes: 60,
      },
    );

    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'PLAY_HOUR',
        sessionType: 'regular_session',
        progressTarget: 90,
        progressUnit: 'minute',
        periodRules: {
          metric: { aggregation: 'duration', target: 90 },
        },
      }),
      [first, second],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({ current: 60, target: 90 });
    expect(result.facts.map((item) => item.id)).toEqual([
      'duration-snapshot-60',
    ]);
  });

  it('counts distinct days and streaks in the club timezone instead of UTC', () => {
    const localStore = { timeZone: 'Pacific/Kiritimati' };
    const checkIns = [
      fact('CHECK_IN_PERFORMED', '2026-07-01T10:30:00.000Z', {
        store: localStore,
      }),
      fact('CHECK_IN_PERFORMED', '2026-07-02T09:30:00.000Z', {
        store: localStore,
      }),
      fact('CHECK_IN_PERFORMED', '2026-07-03T09:30:00.000Z', {
        store: localStore,
      }),
    ];
    const baseRule = {
      type: 'MISSION',
      triggerKind: 'CHECK_IN',
      sessionType: null,
      progressTarget: 3,
      progressUnit: 'day',
    };

    const distinctDays = evaluateGuestGameLedgerRule(
      rule({
        ...baseRule,
        periodRules: {
          metric: { aggregation: 'distinctDays', target: 3 },
        },
      }),
      checkIns,
      STORE_ID,
      new Date('2026-07-03T09:30:00.000Z'),
    );
    const streak = evaluateGuestGameLedgerRule(
      rule({
        ...baseRule,
        periodRules: { metric: { aggregation: 'streak', target: 3 } },
      }),
      checkIns,
      STORE_ID,
      new Date('2026-07-03T09:30:00.000Z'),
    );

    expect(distinctDays.status).toBe('BLOCKED');
    expect(distinctDays.progress).toMatchObject({
      aggregation: 'distinctDays',
      current: 2,
      target: 3,
    });
    expect(streak.status).toBe('BLOCKED');
    expect(streak.progress).toMatchObject({
      aggregation: 'streak',
      current: 2,
      target: 3,
    });
  });

  it('restarts the ledger streak after a missed local day', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'CHECK_IN',
        sessionType: null,
        progressTarget: 7,
        progressUnit: 'day',
        periodRules: {
          metric: { aggregation: 'streak', target: 7 },
        },
      }),
      [
        fact('CHECK_IN_PERFORMED', '2026-07-14T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-15T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-16T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-19T10:00:00.000Z'),
      ],
      STORE_ID,
      new Date('2026-07-19T10:00:00.000Z'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({
      aggregation: 'streak',
      current: 1,
      target: 7,
    });
  });

  it('shows zero for a stale unfinished ledger streak', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'CHECK_IN',
        sessionType: null,
        progressTarget: 7,
        progressUnit: 'day',
        periodRules: {
          metric: { aggregation: 'streak', target: 7 },
        },
      }),
      [
        fact('CHECK_IN_PERFORMED', '2026-07-14T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-15T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-16T10:00:00.000Z'),
      ],
      STORE_ID,
      new Date('2026-07-19T10:00:00.000Z'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({
      aggregation: 'streak',
      current: 0,
      target: 7,
    });
  });

  it('keeps a completed ledger streak eligible for recovery', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'CHECK_IN',
        sessionType: null,
        progressTarget: 3,
        progressUnit: 'day',
        periodRules: {
          metric: { aggregation: 'streak', target: 3 },
        },
      }),
      [
        fact('CHECK_IN_PERFORMED', '2026-07-14T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-15T10:00:00.000Z'),
        fact('CHECK_IN_PERFORMED', '2026-07-16T10:00:00.000Z'),
      ],
      STORE_ID,
      new Date('2026-07-20T10:00:00.000Z'),
    );

    expect(result.status).toBe('MATCHED');
    expect(result.progress).toMatchObject({
      aggregation: 'streak',
      current: 3,
      target: 3,
    });
  });

  it('fails closed when local-day aggregation has no club timezone', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'CHECK_IN',
        sessionType: null,
        progressTarget: 2,
        progressUnit: 'day',
        periodRules: {
          metric: { aggregation: 'distinctDays', target: 2 },
        },
      }),
      [
        fact('CHECK_IN_PERFORMED', '2026-07-02T09:30:00.000Z', {
          store: { timeZone: null },
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.blockers).toContain('LEDGER_LOCAL_DAY_TIMEZONE_MISSING');
  });

  it('evaluates weekday and hours for a domain-scoped topup in the unambiguous domain timezone', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'BALANCE_TOPUP',
        sessionType: null,
        progressTarget: 1,
        progressUnit: 'topup',
        periodRules: {
          weekdays: [1],
          hours: ['08:00-10:00'],
          metric: { aggregation: 'count', target: 1 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-20T04:00:00.000Z', {
          storeId: null,
          store: null,
          amount: 500,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('MATCHED');
  });

  it('counts domain-scoped topup days in the resolved domain timezone', () => {
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'BALANCE_TOPUP',
        sessionType: null,
        domainTimeZones: { [EXTERNAL_DOMAIN]: 'Pacific/Kiritimati' },
        progressTarget: 2,
        progressUnit: 'day',
        periodRules: {
          metric: { aggregation: 'distinctDays', target: 2 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-01T10:30:00.000Z', {
          storeId: null,
          store: null,
          amount: 100,
        }),
        fact('BALANCE_TOPUP', '2026-07-02T09:30:00.000Z', {
          storeId: null,
          store: null,
          amount: 100,
        }),
      ],
      STORE_ID,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.progress).toMatchObject({ current: 1, target: 2 });
  });

  it('fails closed when selected clubs have ambiguous timezones for one domain', () => {
    const domainTimeZones = guestGameRuleDomainTimeZones(
      ['store-a', 'store-b'],
      [
        {
          id: 'store-a',
          externalDomain: EXTERNAL_DOMAIN,
          timeZone: 'Asia/Yekaterinburg',
        },
        {
          id: 'store-b',
          externalDomain: EXTERNAL_DOMAIN,
          timeZone: 'Europe/Moscow',
        },
      ],
    );
    const result = evaluateGuestGameLedgerRule(
      rule({
        type: 'MISSION',
        triggerKind: 'BALANCE_TOPUP',
        sessionType: null,
        storeIds: ['store-a', 'store-b'],
        domainTimeZones,
        periodRules: {
          hours: ['08:00-10:00'],
          metric: { aggregation: 'count', target: 1 },
        },
      }),
      [
        fact('BALANCE_TOPUP', '2026-07-20T04:00:00.000Z', {
          storeId: null,
          store: null,
          amount: 500,
        }),
      ],
      'store-a',
    );

    expect(domainTimeZones).toEqual({});
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.blockers.join(' ')).toContain('часовой пояс');
  });
});
