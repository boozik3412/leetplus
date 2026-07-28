import { ForbiddenException } from '@nestjs/common';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from './tenant-execution-admission.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from './tenant-entitlement-profile.service';
import { TenantExecutionPolicyService } from './tenant-execution-policy.service';

const now = new Date('2026-08-01T12:00:00.000Z');

function entitlement(
  module: TenantModule,
  overrides: Partial<{
    readEnabled: boolean;
    writeEnabled: boolean;
    outboundEnabled: boolean;
    profileRevision: number;
  }> = {},
) {
  return {
    module,
    readEnabled: true,
    writeEnabled: true,
    outboundEnabled: false,
    validFrom: null,
    validUntil: null,
    profileRevision: 1,
    ...overrides,
  };
}

function externalSubject(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'tenant-external',
    status: TenantLifecycleStatus.ACTIVE,
    customerStage: TenantCustomerStage.PILOT,
    onboardingStatus: TenantOnboardingStatus.ACTIVE,
    trialStartsAt: new Date('2026-08-01T00:00:00.000Z'),
    trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
    entitlementProfileRevision: 1,
    moduleEntitlements: COMPLETE_TENANT_MODULE_PROFILE.map((module) =>
      entitlement(module),
    ),
    ...overrides,
  };
}

describe('TenantExecutionAdmissionService', () => {
  const findUnique = jest.fn();
  const prisma = {
    tenant: {
      findUnique,
    },
  } as unknown as PrismaService;
  const policy = new TenantExecutionPolicyService();
  const service = new TenantExecutionAdmissionService(prisma, policy);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('admits one explicitly entitled external module action', async () => {
    findUnique.mockResolvedValue(externalSubject());

    await expect(
      service.evaluate(
        'tenant-external',
        { module: TenantModule.ASSORTMENT, action: 'WRITE' },
        now,
      ),
    ).resolves.toEqual({
      allowed: true,
      tenantId: 'tenant-external',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      entitlementProfileRevision: 1,
      customerStage: TenantCustomerStage.PILOT,
      internalEntitlementBypass: false,
    });
  });

  it('returns the failed external requirement and stable policy reason', async () => {
    findUnique.mockResolvedValue(externalSubject());

    await expect(
      service.evaluate(
        'tenant-external',
        { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
        now,
      ),
    ).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      failedRequirement: {
        module: TenantModule.ASSORTMENT,
        action: 'OUTBOUND',
      },
      internalEntitlementBypass: false,
    });
  });

  it('requires every module action in a multi-module admission', async () => {
    findUnique.mockResolvedValue(
      externalSubject({
        moduleEntitlements: [
          ...COMPLETE_TENANT_MODULE_PROFILE.map((module) =>
            entitlement(
              module,
              module === TenantModule.STAFF
                ? { writeEnabled: false }
                : {},
            ),
          ),
        ],
      }),
    );

    await expect(
      service.evaluate(
        'tenant-external',
        [
          { module: TenantModule.ASSORTMENT, action: 'READ' },
          { module: TenantModule.STAFF, action: 'WRITE' },
        ],
        now,
      ),
    ).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'ENTITLEMENT_WRITE_DISABLED',
      failedRequirement: {
        module: TenantModule.STAFF,
        action: 'WRITE',
      },
    });
  });

  it('admits every requirement when an external multi-module profile allows them', async () => {
    findUnique.mockResolvedValue(externalSubject());

    await expect(
      service.assertAllowed(
        'tenant-external',
        [
          { module: TenantModule.ASSORTMENT, action: 'WRITE' },
          { module: TenantModule.STAFF, action: 'READ' },
        ],
        now,
      ),
    ).resolves.toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
      internalEntitlementBypass: false,
    });
  });

  it('temporarily bypasses only entitlement rows for an active INTERNAL tenant', async () => {
    findUnique.mockResolvedValue({
      ...externalSubject(),
      id: 'tenant-internal',
      customerStage: TenantCustomerStage.INTERNAL,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 0,
      moduleEntitlements: [],
    });

    await expect(
      service.evaluate(
        'tenant-internal',
        [
          { module: TenantModule.GAMIFICATION, action: 'OUTBOUND' },
          { module: TenantModule.INTEGRATIONS, action: 'WRITE' },
        ],
        now,
      ),
    ).resolves.toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED',
      entitlementProfileRevision: 0,
      customerStage: TenantCustomerStage.INTERNAL,
      internalEntitlementBypass: true,
    });
  });

  it.each([
    [
      COMPLETE_TENANT_MODULE_PROFILE.slice(0, 5).map((module) =>
        entitlement(module),
      ),
      'ENTITLEMENT_PROFILE_INCOMPLETE',
    ],
    [
      [
        ...COMPLETE_TENANT_MODULE_PROFILE.slice(0, 5).map((module) =>
          entitlement(module),
        ),
        entitlement(COMPLETE_TENANT_MODULE_PROFILE[0]),
      ],
      'ENTITLEMENT_PROFILE_INCOMPLETE',
    ],
    [
      COMPLETE_TENANT_MODULE_PROFILE.map((module, index) =>
        entitlement(module, index === 0 ? { profileRevision: 2 } : {}),
      ),
      'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
    ],
  ] as const)(
    'fails closed for an external partial, duplicate or mixed-revision profile',
    async (moduleEntitlements, reasonCode) => {
      findUnique.mockResolvedValue(externalSubject({ moduleEntitlements }));

      await expect(
        service.evaluate(
          'tenant-external',
          { module: TenantModule.ASSORTMENT, action: 'READ' },
          now,
        ),
      ).resolves.toMatchObject({
        allowed: false,
        reasonCode,
      });
    },
  );

  it('does not let the INTERNAL compatibility bypass skip lifecycle admission', async () => {
    findUnique.mockResolvedValue({
      ...externalSubject(),
      id: 'tenant-internal',
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.INTERNAL,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 0,
      moduleEntitlements: [],
    });

    await expect(
      service.evaluate(
        'tenant-internal',
        { module: TenantModule.GAMIFICATION, action: 'READ' },
        now,
      ),
    ).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'TENANT_INACTIVE',
      failedRequirement: {
        module: TenantModule.GAMIFICATION,
        action: 'READ',
      },
      internalEntitlementBypass: true,
    });
  });

  it('returns a stable denial instead of throwing when the tenant is missing', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.evaluate(
        'missing-tenant',
        { module: TenantModule.ASSORTMENT, action: 'READ' },
        now,
      ),
    ).resolves.toEqual({
      allowed: false,
      tenantId: 'missing-tenant',
      reasonCode: 'TENANT_NOT_FOUND',
      failedRequirement: null,
      entitlementProfileRevision: null,
      customerStage: null,
      internalEntitlementBypass: false,
    });
  });

  it('loads fresh persisted state for every evaluate call', async () => {
    findUnique
      .mockResolvedValueOnce(externalSubject())
      .mockResolvedValueOnce(
        externalSubject({ status: TenantLifecycleStatus.SUSPENDED }),
      );
    const requirement = {
      module: TenantModule.ASSORTMENT,
      action: 'READ',
    } as const;

    await expect(
      service.evaluate('tenant-external', requirement, now),
    ).resolves.toMatchObject({ allowed: true, reasonCode: 'ALLOWED' });
    await expect(
      service.evaluate('tenant-external', requirement, now),
    ).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'TENANT_INACTIVE',
    });
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'tenant-external' } }),
    );
    expect(findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: 'tenant-external' } }),
    );
  });

  it('makes an empty requirement set fail closed after loading the tenant', async () => {
    findUnique.mockResolvedValue(externalSubject());

    await expect(
      service.evaluate('tenant-external', [], now),
    ).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'TENANT_EXECUTION_REQUIREMENTS_EMPTY',
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('assertAllowed exposes the stable denial to lower-layer callers', async () => {
    findUnique.mockResolvedValue(null);

    try {
      await service.assertAllowed(
        'missing-tenant',
        { module: TenantModule.STAFF, action: 'WRITE' },
        now,
      );
      throw new Error('Expected assertAllowed to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        reasonCode: 'TENANT_NOT_FOUND',
        tenantId: 'missing-tenant',
      });
    }
  });
});
