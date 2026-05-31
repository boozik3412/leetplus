import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffOnboardingPlansService,
  type StaffOnboardingPlanDto,
  type StaffOnboardingPlanReport,
  type StaffOnboardingPlansQuery,
} from './staff-onboarding-plans.service';

@Controller('staff/onboarding')
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
export class StaffOnboardingPlansController {
  constructor(
    private readonly staffOnboardingPlansService: StaffOnboardingPlansService,
  ) {}

  @Get()
  getPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOnboardingPlansQuery,
  ): Promise<StaffOnboardingPlanReport> {
    return this.staffOnboardingPlansService.getPlans(user, query);
  }

  @Post()
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffOnboardingPlanDto,
  ) {
    return this.staffOnboardingPlansService.createPlan(user, dto);
  }

  @Patch(':id')
  updatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffOnboardingPlanDto,
  ) {
    return this.staffOnboardingPlansService.updatePlan(user, id, dto);
  }
}
