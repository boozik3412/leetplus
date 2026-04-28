import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsEmailService } from './reports-email.service';
import {
  ReportsExportService,
  type ReportExportQuery,
} from './reports-export.service';
import type { SendReportEmailDto } from './reports.dto';
import {
  ReportsService,
  type AssortmentReport,
  type OperationalReport,
  type OperationalReportQuery,
  type ReplenishmentReport,
  type SkuPerformanceReport,
  type SuppliersPerformanceReport,
} from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportsExportService: ReportsExportService,
    private readonly reportsEmailService: ReportsEmailService,
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

  @Get('sku-performance')
  getSkuPerformanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<SkuPerformanceReport> {
    return this.reportsService.getSkuPerformanceReport(user, query);
  }

  @Get('suppliers-performance')
  getSuppliersPerformanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<SuppliersPerformanceReport> {
    return this.reportsService.getSuppliersPerformanceReport(user, query);
  }

  @Get('replenishment')
  getReplenishmentReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<ReplenishmentReport> {
    return this.reportsService.getReplenishmentReport(user, query);
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

  @Post('email')
  sendReportEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendReportEmailDto,
  ) {
    return this.reportsEmailService.sendReport(user, dto);
  }
}
