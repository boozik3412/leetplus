import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
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

@Controller('settings')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly brandingSettingsService: BrandingSettingsService,
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
}
