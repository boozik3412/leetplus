import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ReportsExportService,
  type ReportExportQuery,
} from './reports-export.service';
import {
  ReportsService,
  type AssortmentReport,
  type OperationalReport,
  type OperationalReportQuery,
} from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportsExportService: ReportsExportService,
  ) {}

  @Get('assortment')
  getAssortmentReport(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssortmentReport> {
    return this.reportsService.getAssortmentReport(user);
  }

  @Get('operations')
  getOperationalReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<OperationalReport> {
    return this.reportsService.getOperationalReport(user, query);
  }

  @Get('export')
  async exportReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportExportQuery,
  ): Promise<StreamableFile> {
    const file = await this.reportsExportService.exportReports(user, query);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }
}
