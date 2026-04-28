import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { ReportsEmailService } from './reports-email.service';
import { ReportsExportService } from './reports-export.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, ReportsEmailService],
})
export class ReportsModule {}
