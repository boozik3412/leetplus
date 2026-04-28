import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import type { SendReportEmailDto } from './reports.dto';
import { ReportsExportService } from './reports-export.service';

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ReportsEmailService {
  constructor(
    private readonly reportsExportService: ReportsExportService,
    private readonly transactionalMailService: TransactionalMailService,
  ) {}

  async sendReport(user: AuthenticatedUser, dto: SendReportEmailDto) {
    const recipientEmail = this.resolveRecipientEmail(dto.recipientEmail, user);
    const exportFile = await this.reportsExportService.exportReports(user, {
      ...dto,
      format: dto.format ?? 'xlsx',
    });

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
