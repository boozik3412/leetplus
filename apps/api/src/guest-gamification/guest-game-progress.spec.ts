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
