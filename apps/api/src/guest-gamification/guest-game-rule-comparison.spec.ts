import { compareGuestGameRuleDecisionPair } from './guest-game-rule-comparison';

describe('compareGuestGameRuleDecisionPair', () => {
  it('matches only a paired LIVE and SHADOW outcome', () => {
    expect(
      compareGuestGameRuleDecisionPair({
        live: { status: 'BLOCKED', blockers: ['weekday'] },
        shadow: { status: 'BLOCKED', blockers: ['weekday'] },
        sourceFreshness: 'FRESH',
      }),
    ).toEqual({ verdict: 'MATCH', differingConditions: [] });
  });

  it('reports a mismatch and the differing conditions', () => {
    expect(
      compareGuestGameRuleDecisionPair({
        live: { status: 'MATCHED', reasons: ['session'] },
        shadow: { status: 'BLOCKED', blockers: ['weekday'] },
        sourceFreshness: 'FRESH',
      }),
    ).toEqual({
      verdict: 'MISMATCH',
      differingConditions: ['session', 'weekday'],
    });
  });

  it('does not turn a missing LIVE decision into NO_DECISION', () => {
    expect(
      compareGuestGameRuleDecisionPair({
        live: null,
        shadow: { status: 'MATCHED' },
        sourceFreshness: 'FRESH',
      }).verdict,
    ).toBe('NOT_EVALUATED');
  });

  it('distinguishes stale and missing source data from an evaluator gap', () => {
    expect(
      compareGuestGameRuleDecisionPair({
        live: { status: 'BLOCKED' },
        shadow: null,
        sourceFreshness: 'STALE',
      }).verdict,
    ).toBe('STALE_SOURCE');
    expect(
      compareGuestGameRuleDecisionPair({
        live: { status: 'BLOCKED' },
        shadow: null,
        sourceFreshness: 'MISSING',
      }).verdict,
    ).toBe('INSUFFICIENT_SOURCE_DATA');
  });

  it('reports insufficient ledger evidence separately from a mismatch', () => {
    expect(
      compareGuestGameRuleDecisionPair({
        live: { status: 'BLOCKED' },
        shadow: { status: 'INSUFFICIENT_DATA' },
        sourceFreshness: 'FRESH',
      }).verdict,
    ).toBe('INSUFFICIENT_SOURCE_DATA');
  });
});
