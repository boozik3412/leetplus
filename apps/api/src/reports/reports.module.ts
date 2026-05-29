import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { ReportsDigestScheduledController } from './reports-digest-scheduled.controller';
import { ReportsDigestService } from './reports-digest.service';
import { ReportsDigestSchedulerService } from './reports-digest-scheduler.service';
import { ReportsEmailService } from './reports-email.service';
import { ReportsExportService } from './reports-export.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [ReportsController, ReportsDigestScheduledController],
  providers: [
    ReportsService,
    ReportsExportService,
    ReportsEmailService,
    ReportsDigestService,
    ReportsDigestSchedulerService,
  ],
})
export class ReportsModule {}
