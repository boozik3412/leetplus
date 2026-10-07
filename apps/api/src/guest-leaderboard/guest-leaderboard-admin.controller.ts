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
import { FreshNetworkScopeGuard } from '../tenancy/fresh-network-scope.guard';
import {
  GuestLeaderboardAdminService,
  type GuestLeaderboardAdminStandings,
  type GuestLeaderboardSettingsDto,
  type GuestLeaderboardSettingsResponse,
} from './guest-leaderboard-admin.service';

/**
 * Corporate administration of the guest leaderboard. Same roles, guards and
 * capability mapping as GuestGamificationController (GET →
 * view_guest_gamification, writes → manage_guest_game_rules).
 */
@Controller('guests/gamification/leaderboard')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard, FreshNetworkScopeGuard)
export class GuestLeaderboardAdminController {
  constructor(private readonly service: GuestLeaderboardAdminService) {}

  @Get('settings')
  getSettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestLeaderboardSettingsResponse> {
    return this.service.getSettings(user);
  }

  @Patch('settings')
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestLeaderboardSettingsDto,
  ): Promise<GuestLeaderboardSettingsResponse> {
    return this.service.saveSettings(user, dto ?? {});
  }

  @Get('standings')
  getStandings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: string,
    @Query('board') board?: string,
  ): Promise<GuestLeaderboardAdminStandings> {
    return this.service.getStandings(user, { scope, board });
  }

  @Post('profiles/:profileId/exclusion')
  setExclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
    @Body() dto: { excluded?: unknown },
  ) {
    return this.service.setExclusion(user, profileId, dto ?? {});
  }

  @Post('profiles/:profileId/reset-nickname')
  resetNickname(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
  ) {
    return this.service.resetNickname(user, profileId);
  }
}
