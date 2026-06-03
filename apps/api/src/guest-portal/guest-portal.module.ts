import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';

@Module({
  imports: [AuthModule],
  controllers: [GuestPortalController],
  providers: [GuestPortalService],
})
export class GuestPortalModule {}
