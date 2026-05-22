import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import {
  type DashboardRevenueDiagnostics,
  DashboardService,
  type DashboardQuery,
  type DashboardSummary,
} from './dashboard.service';

@Controller('dashboard')
@UseGuards(OptionalJwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user?: AuthenticatedUser,
    @Query() query?: DashboardQuery,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user, query);
  }

  @Get('revenue-diagnostics')
  getRevenueDiagnostics(
    @CurrentUser() user?: AuthenticatedUser,
    @Query() query?: DashboardQuery,
  ): Promise<DashboardRevenueDiagnostics> {
    return this.dashboardService.getRevenueDiagnostics(user, query);
  }
}
