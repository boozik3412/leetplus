import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppService } from '../app.service';
import { validateEnvironment } from '../config/environment-validation';
import { GuestActivityLedgerService } from '../guest-gamification/guest-activity-ledger.service';
import { GuestBonusLedgerSchedulerService } from '../guest-gamification/guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from '../guest-gamification/guest-bonus-ledger.service';
import { GuestGamePublicMediaController } from '../guest-gamification/guest-game-media.controller';
import { GuestGameMediaService } from '../guest-gamification/guest-game-media.service';
import { GuestGamificationService } from '../guest-gamification/guest-gamification.service';
import { GuestPortalController } from '../guest-portal/guest-portal.controller';
import { GuestPortalService } from '../guest-portal/guest-portal.service';
import { GuestSupportService } from '../guest-portal/guest-support.service';
import { GuestIdentityResolverService } from '../integrations/guest-identity-resolver.service';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RuntimeHealthController } from './runtime-health.controller';

const disabledBonusLedgerScheduler = {
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
    lastSkipReason: 'disabled in public guest runtime',
  }),
} satisfies Pick<
  GuestBonusLedgerSchedulerService,
  'requestRun' | 'getRuntimeStatus'
>;

/**
 * Public guest runtime only. Keep this dependency graph explicit: importing a
 * broad domain module can register corporate controllers or background jobs in
 * the guest process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    TenancyModule,
    JwtModule.register({}),
  ],
  controllers: [
    RuntimeHealthController,
    GuestPortalController,
    GuestGamePublicMediaController,
  ],
  providers: [
    AppService,
    SecretEncryptionService,
    LangameClient,
    LangameSettingsService,
    GuestIdentityResolverService,
    GuestBonusLedgerService,
    {
      provide: GuestBonusLedgerSchedulerService,
      useValue: disabledBonusLedgerScheduler,
    },
    GuestGameMediaService,
    GuestGamificationService,
    GuestActivityLedgerService,
    GuestPortalService,
    GuestSupportService,
  ],
})
export class GuestRuntimeModule {}
