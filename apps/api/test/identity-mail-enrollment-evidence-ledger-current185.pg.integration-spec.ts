import { Prisma, PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deployIdentityMailCurrent185CandidateStack } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-identity-mail-enrollment-evidence-current185-postgres-e2e';
const integrationEnabled =
  process.env.IDENTITY_MAIL_ENROLLMENT_EVIDENCE_CURRENT185_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;

const CURRENT185_MIGRATION =
  '20260802030000_identity_mail_enrollment_evidence_ledger_v2';
const CURRENT184_MIGRATION =
  '20260802020000_identity_mail_worker_v2_lost_response_replay';
const CURRENT184_MANIFEST_DIGEST =
  '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819';
const DISPOSABLE_DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_imtec_pg_[0-9a-f]{24}$/u;
const BUNDLE_DIGEST_DOMAIN =
  'LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORT_BUNDLE_V2_V1';
const IMPORT_ROUTINE =
  'identity_mail_tenant_enrollment_import_evidence_v2(text,text)';
const IMPORT_ROUTINE_SQL =
  'public."identity_mail_tenant_enrollment_import_evidence_v2"';
const COMMAND_TABLE = 'IdentityMailDeliveryTenantEnrollmentCommand';
const MANIFEST_TABLE = 'IdentityMailDutyRoleManifestEvidenceV2';
const REVOCATION_TABLE = 'IdentityMailDutyRoleManifestRevocationV2';
const COORDINATOR_ROLE_NAME = 'identity_mail_enrollment_coordinator';
const WORKER_ROLE_NAME = 'identity_mail_worker_v2';
const COORDINATOR_ROLE_OID = 3_000_000_001;
const WORKER_ROLE_OID = 3_000_000_002;
const DUTY_BINDING_FIELDS = [
  'dutyManifestContract',
  'dutyManifestProfile',
  'dutyManifestId',
  'dutyManifestRevision',
  'dutyManifestPayloadDigest',
  'dutyManifestSigningKeyId',
  'dutyManifestPublicKeyFingerprint',
  'dutyCoordinatorRoleName',
  'dutyCoordinatorRoleOid',
  'dutyWorkerRoleName',
  'dutyWorkerRoleOid',
  'dutyExactGrantsProfile',
  'dutyExactGrantsDigest',
  'dutyPredecessorManifestDigest',
  'dutyApplicationContract',
  'dutyApplicationReleaseSha',
  'dutyApplicationArtifactSha256',
] as const;

type FixtureInput = {
  actualContextDigest: string;
  commandId: string;
  coordinatorRoleName: string;
  coordinatorRoleOid: number;
  databaseIdentityDigest: string;
  databaseName: string;
  databaseOid: number;
  deploymentMarkerDigest: string;
  deploymentMarkerId: string;
  manifestId: string;
  requestId: string;
  reuseCommandId?: string;
  reuseRequestId?: string;
  tenantId: string;
  validForMs: number;
  workerRoleName: string;
  workerRoleOid: number;
};

type EvidenceBundleSummary = {
  schemaVersion: number;
  contract: string;
  tenantId: string;
  commandId: string;
  requestId: string;
  authorizationEnvelopeDigest: string;
  manifestId: string;
  manifestPayloadDigest: string;
  exactGrantsDigest: string;
  bindingDigest: string;
  bundleDigest: string;
  authorization: boolean;
  canMutate: boolean;
  canSend: boolean;
};

type EvidenceFixture = {
  bundle: EvidenceBundleSummary;
  bundleCanonicalJson: string;
  bundleDigest: string;
  expiresAt: string;
  reuse?: EvidenceFixture;
};

type ImportReceipt = {
  authorization: boolean;
  authorizationEnvelopeDigest: string;
  bindingDigest: string;
  bundleDigest: string;
  canMutate: boolean;
  canPersistEvidence: boolean;
  canSend: boolean;
  candidateStatus: string;
  commandId: string;
  decision: 'IMPORTED' | 'IMPORT_REPLAY';
  exactGrantsDigest: string;
  importReceiptDigest: string;
  importedAtEpochMs: number;
  importedTransactionId: string;
  manifestId: string;
  manifestPayloadDigest: string;
  operation: string;
  operationId: string;
  requestId: string;
  schemaVersion: number;
  tenantId: string;
};

type LedgerSnapshot = {
  commandCount: number;
  commandDigests: string;
  manifestCount: number;
  manifestDigests: string;
  revocationCount: number;
};

type MarkerFixture = {
  id: string;
  payloadDigest: string;
  databaseIdentityDigest: string;
  actualContextDigest: string;
};

type AdvisoryWait = {
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  query: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type Outcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

type RevocationInsertReceipt = {
  revokedAt: Date;
  revokedTransactionId: string;
  currentTransactionId: string;
};

type RevocationInsertInput = {
  callerRevokedAt: Date;
  callerTransactionId: string;
  evidenceDigest: string;
  manifestPayloadDigest: string;
  reasonDigest: string;
};

class ExpectedRollback extends Error {}

jest.setTimeout(300_000);

describePostgres(
  'Identity-mail enrollment evidence ledger CURRENT185 PostgreSQL acceptance',
  () => {
    let maintenance: PrismaClient;
    let admin: PrismaClient;
    let sourceDatabaseUrl: URL;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let disposableDatabaseCreated = false;
    let appLikeRole = '';
    let appLikeRoleCreated = false;
    let databaseOid = 0;
    let marker: MarkerFixture;

    beforeAll(async () => {
      sourceDatabaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_imtec_${randomUUID().replaceAll('-', '')}_ci`;
      assertDisposableDatabaseName(disposableDatabase);
      appLikeRole = `lp_imtec_pg_${randomBytes(12).toString('hex')}`;
      assertDisposableRoleName(appLikeRole);

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
        `CREATE ROLE "${appLikeRole}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      appLikeRoleCreated = true;
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      disposableDatabaseCreated = true;
      disposableDatabaseUrl = databaseUrlFor(
        sourceDatabaseUrl,
        disposableDatabase,
      );
      deployIdentityMailCurrent185CandidateStack(disposableDatabaseUrl, {
        failureMessage:
          'Failed to deploy CURRENT185 into the disposable enrollment evidence database',
        timeoutMs: 180_000,
      });

      admin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await admin.$connect();
      const [database] = await admin.$queryRaw<Array<{ oid: bigint }>>(
        Prisma.sql`
          SELECT database_entry.oid::BIGINT AS oid
          FROM pg_catalog.pg_database AS database_entry
          WHERE database_entry.datname = pg_catalog.current_database()
        `,
      );
      if (!database || database.oid < 1n || database.oid > 4_294_967_295n) {
        throw new Error('Disposable database OID is unavailable');
      }
      databaseOid = Number(database.oid);
      marker = {
        id: randomUUID(),
        payloadDigest: fixtureDigest('current185-release-marker'),
        databaseIdentityDigest: fixtureDigest('current185-database-identity'),
        actualContextDigest: fixtureDigest('current185-runtime-context'),
      };
      await insertReleaseMarker(admin, marker);
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        await admin?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (maintenance && disposableDatabaseCreated) {
        try {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && appLikeRoleCreated) {
        try {
          assertDisposableRoleName(appLikeRole);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${appLikeRole}"`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        await maintenance?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'CURRENT185 PostgreSQL acceptance cleanup failed',
        );
      }
    });

    it('deploys exact CURRENT185 with owner-only immutable ledger and importer ACL', async () => {
      const migrationSha = current185MigrationSha256();
      const [migration] = await admin.$queryRaw<
        Array<{
          migrationCount: number;
          migrationHead: string;
          checksum: string;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.count(*)::INTEGER AS "migrationCount",
          pg_catalog.max(migration_name) AS "migrationHead",
          pg_catalog.min(checksum) FILTER (
            WHERE migration_name = ${CURRENT185_MIGRATION}
          ) AS checksum
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migration).toEqual({
        migrationCount: 185,
        migrationHead: CURRENT185_MIGRATION,
        checksum: migrationSha,
      });

      const [routine] = await admin.$queryRaw<
        Array<{
          signature: string;
          securityDefiner: boolean;
          volatility: string;
          parallelSafety: string;
          searchPath: string[];
          returnType: string;
          ownerName: string;
          currentRole: string;
          nonOwnerExecuteCount: number;
        }>
      >(Prisma.sql`
        SELECT
          routine.proname || '(' || pg_catalog.replace(
            pg_catalog.oidvectortypes(routine.proargtypes),
            ', ',
            ','
          ) || ')' AS signature,
          routine.prosecdef AS "securityDefiner",
          routine.provolatile AS volatility,
          routine.proparallel AS "parallelSafety",
          routine.proconfig AS "searchPath",
          routine.prorettype::pg_catalog.regtype::TEXT AS "returnType",
          owner.rolname AS "ownerName",
          CURRENT_USER AS "currentRole",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.aclexplode(
              COALESCE(
                routine.proacl,
                pg_catalog.acldefault('f', routine.proowner)
              )
            ) AS privilege
            WHERE privilege.privilege_type = 'EXECUTE'
              AND privilege.grantee <> routine.proowner
          ) AS "nonOwnerExecuteCount"
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN pg_catalog.pg_roles AS owner
          ON owner.oid = routine.proowner
        WHERE routine.oid = pg_catalog.to_regprocedure(${IMPORT_ROUTINE})
      `);
      expect(routine).toEqual({
        signature: IMPORT_ROUTINE,
        securityDefiner: true,
        volatility: 'v',
        parallelSafety: 'u',
        searchPath: ['search_path=pg_catalog'],
        returnType: 'jsonb',
        ownerName: routine?.currentRole,
        currentRole: routine?.currentRole,
        nonOwnerExecuteCount: 0,
      });

      const relations = await admin.$queryRaw<
        Array<{
          name: string;
          ownerName: string;
          currentRole: string;
          nonOwnerAclCount: number;
          appPrivilege: boolean;
        }>
      >(Prisma.sql`
        SELECT
          relation.relname AS name,
          owner.rolname AS "ownerName",
          CURRENT_USER AS "currentRole",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.aclexplode(
              COALESCE(
                relation.relacl,
                pg_catalog.acldefault('r', relation.relowner)
              )
            ) AS privilege
            WHERE privilege.grantee <> relation.relowner
          ) AS "nonOwnerAclCount",
          pg_catalog.has_table_privilege(
            ${appLikeRole},
            relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          ) AS "appPrivilege"
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_roles AS owner
          ON owner.oid = relation.relowner
        WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
          AND relation.relname IN (
            ${COMMAND_TABLE},
            ${MANIFEST_TABLE},
            ${REVOCATION_TABLE}
          )
        ORDER BY relation.relname COLLATE "C"
      `);
      expect(relations).toHaveLength(3);
      for (const relation of relations) {
        expect(relation).toMatchObject({
          ownerName: relation.currentRole,
          nonOwnerAclCount: 0,
          appPrivilege: false,
        });
      }

      await expectSqlState(
        admin.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${appLikeRole}"`);
          await tx.$queryRawUnsafe(
            `SELECT ${IMPORT_ROUTINE_SQL}('{}', '${'0'.repeat(64)}')`,
          );
        }),
        '42501',
      );
      await expectSqlState(
        admin.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${appLikeRole}"`);
          await tx.$queryRawUnsafe(
            `SELECT 1 FROM public."${COMMAND_TABLE}" LIMIT 1`,
          );
        }),
        '42501',
      );
      for (const deniedMutation of [
        `INSERT INTO public."${COMMAND_TABLE}" DEFAULT VALUES`,
        `UPDATE public."${COMMAND_TABLE}" SET "id" = "id"`,
        `DELETE FROM public."${COMMAND_TABLE}"`,
        `TRUNCATE TABLE public."${COMMAND_TABLE}"`,
        `INSERT INTO public."${MANIFEST_TABLE}" DEFAULT VALUES`,
        `UPDATE public."${MANIFEST_TABLE}" SET "payloadDigest" = "payloadDigest"`,
        `DELETE FROM public."${MANIFEST_TABLE}"`,
        `TRUNCATE TABLE public."${MANIFEST_TABLE}"`,
        `INSERT INTO public."${REVOCATION_TABLE}" DEFAULT VALUES`,
        `UPDATE public."${REVOCATION_TABLE}" SET "reasonDigest" = "reasonDigest"`,
        `DELETE FROM public."${REVOCATION_TABLE}"`,
        `TRUNCATE TABLE public."${REVOCATION_TABLE}"`,
      ]) {
        await expectSqlState(
          admin.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "${appLikeRole}"`);
            await tx.$executeRawUnsafe(deniedMutation);
          }),
          '42501',
        );
      }

      const [releaseMarker] = await admin.$queryRaw<
        Array<{
          id: string;
          payloadDigest: string;
          databaseIdentityDigest: string;
          actualContextDigest: string;
          revoked: boolean;
          payloadText: string;
        }>
      >(Prisma.sql`
        SELECT
          "id",
          "payloadDigest",
          "databaseIdentityDigest",
          "actualContextDigest",
          "revokedAt" IS NOT NULL AS revoked,
          "payload"::TEXT AS "payloadText"
        FROM public."SharedBetaRuntimeReleaseMarker"
        WHERE "id" = ${marker.id}
      `);
      expect(releaseMarker).toMatchObject({ ...marker, revoked: false });
      expect(releaseMarker?.payloadText).not.toMatch(
        /(?:@|email|phone|password|secret|token)/iu,
      );
    });

    it('imports an app-minted two-signer bundle once and replays the original receipt after expiry', async () => {
      const expiredFirst = buildEvidenceFixture(
        fixtureInput({ validForMs: 3_000 }),
      );
      await ensureTenant(admin, expiredFirst.bundle.tenantId);
      const expiredFirstWaitMs =
        Date.parse(expiredFirst.expiresAt) - Date.now() + 250;
      expect(expiredFirstWaitMs).toBeGreaterThan(0);
      expect(expiredFirstWaitMs).toBeLessThan(10_000);
      await delay(expiredFirstWaitMs);
      await expectRejectedAndUnchanged(
        admin,
        () => importEvidence(admin, expiredFirst),
        ['55000'],
      );

      const unrevokedReuse = buildEvidenceFixture(
        fixtureInput({
          reuseCommandId: randomUUID(),
          reuseRequestId: randomUUID(),
          validForMs: 30_000,
        }),
      );
      if (!unrevokedReuse.reuse) {
        throw new Error(
          'CURRENT185 unrevoked manifest-reuse fixture is unavailable',
        );
      }
      await ensureTenant(admin, unrevokedReuse.bundle.tenantId);
      const beforeReuse = await readLedgerSnapshot(admin);
      const firstManifestReceipt = await importEvidence(admin, unrevokedReuse);
      const reusedManifestReceipt = await importEvidence(
        admin,
        unrevokedReuse.reuse,
      );
      expect(firstManifestReceipt.decision).toBe('IMPORTED');
      expect(reusedManifestReceipt.decision).toBe('IMPORTED');
      expect(reusedManifestReceipt.manifestPayloadDigest).toBe(
        firstManifestReceipt.manifestPayloadDigest,
      );
      const afterReuse = await readLedgerSnapshot(admin);
      expect(afterReuse.commandCount).toBe(beforeReuse.commandCount + 2);
      expect(afterReuse.manifestCount).toBe(beforeReuse.manifestCount + 1);
      expect(afterReuse.revocationCount).toBe(beforeReuse.revocationCount);
      const [persistedReusableManifest] = await admin.$queryRaw<
        Array<{ importedCommandId: string }>
      >(Prisma.sql`
        SELECT "importedCommandId"
        FROM public."IdentityMailDutyRoleManifestEvidenceV2"
        WHERE "payloadDigest" = ${unrevokedReuse.bundle.manifestPayloadDigest}
      `);
      expect(persistedReusableManifest?.importedCommandId).toBe(
        unrevokedReuse.bundle.commandId,
      );

      const fixture = buildEvidenceFixture(
        fixtureInput({
          reuseCommandId: randomUUID(),
          reuseRequestId: randomUUID(),
          validForMs: 5_000,
        }),
      );
      await ensureTenant(admin, fixture.bundle.tenantId);
      const before = await readLedgerSnapshot(admin);
      try {
        await admin.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
            const receipt = await importEvidenceInTransaction(
              tx,
              fixture.bundleCanonicalJson,
              fixture.bundleDigest,
            );
            expect(receipt.decision).toBe('IMPORTED');
            throw new ExpectedRollback('force valid import rollback');
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 30_000,
          },
        );
        throw new Error(
          'CURRENT185 valid import transaction did not roll back',
        );
      } catch (error) {
        if (!(error instanceof ExpectedRollback)) throw error;
      }
      await expect(readLedgerSnapshot(admin)).resolves.toEqual(before);

      const imported = await importEvidence(admin, fixture);
      expect(imported).toMatchObject(expectedReceiptIdentity(fixture));
      expect(imported).toMatchObject({
        decision: 'IMPORTED',
        candidateStatus: 'NOT_DEPLOYABLE',
        canPersistEvidence: true,
        authorization: false,
        canMutate: false,
        canSend: false,
      });
      expect(imported.importReceiptDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(imported.importedTransactionId).toMatch(/^[0-9]{1,32}$/u);

      const firstSnapshot = await readLedgerSnapshot(admin);
      expect(firstSnapshot.commandCount).toBe(before.commandCount + 1);
      expect(firstSnapshot.manifestCount).toBe(before.manifestCount + 1);
      expect(firstSnapshot.revocationCount).toBe(before.revocationCount);

      const immediateReplay = await importEvidence(admin, fixture);
      expect(immediateReplay).toEqual({
        ...imported,
        decision: 'IMPORT_REPLAY',
      });
      await expect(readLedgerSnapshot(admin)).resolves.toEqual(firstSnapshot);

      const reasonDigest = fixtureDigest('current185-revocation-reason');
      const evidenceDigest = fixtureDigest('current185-revocation-evidence');
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO public."IdentityMailDutyRoleManifestRevocationV2" (
              "manifestPayloadDigest",
              "reasonDigest",
              "evidenceDigest",
              "revokedAt",
              "revokedTransactionId"
            ) VALUES (
              ${fixture.bundle.manifestPayloadDigest},
              ${reasonDigest},
              ${evidenceDigest},
              pg_catalog.clock_timestamp(),
              pg_catalog.txid_current()::TEXT
            )
          `);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 30_000,
        },
      );
      if (!fixture.reuse) {
        throw new Error('CURRENT185 manifest-reuse fixture is unavailable');
      }
      await expectRejectedAndUnchanged(
        admin,
        () => importEvidence(admin, fixture.reuse as EvidenceFixture),
        ['55000'],
      );
      const revokedSnapshot = await readLedgerSnapshot(admin);
      expect(revokedSnapshot.revocationCount).toBe(
        firstSnapshot.revocationCount + 1,
      );

      const waitMs = Date.parse(fixture.expiresAt) - Date.now() + 250;
      expect(waitMs).toBeGreaterThan(0);
      expect(waitMs).toBeLessThan(10_000);
      await delay(waitMs);
      const expiredReplay = await importEvidence(admin, fixture);
      expect(expiredReplay).toEqual({
        ...imported,
        decision: 'IMPORT_REPLAY',
      });
      await expect(readLedgerSnapshot(admin)).resolves.toEqual(revokedSnapshot);

      await expectRejectedAndUnchanged(
        admin,
        () =>
          importEvidenceArguments(
            admin,
            `${fixture.bundleCanonicalJson} `,
            bundleDigest(`${fixture.bundleCanonicalJson} `),
          ),
        ['22023'],
      );
      await expectRejectedAndUnchanged(
        admin,
        () =>
          importEvidenceArguments(
            admin,
            fixture.bundleCanonicalJson,
            fixtureDigest('wrong-current185-bundle-digest'),
          ),
        ['22023'],
      );
      await expectRejectedAndUnchanged(
        admin,
        () => importEvidenceArguments(admin, '{', bundleDigest('{')),
        ['22023'],
      );

      const identityConflict = buildEvidenceFixture(
        fixtureInput({
          commandId: fixture.bundle.commandId,
          tenantId: randomUUID(),
          validForMs: 30_000,
        }),
      );
      await ensureTenant(admin, identityConflict.bundle.tenantId);
      await expectRejectedAndUnchanged(
        admin,
        () => importEvidence(admin, identityConflict),
        ['22023', '23505'],
      );

      for (const mutation of [
        `INSERT INTO public."${COMMAND_TABLE}" SELECT * FROM public."${COMMAND_TABLE}" WHERE "id" = '${fixture.bundle.commandId}'`,
        `INSERT INTO public."${MANIFEST_TABLE}" SELECT * FROM public."${MANIFEST_TABLE}" WHERE "payloadDigest" = '${fixture.bundle.manifestPayloadDigest}'`,
        `UPDATE public."${COMMAND_TABLE}" SET "id" = "id" WHERE "id" = '${fixture.bundle.commandId}'`,
        `DELETE FROM public."${COMMAND_TABLE}" WHERE "id" = '${fixture.bundle.commandId}'`,
        `TRUNCATE TABLE public."${COMMAND_TABLE}"`,
        `UPDATE public."${MANIFEST_TABLE}" SET "payloadDigest" = "payloadDigest" WHERE "payloadDigest" = '${fixture.bundle.manifestPayloadDigest}'`,
        `DELETE FROM public."${MANIFEST_TABLE}" WHERE "payloadDigest" = '${fixture.bundle.manifestPayloadDigest}'`,
        `TRUNCATE TABLE public."${MANIFEST_TABLE}"`,
        `UPDATE public."${REVOCATION_TABLE}" SET "reasonDigest" = "reasonDigest" WHERE "manifestPayloadDigest" = '${fixture.bundle.manifestPayloadDigest}'`,
        `DELETE FROM public."${REVOCATION_TABLE}" WHERE "manifestPayloadDigest" = '${fixture.bundle.manifestPayloadDigest}'`,
        `TRUNCATE TABLE public."${REVOCATION_TABLE}"`,
      ]) {
        await expectSqlStateOneOf(
          admin.$executeRawUnsafe(mutation),
          mutation.startsWith('TRUNCATE') ? ['55000', '0A000'] : ['55000'],
        );
      }
    });

    it('DB-enforces every one of the 17 command-to-manifest duty bindings', async () => {
      const fixture = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      await ensureTenant(admin, fixture.bundle.tenantId);
      await importEvidence(admin, fixture);
      const constraintDefinitions = await admin.$queryRaw<
        Array<{ name: string; definition: string }>
      >(Prisma.sql`
        SELECT
          constraint_entry.conname AS name,
          pg_catalog.pg_get_constraintdef(
            constraint_entry.oid,
            true
          ) AS definition
        FROM pg_catalog.pg_constraint AS constraint_entry
        WHERE constraint_entry.conrelid =
            pg_catalog.to_regclass(
              'public."IdentityMailDeliveryTenantEnrollmentCommand"'
            )
          AND constraint_entry.contype = 'f'
          AND constraint_entry.confrelid =
            pg_catalog.to_regclass(
              'public."IdentityMailDutyRoleManifestEvidenceV2"'
            )
        ORDER BY constraint_entry.conname COLLATE "C"
      `);
      expect(constraintDefinitions).toHaveLength(2);
      const combinedDefinitions = constraintDefinitions
        .map((constraint) => constraint.definition)
        .join('\n');
      for (const field of DUTY_BINDING_FIELDS) {
        expect(combinedDefinitions).toContain(field);
      }

      const driftValues: Record<(typeof DUTY_BINDING_FIELDS)[number], unknown> =
        {
          dutyManifestContract: 'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V3',
          dutyManifestProfile: 'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V3',
          dutyManifestId: randomUUID(),
          dutyManifestRevision: 2,
          dutyManifestPayloadDigest: 'a'.repeat(64),
          dutyManifestSigningKeyId: 'identity-mail-manifest-v2-ci-drift',
          dutyManifestPublicKeyFingerprint: 'b'.repeat(64),
          dutyCoordinatorRoleName: 'identity_mail_enrollment_coordinator_drift',
          dutyCoordinatorRoleOid: COORDINATOR_ROLE_OID + 100,
          dutyWorkerRoleName: 'identity_mail_worker_v2_drift',
          dutyWorkerRoleOid: WORKER_ROLE_OID + 100,
          dutyExactGrantsProfile: 'IDENTITY_MAIL_DUTY_GRANTS_PG16_V2',
          dutyExactGrantsDigest: 'c'.repeat(64),
          dutyPredecessorManifestDigest: 'd'.repeat(64),
          dutyApplicationContract:
            'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V3',
          dutyApplicationReleaseSha: 'b'.repeat(40),
          dutyApplicationArtifactSha256: 'e'.repeat(64),
        };
      const original = await readCommandRow(admin, fixture.bundle.commandId);
      for (const field of DUTY_BINDING_FIELDS) {
        await assertDutyDriftRejected(
          admin,
          fixture.bundle.commandId,
          field,
          driftValues[field],
        );
        await expect(
          readCommandRow(admin, fixture.bundle.commandId),
        ).resolves.toEqual(original);
      }
    });

    it('serializes same-command import and lets different tenants progress without deadlocks', async () => {
      const sameCommand = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      const firstTenant = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      const secondTenant = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      const sharedTenantId = randomUUID();
      const sameTenantFirst = buildEvidenceFixture(
        fixtureInput({ tenantId: sharedTenantId, validForMs: 30_000 }),
      );
      const sameTenantSecond = buildEvidenceFixture(
        fixtureInput({ tenantId: sharedTenantId, validForMs: 30_000 }),
      );
      await Promise.all(
        [
          sameCommand,
          firstTenant,
          secondTenant,
          sameTenantFirst,
          sameTenantSecond,
        ].map((fixture) => ensureTenant(admin, fixture.bundle.tenantId)),
      );
      const clientA = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const clientB = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await Promise.all([clientA.$connect(), clientB.$connect()]);
      const deadlocksBefore = await readDeadlocks(admin);
      try {
        const sameReceipts = await Promise.all([
          importEvidence(clientA, sameCommand),
          importEvidence(clientB, sameCommand),
        ]);
        expect(sameReceipts.map((receipt) => receipt.decision).sort()).toEqual([
          'IMPORTED',
          'IMPORT_REPLAY',
        ]);
        expect(sameReceipts[0]?.importReceiptDigest).toBe(
          sameReceipts[1]?.importReceiptDigest,
        );
        expect(sameReceipts[0]?.importedAtEpochMs).toBe(
          sameReceipts[1]?.importedAtEpochMs,
        );
        expect(sameReceipts[0]?.importedTransactionId).toBe(
          sameReceipts[1]?.importedTransactionId,
        );

        const sameTenantReceipts = await Promise.all([
          importEvidence(clientA, sameTenantFirst),
          importEvidence(clientB, sameTenantSecond),
        ]);
        expect(sameTenantReceipts.map((receipt) => receipt.decision)).toEqual([
          'IMPORTED',
          'IMPORTED',
        ]);
        expect(
          new Set(sameTenantReceipts.map((receipt) => receipt.tenantId)),
        ).toEqual(new Set([sharedTenantId]));

        const startedAt = Date.now();
        const tenantReceipts = await Promise.all([
          importEvidence(clientA, firstTenant),
          importEvidence(clientB, secondTenant),
        ]);
        expect(Date.now() - startedAt).toBeLessThan(10_000);
        expect(tenantReceipts.map((receipt) => receipt.decision)).toEqual([
          'IMPORTED',
          'IMPORTED',
        ]);
        expect(
          new Set(tenantReceipts.map((receipt) => receipt.tenantId)),
        ).toEqual(
          new Set([firstTenant.bundle.tenantId, secondTenant.bundle.tenantId]),
        );
      } finally {
        await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
      }
      await expect(readDeadlocks(admin)).resolves.toBe(deadlocksBefore);
    });

    it('orders manifest revocation before reuse through a real tenant advisory waiter', async () => {
      const base = buildEvidenceFixture(
        fixtureInput({
          reuseCommandId: randomUUID(),
          reuseRequestId: randomUUID(),
          validForMs: 30_000,
        }),
      );
      if (!base.reuse) {
        throw new Error('CURRENT185 race reuse fixture is unavailable');
      }
      const reuse = base.reuse;
      const independent = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      await Promise.all([
        ensureTenant(admin, base.bundle.tenantId),
        ensureTenant(admin, independent.bundle.tenantId),
      ]);
      await importEvidence(admin, base);
      const beforeRace = await readLedgerSnapshot(admin);
      const deadlocksBefore = await readDeadlocks(admin);

      const holder = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const waiter = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const independentClient = prismaFor(
        singleConnectionUrl(disposableDatabaseUrl),
      );
      await Promise.all([
        holder.$connect(),
        waiter.$connect(),
        independentClient.$connect(),
      ]);
      const waiterPid = await backendPid(waiter);
      const holderLocked = deferred<void>();
      const releaseHolder = deferred<void>();
      const callerRevokedAt = new Date('2026-01-01T00:00:00.000Z');
      const callerTransactionId = '1';
      let insertedRevocation: RevocationInsertReceipt | undefined;
      let holderPromise: Promise<void> | undefined;
      let waiterOutcomePromise: Promise<Outcome<ImportReceipt>> | undefined;

      try {
        holderPromise = holder.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
            const lock = await tx.$queryRaw<Array<{ tenantId: string }>>(
              Prisma.sql`
                WITH tenant_lock AS MATERIALIZED (
                  SELECT pg_catalog.pg_advisory_xact_lock(
                    pg_catalog.hashtextextended(
                      ${`leetplus:identity-mail-tenant:v1:${base.bundle.tenantId}`}::TEXT,
                      180
                    )
                  ) AS acquired
                )
                SELECT ${base.bundle.tenantId}::TEXT AS "tenantId"
                FROM tenant_lock
              `,
            );
            expect(lock).toEqual([{ tenantId: base.bundle.tenantId }]);
            const [revocation] = await tx.$queryRaw<
              RevocationInsertReceipt[]
            >(Prisma.sql`
              INSERT INTO public."IdentityMailDutyRoleManifestRevocationV2" (
                "manifestPayloadDigest",
                "reasonDigest",
                "evidenceDigest",
                "revokedAt",
                "revokedTransactionId"
              ) VALUES (
                ${base.bundle.manifestPayloadDigest},
                ${fixtureDigest('current185-race-revocation-reason')},
                ${fixtureDigest('current185-race-revocation-evidence')},
                ${callerRevokedAt},
                ${callerTransactionId}
              )
              RETURNING
                "revokedAt",
                "revokedTransactionId",
                pg_catalog.pg_current_xact_id()::TEXT
                  AS "currentTransactionId"
            `);
            if (!revocation) {
              throw new Error('CURRENT185 race revocation was not inserted');
            }
            expect(revocation.revokedAt.valueOf()).not.toBe(
              callerRevokedAt.valueOf(),
            );
            expect(revocation.revokedTransactionId).not.toBe(
              callerTransactionId,
            );
            expect(revocation.revokedTransactionId).toBe(
              revocation.currentTransactionId,
            );
            insertedRevocation = revocation;
            holderLocked.resolve(undefined);
            await releaseHolder.promise;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 30_000,
          },
        );
        await Promise.race([
          holderLocked.promise,
          holderPromise.then(
            () => {
              throw new Error(
                'CURRENT185 revocation holder ended before exposing its lock',
              );
            },
            (error: unknown) => {
              throw error;
            },
          ),
        ]);

        waiterOutcomePromise = capture(importEvidence(waiter, reuse));
        const advisoryWait = await waitForAdvisoryWait(admin, waiterPid);
        expect(advisoryWait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(advisoryWait.query).toContain(
          'identity_mail_tenant_enrollment_import_evidence_v2',
        );

        const independentReceipt = await withTimeout(
          importEvidence(independentClient, independent),
          5_000,
          'Different tenant did not progress during the revocation advisory wait',
        );
        expect(independentReceipt).toMatchObject({
          decision: 'IMPORTED',
          tenantId: independent.bundle.tenantId,
        });

        releaseHolder.resolve(undefined);
        await holderPromise;
        const waiterOutcome = await waiterOutcomePromise;
        expect(waiterOutcome.status).toBe('rejected');
        if (waiterOutcome.status === 'rejected') {
          expect(postgresSqlState(waiterOutcome.reason)).toBe('55000');
          expect(postgresSqlState(waiterOutcome.reason)).not.toBe('40P01');
        }
        if (!insertedRevocation) {
          throw new Error('CURRENT185 race revocation receipt is unavailable');
        }
        const [persistedRevocation] = await admin.$queryRaw<
          Array<{
            revokedAt: Date;
            revokedTransactionId: string;
          }>
        >(Prisma.sql`
          SELECT "revokedAt", "revokedTransactionId"
          FROM public."IdentityMailDutyRoleManifestRevocationV2"
          WHERE "manifestPayloadDigest" =
            ${base.bundle.manifestPayloadDigest}
        `);
        expect(persistedRevocation).toEqual({
          revokedAt: insertedRevocation.revokedAt,
          revokedTransactionId: insertedRevocation.revokedTransactionId,
        });
        const afterRace = await readLedgerSnapshot(admin);
        expect(afterRace.commandCount).toBe(beforeRace.commandCount + 1);
        expect(afterRace.manifestCount).toBe(beforeRace.manifestCount + 1);
        expect(afterRace.revocationCount).toBe(beforeRace.revocationCount + 1);
        const [reuseCount] = await admin.$queryRaw<Array<{ count: number }>>(
          Prisma.sql`
            SELECT pg_catalog.count(*)::INTEGER AS count
            FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
            WHERE "id" = ${reuse.bundle.commandId}
          `,
        );
        expect(reuseCount?.count).toBe(0);
        await expect(readDeadlocks(admin)).resolves.toBe(deadlocksBefore);
      } finally {
        releaseHolder.resolve(undefined);
        const pending: Promise<unknown>[] = [];
        if (holderPromise) pending.push(holderPromise);
        if (waiterOutcomePromise) pending.push(waiterOutcomePromise);
        await Promise.allSettled(pending);
        await Promise.allSettled([
          holder.$disconnect(),
          waiter.$disconnect(),
          independentClient.$disconnect(),
        ]);
      }
    });

    it('commits importer-first reuse before the waiting revocation and keeps another tenant progressing', async () => {
      const base = buildEvidenceFixture(
        fixtureInput({
          reuseCommandId: randomUUID(),
          reuseRequestId: randomUUID(),
          validForMs: 30_000,
        }),
      );
      if (!base.reuse) {
        throw new Error('CURRENT185 inverse race reuse fixture is unavailable');
      }
      const reuse = base.reuse;
      const independent = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      await Promise.all([
        ensureTenant(admin, base.bundle.tenantId),
        ensureTenant(admin, independent.bundle.tenantId),
      ]);
      await importEvidence(admin, base);
      const beforeRace = await readLedgerSnapshot(admin);
      const deadlocksBefore = await readDeadlocks(admin);

      const importer = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const revoker = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const independentClient = prismaFor(
        singleConnectionUrl(disposableDatabaseUrl),
      );
      await Promise.all([
        importer.$connect(),
        revoker.$connect(),
        independentClient.$connect(),
      ]);
      const revokerPid = await backendPid(revoker);
      const importerReady = deferred<void>();
      const releaseImporter = deferred<void>();
      const callerRevokedAt = new Date('2026-01-02T00:00:00.000Z');
      const callerTransactionId = '2';
      let importerPromise: Promise<ImportReceipt> | undefined;
      let revokerOutcomePromise:
        | Promise<Outcome<RevocationInsertReceipt>>
        | undefined;

      try {
        importerPromise = importer.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
            const receipt = await importEvidenceInTransaction(
              tx,
              reuse.bundleCanonicalJson,
              reuse.bundleDigest,
            );
            expect(receipt).toMatchObject({
              decision: 'IMPORTED',
              tenantId: base.bundle.tenantId,
              commandId: reuse.bundle.commandId,
              manifestPayloadDigest: base.bundle.manifestPayloadDigest,
            });
            importerReady.resolve(undefined);
            await releaseImporter.promise;
            return receipt;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 30_000,
          },
        );
        await Promise.race([
          importerReady.promise,
          importerPromise.then(
            () => {
              throw new Error(
                'CURRENT185 importer holder ended before exposing its lock',
              );
            },
            (error: unknown) => {
              throw error;
            },
          ),
        ]);

        revokerOutcomePromise = capture(
          revoker.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
              await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
              return insertManifestRevocationInTransaction(tx, {
                callerRevokedAt,
                callerTransactionId,
                evidenceDigest: fixtureDigest(
                  'current185-inverse-race-revocation-evidence',
                ),
                manifestPayloadDigest: base.bundle.manifestPayloadDigest,
                reasonDigest: fixtureDigest(
                  'current185-inverse-race-revocation-reason',
                ),
              });
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
              maxWait: 5_000,
              timeout: 30_000,
            },
          ),
        );
        const advisoryWait = await waitForAdvisoryWait(admin, revokerPid);
        expect(advisoryWait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(advisoryWait.query).toContain(
          'IdentityMailDutyRoleManifestRevocationV2',
        );

        const independentReceipt = await withTimeout(
          importEvidence(independentClient, independent),
          5_000,
          'Different tenant did not progress during the importer-first advisory wait',
        );
        expect(independentReceipt).toMatchObject({
          decision: 'IMPORTED',
          tenantId: independent.bundle.tenantId,
        });

        releaseImporter.resolve(undefined);
        const importerReceipt = await importerPromise;
        expect(importerReceipt.decision).toBe('IMPORTED');
        const revokerOutcome = await revokerOutcomePromise;
        expect(revokerOutcome.status).toBe('fulfilled');
        if (revokerOutcome.status !== 'fulfilled') {
          throw revokerOutcome.reason;
        }
        expect(revokerOutcome.value.revokedAt.valueOf()).not.toBe(
          callerRevokedAt.valueOf(),
        );
        expect(revokerOutcome.value.revokedTransactionId).not.toBe(
          callerTransactionId,
        );
        expect(revokerOutcome.value.revokedTransactionId).toBe(
          revokerOutcome.value.currentTransactionId,
        );

        const [persistedRevocation] = await admin.$queryRaw<
          Array<{ revokedAt: Date; revokedTransactionId: string }>
        >(Prisma.sql`
          SELECT "revokedAt", "revokedTransactionId"
          FROM public."IdentityMailDutyRoleManifestRevocationV2"
          WHERE "manifestPayloadDigest" =
            ${base.bundle.manifestPayloadDigest}
        `);
        expect(persistedRevocation).toEqual({
          revokedAt: revokerOutcome.value.revokedAt,
          revokedTransactionId: revokerOutcome.value.revokedTransactionId,
        });
        const afterRace = await readLedgerSnapshot(admin);
        expect(afterRace.commandCount).toBe(beforeRace.commandCount + 2);
        expect(afterRace.manifestCount).toBe(beforeRace.manifestCount + 1);
        expect(afterRace.revocationCount).toBe(beforeRace.revocationCount + 1);
        const [reuseCount] = await admin.$queryRaw<Array<{ count: number }>>(
          Prisma.sql`
            SELECT pg_catalog.count(*)::INTEGER AS count
            FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
            WHERE "id" = ${reuse.bundle.commandId}
          `,
        );
        expect(reuseCount?.count).toBe(1);
        await expect(readDeadlocks(admin)).resolves.toBe(deadlocksBefore);
      } finally {
        releaseImporter.resolve(undefined);
        const pending: Promise<unknown>[] = [];
        if (importerPromise) pending.push(importerPromise);
        if (revokerOutcomePromise) pending.push(revokerOutcomePromise);
        await Promise.allSettled(pending);
        await Promise.allSettled([
          importer.$disconnect(),
          revoker.$disconnect(),
          independentClient.$disconnect(),
        ]);
      }
    });

    it('serializes concurrent double-revoke to one commit and one typed conflict', async () => {
      const base = buildEvidenceFixture(fixtureInput({ validForMs: 30_000 }));
      const independent = buildEvidenceFixture(
        fixtureInput({ validForMs: 30_000 }),
      );
      await Promise.all([
        ensureTenant(admin, base.bundle.tenantId),
        ensureTenant(admin, independent.bundle.tenantId),
      ]);
      await importEvidence(admin, base);
      const beforeRace = await readLedgerSnapshot(admin);
      const deadlocksBefore = await readDeadlocks(admin);

      const holder = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const waiter = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const independentClient = prismaFor(
        singleConnectionUrl(disposableDatabaseUrl),
      );
      await Promise.all([
        holder.$connect(),
        waiter.$connect(),
        independentClient.$connect(),
      ]);
      const waiterPid = await backendPid(waiter);
      const holderReady = deferred<void>();
      const releaseHolder = deferred<void>();
      const holderCallerRevokedAt = new Date('2026-01-03T00:00:00.000Z');
      const holderCallerTransactionId = '3';
      let holderPromise: Promise<RevocationInsertReceipt> | undefined;
      let waiterOutcomePromise:
        | Promise<Outcome<RevocationInsertReceipt>>
        | undefined;

      try {
        holderPromise = holder.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
            const receipt = await insertManifestRevocationInTransaction(tx, {
              callerRevokedAt: holderCallerRevokedAt,
              callerTransactionId: holderCallerTransactionId,
              evidenceDigest: fixtureDigest(
                'current185-double-revoke-holder-evidence',
              ),
              manifestPayloadDigest: base.bundle.manifestPayloadDigest,
              reasonDigest: fixtureDigest(
                'current185-double-revoke-holder-reason',
              ),
            });
            holderReady.resolve(undefined);
            await releaseHolder.promise;
            return receipt;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 30_000,
          },
        );
        await Promise.race([
          holderReady.promise,
          holderPromise.then(
            () => {
              throw new Error(
                'CURRENT185 double-revoke holder ended before exposing its lock',
              );
            },
            (error: unknown) => {
              throw error;
            },
          ),
        ]);

        waiterOutcomePromise = capture(
          waiter.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
              await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
              return insertManifestRevocationInTransaction(tx, {
                callerRevokedAt: new Date('2026-01-04T00:00:00.000Z'),
                callerTransactionId: '4',
                evidenceDigest: fixtureDigest(
                  'current185-double-revoke-waiter-evidence',
                ),
                manifestPayloadDigest: base.bundle.manifestPayloadDigest,
                reasonDigest: fixtureDigest(
                  'current185-double-revoke-waiter-reason',
                ),
              });
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
              maxWait: 5_000,
              timeout: 30_000,
            },
          ),
        );
        const advisoryWait = await waitForAdvisoryWait(admin, waiterPid);
        expect(advisoryWait).toMatchObject({
          state: 'active',
          waitEventType: 'Lock',
          waitEvent: 'advisory',
        });
        expect(advisoryWait.query).toContain(
          'IdentityMailDutyRoleManifestRevocationV2',
        );

        const independentReceipt = await withTimeout(
          importEvidence(independentClient, independent),
          5_000,
          'Different tenant did not progress during the double-revoke advisory wait',
        );
        expect(independentReceipt).toMatchObject({
          decision: 'IMPORTED',
          tenantId: independent.bundle.tenantId,
        });

        releaseHolder.resolve(undefined);
        const holderReceipt = await holderPromise;
        expect(holderReceipt.revokedAt.valueOf()).not.toBe(
          holderCallerRevokedAt.valueOf(),
        );
        expect(holderReceipt.revokedTransactionId).not.toBe(
          holderCallerTransactionId,
        );
        expect(holderReceipt.revokedTransactionId).toBe(
          holderReceipt.currentTransactionId,
        );
        const waiterOutcome = await waiterOutcomePromise;
        expect(waiterOutcome.status).toBe('rejected');
        if (waiterOutcome.status === 'rejected') {
          expect(postgresSqlState(waiterOutcome.reason)).toBe('23505');
          expect(postgresSqlState(waiterOutcome.reason)).not.toBe('40P01');
        }

        const [persistedRevocation] = await admin.$queryRaw<
          Array<{
            count: number;
            reasonDigest: string;
            evidenceDigest: string;
            revokedAt: Date;
            revokedTransactionId: string;
          }>
        >(Prisma.sql`
          SELECT
            pg_catalog.count(*)::INTEGER AS count,
            pg_catalog.min("reasonDigest") AS "reasonDigest",
            pg_catalog.min("evidenceDigest") AS "evidenceDigest",
            pg_catalog.min("revokedAt") AS "revokedAt",
            pg_catalog.min("revokedTransactionId") AS "revokedTransactionId"
          FROM public."IdentityMailDutyRoleManifestRevocationV2"
          WHERE "manifestPayloadDigest" =
            ${base.bundle.manifestPayloadDigest}
        `);
        expect(persistedRevocation).toEqual({
          count: 1,
          reasonDigest: fixtureDigest('current185-double-revoke-holder-reason'),
          evidenceDigest: fixtureDigest(
            'current185-double-revoke-holder-evidence',
          ),
          revokedAt: holderReceipt.revokedAt,
          revokedTransactionId: holderReceipt.revokedTransactionId,
        });
        const afterRace = await readLedgerSnapshot(admin);
        expect(afterRace.commandCount).toBe(beforeRace.commandCount + 1);
        expect(afterRace.manifestCount).toBe(beforeRace.manifestCount + 1);
        expect(afterRace.revocationCount).toBe(beforeRace.revocationCount + 1);
        await expect(readDeadlocks(admin)).resolves.toBe(deadlocksBefore);
      } finally {
        releaseHolder.resolve(undefined);
        const pending: Promise<unknown>[] = [];
        if (holderPromise) pending.push(holderPromise);
        if (waiterOutcomePromise) pending.push(waiterOutcomePromise);
        await Promise.allSettled(pending);
        await Promise.allSettled([
          holder.$disconnect(),
          waiter.$disconnect(),
          independentClient.$disconnect(),
        ]);
      }
    });

    function fixtureInput(overrides: Partial<FixtureInput> = {}): FixtureInput {
      return {
        actualContextDigest: marker.actualContextDigest,
        commandId: randomUUID(),
        coordinatorRoleName: COORDINATOR_ROLE_NAME,
        coordinatorRoleOid: COORDINATOR_ROLE_OID,
        databaseIdentityDigest: marker.databaseIdentityDigest,
        databaseName: disposableDatabase,
        databaseOid,
        deploymentMarkerDigest: marker.payloadDigest,
        deploymentMarkerId: marker.id,
        manifestId: randomUUID(),
        requestId: randomUUID(),
        tenantId: randomUUID(),
        validForMs: 30_000,
        workerRoleName: WORKER_ROLE_NAME,
        workerRoleOid: WORKER_ROLE_OID,
        ...overrides,
      };
    }
  },
);

function buildEvidenceFixture(input: FixtureInput): EvidenceFixture {
  const repositoryRoot = resolve(__dirname, '../../..');
  const fixtureScript = resolve(
    repositoryRoot,
    'packages/database/scripts/identity-mail-enrollment-evidence-current185-fixture.mjs',
  );
  const output = execFileSync(process.execPath, [fixtureScript], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input: JSON.stringify(input),
    maxBuffer: 512 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  const parsed: unknown = JSON.parse(output) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.bundle)) {
    throw new Error('CURRENT185 fixture output is not an object');
  }
  const bundle = parsed.bundle;
  for (const key of [
    'contract',
    'tenantId',
    'commandId',
    'requestId',
    'authorizationEnvelopeDigest',
    'manifestId',
    'manifestPayloadDigest',
    'exactGrantsDigest',
    'bindingDigest',
    'bundleDigest',
  ]) {
    if (typeof bundle[key] !== 'string') {
      throw new Error(`CURRENT185 fixture bundle ${key} is invalid`);
    }
  }
  if (
    typeof parsed.bundleCanonicalJson !== 'string' ||
    typeof parsed.bundleDigest !== 'string' ||
    typeof parsed.expiresAt !== 'string' ||
    bundle.bundleDigest !== parsed.bundleDigest ||
    bundle.schemaVersion !== 1 ||
    bundle.authorization !== false ||
    bundle.canMutate !== false ||
    bundle.canSend !== false ||
    !/^[0-9a-f]{64}$/u.test(parsed.bundleDigest) ||
    !Number.isFinite(Date.parse(parsed.expiresAt))
  ) {
    throw new Error('CURRENT185 fixture bundle contract is invalid');
  }
  expect(parsed.bundleCanonicalJson).not.toMatch(
    /(?:@|email|phone|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu,
  );
  return parsed as EvidenceFixture;
}

async function importEvidence(
  client: PrismaClient,
  fixture: EvidenceFixture,
): Promise<ImportReceipt> {
  return importEvidenceArguments(
    client,
    fixture.bundleCanonicalJson,
    fixture.bundleDigest,
  );
}

async function importEvidenceArguments(
  client: PrismaClient,
  canonicalJson: string,
  digest: string,
): Promise<ImportReceipt> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
      return importEvidenceInTransaction(tx, canonicalJson, digest);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

async function importEvidenceInTransaction(
  tx: Prisma.TransactionClient,
  canonicalJson: string,
  digest: string,
): Promise<ImportReceipt> {
  const [row] = await tx.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
    Prisma.sql`
      SELECT public."identity_mail_tenant_enrollment_import_evidence_v2"(
        ${canonicalJson}::TEXT,
        ${digest}::TEXT
      ) AS receipt
    `,
  );
  if (!row) throw new Error('CURRENT185 importer returned no receipt');
  return requireReceipt(row.receipt);
}

async function insertManifestRevocationInTransaction(
  tx: Prisma.TransactionClient,
  input: RevocationInsertInput,
): Promise<RevocationInsertReceipt> {
  const [receipt] = await tx.$queryRaw<RevocationInsertReceipt[]>(Prisma.sql`
    INSERT INTO public."IdentityMailDutyRoleManifestRevocationV2" (
      "manifestPayloadDigest",
      "reasonDigest",
      "evidenceDigest",
      "revokedAt",
      "revokedTransactionId"
    ) VALUES (
      ${input.manifestPayloadDigest},
      ${input.reasonDigest},
      ${input.evidenceDigest},
      ${input.callerRevokedAt},
      ${input.callerTransactionId}
    )
    RETURNING
      "revokedAt",
      "revokedTransactionId",
      pg_catalog.pg_current_xact_id()::TEXT AS "currentTransactionId"
  `);
  if (!receipt) {
    throw new Error('CURRENT185 manifest revocation returned no receipt');
  }
  return receipt;
}

function requireReceipt(value: Prisma.JsonValue): ImportReceipt {
  if (!isRecord(value)) {
    throw new Error('CURRENT185 importer receipt is not an object');
  }
  const stringKeys = [
    'authorizationEnvelopeDigest',
    'bindingDigest',
    'bundleDigest',
    'candidateStatus',
    'commandId',
    'decision',
    'exactGrantsDigest',
    'importReceiptDigest',
    'importedTransactionId',
    'manifestId',
    'manifestPayloadDigest',
    'operation',
    'operationId',
    'requestId',
    'tenantId',
  ];
  if (
    stringKeys.some((key) => typeof value[key] !== 'string') ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.importedAtEpochMs) ||
    value.canPersistEvidence !== true ||
    value.authorization !== false ||
    value.canMutate !== false ||
    value.canSend !== false ||
    (value.decision !== 'IMPORTED' && value.decision !== 'IMPORT_REPLAY')
  ) {
    throw new Error('CURRENT185 importer receipt contract is invalid');
  }
  return value as ImportReceipt;
}

function expectedReceiptIdentity(fixture: EvidenceFixture) {
  return {
    schemaVersion: 1,
    operation: 'IMPORT_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_V2',
    operationId: fixture.bundle.bundleDigest,
    tenantId: fixture.bundle.tenantId,
    commandId: fixture.bundle.commandId,
    requestId: fixture.bundle.requestId,
    authorizationEnvelopeDigest: fixture.bundle.authorizationEnvelopeDigest,
    manifestId: fixture.bundle.manifestId,
    manifestPayloadDigest: fixture.bundle.manifestPayloadDigest,
    exactGrantsDigest: fixture.bundle.exactGrantsDigest,
    bindingDigest: fixture.bundle.bindingDigest,
    bundleDigest: fixture.bundle.bundleDigest,
  };
}

async function ensureTenant(
  client: PrismaClient,
  tenantId: string,
): Promise<void> {
  const slug = `current185-ci-${tenantId.replaceAll('-', '')}`;
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public."Tenant" (
      "id",
      "name",
      "slug",
      "updatedAt"
    ) VALUES (
      ${tenantId},
      'CURRENT185 disposable tenant',
      ${slug},
      pg_catalog.clock_timestamp()
    )
    ON CONFLICT ("id") DO NOTHING
  `);
}

async function insertReleaseMarker(
  client: PrismaClient,
  marker: MarkerFixture,
): Promise<void> {
  const buildProvenanceId = randomUUID();
  const challengeId = randomUUID();
  const deployedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const validUntil = new Date(deployedAt.valueOf() + 60 * 60 * 1000);
  const buildPayloadDigest = fixtureDigest('current185-build-payload');
  const deploymentInstanceDigest = fixtureDigest(
    'current185-deployment-instance',
  );
  const databaseChallengeDigest = fixtureDigest(
    'current185-database-challenge',
  );
  const predecessorMarkerDigest = fixtureDigest(
    'current185-predecessor-marker',
  );
  const signingKeyId = 'current185-ci-release-marker';
  const publicKeyFingerprint = fixtureDigest('current185-release-public-key');
  const payload = {
    schemaVersion: 1,
    kind: 'LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE',
    purpose: 'SHARED_BETA_DEPLOYMENT_PROVENANCE',
    profile: 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
    contract: 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
    deploymentMarkerId: marker.id,
    buildProvenanceId,
    buildPayloadDigest,
    generation: 1,
    environment: 'current185-ci',
    deploymentInstanceDigest,
    databaseIdentityDigest: marker.databaseIdentityDigest,
    databaseChallengeDigest,
    actualContextDigest: marker.actualContextDigest,
    activationDatabaseRole: COORDINATOR_ROLE_NAME,
    coordinatorRoleName: COORDINATOR_ROLE_NAME,
    coordinatorRoleOid: COORDINATOR_ROLE_OID,
    predecessorMarkerDigest,
    signingKeyId,
    publicKeyFingerprint,
    deployedAtEpochMs: deployedAt.valueOf(),
    validUntilEpochMs: validUntil.valueOf(),
  };
  const payloadJson = JSON.stringify(payload);
  expect(payloadJson).not.toMatch(/(?:@|email|phone|password|secret|token)/iu);
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."SharedBetaRuntimeReleaseMarker" (
        "id",
        "buildProvenanceId",
        "challengeId",
        "generation",
        "environment",
        "buildPayloadDigest",
        "deploymentInstanceDigest",
        "databaseIdentityDigest",
        "databaseChallengeDigest",
        "actualContextDigest",
        "schemaHead",
        "migrationCount",
        "migrationManifestDigest",
        "activationDatabaseRole",
        "coordinatorRoleName",
        "coordinatorRoleOid",
        "predecessorMarkerId",
        "predecessorMarkerDigest",
        "payload",
        "payloadDigest",
        "signingKeyId",
        "publicKeyFingerprint",
        "signatureBase64url",
        "deployedAt",
        "validUntil"
      ) VALUES (
        ${marker.id},
        ${buildProvenanceId},
        ${challengeId},
        1,
        'current185-ci',
        ${buildPayloadDigest},
        ${deploymentInstanceDigest},
        ${marker.databaseIdentityDigest},
        ${databaseChallengeDigest},
        ${marker.actualContextDigest},
        ${CURRENT184_MIGRATION},
        184,
        ${CURRENT184_MANIFEST_DIGEST},
        ${COORDINATOR_ROLE_NAME},
        ${COORDINATOR_ROLE_NAME},
        ${COORDINATOR_ROLE_OID},
        NULL,
        ${predecessorMarkerDigest},
        ${payloadJson}::JSONB,
        ${marker.payloadDigest},
        ${signingKeyId},
        ${publicKeyFingerprint},
        ${'A'.repeat(86)},
        ${deployedAt},
        ${validUntil}
      )
    `);
  });
}

async function readLedgerSnapshot(
  client: PrismaClient,
): Promise<LedgerSnapshot> {
  const [snapshot] = await client.$queryRaw<LedgerSnapshot[]>(Prisma.sql`
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
      ) AS "commandCount",
      COALESCE((
        SELECT pg_catalog.string_agg(
          "id" || ':' || "bundleDigest",
          ',' ORDER BY "id" COLLATE "C"
        )
        FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
      ), '') AS "commandDigests",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDutyRoleManifestEvidenceV2"
      ) AS "manifestCount",
      COALESCE((
        SELECT pg_catalog.string_agg(
          "manifestId" || ':' || "payloadDigest",
          ',' ORDER BY "manifestId" COLLATE "C"
        )
        FROM public."IdentityMailDutyRoleManifestEvidenceV2"
      ), '') AS "manifestDigests",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDutyRoleManifestRevocationV2"
      ) AS "revocationCount"
  `);
  if (!snapshot) throw new Error('CURRENT185 ledger snapshot is unavailable');
  return snapshot;
}

async function readCommandRow(client: PrismaClient, commandId: string) {
  const [row] = await client.$queryRaw<Array<{ value: Prisma.JsonValue }>>(
    Prisma.sql`
      SELECT pg_catalog.to_jsonb(command_row) AS value
      FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command_row
      WHERE command_row."id" = ${commandId}
    `,
  );
  if (!row) throw new Error('CURRENT185 command row is unavailable');
  return row.value;
}

async function expectRejectedAndUnchanged(
  client: PrismaClient,
  operation: () => Promise<unknown>,
  sqlStates: readonly string[],
): Promise<void> {
  const before = await readLedgerSnapshot(client);
  await expectSqlStateOneOf(operation(), sqlStates);
  await expect(readLedgerSnapshot(client)).resolves.toEqual(before);
}

async function assertDutyDriftRejected(
  client: PrismaClient,
  commandId: string,
  field: (typeof DUTY_BINDING_FIELDS)[number],
  driftValue: unknown,
): Promise<void> {
  let reachedRollback = false;
  try {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand" DISABLE TRIGGER "IdentityMailEnrollmentCommand_immutable_dml_trigger"',
      );
      await tx.$executeRawUnsafe(
        `UPDATE public."IdentityMailDeliveryTenantEnrollmentCommand" SET "${field}" = $1 WHERE "id" = $2`,
        driftValue,
        commandId,
      );
      reachedRollback = true;
      throw new ExpectedRollback('force transactional rollback');
    });
  } catch (error) {
    if (reachedRollback && error instanceof ExpectedRollback) {
      throw new Error(`CURRENT185 duty drift was accepted for ${field}`);
    }
    expect(['23503', '23514']).toContain(postgresSqlState(error));
    expect(postgresSqlState(error)).not.toBe('40P01');
  }
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
    throw new Error('CURRENT185 PostgreSQL backend PID is unavailable');
  }
  return row.backendPid;
}

function capture<T>(operation: Promise<T>): Promise<Outcome<T>> {
  return operation.then<Outcome<T>, Outcome<T>>(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue;
  });
  return { promise, resolve: resolvePromise };
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
    if (timeout) clearTimeout(timeout);
  }
}

async function readDeadlocks(client: PrismaClient): Promise<bigint> {
  const [row] = await client.$queryRaw<Array<{ deadlocks: bigint }>>(
    Prisma.sql`
      SELECT stats.deadlocks::BIGINT AS deadlocks
      FROM pg_catalog.pg_stat_database AS stats
      WHERE stats.datname = pg_catalog.current_database()
    `,
  );
  if (!row) throw new Error('CURRENT185 deadlock counter is unavailable');
  return row.deadlocks;
}

async function expectSqlState(
  operation: Promise<unknown>,
  expectedSqlState: string,
): Promise<void> {
  return expectSqlStateOneOf(operation, [expectedSqlState]);
}

async function expectSqlStateOneOf(
  operation: Promise<unknown>,
  expectedSqlStates: readonly string[],
): Promise<void> {
  try {
    await operation;
    throw new Error(
      `Expected PostgreSQL SQLSTATE ${expectedSqlStates.join(' or ')}`,
    );
  } catch (error) {
    const actual = postgresSqlState(error);
    expect(expectedSqlStates).toContain(actual);
    expect(actual).not.toBe('40P01');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bundleDigest(canonicalJson: string): string {
  return createHash('sha256')
    .update(`${BUNDLE_DIGEST_DOMAIN}\n${canonicalJson}\n`, 'utf8')
    .digest('hex');
}

function fixtureDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function current185MigrationSha256(): string {
  const repositoryRoot = resolve(__dirname, '../../..');
  const source = readFileSync(
    resolve(
      repositoryRoot,
      'packages/database/migration-candidates',
      CURRENT185_MIGRATION,
      'migration.sql',
    ),
    'utf8',
  ).replace(/\r\n?/gu, '\n');
  return createHash('sha256').update(source, 'utf8').digest('hex');
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

function assertSafeIntegrationDatabase(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing CURRENT185 diagnostic in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for CURRENT185 diagnostics');
  }
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(host) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing CURRENT185 diagnostic outside a local CI/test PostgreSQL database',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing unsafe CURRENT185 disposable database name');
  }
}

function assertDisposableRoleName(roleName: string): void {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing unsafe CURRENT185 disposable role name');
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
