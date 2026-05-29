import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportsDigestService } from './reports-digest.service';
import type { SendScheduledReportDigestDto } from './reports.dto';

@Controller('reports/digests/scheduled')
export class ReportsDigestScheduledController {
  constructor(
    private readonly configService: ConfigService,
    private readonly reportsDigestService: ReportsDigestService,
  ) {}

  @Post()
  sendScheduledDigests(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: SendScheduledReportDigestDto,
  ) {
    this.assertToken(token);

    return this.reportsDigestService.sendScheduledDigests(dto);
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
