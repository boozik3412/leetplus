import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import {
  type DashboardExecutiveProductRevenue,
  type DashboardExecutiveProductRevenueQuery,
  type DashboardExecutiveOperations,
  type DashboardExecutiveQuery,
  type DashboardExecutiveSummary,
  type DashboardRevenueDiagnostics,
  DashboardService,
  type DashboardQuery,
  type DashboardSummary,
} from './dashboard.service';

@Controller('dashboard')
@Roles(...Object.values(UserRole))
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardQuery,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user, query);
  }

  @Get('executive-product-revenue')
  getExecutiveProductRevenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardExecutiveProductRevenueQuery,
  ): Promise<DashboardExecutiveProductRevenue> {
    return this.dashboardService.getExecutiveProductRevenue(user, query);
  }

  @Get('executive-summary')
  getExecutiveSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardExecutiveQuery,
  ): Promise<DashboardExecutiveSummary> {
    return this.dashboardService.getExecutiveSummary(user, query);
  }

  @Get('executive-operations')
  getExecutiveOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardExecutiveQuery,
  ): Promise<DashboardExecutiveOperations> {
    return this.dashboardService.getExecutiveOperations(user, query);
  }

  @Get('revenue-diagnostics')
  getRevenueDiagnostics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardQuery,
  ): Promise<DashboardRevenueDiagnostics> {
    return this.dashboardService.getRevenueDiagnostics(user, query);
  }
}
