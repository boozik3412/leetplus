import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StoresController } from './stores.controller';
import { StoreClosuresService } from './store-closures.service';
import { StoreDeletionService } from './store-deletion.service';
import { StoreFloorPlanLiveService } from './store-floor-plan-live.service';
import { StoreFloorPlansController } from './store-floor-plans.controller';
import { StoreFloorPlansService } from './store-floor-plans.service';
import { StoresService } from './stores.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [StoresController, StoreFloorPlansController],
  providers: [
    StoresService,
    StoreClosuresService,
    StoreDeletionService,
    StoreFloorPlansService,
    StoreFloorPlanLiveService,
  ],
})
export class StoresModule {}
