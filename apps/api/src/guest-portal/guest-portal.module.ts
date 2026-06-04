import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [GuestPortalController],
  providers: [GuestPortalService],
})
export class GuestPortalModule {}
