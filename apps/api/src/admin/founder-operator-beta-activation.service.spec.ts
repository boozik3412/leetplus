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
  TenantOnboardingStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import {
  FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT,
  FOUNDER_OPERATOR_BETA_ACTIVATION_TRANSACTION_OPTIONS,
  FounderOperatorBetaActivationService,
} from './founder-operator-beta-activation.service';
import {
  SharedTenantProvisioningService,
  type ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const STORE_ID = '33333333-3333-4333-8333-333333333333';
const LOCATOR_ID = '44444444-4444-4444-8444-444444444444';
const GO_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const ACTIVATION_ID = '77777777-7777-4777-8777-777777777777';
const ISSUE_ID = '88888888-8888-4888-8888-888888888888';
const INVITE_ID = '99999999-9999-4999-8999-999999999999';
const OUTBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RELEASE_SHA = 'c'.repeat(40);
const NOW = new Date('2026-08-17T09:00:00.000Z');
const EXPIRES_AT = '2026-08-18T09:00:00.000Z';
const TRIAL_START = Date.parse('2026-08-17T09:00:01.000Z');
const TRIAL_END = Date.parse('2026-09-16T09:00:01.000Z');
const ENCRYPTION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64url');

const actor = {
  id: ACTOR_ID,
  isPlatformAdmin: true,
} as AuthenticatedUser;

type QueryRawMock = jest.MockedFunction<
  (query: unknown) => Promise<Array<{ receipt: Record<string, unknown> }>>
>;
type TransactionMock = jest.MockedFunction<
  (
    operation: (tx: { $queryRaw: QueryRawMock }) => Promise<unknown>,
    options: unknown,
  ) => Promise<unknown>
>;

function shell(
  overrides: Partial<ShellProvisioningResult> = {},
): ShellProvisioningResult {
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
      name: 'Friendly Club Main',
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
    ...overrides,
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    shell: {
      confirmation: 'PROVISION friendly-club',
      requestId: 'provision-request-1',
      reason: 'Provision the first external friendly club',
      supportTicket: 'BETA-101',
      tenantName: 'Friendly Club',
      tenantSlug: 'friendly-club',
      cohortKey: 'friendly-club-1',
      supportOwnerUserId: ACTOR_ID,
      storeName: 'Friendly Club Main',
      storeTimeZone: 'Asia/Yekaterinburg',
      ownerEmail: 'owner@example.test',
    },
    activation: {
      confirmation: 'ACTIVATE friendly-club',
      requestId: REQUEST_ID,
      reason: 'Activate the first external friendly beta tenant',
      supportTicket: 'BETA-102',
      tenantId: TENANT_ID,
      tenantSlug: 'friendly-club',
      goId: GO_ID,
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      inviteExpiresAt: EXPIRES_AT,
      ...overrides,
    },
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operation: 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
    decision: 'ACTIVATED',
    tenantId: TENANT_ID,
    activationCommandId: ACTIVATION_ID,
    goId: GO_ID,
    releaseSha: RELEASE_SHA,
    environment: 'production',
    tenantStatus: 'ACTIVE',
    onboardingStatus: 'OWNER_INVITED',
    executionRevision: 1,
    trialStartsAtEpochMs: TRIAL_START,
    trialEndsAtEpochMs: TRIAL_END,
    inviteId: INVITE_ID,
    outboxId: OUTBOX_ID,
    outboxStatus: 'PENDING',
    createdTransactionId: '501',
    ...overrides,
  };
}

function fixture(mode = 'ACTIVE') {
  const queryRaw: QueryRawMock = jest.fn().mockResolvedValue([
    {
      receipt: receipt(),
    },
  ]);
  const transaction: TransactionMock = jest.fn((operation) =>
    operation({ $queryRaw: queryRaw }),
  );
  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;
  const provision = jest.fn().mockRejectedValue(
    new ConflictException({
      reasonCode: 'IDENTITY_CLAIM_PRECONDITION_FAILED',
    }),
  );
  const recoverProtectedActivationShell = jest.fn().mockResolvedValue(shell());
  const shellProvisioning = {
    provision,
    recoverProtectedActivationShell,
  } as unknown as SharedTenantProvisioningService;
  const values: Record<string, unknown> = {
    FOUNDER_OPERATOR_BETA_MODE: mode,
    RELEASE_SHA,
    IDENTITY_MAIL_AAD_ENVIRONMENT: 'production',
    IDENTITY_MAIL_ENCRYPTION_KEY: ENCRYPTION_KEY,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const ids = [ACTIVATION_ID, ISSUE_ID, INVITE_ID, OUTBOX_ID, MESSAGE_KEY];
  const uuidFactory = jest.fn(() => {
    const value = ids.shift();
    if (!value) throw new Error('Unexpected UUID request');
    return value;
  });
  const service = new FounderOperatorBetaActivationService(
    prisma,
    config,
    shellProvisioning,
    () => NOW,
    uuidFactory,
  );
  return {
    service,
    queryRaw,
    transaction,
    provision,
    recoverProtectedActivationShell,
  };
}

describe('FounderOperatorBetaActivationService', () => {
  it('publishes the concrete shell provisioning token for Nest injection', () => {
    const dependencyTypes = Reflect.getMetadata(
      'design:paramtypes',
      FounderOperatorBetaActivationService,
    ) as unknown[];

    expect(dependencyTypes[2]).toBe(SharedTenantProvisioningService);
  });

  it('fails closed outside ACTIVE before shell or database effects', async () => {
    const { service, provision, queryRaw } = fixture('PREPARE');
    await expect(
      service.activate(actor, TENANT_ID, command()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DISABLED' },
    });
    expect(provision).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('activates through one SERIALIZABLE RPC and returns no identity secret', async () => {
    const { service, transaction, queryRaw, recoverProtectedActivationShell } =
      fixture();
    const result = await service.activate(actor, TENANT_ID, command());
    expect(result).toEqual({
      ok: true,
      contractVersion: FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT,
      decision: 'ACTIVATED',
      replayed: false,
      shellReplayed: true,
      tenant: {
        id: TENANT_ID,
        slug: 'friendly-club',
        status: 'ACTIVE',
        onboardingStatus: 'OWNER_INVITED',
        executionRevision: 1,
        trialStartsAt: new Date(TRIAL_START).toISOString(),
        trialEndsAt: new Date(TRIAL_END).toISOString(),
      },
      ownerInvite: { id: INVITE_ID, deliveryStatus: 'PENDING' },
      authority: {
        goId: GO_ID,
        releaseSha: RELEASE_SHA,
        environment: 'production',
      },
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      FOUNDER_OPERATOR_BETA_ACTIVATION_TRANSACTION_OPTIONS,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(recoverProtectedActivationShell).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('ciphertext');
  });

  it('rejects route/body tenant substitution before shell access', async () => {
    const { service, provision, queryRaw } = fixture();
    const otherTenant = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await expect(
      service.activate(actor, otherTenant, command()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provision).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('performs one exact replay after an ambiguous database response', async () => {
    const { service, queryRaw } = fixture();
    queryRaw
      .mockRejectedValueOnce(
        Object.assign(new Error('lost response'), { code: 'P1001' }),
      )
      .mockResolvedValueOnce([
        {
          receipt: receipt({
            decision: 'REPLAYED',
            activationCommandId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          }),
        },
      ]);
    await expect(
      service.activate(actor, TENANT_ID, command()),
    ).resolves.toMatchObject({
      decision: 'REPLAYED',
      replayed: true,
      ownerInvite: { id: INVITE_ID },
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a foreign receipt binding', async () => {
    const { service, queryRaw } = fixture();
    queryRaw.mockResolvedValue([
      {
        receipt: receipt({ goId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
      },
    ]);
    await expect(
      service.activate(actor, TENANT_ID, command()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
