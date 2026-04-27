import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { DashboardService, type DashboardSummary } from './dashboard.service';

@Controller('dashboard')
@UseGuards(OptionalJwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user);
  }
}
