import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { createTelegramBotApiFetch } from '../guest-portal/telegram-bot-api-fetch';
import { GuestActivityLedgerService } from '../guest-gamification/guest-activity-ledger.service';
import { GuestGameDataRetentionService } from '../guest-gamification/guest-game-data-retention.service';
import { BusinessSnapshotService } from '../integrations/business-snapshot.service';
import { GuestDataFoundationService } from '../integrations/guest-data-foundation.service';
import { GuestIdentityResolverService } from '../integrations/guest-identity-resolver.service';
import { LangameClient } from '../integrations/langame.client';
import { LangameDailySyncService } from '../integrations/langame-daily-sync.service';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { LangameSyncService } from '../integrations/langame-sync.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DailyReportCommentaryService } from './daily-report-commentary';
import {
  DailyReportDeliveryService,
  type DailyReportRefresh,
} from './daily-report-delivery.service';
import { DailyReportService } from './daily-report.service';

// Deliberately no controllers: the systemd timer (lp-report.timer) runs one
// tick every few minutes.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    TenancyModule,
  ],
  providers: [
    BusinessSnapshotService,
    DailyReportCommentaryService,
    DailyReportDeliveryService,
    DailyReportService,
    GuestActivityLedgerService,
    GuestDataFoundationService,
    GuestGameDataRetentionService,
    GuestIdentityResolverService,
    LangameClient,
    LangameDailySyncService,
    LangameSettingsService,
    LangameSyncService,
    SecretEncryptionService,
  ],
})
class DailyReportWorkerModule {}

function llmFetch(env: NodeJS.ProcessEnv): typeof fetch | undefined {
  const proxyUrl = env.DAILY_REPORT_LLM_PROXY_URL?.trim();
  if (!proxyUrl) return undefined;
  const dispatcher = new ProxyAgent(proxyUrl);
  return ((input, init) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    ) as unknown as ReturnType<typeof fetch>) as typeof fetch;
}

async function main() {
  const application = await NestFactory.createApplicationContext(
    DailyReportWorkerModule,
    { logger: ['error', 'warn'] },
  );
  try {
    const langameSync = application.get(LangameSyncService);
    const guestFoundation = application.get(GuestDataFoundationService);
    const refresh: DailyReportRefresh = async ({
      tenantId,
      dateFrom,
      dateTo,
      full,
    }) => {
      if (full) {
        await langameSync.syncTenantById(
          tenantId,
          { dateFrom, dateTo, mode: 'QUICK', trigger: 'AUTO' },
          'LANGAME_DAILY_SYNC',
        );
        await langameSync.syncTenantById(
          tenantId,
          { mode: 'INVENTORY', trigger: 'AUTO' },
          'LANGAME_DAILY_SYNC',
        );
      }
      await guestFoundation.syncTenantById(
        tenantId,
        { dateFrom, dateTo, includeWorkingShifts: true },
        'OUTBOUND',
      );
    };
    const result = await application
      .get(DailyReportDeliveryService)
      .tick(new Date(), {
        telegramFetch: createTelegramBotApiFetch({
          TELEGRAM_BOT_API_PROXY_URL:
            process.env.DAILY_REPORT_TELEGRAM_PROXY_URL,
        }),
        llmFetch: llmFetch(process.env),
        refresh,
      });
    if (result.sent || result.followUps || result.linked) {
      console.log(
        `Daily report worker: bots=${result.bots} linked=${result.linked} sent=${result.sent} followUps=${result.followUps}`,
      );
    }
    if (result.failures.length) throw new Error(result.failures.join('; '));
  } finally {
    await application.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Daily report worker failed: ${message}`);
    process.exitCode = 1;
  });
}
