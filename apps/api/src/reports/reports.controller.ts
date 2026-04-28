import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ReportsService,
  type AssortmentReport,
  type OperationalReport,
  type OperationalReportQuery,
} from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}
