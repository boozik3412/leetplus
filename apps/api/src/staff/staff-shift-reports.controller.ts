import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffShiftReportsService,
  type StaffShiftReportSendDto,
} from './staff-shift-reports.service';

@Controller('staff/shift-reports')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
  UserRole.TRAINEE,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffShiftReportsController {
  constructor(
    private readonly staffShiftReportsService: StaffShiftReportsService,
  ) {}

  @Get('draft')
  getDraft(@CurrentUser() user: AuthenticatedUser) {
    return this.staffShiftReportsService.getDraft(user);
  }

  @Post('send')
  sendReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffShiftReportSendDto,
  ) {
    return this.staffShiftReportsService.sendReport(user, dto);
  }
}
