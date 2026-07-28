import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
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
  ) {}

  async sendReport(user: AuthenticatedUser, dto: SendReportEmailDto) {
    const recipientEmail = this.resolveRecipientEmail(dto.recipientEmail, user);
    await this.tenantExecutionAdmissionService.assertAllowed(
      user.tenantId,
      REPORT_EMAIL_OUTBOUND_REQUIREMENTS,
    );
    const exportFile = await this.reportsExportService.exportReports(user, {
      ...dto,
      format: dto.format ?? 'xlsx',
    });

    await this.tenantExecutionAdmissionService.assertAllowed(
      user.tenantId,
      REPORT_EMAIL_OUTBOUND_REQUIREMENTS,
    );

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
