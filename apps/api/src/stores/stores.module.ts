import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestsModule } from '../guests/guests.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StaffModule } from '../staff/staff.module';
import { StoresController } from './stores.controller';
import { StoreClosuresService } from './store-closures.service';
import { StoreDeletionService } from './store-deletion.service';
import { StoreFloorPlanAttentionService } from './store-floor-plan-attention.service';
import { StoreFloorPlanLiveService } from './store-floor-plan-live.service';
import { StoreFloorPlanShiftAdminService } from './store-floor-plan-shift-admin.service';
import { StoreFloorPlansController } from './store-floor-plans.controller';
import { StoreFloorPlansService } from './store-floor-plans.service';
import { StoreGuestAlertsController } from './store-guest-alerts.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [AuthModule, IntegrationsModule, GuestsModule, StaffModule],
  controllers: [
    StoresController,
    StoreFloorPlansController,
    StoreGuestAlertsController,
  ],
  providers: [
    StoresService,
    StoreClosuresService,
    StoreDeletionService,
    StoreFloorPlansService,
    StoreFloorPlanLiveService,
    StoreFloorPlanAttentionService,
    StoreFloorPlanShiftAdminService,
  ],
})
export class StoresModule {}
