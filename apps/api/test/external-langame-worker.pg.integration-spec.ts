import { IntegrationProvider, TenantModule, UserRole } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import {
  EZ_GAME_WORKER_SCOPE as scope,
  EXTERNAL_TENANT_APPROVAL_CONTRACT,
  ExternalLangameWorkerTenantService,
} from '../src/admin/external-langame-worker-tenant.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../src/tenancy/tenant-entitlement-profile.service';
import { TenantExecutionAdmissionService } from '../src/tenancy/tenant-execution-admission.service';
import { TenantExecutionPolicyService } from '../src/tenancy/tenant-execution-policy.service';
import {
  externalWorkerTerminal,
  loadLangameExternalWorkerConfig,
} from '../src/integrations/langame-external-daily-worker';
import { externalLangameDataRequirements } from '../src/integrations/langame-external-pilot-authority';
import { LangameExternalRunLeaseService } from '../src/integrations/langame-external-run-lease.service';
import { LangameSyncService } from '../src/integrations/langame-sync.service';
import { LangameDailySyncService } from '../src/integrations/langame-daily-sync.service';
import type { LangameClient } from '../src/integrations/langame.client';
import type { LangameSettingsService } from '../src/integrations/langame-settings.service';
import type { GuestDataFoundationService } from '../src/integrations/guest-data-foundation.service';
import type { BusinessSnapshotService } from '../src/integrations/business-snapshot.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createLangameExternalPilotAuthority } from '../src/integrations/langame-external-pilot-authority';
import {
  assertExactExternalImportLockHeld,
  withExactExternalImportLock,
} from '../src/integrations/langame-external-import-lock';

const confirmation = 'run-external-langame-worker-disposable-ci-fixture';
const describePostgres =
  process.env.EXTERNAL_LANGAME_WORKER_PG_CONFIRM === confirmation
    ? describe
    : describe.skip;

describePostgres(
  'external worker PostgreSQL CAS, privilege and once-only ownership',
  () => {
    let prisma: PrismaService;
    let actor: AuthenticatedUser;
    let tenantCreated = false;
    let writer: ExternalLangameWorkerTenantService;
    let signer: KeyObject;
    let publicKey: string;

    function approval(
      action: 'ACTIVATE_LIVE' | 'REVOKE_OUTBOUND',
      planSha256: string,
      requestId: string,
      reason: string,
    ) {
      const reasonSha256 = createHash('sha256')
        .update(`${JSON.stringify(reason, null, 2)}\n`)
        .digest('hex');
      const statement = {
        contract: EXTERNAL_TENANT_APPROVAL_CONTRACT,
        tenantId: scope.tenantId,
        action,
        planSha256,
        requestId,
        reasonSha256,
        issuedAt: new Date(Date.now() - 30_000).toISOString(),
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      };
      return {
        ...statement,
        signature: sign(
          null,
          Buffer.from(`${JSON.stringify(statement, null, 2)}\n`),
          signer,
        ).toString('base64'),
      };
    }

    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? '');
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.pathname !== '/leetplus_ci' ||
        process.env.NODE_ENV !== 'test'
      )
        throw new Error(
          'Only the explicit disposable loopback CI database is allowed',
        );
      prisma = new PrismaService();
      await prisma.$connect();
      expect(await prisma.tenant.count()).toBe(0);
      const tenant = await prisma.tenant.create({
        data: {
          id: scope.tenantId,
          name: 'Synthetic external worker tenant',
          slug: scope.tenantSlug,
          status: 'ACTIVE',
          customerStage: 'INTERNAL',
          onboardingStatus: 'ONBOARDING',
        },
      });
      tenantCreated = true;
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          customerStage: 'PILOT',
          trialStartsAt: new Date('2026-08-27T00:00:00.000Z'),
          trialEndsAt: new Date('2026-09-26T00:00:00.000Z'),
          entitlementProfileRevision: 1,
        },
      });
      await prisma.tenantModuleEntitlement.createMany({
        data: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
          tenantId: tenant.id,
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          profileRevision: 1,
          reason: 'Synthetic exact external worker pilot profile',
        })),
      });
      const credential = await prisma.integrationCredential.create({
        data: {
          tenantId: tenant.id,
          provider: IntegrationProvider.LANGAME,
          name: 'Synthetic no-provider credential',
          apiKeyEncrypted: 'fixture-unused',
        },
      });
      await prisma.integrationSource.create({
        data: {
          id: scope.sourceId,
          tenantId: tenant.id,
          credentialId: credential.id,
          provider: IntegrationProvider.LANGAME,
          name: 'Synthetic source',
          domain: scope.domain,
          baseUrl: `https://${scope.domain}/public_api`,
        },
      });
      await prisma.store.create({
        data: {
          id: scope.storeId,
          tenantId: tenant.id,
          name: 'Synthetic Store',
          isActive: true,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: scope.domain,
          externalClubId: scope.clubId,
          integrationSourceId: scope.sourceId,
        },
      });
      const admin = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'external-worker-fixture@invalid.example',
          passwordHash: 'fixture-unused',
          role: UserRole.OWNER,
          isActive: true,
          isPlatformAdmin: true,
        },
      });
      actor = {
        id: admin.id,
        isActive: true,
        isPlatformAdmin: true,
      } as AuthenticatedUser;
      const keys = generateKeyPairSync('ed25519');
      signer = keys.privateKey;
      publicKey = keys.publicKey
        .export({ type: 'spki', format: 'der' })
        .toString('base64');
      writer = new ExternalLangameWorkerTenantService(prisma, {
        get: () => publicKey,
      } as unknown as ConfigService);
    });

    afterAll(async () => {
      if (tenantCreated) {
        await prisma.integrationSyncJob.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.dailyDataCoverage.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.platformAdminAuditEvent.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.user.deleteMany({ where: { tenantId: scope.tenantId } });
        await prisma.store.deleteMany({ where: { tenantId: scope.tenantId } });
        await prisma.integrationSource.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.integrationCredential.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.tenantModuleEntitlement.deleteMany({
          where: { tenantId: scope.tenantId },
        });
        await prisma.tenant.delete({ where: { id: scope.tenantId } });
      }
      await prisma?.$disconnect();
    });

    it('rejects stale preimage, atomically activates LIVE, and keeps bonus provider authority denied', async () => {
      const prepared = await writer.prepare(
        actor,
        scope.tenantId,
        'ACTIVATE_LIVE',
      );
      const reason = 'Synthetic reviewed LIVE scheduled import activation';
      const requestId = randomUUID();
      const input = {
        action: 'ACTIVATE_LIVE',
        confirmation: scope.tenantSlug,
        requestId,
        planSha256: prepared.planSha256,
        reason,
        approval: approval(
          'ACTIVATE_LIVE',
          prepared.planSha256,
          requestId,
          reason,
        ),
      };
      await prisma.store.update({
        where: { id: scope.storeId },
        data: { name: 'Synthetic changed Store' },
      });
      await expect(writer.apply(actor, scope.tenantId, input)).rejects.toThrow(
        'drifted',
      );
      const before = await prisma.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
      });
      expect(before.customerStage).toBe('PILOT');
      expect(before.entitlementProfileRevision).toBe(1);
      // A real competing row update races the signed activation after it has
      // begun. The writer must lock before reading the signed Store preimage.
      const blocker = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await blocker.connect();
      const blockerPid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0].pid;
      const racePlan = await writer.prepare(
        actor,
        scope.tenantId,
        'ACTIVATE_LIVE',
      );
      const raceId = randomUUID();
      const raceRequest = {
        ...input,
        planSha256: racePlan.planSha256,
        requestId: raceId,
        approval: approval(
          'ACTIVATE_LIVE',
          racePlan.planSha256,
          raceId,
          reason,
        ),
      };
      let racingApply: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT "id" FROM "Store" WHERE "id"=$1 FOR UPDATE',
          [scope.storeId],
        );
        racingApply = writer.apply(actor, scope.tenantId, raceRequest);
        // Observe the competing activation blocked on its exact row lock.
        let waiting = false;
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline && !waiting) {
          await blocker.query('SELECT pg_stat_clear_snapshot()');
          const proof = await blocker.query<{ waiting: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
             WHERE $1::integer = ANY(pg_blocking_pids(pid))) AS waiting`,
            [blockerPid],
          );
          waiting = proof.rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        await blocker.query(
          'UPDATE "Store" SET "externalClubId"=$1 WHERE "id"=$2',
          ['2', scope.storeId],
        );
        await blocker.query('COMMIT');
        await expect(racingApply).rejects.toThrow();
        expect(
          (
            await prisma.tenant.findUniqueOrThrow({
              where: { id: scope.tenantId },
            })
          ).customerStage,
        ).toBe('PILOT');
        expect(
          await prisma.tenantModuleEntitlement.count({
            where: { tenantId: scope.tenantId, outboundEnabled: true },
          }),
        ).toBe(0);
      } finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        await blocker.end();
        await racingApply?.catch(() => undefined);
      }
      await prisma.store.update({
        where: { id: scope.storeId },
        data: { externalClubId: '1' },
      });
      const sourceBlocker = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await sourceBlocker.connect();
      const sourceBlockerPid = (
        await sourceBlocker.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0].pid;
      const sourcePlan = await writer.prepare(
        actor,
        scope.tenantId,
        'ACTIVATE_LIVE',
      );
      const sourceRequestId = randomUUID();
      const sourceRequest = {
        ...input,
        requestId: sourceRequestId,
        planSha256: sourcePlan.planSha256,
        approval: approval(
          'ACTIVATE_LIVE',
          sourcePlan.planSha256,
          sourceRequestId,
          reason,
        ),
      };
      let sourceApply: Promise<unknown> | undefined;
      try {
        await sourceBlocker.query('BEGIN');
        await sourceBlocker.query(
          'SELECT "id" FROM "IntegrationSource" WHERE "id"=$1 FOR UPDATE',
          [scope.sourceId],
        );
        sourceApply = writer.apply(actor, scope.tenantId, sourceRequest);
        let waiting = false;
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline && !waiting) {
          await sourceBlocker.query('SELECT pg_stat_clear_snapshot()');
          const proof = await sourceBlocker.query<{ waiting: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
             WHERE $1::integer = ANY(pg_blocking_pids(pid))) AS waiting`,
            [sourceBlockerPid],
          );
          waiting = proof.rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        await sourceBlocker.query(
          'UPDATE "IntegrationSource" SET "isActive"=false WHERE "id"=$1',
          [scope.sourceId],
        );
        await sourceBlocker.query('COMMIT');
        await expect(sourceApply).rejects.toThrow();
        expect(
          (
            await prisma.tenant.findUniqueOrThrow({
              where: { id: scope.tenantId },
            })
          ).customerStage,
        ).toBe('PILOT');
      } finally {
        await sourceBlocker.query('ROLLBACK').catch(() => undefined);
        await sourceBlocker.end();
        await sourceApply?.catch(() => undefined);
      }
      await prisma.integrationSource.update({
        where: { id: scope.sourceId },
        data: { isActive: true },
      });
      const fresh = await writer.prepare(
        actor,
        scope.tenantId,
        'ACTIVATE_LIVE',
      );
      input.planSha256 = fresh.planSha256;
      input.approval = approval(
        'ACTIVATE_LIVE',
        fresh.planSha256,
        requestId,
        reason,
      );
      const result = await writer.apply(actor, scope.tenantId, input);
      await expect(writer.apply(actor, scope.tenantId, input)).resolves.toEqual(
        result,
      );
      const after = await prisma.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
      });
      expect(after.customerStage).toBe('LIVE');
      expect(after.entitlementProfileRevision).toBe(2);
      expect(after.executionRevision).toBe(before.executionRevision + 1);
      expect(after.trialEndsAt).toBeNull();
      const admission = new TenantExecutionAdmissionService(
        prisma,
        new TenantExecutionPolicyService(),
      );
      await expect(
        admission.evaluate(
          scope.tenantId,
          externalLangameDataRequirements([
            TenantModule.INTEGRATIONS,
            TenantModule.ASSORTMENT,
            TenantModule.GAMIFICATION,
            TenantModule.STAFF,
          ]),
        ),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        admission.evaluate(scope.tenantId, [
          { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
          { module: TenantModule.GAMIFICATION, action: 'OUTBOUND' },
        ]),
      ).resolves.toMatchObject({
        allowed: false,
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      });
      expect(
        await prisma.platformAdminAuditEvent.count({
          where: {
            tenantId: scope.tenantId,
            action: 'EXTERNAL_LANGAME_WORKER_TENANT_ACTIVATED',
          },
        }),
      ).toBe(1);
      expect(
        (await prisma.store.findUniqueOrThrow({ where: { id: scope.storeId } }))
          .backgroundExecutionEnabled,
      ).toBe(false);
    });

    it('acquires the unique daily intent once on real concurrent PostgreSQL connections and holds ambiguity', async () => {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
      });
      const config = loadLangameExternalWorkerConfig({
        LANGAME_EXTERNAL_WORKER_ENABLED: 'true',
        LANGAME_EXTERNAL_WORKER_LIVE: 'true',
        LANGAME_EXTERNAL_WORKER_MODE: 'TIMER',
        LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE',
        LANGAME_EXTERNAL_WORKER_TENANT_ID: scope.tenantId,
        LANGAME_EXTERNAL_WORKER_TENANT_SLUG: scope.tenantSlug,
        LANGAME_EXTERNAL_WORKER_SOURCE_ID: scope.sourceId,
        LANGAME_EXTERNAL_WORKER_STORE_ID: scope.storeId,
        LANGAME_EXTERNAL_WORKER_DOMAIN: scope.domain,
        LANGAME_EXTERNAL_WORKER_CLUB_ID: scope.clubId,
        LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: String(
          tenant.entitlementProfileRevision,
        ),
        LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: String(
          tenant.executionRevision,
        ),
        LANGAME_EXTERNAL_WORKER_STORE_REVISION: String(
          (
            await prisma.store.findUniqueOrThrow({
              where: { id: scope.storeId },
            })
          ).executionRevision,
        ),
        LANGAME_EXTERNAL_WORKER_RUN_ID: randomUUID(),
        LANGAME_EXTERNAL_WORKER_BUSINESS_DATE: '2026-09-26',
        LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
        LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
        GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
      });
      const lease = new LangameExternalRunLeaseService(prisma);
      const outcomes = await Promise.allSettled([
        lease.acquire(config, config.businessDate),
        lease.acquire(config, config.businessDate),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      await expect(lease.acquire(config, config.businessDate)).rejects.toThrow(
        'reconcile',
      );
      await lease.complete(
        config,
        config.businessDate,
        externalWorkerTerminal(config, config.businessDate),
      );
      await expect(
        lease.acquire(config, config.businessDate),
      ).resolves.toMatchObject({
        status: 'REPLAY',
        terminal: { replayed: true, originalRunId: config.runId },
      });
    });

    it('atomically excludes manual, guest and worker imports on one non-transactional session lock', async () => {
      let release: () => void = () => undefined;
      let entered: () => void = () => undefined;
      const enteredPromise = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const releasePromise = new Promise<void>((resolve) => {
        release = resolve;
      });
      const manual = withExactExternalImportLock(scope.tenantId, async () => {
        await assertExactExternalImportLockHeld();
        await expect(
          withExactExternalImportLock(scope.tenantId, () =>
            Promise.resolve('nested-worker-child'),
          ),
        ).resolves.toBe('nested-worker-child');
        await expect(
          withExactExternalImportLock('another-tenant', () =>
            Promise.resolve('forbidden-cross-tenant'),
          ),
        ).rejects.toThrow('another tenant');
        const sessions = await prisma.$queryRaw<
          Array<{ xact_start: Date | null; count: bigint }>
        >`
          SELECT min(xact_start) AS xact_start, count(*) AS count
          FROM pg_stat_activity
          WHERE application_name='leetplus-external-langame-import-lock'
        `;
        expect(sessions[0].xact_start).toBeNull();
        expect(sessions[0].count).toBe(1n);
        entered();
        await releasePromise;
        return 'manual-finished';
      });
      await enteredPromise;
      try {
        const guestWork = jest.fn(() => Promise.resolve('guest-import'));
        const workerWork = jest.fn(() => Promise.resolve('worker-import'));
        await expect(
          withExactExternalImportLock(scope.tenantId, guestWork),
        ).rejects.toThrow('already active');
        await expect(
          withExactExternalImportLock(scope.tenantId, workerWork),
        ).rejects.toThrow('already active');
        expect(guestWork).not.toHaveBeenCalled();
        expect(workerWork).not.toHaveBeenCalled();
        await expect(
          withExactExternalImportLock('another-tenant', () =>
            Promise.resolve('parallel'),
          ),
        ).resolves.toBe('parallel');
      } finally {
        release();
        await manual;
      }
      await expect(
        withExactExternalImportLock(scope.tenantId, () =>
          Promise.resolve('next-import'),
        ),
      ).resolves.toBe('next-import');
    });

    it('advances the full source cursor when only sections without API key access are missing', async () => {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
      });
      const store = await prisma.store.findUniqueOrThrow({
        where: { id: scope.storeId },
      });
      const authority = createLangameExternalPilotAuthority({
        tenantId: scope.tenantId,
        tenantSlug: scope.tenantSlug,
        sourceId: scope.sourceId,
        storeId: scope.storeId,
        externalDomain: scope.domain,
        externalClubId: scope.clubId,
        profileRevision: tenant.entitlementProfileRevision,
        executionRevision: tenant.executionRevision,
        storeRevision: store.executionRevision,
        customerStage: 'LIVE',
      });
      const oldDate = new Date('2026-09-20T00:00:00.000Z');
      await prisma.integrationSource.update({
        where: { id: scope.sourceId },
        data: { lastSyncedDate: oldDate, lastSyncedAt: oldDate },
      });
      const client = {
        listClubs: jest
          .fn()
          .mockResolvedValue([
            { id: 1, active: 1, name: 'Synthetic Store', address: null },
          ]),
        listProducts: jest.fn().mockResolvedValue([]),
        listActiveProductGroups: jest
          .fn()
          .mockRejectedValue(new Error('Langame 403 no permissions')),
        listClubProductConfiguration: jest
          .fn()
          .mockRejectedValue(new Error('Langame 403 no permissions')),
        listGoods: jest.fn().mockResolvedValue([]),
        listProductExpenses: jest.fn().mockResolvedValue([]),
        listAllOperationsLog: jest.fn().mockResolvedValue([]),
      };
      const settings = {
        resolveTenantAccess: jest.fn(async () => ({
          apiKey: 'fixture-unused',
          sources: await prisma.integrationSource.findMany({
            where: { tenantId: scope.tenantId, isActive: true },
          }),
        })),
      };
      const config = { get: () => undefined } as unknown as ConfigService;
      const admission = new TenantExecutionAdmissionService(
        prisma,
        new TenantExecutionPolicyService(),
      );
      const sync = new LangameSyncService(
        prisma,
        {} as TenantContextService,
        client as unknown as LangameClient,
        settings as unknown as LangameSettingsService,
        admission,
        config,
      );
      const foundation = {
        syncTenantById: jest.fn().mockResolvedValue({
          sources: 1,
          failedSources: 0,
          partialSources: 0,
          sourceResults: [],
        }),
      };
      const snapshots = {
        runSnapshotsForTenant: jest.fn().mockResolvedValue({ runs: [] }),
      };
      const daily = new LangameDailySyncService(
        config,
        prisma,
        sync,
        foundation as unknown as GuestDataFoundationService,
        snapshots as unknown as BusinessSnapshotService,
        admission,
      );

      const partial = await daily.runDailySync({
        tenantSlug: scope.tenantSlug,
        externalBusinessDate: '2026-09-26',
        externalPilot: authority,
      });
      // Categories and club settings are not given to this key: a reported
      // limit, so the business facts of the day are complete.
      expect(partial.results[0].scopes[0]).toMatchObject({
        status: 'SUCCESS',
      });
      const advanced = await prisma.integrationSource.findUniqueOrThrow({
        where: { id: scope.sourceId },
      });
      expect(advanced.lastSyncedDate).toEqual(
        new Date('2026-09-26T00:00:00.000Z'),
      );
      await prisma.integrationSyncJob.updateMany({
        where: {
          tenantId: scope.tenantId,
          mode: { in: ['CATALOG', 'QUICK', 'INVENTORY'] },
        },
        data: { startedAt: new Date(Date.now() - 60_000) },
      });
      const latest = await prisma.integrationSyncJob.findFirstOrThrow({
        where: { tenantId: scope.tenantId },
        orderBy: { startedAt: 'desc' },
      });
      expect(latest).toMatchObject({ mode: 'FULL', status: 'SUCCESS' });
      expect(
        await prisma.integrationSyncJob.findFirstOrThrow({
          where: { tenantId: scope.tenantId, mode: 'CATALOG' },
          orderBy: { startedAt: 'desc' },
        }),
      ).toMatchObject({
        status: 'SUCCESS',
        errorMessage: expect.stringContaining(
          'LANGAME_SYNC_LIMITED:',
        ) as unknown,
      });
      expect(
        await prisma.integrationSyncJob.count({
          where: {
            tenantId: scope.tenantId,
            mode: { in: ['QUICK', 'INVENTORY'] },
            status: 'SUCCESS',
          },
        }),
      ).toBe(2);

      client.listActiveProductGroups.mockResolvedValue([]);
      client.listClubProductConfiguration.mockResolvedValue([]);
      await prisma.integrationSyncJob.updateMany({
        where: { tenantId: scope.tenantId, mode: 'INVENTORY' },
        data: { finishedAt: new Date(Date.now() - 2 * 60 * 60_000) },
      });
      const full = await daily.runDailySync({
        tenantSlug: scope.tenantSlug,
        externalBusinessDate: '2026-09-27',
        externalPilot: authority,
      });
      expect(full.results[0].scopes[0]).toMatchObject({ status: 'SUCCESS' });
      expect(
        (
          await prisma.integrationSource.findUniqueOrThrow({
            where: { id: scope.sourceId },
          })
        ).lastSyncedDate,
      ).toEqual(new Date('2026-09-27T00:00:00.000Z'));
      await prisma.integrationSyncJob.updateMany({
        where: {
          tenantId: scope.tenantId,
          mode: { in: ['CATALOG', 'QUICK', 'INVENTORY'] },
        },
        data: { startedAt: new Date(Date.now() - 60_000) },
      });
      const latestFull = await prisma.integrationSyncJob.findFirstOrThrow({
        where: { tenantId: scope.tenantId },
        orderBy: { startedAt: 'desc' },
      });
      expect(latestFull).toMatchObject({
        mode: 'FULL',
        status: 'SUCCESS',
        errorMessage: null,
      });

      client.listActiveProductGroups.mockRejectedValue(
        new Error('Langame 403 no permissions'),
      );
      const canaryPartial = await daily.runDailySync({
        tenantSlug: scope.tenantSlug,
        date: '2026-09-23',
        externalPilot: authority,
      });
      expect(canaryPartial.results[0]).toMatchObject({
        inventoryRequested: true,
      });
      expect(canaryPartial.results[0].scopes[0]).toMatchObject({
        status: 'SUCCESS',
        inventoryRequested: true,
      });
      expect(
        (
          await prisma.integrationSource.findUniqueOrThrow({
            where: { id: scope.sourceId },
          })
        ).lastSyncedDate,
      ).toEqual(new Date('2026-09-27T00:00:00.000Z'));
      const canaryAggregate = await prisma.integrationSyncJob.findFirstOrThrow({
        where: { tenantId: scope.tenantId, mode: 'FULL' },
        orderBy: { startedAt: 'desc' },
      });
      expect(canaryAggregate).toMatchObject({ status: 'SUCCESS' });
      client.listActiveProductGroups.mockResolvedValue([]);
      const canaryFull = await daily.runDailySync({
        tenantSlug: scope.tenantSlug,
        date: '2026-09-24',
        externalPilot: authority,
      });
      expect(canaryFull.results[0]).toMatchObject({
        inventoryRequested: true,
      });
      expect(canaryFull.results[0].scopes[0]).toMatchObject({
        status: 'SUCCESS',
        inventoryRequested: true,
      });
      expect(
        (
          await prisma.integrationSource.findUniqueOrThrow({
            where: { id: scope.sourceId },
          })
        ).lastSyncedDate,
      ).toEqual(new Date('2026-09-27T00:00:00.000Z'));
      const canarySuccess = await prisma.integrationSyncJob.findFirstOrThrow({
        where: { tenantId: scope.tenantId, mode: 'FULL' },
        orderBy: { startedAt: 'desc' },
      });
      expect(canarySuccess).toMatchObject({
        status: 'SUCCESS',
        errorMessage: null,
      });
    });

    it('revokes only data OUTBOUND and invalidates the worker execution revision', async () => {
      const prepared = await writer.prepare(
        actor,
        scope.tenantId,
        'REVOKE_OUTBOUND',
      );
      const reason = 'Synthetic external worker kill-switch acceptance';
      const requestId = randomUUID();
      await writer.apply(actor, scope.tenantId, {
        action: 'REVOKE_OUTBOUND',
        confirmation: scope.tenantSlug,
        requestId,
        planSha256: prepared.planSha256,
        reason,
        approval: approval(
          'REVOKE_OUTBOUND',
          prepared.planSha256,
          requestId,
          reason,
        ),
      });
      expect(
        await prisma.tenantModuleEntitlement.count({
          where: { tenantId: scope.tenantId, outboundEnabled: true },
        }),
      ).toBe(0);
    });
  },
);
