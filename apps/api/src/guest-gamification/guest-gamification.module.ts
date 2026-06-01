import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestGamificationController } from './guest-gamification.controller';
import { GuestGamificationService } from './guest-gamification.service';

@Module({
  imports: [AuthModule],
  controllers: [GuestGamificationController],
  providers: [GuestGamificationService],
})
export class GuestGamificationModule {}
