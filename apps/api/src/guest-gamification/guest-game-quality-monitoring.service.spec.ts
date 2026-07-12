import {
  buildQualityAlerts,
  decisionPairMetrics,
  detectEventMixShift,
} from './guest-game-quality-monitoring.service';

describe('guest game quality monitoring', () => {
  it('measures paired coverage and mismatch by evaluationRunId', () => {
    expect(
      decisionPairMetrics([
        { evaluationRunId: 'run-1', evaluationMode: 'LIVE', status: 'BLOCKED' },
        {
          evaluationRunId: 'run-1',
          evaluationMode: 'SHADOW',
          status: 'NO_MATCH',
        },
        { evaluationRunId: 'run-2', evaluationMode: 'LIVE', status: 'MATCHED' },
        {
          evaluationRunId: 'run-2',
          evaluationMode: 'SHADOW',
          status: 'BLOCKED',
        },
        { evaluationRunId: 'run-3', evaluationMode: 'LIVE', status: 'BLOCKED' },
      ]),
    ).toEqual({
      decisionRunCount: 3,
      pairedDecisionCount: 2,
      missingDecisionCount: 1,
      mismatchedRunCount: 1,
      decisionCoverage: 2 / 3,
      shadowMismatchRate: 1 / 2,
    });
  });

  it('creates actionable alerts for lag, failures and missing decisions', () => {
    const alerts = buildQualityAlerts({
      syncLagSecondsMax: 901,
      staleSyncCount: 2,
      failedSyncCount: 1,
      staleBindingCount: 0,
      longPartialCount: 1,
      failedJobCount: 0,
      missingDecisionCount: 3,
      mismatchedRunCount: 2,
      shadowMismatchRate: 0.2,
      eventMixShift: null,
      thresholds: {
        syncLagSeconds: 600,
        partialSeconds: 3600,
        mismatchRate: 0.01,
      },
    });

    expect(alerts.map((alert) => alert.code)).toEqual([
      'SYNC_LAG',
      'SYNC_FAILED',
      'PARTIAL_TOO_LONG',
      'MISSING_DECISION',
      'SHADOW_MISMATCH_RATE',
    ]);
  });

  it('reports stale Langame identities separately from retryable failures', () => {
    const alerts = buildQualityAlerts({
      syncLagSecondsMax: null,
      staleSyncCount: 0,
      failedSyncCount: 0,
      staleBindingCount: 2,
      longPartialCount: 0,
      failedJobCount: 0,
      missingDecisionCount: 0,
      mismatchedRunCount: 0,
      shadowMismatchRate: 0,
      eventMixShift: null,
      thresholds: {
        syncLagSeconds: 600,
        partialSeconds: 3600,
        mismatchRate: 0.01,
      },
    });

    expect(alerts).toEqual([
      expect.objectContaining({
        code: 'STALE_GUEST_BINDING',
        severity: 'WARNING',
        details: { staleBindingCount: 2 },
      }),
    ]);
  });

  it('detects only material event mix shifts with enough volume', () => {
    expect(
      detectEventMixShift(
        { GAME_SUMMARY: 20, LOOT_BOX_OPEN: 20 },
        { GAME_SUMMARY: 40, LOOT_BOX_OPEN: 0 },
      ),
    ).toMatchObject({ action: 'GAME_SUMMARY' });
    expect(
      detectEventMixShift(
        { GAME_SUMMARY: 2, LOOT_BOX_OPEN: 2 },
        { GAME_SUMMARY: 4, LOOT_BOX_OPEN: 0 },
      ),
    ).toBeNull();
  });
});
