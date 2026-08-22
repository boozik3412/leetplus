import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertScheduledHttpAllowed } from '../config/design-partner-runtime-policy';
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
    this.assertEnabled(dto);
    this.assertToken(token);

    return this.reportsDigestService.sendScheduledDigests(dto);
  }

  private assertEnabled(dto: SendScheduledReportDigestDto) {
    assertScheduledHttpAllowed(this.configService);

    if (
      this.configService.get<string>('REPORT_DIGEST_SCHEDULED_HTTP_ENABLED') !==
      'true'
    ) {
      throw new ServiceUnavailableException(
        'Scheduled report digest HTTP execution is disabled',
      );
    }

    if (dto.dryRun !== true) {
      throw new ServiceUnavailableException(
        'Scheduled report digest write execution requires the persisted run coordinator',
      );
    }
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
