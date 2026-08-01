import * as genericSessionRemediation from './guest-game-generic-session-remediation';
import {
  assertGenericSessionEventMaterializationReadyInTransaction,
  prepareGenericSessionEventForMaterialization,
} from './guest-game-generic-session-materialization-readiness';

const tenantId = 'tenant-1';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    eventType: 'SESSION_START',
    payload: {
      source: 'guest_gamification_process_event',
      processSchemaVersion: 2,
      sourceFactId: 'fact-hourly-1',
      sourceFactKind: 'LEDGER_FALLBACK',
      sessionExternalId: 'session-1',
      externalId: 'session-1',
      input: { sessionPacket: false, sessionType: 'HOURLY' },
    },
    ...overrides,
  };
}

function mockRemediation(
  status:
    | 'NO_MATCH'
    | 'DEFERRED'
    | 'REMEDIATED'
    | 'RECONCILIATION_REQUIRED' = 'NO_MATCH',
) {
  return jest
    .spyOn(
      genericSessionRemediation,
      'remediateLegacyGenericSessionClassification',
    )
    .mockResolvedValue({
      status,
      eventId: 'event-1',
      changed: !['NO_MATCH', 'DEFERRED'].includes(status),
    });
}

describe('generic session materialization readiness', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not query replay state for an unrelated event', async () => {
    const queryRaw = jest.fn<Promise<unknown[]>, [unknown]>();

    await expect(
      prepareGenericSessionEventForMaterialization(
        { $queryRaw: queryRaw } as never,
        {
          tenantId,
          event: event({
            eventType: 'PRODUCT_PURCHASE',
            payload: { input: {} },
          }),
        },
      ),
    ).resolves.toEqual({
      status: 'READY',
      reason: 'NOT_A_LEGACY_TYPED_SESSION',
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
        factType: 'HOURLY_SESSION_STARTED',
        confidence: 'EXACT',
        syncStatus: 'PARTIAL',
        replayVersion: null,
      },
      'DEFERRED',
      'SOURCE_REPLAY_PENDING',
    ],
    [
      {
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: new Date('2026-07-31T00:00:00.000Z'),
        factType: 'HOURLY_SESSION_STARTED',
        confidence: 'EXACT',
        syncStatus: 'SUCCESS',
        replayVersion: 'hourly-session-expand-v1',
      },
      'DEFERRED',
      'SOURCE_FACT_RECLASSIFIED',
    ],
    [
      {
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
        factType: 'HOURLY_SESSION_STARTED',
        confidence: 'EXACT',
        syncStatus: 'SUCCESS',
        replayVersion: 'hourly-session-expand-v1',
      },
      'READY',
      'SOURCE_REPLAY_READY',
    ],
  ] as const)(
    'requires a coherent exact fact after remediation %#',
    async (row, status, reason) => {
      const queryRaw = jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockResolvedValue([row]);
      const remediation = mockRemediation();

      await expect(
        prepareGenericSessionEventForMaterialization(
          { $queryRaw: queryRaw } as never,
          { tenantId, event: event() },
        ),
      ).resolves.toEqual({ status, reason });
      expect(remediation).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['DEFERRED', 'DEFERRED', 'REMEDIATION_BUSY'],
    ['REMEDIATED', 'BLOCKED', 'CLASSIFICATION_REMEDIATED'],
    [
      'RECONCILIATION_REQUIRED',
      'BLOCKED',
      'CLASSIFICATION_RECONCILIATION_REQUIRED',
    ],
  ] as const)(
    'blocks before replay lookup for remediation outcome %s',
    async (remediationStatus, status, reason) => {
      const queryRaw = jest.fn<Promise<unknown[]>, [unknown]>();
      mockRemediation(remediationStatus);

      await expect(
        prepareGenericSessionEventForMaterialization(
          { $queryRaw: queryRaw } as never,
          { tenantId, event: event() },
        ),
      ).resolves.toEqual({ status, reason });
      expect(queryRaw).not.toHaveBeenCalled();
    },
  );

  it('allows a recognizable LIVE source only after remediation finds no ambiguity', async () => {
    const queryRaw = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([]);
    mockRemediation();
    const liveEvent = event({
      payload: {
        source: 'guest_gamification_process_event',
        processSchemaVersion: 2,
        sourceFactId: 'session-1',
        sourceFactKind: 'GUEST_SESSION',
        sessionExternalId: 'session-1',
        externalId: 'session-1',
        input: { sessionPacket: false, sessionType: 'HOURLY' },
      },
    });

    await expect(
      prepareGenericSessionEventForMaterialization(
        { $queryRaw: queryRaw } as never,
        { tenantId, event: liveEvent },
      ),
    ).resolves.toEqual({
      status: 'READY',
      reason: 'NO_AMBIGUOUS_SOURCE_PROOF',
    });
  });

  it('allows canonical snapshot lineage whose database id differs from the external session id', async () => {
    const queryRaw = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([]);
    mockRemediation();
    const snapshotEvent = event({
      payload: {
        source: 'guest_gamification_process_event',
        processSchemaVersion: 2,
        sourceFactId: 'session:guest-session-db-id:start',
        sourceFactKind: 'GUEST_SESSION',
        sessionExternalId: 'langame-external-session-id',
        externalId: 'langame-external-session-id',
        input: { sessionPacket: false, sessionType: 'HOURLY' },
      },
    });

    await expect(
      prepareGenericSessionEventForMaterialization(
        { $queryRaw: queryRaw } as never,
        { tenantId, event: snapshotEvent },
      ),
    ).resolves.toEqual({
      status: 'READY',
      reason: 'NO_AMBIGUOUS_SOURCE_PROOF',
    });
  });

  it.each([
    ['SESSION_STARTED', 'EXACT'],
    ['PACKAGE_OR_SUBSCRIPTION_USED', 'EXACT'],
    ['HOURLY_SESSION_STARTED', 'UNKNOWN'],
  ])(
    'blocks an incoherent ready source fact (%s/%s)',
    async (factType, confidence) => {
      const queryRaw = jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockResolvedValue([
          {
            lifecycleStatus: 'ACTIVE',
            supersededAt: null,
            factType,
            confidence,
            syncStatus: 'SUCCESS',
            replayVersion: 'hourly-session-expand-v1',
          },
        ]);
      mockRemediation();

      await expect(
        prepareGenericSessionEventForMaterialization(
          { $queryRaw: queryRaw } as never,
          { tenantId, event: event() },
        ),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'SOURCE_FACT_INCOHERENT',
      });
    },
  );

  it('defers a ledger-backed event whose exact fact disappeared', async () => {
    const queryRaw = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([]);
    mockRemediation();

    await expect(
      prepareGenericSessionEventForMaterialization(
        { $queryRaw: queryRaw } as never,
        { tenantId, event: event() },
      ),
    ).resolves.toEqual({
      status: 'DEFERRED',
      reason: 'SOURCE_FACT_MISSING',
    });
  });
});

describe('transactional generic session materialization fence', () => {
  const legacyPayload = event().payload;

  it('blocks an event carrying the fail-closed remediation marker', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        eventType: 'SESSION_START',
        payload: {
          ...legacyPayload,
          genericSessionClassificationRemediation: {
            schemaVersion: 1,
            kind: 'GENERIC_SESSION_FAIL_CLOSED',
            status: 'REMEDIATED',
            semanticClassification: {
              sessionPacket: null,
              sessionType: null,
            },
          },
        },
      },
    ]);

    await expect(
      assertGenericSessionEventMaterializationReadyInTransaction(
        { $queryRaw: queryRaw } as never,
        { tenantId, eventId: 'event-1' },
      ),
    ).rejects.toThrow(
      'Generic session classification blocks reward materialization.',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('allows a coherent exact typed ledger fact', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        { eventType: 'SESSION_START', payload: legacyPayload },
      ])
      .mockResolvedValueOnce([
        {
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          factType: 'HOURLY_SESSION_STARTED',
          confidence: 'EXACT',
          syncStatus: 'SUCCESS',
          replayVersion: 'hourly-session-expand-v1',
        },
      ]);

    await expect(
      assertGenericSessionEventMaterializationReadyInTransaction(
        { $queryRaw: queryRaw } as never,
        { tenantId, eventId: 'event-1' },
      ),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      [
        {
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          confidence: 'EXACT',
          syncStatus: 'SUCCESS',
          replayVersion: 'hourly-session-expand-v1',
        },
      ],
      'The exact session source is not ready for reward materialization.',
    ],
    [[], 'The exact session source is missing for reward materialization.'],
  ])(
    'blocks an incoherent or missing ledger fact %#',
    async (facts, message) => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([
          { eventType: 'SESSION_START', payload: legacyPayload },
        ])
        .mockResolvedValueOnce(facts);

      await expect(
        assertGenericSessionEventMaterializationReadyInTransaction(
          { $queryRaw: queryRaw } as never,
          { tenantId, eventId: 'event-1' },
        ),
      ).rejects.toThrow(message);
    },
  );

  it('allows an unrelated source event without a fact lookup', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([
        { eventType: 'PRODUCT_PURCHASE', payload: { input: {} } },
      ]);

    await expect(
      assertGenericSessionEventMaterializationReadyInTransaction(
        { $queryRaw: queryRaw } as never,
        { tenantId, eventId: 'purchase-event-1' },
      ),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('blocks PLAY_HOUR when its locked snapshot has become an expanded session', async () => {
    const payload = {
      source: 'guest_gamification_process_event',
      processSchemaVersion: 2,
      sourceFactId: 'session:session-db-1:play',
      sourceFactKind: 'GUEST_SESSION',
      sessionExternalId: 'session-external-1',
      externalId: 'session-external-1',
      input: { sessionPacket: false, sessionType: 'HOURLY' },
    };
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          eventType: 'PLAY_HOUR',
          payload,
          externalProvider: 'LANGAME',
          externalDomain: 'club-1',
          createdAt: new Date('2026-07-30T12:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'session-db-1',
          packet: false,
          expand: true,
          updatedAt: new Date('2026-07-30T12:05:00.000Z'),
        },
      ]);

    await expect(
      assertGenericSessionEventMaterializationReadyInTransaction(
        { $queryRaw: queryRaw } as never,
        { tenantId, eventId: 'play-event-1' },
      ),
    ).rejects.toThrow(
      'An expanded session cannot prove an hourly reward segment.',
    );
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      new Date('2026-07-30T11:59:00.000Z'),
      'rejects',
      'An expanded session cannot prove an hourly reward segment.',
    ],
    [new Date('2026-07-30T12:05:00.000Z'), 'resolves', null],
  ] as const)(
    'uses snapshot timing to preserve only a SESSION_START proven before expansion %#',
    async (updatedAt, outcome, message) => {
      const payload = {
        source: 'guest_gamification_process_event',
        processSchemaVersion: 2,
        sourceFactId: 'session:session-db-1:start',
        sourceFactKind: 'GUEST_SESSION',
        sessionExternalId: 'session-external-1',
        externalId: 'session-external-1',
        input: { sessionPacket: false, sessionType: 'HOURLY' },
      };
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([
          {
            eventType: 'SESSION_START',
            payload,
            externalProvider: 'LANGAME',
            externalDomain: 'club-1',
            createdAt: new Date('2026-07-30T12:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'session-db-1',
            packet: false,
            expand: true,
            updatedAt,
          },
        ]);
      const assertion = expect(
        assertGenericSessionEventMaterializationReadyInTransaction(
          { $queryRaw: queryRaw } as never,
          { tenantId, eventId: 'start-event-1' },
        ),
      );

      if (outcome === 'rejects') {
        await assertion.rejects.toThrow(message ?? undefined);
      } else {
        await assertion.resolves.toBeUndefined();
      }
    },
  );
});
