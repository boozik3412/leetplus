import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  IdentityEmailClaimType,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SHARED_BETA_INITIAL_OWNER_CAPABILITIES } from '../auth/capabilities';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
} from '../auth/identity-email-claim.service';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

const PLATFORM_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SUPPORT_OWNER_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const STORE_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_EMAIL = 'owner@example.test';
const FINGERPRINT_KEY = 'shared-shell-fingerprint-unit-key-aaaaaaaaaaaaaaaa';

type SharedProvisioningPrismaMock = {
  tenant: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  store: {
    create: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
  };
  userRoleOverride: {
    create: jest.Mock;
  };
  tenantModuleEntitlement: {
    createMany: jest.Mock;
  };
  platformAdminAuditEvent: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

function createPrismaMock(): SharedProvisioningPrismaMock {
  const prisma: SharedProvisioningPrismaMock = {
    tenant: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    store: {
      create: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    userRoleOverride: {
      create: jest.fn(),
    },
    tenantModuleEntitlement: {
      createMany: jest.fn(),
    },
    platformAdminAuditEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: SharedProvisioningPrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstCallData(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown[][];
  const argument = calls[0]?.[0];
  if (!record(argument) || !record(argument.data)) {
    throw new Error('Expected the first mock call to contain a data object');
  }
  return argument.data;
}

const platformAdmin = {
  id: PLATFORM_ADMIN_ID,
  isPlatformAdmin: true,
} as AuthenticatedUser;

function provisioningDto(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: 'PROVISION friendly-club',
    requestId: 'provision-request-1',
    reason: 'Provision the first friendly external club',
    supportTicket: 'BETA-101',
    tenantName: 'Friendly Club',
    tenantSlug: 'friendly-club',
    cohortKey: 'friendly-club-1',
    supportOwnerUserId: SUPPORT_OWNER_ID,
    storeName: 'Friendly Club — Main',
    storeTimeZone: 'Asia/Yekaterinburg',
    ownerEmail: OWNER_EMAIL,
    ...overrides,
  };
}

describe('SharedTenantProvisioningService shell boundary', () => {
  let prisma: SharedProvisioningPrismaMock;
  let identity: IdentityEmailClaimService;
  let lockTenantTransaction: jest.SpiedFunction<
    IdentityEmailClaimService['lockTenantTransaction']
  >;
  let reserveInvite: jest.SpiedFunction<
    IdentityEmailClaimService['reserveInvite']
  >;
  let assertInviteLocator: jest.SpiedFunction<
    IdentityEmailClaimService['assertInviteLocator']
  >;
  let service: SharedTenantProvisioningService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    identity = new IdentityEmailClaimService({
      get: jest.fn((key: string) => {
        if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY') {
          return FINGERPRINT_KEY;
        }
        if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION') {
          return 'v1';
        }
        return undefined;
      }),
    } as unknown as ConfigService);
    lockTenantTransaction = jest.spyOn(identity, 'lockTenantTransaction');
    lockTenantTransaction.mockImplementation((tx) =>
      Promise.resolve(tx as never),
    );
    reserveInvite = jest.spyOn(identity, 'reserveInvite');
    reserveInvite.mockImplementation((_tx, input) =>
      Promise.resolve({
        schemaVersion: 2,
        operation: 'RESERVE_INVITE',
        decision: 'CREATED',
        claimType: IdentityEmailClaimType.INVITE,
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        revision: 1,
        ...identity.fingerprint(input.email),
      }),
    );
    assertInviteLocator = jest.spyOn(identity, 'assertInviteLocator');
    assertInviteLocator.mockImplementation((_tx, input) =>
      Promise.resolve({
        schemaVersion: 1,
        operation: 'ASSERT_INVITE_LOCATOR',
        decision: 'MATCHED',
        claimType: IdentityEmailClaimType.INVITE,
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        workflowLocator: input.workflowLocator,
        revision: input.expectedRevision,
      }),
    );
    service = new SharedTenantProvisioningService(
      prisma as unknown as PrismaService,
      identity,
    );

    prisma.tenant.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      {
        id: PLATFORM_ADMIN_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
      {
        id: SUPPORT_OWNER_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
    ]);
    prisma.tenant.create.mockResolvedValue({
      id: TENANT_ID,
      slug: 'friendly-club',
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
      entitlementProfileRevision: 1,
      executionRevision: 0,
      trialStartsAt: null,
      trialEndsAt: null,
    });
    prisma.store.create.mockResolvedValue({
      id: STORE_ID,
      name: 'Friendly Club — Main',
      isActive: false,
      gamificationEnabled: false,
      backgroundExecutionEnabled: false,
    });
  });

  it('creates only a suspended shell, exact module profile and identity reservation', async () => {
    const result = await service.provision(platformAdmin, provisioningDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'SHELL_PROVISIONED',
      replayed: false,
      activationRequired: true,
      tenant: {
        id: TENANT_ID,
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
        isActive: false,
        gamificationEnabled: false,
        backgroundExecutionEnabled: false,
      },
      ownerIdentity: {
        claimType: IdentityEmailClaimType.INVITE,
        claimRevision: 1,
      },
    });
    expect(result.ownerIdentity.reservationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(result.modules).toHaveLength(6);
    expect(result.modules.map((entry) => entry.module)).toEqual(
      COMPLETE_TENANT_MODULE_PROFILE,
    );

    expect(firstCallData(prisma.tenant.create)).toMatchObject({
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 1,
    });
    expect(firstCallData(prisma.store.create)).toMatchObject({
      isActive: false,
      gamificationEnabled: false,
      backgroundExecutionEnabled: false,
    });
    expect(prisma.userRoleOverride.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        role: UserRole.OWNER,
        permissions: [...SHARED_BETA_INITIAL_OWNER_CAPABILITIES],
      },
    });

    const entitlementCall = (
      prisma.tenantModuleEntitlement.createMany.mock.calls as unknown[][]
    )[0]?.[0];
    if (!record(entitlementCall) || !Array.isArray(entitlementCall.data)) {
      throw new Error('Expected entitlement createMany payload');
    }
    expect(entitlementCall.data).toHaveLength(6);
    for (const entry of entitlementCall.data) {
      expect(entry).toMatchObject({
        tenantId: TENANT_ID,
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
        validFrom: null,
        validUntil: null,
        profileRevision: 1,
      });
    }

    expect(reserveInvite).toHaveBeenCalledTimes(1);
    expect(lockTenantTransaction).toHaveBeenCalledWith(
      prisma,
      firstCallData(prisma.tenant.create).id,
    );
    expect(reserveInvite).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        email: OWNER_EMAIL,
        tenantId: TENANT_ID,
        subjectId: result.ownerIdentity.reservationId,
      }),
    );
    expect(reserveInvite.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.platformAdminAuditEvent.create.mock.invocationCallOrder[0],
    );
    expect(lockTenantTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.tenant.create.mock.invocationCallOrder[0],
    );
    expect(prisma.tenant.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      lockTenantTransaction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(lockTenantTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.findMany.mock.invocationCallOrder[0],
    );

    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    expect(audit).toMatchObject({
      tenantId: TENANT_ID,
      actorUserId: PLATFORM_ADMIN_ID,
      requestId: 'provision-request-1',
      action: 'SHARED_BETA_TENANT_SHELL_PROVISIONED',
      metadata: {
        ownerEmailFingerprintKeyVersion: 'v1',
        inviteCreated: false,
        trialStarted: false,
        outboundDefault: 'OFF',
      },
    });
    if (!record(audit.metadata)) {
      throw new Error('Expected privacy-safe provisioning audit metadata');
    }
    expect(String(audit.metadata.ownerEmailFingerprint)).toMatch(
      /^[0-9a-f]{64}$/,
    );
    const serialized = JSON.stringify({ result, audit });
    expect(serialized).not.toContain(OWNER_EMAIL);
    expect(serialized).not.toMatch(/registrationUrl|tokenHash|ciphertext/u);
  });

  it('replays the exact HMAC-bound shell without a second reservation', async () => {
    const created = await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);

    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: audit.after,
      metadata: audit.metadata,
    });
    prisma.tenant.findFirst.mockClear();
    prisma.user.findMany.mockClear();
    prisma.platformAdminAuditEvent.findUnique.mockClear();
    lockTenantTransaction.mockClear();
    reserveInvite.mockClear();

    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({ ownerEmail: ' OWNER@EXAMPLE.TEST ' }),
      ),
    ).resolves.toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      ownerIdentity: {
        claimType: IdentityEmailClaimType.INVITE,
      },
    });
    expect(reserveInvite).not.toHaveBeenCalled();
    expect(lockTenantTransaction).toHaveBeenCalledWith(prisma, TENANT_ID);
    expect(assertInviteLocator).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        tenantId: TENANT_ID,
        workflowLocator: created.ownerIdentity.reservationId,
      }),
    );
    expect(lockTenantTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      assertInviteLocator.mock.invocationCallOrder[0],
    );
    expect(prisma.tenant.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      lockTenantTransaction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(lockTenantTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.findMany.mock.invocationCallOrder[0],
    );
    expect(prisma.user.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.platformAdminAuditEvent.findUnique.mock.invocationCallOrder[0],
    );

    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          ownerEmail: ' OWNER@EXAMPLE.TEST ',
          reason: 'A materially different provisioning reason',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recovers only the exact PII-free shell receipt for progressed activation replay', async () => {
    const created = await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: audit.after,
      metadata: audit.metadata,
    });
    assertInviteLocator.mockRejectedValue(
      new ConflictException({
        message: 'Identity claim state changed',
        reasonCode: 'IDENTITY_CLAIM_STATE_MISMATCH',
      }),
    );
    lockTenantTransaction.mockClear();
    assertInviteLocator.mockClear();

    await expect(
      service.recoverProtectedActivationShell(platformAdmin, provisioningDto()),
    ).resolves.toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      activationRequired: true,
      tenant: { id: TENANT_ID },
      ownerIdentity: {
        reservationId: created.ownerIdentity.reservationId,
        claimRevision: 1,
      },
    });
    expect(lockTenantTransaction).toHaveBeenCalledWith(prisma, TENANT_ID);
    expect(assertInviteLocator).not.toHaveBeenCalled();
    expect(reserveInvite).toHaveBeenCalledTimes(1);

    await expect(
      service.recoverProtectedActivationShell(
        platformAdmin,
        provisioningDto({ reason: 'A different activation shell reason' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks the tenant before identity assertion in concurrent replay recovery', async () => {
    const created = await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: audit.after,
      metadata: audit.metadata,
    });
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    lockTenantTransaction.mockClear();
    assertInviteLocator.mockClear();

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).resolves.toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      ownerIdentity: {
        reservationId: created.ownerIdentity.reservationId,
      },
    });

    expect(lockTenantTransaction).toHaveBeenCalledWith(prisma, TENANT_ID);
    expect(assertInviteLocator).toHaveBeenCalledTimes(1);
    expect(lockTenantTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      assertInviteLocator.mock.invocationCallOrder[0],
    );
    const transactionCalls = prisma.$transaction.mock.calls as unknown[][];
    expect(transactionCalls.at(-1)?.[1]).toEqual(
      IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    );
  });

  it('rechecks actor and support-owner authority before an existing replay', async () => {
    await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: audit.after,
      metadata: audit.metadata,
    });
    reserveInvite.mockClear();

    prisma.user.findMany.mockResolvedValue([
      {
        id: SUPPORT_OWNER_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
    ]);
    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findMany.mockResolvedValue([
      {
        id: PLATFORM_ADMIN_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
      {
        id: SUPPORT_OWNER_ID,
        isActive: false,
        isPlatformAdmin: true,
      },
    ]);
    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reserveInvite).not.toHaveBeenCalled();
  });

  it('rechecks authority in the concurrent replay recovery transaction', async () => {
    await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: audit.after,
      metadata: audit.metadata,
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: SUPPORT_OWNER_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
    ]);
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const calls = prisma.$transaction.mock.calls as unknown[][];
    expect(calls.at(-1)?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  });

  it('retries the complete serializable shell once after P2034 without a replay', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    reserveInvite.mockRejectedValueOnce(
      new ConflictException({
        message: 'Identity email is unavailable',
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      }),
    );

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      },
    });

    const calls = prisma.$transaction.mock.calls as unknown[][];
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[1]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[2]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(reserveInvite).toHaveBeenCalledTimes(1);
  });

  it('retries once when the sealed RPC maps SQLSTATE 40001 to a retry decision', async () => {
    reserveInvite
      .mockRejectedValueOnce(
        new ConflictException({
          message: 'Identity claim command must be retried',
          reasonCode: 'IDENTITY_CLAIM_RETRY_REQUIRED',
        }),
      )
      .mockRejectedValueOnce(
        new ConflictException({
          message: 'Identity email is unavailable',
          reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
        }),
      );

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      },
    });

    const calls = prisma.$transaction.mock.calls as unknown[][];
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[1]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[2]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(reserveInvite).toHaveBeenCalledTimes(2);
  });

  it('does not retry a serializable shell more than once', async () => {
    const firstConflict = new Prisma.PrismaClientKnownRequestError(
      'first serialization conflict',
      {
        code: 'P2034',
        clientVersion: 'test',
      },
    );
    const secondConflict = new Prisma.PrismaClientKnownRequestError(
      'second serialization conflict',
      {
        code: 'P2034',
        clientVersion: 'test',
      },
    );
    const defaultTransaction = async (
      operation: (tx: SharedProvisioningPrismaMock) => Promise<unknown>,
    ): Promise<unknown> => operation(prisma);
    prisma.$transaction
      .mockRejectedValueOnce(firstConflict)
      .mockImplementationOnce(defaultTransaction)
      .mockRejectedValueOnce(secondConflict)
      .mockImplementationOnce(defaultTransaction);

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toMatchObject({
      code: 'P2034',
    });

    const calls = prisma.$transaction.mock.calls as unknown[][];
    expect(calls).toHaveLength(4);
    expect(calls[0]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[1]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[2]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(calls[3]?.[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('rejects a stored replay receipt with any undeclared field', async () => {
    await service.provision(platformAdmin, provisioningDto());
    const audit = firstCallData(prisma.platformAdminAuditEvent.create);
    if (!record(audit.after)) {
      throw new Error('Expected stored shell receipt');
    }
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: {
        ...audit.after,
        ownerEmail: OWNER_EMAIL,
      },
      metadata: audit.metadata,
    });

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechecks both actor and support owner in the database', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: SUPPORT_OWNER_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
    ]);
    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.create).not.toHaveBeenCalled();

    prisma.user.findMany.mockResolvedValue([
      {
        id: PLATFORM_ADMIN_ID,
        isActive: true,
        isPlatformAdmin: true,
      },
      {
        id: SUPPORT_OWNER_ID,
        isActive: false,
        isPlatformAdmin: true,
      },
    ]);
    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('rejects tenant actors, legacy invite/trial fields and PII in audit text', async () => {
    await expect(
      service.provision(
        {
          id: TENANT_ID,
          isPlatformAdmin: false,
        } as AuthenticatedUser,
        provisioningDto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          trialStartsAt: new Date().toISOString(),
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'SHARED_BETA_PROVISIONING_FIELD_NOT_ALLOWED',
      },
    });
    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          reason: `Provision ${OWNER_EMAIL} as the initial owner`,
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'SHARED_BETA_OWNER_IDENTITY_METADATA_FORBIDDEN',
      },
    });
    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          ownerEmail: `\u00a0${OWNER_EMAIL}\u00a0`,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['address list', 'owner@example.test,attacker@example.test'],
    ['display name', 'Owner <owner@example.test>'],
    ['quoted local part', '"owner"@example.test'],
    [
      'CRLF header injection',
      'owner@example.test\r\nBcc:attacker@example.test',
    ],
    ['invalid domain', 'owner@example..test'],
  ])(
    'rejects malformed ownerEmail (%s) before transaction, shell or claim',
    async (_label, ownerEmail) => {
      await expect(
        service.provision(platformAdmin, provisioningDto({ ownerEmail })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction.mock.calls).toHaveLength(0);
      expect(prisma.tenant.create.mock.calls).toHaveLength(0);
      expect(prisma.store.create.mock.calls).toHaveLength(0);
      expect(reserveInvite.mock.calls).toHaveLength(0);
    },
  );

  it('does not persist audit when the sealed reservation rejects the email', async () => {
    reserveInvite.mockRejectedValue(
      new ConflictException({
        message: 'Identity email is unavailable',
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      }),
    );

    await expect(
      service.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fails before opening a transaction when the fingerprint key is unavailable', async () => {
    const unavailableIdentity = new IdentityEmailClaimService({
      get: jest.fn(),
    } as unknown as ConfigService);
    const unavailableService = new SharedTenantProvisioningService(
      prisma as unknown as PrismaService,
      unavailableIdentity,
    );

    await expect(
      unavailableService.provision(platformAdmin, provisioningDto()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requests a serializable transaction for the complete shell', async () => {
    await service.provision(platformAdmin, provisioningDto());

    const calls = prisma.$transaction.mock.calls as unknown[][];
    const options = calls[0]?.[1];
    expect(options).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  });
});
