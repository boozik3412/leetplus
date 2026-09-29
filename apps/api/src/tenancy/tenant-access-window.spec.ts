import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
} from '@prisma/client';
import {
  OPEN_ENDED_TENANT_ACCESS_ENDS_AT,
  describeTenantAccess,
  isOpenEndedTenantAccess,
} from './tenant-access-window';
import { TenantExecutionPolicyService } from './tenant-execution-policy.service';

const now = new Date('2026-09-29T12:00:00.000Z');
const startsAt = new Date('2026-08-27T09:42:25.466Z');

function pilot(
  trialEndsAt: Date | null,
  trialStartsAt: Date | null = startsAt,
) {
  return {
    customerStage: TenantCustomerStage.PILOT,
    trialStartsAt,
    trialEndsAt,
    executionRevision: 2,
  };
}

describe('tenant access window', () => {
  it('stores open-ended access as year 9999 in every time zone', () => {
    expect(OPEN_ENDED_TENANT_ACCESS_ENDS_AT.toISOString()).toBe(
      '9999-12-31T00:00:00.000Z',
    );
    expect(isOpenEndedTenantAccess(OPEN_ENDED_TENANT_ACCESS_ENDS_AT)).toBe(
      true,
    );
    expect(isOpenEndedTenantAccess(new Date('2126-01-01T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('keeps the unchanged execution policy admitting an open-ended pilot', () => {
    const decision = new TenantExecutionPolicyService().evaluateSession(
      {
        id: 'tenant-ez',
        status: TenantLifecycleStatus.ACTIVE,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.ONBOARDING,
        trialStartsAt: startsAt,
        trialEndsAt: OPEN_ENDED_TENANT_ACCESS_ENDS_AT,
        entitlementProfileRevision: 1,
        executionRevision: 3,
        moduleEntitlements: [
          'GAMIFICATION',
          'ASSORTMENT',
          'STAFF',
          'COMMUNICATIONS',
          'USERS_ROLES',
          'INTEGRATIONS',
        ].map((module) => ({
          module: module as never,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: null,
          validUntil: null,
          profileRevision: 1,
        })),
      },
      now,
    );

    expect(decision).toMatchObject({ allowed: true, reasonCode: 'ALLOWED' });
  });

  it('describes internal and live networks as not time bound', () => {
    for (const customerStage of [
      TenantCustomerStage.INTERNAL,
      TenantCustomerStage.LIVE,
    ]) {
      expect(
        describeTenantAccess(
          {
            customerStage,
            trialStartsAt: null,
            trialEndsAt: null,
            executionRevision: 1,
          },
          now,
        ),
      ).toEqual({
        state: 'NOT_TIME_BOUND',
        manageable: false,
        startsAt: null,
        endsAt: null,
        daysLeft: null,
        executionRevision: 1,
      });
    }
  });

  it('describes an unactivated pilot shell as not configured', () => {
    expect(describeTenantAccess(pilot(null, null), now)).toMatchObject({
      state: 'NOT_CONFIGURED',
      manageable: false,
    });
  });

  it('describes the expired EZ GAME trial and its open-ended repair', () => {
    expect(
      describeTenantAccess(pilot(new Date('2026-09-26T09:42:25.466Z')), now),
    ).toEqual({
      state: 'EXPIRED',
      manageable: true,
      startsAt: startsAt.toISOString(),
      endsAt: '2026-09-26T09:42:25.466Z',
      daysLeft: null,
      executionRevision: 2,
    });
    expect(
      describeTenantAccess(pilot(OPEN_ENDED_TENANT_ACCESS_ENDS_AT), now),
    ).toMatchObject({ state: 'OPEN_ENDED', manageable: true, endsAt: null });
  });

  it('counts whole days left for a dated window', () => {
    expect(
      describeTenantAccess(pilot(new Date('2026-10-01T11:00:00.000Z')), now),
    ).toMatchObject({ state: 'ACTIVE_UNTIL', daysLeft: 2 });
  });

  it('reports a window that has not started yet', () => {
    expect(
      describeTenantAccess(
        pilot(
          new Date('2026-12-01T00:00:00.000Z'),
          new Date('2026-10-01T00:00:00.000Z'),
        ),
        now,
      ),
    ).toMatchObject({ state: 'NOT_STARTED', manageable: true });
  });
});
