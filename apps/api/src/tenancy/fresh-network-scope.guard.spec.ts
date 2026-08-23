import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshNetworkScopeGuard } from './fresh-network-scope.guard';

const networkUser: AuthenticatedUser = {
  id: 'network-user',
  email: 'network-user@example.test',
  fullName: 'Network user',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

describe('FreshNetworkScopeGuard', () => {
  const assertNetwork = jest.fn();
  const guard = new FreshNetworkScopeGuard({
    assertNetwork,
  } as never);

  beforeEach(() => {
    assertNetwork.mockReset();
  });

  it('allows only after the fresh database authority accepts NETWORK', async () => {
    assertNetwork.mockResolvedValue({ tenantId: 'tenant-a', mode: 'NETWORK' });

    await expect(guard.canActivate(context(networkUser))).resolves.toBe(true);
    expect(assertNetwork).toHaveBeenCalledTimes(1);
    expect(assertNetwork).toHaveBeenCalledWith(networkUser);
  });

  it('propagates a fresh STORES denial', async () => {
    assertNetwork.mockRejectedValue(
      new ForbiddenException('Network access is required'),
    );

    await expect(
      guard.canActivate(context(networkUser)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request without an authenticated user before database access', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(assertNetwork).not.toHaveBeenCalled();
  });
});

function context(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}
