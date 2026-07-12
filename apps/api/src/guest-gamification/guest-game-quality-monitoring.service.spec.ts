import {
  buildShadowRolloutReadiness,
  buildQualityAlerts,
  decisionPairMetrics,
  detectEventMixShift,
  isSyncStateInQualityWindow,
  syncStateLagSeconds,
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

  it('measures sync SLA only for the active quality window', () => {
    const windowFrom = new Date('2026-07-11T12:00:00.000Z');

    expect(
      isSyncStateInQualityWindow(
        {
          status: 'SUCCESS',
          lastStartedAt: new Date('2026-07-11T11:59:59.000Z'),
        },
        windowFrom,
      ),
    ).toBe(false);
    expect(
      isSyncStateInQualityWindow(
        {
          status: 'SUCCESS',
          lastStartedAt: new Date('2026-07-11T12:00:00.000Z'),
        },
        windowFrom,
      ),
    ).toBe(true);
    expect(
      isSyncStateInQualityWindow(
        { status: 'RUNNING', lastStartedAt: null },
        windowFrom,
      ),
    ).toBe(true);
  });

  it('measures processing lag instead of time since the guest last visited', () => {
    const now = new Date('2026-07-12T12:00:00.000Z');

    expect(
      syncStateLagSeconds(
        {
          status: 'SUCCESS',
          lastStartedAt: new Date('2026-07-11T12:00:00.000Z'),
          lastRequestedTo: new Date('2026-07-11T12:00:00.000Z'),
          lastSuccessfulTo: new Date('2026-07-11T12:00:00.000Z'),
        },
        now,
      ),
    ).toBe(0);
    expect(
      syncStateLagSeconds(
        {
          status: 'PARTIAL',
          lastStartedAt: new Date('2026-07-12T11:30:00.000Z'),
          lastRequestedTo: new Date('2026-07-12T12:00:00.000Z'),
          lastSuccessfulTo: new Date('2026-07-12T11:45:00.000Z'),
        },
        now,
      ),
    ).toBe(15 * 60);
    expect(
      syncStateLagSeconds(
        {
          status: 'RUNNING',
          lastStartedAt: new Date('2026-07-12T11:58:30.000Z'),
          lastRequestedTo: now,
          lastSuccessfulTo: null,
        },
        now,
      ),
    ).toBe(90);
  });

  it('requires a continuous 14-day clean and paired shadow window', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    const cleanSnapshot = (measuredAt: string) => ({
      measuredAt: new Date(measuredAt),
      staleSyncCount: 0,
      failedSyncCount: 0,
      partialSyncCount: 0,
      failedJobCount: 0,
      decisionRunCount: 100,
      decisionCoverage: 1,
      missingDecisionCount: 0,
      shadowMismatchRate: 0,
    });
    const ready = buildShadowRolloutReadiness(
      [
        cleanSnapshot('2026-07-01T00:00:00.000Z'),
        cleanSnapshot('2026-07-15T00:00:00.000Z'),
      ],
      now,
      0.01,
      0,
    );
    const blocked = buildShadowRolloutReadiness(
      [cleanSnapshot('2026-07-14T00:00:00.000Z')],
      now,
      0.01,
      1,
    );

    expect(ready).toMatchObject({
      canaryReady: true,
      syncCleanSeconds: 14 * 24 * 60 * 60,
      shadowQualifiedSeconds: 14 * 24 * 60 * 60,
      blockers: [],
    });
    expect(blocked.canaryReady).toBe(false);
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        'SYNC_CLEAN_WINDOW',
        'SHADOW_QUALIFIED_WINDOW',
        'STALE_BINDINGS',
      ]),
    );
  });
});
