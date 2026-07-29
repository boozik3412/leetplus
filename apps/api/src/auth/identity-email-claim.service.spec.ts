import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IdentityEmailClaimType, Prisma } from '@prisma/client';
import {
  IdentityEmailClaimService,
  type IdentityEmailClaimTransaction,
} from './identity-email-claim.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'owner@example.test';
const HMAC_KEY = 'identity-fingerprint-unit-key-aaaaaaaaaaaaaaaa';

type ClaimTransactionMock = IdentityEmailClaimTransaction & {
  $queryRaw: jest.Mock;
};

function transaction(): ClaimTransactionMock {
  return {
    $queryRaw: jest.fn(),
  } as unknown as ClaimTransactionMock;
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

describe('IdentityEmailClaimService', () => {
  it('rejects a root Prisma client as a claim transaction', () => {
    expect(() =>
      service().bindTransaction({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      } as unknown as Prisma.TransactionClient),
    ).toThrow(ServiceUnavailableException);
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
    const tx = transaction();
    await expect(
      service().reserveInvite(tx, {
        email: 'K@example.test',
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('validates the fingerprint key before reserving identity state', async () => {
    const tx = transaction();
    await expect(
      service({}).reserveInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        subjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('reserves through the sealed RPC and never returns the canonical email', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
          operation: 'RESERVE_INVITE',
          decision: 'CREATED',
          claimType: 'INVITE',
          tenantId: TENANT_ID,
          subjectId: RESERVATION_ID,
          revision: 1,
        },
      },
    ]);

    const result = await service().reserveInvite(tx, {
      email: ' OWNER@EXAMPLE.TEST ',
      tenantId: TENANT_ID,
      subjectId: RESERVATION_ID,
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
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
    const query = (tx.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    if (!query) {
      throw new Error('Expected a parameterized identity claim query');
    }
    expect(query.strings.join('')).toContain(
      'identity_email_claim_reserve_invite_v1',
    );
    expect(query.values).toContain(EMAIL);
  });

  it('asserts before a caller creates the next identity subject', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([
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
      service().assertInvite(tx, {
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

  it('transitions only from INVITE with a new UUID subject', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
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
      service().transitionInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        expectedSubjectId: RESERVATION_ID,
        expectedRevision: 1,
        nextClaimType: IdentityEmailClaimType.USER,
        nextSubjectId: NEXT_SUBJECT_ID,
      }),
    ).resolves.toMatchObject({
      decision: 'TRANSITIONED',
      claimType: IdentityEmailClaimType.USER,
      revision: 2,
    });

    await expect(
      service().transitionInvite(tx, {
        email: EMAIL,
        tenantId: TENANT_ID,
        expectedSubjectId: RESERVATION_ID,
        expectedRevision: 1,
        nextClaimType: IdentityEmailClaimType.USER,
        nextSubjectId: RESERVATION_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('strictly rejects a receipt with an identity-bearing extra field', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([
      {
        receipt: {
          schemaVersion: 1,
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
      await service().reserveInvite(tx, {
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
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([
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
      service().assertInvite(tx, {
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
      const tx = transaction();
      tx.$queryRaw.mockRejectedValue(rpcError(sqlState));

      try {
        await service().releaseInvite(tx, {
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
      const tx = transaction();
      tx.$queryRaw.mockRejectedValue(conflict);

      try {
        await service().assertInvite(tx, {
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
