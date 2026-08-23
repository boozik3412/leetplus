import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  GuestPortalTenantRevokeCurrent190Coordinator,
  isGuestPortalTenantRevokeCurrent190AmbiguousFailure,
  type GuestPortalTenantRevokeCurrent190AdminAuthority,
  type GuestPortalTenantRevokeCurrent190BatchInput,
  type GuestPortalTenantRevokeCurrent190BatchReceipt,
  type GuestPortalTenantRevokeCurrent190Driver,
} from './guest-portal-current190-tenant-revoke.coordinator';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const secret = 's'.repeat(64);
const completedAt = new Date('2026-08-05T12:00:00.000Z');

const actor: AuthenticatedUser = {
  id: actorId,
  email: 'platform-admin@integration.invalid',
  role: UserRole.ADMIN,
  tenantId: 'platform',
  tenantSlug: 'platform',
  isActive: true,
  isPlatformAdmin: true,
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

const policy = {
  enabled: true,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
  lostResponseRetries: 1 as const,
};

describe('GuestPortalTenantRevokeCurrent190Coordinator', () => {
  it('classifies Prisma connection loss as an ambiguous response', () => {
    expect(
      isGuestPortalTenantRevokeCurrent190AmbiguousFailure({ code: 'P1001' }),
    ).toBe(true);
  });

  it('is dormant by default and performs no database call', async () => {
    const driver = mockDriver();
    const coordinator = new GuestPortalTenantRevokeCurrent190Coordinator(
      driver,
      mockAuthority(),
      secret,
    );

    await expect(
      coordinator.revokeTenant(actor, tenantId, command()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(driver.revokeBatch.mock.calls).toHaveLength(0);
  });

  it('drains deterministic batches and returns only PII-free terminal counts', async () => {
    const driver = mockDriver();
    driver.revokeBatch
      .mockImplementationOnce((input) =>
        Promise.resolve(receipt(input, 1, 500, 3n)),
      )
      .mockImplementationOnce((input) =>
        Promise.resolve(receipt(input, 2, 3, 0n, false, 503n)),
      );
    const coordinator = enabledCoordinator(driver);

    const result = await coordinator.revokeTenant(
      actor,
      tenantId,
      command({ batchLimit: 500 }),
    );

    expect(result).toEqual({
      ok: true,
      contractVersion: 'GUEST_PORTAL_TENANT_REVOKE_CURRENT190_V1',
      tenantId,
      fenceStatus: 'CLOSED',
      fenceVersion: 1,
      batchCount: 2,
      totalRevokedCount: '503',
      remainingActiveCount: '0',
      replayedBatchCount: 0,
      completedAt: completedAt.toISOString(),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('platform-admin');
    expect(serialized).not.toContain(secret);
    expect(driver.revokeBatch.mock.calls).toHaveLength(2);
  });

  it('uses the same exact batch identity after an ambiguous lost response', async () => {
    const driver = mockDriver();
    driver.revokeBatch
      .mockRejectedValueOnce({ code: 'P1001' })
      .mockImplementationOnce(() => {
        const firstInput = driver.revokeBatch.mock.calls[0]?.[0];
        if (!firstInput) {
          return Promise.reject(new Error('missing first revoke input'));
        }
        return Promise.resolve(receipt(firstInput, 1, 0, 0n, true));
      });

    const result = await enabledCoordinator(driver).revokeTenant(
      actor,
      tenantId,
      command(),
    );

    expect(result.replayedBatchCount).toBe(1);
    expect(driver.revokeBatch.mock.calls).toHaveLength(2);
    expect(driver.revokeBatch.mock.calls[1]?.[0]).toEqual(
      driver.revokeBatch.mock.calls[0]?.[0],
    );
  });

  it('derives stable batch IDs and digests across process-local replays', async () => {
    const firstDriver = mockDriver();
    const secondDriver = mockDriver();
    firstDriver.revokeBatch.mockImplementation((input) =>
      Promise.resolve(receipt(input, 1, 0, 0n)),
    );
    secondDriver.revokeBatch.mockImplementation((input) =>
      Promise.resolve(receipt(input, 1, 0, 0n, true)),
    );

    await enabledCoordinator(firstDriver).revokeTenant(
      actor,
      tenantId,
      command(),
    );
    await enabledCoordinator(secondDriver).revokeTenant(
      actor,
      tenantId,
      command(),
    );

    expect(secondDriver.revokeBatch.mock.calls[0]?.[0]).toEqual(
      firstDriver.revokeBatch.mock.calls[0]?.[0],
    );
  });

  it('fails closed when the bounded continuation limit is exhausted', async () => {
    const driver = mockDriver();
    driver.revokeBatch.mockImplementation((input) =>
      Promise.resolve(receipt(input, 1, 1, 1n)),
    );

    await expect(
      enabledCoordinator(driver).revokeTenant(
        actor,
        tenantId,
        command({ batchLimit: 1, maxBatches: 1 }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(driver.revokeBatch.mock.calls).toHaveLength(1);
  });

  it.each<[string, Record<string, unknown>]>([
    ['wrong batch id', { batchId: tenantId }],
    ['wrong sequence', { batchSequence: 2 }],
    ['wrong total', { totalRevokedCount: 99n }],
    ['closed with remaining sessions', { remainingActiveCount: 1n }],
    ['expanded receipt', { secret: 'no' }],
  ])('rejects %s in the database receipt', async (_label, override) => {
    const driver = mockDriver();
    driver.revokeBatch.mockImplementation((input) =>
      Promise.resolve({
        ...receipt(input, 1, 0, 0n),
        ...override,
      }),
    );

    await expect(
      enabledCoordinator(driver).revokeTenant(actor, tenantId, command()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a non-platform actor before database access', async () => {
    const driver = mockDriver();
    await expect(
      enabledCoordinator(driver).revokeTenant(
        { ...actor, isPlatformAdmin: false },
        tenantId,
        command(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(driver.revokeBatch.mock.calls).toHaveLength(0);
  });

  it('rejects stale platform authority before the revoke driver', async () => {
    const driver = mockDriver();
    const authority = mockAuthority();
    authority.assertFreshPlatformAdmin.mockRejectedValueOnce(
      new ForbiddenException('stale'),
    );

    await expect(
      enabledCoordinator(driver, authority).revokeTenant(
        actor,
        tenantId,
        command(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(driver.revokeBatch.mock.calls).toHaveLength(0);
  });

  it.each([
    [{ confirmation: 'REVOKE' }, 'confirmation'],
    [{ requestId: 'not-a-uuid' }, 'request id'],
    [{ reason: 'short' }, 'reason'],
    [{ batchLimit: 501 }, 'batch limit'],
    [{ maxBatches: 0 }, 'max batches'],
    [{ unexpected: true }, 'expanded command'],
  ])('rejects invalid %s before database access', async (override) => {
    const driver = mockDriver();
    await expect(
      enabledCoordinator(driver).revokeTenant(
        actor,
        tenantId,
        command(override),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(driver.revokeBatch.mock.calls).toHaveLength(0);
  });
});

function enabledCoordinator(
  driver: jest.Mocked<GuestPortalTenantRevokeCurrent190Driver>,
  authority = mockAuthority(),
) {
  return new GuestPortalTenantRevokeCurrent190Coordinator(
    driver,
    authority,
    secret,
    policy,
  );
}

function mockAuthority(): jest.Mocked<GuestPortalTenantRevokeCurrent190AdminAuthority> {
  return {
    assertFreshPlatformAdmin: jest.fn().mockResolvedValue({
      userId: actorId,
      active: true,
      platformAdmin: true,
    }),
  };
}

function mockDriver(): jest.Mocked<GuestPortalTenantRevokeCurrent190Driver> {
  return { revokeBatch: jest.fn() };
}

function command(override: Record<string, unknown> = {}) {
  return {
    requestId,
    reason: 'Controlled tenant suspension and guest-session offboarding',
    confirmation: `REVOKE GUEST SESSIONS ${tenantId}`,
    batchLimit: 100,
    maxBatches: 10,
    ...override,
  };
}

function receipt(
  input: GuestPortalTenantRevokeCurrent190BatchInput,
  batchSequence: number,
  revokedCount: number,
  remainingActiveCount: bigint,
  replayed = false,
  totalRevokedCount = BigInt(revokedCount),
): GuestPortalTenantRevokeCurrent190BatchReceipt {
  return {
    batchId: input.proposedBatchId,
    fenceVersion: 1,
    batchSequence,
    fenceStatus: remainingActiveCount === 0n ? 'CLOSED' : 'DRAINING',
    revokedCount,
    remainingActiveCount,
    totalRevokedCount,
    batchCompletedAt: completedAt,
    replayed,
  };
}
