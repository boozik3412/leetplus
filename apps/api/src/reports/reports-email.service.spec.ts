import { ForbiddenException } from '@nestjs/common';
import { TenantCustomerStage, TenantModule } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  TransactionalMailService,
  type ReportEmailContext,
} from '../mail/transactional-mail.service';
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
  assertAllowed: jest.Mock;
};

type SendReportExportCall = [string, ReportEmailContext];

const user = {
  id: 'user-1',
  email: 'owner@club-a.leetplus.ru',
  fullName: 'Owner',
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
} as AuthenticatedUser;

describe('ReportsEmailService', () => {
  let reportsExportService: ReportsExportServiceMock;
  let mailService: MailServiceMock;
  let tenantExecutionAdmissionService: TenantExecutionAdmissionServiceMock;
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
      assertAllowed: jest.fn().mockResolvedValue({
        allowed: true,
        tenantId: user.tenantId,
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        entitlementProfileRevision: 0,
        customerStage: TenantCustomerStage.INTERNAL,
        internalEntitlementBypass: true,
      }),
    };
    service = new ReportsEmailService(
      reportsExportService as unknown as ReportsExportService,
      mailService as unknown as TransactionalMailService,
      tenantExecutionAdmissionService as unknown as TenantExecutionAdmissionService,
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
    expect(tenantExecutionAdmissionService.assertAllowed).toHaveBeenCalledWith(
      user.tenantId,
      [
        { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
        { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
      ],
    );
    expect(
      tenantExecutionAdmissionService.assertAllowed,
    ).toHaveBeenCalledTimes(2);
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
    tenantExecutionAdmissionService.assertAllowed.mockRejectedValueOnce(
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
    tenantExecutionAdmissionService.assertAllowed
      .mockResolvedValueOnce({
        allowed: true,
        tenantId: user.tenantId,
        reasonCode: 'ALLOWED',
      })
      .mockRejectedValueOnce(
        new ForbiddenException({
          reasonCode: 'TENANT_INACTIVE',
        }),
      );

    await expect(
      service.sendReport(user, {
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(reportsExportService.exportReports).toHaveBeenCalledTimes(1);
    expect(mailService.sendReportExport).not.toHaveBeenCalled();
  });
});
