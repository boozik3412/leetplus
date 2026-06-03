import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestGamificationScheduledController } from './guest-gamification-scheduled.controller';
import { GuestGamificationController } from './guest-gamification.controller';
import { GuestGamificationService } from './guest-gamification.service';

@Module({
  imports: [AuthModule],
  controllers: [
    GuestGamificationController,
    GuestGamificationScheduledController,
  ],
  providers: [GuestGamificationService],
})
export class GuestGamificationModule {}
