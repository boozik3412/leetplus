import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffOperationsDashboardService,
  type StaffOperationsDashboard,
  type StaffOperationsDashboardQuery,
} from './staff-operations-dashboard.service';

@Controller('staff/operations-dashboard')
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
export class StaffOperationsDashboardController {
  constructor(
    private readonly staffOperationsDashboardService: StaffOperationsDashboardService,
  ) {}

  @Get()
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperationsDashboardQuery,
  ): Promise<StaffOperationsDashboard> {
    return this.staffOperationsDashboardService.getDashboard(user, query);
  }
}
