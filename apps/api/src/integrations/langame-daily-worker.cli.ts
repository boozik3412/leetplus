import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { GuestActivityLedgerService } from '../guest-gamification/guest-activity-ledger.service';
import { GuestGameDataRetentionService } from '../guest-gamification/guest-game-data-retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BusinessSnapshotService } from './business-snapshot.service';
import { GuestDataFoundationService } from './guest-data-foundation.service';
import { GuestIdentityResolverService } from './guest-identity-resolver.service';
import { LangameClient } from './langame.client';
import { LangameDailySyncService } from './langame-daily-sync.service';
import { LangameSettingsService } from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import {
  loadLangameDailyWorkerConfig,
  runLangameDailyMaintenanceOnce,
  runLangameDailyWorkerOnce,
  runLangameExternalTenantsDailyOnce,
} from './langame-daily-worker';
import { SecretEncryptionService } from './secret-encryption.service';

// Deliberately no controllers: the systemd timer owns this unattended path.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    TenancyModule,
  ],
  providers: [
    BusinessSnapshotService,
    GuestDataFoundationService,
    GuestIdentityResolverService,
    GuestActivityLedgerService,
    GuestGameDataRetentionService,
    LangameClient,
    LangameDailySyncService,
    LangameSettingsService,
    LangameSyncService,
    SecretEncryptionService,
  ],
})
class LangameDailyWorkerModule {}

async function main() {
  // Validate the worker's fail-closed profile before Prisma opens a connection.
  loadLangameDailyWorkerConfig();

  const application = await NestFactory.createApplicationContext(
    LangameDailyWorkerModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const dailySync = application.get(LangameDailySyncService);
    // The primary tenant and its maintenance run first; external networks
    // still sync when it fails, and the process then reports every failure.
    let primaryError: unknown = null;
    try {
      const result = await runLangameDailyWorkerOnce(dailySync);
      await runLangameDailyMaintenanceOnce(result, {
        activityLedger: application.get(GuestActivityLedgerService),
        retention: application.get(GuestGameDataRetentionService),
      });
    } catch (error) {
      primaryError = error;
    }
    const external = await runLangameExternalTenantsDailyOnce(dailySync);
    const failures = [
      ...(primaryError
        ? [
            primaryError instanceof Error
              ? primaryError.message
              : 'primary tenant failed',
          ]
        : []),
      ...(external.failed.length
        ? [`External networks failed: ${external.failed.join(', ')}`]
        : []),
    ];
    if (failures.length > 0) throw new Error(failures.join('; '));
  } finally {
    await application.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Langame daily worker failed: ${message}`);
    process.exitCode = 1;
  });
}
