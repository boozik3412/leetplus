import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestGamificationService,
  type GuestGameScheduledPipelineRunDto,
  type GuestGameScheduledPipelineRunResult,
} from './guest-gamification.service';

@Controller('guests/gamification/scheduled')
export class GuestGamificationScheduledController {
  constructor(
    private readonly configService: ConfigService,
    private readonly gamificationService: GuestGamificationService,
  ) {}

  @Post('pipeline/run')
  runScheduledPipeline(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: GuestGameScheduledPipelineRunDto,
  ): Promise<GuestGameScheduledPipelineRunResult> {
    this.assertToken(token);

    return this.gamificationService.runSnapshotPipelineScheduled(dto);
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
