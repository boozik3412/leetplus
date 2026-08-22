import { TenantCustomerStage } from '@prisma/client';
import {
  TENANT_BACKGROUND_EXECUTION_REGISTRY,
  TENANT_BACKGROUND_JOB_EXECUTION_METADATA,
  TENANT_BACKGROUND_JOB_KINDS,
  evaluateTenantBackgroundExecutionPolicy,
  evaluateTenantBackgroundRuntimeIdentity,
  isTenantBackgroundJobKind,
  tenantBackgroundExecutionNote,
  tenantBackgroundStageForCustomerStage,
} from './tenant-background-execution-policy';

const EXPECTED_BACKGROUND_JOB_KINDS = [
  'REPORT_DIGEST_SMTP',
  'GUEST_BONUS_LEDGER_LANGAME',
  'LANGAME_SCHEDULED_SYNC',
  'LANGAME_DAILY_SYNC',
  'LANGAME_BUSINESS_SNAPSHOT',
  'LANGAME_GUEST_DATA_FOUNDATION',
  'GUEST_GAMIFICATION_SNAPSHOT_PIPELINE',
  'GUEST_GAMIFICATION_SUPPLEMENTAL_PIPELINE',
  'GUEST_GAME_DELIVERY_DISPATCH',
  'GUEST_GAME_DELIVERY_BOT_PULL',
  'GUEST_ACTIVITY_LEDGER_SYNC',
  'GUEST_GAME_DATA_RETENTION',
  'GUEST_GAME_LEDGER_FALLBACK',
  'GUEST_GAME_LOOT_BOX_RECOVERY',
  'GUEST_GAME_QUALITY_MONITORING',
  'GUEST_GAME_REWARD_MATERIALIZER',
  'STAFF_TASK_RECURRING_RULES',
] as const;

describe('tenant background execution policy', () => {
  it('keeps the registry exact and marks only proven provider paths fenced', () => {
    expect([...TENANT_BACKGROUND_JOB_KINDS].sort()).toEqual(
      [...EXPECTED_BACKGROUND_JOB_KINDS].sort(),
    );
    expect(Object.keys(TENANT_BACKGROUND_EXECUTION_REGISTRY).sort()).toEqual(
      [...EXPECTED_BACKGROUND_JOB_KINDS].sort(),
    );
    expect(
      Object.keys(TENANT_BACKGROUND_JOB_EXECUTION_METADATA).sort(),
    ).toEqual([...EXPECTED_BACKGROUND_JOB_KINDS].sort());
    expect(
      Object.entries(TENANT_BACKGROUND_EXECUTION_REGISTRY)
        .filter(([, policy]) => policy === 'REVISION_FENCED')
        .map(([jobKind]) => jobKind)
        .sort(),
    ).toEqual(['GUEST_BONUS_LEDGER_LANGAME', 'REPORT_DIGEST_SMTP']);
    expect(
      Object.values(TENANT_BACKGROUND_EXECUTION_REGISTRY).filter(
        (policy) => policy === 'EXTERNAL_DENY',
      ),
    ).toHaveLength(TENANT_BACKGROUND_JOB_KINDS.length - 2);
  });

  it('requires every registered job to declare a scoped system identity', () => {
    for (const jobKind of TENANT_BACKGROUND_JOB_KINDS) {
      const metadata = TENANT_BACKGROUND_JOB_EXECUTION_METADATA[jobKind];

      expect(metadata.sharedServiceTokenAllowed).toBe(false);
      expect([
        'TENANT_SYSTEM_IDENTITY',
        'TENANT_STORE_SYSTEM_IDENTITY',
        'TENANT_OR_STORE_SYSTEM_IDENTITY',
      ]).toContain(metadata.systemIdentity);
    }
    expect(
      TENANT_BACKGROUND_JOB_EXECUTION_METADATA.REPORT_DIGEST_SMTP,
    ).toMatchObject({
      systemIdentity: 'TENANT_SYSTEM_IDENTITY',
      sharedServiceTokenAllowed: false,
    });
    expect(
      TENANT_BACKGROUND_JOB_EXECUTION_METADATA.GUEST_BONUS_LEDGER_LANGAME,
    ).toMatchObject({
      systemIdentity: 'TENANT_STORE_SYSTEM_IDENTITY',
      sharedServiceTokenAllowed: false,
    });
    expect(
      TENANT_BACKGROUND_JOB_EXECUTION_METADATA.STAFF_TASK_RECURRING_RULES,
    ).toMatchObject({
      systemIdentity: 'TENANT_STORE_SYSTEM_IDENTITY',
      sharedServiceTokenAllowed: false,
    });
  });

  it('allows registered jobs for the legacy INTERNAL network', () => {
    for (const jobKind of TENANT_BACKGROUND_JOB_KINDS) {
      expect(
        evaluateTenantBackgroundExecutionPolicy({
          stage: 'INTERNAL',
          jobKind,
        }),
      ).toMatchObject({
        allowed: true,
        reasonCode: 'ALLOWED_INTERNAL_LEGACY',
        stage: 'INTERNAL',
        jobKind,
        sharedServiceTokenAllowed: false,
      });
    }
  });

  it('allows an external tenant only through a revision-fenced job', () => {
    expect(
      evaluateTenantBackgroundExecutionPolicy({
        stage: 'EXTERNAL',
        jobKind: 'REPORT_DIGEST_SMTP',
      }),
    ).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOWED_EXTERNAL_REVISION_FENCED',
      externalPolicy: 'REVISION_FENCED',
      systemIdentity: 'TENANT_SYSTEM_IDENTITY',
      sharedServiceTokenAllowed: false,
    });
    expect(
      evaluateTenantBackgroundExecutionPolicy({
        stage: 'EXTERNAL',
        jobKind: 'GUEST_GAME_DELIVERY_BOT_PULL',
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'BACKGROUND_EXTERNAL_EXECUTION_DENIED',
      externalPolicy: 'EXTERNAL_DENY',
      systemIdentity: 'TENANT_STORE_SYSTEM_IDENTITY',
      sharedServiceTokenAllowed: false,
    });
  });

  it('requires a tenant-scoped runtime actor for tenant-wide background jobs', () => {
    const decision = evaluateTenantBackgroundExecutionPolicy({
      stage: 'EXTERNAL',
      jobKind: 'REPORT_DIGEST_SMTP',
    });

    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'SHARED_SERVICE_TOKEN',
        tenantId: 'tenant-b',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_SHARED_SERVICE_TOKEN_DENIED',
      policyReasonCode: 'ALLOWED_EXTERNAL_REVISION_FENCED',
      jobKind: 'REPORT_DIGEST_SMTP',
      systemIdentity: 'TENANT_SYSTEM_IDENTITY',
      actorKind: 'SHARED_SERVICE_TOKEN',
      tenantId: 'tenant-b',
      storeId: null,
      sharedServiceTokenAllowed: false,
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-b',
        storeId: 'store-b1',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_TENANT_SYSTEM_IDENTITY_REQUIRED',
      actorKind: 'TENANT_STORE_SYSTEM',
      tenantId: 'tenant-b',
      storeId: 'store-b1',
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_SYSTEM',
        tenantId: ' tenant-b ',
        storeId: 'ignored-store',
      }),
    ).toMatchObject({
      accepted: true,
      reasonCode: 'BACKGROUND_RUNTIME_IDENTITY_ACCEPTED',
      actorKind: 'TENANT_SYSTEM',
      tenantId: 'tenant-b',
      storeId: null,
    });
  });

  it('requires a store-scoped runtime actor for store-bound background jobs', () => {
    const decision = evaluateTenantBackgroundExecutionPolicy({
      stage: 'INTERNAL',
      jobKind: 'GUEST_BONUS_LEDGER_LANGAME',
    });

    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_SYSTEM',
        tenantId: 'tenant-a',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_TENANT_STORE_SYSTEM_IDENTITY_REQUIRED',
      systemIdentity: 'TENANT_STORE_SYSTEM_IDENTITY',
      actorKind: 'TENANT_SYSTEM',
      tenantId: 'tenant-a',
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-a',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_STORE_ID_REQUIRED',
      actorKind: 'TENANT_STORE_SYSTEM',
      tenantId: 'tenant-a',
      storeId: null,
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-a',
        storeId: 'store-a1',
      }),
    ).toMatchObject({
      accepted: true,
      reasonCode: 'BACKGROUND_RUNTIME_IDENTITY_ACCEPTED',
      actorKind: 'TENANT_STORE_SYSTEM',
      tenantId: 'tenant-a',
      storeId: 'store-a1',
      sharedServiceTokenAllowed: false,
    });
  });

  it('supports explicit tenant-or-store identity without admitting shared tokens', () => {
    const decision = evaluateTenantBackgroundExecutionPolicy({
      stage: 'INTERNAL',
      jobKind: 'GUEST_GAME_QUALITY_MONITORING',
    });

    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_SYSTEM',
        tenantId: 'tenant-a',
      }),
    ).toMatchObject({
      accepted: true,
      reasonCode: 'BACKGROUND_RUNTIME_IDENTITY_ACCEPTED',
      actorKind: 'TENANT_SYSTEM',
      storeId: null,
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-a',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_STORE_ID_REQUIRED',
    });
    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-a',
        storeId: 'store-a1',
      }),
    ).toMatchObject({
      accepted: true,
      reasonCode: 'BACKGROUND_RUNTIME_IDENTITY_ACCEPTED',
      actorKind: 'TENANT_STORE_SYSTEM',
      storeId: 'store-a1',
    });
  });

  it('denies missing, unknown and future job kinds fail-closed', () => {
    expect(
      evaluateTenantBackgroundExecutionPolicy({
        stage: 'EXTERNAL',
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'BACKGROUND_JOB_KIND_REQUIRED',
    });
    expect(
      evaluateTenantBackgroundExecutionPolicy({
        stage: 'EXTERNAL',
        jobKind: 'FUTURE_UNREVIEWED_JOB',
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'BACKGROUND_JOB_KIND_UNKNOWN',
      jobKind: null,
      externalPolicy: null,
      systemIdentity: null,
      sharedServiceTokenAllowed: false,
    });
    expect(isTenantBackgroundJobKind('FUTURE_UNREVIEWED_JOB')).toBe(false);
  });

  it('maps customer stages explicitly and rejects an absent stage', () => {
    expect(
      tenantBackgroundStageForCustomerStage(TenantCustomerStage.INTERNAL),
    ).toBe('INTERNAL');
    for (const stage of [
      TenantCustomerStage.PILOT,
      TenantCustomerStage.BETA,
      TenantCustomerStage.LIVE,
    ]) {
      expect(tenantBackgroundStageForCustomerStage(stage)).toBe('EXTERNAL');
    }
    expect(tenantBackgroundStageForCustomerStage(null)).toBeNull();
    expect(tenantBackgroundStageForCustomerStage('FUTURE')).toBeNull();
    const decision = evaluateTenantBackgroundExecutionPolicy({
      stage: tenantBackgroundStageForCustomerStage(null),
      jobKind: 'GUEST_ACTIVITY_LEDGER_SYNC',
    });
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'BACKGROUND_EXECUTION_STAGE_REQUIRED',
    });
    expect(tenantBackgroundExecutionNote(decision)).toContain(
      'BACKGROUND_EXECUTION_STAGE_REQUIRED',
    );
    expect(
      evaluateTenantBackgroundExecutionPolicy({
        stage: 'FUTURE',
        jobKind: 'GUEST_ACTIVITY_LEDGER_SYNC',
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'BACKGROUND_EXECUTION_STAGE_UNKNOWN',
    });
  });

  it('propagates policy denial before accepting any runtime actor', () => {
    const deniedDecision = evaluateTenantBackgroundExecutionPolicy({
      stage: 'EXTERNAL',
      jobKind: 'GUEST_GAME_DELIVERY_BOT_PULL',
    });

    expect(
      evaluateTenantBackgroundRuntimeIdentity({
        decision: deniedDecision,
        actorKind: 'TENANT_STORE_SYSTEM',
        tenantId: 'tenant-b',
        storeId: 'store-b1',
      }),
    ).toMatchObject({
      accepted: false,
      reasonCode: 'BACKGROUND_POLICY_DENIED',
      policyReasonCode: 'BACKGROUND_EXTERNAL_EXECUTION_DENIED',
      jobKind: 'GUEST_GAME_DELIVERY_BOT_PULL',
      systemIdentity: 'TENANT_STORE_SYSTEM_IDENTITY',
      actorKind: 'TENANT_STORE_SYSTEM',
      tenantId: 'tenant-b',
      storeId: 'store-b1',
      sharedServiceTokenAllowed: false,
    });
  });
});
