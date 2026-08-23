import { TenantModule } from '@prisma/client';
import {
  isTenantExecutionHttpExempt,
  resolveTenantExecutionHttpAccess,
  resolveTenantExecutionHttpRequirements,
} from './tenant-execution-http-policy';

describe('tenant execution HTTP policy', () => {
  it.each([
    ['/products', TenantModule.ASSORTMENT],
    ['/categories/catalog', TenantModule.ASSORTMENT],
    ['/suppliers', TenantModule.ASSORTMENT],
    ['/stores/store-1', TenantModule.ASSORTMENT],
    ['/reports/assortment', TenantModule.ASSORTMENT],
    ['/dashboard/summary', TenantModule.ASSORTMENT],
    ['/imports/products', TenantModule.ASSORTMENT],
    ['/utilities/product-parsing', TenantModule.ASSORTMENT],
    ['/guests/gamification/workspace', TenantModule.GAMIFICATION],
    ['/guest-game/media', TenantModule.GAMIFICATION],
    ['/staff/tasks', TenantModule.STAFF],
    ['/guests/staff-control/operators', TenantModule.STAFF],
    ['/staff/team-chat/messages', TenantModule.COMMUNICATIONS],
    ['/staff/notifications', TenantModule.COMMUNICATIONS],
    ['/users/invites', TenantModule.USERS_ROLES],
    ['/integrations/langame/settings', TenantModule.INTEGRATIONS],
    ['/settings/workspace', TenantModule.INTEGRATIONS],
  ])('maps %s to %s', (path, module) => {
    expect(resolveTenantExecutionHttpAccess({ method: 'GET', path })).toEqual({
      module,
      action: 'READ',
      path,
    });
  });

  it.each([
    ['GET', '/guests/crm/tasks', 'READ'],
    ['GET', '/guests/crm/tasks/report', 'READ'],
    ['GET', '/guests/crm/tasks/export', 'READ'],
    ['GET', '/guests/crm/users', 'READ'],
    ['GET', '/guests/crm/contact-events', 'READ'],
    ['POST', '/guests/crm/tasks', 'WRITE'],
    ['POST', '/guests/crm/contact-events', 'WRITE'],
    ['PATCH', '/guests/crm/tasks/task-1', 'WRITE'],
  ] as const)(
    'classifies the bounded contact-task surface %s %s as COMMUNICATIONS/%s',
    (method, path, action) => {
      expect(resolveTenantExecutionHttpAccess({ method, path })).toEqual({
        module: TenantModule.COMMUNICATIONS,
        action,
        path,
      });
    },
  );

  it.each([
    ['GET', '/stores/address-suggestions'],
    ['GET', '/stores/address-geocode'],
    ['GET', '/stores/yandex-maps-geocode'],
    ['POST', '/stores/address-geocode/missing'],
    ['POST', '/categories/langame/refresh'],
    ['POST', '/reports/email'],
    ['POST', '/reports/digests/email'],
    ['POST', '/guests/gamification/deliveries/dispatch'],
    ['POST', '/guests/gamification/bonus-ledger/dispatch'],
    ['POST', '/guests/gamification/log/profiles/profile-1/sync'],
    ['POST', '/guests/gamification/log/profiles/profile-1/relink'],
    ['POST', '/integrations/langame/onboarding/initial-sync/preflight'],
  ])('classifies %s %s as OUTBOUND', (method, path) => {
    expect(resolveTenantExecutionHttpAccess({ method, path })).toMatchObject({
      action: 'OUTBOUND',
    });
  });

  it.each([
    ['GET', '/integrations/langame/routes-diagnostics'],
    ['GET', '/integrations/langame/service-diagnostics'],
    ['POST', '/integrations/langame/settings/preview'],
    ['POST', '/integrations/langame/onboarding/preview'],
    ['POST', '/integrations/langame/onboarding/status'],
    ['POST', '/integrations/langame/onboarding/reconcile'],
    ['POST', '/integrations/langame/guests/search-diagnostics'],
  ])('keeps read-only diagnostic %s %s at READ', (method, path) => {
    expect(resolveTenantExecutionHttpAccess({ method, path })).toMatchObject({
      module: TenantModule.INTEGRATIONS,
      action: 'READ',
    });
  });

  it.each([
    ['/integrations/langame/endpoint-profile-diagnostics'],
    ['/integrations/langame/endpoint-snapshot'],
  ])('classifies persisted diagnostic run %s as WRITE', (path) => {
    expect(
      resolveTenantExecutionHttpAccess({ method: 'POST', path }),
    ).toMatchObject({
      module: TenantModule.INTEGRATIONS,
      action: 'WRITE',
    });
  });

  it('does not let a future diagnostic method inherit a read-only override', () => {
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'DELETE',
        path: '/integrations/langame/routes-diagnostics',
      }),
    ).toMatchObject({
      module: TenantModule.INTEGRATIONS,
      action: 'WRITE',
    });
  });

  it.each([
    ['/integrations/langame/onboarding/activate', TenantModule.INTEGRATIONS],
    ['/integrations/langame/sync', TenantModule.INTEGRATIONS],
    ['/integrations/langame/business-snapshots/run', TenantModule.INTEGRATIONS],
    ['/integrations/langame/guests/foundation/sync', TenantModule.INTEGRATIONS],
    [
      '/integrations/langame/guests/foundation/sync/start',
      TenantModule.INTEGRATIONS,
    ],
    [
      '/guests/gamification/visual-editor/events/sync',
      TenantModule.GAMIFICATION,
    ],
    ['/guests/gamification/rewards/redeem', TenantModule.GAMIFICATION],
    ['/guests/gamification/bonus-ledger/queue', TenantModule.GAMIFICATION],
  ])('keeps manual pull or in-app mutation %s at WRITE', (path, module) => {
    expect(
      resolveTenantExecutionHttpAccess({ method: 'POST', path }),
    ).toMatchObject({
      module,
      action: 'WRITE',
    });
  });

  it('keeps internal configuration mutations at WRITE', () => {
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'PATCH',
        path: '/guests/gamification/missions/mission-1',
      }),
    ).toMatchObject({
      module: TenantModule.GAMIFICATION,
      action: 'WRITE',
    });
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'PUT',
        path: '/integrations/langame/settings',
      }),
    ).toMatchObject({
      module: TenantModule.INTEGRATIONS,
      action: 'WRITE',
    });
  });

  it.each([
    [
      '/integrations/langame/sync',
      [TenantModule.INTEGRATIONS, TenantModule.ASSORTMENT],
    ],
    [
      '/integrations/langame/guests/foundation/sync',
      [
        TenantModule.INTEGRATIONS,
        TenantModule.ASSORTMENT,
        TenantModule.GAMIFICATION,
        TenantModule.STAFF,
      ],
    ],
    [
      '/integrations/langame/business-snapshots/run',
      [
        TenantModule.INTEGRATIONS,
        TenantModule.ASSORTMENT,
        TenantModule.GAMIFICATION,
        TenantModule.STAFF,
      ],
    ],
  ])(
    'maps cross-module mutation %s to every affected WRITE entitlement',
    (path, modules) => {
      expect(
        resolveTenantExecutionHttpRequirements({ method: 'POST', path }),
      ).toEqual(
        modules.map((module) => ({
          module,
          action: 'WRITE',
        })),
      );
    },
  );

  it('maps business snapshot status to every affected READ entitlement', () => {
    expect(
      resolveTenantExecutionHttpRequirements({
        method: 'GET',
        path: '/integrations/langame/business-snapshots/status',
      }),
    ).toEqual(
      [
        TenantModule.INTEGRATIONS,
        TenantModule.ASSORTMENT,
        TenantModule.GAMIFICATION,
        TenantModule.STAFF,
      ].map((module) => ({ module, action: 'READ' })),
    );
  });

  it('requires OUTBOUND integration and assortment entitlements for initial sync preflight', () => {
    expect(
      resolveTenantExecutionHttpRequirements({
        method: 'POST',
        path: '/integrations/langame/onboarding/initial-sync/preflight',
      }),
    ).toEqual(
      [TenantModule.INTEGRATIONS, TenantModule.ASSORTMENT].map((module) => ({
        module,
        action: 'OUTBOUND',
      })),
    );
  });

  it('normalizes BFF-style API prefixes, query strings and trailing slashes', () => {
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'GET',
        originalUrl: '/api/products/?page=2',
      }),
    ).toEqual({
      module: TenantModule.ASSORTMENT,
      action: 'READ',
      path: '/products',
    });
  });

  it('does not assign modules to auth, platform admin or out-of-cohort CRM paths', () => {
    expect(
      resolveTenantExecutionHttpAccess({ method: 'GET', path: '/auth/me' }),
    ).toBeNull();
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'GET',
        path: '/admin/tenants',
      }),
    ).toBeNull();
    expect(
      resolveTenantExecutionHttpAccess({ method: 'GET', path: '/guests' }),
    ).toBeNull();
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'GET',
        path: '/guests/crm/leads',
      }),
    ).toBeNull();
    expect(
      resolveTenantExecutionHttpAccess({
        method: 'DELETE',
        path: '/guests/crm/tasks/task-1',
      }),
    ).toBeNull();
  });

  it('exempts only the authenticated session self-read from module classification', () => {
    expect(
      isTenantExecutionHttpExempt({ method: 'GET', path: '/auth/me' }),
    ).toBe(true);
    expect(
      isTenantExecutionHttpExempt({ method: 'HEAD', path: '/auth/me' }),
    ).toBe(true);
    expect(
      isTenantExecutionHttpExempt({
        method: 'GET',
        originalUrl: '/api/auth/me?fresh=1',
      }),
    ).toBe(true);
    expect(
      isTenantExecutionHttpExempt({ method: 'GET', path: '/marketing' }),
    ).toBe(false);
    expect(
      isTenantExecutionHttpExempt({ method: 'POST', path: '/auth/me' }),
    ).toBe(false);
    expect(isTenantExecutionHttpExempt({ method: 'GET', path: '/admin' })).toBe(
      false,
    );
  });
});
