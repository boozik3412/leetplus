import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import {
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

  @Get('revenue-diagnostics')
  getRevenueDiagnostics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: DashboardQuery,
  ): Promise<DashboardRevenueDiagnostics> {
    return this.dashboardService.getRevenueDiagnostics(user, query);
  }
}
