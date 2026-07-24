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

  it.each([
    [
      'conditions task type',
      { taskType: 'SESSION_START' },
      'CUSTOM',
      'APP_OPEN',
    ],
    [
      'conditions event marker',
      { eventTypes: 'SESSION_START' },
      'CUSTOM',
      'APP_OPEN',
    ],
    [
      'metric event marker',
      { metric: { eventType: 'SESSION_START' } },
      'CUSTOM',
      'APP_OPEN',
    ],
    ['legacy mission type', {}, 'SESSION_START', 'APP_OPEN'],
    ['denormalized trigger', {}, 'CUSTOM', 'SESSION_START'],
  ])(
    'routes a SESSION_START mission represented by %s through the fallback',
    (_label, conditions, missionType, triggerKind) => {
      expect(
        guestGameMissionEvaluationPolicy(
          1,
          conditions,
          missionType,
          'LIVE_PRIMARY',
          triggerKind,
        ),
      ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    },
  );

  it('lets an explicit non-start mission event marker override stale SESSION_START fields', () => {
    expect(
      guestGameMissionEvaluationPolicy(
        2,
        {
          taskType: 'SESSION_START',
          metric: { eventTypes: ['APP_OPEN'] },
        },
        'SESSION_START',
        'LIVE_PRIMARY',
        'SESSION_START',
      ),
    ).toBe('LIVE_PRIMARY');
  });

  it('canonicalizes every PLAY_HOUR and SESSION_START lootbox to fallback', () => {
    expect(guestGameLootBoxEvaluationPolicy('PLAY_HOUR', {})).toBe(
      'LIVE_WITH_LEDGER_FALLBACK',
    );
    expect(guestGameLootBoxEvaluationPolicy('SESSION_START', {})).toBe(
      'LIVE_WITH_LEDGER_FALLBACK',
    );
    expect(
      guestGameLootBoxEvaluationPolicy('PLAY_HOUR', {
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameLootBoxEvaluationPolicy('SESSION_START', {
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
  });

  it('routes every semantic PLAY_TIME or SESSION_START Battle Pass step through the fallback', () => {
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
        triggerKind: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        eventTypes: ['SESSION_START'],
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        metric: { eventTypes: ['SESSION_START'] },
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        eventTypes: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        eventType: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        metric: { eventType: 'SESSION_START' },
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

  it('lets an explicit non-start event marker override stale session triggers', () => {
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 2,
        taskType: 'CHECK_IN',
        triggerKind: 'SESSION_START',
        metric: { eventTypes: 'APP_OPEN' },
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_PRIMARY');
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 1,
        triggerKind: 'PLAY_HOUR',
        eventType: 'APP_OPEN',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_PRIMARY');
  });

  it('routes the wizard SESSION_START taskType through the typed ledger fallback', () => {
    expect(
      guestGameBattlePassStepEvaluationPolicy({
        schemaVersion: 2,
        taskType: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
      }),
    ).toBe('LIVE_WITH_LEDGER_FALLBACK');
  });
});
