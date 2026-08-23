import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  EMPLOYEE_INVITE_TRANSACTION_OPTIONS,
  EmployeeInviteDeliveryCoordinator,
  PrismaEmployeeInviteDeliveryDriver,
  type EmployeeInviteDeliveryDriver,
  type EmployeeInviteDeliveryInput,
  type EmployeeInviteDeliveryReceipt,
  type EmployeeInviteEnvelope,
  type EmployeeInviteFreshNetworkAuthority,
  type EmployeeInviteRevokeInput,
  type EmployeeInviteRevokeReceipt,
} from './employee-invite-delivery-coordinator';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const STORE_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_INVITE_ID = '44444444-4444-4444-8444-444444444444';
const COMMAND_ID = '55555555-5555-4555-8555-555555555555';
const DELIVERY_LOCATOR = '66666666-6666-4666-8666-666666666666';
const INVITE_ID = '77777777-7777-4777-8777-777777777777';
const OUTBOX_ID = '88888888-8888-4888-8888-888888888888';
const MESSAGE_KEY = '99999999-9999-4999-8999-999999999999';
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPLAY_COMMAND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REPLAY_INVITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REPLAY_OUTBOX_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EMAIL = 'employee@example.test';
const TOKEN_HASH = 'e'.repeat(64);
const NOW = new Date('2026-08-05T10:00:00.000Z');
const EXPIRES_AT = '2026-08-12T10:00:00.000Z';

const actor: AuthenticatedUser = {
  id: ACTOR_ID,
  email: 'owner@example.test',
  fullName: 'Owner',
  role: UserRole.OWNER,
  isActive: true,
  isPlatformAdmin: false,
  tenantId: TENANT_ID,
  tenantSlug: 'tenant-b',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
  permissions: ['manage_users'],
};

function issueCommand(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    email: EMAIL,
    fullName: 'Employee',
    role: UserRole.CLUB_ADMINISTRATOR,
    customRoleId: null,
    scope: 'STORES',
    storeIds: [STORE_ID],
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function deliveryReceipt(
  input: EmployeeInviteDeliveryInput,
  decision: 'CREATED' | 'REPLAYED' = 'CREATED',
): EmployeeInviteDeliveryReceipt {
  return {
    schemaVersion: 1,
    operation: input.operation,
    decision,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    commandId: decision === 'CREATED' ? input.commandId : REPLAY_COMMAND_ID,
    previousInviteId: input.previousInviteId,
    inviteId: decision === 'CREATED' ? input.inviteId : REPLAY_INVITE_ID,
    outboxId: decision === 'CREATED' ? input.outboxId : REPLAY_OUTBOX_ID,
    outboxStatus: 'PENDING',
    expiresAtEpochMs: input.expiresAt.getTime(),
    createdTransactionId: '501',
  };
}

function revokeReceipt(
  input: EmployeeInviteRevokeInput,
  decision: 'REVOKED' | 'REPLAYED' = 'REVOKED',
): EmployeeInviteRevokeReceipt {
  return {
    schemaVersion: 1,
    operation: 'REVOKE_EMPLOYEE_INVITE',
    decision,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    commandId: decision === 'REVOKED' ? input.commandId : REPLAY_COMMAND_ID,
    inviteId: input.inviteId,
    outboxStatus: 'CANCELED',
    claimReleased: true,
    createdTransactionId: '502',
  };
}

function fixture(enabled = true) {
  const assertNetwork = jest.fn().mockResolvedValue({
    userId: ACTOR_ID,
    tenantId: TENANT_ID,
    tenantSlug: 'tenant-b',
    mode: 'NETWORK',
    allowedStoreIds: [],
  });
  const freshNetworkAuthority: EmployeeInviteFreshNetworkAuthority = {
    assertNetwork,
  };
  const ciphertext = Buffer.alloc(71, 7);
  const seal = jest.fn().mockReturnValue({
    tokenHash: TOKEN_HASH,
    digestVersion: 'sha256-v1',
    secretCiphertext: ciphertext,
    envelopeVersion: 1,
    keyVersion: 'employee-v1',
    aadEnvironment: 'ci',
  });
  const envelope: EmployeeInviteEnvelope = { seal };
  const issue = jest
    .fn<Promise<EmployeeInviteDeliveryReceipt>, [EmployeeInviteDeliveryInput]>()
    .mockImplementation((input) => Promise.resolve(deliveryReceipt(input)));
  const reissue = jest
    .fn<Promise<EmployeeInviteDeliveryReceipt>, [EmployeeInviteDeliveryInput]>()
    .mockImplementation((input) => Promise.resolve(deliveryReceipt(input)));
  const revoke = jest
    .fn<Promise<EmployeeInviteRevokeReceipt>, [EmployeeInviteRevokeInput]>()
    .mockImplementation((input) => Promise.resolve(revokeReceipt(input)));
  const driver: EmployeeInviteDeliveryDriver = { issue, reissue, revoke };
  const ids = [COMMAND_ID, DELIVERY_LOCATOR, INVITE_ID, OUTBOX_ID, MESSAGE_KEY];
  const coordinator = new EmployeeInviteDeliveryCoordinator(
    freshNetworkAuthority,
    driver,
    envelope,
    {
      enabled,
      executionMode: 'DORMANT_TEST_ONLY',
      environment: 'ci',
      lostResponseRetries: 1,
    },
    () => new Date(NOW),
    () => {
      const id = ids.shift();
      if (!id) {
        throw new Error('Unexpected UUID request');
      }
      return id;
    },
  );
  return {
    coordinator,
    assertNetwork,
    seal,
    ciphertext,
    issue,
    reissue,
    revoke,
  };
}

describe('EmployeeInviteDeliveryCoordinator dormant boundary', () => {
  it('is absent from Nest runtime and preserves the initial-owner-only worker contract', () => {
    const sourceRoot = join(__dirname, '..');
    const usersModule = readFileSync(
      join(__dirname, 'users.module.ts'),
      'utf8',
    );
    const coordinatorSource = readFileSync(
      join(__dirname, 'employee-invite-delivery-coordinator.ts'),
      'utf8',
    );
    const initialOwnerEnvelope = readFileSync(
      join(sourceRoot, 'auth/identity-mail-secret-envelope.service.ts'),
      'utf8',
    );
    const workerTypes = readFileSync(
      join(sourceRoot, 'identity-mail-worker/identity-mail-worker.types.ts'),
      'utf8',
    );

    expect(usersModule).not.toContain('EmployeeInviteDeliveryCoordinator');
    expect(coordinatorSource).not.toMatch(/@Injectable\(\)/u);
    expect(coordinatorSource).not.toMatch(
      /executionMode:\s*['"]PRODUCTION['"]/u,
    );
    expect(initialOwnerEnvelope).toContain(
      "const IDENTITY_MAIL_TEMPLATE = 'INITIAL_OWNER_INVITE'",
    );
    expect(workerTypes).toContain("template: 'INITIAL_OWNER_INVITE'");
  });

  it('fails before authority, encryption and database under the default-disabled policy', async () => {
    const { coordinator, assertNetwork, seal, issue } = fixture(false);

    await expect(
      coordinator.issue(actor, issueCommand()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_COORDINATOR_DORMANT' },
    });
    expect(assertNetwork).not.toHaveBeenCalled();
    expect(seal).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('cannot be enabled by configuration in a production process', async () => {
    const { coordinator, assertNetwork, issue } = fixture();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        coordinator.issue(actor, issueCommand()),
      ).rejects.toMatchObject({
        response: { reasonCode: 'EMPLOYEE_INVITE_COORDINATOR_DORMANT' },
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    expect(assertNetwork).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('issues only after fresh NETWORK OWNER authority and returns no token, URL or email', async () => {
    const { coordinator, assertNetwork, seal, issue, ciphertext } = fixture();
    const originalCiphertext = Buffer.from(ciphertext);

    const result = await coordinator.issue(actor, issueCommand());
    const issueInput = issue.mock.calls[0]?.[0];
    if (!issueInput) {
      throw new Error('Expected employee invite delivery input');
    }

    expect(assertNetwork).toHaveBeenCalledWith(actor);
    expect(seal).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      deliveryLocator: DELIVERY_LOCATOR,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      template: 'EMPLOYEE_USER_INVITE',
      messageKey: MESSAGE_KEY,
      requestDigest: issueInput.requestDigest,
      recipientEmail: EMAIL,
      expiresAt: new Date(EXPIRES_AT),
    });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(issueInput).toMatchObject({
      operation: 'ISSUE_EMPLOYEE_INVITE',
      commandId: COMMAND_ID,
      actorUserId: ACTOR_ID,
      tenantId: TENANT_ID,
      previousInviteId: null,
      reservationSubjectId: DELIVERY_LOCATOR,
      deliveryLocator: DELIVERY_LOCATOR,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      email: EMAIL,
      scope: 'STORES',
      storeIds: [STORE_ID],
      tokenHash: TOKEN_HASH,
    });
    expect(issueInput.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result).toEqual({
      ok: true,
      coordinatorContract: 'EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1',
      operation: 'ISSUE_EMPLOYEE_INVITE',
      decision: 'CREATED',
      replayed: false,
      tenantId: TENANT_ID,
      invite: {
        id: INVITE_ID,
        deliveryStatus: 'PENDING',
        expiresAt: EXPIRES_AT,
      },
      replacedInviteId: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /registrationUrl|rawToken|tokenHash|secretCiphertext|password|employee@/iu,
    );
    expect(originalCiphertext).toEqual(Buffer.alloc(71, 7));
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('reissues the same mailbox as a new immutable invite and binds the replaced id', async () => {
    const { coordinator, reissue, issue } = fixture();

    await expect(
      coordinator.reissue(actor, PREVIOUS_INVITE_ID, issueCommand()),
    ).resolves.toMatchObject({
      operation: 'REISSUE_EMPLOYEE_INVITE',
      decision: 'REISSUED',
      replacedInviteId: PREVIOUS_INVITE_ID,
    });
    expect(issue).not.toHaveBeenCalled();
    expect(reissue).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'REISSUE_EMPLOYEE_INVITE',
        previousInviteId: PREVIOUS_INVITE_ID,
        reservationSubjectId: null,
        email: EMAIL,
      }),
    );
  });

  it('revokes with no encryption and returns a safe terminal receipt', async () => {
    const { coordinator, revoke, seal } = fixture();

    const result = await coordinator.revoke(actor, PREVIOUS_INVITE_ID, {
      requestId: REQUEST_ID,
      reason: 'Employee no longer needs access',
    });

    expect(seal).not.toHaveBeenCalled();
    const revokeInput = revoke.mock.calls[0]?.[0];
    expect(revokeInput).toMatchObject({
      operation: 'REVOKE_EMPLOYEE_INVITE',
      tenantId: TENANT_ID,
      actorUserId: ACTOR_ID,
      inviteId: PREVIOUS_INVITE_ID,
    });
    expect(revokeInput?.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result).toMatchObject({
      decision: 'REVOKED',
      invite: { id: PREVIOUS_INVITE_ID, deliveryStatus: 'CANCELED' },
    });
    expect(JSON.stringify(result)).not.toContain('Employee no longer');
  });

  it('rejects non-owner and stale/foreign fresh authority before encryption', async () => {
    const nonOwner = { ...actor, role: UserRole.ADMIN };
    const first = fixture();
    await expect(
      first.coordinator.issue(nonOwner, issueCommand()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(first.assertNetwork).not.toHaveBeenCalled();

    const stale = fixture();
    stale.assertNetwork.mockResolvedValue({
      userId: ACTOR_ID,
      tenantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      tenantSlug: 'tenant-b',
      mode: 'NETWORK',
      allowedStoreIds: [],
    });
    await expect(
      stale.coordinator.issue(actor, issueCommand()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_FRESH_AUTHORITY_INVALID' },
    });
    expect(stale.seal).not.toHaveBeenCalled();

    const revokedCapability = fixture();
    await expect(
      revokedCapability.coordinator.issue(
        { ...actor, permissions: ['view_dashboard'] },
        issueCommand(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(revokedCapability.assertNetwork).not.toHaveBeenCalled();
    expect(revokedCapability.seal).not.toHaveBeenCalled();
  });

  it.each([
    ['non-canonical email', { email: 'Employee@example.test' }],
    ['OWNER role', { role: UserRole.OWNER }],
    ['NETWORK with stores', { scope: 'NETWORK' }],
    ['STORES without stores', { storeIds: [] }],
    ['duplicate stores', { storeIds: [STORE_ID, STORE_ID] }],
    ['expired timestamp', { expiresAt: '2026-08-05T09:00:00.000Z' }],
    [
      'custom role shape mismatch',
      { customRoleId: STORE_ID, role: UserRole.ADMIN },
    ],
  ])('rejects %s before encryption', async (_label, override) => {
    const { coordinator, seal, issue } = fixture();
    await expect(
      coordinator.issue(actor, issueCommand(override)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seal).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('rejects extra request fields and never accepts a password', async () => {
    const { coordinator, issue } = fixture();
    await expect(
      coordinator.issue(actor, issueCommand({ password: '12345678' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issue).not.toHaveBeenCalled();
  });

  it('retries one unknown database response with identical encrypted input', async () => {
    const { coordinator, issue, ciphertext } = fixture();
    const observed: EmployeeInviteDeliveryInput[] = [];
    issue
      .mockImplementationOnce((input) => {
        observed.push({
          ...input,
          secretCiphertext: Buffer.from(input.secretCiphertext),
        });
        return Promise.reject(
          Object.assign(new Error('database response lost'), {
            code: 'P1001',
          }),
        );
      })
      .mockImplementationOnce((input) => {
        observed.push({
          ...input,
          secretCiphertext: Buffer.from(input.secretCiphertext),
        });
        return Promise.resolve(deliveryReceipt(input, 'REPLAYED'));
      });

    await expect(
      coordinator.issue(actor, issueCommand()),
    ).resolves.toMatchObject({
      decision: 'REPLAYED',
      replayed: true,
      invite: { id: REPLAY_INVITE_ID },
    });
    expect(observed[1]).toEqual(observed[0]);
    expect(observed[0]?.secretCiphertext).toEqual(Buffer.alloc(71, 7));
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('accepts persisted semantic replay from an independent coordinator with a new secret and UUIDs', async () => {
    const inputs: EmployeeInviteDeliveryInput[] = [];
    let persisted: EmployeeInviteDeliveryReceipt | null = null;
    const issue = jest
      .fn<
        Promise<EmployeeInviteDeliveryReceipt>,
        [EmployeeInviteDeliveryInput]
      >()
      .mockImplementation((input) => {
        inputs.push({
          ...input,
          secretCiphertext: Buffer.from(input.secretCiphertext),
        });
        if (!persisted) {
          persisted = deliveryReceipt(input, 'CREATED');
          return Promise.resolve(persisted);
        }
        return Promise.resolve({ ...persisted, decision: 'REPLAYED' });
      });
    const driver: EmployeeInviteDeliveryDriver = {
      issue,
      reissue: jest.fn(),
      revoke: jest.fn(),
    };
    const authority: EmployeeInviteFreshNetworkAuthority = {
      assertNetwork: jest.fn().mockResolvedValue({
        userId: ACTOR_ID,
        tenantId: TENANT_ID,
        tenantSlug: 'tenant-b',
        mode: 'NETWORK',
        allowedStoreIds: [],
      }),
    };
    const policy = {
      enabled: true,
      executionMode: 'DORMANT_TEST_ONLY' as const,
      environment: 'ci' as const,
      lostResponseRetries: 1 as const,
    };
    const firstCiphertext = Buffer.alloc(71, 1);
    const secondCiphertext = Buffer.alloc(71, 2);
    const coordinator = (
      tokenHash: string,
      ciphertext: Buffer,
      ids: string[],
    ) =>
      new EmployeeInviteDeliveryCoordinator(
        authority,
        driver,
        {
          seal: jest.fn().mockReturnValue({
            tokenHash,
            digestVersion: 'sha256-v1',
            secretCiphertext: ciphertext,
            envelopeVersion: 1,
            keyVersion: 'employee-v1',
            aadEnvironment: 'ci',
          }),
        },
        policy,
        () => new Date(NOW),
        () => {
          const id = ids.shift();
          if (!id) throw new Error('Unexpected UUID request');
          return id;
        },
      );
    const first = coordinator(TOKEN_HASH, firstCiphertext, [
      COMMAND_ID,
      DELIVERY_LOCATOR,
      INVITE_ID,
      OUTBOX_ID,
      MESSAGE_KEY,
    ]);
    const second = coordinator('d'.repeat(64), secondCiphertext, [
      '10101010-1010-4010-8010-101010101010',
      '20202020-2020-4020-8020-202020202020',
      '30303030-3030-4030-8030-303030303030',
      '40404040-4040-4040-8040-404040404040',
      '50505050-5050-4050-8050-505050505050',
    ]);

    const created = await first.issue(actor, issueCommand());
    const replayed = await second.issue(actor, issueCommand());

    expect(created.invite.id).toBe(INVITE_ID);
    expect(replayed).toMatchObject({
      decision: 'REPLAYED',
      replayed: true,
      invite: { id: INVITE_ID },
    });
    expect(inputs).toHaveLength(2);
    expect(inputs[1]?.requestDigest).toBe(inputs[0]?.requestDigest);
    expect(inputs[1]?.tokenHash).not.toBe(inputs[0]?.tokenHash);
    expect(inputs[1]?.inviteId).not.toBe(inputs[0]?.inviteId);
    expect(inputs[1]?.secretCiphertext).not.toEqual(
      inputs[0]?.secretCiphertext,
    );
    expect(firstCiphertext).toEqual(Buffer.alloc(71));
    expect(secondCiphertext).toEqual(Buffer.alloc(71));
  });

  it('quarantines repeated unknown outcomes and redacts raw driver details', async () => {
    const { coordinator, issue, ciphertext } = fixture();
    issue.mockRejectedValue({
      code: 'P1017',
      message: `${EMAIL} ${TOKEN_HASH} ${ciphertext.toString('base64')}`,
    });

    let failure: unknown;
    try {
      await coordinator.issue(actor, issueCommand());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({
      message: 'Employee invite operation requires reconciliation',
      reasonCode: 'EMPLOYEE_INVITE_RECONCILIATION_REQUIRED',
    });
    expect(JSON.stringify(failure)).not.toContain(EMAIL);
    expect(JSON.stringify(failure)).not.toContain(TOKEN_HASH);
    expect(issue).toHaveBeenCalledTimes(2);
    expect(ciphertext).toEqual(Buffer.alloc(71));
  });

  it('contains deterministic database failures and rejects extra receipt fields', async () => {
    const deterministic = fixture();
    deterministic.issue.mockRejectedValue({
      code: 'P2010',
      meta: { code: '23514' },
      message: EMAIL,
    });
    await expect(
      deterministic.coordinator.issue(actor, issueCommand()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_PRECONDITION_FAILED' },
    });
    expect(deterministic.issue).toHaveBeenCalledTimes(1);

    const malformed = fixture();
    malformed.issue.mockImplementation((input) =>
      Promise.resolve({
        ...deliveryReceipt(input),
        registrationUrl: 'https://example.test/register#invite=secret',
      } as EmployeeInviteDeliveryReceipt),
    );
    await expect(
      malformed.coordinator.issue(actor, issueCommand()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_RECEIPT_INVALID' },
    });
  });
});

describe('PrismaEmployeeInviteDeliveryDriver exact RPC boundary', () => {
  function driverFixture(receipt: object) {
    const queries: Prisma.Sql[] = [];
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      queries.push(query);
      if (queries.length === 1) {
        return Promise.resolve([
          {
            isolationLevel: 'read committed',
            statementTimeout: '25s',
            lockTimeout: '5s',
          },
        ]);
      }
      if (queries.length === 2) {
        return Promise.resolve([{ tenantId: TENANT_ID }]);
      }
      return Promise.resolve([{ receipt }]);
    });
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (tx: { $queryRaw: typeof queryRaw }) => Promise<unknown>,
          options: unknown,
        ) => operation({ $queryRaw: queryRaw }, options),
      );
    return {
      driver: new PrismaEmployeeInviteDeliveryDriver({
        $transaction: transaction,
      }),
      transaction,
      queryRaw,
      queries,
    };
  }

  function deliveryInput(
    operation: 'ISSUE_EMPLOYEE_INVITE' | 'REISSUE_EMPLOYEE_INVITE',
  ): EmployeeInviteDeliveryInput {
    return {
      operation,
      commandId: COMMAND_ID,
      requestId: REQUEST_ID,
      requestDigest: 'a'.repeat(64),
      actorUserId: ACTOR_ID,
      tenantId: TENANT_ID,
      previousInviteId:
        operation === 'ISSUE_EMPLOYEE_INVITE' ? null : PREVIOUS_INVITE_ID,
      reservationSubjectId:
        operation === 'ISSUE_EMPLOYEE_INVITE' ? DELIVERY_LOCATOR : null,
      deliveryLocator: DELIVERY_LOCATOR,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      messageKey: MESSAGE_KEY,
      email: EMAIL,
      fullName: 'Employee',
      role: UserRole.CLUB_ADMINISTRATOR,
      customRoleId: null,
      scope: 'STORES',
      storeIds: [STORE_ID],
      tokenHash: TOKEN_HASH,
      tokenDigestVersion: 'sha256-v1',
      secretCiphertext: Buffer.alloc(71, 7),
      envelopeVersion: 1,
      keyVersion: 'employee-v1',
      aadEnvironment: 'ci',
      expiresAt: new Date(EXPIRES_AT),
    };
  }

  it.each([
    [
      'issue',
      'ISSUE_EMPLOYEE_INVITE',
      'identity_employee_invite_issue_current189_v1',
    ],
    [
      'reissue',
      'REISSUE_EMPLOYEE_INVITE',
      'identity_employee_invite_reissue_current189_v1',
    ],
  ] as const)(
    'uses bounded RC lock + exact %s RPC',
    async (method, operation, rpc) => {
      const input = deliveryInput(operation);
      const receipt = deliveryReceipt(input);
      const { driver, transaction, queries } = driverFixture(receipt);

      await expect(driver[method](input)).resolves.toEqual(receipt);
      expect(transaction).toHaveBeenCalledWith(
        expect.any(Function),
        EMPLOYEE_INVITE_TRANSACTION_OPTIONS,
      );
      expect(queries).toHaveLength(3);
      expect(queries[1]?.strings.join('')).toContain('pg_advisory_xact_lock');
      expect(queries[2]?.strings.join('')).toContain(rpc);
      expect(queries[2]?.values).toEqual([
        input.commandId,
        input.tenantId,
        input.actorUserId,
        input.requestId,
        input.requestDigest,
        input.previousInviteId,
        input.reservationSubjectId,
        input.deliveryLocator,
        input.inviteId,
        input.outboxId,
        input.messageKey,
        input.email,
        input.fullName,
        input.role,
        input.customRoleId,
        input.scope,
        [...input.storeIds],
        input.tokenHash,
        input.secretCiphertext,
        input.envelopeVersion,
        input.keyVersion,
        input.aadEnvironment,
        input.expiresAt,
      ]);
    },
  );

  it('uses the same lock protocol for revoke and rejects missing receipts', async () => {
    const input: EmployeeInviteRevokeInput = {
      operation: 'REVOKE_EMPLOYEE_INVITE',
      commandId: COMMAND_ID,
      requestId: REQUEST_ID,
      requestDigest: 'a'.repeat(64),
      actorUserId: ACTOR_ID,
      tenantId: TENANT_ID,
      inviteId: PREVIOUS_INVITE_ID,
    };
    const receipt = revokeReceipt(input);
    const fixture = driverFixture(receipt);
    await expect(fixture.driver.revoke(input)).resolves.toEqual(receipt);
    expect(fixture.queries[2]?.strings.join('')).toContain(
      'identity_employee_invite_revoke_current189_v1',
    );

    const missing = driverFixture(receipt);
    missing.queryRaw.mockImplementationOnce(() =>
      Promise.resolve([
        {
          isolationLevel: 'read committed',
          statementTimeout: '25s',
          lockTimeout: '5s',
        },
      ]),
    );
    missing.queryRaw.mockImplementationOnce(() =>
      Promise.resolve([{ tenantId: TENANT_ID }]),
    );
    missing.queryRaw.mockImplementationOnce(() => Promise.resolve([]));
    await expect(missing.driver.revoke(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
