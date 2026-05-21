import {
  Body,
  Controller,
  Delete,
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
  GuestsService,
  type GuestCrmUpdateDto,
  type GuestFilterOptions,
  type GuestDetail,
  type GuestListQuery,
  type GuestListResponse,
  type StaffIdentityMappingDto,
  type StaffIdentityMappingResult,
  type StaffOperatorReport,
  type StaffOperatorReportQuery,
  type StaffControlQuery,
  type StaffControlReport,
  type GuestsSummary,
  type GuestsSummaryQuery,
} from './guests.service';

@Controller('guests')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get('filter-options')
  getFilterOptions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestFilterOptions> {
    return this.guestsService.getFilterOptions(user);
  }

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestsSummaryQuery,
  ): Promise<GuestsSummary> {
    return this.guestsService.getSummary(user, query);
  }

  @Get()
  getGuests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestListQuery,
  ): Promise<GuestListResponse> {
    return this.guestsService.getGuests(user, query);
  }

  @Get('staff-control')
  getStaffControl(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffControlQuery,
  ): Promise<StaffControlReport> {
    return this.guestsService.getStaffControl(user, query);
  }

  @Get('staff-control/operators')
  getStaffOperators(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperatorReportQuery,
  ): Promise<StaffOperatorReport> {
    return this.guestsService.getStaffOperators(user, query);
  }

  @Post('staff-control/identity-mappings')
  mapStaffIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffIdentityMappingDto,
  ): Promise<StaffIdentityMappingResult> {
    return this.guestsService.mapStaffIdentity(user, dto);
  }

  @Delete('staff-control/identity-mappings/:id')
  unmapStaffIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ id: string; updatedShifts: number }> {
    return this.guestsService.unmapStaffIdentity(user, id);
  }

  @Get(':id')
  getGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GuestDetail> {
    return this.guestsService.getGuest(user, id);
  }

  @Patch(':id/crm')
  updateGuestCrm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestCrmUpdateDto,
  ): Promise<GuestDetail> {
    return this.guestsService.updateGuestCrm(user, id, dto);
  }
}
