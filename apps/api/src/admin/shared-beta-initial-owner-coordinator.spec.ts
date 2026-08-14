import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IdentityEmailClaimType,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import {
  PrismaSharedBetaActivationDriver,
  SHARED_BETA_ACTIVATION_TRANSACTION_OPTIONS,
  SharedBetaInitialOwnerCoordinator,
  type SharedBetaActivationDriver,
  type SharedBetaActivationDriverInput,
  type SharedBetaActivationDriverReceipt,
  type SharedBetaInitialOwnerEnvelope,
} from './shared-beta-initial-owner-coordinator';
import type {
  SharedTenantProvisioningService,
  ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const STORE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const ACTIVATION_COMMAND_ID = '55555555-5555-4555-8555-555555555555';
const ISSUE_COMMAND_ID = '66666666-6666-4666-8666-666666666666';
const INVITE_ID = '77777777-7777-4777-8777-777777777777';
const OUTBOX_ID = '88888888-8888-4888-8888-888888888888';
const MESSAGE_KEY = '99999999-9999-4999-8999-999999999999';
const REPLAY_ACTIVATION_COMMAND_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPLAY_INVITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REPLAY_OUTBOX_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTIVATION_REQUEST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ADMISSION_DECISION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEPLOYMENT_MARKER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OWNER_EMAIL = 'owner@example.test';
const TOKEN_HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-05T08:00:00.000Z');
const INVITE_EXPIRES_AT = '2026-08-11T08:00:00.000Z';
const TRIAL_START_MS = Date.parse('2026-08-05T08:00:01.000Z');
const TRIAL_END_MS = Date.parse('2026-09-04T08:00:01.000Z');

const actor = {
  id: ACTOR_ID,
  isPlatformAdmin: true,
} as AuthenticatedUser;

function prismaFailure(
  code: string,
  sqlState?: string,
): Error & {
  code: string;
  meta?: { code: string };
} {
  const failure = new Error('Synthetic database failure') as Error & {
    code: string;
    meta?: { code: string };
  };
  failure.code = code;
  if (sqlState) {
    failure.meta = { code: sqlState };
  }
  return failure;
}

function shellResult(overrides: Partial<ShellProvisioningResult> = {}) {
  const result: ShellProvisioningResult = {
    ok: true,
    decision: 'SHELL_PROVISIONED',
    replayed: false,
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
      reservationId: RESERVATION_ID,
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
  return result;
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    shell: {
      confirmation: 'PROVISION friendly-club',
      requestId: 'provision-request-1',
      reason: 'Provision the first friendly external club',
      supportTicket: 'BETA-101',
      tenantName: 'Friendly Club',
      tenantSlug: 'friendly-club',
      cohortKey: 'friendly-club-1',
      supportOwnerUserId: ACTOR_ID,
      storeName: 'Friendly Club Main',
      storeTimeZone: 'Asia/Yekaterinburg',
      ownerEmail: OWNER_EMAIL,
    },
    activation: {
      confirmation: 'ACTIVATE friendly-club',
      requestId: ACTIVATION_REQUEST_ID,
      reason: 'Approved first external pilot activation',
      supportTicket: 'BETA-102',
      tenantId: TENANT_ID,
      tenantSlug: 'friendly-club',
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      inviteExpiresAt: INVITE_EXPIRES_AT,
      goEvidence: {
        authority: 'PERSISTED_SIGNED_SHARED_BETA_GO_V1',
        admissionDecisionId: ADMISSION_DECISION_ID,
        deploymentMarkerId: DEPLOYMENT_MARKER_ID,
      },
      ...overrides,
    },
  };
}

function activationReceipt(
  input: SharedBetaActivationDriverInput,
  decision: 'ACTIVATED' | 'REPLAYED' = 'ACTIVATED',
): SharedBetaActivationDriverReceipt {
  return {
    schemaVersion: 1,
    operation: 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
    decision,
    tenantId: input.tenantId,
    activationCommandId:
      decision === 'ACTIVATED'
        ? input.activationCommandId
        : REPLAY_ACTIVATION_COMMAND_ID,
    admissionDecisionId: input.admissionDecisionId,
    markerId: input.deploymentMarkerId,
    markerGeneration: 1,
    tenantStatus: 'ACTIVE',
    onboardingStatus: 'OWNER_INVITED',
    executionRevision: 1,
    trialStartsAtEpochMs: TRIAL_START_MS,
    trialEndsAtEpochMs: TRIAL_END_MS,
    inviteId: decision === 'ACTIVATED' ? input.inviteId : REPLAY_INVITE_ID,
    outboxId: decision === 'ACTIVATED' ? input.outboxId : REPLAY_OUTBOX_ID,
    outboxStatus: 'PENDING',
    createdTransactionId: '501',
  };
}

function fixture(options?: {
  enabled?: boolean;
  shell?: ShellProvisioningResult;
}) {
  const provision = jest
    .fn()
    .mockResolvedValue(options?.shell ?? shellResult());
  const recoverProtectedActivationShell = jest
    .fn()
    .mockResolvedValue(
      options?.shell ??
        shellResult({ decision: 'ALREADY_PROVISIONED', replayed: true }),
    );
  const shellProvisioning = {
    provision,
    recoverProtectedActivationShell,
  } as unknown as SharedTenantProvisioningService;
  const ciphertext = Buffer.alloc(71, 7);
  const sealInitialOwnerInviteToken: jest.MockedFunction<
    SharedBetaInitialOwnerEnvelope['sealInitialOwnerInviteToken']
  > = jest.fn().mockReturnValue({
    tokenHash: TOKEN_HASH,
    digestVersion: 'sha256-v1',
    secretCiphertext: ciphertext,
    envelopeVersion: 1,
    keyVersion: 'v1',
    aadEnvironment: 'ci',
  });
  const envelope = {
    sealInitialOwnerInviteToken,
  } as SharedBetaInitialOwnerEnvelope;
  const activate = jest
    .fn<
      Promise<SharedBetaActivationDriverReceipt>,
      [SharedBetaActivationDriverInput]
    >()
    .mockImplementation((input) => Promise.resolve(activationReceipt(input)));
  const driver: SharedBetaActivationDriver = { activate };
  const ids = [
    ACTIVATION_COMMAND_ID,
    ISSUE_COMMAND_ID,
    INVITE_ID,
    OUTBOX_ID,
    MESSAGE_KEY,
  ];
  const uuidFactory = jest.fn(() => {
    const id = ids.shift();
    if (!id) {
      throw new Error('Unexpected UUID request');
    }
    return id;
  });
  const coordinator = new SharedBetaInitialOwnerCoordinator(
    shellProvisioning,
    driver,
    envelope,
    {
      enabled: options?.enabled ?? true,
      executionMode: 'DORMANT_TEST_ONLY',
      environment: 'ci',
      lostResponseRetries: 1,
    },
    () => new Date(NOW),
    uuidFactory,
  );
  return {
    coordinator,
    provision,
    recoverProtectedActivationShell,
    activate,
    sealInitialOwnerInviteToken,
    ciphertext,
  };
}

describe('SharedBetaInitialOwnerCoordinator dormant application boundary', () => {
  it('is absent from Nest composition and has no production execution mode', () => {
    const sourceRoot = join(__dirname, '..');
    const adminModule = readFileSync(
      join(sourceRoot, 'admin/admin.module.ts'),
      'utf8',
    );
    const coordinatorSource = readFileSync(
      join(sourceRoot, 'admin/shared-beta-initial-owner-coordinator.ts'),
      'utf8',
    );

    expect(adminModule).not.toContain('SharedBetaInitialOwnerCoordinator');
    expect(coordinatorSource).not.toMatch(
      /executionMode:\s*['"]PRODUCTION['"]/u,
    );
    expect(coordinatorSource).not.toMatch(/@Injectable\(\)/u);
  });

  it('cannot run under the default production-disabled policy', async () => {
    const { coordinator, provision, activate, sealInitialOwnerInviteToken } =
      fixture({ enabled: false });

    await expect(
      coordinator.coordinate(actor, TENANT_ID, command()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_COORDINATOR_DORMANT',
      },
    });
    expect(provision).not.toHaveBeenCalled();
    expect(sealInitialOwnerInviteToken).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('cannot be enabled while the process is running as production', async () => {
    const { coordinator, provision, activate } = fixture();
    const previousNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        coordinator.coordinate(actor, TENANT_ID, command()),
      ).rejects.toMatchObject({
        response: {
          reasonCode: 'SHARED_BETA_INITIAL_OWNER_COORDINATOR_DORMANT',
        },
      });
    } finally {
      if (previousNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnvironment;
      }
    }
    expect(provision).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('replays the exact shell then executes one sealed activation without exposing identity or secret material', async () => {
    const {
      coordinator,
      provision,
      activate,
      sealInitialOwnerInviteToken,
      ciphertext,
    } = fixture();
    const originalCiphertext = Buffer.from(ciphertext);

    const result = await coordinator.coordinate(actor, TENANT_ID, command());

    expect(result).toMatchObject({
      ok: true,
      coordinatorContract: 'PROTECTED_INITIAL_OWNER_APPLICATION_COORDINATOR_V1',
      decision: 'ACTIVATED',
      replayed: false,
      shellReplayed: false,
      tenant: {
        id: TENANT_ID,
        slug: 'friendly-club',
        status: 'ACTIVE',
        onboardingStatus: 'OWNER_INVITED',
        executionRevision: 1,
      },
      ownerInvite: {
        id: INVITE_ID,
        deliveryStatus: 'PENDING',
      },
      authority: {
        admissionDecisionId: ADMISSION_DECISION_ID,
        deploymentMarkerId: DEPLOYMENT_MARKER_ID,
      },
    });
    expect(provision).toHaveBeenCalledWith(actor, command().shell);
    expect(sealInitialOwnerInviteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        workflowLocator: RESERVATION_ID,
        inviteId: INVITE_ID,
        outboxId: OUTBOX_ID,
        messageKey: MESSAGE_KEY,
        recipientEmail: OWNER_EMAIL,
        expiresAt: new Date(INVITE_EXPIRES_AT),
      }),
    );
    const binding = sealInitialOwnerInviteToken.mock.calls[0]?.[0];
    expect(binding?.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(activate).toHaveBeenCalledTimes(1);
    const driverInput = activate.mock.calls[0]?.[0];
    expect(driverInput).toMatchObject({
      activationCommandId: ACTIVATION_COMMAND_ID,
      tenantId: TENANT_ID,
      activationRequestId: ACTIVATION_REQUEST_ID,
      admissionDecisionId: ADMISSION_DECISION_ID,
      deploymentMarkerId: DEPLOYMENT_MARKER_ID,
      activatedByUserId: ACTOR_ID,
      issueCommandId: ISSUE_COMMAND_ID,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      messageKey: MESSAGE_KEY,
      tokenHash: TOKEN_HASH,
    });
    expect(driverInput?.activationRequestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(driverInput?.issueRequestId).toMatch(UUID_PATTERN_FOR_TEST);
    expect(driverInput?.issueRequestDigest).toBe(binding?.requestDigest);
    expect(Buffer.from(driverInput?.secretCiphertext ?? [])).toEqual(
      Buffer.alloc(71),
    );
    expect(originalCiphertext).toEqual(Buffer.alloc(71, 7));
    expect(ciphertext).toEqual(Buffer.alloc(71));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(OWNER_EMAIL);
    expect(serialized).not.toContain(TOKEN_HASH);
    expect(serialized).not.toMatch(
      /registrationUrl|rawToken|password|secretCiphertext|tokenHash/iu,
    );
  });

  it('accepts a database-authoritative replay whose persisted IDs differ from fresh ignored candidates', async () => {
    const { coordinator, activate } = fixture({
      shell: shellResult({
        decision: 'ALREADY_PROVISIONED',
        replayed: true,
      }),
    });
    activate.mockImplementation((input) =>
      Promise.resolve(activationReceipt(input, 'REPLAYED')),
    );

    await expect(
      coordinator.coordinate(actor, TENANT_ID, command()),
    ).resolves.toMatchObject({
      decision: 'REPLAYED',
      replayed: true,
      shellReplayed: true,
      ownerInvite: { id: REPLAY_INVITE_ID },
    });
  });

  it('recovers the immutable shell receipt after claim progression and reaches database replay', async () => {
    const {
      coordinator,
      provision,
      recoverProtectedActivationShell,
      activate,
    } = fixture();
    provision.mockRejectedValueOnce(
      new ConflictException({
        message: 'Identity claim state changed',
        reasonCode: 'IDENTITY_CLAIM_STATE_MISMATCH',
      }),
    );
    activate.mockImplementation((input) =>
      Promise.resolve(activationReceipt(input, 'REPLAYED')),
    );

    await expect(
      coordinator.coordinate(actor, TENANT_ID, command()),
    ).resolves.toMatchObject({
      decision: 'REPLAYED',
      shellReplayed: true,
      ownerInvite: { id: REPLAY_INVITE_ID },
    });
    expect(recoverProtectedActivationShell).toHaveBeenCalledWith(
      actor,
      command().shell,
    );
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('retries one ambiguous lost response with the same request, candidates and ciphertext', async () => {
    const { coordinator, activate, ciphertext } = fixture();
    const observed: SharedBetaActivationDriverInput[] = [];
    activate
      .mockImplementationOnce((input) => {
        observed.push({
          ...input,
          secretCiphertext: Buffer.from(input.secretCiphertext),
        });
        return Promise.reject(prismaFailure('P2010', '40001'));
      })
      .mockImplementationOnce((input) => {
        observed.push({
          ...input,
          secretCiphertext: Buffer.from(input.secretCiphertext),
        });
        return Promise.resolve(activationReceipt(input, 'REPLAYED'));
      });

    await expect(
      coordinator.coordinate(actor, TENANT_ID, command()),
    ).resolves.toMatchObject({
      decision: 'REPLAYED',
    });
    expect(activate).toHaveBeenCalledTimes(2);
    expect(observed).toHaveLength(2);
    expect(observed[1]).toEqual(observed[0]);
    expect(observed[0]?.secretCiphertext).toEqual(Buffer.alloc(71, 7));
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('fails to reconciliation after the bounded lost-response retry and redacts the driver error', async () => {
    const { coordinator, activate, ciphertext } = fixture();
    activate.mockRejectedValue({
      code: 'P1001',
      message: `${OWNER_EMAIL} ${TOKEN_HASH} ${ciphertext.toString('base64')}`,
    });

    let failure: unknown;
    try {
      await coordinator.coordinate(actor, TENANT_ID, command());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({
      message: 'Shared beta activation requires reconciliation',
      reasonCode:
        'SHARED_BETA_INITIAL_OWNER_ACTIVATION_RECONCILIATION_REQUIRED',
    });
    expect(JSON.stringify(failure)).not.toContain(OWNER_EMAIL);
    expect(JSON.stringify(failure)).not.toContain(TOKEN_HASH);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('contains a deterministic database precondition failure without retry or raw details', async () => {
    const { coordinator, activate, ciphertext } = fixture();
    activate.mockRejectedValue({
      code: 'P2010',
      meta: { code: '23514' },
      message: `${OWNER_EMAIL} ${TOKEN_HASH}`,
    });

    await expect(
      coordinator.coordinate(actor, TENANT_ID, command()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTIVATION_PRECONDITION_FAILED',
      },
    });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('rejects boolean GO, raw signed envelopes, temporary passwords and shell revision drift before cryptography', async () => {
    const { coordinator, activate, sealInitialOwnerInviteToken } = fixture();
    const booleanGo = command({ gatePassed: true });
    await expect(
      coordinator.coordinate(actor, TENANT_ID, booleanGo),
    ).rejects.toBeInstanceOf(BadRequestException);

    const rawSignature = command({
      goEvidence: {
        authority: 'PERSISTED_SIGNED_SHARED_BETA_GO_V1',
        admissionDecisionId: ADMISSION_DECISION_ID,
        deploymentMarkerId: DEPLOYMENT_MARKER_ID,
        signature: 'raw-signed-envelope',
      },
    });
    await expect(
      coordinator.coordinate(actor, TENANT_ID, rawSignature),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      coordinator.coordinate(
        actor,
        TENANT_ID,
        command({ password: 'temporary-password' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      coordinator.coordinate(
        actor,
        TENANT_ID,
        command({ expectedExecutionRevision: 1 }),
      ),
    ).rejects.toMatchObject({
      response: { reasonCode: 'SHARED_BETA_INITIAL_OWNER_SHELL_MISMATCH' },
    });
    expect(sealInitialOwnerInviteToken).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('binds the coordinator command to the route tenant before provisioning', async () => {
    const { coordinator, provision, activate } = fixture();

    await expect(
      coordinator.coordinate(
        actor,
        '10101010-1010-4010-8010-101010101010',
        command(),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_TENANT_BINDING_INVALID',
      },
    });
    expect(provision).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('rejects email copied into activation metadata before provisioning', async () => {
    const { coordinator, provision, activate } = fixture();

    await expect(
      coordinator.coordinate(
        actor,
        TENANT_ID,
        command({ reason: `Approved activation for ${OWNER_EMAIL}` }),
      ),
    ).rejects.toMatchObject({
      response: { reasonCode: 'SHARED_BETA_OWNER_IDENTITY_METADATA_FORBIDDEN' },
    });
    expect(provision).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});

const UUID_PATTERN_FOR_TEST =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('PrismaSharedBetaActivationDriver exact RPC boundary', () => {
  function driverFixture(receipt: Record<string, unknown>) {
    let observedQuery: Prisma.Sql | undefined;
    let observedOptions: unknown;
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      observedQuery = query;
      return Promise.resolve([{ receipt }]);
    });
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (tx: { $queryRaw: jest.Mock }) => Promise<unknown>,
          options: unknown,
        ) => {
          observedOptions = options;
          return operation({ $queryRaw: queryRaw });
        },
      );
    const driver = new PrismaSharedBetaActivationDriver({
      $transaction: transaction,
    });
    return {
      driver,
      transaction,
      queryRaw,
      observed: () => ({ query: observedQuery, options: observedOptions }),
    };
  }

  function driverInput(): SharedBetaActivationDriverInput {
    return {
      activationCommandId: ACTIVATION_COMMAND_ID,
      tenantId: TENANT_ID,
      activationRequestId: ACTIVATION_REQUEST_ID,
      activationRequestDigest: 'b'.repeat(64),
      admissionDecisionId: ADMISSION_DECISION_ID,
      deploymentMarkerId: DEPLOYMENT_MARKER_ID,
      activatedByUserId: ACTOR_ID,
      issueRequestId: '12121212-1212-4121-8121-121212121212',
      issueRequestDigest: 'c'.repeat(64),
      issueCommandId: ISSUE_COMMAND_ID,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      messageKey: MESSAGE_KEY,
      tokenHash: TOKEN_HASH,
      secretCiphertext: Buffer.alloc(71, 7),
      inviteExpiresAt: new Date(INVITE_EXPIRES_AT),
    };
  }

  function rawReceipt(input: SharedBetaActivationDriverInput) {
    return { ...activationReceipt(input) };
  }

  it('uses one serializable transaction and exactly one activation RPC', async () => {
    const input = driverInput();
    const { driver, transaction, queryRaw, observed } = driverFixture(
      rawReceipt(input),
    );

    await expect(driver.activate(input)).resolves.toEqual(
      activationReceipt(input),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(observed().options).toEqual(
      SHARED_BETA_ACTIVATION_TRANSACTION_OPTIONS,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = observed().query;
    expect(query?.values).toEqual([
      input.activationCommandId,
      input.tenantId,
      input.activationRequestId,
      input.activationRequestDigest,
      input.admissionDecisionId,
      input.deploymentMarkerId,
      input.activatedByUserId,
      input.issueRequestId,
      input.issueRequestDigest,
      input.issueCommandId,
      input.inviteId,
      input.outboxId,
      input.messageKey,
      input.tokenHash,
      input.secretCiphertext,
      input.inviteExpiresAt,
    ]);
    expect(query?.strings.join('')).toContain('shared_beta_tenant_activate_v1');
    expect(query?.strings.join('')).not.toContain('TenantAdmissionDecision');
    expect(query?.strings.join('')).not.toContain(
      'SharedBetaRuntimeReleaseMarker',
    );
  });

  it('rejects extra receipt fields and multiple rows fail-closed', async () => {
    const input = driverInput();
    const extra = driverFixture({
      ...rawReceipt(input),
      ownerEmail: OWNER_EMAIL,
    });
    await expect(extra.driver.activate(input)).rejects.toMatchObject({
      response: { reasonCode: 'SHARED_BETA_ACTIVATION_RECEIPT_INVALID' },
    });

    const none = driverFixture(rawReceipt(input));
    none.queryRaw.mockResolvedValue([]);
    await expect(none.driver.activate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const duplicate = driverFixture(rawReceipt(input));
    duplicate.queryRaw.mockResolvedValue([
      { receipt: rawReceipt(input) },
      { receipt: rawReceipt(input) },
    ]);
    await expect(duplicate.driver.activate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a receipt with a malformed timeline or decision', async () => {
    const input = driverInput();
    const timeline = driverFixture({
      ...rawReceipt(input),
      trialEndsAtEpochMs: TRIAL_START_MS,
    });
    await expect(timeline.driver.activate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const decision = driverFixture({
      ...rawReceipt(input),
      decision: 'GO',
    });
    await expect(decision.driver.activate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
