import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { GuestIdentityResolverService } from '../integrations/guest-identity-resolver.service';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import {
  loadGuestBonusLedgerWorkerConfig,
  runGuestBonusLedgerWorkerOnce,
} from './guest-bonus-ledger-worker';
import { GuestGamificationService } from './guest-gamification.service';
import { GuestGameLedgerFallbackService } from './guest-game-ledger-fallback.service';
import {
  loadGuestGamificationWorkerConfig,
  runGuestGamificationWorkerOnce,
} from './guest-gamification-worker';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';

const disabledInProcessBonusScheduler = {
  requestRun: () => undefined,
  getRuntimeStatus: () => ({
    enabled: false,
    running: false,
    intervalMs: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastOutcome: null,
    lastError: null,
    lastResult: null,
    lastSkippedAt: null,
    lastSkipReason: 'owned by the systemd singleton worker',
  }),
};

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
    GuestIdentityResolverService,
    GuestActivityLedgerService,
    GuestBonusLedgerService,
    GuestGamificationService,
    GuestGameLedgerFallbackService,
    GuestGameQualityMonitoringService,
    {
      provide: GuestBonusLedgerSchedulerService,
      useValue: disabledInProcessBonusScheduler,
    },
  ],
})
class GuestBonusLedgerWorkerModule {}

async function main() {
  // Reject a missing/unsafe dedicated worker profile before Prisma connects.
  loadGuestBonusLedgerWorkerConfig();
  loadGuestGamificationWorkerConfig();

  const application = await NestFactory.createApplicationContext(
    GuestBonusLedgerWorkerModule,
    { logger: ['error', 'warn'] },
  );

  try {
    await runGuestBonusLedgerWorkerOnce(
      application.get(GuestBonusLedgerService),
    );
    await runGuestGamificationWorkerOnce({
      prisma: application.get(PrismaService),
      activityLedger: application.get(GuestActivityLedgerService),
      ledgerFallback: application.get(GuestGameLedgerFallbackService),
      gamification: application.get(GuestGamificationService),
      monitoring: application.get(GuestGameQualityMonitoringService),
    });
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
