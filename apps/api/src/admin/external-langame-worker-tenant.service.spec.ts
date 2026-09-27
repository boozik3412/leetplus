import {
  IntegrationProvider,
  TenantCustomerStage,
  TenantModule,
} from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import {
  EZ_GAME_WORKER_SCOPE as scope,
  EXTERNAL_TENANT_APPROVAL_CONTRACT,
  ExternalLangameWorkerTenantService,
} from './external-langame-worker-tenant.service';

const actor = {
  id: 'platform-admin',
  isPlatformAdmin: true,
  isActive: true,
} as AuthenticatedUser;
const date = new Date('2026-09-27T00:00:00.000Z');
const requestId = '5298a6d6-32ba-42f1-a151-dd8f13a1b85a';
const digest = (value: unknown) =>
  createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');

function fixture() {
  const tenant = {
    id: scope.tenantId,
    slug: scope.tenantSlug,
    status: 'ACTIVE',
    customerStage: 'PILOT',
    onboardingStatus: 'ONBOARDING',
    entitlementProfileRevision: 1,
    executionRevision: 2,
    trialStartsAt: new Date('2026-08-27T00:00:00.000Z'),
    trialEndsAt: new Date('2026-09-26T00:00:00.000Z'),
    updatedAt: date,
    moduleEntitlements: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
      id: `module-${module}`,
      module,
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: false,
      validFrom: null,
      validUntil: null,
      profileRevision: 1,
      reason: 'Existing pilot module profile',
      updatedAt: date,
    })),
  };
  const source = {
    id: scope.sourceId,
    tenantId: scope.tenantId,
    provider: IntegrationProvider.LANGAME,
    domain: scope.domain,
    isActive: true,
    updatedAt: date,
  };
  const store = {
    id: scope.storeId,
    tenantId: scope.tenantId,
    externalProvider: IntegrationProvider.LANGAME,
    integrationSourceId: scope.sourceId,
    externalDomain: scope.domain,
    externalClubId: scope.clubId,
    isActive: true,
    backgroundExecutionEnabled: false,
    executionRevision: 0,
    updatedAt: date,
  };
  const db = {
    tenant: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(tenant)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        entitlementProfileRevision: 2,
        executionRevision: 3,
      }),
    },
    integrationSource: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(source)),
      findMany: jest.fn().mockResolvedValue([{ id: scope.sourceId }]),
    },
    store: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(store)),
      findMany: jest.fn().mockResolvedValue([{ id: scope.storeId }]),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        isActive: true,
        isPlatformAdmin: true,
      }),
    },
    tenantModuleEntitlement: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    platformAdminAuditEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const config = { get: jest.fn().mockReturnValue(publicKey) };
  const service = new ExternalLangameWorkerTenantService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  return { service, prisma, db, tenant, source, store, keys, config };
}

async function input(subject: ReturnType<typeof fixture>) {
  const prepared = await subject.service.prepare(
    actor,
    scope.tenantId,
    'ACTIVATE_LIVE',
  );
  const reason = 'Owner selected LIVE for scheduled data import';
  const statement = {
    contract: EXTERNAL_TENANT_APPROVAL_CONTRACT,
    tenantId: scope.tenantId,
    action: 'ACTIVATE_LIVE',
    planSha256: prepared.planSha256,
    requestId,
    reasonSha256: digest(reason),
    issuedAt: new Date(Date.now() - 30_000).toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  };
  const signature = sign(
    null,
    Buffer.from(`${JSON.stringify(statement, null, 2)}\n`),
    subject.keys.privateKey,
  ).toString('base64');
  return {
    action: 'ACTIVATE_LIVE',
    confirmation: scope.tenantSlug,
    planSha256: prepared.planSha256,
    requestId,
    reason,
    approval: { ...statement, signature },
  };
}

describe('dedicated external Langame tenant workflow', () => {
  it('prepares exact LIVE and only three data OUTBOUND modules without effects', async () => {
    const subject = fixture();
    const prepared = await subject.service.prepare(
      actor,
      scope.tenantId,
      'ACTIVATE_LIVE',
    );
    expect(prepared.planSha256).toBe(digest(prepared.plan));
    expect(prepared.plan).toMatchObject({
      customerStageAfter: TenantCustomerStage.LIVE,
      profileRevisionBefore: 1,
      profileRevisionAfter: 2,
      executionRevisionBefore: 2,
      executionRevisionAfter: 3,
      trialWindowCleared: true,
      storeBackgroundExecutionChanged: false,
      otherModulesOutbound: false,
    });
    expect(prepared.plan.outboundModules).toEqual([
      TenantModule.INTEGRATIONS,
      TenantModule.ASSORTMENT,
      TenantModule.STAFF,
    ]);
    expect(subject.prisma.$transaction).not.toHaveBeenCalled();
    expect(subject.db.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('rejects tenant actors, workers and another tenant before database effects', async () => {
    const subject = fixture();
    for (const denied of [
      { ...actor, isPlatformAdmin: false },
      { ...actor, isActive: false },
      {} as AuthenticatedUser,
    ]) {
      await expect(
        subject.service.prepare(denied, scope.tenantId, 'ACTIVATE_LIVE'),
      ).rejects.toThrow('platform administrator');
    }
    await expect(
      subject.service.prepare(actor, 'foreign-tenant', 'ACTIVATE_LIVE'),
    ).rejects.toThrow('reviewed scope');
    expect(subject.db.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('writes one CAS, preserves local flags, and keeps provider reward OUTBOUND off', async () => {
    const subject = fixture();
    const result = await subject.service.apply(
      actor,
      scope.tenantId,
      await input(subject),
    );
    expect(result.executionRevisionAfter).toBe(3);
    const calls = subject.db.tenantModuleEntitlement.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            module: TenantModule;
            outboundEnabled: boolean;
            readEnabled: boolean;
            writeEnabled: boolean;
            profileRevision: number;
          }>;
        },
      ]
    >;
    const modules = calls[0][0].data;
    expect(
      modules
        .filter((entry) => entry.outboundEnabled)
        .map((entry) => entry.module)
        .sort(),
    ).toEqual(
      [
        TenantModule.INTEGRATIONS,
        TenantModule.ASSORTMENT,
        TenantModule.STAFF,
      ].sort(),
    );
    expect(
      modules.find((entry) => entry.module === TenantModule.GAMIFICATION)
        ?.outboundEnabled,
    ).toBe(false);
    expect(
      modules.every(
        (entry) =>
          entry.readEnabled &&
          entry.writeEnabled &&
          entry.profileRevision === 2,
      ),
    ).toBe(true);
    expect(subject.db.store.updateMany).not.toHaveBeenCalled();
    expect(subject.db.platformAdminAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects plan/Store/profile drift before claiming the tenant or replacing modules', async () => {
    const subject = fixture();
    const request = await input(subject);
    subject.store.executionRevision = 1;
    await expect(
      subject.service.apply(actor, scope.tenantId, request),
    ).rejects.toThrow('drifted');
    expect(subject.db.tenant.updateMany).not.toHaveBeenCalled();
    expect(
      subject.db.tenantModuleEntitlement.createMany,
    ).not.toHaveBeenCalled();
    subject.store.executionRevision = 0;
    subject.db.tenant.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      subject.service.apply(actor, scope.tenantId, request),
    ).rejects.toThrow('CAS changed');
    expect(
      subject.db.tenantModuleEntitlement.createMany,
    ).not.toHaveBeenCalled();
  });

  it('does not authorize apply from stale persisted admin status', async () => {
    const subject = fixture();
    const request = await input(subject);
    subject.db.user.findUnique.mockResolvedValueOnce({
      isActive: false,
      isPlatformAdmin: true,
    });
    await expect(
      subject.service.apply(actor, scope.tenantId, request),
    ).rejects.toThrow('platform administrator');
    expect(subject.db.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('requires a fresh independent signature and fails closed without its public root', async () => {
    const subject = fixture();
    const request = await input(subject);
    await expect(
      subject.service.apply(actor, scope.tenantId, {
        ...request,
        approval: null,
      }),
    ).rejects.toThrow('detached tenant approval');
    await expect(
      subject.service.apply(actor, scope.tenantId, {
        ...request,
        approval: { ...request.approval, signature: 'A'.repeat(86) + '==' },
      }),
    ).rejects.toThrow('signature is invalid');
    await expect(
      subject.service.apply(actor, scope.tenantId, {
        ...request,
        approval: {
          ...request.approval,
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
      }),
    ).rejects.toThrow('expired or unbounded');
    await expect(
      subject.service.apply(actor, scope.tenantId, {
        ...request,
        reason: 'Different reviewed reason for this mutation',
      }),
    ).rejects.toThrow('identity drift');
    subject.config.get.mockReturnValueOnce(undefined);
    await expect(
      subject.service.apply(actor, scope.tenantId, request),
    ).rejects.toThrow('root is not configured');
    expect(subject.db.tenant.updateMany).not.toHaveBeenCalled();
    expect(
      subject.db.tenantModuleEntitlement.createMany,
    ).not.toHaveBeenCalled();
  });

  it('replays only the identical audited request without new writes', async () => {
    const subject = fixture();
    const request = await input(subject);
    const result = await subject.service.apply(actor, scope.tenantId, request);
    const calls = subject.db.platformAdminAuditEvent.create.mock
      .calls as unknown as Array<
      [{ data: { metadata: unknown; after: unknown } }]
    >;
    const saved = calls[0][0].data;
    subject.db.platformAdminAuditEvent.findUnique.mockResolvedValue({
      metadata: saved.metadata,
      after: saved.after,
    });
    await expect(
      subject.service.apply(actor, scope.tenantId, request),
    ).resolves.toEqual(result);
    expect(subject.db.tenant.updateMany).toHaveBeenCalledTimes(1);
    await expect(
      subject.service.apply(actor, scope.tenantId, {
        ...request,
        reason: 'Different owner request text',
      }),
    ).rejects.toThrow('different change');
  });

  it('prepares a narrow kill switch after a source is deactivated', async () => {
    const subject = fixture();
    subject.tenant.customerStage = 'LIVE';
    subject.tenant.moduleEntitlements.forEach((entry) => {
      entry.outboundEnabled =
        entry.module !== TenantModule.GAMIFICATION &&
        entry.module !== TenantModule.COMMUNICATIONS &&
        entry.module !== TenantModule.USERS_ROLES;
    });
    subject.source.isActive = false;
    subject.store.isActive = false;
    subject.db.integrationSource.findMany.mockResolvedValue([]);
    subject.db.store.findMany.mockResolvedValue([]);
    const prepared = await subject.service.prepare(
      actor,
      scope.tenantId,
      'REVOKE_OUTBOUND',
    );
    expect(prepared.plan.outboundModules).toEqual([]);
    expect(prepared.plan.trialWindowCleared).toBe(false);
  });
});
