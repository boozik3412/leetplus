import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DailyReportBotService } from '../daily-report/daily-report-bot.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { BrandingSettingsService } from './branding-settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [SettingsController],
  providers: [
    BrandingSettingsService,
    DailyReportBotService,
    SecretEncryptionService,
  ],
})
export class SettingsModule {}
