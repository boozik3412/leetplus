import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestGamificationScheduledController } from './guest-gamification-scheduled.controller';
import { GuestGamificationController } from './guest-gamification.controller';
import { GuestGamificationService } from './guest-gamification.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [
    GuestGamificationController,
    GuestGamificationScheduledController,
  ],
  providers: [GuestGamificationService, GuestBonusLedgerService],
  exports: [GuestGamificationService],
})
export class GuestGamificationModule {}
