import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshNetworkScopeGuard } from '../tenancy/fresh-network-scope.guard';
import {
  GuestTelegramCampaignService,
  type MarketingCampaignTelegram,
  type MarketingCampaignTelegramSendResult,
  type TelegramCampaignDraftDto,
} from './guest-telegram-campaign.service';

// Telegram broadcast of a marketing campaign. Corporate contour: the roles
// guard maps /marketing to view_marketing (GET) / manage_marketing (writes);
// sending to the whole guest group also needs fresh NETWORK scope.
@Controller('marketing/campaigns/:id/telegram')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.BUYER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingCampaignTelegramController {
  constructor(private readonly campaigns: GuestTelegramCampaignService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarketingCampaignTelegram> {
    return this.campaigns.get(user, id);
  }

  @Post('draft')
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TelegramCampaignDraftDto,
  ): Promise<MarketingCampaignTelegram> {
    return this.campaigns.saveDraft(user, id, dto ?? {});
  }

  @Post('send')
  @UseGuards(FreshNetworkScopeGuard)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarketingCampaignTelegramSendResult> {
    return this.campaigns.send(user, id);
  }
}
