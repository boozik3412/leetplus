import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BusinessSnapshotService } from './business-snapshot.service';
import { GuestDataFoundationService } from './guest-data-foundation.service';
import { GuestIdentityResolverService } from './guest-identity-resolver.service';
import { LangameClient } from './langame.client';
import { LangameDailySyncService } from './langame-daily-sync.service';
import type { DailySyncResult } from './langame-daily-sync.service';
import { LangameExternalRunLeaseService } from './langame-external-run-lease.service';
import { withExactExternalImportLock } from './langame-external-import-lock';
import { LangameSettingsService } from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';
import { SecretEncryptionService } from './secret-encryption.service';
import {
  loadLangameExternalWorkerConfig,
  externalWorkerBusinessDate,
  externalWorkerTerminal,
  ExternalWorkerIncompleteError,
  runLangameExternalWorkerOnce,
} from './langame-external-daily-worker';

// Dedicated worker process: no HTTP controllers, bonus ledger, reward or
// retention modules. Compose signed grant and secret profile gate startup.
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
    LangameClient,
    LangameDailySyncService,
    LangameExternalRunLeaseService,
    LangameSettingsService,
    LangameSyncService,
    SecretEncryptionService,
  ],
})
export class LangameExternalWorkerModule {}

async function main() {
  if (process.env.LANGAME_EXTERNAL_WORKER_ENABLED !== 'true') {
    console.error('EXTERNAL_WORKER_DISABLED_PROFILE');
    process.exitCode = 1;
    return;
  }
  const config = loadLangameExternalWorkerConfig();
  const businessDate = externalWorkerBusinessDate(config);
  const app = await NestFactory.createApplicationContext(
    LangameExternalWorkerModule,
    // Nest ConsoleLogger.warn writes to stdout. This process reserves stdout
    // exclusively for the one compact terminal JSON; progress is explicit stderr.
    { logger: false },
  );
  try {
    await withExactExternalImportLock(config.authority.tenantId, async () => {
      const lease = app.get(LangameExternalRunLeaseService);
      const acquisition = await lease.acquire(config, businessDate);
      if (acquisition.status === 'REPLAY') {
        process.stdout.write(`${JSON.stringify(acquisition.terminal)}\n`);
        // Native control must reconcile the original receipt, never publish a
        // second PASS for this day from a replayed application result.
        process.exitCode = 75;
        return;
      }
      let syncResult: DailySyncResult | undefined;
      let syncError: unknown;
      try {
        syncResult = await runLangameExternalWorkerOnce(
          app.get(LangameDailySyncService),
          process.env,
          { log: (message) => console.error(message) },
        );
      } catch (error) {
        syncError = error;
      }
      const terminal = externalWorkerTerminal(
        config,
        businessDate,
        syncResult ??
          (syncError instanceof ExternalWorkerIncompleteError
            ? syncError.result
            : undefined),
      );
      await lease.complete(config, businessDate, terminal);
      process.stdout.write(`${JSON.stringify(terminal)}\n`);
      if (syncError || terminal.decision === 'FAILED') {
        console.error(
          `External Langame worker failed: ${syncError instanceof ExternalWorkerIncompleteError ? syncError.message : 'unexpected execution error'}`,
        );
        process.exitCode = 1;
      }
    });
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `External Langame worker failed: ${error instanceof ExternalWorkerIncompleteError ? error.message : 'unexpected startup or receipt error'}`,
    );
    process.exitCode = 1;
  });
}
