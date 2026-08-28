import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GuestGamificationModule } from '../guest-gamification/guest-gamification.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';

@Module({
  // Guest tokens always provide their own purpose and secret. Do not obtain
  // JwtService from the corporate AuthModule; shared domain modules below are
  // still process-local until the separate runtime-pool rollout.
  imports: [
    JwtModule.register({}),
    IntegrationsModule,
    GuestGamificationModule,
  ],
  controllers: [GuestPortalController],
  providers: [GuestPortalService],
})
export class GuestPortalModule {}
