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
  type MarketingPromoBundle,
  type MarketingPromoBundleDto,
  type MarketingPromoBundleUpdateDto,
  type MarketingPromoBundleLaunch,
  type MarketingPromoBundleLaunchDto,
  type MarketingPromoBundleLaunchUpdateDto,
  type MarketingPromoBundleReconciliation,
  type MarketingPromoBundleUsage,
  type MarketingPromoBundleUsageDto,
  type MarketingPromoBundleUsageImportDto,
  type MarketingPromoBundleUsageImportResult,
  type MarketingPromoBundleUsageUpdateDto,
} from './marketing.service';

@Controller('marketing')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.BUYER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get('campaigns')
  getCampaigns(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingCampaign[]> {
    return this.marketingService.getCampaigns(user);
  }

  @Get('promo-bundles')
  getPromoBundles(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingPromoBundle[]> {
    return this.marketingService.getPromoBundles(user);
  }

  @Get('promo-bundle-launches')
  getPromoBundleLaunches(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleLaunch[]> {
    return this.marketingService.getPromoBundleLaunches(user);
  }

  @Get('promo-bundle-usages')
  getPromoBundleUsages(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleUsage[]> {
    return this.marketingService.getPromoBundleUsages(user);
  }

  @Get('promo-bundle-reconciliation')
  getPromoBundleReconciliation(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleReconciliation[]> {
    return this.marketingService.getPromoBundleReconciliation(user);
  }

  @Post('promo-bundles')
  createPromoBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarketingPromoBundleDto,
  ): Promise<MarketingPromoBundle> {
    return this.marketingService.createPromoBundle(user, dto);
  }

  @Patch('promo-bundles/:id')
  updatePromoBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarketingPromoBundleUpdateDto,
  ): Promise<MarketingPromoBundle> {
    return this.marketingService.updatePromoBundle(user, id, dto);
  }

  @Post('promo-bundle-launches')
  createPromoBundleLaunch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarketingPromoBundleLaunchDto,
  ): Promise<MarketingPromoBundleLaunch> {
    return this.marketingService.createPromoBundleLaunch(user, dto);
  }

  @Patch('promo-bundle-launches/:id')
  updatePromoBundleLaunch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarketingPromoBundleLaunchUpdateDto,
  ): Promise<MarketingPromoBundleLaunch> {
    return this.marketingService.updatePromoBundleLaunch(user, id, dto);
  }

  @Post('promo-bundle-usages')
  createPromoBundleUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarketingPromoBundleUsageDto,
  ): Promise<MarketingPromoBundleUsage> {
    return this.marketingService.createPromoBundleUsage(user, dto);
  }

  @Post('promo-bundle-usages/import')
  importPromoBundleUsages(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarketingPromoBundleUsageImportDto,
  ): Promise<MarketingPromoBundleUsageImportResult> {
    return this.marketingService.importPromoBundleUsages(user, dto);
  }

  @Patch('promo-bundle-usages/:id')
  updatePromoBundleUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarketingPromoBundleUsageUpdateDto,
  ): Promise<MarketingPromoBundleUsage> {
    return this.marketingService.updatePromoBundleUsage(user, id, dto);
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
