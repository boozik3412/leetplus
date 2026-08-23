import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshStoreScopeGuard } from './fresh-store-scope.guard';

const storeUser: AuthenticatedUser = {
  id: 'user-a1',
  email: 'user-a1@example.test',
  fullName: 'Store A1 user',
  role: UserRole.CLUB_ADMINISTRATOR,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'network-a',
  accessScope: 'STORES',
  allowedStoreIds: ['store-a1'],
};

describe('FreshStoreScopeGuard', () => {
  const resolve = jest.fn();
  const guard = new FreshStoreScopeGuard({ resolve } as never);

  beforeEach(() => {
    resolve.mockReset();
  });

  it.each([
    ['STORES A1', storeUser],
    [
      'NETWORK A',
      { ...storeUser, accessScope: 'NETWORK', allowedStoreIds: [] },
    ],
  ])(
    'allows %s only after fresh PostgreSQL authority accepts it',
    async (_label, user) => {
      resolve.mockResolvedValue({ tenantId: 'tenant-a' });

      await expect(guard.canActivate(context(user))).resolves.toBe(true);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(user);
    },
  );

  it('propagates a stale A1 to B1 scope denial', async () => {
    resolve.mockRejectedValue(
      new UnauthorizedException('Authorization scope is stale'),
    );

    await expect(guard.canActivate(context(storeUser))).rejects.toThrow(
      'Authorization scope is stale',
    );
  });

  it('rejects a request without an authenticated user before DB access', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolve).not.toHaveBeenCalled();
  });
});

function context(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}
