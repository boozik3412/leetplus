import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffAiAssistantService,
  type StaffAiAssistantQuery,
  type StaffAiAssistantReport,
} from './staff-ai-assistant.service';

@Controller('staff/ai-assistant')
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
export class StaffAiAssistantController {
  constructor(
    private readonly staffAiAssistantService: StaffAiAssistantService,
  ) {}

  @Get()
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffAiAssistantQuery,
  ): Promise<StaffAiAssistantReport> {
    return this.staffAiAssistantService.getReport(user, query);
  }
}
