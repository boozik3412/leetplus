import {
  evaluateGuestGameLedgerRule,
  type GuestGameLedgerFact,
  type GuestGameLedgerRule,
} from './guest-game-rule-evaluator';

const STORE_ID = 'store-pushkinskaya';
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
    tariffName: null,
    tariffType: null,
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

  it.todo(
    'суммирует игровое время нужного типа только после activatedAt и сравнивает с порогом правила',
  );
});
