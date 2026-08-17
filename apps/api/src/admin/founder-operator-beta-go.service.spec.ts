import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  IdentityEmailClaimType,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import {
  FOUNDER_OPERATOR_BETA_GO_CONTRACT,
  FOUNDER_OPERATOR_BETA_STOP_CONDITIONS,
  FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
  FounderOperatorBetaGoService,
} from './founder-operator-beta-go.service';
import type {
  SharedTenantProvisioningService,
  ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const SUPPORT_OWNER_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const STORE_ID = '44444444-4444-4444-8444-444444444444';
const LOCATOR_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const GO_ID = '77777777-7777-4777-8777-777777777777';
const REVOKE_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const RELEASE_SHA = 'a'.repeat(40);
const NOW = new Date('2026-08-17T09:00:00.000Z');
const VALID_UNTIL = new Date('2026-08-17T10:00:00.000Z');

const actor = {
  id: ACTOR_ID,
  isPlatformAdmin: true,
} as AuthenticatedUser;

type PrismaMock = {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  tenant: { findUnique: jest.Mock };
  identityEmailClaim: { findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  founderOperatorBetaGo: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  platformAdminAuditEvent: { create: jest.Mock };
};

function shell(): ShellProvisioningResult {
  return {
    ok: true,
    decision: 'ALREADY_PROVISIONED',
    replayed: true,
    activationRequired: true,
    profileVersion: 'SHARED_MULTI_TENANT_BETA_SHELL_V1',
    tenant: {
      id: TENANT_ID,
      slug: 'friendly-club',
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
      profileRevision: 1,
      executionRevision: 0,
      trialStartsAt: null,
      trialEndsAt: null,
    },
    store: {
      id: STORE_ID,
      name: 'Friendly Club — Main',
      isActive: false,
      gamificationEnabled: false,
      backgroundExecutionEnabled: false,
    },
    ownerIdentity: {
      claimType: IdentityEmailClaimType.INVITE,
      reservationId: LOCATOR_ID,
      claimRevision: 1,
    },
    modules: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
      module,
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: false,
      profileRevision: 1,
    })),
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    shell: {
      ownerEmail: 'owner@example.test',
      confirmation: 'PROVISION friendly-club',
    },
    go: {
      confirmation: 'AUTHORIZE BETA friendly-club',
      requestId: REQUEST_ID,
      reason: 'Authorize the first friendly external beta tenant',
      supportTicket: 'BETA-101',
      tenantId: TENANT_ID,
      tenantSlug: 'friendly-club',
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      validUntil: VALID_UNTIL.toISOString(),
      singleFounderRiskAcceptance:
        'I ACCEPT SINGLE-FOUNDER BETA OPERATIONAL RISK',
      ...overrides,
    },
  };
}

function storedGo(overrides: Record<string, unknown> = {}) {
  return {
    id: GO_ID,
    tenantId: TENANT_ID,
    requestId: REQUEST_ID,
    requestDigest: 'b'.repeat(64),
    contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
    decision: 'GO',
    releaseSha: RELEASE_SHA,
    environment: 'production',
    workflowLocator: LOCATOR_ID,
    reservationSubjectId: LOCATOR_ID,
    expectedClaimRevision: 1,
    shellEvidenceDigest: 'c'.repeat(64),
    expectedEntitlementProfileRevision: 1,
    expectedExecutionRevision: 0,
    trialPolicyVersion: 'FOUNDER_OPERATOR_BETA_TRIAL_V1',
    trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
    approvedByUserId: ACTOR_ID,
    rollbackOwnerUserId: ACTOR_ID,
    singleFounderRiskAccepted: true,
    stopConditions: [...FOUNDER_OPERATOR_BETA_STOP_CONDITIONS],
    stopConditionsDigest: 'd'.repeat(64),
    payload: {},
    payloadDigest: 'e'.repeat(64),
    approvedAt: NOW,
    validUntil: VALID_UNTIL,
    stateRevision: 1,
    revokedAt: null,
    revocationReasonDigest: null,
    consumedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function fixture(mode = 'PREPARE') {
  const prisma: PrismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    tenant: { findUnique: jest.fn() },
    identityEmailClaim: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    founderOperatorBetaGo: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    platformAdminAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: PrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  prisma.tenant.findUnique.mockResolvedValue({
    slug: 'friendly-club',
    status: TenantLifecycleStatus.SUSPENDED,
    customerStage: TenantCustomerStage.PILOT,
    onboardingStatus: TenantOnboardingStatus.PROVISIONING,
    supportOwnerUserId: SUPPORT_OWNER_ID,
    trialStartsAt: null,
    trialEndsAt: null,
    entitlementProfileRevision: 1,
    executionRevision: 0,
    stores: [
      {
        id: STORE_ID,
        isActive: false,
        gamificationEnabled: false,
        backgroundExecutionEnabled: false,
      },
    ],
    moduleEntitlements: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
      module,
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: false,
      profileRevision: 1,
    })),
  });
  prisma.identityEmailClaim.findFirst.mockResolvedValue({
    claimType: IdentityEmailClaimType.INVITE,
    subjectId: LOCATOR_ID,
    revision: 1,
  });
  prisma.user.findUnique.mockResolvedValue({
    isActive: true,
    isPlatformAdmin: true,
  });
  prisma.founderOperatorBetaGo.findUnique.mockResolvedValue(null);
  prisma.founderOperatorBetaGo.findFirst.mockResolvedValue(null);
  prisma.founderOperatorBetaGo.create.mockImplementation(
    (input: { data: Record<string, unknown> }) =>
      Promise.resolve(
        storedGo({
          ...input.data,
          id: GO_ID,
          createdAt: NOW,
        }),
      ),
  );
  const shellProvisioning = {
    recoverProtectedActivationShell: jest.fn().mockResolvedValue(shell()),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'FOUNDER_OPERATOR_BETA_MODE') return mode;
      if (key === 'RELEASE_SHA') return RELEASE_SHA;
      if (key === 'IDENTITY_MAIL_AAD_ENVIRONMENT') return 'production';
      return undefined;
    }),
  };
  const service = new FounderOperatorBetaGoService(
    prisma as unknown as PrismaService,
    shellProvisioning as unknown as SharedTenantProvisioningService,
    config as unknown as ConfigService,
    () => NOW,
    () => GO_ID,
  );
  return { service, prisma, shellProvisioning, config };
}

describe('FounderOperatorBetaGoService', () => {
  it('fails closed while the explicit beta mode is disabled', async () => {
    const { service, prisma, shellProvisioning } = fixture('DISABLED');

    await expect(
      service.issue(actor, TENANT_ID, command()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OPERATOR_BETA_PREPARATION_DISABLED',
      },
    });
    expect(
      shellProvisioning.recoverProtectedActivationShell,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists an exact one-founder GO without a USB/offline-key dependency', async () => {
    const { service, prisma } = fixture();

    await expect(service.issue(actor, TENANT_ID, command())).resolves.toEqual({
      ok: true,
      contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      decision: 'ISSUED',
      replayed: false,
      goId: GO_ID,
      tenantId: TENANT_ID,
      tenantSlug: 'friendly-club',
      releaseSha: RELEASE_SHA,
      environment: 'production',
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      trialPolicyVersion: 'FOUNDER_OPERATOR_BETA_TRIAL_V1',
      trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
      validUntil: VALID_UNTIL.toISOString(),
      stateRevision: 1,
      stopConditions: FOUNDER_OPERATOR_BETA_STOP_CONDITIONS,
      activationRequired: true,
    });

    const createMock = prisma.founderOperatorBetaGo.create as jest.Mock<
      Promise<unknown>,
      [{ data: Record<string, unknown> }]
    >;
    const createInput = createMock.mock.calls[0]?.[0];
    if (!createInput) {
      throw new Error('Expected founder-operator GO to be persisted');
    }
    expect(createInput.data).toMatchObject({
      tenantId: TENANT_ID,
      approvedByUserId: ACTOR_ID,
      rollbackOwnerUserId: ACTOR_ID,
      releaseSha: RELEASE_SHA,
      environment: 'production',
      singleFounderRiskAccepted: true,
      trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
    });
    expect(JSON.stringify(createInput.data)).not.toContain(
      'owner@example.test',
    );
    const auditMock = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [
        {
          data: {
            metadata: Record<string, unknown>;
            reason: string | null;
          };
        },
      ]
    >;
    const auditInput = auditMock.mock.calls[0]?.[0];
    if (!auditInput) {
      throw new Error('Expected founder-operator GO audit event');
    }
    expect(auditInput.data.metadata).toMatchObject({
      authority: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      offlineKeyCeremonyRequired: false,
      activationRequired: true,
    });
  });

  it('rejects route/body tenant substitution before shell or database access', async () => {
    const { service, prisma, shellProvisioning } = fixture();
    const otherTenant = '99999999-9999-4999-8999-999999999999';

    await expect(
      service.issue(actor, otherTenant, command()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      shellProvisioning.recoverProtectedActivationShell,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects owner PII copied into persisted GO metadata', async () => {
    const { service, prisma } = fixture();

    await expect(
      service.issue(
        actor,
        TENANT_ID,
        command({ reason: 'Authorize owner@example.test for beta access' }),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OPERATOR_BETA_OWNER_IDENTITY_FORBIDDEN',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when the tenant shell changes before GO persistence', async () => {
    const { service, prisma } = fixture();
    prisma.tenant.findUnique.mockResolvedValue({
      ...(await prisma.tenant.findUnique()),
      stores: [
        {
          id: STORE_ID,
          isActive: true,
          gamificationEnabled: false,
          backgroundExecutionEnabled: false,
        },
      ],
    });

    await expect(
      service.issue(actor, TENANT_ID, command()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'FOUNDER_OPERATOR_BETA_SHELL_CHANGED' },
    });
    expect(prisma.founderOperatorBetaGo.create).not.toHaveBeenCalled();
  });

  it('rejects invalid or missing single-founder risk acceptance', async () => {
    const { service } = fixture();

    await expect(
      service.issue(
        actor,
        TENANT_ID,
        command({ singleFounderRiskAcceptance: false }),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OPERATOR_BETA_RISK_ACCEPTANCE_REQUIRED',
      },
    });
  });

  it('revokes an unconsumed GO and persists a PII-free audit event', async () => {
    const { service, prisma } = fixture();
    prisma.founderOperatorBetaGo.findUnique.mockResolvedValue(storedGo());
    prisma.founderOperatorBetaGo.update.mockResolvedValue(
      storedGo({
        stateRevision: 3,
        revokedAt: NOW,
        revocationReasonDigest: 'f'.repeat(64),
      }),
    );

    await expect(
      service.revoke(actor, TENANT_ID, {
        confirmation: `REVOKE BETA GO ${GO_ID}`,
        requestId: REVOKE_REQUEST_ID,
        goId: GO_ID,
        reason: 'Rollback owner stopped the beta launch',
      }),
    ).resolves.toMatchObject({
      decision: 'REVOKED',
      goId: GO_ID,
      tenantId: TENANT_ID,
      stateRevision: 3,
    });
    const updateMock = prisma.founderOperatorBetaGo.update as jest.Mock<
      Promise<unknown>,
      [
        {
          where: { id: string };
          data: Record<string, unknown>;
        },
      ]
    >;
    const updateInput = updateMock.mock.calls[0]?.[0];
    if (!updateInput) {
      throw new Error('Expected founder-operator GO revocation update');
    }
    expect(updateInput.where).toEqual({ id: GO_ID });
    expect(updateInput.data).toMatchObject({
      stateRevision: 3,
      revokedAt: NOW,
    });
    const auditMock = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [{ data: { reason: string | null } }]
    >;
    expect(auditMock.mock.calls[0]?.[0]?.data.reason).toBeNull();
  });

  it('never revokes a GO already consumed by activation', async () => {
    const { service, prisma } = fixture();
    prisma.founderOperatorBetaGo.findUnique.mockResolvedValue(
      storedGo({ stateRevision: 2, consumedAt: NOW }),
    );

    await expect(
      service.revoke(actor, TENANT_ID, {
        confirmation: `REVOKE BETA GO ${GO_ID}`,
        requestId: REVOKE_REQUEST_ID,
        goId: GO_ID,
        reason: 'Rollback owner stopped the beta launch',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.founderOperatorBetaGo.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid runtime mode without touching database state', async () => {
    const { service, prisma } = fixture('BYPASS');

    await expect(
      service.issue(actor, TENANT_ID, command()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the complete module profile rather than a hand-written subset', () => {
    expect(new Set(COMPLETE_TENANT_MODULE_PROFILE)).toEqual(
      new Set([
        TenantModule.GAMIFICATION,
        TenantModule.ASSORTMENT,
        TenantModule.STAFF,
        TenantModule.COMMUNICATIONS,
        TenantModule.USERS_ROLES,
        TenantModule.INTEGRATIONS,
      ]),
    );
  });
});
