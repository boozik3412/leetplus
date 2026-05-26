import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  MarketingService,
  type MarketingCampaign,
  type MarketingCampaignDto,
  type MarketingCampaignUpdateDto,
} from './marketing.service';

@Controller('marketing')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get('campaigns')
  getCampaigns(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingCampaign[]> {
    return this.marketingService.getCampaigns(user);
  }

  @Post('campaigns')
  createCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarketingCampaignDto,
  ): Promise<MarketingCampaign> {
    return this.marketingService.createCampaign(user, dto);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarketingCampaignUpdateDto,
  ): Promise<MarketingCampaign> {
    return this.marketingService.updateCampaign(user, id, dto);
  }
}
