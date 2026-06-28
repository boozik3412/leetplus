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
});
