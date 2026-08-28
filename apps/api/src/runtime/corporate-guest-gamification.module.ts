import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestGameMediaController } from '../guest-gamification/guest-game-media.controller';
import {
  GUEST_GAMIFICATION_EXPORTS,
  GUEST_GAMIFICATION_PROVIDERS,
} from '../guest-gamification/guest-gamification.module';
import { GuestGamificationScheduledController } from '../guest-gamification/guest-gamification-scheduled.controller';
import { GuestGamificationController } from '../guest-gamification/guest-gamification.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StaffModule } from '../staff/staff.module';

/**
 * Tenant-authenticated game administration and controlled jobs. The public
 * media controller lives only in GuestRuntimeModule, so the corporate process
 * cannot accidentally expose a guest HTTP surface even before its perimeter.
 */
@Module({
  imports: [AuthModule, IntegrationsModule, StaffModule],
  controllers: [
    GuestGamificationController,
    GuestGamificationScheduledController,
    GuestGameMediaController,
  ],
  providers: [...GUEST_GAMIFICATION_PROVIDERS],
  exports: [...GUEST_GAMIFICATION_EXPORTS],
})
export class CorporateGuestGamificationModule {}
