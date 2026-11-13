import {
  storeFloorPlanAdminTip,
  storeFloorPlanAlertText,
  storeFloorPlanSeatHints,
  type StoreFloorPlanHintInput,
} from './store-floor-plan-attention';

const now = new Date('2026-11-12T15:00:00.000Z');

function row(
  patch: Partial<NonNullable<StoreFloorPlanHintInput['row']>> = {},
): NonNullable<StoreFloorPlanHintInput['row']> {
  return {
    segment: 'active',
    visitsDays: 6,
    rfm: { segment: 'PROMISING' } as never,
    crmStatus: 'NONE',
    nextAction: null,
    bonusLoad: { status: 'OK', currentBalance: 0 } as never,
    gameProfile: {
      pendingRewards: 0,
      rewardsExpiringSoon: 0,
      nearestRewardExpiresAt: null,
      engagement: 'ACTIVE',
    } as never,
    ...patch,
  };
}

function input(
  patch: Partial<StoreFloorPlanHintInput> = {},
): StoreFloorPlanHintInput {
  return {
    now,
    startedAt: new Date(now.getTime() - 60 * 60_000),
    endsAt: new Date(now.getTime() + 60 * 60_000),
    purchases: 2,
    guestAccess: true,
    isStaff: false,
    newGuest: false,
    row: row(),
    previousVisitAt: null,
    ...patch,
  };
}

const keys = (value: StoreFloorPlanHintInput) =>
  storeFloorPlanSeatHints(value).map((hint) => hint.key);

describe('storeFloorPlanSeatHints', () => {
  it('stays quiet for an ordinary guest', () => {
    expect(keys(input())).toEqual([]);
  });

  it('asks to remind about rewards, the expiring one first', () => {
    const waiting = storeFloorPlanSeatHints(
      input({
        row: row({
          gameProfile: {
            pendingRewards: 2,
            rewardsExpiringSoon: 0,
            nearestRewardExpiresAt: null,
            engagement: 'ACTIVE',
          } as never,
        }),
      }),
    );
    expect(waiting[0]).toMatchObject({
      key: 'REWARDS_WAITING',
      tone: 'TODAY',
      title: '2 награды ждут',
    });

    const expiring = storeFloorPlanSeatHints(
      input({
        row: row({
          gameProfile: {
            pendingRewards: 2,
            rewardsExpiringSoon: 1,
            nearestRewardExpiresAt: '2026-11-13T20:59:00.000Z',
            engagement: 'ACTIVE',
          } as never,
        }),
      }),
    );
    expect(expiring.map((hint) => hint.key)).toEqual(['REWARD_EXPIRING']);
    expect(expiring[0].title).toBe('Награда сгорает 13.11');
  });

  it('invites a frequent guest without a game profile, unless asked not to', () => {
    expect(
      keys(input({ row: row({ segment: 'repeat', gameProfile: null }) })),
    ).toEqual(['NOT_IN_GAME']);
    expect(
      keys(
        input({
          row: row({
            segment: 'repeat',
            gameProfile: null,
            crmStatus: 'DO_NOT_CONTACT',
          }),
        }),
      ),
    ).toEqual([]);
  });

  it('offers to extend a session that ends within ten minutes', () => {
    const hints = storeFloorPlanSeatHints(
      input({ endsAt: new Date(now.getTime() + 9 * 60_000 + 1_000) }),
    );
    expect(hints[0]).toMatchObject({
      key: 'TIME_ENDING',
      title: 'Осталось 10 мин',
    });
  });

  it('shows only the session hint without access to guests or for staff', () => {
    const ending = new Date(now.getTime() + 5 * 60_000);
    const guest = row({ segment: 'repeat', gameProfile: null });
    expect(
      keys(input({ guestAccess: false, endsAt: ending, row: guest })),
    ).toEqual(['TIME_ENDING']);
    expect(keys(input({ isStaff: true, endsAt: ending, row: guest }))).toEqual([
      'TIME_ENDING',
    ]);
  });

  it('marks a first visit, a return after a break and a VIP', () => {
    expect(keys(input({ newGuest: true, row: null }))).toEqual(['FIRST_VISIT']);
    const hints = storeFloorPlanSeatHints(
      input({
        row: row({ crmStatus: 'VIP' }),
        previousVisitAt: new Date(now.getTime() - 46 * 24 * 60 * 60_000),
      }),
    );
    expect(hints.map((hint) => [hint.key, hint.title])).toEqual([
      ['VIP', 'VIP'],
      ['RETURNED', 'Не был(а) 45 дней'],
    ]);
  });

  it('suggests a drink after three hours without purchases, only when the bar was read', () => {
    const long = new Date(now.getTime() - 3 * 60 * 60_000 - 60_000);
    expect(keys(input({ startedAt: long, purchases: 0 }))).toEqual([
      'NO_PURCHASES',
    ]);
    expect(keys(input({ startedAt: long, purchases: null }))).toEqual([]);
  });

  it('orders hints by urgency and keeps the manager task text short', () => {
    const hints = storeFloorPlanSeatHints(
      input({
        endsAt: new Date(now.getTime() + 3 * 60_000),
        row: row({
          nextAction: `Предложить абонемент ${'очень '.repeat(40)}`,
          crmStatus: 'VIP',
          bonusLoad: { status: 'RISK', currentBalance: 1200.4 } as never,
        }),
      }),
    );
    expect(hints.map((hint) => hint.tone)).toEqual([
      'TODAY',
      'OFFER',
      'KNOW',
      'KNOW',
    ]);
    expect(hints[1].title).toBe('1 200 бонусов не потрачены');
    expect(hints[2].key).toBe('TASK');
    expect(hints[2].hint.length).toBeLessThanOrEqual(140);
  });
});

describe('storeFloorPlanAlertText', () => {
  it('keeps one short line', () => {
    expect(storeFloorPlanAlertText('  Не работает\n\nгарнитура ')).toBe(
      'Не работает гарнитура',
    );
    expect(storeFloorPlanAlertText('а'.repeat(500))).toHaveLength(200);
  });
});

describe('storeFloorPlanAdminTip («Подсказка админу» on the scheme)', () => {
  const base = {
    crmStatus: 'NONE',
    nextAction: null,
    pendingRewards: 0,
    expectedIntervalDays: null,
    previousVisitAt: null,
    sessionStartedAt: now,
  };
  const tip = (key: string, patch: Record<string, unknown> = {}) =>
    storeFloorPlanAdminTip({
      ...base,
      action: { key, label: 'CRM', reason: 'CRM reason' },
      ...patch,
    });

  it('says the CRM recommendations as what to do at the computer', () => {
    expect(
      tip('WIN_BACK', {
        expectedIntervalDays: 7,
        previousVisitAt: new Date('2026-09-28T15:00:00.000Z'),
      }),
    ).toEqual({
      key: 'WIN_BACK',
      label:
        'Давно не был(а): 45 дней, обычно раз в неделю. Скажи, что рады видеть, и напомни про бонусы',
      reason: '',
    });
    expect(tip('WIN_BACK')?.label).toBe(
      'Давно не был(а) в клубе. Скажи, что рады видеть, и напомни про бонусы',
    );
    expect(tip('REACTIVATE')?.label).toBe(
      'Снова в клубе после долгого перерыва. Уточни телефон и предложи Telegram-бот клуба, чтобы не пропадать',
    );
    expect(tip('SECOND_VISIT')?.label).toBe(
      'Пока один визит. Расскажи, зачем прийти снова, и предложи Telegram-бот',
    );
    expect(tip('CLAIM_REWARD', { pendingRewards: 2 })?.label).toBe(
      '2 награды ждут в приложении. Подскажи, где забрать',
    );
    expect(tip('CLAIM_REWARD', { pendingRewards: 5 })?.label).toBe(
      '5 наград ждут в приложении. Подскажи, где забрать',
    );
    expect(tip('INVITE_TO_GAME')?.label).toBe(
      'Не в игре. Покажи QR на стойке, за регистрацию будет первый кейс',
    );
    expect(tip('KEEP_WARM')?.label).toBe(
      'Один из лучших гостей клуба. Поздоровайся по имени и поблагодари',
    );
    expect(
      tip('MANUAL', { nextAction: '  Вернуть  наушники\nв зал ' })?.label,
    ).toBe('Задача из CRM: Вернуть наушники в зал');
  });

  it('shows «не беспокоить» and hides what the hall cannot do', () => {
    expect(tip('OBSERVE', { crmStatus: 'DO_NOT_CONTACT' })?.label).toBe(
      'Отказался(ась) от сообщений. Обслуживай как обычно, но акции и рассылки не предлагай',
    );
    expect(tip('OBSERVE')).toBeNull();
    expect(tip('SOFT_TOUCH')).toBeNull();
  });

  it('keeps an unknown recommendation as the card says it', () => {
    expect(tip('SOMETHING_NEW')).toEqual({
      key: 'SOMETHING_NEW',
      label: 'CRM',
      reason: 'CRM reason',
    });
  });
});
