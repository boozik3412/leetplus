import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { LangameClient } from './langame.client';
import { LangameController } from './langame.controller';
import { LangameSettingsService } from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import { SecretEncryptionService } from './secret-encryption.service';

@Module({
  imports: [ConfigModule, PrismaModule, TenancyModule],
  controllers: [LangameController],
  providers: [
    LangameClient,
    LangameSettingsService,
    LangameSyncService,
    SecretEncryptionService,
  ],
  exports: [LangameSettingsService, LangameSyncService],
})
export class IntegrationsModule {}
