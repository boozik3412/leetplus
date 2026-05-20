import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [GuestsController],
  providers: [GuestsService],
})
export class GuestsModule {}
