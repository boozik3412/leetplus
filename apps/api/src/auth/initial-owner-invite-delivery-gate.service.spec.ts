import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InitialOwnerInviteDeliveryGateService,
  type InitialOwnerInviteDeliveryGateInput,
} from './initial-owner-invite-delivery-gate.service';

const INPUT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  inviteId: '22222222-2222-4222-8222-222222222222',
  tokenHash: 'a'.repeat(64),
} satisfies InitialOwnerInviteDeliveryGateInput;

type BoundaryMock = {
  $queryRaw: jest.Mock;
};

function boundary(): BoundaryMock {
  return {
    $queryRaw: jest.fn(),
  };
}

function service(root = boundary()) {
  return {
    boundary: root,
    service: new InitialOwnerInviteDeliveryGateService(
      root as unknown as PrismaService,
    ),
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

describe('InitialOwnerInviteDeliveryGateService', () => {
  it('admits only an exact true result from the parameterized assertion RPC', async () => {
    const target = service();
    target.boundary.$queryRaw.mockResolvedValue([{ sent: true }]);

    await expect(target.service.assertSent(INPUT)).resolves.toBeUndefined();

    const query = (
      target.boundary.$queryRaw.mock.calls as unknown[][]
    )[0]?.[0] as Prisma.Sql | undefined;
    if (!query) {
      throw new Error('Expected a parameterized delivery assertion query');
    }
    expect(query.strings.join('')).toContain(
      'identity_initial_owner_invite_delivery_assert_sent_v1',
    );
    expect(query.values).toEqual([
      INPUT.tenantId,
      INPUT.inviteId,
      INPUT.tokenHash,
    ]);
  });

  it('fails closed without exposing identifiers when SENT evidence is absent', async () => {
    const target = service();
    target.boundary.$queryRaw.mockResolvedValue([{ sent: false }]);

    let rejection: unknown;
    try {
      await target.service.assertSent(INPUT);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(UnauthorizedException);
    expect(reasonCode(rejection)).toBe(
      'INITIAL_OWNER_INVITE_DELIVERY_NOT_SENT',
    );
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
      const target = service();
      target.boundary.$queryRaw.mockResolvedValue(rows);

      const rejection = await rejectionOf(target.service.assertSent(INPUT));
      expect(rejection).toBeInstanceOf(ServiceUnavailableException);
      expect(reasonCode(rejection)).toBe(
        'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_RESPONSE_INVALID',
      );
    },
  );

  it('maps a missing runtime grant to a bounded not-enrolled response', async () => {
    const target = service();
    target.boundary.$queryRaw.mockRejectedValue(rpcError('42501'));

    const rejection = await rejectionOf(target.service.assertSent(INPUT));
    expect(rejection).toBeInstanceOf(ServiceUnavailableException);
    expect(reasonCode(rejection)).toBe(
      'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_BOUNDARY_NOT_ENROLLED',
    );
  });

  it('maps transaction retry failures without leaking database details', async () => {
    const target = service();
    target.boundary.$queryRaw.mockRejectedValue(rpcError('40001'));

    const rejection = await rejectionOf(target.service.assertSent(INPUT));
    expect(rejection).toBeInstanceOf(ConflictException);
    expect(reasonCode(rejection)).toBe(
      'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_RETRY_REQUIRED',
    );
  });

  it('uses the supplied interactive transaction for the acceptance recheck', async () => {
    const target = service();
    const tx = boundary();
    tx.$queryRaw.mockResolvedValue([{ sent: true }]);

    await expect(
      target.service.assertSentInTransaction(
        tx as unknown as Prisma.TransactionClient,
        INPUT,
      ),
    ).resolves.toBeUndefined();

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(target.boundary.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a root Prisma client in place of an acceptance transaction', async () => {
    const target = service();
    const root = {
      $queryRaw: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const rejection = await rejectionOf(
      target.service.assertSentInTransaction(
        root as unknown as Prisma.TransactionClient,
        INPUT,
      ),
    );
    expect(rejection).toBeInstanceOf(ServiceUnavailableException);
    expect(reasonCode(rejection)).toBe(
      'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_TRANSACTION_REQUIRED',
    );
    expect(root.$queryRaw).not.toHaveBeenCalled();
  });
});
