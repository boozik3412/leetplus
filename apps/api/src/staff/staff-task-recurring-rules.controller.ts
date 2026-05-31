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
  StaffTaskRecurringRulesService,
  type StaffTaskRecurringRuleDto,
  type StaffTaskRecurringRuleLaunchDto,
  type StaffTaskRecurringRuleRunDueDto,
  type StaffTaskRecurringRuleRunDueResult,
  type StaffTaskRecurringRulesQuery,
  type StaffTaskRecurringRulesReport,
} from './staff-task-recurring-rules.service';

@Controller('staff/task-rules')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffTaskRecurringRulesController {
  constructor(
    private readonly staffTaskRecurringRulesService: StaffTaskRecurringRulesService,
  ) {}

  @Get()
  getRules(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTaskRecurringRulesQuery,
  ): Promise<StaffTaskRecurringRulesReport> {
    return this.staffTaskRecurringRulesService.getRules(user, query);
  }

  @Post('run-due')
  runDueRules(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTaskRecurringRuleRunDueDto,
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    return this.staffTaskRecurringRulesService.runDueRulesForUser(user, dto);
  }

  @Post()
  createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTaskRecurringRuleDto,
  ) {
    return this.staffTaskRecurringRulesService.createRule(user, dto);
  }

  @Patch(':id')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskRecurringRuleDto,
  ) {
    return this.staffTaskRecurringRulesService.updateRule(user, id, dto);
  }

  @Post(':id/tasks')
  createTaskFromRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskRecurringRuleLaunchDto,
  ) {
    return this.staffTaskRecurringRulesService.createTaskFromRule(
      user,
      id,
      dto,
    );
  }
}
