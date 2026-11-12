import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshNetworkScopeGuard } from '../tenancy/fresh-network-scope.guard';
import {
  GuestVisitRatingService,
  type VisitRatingReport,
  type VisitRatingSettingsDto,
} from './guest-visit-rating.service';

// «Оценки визитов» report and the network switch. Corporate contour: the
// roles guard maps /marketing to view_marketing (GET) / manage_marketing
// (writes). The report re-reads the store scope; a STORES user sees only own
// clubs. Switching the bot question on or off needs fresh NETWORK scope.
@Controller('marketing/visit-ratings')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.BUYER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingVisitRatingController {
  constructor(private readonly ratings: GuestVisitRatingService) {}

  @Get()
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ): Promise<VisitRatingReport> {
    return this.ratings.report(user, days);
  }

  @Post('settings')
  @UseGuards(FreshNetworkScopeGuard)
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VisitRatingSettingsDto,
  ): Promise<VisitRatingReport> {
    return this.ratings.saveSettings(user, dto ?? {});
  }
}
