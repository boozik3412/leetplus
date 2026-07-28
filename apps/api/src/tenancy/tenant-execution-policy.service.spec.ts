import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import {
  PersistedTenantExecutionSubject,
  TenantExecutionPolicyService,
} from './tenant-execution-policy.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from './tenant-entitlement-profile.service';

const now = new Date('2026-08-01T12:00:00.000Z');

function subject(
  overrides: Partial<PersistedTenantExecutionSubject> = {},
): PersistedTenantExecutionSubject {
  return {
    id: 'tenant-a',
    status: TenantLifecycleStatus.ACTIVE,
    customerStage: TenantCustomerStage.INTERNAL,
    onboardingStatus: TenantOnboardingStatus.ACTIVE,
    trialStartsAt: null,
    trialEndsAt: null,
    entitlementProfileRevision: 1,
    moduleEntitlements: [
      {
        module: TenantModule.ASSORTMENT,
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
        validFrom: null,
        validUntil: null,
        profileRevision: 1,
      },
    ],
    ...overrides,
  };
}

function completeEntitlements(profileRevision = 1) {
  return COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
    module,
    readEnabled: true,
    writeEnabled: true,
    outboundEnabled: false,
    validFrom: null,
    validUntil: null,
    profileRevision,
  }));
}

describe('TenantExecutionPolicyService', () => {
  const service = new TenantExecutionPolicyService();

  it('keeps an existing active INTERNAL tenant session admitted', () => {
    expect(service.evaluateSession(subject(), now)).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
  });

  it.each([
    [{ status: TenantLifecycleStatus.SUSPENDED }, 'TENANT_INACTIVE'],
    [
      { onboardingStatus: TenantOnboardingStatus.PROVISIONING },
      'TENANT_ONBOARDING_BLOCKED',
    ],
    [
      { onboardingStatus: TenantOnboardingStatus.OWNER_INVITED },
      'TENANT_ONBOARDING_BLOCKED',
    ],
    [
      { onboardingStatus: TenantOnboardingStatus.OFFBOARDING },
      'TENANT_ONBOARDING_BLOCKED',
    ],
  ] as const)(
    'denies a non-admitted session with %s',
    (overrides, reasonCode) => {
      expect(service.evaluateSession(subject(overrides), now)).toMatchObject({
        allowed: false,
        reasonCode,
      });
    },
  );

  it.each([
    [
      {
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: null,
        trialEndsAt: null,
      },
      'TRIAL_WINDOW_MISSING',
    ],
    [
      {
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date('2026-08-02T00:00:00.000Z'),
        trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      'TRIAL_NOT_STARTED',
    ],
    [
      {
        customerStage: TenantCustomerStage.BETA,
        trialStartsAt: new Date('2026-07-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-08-01T12:00:00.000Z'),
      },
      'TRIAL_EXPIRED',
    ],
    [
      {
        customerStage: TenantCustomerStage.BETA,
        trialStartsAt: new Date('2026-09-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      'TRIAL_WINDOW_INVALID',
    ],
  ] as const)('enforces finite PILOT/BETA windows', (overrides, reasonCode) => {
    expect(service.evaluateSession(subject(overrides), now)).toMatchObject({
      allowed: false,
      reasonCode,
    });
  });

  it('admits a tenant inside its pilot window', () => {
    expect(
      service.evaluateSession(
        subject({
          customerStage: TenantCustomerStage.PILOT,
          trialStartsAt: new Date('2026-08-01T00:00:00.000Z'),
          trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
          moduleEntitlements: completeEntitlements(),
        }),
        now,
      ),
    ).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
  });

  it('requires an initialized profile for every non-INTERNAL session', () => {
    expect(
      service.evaluateSession(
        subject({
          customerStage: TenantCustomerStage.LIVE,
          entitlementProfileRevision: 0,
        }),
        now,
      ),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED',
    });
  });

  it('admits only an active, in-window owner bootstrap invite', () => {
    const candidate = subject({
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      trialStartsAt: new Date('2026-08-01T00:00:00.000Z'),
      trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
      moduleEntitlements: completeEntitlements(),
    });

    expect(service.evaluateInvite(candidate, now)).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
    expect(() => service.assertInviteAllowed(candidate, now)).not.toThrow();
    expect(
      service.evaluateInvite(
        {
          ...candidate,
          trialEndsAt: now,
        },
        now,
      ),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'TRIAL_EXPIRED',
    });
  });

  it('admits activation only for a suspended, onboarded tenant with a complete writable profile', () => {
    const candidate = subject({
      status: TenantLifecycleStatus.SUSPENDED,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      customerStage: TenantCustomerStage.PILOT,
      trialStartsAt: new Date('2026-08-01T00:00:00.000Z'),
      trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
      moduleEntitlements: completeEntitlements(),
    });

    expect(service.evaluateActivation(candidate, now)).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
    expect(() => service.assertActivationAllowed(candidate, now)).not.toThrow();
  });

  it.each([
    [
      completeEntitlements().slice(0, 5),
      'ENTITLEMENT_PROFILE_INCOMPLETE',
    ],
    [
      [
        ...completeEntitlements().slice(0, 5),
        {
          ...completeEntitlements()[0],
        },
      ],
      'ENTITLEMENT_PROFILE_INCOMPLETE',
    ],
    [
      completeEntitlements().map((entry, index) =>
        index === 0 ? { ...entry, profileRevision: 2 } : entry,
      ),
      'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
    ],
  ] as const)(
    'denies an external session with a partial, duplicate or mixed-revision profile',
    (moduleEntitlements, reasonCode) => {
      const candidate = subject({
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date('2026-08-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
        moduleEntitlements,
      });

      expect(service.evaluateSession(candidate, now)).toMatchObject({
        allowed: false,
        reasonCode,
      });
      expect(service.evaluateInvite(candidate, now)).toMatchObject({
        allowed: false,
        reasonCode,
      });
      expect(
        service.evaluateModule(
          candidate,
          TenantModule.ASSORTMENT,
          'READ',
          now,
        ),
      ).toMatchObject({
        allowed: false,
        reasonCode,
      });
    },
  );

  it.each([
    [
      {
        status: TenantLifecycleStatus.ACTIVE,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        moduleEntitlements: completeEntitlements(),
      },
      'TENANT_ACTIVATION_LIFECYCLE_BLOCKED',
    ],
    [
      {
        status: TenantLifecycleStatus.SUSPENDED,
        onboardingStatus: TenantOnboardingStatus.PROVISIONING,
        moduleEntitlements: completeEntitlements(),
      },
      'TENANT_ACTIVATION_ONBOARDING_BLOCKED',
    ],
    [
      {
        status: TenantLifecycleStatus.SUSPENDED,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        moduleEntitlements: completeEntitlements().slice(0, 5),
      },
      'ENTITLEMENT_PROFILE_INCOMPLETE',
    ],
    [
      {
        status: TenantLifecycleStatus.SUSPENDED,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        moduleEntitlements: completeEntitlements(2),
      },
      'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
    ],
    [
      {
        status: TenantLifecycleStatus.SUSPENDED,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        moduleEntitlements: completeEntitlements().map((entry) =>
          entry.module === TenantModule.INTEGRATIONS
            ? { ...entry, outboundEnabled: true }
            : entry,
        ),
      },
      'TENANT_ACTIVATION_OUTBOUND_ENABLED',
    ],
  ] as const)(
    'keeps an unsafe activation fail-closed',
    (overrides, reasonCode) => {
      expect(service.evaluateActivation(subject(overrides), now)).toMatchObject(
        {
          allowed: false,
          reasonCode,
        },
      );
    },
  );

  it.each([
    TenantOnboardingStatus.OWNER_INVITED,
    TenantOnboardingStatus.ONBOARDING,
    TenantOnboardingStatus.READY,
    TenantOnboardingStatus.ACTIVE,
  ])(
    'keeps outbound disabled when activating from %s',
    (onboardingStatus) => {
      expect(
        service.evaluateActivation(
          subject({
            status: TenantLifecycleStatus.SUSPENDED,
            onboardingStatus,
            moduleEntitlements: completeEntitlements().map((entry) =>
              entry.module === TenantModule.COMMUNICATIONS
                ? { ...entry, outboundEnabled: true }
                : entry,
            ),
          }),
          now,
        ),
      ).toMatchObject({
        allowed: false,
        reasonCode: 'TENANT_ACTIVATION_OUTBOUND_ENABLED',
      });
    },
  );

  it.each([
    [
      { entitlementProfileRevision: 0 },
      'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED',
    ],
    [{ moduleEntitlements: [] }, 'ENTITLEMENT_MISSING'],
    [
      {
        moduleEntitlements: [
          {
            module: TenantModule.ASSORTMENT,
            readEnabled: true,
            writeEnabled: true,
            outboundEnabled: false,
            validFrom: null,
            validUntil: null,
            profileRevision: 2,
          },
        ],
      },
      'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
    ],
  ] as const)(
    'denies a missing or stale module profile with %s',
    (overrides, reasonCode) => {
      expect(
        service.evaluateModule(
          subject(overrides),
          TenantModule.ASSORTMENT,
          'READ',
          now,
        ),
      ).toMatchObject({
        allowed: false,
        reasonCode,
      });
    },
  );

  it.each([
    [
      {
        readEnabled: false,
        writeEnabled: false,
        outboundEnabled: false,
      },
      'READ',
      'ENTITLEMENT_READ_DISABLED',
    ],
    [
      {
        readEnabled: true,
        writeEnabled: false,
        outboundEnabled: false,
      },
      'WRITE',
      'ENTITLEMENT_WRITE_DISABLED',
    ],
    [
      {
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
      },
      'OUTBOUND',
      'ENTITLEMENT_OUTBOUND_DISABLED',
    ],
  ] as const)(
    'separates read, write and outbound grants',
    (flags, action, reasonCode) => {
      expect(
        service.evaluateModule(
          subject({
            moduleEntitlements: [
              {
                module: TenantModule.ASSORTMENT,
                ...flags,
                validFrom: null,
                validUntil: null,
                profileRevision: 1,
              },
            ],
          }),
          TenantModule.ASSORTMENT,
          action,
          now,
        ),
      ).toMatchObject({
        allowed: false,
        reasonCode,
      });
    },
  );

  it('admits an explicitly entitled module action', () => {
    expect(
      service.evaluateModule(subject(), TenantModule.ASSORTMENT, 'WRITE', now),
    ).toMatchObject({
      allowed: true,
      module: TenantModule.ASSORTMENT,
      action: 'WRITE',
      entitlementProfileRevision: 1,
    });
  });

  it('fails closed on an invalid entitlement hierarchy', () => {
    expect(
      service.evaluateModule(
        subject({
          moduleEntitlements: [
            {
              module: TenantModule.ASSORTMENT,
              readEnabled: false,
              writeEnabled: true,
              outboundEnabled: false,
              validFrom: null,
              validUntil: null,
              profileRevision: 1,
            },
          ],
        }),
        TenantModule.ASSORTMENT,
        'READ',
        now,
      ),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ENTITLEMENT_INVALID',
    });
  });

  it('uses unauthorized for session admission and forbidden for modules', () => {
    expect(() =>
      service.assertSessionAllowed(
        subject({ onboardingStatus: TenantOnboardingStatus.PROVISIONING }),
        now,
      ),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.assertModuleAllowed(
        subject({ moduleEntitlements: [] }),
        TenantModule.STAFF,
        'READ',
        now,
      ),
    ).toThrow(ForbiddenException);
  });
});
