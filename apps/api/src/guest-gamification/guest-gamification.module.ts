import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StaffModule } from '../staff/staff.module';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import { GuestActivityLedgerSchedulerService } from './guest-activity-ledger-scheduler.service';
import { GuestGamificationLogService } from './guest-gamification-log.service';
import { GuestGameDataRetentionSchedulerService } from './guest-game-data-retention-scheduler.service';
import { GuestGameDataRetentionService } from './guest-game-data-retention.service';
import { GuestGameQualityMonitoringSchedulerService } from './guest-game-quality-monitoring-scheduler.service';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';
import { GuestGamificationScheduledController } from './guest-gamification-scheduled.controller';
import { GuestGamificationController } from './guest-gamification.controller';
import { GuestGamificationService } from './guest-gamification.service';

@Module({
  imports: [AuthModule, IntegrationsModule, StaffModule],
  controllers: [
    GuestGamificationController,
    GuestGamificationScheduledController,
  ],
  providers: [
    GuestGamificationService,
    GuestGamificationLogService,
    GuestActivityLedgerService,
    GuestActivityLedgerSchedulerService,
    GuestGameDataRetentionService,
    GuestGameDataRetentionSchedulerService,
    GuestGameQualityMonitoringService,
    GuestGameQualityMonitoringSchedulerService,
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
