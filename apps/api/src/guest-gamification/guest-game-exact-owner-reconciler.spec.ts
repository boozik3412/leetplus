import { IntegrationProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  reconcileExactCanonicalEventOwner,
  type ExactCanonicalOwnerReconcileInput,
} from './guest-game-exact-owner-reconciler';

const updatedAt = new Date('2026-07-24T05:00:00.000Z');

const input: ExactCanonicalOwnerReconcileInput = {
  tenantId: 'tenant-1',
  eventId: 'event-1',
  originKey: 'origin-1',
  expectedEventType: 'PLAY_HOUR',
  targetProfileId: 'profile-b',
  targetGuestId: 'guest-b',
  sourceFactId: 'fact-b',
  sourceFactUpdatedAt: updatedAt,
};

const staleEvent = {
  id: 'event-1',
  profileId: 'profile-a',
  guestId: 'guest-a',
  lootBoxId: null,
  missionId: null,
  seasonId: null,
  eventType: 'PLAY_HOUR',
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: 'club.example.test',
  originKey: 'origin-1',
  xpDelta: 0,
  payload: null,
};

const activeFact = {
  id: 'fact-b',
  profileId: 'profile-b',
  guestId: 'guest-b',
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: 'club.example.test',
  sourceKind: 'LANGAME_GUEST_SESSION',
  sessionExternalId: 'session-1',
  factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
  confidence: 'EXACT',
  lifecycleStatus: 'ACTIVE',
  supersededAt: null,
  updatedAt,
};

const staleFact = {
  ...activeFact,
  id: 'fact-a',
  profileId: 'profile-a',
  guestId: 'guest-a',
  sourceKind: 'GUEST_SESSION',
  lifecycleStatus: 'SUPERSEDED',
  supersededAt: new Date('2026-07-24T04:59:00.000Z'),
  updatedAt: new Date('2026-07-24T04:58:00.000Z'),
};

const exactReceipt = {
  id: 'receipt-1',
  factId: 'fact-a',
  eventId: 'event-1',
  eventType: 'PLAY_HOUR',
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: 'club.example.test',
  policy: 'EXACT_OPERATOR_CANONICALIZATION',
  status: 'PROCESSED',
  claimedSource: 'EXACT_OPERATOR_CANONICALIZATION',
};

const noEffects = {
  xpPostingCount: 0n,
  rewardIntentCount: 0n,
  entitlementCount: 0n,
  supplementalReceiptCount: 0n,
  rewardCount: 0n,
  ruleDecisionCount: 0n,
};

function ownerReconcilePrisma(
  rawResults: unknown[],
  overrides?: {
    quarantineMarker?: {
      id: string;
      factId: string;
      eventId: string;
      policy: string;
      status: string;
    } | null;
    eventUpdateCount?: number;
    receiptUpdateCount?: number;
  },
) {
  const tx = {
    $queryRaw: jest.fn(),
    guestGameEvent: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.eventUpdateCount ?? 1 }),
    },
    guestGameOriginReceipt: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides?.quarantineMarker ?? null),
      create: jest.fn().mockResolvedValue({ id: 'quarantine-1' }),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.receiptUpdateCount ?? 1 }),
    },
    guestGameRuleDecision: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestGameAuditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  for (const result of rawResults) {
    tx.$queryRaw.mockResolvedValueOnce(result);
  }
  const prisma = {
    $transaction: jest.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  } as unknown as PrismaService;
  return { prisma, tx };
}

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

describe('reconcileExactCanonicalEventOwner', () => {
  it('atomically rebinds a pristine stale exact event and receipt to the active owner', async () => {
    const { prisma, tx } = ownerReconcilePrisma([
      [staleEvent],
      [activeFact],
      [activeFact],
      [exactReceipt],
      [staleFact],
      [noEffects],
    ]);

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toEqual({
      status: 'REBOUND',
      previousProfileId: 'profile-a',
      previousGuestId: 'guest-a',
    });
    const eventUpdate = firstCallArgument(tx.guestGameEvent.updateMany);
    expect(eventUpdate).toMatchObject({
      where: {
        profileId: 'profile-a',
        guestId: 'guest-a',
        xpDelta: 0,
      },
      data: {
        profileId: 'profile-b',
        guestId: 'guest-b',
      },
    });
    const receiptUpdate = firstCallArgument(
      tx.guestGameOriginReceipt.updateMany,
    );
    expect(receiptUpdate).toMatchObject({
      where: {
        factId: 'fact-a',
        eventId: 'event-1',
      },
      data: { factId: 'fact-b' },
    });
    expect(tx.guestGameRuleDecision.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', eventId: 'event-1' },
      data: { profileId: 'profile-b', guestId: 'guest-b' },
    });
  });

  it('rebinds diagnostic decisions with the pristine event instead of treating them as effects', async () => {
    const { prisma, tx } = ownerReconcilePrisma([
      [staleEvent],
      [activeFact],
      [activeFact],
      [exactReceipt],
      [staleFact],
      [{ ...noEffects, ruleDecisionCount: 2n }],
    ]);

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toMatchObject({ status: 'REBOUND' });
    expect(tx.guestGameOriginReceipt.create).not.toHaveBeenCalled();
    expect(tx.guestGameEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { profileId: 'profile-b', guestId: 'guest-b' },
      }),
    );
    expect(tx.guestGameRuleDecision.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', eventId: 'event-1' },
      data: { profileId: 'profile-b', guestId: 'guest-b' },
    });
  });

  it('leaves an already reconciled owner unchanged even after its immutable plan exists', async () => {
    const currentEvent = {
      ...staleEvent,
      profileId: 'profile-b',
      guestId: 'guest-b',
      payload: { exactReconciliationPlan: { schemaVersion: 1 } },
    };
    const currentReceipt = { ...exactReceipt, factId: 'fact-b' };
    const { prisma, tx } = ownerReconcilePrisma([
      [currentEvent],
      [activeFact],
      [activeFact],
      [currentReceipt],
    ]);

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toEqual({ status: 'UNCHANGED' });
    expect(tx.guestGameEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameOriginReceipt.create).not.toHaveBeenCalled();
    expect(tx.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('durably quarantines an ownership transfer after any material effect', async () => {
    const { prisma, tx } = ownerReconcilePrisma([
      [staleEvent],
      [activeFact],
      [activeFact],
      [exactReceipt],
      [staleFact],
      [{ ...noEffects, rewardIntentCount: 1n }],
    ]);

    const outcome = await reconcileExactCanonicalEventOwner(prisma, input);

    expect(outcome).toEqual(
      expect.objectContaining({
        status: 'QUARANTINED',
        reasonCode: 'MATERIAL_EFFECTS_EXIST',
      }),
    );
    expect(tx.guestGameEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    const quarantineCreate = firstCallArgument(
      tx.guestGameOriginReceipt.create,
    );
    expect(quarantineCreate).toMatchObject({
      data: {
        factId: 'fact-b',
        eventId: 'event-1',
        policy: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE',
        status: 'DEAD_LETTER',
        claimedSource: 'SYSTEM_OWNER_GUARD',
      },
    });
    const quarantineAudit = firstCallArgument(tx.guestGameAuditEvent.create);
    expect(quarantineAudit).toMatchObject({
      data: {
        action: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINED',
        status: 'BLOCKED',
        reasonCode: 'MATERIAL_EFFECTS_EXIST',
      },
    });
  });

  it('treats an immutable exact plan as an ownership commitment', async () => {
    const eventWithPlan = {
      ...staleEvent,
      payload: {
        schemaVersion: 1,
        exactReconciliationPlan: { sourceFactId: 'fact-a' },
      },
    };
    const { prisma, tx } = ownerReconcilePrisma([
      [eventWithPlan],
      [activeFact],
      [activeFact],
      [exactReceipt],
      [staleFact],
      [noEffects],
    ]);

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'QUARANTINED',
        reasonCode: 'MATERIAL_EFFECTS_EXIST',
      }),
    );
    expect(tx.guestGameEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('does not duplicate the quarantine audit when its durable marker exists', async () => {
    const { prisma, tx } = ownerReconcilePrisma(
      [
        [staleEvent],
        [activeFact],
        [activeFact],
        [exactReceipt],
        [staleFact],
        [{ ...noEffects, entitlementCount: 1n }],
      ],
      {
        quarantineMarker: {
          id: 'existing-quarantine',
          factId: 'fact-b',
          eventId: 'event-1',
          policy: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE',
          status: 'DEAD_LETTER',
        },
      },
    );

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toEqual(expect.objectContaining({ status: 'QUARANTINED' }));
    expect(tx.guestGameOriginReceipt.create).not.toHaveBeenCalled();
    expect(tx.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('repairs a non-terminal quarantine marker before reporting the conflict', async () => {
    const { prisma, tx } = ownerReconcilePrisma(
      [
        [staleEvent],
        [activeFact],
        [activeFact],
        [exactReceipt],
        [staleFact],
        [{ ...noEffects, xpPostingCount: 1n }],
      ],
      {
        quarantineMarker: {
          id: 'pending-quarantine',
          factId: 'fact-a',
          eventId: 'event-1',
          policy: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE',
          status: 'FAILED',
        },
      },
    );

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'QUARANTINED',
        reasonCode: 'MATERIAL_EFFECTS_EXIST',
      }),
    );
    const quarantineUpdate = firstCallArgument(
      tx.guestGameOriginReceipt.updateMany,
    );
    expect(quarantineUpdate).toMatchObject({
      where: {
        id: 'pending-quarantine',
        status: 'FAILED',
      },
      data: {
        factId: 'fact-b',
        status: 'DEAD_LETTER',
        claimedSource: 'SYSTEM_OWNER_GUARD',
      },
    });
    expect(tx.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects ambiguous active exact ownership before changing the event', async () => {
    const competingFact = {
      ...activeFact,
      id: 'fact-competing',
      profileId: 'profile-c',
      guestId: 'guest-c',
    };
    const { prisma, tx } = ownerReconcilePrisma([
      [staleEvent],
      [activeFact],
      [activeFact, competingFact],
    ]);

    await expect(
      reconcileExactCanonicalEventOwner(prisma, input),
    ).rejects.toThrow('single active exact owner');
    expect(tx.guestGameEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameOriginReceipt.create).not.toHaveBeenCalled();
  });
});
