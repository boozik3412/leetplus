import {
  guestGameEvaluationPolicy,
  guestGamePolicyAllowsEvaluation,
} from './guest-game-source-policy';

describe('guest game source policy router', () => {
  it('keeps supplemental rules out of the primary LIVE path', () => {
    expect(guestGamePolicyAllowsEvaluation('LEDGER_SUPPLEMENTAL', 'LIVE')).toBe(
      false,
    );
    expect(guestGamePolicyAllowsEvaluation('LIVE_PRIMARY', 'LIVE')).toBe(true);
  });

  it('allows only explicitly supplemental rules in supplemental LIVE', () => {
    expect(
      guestGamePolicyAllowsEvaluation(
        'LEDGER_SUPPLEMENTAL',
        'LIVE_SUPPLEMENTAL',
      ),
    ).toBe(true);
    expect(
      guestGamePolicyAllowsEvaluation('LIVE_PRIMARY', 'LIVE_SUPPLEMENTAL'),
    ).toBe(false);
  });

  it('allows only fallback rules in Ledger fallback LIVE', () => {
    expect(
      guestGamePolicyAllowsEvaluation(
        'LIVE_WITH_LEDGER_FALLBACK',
        'LIVE_LEDGER_FALLBACK',
      ),
    ).toBe(true);
    expect(
      guestGamePolicyAllowsEvaluation('LIVE_PRIMARY', 'LIVE_LEDGER_FALLBACK'),
    ).toBe(false);
  });

  it('treats legacy or invalid values as LIVE_PRIMARY', () => {
    expect(guestGameEvaluationPolicy(null)).toBe('LIVE_PRIMARY');
    expect(guestGameEvaluationPolicy('unexpected')).toBe('LIVE_PRIMARY');
  });
});
