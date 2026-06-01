import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GuestGamificationModule } from './guest-gamification/guest-gamification.module';
import { GuestsModule } from './guests/guests.module';
import { ImportsModule } from './imports/imports.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MarketingModule } from './marketing/marketing.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';
import { StaffModule } from './staff/staff.module';
import { StoresModule } from './stores/stores.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UtilitiesModule } from './utilities/utilities.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
    GuestGamificationModule,
    MarketingModule,
    StaffModule,
    UtilitiesModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
