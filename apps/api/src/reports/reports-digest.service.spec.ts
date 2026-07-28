import { ForbiddenException } from '@nestjs/common';
import { TenantCustomerStage, TenantModule, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionDecision,
  TenantExecutionAdmissionService,
  type TenantExecutionPermit,
  type TenantExecutionPermitAcquisition,
} from '../tenancy/tenant-execution-admission.service';
import { ReportsDigestService } from './reports-digest.service';
import { ReportsExportService } from './reports-export.service';
import { ReportsService, type OperationalReport } from './reports.service';

type PrismaMock = {
  user: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  userRoleOverride: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
};

type ReportsServiceMock = {
  getOperationalReport: jest.Mock;
};

type ReportsExportServiceMock = {
  exportReports: jest.Mock;
};

type MailServiceMock = {
  sendReportDigest: jest.Mock;
};

type TenantExecutionAdmissionServiceMock = {
  acquirePermit: jest.Mock;
  issuePermit: jest.Mock;
  evaluatePermit: jest.Mock;
  assertPermitCurrent: jest.Mock;
};

const outboundRequirements = [
  { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
];

const manualUser = {
  id: 'user-a',
  email: 'owner@club-a.leetplus.ru',
  fullName: 'Owner A',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'club-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} as AuthenticatedUser;

function reportFor(user: AuthenticatedUser): OperationalReport {
  return {
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug,
    from: '2026-07-27',
    to: '2026-07-27',
    storeId: null,
    totalRevenue: 1000,
    totalCost: 400,
    grossProfit: 600,
    adjustedGrossProfit: 600,
    marginPercent: 60,
    adjustedMarginPercent: 60,
    soldQuantity: 10,
    writeOffQuantity: 0,
    writeOffAmount: 0,
    returnQuantity: 0,
    returnAmount: 0,
    averageDailyRevenue: 1000,
    stockQuantity: 50,
    stockDays: 5,
    recommendations: [],
    outOfStockRiskProducts: [],
    productsWithoutSales: [],
  };
}

function allowedDecision(tenantId: string): TenantExecutionAdmissionDecision {
  return {
    allowed: true,
    tenantId,
    reasonCode: 'ALLOWED',
    failedRequirement: null,
    entitlementProfileRevision: 0,
    executionRevision: 1,
    customerStage: TenantCustomerStage.INTERNAL,
    internalEntitlementBypass: true,
  };
}

function permitFor(tenantId: string): TenantExecutionPermit {
  return {
    tenantId,
    executionRevision: 1,
    requirements: outboundRequirements,
  };
}

function acquisitionFor(
  decision: TenantExecutionAdmissionDecision,
): TenantExecutionPermitAcquisition {
  return {
    decision,
    permit: decision.allowed ? permitFor(decision.tenantId) : null,
  };
}

function deniedDecision(tenantId: string): TenantExecutionAdmissionDecision {
  return {
    allowed: false,
    tenantId,
    reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
    failedRequirement: {
      module: TenantModule.ASSORTMENT,
      action: 'OUTBOUND',
    },
    entitlementProfileRevision: 1,
    executionRevision: 1,
    customerStage: TenantCustomerStage.BETA,
    internalEntitlementBypass: false,
  };
}

describe('ReportsDigestService tenant execution admission', () => {
  let prisma: PrismaMock;
  let reportsService: ReportsServiceMock;
  let reportsExportService: ReportsExportServiceMock;
  let mailService: MailServiceMock;
  let admissionService: TenantExecutionAdmissionServiceMock;
  let service: ReportsDigestService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      userRoleOverride: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    reportsService = {
      getOperationalReport: jest.fn((user: AuthenticatedUser) =>
        reportFor(user),
      ),
    };
    reportsExportService = {
      exportReports: jest.fn(),
    };
    mailService = {
      sendReportDigest: jest.fn(),
    };
    admissionService = {
      acquirePermit: jest.fn((tenantId: string) =>
        Promise.resolve(acquisitionFor(allowedDecision(tenantId))),
      ),
      issuePermit: jest.fn().mockResolvedValue(permitFor(manualUser.tenantId)),
      evaluatePermit: jest.fn((permit: TenantExecutionPermit) =>
        Promise.resolve(allowedDecision(permit.tenantId)),
      ),
      assertPermitCurrent: jest
        .fn()
        .mockResolvedValue(allowedDecision(manualUser.tenantId)),
    };
    service = new ReportsDigestService(
      prisma as unknown as PrismaService,
      reportsService as unknown as ReportsService,
      reportsExportService as unknown as ReportsExportService,
      mailService as unknown as TransactionalMailService,
      admissionService as unknown as TenantExecutionAdmissionService,
    );
  });

  it('does not invoke mail for a manually requested denied digest', async () => {
    admissionService.issuePermit.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      }),
    );

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      ForbiddenException,
    );

    expect(admissionService.issuePermit).toHaveBeenCalledWith(
      manualUser.tenantId,
      outboundRequirements,
    );
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
    expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
  });

  it('rechecks manual digest admission immediately before mail', async () => {
    admissionService.assertPermitCurrent.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'TENANT_EXECUTION_REVISION_CHANGED',
      }),
    );

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      ForbiddenException,
    );

    expect(reportsService.getOperationalReport).toHaveBeenCalled();
    expect(admissionService.assertPermitCurrent).toHaveBeenCalledWith(
      permitFor(manualUser.tenantId),
    );
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('does not send a manual digest when the actor is deactivated during the build', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      'Report export authority is no longer current',
    );

    expect(reportsService.getOperationalReport).toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: manualUser.id,
        tenantId: manualUser.tenantId,
        isActive: true,
      },
      select: {
        role: true,
        accessScope: true,
        tenant: {
          select: {
            executionRevision: true,
          },
        },
        customRole: {
          select: {
            permissions: true,
          },
        },
        storeAccesses: {
          select: {
            storeId: true,
            store: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('does not send a manual digest when a fresh custom role removes export_reports', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      role: UserRole.OWNER,
      accessScope: 'NETWORK',
      tenant: {
        executionRevision: permitFor(manualUser.tenantId).executionRevision,
      },
      customRole: {
        permissions: ['view_assortment_reports'],
      },
      storeAccesses: [],
    });

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      'Report export capability is no longer current',
    );

    expect(prisma.userRoleOverride.findUnique).not.toHaveBeenCalled();
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('does not send a manual digest when the actor scope changes during the build', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      role: UserRole.OWNER,
      accessScope: 'STORES',
      tenant: {
        executionRevision: permitFor(manualUser.tenantId).executionRevision,
      },
      customRole: null,
      storeAccesses: [
        {
          storeId: 'store-a',
          store: { tenantId: manualUser.tenantId },
        },
      ],
    });

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      'Report export authority is no longer current',
    );

    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('skips a denied scheduled tenant and continues with an allowed tenant', async () => {
    const recipients = [
      {
        id: 'user-denied',
        email: 'owner@denied.example',
        fullName: 'Denied owner',
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        tenantId: 'tenant-denied',
        customRoleId: null,
        customRole: null,
        tenant: { slug: 'denied' },
      },
      {
        id: 'user-allowed',
        email: 'owner@allowed.example',
        fullName: 'Allowed owner',
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        tenantId: 'tenant-allowed',
        customRoleId: null,
        customRole: null,
        tenant: { slug: 'allowed' },
      },
    ];
    prisma.user.findMany.mockResolvedValue(recipients);
    prisma.user.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          recipients.find((recipient) => recipient.id === where.id) ?? null,
        ),
    );
    admissionService.acquirePermit.mockImplementation((tenantId: string) => {
      const decision =
        tenantId === 'tenant-denied'
          ? deniedDecision(tenantId)
          : allowedDecision(tenantId);

      return Promise.resolve(acquisitionFor(decision));
    });

    await expect(service.sendScheduledDigests({})).resolves.toMatchObject({
      ok: true,
      dryRun: false,
      sent: 1,
      skipped: 1,
      results: [
        {
          tenantSlug: 'allowed',
          recipientEmail: 'owner@allowed.example',
        },
      ],
      skippedResults: [
        {
          status: 'SKIPPED',
          tenantId: 'tenant-denied',
          tenantSlug: 'denied',
          recipientEmail: 'owner@denied.example',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        },
      ],
    });
    expect(admissionService.acquirePermit).toHaveBeenNthCalledWith(
      1,
      'tenant-denied',
      outboundRequirements,
    );
    expect(admissionService.acquirePermit).toHaveBeenNthCalledWith(
      2,
      'tenant-allowed',
      outboundRequirements,
    );
    expect(admissionService.evaluatePermit).toHaveBeenCalledWith(
      permitFor('tenant-allowed'),
    );
    expect(mailService.sendReportDigest).toHaveBeenCalledTimes(1);
    expect(mailService.sendReportDigest).toHaveBeenCalledWith(
      'owner@allowed.example',
      expect.objectContaining({ tenantSlug: 'allowed' }),
    );
  });

  it('skips a scheduled recipient whose custom role removed export_reports', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-custom',
        email: 'custom@denied.example',
        fullName: 'Custom role user',
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        tenantId: 'tenant-custom',
        customRoleId: 'custom-role',
        customRole: {
          id: 'custom-role',
          name: 'Restricted owner',
          permissions: ['view_dashboard'],
        },
        tenant: { slug: 'custom' },
      },
    ]);

    await expect(service.sendScheduledDigests({})).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
      skippedResults: [
        {
          tenantId: 'tenant-custom',
          reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
        },
      ],
    });
    expect(admissionService.acquirePermit).not.toHaveBeenCalled();
    expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('skips a scheduled recipient whose role override removed export_reports', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-override',
        email: 'override@denied.example',
        fullName: 'Role override user',
        role: UserRole.ADMIN,
        isPlatformAdmin: false,
        tenantId: 'tenant-override',
        customRoleId: null,
        customRole: null,
        tenant: { slug: 'override' },
      },
    ]);
    prisma.userRoleOverride.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-override',
        role: UserRole.ADMIN,
        permissions: ['view_dashboard'],
      },
    ]);

    await expect(
      service.sendScheduledDigests({ dryRun: true }),
    ).resolves.toMatchObject({
      dryRun: true,
      eligible: 0,
      skipped: 1,
      skippedResults: [
        {
          tenantId: 'tenant-override',
          reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
        },
      ],
    });
    expect(admissionService.acquirePermit).not.toHaveBeenCalled();
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('rechecks scheduled recipient authority immediately before mail', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-disabled-during-build',
        email: 'owner@disabled.example',
        fullName: 'Owner disabled during build',
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        tenantId: 'tenant-disabled',
        customRoleId: null,
        customRole: null,
        tenant: { slug: 'disabled' },
      },
    ]);
    prisma.user.findFirst.mockResolvedValue(null);
    admissionService.acquirePermit.mockResolvedValue(
      acquisitionFor(allowedDecision('tenant-disabled')),
    );

    await expect(service.sendScheduledDigests({})).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
      skippedResults: [
        {
          tenantId: 'tenant-disabled',
          reasonCode: 'RECIPIENT_AUTHORITY_REVOKED',
        },
      ],
    });
    expect(reportsService.getOperationalReport).toHaveBeenCalledTimes(1);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(admissionService.evaluatePermit).not.toHaveBeenCalled();
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('rechecks scheduled recipient capability immediately before mail', async () => {
    const recipient = {
      id: 'user-role-revoked-during-build',
      email: 'owner@role-revoked.example',
      fullName: 'Owner role revoked during build',
      role: UserRole.OWNER,
      isPlatformAdmin: false,
      tenantId: 'tenant-role-revoked',
      customRoleId: null,
      customRole: null,
      tenant: { slug: 'role-revoked' },
    };
    prisma.user.findMany.mockResolvedValue([recipient]);
    prisma.user.findFirst.mockResolvedValue({
      ...recipient,
      customRoleId: 'restricted-role',
      customRole: {
        id: 'restricted-role',
        name: 'Restricted during build',
        permissions: ['view_dashboard'],
      },
    });
    admissionService.acquirePermit.mockResolvedValue(
      acquisitionFor(allowedDecision('tenant-role-revoked')),
    );

    await expect(service.sendScheduledDigests({})).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
      skippedResults: [
        {
          tenantId: 'tenant-role-revoked',
          reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
        },
      ],
    });
    expect(admissionService.evaluatePermit).not.toHaveBeenCalled();
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });

  it('uses the supplied acquisition without reacquiring and skips when its revision changed', async () => {
    const recipient = {
      id: 'user-revision-changed',
      email: 'owner@revision-changed.example',
      fullName: 'Owner revision changed',
      role: UserRole.OWNER,
      isPlatformAdmin: false,
      tenantId: 'tenant-revision-changed',
      customRoleId: null,
      customRole: null,
      tenant: { slug: 'revision-changed' },
    };
    const permitAcquisition = acquisitionFor(
      allowedDecision(recipient.tenantId),
    );
    const revisionChangedDecision: TenantExecutionAdmissionDecision = {
      ...allowedDecision(recipient.tenantId),
      allowed: false,
      reasonCode: 'TENANT_EXECUTION_REVISION_CHANGED',
      executionRevision: 2,
    };
    prisma.user.findMany.mockResolvedValue([recipient]);
    prisma.user.findFirst.mockResolvedValue(recipient);
    admissionService.evaluatePermit.mockResolvedValue(revisionChangedDecision);

    await expect(
      service.sendScheduledDigests(
        {},
        {
          tenantId: recipient.tenantId,
          permitAcquisition,
        },
      ),
    ).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
      skippedResults: [
        {
          tenantId: recipient.tenantId,
          reasonCode: 'TENANT_EXECUTION_REVISION_CHANGED',
        },
      ],
    });

    expect(admissionService.acquirePermit).not.toHaveBeenCalled();
    expect(admissionService.evaluatePermit).toHaveBeenCalledWith(
      permitAcquisition.permit,
    );
    expect(reportsService.getOperationalReport).toHaveBeenCalledTimes(1);
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });
});
