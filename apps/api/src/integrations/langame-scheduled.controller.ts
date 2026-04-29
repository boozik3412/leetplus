import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LangameSyncService } from './langame-sync.service';
import type { LangameSyncQuery } from './langame.types';

@Controller('integrations/langame/scheduled')
export class LangameScheduledController {
  constructor(
    private readonly configService: ConfigService,
    private readonly langameSyncService: LangameSyncService,
  ) {}

  @Post('sync')
  sync(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() query: LangameSyncQuery,
  ) {
    this.assertToken(token);

    return this.langameSyncService.syncConfiguredTenants({
      ...query,
      mode: query.mode ?? 'QUICK',
      trigger: 'AUTO',
    });
  }

  private assertToken(token: string | undefined) {
    const expectedToken = this.configService
      .get<string>('SYNC_SERVICE_TOKEN')
      ?.trim();

    if (!expectedToken) {
      throw new UnauthorizedException('SYNC_SERVICE_TOKEN is not configured');
    }

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid sync service token');
    }
  }
}
