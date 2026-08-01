import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
  PrismaIdentityMailWorkerV2CandidateRepository,
  type ClaimedIdentityMailDeliveryV2Candidate,
} from '../src/identity-mail-worker/identity-mail-worker-v2-candidate.repository';
import { deployIdentityMailCurrent183CandidateStack } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-identity-mail-worker-v2-current183-postgres-e2e';
const integrationEnabled =
  process.env.IDENTITY_MAIL_WORKER_V2_CURRENT183_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;

const DISPOSABLE_DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_imtec_pg_[0-9a-f]{24}$/u;
const RELEASE_SHA = 'a'.repeat(40);
const PROVIDER_AUTHORITY_DIGEST = fixtureDigest(
  'current183-provider-authority',
);
const WORKER_RPC_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)',
  'public."identity_initial_owner_mail_claim_v2"(TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_provider_mark_v2"(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_complete_v2"(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_reap_v2"(TEXT, TEXT, TEXT, INTEGER)',
] as const;

type EnrollmentState = 'ACTIVE' | 'DRAINING';
type OutboxState = 'HOLD' | 'PENDING';

type DiagnosticFixture = {
  tenantId: string;
  email: string;
  inviteId: string;
  outboxId: string;
  status: OutboxState;
  enrollmentState: EnrollmentState;
  enrollmentStateRevision: bigint;
  policyRevision: number;
  ciphertext: Buffer;
};

type AdvisoryWait = {
  state: string;
  waitEventType: string;
  waitEvent: string;
  query: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type Outcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

jest.setTimeout(300_000);

/**
 * CURRENT183 remains NOT_DEPLOYABLE. These fixtures deliberately bypass the
 * dormant signed coordinator guards, as database owner, inside an exact
 * disposable database. They prove worker-v2 eligibility, ACLs and snapshot
 * freshness only; they are not promotion or signed-authority evidence.
 */
describePostgres(
  'Identity-mail worker v2 CURRENT183 diagnostic PostgreSQL matrix',
  () => {
    let maintenance: PrismaClient;
    let admin: PrismaClient;
    let workerPrisma: PrismaClient;
    let repository: PrismaIdentityMailWorkerV2CandidateRepository;
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
      disposableDatabase = `lp_imtec_${randomUUID().replaceAll('-', '')}_ci`;
      workerRoleName = `lp_imtec_pg_${randomBytes(12).toString('hex')}`;
      workerPassword = randomBytes(24).toString('base64url');
      assertDisposableDatabaseName(disposableDatabase);
      assertDisposableRoleName(workerRoleName);

      maintenance = prismaFor(databaseUrlFor(sourceDatabaseUrl, 'postgres'));
      await maintenance.$connect();
      const [server] = await maintenance.$queryRaw<
        Array<{
          postgresMajor: number;
          canCreateDatabase: boolean;
          canCreateRole: boolean;
          canSetSessionReplicationRole: boolean;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('server_version_num')::INTEGER / 10000
            AS "postgresMajor",
          role.rolcreatedb OR role.rolsuper AS "canCreateDatabase",
          role.rolcreaterole OR role.rolsuper AS "canCreateRole",
          role.rolsuper OR pg_catalog.has_parameter_privilege(
            CURRENT_USER,
            'session_replication_role',
            'SET'
          ) AS "canSetSessionReplicationRole"
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = CURRENT_USER
      `);
      expect(server).toEqual({
        postgresMajor: 16,
        canCreateDatabase: true,
        canCreateRole: true,
        canSetSessionReplicationRole: true,
      });

      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${workerRoleName}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${workerPassword}'`,
      );
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      disposableDatabaseUrl = databaseUrlFor(
        sourceDatabaseUrl,
        disposableDatabase,
      );
      deployIdentityMailCurrent183CandidateStack(disposableDatabaseUrl, {
        failureMessage:
          'Failed to deploy CURRENT183 into the disposable identity-mail diagnostic database',
        timeoutMs: 180_000,
      });

      admin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await admin.$connect();
      const [migrationState] = await admin.$queryRaw<
        Array<{ migrationCount: number; migrationHead: string }>
      >(Prisma.sql`
        SELECT
          pg_catalog.count(*)::INTEGER AS "migrationCount",
          pg_catalog.max(migration_name) AS "migrationHead"
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migrationState).toEqual({
        migrationCount: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
        migrationHead: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
      });

      await installLeastPrivilegeWorkerRole(
        admin,
        disposableDatabase,
        workerRoleName,
      );
      const [role] = await admin.$queryRaw<Array<{ roleOid: bigint }>>(
        Prisma.sql`
          SELECT role.oid::BIGINT AS "roleOid"
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ${workerRoleName}
        `,
      );
      if (!role) {
        throw new Error('Disposable CURRENT183 worker role was not found');
      }
      workerRoleOid = role.roleOid;
      await assertLeastPrivilegeWorkerRole(
        admin,
        workerRoleName,
        workerRoleOid,
      );

      workerDatabaseUrl = databaseUrlForRole(
        sourceDatabaseUrl,
        disposableDatabase,
        workerRoleName,
        workerPassword,
      );
      workerPrisma = prismaFor(workerDatabaseUrl);
      await workerPrisma.$connect();
      repository = new PrismaIdentityMailWorkerV2CandidateRepository(
        workerPrisma,
      );
      baselineDeadlocks = await readDeadlocks(admin);

      await expectSqlState(
        workerPrisma.$queryRaw(Prisma.sql`
          SELECT "tenantId"
          FROM public."IdentityMailDeliveryTenantEnrollment"
          LIMIT 1
        `),
        '42501',
      );
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        if (admin) {
          const finalDeadlocks = await readDeadlocks(admin);
          if (finalDeadlocks !== baselineDeadlocks) {
            throw new Error(
              `CURRENT183 diagnostic observed PostgreSQL deadlocks: ${baselineDeadlocks} -> ${finalDeadlocks}`,
            );
          }
        }
      } catch (error) {
        cleanupErrors.push(error);
      }

      for (const disconnect of await Promise.allSettled([
        workerPrisma?.$disconnect(),
        admin?.$disconnect(),
      ])) {
        if (disconnect.status === 'rejected') {
          cleanupErrors.push(disconnect.reason);
        }
      }

      if (maintenance && disposableDatabase) {
        try {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && workerRoleName) {
        try {
          assertDisposableRoleName(workerRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${workerRoleName}"`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && disposableDatabase && workerRoleName) {
        try {
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
              'CURRENT183 diagnostic cleanup left database or role residue',
            );
          }
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
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

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'CURRENT183 identity-mail diagnostic cleanup failed',
        );
      }
    });

    it('keeps the retired legacy producer fail-closed at CURRENT183', async () => {
      await expectSqlState(
        admin.$queryRaw(Prisma.sql`
          SELECT public."identity_owner_invite_issue_hold_v1"(
            ${randomUUID()}::TEXT,
            ${randomUUID()}::TEXT,
            ${randomUUID()}::TEXT,
            1::INTEGER,
            ${randomUUID()}::TEXT,
            ${fixtureDigest('retired-producer-request')}::TEXT,
            'current183-diagnostic'::TEXT,
            ${randomUUID()}::TEXT,
            ${randomUUID()}::TEXT,
            ${randomUUID()}::TEXT,
            ${randomUUID()}::TEXT,
            ${fixtureDigest('retired-producer-token')}::TEXT,
            ${Buffer.alloc(71, 1)}::BYTEA,
            ${new Date(Date.now() + 86_400_000)}::TIMESTAMPTZ
          )
        `),
        '55000',
      );
      await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
    });

    it('enforces the non-empty HOLD/PENDING x ACTIVE/DRAINING matrix and captures ACTIVE policy bindings', async () => {
      const activePending = await createDiagnosticFixture(admin, {
        scenario: 'active-pending',
        enrollmentState: 'ACTIVE',
        outboxStatus: 'PENDING',
        workerRoleName,
        workerRoleOid,
      });
      const activeHold = await createDiagnosticFixture(admin, {
        scenario: 'active-hold',
        enrollmentState: 'ACTIVE',
        outboxStatus: 'HOLD',
        workerRoleName,
        workerRoleOid,
      });
      const drainingPending = await createDiagnosticFixture(admin, {
        scenario: 'draining-pending',
        enrollmentState: 'DRAINING',
        outboxStatus: 'PENDING',
        workerRoleName,
        workerRoleOid,
      });
      const drainingHold = await createDiagnosticFixture(admin, {
        scenario: 'draining-hold',
        enrollmentState: 'DRAINING',
        outboxStatus: 'HOLD',
        workerRoleName,
        workerRoleOid,
      });
      const activeHoldBefore = await readOutboxSnapshot(
        admin,
        activeHold.outboxId,
      );

      await repository.assertReady({
        expectedDatabase: disposableDatabase,
        expectedRole: workerRoleName,
        databaseTlsRequired: false,
        expectedMigration: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
        expectedMigrationCount:
          IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
        releaseSha: RELEASE_SHA,
        canaryTenantIds: [activePending.tenantId, activeHold.tenantId],
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        expectedPolicy: expectedPolicy(),
      });

      const claimed = await claim(repository, activePending, 'matrix-claim');
      expect(claimed).not.toBeNull();
      expect(claimed).toMatchObject({
        tenantId: activePending.tenantId,
        inviteId: activePending.inviteId,
        outboxId: activePending.outboxId,
        recipientEmail: activePending.email,
        claimEnrollmentStateRevision: activePending.enrollmentStateRevision,
        claimPolicyRevision: activePending.policyRevision,
        claimProviderAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        attemptNumber: 1,
        leaseVersion: 1n,
        transitionRevision: 2,
      });
      expect(claimed?.secretCiphertext).toEqual(activePending.ciphertext);

      await expect(claim(repository, activeHold, 'active-hold')).resolves.toBe(
        null,
      );
      await expect(
        readOutboxSnapshot(admin, activeHold.outboxId),
      ).resolves.toEqual(activeHoldBefore);
      await expectDeniedAndUnchanged(
        repository,
        admin,
        drainingPending,
        'draining-pending',
      );
      await expectDeniedAndUnchanged(
        repository,
        admin,
        drainingHold,
        'draining-hold',
      );

      await expect(
        readOutboxState(admin, activeHold.outboxId),
      ).resolves.toEqual({
        status: 'HOLD',
        attempts: 0,
        transitionRevision: 0n,
      });
      await expect(
        readOutboxState(admin, activePending.outboxId),
      ).resolves.toEqual({
        status: 'CLAIMED',
        attempts: 1,
        transitionRevision: 2n,
      });
      await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
    });

    it('takes a fresh post-wait snapshot, denies a committed ACTIVE to DRAINING transition, and lets another tenant progress', async () => {
      const contended = await createDiagnosticFixture(admin, {
        scenario: 'freshness-contended',
        enrollmentState: 'ACTIVE',
        outboxStatus: 'PENDING',
        workerRoleName,
        workerRoleOid,
      });
      const independent = await createDiagnosticFixture(admin, {
        scenario: 'freshness-independent',
        enrollmentState: 'ACTIVE',
        outboxStatus: 'PENDING',
        workerRoleName,
        workerRoleOid,
      });
      const holder = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const independentWorker = prismaFor(workerDatabaseUrl);
      await Promise.all([holder.$connect(), independentWorker.$connect()]);
      const independentRepository =
        new PrismaIdentityMailWorkerV2CandidateRepository(independentWorker);
      const waiterPid = await backendPid(workerPrisma);
      const holderLocked = deferred<void>();
      const releaseHolder = deferred<void>();
      const drainCommandId = randomUUID();
      const contendedOutboxBefore = await readOutboxSnapshot(
        admin,
        contended.outboxId,
      );
      let holderPromise: Promise<void> | undefined;
      let waiterOutcomePromise:
        | Promise<Outcome<ClaimedIdentityMailDeliveryV2Candidate | null>>
        | undefined;

      try {
        holderPromise = holder.$transaction(
          async (tx) => {
            const lock = await tx.$queryRaw<Array<{ tenantId: string }>>(
              Prisma.sql`
              WITH tenant_lock AS MATERIALIZED (
                SELECT pg_catalog.pg_advisory_xact_lock(
                  pg_catalog.hashtextextended(
                    ${`leetplus:identity-mail-tenant:v1:${contended.tenantId}`}::TEXT,
                    180
                  )
                ) AS acquired
              )
              SELECT ${contended.tenantId}::TEXT AS "tenantId"
              FROM tenant_lock
            `,
            );
            expect(lock).toEqual([{ tenantId: contended.tenantId }]);
            await tx.$executeRawUnsafe(
              `SET LOCAL session_replication_role = 'replica'`,
            );
            const changed = await tx.$executeRaw(Prisma.sql`
              UPDATE public."IdentityMailDeliveryTenantEnrollment"
              SET
                "state" = 'DRAINING',
                "enabled" = false,
                "activeCommandId" = ${drainCommandId},
                "stateRevision" = "stateRevision" + 1,
                "stateChangedAt" = pg_catalog.date_trunc(
                  'milliseconds',
                  pg_catalog.clock_timestamp()
                ),
                "updatedAt" = pg_catalog.date_trunc(
                  'milliseconds',
                  pg_catalog.clock_timestamp()
                )
              WHERE "tenantId" = ${contended.tenantId}
                AND "state" = 'ACTIVE'
            `);
            expect(changed).toBe(1);
            holderLocked.resolve(undefined);
            await releaseHolder.promise;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 30_000,
          },
        );
        await holderLocked.promise;

        waiterOutcomePromise = capture(
          claim(repository, contended, 'freshness-waiter'),
        );
        const wait = await waitForAdvisoryWait(admin, waiterPid);
        expect(wait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(wait.query).toContain('pg_advisory_xact_lock');

        const independentClaim = await withTimeout(
          claim(independentRepository, independent, 'freshness-independent'),
          3_000,
          'Independent tenant did not progress during advisory wait',
        );
        expect(independentClaim).toMatchObject({
          tenantId: independent.tenantId,
          outboxId: independent.outboxId,
          claimEnrollmentStateRevision: independent.enrollmentStateRevision,
          claimPolicyRevision: independent.policyRevision,
        });

        releaseHolder.resolve(undefined);
        await holderPromise;
        const waiterOutcome = await waiterOutcomePromise;
        expect(waiterOutcome.status).toBe('rejected');
        if (waiterOutcome.status === 'rejected') {
          expect(postgresSqlState(waiterOutcome.reason)).toBe('42501');
          expect(postgresSqlState(waiterOutcome.reason)).not.toBe('40P01');
        }

        await expect(
          readEnrollmentState(admin, contended.tenantId),
        ).resolves.toEqual({ state: 'DRAINING', stateRevision: 8n });
        await expect(
          readOutboxState(admin, contended.outboxId),
        ).resolves.toEqual({
          status: 'PENDING',
          attempts: 0,
          transitionRevision: 1n,
        });
        await expect(
          readOutboxSnapshot(admin, contended.outboxId),
        ).resolves.toEqual(contendedOutboxBefore);
        await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
      } finally {
        releaseHolder.resolve(undefined);
        const pendingOperations: Promise<unknown>[] = [];
        if (holderPromise) {
          pendingOperations.push(holderPromise);
        }
        if (waiterOutcomePromise) {
          pendingOperations.push(waiterOutcomePromise);
        }
        await Promise.allSettled(pendingOperations);
        await Promise.allSettled([
          independentWorker.$disconnect(),
          holder.$disconnect(),
        ]);
      }
    });
  },
);

async function createDiagnosticFixture(
  admin: PrismaClient,
  input: {
    scenario: string;
    enrollmentState: EnrollmentState;
    outboxStatus: OutboxState;
    workerRoleName: string;
    workerRoleOid: bigint;
  },
): Promise<DiagnosticFixture> {
  const suffix = randomUUID();
  const tenantId = randomUUID();
  const email = `${input.scenario}-${suffix}@example.test`;
  const reservationSubjectId = randomUUID();
  const workflowLocator = reservationSubjectId;
  const inviteId = randomUUID();
  const issueCommandId = randomUUID();
  const outboxId = randomUUID();
  const messageKey = randomUUID();
  const issueRequestId = randomUUID();
  const issueRequestDigest = fixtureDigest(`issue:${suffix}`);
  const tokenHash = fixtureDigest(`token:${suffix}`);
  const ciphertext = Buffer.alloc(71, Number.parseInt(suffix.slice(0, 2), 16));
  const trialStartsAt = new Date();
  const trialEndsAt = new Date(trialStartsAt.valueOf() + 7 * 86_400_000);
  const expiresAt = new Date(trialStartsAt.valueOf() + 3 * 86_400_000);

  await admin.tenant.create({
    data: {
      id: tenantId,
      name: `CURRENT183 diagnostic ${input.scenario}`,
      slug: `current183-${input.scenario}-${suffix}`,
      status: 'ACTIVE',
      customerStage: 'PILOT',
      onboardingStatus: 'OWNER_INVITED',
      trialStartsAt,
      trialEndsAt,
      entitlementProfileRevision: 1,
      executionRevision: 1,
      statusChangedAt: trialStartsAt,
      statusReason: 'Disposable CURRENT183 diagnostic fixture',
    },
  });

  const enrollmentStateRevision = 7n;
  const policyRevision = 3;
  const nowAt = new Date();
  const activeCommandId =
    input.enrollmentState === 'DRAINING' ? randomUUID() : null;
  const releasedAt = input.outboxStatus === 'PENDING' ? nowAt : null;
  const transitionRevision = input.outboxStatus === 'PENDING' ? 1n : 0n;
  await admin.$transaction(async (tx) => {
    // Owner-only diagnostic aggregate seeding. Legacy producer v1 is retired
    // at CURRENT181. Foreign-key/dormant registry triggers are bypassed only in
    // this disposable database; CHECK constraints remain enforced.
    await tx.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."UserInvite" (
        "id",
        "tenantId",
        "email",
        "role",
        "accessScope",
        "customRoleId",
        "storeIds",
        "tokenHash",
        "expiresAt",
        "acceptedAt",
        "acceptedByUserId",
        "createdByUserId",
        "revokedAt",
        "revokedByUserId",
        "identityClaimRevision",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${inviteId},
        ${tenantId},
        ${email},
        'OWNER'::public."UserRole",
        'NETWORK'::public."UserAccessScope",
        NULL,
        ARRAY[]::TEXT[],
        ${tokenHash},
        ${expiresAt},
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        2,
        ${nowAt},
        ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical",
        "claimType",
        "tenantId",
        "subjectId",
        "workflowLocator",
        "revision",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${email},
        'INVITE'::public."IdentityEmailClaimType",
        ${tenantId},
        ${inviteId},
        ${workflowLocator},
        2,
        ${nowAt},
        ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityOwnerInviteIssueCommand" (
        "id",
        "tenantId",
        "action",
        "requestId",
        "issueRequestDigest",
        "aadEnvironment",
        "workflowLocator",
        "reservationSubjectId",
        "reservationClaimRevision",
        "inviteId",
        "outboxId",
        "messageKey",
        "tokenHash",
        "tokenDigestVersion",
        "template",
        "envelopeVersion",
        "keyVersion",
        "expiresAt",
        "claimRevision",
        "createdAt"
      ) VALUES (
        ${issueCommandId},
        ${tenantId},
        'ISSUE_INITIAL_OWNER_INVITE',
        ${issueRequestId},
        ${issueRequestDigest},
        'current183-diagnostic',
        ${workflowLocator},
        ${reservationSubjectId},
        1,
        ${inviteId},
        ${outboxId},
        ${messageKey},
        ${tokenHash},
        'sha256-v1',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
        1,
        'v1',
        ${expiresAt},
        2,
        ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailOutbox" (
        "id",
        "tenantId",
        "issueCommandId",
        "inviteId",
        "workflowLocator",
        "aadEnvironment",
        "template",
        "status",
        "messageKey",
        "issueRequestDigest",
        "tokenHash",
        "tokenDigestVersion",
        "secretCiphertext",
        "envelopeVersion",
        "keyVersion",
        "expiresAt",
        "releasedAt",
        "attempts",
        "leaseVersion",
        "transitionRevision",
        "availableAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${outboxId},
        ${tenantId},
        ${issueCommandId},
        ${inviteId},
        ${workflowLocator},
        'current183-diagnostic',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
        ${input.outboxStatus}::public."IdentityMailOutboxStatus",
        ${messageKey},
        ${issueRequestDigest},
        ${tokenHash},
        'sha256-v1',
        ${ciphertext},
        1,
        'v1',
        ${expiresAt},
        ${releasedAt},
        0,
        0,
        ${transitionRevision},
        ${releasedAt},
        ${nowAt},
        ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
        "tenantId",
        "workerRoleName",
        "workerRoleOid",
        "policyRevision",
        "enabled",
        "maxAttempts",
        "leaseSeconds",
        "acknowledgeSeconds",
        "baseRetrySeconds",
        "maxRetrySeconds",
        "providerAuthorityDigest",
        "enabledAt",
        "disabledAt",
        "createdAt",
        "updatedAt",
        "state",
        "stateRevision",
        "activeCommandId",
        "lastEventDigest",
        "currentConfigurationDigest",
        "stateChangedAt"
      ) VALUES (
        ${tenantId},
        ${input.workerRoleName},
        ${input.workerRoleOid},
        ${policyRevision},
        ${input.enrollmentState === 'ACTIVE'},
        5,
        60,
        120,
        30,
        300,
        ${PROVIDER_AUTHORITY_DIGEST},
        ${trialStartsAt},
        NULL,
        ${trialStartsAt},
        ${nowAt},
        ${input.enrollmentState},
        ${enrollmentStateRevision},
        ${activeCommandId},
        ${fixtureDigest(`event:${suffix}`)},
        ${fixtureDigest(`configuration:${suffix}`)},
        ${nowAt}
      )
    `);
  });

  const [shape] = await admin.$queryRaw<
    Array<{
      inviteCount: number;
      claimCount: number;
      issueCount: number;
      outboxCount: number;
      enrollmentCount: number;
    }>
  >(Prisma.sql`
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."UserInvite"
        WHERE "tenantId" = ${tenantId} AND "id" = ${inviteId}
      ) AS "inviteCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityEmailClaim"
        WHERE "tenantId" = ${tenantId}
          AND "subjectId" = ${inviteId}
          AND "revision" = 2
      ) AS "claimCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityOwnerInviteIssueCommand"
        WHERE "tenantId" = ${tenantId}
          AND "id" = ${issueCommandId}
          AND "inviteId" = ${inviteId}
          AND "outboxId" = ${outboxId}
      ) AS "issueCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailOutbox"
        WHERE "tenantId" = ${tenantId}
          AND "id" = ${outboxId}
          AND "status"::TEXT = ${input.outboxStatus}
      ) AS "outboxCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryTenantEnrollment"
        WHERE "tenantId" = ${tenantId}
          AND "state" = ${input.enrollmentState}
      ) AS "enrollmentCount"
  `);
  expect(shape).toEqual({
    inviteCount: 1,
    claimCount: 1,
    issueCount: 1,
    outboxCount: 1,
    enrollmentCount: 1,
  });

  return {
    tenantId,
    email,
    inviteId,
    outboxId,
    status: input.outboxStatus,
    enrollmentState: input.enrollmentState,
    enrollmentStateRevision,
    policyRevision,
    ciphertext,
  };
}

function claim(
  target: PrismaIdentityMailWorkerV2CandidateRepository,
  fixture: DiagnosticFixture,
  label: string,
): Promise<ClaimedIdentityMailDeliveryV2Candidate | null> {
  return target.claimOne({
    tenantId: fixture.tenantId,
    leaseOwnerDigest: fixtureDigest(`lease-owner:${label}`),
    leaseTokenDigest: fixtureDigest(`lease-token:${label}`),
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
  });
}

async function expectDeniedAndUnchanged(
  target: PrismaIdentityMailWorkerV2CandidateRepository,
  admin: PrismaClient,
  fixture: DiagnosticFixture,
  label: string,
): Promise<void> {
  const before = await readOutboxSnapshot(admin, fixture.outboxId);
  try {
    await claim(target, fixture, label);
    throw new Error('Expected DRAINING tenant eligibility to fail closed');
  } catch (error) {
    expect(postgresSqlState(error)).toBe('42501');
    expect(postgresSqlState(error)).not.toBe('40P01');
  }
  await expect(readOutboxSnapshot(admin, fixture.outboxId)).resolves.toEqual(
    before,
  );
}

function expectedPolicy() {
  return {
    maxAttempts: 5,
    leaseSeconds: 60,
    minimumAcknowledgeSeconds: 120,
    baseRetrySeconds: 30,
    maxRetrySeconds: 300,
  };
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
    'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
    'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
    'REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    ...WORKER_RPC_SIGNATURES.map(
      (signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`,
    ),
  ];
  for (const statement of statements) {
    await admin.$executeRawUnsafe(statement);
  }
}

async function assertLeastPrivilegeWorkerRole(
  admin: PrismaClient,
  roleName: string,
  roleOid: bigint,
): Promise<void> {
  const [role] = await admin.$queryRaw<
    Array<{
      canLogin: boolean;
      inherit: boolean;
      superuser: boolean;
      createDatabase: boolean;
      createRole: boolean;
      replication: boolean;
      bypassRls: boolean;
      roleConfig: string[] | null;
    }>
  >(Prisma.sql`
    SELECT
      rolcanlogin AS "canLogin",
      rolinherit AS inherit,
      rolsuper AS superuser,
      rolcreatedb AS "createDatabase",
      rolcreaterole AS "createRole",
      rolreplication AS replication,
      rolbypassrls AS "bypassRls",
      rolconfig AS "roleConfig"
    FROM pg_catalog.pg_roles
    WHERE oid = ${roleOid}::OID
      AND rolname = ${roleName}
  `);
  expect(role).toEqual({
    canLogin: true,
    inherit: false,
    superuser: false,
    createDatabase: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    roleConfig: null,
  });

  const [surface] = await admin.$queryRaw<
    Array<{
      allowedRoutineCount: number;
      extraRoutineCount: number;
      relationPrivilegeCount: number;
      columnPrivilegeCount: number;
      sequencePrivilegeCount: number;
      membershipCount: number;
      defaultAclCount: number;
      ownedDatabaseCount: number;
      ownedSchemaCount: number;
      ownedRelationCount: number;
      ownedRoutineCount: number;
      ownedTypeCount: number;
    }>
  >(Prisma.sql`
    WITH allowed_routine AS (
      SELECT pg_catalog.to_regprocedure(signature)::OID AS oid
      FROM (
        VALUES
          ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
          ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
          ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
          ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text,text)'),
          ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)')
        ) AS expected(signature)
    ),
    -- Force relkind filtering before has_sequence_privilege; PostgreSQL may
    -- otherwise evaluate it for non-sequence pg_class rows (including TOAST).
    public_sequence AS MATERIALIZED (
      SELECT sequence.oid
      FROM pg_catalog.pg_class AS sequence
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = sequence.relnamespace
      WHERE namespace.nspname = 'public'
        AND sequence.relkind = 'S'
    )
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM allowed_routine
        WHERE oid IS NOT NULL
          AND pg_catalog.has_function_privilege(${roleName}, oid, 'EXECUTE')
      ) AS "allowedRoutineCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
          AND pg_catalog.has_function_privilege(
            ${roleName},
            routine.oid,
            'EXECUTE'
          )
          AND routine.oid NOT IN (SELECT oid FROM allowed_routine)
      ) AS "extraRoutineCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND pg_catalog.has_table_privilege(
            ${roleName},
            relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) AS "relationPrivilegeCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND pg_catalog.has_any_column_privilege(
            ${roleName},
            relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
      ) AS "columnPrivilegeCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public_sequence AS sequence
        WHERE pg_catalog.has_sequence_privilege(
            ${roleName},
            sequence.oid,
            'USAGE,SELECT,UPDATE'
          )
      ) AS "sequencePrivilegeCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_auth_members
        WHERE member = ${roleOid}::OID OR roleid = ${roleOid}::OID
      ) AS "membershipCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_default_acl
        WHERE defaclrole = ${roleOid}::OID
      ) AS "defaultAclCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_database
        WHERE datdba = ${roleOid}::OID
      ) AS "ownedDatabaseCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_namespace
        WHERE nspowner = ${roleOid}::OID
      ) AS "ownedSchemaCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_class
        WHERE relowner = ${roleOid}::OID
      ) AS "ownedRelationCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_proc
        WHERE proowner = ${roleOid}::OID
      ) AS "ownedRoutineCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_type
        WHERE typowner = ${roleOid}::OID
      ) AS "ownedTypeCount"
  `);
  expect(surface).toEqual({
    allowedRoutineCount: WORKER_RPC_SIGNATURES.length,
    extraRoutineCount: 0,
    relationPrivilegeCount: 0,
    columnPrivilegeCount: 0,
    sequencePrivilegeCount: 0,
    membershipCount: 0,
    defaultAclCount: 0,
    ownedDatabaseCount: 0,
    ownedSchemaCount: 0,
    ownedRelationCount: 0,
    ownedRoutineCount: 0,
    ownedTypeCount: 0,
  });
}

async function readOutboxState(client: PrismaClient, outboxId: string) {
  const [row] = await client.$queryRaw<
    Array<{
      status: string;
      attempts: number;
      transitionRevision: bigint;
    }>
  >(Prisma.sql`
    SELECT
      "status"::TEXT AS status,
      "attempts",
      "transitionRevision"
    FROM public."IdentityMailOutbox"
    WHERE "id" = ${outboxId}
  `);
  if (!row) {
    throw new Error('Diagnostic outbox row was not found');
  }
  return row;
}

async function readOutboxSnapshot(
  client: PrismaClient,
  outboxId: string,
): Promise<Prisma.JsonValue> {
  const [row] = await client.$queryRaw<Array<{ snapshot: Prisma.JsonValue }>>(
    Prisma.sql`
      SELECT pg_catalog.to_jsonb(target_outbox) AS snapshot
      FROM public."IdentityMailOutbox" AS target_outbox
      WHERE target_outbox."id" = ${outboxId}
    `,
  );
  if (!row) {
    throw new Error('Diagnostic outbox snapshot was not found');
  }
  return row.snapshot;
}

async function readEnrollmentState(client: PrismaClient, tenantId: string) {
  const [row] = await client.$queryRaw<
    Array<{ state: string; stateRevision: bigint }>
  >(Prisma.sql`
    SELECT "state", "stateRevision"
    FROM public."IdentityMailDeliveryTenantEnrollment"
    WHERE "tenantId" = ${tenantId}
  `);
  if (!row) {
    throw new Error('Diagnostic enrollment row was not found');
  }
  return row;
}

async function waitForAdvisoryWait(
  client: PrismaClient,
  pid: number,
): Promise<AdvisoryWait> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [activity] = await client.$queryRaw<AdvisoryWait[]>(Prisma.sql`
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

async function expectSqlState(
  operation: Promise<unknown>,
  expectedSqlState: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`);
  } catch (error) {
    expect(postgresSqlState(error)).toBe(expectedSqlState);
  }
}

function postgresSqlState(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const metadata = error.meta;
    if (
      metadata &&
      typeof metadata.code === 'string' &&
      /^[0-9A-Z]{5}$/u.test(metadata.code)
    ) {
      return metadata.code;
    }
  }
  if (error instanceof Error) {
    return error.message.match(/\bSQLSTATE\s+([0-9A-Z]{5})\b/u)?.[1];
  }
  return undefined;
}

function capture<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then<Outcome<T>, Outcome<T>>(
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
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
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

function fixtureDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

function singleConnectionUrl(databaseUrl: string): string {
  const target = new URL(databaseUrl);
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('connect_timeout', '5');
  target.searchParams.set('socket_timeout', '30');
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
  target.searchParams.set('schema', 'public');
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('connect_timeout', '5');
  target.searchParams.set('socket_timeout', '30');
  return target.toString();
}

function assertSafeIntegrationDatabase(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing CURRENT183 diagnostic when NODE_ENV is production',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for CURRENT183 PostgreSQL diagnostics',
    );
  }
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(host) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing CURRENT183 diagnostic outside a local CI/test PostgreSQL database',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe CURRENT183 disposable database name');
  }
}

function assertDisposableRoleName(roleName: string): void {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing an unsafe CURRENT183 disposable role name');
  }
}
