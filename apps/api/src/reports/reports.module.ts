import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsExportService } from './reports-export.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
