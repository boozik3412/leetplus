import { ForbiddenException } from '@nestjs/common';
import { TenantCustomerStage, TenantModule, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  TransactionalMailService,
  type ReportEmailContext,
} from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import { ReportsEmailService } from './reports-email.service';
import { ReportsExportService } from './reports-export.service';

type ReportsExportServiceMock = {
  exportReports: jest.Mock;
};

type MailServiceMock = {
  sendReportExport: jest.Mock;
};

type TenantExecutionAdmissionServiceMock = {
  issuePermit: jest.Mock;
  assertPermitCurrent: jest.Mock;
};

type PrismaMock = {
  user: {
    findFirst: jest.Mock;
  };
  userRoleOverride: {
    findUnique: jest.Mock;
  };
};

type SendReportExportCall = [string, ReportEmailContext];

const user = {
  id: 'user-1',
  email: 'owner@club-a.leetplus.ru',
  fullName: 'Owner',
  role: UserRole.OWNER,
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} as AuthenticatedUser;
const permit = {
  tenantId: user.tenantId,
  executionRevision: 1,
  requirements: [
    { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' as const },
    { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' as const },
  ],
};

describe('ReportsEmailService', () => {
  let reportsExportService: ReportsExportServiceMock;
  let mailService: MailServiceMock;
  let tenantExecutionAdmissionService: TenantExecutionAdmissionServiceMock;
  let prisma: PrismaMock;
  let service: ReportsEmailService;

  beforeEach(() => {
    reportsExportService = {
      exportReports: jest.fn().mockResolvedValue({
        buffer: Buffer.from('report'),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: 'leetplus-reports-2026-04-01-2026-04-30.xlsx',
        tenantSlug: 'club-a',
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    };
    mailService = {
      sendReportExport: jest.fn(),
    };
    tenantExecutionAdmissionService = {
      issuePermit: jest.fn().mockResolvedValue(permit),
      assertPermitCurrent: jest.fn().mockResolvedValue({
        allowed: true,
        tenantId: user.tenantId,
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        entitlementProfileRevision: 0,
        executionRevision: 1,
        customerStage: TenantCustomerStage.INTERNAL,
        internalEntitlementBypass: true,
      }),
    };
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
          tenant: {
            executionRevision: permit.executionRevision,
          },
          customRole: null,
          storeAccesses: [],
        }),
      },
      userRoleOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    service = new ReportsEmailService(
      reportsExportService as unknown as ReportsExportService,
      mailService as unknown as TransactionalMailService,
      tenantExecutionAdmissionService as unknown as TenantExecutionAdmissionService,
      prisma as unknown as PrismaService,
    );
  });

  it('keeps an admitted INTERNAL tenant compatible and sends the report', async () => {
    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).resolves.toEqual({
      ok: true,
      recipientEmail: 'owner@club-a.leetplus.ru',
      fileName: 'leetplus-reports-2026-04-01-2026-04-30.xlsx',
    });
    expect(reportsExportService.exportReports).toHaveBeenCalledWith(user, {
      from: '2026-04-01',
      to: '2026-04-30',
      format: 'xlsx',
    });
    expect(tenantExecutionAdmissionService.issuePermit).toHaveBeenCalledWith(
      user.tenantId,
      [
        { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
        { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
      ],
    );
    expect(
      tenantExecutionAdmissionService.assertPermitCurrent,
    ).toHaveBeenCalledWith(permit);
    const [recipientEmail, emailContext] = mailService.sendReportExport.mock
      .calls[0] as SendReportExportCall;
    expect(recipientEmail).toBe('owner@club-a.leetplus.ru');
    expect(emailContext.tenantSlug).toBe('club-a');
    expect(emailContext.from).toBe('2026-04-01');
    expect(emailContext.to).toBe('2026-04-30');
  });

  it('sends report to explicit recipient', async () => {
    await service.sendReport(user, {
      recipientEmail: 'Manager@Club-A.LeetPlus.Ru',
      format: 'csv',
    });

    const [recipientEmail, emailContext] = mailService.sendReportExport.mock
      .calls[0] as SendReportExportCall;
    expect(recipientEmail).toBe('manager@club-a.leetplus.ru');
    expect(emailContext.attachment.fileName).toBe(
      'leetplus-reports-2026-04-01-2026-04-30.xlsx',
    );
  });

  it('rejects invalid recipient email', async () => {
    await expect(
      service.sendReport(user, { recipientEmail: 'not-email' }),
    ).rejects.toThrow('recipientEmail must be a valid email');
    expect(reportsExportService.exportReports).not.toHaveBeenCalled();
  });

  it('does not build or send a report when initial outbound admission is denied', async () => {
    tenantExecutionAdmissionService.issuePermit.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      }),
    );

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(reportsExportService.exportReports).not.toHaveBeenCalled();
    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });

  it('rechecks admission after export and before the mail effect', async () => {
    tenantExecutionAdmissionService.assertPermitCurrent.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'TENANT_EXECUTION_REVISION_CHANGED',
      }),
    );

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(reportsExportService.exportReports).toHaveBeenCalledTimes(1);
    expect(
      tenantExecutionAdmissionService.assertPermitCurrent,
    ).toHaveBeenCalledWith(permit);
    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });

  it('does not send when the actor is deactivated while the export is built', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow('Report export authority is no longer current');

    expect(reportsExportService.exportReports).toHaveBeenCalledTimes(1);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: user.id,
        tenantId: user.tenantId,
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
    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });

  it('does not send when the actor scope changes while the export is built', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      role: UserRole.OWNER,
      accessScope: 'STORES',
      tenant: {
        executionRevision: permit.executionRevision,
      },
      customRole: null,
      storeAccesses: [
        {
          storeId: 'store-1',
          store: { tenantId: user.tenantId },
        },
      ],
    });

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow('Report export authority is no longer current');

    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });

  it('does not send when the tenant revision changes after the permit recheck', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      role: UserRole.OWNER,
      accessScope: 'NETWORK',
      tenant: {
        executionRevision: permit.executionRevision + 1,
      },
      customRole: null,
      storeAccesses: [],
    });

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow('Report export authority is no longer current');

    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });

  it('does not send when a fresh role override removes export_reports', async () => {
    prisma.userRoleOverride.findUnique.mockResolvedValueOnce({
      permissions: ['view_assortment_reports'],
    });

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow('Report export capability is no longer current');

    expect(prisma.userRoleOverride.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_role: {
          tenantId: user.tenantId,
          role: UserRole.OWNER,
        },
      },
      select: {
        permissions: true,
      },
    });
    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });
});
