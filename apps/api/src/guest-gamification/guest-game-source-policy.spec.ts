import {
  guestGameBattlePassStepEvaluationPolicy,
  guestGameEvaluationPolicy,
  guestGameLootBoxEvaluationPolicy,
  guestGameMissionEvaluationPolicy,
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

  it('routes every v2 PLAY_TIME mission through the fallback even with a stale stored policy', () => {
    expect(
      guestGameMissionEvaluationPolicy(
        2,
        { schemaVersion: 2, taskType: 'PLAY_TIME' },
        'PLAY_TIME',
        'LIVE_PRIMARY',
      ),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
  });

  it('canonicalizes every PLAY_HOUR lootbox to fallback while session-start stays primary', () => {
    expect(guestGameLootBoxEvaluationPolicy('PLAY_HOUR', {})).toBe(
      'LIVE_WITH_LEDGER_FALLBACK',
    );
    expect(guestGameLootBoxEvaluationPolicy('SESSION_START', {})).toBe(
      'LIVE_PRIMARY',
    );
    expect(
      guestGameLootBoxEvaluationPolicy('PLAY_HOUR', {
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
  });

  it('routes every semantic PLAY_TIME Battle Pass step through the fallback', () => {
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 2,
        taskType: 'PLAY_TIME',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        taskType: 'PLAY_TIME',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 2,
        taskType: 'APP_OPEN',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_PRIMARY');
  });

  it('keeps an explicit non-play-time Battle Pass task primary despite stale play-time fields', () => {
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 2,
        taskType: 'CHECK_IN',
        triggerKind: 'PLAY_HOUR',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_PRIMARY');
  });
});
