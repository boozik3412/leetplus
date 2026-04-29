import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LangameSyncService } from './langame-sync.service';
import type { LangameSyncQuery } from './langame.types';

@Controller('integrations/langame')
@UseGuards(JwtAuthGuard)
export class LangameController {
  constructor(private readonly langameSyncService: LangameSyncService) {}

  @Post('sync')
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() query: LangameSyncQuery,
  ) {
    return this.langameSyncService.syncTenant(user, query);
  }
}
