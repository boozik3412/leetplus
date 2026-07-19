import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { STRICT_ROLES_KEY } from './strict-roles.decorator';
import { StrictRolesGuard } from './strict-roles.guard';

function createContext(role?: UserRole): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? {
              role,
              permissions: ['manage_guest_game_rules'],
            }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('StrictRolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: StrictRolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new StrictRolesGuard(reflector as unknown as Reflector);
  });

  it('does not affect endpoints without strict role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext(UserRole.MARKETER))).toBe(true);
  });

  it.each([UserRole.OWNER, UserRole.ADMIN])(
    'allows the exact privileged role %s',
    (role) => {
      reflector.getAllAndOverride.mockImplementation((key) =>
        key === STRICT_ROLES_KEY ? [UserRole.OWNER, UserRole.ADMIN] : undefined,
      );

      expect(guard.canActivate(createContext(role))).toBe(true);
    },
  );

  it.each([UserRole.MANAGER, UserRole.MARKETER, UserRole.CLUB_MANAGER])(
    'denies %s even with manage_guest_game_rules capability',
    (role) => {
      reflector.getAllAndOverride.mockReturnValue([
        UserRole.OWNER,
        UserRole.ADMIN,
      ]);

      expect(() => guard.canActivate(createContext(role))).toThrow(
        ForbiddenException,
      );
    },
  );
});
