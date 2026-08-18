import type { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { IdentityEmailClaimService } from '../src/auth/identity-email-claim.service';
import { SharedTenantProvisioningService } from '../src/admin/shared-tenant-provisioning.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-shared-beta-runtime-release-activation-postgres-fixture';
const REQUIRED_CLUSTER_CONFIRMATION =
  'isolated-single-purpose-postgresql-cluster-with-restorable-public-connect';
const REQUIRED_SOURCE_DATABASE = 'leetplus_ci';
const CLUSTER_SCOPE_LOCK_DOMAIN =
  'leetplus-shared-beta-runtime-release-activation-cluster-scope:v1';
const integrationEnabled =
  process.env.SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_PG_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const DISPOSABLE_DATABASE_PATTERN = /^lp_activation176_pg_test_[0-9a-f]{32}$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_activation_role_ci_[0-9a-f]{24}$/u;
const DISPOSABLE_BYSTANDER_ROLE_PATTERN =
  /^lp_activation_bystander_ci_[0-9a-f]{24}$/u;
const TARGET_MIGRATION = '20260818010000_founder_owner_invite_reissue_v1';
const TARGET_MIGRATION_COUNT = 184;
const ACTIVATION_FUNCTION_SIGNATURE =
  'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)';
const CATALOG_RELATION_PROBE =
  'information_schema."SharedBetaActivationCatalogProbe"';
const LATE_FAULT_FUNCTION_SIGNATURE =
  'public."shared_beta_activation_late_fault_v1"()';
const LATE_FAULT_TRIGGER = 'SharedBetaActivation_late_fault_trigger';
const RUNTIME_ENVIRONMENT = 'ci';
const FINGERPRINT_KEY =
  'activation-176-postgres-fingerprint-key-aaaaaaaaaaaaaaaa';
const RELEASE_SHA = 'a'.repeat(40);
const ARTIFACT_DIGEST = 'b'.repeat(64);
const RELEASE_MANIFEST_DIGEST = 'c'.repeat(64);
const POLICY_MANIFEST_DIGEST = 'd'.repeat(64);
const BUILD_REFERENCE_DIGEST = 'e'.repeat(64);
const TRIAL_DURATION_SECONDS = 14 * 24 * 60 * 60;
const GATE_CODES = [
  'MODULE_POLICY_ENFORCED',
  'EMAIL_INVITE_WORKFLOW_VERIFIED',
  'POSTGRESQL_RELEASE_REHEARSAL_VERIFIED',
] as const;

type JsonReceipt = Record<string, unknown>;

type MigrationState = {
  schemaHead: string;
  migrationCount: number;
  migrationManifestDigest: string;
  nonAppliedCount: number;
  checksumMismatchCount: number;
};

type ShellContext = {
  actualShellDigest: string;
  profileDigest: string;
  workflowLocator: string;
  reservationSubjectId: string;
  reservationClaimRevision: number;
  entitlementProfileRevision: number;
  executionRevision: number;
};

type SyntheticAuthority = {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyFingerprint: string;
};

type SignedPayload = {
  payload: Record<string, unknown>;
  payloadDigest: string;
  signature: Buffer;
  signatureBase64url: string;
};

type BuildPersistenceOverrides = {
  artifactContentDigest?: string;
  buildReferenceDigest?: string;
  buildTime?: string;
  builtAt?: Date;
  migrationCount?: number;
  migrationManifestDigest?: string;
  policyManifestDigest?: string;
  publicKeyFingerprint?: string;
  releaseManifestDigest?: string;
  releaseSha?: string;
  schemaHead?: string;
  signatureBase64url?: string;
  signingKeyId?: string;
  trialDurationSeconds?: number;
  validUntil?: Date;
};

type PublicDatabaseGrant = {
  databaseName: string;
  grantorName: string;
  privilege: 'CONNECT' | 'TEMPORARY';
  isGrantable: boolean;
};

type PublicTypeUsageGrant = {
  schemaName: string;
  typeName: string;
  grantorName: string;
  isGrantable: boolean;
};

type ApplicationTypeIdentity = {
  schemaName: string;
  typeName: string;
};

type ActivationInput = {
  activationCommandId: string;
  tenantId: string;
  activationRequestId: string;
  activationRequestDigest: string;
  decisionId: string;
  markerId: string;
  activatedByUserId: string;
  issueRequestId: string;
  issueRequestDigest: string;
  issueCommandId: string;
  inviteId: string;
  outboxId: string;
  messageKey: string;
  tokenHash: string;
  secretCiphertext: Buffer;
  inviteExpiresAt: Date;
};

jest.setTimeout(300_000);

describePostgres(
  'shared beta CURRENT_176 atomic tenant activation PostgreSQL boundary',
  () => {
    let maintenance: PrismaClient;
    let clusterScopeLock: PrismaClient;
    let owner: PrismaClient;
    let activationRoleLeft: PrismaClient;
    let activationRoleRight: PrismaClient;
    let bystanderRole: PrismaClient;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let activationRoleName = '';
    let bystanderRoleName = '';
    let activationRolePassword = '';
    let bystanderRolePassword = '';
    let activationRoleOid = 0;
    let clusterScopeLockHeld = false;
    let systemCatalogGrantActive = false;
    let publicDatabaseGrantsToRestore: PublicDatabaseGrant[] = [];
    let publicTypeUsageGrantsToRestore: PublicTypeUsageGrant[] = [];
    let applicationTypeProbe: ApplicationTypeIdentity | undefined;

    beforeAll(async () => {
      const sourceUrl = assertSafeIntegrationDatabase();
      const suffix = randomUUID().replaceAll('-', '');
      disposableDatabase = `lp_activation176_pg_test_${suffix}`;
      activationRoleName = `lp_activation_role_ci_${suffix.slice(0, 24)}`;
      bystanderRoleName = `lp_activation_bystander_ci_${suffix.slice(0, 24)}`;
      activationRolePassword = randomBytes(24).toString('hex');
      bystanderRolePassword = randomBytes(24).toString('hex');
      assertDisposableDatabaseName(disposableDatabase);
      assertDisposableRoleName(activationRoleName);
      assertDisposableBystanderRoleName(bystanderRoleName);

      const maintenanceUrl = databaseUrlFor(sourceUrl, 'postgres');
      disposableDatabaseUrl = databaseUrlFor(sourceUrl, disposableDatabase);
      maintenance = prismaFor(maintenanceUrl);
      await maintenance.$connect();
      clusterScopeLock = prismaFor(clusterScopeLockUrlFor(maintenanceUrl));
      await clusterScopeLock.$connect();
      clusterScopeLockHeld = await acquireClusterScopeLock(clusterScopeLock);
      if (!clusterScopeLockHeld) {
        throw new Error(
          'Another cluster-wide shared beta activation fixture is already running',
        );
      }

      const [server] = await maintenance.$queryRaw<
        Array<{
          postgres_major: number;
          can_create_database: boolean;
          can_create_role: boolean;
        }>
      >(Prisma.sql`
        SELECT
          current_setting('server_version_num')::int / 10000
            AS postgres_major,
          role.rolcreatedb OR role.rolsuper AS can_create_database,
          role.rolcreaterole OR role.rolsuper AS can_create_role
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = current_user
      `);
      expect(server).toEqual({
        postgres_major: 16,
        can_create_database: true,
        can_create_role: true,
      });

      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${activationRoleName}" WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${activationRolePassword}'`,
      );
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${bystanderRoleName}" WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${bystanderRolePassword}'`,
      );
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      deployMigrations(disposableDatabaseUrl);

      owner = prismaFor(disposableDatabaseUrl);
      await owner.$connect();
      const [migration] = await owner.$queryRaw<
        Array<{ migration_count: number; latest_migration: string }>
      >(Prisma.sql`
        SELECT
          count(*)::int AS migration_count,
          max(migration_name) AS latest_migration
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migration).toEqual({
        migration_count: TARGET_MIGRATION_COUNT,
        latest_migration: TARGET_MIGRATION,
      });

      publicDatabaseGrantsToRestore =
        await establishDedicatedRoleDatabaseBaseline(
          maintenance,
          owner,
          disposableDatabase,
        );
      publicTypeUsageGrantsToRestore = await establishDedicatedRoleTypeBaseline(
        owner,
        activationRoleName,
      );
      expect(publicTypeUsageGrantsToRestore.length).toBeGreaterThan(0);
      applicationTypeProbe = await readApplicationTypeProbe(owner);

      const [role] = await owner.$queryRawUnsafe<
        Array<{ oid: bigint; assertion: boolean }>
      >(
        `SELECT
           role.oid::BIGINT AS oid,
           public."shared_beta_runtime_activation_role_assert_v1"(
             $1,
             role.oid::BIGINT
           ) AS assertion
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = $1`,
        activationRoleName,
      );
      expect(role?.assertion).toBe(true);
      activationRoleOid = Number(role?.oid);
      expect(Number.isSafeInteger(activationRoleOid)).toBe(true);
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      if (owner && publicTypeUsageGrantsToRestore.length > 0) {
        try {
          await restorePublicTypeUsageGrants(
            owner,
            publicTypeUsageGrantsToRestore,
          );
          publicTypeUsageGrantsToRestore = [];
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      const disconnects = await Promise.allSettled([
        activationRoleLeft?.$disconnect(),
        activationRoleRight?.$disconnect(),
        bystanderRole?.$disconnect(),
        owner?.$disconnect(),
      ]);
      for (const disconnect of disconnects) {
        if (disconnect.status === 'rejected') {
          cleanupErrors.push(disconnect.reason);
        }
      }

      if (maintenance && activationRoleName && systemCatalogGrantActive) {
        try {
          assertDisposableRoleName(activationRoleName);
          await maintenance.$executeRawUnsafe(
            `REVOKE SELECT ON TABLE pg_catalog.pg_authid
             FROM "${activationRoleName}"`,
          );
          systemCatalogGrantActive = false;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && publicDatabaseGrantsToRestore.length > 0) {
        try {
          await restorePublicDatabaseGrants(
            maintenance,
            publicDatabaseGrantsToRestore,
          );
          publicDatabaseGrantsToRestore = [];
        } catch (error) {
          cleanupErrors.push(error);
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
      if (maintenance && activationRoleName) {
        try {
          assertDisposableRoleName(activationRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${activationRoleName}"`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && bystanderRoleName) {
        try {
          assertDisposableBystanderRoleName(bystanderRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${bystanderRoleName}"`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance) {
        try {
          const [residue] = await maintenance.$queryRawUnsafe<
            Array<{
              bystander_role_count: number;
              database_count: number;
              role_count: number;
            }>
          >(
            `SELECT
               (
                 SELECT count(*)::INTEGER
                 FROM pg_catalog.pg_database
                 WHERE datname = $1
               ) AS database_count,
               (
                 SELECT count(*)::INTEGER
                 FROM pg_catalog.pg_roles
                 WHERE rolname = $2
               ) AS role_count,
               (
                 SELECT count(*)::INTEGER
                 FROM pg_catalog.pg_roles
                 WHERE rolname = $3
               ) AS bystander_role_count`,
            disposableDatabase,
            activationRoleName,
            bystanderRoleName,
          );
          expect(residue).toEqual({
            database_count: 0,
            role_count: 0,
            bystander_role_count: 0,
          });
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (clusterScopeLock && clusterScopeLockHeld) {
        try {
          const released = await releaseClusterScopeLock(clusterScopeLock);
          if (!released) {
            throw new Error(
              'Shared beta activation cluster-scope advisory lock was lost',
            );
          }
          clusterScopeLockHeld = false;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        await maintenance?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await clusterScopeLock?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        activationRolePassword = '';
        bystanderRolePassword = '';
        disposableDatabaseUrl = '';
        disposableDatabase = '';
        activationRoleName = '';
        bystanderRoleName = '';
        activationRoleOid = 0;
        clusterScopeLockHeld = false;
        systemCatalogGrantActive = false;
        publicDatabaseGrantsToRestore = [];
        publicTypeUsageGrantsToRestore = [];
        applicationTypeProbe = undefined;
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'Shared beta activation PostgreSQL fixture cleanup failed',
        );
      }
    });

    it('provisions the exact shell and atomically creates or replays one OWNER invite release through the dedicated role', async () => {
      await owner.$executeRawUnsafe(
        `GRANT SELECT ON TABLE pg_catalog.pg_authid
         TO "${activationRoleName}"`,
      );
      systemCatalogGrantActive = true;
      try {
        await expectSqlState(
          owner.$queryRawUnsafe(
            `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
               $1,
               $2::BIGINT
             )`,
            activationRoleName,
            activationRoleOid,
          ),
          '42501',
        );
      } finally {
        await owner.$executeRawUnsafe(
          `REVOKE SELECT ON TABLE pg_catalog.pg_authid
           FROM "${activationRoleName}"`,
        );
        systemCatalogGrantActive = false;
      }
      await expect(
        owner.$queryRawUnsafe(
          `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
             $1,
             $2::BIGINT
           ) AS assertion`,
          activationRoleName,
          activationRoleOid,
        ),
      ).resolves.toEqual([{ assertion: true }]);

      await owner.$executeRawUnsafe(
        `CREATE TABLE ${CATALOG_RELATION_PROBE} (
           "secretValue" TEXT NOT NULL
         )`,
      );
      try {
        const [probe] = await owner.$queryRawUnsafe<Array<{ oid: bigint }>>(
          `SELECT relation.oid::BIGINT AS oid
           FROM pg_catalog.pg_class AS relation
           WHERE relation.oid = $1::REGCLASS`,
          CATALOG_RELATION_PROBE,
        );
        expect(Number(probe?.oid)).toBeGreaterThanOrEqual(16_384);
        await owner.$executeRawUnsafe(
          `GRANT SELECT ON TABLE ${CATALOG_RELATION_PROBE} TO PUBLIC`,
        );
        await expectSqlState(
          owner.$queryRawUnsafe(
            `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
               $1,
               $2::BIGINT
             )`,
            activationRoleName,
            activationRoleOid,
          ),
          '42501',
        );
      } finally {
        await owner.$executeRawUnsafe(
          `REVOKE ALL PRIVILEGES ON TABLE ${CATALOG_RELATION_PROBE}
           FROM PUBLIC`,
        );
        await owner.$executeRawUnsafe(
          `DROP TABLE IF EXISTS ${CATALOG_RELATION_PROBE}`,
        );
      }
      await expect(
        owner.$queryRawUnsafe(
          `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
             $1,
             $2::BIGINT
           ) AS assertion`,
          activationRoleName,
          activationRoleOid,
        ),
      ).resolves.toEqual([{ assertion: true }]);

      for (const grantee of ['PUBLIC', `"${bystanderRoleName}"`]) {
        await owner.$executeRawUnsafe(
          `GRANT EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
           TO ${grantee}`,
        );
        try {
          await expectSqlState(
            owner.$queryRawUnsafe(
              `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
                 $1,
                 $2::BIGINT
               )`,
              activationRoleName,
              activationRoleOid,
            ),
            '42501',
          );
        } finally {
          await owner.$executeRawUnsafe(
            `REVOKE EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
             FROM ${grantee}`,
          );
        }
        await expect(
          owner.$queryRawUnsafe(
            `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
               $1,
               $2::BIGINT
             ) AS assertion`,
            activationRoleName,
            activationRoleOid,
          ),
        ).resolves.toEqual([{ assertion: true }]);
      }

      const actor = await createPlatformAuthority(owner);
      const shell = await provisionExactTenantShell(owner, actor);
      const shellContext = await readShellContext(owner, shell.tenant.id);
      expect(shellContext).toMatchObject({
        workflowLocator: shell.ownerIdentity.reservationId,
        reservationSubjectId: shell.ownerIdentity.reservationId,
        reservationClaimRevision: 1,
        entitlementProfileRevision: 1,
        executionRevision: 0,
      });

      await expect(
        owner.$executeRawUnsafe(
          `UPDATE public."Tenant"
           SET "customerStage" = 'INTERNAL'
           WHERE "id" = $1`,
          shell.tenant.id,
        ),
      ).rejects.toThrow();

      const migrationState = await readMigrationState(owner);
      expect(migrationState).toMatchObject({
        schemaHead: TARGET_MIGRATION,
        migrationCount: TARGET_MIGRATION_COUNT,
        nonAppliedCount: 0,
        checksumMismatchCount: 0,
      });

      const buildAuthority = syntheticAuthority('activation-pg-build-v1');
      const deploymentAuthority = syntheticAuthority('activation-pg-deploy-v1');
      expect(buildAuthority.publicKeyFingerprint).not.toBe(
        deploymentAuthority.publicKeyFingerprint,
      );

      const buildProvenanceId = randomUUID();
      const builtAt = exactTime(-5_000);
      const buildValidUntil = exactTime(6 * 60 * 60 * 1_000);
      const buildPayload = {
        artifactContentDigest: ARTIFACT_DIGEST,
        buildReferenceDigest: BUILD_REFERENCE_DIGEST,
        buildTime: builtAt.toISOString(),
        builtAtEpochMs: builtAt.valueOf(),
        contract: 'SHARED_BETA_BUILD_PROVENANCE_V1',
        kind: 'LEETPLUS_SHARED_BETA_BUILD_PROVENANCE',
        migrationCount: migrationState.migrationCount,
        migrationManifestDigest: migrationState.migrationManifestDigest,
        policyManifestDigest: POLICY_MANIFEST_DIGEST,
        profile: 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
        publicKeyFingerprint: buildAuthority.publicKeyFingerprint,
        purpose: 'SHARED_BETA_BUILD_PROVENANCE',
        releaseManifestDigest: RELEASE_MANIFEST_DIGEST,
        releaseSha: RELEASE_SHA,
        schemaHead: migrationState.schemaHead,
        schemaVersion: 1,
        signingKeyId: buildAuthority.keyId,
        trialDurationSeconds: TRIAL_DURATION_SECONDS,
        trialPolicyVersion: 'SHARED_BETA_TRIAL_V1',
        validUntilEpochMs: buildValidUntil.valueOf(),
      };
      const signedBuild = signPayload(buildPayload, buildAuthority);
      await assertDatabaseCanonicalDigest(
        owner,
        buildPayload,
        signedBuild.payloadDigest,
      );
      const buildReceipt = await persistBuild(
        owner,
        buildProvenanceId,
        signedBuild,
      );
      expect(buildReceipt).toEqual({
        schemaVersion: 1,
        operation: 'PERSIST_SHARED_BETA_BUILD_PROVENANCE',
        decision: 'CREATED',
        buildProvenanceId,
        payloadDigest: signedBuild.payloadDigest,
        stateRevision: 1,
      });
      await expect(
        persistBuild(owner, buildProvenanceId, signedBuild),
      ).resolves.toEqual({
        ...buildReceipt,
        decision: 'REPLAYED',
      });

      const conflictingBuildAuthority = syntheticAuthority(
        'activation-pg-build-conflict-v2',
      );
      const conflictingBuiltAt = new Date(builtAt.valueOf() - 1_000);
      const buildReplayConflicts: BuildPersistenceOverrides[] = [
        { releaseSha: '0'.repeat(40) },
        { artifactContentDigest: '1'.repeat(64) },
        { releaseManifestDigest: '2'.repeat(64) },
        { schemaHead: '20260730040001_conflicting_schema_head' },
        { migrationCount: migrationState.migrationCount + 1 },
        { migrationManifestDigest: '3'.repeat(64) },
        { policyManifestDigest: '4'.repeat(64) },
        { trialDurationSeconds: TRIAL_DURATION_SECONDS + 3_600 },
        { buildReferenceDigest: '5'.repeat(64) },
        {
          buildTime: conflictingBuiltAt.toISOString(),
          builtAt: conflictingBuiltAt,
        },
        { signingKeyId: conflictingBuildAuthority.keyId },
        {
          publicKeyFingerprint: conflictingBuildAuthority.publicKeyFingerprint,
        },
        { signatureBase64url: 'A'.repeat(86) },
        { validUntil: new Date(buildValidUntil.valueOf() - 1_000) },
      ];
      for (const conflict of buildReplayConflicts) {
        await expectSqlState(
          persistBuild(owner, buildProvenanceId, signedBuild, conflict),
          '23505',
        );
      }
      await expect(
        persistBuild(owner, buildProvenanceId, signedBuild),
      ).resolves.toEqual({
        ...buildReceipt,
        decision: 'REPLAYED',
      });

      const identityProbeNonce = '9'.repeat(64);
      const anchorBeforeChallenge = await readRuntimeInstanceAnchor(owner);
      expect(anchorBeforeChallenge).toEqual({
        anchor_count: 0,
        anchor_nonce: null,
        relpersistence: 'u',
      });
      await expectSqlState(
        owner.$queryRawUnsafe(
          `SELECT public."shared_beta_runtime_database_identity_digest_v1"(
             $1
           )`,
          identityProbeNonce,
        ),
        '55000',
      );

      const challengeId = randomUUID();
      const challengeValidUntil = exactTime(10 * 60 * 1_000);
      const challengeReceipt = await createChallenge(
        owner,
        challengeId,
        buildProvenanceId,
        activationRoleName,
        challengeValidUntil,
      );
      expect(challengeReceipt).toMatchObject({
        schemaVersion: 1,
        operation: 'CREATE_SHARED_BETA_RUNTIME_RELEASE_CHALLENGE',
        decision: 'CREATED',
        challengeId,
        buildProvenanceId,
        buildPayloadDigest: signedBuild.payloadDigest,
        environment: RUNTIME_ENVIRONMENT,
        generation: 1,
        activationDatabaseRole: activationRoleName,
        coordinatorRoleName: activationRoleName,
        coordinatorRoleOid: activationRoleOid,
      });

      const anchorAfterChallenge = await readRuntimeInstanceAnchor(owner);
      expect(anchorAfterChallenge).toMatchObject({
        anchor_count: 1,
        relpersistence: 'u',
      });
      expect(anchorAfterChallenge.anchor_nonce).toMatch(/^[0-9a-f]{64}$/u);
      for (const mutation of [
        `UPDATE public."SharedBetaRuntimeInstanceAnchor"
         SET "anchorNonce" = "anchorNonce"`,
        `DELETE FROM public."SharedBetaRuntimeInstanceAnchor"`,
        `TRUNCATE TABLE public."SharedBetaRuntimeInstanceAnchor"`,
      ]) {
        await expectSqlState(owner.$executeRawUnsafe(mutation), '55000');
      }
      expect(await readRuntimeInstanceAnchor(owner)).toEqual(
        anchorAfterChallenge,
      );

      await expectSqlState(
        owner.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL session_replication_role = 'replica'`,
          );
          const removed = await tx.$executeRawUnsafe(
            `DELETE FROM public."SharedBetaRuntimeInstanceAnchor"`,
          );
          expect(removed).toBe(1);
          await createChallenge(
            tx,
            challengeId,
            buildProvenanceId,
            activationRoleName,
            challengeValidUntil,
          );
        }),
        '55000',
      );
      expect(await readRuntimeInstanceAnchor(owner)).toEqual(
        anchorAfterChallenge,
      );

      const markerId = randomUUID();
      const deployedAt = exactTime();
      const markerValidUntil = exactTime(2 * 60 * 60 * 1_000);
      const deploymentPayload = {
        activationDatabaseRole: activationRoleName,
        actualContextDigest: challengeReceipt.actualContextDigest,
        buildPayloadDigest: signedBuild.payloadDigest,
        buildProvenanceId,
        contract: 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
        coordinatorRoleName: activationRoleName,
        coordinatorRoleOid: activationRoleOid,
        databaseChallengeDigest: challengeReceipt.databaseChallengeDigest,
        databaseIdentityDigest: challengeReceipt.databaseIdentityDigest,
        deployedAtEpochMs: deployedAt.valueOf(),
        deploymentInstanceDigest: 'f'.repeat(64),
        deploymentMarkerId: markerId,
        environment: RUNTIME_ENVIRONMENT,
        generation: 1,
        kind: 'LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE',
        predecessorMarkerDigest: challengeReceipt.predecessorMarkerDigest,
        profile: 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
        publicKeyFingerprint: deploymentAuthority.publicKeyFingerprint,
        purpose: 'SHARED_BETA_DEPLOYMENT_PROVENANCE',
        schemaVersion: 1,
        signingKeyId: deploymentAuthority.keyId,
        validUntilEpochMs: markerValidUntil.valueOf(),
      };
      const signedDeployment = signPayload(
        deploymentPayload,
        deploymentAuthority,
      );
      await assertDatabaseCanonicalDigest(
        owner,
        deploymentPayload,
        signedDeployment.payloadDigest,
      );
      const markerReceipt = await persistMarker(owner, signedDeployment);
      expect(markerReceipt).toEqual({
        schemaVersion: 1,
        operation: 'PERSIST_SHARED_BETA_DEPLOYMENT_MARKER',
        decision: 'CREATED',
        deploymentMarkerId: markerId,
        buildProvenanceId,
        payloadDigest: signedDeployment.payloadDigest,
        generation: 1,
        stateRevision: 1,
      });
      await expect(persistMarker(owner, signedDeployment)).resolves.toEqual({
        ...markerReceipt,
        decision: 'REPLAYED',
      });

      const admissionAuthority = syntheticAuthority(
        'activation-pg-admission-v1',
      );
      const admissionApprovedAt = exactTime();
      const admissionValidUntil = exactTime(60 * 60 * 1_000);
      const gateValidUntil = exactTime(90 * 60 * 1_000);
      const gateIds = new Map<(typeof GATE_CODES)[number], string>();
      for (const gateCode of GATE_CODES) {
        const attestationId = randomUUID();
        gateIds.set(gateCode, attestationId);
        const gatePayload = {
          artifactDigest: ARTIFACT_DIGEST,
          contractVersion: 'RELEASE_GATE_ATTESTATION_V1',
          environment: RUNTIME_ENVIRONMENT,
          gateCode,
          kind: 'LEETPLUS_SHARED_BETA_RELEASE_GATE_ATTESTATION',
          migrationCount: migrationState.migrationCount,
          passedAtEpochMs: admissionApprovedAt.valueOf() - 1_000,
          policyManifestDigest: POLICY_MANIFEST_DIGEST,
          profile: 'SHARED_BETA_ADMISSION_V1',
          provenanceKeyVersion: 'activation-pg-admission-v1',
          publicKeyFingerprint: admissionAuthority.publicKeyFingerprint,
          purpose: 'SHARED_BETA_TENANT_ADMISSION',
          releaseSha: RELEASE_SHA,
          schemaHead: migrationState.schemaHead,
          schemaVersion: 1,
          signingKeyId: admissionAuthority.keyId,
          validUntilEpochMs: gateValidUntil.valueOf(),
        };
        const gateReceipt = await persistGate(
          owner,
          attestationId,
          signPayload(gatePayload, admissionAuthority),
        );
        expect(gateReceipt).toMatchObject({
          decision: 'CREATED',
          attestationId,
          gateCode,
          stateRevision: 1,
          revoked: false,
        });
      }

      const gateSetDigest = await readGateSetDigest(owner, [
        ...gateIds.values(),
      ]);
      const decisionId = randomUUID();
      const decisionRequestId = randomUUID();
      const decisionPayload = {
        approvalReferenceDigest: '1'.repeat(64),
        approvedAtEpochMs: admissionApprovedAt.valueOf(),
        approvedByUserId: actor.id,
        artifactDigest: ARTIFACT_DIGEST,
        contractVersion: 'TENANT_ADMISSION_DECISION_V1',
        databaseIdentityDigest: challengeReceipt.databaseIdentityDigest,
        decision: 'GO',
        decisionId,
        environment: RUNTIME_ENVIRONMENT,
        expectedClaimRevision: shellContext.reservationClaimRevision,
        expectedEntitlementProfileRevision:
          shellContext.entitlementProfileRevision,
        expectedExecutionRevision: shellContext.executionRevision,
        gateSetDigest,
        gateSetVersion: 'SHARED_BETA_GATE_SET_V1',
        kind: 'LEETPLUS_SHARED_BETA_TENANT_ADMISSION_DECISION',
        migrationCount: migrationState.migrationCount,
        policyManifestDigest: POLICY_MANIFEST_DIGEST,
        profile: 'SHARED_BETA_ADMISSION_V1',
        profileDigest: shellContext.profileDigest,
        publicKeyFingerprint: admissionAuthority.publicKeyFingerprint,
        purpose: 'SHARED_BETA_TENANT_ADMISSION',
        releaseSha: RELEASE_SHA,
        requestDigest: '2'.repeat(64),
        requestId: decisionRequestId,
        reservationSubjectId: shellContext.reservationSubjectId,
        schemaHead: migrationState.schemaHead,
        schemaVersion: 1,
        shellEvidenceDigest: shellContext.actualShellDigest,
        signingKeyId: admissionAuthority.keyId,
        tenantId: shell.tenant.id,
        validUntilEpochMs: admissionValidUntil.valueOf(),
        workflowLocator: shellContext.workflowLocator,
      };
      const decisionReceipt = await persistDecision(
        owner,
        signPayload(decisionPayload, admissionAuthority),
        gateIds,
      );
      expect(decisionReceipt).toEqual({
        schemaVersion: 1,
        operation: 'CREATE_TENANT_ADMISSION_DECISION',
        decision: 'CREATED',
        tenantId: shell.tenant.id,
        decisionId,
        state: 'AVAILABLE',
        stateRevision: 1,
        gateCount: 3,
      });

      await owner.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
         TO "${activationRoleName}"`,
      );
      await expect(
        owner.$queryRawUnsafe(
          `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
             $1,
             $2::BIGINT
           ) AS assertion`,
          activationRoleName,
          activationRoleOid,
        ),
      ).resolves.toEqual([{ assertion: true }]);

      const roleUrl = databaseUrlForRole(
        disposableDatabaseUrl,
        activationRoleName,
        activationRolePassword,
      );
      const bystanderUrl = databaseUrlForRole(
        disposableDatabaseUrl,
        bystanderRoleName,
        bystanderRolePassword,
      );
      activationRoleLeft = prismaFor(roleUrl);
      activationRoleRight = prismaFor(roleUrl);
      bystanderRole = prismaFor(bystanderUrl);
      await Promise.all([
        activationRoleLeft.$connect(),
        activationRoleRight.$connect(),
        bystanderRole.$connect(),
      ]);
      await assertHostileRoleBoundary(
        owner,
        activationRoleLeft,
        activationRoleName,
        markerId,
        shell.tenant.id,
      );

      const activationInput: ActivationInput = {
        activationCommandId: randomUUID(),
        tenantId: shell.tenant.id,
        activationRequestId: randomUUID(),
        activationRequestDigest: '3'.repeat(64),
        decisionId,
        markerId,
        activatedByUserId: actor.id,
        issueRequestId: randomUUID(),
        issueRequestDigest: '4'.repeat(64),
        issueCommandId: randomUUID(),
        inviteId: randomUUID(),
        outboxId: randomUUID(),
        messageKey: randomUUID(),
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        secretCiphertext: randomBytes(71),
        inviteExpiresAt: exactTime(6 * 24 * 60 * 60 * 1_000),
      };

      await installLateActivationAuditFault(owner);
      try {
        await expectSqlState(
          activateWithSerializationRetry(activationRoleLeft, activationInput),
          '55000',
        );
      } finally {
        await removeLateActivationAuditFault(owner);
      }
      await assertActivationRollbackState(owner, activationInput, shellContext);

      const deadlocksBefore = await readDatabaseDeadlockCount(owner);
      const racedReceipts = await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          activateWithSerializationRetry(
            index % 2 === 0 ? activationRoleLeft : activationRoleRight,
            activationInput,
          ),
        ),
      );
      const racedDecisions = racedReceipts.map((receipt) => receipt.decision);
      expect(
        racedDecisions.filter((decision) => decision === 'ACTIVATED'),
      ).toHaveLength(1);
      expect(
        racedDecisions.filter((decision) => decision === 'REPLAYED'),
      ).toHaveLength(99);
      expect(await readDatabaseDeadlockCount(owner)).toBe(deadlocksBefore);
      const activated = racedReceipts.find(
        (receipt) => receipt.decision === 'ACTIVATED',
      );
      if (!activated) {
        throw new Error('Activation race did not create an activation');
      }

      const replayed = await activateWithSerializationRetry(
        activationRoleLeft,
        activationInput,
      );
      expect(replayed).toEqual({
        ...activated,
        decision: 'REPLAYED',
      });

      await assertAtomicActivationState(
        owner,
        activationInput,
        activated,
        signedDeployment.payloadDigest,
        shellContext.actualShellDigest,
      );
      await assertHostileRoleBoundary(
        owner,
        activationRoleRight,
        activationRoleName,
        markerId,
        shell.tenant.id,
      );

      if (!applicationTypeProbe) {
        throw new Error('Application enum/domain type probe is unavailable');
      }
      const qualifiedApplicationType = quoteQualifiedType(applicationTypeProbe);
      for (const grantee of ['PUBLIC', quoteIdentifier(activationRoleName)]) {
        await owner.$executeRawUnsafe(
          `GRANT USAGE ON TYPE ${qualifiedApplicationType} TO ${grantee}`,
        );
        try {
          await expectSqlState(
            owner.$queryRawUnsafe(
              `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
                 $1,
                 $2::BIGINT
               )`,
              activationRoleName,
              activationRoleOid,
            ),
            '42501',
          );
          await expectSqlState(
            activateWithSerializationRetry(activationRoleLeft, activationInput),
            '42501',
          );
        } finally {
          await owner.$executeRawUnsafe(
            `REVOKE USAGE ON TYPE ${qualifiedApplicationType} FROM ${grantee}`,
          );
        }
        await expect(
          owner.$queryRawUnsafe(
            `SELECT public."shared_beta_runtime_activation_role_assert_v1"(
               $1,
               $2::BIGINT
             ) AS assertion`,
            activationRoleName,
            activationRoleOid,
          ),
        ).resolves.toEqual([{ assertion: true }]);
        await expect(
          activateWithSerializationRetry(activationRoleLeft, activationInput),
        ).resolves.toMatchObject({
          decision: 'REPLAYED',
          activationCommandId: activationInput.activationCommandId,
          tenantId: activationInput.tenantId,
        });
      }

      for (const grantee of ['PUBLIC', `"${bystanderRoleName}"`]) {
        await owner.$executeRawUnsafe(
          `GRANT EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
           TO ${grantee}`,
        );
        try {
          await expectSqlState(
            activateWithSerializationRetry(bystanderRole, activationInput),
            '42501',
          );
          await expectSqlState(
            activateWithSerializationRetry(activationRoleLeft, activationInput),
            '42501',
          );
        } finally {
          await owner.$executeRawUnsafe(
            `REVOKE EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
             FROM ${grantee}`,
          );
        }
        await expect(
          activateWithSerializationRetry(activationRoleLeft, activationInput),
        ).resolves.toMatchObject({
          decision: 'REPLAYED',
          activationCommandId: activationInput.activationCommandId,
          tenantId: activationInput.tenantId,
        });
      }

      await Promise.all([
        activationRoleLeft.$disconnect(),
        activationRoleRight.$disconnect(),
      ]);
      await owner.$executeRawUnsafe(
        `REVOKE EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
         FROM "${activationRoleName}"`,
      );
      await maintenance.$executeRawUnsafe(`DROP ROLE "${activationRoleName}"`);
      activationRolePassword = randomBytes(24).toString('hex');
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${activationRoleName}" WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${activationRolePassword}'`,
      );
      const [replacementRole] = await owner.$queryRawUnsafe<
        Array<{ oid: bigint }>
      >(
        `SELECT role.oid::BIGINT AS oid
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = $1`,
        activationRoleName,
      );
      const replacementRoleOid = Number(replacementRole?.oid);
      expect(Number.isSafeInteger(replacementRoleOid)).toBe(true);
      expect(replacementRoleOid).not.toBe(activationRoleOid);
      await owner.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${ACTIVATION_FUNCTION_SIGNATURE}
         TO "${activationRoleName}"`,
      );
      activationRoleLeft = prismaFor(
        databaseUrlForRole(
          disposableDatabaseUrl,
          activationRoleName,
          activationRolePassword,
        ),
      );
      await activationRoleLeft.$connect();
      await expectSqlState(
        activateWithSerializationRetry(activationRoleLeft, activationInput),
        '42501',
      );
    });
  },
);

async function createPlatformAuthority(
  prisma: PrismaClient,
): Promise<AuthenticatedUser> {
  const authorityTenant = await prisma.tenant.create({
    data: {
      name: 'Activation PostgreSQL fixture authority',
      slug: `activation-authority-${randomUUID()}`,
      status: 'ACTIVE',
      customerStage: 'INTERNAL',
      onboardingStatus: 'ACTIVE',
    },
    select: { id: true },
  });
  const authority = await prisma.user.create({
    data: {
      tenantId: authorityTenant.id,
      email: `activation-authority-${randomUUID()}@integration.invalid`,
      passwordHash: 'not-a-login-fixture',
      role: 'OWNER',
      accessScope: 'NETWORK',
      isActive: true,
      isPlatformAdmin: true,
    },
    select: { id: true },
  });
  return {
    id: authority.id,
    isPlatformAdmin: true,
  } as AuthenticatedUser;
}

async function provisionExactTenantShell(
  prisma: PrismaClient,
  actor: AuthenticatedUser,
) {
  const identityBoundary = new IdentityEmailClaimService({
    get: (key: string) => {
      if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY') {
        return FINGERPRINT_KEY;
      }
      if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION') {
        return 'v1';
      }
      return undefined;
    },
  } as ConfigService);
  const service = new SharedTenantProvisioningService(
    prisma as unknown as PrismaService,
    identityBoundary,
  );
  const slug = `activation-pilot-${randomUUID()}`;
  const receipt = await service.provision(actor, {
    confirmation: `PROVISION ${slug}`,
    requestId: randomUUID(),
    reason: 'Exercise atomic shared beta activation on PostgreSQL',
    supportTicket: 'PG-ACTIVATION-176',
    tenantName: `Activation fixture ${slug}`,
    tenantSlug: slug,
    cohortKey: 'shared-beta-activation-pg',
    supportOwnerUserId: actor.id,
    storeName: 'Activation Fixture Store',
    storeTimeZone: 'Asia/Yekaterinburg',
    ownerEmail: `owner-${randomUUID()}@integration.invalid`,
  });
  expect(receipt).toMatchObject({
    ok: true,
    decision: 'SHELL_PROVISIONED',
    replayed: false,
    activationRequired: true,
    tenant: {
      status: 'SUSPENDED',
      customerStage: 'PILOT',
      onboardingStatus: 'PROVISIONING',
      profileRevision: 1,
      executionRevision: 0,
      trialStartsAt: null,
      trialEndsAt: null,
    },
    store: {
      isActive: false,
      gamificationEnabled: false,
      backgroundExecutionEnabled: false,
    },
    ownerIdentity: {
      claimType: 'INVITE',
      claimRevision: 1,
    },
  });
  return receipt;
}

async function readMigrationState(
  prisma: PrismaClient,
): Promise<MigrationState> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ state: MigrationState }>>(
    `SELECT public."shared_beta_runtime_migration_state_v1"()
       AS state`,
  );
  if (!row) {
    throw new Error('Migration state function returned no row');
  }
  return row.state;
}

async function readRuntimeInstanceAnchor(prisma: PrismaClient): Promise<{
  anchor_count: number;
  anchor_nonce: string | null;
  relpersistence: string;
}> {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{
      anchor_count: number;
      anchor_nonce: string | null;
      relpersistence: string;
    }>
  >(
    `SELECT
       (
         SELECT count(*)::INTEGER
         FROM public."SharedBetaRuntimeInstanceAnchor"
       ) AS anchor_count,
       (
         SELECT min("anchorNonce"::TEXT)
         FROM public."SharedBetaRuntimeInstanceAnchor"
       ) AS anchor_nonce,
       relation.relpersistence::TEXT AS relpersistence
     FROM pg_catalog.pg_class AS relation
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relname = 'SharedBetaRuntimeInstanceAnchor'`,
  );
  if (!row) {
    throw new Error('Runtime instance anchor relation is missing');
  }
  return row;
}

async function readShellContext(
  prisma: PrismaClient,
  tenantId: string,
): Promise<ShellContext> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ context: ShellContext }>>(
    `SELECT public."shared_beta_tenant_actual_shell_v1"($1)
       AS context`,
    tenantId,
  );
  if (!row) {
    throw new Error('Tenant shell function returned no row');
  }
  return row.context;
}

function syntheticAuthority(keyId: string): SyntheticAuthority {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyFingerprint = createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  return { keyId, privateKey, publicKey, publicKeyFingerprint };
}

function signPayload(
  payload: Record<string, unknown>,
  authority: SyntheticAuthority,
): SignedPayload {
  const canonicalPayload = canonicalStringify(payload);
  const signature = sign(
    null,
    Buffer.from(canonicalPayload, 'utf8'),
    authority.privateKey,
  );
  expect(
    verify(
      null,
      Buffer.from(canonicalPayload, 'utf8'),
      authority.publicKey,
      signature,
    ),
  ).toBe(true);
  expect(signature).toHaveLength(64);
  const signatureBase64url = signature.toString('base64url');
  expect(signatureBase64url).toHaveLength(86);
  return {
    payload,
    payloadDigest: createHash('sha256')
      .update(canonicalPayload, 'utf8')
      .digest('hex'),
    signature,
    signatureBase64url,
  };
}

async function assertDatabaseCanonicalDigest(
  prisma: PrismaClient,
  payload: Record<string, unknown>,
  expectedDigest: string,
) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ digest: string }>>(
    `SELECT pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           public."shared_beta_runtime_canonical_json_v1"($1::JSONB),
           'UTF8'
         )
       ),
       'hex'
     ) AS digest`,
    JSON.stringify(payload),
  );
  expect(row?.digest).toBe(expectedDigest);
}

async function persistBuild(
  prisma: PrismaClient,
  buildProvenanceId: string,
  signed: SignedPayload,
  overrides: BuildPersistenceOverrides = {},
): Promise<JsonReceipt> {
  const payload = signed.payload;
  const [row] = await prisma.$queryRawUnsafe<Array<{ receipt: JsonReceipt }>>(
    `SELECT public."shared_beta_build_provenance_persist_v1"(
       $1, $2, $3, $4::TIMESTAMPTZ, $5, $6, $7, $8::INTEGER, $9,
       $10, $11, $12::INTEGER, $13, $14::JSONB, $15, $16, $17,
       $18, $19, $20::TIMESTAMPTZ
    ) AS receipt`,
    buildProvenanceId,
    overrides.releaseSha ?? payload.releaseSha,
    overrides.buildTime ?? payload.buildTime,
    overrides.builtAt ?? new Date(payload.builtAtEpochMs as number),
    overrides.artifactContentDigest ?? payload.artifactContentDigest,
    overrides.releaseManifestDigest ?? payload.releaseManifestDigest,
    overrides.schemaHead ?? payload.schemaHead,
    overrides.migrationCount ?? payload.migrationCount,
    overrides.migrationManifestDigest ?? payload.migrationManifestDigest,
    overrides.policyManifestDigest ?? payload.policyManifestDigest,
    payload.trialPolicyVersion,
    overrides.trialDurationSeconds ?? payload.trialDurationSeconds,
    overrides.buildReferenceDigest ?? payload.buildReferenceDigest,
    JSON.stringify(payload),
    signed.payloadDigest,
    'Ed25519',
    overrides.signingKeyId ?? payload.signingKeyId,
    overrides.publicKeyFingerprint ?? payload.publicKeyFingerprint,
    overrides.signatureBase64url ?? signed.signatureBase64url,
    overrides.validUntil ?? new Date(payload.validUntilEpochMs as number),
  );
  if (!row) {
    throw new Error('Build persistence returned no row');
  }
  return row.receipt;
}

async function createChallenge(
  prisma: PrismaClient | Prisma.TransactionClient,
  challengeId: string,
  buildProvenanceId: string,
  roleName: string,
  validUntil: Date,
): Promise<JsonReceipt> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ receipt: JsonReceipt }>>(
    `SELECT public."shared_beta_runtime_release_challenge_create_v1"(
       $1, $2, $3, $4, $5::TIMESTAMPTZ
     ) AS receipt`,
    challengeId,
    buildProvenanceId,
    RUNTIME_ENVIRONMENT,
    roleName,
    validUntil,
  );
  if (!row) {
    throw new Error('Runtime release challenge returned no row');
  }
  return row.receipt;
}

async function persistMarker(
  prisma: PrismaClient,
  signed: SignedPayload,
): Promise<JsonReceipt> {
  const payload = signed.payload;
  const [row] = await prisma.$queryRawUnsafe<Array<{ receipt: JsonReceipt }>>(
    `SELECT public."shared_beta_runtime_release_marker_persist_v1"(
       $1, $2, $3, $4, $5, $6, $7, $8, $9::BIGINT, $10, $11, $12,
       $13::BIGINT, $14::TIMESTAMPTZ, $15::JSONB, $16, $17, $18, $19,
       $20, $21::TIMESTAMPTZ
     ) AS receipt`,
    payload.deploymentMarkerId,
    payload.buildProvenanceId,
    payload.buildPayloadDigest,
    payload.environment,
    payload.databaseIdentityDigest,
    payload.databaseChallengeDigest,
    payload.actualContextDigest,
    payload.deploymentInstanceDigest,
    payload.generation,
    payload.predecessorMarkerDigest,
    payload.activationDatabaseRole,
    payload.coordinatorRoleName,
    payload.coordinatorRoleOid,
    new Date(payload.deployedAtEpochMs as number),
    JSON.stringify(payload),
    signed.payloadDigest,
    'Ed25519',
    payload.signingKeyId,
    payload.publicKeyFingerprint,
    signed.signatureBase64url,
    new Date(payload.validUntilEpochMs as number),
  );
  if (!row) {
    throw new Error('Deployment marker persistence returned no row');
  }
  return row.receipt;
}

async function persistGate(
  prisma: PrismaClient,
  attestationId: string,
  signed: SignedPayload,
): Promise<JsonReceipt> {
  const payload = signed.payload;
  const [row] = await prisma.$queryRawUnsafe<Array<{ receipt: JsonReceipt }>>(
    `SELECT public."shared_beta_release_gate_attestation_persist_v1"(
       $1, $2::public."SharedBetaReleaseGateCode", $3, $4, $5, $6,
       $7::INTEGER, $8, $9::JSONB, $10, $11, $12, $13, $14::BYTEA,
       $15::TIMESTAMPTZ, $16::TIMESTAMPTZ
     ) AS receipt`,
    attestationId,
    payload.gateCode,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    JSON.stringify(payload),
    signed.payloadDigest,
    payload.signingKeyId,
    payload.provenanceKeyVersion,
    payload.publicKeyFingerprint,
    signed.signature,
    new Date(payload.passedAtEpochMs as number),
    new Date(payload.validUntilEpochMs as number),
  );
  if (!row) {
    throw new Error('Release gate persistence returned no row');
  }
  return row.receipt;
}

async function readGateSetDigest(
  prisma: PrismaClient,
  attestationIds: string[],
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ digest: string }>>(
    `SELECT pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'leetplus-shared-beta-gate-set-v1',
           'UTF8'
         )
         || '\\x00'::BYTEA
         || pg_catalog.convert_to(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'gateCode', attestation."gateCode"::TEXT,
               'attestationId', attestation."id",
               'payloadDigest', attestation."payloadDigest"
             )
             ORDER BY attestation."gateCode"::TEXT
           )::TEXT,
           'UTF8'
         )
       ),
       'hex'
     ) AS digest
     FROM public."ReleaseGateAttestation" AS attestation
     WHERE attestation."id" = ANY($1::TEXT[])`,
    attestationIds,
  );
  if (!row?.digest) {
    throw new Error('Gate set digest returned no row');
  }
  return row.digest;
}

async function persistDecision(
  prisma: PrismaClient,
  signed: SignedPayload,
  gateIds: Map<(typeof GATE_CODES)[number], string>,
): Promise<JsonReceipt> {
  const payload = signed.payload;
  const [row] = await prisma.$queryRawUnsafe<Array<{ receipt: JsonReceipt }>>(
    `SELECT public."shared_beta_tenant_admission_decision_create_v1"(
       $1, $2, $3, $4, $5, $6, $7::INTEGER, $8, $9, $10, $11, $12,
       $13::INTEGER, $14, $15, $16::INTEGER, $17::INTEGER, $18, $19,
       $20, $21, $22::JSONB, $23, $24, $25, $26::BYTEA,
       $27::TIMESTAMPTZ, $28::TIMESTAMPTZ, $29, $30, $31
     ) AS receipt`,
    payload.decisionId,
    payload.tenantId,
    payload.requestId,
    payload.requestDigest,
    payload.workflowLocator,
    payload.reservationSubjectId,
    payload.expectedClaimRevision,
    payload.shellEvidenceDigest,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    payload.databaseIdentityDigest,
    payload.expectedEntitlementProfileRevision,
    payload.expectedExecutionRevision,
    payload.profileDigest,
    payload.gateSetDigest,
    payload.approvedByUserId,
    payload.approvalReferenceDigest,
    JSON.stringify(payload),
    signed.payloadDigest,
    payload.signingKeyId,
    payload.publicKeyFingerprint,
    signed.signature,
    new Date(payload.approvedAtEpochMs as number),
    new Date(payload.validUntilEpochMs as number),
    gateIds.get('MODULE_POLICY_ENFORCED'),
    gateIds.get('EMAIL_INVITE_WORKFLOW_VERIFIED'),
    gateIds.get('POSTGRESQL_RELEASE_REHEARSAL_VERIFIED'),
  );
  if (!row) {
    throw new Error('Admission decision persistence returned no row');
  }
  return row.receipt;
}

async function activateWithSerializationRetry(
  prisma: PrismaClient,
  input: ActivationInput,
): Promise<JsonReceipt> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
          const [row] = await tx.$queryRawUnsafe<
            Array<{ receipt: JsonReceipt }>
          >(
            `SELECT public."shared_beta_tenant_activate_v1"(
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15::BYTEA, $16::TIMESTAMPTZ
             ) AS receipt`,
            input.activationCommandId,
            input.tenantId,
            input.activationRequestId,
            input.activationRequestDigest,
            input.decisionId,
            input.markerId,
            input.activatedByUserId,
            input.issueRequestId,
            input.issueRequestDigest,
            input.issueCommandId,
            input.inviteId,
            input.outboxId,
            input.messageKey,
            input.tokenHash,
            input.secretCiphertext,
            input.inviteExpiresAt,
          );
          if (!row) {
            throw new Error('Activation coordinator returned no row');
          }
          return row.receipt;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 30_000,
          timeout: 25_000,
        },
      );
    } catch (error) {
      if (attempt === 5 || !isActivationContention(error)) {
        throw error;
      }
    }
  }
  throw new Error('Activation serialization retry loop exhausted');
}

async function installLateActivationAuditFault(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const [existing] = await tx.$queryRawUnsafe<
      Array<{ function_exists: boolean; trigger_count: number }>
    >(
      `SELECT
         to_regprocedure($1) IS NOT NULL AS function_exists,
         (
           SELECT count(*)::INTEGER
           FROM pg_catalog.pg_trigger AS trigger
           WHERE trigger.tgrelid =
               'public."PlatformAdminAuditEvent"'::REGCLASS
             AND trigger.tgname = $2
             AND NOT trigger.tgisinternal
         ) AS trigger_count`,
      LATE_FAULT_FUNCTION_SIGNATURE,
      LATE_FAULT_TRIGGER,
    );
    expect(existing).toEqual({
      function_exists: false,
      trigger_count: 0,
    });
    await tx.$executeRawUnsafe(
      `CREATE FUNCTION ${LATE_FAULT_FUNCTION_SIGNATURE}
       RETURNS TRIGGER
       LANGUAGE plpgsql
       SECURITY INVOKER
       SET search_path = pg_catalog
       AS $late_fault$
       BEGIN
         IF NEW."action" = 'SHARED_BETA_TENANT_ACTIVATED' THEN
           RAISE EXCEPTION 'Injected late activation audit failure'
             USING ERRCODE = '55000';
         END IF;
         RETURN NEW;
       END;
       $late_fault$`,
    );
    await tx.$executeRawUnsafe(
      `REVOKE ALL
       ON FUNCTION ${LATE_FAULT_FUNCTION_SIGNATURE}
       FROM PUBLIC`,
    );
    await tx.$executeRawUnsafe(
      `CREATE TRIGGER "${LATE_FAULT_TRIGGER}"
       BEFORE INSERT ON public."PlatformAdminAuditEvent"
       FOR EACH ROW
       EXECUTE FUNCTION ${LATE_FAULT_FUNCTION_SIGNATURE}`,
    );
  });
}

async function removeLateActivationAuditFault(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${LATE_FAULT_TRIGGER}"
       ON public."PlatformAdminAuditEvent"`,
    );
    await tx.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS ${LATE_FAULT_FUNCTION_SIGNATURE}`,
    );
  });
  const [residue] = await prisma.$queryRawUnsafe<
    Array<{ function_exists: boolean; trigger_count: number }>
  >(
    `SELECT
       to_regprocedure($1) IS NOT NULL AS function_exists,
       (
         SELECT count(*)::INTEGER
         FROM pg_catalog.pg_trigger AS trigger
         WHERE trigger.tgrelid =
             'public."PlatformAdminAuditEvent"'::REGCLASS
           AND trigger.tgname = $2
           AND NOT trigger.tgisinternal
       ) AS trigger_count`,
    LATE_FAULT_FUNCTION_SIGNATURE,
    LATE_FAULT_TRIGGER,
  );
  expect(residue).toEqual({
    function_exists: false,
    trigger_count: 0,
  });
}

async function assertActivationRollbackState(
  prisma: PrismaClient,
  input: ActivationInput,
  originalShell: ShellContext,
) {
  const [tenant, store, decision, claim, counts, shellAfterFault] =
    await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } }),
      prisma.store.findFirstOrThrow({ where: { tenantId: input.tenantId } }),
      prisma.tenantAdmissionDecision.findUniqueOrThrow({
        where: { id: input.decisionId },
      }),
      prisma.identityEmailClaim.findFirstOrThrow({
        where: {
          tenantId: input.tenantId,
          workflowLocator: originalShell.workflowLocator,
        },
      }),
      prisma.$queryRawUnsafe<
        Array<{
          activation_audits: number;
          activation_commands: number;
          invites: number;
          issue_audits: number;
          issue_commands: number;
          outbox_rows: number;
          tenant_users: number;
        }>
      >(
        `SELECT
           (
             SELECT count(*)::INTEGER
             FROM public."SharedBetaTenantActivationCommand"
             WHERE "tenantId" = $1
           ) AS activation_commands,
           (
             SELECT count(*)::INTEGER
             FROM public."PlatformAdminAuditEvent"
             WHERE "tenantId" = $1
               AND "action" = 'SHARED_BETA_TENANT_ACTIVATED'
           ) AS activation_audits,
           (
             SELECT count(*)::INTEGER
             FROM public."IdentityOwnerInviteIssueCommand"
             WHERE "tenantId" = $1
           ) AS issue_commands,
           (
             SELECT count(*)::INTEGER
             FROM public."PlatformAdminAuditEvent"
             WHERE "tenantId" = $1
               AND "action" = 'ISSUE_INITIAL_OWNER_INVITE'
           ) AS issue_audits,
           (
             SELECT count(*)::INTEGER
             FROM public."UserInvite"
             WHERE "tenantId" = $1
           ) AS invites,
           (
             SELECT count(*)::INTEGER
             FROM public."IdentityMailOutbox"
             WHERE "tenantId" = $1
           ) AS outbox_rows,
           (
             SELECT count(*)::INTEGER
             FROM public."User"
             WHERE "tenantId" = $1
           ) AS tenant_users`,
        input.tenantId,
      ),
      readShellContext(prisma, input.tenantId),
    ]);

  expect(tenant).toMatchObject({
    status: 'SUSPENDED',
    customerStage: 'PILOT',
    onboardingStatus: 'PROVISIONING',
    entitlementProfileRevision: 1,
    executionRevision: 0,
    trialStartsAt: null,
    trialEndsAt: null,
  });
  expect(store).toMatchObject({
    isActive: false,
    gamificationEnabled: false,
    backgroundExecutionEnabled: false,
    executionRevision: 0,
  });
  expect(decision).toMatchObject({
    stateRevision: 1,
    revokedAt: null,
    revocationReasonDigest: null,
    consumedAt: null,
  });
  expect(claim).toMatchObject({
    tenantId: input.tenantId,
    subjectId: originalShell.reservationSubjectId,
    workflowLocator: originalShell.workflowLocator,
    revision: originalShell.reservationClaimRevision,
  });
  expect(counts).toEqual([
    {
      activation_commands: 0,
      activation_audits: 0,
      issue_commands: 0,
      issue_audits: 0,
      invites: 0,
      outbox_rows: 0,
      tenant_users: 0,
    },
  ]);
  expect(shellAfterFault).toEqual(originalShell);
}

async function readDatabaseDeadlockCount(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<{ deadlocks: bigint }>>(Prisma.sql`
    SELECT deadlocks
    FROM pg_catalog.pg_stat_database
    WHERE datname = pg_catalog.current_database()
  `);
  if (!row) {
    throw new Error('Current database statistics are unavailable');
  }
  return row.deadlocks;
}

async function assertHostileRoleBoundary(
  owner: PrismaClient,
  role: PrismaClient,
  roleName: string,
  markerId: string,
  tenantId: string,
) {
  const [acl] = await owner.$queryRawUnsafe<
    Array<{
      coordinator_execute: boolean;
      context_execute: boolean;
      shell_execute: boolean;
      tenant_select: boolean;
      tenant_update: boolean;
    }>
  >(
    `SELECT
       pg_catalog.has_function_privilege(
         $1,
         $2,
         'EXECUTE'
       ) AS coordinator_execute,
       pg_catalog.has_function_privilege(
         $1,
         'public."shared_beta_runtime_actual_context_assert_v1"(text)',
         'EXECUTE'
       ) AS context_execute,
       pg_catalog.has_function_privilege(
         $1,
         'public."shared_beta_tenant_actual_shell_v1"(text)',
         'EXECUTE'
       ) AS shell_execute,
       pg_catalog.has_table_privilege(
         $1,
         'public."Tenant"',
         'SELECT'
       ) AS tenant_select,
       pg_catalog.has_table_privilege(
         $1,
         'public."Tenant"',
         'UPDATE'
       ) AS tenant_update`,
    roleName,
    ACTIVATION_FUNCTION_SIGNATURE,
  );
  expect(acl).toEqual({
    coordinator_execute: true,
    context_execute: false,
    shell_execute: false,
    tenant_select: false,
    tenant_update: false,
  });

  await expect(
    role.$queryRawUnsafe(`SELECT * FROM public."Tenant" LIMIT 1`),
  ).rejects.toThrow();
  await expect(
    role.$executeRawUnsafe(
      `UPDATE public."Tenant" SET "name" = "name" WHERE "id" = $1`,
      tenantId,
    ),
  ).rejects.toThrow();
  await expect(
    role.$queryRawUnsafe(
      `SELECT public."shared_beta_runtime_actual_context_assert_v1"($1)`,
      markerId,
    ),
  ).rejects.toThrow();
  await expect(
    role.$queryRawUnsafe(
      `SELECT public."shared_beta_tenant_actual_shell_v1"($1)`,
      tenantId,
    ),
  ).rejects.toThrow();
}

async function assertAtomicActivationState(
  prisma: PrismaClient,
  input: ActivationInput,
  receipt: JsonReceipt,
  markerPayloadDigest: string,
  actualShellDigest: string,
) {
  const [
    tenant,
    store,
    decision,
    invite,
    outbox,
    issue,
    command,
    audit,
    releaseEvents,
    counts,
  ] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } }),
    prisma.store.findFirstOrThrow({ where: { tenantId: input.tenantId } }),
    prisma.tenantAdmissionDecision.findUniqueOrThrow({
      where: { id: input.decisionId },
    }),
    prisma.userInvite.findUniqueOrThrow({ where: { id: input.inviteId } }),
    prisma.identityMailOutbox.findUniqueOrThrow({
      where: { id: input.outboxId },
    }),
    prisma.identityOwnerInviteIssueCommand.findUniqueOrThrow({
      where: { id: input.issueCommandId },
    }),
    prisma.sharedBetaTenantActivationCommand.findUniqueOrThrow({
      where: { id: input.activationCommandId },
    }),
    prisma.platformAdminAuditEvent.findUniqueOrThrow({
      where: { id: input.activationCommandId },
    }),
    prisma.identityMailDeliveryEvent.findMany({
      where: { outboxId: input.outboxId },
      orderBy: { transitionRevision: 'asc' },
    }),
    prisma.$queryRawUnsafe<
      Array<{
        activation_commands: number;
        activation_audits: number;
        tenant_users: number;
        pending_outbox: number;
      }>
    >(
      `SELECT
         (
           SELECT count(*)::INTEGER
           FROM public."SharedBetaTenantActivationCommand"
           WHERE "tenantId" = $1
         ) AS activation_commands,
         (
           SELECT count(*)::INTEGER
           FROM public."PlatformAdminAuditEvent"
           WHERE "tenantId" = $1
             AND "action" = 'SHARED_BETA_TENANT_ACTIVATED'
         ) AS activation_audits,
         (
           SELECT count(*)::INTEGER
           FROM public."User"
           WHERE "tenantId" = $1
         ) AS tenant_users,
         (
           SELECT count(*)::INTEGER
           FROM public."IdentityMailOutbox"
           WHERE "tenantId" = $1
             AND "status" = 'PENDING'
         ) AS pending_outbox`,
      input.tenantId,
    ),
  ]);

  expect(tenant).toMatchObject({
    status: 'ACTIVE',
    customerStage: 'PILOT',
    onboardingStatus: 'OWNER_INVITED',
    entitlementProfileRevision: 1,
    executionRevision: 1,
  });
  expect(tenant.trialStartsAt).not.toBeNull();
  expect(tenant.trialEndsAt?.valueOf()).toBe(
    (tenant.trialStartsAt?.valueOf() ?? 0) + TRIAL_DURATION_SECONDS * 1_000,
  );
  expect(store).toMatchObject({
    isActive: false,
    gamificationEnabled: false,
    backgroundExecutionEnabled: false,
    executionRevision: 0,
  });
  expect(decision).toMatchObject({
    stateRevision: 2,
    revokedAt: null,
    revocationReasonDigest: null,
  });
  expect(decision.consumedAt?.valueOf()).toBe(tenant.trialStartsAt?.valueOf());
  expect(invite).toMatchObject({
    tenantId: input.tenantId,
    role: 'OWNER',
    accessScope: 'NETWORK',
    storeIds: [],
    tokenHash: input.tokenHash,
    identityClaimRevision: 2,
    acceptedAt: null,
    revokedAt: null,
  });
  expect(outbox).toMatchObject({
    tenantId: input.tenantId,
    issueCommandId: input.issueCommandId,
    inviteId: input.inviteId,
    status: 'PENDING',
    tokenHash: input.tokenHash,
    attempts: 0,
    leaseVersion: 0,
    transitionRevision: 1n,
  });
  expect(outbox.releasedAt?.valueOf()).toBe(tenant.trialStartsAt?.valueOf());
  expect(outbox.availableAt?.valueOf()).toBe(tenant.trialStartsAt?.valueOf());
  expect(outbox.updatedAt.valueOf()).toBe(tenant.trialStartsAt?.valueOf());
  expect(Buffer.from(outbox.secretCiphertext)).toEqual(input.secretCiphertext);
  expect(releaseEvents).toHaveLength(1);
  expect(releaseEvents[0]).toMatchObject({
    tenantId: input.tenantId,
    outboxId: input.outboxId,
    inviteId: input.inviteId,
    transitionRevision: 1n,
    leaseVersion: 0,
    attemptNumber: 0,
    eventType: 'RELEASED',
    fromStatus: 'HOLD',
    toStatus: 'PENDING',
    stateReasonCode: null,
  });
  expect(issue).toMatchObject({
    id: input.issueCommandId,
    tenantId: input.tenantId,
    requestId: input.issueRequestId,
    issueRequestDigest: input.issueRequestDigest,
    inviteId: input.inviteId,
    outboxId: input.outboxId,
    messageKey: input.messageKey,
    tokenHash: input.tokenHash,
    claimRevision: 2,
  });
  expect(command).toMatchObject({
    id: input.activationCommandId,
    tenantId: input.tenantId,
    requestId: input.activationRequestId,
    requestDigest: input.activationRequestDigest,
    decisionId: input.decisionId,
    markerId: input.markerId,
    markerPayloadDigest,
    actualShellDigest,
    reservationClaimRevision: 1,
    issueRequestId: input.issueRequestId,
    issueRequestDigest: input.issueRequestDigest,
    issueCommandId: input.issueCommandId,
    inviteId: input.inviteId,
    outboxId: input.outboxId,
    messageKey: input.messageKey,
    tokenHash: input.tokenHash,
    executionRevisionBefore: 0,
    executionRevisionAfter: 1,
    trialPolicyVersion: 'SHARED_BETA_TRIAL_V1',
    trialDurationSeconds: TRIAL_DURATION_SECONDS,
    receipt,
  });
  expect(command.secretCiphertextDigest).toBe(
    createHash('sha256').update(input.secretCiphertext).digest('hex'),
  );
  expect(command.trialStartsAt.valueOf()).toBe(tenant.trialStartsAt?.valueOf());
  expect(audit).toMatchObject({
    tenantId: input.tenantId,
    actorUserId: input.activatedByUserId,
    requestId: input.activationRequestId,
    action: 'SHARED_BETA_TENANT_ACTIVATED',
    targetType: 'TENANT',
    targetId: input.tenantId,
    reason: null,
    after: receipt,
    metadata: {
      schemaVersion: 1,
      authority: 'SharedBetaTenantActivationCommand',
      activationCommandId: input.activationCommandId,
      markerPayloadDigest,
      actualShellDigest,
      createdTransactionId: command.createdTransactionId,
    },
  });
  expect(counts).toEqual([
    {
      activation_commands: 1,
      activation_audits: 1,
      tenant_users: 0,
      pending_outbox: 1,
    },
  ]);
  expect(receipt).toMatchObject({
    schemaVersion: 1,
    operation: 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
    decision: 'ACTIVATED',
    tenantId: input.tenantId,
    activationCommandId: input.activationCommandId,
    admissionDecisionId: input.decisionId,
    markerId: input.markerId,
    markerGeneration: 1,
    tenantStatus: 'ACTIVE',
    onboardingStatus: 'OWNER_INVITED',
    executionRevision: 1,
    inviteId: input.inviteId,
    outboxId: input.outboxId,
    outboxStatus: 'PENDING',
    createdTransactionId: command.createdTransactionId,
  });
}

function canonicalStringify(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('Unsupported canonical scalar');
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}

function exactTime(offsetMs = 0): Date {
  return new Date(Math.trunc(Date.now() / 1_000) * 1_000 + offsetMs);
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === 'P2034' ||
      (error.code === 'P2010' &&
        typeof error.meta?.code === 'string' &&
        error.meta.code === '40001')
    );
  }
  return (
    error instanceof Error &&
    /\b(?:40001|serialization|write conflict)\b/iu.test(error.message)
  );
}

function isActivationContention(error: unknown): boolean {
  return isSerializationFailure(error) || postgresSqlState(error) === '55P03';
}

async function expectSqlState(
  operation: Promise<unknown>,
  expectedSqlState: string,
) {
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

async function establishDedicatedRoleTypeBaseline(
  owner: PrismaClient,
  roleName: string,
): Promise<PublicTypeUsageGrant[]> {
  assertDisposableRoleName(roleName);
  const grants = await owner.$queryRawUnsafe<PublicTypeUsageGrant[]>(
    `SELECT
       namespace.nspname AS "schemaName",
       type_object.typname AS "typeName",
       grantor.rolname AS "grantorName",
       privilege.is_grantable AS "isGrantable"
     FROM pg_catalog.pg_type AS type_object
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = type_object.typnamespace
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       COALESCE(
         type_object.typacl,
         pg_catalog.acldefault(
           'T'::"char",
           type_object.typowner
         )
       )
     ) AS privilege
     INNER JOIN pg_catalog.pg_roles AS grantor
       ON grantor.oid = privilege.grantor
     WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
       AND type_object.typisdefined
       AND type_object.typtype IN ('d', 'e')
       AND privilege.grantee = 0
       AND privilege.privilege_type = 'USAGE'
     ORDER BY
       namespace.nspname COLLATE "C",
       type_object.typname COLLATE "C",
       grantor.rolname COLLATE "C"`,
  );
  const revoked: PublicTypeUsageGrant[] = [];
  try {
    for (const grant of grants) {
      await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL ROLE ${quoteIdentifier(grant.grantorName)}`,
        );
        await tx.$executeRawUnsafe(
          `REVOKE USAGE
           ON TYPE ${quoteQualifiedType(grant)}
           FROM PUBLIC`,
        );
      });
      revoked.push(grant);
    }

    const [remaining] = await owner.$queryRawUnsafe<
      Array<{ unsafe_type_count: number }>
    >(
      `SELECT count(*)::INTEGER AS unsafe_type_count
       FROM pg_catalog.pg_type AS type_object
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = type_object.typnamespace
       WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
         AND namespace.nspname NOT LIKE 'pg_temp_%'
         AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
         AND type_object.typisdefined
         AND type_object.typtype IN ('d', 'e')
         AND pg_catalog.has_type_privilege(
           $1,
           type_object.oid,
           'USAGE'
         )`,
      roleName,
    );
    if (remaining?.unsafe_type_count !== 0) {
      throw new Error(
        'Failed to remove effective enum/domain USAGE from the dedicated activation role',
      );
    }
    return revoked;
  } catch (error) {
    await restorePublicTypeUsageGrants(owner, revoked);
    throw error;
  }
}

async function restorePublicTypeUsageGrants(
  owner: PrismaClient,
  grants: PublicTypeUsageGrant[],
) {
  for (const grant of [...grants].reverse()) {
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL ROLE ${quoteIdentifier(grant.grantorName)}`,
      );
      await tx.$executeRawUnsafe(
        `GRANT USAGE
         ON TYPE ${quoteQualifiedType(grant)}
         TO PUBLIC${grant.isGrantable ? ' WITH GRANT OPTION' : ''}`,
      );
    });
  }
}

async function readApplicationTypeProbe(
  owner: PrismaClient,
): Promise<ApplicationTypeIdentity> {
  const [probe] = await owner.$queryRawUnsafe<ApplicationTypeIdentity[]>(
    `SELECT
       namespace.nspname AS "schemaName",
       type_object.typname AS "typeName"
     FROM pg_catalog.pg_type AS type_object
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = type_object.typnamespace
     WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
       AND type_object.typisdefined
       AND type_object.typtype IN ('d', 'e')
     ORDER BY
       namespace.nspname COLLATE "C",
       type_object.typname COLLATE "C"
     LIMIT 1`,
  );
  if (!probe) {
    throw new Error('No application enum/domain type exists for ACL probing');
  }
  return probe;
}

async function establishDedicatedRoleDatabaseBaseline(
  maintenance: PrismaClient,
  owner: PrismaClient,
  currentDatabase: string,
): Promise<PublicDatabaseGrant[]> {
  assertDisposableDatabaseName(currentDatabase);
  const connectGrants = await maintenance.$queryRawUnsafe<
    Array<{
      databaseName: string;
      grantorName: string;
      isGrantable: boolean;
    }>
  >(
    `SELECT
       database_record.datname AS "databaseName",
       grantor.rolname AS "grantorName",
       privilege.is_grantable AS "isGrantable"
     FROM pg_catalog.pg_database AS database_record
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       COALESCE(
         database_record.datacl,
         pg_catalog.acldefault(
           'd'::"char",
           database_record.datdba
         )
       )
     ) AS privilege
     INNER JOIN pg_catalog.pg_roles AS grantor
       ON grantor.oid = privilege.grantor
     WHERE database_record.datallowconn
       AND database_record.datname <> $1
       AND privilege.grantee = 0
       AND privilege.privilege_type = 'CONNECT'
     ORDER BY database_record.datname COLLATE "C"`,
    currentDatabase,
  );
  const temporaryGrants = await owner.$queryRawUnsafe<
    Array<{
      databaseName: string;
      grantorName: string;
      isGrantable: boolean;
    }>
  >(
    `SELECT
       database_record.datname AS "databaseName",
       grantor.rolname AS "grantorName",
       privilege.is_grantable AS "isGrantable"
     FROM pg_catalog.pg_database AS database_record
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       COALESCE(
         database_record.datacl,
         pg_catalog.acldefault(
           'd'::"char",
           database_record.datdba
         )
       )
     ) AS privilege
     INNER JOIN pg_catalog.pg_roles AS grantor
       ON grantor.oid = privilege.grantor
     WHERE database_record.datname = pg_catalog.current_database()
       AND privilege.grantee = 0
       AND privilege.privilege_type = 'TEMPORARY'`,
  );
  const planned: PublicDatabaseGrant[] = [
    ...connectGrants.map((grant) => ({
      ...grant,
      privilege: 'CONNECT' as const,
    })),
    ...temporaryGrants.map((grant) => ({
      ...grant,
      privilege: 'TEMPORARY' as const,
    })),
  ];
  const applied: PublicDatabaseGrant[] = [];
  try {
    for (const grant of planned) {
      await maintenance.$executeRawUnsafe(
        `REVOKE ${grant.privilege}
         ON DATABASE ${quoteIdentifier(grant.databaseName)}
         FROM PUBLIC`,
      );
      applied.push(grant);
    }
    return applied;
  } catch (error) {
    await restorePublicDatabaseGrants(maintenance, applied);
    throw error;
  }
}

async function restorePublicDatabaseGrants(
  maintenance: PrismaClient,
  grants: PublicDatabaseGrant[],
) {
  for (const grant of [...grants].reverse()) {
    await maintenance.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL ROLE ${quoteIdentifier(grant.grantorName)}`,
      );
      await tx.$executeRawUnsafe(
        `GRANT ${grant.privilege}
         ON DATABASE ${quoteIdentifier(grant.databaseName)}
         TO PUBLIC${grant.isGrantable ? ' WITH GRANT OPTION' : ''}`,
      );
    });
  }
}

async function acquireClusterScopeLock(prisma: PrismaClient): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
    SELECT pg_catalog.pg_try_advisory_lock(
      pg_catalog.hashtextextended(${CLUSTER_SCOPE_LOCK_DOMAIN}, 176)
    ) AS acquired
  `);
  return row?.acquired === true;
}

async function releaseClusterScopeLock(prisma: PrismaClient): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ released: boolean }>>(Prisma.sql`
    SELECT pg_catalog.pg_advisory_unlock(
      pg_catalog.hashtextextended(${CLUSTER_SCOPE_LOCK_DOMAIN}, 176)
    ) AS released
  `);
  return row?.released === true;
}

function quoteIdentifier(identifier: string): string {
  if (identifier.includes('\u0000')) {
    throw new Error('PostgreSQL identifier contains NUL');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteQualifiedType(typeIdentity: ApplicationTypeIdentity): string {
  return `${quoteIdentifier(typeIdentity.schemaName)}.${quoteIdentifier(
    typeIdentity.typeName,
  )}`;
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

function deployMigrations(databaseUrl: string) {
  deployCanonicalPrismaMigrations(databaseUrl, {
    failureMessage:
      'Failed to deploy migrations into the disposable shared beta activation database',
    timeoutMs: 180_000,
  });
}

function databaseUrlFor(source: URL, databaseName: string): string {
  const target = new URL(source);
  target.pathname = `/${databaseName}`;
  target.searchParams.set('schema', 'public');
  target.searchParams.delete('pgbouncer');
  return target.toString();
}

function databaseUrlForRole(
  databaseUrl: string,
  roleName: string,
  password: string,
): string {
  const target = new URL(databaseUrl);
  target.username = roleName;
  target.password = password;
  target.searchParams.set('connection_limit', '8');
  target.searchParams.set('pool_timeout', '30');
  return target.toString();
}

function clusterScopeLockUrlFor(databaseUrl: string): string {
  const target = new URL(databaseUrl);
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('pool_timeout', '30');
  return target.toString();
}

function assertSafeIntegrationDatabase(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing shared beta activation fixtures when NODE_ENV is production',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for shared beta activation PostgreSQL fixtures',
    );
  }
  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+/u, '').toLowerCase();
  const clusterConfirmation =
    process.env.SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_PG_CLUSTER_CONFIRM;
  if (
    clusterConfirmation !== REQUIRED_CLUSTER_CONFIRMATION ||
    !new Set(['127.0.0.1', 'localhost', '::1']).has(hostname) ||
    databaseName !== REQUIRED_SOURCE_DATABASE ||
    /(?:^|[_-])(prod|production|live)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing shared beta activation fixtures outside the dedicated single-purpose leetplus_ci cluster; this fixture temporarily revokes cluster-wide PUBLIC CONNECT and forced termination can prevent in-process restoration',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string) {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe disposable activation database name');
  }
}

function assertDisposableRoleName(roleName: string) {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing an unsafe disposable activation role name');
  }
}

function assertDisposableBystanderRoleName(roleName: string) {
  if (!DISPOSABLE_BYSTANDER_ROLE_PATTERN.test(roleName)) {
    throw new Error(
      'Refusing an unsafe disposable activation bystander role name',
    );
  }
}
