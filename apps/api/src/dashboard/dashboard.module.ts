import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssortmentHealthLoaderService } from '../common/assortment-health-loader.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSetupProgressService } from './dashboard-setup-progress.service';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardSetupProgressService,
    AssortmentHealthLoaderService,
  ],
})
export class DashboardModule {}
