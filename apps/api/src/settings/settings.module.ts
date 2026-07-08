import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BrandingSettingsService } from './branding-settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [SettingsController],
  providers: [BrandingSettingsService],
})
export class SettingsModule {}
