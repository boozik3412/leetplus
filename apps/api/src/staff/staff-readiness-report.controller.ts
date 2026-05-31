import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffReadinessReportService,
  type StaffReadinessReport,
  type StaffReadinessReportQuery,
} from './staff-readiness-report.service';

@Controller('staff/readiness-report')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffReadinessReportController {
  constructor(
    private readonly staffReadinessReportService: StaffReadinessReportService,
  ) {}

  @Get()
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffReadinessReportQuery,
  ): Promise<StaffReadinessReport> {
    return this.staffReadinessReportService.getReport(user, query);
  }
}
