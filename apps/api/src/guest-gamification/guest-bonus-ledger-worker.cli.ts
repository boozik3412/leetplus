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
  runGuestBonusLedgerExternalTenantsOnce,
  runGuestBonusLedgerWorkerOnce,
} from './guest-bonus-ledger-worker';
import { GuestGamificationService } from './guest-gamification.service';
import { GuestGameLedgerFallbackService } from './guest-game-ledger-fallback.service';
import {
  loadGuestGamificationWorkerConfig,
  runGuestGamificationWorkerOnce,
} from './guest-gamification-worker';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';
import { GuestLeaderboardReadService } from '../guest-leaderboard/guest-leaderboard-read.service';
import { GuestLeaderboardSettlementService } from '../guest-leaderboard/guest-leaderboard-settlement.service';

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
    GuestLeaderboardReadService,
    GuestLeaderboardSettlementService,
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
    const bonusLedger = application.get(GuestBonusLedgerService);
    // The primary tenant runs first; external networks still dispatch when it
    // fails, and the process then reports every failure.
    let primaryError: Error | null = null;
    try {
      await runGuestBonusLedgerWorkerOnce(bonusLedger);
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }
    const external = await runGuestBonusLedgerExternalTenantsOnce(bonusLedger);
    if (primaryError) throw primaryError;
    await runGuestGamificationWorkerOnce({
      prisma: application.get(PrismaService),
      activityLedger: application.get(GuestActivityLedgerService),
      ledgerFallback: application.get(GuestGameLedgerFallbackService),
      gamification: application.get(GuestGamificationService),
      monitoring: application.get(GuestGameQualityMonitoringService),
      leaderboardSettlement: application.get(GuestLeaderboardSettlementService),
    });
    // An external network's failure must not hold back the primary tenant's
    // gamification pass, so it is reported only after that pass.
    if (external.failed.length > 0) {
      throw new Error(
        `External networks failed: ${external.failed.join(', ')}`,
      );
    }
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
