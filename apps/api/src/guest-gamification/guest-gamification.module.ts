import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StaffModule } from '../staff/staff.module';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import { GuestActivityLedgerSchedulerService } from './guest-activity-ledger-scheduler.service';
import { GuestGamificationLogService } from './guest-gamification-log.service';
import { GuestGamificationPipelineSchedulerService } from './guest-gamification-pipeline-scheduler.service';
import { GuestGamificationSupplementalPipelineSchedulerService } from './guest-gamification-supplemental-pipeline-scheduler.service';
import { GuestGameDataRetentionSchedulerService } from './guest-game-data-retention-scheduler.service';
import { GuestGameDataRetentionService } from './guest-game-data-retention.service';
import { GuestGameLedgerFallbackSchedulerService } from './guest-game-ledger-fallback-scheduler.service';
import { GuestGameLedgerFallbackService } from './guest-game-ledger-fallback.service';
import { GuestGameLootBoxSessionRecoverySchedulerService } from './guest-game-loot-box-session-recovery-scheduler.service';
import { GuestGameLootBoxSessionRecoveryService } from './guest-game-loot-box-session-recovery.service';
import { GuestGameQualityMonitoringSchedulerService } from './guest-game-quality-monitoring-scheduler.service';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';
import { GuestGameRewardMaterializerSchedulerService } from './guest-game-reward-materializer-scheduler.service';
import { GuestGameRuleReplayService } from './guest-game-rule-replay.service';
import {
  GuestGameMediaController,
  GuestGamePublicMediaController,
} from './guest-game-media.controller';
import { GuestGameMediaService } from './guest-game-media.service';
import { GuestGamificationScheduledController } from './guest-gamification-scheduled.controller';
import { GuestGamificationController } from './guest-gamification.controller';
import { GuestGamificationService } from './guest-gamification.service';

@Module({
  imports: [AuthModule, IntegrationsModule, StaffModule],
  controllers: [
    GuestGamificationController,
    GuestGamificationScheduledController,
    GuestGameMediaController,
    GuestGamePublicMediaController,
  ],
  providers: [
    GuestGamificationService,
    GuestGamificationPipelineSchedulerService,
    GuestGamificationSupplementalPipelineSchedulerService,
    GuestGamificationLogService,
    GuestActivityLedgerService,
    GuestActivityLedgerSchedulerService,
    GuestGameDataRetentionService,
    GuestGameDataRetentionSchedulerService,
    GuestGameLedgerFallbackService,
    GuestGameLedgerFallbackSchedulerService,
    GuestGameLootBoxSessionRecoveryService,
    GuestGameLootBoxSessionRecoverySchedulerService,
    GuestGameQualityMonitoringService,
    GuestGameMediaService,
    GuestGameQualityMonitoringSchedulerService,
    GuestGameRewardMaterializerSchedulerService,
    GuestGameRuleReplayService,
    GuestBonusLedgerService,
    GuestBonusLedgerSchedulerService,
  ],
  exports: [
    GuestGamificationService,
    GuestGamificationLogService,
    GuestActivityLedgerService,
    GuestGameQualityMonitoringService,
  ],
})
export class GuestGamificationModule {}
