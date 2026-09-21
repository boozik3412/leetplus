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
import {
  C61BudgetRefillExceptionService,
  C61_BUDGET_REFILL_ATTESTATION_AUTHORITY,
  ServerC61BudgetRefillAttestationAuthority,
} from './c61-budget-refill-exception.service';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestGamificationService } from './guest-gamification.service';
import { GuestGameLedgerFallbackService } from './guest-game-ledger-fallback.service';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';
import { GuestGameRuleReplayService } from './guest-game-rule-replay.service';
import { C61SupportRecoveryCliAdapter } from './support-recovery-c61-cli.adapter';
import {
  createLp571RuntimeAdapter,
  executeSupportRecoveryPlan,
  loadSupportRecoveryPlan,
  loadSupportRecoveryRuntimeProfile,
  reconcileC61SupportRecovery,
  reconcileDaSupportRecovery,
  reconcileLp571SupportRecovery,
} from './support-recovery-cli.runtime';

const inertOutbound = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('Outbound dependency is inert in support recovery CLI.');
    },
  },
);
const disabledScheduler = {
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
    lastSkipReason: 'support recovery CLI',
  }),
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    TenancyModule,
  ],
  providers: [
    { provide: LangameClient, useValue: inertOutbound },
    LangameSettingsService,
    SecretEncryptionService,
    GuestIdentityResolverService,
    GuestActivityLedgerService,
    GuestBonusLedgerService,
    GuestGamificationService,
    GuestGameLedgerFallbackService,
    GuestGameQualityMonitoringService,
    GuestGameRuleReplayService,
    C61BudgetRefillExceptionService,
    {
      provide: C61_BUDGET_REFILL_ATTESTATION_AUTHORITY,
      useClass: ServerC61BudgetRefillAttestationAuthority,
    },
    { provide: GuestBonusLedgerSchedulerService, useValue: disabledScheduler },
  ],
})
class SupportRecoveryCliModule {}

function applyRuntimeProfile(profile: Record<string, unknown>) {
  for (const key of [
    'DATABASE_URL',
    'C61_OWNER_APPROVAL_PUBLIC_KEY_PEM',
  ] as const) {
    const value = profile[key];
    if (typeof value === 'string' && value) process.env[key] = value;
  }
}

export async function verifiedPlanActor(
  prisma: Pick<
    PrismaService,
    'user' | 'guestSupportTicket' | 'guestSupportTicketAuditEvent'
  >,
  actorUserId: string,
) {
  const markers = [
    {
      id: '508fbd17-6283-4b34-be5d-811075676097',
      ticketNumber: 'LP-BUG-73CC9DFC',
    },
    {
      id: '8a84f807-53c1-4f74-8028-ba184662b93a',
      ticketNumber: 'LP-BUG-AD120ECF',
    },
    { id: 'b072ee9d-6de9-404a-a6b0-9fbc558c9a75', ticketNumber: 'LP-BUG-CB' },
    {
      id: '70b685c7-aabe-46db-85be-59aaa13202ae',
      ticketNumber: 'LP-BUG-79714142',
    },
  ] as const;
  const [actor, tickets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    }),
    prisma.guestSupportTicket.findMany({
      where: {
        id: { in: markers.map((marker) => marker.id) },
        status: 'CLOSED',
      },
      select: { id: true, tenantId: true, ticketNumber: true },
    }),
  ]);
  if (!actor || !actor.isActive || !actor.isPlatformAdmin)
    throw new Error('Plan actor is not an active platform admin.');
  if (
    tickets.length !== markers.length ||
    markers.some(
      (marker) =>
        !tickets.some(
          (ticket) =>
            ticket.id === marker.id &&
            ticket.ticketNumber === marker.ticketNumber,
        ),
    ) ||
    new Set(tickets.map((ticket) => ticket.tenantId)).size !== 1 ||
    tickets[0]?.tenantId !== actor.tenantId
  )
    throw new Error('Exact support ticket tenant binding changed.');
  const audits = await prisma.guestSupportTicketAuditEvent.findMany({
    where: {
      actorUserId: actor.id,
      action: 'COMMENT_ADDED',
      ticketId: { in: tickets.map((ticket) => ticket.id) },
    },
    select: { ticketId: true },
  });
  if (new Set(audits.map((audit) => audit.ticketId)).size !== markers.length)
    throw new Error('Plan actor lacks exact support-comment audit markers.');
  return {
    id: actor.id,
    tenantId: actor.tenantId,
    role: actor.role,
    isPlatformAdmin: true,
    platformTenantContext: true,
  };
}

async function main() {
  if (process.env.LEETPLUS_SUPPORT_RECOVERY_CLI !== '1')
    throw new Error('LEETPLUS_SUPPORT_RECOVERY_CLI=1 required.');
  const plan = loadSupportRecoveryPlan();
  applyRuntimeProfile(
    loadSupportRecoveryRuntimeProfile(
      '/run/secrets/runtime.json',
      undefined,
      plan.runtimeProfileSha256,
    ),
  );
  const app = await NestFactory.createApplicationContext(
    SupportRecoveryCliModule,
    { logger: ['error', 'warn'] },
  );
  try {
    const replay = app.get(GuestGameRuleReplayService);
    const user = await verifiedPlanActor(
      app.get(PrismaService),
      plan.actorUserId,
    );
    const runtime = {
      user,
      da: replay,
      c61: new C61SupportRecoveryCliAdapter(
        app.get(C61BudgetRefillExceptionService),
      ),
      lp571: createLp571RuntimeAdapter(replay, user),
      reconcile: {
        da: () => reconcileDaSupportRecovery(app.get(PrismaService)),
        c61: () => reconcileC61SupportRecovery(app.get(PrismaService)),
        lp571: () => reconcileLp571SupportRecovery(app.get(PrismaService)),
      },
    };
    process.stdout.write(
      `${JSON.stringify(await executeSupportRecoveryPlan(runtime, plan))}\n`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Support recovery CLI failed.',
    );
    process.exitCode = 1;
  });

export { applyRuntimeProfile };
