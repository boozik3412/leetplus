import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability, resolveUserCapabilities } from '../auth/capabilities';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import type { SendReportEmailDto } from './reports.dto';
import { ReportsExportService } from './reports-export.service';

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_EMAIL_OUTBOUND_REQUIREMENTS = [
  { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const;

@Injectable()
export class ReportsEmailService {
  private readonly logger = new Logger(ReportsEmailService.name);

  constructor(
    private readonly reportsExportService: ReportsExportService,
    private readonly transactionalMailService: TransactionalMailService,
    private readonly tenantExecutionAdmissionService: TenantExecutionAdmissionService,
    private readonly prisma: PrismaService,
  ) {}

  async sendReport(user: AuthenticatedUser, dto: SendReportEmailDto) {
    const recipientEmail = this.resolveRecipientEmail(dto.recipientEmail, user);
    const permit = await this.tenantExecutionAdmissionService.issuePermit(
      user.tenantId,
      REPORT_EMAIL_OUTBOUND_REQUIREMENTS,
    );
    const exportFile = await this.reportsExportService.exportReports(user, {
      ...dto,
      format: dto.format ?? 'xlsx',
    });

    await this.tenantExecutionAdmissionService.assertPermitCurrent(permit);
    await this.assertFreshExportAuthority(user, permit.executionRevision);

    try {
      await this.transactionalMailService.sendReportExport(recipientEmail, {
        tenantSlug: exportFile.tenantSlug,
        from: exportFile.from,
        to: exportFile.to,
        attachment: {
          fileName: exportFile.fileName,
          contentType: exportFile.contentType,
          buffer: exportFile.buffer,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to send report export email',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Почтовый сервер недоступен или не настроен',
      );
    }

    return {
      ok: true,
      recipientEmail,
      fileName: exportFile.fileName,
    };
  }

  private async assertFreshExportAuthority(
    user: Pick<
      AuthenticatedUser,
      'id' | 'tenantId' | 'accessScope' | 'allowedStoreIds'
    >,
    expectedExecutionRevision: number,
  ) {
    const freshUser = await this.prisma.user.findFirst({
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

    if (
      !freshUser ||
      freshUser.tenant.executionRevision !== expectedExecutionRevision ||
      !this.isSameAccessScope(user, freshUser)
    ) {
      throw new ForbiddenException({
        reasonCode: 'REPORT_EXPORT_AUTHORITY_REVOKED',
        message: 'Report export authority is no longer current',
      });
    }

    const roleOverride = freshUser.customRole
      ? null
      : await this.prisma.userRoleOverride.findUnique({
          where: {
            tenantId_role: {
              tenantId: user.tenantId,
              role: freshUser.role,
            },
          },
          select: {
            permissions: true,
          },
        });
    const permissions = resolveUserCapabilities({
      role: freshUser.role,
      customRole: freshUser.customRole,
      roleOverride,
    });

    if (!hasCapability({ permissions }, 'export_reports')) {
      throw new ForbiddenException({
        reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
        message: 'Report export capability is no longer current',
      });
    }
  }

  private isSameAccessScope(
    expected: Pick<
      AuthenticatedUser,
      'tenantId' | 'accessScope' | 'allowedStoreIds'
    >,
    actual: {
      accessScope: string | null;
      storeAccesses: Array<{
        storeId: string;
        store: { tenantId: string };
      }>;
    },
  ) {
    if (actual.accessScope !== expected.accessScope) {
      return false;
    }

    const actualStoreIds = actual.storeAccesses
      .filter((access) => access.store.tenantId === expected.tenantId)
      .map((access) => access.storeId)
      .sort();
    const expectedStoreIds = [...expected.allowedStoreIds].sort();

    return (
      actualStoreIds.length === actual.storeAccesses.length &&
      actualStoreIds.length === expectedStoreIds.length &&
      actualStoreIds.every(
        (storeId, index) => storeId === expectedStoreIds[index],
      )
    );
  }

  private resolveRecipientEmail(
    recipientEmail: string | undefined,
    user: AuthenticatedUser,
  ) {
    const email = (recipientEmail ?? user.email).trim().toLowerCase();

    if (!EMAIL_REGEXP.test(email)) {
      throw new BadRequestException('recipientEmail must be a valid email');
    }

    return email;
  }
}
