import {
  evaluateGuestGameProgress,
  guestGameTriggerMatches,
  type GuestGameProgressEvent,
} from './guest-game-progress';

describe('guest game progress trigger matching', () => {
  it.each([
    ['SESSION_START', 'SESSION_START'],
    ['APP_OPEN', 'APP_OPEN'],
    ['CHECK_IN', 'CHECK_IN'],
    ['VISIT', 'SESSION_START'],
    ['VISIT', 'CHECK_IN'],
    ['VISIT', 'GUEST_LOG'],
    ['REPEAT_VISIT', 'SESSION_START'],
    ['REPEAT_VISIT', 'CHECK_IN'],
    ['REPEAT_VISIT', 'VISIT'],
    ['PLAY_HOUR', 'SESSION_STOP'],
    ['SESSION', 'SESSION_START'],
    ['SESSION', 'PLAY_HOUR'],
    ['SESSION', 'SESSION_STOP'],
    ['BAR_PURCHASE', 'PRODUCT_PURCHASE'],
    ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
    ['BALANCE_TOPUP', 'BALANCE_TOP_UP'],
    ['BALANCE_TOP_UP', 'BALANCE_TOPUP'],
    ['REFERRAL', 'REFERRAL_ACCEPTED'],
    ['REFERRAL_ACCEPTED', 'GAME_REFERRAL_ACCEPTED'],
    ['GUEST_LOG', 'GUEST_LOG'],
    ['MISSION_COMPLETED', 'MISSION_COMPLETED'],
  ])('matches %s rules from %s events', (expected, actual) => {
    expect(guestGameTriggerMatches(expected, actual)).toBe(true);
  });

  it.each([
    ['SESSION_START', 'CHECK_IN'],
    ['CHECK_IN', 'SESSION_START'],
    ['APP_OPEN', 'SESSION_START'],
    ['MISSION_COMPLETED', 'CHECK_IN'],
  ])('does not match unrelated %s rules from %s events', (expected, actual) => {
    expect(guestGameTriggerMatches(expected, actual)).toBe(false);
  });

  it('uses the same aliases for explicit metric event types', () => {
    const currentEvent: GuestGameProgressEvent = {
      eventType: 'CHECK_IN',
      occurredAt: new Date('2026-06-28T12:00:00.000Z'),
      storeId: 'store-1',
    };
    const historyEvents: GuestGameProgressEvent[] = [
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-06-27T12:00:00.000Z'),
        storeId: 'store-1',
      },
    ];

    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CUSTOM',
        progressTarget: 2,
        conditions: {
          metric: {
            eventTypes: ['VISIT'],
            target: 2,
          },
        },
      },
      currentEvent,
      historyEvents,
    );

    expect(result).toMatchObject({
      applicable: true,
      current: 2,
      target: 2,
      completed: true,
      matchedEvents: 2,
    });
  });

  it('accepts the legacy balance top-up token inside metric event types', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CUSTOM',
        progressTarget: 1,
        conditions: {
          metric: {
            eventTypes: ['BALANCE_TOP_UP'],
            target: 1,
          },
        },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-06-28T12:00:00.000Z'),
      },
      [],
    );

    expect(result).toMatchObject({
      current: 1,
      completed: true,
      matchedEvents: 1,
    });
  });

  it('normalizes session aliases and still enforces packet-only conditions', () => {
    const packetResult = evaluateGuestGameProgress(
      {
        triggerKind: 'SESSION_START',
        progressTarget: 1,
        conditions: {
          sessionType: 'packet_hours',
          metric: { eventTypes: ['SESSION_START'], target: 1 },
        },
      },
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-06-28T12:00:00.000Z'),
        sessionType: 'package',
        sessionPacket: true,
      },
      [],
    );
    const regularResult = evaluateGuestGameProgress(
      {
        triggerKind: 'SESSION_START',
        progressTarget: 1,
        conditions: {
          sessionType: 'packet_hours',
          metric: { eventTypes: ['SESSION_START'], target: 1 },
        },
      },
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-06-28T12:00:00.000Z'),
        sessionType: 'common',
        sessionPacket: false,
      },
      [],
    );

    expect(packetResult).toMatchObject({
      applicable: true,
      current: 1,
      completed: true,
      matchedEvents: 1,
    });
    expect(regularResult).toMatchObject({
      applicable: true,
      current: 0,
      completed: false,
      matchedEvents: 0,
    });
  });

  it('enforces nested WEEKENDS mode without a materialized weekdays array', () => {
    const rule = {
      triggerKind: 'SESSION_START',
      progressTarget: 1,
      timeZone: 'Asia/Yekaterinburg',
      conditions: {
        metric: {
          aggregation: 'exists',
          eventTypes: ['SESSION_START'],
          weekdayMode: 'WEEKENDS',
          target: 1,
        },
      },
    };

    const friday = evaluateGuestGameProgress(
      rule,
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-06-12T10:00:00.000Z'),
      },
      [],
    );
    const saturday = evaluateGuestGameProgress(
      rule,
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-06-13T10:00:00.000Z'),
      },
      [],
    );

    expect(friday).toMatchObject({ current: 0, completed: false });
    expect(saturday).toMatchObject({ current: 1, completed: true });
  });

  it('matches a domain-scoped top-up without pretending it belongs to a club', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 500,
        storeIds: ['store-pushkinskaya'],
        externalDomains: ['46.langamepro.ru'],
        conditions: {
          metric: {
            aggregation: 'sum',
            eventTypes: ['BALANCE_TOPUP'],
            target: 500,
          },
        },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        externalDomain: '46.langamepro.ru',
        spendAmount: 500,
      },
      [],
    );

    expect(result).toMatchObject({ current: 500, completed: true });
  });

  it('rejects a domain-scoped top-up from another domain', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 1,
        storeIds: ['store-pushkinskaya'],
        externalDomains: ['46.langamepro.ru'],
        conditions: { metric: { eventTypes: ['BALANCE_TOPUP'], target: 1 } },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        externalDomain: 'another-domain.example',
        spendAmount: 500,
      },
      [],
    );

    expect(result).toMatchObject({ current: 0, completed: false });
  });

  it('supports exact and minimum top-up amounts', () => {
    const exactRule = {
      triggerKind: 'BALANCE_TOPUP',
      progressTarget: 1,
      conditions: {
        metric: {
          aggregation: 'exists' as const,
          eventTypes: ['BALANCE_TOPUP'],
          exactSpendAmount: 500,
          target: 1,
        },
      },
    };
    const exact = evaluateGuestGameProgress(
      exactRule,
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        spendAmount: 500,
      },
      [],
    );
    const tooMuchForExact = evaluateGuestGameProgress(
      exactRule,
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        spendAmount: 501,
      },
      [],
    );
    const minimum = evaluateGuestGameProgress(
      {
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 2,
        conditions: {
          metric: {
            aggregation: 'count',
            eventTypes: ['BALANCE_TOPUP'],
            minSpendAmount: 500,
            target: 2,
          },
        },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        spendAmount: 700,
      },
      [
        {
          eventType: 'BALANCE_TOPUP',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
          spendAmount: 500,
        },
        {
          eventType: 'BALANCE_TOPUP',
          occurredAt: new Date('2026-07-13T10:00:00.000Z'),
          spendAmount: 499,
        },
      ],
    );

    expect(exact).toMatchObject({ current: 1, completed: true });
    expect(tooMuchForExact).toMatchObject({ current: 0, completed: false });
    expect(minimum).toMatchObject({ current: 2, completed: true });
  });

  it('accumulates top-up amount across multiple operations', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 1_000,
        conditions: {
          metric: {
            aggregation: 'sum',
            eventTypes: ['BALANCE_TOPUP'],
            target: 1_000,
          },
        },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        spendAmount: 450,
      },
      [
        {
          eventType: 'BALANCE_TOPUP',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
          spendAmount: 550,
        },
      ],
    );

    expect(result).toMatchObject({ current: 1_000, completed: true });
  });

  it('does not count the same source fact twice during an idempotent retry', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 2,
        conditions: {
          metric: {
            aggregation: 'count',
            eventTypes: ['BALANCE_TOPUP'],
            target: 2,
          },
        },
      },
      {
        eventType: 'BALANCE_TOPUP',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        sourceFactId: 'fact-1',
        spendAmount: 500,
      },
      [
        {
          eventType: 'BALANCE_TOPUP',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'fact-1',
          spendAmount: 500,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 1,
      matchedEvents: 1,
      completed: false,
    });
  });

  it('counts one physical PLAY_TIME session after its fact id and classification change', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'hourly-fact-v2',
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        sessionType: 'hourly',
        sessionPacket: false,
        sessionMinutes: 75,
      },
      [
        {
          eventType: 'SESSION_PLAY_TIME_ACCUMULATED',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'neutral-fact-v1',
          externalProvider: 'langame',
          externalDomain: 'https://46.langamepro.ru/public_api',
          sourceKind: 'GUEST_SESSION',
          sessionExternalId: 'session-42',
          sessionType: null,
          sessionPacket: false,
          sessionMinutes: 75,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 75,
      matchedEvents: 1,
      completed: false,
    });
  });

  it('uses the current package reclassification without doubling duration', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          sessionType: 'packet_hours',
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'package-fact-v2',
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        sessionType: 'package_or_subscription',
        sessionPacket: true,
        sessionMinutes: 75,
      },
      [
        {
          eventType: 'HOURLY_PLAY_TIME_ACCUMULATED',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'hourly-fact-v1',
          externalProvider: 'LANGAME',
          externalDomain: '46.langamepro.ru',
          sourceKind: 'GUEST_SESSION',
          sessionExternalId: 'session-42',
          sessionType: 'hourly',
          sessionPacket: false,
          sessionMinutes: 75,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 75,
      matchedEvents: 1,
      completed: false,
    });
  });

  it.each([
    [
      'provider',
      {
        externalProvider: 'OTHER_PROVIDER',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
      },
    ],
    [
      'domain',
      {
        externalProvider: 'LANGAME',
        externalDomain: 'other.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
      },
    ],
    [
      'source kind',
      {
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'OTHER_SESSION_SOURCE',
        sessionExternalId: 'session-42',
      },
    ],
    [
      'session id',
      {
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-43',
      },
    ],
  ])(
    'keeps PLAY_TIME events with a different %s distinct',
    (_, historyIdentity) => {
      const result = evaluateGuestGameProgress(
        {
          triggerKind: 'PLAY_HOUR',
          progressTarget: 120,
          progressUnit: 'minutes',
          conditions: {
            metric: {
              aggregation: 'duration',
              eventTypes: ['PLAY_HOUR'],
              target: 120,
            },
          },
        },
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-15T10:05:00.000Z'),
          sourceFactId: 'fact-current',
          externalProvider: 'LANGAME',
          externalDomain: '46.langamepro.ru',
          sourceKind: 'LANGAME_GUEST_SESSION',
          sessionExternalId: 'session-42',
          sessionMinutes: 60,
        },
        [
          {
            eventType: 'PLAY_HOUR',
            occurredAt: new Date('2026-07-15T10:00:00.000Z'),
            sourceFactId: 'fact-history',
            ...historyIdentity,
            sessionMinutes: 60,
          },
        ],
      );

      expect(result).toMatchObject({
        current: 120,
        matchedEvents: 2,
        completed: true,
      });
    },
  );

  it('falls back to the same source fact when a strong component is missing', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'fact-legacy',
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: null,
        sessionExternalId: 'session-42',
        sessionMinutes: 60,
      },
      [
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'fact-legacy',
          sessionMinutes: 60,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 60,
      matchedEvents: 1,
      completed: false,
    });
  });

  it('bridges an existing legacy event to a strong current identity by source fact', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'fact-shared',
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        sessionMinutes: 60,
      },
      [
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'fact-shared',
          sessionMinutes: 60,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 60,
      matchedEvents: 1,
      completed: false,
    });
  });

  it('does not let one legacy fact merge conflicting strong sessions', () => {
    const common = {
      eventType: 'PLAY_HOUR',
      sourceFactId: 'fact-shared',
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionMinutes: 60,
    };
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 180,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 180,
          },
        },
      },
      {
        ...common,
        occurredAt: new Date('2026-07-15T10:10:00.000Z'),
        sessionExternalId: 'session-42',
      },
      [
        {
          ...common,
          occurredAt: new Date('2026-07-15T10:05:00.000Z'),
          sessionExternalId: 'session-43',
        },
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'fact-shared',
          sessionMinutes: 60,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 180,
      matchedEvents: 3,
      completed: true,
    });
  });

  it('does not merge different fallback fact ids without a strong identity', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'fact-v2',
        sessionMinutes: 60,
      },
      [
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'fact-v1',
          sessionMinutes: 60,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 120,
      matchedEvents: 2,
      completed: true,
    });
  });

  it('dedupes PLAY_HOUR and SESSION_STOP representations of one session', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PLAY_HOUR',
        progressTarget: 120,
        progressUnit: 'minutes',
        conditions: {
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR'],
            target: 120,
          },
        },
      },
      {
        eventType: 'PLAY_HOUR',
        occurredAt: new Date('2026-07-15T10:05:00.000Z'),
        sourceFactId: 'play-hour-fact',
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        sessionMinutes: 60,
      },
      [
        {
          eventType: 'SESSION_STOP',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
          sourceFactId: 'session-stop-fact',
          externalProvider: 'LANGAME',
          externalDomain: '46.langamepro.ru',
          sourceKind: 'GUEST_SESSION',
          sessionExternalId: 'session-42',
          sessionMinutes: 60,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 60,
      matchedEvents: 1,
      completed: false,
    });
  });

  it('counts a regular session, its package correction and a later session as two physical sessions', () => {
    const occurredAt = new Date('2026-07-15T10:00:00.000Z');
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'SESSION_START',
        progressTarget: 3,
        conditions: {
          metric: {
            aggregation: 'count',
            eventTypes: ['SESSION_START'],
            target: 3,
          },
        },
      },
      {
        eventType: 'SESSION_START',
        occurredAt: new Date('2026-07-16T10:00:00.000Z'),
        sourceFactId: 'session-2',
        sessionType: 'regular_session',
        sessionPacket: false,
      },
      [
        {
          eventType: 'SESSION_START',
          occurredAt,
          sourceFactId: 'session-1',
          sessionType: 'regular_session',
          sessionPacket: false,
        },
        {
          eventType: 'SESSION_START',
          occurredAt,
          sourceFactId: 'session-1:classification:PACKAGE_V1',
          sessionType: 'packet_hours',
          sessionPacket: true,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 2,
      matchedEvents: 2,
      completed: false,
    });
  });

  it('completes ALL product selection across separate purchases', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PRODUCT_PURCHASE',
        progressTarget: 2,
        conditions: {
          metric: {
            aggregation: 'count',
            eventTypes: ['PRODUCT_PURCHASE'],
            productMatch: 'ALL',
            productIds: ['burn', 'pizza'],
            target: 2,
          },
        },
      },
      {
        eventType: 'PRODUCT_PURCHASE',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        productId: 'pizza',
        spendAmount: 499,
      },
      [
        {
          eventType: 'PRODUCT_PURCHASE',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
          productId: 'burn',
          spendAmount: 219,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 2,
      completed: true,
      matchedEvents: 2,
    });
  });

  it('matches a club-scoped Langame category by domain and group id', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PRODUCT_PURCHASE',
        progressTarget: 1,
        conditions: {
          purchaseSource: 'CATEGORY',
          metric: {
            aggregation: 'count',
            eventTypes: ['PRODUCT_PURCHASE'],
            purchaseSource: 'CATEGORY',
            externalCategoryKeys: ['46.langamepro.ru:7'],
            target: 1,
          },
        },
      },
      {
        eventType: 'PRODUCT_PURCHASE',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        externalCategoryKey: '46.langamepro.ru:7',
        spendAmount: 219,
      },
      [],
    );

    expect(result).toMatchObject({ current: 1, completed: true });
  });

  it('completes ALL semantic categories across domains and purchases', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PRODUCT_PURCHASE',
        progressTarget: 2,
        conditions: {
          purchaseSource: 'CATEGORY',
          metric: {
            aggregation: 'count',
            eventTypes: ['PRODUCT_PURCHASE'],
            purchaseSource: 'CATEGORY',
            productMatch: 'ALL',
            externalCategoryKeys: ['46.langamepro.ru:7', '443.langame.ru:12'],
            categorySelections: [
              {
                id: 'energy',
                externalCategoryKeys: ['46.langamepro.ru:7'],
              },
              {
                id: 'rental',
                externalCategoryKeys: ['443.langame.ru:12'],
              },
            ],
            target: 2,
          },
        },
      },
      {
        eventType: 'PRODUCT_PURCHASE',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        externalCategoryKey: '443.langame.ru:12',
        spendAmount: 399,
      },
      [
        {
          eventType: 'PRODUCT_PURCHASE',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
          externalCategoryKey: '46.langamepro.ru:7',
          spendAmount: 219,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 2,
      completed: true,
      matchedEvents: 2,
    });
  });

  it('matches LeetPlus categories by internal category id without Langame groups', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'PRODUCT_PURCHASE',
        progressTarget: 2,
        conditions: {
          purchaseSource: 'CATEGORY',
          categoryCatalogSource: 'LEETPLUS',
          metric: {
            aggregation: 'count',
            eventTypes: ['PRODUCT_PURCHASE'],
            purchaseSource: 'CATEGORY',
            categoryCatalogSource: 'LEETPLUS',
            productMatch: 'ALL',
            categoryIds: ['leet-category-drinks', 'leet-category-rental'],
            categorySelections: [
              {
                id: 'leet-category-drinks',
                categoryIds: ['leet-category-drinks'],
              },
              {
                id: 'leet-category-rental',
                categoryIds: ['leet-category-rental'],
              },
            ],
            target: 2,
          },
        },
      },
      {
        eventType: 'PRODUCT_PURCHASE',
        occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        categoryId: 'leet-category-rental',
        externalCategoryKey: '46.langamepro.ru:7',
        spendAmount: 399,
      },
      [
        {
          eventType: 'PRODUCT_PURCHASE',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
          categoryId: 'leet-category-drinks',
          externalCategoryKey: '443.langame.ru:12',
          spendAmount: 219,
        },
      ],
    );

    expect(result).toMatchObject({
      current: 2,
      completed: true,
      matchedEvents: 2,
    });
  });

  it('counts a check-in streak by the club timezone', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CHECK_IN',
        progressTarget: 3,
        timeZone: 'Asia/Yekaterinburg',
        conditions: {
          metric: {
            aggregation: 'streak',
            checkInMode: 'STREAK',
            eventTypes: ['CHECK_IN'],
            target: 3,
          },
        },
      },
      {
        eventType: 'CHECK_IN',
        occurredAt: new Date('2026-07-15T20:30:00.000Z'),
      },
      [
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-13T20:30:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-14T20:30:00.000Z'),
        },
      ],
    );

    expect(result).toMatchObject({ current: 3, completed: true });
  });

  it('restarts an unfinished check-in streak after a missed local day', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CHECK_IN',
        progressTarget: 7,
        timeZone: 'Asia/Yekaterinburg',
        conditions: {
          metric: {
            aggregation: 'streak',
            eventTypes: ['CHECK_IN'],
            target: 7,
          },
        },
      },
      {
        eventType: 'CHECK_IN',
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
      },
      [
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-16T10:00:00.000Z'),
        },
      ],
    );

    expect(result).toMatchObject({ current: 1, completed: false });
  });

  it('shows zero for an unfinished streak that ended before yesterday', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CHECK_IN',
        progressTarget: 7,
        timeZone: 'Asia/Yekaterinburg',
        conditions: {
          metric: {
            aggregation: 'streak',
            eventTypes: ['CHECK_IN'],
            target: 7,
          },
        },
      },
      {
        eventType: 'APP_OPEN',
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
      },
      [
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-16T10:00:00.000Z'),
        },
      ],
    );

    expect(result).toMatchObject({ current: 0, completed: false });
  });

  it('keeps a previously completed streak eligible for recovery', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CHECK_IN',
        progressTarget: 3,
        timeZone: 'Asia/Yekaterinburg',
        conditions: {
          metric: {
            aggregation: 'streak',
            eventTypes: ['CHECK_IN'],
            target: 3,
          },
        },
      },
      {
        eventType: 'APP_OPEN',
        occurredAt: new Date('2026-07-20T10:00:00.000Z'),
      },
      [
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-14T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-15T10:00:00.000Z'),
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-07-16T10:00:00.000Z'),
        },
      ],
    );

    expect(result).toMatchObject({ current: 3, completed: true });
  });

  it('keeps a daily streak across a DST transition', () => {
    const result = evaluateGuestGameProgress(
      {
        triggerKind: 'CHECK_IN',
        progressTarget: 2,
        timeZone: 'Europe/Berlin',
        conditions: {
          metric: {
            aggregation: 'streak',
            eventTypes: ['CHECK_IN'],
            target: 2,
          },
        },
      },
      {
        eventType: 'CHECK_IN',
        occurredAt: new Date('2026-03-29T22:30:00.000Z'),
      },
      [
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-03-28T23:30:00.000Z'),
        },
      ],
    );

    expect(result).toMatchObject({ current: 2, completed: true });
  });
});

describe('guest game progress domain routing', () => {
  const rule = {
    triggerKind: 'PLAY_HOUR',
    progressTarget: 60,
    progressUnit: 'minutes',
    conditions: {
      metric: { aggregation: 'duration', target: 60 },
    },
    storeIds: ['store-1'],
    externalDomains: ['46.langamepro.ru'],
  };

  it('matches a store-less event from the selected club domain', () => {
    expect(
      evaluateGuestGameProgress(
        rule,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-18T12:00:00.000Z'),
          storeId: null,
          externalDomain: '46.langamepro.ru',
          sessionMinutes: 60,
        },
        [],
      ),
    ).toMatchObject({ current: 60, completed: true, matchedEvents: 1 });
  });

  it('rejects a store-less event from another domain', () => {
    expect(
      evaluateGuestGameProgress(
        rule,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-18T12:00:00.000Z'),
          storeId: null,
          externalDomain: 'other.langamepro.ru',
          sessionMinutes: 60,
        },
        [],
      ),
    ).toMatchObject({ current: 0, completed: false, matchedEvents: 0 });
  });

  it('allows independent rules for different stores on the same domain', () => {
    const event: GuestGameProgressEvent = {
      eventType: 'PLAY_HOUR',
      occurredAt: new Date('2026-07-18T12:00:00.000Z'),
      storeId: null,
      externalDomain: '46.langamepro.ru',
      sessionMinutes: 60,
    };

    for (const storeId of ['store-1', 'store-2']) {
      expect(
        evaluateGuestGameProgress({ ...rule, storeIds: [storeId] }, event, []),
      ).toMatchObject({ current: 60, completed: true, matchedEvents: 1 });
    }
  });

  it('rejects an event without both store and domain', () => {
    expect(
      evaluateGuestGameProgress(
        rule,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-18T12:00:00.000Z'),
          storeId: null,
          externalDomain: null,
          sessionMinutes: 60,
        },
        [],
      ),
    ).toMatchObject({ current: 0, completed: false, matchedEvents: 0 });
  });

  it('keeps an exact store authoritative over a shared domain', () => {
    expect(
      evaluateGuestGameProgress(
        rule,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: new Date('2026-07-18T12:00:00.000Z'),
          storeId: 'store-2',
          externalDomain: '46.langamepro.ru',
          sessionMinutes: 60,
        },
        [],
      ),
    ).toMatchObject({ current: 0, completed: false, matchedEvents: 0 });
  });
});
