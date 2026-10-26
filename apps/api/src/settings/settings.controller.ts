import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BrandingSettingsService,
  type BrandingSettingsDto,
} from './branding-settings.service';
import { DailyReportBotService } from '../daily-report/daily-report-bot.service';

@Controller('settings')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly brandingSettingsService: BrandingSettingsService,
    private readonly dailyReportBotService: DailyReportBotService,
  ) {}

  @Get('branding')
  getBranding(@CurrentUser() user: AuthenticatedUser) {
    return this.brandingSettingsService.getSettings(user);
  }

  @Put('branding')
  saveBranding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BrandingSettingsDto,
  ) {
    return this.brandingSettingsService.saveSettings(user, dto);
  }

  @Get('daily-report-bot')
  getDailyReportBot(@CurrentUser() user: AuthenticatedUser) {
    return this.dailyReportBotService.getSettings(user);
  }

  @Post('daily-report-bot/token')
  saveDailyReportBotToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token?: unknown },
  ) {
    return this.dailyReportBotService.saveToken(user, body);
  }

  @Delete('daily-report-bot/token')
  deleteDailyReportBotToken(@CurrentUser() user: AuthenticatedUser) {
    return this.dailyReportBotService.deleteToken(user);
  }

  @Patch('daily-report-bot/recipients/:userId')
  setDailyReportRecipient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: { enabled?: unknown },
  ) {
    return this.dailyReportBotService.setRecipient(user, userId, body);
  }

  @Post('daily-report-bot/recipients/:userId/link')
  createDailyReportRecipientLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.dailyReportBotService.createLink(user, userId);
  }
}
