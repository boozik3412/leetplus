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

  it('allows staff-control filter options through staff access only', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests/staff-control/filter-options',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('keeps general guest filter options behind guest access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests/filter-options',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows custom role to view Guest Game Hub without full guest CRM access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests/gamification/workspace',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_guest_gamification'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('allows communications access without full staff access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/team-chat',
          user: {
            role: UserRole.MARKETER,
            permissions: ['view_communications'],
          },
        }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/notifications',
          user: {
            role: UserRole.MARKETER,
            permissions: ['view_communications'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('keeps other staff pages behind staff access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/tasks',
          user: {
            role: UserRole.MARKETER,
            permissions: ['view_communications'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows custom roles to open only selected staff subsections', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/tasks',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff_tasks'],
          },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/salary',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff_tasks'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('maps assortment routes to granular report capabilities', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/products',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_assortment_products'],
          },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/reports/oos',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_assortment_products'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps CRM contact tasks behind guest access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests/crm/tasks',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_communications'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps Guest Game Hub reward redemption behind reward approval permission', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/guests/gamification/rewards/redeem',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['approve_guest_game_rewards'],
          },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/guests/gamification/rewards/redeem',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_guest_gamification'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows managers when user access route metadata includes them', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.STANDARDS_MANAGER,
    ]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/users',
          user: { role: UserRole.MANAGER },
        }),
      ),
    ).toBe(true);
  });

  it('does not open user access routes through custom manage_users alone', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.STANDARDS_MANAGER,
    ]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/users',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['manage_users'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
