import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from '../admin/admin.module';
import { AppService } from '../app.service';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { validateEnvironment } from '../config/environment-validation';
import { DashboardModule } from '../dashboard/dashboard.module';
import { GuestsModule } from '../guests/guests.module';
import { ImportsModule } from '../imports/imports.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MarketingModule } from '../marketing/marketing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { ReportsModule } from '../reports/reports.module';
import { SettingsModule } from '../settings/settings.module';
import { StaffModule } from '../staff/staff.module';
import { StoresModule } from '../stores/stores.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { SupportModule } from '../support/support.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UtilitiesModule } from '../utilities/utilities.module';
import { UsersModule } from '../users/users.module';
import { CorporateGuestGamificationModule } from './corporate-guest-gamification.module';
import { RuntimeHealthController } from './runtime-health.controller';

/** Corporate API runtime with no public guest controllers. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AdminModule,
    PrismaModule,
    TenancyModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    StoresModule,
    SuppliersModule,
    ImportsModule,
    IntegrationsModule,
    ReportsModule,
    DashboardModule,
    GuestsModule,
    CorporateGuestGamificationModule,
    MarketingModule,
    SettingsModule,
    StaffModule,
    SupportModule,
    UtilitiesModule,
    UsersModule,
  ],
  controllers: [RuntimeHealthController],
  providers: [AppService],
})
export class CorporateRuntimeModule {}
