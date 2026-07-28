import { ForbiddenException } from '@nestjs/common';
import { TenantCustomerStage, TenantModule, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionDecision,
  TenantExecutionAdmissionService,
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
  evaluate: jest.Mock;
  assertAllowed: jest.Mock;
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
    customerStage: TenantCustomerStage.INTERNAL,
    internalEntitlementBypass: true,
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
      evaluate: jest.fn(),
      assertAllowed: jest
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
    admissionService.assertAllowed.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      }),
    );

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      ForbiddenException,
    );

    expect(admissionService.assertAllowed).toHaveBeenCalledWith(
      manualUser.tenantId,
      outboundRequirements,
    );
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
    expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
  });

  it('rechecks manual digest admission immediately before mail', async () => {
    admissionService.assertAllowed
      .mockResolvedValueOnce(allowedDecision(manualUser.tenantId))
      .mockRejectedValueOnce(
        new ForbiddenException({
          reasonCode: 'TENANT_INACTIVE',
        }),
      );

    await expect(service.sendDigest(manualUser, {})).rejects.toThrow(
      ForbiddenException,
    );

    expect(reportsService.getOperationalReport).toHaveBeenCalled();
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
    admissionService.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === 'tenant-denied'
          ? deniedDecision(tenantId)
          : allowedDecision(tenantId),
      ),
    );

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
    expect(admissionService.evaluate).toHaveBeenNthCalledWith(
      1,
      'tenant-denied',
      outboundRequirements,
    );
    expect(admissionService.evaluate).toHaveBeenNthCalledWith(
      2,
      'tenant-allowed',
      outboundRequirements,
    );
    expect(admissionService.evaluate).toHaveBeenNthCalledWith(
      3,
      'tenant-allowed',
      outboundRequirements,
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
    expect(admissionService.evaluate).not.toHaveBeenCalled();
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
    expect(admissionService.evaluate).not.toHaveBeenCalled();
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
    admissionService.evaluate.mockResolvedValue(
      allowedDecision('tenant-disabled'),
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
    admissionService.evaluate.mockResolvedValue(
      allowedDecision('tenant-role-revoked'),
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
    expect(mailService.sendReportDigest).not.toHaveBeenCalled();
  });
});
