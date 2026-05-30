import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

type RequestWithUser = {
  user?: {
    role: UserRole;
    permissions?: string[];
  };
  method?: string;
  path?: string;
};

function createContext(request: RequestWithUser): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows route without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('allows user with matching role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(createContext({ user: { role: UserRole.OWNER } })),
    ).toBe(true);
  });

  it('rejects user without required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(createContext({ user: { role: UserRole.BUYER } })),
    ).toThrow(ForbiddenException);
  });

  it('allows custom role permissions for mapped route access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/marketing/campaigns',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_marketing'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects custom role without mapped route permission', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/marketing/campaigns',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
