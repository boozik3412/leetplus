import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GuestsService,
  type GuestDetail,
  type GuestListQuery,
  type GuestListResponse,
  type GuestsSummary,
  type GuestsSummaryQuery,
} from './guests.service';

@Controller('guests')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

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

  @Get(':id')
  getGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GuestDetail> {
    return this.guestsService.getGuest(user, id);
  }
}
