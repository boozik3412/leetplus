import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IdentityEmailClaimType, Prisma } from '@prisma/client';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
  type IdentityEmailClaimTransaction,
  type IdentityEmailClaimTransactionHost,
} from './identity-email-claim.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'owner@example.test';
const HMAC_KEY = 'identity-fingerprint-unit-key-aaaaaaaaaaaaaaaa';
const LOCAL_64 = 'l'.repeat(64);
const LOCAL_65 = 'l'.repeat(65);
const LABEL_63 = 'd'.repeat(63);
const LABEL_64 = 'd'.repeat(64);
const DOMAIN_253 = [63, 63, 63, 61]
  .map((length) => 'd'.repeat(length))
  .join('.');
const DOMAIN_254 = [63, 63, 63, 62]
  .map((length) => 'd'.repeat(length))
  .join('.');
const DOMAIN_256 = [63, 63, 63, 61, 2]
  .map((length) => 'd'.repeat(length))
  .join('.');

type ClaimTransactionClientMock = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
> & {
  $queryRaw: jest.Mock;
};

const TRANSACTION_SETTINGS = {
  isolationLevel: 'read committed',
  readOnly: 'off',
  statementTimeout: '25s',
  lockTimeout: '5s',
} as const;

function transactionClient(): ClaimTransactionClientMock {
  return {
    $queryRaw: jest.fn(),
  } as ClaimTransactionClientMock;
}

async function lockedTransaction(
  boundary: IdentityEmailClaimService,
  tenantId = TENANT_ID,
): Promise<{
  client: ClaimTransactionClientMock;
  tx: IdentityEmailClaimTransaction;
}> {
  const client = transactionClient();
  client.$queryRaw
    .mockResolvedValueOnce([TRANSACTION_SETTINGS])
    .mockResolvedValueOnce([{ tenantId, backendPid: 12_345 }]);
  const tx = await boundary.lockTenantTransaction(
    client as Prisma.TransactionClient,
    tenantId,
  );
  client.$queryRaw.mockClear();
  return { client, tx };
}

function service(
  values: Record<string, string | undefined> = {
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: HMAC_KEY,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
  },
) {
  return new IdentityEmailClaimService({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

function rpcError(sqlState: string) {
  return new Prisma.PrismaClientKnownRequestError('redacted database error', {
    code: 'P2010',
    clientVersion: '6.19.3',
    meta: { code: sqlState },
  });
}

function reasonCode(error: unknown): unknown {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ServiceUnavailableException
  ) {
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>).reasonCode
      : null;
  }
  return null;
}

function httpResponse(error: unknown): unknown {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ServiceUnavailableException
  ) {
    return error.getResponse();
  }
  return error;
}

function mockCalls(mock: { mock: { calls: unknown } }): unknown[][] {
  if (!Array.isArray(mock.mock.calls)) {
    throw new Error('Expected Jest mock calls');
  }
  return mock.mock.calls as unknown[][];
}

describe('IdentityEmailClaimService', () => {
  it('rejects a root Prisma client as a claim transaction', async () => {
    await expect(
      service().lockTenantTransaction(
        {
          $connect: jest.fn(),
          $disconnect: jest.fn(),
        } as unknown as Prisma.TransactionClient,
        TENANT_ID,
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_CLAIM_TRANSACTION_REQUIRED',
      },
    });
  });

  it('prearms exact transaction settings before the canonical tenant advisory lock', async () => {
    const boundary = service();
    const client = transactionClient();
    client.$queryRaw
      .mockResolvedValueOnce([TRANSACTION_SETTINGS])
      .mockResolvedValueOnce([{ tenantId: TENANT_ID, backendPid: 12_345 }]);

    const tx = await boundary.lockTenantTransaction(
      client as Prisma.TransactionClient,
      TENANT_ID,
    );

    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx.tenantId).toBe(TENANT_ID);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
    const settingsQuery = mockCalls(client.$queryRaw)[0]?.[0] as
      | Prisma.Sql
      | undefined;
    const lockQuery = mockCalls(client.$queryRaw)[1]?.[0] as
      | Prisma.Sql
      | undefined;
    expect(settingsQuery?.strings.join('')).toContain(
      "current_setting('transaction_isolation')",
    );
    expect(settingsQuery?.strings.join('')).toContain(
      "current_setting('transaction_read_only')",
    );
    expect(settingsQuery?.strings.join('')).toContain(
      "set_config(\n              'statement_timeout'",
    );
    expect(settingsQuery?.strings.join('')).toContain(
      "set_config(\n              'lock_timeout'",
    );
    expect(settingsQuery?.values).toEqual(['25s', '5s']);
    expect(lockQuery?.strings.join('')).toContain(
      'WITH tenant_lock AS MATERIALIZED',
    );
    expect(lockQuery?.strings.join('')).toContain(
      'pg_catalog.pg_advisory_xact_lock',
    );
    expect(lockQuery?.strings.join('')).toContain(
      'pg_catalog.hashtextextended',
    );
    expect(lockQuery?.values).toEqual([
      'leetplus:identity-mail-tenant:v1:',
      TENANT_ID,
      180,
      TENANT_ID,
    ]);
  });

  it('fails closed before advisory acquisition when transaction settings are not exact', async () => {
    const boundary = service();
    const client = transactionClient();
    client.$queryRaw.mockResolvedValueOnce([
      { ...TRANSACTION_SETTINGS, isolationLevel: 'serializable' },
    ]);

    await expect(
      boundary.lockTenantTransaction(
        client as Prisma.TransactionClient,
        TENANT_ID,
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_CLAIM_TRANSACTION_REQUIRED',
      },
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['40001', '40P01', '55P03', '57014'] as const)(
    'runs with exact Read Committed bounds, retries %s once and returns a typed terminal conflict',
    async (sqlState) => {
      const boundary = service();
      const clients = [transactionClient(), transactionClient()];
      for (const client of clients) {
        client.$queryRaw
          .mockResolvedValueOnce([TRANSACTION_SETTINGS])
          .mockResolvedValueOnce([{ tenantId: TENANT_ID, backendPid: 12_345 }]);
      }
      const transactionHost = jest.fn<
        Promise<unknown>,
        [
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: typeof IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
        ]
      >(async (operation, options) => {
        expect(options).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
        const client = clients.shift();
        if (!client) {
          throw new Error('Unexpected third transaction attempt');
        }
        return operation(client as Prisma.TransactionClient);
      });
      const host = {
        $transaction: transactionHost,
      } as unknown as IdentityEmailClaimTransactionHost;
      const operation = jest.fn().mockRejectedValue(rpcError(sqlState));

      await expect(
        boundary.runTenantTransaction(host, TENANT_ID, operation),
      ).rejects.toMatchObject({
        response: {
          reasonCode: 'IDENTITY_CLAIM_RETRY_REQUIRED',
        },
      });

      expect(transactionHost).toHaveBeenCalledTimes(2);
      for (const call of mockCalls(transactionHost)) {
        expect(call[1]).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
      }
      expect(operation).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    new ConflictException({
      message: 'Identity email is unavailable',
      reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
    }),
    new BadRequestException({
      message: 'Identity email is invalid',
      reasonCode: 'IDENTITY_EMAIL_INVALID',
    }),
  ])('does not retry a non-retryable domain error', async (domainError) => {
    const boundary = service();
    const transactionHost = jest.fn().mockRejectedValue(domainError);
    const host = {
      $transaction: transactionHost,
    } as unknown as IdentityEmailClaimTransactionHost;
    const operation = jest.fn();

    await expect(
      boundary.runTenantTransaction(host, TENANT_ID, operation),
    ).rejects.toBe(domainError);
    expect(transactionHost).toHaveBeenCalledTimes(1);
    expect(mockCalls(transactionHost)[0]?.[1]).toEqual(
      IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects a tenant-bound brand when a command targets another tenant', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);

    await expect(
      boundary.reserveInvite(tx, {
        email: EMAIL,
        tenantId: OTHER_TENANT_ID,
        subjectId: RESERVATION_ID,
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_CLAIM_TRANSACTION_REQUIRED',
      },
    });
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('creates the same domain-separated fingerprint for case and space variants', () => {
    const boundary = service();
    const lower = boundary.fingerprint(EMAIL);
    const variant = boundary.fingerprint('  OWNER@EXAMPLE.TEST  ');

    expect(variant).toEqual(lower);
    expect(lower.keyVersion).toBe('v1');
    expect(lower.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(lower)).not.toContain(EMAIL);
  });

  it.each([
    ['numeric top-level label', 'owner@example.123'],
    ['64-byte local part', `${LOCAL_64}@example.test`],
    ['63-byte domain label', `owner@${LABEL_63}.test`],
    ['253-byte domain', `owner@${DOMAIN_253}`],
  ])('fingerprints the valid producer boundary: %s', (_label, email) => {
    const result = service().fingerprint(email);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.keyVersion).toBe('v1');
  });

  it('fails closed when the dedicated fingerprint key contract is absent', () => {
    expect(() => service({}).fingerprint(EMAIL)).toThrow(
      ServiceUnavailableException,
    );
    try {
      service({
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: 'short',
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
      }).fingerprint(EMAIL);
      throw new Error('Expected fingerprint key rejection');
    } catch (error) {
      expect(reasonCode(error)).toBe(
        'IDENTITY_EMAIL_FINGERPRINT_KEY_UNAVAILABLE',
      );
    }
  });

  it('rejects non-ASCII input before Unicode case folding', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    await expect(
      boundary.reserveInvite(tx, {
        email: 'K@example.test',
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['address list', 'owner@example.test,attacker@example.test'],
    ['semicolon-delimited list', 'owner@example.test;attacker@example.test'],
    ['display name', 'Owner <owner@example.test>'],
    ['quoted display name', '"Owner" <owner@example.test>'],
    ['quoted local part', '"owner"@example.test'],
    [
      'CRLF header injection',
      'owner@example.test\r\nBcc:attacker@example.test',
    ],
    ['line feed', 'owner@example.test\n'],
    ['tab', 'owner\t@example.test'],
    ['non-breaking space', 'owner\u00a0@example.test'],
    ['Unicode', 'владелец@example.test'],
    ['leading local dot', '.owner@example.test'],
    ['trailing local dot', 'owner.@example.test'],
    ['consecutive local dots', 'owner..beta@example.test'],
    ['leading domain hyphen', 'owner@-example.test'],
    ['trailing domain hyphen', 'owner@example-.test'],
    ['empty domain label', 'owner@example..test'],
    ['65-byte local part', `${LOCAL_65}@example.test`],
    ['64-byte domain label', `owner@${LABEL_64}.test`],
    ['254-byte domain', `owner@${DOMAIN_254}`],
    ['321-byte mailbox', `${LOCAL_64}@${DOMAIN_256}`],
  ])(
    'rejects the invalid producer boundary before reserving: %s',
    async (_label, email) => {
      const boundary = service();
      const { client, tx } = await lockedTransaction(boundary);
      await expect(
        boundary.reserveInvite(tx, {
          email,
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('validates the fingerprint key before reserving identity state', async () => {
    const unavailableBoundary = service({});
    const { client, tx } = await lockedTransaction(unavailableBoundary);
    await expect(
      unavailableBoundary.reserveInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('reserves through the sealed RPC and never returns the canonical email', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 2,
          operation: 'RESERVE_INVITE',
          decision: 'CREATED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          revision: 1,
        },
      },
    ]);

    const result = await boundary.reserveInvite(tx, {
      email: ' OWNER@EXAMPLE.TEST ',
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
    });

    expect(result).toMatchObject({
      schemaVersion: 2,
      operation: 'RESERVE_INVITE',
      decision: 'CREATED',
      claimType: IdentityEmailClaimType.INVITE,
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
      revision: 1,
      keyVersion: 'v1',
    });
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    const query = (client.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    if (!query) {
      throw new Error('Expected a parameterized identity claim query');
    }
    expect(query.strings.join('')).toContain(
      'identity_email_claim_reserve_invite_v2',
    );
    expect(query.values).toContain(EMAIL);
  });

  it('asserts before a caller creates the next identity subject', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
          operation: 'ASSERT_INVITE',
          decision: 'MATCHED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          revision: 1,
        },
      },
    ]);

    await expect(
      boundary.assertInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
        expectedRevision: 1,
      }),
    ).resolves.toMatchObject({
      operation: 'ASSERT_INVITE',
      decision: 'MATCHED',
    });
  });

  it('asserts an exact invite through the PII-free activation locator', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
          operation: 'ASSERT_INVITE_LOCATOR',
          decision: 'MATCHED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          workflowLocator: RESERVATION_ID,
          revision: 1,
        },
      },
    ]);

    const result = await boundary.assertInviteLocator(tx, {
      workflowLocator: RESERVATION_ID,
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
      expectedRevision: 1,
    });

    expect(result).toEqual({
      schemaVersion: 1,
      operation: 'ASSERT_INVITE_LOCATOR',
      decision: 'MATCHED',
      claimType: IdentityEmailClaimType.INVITE,
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
      workflowLocator: RESERVATION_ID,
      revision: 1,
    });
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    const query = (client.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    expect(query?.strings.join('')).toContain(
      'identity_email_claim_assert_invite_locator_v1',
    );
    expect(query?.values).not.toContain(EMAIL);
  });

  it('rejects a locator receipt with an undeclared identity-bearing field', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
          operation: 'ASSERT_INVITE_LOCATOR',
          decision: 'MATCHED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          workflowLocator: RESERVATION_ID,
          revision: 1,
          emailCanonical: EMAIL,
        },
      },
    ]);

    await expect(
      boundary.assertInviteLocator(tx, {
        workflowLocator: RESERVATION_ID,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_CLAIM_RECEIPT_INVALID',
      },
    });
  });

  it('transitions only from INVITE with a new UUID subject', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 2,
          operation: 'TRANSITION_INVITE',
          decision: 'TRANSITIONED',
          claimType: 'USER',
          tenantId: TENANT_ID,
          subjectId: NEXT_SUBJECT_ID,
          revision: 2,
        },
      },
    ]);

    await expect(
      boundary.transitionInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        expectedSubjectId: RESERVATION_ID,
        expectedRevision: 1,
        nextClaimType: IdentityEmailClaimType.USER,
        nextSubjectId: NEXT_SUBJECT_ID,
      }),
    ).resolves.toMatchObject({
      schemaVersion: 2,
      decision: 'TRANSITIONED',
      claimType: IdentityEmailClaimType.USER,
      revision: 2,
    });
    const query = (client.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    expect(query?.strings.join('')).toContain(
      'identity_email_claim_transition_v2',
    );

    await expect(
      boundary.transitionInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        expectedSubjectId: RESERVATION_ID,
        expectedRevision: 1,
        nextClaimType: IdentityEmailClaimType.USER,
        nextSubjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases through the retained-history v2 boundary', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 2,
          operation: 'RELEASE_INVITE',
          decision: 'RELEASED',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          releasedRevision: 2,
        },
      },
    ]);

    await expect(
      boundary.releaseInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        expectedSubjectId: RESERVATION_ID,
        expectedRevision: 2,
      }),
    ).resolves.toEqual({
      schemaVersion: 2,
      operation: 'RELEASE_INVITE',
      decision: 'RELEASED',
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
      releasedRevision: 2,
    });
    const query = (client.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    expect(query?.strings.join('')).toContain(
      'identity_email_claim_release_v2',
    );
  });

  it('strictly rejects a receipt with an identity-bearing extra field', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 2,
          operation: 'RESERVE_INVITE',
          decision: 'CREATED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          revision: 1,
          emailCanonical: EMAIL,
        },
      },
    ]);

    try {
      await boundary.reserveInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
      });
      throw new Error('Expected invalid receipt');
    } catch (error) {
      expect(reasonCode(error)).toBe('IDENTITY_CLAIM_RECEIPT_INVALID');
      expect(JSON.stringify(httpResponse(error))).not.toContain(EMAIL);
    }
  });

  it('rejects receipts that do not match the exact command identity', async () => {
    const boundary = service();
    const { client, tx } = await lockedTransaction(boundary);
    client.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
          operation: 'ASSERT_INVITE',
          decision: 'MATCHED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: NEXT_SUBJECT_ID,
          revision: 1,
        },
      },
    ]);

    await expect(
      boundary.assertInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_CLAIM_RECEIPT_INVALID',
      },
    });
  });

  for (const [sqlState, expectedReasonCode] of [
    ['22023', 'IDENTITY_EMAIL_INVALID'],
    ['23505', 'IDENTITY_EMAIL_UNAVAILABLE'],
    ['23503', 'IDENTITY_CLAIM_PRECONDITION_FAILED'],
    ['23514', 'IDENTITY_CLAIM_STATE_MISMATCH'],
    ['42501', 'IDENTITY_CLAIM_BOUNDARY_NOT_ENROLLED'],
    ['XX000', 'IDENTITY_CLAIM_BOUNDARY_UNAVAILABLE'],
  ] as const) {
    it(`maps PostgreSQL ${sqlState} to a redacted domain error`, async () => {
      const boundary = service();
      const { client, tx } = await lockedTransaction(boundary);
      client.$queryRaw.mockRejectedValue(rpcError(sqlState));

      try {
        await boundary.releaseInvite(tx, {
          email: EMAIL,
          tenantId: TENANT_ID,
          expectedSubjectId: RESERVATION_ID,
          expectedRevision: 1,
        });
        throw new Error('Expected boundary rejection');
      } catch (error) {
        expect(reasonCode(error)).toBe(expectedReasonCode);
        const response = httpResponse(error);
        expect(JSON.stringify(response)).not.toContain(EMAIL);
        expect(JSON.stringify(response)).not.toContain(
          'redacted database error',
        );
      }
    });
  }

  it('maps serialization conflicts to an explicit retry decision', async () => {
    const conflicts = [
      new Prisma.PrismaClientKnownRequestError('serialization detail', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
      rpcError('40001'),
      rpcError('40P01'),
      Object.assign(new Error('structural Prisma serialization detail'), {
        code: 'P2010',
        meta: { code: '40001' },
      }),
      Object.assign(new Error('direct serialization detail'), {
        code: '40001',
      }),
    ];

    for (const conflict of conflicts) {
      const boundary = service();
      const { client, tx } = await lockedTransaction(boundary);
      client.$queryRaw.mockRejectedValue(conflict);

      try {
        await boundary.assertInvite(tx, {
          email: EMAIL,
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          expectedRevision: 1,
        });
        throw new Error('Expected retry rejection');
      } catch (error) {
        expect(reasonCode(error)).toBe('IDENTITY_CLAIM_RETRY_REQUIRED');
        expect(JSON.stringify(httpResponse(error))).not.toContain(
          'serialization detail',
        );
      }
    }
  });
});
