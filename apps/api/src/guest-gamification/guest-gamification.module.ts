import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StaffModule } from '../staff/staff.module';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import { GuestGamificationLogService } from './guest-gamification-log.service';
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
    GuestBonusLedgerService,
    GuestBonusLedgerSchedulerService,
  ],
  exports: [
    GuestGamificationService,
    GuestGamificationLogService,
    GuestActivityLedgerService,
  ],
})
export class GuestGamificationModule {}
