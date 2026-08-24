import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GuestsService,
  type StaffOperatorReportQuery,
} from '../guests/guests.service';
import { FreshStoreScopeGuard } from '../tenancy/fresh-store-scope.guard';
import { StaffDirectoryService } from './staff-directory.service';

@Controller('staff/shift-workspace')
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
@UseGuards(JwtAuthGuard, RolesGuard, FreshStoreScopeGuard)
export class StaffShiftWorkspaceController {
  constructor(
    private readonly staffDirectoryService: StaffDirectoryService,
    private readonly guestsService: GuestsService,
  ) {}

  @Get('profile')
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Pick<StaffOperatorReportQuery, 'dateFrom' | 'dateTo'>,
  ) {
    const profile = await this.staffDirectoryService.getCurrentMember(user);
    const staffMember = profile.staffMember;
    const operator = staffMember?.externalUserId
      ? await this.guestsService.getShiftWorkspaceOperator(user, {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          storeId: staffMember.store?.id ?? null,
          externalDomain: staffMember.externalDomain,
          externalUserId: staffMember.externalUserId,
        })
      : null;

    return { ...profile, operator };
  }
}
