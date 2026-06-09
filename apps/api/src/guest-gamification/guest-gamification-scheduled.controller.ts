import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestBonusLedgerService,
  type GuestGameScheduledBonusLedgerDispatchDto,
  type GuestGameScheduledBonusLedgerDispatchResult,
} from './guest-bonus-ledger.service';
import {
  GuestGamificationService,
  type GuestGameScheduledDeliveryDispatchDto,
  type GuestGameScheduledDeliveryDispatchResult,
  type GuestGameScheduledPipelineRunDto,
  type GuestGameScheduledPipelineRunResult,
} from './guest-gamification.service';

@Controller('guests/gamification/scheduled')
export class GuestGamificationScheduledController {
  constructor(
    private readonly configService: ConfigService,
    private readonly gamificationService: GuestGamificationService,
    private readonly bonusLedgerService: GuestBonusLedgerService,
  ) {}

  @Post('pipeline/run')
  runScheduledPipeline(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: GuestGameScheduledPipelineRunDto,
  ): Promise<GuestGameScheduledPipelineRunResult> {
    this.assertToken(token);

    return this.gamificationService.runSnapshotPipelineScheduled(dto);
  }

  @Post('deliveries/dispatch')
  runScheduledDeliveryDispatch(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: GuestGameScheduledDeliveryDispatchDto,
  ): Promise<GuestGameScheduledDeliveryDispatchResult> {
    this.assertToken(token);

    return this.gamificationService.runDeliveryDispatchScheduled(dto);
  }

  @Post('bonus-ledger/dispatch')
  runScheduledBonusLedgerDispatch(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: GuestGameScheduledBonusLedgerDispatchDto,
  ): Promise<GuestGameScheduledBonusLedgerDispatchResult> {
    this.assertToken(token);

    return this.bonusLedgerService.runScheduledDispatch(dto);
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
