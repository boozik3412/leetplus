import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssortmentHealthLoaderService } from '../common/assortment-health-loader.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, AssortmentHealthLoaderService],
})
export class DashboardModule {}
