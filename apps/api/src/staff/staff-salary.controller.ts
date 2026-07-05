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
  StaffSalaryService,
  type StaffSalaryPeriodAdjustmentDto,
  type StaffSalaryPeriodDto,
  type StaffSalaryQuery,
  type StaffSalarySchemeDto,
} from './staff-salary.service';

@Controller('staff/salary')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STANDARDS_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffSalaryController {
  constructor(private readonly staffSalaryService: StaffSalaryService) {}

  @Get()
  getWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffSalaryQuery,
  ) {
    return this.staffSalaryService.getWorkspace(user, query);
  }

  @Post('periods')
  createPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffSalaryPeriodDto,
  ) {
    return this.staffSalaryService.createPeriod(user, dto);
  }

  @Patch('periods/:id/rows/:userId')
  updatePeriodRowAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: StaffSalaryPeriodAdjustmentDto,
  ) {
    return this.staffSalaryService.updatePeriodRowAdjustment(
      user,
      id,
      userId,
      dto,
    );
  }

  @Post('schemes')
  createScheme(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffSalarySchemeDto,
  ) {
    return this.staffSalaryService.createScheme(user, dto);
  }

  @Patch('schemes/:id')
  updateScheme(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffSalarySchemeDto,
  ) {
    return this.staffSalaryService.updateScheme(user, id, dto);
  }
}
