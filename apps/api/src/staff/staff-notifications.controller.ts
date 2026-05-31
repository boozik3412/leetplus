import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffNotificationsService,
  type StaffNotificationsQuery,
} from './staff-notifications.service';

@Controller('staff/notifications')
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
export class StaffNotificationsController {
  constructor(
    private readonly staffNotificationsService: StaffNotificationsService,
  ) {}

  @Get()
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffNotificationsQuery,
  ) {
    return this.staffNotificationsService.getReport(user, query);
  }

  @Post('sync-signals')
  syncSignals(@CurrentUser() user: AuthenticatedUser) {
    return this.staffNotificationsService.syncSignals(user);
  }

  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staffNotificationsService.acknowledge(user, id);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staffNotificationsService.resolve(user, id);
  }
}
