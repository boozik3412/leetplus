import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  IdentityEmailClaimType,
  Prisma,
  PrismaClient,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
  type IdentityEmailClaimTransaction,
  type IdentityEmailClaimTransactionHost,
} from '../src/auth/identity-email-claim.service';
import { PrismaIdentityMailWorkerRepository } from '../src/identity-mail-worker/identity-mail-worker.repository';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-identity-email-tenant-lock-cross-path-postgres-e2e';
const integrationEnabled =
  process.env.IDENTITY_EMAIL_TENANT_LOCK_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const CURRENT_MIGRATION = '20260804120000_guest_game_max_pending_rewards';
const CURRENT_MIGRATION_COUNT = 180;
const IDENTITY_MAIL_TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const IDENTITY_MAIL_TENANT_LOCK_SEED = 180;
const IDENTITY_FINGERPRINT_KEY =
  'identity-tenant-lock-pg-fixture-key-aaaaaaaaaaaaaaaa';
const DISPOSABLE_DATABASE_PATTERN = /^lp_itl_e2e_[0-9a-f]{32}$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_itl_pg_[0-9a-f]{24}$/u;
const EXPECTED_WORKER_ROLLBACK = 'EXPECTED_SYNTHETIC_WORKER_ROLLBACK';
const WORKER_RPC_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v1"(TEXT)',
  'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)',
] as const;

// This is intentionally an application/locking seam for the CURRENT179
// identity-mail RPCs on the canonical CURRENT180 database head.
// One least-privilege repository case executes real claim_v1 and proves the
// EMPTY decision waits on the shared tenant lock. The synthetic worker retains
// relation-order coverage. Neither case claims ACTIVE/DRAINING coordinator or
// non-empty outbox state-machine coverage.

type InviteFixture = {
  tenantId: string;
  email: string;
  inviteId: string;
  claimRevision: number;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type Fulfilled<T> = {
  status: 'fulfilled';
  value: T;
};

type Rejected = {
  status: 'rejected';
  reason: unknown;
};

type Outcome<T> = Fulfilled<T> | Rejected;

type AdvisoryWait = {
  state: string;
  waitEventType: string;
  waitEvent: string;
  query: string;
};

type ContendedPathInput<T> = {
  admin: PrismaClient;
  boundary: IdentityEmailClaimService;
  databaseUrl: string;
  fixture: InviteFixture;
  tenantBId: string;
  workerDecision: 'COMMIT' | 'ROLLBACK';
  operation: (client: PrismaClient) => Promise<T>;
};

jest.setTimeout(240_000);

describePostgres(
  'IdentityEmailClaim tenant-lock cross-path PostgreSQL seam on canonical CURRENT180',
  () => {
    let maintenance: PrismaClient;
    let admin: PrismaClient;
    let boundary: IdentityEmailClaimService;
    let sourceDatabaseUrl: URL;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let workerDatabaseUrl = '';
    let workerRoleName = '';
    let workerPassword = '';
    let workerRoleOid = 0n;
    let baselineDeadlocks = 0n;

    beforeAll(async () => {
      sourceDatabaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_itl_e2e_${randomUUID().replaceAll('-', '')}`;
      workerRoleName = `lp_itl_pg_${randomUUID()
        .replaceAll('-', '')
        .slice(0, 24)}`;
      workerPassword = fixtureDigest(`worker-password:${randomUUID()}`);
      assertDisposableDatabaseName(disposableDatabase);
      assertDisposableRoleName(workerRoleName);
      disposableDatabaseUrl = databaseUrlFor(
        sourceDatabaseUrl,
        disposableDatabase,
      );

      maintenance = prismaFor(databaseUrlFor(sourceDatabaseUrl, 'postgres'));
      await maintenance.$connect();
      const [server] = await maintenance.$queryRaw<
        Array<{ postgresMajor: number; canCreateDatabase: boolean }>
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('server_version_num')::INTEGER / 10000
            AS "postgresMajor",
          role.rolcreatedb OR role.rolsuper AS "canCreateDatabase"
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = CURRENT_USER
      `);
      expect(server).toEqual({
        postgresMajor: 16,
        canCreateDatabase: true,
      });

      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${workerRoleName}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${workerPassword}'`,
      );
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      deployCanonicalPrismaMigrations(disposableDatabaseUrl, {
        failureMessage:
          'Failed to deploy canonical migrations into the disposable identity tenant-lock database',
        timeoutMs: 120_000,
      });

      admin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await admin.$connect();
      const [migrationState] = await admin.$queryRaw<
        Array<{ migrationCount: number; latestMigration: string }>
      >(Prisma.sql`
        SELECT
          pg_catalog.count(*)::INTEGER AS "migrationCount",
          pg_catalog.max(migration_name) AS "latestMigration"
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migrationState).toEqual({
        migrationCount: CURRENT_MIGRATION_COUNT,
        latestMigration: CURRENT_MIGRATION,
      });
      await installLeastPrivilegeWorkerRole(
        admin,
        disposableDatabase,
        workerRoleName,
      );
      const [workerRole] = await admin.$queryRaw<Array<{ roleOid: bigint }>>(
        Prisma.sql`
          SELECT role.oid::BIGINT AS "roleOid"
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ${workerRoleName}
        `,
      );
      if (!workerRole) {
        throw new Error('Disposable identity-mail worker role was not found');
      }
      workerRoleOid = workerRole.roleOid;
      workerDatabaseUrl = databaseUrlForRole(
        sourceDatabaseUrl,
        disposableDatabase,
        workerRoleName,
        workerPassword,
      );

      boundary = createBoundary();
      baselineDeadlocks = await readDeadlocks(admin);
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        if (admin) {
          const finalDeadlocks = await readDeadlocks(admin);
          if (finalDeadlocks !== baselineDeadlocks) {
            throw new Error(
              `Cross-path fixture observed PostgreSQL deadlocks: ${baselineDeadlocks} -> ${finalDeadlocks}`,
            );
          }
        }
      } catch (error) {
        cleanupErrors.push(error);
      }

      try {
        await admin?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }

      try {
        if (maintenance && disposableDatabase) {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
        }
        if (maintenance && workerRoleName) {
          assertDisposableRoleName(workerRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${workerRoleName}"`,
          );
        }
        if (maintenance && disposableDatabase && workerRoleName) {
          const [residue] = await maintenance.$queryRaw<
            Array<{ databaseCount: number; roleCount: number }>
          >(Prisma.sql`
            SELECT
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM pg_catalog.pg_database
                WHERE datname = ${disposableDatabase}
              ) AS "databaseCount",
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM pg_catalog.pg_roles
                WHERE rolname = ${workerRoleName}
              ) AS "roleCount"
          `);
          if (residue?.databaseCount !== 0 || residue.roleCount !== 0) {
            throw new Error(
              'Identity tenant-lock E2E cleanup left database or role residue',
            );
          }
        }
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        try {
          await maintenance?.$disconnect();
        } catch (error) {
          cleanupErrors.push(error);
        }
        workerPassword = '';
        workerRoleOid = 0n;
        workerRoleName = '';
        workerDatabaseUrl = '';
        disposableDatabaseUrl = '';
        disposableDatabase = '';
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'Identity tenant-lock PostgreSQL E2E cleanup failed',
        );
      }
    });

    it('serializes two create paths, preserves one canonical winner, and lets Tenant B progress', async () => {
      const tenantId = await createTenant(admin, 'create-a');
      const tenantBId = await createTenant(admin, 'create-b');
      const email = fixtureEmail('create');
      const firstLocked = deferred<void>();
      const releaseFirst = deferred<void>();
      const clients = await connectClients(disposableDatabaseUrl, 3);
      const [firstClient, secondClient, tenantBClient] = clients;
      const pids = await Promise.all(
        clients.map((client) => backendPid(client)),
      );
      expect(new Set(pids).size).toBe(3);

      let firstOutcomePromise: Promise<Outcome<InviteFixture>> | undefined;
      let secondOutcomePromise: Promise<Outcome<InviteFixture>> | undefined;
      try {
        firstOutcomePromise = capture(
          createCanonicalInvite(
            boundary,
            firstClient,
            tenantId,
            email,
            async () => {
              firstLocked.resolve(undefined);
              await releaseFirst.promise;
            },
          ),
        );
        await Promise.race([
          firstLocked.promise,
          firstOutcomePromise.then((outcome) => {
            if (outcome.status === 'rejected') {
              throw outcome.reason;
            }
            throw new Error('First create completed before exposing its lock');
          }),
        ]);

        secondOutcomePromise = capture(
          createCanonicalInvite(boundary, secondClient, tenantId, email),
        );
        const wait = await waitForAdvisoryWait(admin, pids[1]);
        expect(wait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(wait.query).toContain('pg_advisory_xact_lock');

        const tenantBProgress = await withTimeout(
          boundary.runTenantTransaction(
            tenantBClient,
            tenantBId,
            async (tx) => {
              const [row] = await tx.$queryRaw<Array<{ tenantId: string }>>(
                Prisma.sql`
                  SELECT "id" AS "tenantId"
                  FROM public."Tenant"
                  WHERE "id" = ${tenantBId}
                `,
              );
              return row?.tenantId;
            },
          ),
          3_000,
          'Tenant B did not progress while Tenant A create held its lock',
        );
        expect(tenantBProgress).toBe(tenantBId);

        releaseFirst.resolve(undefined);
        const firstOutcome = await firstOutcomePromise;
        const secondOutcome = await secondOutcomePromise;
        expect(firstOutcome.status).toBe('fulfilled');
        if (firstOutcome.status === 'rejected') {
          assertNotDeadlock(firstOutcome.reason);
          throw firstOutcome.reason;
        }
        expect(secondOutcome.status).toBe('rejected');
        if (secondOutcome.status === 'rejected') {
          assertNotDeadlock(secondOutcome.reason);
          expect(reasonCode(secondOutcome.reason)).toBe(
            'IDENTITY_EMAIL_UNAVAILABLE',
          );
        }

        await expect(
          admin.userInvite.count({
            where: {
              tenantId,
              email,
              acceptedAt: null,
              revokedAt: null,
            },
          }),
        ).resolves.toBe(1);
        await expect(
          admin.identityEmailClaim.findUniqueOrThrow({
            where: { emailCanonical: email },
          }),
        ).resolves.toMatchObject({
          tenantId,
          claimType: IdentityEmailClaimType.INVITE,
          subjectId: firstOutcome.value.inviteId,
          revision: 2,
        });
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } finally {
        releaseFirst.resolve(undefined);
        await Promise.allSettled(
          [firstOutcomePromise, secondOutcomePromise].filter(
            (promise): promise is Promise<Outcome<InviteFixture>> =>
              promise !== undefined,
          ),
        );
        await disconnectClients(clients);
      }
    });

    it('uses a fresh READ COMMITTED statement snapshot after waiting for the tenant lock', async () => {
      const tenantId = await createTenant(admin, 'fresh-snapshot');
      const committedName = `Identity lock fresh committed ${randomUUID().slice(0, 8)}`;
      const holderLocked = deferred<void>();
      const releaseHolder = deferred<void>();
      const clients = await connectClients(disposableDatabaseUrl, 2);
      const [holderClient, waiterClient] = clients;
      const waiterPid = await backendPid(waiterClient);
      let holderOutcomePromise: Promise<Outcome<void>> | undefined;
      let waiterOutcomePromise:
        | Promise<Outcome<string | undefined>>
        | undefined;
      let waiterAttempts = 0;

      try {
        holderOutcomePromise = capture(
          boundary.runTenantTransaction(holderClient, tenantId, async (tx) => {
            await tx.tenant.update({
              where: { id: tenantId },
              data: { name: committedName },
            });
            holderLocked.resolve(undefined);
            await releaseHolder.promise;
          }),
        );
        await Promise.race([
          holderLocked.promise,
          holderOutcomePromise.then((outcome) => {
            if (outcome.status === 'rejected') {
              throw outcome.reason;
            }
            throw new Error('Holder committed before exposing its tenant lock');
          }),
        ]);

        waiterOutcomePromise = capture(
          boundary.runTenantTransaction(
            countedHost(waiterClient, () => {
              waiterAttempts += 1;
            }),
            tenantId,
            async (tx) => {
              const [row] = await tx.$queryRaw<Array<{ name: string }>>(
                Prisma.sql`
                  SELECT tenant.name
                  FROM public."Tenant" AS tenant
                  WHERE tenant.id = ${tenantId}
                `,
              );
              return row?.name;
            },
          ),
        );
        const wait = await waitForAdvisoryWait(admin, waiterPid);
        expect(wait.query).toContain('pg_advisory_xact_lock');

        releaseHolder.resolve(undefined);
        const [holderOutcome, waiterOutcome] = await Promise.all([
          holderOutcomePromise,
          waiterOutcomePromise,
        ]);
        if (holderOutcome.status === 'rejected') {
          assertNotDeadlock(holderOutcome.reason);
          throw holderOutcome.reason;
        }
        if (waiterOutcome.status === 'rejected') {
          assertNotDeadlock(waiterOutcome.reason);
          throw waiterOutcome.reason;
        }
        expect(waiterOutcome.value).toBe(committedName);
        expect(waiterAttempts).toBe(1);
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } finally {
        releaseHolder.resolve(undefined);
        const pending: Promise<unknown>[] = [];
        if (holderOutcomePromise) {
          pending.push(holderOutcomePromise);
        }
        if (waiterOutcomePromise) {
          pending.push(waiterOutcomePromise);
        }
        await Promise.allSettled(pending);
        await disconnectClients(clients);
      }
    });

    it.each([
      ['cancel', 'COMMIT'],
      ['reissue', 'ROLLBACK'],
      ['accept', 'COMMIT'],
    ] as const)(
      'keeps %s tenant-first against the synthetic worker order (%s)',
      async (path, workerDecision) => {
        const fixture = await createCanonicalInvite(
          boundary,
          admin,
          await createTenant(admin, `${path}-a`),
          fixtureEmail(path),
        );
        const tenantBId = await createTenant(admin, `${path}-b`);

        const result = await runContendedPath({
          admin,
          boundary,
          databaseUrl: disposableDatabaseUrl,
          fixture,
          tenantBId,
          workerDecision,
          operation: (client) => {
            if (path === 'cancel') {
              return cancelInvitePath(boundary, client, fixture);
            }
            if (path === 'reissue') {
              return reissueInvitePath(boundary, client, fixture);
            }
            return acceptInvitePath(boundary, client, fixture);
          },
        });

        if (path === 'cancel') {
          expect(result).toEqual({ decision: 'CANCELED' });
          const canceledInvite = await admin.userInvite.findUniqueOrThrow({
            where: { id: fixture.inviteId },
          });
          expect(canceledInvite.revokedAt).toBeInstanceOf(Date);
          await expect(
            admin.identityEmailClaim.count({
              where: { emailCanonical: fixture.email },
            }),
          ).resolves.toBe(0);
        } else if (path === 'reissue') {
          expect(result).toMatchObject({
            decision: 'REISSUED',
            claimRevision: 3,
          });
          if (!('inviteId' in result)) {
            throw new Error('Reissue result did not contain inviteId');
          }
          const revokedInvite = await admin.userInvite.findUniqueOrThrow({
            where: { id: fixture.inviteId },
          });
          expect(revokedInvite.revokedAt).toBeInstanceOf(Date);
          await expect(
            admin.identityEmailClaim.findUniqueOrThrow({
              where: { emailCanonical: fixture.email },
            }),
          ).resolves.toMatchObject({
            tenantId: fixture.tenantId,
            claimType: IdentityEmailClaimType.INVITE,
            subjectId: result.inviteId,
            revision: 3,
          });
        } else {
          expect(result).toMatchObject({
            decision: 'ACCEPTED',
            claimRevision: 3,
          });
          if (!('userId' in result)) {
            throw new Error('Accept result did not contain userId');
          }
          const acceptedInvite = await admin.userInvite.findUniqueOrThrow({
            where: { id: fixture.inviteId },
          });
          expect(acceptedInvite).toMatchObject({
            acceptedByUserId: result.userId,
          });
          expect(acceptedInvite.acceptedAt).toBeInstanceOf(Date);
          await expect(
            admin.identityEmailClaim.findUniqueOrThrow({
              where: { emailCanonical: fixture.email },
            }),
          ).resolves.toMatchObject({
            tenantId: fixture.tenantId,
            claimType: IdentityEmailClaimType.USER,
            subjectId: result.userId,
            revision: 3,
          });
        }
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      },
    );

    it('makes a real least-privilege CURRENT179 claim_v1 EMPTY RPC wait behind application cancel while Tenant B progresses', async () => {
      const fixture = await createCanonicalInvite(
        boundary,
        admin,
        await createTenant(admin, 'repository-a'),
        fixtureEmail('repository-a'),
      );
      const tenantBId = await createTenant(admin, 'repository-b');
      const providerAuthorityDigest = fixtureDigest(
        `provider-authority:${fixture.tenantId}`,
      );
      await Promise.all([
        createWorkerEnrollment(admin, {
          tenantId: fixture.tenantId,
          workerRoleName,
          workerRoleOid,
          providerAuthorityDigest,
        }),
        createWorkerEnrollment(admin, {
          tenantId: tenantBId,
          workerRoleName,
          workerRoleOid,
          providerAuthorityDigest,
        }),
      ]);

      const applicationClient = await connectedClient(disposableDatabaseUrl);
      const workerAClient = await connectedClient(workerDatabaseUrl);
      const workerBClient = await connectedClient(workerDatabaseUrl);
      const [applicationPid, workerAPid, workerBPid] = await Promise.all([
        backendPid(applicationClient),
        backendPid(workerAClient),
        backendPid(workerBClient),
      ]);
      expect(new Set([applicationPid, workerAPid, workerBPid]).size).toBe(3);

      const applicationLocked = deferred<void>();
      const releaseApplication = deferred<void>();
      let applicationOutcomePromise:
        | Promise<Outcome<{ decision: 'CANCELED' }>>
        | undefined;
      let workerOutcomePromise: Promise<Outcome<unknown>> | undefined;
      try {
        applicationOutcomePromise = capture(
          cancelInvitePath(boundary, applicationClient, fixture, async () => {
            applicationLocked.resolve(undefined);
            await releaseApplication.promise;
          }),
        );
        await Promise.race([
          applicationLocked.promise,
          applicationOutcomePromise.then((outcome) => {
            if (outcome.status === 'rejected') {
              throw outcome.reason;
            }
            throw new Error(
              'Application cancel completed before exposing its tenant lock',
            );
          }),
        ]);

        const repositoryA = new PrismaIdentityMailWorkerRepository(
          workerAClient,
        );
        const repositoryB = new PrismaIdentityMailWorkerRepository(
          workerBClient,
        );
        workerOutcomePromise = capture(
          repositoryA.claimOne({
            tenantId: fixture.tenantId,
            leaseOwnerDigest: fixtureDigest('repository-a-lease-owner'),
            leaseTokenDigest: fixtureDigest('repository-a-lease-token'),
            providerAuthorityDigest,
          }),
        );
        const wait = await waitForAdvisoryWait(admin, workerAPid);
        expect(wait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(wait.query).toContain('pg_advisory_xact_lock');

        const tenantBClaim = await withTimeout(
          repositoryB.claimOne({
            tenantId: tenantBId,
            leaseOwnerDigest: fixtureDigest('repository-b-lease-owner'),
            leaseTokenDigest: fixtureDigest('repository-b-lease-token'),
            providerAuthorityDigest,
          }),
          3_000,
          'Tenant B real repository claim did not progress',
        );
        expect(tenantBClaim).toBeNull();

        releaseApplication.resolve(undefined);
        const [applicationOutcome, workerOutcome] = await Promise.all([
          applicationOutcomePromise,
          workerOutcomePromise,
        ]);
        if (applicationOutcome.status === 'rejected') {
          assertNotDeadlock(applicationOutcome.reason);
          throw applicationOutcome.reason;
        }
        if (workerOutcome.status === 'rejected') {
          assertNotDeadlock(workerOutcome.reason);
          throw workerOutcome.reason;
        }
        expect(applicationOutcome.value).toEqual({ decision: 'CANCELED' });
        expect(workerOutcome.value).toBeNull();
        await expect(
          admin.identityEmailClaim.count({
            where: { emailCanonical: fixture.email },
          }),
        ).resolves.toBe(0);
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } finally {
        releaseApplication.resolve(undefined);
        const pendingOutcomes: Promise<unknown>[] = [];
        if (applicationOutcomePromise) {
          pendingOutcomes.push(applicationOutcomePromise);
        }
        if (workerOutcomePromise) {
          pendingOutcomes.push(workerOutcomePromise);
        }
        await Promise.allSettled(pendingOutcomes);
        await disconnectClients([
          applicationClient,
          workerAClient,
          workerBClient,
        ]);
      }
    });

    it('rolls back an application cancel plus claim release with zero partial state', async () => {
      const fixture = await createCanonicalInvite(
        boundary,
        admin,
        await createTenant(admin, 'rollback'),
        fixtureEmail('rollback'),
      );
      const client = await connectedClient(disposableDatabaseUrl);
      const rollback = new Error('EXPECTED_APPLICATION_ROLLBACK');
      try {
        await expect(
          boundary.runTenantTransaction(
            client,
            fixture.tenantId,
            async (tx, identityTx) => {
              await cancelInviteMutation(boundary, tx, identityTx, fixture);
              throw rollback;
            },
          ),
        ).rejects.toBe(rollback);

        await expect(
          admin.userInvite.findUniqueOrThrow({
            where: { id: fixture.inviteId },
          }),
        ).resolves.toMatchObject({
          acceptedAt: null,
          revokedAt: null,
          identityClaimRevision: fixture.claimRevision,
        });
        await expect(
          admin.identityEmailClaim.findUniqueOrThrow({
            where: { emailCanonical: fixture.email },
          }),
        ).resolves.toMatchObject({
          tenantId: fixture.tenantId,
          claimType: IdentityEmailClaimType.INVITE,
          subjectId: fixture.inviteId,
          revision: fixture.claimRevision,
        });
        await expect(backendPid(client)).resolves.toEqual(expect.any(Number));
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } finally {
        await client.$disconnect();
      }
    });

    it('recovers from a real 55P03 tenant-lock timeout on the second whole-transaction attempt', async () => {
      const fixture = await createCanonicalInvite(
        boundary,
        admin,
        await createTenant(admin, 'lock-timeout'),
        fixtureEmail('lock-timeout'),
      );
      const holderClient = await connectedClient(disposableDatabaseUrl);
      const applicationClient = await connectedClient(disposableDatabaseUrl);
      const applicationPid = await backendPid(applicationClient);
      const workerLocked = deferred<number>();
      const releaseWorker = deferred<void>();
      let transactionAttempts = 0;
      let callbackInvocations = 0;
      const counted = countedHost(applicationClient, () => {
        transactionAttempts += 1;
      });
      const workerOutcomePromise = capture(
        syntheticWorkerOrder(
          holderClient,
          fixture,
          workerLocked,
          releaseWorker,
          'COMMIT',
        ),
      );
      let applicationOutcomePromise:
        | Promise<Outcome<{ backendPid: number }>>
        | undefined;
      try {
        await workerLocked.promise;
        const startedAt = Date.now();
        applicationOutcomePromise = capture(
          boundary.runTenantTransaction(
            counted,
            fixture.tenantId,
            async (tx) => {
              callbackInvocations += 1;
              const [row] = await tx.$queryRaw<Array<{ backendPid: number }>>(
                Prisma.sql`
                  SELECT pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
                `,
              );
              if (!row) {
                throw new Error('Application backend PID was unavailable');
              }
              return row;
            },
          ),
        );
        await waitForAdvisoryWait(admin, applicationPid);

        // The application lock_timeout is exactly 5s. Holding longer forces
        // the first transaction to fail with 55P03 before the retry can win.
        await delay(5_250);
        releaseWorker.resolve(undefined);

        const applicationOutcome = await applicationOutcomePromise;
        const workerOutcome = await workerOutcomePromise;
        expect(workerOutcome.status).toBe('fulfilled');
        if (applicationOutcome.status === 'rejected') {
          assertNotDeadlock(applicationOutcome.reason);
          throw applicationOutcome.reason;
        }
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(5_000);
        expect(transactionAttempts).toBe(2);
        expect(callbackInvocations).toBe(1);
        expect(applicationOutcome.value.backendPid).toEqual(expect.any(Number));
        await expect(backendPid(applicationClient)).resolves.toEqual(
          expect.any(Number),
        );
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } finally {
        releaseWorker.resolve(undefined);
        await Promise.allSettled([
          workerOutcomePromise,
          ...(applicationOutcomePromise ? [applicationOutcomePromise] : []),
        ]);
        await disconnectClients([holderClient, applicationClient]);
      }
    });

    it('recovers from a real 57014 statement timeout and reuses the connection', async () => {
      const tenantId = await createTenant(admin, 'statement-timeout');
      const client = await connectedClient(disposableDatabaseUrl);
      let transactionAttempts = 0;
      let callbackInvocations = 0;
      const counted = countedHost(client, () => {
        transactionAttempts += 1;
      });
      try {
        const result = await boundary.runTenantTransaction(
          counted,
          tenantId,
          async (tx) => {
            callbackInvocations += 1;
            if (callbackInvocations === 1) {
              await tx.$executeRawUnsafe(
                `SET LOCAL statement_timeout = '75ms'`,
              );
              await tx.$queryRaw(Prisma.sql`SELECT pg_catalog.pg_sleep(0.25)`);
            }
            const [row] = await tx.$queryRaw<Array<{ backendPid: number }>>(
              Prisma.sql`
                SELECT pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
              `,
            );
            if (!row) {
              throw new Error('Application backend PID was unavailable');
            }
            return row;
          },
        );

        expect(result.backendPid).toEqual(expect.any(Number));
        expect(transactionAttempts).toBe(2);
        expect(callbackInvocations).toBe(2);
        await expect(
          client.$queryRaw(Prisma.sql`SELECT 1::INTEGER AS value`),
        ).resolves.toEqual([{ value: 1 }]);
        await assertDeadlocksUnchanged(admin, baselineDeadlocks);
      } catch (error) {
        assertNotDeadlock(error);
        throw error;
      } finally {
        await client.$disconnect();
      }
    });
  },
);

async function runContendedPath<T>(input: ContendedPathInput<T>): Promise<T> {
  const clients = await connectClients(input.databaseUrl, 3);
  const [workerClient, applicationClient, tenantBClient] = clients;
  const [workerPid, applicationPid, tenantBPid] = await Promise.all(
    clients.map((client) => backendPid(client)),
  );
  expect(new Set([workerPid, applicationPid, tenantBPid]).size).toBe(3);

  const workerLocked = deferred<number>();
  const releaseWorker = deferred<void>();
  const workerOutcomePromise = capture(
    syntheticWorkerOrder(
      workerClient,
      input.fixture,
      workerLocked,
      releaseWorker,
      input.workerDecision,
    ),
  );
  let applicationOutcomePromise: Promise<Outcome<T>> | undefined;
  try {
    await expect(workerLocked.promise).resolves.toBe(workerPid);
    applicationOutcomePromise = capture(input.operation(applicationClient));
    const wait = await waitForAdvisoryWait(input.admin, applicationPid);
    expect(wait).toMatchObject({
      state: 'active',
      waitEventType: 'Lock',
      waitEvent: 'advisory',
    });
    expect(wait.query).toContain('pg_advisory_xact_lock');

    const tenantBProgress = await withTimeout(
      input.boundary.runTenantTransaction(
        tenantBClient,
        input.tenantBId,
        async (tx) => {
          const [row] = await tx.$queryRaw<
            Array<{ tenantId: string; backendPid: number }>
          >(Prisma.sql`
            SELECT
              tenant."id" AS "tenantId",
              pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
            FROM public."Tenant" AS tenant
            WHERE tenant."id" = ${input.tenantBId}
          `);
          return row;
        },
      ),
      3_000,
      'Tenant B did not progress while Tenant A was locked',
    );
    expect(tenantBProgress).toEqual({
      tenantId: input.tenantBId,
      backendPid: tenantBPid,
    });

    releaseWorker.resolve(undefined);
    const workerOutcome = await workerOutcomePromise;
    if (input.workerDecision === 'COMMIT') {
      expect(workerOutcome.status).toBe('fulfilled');
      if (workerOutcome.status === 'rejected') {
        assertNotDeadlock(workerOutcome.reason);
        throw workerOutcome.reason;
      }
    } else {
      expect(workerOutcome.status).toBe('rejected');
      if (workerOutcome.status === 'rejected') {
        assertNotDeadlock(workerOutcome.reason);
        expect(workerOutcome.reason).toBeInstanceOf(Error);
        if (!(workerOutcome.reason instanceof Error)) {
          throw workerOutcome.reason;
        }
        expect(workerOutcome.reason.message).toBe(EXPECTED_WORKER_ROLLBACK);
      }
    }

    const applicationOutcome = await applicationOutcomePromise;
    if (applicationOutcome.status === 'rejected') {
      assertNotDeadlock(applicationOutcome.reason);
      throw applicationOutcome.reason;
    }
    return applicationOutcome.value;
  } finally {
    releaseWorker.resolve(undefined);
    await Promise.allSettled([
      workerOutcomePromise,
      ...(applicationOutcomePromise ? [applicationOutcomePromise] : []),
    ]);
    await disconnectClients(clients);
  }
}

async function syntheticWorkerOrder(
  client: PrismaClient,
  fixture: InviteFixture,
  locked: Deferred<number>,
  release: Deferred<void>,
  decision: 'COMMIT' | 'ROLLBACK',
): Promise<void> {
  try {
    await client.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT
          pg_catalog.set_config('statement_timeout', '25s', true),
          pg_catalog.set_config('lock_timeout', '5s', true)
      `);
      const [tenantLock] = await tx.$queryRaw<
        Array<{ tenantId: string; backendPid: number }>
      >(Prisma.sql`
        WITH tenant_lock AS MATERIALIZED (
          SELECT pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
              ${IDENTITY_MAIL_TENANT_LOCK_DOMAIN} || ${fixture.tenantId}::TEXT,
              ${IDENTITY_MAIL_TENANT_LOCK_SEED}
            )
          ) AS acquired
        )
        SELECT
          ${fixture.tenantId}::TEXT AS "tenantId",
          pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
        FROM tenant_lock
      `);
      if (!tenantLock || tenantLock.tenantId !== fixture.tenantId) {
        throw new Error('Synthetic worker did not acquire the tenant lock');
      }

      const invites = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT invite."id"
        FROM public."UserInvite" AS invite
        WHERE invite."tenantId" = ${fixture.tenantId}
          AND invite."id" = ${fixture.inviteId}
        FOR SHARE
      `);
      if (invites.length !== 1) {
        throw new Error('Synthetic worker invite fixture was not found');
      }

      const [emailLock] = await tx.$queryRaw<Array<{ email: string }>>(
        Prisma.sql`
          SELECT public."identity_email_claim_lock_v1"(
            ${fixture.email}::TEXT
          ) AS email
        `,
      );
      if (emailLock?.email !== fixture.email) {
        throw new Error('Synthetic worker email lock was not acquired');
      }

      const claims = await tx.$queryRaw<
        Array<{ subjectId: string; revision: number }>
      >(Prisma.sql`
        SELECT claim."subjectId", claim."revision"
        FROM public."IdentityEmailClaim" AS claim
        WHERE claim."emailCanonical" = ${fixture.email}
          AND claim."tenantId" = ${fixture.tenantId}
        FOR SHARE
      `);
      if (
        claims.length !== 1 ||
        claims[0]?.subjectId !== fixture.inviteId ||
        claims[0]?.revision !== fixture.claimRevision
      ) {
        throw new Error('Synthetic worker claim fixture changed');
      }

      locked.resolve(tenantLock.backendPid);
      await release.promise;
      if (decision === 'ROLLBACK') {
        throw new Error(EXPECTED_WORKER_ROLLBACK);
      }
    }, IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  } catch (error) {
    locked.reject(error);
    throw error;
  }
}

async function cancelInvitePath(
  boundary: IdentityEmailClaimService,
  client: PrismaClient,
  fixture: InviteFixture,
  afterTenantLock?: () => Promise<void>,
): Promise<{ decision: 'CANCELED' }> {
  return boundary.runTenantTransaction(
    client,
    fixture.tenantId,
    async (tx, identityTx) => {
      await afterTenantLock?.();
      await cancelInviteMutation(boundary, tx, identityTx, fixture);
      return { decision: 'CANCELED' };
    },
  );
}

async function cancelInviteMutation(
  boundary: IdentityEmailClaimService,
  tx: Prisma.TransactionClient,
  identityTx: IdentityEmailClaimTransaction,
  fixture: InviteFixture,
): Promise<void> {
  const assertion = await boundary.assertInvite(identityTx, {
    email: fixture.email,
    tenantId: fixture.tenantId,
    subjectId: fixture.inviteId,
    expectedRevision: fixture.claimRevision,
  });
  const canceledAt = new Date();
  const canceled = await tx.userInvite.updateMany({
    where: {
      id: fixture.inviteId,
      tenantId: fixture.tenantId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: {
      expiresAt: canceledAt,
      revokedAt: canceledAt,
    },
  });
  if (canceled.count !== 1) {
    throw new ConflictException('Invite changed before cancellation');
  }
  await boundary.releaseInvite(identityTx, {
    email: fixture.email,
    tenantId: fixture.tenantId,
    expectedSubjectId: fixture.inviteId,
    expectedRevision: assertion.revision,
  });
}

async function reissueInvitePath(
  boundary: IdentityEmailClaimService,
  client: PrismaClient,
  fixture: InviteFixture,
): Promise<{
  decision: 'REISSUED';
  inviteId: string;
  claimRevision: number;
}> {
  const inviteId = randomUUID();
  const tokenHash = fixtureDigest(`reissue:${inviteId}`);
  return boundary.runTenantTransaction(
    client,
    fixture.tenantId,
    async (tx, identityTx) => {
      const assertion = await boundary.assertInvite(identityTx, {
        email: fixture.email,
        tenantId: fixture.tenantId,
        subjectId: fixture.inviteId,
        expectedRevision: fixture.claimRevision,
      });
      const revokedAt = new Date();
      await tx.userInvite.create({
        data: {
          id: inviteId,
          tenantId: fixture.tenantId,
          email: fixture.email,
          role: UserRole.ADMIN,
          accessScope: UserAccessScope.NETWORK,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          identityClaimRevision: null,
        },
      });
      const revoked = await tx.userInvite.updateMany({
        where: {
          id: fixture.inviteId,
          tenantId: fixture.tenantId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: {
          expiresAt: revokedAt,
          revokedAt,
        },
      });
      if (revoked.count !== 1) {
        throw new ConflictException('Invite changed before reissue');
      }
      const transition = await boundary.transitionInvite(identityTx, {
        email: fixture.email,
        tenantId: fixture.tenantId,
        expectedSubjectId: fixture.inviteId,
        expectedRevision: assertion.revision,
        nextClaimType: IdentityEmailClaimType.INVITE,
        nextSubjectId: inviteId,
      });
      await tx.userInvite.update({
        where: { id: inviteId },
        data: { identityClaimRevision: transition.revision },
      });
      return {
        decision: 'REISSUED',
        inviteId,
        claimRevision: transition.revision,
      };
    },
  );
}

async function acceptInvitePath(
  boundary: IdentityEmailClaimService,
  client: PrismaClient,
  fixture: InviteFixture,
): Promise<{
  decision: 'ACCEPTED';
  userId: string;
  claimRevision: number;
}> {
  const userId = randomUUID();
  return boundary.runTenantTransaction(
    client,
    fixture.tenantId,
    async (tx, identityTx) => {
      const assertion = await boundary.assertInvite(identityTx, {
        email: fixture.email,
        tenantId: fixture.tenantId,
        subjectId: fixture.inviteId,
        expectedRevision: fixture.claimRevision,
      });
      const tenants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT tenant."id"
        FROM public."Tenant" AS tenant
        WHERE tenant."id" = ${fixture.tenantId}
        FOR UPDATE
      `);
      if (tenants.length !== 1) {
        throw new ConflictException('Tenant changed before invite acceptance');
      }
      await tx.user.create({
        data: {
          id: userId,
          tenantId: fixture.tenantId,
          email: fixture.email,
          passwordHash: fixtureDigest(`password:${userId}`),
          role: UserRole.ADMIN,
          accessScope: UserAccessScope.NETWORK,
          emailVerifiedAt: new Date(),
          identityClaimRevision: null,
        },
      });
      const acceptedAt = new Date();
      const accepted = await tx.userInvite.updateMany({
        where: {
          id: fixture.inviteId,
          tenantId: fixture.tenantId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: acceptedAt },
        },
        data: {
          acceptedAt,
          acceptedByUserId: userId,
        },
      });
      if (accepted.count !== 1) {
        throw new ConflictException('Invite changed before acceptance');
      }
      const transition = await boundary.transitionInvite(identityTx, {
        email: fixture.email,
        tenantId: fixture.tenantId,
        expectedSubjectId: fixture.inviteId,
        expectedRevision: assertion.revision,
        nextClaimType: IdentityEmailClaimType.USER,
        nextSubjectId: userId,
      });
      await tx.user.update({
        where: { id: userId },
        data: { identityClaimRevision: transition.revision },
      });
      return {
        decision: 'ACCEPTED',
        userId,
        claimRevision: transition.revision,
      };
    },
  );
}

async function createCanonicalInvite(
  boundary: IdentityEmailClaimService,
  client: PrismaClient,
  tenantId: string,
  email: string,
  afterTenantLock?: () => Promise<void>,
): Promise<InviteFixture> {
  const reservationId = randomUUID();
  const inviteId = randomUUID();
  const tokenHash = fixtureDigest(`invite:${inviteId}`);
  return boundary.runTenantTransaction(
    client,
    tenantId,
    async (tx, identityTx) => {
      await afterTenantLock?.();
      const reservation = await boundary.reserveInvite(identityTx, {
        email,
        tenantId,
        subjectId: reservationId,
      });
      if (reservation.decision !== 'CREATED') {
        throw new ConflictException('Fixture reservation was already used');
      }
      const assertion = await boundary.assertInvite(identityTx, {
        email,
        tenantId,
        subjectId: reservationId,
        expectedRevision: reservation.revision,
      });
      await tx.userInvite.create({
        data: {
          id: inviteId,
          tenantId,
          email,
          role: UserRole.ADMIN,
          accessScope: UserAccessScope.NETWORK,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          identityClaimRevision: null,
        },
      });
      const transition = await boundary.transitionInvite(identityTx, {
        email,
        tenantId,
        expectedSubjectId: reservationId,
        expectedRevision: assertion.revision,
        nextClaimType: IdentityEmailClaimType.INVITE,
        nextSubjectId: inviteId,
      });
      await tx.userInvite.update({
        where: { id: inviteId },
        data: { identityClaimRevision: transition.revision },
      });
      return {
        tenantId,
        email,
        inviteId,
        claimRevision: transition.revision,
      };
    },
  );
}

async function createTenant(
  admin: PrismaClient,
  label: string,
): Promise<string> {
  const id = randomUUID();
  const suffix = id.replaceAll('-', '').slice(0, 12);
  const now = new Date();
  const tenant = await admin.tenant.create({
    data: {
      id,
      name: `Identity lock ${label} ${suffix}`,
      slug: `identity-lock-${label}-${suffix}`,
      status: TenantLifecycleStatus.ACTIVE,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.ACTIVE,
      trialStartsAt: new Date(now.getTime() - 60_000),
      trialEndsAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      statusChangedAt: now,
    },
    select: { id: true },
  });
  return tenant.id;
}

async function createWorkerEnrollment(
  admin: PrismaClient,
  input: {
    tenantId: string;
    workerRoleName: string;
    workerRoleOid: bigint;
    providerAuthorityDigest: string;
  },
): Promise<void> {
  const enabledAt = new Date();
  await admin.identityMailDeliveryTenantEnrollment.create({
    data: {
      tenantId: input.tenantId,
      workerRoleName: input.workerRoleName,
      workerRoleOid: input.workerRoleOid,
      enabled: true,
      maxAttempts: 3,
      leaseSeconds: 60,
      acknowledgeSeconds: 60,
      baseRetrySeconds: 5,
      maxRetrySeconds: 60,
      providerAuthorityDigest: input.providerAuthorityDigest,
      enabledAt,
      createdAt: enabledAt,
      updatedAt: enabledAt,
    },
  });
}

async function installLeastPrivilegeWorkerRole(
  admin: PrismaClient,
  databaseName: string,
  roleName: string,
): Promise<void> {
  assertDisposableDatabaseName(databaseName);
  assertDisposableRoleName(roleName);
  const database = `"${databaseName}"`;
  const role = `"${roleName}"`;
  const statements = [
    `REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    `REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${role}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
    'REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM ${role}`,
    'REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC',
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    ...WORKER_RPC_SIGNATURES.map(
      (signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`,
    ),
  ];
  for (const statement of statements) {
    await admin.$executeRawUnsafe(statement);
  }
}

function createBoundary(): IdentityEmailClaimService {
  const values: Record<string, string> = {
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: IDENTITY_FINGERPRINT_KEY,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
  };
  return new IdentityEmailClaimService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

function countedHost(
  client: PrismaClient,
  onAttempt: () => void,
): IdentityEmailClaimTransactionHost {
  return {
    $transaction: <T>(
      operation: (tx: Prisma.TransactionClient) => Promise<T>,
      options: typeof IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    ) => {
      onAttempt();
      return client.$transaction(operation, options);
    },
  };
}

async function waitForAdvisoryWait(
  admin: PrismaClient,
  pid: number,
): Promise<AdvisoryWait> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await admin.$queryRaw<AdvisoryWait[]>(Prisma.sql`
      SELECT
        activity.state,
        activity.wait_event_type AS "waitEventType",
        pg_catalog.lower(activity.wait_event) AS "waitEvent",
        activity.query
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${pid}
    `);
    if (
      activity?.state === 'active' &&
      activity.waitEventType === 'Lock' &&
      activity.waitEvent === 'advisory'
    ) {
      return activity;
    }
    await delay(25);
  }
  throw new Error(`Backend ${pid} did not expose an advisory-lock wait`);
}

async function backendPid(client: PrismaClient): Promise<number> {
  const [row] = await client.$queryRaw<Array<{ backendPid: number }>>(
    Prisma.sql`
      SELECT pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
    `,
  );
  if (!row || !Number.isInteger(row.backendPid)) {
    throw new Error('PostgreSQL backend PID was unavailable');
  }
  return row.backendPid;
}

async function readDeadlocks(client: PrismaClient): Promise<bigint> {
  const [row] = await client.$queryRaw<Array<{ deadlocks: bigint }>>(
    Prisma.sql`
      SELECT stats.deadlocks::BIGINT AS deadlocks
      FROM pg_catalog.pg_stat_database AS stats
      WHERE stats.datname = pg_catalog.current_database()
    `,
  );
  if (!row || typeof row.deadlocks !== 'bigint') {
    throw new Error('PostgreSQL deadlock counter was unavailable');
  }
  return row.deadlocks;
}

async function assertDeadlocksUnchanged(
  client: PrismaClient,
  baseline: bigint,
): Promise<void> {
  await expect(readDeadlocks(client)).resolves.toBe(baseline);
}

function assertNotDeadlock(error: unknown): void {
  expect(sqlState(error)).not.toBe('40P01');
}

function sqlState(error: unknown): string | null {
  if (!record(error)) {
    return null;
  }
  if (
    error.code === 'P2010' &&
    record(error.meta) &&
    typeof error.meta.code === 'string'
  ) {
    return error.meta.code;
  }
  return typeof error.code === 'string' && /^[0-9A-Z]{5}$/u.test(error.code)
    ? error.code
    : null;
}

function reasonCode(error: unknown): unknown {
  if (!(error instanceof ConflictException)) {
    return null;
  }
  const response = error.getResponse();
  return record(response) ? response.reasonCode : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function capture<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then<Fulfilled<T>, Rejected>(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fixtureEmail(label: string): string {
  return `identity-lock-${label}-${randomUUID().slice(0, 8)}@example.test`;
}

function fixtureDigest(value: string): string {
  return createHash('sha256')
    .update(`identity-email-tenant-lock-pg:v1:${value}`)
    .digest('hex');
}

async function connectClients(
  databaseUrl: string,
  count: number,
): Promise<PrismaClient[]> {
  const clients = Array.from({ length: count }, () =>
    prismaFor(singleConnectionUrl(databaseUrl)),
  );
  await Promise.all(clients.map((client) => client.$connect()));
  return clients;
}

async function connectedClient(databaseUrl: string): Promise<PrismaClient> {
  const client = prismaFor(singleConnectionUrl(databaseUrl));
  await client.$connect();
  return client;
}

async function disconnectClients(clients: PrismaClient[]): Promise<void> {
  const outcomes = await Promise.allSettled(
    clients.map((client) => client.$disconnect()),
  );
  const failures = outcomes
    .filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    )
    .map((outcome) => outcome.reason as unknown);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Failed to disconnect identity tenant-lock test clients',
    );
  }
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

function singleConnectionUrl(databaseUrl: string): string {
  const target = new URL(databaseUrl);
  target.searchParams.set('schema', 'public');
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('pool_timeout', '5');
  target.searchParams.set('connect_timeout', '5');
  return target.toString();
}

function databaseUrlFor(databaseUrl: URL, databaseName: string): string {
  const target = new URL(databaseUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.delete('schema');
  target.searchParams.delete('pgbouncer');
  return target.toString();
}

function databaseUrlForRole(
  databaseUrl: URL,
  databaseName: string,
  roleName: string,
  password: string,
): string {
  assertDisposableDatabaseName(databaseName);
  assertDisposableRoleName(roleName);
  const target = new URL(databaseUrlFor(databaseUrl, databaseName));
  target.username = roleName;
  target.password = password;
  return singleConnectionUrl(target.toString());
}

function assertSafeIntegrationDatabase(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing identity tenant-lock E2E when NODE_ENV is production',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for identity tenant-lock PostgreSQL E2E',
    );
  }
  const parsed = new URL(databaseUrl);
  const normalizedHostname = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(normalizedHostname) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing identity tenant-lock E2E outside a local CI/test database',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe disposable database name');
  }
}

function assertDisposableRoleName(roleName: string): void {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing an unsafe disposable worker role name');
  }
}
