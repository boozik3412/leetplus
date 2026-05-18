import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GuestDataFoundationService } from './guest-data-foundation.service';
import { LangameClient } from './langame.client';
import { LangameController } from './langame.controller';
import { LangameScheduledController } from './langame-scheduled.controller';
import { LangameSettingsService } from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import { SecretEncryptionService } from './secret-encryption.service';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule, TenancyModule],
  controllers: [LangameController, LangameScheduledController],
  providers: [
    LangameClient,
    GuestDataFoundationService,
    LangameSettingsService,
    LangameSyncService,
    SecretEncryptionService,
  ],
  exports: [
    GuestDataFoundationService,
    LangameSettingsService,
    LangameSyncService,
  ],
})
export class IntegrationsModule {}
