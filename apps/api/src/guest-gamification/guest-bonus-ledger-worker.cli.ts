import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import {
  loadGuestBonusLedgerWorkerConfig,
  runGuestBonusLedgerWorkerOnce,
} from './guest-bonus-ledger-worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    TenancyModule,
  ],
  providers: [
    LangameClient,
    LangameSettingsService,
    SecretEncryptionService,
    GuestBonusLedgerService,
  ],
})
class GuestBonusLedgerWorkerModule {}

async function main() {
  // Reject a missing/unsafe dedicated worker profile before Prisma connects.
  loadGuestBonusLedgerWorkerConfig();

  const application = await NestFactory.createApplicationContext(
    GuestBonusLedgerWorkerModule,
    { logger: ['error', 'warn'] },
  );

  try {
    await runGuestBonusLedgerWorkerOnce(
      application.get(GuestBonusLedgerService),
    );
  } finally {
    await application.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Guest bonus ledger worker failed: ${message}`);
    process.exitCode = 1;
  });
}
