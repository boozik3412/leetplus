import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import {
  GuestDataFoundationService,
  type GuestDataFoundationSyncQuery,
} from './guest-data-foundation.service';
import {
  LangameSettingsService,
  type LangameSettingsDto,
} from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import type { LangameSyncQuery } from './langame.types';

@Controller('integrations/langame')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class LangameController {
  constructor(
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameSyncService: LangameSyncService,
    private readonly guestDataFoundationService: GuestDataFoundationService,
  ) {}

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.langameSettingsService.getSettings(user);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LangameSettingsDto,
  ) {
    return this.langameSettingsService.saveSettings(user, dto);
  }

  @Get('sync-jobs/:id/discrepancy-log')
  getDiscrepancyLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.langameSettingsService.getDiscrepancyLog(user, id);
  }

  @Post('sync')
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() query: LangameSyncQuery,
  ) {
    return this.langameSyncService.syncTenant(user, query);
  }

  @Post('guests/foundation/sync')
  syncGuestDataFoundation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() query: GuestDataFoundationSyncQuery,
  ) {
    return this.guestDataFoundationService.syncTenant(user, query);
  }

  @Post('guests/foundation/sync/start')
  startGuestDataFoundationSync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() query: GuestDataFoundationSyncQuery,
  ) {
    return this.guestDataFoundationService.startTenantSync(user, query);
  }

  @Get('guests/foundation/sync/status')
  getGuestDataFoundationSyncStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.guestDataFoundationService.getTenantSyncStatus(user);
  }
}
