import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
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
  type MarketingCampaignEffect,
  type MarketingCampaignExportFile,
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

  @Get('campaigns/:id')
  getCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarketingCampaign> {
    return this.marketingService.getCampaign(user, id);
  }

  @Get('campaigns/:id/effect')
  getCampaignEffect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarketingCampaignEffect> {
    return this.marketingService.getCampaignEffect(user, id);
  }

  @Get('campaigns/:id/export')
  async exportCampaignResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('format') format?: string,
  ): Promise<StreamableFile> {
    const file: MarketingCampaignExportFile =
      await this.marketingService.exportCampaignResults(user, id, { format });

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
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

  @Post('campaigns/:id/crm-task')
  createCampaignCrmTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarketingCampaign> {
    return this.marketingService.createCampaignCrmTask(user, id);
  }
}
