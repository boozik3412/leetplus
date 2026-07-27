import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { resolveUserCapabilities } from './capabilities';
import { RolesGuard } from './roles.guard';

type RequestWithUser = {
  user?: {
    role: UserRole;
    customRoleId?: string | null;
    hasRoleOverride?: boolean;
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
    get: jest.Mock;
    getAllAndOverride: jest.Mock;
  };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      get: jest.fn(),
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

  it('does not let a custom role fall back to its base role on an unmapped route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MARKETER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/unmapped-module',
          user: {
            role: UserRole.MARKETER,
            customRoleId: 'custom-role-1',
            permissions: ['view_dashboard'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not let a standard buyer role bypass guest capabilities', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.BUYER,
      UserRole.MARKETER,
      UserRole.CLUB_MANAGER,
    ]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests',
          user: {
            role: UserRole.BUYER,
            permissions: resolveUserCapabilities({ role: UserRole.BUYER }),
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires the dashboard capability from every authenticated role', () => {
    reflector.getAllAndOverride.mockReturnValue(Object.values(UserRole));

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/dashboard/summary',
          user: {
            role: UserRole.TRAINEE,
            permissions: resolveUserCapabilities({ role: UserRole.TRAINEE }),
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/dashboard/summary',
          user: {
            role: UserRole.BUYER,
            permissions: resolveUserCapabilities({ role: UserRole.BUYER }),
          },
        }),
      ),
    ).toBe(true);
  });

  it('keeps trainee access outside the assortment boundary', () => {
    reflector.getAllAndOverride.mockReturnValue(Object.values(UserRole));
    const permissions = resolveUserCapabilities({ role: UserRole.TRAINEE });

    expect(permissions).not.toContain('view_assortment_products');
    expect(permissions).not.toContain('view_assortment_stores');
    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/products',
          user: { role: UserRole.TRAINEE, permissions },
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/stores',
          user: { role: UserRole.TRAINEE, permissions },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not let a standard marketer role bypass guest export capability', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.BUYER,
      UserRole.MARKETER,
      UserRole.CLUB_MANAGER,
    ]);
    const permissions = resolveUserCapabilities({ role: UserRole.MARKETER });

    expect(permissions).toContain('view_guests');
    expect(permissions).not.toContain('export_guests');
    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests',
          user: {
            role: UserRole.MARKETER,
            permissions,
          },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/guests/export',
          user: {
            role: UserRole.MARKETER,
            permissions,
          },
        }),
      ),
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

  it('does not let a custom role bypass mapped capabilities through @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MARKETER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/marketing/campaigns',
          user: {
            role: UserRole.MARKETER,
            customRoleId: 'custom-role-1',
            permissions: ['view_dashboard'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not let a tenant role override bypass mapped capabilities through @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.STANDARDS_MANAGER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/reports',
          user: {
            role: UserRole.STANDARDS_MANAGER,
            hasRoleOverride: true,
            permissions: ['view_dashboard'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('separates marketing view access from marketing write access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/marketing/campaigns',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_marketing'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/marketing/campaigns',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['manage_marketing'],
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

  it.each([
    'view_communications',
    'view_staff_shift_workspace',
    'view_staff_tasks',
    'view_staff_standards',
    'view_staff_training',
    'view_staff_knowledge',
    'approve_guest_game_rewards',
  ])(
    'allows %s through the staff attachment guard boundary',
    (permission) => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

      expect(
        guard.canActivate(
          createContext({
            method: 'GET',
            path: '/staff/attachments/attachment-1',
            user: {
              role: UserRole.MARKETER,
              permissions: [permission],
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it('does not turn task-only attachment admission into team-chat route access', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    const user = {
      role: UserRole.MARKETER,
      permissions: ['view_staff_tasks'],
    };

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/attachments/attachment-1',
          user,
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/team-chat',
          user,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects unrelated capabilities at the staff attachment boundary', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/attachments/attachment-1',
          user: {
            role: UserRole.OWNER,
            permissions: ['view_dashboard'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows reward approvers to read the gamification approval chat only', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/staff/team-chat',
          user: {
            role: UserRole.MARKETER,
            permissions: ['approve_guest_game_rewards'],
          },
        }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/staff/team-chat/read',
          user: {
            role: UserRole.MARKETER,
            permissions: ['approve_guest_game_rewards'],
          },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/staff/team-chat/messages',
          user: {
            role: UserRole.MARKETER,
            permissions: ['approve_guest_game_rewards'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
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

  it('limits staff salary to standards manager and higher', () => {
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
          path: '/staff/salary',
          user: {
            role: UserRole.STANDARDS_MANAGER,
            permissions: resolveUserCapabilities({
              role: UserRole.STANDARDS_MANAGER,
            }),
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
            role: UserRole.CLUB_MANAGER,
            permissions: resolveUserCapabilities({
              role: UserRole.CLUB_MANAGER,
            }),
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('separates staff task viewing from staff task mutation', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/staff/tasks',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_staff_tasks'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/staff/tasks',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['manage_staff_tasks'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('limits trainee staff access to shift workspace and learning sections', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.TRAINEE]);
    const permissions = resolveUserCapabilities({ role: UserRole.TRAINEE });

    expect(permissions).toContain('view_staff_shift_workspace');
    expect(permissions).toContain('view_staff_tasks');
    expect(permissions).toContain('view_staff_standards');
    expect(permissions).toContain('view_staff_training');
    expect(permissions).toContain('view_staff_knowledge');
    expect(permissions).not.toContain('view_staff');
    expect(permissions).not.toContain('manage_staff_tasks');
    expect(permissions).not.toContain('manage_staff_standards');

    [
      '/staff/shift-workspace',
      '/staff/tasks',
      '/staff/shift-regulations',
      '/staff/checklists',
      '/staff/checklist-templates',
      '/staff/training-courses',
      '/staff/assessments',
      '/staff/knowledge-base',
      '/staff/team-chat',
      '/staff/notifications',
    ].forEach((path) => {
      expect(
        guard.canActivate(
          createContext({
            method: 'GET',
            path,
            user: {
              role: UserRole.TRAINEE,
              permissions,
            },
          }),
        ),
      ).toBe(true);
    });

    [
      { method: 'GET', path: '/staff' },
      { method: 'GET', path: '/staff/discipline' },
      { method: 'GET', path: '/staff/task-templates' },
      { method: 'POST', path: '/staff/tasks' },
      { method: 'POST', path: '/staff/shift-regulations' },
      { method: 'POST', path: '/staff/checklist-templates' },
    ].forEach(({ method, path }) => {
      expect(() =>
        guard.canActivate(
          createContext({
            method,
            path,
            user: {
              role: UserRole.TRAINEE,
              permissions,
            },
          }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  it('lets administrators read only their motivation page', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.CLUB_MANAGER,
      UserRole.STANDARDS_MANAGER,
      UserRole.SENIOR_ADMINISTRATOR,
      UserRole.CLUB_ADMINISTRATOR,
    ]);

    [UserRole.CLUB_ADMINISTRATOR, UserRole.SENIOR_ADMINISTRATOR].forEach(
      (role) => {
        const permissions = resolveUserCapabilities({ role });

        expect(
          guard.canActivate(
            createContext({
              method: 'GET',
              path: '/staff/discipline',
              user: { role, permissions },
            }),
          ),
        ).toBe(true);

        [
          { method: 'GET', path: '/staff/discipline/export' },
          { method: 'POST', path: '/staff/discipline/records' },
          { method: 'PATCH', path: '/staff/discipline/records/record-1' },
          { method: 'PATCH', path: '/staff/discipline/policy' },
        ].forEach(({ method, path }) => {
          expect(() =>
            guard.canActivate(
              createContext({
                method,
                path,
                user: { role, permissions },
              }),
            ),
          ).toThrow(ForbiddenException);
        });
      },
    );
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

  it('separates report viewing from report export actions', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/reports/export',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['view_assortment_reports'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/reports/export',
          user: {
            role: UserRole.CLUB_ADMINISTRATOR,
            permissions: ['export_reports'],
          },
        }),
      ),
    ).toBe(true);
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

  it('keeps bonus-ledger writes behind both the endpoint role and ledger capability', () => {
    const endpointRoles = [
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
    ];
    reflector.getAllAndOverride.mockReturnValue(endpointRoles);
    reflector.get.mockReturnValue(endpointRoles);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/guests/gamification/bonus-ledger/dispatch',
          user: {
            role: UserRole.MARKETER,
            permissions: resolveUserCapabilities({ role: UserRole.MARKETER }),
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/guests/gamification/bonus-ledger/dispatch',
          user: {
            role: UserRole.MANAGER,
            permissions: ['manage_guest_game_rules'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          path: '/guests/gamification/bonus-ledger/dispatch',
          user: {
            role: UserRole.MANAGER,
            permissions: ['operate_guest_game_ledger'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('lets senior and club administrators approve rewards without viewing or managing game rules', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);

    [UserRole.SENIOR_ADMINISTRATOR, UserRole.CLUB_ADMINISTRATOR].forEach(
      (role) => {
        const permissions = resolveUserCapabilities({ role });

        expect(
          guard.canActivate(
            createContext({
              method: 'POST',
              path: '/guests/gamification/rewards/redeem',
              user: { role, permissions },
            }),
          ),
        ).toBe(true);

        expect(
          guard.canActivate(
            createContext({
              method: 'POST',
              path: '/guests/gamification/deliveries/prepare',
              user: { role, permissions },
            }),
          ),
        ).toBe(true);

        expect(
          guard.canActivate(
            createContext({
              method: 'PATCH',
              path: '/guests/gamification/deliveries/delivery-1',
              user: { role, permissions },
            }),
          ),
        ).toBe(true);

        expect(() =>
          guard.canActivate(
            createContext({
              method: 'GET',
              path: '/guests/gamification/workspace',
              user: { role, permissions },
            }),
          ),
        ).toThrow(ForbiddenException);

        expect(() =>
          guard.canActivate(
            createContext({
              method: 'POST',
              path: '/guests/gamification/loot-boxes',
              user: { role, permissions },
            }),
          ),
        ).toThrow(ForbiddenException);
      },
    );
  });

  it('allows user access managers when route metadata includes them', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.STANDARDS_MANAGER,
    ]);

    [UserRole.MANAGER, UserRole.STANDARDS_MANAGER].forEach((role) => {
      expect(
        guard.canActivate(
          createContext({
            method: 'GET',
            path: '/users',
            user: {
              role,
              permissions: resolveUserCapabilities({ role }),
            },
          }),
        ),
      ).toBe(true);
    });
  });

  it('keeps user access routes behind manage_users even for assignable roles', () => {
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
            role: UserRole.MANAGER,
            hasRoleOverride: true,
            permissions: ['view_dashboard'],
          },
        }),
      ),
    ).toThrow(ForbiddenException);
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

  it('keeps standards manager baseline staff and communications access after tenant role override', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    const permissions = resolveUserCapabilities({
      role: UserRole.STANDARDS_MANAGER,
      roleOverride: { permissions: ['view_dashboard'] },
    });
    expect(permissions).toContain('manage_users');

    [
      '/staff',
      '/staff/tasks',
      '/staff/shift-regulations',
      '/staff/checklists',
      '/staff/training-courses',
      '/staff/assessments',
      '/staff/knowledge-base',
      '/staff/operations-dashboard',
      '/staff/administrator-ratings',
      '/staff/discipline',
      '/staff/directory',
      '/staff/team-chat',
      '/staff/notifications',
      '/guests/staff-control',
    ].forEach((path) => {
      expect(
        guard.canActivate(
          createContext({
            method: 'GET',
            path,
            user: {
              role: UserRole.STANDARDS_MANAGER,
              permissions,
            },
          }),
        ),
      ).toBe(true);
    });
  });

  it('keeps knowledge editing for platform admins and network managers with custom roles', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.MANAGER,
    ]);

    [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER].forEach((role) => {
      const permissions = resolveUserCapabilities({
        role,
        customRole: { permissions: ['view_dashboard'] },
      });

      expect(permissions).toEqual(
        expect.arrayContaining([
          'view_staff_knowledge',
          'edit_staff_knowledge',
          'review_staff_knowledge',
          'publish_staff_knowledge',
        ]),
      );
      expect(
        guard.canActivate(
          createContext({
            method: 'PATCH',
            path: '/staff/knowledge-base/article-1',
            user: {
              role,
              customRoleId: 'custom-role-1',
              permissions,
            },
          }),
        ),
      ).toBe(true);
    });
  });

  it('keeps standards manager baseline staff and communications access after custom role assignment', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    const permissions = resolveUserCapabilities({
      role: UserRole.STANDARDS_MANAGER,
      customRole: { permissions: ['view_dashboard'] },
    });
    expect(permissions).toContain('manage_users');

    [
      '/staff/tasks',
      '/staff/shift-regulations',
      '/staff/knowledge-base',
      '/staff/team-chat',
      '/staff/notifications',
      '/guests/staff-control',
    ].forEach((path) => {
      expect(
        guard.canActivate(
          createContext({
            method: 'GET',
            path,
            user: {
              role: UserRole.STANDARDS_MANAGER,
              customRoleId: 'custom-role-1',
              permissions,
            },
          }),
        ),
      ).toBe(true);
    });
  });

  it('does not grant standards manager commercial report access through baseline permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    const permissions = resolveUserCapabilities({
      role: UserRole.STANDARDS_MANAGER,
      roleOverride: { permissions: ['view_dashboard'] },
    });

    expect(() =>
      guard.canActivate(
        createContext({
          method: 'GET',
          path: '/reports',
          user: {
            role: UserRole.STANDARDS_MANAGER,
            permissions,
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
