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
import {
  LangameSettingsService,
  type LangameSettingsDto,
} from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import type { LangameSyncQuery } from './langame.types';

@Controller('integrations/langame')
@UseGuards(JwtAuthGuard)
export class LangameController {
  constructor(
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameSyncService: LangameSyncService,
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
}
