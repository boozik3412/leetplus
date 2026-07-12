import { evaluateGuestGameLedgerRule } from './guest-game-rule-evaluator';
import { includesCorrelation } from './guest-gamification-log.service';

describe('includesCorrelation', () => {
  it('finds explicit and nested correlation identifiers case-insensitively', () => {
    expect(
      includesCorrelation(
        {
          evaluationRunId: 'RUN-ABC-123',
          payload: { sessionExternalId: 'session-42' },
        },
        'run-abc',
      ),
    ).toBe(true);
    expect(
      includesCorrelation(
        { payload: { sessionExternalId: 'session-42' } },
        'session-42',
      ),
    ).toBe(true);
    expect(includesCorrelation({ traceId: 'trace-1' }, 'missing')).toBe(false);
  });
});

describe('evaluateLedgerRule', () => {
  const rule = {
    type: 'LOOT_BOX',
    id: 'weekend-box',
    title: 'КЕЙС «WEEKEND»',
    triggerKind: 'SESSION_START',
    sessionType: 'packet_hours',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    activatedAt: new Date('2026-07-01T00:00:00.000Z'),
    periodFrom: null,
    periodTo: null,
    periodRules: {
      weekdayMode: 'WEEKENDS',
      weekdays: [0, 6],
      hours: [],
    },
    storeIds: ['store-1'],
  };

  const fact = (happenedAt: string) => ({
    id: `fact-${happenedAt}`,
    factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
    confidence: 'EXACT',
    happenedAt: new Date(happenedAt),
    createdAt: new Date(happenedAt),
    storeId: 'store-1',
    tariffName: null,
    tariffType: 'package_or_subscription',
    store: { timeZone: 'Asia/Yekaterinburg' },
  });

  it('blocks a weekend rule when the matching package fact happened on Friday', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-07-10T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('день недели');
  });

  it('matches a weekend rule when the package fact happened on Saturday', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-07-11T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('MATCHED');
    expect(result.facts).toHaveLength(1);
  });

  it('does not reuse a fact created before rule activation', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-06-27T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('до активации');
  });
});
