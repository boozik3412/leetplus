import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  IntegrationProvider,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { buildGuestGamePhysicalSessionStartIdentity } from './guest-game-origin-key';
import { GuestGameRuleReplayService } from './guest-game-rule-replay.service';
import { PlatformGuestGameSupportRecoveryController } from './platform-guest-game-support-recovery.controller';

const tenantId = 'tenant-1';
const ticketNumber = 'LP-BUG-TEST';
const profileId = 'profile-1';
const guestId = 'guest-1';
const storeId = 'store-1';
const factId = 'fact-start-1';
const ruleId = 'loot-box-start-1';
const missionFactId = 'fact-play-time-1';
const missionRuleId = 'mission-play-time-1';
const rewardTemplateId = 'reward-template-1';
const happenedAt = new Date('2026-09-01T06:05:00.000Z');
const updatedAt = new Date('2026-09-01T07:00:00.000Z');

const platformUser: AuthenticatedUser = {
  id: 'platform-user-1',
  email: 'platform@example.invalid',
  fullName: 'Platform operator',
  role: UserRole.OWNER,
  isPlatformAdmin: true,
  platformTenantContext: true,
  tenantId,
  tenantSlug: 'tenant-one',
  tenantStatus: TenantLifecycleStatus.ACTIVE,
};

function supportFact() {
  return {
    id: factId,
    tenantId,
    profileId,
    guestId,
    storeId,
    factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
    lifecycleStatus: 'ACTIVE',
    supersededAt: null,
    confidence: 'EXACT',
    happenedAt,
    sourceLocalDate: '2026-09-01',
    durationMinutes: null,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalGuestId: 'external-guest-1',
    sourceKind: 'GUEST_SESSION',
    sourceHash: 'source-hash-1',
    sourceExternalId: 'session-1',
    sessionExternalId: 'session-1',
    updatedAt,
  };
}

function supportRule() {
  return {
    id: ruleId,
    kind: 'LOOT_BOX',
    name: 'Morning case',
    status: 'ACTIVE',
    triggerKind: 'SESSION_START',
    evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
    manualApprovalRequired: false,
    rewardMaterializationSuppressed: true,
    eligible: true,
    rewardType: 'BONUS_BALANCE',
    rewardAmount: 300,
    rewardLabel: '300 bonus points',
    selectedRewardLabel: '300 bonus points',
    selectedReward: {
      rewardType: 'BONUS_BALANCE',
      rewardAmount: 300,
      rewardLabel: '300 bonus points',
      weight: 15,
      chancePercent: 15,
      rewardRarity: 'rare',
      rewardRarityLabel: 'Rare',
      noBonus: false,
      visualMode: 'AUTO',
      iconKey: 'coins',
      imageUrl: null,
      borderColor: null,
      textColor: null,
      backgroundColor: null,
    },
    xpDelta: 0,
    budgetAmount: null,
    battlePassLevel: null,
    battlePassStep: null,
    battlePassStepId: null,
    battlePassStepTitle: null,
    battlePassRewardTrack: null,
    rewardLootBoxId: null,
    periodicLimitPeriod: 'DAILY',
    missionDenySameDayRepeat: false,
    missionPerGuestLimit: null,
    missionTotalRewardLimit: null,
    progress: null,
    reasons: ['Package session started during the configured period.'],
    blockers: [],
    ruleUpdatedAt: updatedAt.toISOString(),
  };
}

function supportMissionFact() {
  return {
    ...supportFact(),
    id: missionFactId,
    factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    durationMinutes: 173,
  };
}

function supportMissionRule() {
  return {
    ...supportRule(),
    id: missionRuleId,
    kind: 'MISSION',
    name: 'Play 100 minutes',
    rewardType: 'LOOT_BOX_ENTITLEMENT',
    rewardAmount: 0,
    rewardLabel: 'Comeback case',
    selectedRewardLabel: 'Comeback case',
    selectedReward: null,
    rewardLootBoxId: rewardTemplateId,
    xpDelta: 50,
  };
}

function supportDryRun(
  rules: Array<Record<string, unknown>> = [supportRule()],
) {
  return {
    dryRun: true,
    eventType: 'SESSION_START',
    occurredAt: happenedAt.toISOString(),
    profile: { id: profileId },
    guest: { id: guestId },
    store: {
      id: storeId,
      name: 'Club',
      timeZone: 'Europe/Samara',
    },
    input: {
      sessionType: 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket: true,
      sessionMinutes: 0,
    },
    summary: {
      checkedRules: rules.length,
      eligibleRules: rules.filter((rule) => rule.eligible).length,
      blockedRules: 0,
      estimatedRewardAmount: 0,
      projectedXpDelta: 0,
    },
    rules,
    note: '',
  };
}

function createSupportRecoveryFixture(
  rules: Array<Record<string, unknown>> = [supportRule()],
) {
  const fact = supportFact();
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    guestSupportTicket: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        ticketNumber,
        tenantId,
        profileId,
        guestId,
        storeId,
        status: 'IN_PROGRESS',
        profile: {
          id: profileId,
          status: 'ACTIVE',
          gameActivatedAt: new Date('2026-08-25T11:51:13.727Z'),
          guestId,
          guest: {
            id: guestId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: '46.langamepro.ru',
            externalGuestId: 'external-guest-1',
            isDisabled: false,
          },
        },
        store: {
          id: storeId,
          isActive: true,
          externalDomain: '46.langamepro.ru',
          timeZone: 'Europe/Samara',
        },
      }),
    },
    guestActivityFact: {
      findMany: jest.fn().mockResolvedValue([fact]),
    },
    guestGameLootBox: {
      findFirst: jest.fn().mockResolvedValue({
        id: ruleId,
        status: 'ACTIVE',
        usageKind: 'STANDALONE',
        limits: { maxPendingRewards: 1 },
        manualApprovalRequired: false,
        updatedAt,
      }),
    },
    guestGameMission: { findFirst: jest.fn() },
    guestGameEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    guestGameOriginReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
    guestGameAuditEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const gamification = {
    dryRun: jest.fn().mockResolvedValue(supportDryRun(rules)),
    processEvent: jest.fn(),
  };
  return {
    service: new GuestGameRuleReplayService(
      prisma as never,
      gamification as never,
    ),
    prisma,
    gamification,
  };
}

function supportRecoveryAction(
  rule: ReturnType<typeof supportRule> = supportRule(),
) {
  return {
    fact: supportFact(),
    rule,
    processDto: {},
    originKey: 'support-origin-1',
    physicalSessionKey: 'support-physical-1',
    expectedXpDelta: rule.xpDelta,
    dependency:
      rule.kind === 'MISSION'
        ? {
            kind: 'LOOT_BOX',
            id: rewardTemplateId,
            updatedAt,
          }
        : null,
    existingEffect: null,
  };
}

function supportRecoverySnapshot(
  rule: ReturnType<typeof supportRule> = supportRule(),
) {
  const mission = rule.kind === 'MISSION';
  const qualifiedAt = happenedAt.toISOString();
  const entitlementId = 'entitlement-1';
  const eventId = 'event-1';
  return {
    event: { id: eventId, xpDelta: rule.xpDelta },
    profile: { xp: 150 },
    intents: mission
      ? [
          {
            id: 'intent-reward-1',
            ruleType: 'MISSION',
            ruleId: rule.id,
            effectKind: 'REWARD',
            status: 'APPLIED',
            rewardId: 'reward-1',
          },
          {
            id: 'intent-xp-1',
            ruleType: 'MISSION',
            ruleId: rule.id,
            effectKind: 'XP_POSTING',
            status: 'APPLIED',
            rewardId: null,
          },
        ]
      : [],
    entitlements: [
      {
        id: entitlementId,
        ruleType: 'LOOT_BOX',
        ruleId: mission ? rewardTemplateId : rule.id,
        status: 'AVAILABLE',
        sourceFactId: mission ? null : factId,
        sourceRewardId: mission ? 'reward-1' : null,
        rewardId: null,
        consumedAt: null,
        canceledAt: null,
        qualifiedAt,
        sourceMissionId: mission ? rule.id : null,
      },
    ],
    rewards: mission
      ? [
          {
            id: 'reward-1',
            missionId: rule.id,
            seasonId: null,
            lootBoxId: null,
            rewardType: 'LOOT_BOX_ENTITLEMENT',
            rewardAmount: 0,
            status: 'APPROVED',
          },
        ]
      : [],
    rewardEffects: mission
      ? [
          {
            id: 'effect-1',
            effectKind: 'LOOT_BOX_ENTITLEMENT',
            status: 'APPLIED',
            rewardId: 'reward-1',
          },
        ]
      : [],
    bonusLedgerEntries: [],
    walletItems: [
      {
        id: 'wallet-1',
        profileId,
        storeId,
        kind: 'LOOT_BOX_ENTITLEMENT',
        sourceKind: mission ? 'MISSION' : 'LOOT_BOX',
        sourceId: rule.id,
        title: rule.name,
        rewardLabel: '1 попытка открытия',
        status: 'PENDING',
        claimXpDelta: 0,
        rewardId: null,
        entitlementId,
        eventId: null,
        availableAt: qualifiedAt,
        expiresAt: new Date(
          happenedAt.getTime() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        claimedAt: null,
      },
    ],
    xpPosting: mission
      ? {
          requestedDelta: rule.xpDelta,
          appliedDelta: rule.xpDelta,
          balanceBefore: 100,
          balanceAfter: 100 + rule.xpDelta,
        }
      : null,
  };
}

function existingSupportRecoveryEvidence() {
  const fact = supportFact();
  const rule = supportRule();
  const physicalIdentity = buildGuestGamePhysicalSessionStartIdentity({
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    sourceKind: fact.sourceKind,
    sessionExternalId: fact.sessionExternalId,
    eventType: fact.factType,
  });
  if (!physicalIdentity) throw new Error('Expected a physical identity.');
  const eventId = 'event-1';
  return {
    event: {
      id: eventId,
      profileId,
      guestId,
      eventType: 'SESSION_START',
      source: 'API_IMPORT',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: fact.externalDomain,
      externalId: `guest-game:GUEST_SESSION:SESSION_START:${fact.sessionExternalId}`,
      originKey: physicalIdentity.key,
      xpDelta: 0,
      occurredAt: happenedAt,
      payload: {
        processSchemaVersion: 2,
        source: 'guest_gamification_process_event',
        sourceFactId: fact.id,
        sourceFactKind: 'GUEST_SESSION',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: fact.externalDomain,
        externalId: fact.sessionExternalId,
        sourceKind: fact.sourceKind,
        sessionExternalId: fact.sessionExternalId,
        extra: {
          supportRewardRecovery: true,
          ticketNumber,
          factType: fact.factType,
          confidence: 'EXACT',
          sourceKind: fact.sourceKind,
          sessionExternalId: fact.sessionExternalId,
        },
        store: {
          id: storeId,
          name: 'Club',
          timeZone: 'Europe/Samara',
        },
        exactReconciliationPlan: {
          schemaVersion: 1,
          reconciliationKind: 'EXACT_SESSION_START',
          eventId,
          originKey: physicalIdentity.key,
          profileId,
          physicalSessionKey: physicalIdentity.key,
          sourceFactId: fact.id,
          sourceFactUpdatedAt: updatedAt.toISOString(),
          createdAt: new Date('2026-09-01T07:01:00.000Z').toISOString(),
          occurredAt: happenedAt.toISOString(),
          eventType: 'SESSION_START',
          ruleVersions: [
            {
              ruleKind: 'LOOT_BOX',
              ruleId,
              battlePassStep: null,
              battlePassStepId: null,
              ruleUpdatedAt: updatedAt.toISOString(),
            },
          ],
          rules: [rule],
          rewardIntents: [],
          expectedXpDelta: 0,
        },
      },
    },
    receipt: {
      factId: fact.id,
      eventId,
      eventType: 'SESSION_START',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: fact.externalDomain,
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_OPERATOR_CANONICALIZATION',
    },
  };
}

async function assertSupportRecoveryPostcondition(
  service: GuestGameRuleReplayService,
  rule: ReturnType<typeof supportRule>,
  snapshot: ReturnType<typeof supportRecoverySnapshot>,
) {
  jest
    .spyOn(service as never, 'supportRecoveryEffectSnapshot' as never)
    .mockResolvedValue(snapshot as never);
  return (
    service as unknown as {
      assertSupportRecoveryPostcondition: (
        user: AuthenticatedUser,
        action: ReturnType<typeof supportRecoveryAction>,
        eventId: string,
      ) => Promise<{ entitlementId: string }>;
    }
  ).assertSupportRecoveryPostcondition(
    platformUser,
    supportRecoveryAction(rule),
    'event-1',
  );
}

const request = {
  ticketNumber,
  actions: [{ factId, ruleKind: 'LOOT_BOX' as const, ruleId }],
};

describe('platform support reward recovery boundary', () => {
  it('registers both authentication and platform-admin guards', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PlatformGuestGameSupportRecoveryController,
      ),
    ).toEqual(expect.arrayContaining([JwtAuthGuard, PlatformAdminGuard]));
  });

  it('accepts exactly one pending case inventory item and no other wallet effect', async () => {
    const { service } = createSupportRecoveryFixture();
    const rule = supportRule();

    await expect(
      assertSupportRecoveryPostcondition(
        service,
        rule,
        supportRecoverySnapshot(rule),
      ),
    ).resolves.toEqual({ entitlementId: 'entitlement-1' });
  });

  it('accepts a mission case inventory item only with its exact configured XP', async () => {
    const { service } = createSupportRecoveryFixture();
    const rule = supportMissionRule();

    await expect(
      assertSupportRecoveryPostcondition(
        service,
        rule,
        supportRecoverySnapshot(rule),
      ),
    ).resolves.toEqual({ entitlementId: 'entitlement-1' });
  });

  it.each([
    ['a missing case inventory item', () => []],
    [
      'an extra wallet item',
      (valid: ReturnType<typeof supportRecoverySnapshot>['walletItems']) => [
        ...valid,
        { ...valid[0], id: 'wallet-extra', kind: 'REWARD' },
      ],
    ],
    [
      'a wallet XP amount',
      (valid: ReturnType<typeof supportRecoverySnapshot>['walletItems']) => [
        { ...valid[0], claimXpDelta: 50 },
      ],
    ],
    [
      'a wallet item not linked to the exact entitlement',
      (valid: ReturnType<typeof supportRecoverySnapshot>['walletItems']) => [
        { ...valid[0], entitlementId: 'another-entitlement' },
      ],
    ],
  ])('rejects %s', async (_label, mutateWalletItems) => {
    const { service } = createSupportRecoveryFixture();
    const rule = supportRule();
    const snapshot = supportRecoverySnapshot(rule);
    snapshot.walletItems = mutateWalletItems(snapshot.walletItems);

    await expect(
      assertSupportRecoveryPostcondition(service, rule, snapshot),
    ).rejects.toThrow('exactly one AVAILABLE case');
  });

  it('does not read ticket data without explicit platform tenant context', async () => {
    const { service, prisma } = createSupportRecoveryFixture();

    await expect(
      service.previewSupportRewardRecovery(
        { ...platformUser, platformTenantContext: false },
        request,
      ),
    ).rejects.toThrow('explicitly selected tenant context');
    expect(prisma.guestSupportTicket.findUnique).not.toHaveBeenCalled();
  });

  it.each(['RESOLVED', 'CLOSED'] as const)(
    'does not recover rewards for a %s ticket',
    async (status) => {
      const { service, prisma } = createSupportRecoveryFixture();
      prisma.guestSupportTicket.findUnique.mockResolvedValue({
        ...(await prisma.guestSupportTicket.findUnique()),
        status,
      });

      await expect(
        service.previewSupportRewardRecovery(platformUser, request),
      ).rejects.toThrow('active guest, game profile, store and activation');
    },
  );

  it('previews exactly one case with no direct bonus or Battle Pass reward', async () => {
    const { service, gamification, prisma } = createSupportRecoveryFixture();

    const result = await service.previewSupportRewardRecovery(
      platformUser,
      request,
    );

    expect(result).toMatchObject({
      mode: 'PREVIEW',
      outcome: 'READY',
      actionCount: 1,
      allowedRuleIds: [ruleId],
      expectedEffects: {
        availableLootBoxEntitlements: 1,
        directBonusAmount: 0,
        battlePassRewards: 0,
        xpDelta: 0,
      },
      actions: [
        expect.objectContaining({
          factId,
          ruleKind: 'LOOT_BOX',
          ruleId,
          expectedEntitlementCount: 1,
          directBonusAmount: 0,
          eventId: null,
          entitlementId: null,
        }),
      ],
    });
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('previews a mission as one case plus only its configured XP', async () => {
    const missionFact = supportMissionFact();
    const missionRule = supportMissionRule();
    const { service, gamification, prisma } = createSupportRecoveryFixture([
      missionRule,
    ]);
    prisma.guestActivityFact.findMany.mockResolvedValue([missionFact]);
    prisma.guestGameMission.findFirst.mockResolvedValue({
      id: missionRuleId,
      status: 'ACTIVE',
      rewardType: 'LOOT_BOX_ENTITLEMENT',
      rewardAmount: 0,
      xpReward: 50,
      maxPendingRewards: 1,
      manualApprovalRequired: false,
      conditions: { reward: { lootBoxId: rewardTemplateId } },
      updatedAt,
    });
    prisma.guestGameLootBox.findFirst.mockResolvedValue({
      id: rewardTemplateId,
      status: 'ACTIVE',
      usageKind: 'REWARD_TEMPLATE',
      updatedAt,
    });
    gamification.dryRun.mockResolvedValue({
      ...supportDryRun([missionRule]),
      eventType: 'PLAY_HOUR',
      input: {
        sessionType: 'PACKAGE_OR_SUBSCRIPTION',
        sessionPacket: true,
        sessionMinutes: 173,
      },
      summary: {
        checkedRules: 1,
        eligibleRules: 1,
        blockedRules: 0,
        estimatedRewardAmount: 0,
        projectedXpDelta: 50,
      },
    });

    const result = await service.previewSupportRewardRecovery(platformUser, {
      ticketNumber,
      actions: [
        {
          factId: missionFactId,
          ruleKind: 'MISSION',
          ruleId: missionRuleId,
        },
      ],
    });

    expect(result).toMatchObject({
      outcome: 'READY',
      expectedEffects: {
        availableLootBoxEntitlements: 1,
        directBonusAmount: 0,
        battlePassRewards: 0,
        xpDelta: 50,
      },
      actions: [
        expect.objectContaining({
          factId: missionFactId,
          ruleKind: 'MISSION',
          ruleId: missionRuleId,
          expectedXpDelta: 50,
          expectedEntitlementCount: 1,
          directBonusAmount: 0,
        }),
      ],
    });
  });

  it.each([
    ['loot-box', 'LOOT_BOX'],
    ['mission', 'MISSION'],
    ['Battle Pass', 'SEASON'],
  ] as const)(
    'rejects the plan when an additional eligible %s rule appears',
    async (_label, kind) => {
      const additionalRule = {
        ...supportRule(),
        id: `additional-${kind.toLowerCase()}`,
        kind,
      };
      const { service, gamification } = createSupportRecoveryFixture([
        supportRule(),
        additionalRule,
      ]);

      await expect(
        service.previewSupportRewardRecovery(platformUser, request),
      ).rejects.toThrow('single confirmed active rule');
      expect(gamification.processEvent).not.toHaveBeenCalled();
    },
  );

  it('requires the exact preview digest, action count and rule allowlist before apply', async () => {
    const { service, gamification, prisma } = createSupportRecoveryFixture();

    await expect(
      service.applySupportRewardRecovery(platformUser, {
        ...request,
        expectedActionCount: 1,
        expectedDigest: '0'.repeat(64),
        allowedRuleIds: [ruleId],
        confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
      }),
    ).rejects.toThrow('plan changed after preview');
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('finalizes audit for an exact previously materialized case without running its rule again', async () => {
    const blockedRule = {
      ...supportRule(),
      eligible: false,
      reasons: [],
      blockers: ['The one-pending case limit is already occupied.'],
    };
    const { service, gamification, prisma } = createSupportRecoveryFixture([
      blockedRule,
    ]);
    gamification.dryRun.mockResolvedValue({
      ...supportDryRun([blockedRule]),
      summary: {
        checkedRules: 1,
        eligibleRules: 0,
        blockedRules: 1,
        estimatedRewardAmount: 0,
        projectedXpDelta: 0,
      },
    });
    const evidence = existingSupportRecoveryEvidence();
    prisma.guestGameEvent.findFirst.mockResolvedValue(evidence.event);
    prisma.guestGameOriginReceipt.findUnique.mockResolvedValue(
      evidence.receipt,
    );
    prisma.guestGameAuditEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'audit-1' });
    jest
      .spyOn(service as never, 'assertSupportRecoveryPostcondition' as never)
      .mockResolvedValue({ entitlementId: 'entitlement-1' } as never);
    const ensureCanonical = jest.spyOn(
      service as never,
      'ensureSupportRecoveryCanonicalEvent' as never,
    );

    const preview = await service.previewSupportRewardRecovery(
      platformUser,
      request,
    );
    expect(preview).toMatchObject({
      outcome: 'READY',
      actions: [
        expect.objectContaining({
          eventId: 'event-1',
          entitlementId: 'entitlement-1',
        }),
      ],
    });

    await expect(
      service.applySupportRewardRecovery(platformUser, {
        ...request,
        expectedActionCount: preview.actionCount,
        expectedDigest: preview.digest,
        allowedRuleIds: preview.allowedRuleIds,
        confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
      }),
    ).resolves.toMatchObject({
      outcome: 'APPLIED',
      actions: [
        expect.objectContaining({
          eventId: 'event-1',
          entitlementId: 'entitlement-1',
        }),
      ],
    });
    expect(ensureCanonical).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);

    await service.applySupportRewardRecovery(platformUser, {
      ...request,
      expectedActionCount: preview.actionCount,
      expectedDigest: preview.digest,
      allowedRuleIds: preview.allowedRuleIds,
      confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not treat an ordinary existing event as a resumable support effect', async () => {
    const blockedRule = {
      ...supportRule(),
      eligible: false,
      reasons: [],
      blockers: ['The one-pending case limit is already occupied.'],
    };
    const { service, gamification, prisma } = createSupportRecoveryFixture([
      blockedRule,
    ]);
    prisma.guestGameEvent.findFirst.mockResolvedValue({
      ...existingSupportRecoveryEvidence().event,
      payload: {
        processSchemaVersion: 2,
        source: 'guest_gamification_process_event',
      },
    });

    await expect(
      service.previewSupportRewardRecovery(platformUser, request),
    ).rejects.toThrow('single confirmed active rule');
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('accepts a confirmed exact case-only plan only after a zero-diff replay', async () => {
    const { service, gamification, prisma } = createSupportRecoveryFixture();
    const preview = await service.previewSupportRewardRecovery(
      platformUser,
      request,
    );
    jest
      .spyOn(service as never, 'ensureSupportRecoveryCanonicalEvent' as never)
      .mockResolvedValue('event-1' as never);
    jest
      .spyOn(service as never, 'assertSupportRecoveryPostcondition' as never)
      .mockResolvedValue({ entitlementId: 'entitlement-1' } as never);
    jest
      .spyOn(service as never, 'supportRecoveryEffectSnapshot' as never)
      .mockResolvedValue({ exact: 'same-state' } as never);
    gamification.processEvent
      .mockResolvedValueOnce({
        event: { id: 'event-1' },
        rewards: [],
        summary: {
          idempotent: true,
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
      })
      .mockResolvedValueOnce({
        event: { id: 'event-1' },
        rewards: [],
        summary: {
          idempotent: true,
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
      });

    const result = await service.applySupportRewardRecovery(platformUser, {
      ...request,
      expectedActionCount: preview.actionCount,
      expectedDigest: preview.digest,
      allowedRuleIds: preview.allowedRuleIds,
      confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
    });

    expect(result).toMatchObject({
      mode: 'APPLY',
      outcome: 'APPLIED',
      expectedEffects: {
        availableLootBoxEntitlements: 1,
        directBonusAmount: 0,
        battlePassRewards: 0,
        xpDelta: 0,
      },
      actions: [
        expect.objectContaining({
          eventId: 'event-1',
          entitlementId: 'entitlement-1',
        }),
      ],
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(2);
    const processCalls = JSON.stringify(gamification.processEvent.mock.calls);
    expect(processCalls).toContain(`"allowedRuleIds":["${ruleId}"]`);
    expect(processCalls).toContain(
      '"supportRecoveryAuthority":{"ticketId":"ticket-1","ticketNumber":"LP-BUG-TEST","ticketStatus":"IN_PROGRESS","gameActivatedAt":"2026-08-25T11:51:13.727Z","storeTimeZone":"Europe/Samara"}',
    );
    const auditCalls = JSON.stringify(
      prisma.guestGameAuditEvent.create.mock.calls,
    );
    expect(auditCalls).toContain('SUPPORT_REWARD_RECOVERY_APPLIED');
    expect(auditCalls).toContain('"actionCount":1');
    expect(auditCalls).toContain('"directBonusAmount":0');
    expect(auditCalls).toContain('"battlePassRewards":0');
  });
});
