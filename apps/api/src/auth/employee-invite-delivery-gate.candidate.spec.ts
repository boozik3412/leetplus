import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EmployeeInviteDeliveryGateCandidate,
  type EmployeeInviteDeliveryGateDormantPolicy,
  type EmployeeInviteDeliveryGateInput,
} from './employee-invite-delivery-gate.candidate';

const INPUT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  inviteId: '22222222-2222-4222-8222-222222222222',
  tokenHash: 'a'.repeat(64),
} satisfies EmployeeInviteDeliveryGateInput;

const ENABLED_POLICY = Object.freeze({
  enabled: true,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
}) satisfies EmployeeInviteDeliveryGateDormantPolicy;

type BoundaryMock = {
  $queryRaw: jest.Mock;
};

function boundary(): BoundaryMock {
  return { $queryRaw: jest.fn() };
}

function candidate(
  root = boundary(),
  policy: EmployeeInviteDeliveryGateDormantPolicy = ENABLED_POLICY,
) {
  return {
    boundary: root,
    gate: new EmployeeInviteDeliveryGateCandidate(root, policy),
  };
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
    error instanceof ServiceUnavailableException ||
    error instanceof UnauthorizedException
  ) {
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>).reasonCode
      : null;
  }
  return null;
}

async function rejectionOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

describe('EmployeeInviteDeliveryGateCandidate', () => {
  it('is dormant by default and absent from the canonical AuthModule', async () => {
    const target = candidate(boundary(), {
      enabled: false,
      executionMode: 'DORMANT_TEST_ONLY',
      environment: 'test',
    });

    const rejection = await rejectionOf(target.gate.assertSent(INPUT));
    expect(reasonCode(rejection)).toBe(
      'EMPLOYEE_INVITE_DELIVERY_ASSERTION_DORMANT',
    );
    expect(target.boundary.$queryRaw).not.toHaveBeenCalled();

    const authModule = readFileSync(join(__dirname, 'auth.module.ts'), 'utf8');
    const authService = readFileSync(
      join(__dirname, 'auth.service.ts'),
      'utf8',
    );
    expect(authModule).not.toContain('EmployeeInviteDeliveryGateCandidate');
    expect(authService).not.toContain('EmployeeInviteDeliveryGateCandidate');
  });

  it('fails closed in production even with an enabled candidate policy', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const target = candidate();
      const rejection = await rejectionOf(target.gate.assertSent(INPUT));
      expect(reasonCode(rejection)).toBe(
        'EMPLOYEE_INVITE_DELIVERY_ASSERTION_DORMANT',
      );
      expect(target.boundary.$queryRaw).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('admits only an exact true result from the parameterized CURRENT189 RPC', async () => {
    const target = candidate();
    target.boundary.$queryRaw.mockResolvedValue([{ sent: true }]);

    await expect(target.gate.assertSent(INPUT)).resolves.toBeUndefined();

    const query = (
      target.boundary.$queryRaw.mock.calls as unknown[][]
    )[0]?.[0] as Prisma.Sql | undefined;
    if (!query) {
      throw new Error('Expected a parameterized delivery assertion query');
    }
    expect(query.strings.join('')).toContain(
      'identity_employee_invite_delivery_assert_sent_current189_v1',
    );
    expect(query.values).toEqual([
      INPUT.tenantId,
      INPUT.inviteId,
      INPUT.tokenHash,
    ]);
  });

  it('fails closed without exposing identifiers when SENT evidence is absent', async () => {
    const target = candidate();
    target.boundary.$queryRaw.mockResolvedValue([{ sent: false }]);

    const rejection = await rejectionOf(target.gate.assertSent(INPUT));
    expect(reasonCode(rejection)).toBe('EMPLOYEE_INVITE_DELIVERY_NOT_SENT');
    const response = JSON.stringify(
      (rejection as UnauthorizedException).getResponse(),
    );
    expect(response).not.toContain(INPUT.tenantId);
    expect(response).not.toContain(INPUT.inviteId);
    expect(response).not.toContain(INPUT.tokenHash);
  });

  it.each([[[]], [[{ sent: 'true' }]], [[{ sent: true }, { sent: true }]]])(
    'fails closed for malformed RPC result %#',
    async (rows) => {
      const target = candidate();
      target.boundary.$queryRaw.mockResolvedValue(rows);
      const rejection = await rejectionOf(target.gate.assertSent(INPUT));
      expect(reasonCode(rejection)).toBe(
        'EMPLOYEE_INVITE_DELIVERY_ASSERTION_RESPONSE_INVALID',
      );
    },
  );

  it('rejects malformed internal bindings before reaching PostgreSQL', async () => {
    const target = candidate();
    const rejection = await rejectionOf(
      target.gate.assertSent({ ...INPUT, tokenHash: 'not-a-digest' }),
    );
    expect(reasonCode(rejection)).toBe(
      'EMPLOYEE_INVITE_DELIVERY_ASSERTION_INPUT_INVALID',
    );
    expect(target.boundary.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_BOUNDARY_NOT_ENROLLED'],
    ['42883', 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_BOUNDARY_NOT_ENROLLED'],
    ['40001', 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_RETRY_REQUIRED'],
    ['40P01', 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_RETRY_REQUIRED'],
  ])('maps SQLSTATE %s to a redacted reason', async (sqlState, reason) => {
    const target = candidate();
    target.boundary.$queryRaw.mockRejectedValue(rpcError(sqlState));
    const rejection = await rejectionOf(target.gate.assertSent(INPUT));
    expect(reasonCode(rejection)).toBe(reason);
    expect(JSON.stringify((rejection as Error).message)).not.toContain(
      'redacted database error',
    );
  });

  it('requires and uses the supplied interactive acceptance transaction', async () => {
    const target = candidate();
    const tx = boundary();
    tx.$queryRaw.mockResolvedValue([{ sent: true }]);

    await expect(
      target.gate.assertSentInTransaction(
        tx as unknown as Prisma.TransactionClient,
        INPUT,
      ),
    ).resolves.toBeUndefined();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(target.boundary.$queryRaw).not.toHaveBeenCalled();

    const root = {
      $queryRaw: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };
    const rejection = await rejectionOf(
      target.gate.assertSentInTransaction(
        root as unknown as Prisma.TransactionClient,
        INPUT,
      ),
    );
    expect(reasonCode(rejection)).toBe(
      'EMPLOYEE_INVITE_DELIVERY_ASSERTION_TRANSACTION_REQUIRED',
    );
    expect(root.$queryRaw).not.toHaveBeenCalled();
  });
});
