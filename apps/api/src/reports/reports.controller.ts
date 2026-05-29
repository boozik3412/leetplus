import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import { ReportsEmailService } from './reports-email.service';
import { ReportsDigestService } from './reports-digest.service';
import {
  ReportsExportService,
  type ReportExportQuery,
} from './reports-export.service';
import type {
  SendReportEmailDto,
  SendReportDigestEmailDto,
  UpdateRecommendationStateDto,
} from './reports.dto';
import {
  ReportsService,
  type AssortmentMatrixReport,
  type AssortmentReport,
  type InventoryTurnoverReport,
  type LflReport,
  type LflReportQuery,
  type NewProductsReport,
  type OperationalReport,
  type OperationalReportQuery,
  type PlanFactReport,
  type ProductOosExclusionDto,
  type ProductOosExclusionRow,
  type ReplenishmentReport,
  type SalesDetailReport,
  type SkuPerformanceReport,
  type SuppliersPerformanceReport,
} from './reports.service';

@Controller('reports')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportsExportService: ReportsExportService,
    private readonly reportsEmailService: ReportsEmailService,
    private readonly reportsDigestService: ReportsDigestService,
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

  @Get('inventory-turnover')
  getInventoryTurnoverReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<InventoryTurnoverReport> {
    return this.reportsService.getInventoryTurnoverReport(user, query);
  }

  @Get('assortment-matrix')
  getAssortmentMatrixReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<AssortmentMatrixReport> {
    return this.reportsService.getAssortmentMatrixReport(user, query);
  }

  @Get('plan-fact')
  getPlanFactReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<PlanFactReport> {
    return this.reportsService.getPlanFactReport(user, query);
  }

  @Get('sales-detail')
  getSalesDetailReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<SalesDetailReport> {
    return this.reportsService.getSalesDetailReport(user, query);
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

  @Get('new-products')
  getNewProductsReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalReportQuery,
  ): Promise<NewProductsReport> {
    return this.reportsService.getNewProductsReport(user, query);
  }

  @Get('lfl')
  getLflReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LflReportQuery,
  ): Promise<LflReport> {
    return this.reportsService.getLflReport(user, query);
  }

  @Get('oos-exclusions')
  getOosExclusions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductOosExclusionRow[]> {
    return this.reportsService.getOosExclusions(user);
  }

  @Post('oos-exclusions')
  createOosExclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProductOosExclusionDto,
  ) {
    return this.reportsService.createOosExclusion(user, dto);
  }

  @Delete('oos-exclusions/:id')
  deleteOosExclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reportsService.deleteOosExclusion(user, id);
  }

  @Patch('recommendations/:key/state')
  updateRecommendationState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpdateRecommendationStateDto,
  ) {
    return this.reportsService.updateRecommendationState(user, key, dto);
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

  @Post('digests/email')
  sendReportDigestEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendReportDigestEmailDto,
  ) {
    return this.reportsDigestService.sendDigest(user, dto);
  }
}
