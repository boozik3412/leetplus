import { Prisma, PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deployIdentityMailCurrent186CandidateStack } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-identity-mail-duty-role-current186-postgres-e2e';
const LOCAL_PINNED_PROFILE = 'local-pinned';
const GITHUB_ACTIONS_CI_PROFILE = 'github-actions-ci';
const acceptanceProfile =
  process.env.IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PG_PROFILE;
const integrationEnabled =
  process.env.IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PG_E2E_CONFIRM ===
    REQUIRED_CONFIRMATION &&
  (acceptanceProfile === LOCAL_PINNED_PROFILE ||
    acceptanceProfile === GITHUB_ACTIONS_CI_PROFILE);
const describePostgres = integrationEnabled ? describe : describe.skip;

const CURRENT185_MIGRATION =
  '20260802030000_identity_mail_enrollment_evidence_ledger_v2';
const CURRENT185_SHA256 =
  '2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6';
const CURRENT180_MIGRATION = '20260804120000_guest_game_max_pending_rewards';
const CURRENT180_SHA256 =
  '40587bc93c34875edf6064f9848e42ce0194b321165ac494750987533cef21ef';
const CURRENT180_MANIFEST_DIGEST =
  '8a763027a16c45532bf1cff84fdaacf27f2c4e834cae15cffd7a15feae63f6dc';
const CURRENT186_MIGRATION =
  '20260803010000_identity_mail_duty_role_runtime_boundary_v2';
// Re-pinned after every accepted candidate-byte revision.
const CURRENT186_SHA256 =
  '83c5df307d60548ffe3b009ec35b2faba5a37b1618d8dd88a1c571ce697d48b4';
const CURRENT186_MANIFEST_DIGEST =
  'cf354d5bb94069978b4b63b35e2fec1464822c682513b5c3c982f63fc472dc8e';
const CURRENT186_DEFINITION_MANIFEST_DIGEST =
  '46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be';
const CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST =
  'ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117';
const CURRENT186_SCOPE = Object.freeze({
  applicationRoleAllowlistBound: false,
  authorityScope: 'CURRENT_DATABASE_ONLY' as const,
  crossDatabaseAuthorityControlled: false,
  futureCreatorDefaultPrivilegesControlled: false,
  productionApplyAuthorized: false,
});
const APPLICATION_CONTRACT =
  'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2';
const SCHEMA_OWNER_ROLE = 'identity_mail_schema_owner';
const COORDINATOR_ROLE = 'identity_mail_enrollment_coordinator';
const WORKER_ROLE = 'identity_mail_worker_v2';
const QUOTED_BYSTANDER_ROLE = 'lp_imtec_current186_bystander_"quoted';
const MEMBERSHIP_PARENT_ROLE = 'lp_imtec_current186_membership_parent';
const MEMBERSHIP_MEMBER_ROLE = 'lp_imtec_current186_membership_member';
const APPLICATION_SCHEMA = 'lp_current186_application_surface';
const APPLICATION_PROCEDURE = 'lp_current186_public_procedure';
const APPLICATION_AGGREGATE = 'lp_current186_public_aggregate';
const APPLICATION_WINDOW = 'lp_current186_public_window';
const APPLICATION_POST_APPLY_FUNCTION =
  'lp_current186_post_apply_user_function';
const OWNERSHIP_FIXTURE_PREFIX = 'lp_imtec_current186_owned';
const PRACTICAL_OWNERSHIP_KINDS = Object.freeze([
  'COLLATION',
  'CONVERSION',
  'FOREIGN_SERVER',
  'LANGUAGE',
  'LARGE_OBJECT',
  'PUBLICATION',
  'STATISTICS',
  'TEXT_SEARCH_CONFIGURATION',
  'TEXT_SEARCH_DICTIONARY',
  'TYPE',
  'USER_MAPPING',
]);
const STATIC_ONLY_OWNERSHIP_COVERAGE = Object.freeze([
  {
    kind: 'DATABASE',
    rationale:
      'Creating another role-owned database is non-transactional cross-database state, explicitly outside the CURRENT_DATABASE_ONLY rehearsal and deferred to CURRENT187.',
  },
  {
    kind: 'EVENT_TRIGGER',
    rationale:
      'PostgreSQL requires every event-trigger owner to remain a superuser, while all three exact duty roles are deliberately NOSUPERUSER.',
  },
  {
    kind: 'FOREIGN_DATA_WRAPPER',
    rationale:
      'PostgreSQL requires every foreign-data-wrapper owner to remain a superuser, while all three exact duty roles are deliberately NOSUPERUSER.',
  },
  {
    kind: 'EXTENSION',
    rationale:
      'Creating an extension executes server-installed extension scripts and cannot be treated as a hermetic ownership-only fixture.',
  },
  {
    kind: 'OPERATOR',
    rationale:
      'A dummy operator adds executable comparison semantics that do not belong in a least-privilege ACL rehearsal.',
  },
  {
    kind: 'OPERATOR_CLASS',
    rationale:
      'A dummy operator class needs access-method-correct operators and support routines, so this hermetic fixture verifies the frozen catalog branch statically.',
  },
  {
    kind: 'OPERATOR_FAMILY',
    rationale:
      'A dummy operator family mutates access-method metadata without adding independent runtime evidence beyond its frozen catalog branch.',
  },
  {
    kind: 'PREPARED_TRANSACTION',
    rationale:
      'Both pinned PostgreSQL profiles keep max_prepared_transactions at zero; changing it requires a cluster restart outside this per-database rehearsal.',
  },
  {
    kind: 'SUBSCRIPTION',
    rationale:
      'A subscription is a cluster-visible provider/background-worker integration and would violate the hermetic no-provider acceptance boundary.',
  },
  {
    kind: 'TABLESPACE',
    rationale:
      'A tablespace fixture requires a dedicated cluster filesystem path and has non-database cleanup semantics outside this disposable-database acceptance boundary.',
  },
]);
const APPLICATION_ROUTINE_NAMES = [
  APPLICATION_AGGREGATE,
  APPLICATION_PROCEDURE,
  APPLICATION_WINDOW,
] as const;
const EXACT_ROLE_NAMES = [
  SCHEMA_OWNER_ROLE,
  COORDINATOR_ROLE,
  WORKER_ROLE,
] as const;
const SCHEMA_OWNER_RELATION_NAMES = [
  'IdentityMailDeliveryTenantEnrollmentCommand',
  'IdentityMailDeliveryTenantEnrollmentEvent',
  'IdentityMailDutyRoleAclEpochV1',
  'IdentityMailDutyRoleManifestEvidenceV2',
  'IdentityMailDutyRoleManifestRevocationV2',
] as const;
const DATABASE_OWNER_RELATION_NAMES = [
  'IdentityEmailClaim',
  'IdentityMailDeliveryEvent',
  'IdentityMailDeliveryTenantEnrollment',
  'IdentityMailOutbox',
  'SharedBetaRuntimeReleaseMarker',
  'Tenant',
  'UserInvite',
  '_prisma_migrations',
] as const;
const PROTECTED_RELATION_NAMES = [
  ...SCHEMA_OWNER_RELATION_NAMES,
  ...DATABASE_OWNER_RELATION_NAMES,
].sort();
const DISPOSABLE_DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const DEPLOYMENT_ROLE_PATTERN = /^lp_imtec_[0-9a-f]{32}_owner$/u;
const DEPLOYMENT_ROLE_PASSWORD_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_HOST = '127.0.0.1';
const LOCAL_PINNED_SOURCE_DATABASE = 'leetplus_current179_ci';
const LOCAL_PINNED_PORT = '55432';
const GITHUB_ACTIONS_CI_SOURCE_DATABASE = 'leetplus_ci';
const GITHUB_ACTIONS_CI_PORT = '5432';
const EXPECTED_DATA_DIRECTORY = resolve(
  __dirname,
  '../../..',
  '.tmp',
  'postgresql16',
  'data',
);
const DRIVER_SIGNATURE =
  'public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)';
const WORKER_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v2"(text,text)',
  'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
  'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
  'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
  'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
] as const;

type RawExecutor = {
  query: (
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<{ rows: unknown[] }>;
};

type ControllerAdapter = RawExecutor & {
  execute: (sql: string) => Promise<void>;
  readCatalog: (expectations: unknown) => Promise<unknown>;
  transaction: <T>(
    callback: (transaction: ControllerAdapter) => Promise<T>,
  ) => Promise<T>;
};

type DeploymentConfig = {
  actualContextDigest: string;
  applicationArtifactSha256: string;
  applicationContract: string;
  applicationReleaseSha: string;
  coordinatorRoleOid: number;
  databaseIdentityDigest: string;
  databaseName: string;
  databaseOid: number;
  deploymentMarkerDigest: string;
  deploymentMarkerId: string;
  deploymentRoleName: string;
  deploymentRoleOid: number;
  definitionManifestDigest: string;
  expectedEpoch: number;
  migrationCount: number;
  migrationHead: string;
  migrationManifestDigest: string;
  operationId: string;
  schemaOwnerRoleOid: number;
  workerRoleOid: number;
};

type ControllerModule = {
  runIdentityMailDutyRoleDeploymentCurrent186: (value: {
    adapter: ControllerAdapter;
    config: DeploymentConfig;
    mode: 'apply' | 'attest' | 'check' | 'emergency' | 'plan' | 'rollback';
    receipt: unknown;
  }) => Promise<unknown>;
};

type CatalogDigests = {
  catalogDigest: string;
  definitionManifestDigest: string;
  exactGrantsDigest: string;
  ownerSurfaceDigest: string;
};

type CatalogModule = {
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL: string;
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE: string;
  IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST: string;
  identityMailDutyRoleCatalogCurrent186ActualDigests: (
    value: unknown,
  ) => CatalogDigests;
  identityMailDutyRoleCatalogCurrent186Digest: (value: unknown) => string;
  identityMailDutyRoleCatalogCurrent186GrantsProjection: (
    value: unknown,
  ) => unknown;
  buildIdentityMailDutyRoleCatalogCurrent186ReadRequest: (
    expectations: unknown,
  ) => { parameters: readonly unknown[] };
  readIdentityMailDutyRoleCatalogCurrent186FromPostgres: (
    executor: RawExecutor,
    expectations: unknown,
  ) => Promise<unknown>;
};

type GrantsModule = {
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE: string;
  identityMailDutyRoleGrantsCurrent185Digest: (value: unknown) => string;
};

type MarkerFixture = {
  actualContextDigest: string;
  databaseIdentityDigest: string;
  id: string;
  payloadDigest: string;
};

type RoleIdentity = {
  name: (typeof EXACT_ROLE_NAMES)[number];
  oid: number;
};

type AuxiliaryRoleIdentity = {
  name: string;
  oid: number;
};

type ReplaceableProtectedIndex = {
  definition: string;
  identity: string;
  name: string;
  relationIdentity: string;
};

type ApplicationAuthoritySurfaceSnapshot = {
  routines: Array<{
    kind: string;
    name: string;
    oid: bigint;
    publicExecute: boolean;
    workerExecute: boolean;
  }>;
  schemas: Array<{
    name: string;
    publicPrivileges: string[];
  }>;
};

type ProtectedAclSurfaceSnapshot = {
  columns: Array<{
    columnAclIsNull: boolean;
    columnName: string;
    columnNumber: number;
    granteeOid: bigint | null;
    grantorOid: bigint | null;
    isGrantable: boolean | null;
    privilege: string | null;
    relationIdentity: string;
    relationOid: bigint;
  }>;
  relations: Array<{
    granteeOid: bigint | null;
    grantorOid: bigint | null;
    isGrantable: boolean | null;
    ownerOid: bigint;
    privilege: string | null;
    relationAclIsNull: boolean;
    relationIdentity: string;
    relationOid: bigint;
  }>;
};

type PublicSchemaOwner = {
  name: string;
  oid: bigint;
};

type FaultInjection = {
  aclLockAcquiredAtEpochMs?: number[];
  aclLockQueryCount?: number;
  afterFirstAclLock?: () => Promise<void>;
  afterFirstZeroRuntimeSessionPoll?: () => Promise<void>;
  committedTransactionResult?: unknown;
  deferFirstAcceptedRuntimeTermination?: boolean;
  epochAppendTelemetry?: Array<{
    beforeCatalogSidecarBytes: number | null;
    outerHasCanonicalBeforeCatalog: boolean;
    outerHasHexBeforeCatalog: boolean;
    outerPayloadBytes: number;
    storageProfile: string | null;
  }>;
  executeCount: number;
  failAtExecute?: number;
  forceFirstRuntimeTerminationFalse?: boolean;
  loseCommittedTransactionResponseAt?: number;
  lostCommittedTransactionResponseCount?: number;
  remainingSessionCounts?: number[];
  replaceEpochSidecarWithJsonNull?: boolean;
  replacedEpochSidecarCount?: number;
  terminationQueryCount?: number;
  transactionCount?: number;
  transactionDurationsMs?: number[];
  zeroRuntimeSessionHookCount?: number;
};

type ExactRoleContainmentState = {
  canLogin: boolean;
  databaseSettingCount: bigint;
  globalSettingCount: bigint;
  membershipCount: bigint;
  name: (typeof EXACT_ROLE_NAMES)[number];
};

type PracticalOwnershipFixture = {
  largeObjectOid: bigint;
  rows: PracticalOwnershipFixtureRow[];
  workerRoleOid: number;
};

type PracticalOwnershipFixtureRow = {
  kind: string;
  objectOid: bigint;
  ownerOid: bigint;
};

type PracticalOwnershipFixtureNames = Record<
  | 'collation'
  | 'conversion'
  | 'foreignDataWrapper'
  | 'foreignServer'
  | 'language'
  | 'publication'
  | 'statistics'
  | 'statisticsSource'
  | 'textSearchConfiguration'
  | 'textSearchDictionary'
  | 'type',
  string
>;

type ApplyReceipt = {
  applicationRoleAllowlistBound: false;
  applyReceiptDigest: string;
  authorization: false;
  authorityScope: 'CURRENT_DATABASE_ONLY';
  beforeCatalog: unknown;
  beforeCatalogDigest: string;
  canMutate: false;
  canSend: false;
  crossDatabaseAuthorityControlled: false;
  decision: string;
  epoch: number;
  futureCreatorDefaultPrivilegesControlled: false;
  operationId: string;
  planDigest: string;
  productionApplyAuthorized: false;
  targetCatalogDigest: string;
  targetExactGrantsDigest: string;
  targetDefinitionManifestDigest: string;
  targetOwnerSurfaceDigest: string;
};

type EpochRow = {
  applyReceiptDigest: string;
  beforeCatalogDigest: string;
  catalogDigest: string;
  definitionManifestDigest: string;
  deploymentRoleName: string;
  deploymentRoleOid: bigint;
  epoch: bigint;
  exactGrantsDigest: string;
  operationId: string;
  ownerSurfaceDigest: string;
  payloadDigest: string;
  planDigest: string;
  reasonCode: string;
};

type OperationRecoverySnapshot = {
  beforeCatalogCanonicalJson: string;
  epoch: bigint;
  operationId: string;
  payloadCanonicalJson: string;
  payloadDigest: string;
  recordedAtEpochMs: bigint;
  recordedTransactionId: string;
};

type EvidenceScenario = 'ENABLE_ABSENT' | 'ROTATE_ACTIVE' | 'DISABLE_ACTIVE';

type EvidenceBundleSummary = {
  authorizationEnvelopeDigest: string;
  commandId: string;
  manifestId: string;
  manifestPayloadDigest: string;
  requestId: string;
  tenantId: string;
};

type EvidenceFixture = {
  bundle: EvidenceBundleSummary;
  bundleCanonicalJson: string;
  bundleDigest: string;
  expiresAt: string;
  reuse?: EvidenceFixture;
};

type EvidenceCommandProvenance = {
  authorizationEnvelopeDigest: string;
  commandId: string;
  manifestId: string;
  manifestPayloadDigest: string;
  requestId: string;
  tenantId: string;
};

type EvidenceManifestProvenance = {
  importedCommandId: string;
  manifestId: string;
  payloadDigest: string;
};

type EvidenceProvenance = {
  commands: EvidenceCommandProvenance[];
  manifests: EvidenceManifestProvenance[];
};

type DriverEvidence = {
  commandId: string;
  expiresAt: string;
  manifestPayloadDigest: string;
  tenantId: string;
  authorizationEnvelopeDigest: string;
};

type DriverTenant = {
  disable: DriverEvidence;
  outboxId: string;
  providerAuthorityDigest: string;
  reusedDisable?: DriverEvidence;
  status: 'HOLD' | 'PENDING';
  tenantId: string;
};

type WorkerDeliveryLifecycle = {
  actorDigest: string;
  claim: Record<string, unknown>;
  complete: Record<string, unknown>;
  completeReplay: Record<string, unknown>;
  evidenceDigest: string;
  leaseOwnerDigest: string;
  leaseTokenDigest: string;
  providerMark: Record<string, unknown>;
  providerMarkReplay: Record<string, unknown>;
};

type PrivilegeSnapshot = {
  canConnect: boolean;
  canCreateDatabaseObjects: boolean;
  canCreateSchemaObjects: boolean;
  canTemporary: boolean;
  columnPrivilegeCount: bigint;
  currentUser: string;
  directTypeAclCount: bigint;
  executableRoutineOids: bigint[] | null;
  relationPrivilegeCount: bigint;
  sequencePrivilegeCount: bigint;
  sessionUser: string;
};

class InjectedControllerFault extends Error {}

class InjectedControllerContractFault extends Error {
  readonly safeContractError = true;
}

jest.setTimeout(300_000);

describePostgres(
  'Identity-mail duty-role CURRENT186 PostgreSQL acceptance',
  () => {
    let maintenance: PrismaClient;
    let source: PrismaClient;
    let admin: PrismaClient;
    let secondaryAdmin: PrismaClient;
    let sourceDatabaseUrl: URL;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let disposableDatabaseCreated = false;
    let databaseOid = 0;
    let deploymentRoleName = '';
    let deploymentRoleOid = 0;
    let marker: MarkerFixture;
    let catalogModule: CatalogModule;
    let controllerModule: ControllerModule;
    let grantsModule: GrantsModule;
    let rolesCreated = false;
    let residuePreflightPassed = false;
    let roleIdentities: RoleIdentity[] = [];
    let auxiliaryRoles: AuxiliaryRoleIdentity[] = [];
    let schemaOwnerRoleOid = 0;
    let coordinatorRoleOid = 0;
    let workerRoleOid = 0;
    let applyReceipt: ApplyReceipt;
    let secondApplyReceipt: ApplyReceipt;
    let liveGrantsProjection: unknown;
    let applicationSurfaceBaseline: ApplicationAuthoritySurfaceSnapshot;
    let applicationSurfaceApplied: ApplicationAuthoritySurfaceSnapshot;
    let protectedAclBaseline: ProtectedAclSurfaceSnapshot;
    let protectedAclApplied: ProtectedAclSurfaceSnapshot;
    let publicSchemaBeforeOwner: PublicSchemaOwner;
    const expectedEvidenceProvenance: EvidenceProvenance = {
      commands: [],
      manifests: [],
    };

    beforeAll(async () => {
      sourceDatabaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_imtec_${randomUUID().replaceAll('-', '')}_ci`;
      assertDisposableDatabaseName(disposableDatabase);

      source = prismaFor(singleConnectionUrl(sourceDatabaseUrl.toString()));
      maintenance = prismaFor(databaseUrlFor(sourceDatabaseUrl, 'postgres'));
      await Promise.all([source.$connect(), maintenance.$connect()]);
      await assertExactCanonicalCurrent180Source(source);
      await assertExactLocalPostgres16(maintenance, sourceDatabaseUrl);
      await assertNoPreexistingResidue(maintenance);
      residuePreflightPassed = true;

      deploymentRoleName = `lp_imtec_${randomUUID().replaceAll('-', '')}_owner`;
      const deploymentRolePassword = `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
      const deploymentRole = await createHermeticDeploymentRole(
        maintenance,
        deploymentRoleName,
        deploymentRolePassword,
      );
      deploymentRoleOid = deploymentRole.oid;
      auxiliaryRoles.push(deploymentRole);

      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" WITH OWNER = ${quotePgIdentifier(deploymentRoleName)} TEMPLATE = template0`,
      );
      disposableDatabaseCreated = true;
      const deploymentDatabaseUrl = new URL(
        databaseUrlFor(sourceDatabaseUrl, disposableDatabase),
      );
      deploymentDatabaseUrl.username = deploymentRoleName;
      deploymentDatabaseUrl.password = deploymentRolePassword;
      disposableDatabaseUrl = deploymentDatabaseUrl.toString();
      deployIdentityMailCurrent186CandidateStack(disposableDatabaseUrl, {
        failureMessage:
          'Failed to deploy CURRENT186 into the disposable duty-role database',
        timeoutMs: 180_000,
      });

      admin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      secondaryAdmin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await Promise.all([admin.$connect(), secondaryAdmin.$connect()]);
      const [database] = await admin.$queryRaw<
        Array<{ oid: bigint; ownerName: string; ownerOid: bigint }>
      >(
        Prisma.sql`
          SELECT
            database_entry.oid::BIGINT AS oid,
            owner_role.rolname AS "ownerName",
            owner_role.oid::BIGINT AS "ownerOid"
          FROM pg_catalog.pg_database AS database_entry
          JOIN pg_catalog.pg_roles AS owner_role
            ON owner_role.oid = database_entry.datdba
          WHERE database_entry.datname = pg_catalog.current_database()
        `,
      );
      if (
        !database ||
        database.oid < 1n ||
        database.oid > 4_294_967_295n ||
        database.ownerOid < 1n ||
        database.ownerOid > 4_294_967_295n ||
        database.ownerName !== deploymentRoleName ||
        database.ownerOid !== BigInt(deploymentRoleOid)
      ) {
        throw new Error(
          'CURRENT186 disposable database owner identity drifted',
        );
      }
      databaseOid = Number(database.oid);

      const modules = await loadCurrent186Modules();
      catalogModule = modules.catalog;
      controllerModule = modules.controller;
      grantsModule = modules.grants;
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      for (const client of [secondaryAdmin, admin]) {
        try {
          await client?.$disconnect();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && disposableDatabaseCreated) {
        try {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
          disposableDatabaseCreated = false;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && auxiliaryRoles.length > 0) {
        try {
          await dropCapturedAuxiliaryRoles(maintenance, auxiliaryRoles);
          auxiliaryRoles = [];
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && rolesCreated) {
        try {
          await dropCapturedExactRoles(maintenance, roleIdentities);
          rolesCreated = false;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && residuePreflightPassed) {
        try {
          await assertNoFinalResidue(maintenance);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (source) {
        try {
          await assertExactCanonicalCurrent180Source(source);
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          await source.$disconnect();
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
          'CURRENT186 PostgreSQL acceptance cleanup failed',
        );
      }
    });

    it('deploys exact CURRENT179 to CURRENT186 while keeping the candidate owner-only', async () => {
      const migrations = await admin.$queryRaw<
        Array<{ checksum: string; migrationName: string }>
      >(Prisma.sql`
        SELECT
          migration."migration_name" AS "migrationName",
          migration."checksum" AS checksum
        FROM public."_prisma_migrations" AS migration
        WHERE migration."finished_at" IS NOT NULL
          AND migration."rolled_back_at" IS NULL
        ORDER BY migration."migration_name" COLLATE "C"
      `);
      expect(migrations).toHaveLength(186);
      expect(migrations.at(-1)).toEqual({
        checksum: CURRENT186_SHA256,
        migrationName: CURRENT186_MIGRATION,
      });
      expect(migrationManifestDigest(migrations)).toBe(
        CURRENT186_MANIFEST_DIGEST,
      );
      expect(current186MigrationSha256()).toBe(CURRENT186_SHA256);

      const precreatedRoles = await maintenance.$queryRaw<
        Array<{ name: string }>
      >(Prisma.sql`
        SELECT role_entry.rolname AS name
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname IN (
          ${Prisma.join(EXACT_ROLE_NAMES)}
        )
      `);
      expect(precreatedRoles).toEqual([]);

      const [surface] = await admin.$queryRaw<
        Array<{
          nonOwnerAclCount: bigint;
          ownerMismatchCount: bigint;
          relationCount: bigint;
          routineCount: bigint;
        }>
      >(Prisma.sql`
        WITH candidate_routines AS (
          SELECT routine.oid, routine.proowner, routine.proacl
          FROM pg_catalog.pg_proc AS routine
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname = 'public'
            AND (
              routine.proname LIKE 'identity_mail_duty_role_acl_%'
              OR routine.proname =
                'identity_mail_tenant_enrollment_drive_command_v2'
            )
        ), candidate_relations AS (
          SELECT relation.oid, relation.relowner, relation.relacl
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'IdentityMailDutyRoleAclEpochV1'
        ), all_objects AS (
          SELECT oid, proowner AS owner_oid, proacl AS acl, 'f'::"char" AS kind
          FROM candidate_routines
          UNION ALL
          SELECT oid, relowner, relacl, 'r'::"char"
          FROM candidate_relations
        )
        SELECT
          (SELECT pg_catalog.count(*)::BIGINT FROM candidate_relations)
            AS "relationCount",
          (SELECT pg_catalog.count(*)::BIGINT FROM candidate_routines)
            AS "routineCount",
          pg_catalog.count(*) FILTER (
            WHERE object.owner_oid <> (
              SELECT database_entry.datdba
              FROM pg_catalog.pg_database AS database_entry
              WHERE database_entry.datname = pg_catalog.current_database()
            )
          )::BIGINT AS "ownerMismatchCount",
          COALESCE(pg_catalog.sum((
            SELECT pg_catalog.count(*)
            FROM pg_catalog.aclexplode(
              COALESCE(
                object.acl,
                pg_catalog.acldefault(object.kind, object.owner_oid)
              )
            ) AS privilege
            WHERE privilege.grantee <> object.owner_oid
          )), 0)::BIGINT AS "nonOwnerAclCount"
        FROM all_objects AS object
      `);
      expect(surface).toEqual({
        nonOwnerAclCount: 0n,
        ownerMismatchCount: 0n,
        relationCount: 1n,
        routineCount: 4n,
      });

      const [sidecarStorage] = await admin.$queryRaw<
        Array<{ storage: string; typeName: string }>
      >(Prisma.sql`
        SELECT
          attribute.attstorage::TEXT AS storage,
          pg_catalog.format_type(
            attribute.atttypid,
            attribute.atttypmod
          ) AS "typeName"
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid =
          'public."IdentityMailDutyRoleAclEpochV1"'::REGCLASS
          AND attribute.attname = 'beforeCatalogCanonicalJson'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      `);
      expect(sidecarStorage).toEqual({ storage: 'x', typeName: 'text' });

      const noEpochEvidence = {
        authorizationEnvelopeDigest: fixtureDigest(
          'current186-no-epoch-authorization',
        ),
        commandId: randomUUID(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        manifestPayloadDigest: fixtureDigest('current186-no-epoch-manifest'),
        tenantId: randomUUID(),
      };
      await expectSqlState(
        driveCommand(
          admin,
          noEpochEvidence,
          Prisma.TransactionIsolationLevel.Serializable,
        ),
        '25001',
      );
      await expectSqlState(driveCommand(admin, noEpochEvidence), '42501');
      const [epoch] = await admin.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT pg_catalog.count(*)::BIGINT AS count
          FROM public."IdentityMailDutyRoleAclEpochV1"
        `,
      );
      expect(epoch?.count).toBe(0n);
    });

    it('pins static ownership branches that cannot safely receive hermetic live fixtures', async () => {
      const catalogSql =
        catalogModule.IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL;
      for (const coverage of STATIC_ONLY_OWNERSHIP_COVERAGE) {
        expect(catalogSql).toContain(`SELECT '${coverage.kind}'`);
        expect(coverage.rationale.length).toBeGreaterThan(80);
      }
      const [clusterBoundary] = await admin.$queryRaw<
        Array<{
          maxPreparedTransactions: number;
          subscriptionCount: bigint;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('max_prepared_transactions')::INTEGER
            AS "maxPreparedTransactions",
          (
            SELECT pg_catalog.count(*)::BIGINT
            FROM pg_catalog.pg_subscription AS subscription_entry
            WHERE subscription_entry.subdbid = (
              SELECT database_entry.oid
              FROM pg_catalog.pg_database AS database_entry
              WHERE database_entry.datname = pg_catalog.current_database()
            )
          ) AS "subscriptionCount"
      `);
      expect(clusterBoundary).toEqual({
        maxPreparedTransactions: 0,
        subscriptionCount: 0n,
      });
    });

    it('creates passwordless exact roles, plans safely and rolls back an injected apply fault with zero diff', async () => {
      roleIdentities = await createExactPasswordlessRoles(maintenance);
      rolesCreated = true;
      schemaOwnerRoleOid = roleOid(roleIdentities, SCHEMA_OWNER_ROLE);
      coordinatorRoleOid = roleOid(roleIdentities, COORDINATOR_ROLE);
      workerRoleOid = roleOid(roleIdentities, WORKER_ROLE);
      marker = {
        actualContextDigest: fixtureDigest('current186-actual-context'),
        databaseIdentityDigest: fixtureDigest(
          `current186-database-${disposableDatabase}-${databaseOid}`,
        ),
        id: randomUUID(),
        payloadDigest: fixtureDigest('current186-release-marker'),
      };
      await insertReleaseMarker(admin, marker, coordinatorRoleOid);
      await admin.$executeRawUnsafe(
        'GRANT SELECT ("payloadDigest") ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC',
      );
      protectedAclBaseline = await readProtectedAclSurface(admin);
      expect(protectedAclBaseline.columns).toContainEqual(
        expect.objectContaining({
          columnName: 'payloadDigest',
          granteeOid: 0n,
          privilege: 'SELECT',
          relationIdentity: 'public."SharedBetaRuntimeReleaseMarker"',
        }),
      );
      publicSchemaBeforeOwner = await readPublicSchemaOwner(admin);
      expect(publicSchemaBeforeOwner).toEqual({
        name: 'pg_database_owner',
        oid: 6171n,
      });
      await createApplicationAuthoritySurface(admin);
      applicationSurfaceBaseline = await readApplicationAuthoritySurface(
        admin,
        workerRoleOid,
      );
      expect(applicationSurfaceBaseline).toEqual({
        routines: [
          expect.objectContaining({
            kind: 'a',
            name: APPLICATION_AGGREGATE,
            publicExecute: true,
            workerExecute: true,
          }),
          expect.objectContaining({
            kind: 'p',
            name: APPLICATION_PROCEDURE,
            publicExecute: true,
            workerExecute: true,
          }),
          expect.objectContaining({
            kind: 'w',
            name: APPLICATION_WINDOW,
            publicExecute: true,
            workerExecute: true,
          }),
        ],
        schemas: [
          { name: APPLICATION_SCHEMA, publicPrivileges: [] },
          {
            name: 'public',
            publicPrivileges: ['CREATE:false', 'USAGE:false'],
          },
        ],
      });

      const diagnosticRequest =
        catalogModule.buildIdentityMailDutyRoleCatalogCurrent186ReadRequest(
          controllerConfig(0),
        );
      const diagnosticContexts = [
        { createHostileShadow: false, searchPath: 'public' },
        { createHostileShadow: false, searchPath: 'pg_catalog' },
        { createHostileShadow: true, searchPath: 'pg_temp, public' },
      ] as const;
      const diagnosticResults = await Promise.all(
        diagnosticContexts.map(({ createHostileShadow, searchPath }) =>
          admin.$transaction(async (transaction) => {
            if (createHostileShadow) {
              await transaction.$executeRawUnsafe(`
                CREATE TEMPORARY TABLE "UserInvite" (
                  "tenantId" TEXT NOT NULL,
                  "id" TEXT NOT NULL
                ) ON COMMIT DROP
              `);
            }
            await transaction.$executeRawUnsafe(
              `SET LOCAL search_path = ${searchPath}`,
            );
            const [beforePath] = await transaction.$queryRawUnsafe<
              Array<{ value: string }>
            >(`SELECT pg_catalog.current_setting('search_path') AS value`);
            const [rawConstraint] = await transaction.$queryRawUnsafe<
              Array<{ definition: string }>
            >(`
              SELECT pg_catalog.pg_get_constraintdef(
                constraint_entry.oid, false
              ) AS definition
              FROM pg_catalog.pg_constraint AS constraint_entry
              WHERE constraint_entry.conrelid =
                  'public."IdentityMailOutbox"'::pg_catalog.regclass
                AND constraint_entry.conname =
                  'IdentityMailOutbox_invite_fkey'
            `);
            const [diagnosticRow] = await transaction.$queryRawUnsafe<
              Array<{ catalog: unknown }>
            >(
              catalogModule.IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
              ...diagnosticRequest.parameters,
            );
            const [afterPath] = await transaction.$queryRawUnsafe<
              Array<{ value: string }>
            >(`SELECT pg_catalog.current_setting('search_path') AS value`);
            return {
              afterPath: afterPath?.value,
              beforePath: beforePath?.value,
              catalog: requireRecord(
                diagnosticRow?.catalog,
                `CURRENT186 ${searchPath} diagnostic catalog`,
              ),
              rawConstraint: rawConstraint?.definition,
              searchPath,
            };
          }),
        ),
      );
      const [publicDiagnostic, pgCatalogDiagnostic, hostileDiagnostic] =
        diagnosticResults;
      expect(
        diagnosticResults.map(({ afterPath, beforePath, searchPath }) => ({
          afterPath,
          beforePath,
          searchPath,
        })),
      ).toEqual(
        diagnosticContexts.map(({ searchPath }) => ({
          afterPath: searchPath,
          beforePath: searchPath,
          searchPath,
        })),
      );
      expect(publicDiagnostic?.rawConstraint).not.toBe(
        hostileDiagnostic?.rawConstraint,
      );
      expect(publicDiagnostic?.rawConstraint).toContain(
        'REFERENCES "UserInvite"',
      );
      expect(hostileDiagnostic?.rawConstraint).toContain(
        'REFERENCES public."UserInvite"',
      );
      expect(pgCatalogDiagnostic?.rawConstraint).toBe(
        hostileDiagnostic?.rawConstraint,
      );
      const definitionManifests = diagnosticResults.map(({ catalog }) => {
        const manifest = catalog.definitionManifest;
        if (!Array.isArray(manifest)) {
          throw new Error('CURRENT186 raw definition manifest is unavailable');
        }
        return manifest as unknown[];
      });
      expect(definitionManifests[1]).toEqual(definitionManifests[0]);
      expect(definitionManifests[2]).toEqual(definitionManifests[0]);
      expect(
        diagnosticResults.map(({ catalog }, index) => ({
          digest: catalog.definitionManifestDigest,
          kinds: Object.fromEntries(
            ['CONSTRAINT', 'INDEX', 'ROUTINE', 'TRIGGER'].map((kind) => [
              kind,
              definitionManifests[index]?.filter(
                (entry) =>
                  requireRecord(entry, 'definition entry').kind === kind,
              ).length,
            ]),
          ),
        })),
      ).toEqual(
        diagnosticContexts.map(() => ({
          digest: CURRENT186_DEFINITION_MANIFEST_DIGEST,
          kinds: { CONSTRAINT: 110, INDEX: 56, ROUTINE: 23, TRIGGER: 21 },
        })),
      );

      const check = requireRecord(
        await runController(
          'check',
          controllerConfig(0),
          controllerAdapter(admin),
        ),
        'CURRENT186 application-authority check',
      );
      expect(requireStringArray(check.findings)).toEqual(
        expect.arrayContaining([
          'DIRECT_AUTHORITY_DRIFT',
          'PUBLIC_ROUTINE_EXECUTE_DRIFT',
        ]),
      );

      const planValue = await runController(
        'plan',
        controllerConfig(0),
        controllerAdapter(admin),
      );
      const planResult = requireRecord(planValue, 'CURRENT186 plan result');
      const plan = requireRecord(planResult.plan, 'CURRENT186 plan');
      expect(planResult).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_PLAN',
        epoch: null,
      });
      expect(
        requireRecord(plan.globalEffects, 'CURRENT186 global effects'),
      ).toMatchObject({
        publicRoutineExecuteRevocationCount: 3,
      });
      expect(requireStringArray(plan.statements).length).toBeGreaterThan(10);
      const beforeDigest = requireString(plan.beforeCatalogDigest);

      const fault: FaultInjection = { executeCount: 0, failAtExecute: 6 };
      await expect(
        runController(
          'apply',
          controllerConfig(0),
          controllerAdapter(admin, fault),
        ),
      ).rejects.toBeInstanceOf(InjectedControllerFault);

      const afterFaultPlan = requireRecord(
        await runController(
          'plan',
          controllerConfig(0),
          controllerAdapter(admin),
        ),
        'CURRENT186 post-fault plan result',
      );
      const afterFaultPlanBody = requireRecord(
        afterFaultPlan.plan,
        'CURRENT186 post-fault plan',
      );
      expect(afterFaultPlan.epoch).toBeNull();
      expect(afterFaultPlanBody.beforeCatalogDigest).toBe(beforeDigest);
      expect(await readEpochRows(admin)).toEqual([]);
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceBaseline);
      expect(await readProtectedAclSurface(admin)).toEqual(
        protectedAclBaseline,
      );
    });

    it('rejects a direct JSON-null recovery sidecar and rolls the apply transaction back', async () => {
      const beforeEpoch = await readEpochRows(admin);
      const beforeApplicationSurface = await readApplicationAuthoritySurface(
        admin,
        workerRoleOid,
      );
      const beforeProtectedSurface = await readProtectedAclSurface(admin);
      const fault: FaultInjection = {
        executeCount: 0,
        replaceEpochSidecarWithJsonNull: true,
        replacedEpochSidecarCount: 0,
      };

      await expectSqlState(
        runController(
          'apply',
          controllerConfig(0),
          controllerAdapter(admin, fault),
        ),
        '22023',
      );

      expect(fault.replacedEpochSidecarCount).toBe(1);
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(beforeApplicationSurface);
      expect(await readProtectedAclSurface(admin)).toEqual(
        beforeProtectedSurface,
      );
    });

    it('blocks custom-schema PUBLIC authority before any apply DDL and preserves the remediable before-image', async () => {
      const applicationSchema = quotePgIdentifier(APPLICATION_SCHEMA);
      const beforeEpoch = await readEpochRows(admin);
      await admin.$executeRawUnsafe(
        `GRANT USAGE, CREATE ON SCHEMA ${applicationSchema} TO PUBLIC`,
      );
      try {
        const hostileSurface = await readApplicationAuthoritySurface(
          admin,
          workerRoleOid,
        );
        expect(hostileSurface.schemas).toContainEqual({
          name: APPLICATION_SCHEMA,
          publicPrivileges: ['CREATE:false', 'USAGE:false'],
        });
        await expectControllerReasonCode(
          runController('apply', controllerConfig(0), controllerAdapter(admin)),
          /IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_(?:LOCKED_)?PREFLIGHT_BLOCKED/u,
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
        expect(
          await readApplicationAuthoritySurface(admin, workerRoleOid),
        ).toEqual(hostileSurface);
      } finally {
        await admin.$executeRawUnsafe(
          `REVOKE USAGE, CREATE ON SCHEMA ${applicationSchema} FROM PUBLIC`,
        );
      }
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceBaseline);
      expect(await readPublicSchemaOwner(admin)).toEqual(
        publicSchemaBeforeOwner,
      );
    });

    it('blocks arbitrary quoted bystander relation and routine ACL before any apply DDL', async () => {
      const bystander = await createAuxiliaryRole(
        maintenance,
        QUOTED_BYSTANDER_ROLE,
      );
      auxiliaryRoles.push(bystander);
      const quotedBystander = quotePgIdentifier(bystander.name);
      await admin.$executeRawUnsafe(
        `GRANT SELECT ON TABLE public."IdentityMailDutyRoleAclEpochV1" TO ${quotedBystander}`,
      );
      await admin.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${DRIVER_SIGNATURE} TO ${quotedBystander}`,
      );
      await admin.$executeRawUnsafe(
        `GRANT SELECT ("name") ON TABLE public."Tenant" TO ${quotedBystander}`,
      );
      const beforeEpoch = await readEpochRows(admin);

      await expectControllerReasonCode(
        runController('apply', controllerConfig(0), controllerAdapter(admin)),
        /IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_(?:LOCKED_)?PREFLIGHT_BLOCKED/u,
      );
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);

      await admin.$executeRawUnsafe(
        `REVOKE SELECT ON TABLE public."IdentityMailDutyRoleAclEpochV1" FROM ${quotedBystander}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE EXECUTE ON FUNCTION ${DRIVER_SIGNATURE} FROM ${quotedBystander}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE SELECT ("name") ON TABLE public."Tenant" FROM ${quotedBystander}`,
      );
      await dropCapturedAuxiliaryRoles(maintenance, [bystander]);
      auxiliaryRoles = auxiliaryRoles.filter(
        (role) => role.oid !== bystander.oid,
      );
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('serializes concurrent apply, attests exact V1 grants and enforces the runtime privilege split', async () => {
      const applyFaults: FaultInjection[] = [
        {
          aclLockAcquiredAtEpochMs: [],
          epochAppendTelemetry: [],
          executeCount: 0,
          transactionDurationsMs: [],
        },
        {
          aclLockAcquiredAtEpochMs: [],
          epochAppendTelemetry: [],
          executeCount: 0,
          transactionDurationsMs: [],
        },
      ];
      const outcomes = await Promise.allSettled([
        runController(
          'apply',
          controllerConfig(0),
          controllerAdapter(admin, applyFaults[0]),
        ),
        runController(
          'apply',
          controllerConfig(0),
          controllerAdapter(secondaryAdmin, applyFaults[1]),
        ),
      ]);
      const successes = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<unknown> =>
          outcome.status === 'fulfilled',
      );
      const failures = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      if (successes.length !== 1 || failures.length !== 1) {
        throw new Error(
          `CURRENT186 concurrent apply produced an invalid outcome split: ${JSON.stringify(
            outcomes.map(promiseOutcomeDiagnostic),
          )}; telemetry=${JSON.stringify(applyFaults)}`,
        );
      }
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.reason).toMatchObject({
        reasonCode: 'IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_STALE_EPOCH',
      });
      applyReceipt = requireApplyReceipt(successes[0]?.value);
      expect(applyReceipt).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_APPLIED',
        epoch: 1,
        targetDefinitionManifestDigest: CURRENT186_DEFINITION_MANIFEST_DIGEST,
      });
      const appendTelemetry = applyFaults.flatMap(
        (fault) => fault.epochAppendTelemetry ?? [],
      );
      expect(appendTelemetry).toHaveLength(1);
      const [applyAppend] = appendTelemetry;
      expect(applyAppend).toMatchObject({
        outerHasCanonicalBeforeCatalog: false,
        outerHasHexBeforeCatalog: false,
        storageProfile: 'EPOCH_COLUMN_CANONICAL_JSON_V1',
      });
      expect(applyAppend?.outerPayloadBytes).toBeGreaterThan(2_000);
      expect(applyAppend?.outerPayloadBytes).toBeLessThan(600_000);
      expect(applyAppend?.beforeCatalogSidecarBytes).toBeGreaterThan(1_000_000);
      expect(applyAppend?.beforeCatalogSidecarBytes).toBeLessThanOrEqual(
        4_194_304,
      );
      expect(
        applyFaults.map((fault) => fault.aclLockAcquiredAtEpochMs?.length),
      ).toEqual([1, 1]);
      expect(
        catalogModule.IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST,
      ).toBe(CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST);
      expect(await readEpochRows(admin)).toHaveLength(1);
      const [storedApply] = await readOperationRecoverySnapshots(
        admin,
        applyReceipt.operationId,
      );
      if (!storedApply) {
        throw new Error('CURRENT186 stored APPLY sidecar is unavailable');
      }
      expect(
        Buffer.byteLength(storedApply.beforeCatalogCanonicalJson, 'utf8'),
      ).toBe(applyAppend?.beforeCatalogSidecarBytes);
      expect(
        JSON.parse(storedApply.beforeCatalogCanonicalJson) as unknown,
      ).toEqual(applyReceipt.beforeCatalog);
      const storedOuterPayload = requireRecord(
        JSON.parse(storedApply.payloadCanonicalJson) as unknown,
        'CURRENT186 stored compact outer payload',
      );
      expect(storedOuterPayload.beforeCatalogStorageProfile).toBe(
        'EPOCH_COLUMN_CANONICAL_JSON_V1',
      );
      expect(storedOuterPayload).not.toHaveProperty(
        'beforeCatalogCanonicalJson',
      );
      expect(storedOuterPayload).not.toHaveProperty(
        'beforeCatalogCanonicalJsonHex',
      );
      await assertCatalogAndDatabaseDirectDutyAclDigestParity({
        client: admin,
        coordinatorRoleOid,
        definitionManifestDigest: CURRENT186_DEFINITION_MANIFEST_DIGEST,
        deploymentRoleOid,
        operationId: applyReceipt.operationId,
        schemaOwnerRoleOid,
        workerRoleOid,
      });

      const attestation = requireRecord(
        await runController(
          'attest',
          controllerConfig(1),
          controllerAdapter(admin),
        ),
        'CURRENT186 attestation',
      );
      expect(attestation).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED',
        definitionManifestDigest: CURRENT186_DEFINITION_MANIFEST_DIGEST,
        exactGrantsDigest: applyReceipt.targetExactGrantsDigest,
      });

      const liveCatalog = await readLiveCatalog(admin);
      const liveCatalogRecord = requireRecord(
        liveCatalog,
        'CURRENT186 applied catalog',
      );
      if (
        !Array.isArray(liveCatalogRecord.objects) ||
        !Array.isArray(liveCatalogRecord.directAuthorities)
      ) {
        throw new Error('CURRENT186 applied catalog surface is unavailable');
      }
      const catalogObjects = liveCatalogRecord.objects.map((entry) =>
        requireRecord(entry, 'CURRENT186 applied catalog object'),
      );
      expect(catalogObjects).toHaveLength(38);
      expect(
        catalogObjects.filter((object) => object.kind === 'RELATION'),
      ).toHaveLength(13);
      expect(
        catalogObjects.filter((object) => object.kind === 'ROUTINE'),
      ).toHaveLength(23);
      const directAuthorities = liveCatalogRecord.directAuthorities.map(
        (entry) => requireRecord(entry, 'CURRENT186 direct authority'),
      );
      expect(
        directAuthorities.filter(
          (entry) =>
            entry.objectKind === 'COLUMN' &&
            entry.granteeOid === schemaOwnerRoleOid,
        ),
      ).toHaveLength(39);
      expect(
        directAuthorities.filter(
          (entry) =>
            entry.objectKind === 'ROUTINE' &&
            entry.objectIdentity ===
              'public."identity_email_claim_lock_v1"(text)' &&
            entry.granteeOid === schemaOwnerRoleOid &&
            entry.privilege === 'EXECUTE',
        ),
      ).toHaveLength(1);
      protectedAclApplied = await readProtectedAclSurface(admin);
      assertAppliedProtectedAclSurface(protectedAclApplied, {
        databaseOwnerOid: deploymentRoleOid,
        schemaOwnerOid: schemaOwnerRoleOid,
      });
      const grantsProjection =
        catalogModule.identityMailDutyRoleCatalogCurrent186GrantsProjection(
          liveCatalog,
        );
      liveGrantsProjection = grantsProjection;
      const exactV1Digest =
        grantsModule.identityMailDutyRoleGrantsCurrent185Digest(
          grantsProjection,
        );
      expect(
        catalogModule.IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE,
      ).toBe(grantsModule.IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE);
      expect(exactV1Digest).toBe(applyReceipt.targetExactGrantsDigest);

      await assertRuntimePrivilegeBoundary(
        disposableDatabaseUrl,
        COORDINATOR_ROLE,
        [DRIVER_SIGNATURE],
      );
      await assertRuntimePrivilegeBoundary(
        disposableDatabaseUrl,
        WORKER_ROLE,
        WORKER_SIGNATURES,
      );

      applicationSurfaceApplied = await readApplicationAuthoritySurface(
        admin,
        workerRoleOid,
      );
      expect(applicationSurfaceApplied).toEqual({
        routines: [
          expect.objectContaining({
            kind: 'a',
            name: APPLICATION_AGGREGATE,
            publicExecute: false,
            workerExecute: false,
          }),
          expect.objectContaining({
            kind: 'p',
            name: APPLICATION_PROCEDURE,
            publicExecute: false,
            workerExecute: false,
          }),
          expect.objectContaining({
            kind: 'w',
            name: APPLICATION_WINDOW,
            publicExecute: false,
            workerExecute: false,
          }),
        ],
        schemas: [
          { name: APPLICATION_SCHEMA, publicPrivileges: [] },
          { name: 'public', publicPrivileges: ['USAGE:false'] },
        ],
      });
      expect(await readPublicSchemaOwner(admin)).toEqual({
        name: SCHEMA_OWNER_ROLE,
        oid: BigInt(schemaOwnerRoleOid),
      });

      await withSessionAuthorization(
        disposableDatabaseUrl,
        WORKER_ROLE,
        async (worker) => {
          await expectSqlState(
            worker.$queryRawUnsafe(
              `SELECT public."identity_mail_tenant_enrollment_drive_command_v2"($1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT)`,
              randomUUID(),
              randomUUID(),
              fixtureDigest('current186-worker-denied-authorization'),
              fixtureDigest('current186-worker-denied-manifest'),
            ),
            '42501',
          );
        },
      );
    });

    it('executes every narrowed worker lock path, lost-response replay and owner-only reconciliation', async () => {
      const fixture = await prepareDriverTenant({
        admin,
        assertDeploymentSessionDenied: true,
        coordinatorRoleOid,
        databaseName: disposableDatabase,
        databaseOid,
        databaseUrl: disposableDatabaseUrl,
        evidenceProvenance: expectedEvidenceProvenance,
        grantsProjection: liveGrantsProjection,
        marker,
        status: 'PENDING',
        workerRoleOid,
      });
      const lifecycle = await exerciseWorkerDeliveryLifecycle(
        disposableDatabaseUrl,
        fixture,
      );

      expect(lifecycle.claim).toMatchObject({
        decision: 'CLAIMED',
        leaseVersion: 1,
        outboxId: fixture.outboxId,
        tenantId: fixture.tenantId,
        transitionRevision: 2,
      });
      expect(lifecycle.providerMark).toMatchObject({
        decision: 'MARKED',
        leaseVersion: 1,
        outboxId: fixture.outboxId,
        tenantId: fixture.tenantId,
        transitionRevision: 3,
      });
      expect(lifecycle.providerMarkReplay).toEqual(lifecycle.providerMark);
      expect(lifecycle.complete).toMatchObject({
        decision: 'RECONCILIATION_REQUIRED',
        leaseVersion: 1,
        outboxId: fixture.outboxId,
        tenantId: fixture.tenantId,
        transitionRevision: 4,
      });
      expect(lifecycle.completeReplay).toEqual(lifecycle.complete);

      await withSessionAuthorization(
        disposableDatabaseUrl,
        WORKER_ROLE,
        async (worker) => {
          await expectSqlState(
            reconcileDeliveryLifecycle(worker, fixture, lifecycle, 'SENT'),
            '42501',
          );
        },
      );

      const reconciliation = await withSessionAuthorization(
        disposableDatabaseUrl,
        SCHEMA_OWNER_ROLE,
        async (owner) =>
          reconcileDeliveryLifecycle(owner, fixture, lifecycle, 'SENT'),
      );
      expect(reconciliation).toMatchObject({
        decision: 'SENT',
        outboxId: fixture.outboxId,
        replayed: false,
        tenantId: fixture.tenantId,
        transitionRevision: 5,
      });
      const reconciliationReplay = await withSessionAuthorization(
        disposableDatabaseUrl,
        SCHEMA_OWNER_ROLE,
        async (owner) =>
          reconcileDeliveryLifecycle(owner, fixture, lifecycle, 'SENT'),
      );
      expect(reconciliationReplay).toMatchObject({
        ...reconciliation,
        replayed: true,
      });

      const [stored] = await admin.$queryRaw<
        Array<{
          eventTypes: string[];
          secretCleared: boolean;
          status: string;
          transitionRevision: bigint;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.array_agg(
            event."eventType"::TEXT
            ORDER BY event."transitionRevision", event."id"
          ) AS "eventTypes",
          outbox."secretCiphertext" IS NULL AS "secretCleared",
          outbox."status"::TEXT AS status,
          outbox."transitionRevision" AS "transitionRevision"
        FROM public."IdentityMailOutbox" AS outbox
        INNER JOIN public."IdentityMailDeliveryEvent" AS event
          ON event."tenantId" = outbox."tenantId"
         AND event."outboxId" = outbox."id"
        WHERE outbox."tenantId" = ${fixture.tenantId}
          AND outbox."id" = ${fixture.outboxId}
        GROUP BY outbox."id"
      `);
      expect(stored).toEqual({
        eventTypes: [
          'CLAIMED',
          'PROVIDER_MARKED',
          'PROVIDER_AMBIGUOUS',
          'RECONCILED_SENT',
        ],
        secretCleared: true,
        status: 'SENT',
        transitionRevision: 5n,
      });
    });

    it('rejects same-OID function-body drift plus disabled and extra protected triggers', async () => {
      const protectedRoutine =
        'public."identity_mail_outbox_delivery_guard_v2"()';
      const [routine] = await admin.$queryRaw<
        Array<{ definition: string; oid: bigint }>
      >(Prisma.sql`
        SELECT
          routine.oid::BIGINT AS oid,
          pg_catalog.pg_get_functiondef(routine.oid) AS definition
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.oid = pg_catalog.to_regprocedure(${protectedRoutine})
      `);
      if (!routine)
        throw new Error('CURRENT186 protected routine is unavailable');
      await admin.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION public."identity_mail_outbox_delivery_guard_v2"()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        VOLATILE
        PARALLEL UNSAFE
        SECURITY INVOKER
        SET search_path = pg_catalog
        AS $current186_hostile$
        BEGIN
          RETURN NEW;
        END;
        $current186_hostile$
      `);
      const [sameOid] = await admin.$queryRaw<Array<{ oid: bigint }>>(
        Prisma.sql`
          SELECT pg_catalog.to_regprocedure(${protectedRoutine})::OID::BIGINT AS oid
        `,
      );
      expect(sameOid?.oid).toBe(routine.oid);
      await expectCurrent186AttestationBlocked(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      await admin.$executeRawUnsafe(routine.definition);
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );

      const triggerRelation = 'public."IdentityMailDutyRoleAclEpochV1"';
      const triggerName =
        'IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger';
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${triggerRelation} DISABLE TRIGGER ${quotePgIdentifier(triggerName)}`,
      );
      await expectCurrent186AttestationBlocked(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${triggerRelation} ENABLE TRIGGER ${quotePgIdentifier(triggerName)}`,
      );
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );

      const extraTrigger = 'lp_imtec_current186_hostile_extra_trigger';
      await admin.$executeRawUnsafe(`
        CREATE TRIGGER ${quotePgIdentifier(extraTrigger)}
        BEFORE UPDATE ON ${triggerRelation}
        FOR EACH ROW
        EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"()
      `);
      await expectCurrent186AttestationBlocked(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      await admin.$executeRawUnsafe(
        `DROP TRIGGER ${quotePgIdentifier(extraTrigger)} ON ${triggerRelation}`,
      );
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
    });

    it('rejects replaced protected constraint and index definitions', async () => {
      const relation = 'public."IdentityMailDutyRoleAclEpochV1"';
      const constraintName =
        'identity_mail_duty_role_acl_epoch_identifier_check';
      const [constraint] = await admin.$queryRaw<Array<{ definition: string }>>(
        Prisma.sql`
          SELECT pg_catalog.pg_get_constraintdef(constraint_entry.oid, false)
            AS definition
          FROM pg_catalog.pg_constraint AS constraint_entry
          WHERE constraint_entry.conrelid = ${relation}::REGCLASS
            AND constraint_entry.conname = ${constraintName}
        `,
      );
      if (!constraint) {
        throw new Error('CURRENT186 protected constraint is unavailable');
      }
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${relation} DROP CONSTRAINT ${quotePgIdentifier(constraintName)}`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${relation} ADD CONSTRAINT ${quotePgIdentifier(constraintName)} CHECK (true)`,
      );
      await expectCurrent186AttestationBlocked(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${relation} DROP CONSTRAINT ${quotePgIdentifier(constraintName)}`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE ${relation} ADD CONSTRAINT ${quotePgIdentifier(constraintName)} ${constraint.definition}`,
      );
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );

      const index = await readReplaceableProtectedIndex(admin);
      await admin.$executeRawUnsafe(`DROP INDEX ${index.identity}`);
      await admin.$executeRawUnsafe(
        `CREATE INDEX ${quotePgIdentifier(index.name)} ON ${index.relationIdentity} ((1))`,
      );
      await expectCurrent186AttestationBlocked(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      await admin.$executeRawUnsafe(`DROP INDEX ${index.identity}`);
      await admin.$executeRawUnsafe(index.definition);
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
    });

    it('detects direct ACL drift without an epoch bump and accepts the exact repair', async () => {
      const beforeEpoch = await readEpochRows(admin);
      await admin.$executeRawUnsafe(
        `GRANT SELECT ON TABLE public."IdentityMailDutyRoleAclEpochV1" TO "${WORKER_ROLE}"`,
      );
      await expect(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      ).rejects.toMatchObject({
        reasonCode:
          'IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ATTESTATION_BLOCKED',
      });
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);

      await admin.$executeRawUnsafe(
        `REVOKE SELECT ON TABLE public."IdentityMailDutyRoleAclEpochV1" FROM "${WORKER_ROLE}"`,
      );
      await expect(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      ).resolves.toMatchObject({
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED',
      });
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('rejects system and direct authority drift across supported PostgreSQL ACL classes', async () => {
      const beforeEpoch = await readEpochRows(admin);
      const quotedWorker = quotePgIdentifier(WORKER_ROLE);
      let exercisedAuthorityClasses = 0;
      const exerciseAuthorityMutation = async (
        grantSql: string,
        revokeSql: string,
      ): Promise<void> => {
        await admin.$executeRawUnsafe(grantSql);
        try {
          await expectCurrent186AttestationBlocked(
            runController(
              'attest',
              controllerConfig(1),
              controllerAdapter(admin),
            ),
          );
          expect(await readEpochRows(admin)).toEqual(beforeEpoch);
          exercisedAuthorityClasses += 1;
        } finally {
          await admin.$executeRawUnsafe(revokeSql);
        }
        await expectCurrent186AttestationAccepted(
          runController(
            'attest',
            controllerConfig(1),
            controllerAdapter(admin),
          ),
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
      };

      await exerciseAuthorityMutation(
        `GRANT SELECT ON TABLE pg_catalog.pg_authid TO ${quotedWorker}`,
        `REVOKE SELECT ON TABLE pg_catalog.pg_authid FROM ${quotedWorker}`,
      );

      const [readFileRoutine] = await admin.$queryRaw<
        Array<{ oid: bigint | null; publicExecute: boolean }>
      >(Prisma.sql`
        SELECT
          routine_entry.oid::BIGINT AS oid,
          EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
              COALESCE(
                routine_entry.proacl,
                pg_catalog.acldefault('f', routine_entry.proowner)
              )
            ) AS privilege
            WHERE privilege.grantee = 0::OID
              AND privilege.privilege_type = 'EXECUTE'
          ) AS "publicExecute"
        FROM pg_catalog.pg_proc AS routine_entry
        WHERE routine_entry.oid = pg_catalog.to_regprocedure(
          'pg_catalog.pg_read_file(text)'
        )
      `);
      if (!readFileRoutine?.oid) {
        throw new Error('CURRENT186 restricted system routine is unavailable');
      }
      expect(readFileRoutine.publicExecute).toBe(false);
      await exerciseAuthorityMutation(
        `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO ${quotedWorker}`,
        `REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM ${quotedWorker}`,
      );

      await exerciseAuthorityMutation(
        `GRANT SET ON PARAMETER statement_timeout TO ${quotedWorker}`,
        `REVOKE SET ON PARAMETER statement_timeout FROM ${quotedWorker}`,
      );
      await exerciseAuthorityMutation(
        `GRANT CREATE ON TABLESPACE pg_default TO ${quotedWorker}`,
        `REVOKE CREATE ON TABLESPACE pg_default FROM ${quotedWorker}`,
      );
      await exerciseAuthorityMutation(
        `GRANT pg_read_all_data TO ${quotedWorker}`,
        `REVOKE pg_read_all_data FROM ${quotedWorker}`,
      );

      const [largeObject] = await admin.$queryRaw<Array<{ oid: bigint }>>(
        Prisma.sql`SELECT pg_catalog.lo_create(0)::BIGINT AS oid`,
      );
      if (!largeObject || largeObject.oid < 1n) {
        throw new Error('CURRENT186 large-object fixture is unavailable');
      }
      try {
        const largeObjectOid = largeObject.oid.toString();
        await exerciseAuthorityMutation(
          `GRANT SELECT ON LARGE OBJECT ${largeObjectOid} TO ${quotedWorker}`,
          `REVOKE SELECT ON LARGE OBJECT ${largeObjectOid} FROM ${quotedWorker}`,
        );
      } finally {
        await admin.$queryRawUnsafe(
          `SELECT pg_catalog.lo_unlink(${largeObject.oid.toString()}::OID)`,
        );
      }

      const [foreignDataWrapper] = await admin.$queryRaw<
        Array<{ name: string }>
      >(Prisma.sql`
        SELECT wrapper.fdwname AS name
        FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
        ORDER BY wrapper.fdwname COLLATE "C"
        LIMIT 1
      `);
      if (foreignDataWrapper) {
        const quotedWrapper = quotePgIdentifier(foreignDataWrapper.name);
        await exerciseAuthorityMutation(
          `GRANT USAGE ON FOREIGN DATA WRAPPER ${quotedWrapper} TO ${quotedWorker}`,
          `REVOKE USAGE ON FOREIGN DATA WRAPPER ${quotedWrapper} FROM ${quotedWorker}`,
        );
      }

      await exerciseAuthorityMutation(
        'GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO PUBLIC',
        'REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM PUBLIC',
      );
      expect(exercisedAuthorityClasses).toBeGreaterThanOrEqual(7);
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('rejects practical expanded ownership classes and returns to exact zero after OID-bound cleanup', async () => {
      const beforeEpoch = await readEpochRows(admin);
      const fixture = await createPracticalOwnershipFixtures(
        admin,
        workerRoleOid,
      );
      try {
        const catalog = requireRecord(
          await readLiveCatalog(admin),
          'CURRENT186 expanded-ownership catalog',
        );
        if (!Array.isArray(catalog.unexpectedOwnedObjects)) {
          throw new Error(
            'CURRENT186 expanded ownership projection is unavailable',
          );
        }
        const observed = catalog.unexpectedOwnedObjects.map((entry) => {
          const owned = requireRecord(
            entry,
            'CURRENT186 expanded ownership entry',
          );
          return {
            kind: requireString(owned.kind),
            ownerName: requireString(owned.ownerName),
            ownerOid: Number(owned.ownerOid),
          };
        });
        expect(
          [...new Set(observed.map((entry) => entry.kind))].sort(),
        ).toEqual([...PRACTICAL_OWNERSHIP_KINDS].sort());
        expect(
          observed.every((entry) =>
            PRACTICAL_OWNERSHIP_KINDS.includes(entry.kind),
          ),
        ).toBe(true);
        expect(
          observed.every(
            (entry) =>
              entry.ownerName === WORKER_ROLE &&
              entry.ownerOid === workerRoleOid,
          ),
        ).toBe(true);
        await expectCurrent186AttestationBlocked(
          runController(
            'attest',
            controllerConfig(1),
            controllerAdapter(admin),
          ),
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
      } finally {
        await cleanupPracticalOwnershipFixtures(admin, fixture);
      }
      expect(await readPracticalOwnershipFixtureRows(admin, fixture)).toEqual(
        [],
      );
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('drives non-empty HOLD/PENDING through ACTIVE, DRAINING, zero-inflight finalization and terminal replay', async () => {
      for (const status of ['HOLD', 'PENDING'] as const) {
        const fixture = await prepareDriverTenant({
          admin,
          coordinatorRoleOid,
          databaseName: disposableDatabase,
          databaseOid,
          databaseUrl: disposableDatabaseUrl,
          evidenceProvenance: expectedEvidenceProvenance,
          grantsProjection: liveGrantsProjection,
          marker,
          status,
          workerRoleOid,
        });

        const beginDrain = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(beginDrain).toMatchObject({
          decision: 'PENDING_ZERO_INFLIGHT',
          phase: 'BEGIN_DRAIN',
          state: 'DRAINING',
          stateRevision: 2,
        });
        const wait = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(wait).toMatchObject({
          decision: 'PENDING_ZERO_INFLIGHT',
          phase: 'WAIT_ZERO_INFLIGHT',
          secretBearingCount: 1,
        });
        expect(wait.queuedCount).toBe(1);

        await expect(
          reapAsWorker(disposableDatabaseUrl, fixture),
        ).resolves.toBe(1);
        const final = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(final).toMatchObject({
          decision: 'COMPLETED',
          phase: 'FINALIZE',
          state: 'DISABLED',
          stateRevision: 3,
        });
        const replay = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(replay).toMatchObject({
          decision: 'COMPLETED',
          eventDigest: final.eventDigest,
          phase: 'TERMINAL_REPLAY',
          state: 'DISABLED',
          stateRevision: 3,
        });
      }
    });

    it('re-reads state after a tenant-lock wait while an independent tenant progresses without 40P01', async () => {
      const contended = await prepareDriverTenant({
        admin,
        coordinatorRoleOid,
        databaseName: disposableDatabase,
        databaseOid,
        databaseUrl: disposableDatabaseUrl,
        evidenceProvenance: expectedEvidenceProvenance,
        grantsProjection: liveGrantsProjection,
        marker,
        status: 'HOLD',
        workerRoleOid,
      });
      const independent = await prepareDriverTenant({
        admin,
        coordinatorRoleOid,
        databaseName: disposableDatabase,
        databaseOid,
        databaseUrl: disposableDatabaseUrl,
        evidenceProvenance: expectedEvidenceProvenance,
        grantsProjection: liveGrantsProjection,
        marker,
        status: 'PENDING',
        workerRoleOid,
      });
      const holder = await createSessionAuthorizationClient(
        disposableDatabaseUrl,
        COORDINATOR_ROLE,
      );
      const waiter = await createSessionAuthorizationClient(
        disposableDatabaseUrl,
        COORDINATOR_ROLE,
      );
      const tenantLocked = deferred<void>();
      const releaseHolder = deferred<void>();
      let holderPromise: Promise<Record<string, unknown>> | undefined;
      try {
        const waiterPid = await readBackendPid(waiter);
        holderPromise = holder.$transaction(
          async (transaction) => {
            await setDriverTransactionGuards(transaction);
            await transaction.$queryRaw(Prisma.sql`
              SELECT pg_catalog.pg_advisory_xact_lock(
                pg_catalog.hashtextextended(
                  ${`leetplus:identity-mail-tenant:v1:${contended.tenantId}`},
                  180
                )
              )::TEXT AS "lockResult"
            `);
            tenantLocked.resolve(undefined);
            await releaseHolder.promise;
            return queryDriverInTransaction(transaction, contended.disable);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10_000,
            timeout: 60_000,
          },
        );
        await tenantLocked.promise;
        const waiterOutcome = captureOutcome(
          driveCommand(waiter, contended.disable),
        );
        const advisoryWait = await waitForAdvisoryWait(admin, waiterPid);
        expect(advisoryWait).toMatchObject({
          state: 'active',
          waitEvent: 'advisory',
          waitEventType: 'Lock',
        });

        const independentResult = await withTimeout(
          driveAsCoordinator(disposableDatabaseUrl, independent.disable),
          5_000,
          'Independent CURRENT186 tenant did not progress',
        );
        expect(independentResult).toMatchObject({
          phase: 'BEGIN_DRAIN',
          state: 'DRAINING',
        });

        releaseHolder.resolve(undefined);
        const holderResult = await holderPromise;
        expect(holderResult).toMatchObject({ phase: 'BEGIN_DRAIN' });
        const waited = await waiterOutcome;
        if (waited.status === 'rejected') throw waited.reason;
        expect(waited.value).toMatchObject({
          decision: 'PENDING_ZERO_INFLIGHT',
          phase: 'WAIT_ZERO_INFLIGHT',
        });
      } finally {
        releaseHolder.resolve(undefined);
        if (holderPromise) await Promise.allSettled([holderPromise]);
        await Promise.allSettled([
          resetAndDisconnect(holder),
          resetAndDisconnect(waiter),
        ]);
      }
    });

    it('denies new expired/revoked mutations while allowing already-accepted drain continuation', async () => {
      for (const invalidation of ['expiry', 'revocation'] as const) {
        const fixture = await prepareDriverTenant({
          admin,
          coordinatorRoleOid,
          databaseName: disposableDatabase,
          databaseOid,
          databaseUrl: disposableDatabaseUrl,
          evidenceProvenance: expectedEvidenceProvenance,
          grantsProjection: liveGrantsProjection,
          marker,
          reuseDisable: true,
          status: 'HOLD',
          validForMs: invalidation === 'expiry' ? 3_000 : 30_000,
          workerRoleOid,
        });
        if (!fixture.reusedDisable) {
          throw new Error('CURRENT186 reused disable evidence is unavailable');
        }
        const beginDrain = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(beginDrain).toMatchObject({ phase: 'BEGIN_DRAIN' });

        if (invalidation === 'expiry') {
          await waitUntilDatabaseClockAtOrAfter(
            admin,
            fixture.disable.expiresAt,
          );
        } else {
          await revokeManifest(admin, fixture.disable.manifestPayloadDigest);
        }
        await expectSqlState(
          driveAsCoordinator(disposableDatabaseUrl, fixture.reusedDisable),
          '42501',
        );

        await expect(
          reapAsWorker(disposableDatabaseUrl, fixture),
        ).resolves.toBe(1);
        const continuation = await driveAsCoordinator(
          disposableDatabaseUrl,
          fixture.disable,
        );
        expect(continuation).toMatchObject({
          decision: 'COMPLETED',
          phase: 'FINALIZE',
          state: 'DISABLED',
        });
      }
    });

    it('rejects a tampered or epoch-substituted rollback receipt without changing the epoch', async () => {
      const beforeEpoch = await readEpochRows(admin);
      const tamperedDigest = structuredClone(applyReceipt) as Record<
        string,
        unknown
      >;
      tamperedDigest.applyReceiptDigest = '0'.repeat(64);
      await expectControllerReasonCode(
        runController(
          'rollback',
          controllerConfig(1),
          controllerAdapter(admin),
          tamperedDigest,
        ),
        /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID$/u,
      );
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);

      const substitutedBeforeImage = structuredClone(applyReceipt) as Record<
        string,
        unknown
      >;
      substitutedBeforeImage.beforeCatalogDigest = 'f'.repeat(64);
      await expectControllerReasonCode(
        runController(
          'rollback',
          controllerConfig(1),
          controllerAdapter(admin),
          substitutedBeforeImage,
        ),
        /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID$/u,
      );
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('rejects rollback before DDL when a new user routine appears after APPLY', async () => {
      await createPostApplyUserRoutine(admin);
      try {
        const beforeEpoch = await readEpochRows(admin);
        const beforeCatalog = await readLiveCatalog(admin);
        const beforeApplicationSurface = await readApplicationAuthoritySurface(
          admin,
          workerRoleOid,
        );

        await expectControllerReasonCode(
          runController(
            'rollback',
            controllerConfig(1),
            controllerAdapter(admin),
            applyReceipt,
          ),
          /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT$/u,
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
        expect(await readLiveCatalog(admin)).toEqual(beforeCatalog);
        expect(
          await readApplicationAuthoritySurface(admin, workerRoleOid),
        ).toEqual(beforeApplicationSurface);
      } finally {
        await dropPostApplyUserRoutine(admin);
      }
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
    });

    it('rejects rollback before DDL when a pre-APPLY PUBLIC routine is replaced', async () => {
      const acceptedCatalog = await readLiveCatalog(admin);
      await replaceApplicationProcedure(admin, 2);
      try {
        const beforeEpoch = await readEpochRows(admin);
        const beforeCatalog = await readLiveCatalog(admin);
        expect(beforeCatalog).not.toEqual(acceptedCatalog);
        const beforeApplicationSurface = await readApplicationAuthoritySurface(
          admin,
          workerRoleOid,
        );

        await expectControllerReasonCode(
          runController(
            'rollback',
            controllerConfig(1),
            controllerAdapter(admin),
            applyReceipt,
          ),
          /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT$/u,
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
        expect(await readLiveCatalog(admin)).toEqual(beforeCatalog);
        expect(
          await readApplicationAuthoritySurface(admin, workerRoleOid),
        ).toEqual(beforeApplicationSurface);
      } finally {
        await replaceApplicationProcedure(admin, 1);
      }
      expect(await readLiveCatalog(admin)).toEqual(acceptedCatalog);
      await expectCurrent186AttestationAccepted(
        runController('attest', controllerConfig(1), controllerAdapter(admin)),
      );
    });

    it('blocks non-ACL rollback drift, repairs ACL-only drift through N+1 and preserves all roles', async () => {
      const beforeEpoch = await readEpochRows(admin);
      await maintenance.$executeRawUnsafe(
        `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} NOLOGIN`,
      );
      try {
        await expectControllerReasonCode(
          runController(
            'rollback',
            controllerConfig(1),
            controllerAdapter(admin),
            applyReceipt,
          ),
          /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT$/u,
        );
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
      } finally {
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} LOGIN`,
        );
      }

      expect(await readProtectedAclSurface(admin)).toEqual(protectedAclApplied);
      const beforeForbiddenColumnEpoch = await readEpochRows(admin);
      await admin.$executeRawUnsafe(
        'GRANT SELECT ("name") ON TABLE public."Tenant" TO PUBLIC',
      );
      try {
        await expectControllerReasonCode(
          runController(
            'rollback',
            controllerConfig(1),
            controllerAdapter(admin),
            applyReceipt,
          ),
          /^IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_PREFLIGHT_BLOCKED$/u,
        );
        expect(await readEpochRows(admin)).toEqual(beforeForbiddenColumnEpoch);
      } finally {
        await admin.$executeRawUnsafe(
          'REVOKE SELECT ("name") ON TABLE public."Tenant" FROM PUBLIC',
        );
      }
      expect(await readEpochRows(admin)).toEqual(beforeForbiddenColumnEpoch);
      expect(await readProtectedAclSurface(admin)).toEqual(protectedAclApplied);

      await admin.$executeRawUnsafe(
        `GRANT SELECT ON TABLE public."IdentityMailDutyRoleAclEpochV1" TO ${quotePgIdentifier(WORKER_ROLE)}`,
      );
      await admin.$executeRawUnsafe(
        'GRANT SELECT ("payloadDigest") ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC',
      );
      const rollback = requireRecord(
        await runController(
          'rollback',
          controllerConfig(1),
          controllerAdapter(admin),
          applyReceipt,
        ),
        'CURRENT186 rollback',
      );
      expect(rollback).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_ROLLED_BACK',
        epoch: 2,
        applyReceiptDigest: applyReceipt.applyReceiptDigest,
        restoredCatalogDigest: applyReceipt.beforeCatalogDigest,
      });
      const epochs = await readEpochRows(admin);
      expect(epochs.map((epoch) => [epoch.epoch, epoch.reasonCode])).toEqual([
        [1n, 'APPLY'],
        [2n, 'ROLLBACK'],
      ]);
      expect(epochs[1]?.applyReceiptDigest).toBe(
        applyReceipt.applyReceiptDigest,
      );
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceBaseline);
      expect(await readPublicSchemaOwner(admin)).toEqual(
        publicSchemaBeforeOwner,
      );
      expect(
        protectedAclSemanticProjection(await readProtectedAclSurface(admin)),
      ).toEqual(protectedAclSemanticProjection(protectedAclBaseline));
      expect(
        catalogModule.identityMailDutyRoleCatalogCurrent186Digest(
          await readLiveCatalog(admin),
        ),
      ).toBe(applyReceipt.beforeCatalogDigest);
      await expectExactRoleOids(maintenance, roleIdentities);
    });

    it('detects drop/recreate under the same worker name by OID and then accepts the newly pinned identity', async () => {
      const oldWorkerOid = workerRoleOid;
      await assertRoleSafeToDrop(maintenance, WORKER_ROLE, oldWorkerOid);
      await maintenance.$executeRawUnsafe(`DROP ROLE "${WORKER_ROLE}"`);
      roleIdentities = roleIdentities.filter(
        (role) => role.name !== WORKER_ROLE,
      );
      await maintenance.$executeRawUnsafe(
        exactCreateRoleSql(WORKER_ROLE, true),
      );
      const recreated = await readExactRoleIdentity(maintenance, WORKER_ROLE);
      expect(recreated.oid).not.toBe(oldWorkerOid);
      roleIdentities.push(recreated);

      await expectControllerReasonCode(
        runController(
          'plan',
          { ...controllerConfig(2), workerRoleOid: oldWorkerOid },
          controllerAdapter(admin),
        ),
        /^IDENTITY_MAIL_DUTY_ROLE_(?:CATALOG|DEPLOYMENT)_CURRENT186_/u,
      );

      workerRoleOid = recreated.oid;
      const plan = requireRecord(
        await runController(
          'plan',
          controllerConfig(2),
          controllerAdapter(admin),
        ),
        'CURRENT186 recreated-role plan',
      );
      expect(plan.decision).toBe('CURRENT186_DUTY_ROLE_DEPLOYMENT_PLAN');
      expect(requireRecord(plan.epoch, 'CURRENT186 plan epoch').epoch).toBe(2);
    });

    it('serializes emergency behind apply and exactly replays a commit-lost apply receipt by operationId', async () => {
      const config = controllerConfig(2);
      const lockHeld = deferred<void>();
      const releaseApply = deferred<void>();
      const applyFault: FaultInjection = {
        afterFirstAclLock: async () => {
          lockHeld.resolve(undefined);
          await releaseApply.promise;
        },
        epochAppendTelemetry: [],
        executeCount: 0,
        loseCommittedTransactionResponseAt: 1,
      };
      const emergencyFault: FaultInjection = {
        afterFirstAclLock: () =>
          Promise.reject(
            new InjectedControllerContractFault(
              'Injected CURRENT186 typed emergency cancellation after lock acquisition',
            ),
          ),
        executeCount: 0,
      };
      const observer = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      let applyOutcomePromise:
        | Promise<
            | { status: 'fulfilled'; value: unknown }
            | { reason: unknown; status: 'rejected' }
          >
        | undefined;
      let emergencyOutcomePromise:
        | Promise<
            | { status: 'fulfilled'; value: unknown }
            | { reason: unknown; status: 'rejected' }
          >
        | undefined;
      try {
        await observer.$connect();
        const emergencyPid = await readBackendPid(secondaryAdmin);
        applyOutcomePromise = captureOutcome(
          runController('apply', config, controllerAdapter(admin, applyFault)),
        );
        await withTimeout(
          Promise.race([
            lockHeld.promise,
            applyOutcomePromise.then((outcome) => {
              if (outcome.status === 'rejected') throw outcome.reason;
              throw new Error(
                'CURRENT186 apply completed without acquiring the shared ACL lock',
              );
            }),
          ]),
          15_000,
          'CURRENT186 apply did not acquire the shared ACL lock',
        );
        emergencyOutcomePromise = captureOutcome(
          runController(
            'emergency',
            config,
            controllerAdapter(secondaryAdmin, emergencyFault),
          ),
        );
        const advisoryWait = await waitForAdvisoryWait(
          observer,
          emergencyPid,
          emergencyOutcomePromise,
        );
        expect(advisoryWait).toMatchObject({
          state: 'active',
          waitEvent: 'advisory',
          waitEventType: 'Lock',
        });
        releaseApply.resolve(undefined);

        const applyOutcome = await applyOutcomePromise;
        expect(applyOutcome.status).toBe('rejected');
        if (applyOutcome.status === 'rejected') {
          if (!(applyOutcome.reason instanceof InjectedControllerFault)) {
            throw applyOutcome.reason;
          }
          expect(applyOutcome.reason).toBeInstanceOf(InjectedControllerFault);
        }
        const emergencyOutcome = await emergencyOutcomePromise;
        expect(emergencyOutcome.status).toBe('rejected');
        if (emergencyOutcome.status === 'rejected') {
          expect(emergencyOutcome.reason).toBeInstanceOf(
            InjectedControllerContractFault,
          );
        }
      } finally {
        releaseApply.resolve(undefined);
        if (applyOutcomePromise || emergencyOutcomePromise) {
          await Promise.allSettled(
            [applyOutcomePromise, emergencyOutcomePromise].filter(
              (
                operation,
              ): operation is Promise<
                | { status: 'fulfilled'; value: unknown }
                | { reason: unknown; status: 'rejected' }
              > => operation !== undefined,
            ),
          );
        }
        await observer.$disconnect();
      }

      expect(applyFault).toMatchObject({
        aclLockQueryCount: 1,
        lostCommittedTransactionResponseCount: 1,
        transactionCount: 1,
      });
      expect(emergencyFault).toMatchObject({
        aclLockQueryCount: 1,
        transactionCount: 1,
      });
      expect(emergencyFault.terminationQueryCount ?? 0).toBe(0);
      const committedReceipt = requireApplyReceipt(
        applyFault.committedTransactionResult,
      );
      expect(committedReceipt).toMatchObject({
        decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_APPLIED',
        epoch: 3,
        operationId: config.operationId,
      });
      const committedEpochs = await readEpochRows(admin);
      expect(
        committedEpochs.map((epoch) => [epoch.epoch, epoch.reasonCode]),
      ).toEqual([
        [1n, 'APPLY'],
        [2n, 'ROLLBACK'],
        [3n, 'APPLY'],
      ]);
      const committedRecoveryRows = await readOperationRecoverySnapshots(
        admin,
        config.operationId,
      );
      expect(committedRecoveryRows).toHaveLength(1);
      const [committedRecovery] = committedRecoveryRows;
      if (!committedRecovery) {
        throw new Error('CURRENT186 commit-lost sidecar is unavailable');
      }
      expect(
        JSON.parse(committedRecovery.beforeCatalogCanonicalJson) as unknown,
      ).toEqual(committedReceipt.beforeCatalog);
      const committedOuter = requireRecord(
        JSON.parse(committedRecovery.payloadCanonicalJson) as unknown,
        'CURRENT186 commit-lost outer payload',
      );
      expect(committedOuter.beforeCatalogStorageProfile).toBe(
        'EPOCH_COLUMN_CANONICAL_JSON_V1',
      );
      expect(committedOuter).not.toHaveProperty('beforeCatalogCanonicalJson');
      expect(committedOuter).not.toHaveProperty(
        'beforeCatalogCanonicalJsonHex',
      );
      expect(applyFault.epochAppendTelemetry).toEqual([
        expect.objectContaining({
          outerHasCanonicalBeforeCatalog: false,
          outerHasHexBeforeCatalog: false,
          storageProfile: 'EPOCH_COLUMN_CANONICAL_JSON_V1',
        }),
      ]);

      secondApplyReceipt = requireApplyReceipt(
        await runController('apply', config, controllerAdapter(admin)),
      );
      expect(secondApplyReceipt).toEqual(committedReceipt);
      expect(await readEpochRows(admin)).toEqual(committedEpochs);
      expect(
        await readOperationRecoverySnapshots(admin, config.operationId),
      ).toEqual(committedRecoveryRows);
    });

    it('serializes emergency behind normal attestation on the same ACL lock', async () => {
      const config = controllerConfig(3);
      const lockHeld = deferred<void>();
      const releaseAttestation = deferred<void>();
      const attestationFault: FaultInjection = {
        afterFirstAclLock: async () => {
          lockHeld.resolve(undefined);
          await releaseAttestation.promise;
        },
        executeCount: 0,
      };
      const emergencyFault: FaultInjection = {
        afterFirstAclLock: () =>
          Promise.reject(
            new InjectedControllerContractFault(
              'Injected CURRENT186 typed emergency cancellation after lock acquisition',
            ),
          ),
        executeCount: 0,
      };
      const observer = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      const beforeEpoch = await readEpochRows(admin);
      let attestationOutcomePromise:
        | ReturnType<typeof captureOutcome<unknown>>
        | undefined;
      let emergencyOutcomePromise:
        | ReturnType<typeof captureOutcome<unknown>>
        | undefined;
      try {
        await observer.$connect();
        const emergencyPid = await readBackendPid(secondaryAdmin);
        attestationOutcomePromise = captureOutcome(
          runController(
            'attest',
            config,
            controllerAdapter(admin, attestationFault),
          ),
        );
        await withTimeout(
          Promise.race([
            lockHeld.promise,
            attestationOutcomePromise.then((outcome) => {
              if (outcome.status === 'rejected') throw outcome.reason;
              throw new Error(
                'CURRENT186 attestation completed without acquiring the shared ACL lock',
              );
            }),
          ]),
          15_000,
          'CURRENT186 attestation did not acquire the shared ACL lock',
        );
        emergencyOutcomePromise = captureOutcome(
          runController(
            'emergency',
            config,
            controllerAdapter(secondaryAdmin, emergencyFault),
          ),
        );
        expect(
          await waitForAdvisoryWait(
            observer,
            emergencyPid,
            emergencyOutcomePromise,
          ),
        ).toMatchObject({
          state: 'active',
          waitEvent: 'advisory',
          waitEventType: 'Lock',
        });
        releaseAttestation.resolve(undefined);

        const attestationOutcome = await attestationOutcomePromise;
        if (attestationOutcome.status === 'rejected') {
          throw attestationOutcome.reason;
        }
        expect(attestationOutcome.value).toMatchObject({
          decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED',
        });
        const emergencyOutcome = await emergencyOutcomePromise;
        expect(emergencyOutcome.status).toBe('rejected');
        if (emergencyOutcome.status === 'rejected') {
          expect(emergencyOutcome.reason).toBeInstanceOf(
            InjectedControllerContractFault,
          );
        }
      } finally {
        releaseAttestation.resolve(undefined);
        if (attestationOutcomePromise) await attestationOutcomePromise;
        if (emergencyOutcomePromise) await emergencyOutcomePromise;
        await observer.$disconnect();
      }
      expect(attestationFault).toMatchObject({
        aclLockQueryCount: 1,
        transactionCount: 1,
      });
      expect(emergencyFault).toMatchObject({
        aclLockQueryCount: 1,
        transactionCount: 1,
      });
      expect(emergencyFault.terminationQueryCount ?? 0).toBe(0);
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
    });

    it('commits phase one but emits no epoch for a false termination result, resetting every exact role', async () => {
      expect(secondApplyReceipt.epoch).toBe(3);
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceApplied);
      await admin.$executeRawUnsafe(
        `GRANT USAGE ON SCHEMA ${quotePgIdentifier(APPLICATION_SCHEMA)} TO ${quotePgIdentifier(SCHEMA_OWNER_ROLE)}`,
      );
      expect(
        await readSchemaOwnerApplicationSupportAclCount(
          admin,
          schemaOwnerRoleOid,
        ),
      ).toBe(1n);

      const membershipParent = await createAuxiliaryRole(
        maintenance,
        MEMBERSHIP_PARENT_ROLE,
      );
      const membershipMember = await createAuxiliaryRole(
        maintenance,
        MEMBERSHIP_MEMBER_ROLE,
      );
      auxiliaryRoles.push(membershipParent, membershipMember);
      for (const roleName of EXACT_ROLE_NAMES) {
        const quotedRole = quotePgIdentifier(roleName);
        await maintenance.$executeRawUnsafe(`ALTER ROLE ${quotedRole} LOGIN`);
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE ${quotedRole} SET application_name TO 'current186-global-role-drift'`,
        );
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE ${quotedRole} IN DATABASE ${quotePgIdentifier(disposableDatabase)} SET statement_timeout TO '17s'`,
        );
        await maintenance.$executeRawUnsafe(
          `GRANT ${quotePgIdentifier(membershipParent.name)} TO ${quotedRole}`,
        );
        await maintenance.$executeRawUnsafe(
          `GRANT ${quotedRole} TO ${quotePgIdentifier(membershipMember.name)}`,
        );
      }
      expect(
        await readExactRoleContainmentState(maintenance, BigInt(databaseOid)),
      ).toEqual(
        expectedExactRoleContainmentState({
          canLogin: true,
          databaseSettingCount: 1n,
          globalSettingCount: 1n,
          membershipCount: 2n,
        }),
      );

      const beforeEpoch = await readEpochRows(admin);
      const falseTerminationFault: FaultInjection = {
        executeCount: 0,
        forceFirstRuntimeTerminationFalse: true,
        remainingSessionCounts: [],
        terminationQueryCount: 0,
      };
      const emergency = requireRecord(
        await runController(
          'emergency',
          controllerConfig(3),
          controllerAdapter(admin, falseTerminationFault),
        ),
        'CURRENT186 false-termination emergency containment',
      );
      expect(emergency).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED',
        phase1Committed: true,
        reasonCode:
          'IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TERMINATE_RESULT_FALSE',
      });
      expect(emergency.epoch).toBeUndefined();
      expect(falseTerminationFault.terminationQueryCount).toBe(1);
      expect(falseTerminationFault.remainingSessionCounts).toEqual([0]);
      expect(await readEpochRows(admin)).toEqual(beforeEpoch);
      expect(
        await readExactRoleContainmentState(maintenance, BigInt(databaseOid)),
      ).toEqual(
        expectedExactRoleContainmentState({
          canLogin: false,
          databaseSettingCount: 0n,
          globalSettingCount: 0n,
          membershipCount: 0n,
        }),
      );
      expect(
        await readSchemaOwnerApplicationSupportAclCount(
          admin,
          schemaOwnerRoleOid,
        ),
      ).toBe(1n);

      await dropCapturedAuxiliaryRoles(maintenance, [
        membershipParent,
        membershipMember,
      ]);
      auxiliaryRoles = auxiliaryRoles.filter(
        (role) =>
          role.oid !== membershipParent.oid &&
          role.oid !== membershipMember.oid,
      );
    });

    it('lets the database reject an emergency epoch when a duty-role session appears after the zero poll', async () => {
      const beforeEpoch = await readEpochRows(admin);
      const racePassword = `current186${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
      if (!/^current186[0-9a-f]{64}$/u.test(racePassword)) {
        throw new Error('CURRENT186 race-session password is invalid');
      }
      let raceSession: PrismaClient | undefined;
      let raceSessionPid = 0;
      const zeroSessionRaceFault: FaultInjection = {
        afterFirstZeroRuntimeSessionPoll: async () => {
          await maintenance.$executeRawUnsafe(
            `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} LOGIN PASSWORD '${racePassword}'`,
          );
          await maintenance.$executeRawUnsafe(
            `GRANT CONNECT ON DATABASE ${quotePgIdentifier(disposableDatabase)} TO ${quotePgIdentifier(WORKER_ROLE)}`,
          );
          const client = prismaFor(
            runtimeRoleDatabaseUrl(
              disposableDatabaseUrl,
              WORKER_ROLE,
              racePassword,
            ),
          );
          try {
            await client.$connect();
            raceSession = client;
            raceSessionPid = await readBackendPid(client);
          } catch (error) {
            await client.$disconnect();
            throw error;
          } finally {
            await maintenance.$executeRawUnsafe(
              `REVOKE CONNECT ON DATABASE ${quotePgIdentifier(disposableDatabase)} FROM ${quotePgIdentifier(WORKER_ROLE)}`,
            );
            await maintenance.$executeRawUnsafe(
              `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} NOLOGIN PASSWORD NULL`,
            );
          }
        },
        executeCount: 0,
        remainingSessionCounts: [],
        terminationQueryCount: 0,
      };
      let emergency: Record<string, unknown>;
      try {
        emergency = requireRecord(
          await runController(
            'emergency',
            controllerConfig(3),
            controllerAdapter(admin, zeroSessionRaceFault),
          ),
          'CURRENT186 zero-session race containment',
        );
        expect(emergency).toMatchObject({
          ...CURRENT186_SCOPE,
          authorization: false,
          canMutate: false,
          canSend: false,
          decision: 'CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED',
          phase1Committed: true,
        });
        expect(requireString(emergency.reasonCode)).toMatch(
          /^IDENTITY_MAIL_DUTY_ROLE_(?:CATALOG|DEPLOYMENT)_CURRENT186_/u,
        );
        expect(emergency.epoch).toBeUndefined();
        expect(raceSessionPid).toBeGreaterThan(0);
        const [raceActivity] = await admin.$queryRaw<
          Array<{ userName: string }>
        >(Prisma.sql`
          SELECT activity.usename AS "userName"
          FROM pg_catalog.pg_stat_activity AS activity
          WHERE activity.pid = ${raceSessionPid}
        `);
        expect(raceActivity).toEqual({ userName: WORKER_ROLE });
        expect(await readEpochRows(admin)).toEqual(beforeEpoch);
        expect(zeroSessionRaceFault).toMatchObject({
          aclLockQueryCount: 2,
          remainingSessionCounts: [0],
          terminationQueryCount: 1,
          transactionCount: 2,
          zeroRuntimeSessionHookCount: 1,
        });
      } finally {
        if (raceSession) await raceSession.$disconnect();
      }
      expect(await readRolePasswordIsNull(maintenance, WORKER_ROLE)).toBe(true);
      const [remaining] = await admin.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT pg_catalog.count(*)::BIGINT AS count
          FROM pg_catalog.pg_stat_activity AS activity
          WHERE activity.datname = pg_catalog.current_database()
            AND activity.usename IN (${Prisma.join(EXACT_ROLE_NAMES)})
        `,
      );
      expect(remaining).toEqual({ count: 0n });
    });

    it('recovers a lost phase-one commit response, retries termination and appends exactly one containment epoch', async () => {
      await maintenance.$executeRawUnsafe(
        `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} LOGIN`,
      );
      await maintenance.$executeRawUnsafe(
        `GRANT CONNECT ON DATABASE ${quotePgIdentifier(disposableDatabase)} TO ${quotePgIdentifier(WORKER_ROLE)}`,
      );

      const runtimePassword = `current186${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
      if (!/^current186[0-9a-f]{64}$/u.test(runtimePassword)) {
        throw new Error('CURRENT186 ephemeral runtime password is invalid');
      }
      await maintenance.$executeRawUnsafe(
        `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} PASSWORD '${runtimePassword}'`,
      );
      const slowWorker = prismaFor(
        runtimeRoleDatabaseUrl(
          disposableDatabaseUrl,
          WORKER_ROLE,
          runtimePassword,
        ),
      );
      try {
        await slowWorker.$connect();
      } finally {
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} PASSWORD NULL`,
        );
      }
      expect(await readRolePasswordIsNull(maintenance, WORKER_ROLE)).toBe(true);
      const slowWorkerPid = await readBackendPid(slowWorker);
      const slowWorkerOutcome = captureOutcome(
        slowWorker.$queryRawUnsafe('SELECT pg_catalog.pg_sleep(120)'),
      );
      await waitForBackendActivity(
        admin,
        slowWorkerPid,
        'pg_sleep',
        WORKER_ROLE,
      );
      const emergencyConfig = controllerConfig(3);
      const beforeEmergencyEpochs = await readEpochRows(admin);
      const emergencyFault: FaultInjection = {
        deferFirstAcceptedRuntimeTermination: true,
        executeCount: 0,
        loseCommittedTransactionResponseAt: 1,
        remainingSessionCounts: [],
        terminationQueryCount: 0,
      };
      let emergency: Record<string, unknown>;
      try {
        emergency = requireRecord(
          await runController(
            'emergency',
            emergencyConfig,
            controllerAdapter(admin, emergencyFault),
          ),
          'CURRENT186 emergency containment',
        );
        const terminatedWorker = await withTimeout(
          slowWorkerOutcome,
          10_000,
          'CURRENT186 emergency did not terminate the slow worker session',
        );
        expect(terminatedWorker.status).toBe('rejected');
        expect(emergencyFault.terminationQueryCount).toBeGreaterThanOrEqual(2);
        expect(emergencyFault.remainingSessionCounts?.at(0)).toBeGreaterThan(0);
        expect(emergencyFault.remainingSessionCounts?.at(-1)).toBe(0);
        expect(emergencyFault).toMatchObject({
          aclLockQueryCount: 3,
          lostCommittedTransactionResponseCount: 1,
          transactionCount: 3,
        });
        await waitForBackendExit(admin, slowWorkerPid);
      } finally {
        await terminateBackendIfPresent(admin, slowWorkerPid);
        await Promise.allSettled([slowWorkerOutcome]);
        await slowWorker.$disconnect();
        await maintenance.$executeRawUnsafe(
          `REVOKE CONNECT ON DATABASE ${quotePgIdentifier(disposableDatabase)} FROM ${quotePgIdentifier(WORKER_ROLE)}`,
        );
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE ${quotePgIdentifier(WORKER_ROLE)} NOLOGIN PASSWORD NULL`,
        );
      }
      expect(emergency).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_EMERGENCY_CONTAINED',
        epoch: 4,
        phase1Committed: true,
      });

      const epochs = await readEpochRows(admin);
      expect(epochs).toHaveLength(beforeEmergencyEpochs.length + 1);
      expect(
        epochs.filter(
          (epoch) => epoch.operationId === emergencyConfig.operationId,
        ),
      ).toHaveLength(1);
      expect(epochs.map((epoch) => [epoch.epoch, epoch.reasonCode])).toEqual([
        [1n, 'APPLY'],
        [2n, 'ROLLBACK'],
        [3n, 'APPLY'],
        [4n, 'EMERGENCY_CONTAINMENT'],
      ]);
      expect(epochs[3]?.exactGrantsDigest).toBe(
        secondApplyReceipt.targetExactGrantsDigest,
      );

      expect(
        await readExactRoleContainmentState(maintenance, BigInt(databaseOid)),
      ).toEqual(
        expectedExactRoleContainmentState({
          canLogin: false,
          databaseSettingCount: 0n,
          globalSettingCount: 0n,
          membershipCount: 0n,
        }),
      );
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceApplied);
      expect(
        await readSchemaOwnerApplicationSupportAclCount(
          admin,
          schemaOwnerRoleOid,
        ),
      ).toBe(0n);
      expect(await readPublicSchemaOwner(admin)).toEqual({
        name: SCHEMA_OWNER_ROLE,
        oid: BigInt(schemaOwnerRoleOid),
      });

      await expect(
        runController('attest', controllerConfig(4), controllerAdapter(admin)),
      ).resolves.toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_CONTAINMENT_ATTESTED',
      });
    });

    it('commits emergency phase one and emits no false epoch when catalog attestation is unhealthy', async () => {
      const protectedRoutine =
        'public."identity_mail_outbox_delivery_guard_v2"()';
      const [routine] = await admin.$queryRaw<Array<{ definition: string }>>(
        Prisma.sql`
          SELECT pg_catalog.pg_get_functiondef(routine_entry.oid) AS definition
          FROM pg_catalog.pg_proc AS routine_entry
          WHERE routine_entry.oid = pg_catalog.to_regprocedure(
            ${protectedRoutine}
          )
        `,
      );
      if (!routine) {
        throw new Error('CURRENT186 emergency routine is unavailable');
      }
      await admin.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION public."identity_mail_outbox_delivery_guard_v2"()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        VOLATILE
        PARALLEL UNSAFE
        SECURITY INVOKER
        SET search_path = pg_catalog
        AS $current186_emergency_hostile$
        BEGIN
          RETURN NEW;
        END;
        $current186_emergency_hostile$
      `);
      let emergency: Record<string, unknown>;
      try {
        emergency = requireRecord(
          await runController(
            'emergency',
            controllerConfig(4),
            controllerAdapter(admin),
          ),
          'CURRENT186 unhealthy emergency containment',
        );
      } finally {
        await admin.$executeRawUnsafe(routine.definition);
      }
      expect(emergency).toMatchObject({
        ...CURRENT186_SCOPE,
        authorization: false,
        canMutate: false,
        canSend: false,
        decision: 'CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED',
        phase1Committed: true,
      });
      expect(emergency.epoch).toBeUndefined();
      const epochs = await readEpochRows(admin);
      expect(epochs.map((epoch) => [epoch.epoch, epoch.reasonCode])).toEqual([
        [1n, 'APPLY'],
        [2n, 'ROLLBACK'],
        [3n, 'APPLY'],
        [4n, 'EMERGENCY_CONTAINMENT'],
      ]);
      const contained = await maintenance.$queryRaw<
        Array<{ canLogin: boolean; name: string }>
      >(Prisma.sql`
        SELECT role_entry.rolcanlogin AS "canLogin", role_entry.rolname AS name
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname IN (${Prisma.join([
          COORDINATOR_ROLE,
          WORKER_ROLE,
        ])})
        ORDER BY role_entry.rolname COLLATE "C"
      `);
      expect(contained).toEqual([
        { canLogin: false, name: COORDINATOR_ROLE },
        { canLogin: false, name: WORKER_ROLE },
      ]);
      expect(
        await readApplicationAuthoritySurface(admin, workerRoleOid),
      ).toEqual(applicationSurfaceApplied);
    });

    it('retains the CURRENT185 importer surface and records only the exact lifecycle evidence', async () => {
      const commandProvenance = await admin.$queryRaw<
        EvidenceCommandProvenance[]
      >(Prisma.sql`
        SELECT
          command_row."authorizationEnvelopeDigest"
            AS "authorizationEnvelopeDigest",
          command_row."id" AS "commandId",
          command_row."dutyManifestId" AS "manifestId",
          command_row."dutyManifestPayloadDigest"
            AS "manifestPayloadDigest",
          command_row."requestId" AS "requestId",
          command_row."tenantId" AS "tenantId"
        FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
          AS command_row
        ORDER BY command_row."id" COLLATE "C"
      `);
      const manifestProvenance = await admin.$queryRaw<
        EvidenceManifestProvenance[]
      >(Prisma.sql`
        SELECT
          manifest_row."importedCommandId" AS "importedCommandId",
          manifest_row."manifestId" AS "manifestId",
          manifest_row."payloadDigest" AS "payloadDigest"
        FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest_row
        ORDER BY manifest_row."payloadDigest" COLLATE "C"
      `);
      const expectedCommands = [...expectedEvidenceProvenance.commands].sort(
        (left, right) =>
          left.commandId < right.commandId
            ? -1
            : left.commandId > right.commandId
              ? 1
              : 0,
      );
      const expectedManifests = [...expectedEvidenceProvenance.manifests].sort(
        (left, right) =>
          left.payloadDigest < right.payloadDigest
            ? -1
            : left.payloadDigest > right.payloadDigest
              ? 1
              : 0,
      );
      expect(expectedCommands).toHaveLength(16);
      expect(expectedManifests).toHaveLength(14);
      expect(commandProvenance).toEqual(expectedCommands);
      expect(manifestProvenance).toEqual(expectedManifests);

      const [regression] = await admin.$queryRaw<
        Array<{
          commandCount: bigint;
          importerCount: bigint;
          manifestCount: bigint;
          migrationChecksum: string;
          revocationCount: bigint;
        }>
      >(Prisma.sql`
        SELECT
          (
            SELECT pg_catalog.count(*)::BIGINT
            FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
          ) AS "commandCount",
          (
            SELECT pg_catalog.count(*)::BIGINT
            FROM public."IdentityMailDutyRoleManifestEvidenceV2"
          ) AS "manifestCount",
          (
            SELECT pg_catalog.count(*)::BIGINT
            FROM public."IdentityMailDutyRoleManifestRevocationV2"
          ) AS "revocationCount",
          (
            SELECT pg_catalog.count(*)::BIGINT
            FROM pg_catalog.pg_proc AS routine
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public'
              AND routine.proname =
                'identity_mail_tenant_enrollment_import_evidence_v2'
              AND routine.pronargs = 2
          ) AS "importerCount",
          (
            SELECT migration.checksum
            FROM public."_prisma_migrations" AS migration
            WHERE migration."migration_name" = ${CURRENT185_MIGRATION}
              AND migration."finished_at" IS NOT NULL
              AND migration."rolled_back_at" IS NULL
          ) AS "migrationChecksum"
      `);
      expect(regression).toEqual({
        commandCount: 16n,
        importerCount: 1n,
        manifestCount: 14n,
        migrationChecksum: CURRENT185_SHA256,
        revocationCount: 1n,
      });
    });

    function controllerConfig(expectedEpoch: number): DeploymentConfig {
      return {
        actualContextDigest: marker.actualContextDigest,
        applicationArtifactSha256: '8'.repeat(64),
        applicationContract: APPLICATION_CONTRACT,
        applicationReleaseSha: 'a'.repeat(40),
        coordinatorRoleOid,
        databaseIdentityDigest: marker.databaseIdentityDigest,
        databaseName: disposableDatabase,
        databaseOid,
        deploymentMarkerDigest: marker.payloadDigest,
        deploymentMarkerId: marker.id,
        deploymentRoleName,
        deploymentRoleOid,
        definitionManifestDigest: CURRENT186_DEFINITION_MANIFEST_DIGEST,
        expectedEpoch,
        migrationCount: 186,
        migrationHead: CURRENT186_MIGRATION,
        migrationManifestDigest: CURRENT186_MANIFEST_DIGEST,
        operationId: randomUUID(),
        schemaOwnerRoleOid,
        workerRoleOid,
      };
    }

    function controllerAdapter(
      client: PrismaClient,
      fault?: FaultInjection,
    ): ControllerAdapter {
      return createControllerAdapter(client, client, catalogModule, fault);
    }

    async function runController(
      mode: 'apply' | 'attest' | 'check' | 'emergency' | 'plan' | 'rollback',
      config: DeploymentConfig,
      adapter: ControllerAdapter,
      receipt: unknown = null,
    ): Promise<unknown> {
      return controllerModule.runIdentityMailDutyRoleDeploymentCurrent186({
        adapter,
        config,
        mode,
        receipt,
      });
    }

    async function readLiveCatalog(client: PrismaClient): Promise<unknown> {
      return catalogModule.readIdentityMailDutyRoleCatalogCurrent186FromPostgres(
        rawExecutor(client),
        controllerConfig((await readEpochRows(client)).length),
      );
    }
  },
);

function rawExecutor(
  client: PrismaClient | Prisma.TransactionClient,
): RawExecutor {
  return {
    query: async (sql, parameters = []) => ({
      rows: await client.$queryRawUnsafe<unknown[]>(sql, ...parameters),
    }),
  };
}

function createControllerAdapter(
  client: PrismaClient | Prisma.TransactionClient,
  transactionHost: PrismaClient | null,
  catalogModule: CatalogModule,
  fault?: FaultInjection,
): ControllerAdapter {
  const executor = rawExecutor(client);
  return {
    ...executor,
    query: async (sql, parameters = []) => {
      let effectiveParameters = parameters;
      if (
        fault?.replaceEpochSidecarWithJsonNull === true &&
        sql.includes('identity_mail_duty_role_acl_epoch_append_v1')
      ) {
        if (parameters.length !== 3) {
          throw new Error(
            'CURRENT186 epoch append parameters are unavailable for JSON-null injection',
          );
        }
        effectiveParameters = [...parameters];
        effectiveParameters[2] = 'null';
        fault.replacedEpochSidecarCount =
          (fault.replacedEpochSidecarCount ?? 0) + 1;
      }
      if (
        fault?.epochAppendTelemetry !== undefined &&
        sql.includes('identity_mail_duty_role_acl_epoch_append_v1')
      ) {
        const payloadCanonicalJson = parameters[0];
        if (typeof payloadCanonicalJson !== 'string') {
          throw new Error('CURRENT186 epoch append payload is unavailable');
        }
        const parsed = requireRecord(
          JSON.parse(payloadCanonicalJson) as unknown,
          'CURRENT186 epoch append payload telemetry',
        );
        const beforeCatalogCanonicalJson = parameters[2];
        fault.epochAppendTelemetry.push({
          beforeCatalogSidecarBytes:
            typeof beforeCatalogCanonicalJson === 'string'
              ? Buffer.byteLength(beforeCatalogCanonicalJson, 'utf8')
              : null,
          outerHasCanonicalBeforeCatalog: Object.hasOwn(
            parsed,
            'beforeCatalogCanonicalJson',
          ),
          outerHasHexBeforeCatalog: Object.hasOwn(
            parsed,
            'beforeCatalogCanonicalJsonHex',
          ),
          outerPayloadBytes: Buffer.byteLength(payloadCanonicalJson, 'utf8'),
          storageProfile:
            typeof parsed.beforeCatalogStorageProfile === 'string'
              ? parsed.beforeCatalogStorageProfile
              : null,
        });
      }
      if (
        fault !== undefined &&
        sql.includes('identity_mail_duty_role_acl_lock_v1')
      ) {
        fault.aclLockQueryCount = (fault.aclLockQueryCount ?? 0) + 1;
      }
      if (fault !== undefined && sql.includes('pg_terminate_backend')) {
        fault.terminationQueryCount = (fault.terminationQueryCount ?? 0) + 1;
        if (
          fault.forceFirstRuntimeTerminationFalse === true &&
          fault.terminationQueryCount === 1
        ) {
          return { rows: [{ terminated: false }] };
        }
        if (
          fault.deferFirstAcceptedRuntimeTermination === true &&
          fault.terminationQueryCount === 1
        ) {
          return { rows: [{ terminated: true }] };
        }
      }
      const result = await executor.query(sql, effectiveParameters);
      if (
        fault?.aclLockAcquiredAtEpochMs !== undefined &&
        sql.includes('identity_mail_duty_role_acl_lock_v1')
      ) {
        fault.aclLockAcquiredAtEpochMs.push(Date.now());
      }
      if (
        fault?.afterFirstAclLock !== undefined &&
        fault.aclLockQueryCount === 1 &&
        sql.includes('identity_mail_duty_role_acl_lock_v1')
      ) {
        await fault.afterFirstAclLock();
      }
      if (
        fault?.remainingSessionCounts !== undefined &&
        sql.includes('AS "remainingSessionCount"')
      ) {
        const row = requireRecord(
          result.rows[0],
          'CURRENT186 remaining-session result',
        );
        const count = Number(row.remainingSessionCount);
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error('CURRENT186 remaining-session count is invalid');
        }
        fault.remainingSessionCounts.push(count);
      }
      if (
        fault?.afterFirstZeroRuntimeSessionPoll !== undefined &&
        sql.includes('AS "remainingSessionCount"')
      ) {
        const row = requireRecord(
          result.rows[0],
          'CURRENT186 zero-session hook result',
        );
        const count = Number(row.remainingSessionCount);
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error('CURRENT186 zero-session hook count is invalid');
        }
        if (count === 0 && (fault.zeroRuntimeSessionHookCount ?? 0) === 0) {
          fault.zeroRuntimeSessionHookCount = 1;
          await fault.afterFirstZeroRuntimeSessionPoll();
        }
      }
      return result;
    },
    execute: async (sql) => {
      if (fault) {
        fault.executeCount += 1;
        if (
          fault.failAtExecute !== undefined &&
          fault.executeCount === fault.failAtExecute
        ) {
          throw new InjectedControllerFault(
            'Injected CURRENT186 controller statement fault',
          );
        }
      }
      await client.$executeRawUnsafe(sql);
    },
    readCatalog: async (expectations) =>
      catalogModule.readIdentityMailDutyRoleCatalogCurrent186FromPostgres(
        executor,
        expectations,
      ),
    transaction: async <T>(
      callback: (transaction: ControllerAdapter) => Promise<T>,
    ): Promise<T> => {
      if (!transactionHost) {
        throw new Error('Nested CURRENT186 controller transaction is denied');
      }
      const transactionNumber = (fault?.transactionCount ?? 0) + 1;
      if (fault !== undefined) fault.transactionCount = transactionNumber;
      const transactionStartedAt = Date.now();
      let result: T;
      try {
        result = await transactionHost.$transaction(
          async (transaction) =>
            callback(
              createControllerAdapter(transaction, null, catalogModule, fault),
            ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10_000,
            timeout: 90_000,
          },
        );
      } finally {
        fault?.transactionDurationsMs?.push(Date.now() - transactionStartedAt);
      }
      if (fault?.loseCommittedTransactionResponseAt === transactionNumber) {
        fault.committedTransactionResult = result;
        fault.lostCommittedTransactionResponseCount =
          (fault.lostCommittedTransactionResponseCount ?? 0) + 1;
        throw new InjectedControllerFault(
          'Injected CURRENT186 committed transaction response loss',
        );
      }
      return result;
    },
  };
}

async function loadCurrent186Modules(): Promise<{
  catalog: CatalogModule;
  controller: ControllerModule;
  grants: GrantsModule;
}> {
  const repositoryRoot = resolve(__dirname, '../../..');
  const scriptDirectory = resolve(repositoryRoot, 'packages/database/scripts');
  const [catalog, controller, grants] = await Promise.all([
    importEsmModule(
      pathToFileURL(
        resolve(
          scriptDirectory,
          'identity-mail-duty-role-catalog-current186.mjs',
        ),
      ).href,
    ),
    importEsmModule(
      pathToFileURL(
        resolve(
          scriptDirectory,
          'identity-mail-duty-role-deployment-current186.mjs',
        ),
      ).href,
    ),
    importEsmModule(
      pathToFileURL(
        resolve(
          scriptDirectory,
          'identity-mail-duty-role-grants-current185.mjs',
        ),
      ).href,
    ),
  ]);
  return {
    catalog: catalog as CatalogModule,
    controller: controller as ControllerModule,
    grants: grants as GrantsModule,
  };
}

async function importEsmModule(specifier: string): Promise<unknown> {
  return import(specifier);
}

async function createExactPasswordlessRoles(
  client: PrismaClient,
): Promise<RoleIdentity[]> {
  const roles: RoleIdentity[] = [];
  try {
    for (const name of EXACT_ROLE_NAMES) {
      await client.$executeRawUnsafe(
        exactCreateRoleSql(name, name !== SCHEMA_OWNER_ROLE),
      );
      roles.push(await readExactRoleIdentity(client, name));
    }
  } catch (error) {
    if (roles.length > 0) {
      await dropCapturedExactRoles(client, roles);
    }
    throw error;
  }
  const observed = await client.$queryRaw<
    Array<{
      bypassRls: boolean;
      canLogin: boolean;
      createDatabase: boolean;
      createRole: boolean;
      inherit: boolean;
      name: string;
      passwordIsNull: boolean;
      replication: boolean;
      superuser: boolean;
    }>
  >(Prisma.sql`
    SELECT
      role_entry.rolname AS name,
      role_entry.rolcanlogin AS "canLogin",
      role_entry.rolinherit AS inherit,
      role_entry.rolsuper AS superuser,
      role_entry.rolcreatedb AS "createDatabase",
      role_entry.rolcreaterole AS "createRole",
      role_entry.rolreplication AS replication,
      role_entry.rolbypassrls AS "bypassRls",
      role_entry.rolpassword IS NULL AS "passwordIsNull"
    FROM pg_catalog.pg_authid AS role_entry
    WHERE role_entry.rolname IN (${Prisma.join(EXACT_ROLE_NAMES)})
    ORDER BY role_entry.rolname COLLATE "C"
  `);
  expect(observed).toEqual([
    {
      bypassRls: false,
      canLogin: true,
      createDatabase: false,
      createRole: false,
      inherit: false,
      name: COORDINATOR_ROLE,
      passwordIsNull: true,
      replication: false,
      superuser: false,
    },
    {
      bypassRls: false,
      canLogin: false,
      createDatabase: false,
      createRole: false,
      inherit: false,
      name: SCHEMA_OWNER_ROLE,
      passwordIsNull: true,
      replication: false,
      superuser: false,
    },
    {
      bypassRls: false,
      canLogin: true,
      createDatabase: false,
      createRole: false,
      inherit: false,
      name: WORKER_ROLE,
      passwordIsNull: true,
      replication: false,
      superuser: false,
    },
  ]);
  return roles;
}

async function createAuxiliaryRole(
  client: PrismaClient,
  roleName: string,
): Promise<AuxiliaryRoleIdentity> {
  const quoted = quotePgIdentifier(roleName);
  await client.$executeRawUnsafe(
    `CREATE ROLE ${quoted} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  const [role] = await client.$queryRaw<Array<{ name: string; oid: bigint }>>(
    Prisma.sql`
      SELECT role_entry.rolname AS name, role_entry.oid::BIGINT AS oid
      FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.rolname = ${roleName}
    `,
  );
  if (
    !role ||
    role.name !== roleName ||
    role.oid < 1n ||
    role.oid > 4_294_967_295n
  ) {
    throw new Error('CURRENT186 auxiliary role identity is unavailable');
  }
  return { name: role.name, oid: Number(role.oid) };
}

async function createHermeticDeploymentRole(
  client: PrismaClient,
  roleName: string,
  password: string,
): Promise<AuxiliaryRoleIdentity> {
  if (
    !DEPLOYMENT_ROLE_PATTERN.test(roleName) ||
    !DEPLOYMENT_ROLE_PASSWORD_PATTERN.test(password)
  ) {
    throw new Error('Refusing unsafe CURRENT186 deployment-role fixture');
  }
  const quoted = quotePgIdentifier(roleName);
  await client.$executeRawUnsafe(
    `CREATE ROLE ${quoted} LOGIN NOINHERIT SUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD '${password}'`,
  );
  const [role] = await client.$queryRaw<
    Array<{
      bypassRls: boolean;
      canLogin: boolean;
      createDatabase: boolean;
      createRole: boolean;
      inherit: boolean;
      name: string;
      oid: bigint;
      passwordIsNull: boolean;
      replication: boolean;
      superuser: boolean;
    }>
  >(Prisma.sql`
    SELECT
      role_entry.rolname AS name,
      role_entry.oid::BIGINT AS oid,
      role_entry.rolcanlogin AS "canLogin",
      role_entry.rolinherit AS inherit,
      role_entry.rolsuper AS superuser,
      role_entry.rolcreatedb AS "createDatabase",
      role_entry.rolcreaterole AS "createRole",
      role_entry.rolreplication AS replication,
      role_entry.rolbypassrls AS "bypassRls",
      role_entry.rolpassword IS NULL AS "passwordIsNull"
    FROM pg_catalog.pg_authid AS role_entry
    WHERE role_entry.rolname = ${roleName}
  `);
  if (
    !role ||
    role.name !== roleName ||
    role.oid < 1n ||
    role.oid > 4_294_967_295n ||
    !role.canLogin ||
    role.inherit ||
    !role.superuser ||
    role.createDatabase ||
    role.createRole ||
    role.replication ||
    role.bypassRls ||
    role.passwordIsNull
  ) {
    throw new Error('CURRENT186 deployment role identity is unavailable');
  }
  return { name: role.name, oid: Number(role.oid) };
}

async function dropCapturedAuxiliaryRoles(
  client: PrismaClient,
  roles: readonly AuxiliaryRoleIdentity[],
): Promise<void> {
  for (const role of [...roles].reverse()) {
    const [live] = await client.$queryRaw<Array<{ oid: bigint }>>(Prisma.sql`
      SELECT role_entry.oid::BIGINT AS oid
      FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.rolname = ${role.name}
    `);
    if (!live) continue;
    if (live.oid !== BigInt(role.oid)) {
      throw new Error('Refusing CURRENT186 auxiliary role OID drift cleanup');
    }
    await client.$executeRawUnsafe(`DROP ROLE ${quotePgIdentifier(role.name)}`);
  }
}

function quotePgIdentifier(value: string): string {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > 63 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
    })
  ) {
    throw new Error('Refusing unsafe CURRENT186 PostgreSQL identifier');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

async function createPracticalOwnershipFixtures(
  client: PrismaClient,
  workerRoleOid: number,
): Promise<PracticalOwnershipFixture> {
  if (workerRoleOid < 1 || workerRoleOid > 4_294_967_295) {
    throw new Error('CURRENT186 ownership fixture worker OID is invalid');
  }
  const worker = quotePgIdentifier(WORKER_ROLE);
  const names = practicalOwnershipFixtureNames();
  const largeObjectOid = await client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `CREATE TYPE public.${names.type} AS ENUM ('current186')`,
      );
      await transaction.$executeRawUnsafe(
        `ALTER TYPE public.${names.type} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(`
        CREATE TRUSTED LANGUAGE ${names.language}
        HANDLER pg_catalog.plpgsql_call_handler
        INLINE pg_catalog.plpgsql_inline_handler
        VALIDATOR pg_catalog.plpgsql_validator
      `);
      await transaction.$executeRawUnsafe(
        `ALTER LANGUAGE ${names.language} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(
        `CREATE FOREIGN DATA WRAPPER ${names.foreignDataWrapper}`,
      );
      await transaction.$executeRawUnsafe(
        `GRANT USAGE ON FOREIGN DATA WRAPPER ${names.foreignDataWrapper} TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(
        `CREATE SERVER ${names.foreignServer} FOREIGN DATA WRAPPER ${names.foreignDataWrapper}`,
      );
      await transaction.$executeRawUnsafe(
        `CREATE USER MAPPING FOR ${worker} SERVER ${names.foreignServer}`,
      );
      await transaction.$executeRawUnsafe(
        `ALTER SERVER ${names.foreignServer} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(
        `CREATE COLLATION public.${names.collation} FROM pg_catalog."C"`,
      );
      await transaction.$executeRawUnsafe(
        `ALTER COLLATION public.${names.collation} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(`
        CREATE CONVERSION public.${names.conversion}
        FOR 'UTF8' TO 'LATIN1'
        FROM pg_catalog.utf8_to_iso8859_1
      `);
      await transaction.$executeRawUnsafe(
        `ALTER CONVERSION public.${names.conversion} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(`
        CREATE TEXT SEARCH CONFIGURATION public.${names.textSearchConfiguration}
        (COPY = pg_catalog.simple)
      `);
      await transaction.$executeRawUnsafe(
        `ALTER TEXT SEARCH CONFIGURATION public.${names.textSearchConfiguration} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(`
        CREATE TEXT SEARCH DICTIONARY public.${names.textSearchDictionary}
        (TEMPLATE = pg_catalog.simple)
      `);
      await transaction.$executeRawUnsafe(
        `ALTER TEXT SEARCH DICTIONARY public.${names.textSearchDictionary} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(`
        CREATE TABLE public.${names.statisticsSource} (
          first_value INTEGER NOT NULL,
          second_value INTEGER NOT NULL
        )
      `);
      await transaction.$executeRawUnsafe(`
        CREATE STATISTICS public.${names.statistics}
        ON first_value, second_value
        FROM public.${names.statisticsSource}
      `);
      await transaction.$executeRawUnsafe(
        `ALTER STATISTICS public.${names.statistics} OWNER TO ${worker}`,
      );
      await transaction.$executeRawUnsafe(
        `CREATE PUBLICATION ${names.publication} FOR TABLE public.${names.statisticsSource}`,
      );
      await transaction.$executeRawUnsafe(
        `ALTER PUBLICATION ${names.publication} OWNER TO ${worker}`,
      );
      const [largeObject] = await transaction.$queryRaw<Array<{ oid: bigint }>>(
        Prisma.sql`SELECT pg_catalog.lo_create(0)::BIGINT AS oid`,
      );
      if (!largeObject || largeObject.oid < 1n) {
        throw new Error('CURRENT186 ownership large object is unavailable');
      }
      await transaction.$executeRawUnsafe(
        `ALTER LARGE OBJECT ${largeObject.oid.toString()} OWNER TO ${worker}`,
      );
      return largeObject.oid;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 90_000,
    },
  );
  const seed = {
    largeObjectOid,
    workerRoleOid,
  };
  const rows = await readPracticalOwnershipFixtureRows(client, seed);
  const observedKinds = [...new Set(rows.map((row) => row.kind))].sort();
  if (
    JSON.stringify(observedKinds) !==
      JSON.stringify([...PRACTICAL_OWNERSHIP_KINDS].sort()) ||
    rows.some((row) => row.ownerOid !== BigInt(workerRoleOid))
  ) {
    throw new Error('CURRENT186 practical ownership fixture is incomplete');
  }
  return { ...seed, rows };
}

async function cleanupPracticalOwnershipFixtures(
  client: PrismaClient,
  fixture: PracticalOwnershipFixture,
): Promise<void> {
  const beforeCleanup = await readPracticalOwnershipFixtureRows(
    client,
    fixture,
  );
  const observedKinds = [
    ...new Set(beforeCleanup.map((row) => row.kind)),
  ].sort();
  if (
    practicalOwnershipRowsIdentity(beforeCleanup) !==
      practicalOwnershipRowsIdentity(fixture.rows) ||
    JSON.stringify(observedKinds) !==
      JSON.stringify([...PRACTICAL_OWNERSHIP_KINDS].sort()) ||
    beforeCleanup.some((row) => row.ownerOid !== BigInt(fixture.workerRoleOid))
  ) {
    throw new Error('Refusing CURRENT186 ownership fixture drift cleanup');
  }
  const names = practicalOwnershipFixtureNames();
  await client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `DROP PUBLICATION ${names.publication}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP STATISTICS public.${names.statistics}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP TABLE public.${names.statisticsSource}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP TEXT SEARCH DICTIONARY public.${names.textSearchDictionary}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP TEXT SEARCH CONFIGURATION public.${names.textSearchConfiguration}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP CONVERSION public.${names.conversion}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP COLLATION public.${names.collation}`,
      );
      await transaction.$executeRawUnsafe(
        `DROP USER MAPPING FOR ${quotePgIdentifier(WORKER_ROLE)} SERVER ${names.foreignServer}`,
      );
      await transaction.$executeRawUnsafe(`DROP SERVER ${names.foreignServer}`);
      await transaction.$executeRawUnsafe(
        `DROP FOREIGN DATA WRAPPER ${names.foreignDataWrapper}`,
      );
      await transaction.$queryRawUnsafe(
        `SELECT pg_catalog.lo_unlink(${fixture.largeObjectOid.toString()}::OID)`,
      );
      await transaction.$executeRawUnsafe(`DROP LANGUAGE ${names.language}`);
      await transaction.$executeRawUnsafe(`DROP TYPE public.${names.type}`);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 90_000,
    },
  );
}

async function readPracticalOwnershipFixtureRows(
  client: PrismaClient,
  fixture: Pick<PracticalOwnershipFixture, 'largeObjectOid' | 'workerRoleOid'>,
): Promise<PracticalOwnershipFixtureRow[]> {
  const names = practicalOwnershipFixtureNames(false);
  return client.$queryRaw<PracticalOwnershipFixtureRow[]>(Prisma.sql`
    SELECT fixture.kind, fixture.object_oid AS "objectOid",
      fixture.owner_oid AS "ownerOid"
    FROM (
      SELECT 'TYPE'::TEXT AS kind, type_entry.oid AS object_oid,
        type_entry.typowner AS owner_oid
      FROM pg_catalog.pg_type AS type_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = type_entry.typnamespace
      WHERE namespace_entry.nspname = 'public'
        AND type_entry.typname IN (${Prisma.join([
          names.type,
          `_${names.type}`,
        ])})
      UNION ALL
      SELECT 'LANGUAGE', language_entry.oid, language_entry.lanowner
      FROM pg_catalog.pg_language AS language_entry
      WHERE language_entry.lanname = ${names.language}
      UNION ALL
      SELECT 'FOREIGN_SERVER', server_entry.oid, server_entry.srvowner
      FROM pg_catalog.pg_foreign_server AS server_entry
      WHERE server_entry.srvname = ${names.foreignServer}
      UNION ALL
      SELECT 'USER_MAPPING', mapping_entry.umid, mapping_entry.umuser
      FROM pg_catalog.pg_user_mappings AS mapping_entry
      JOIN pg_catalog.pg_foreign_server AS server_entry
        ON server_entry.oid = mapping_entry.srvid
      WHERE server_entry.srvname = ${names.foreignServer}
        AND mapping_entry.umuser = ${fixture.workerRoleOid}::OID
      UNION ALL
      SELECT 'COLLATION', collation_entry.oid, collation_entry.collowner
      FROM pg_catalog.pg_collation AS collation_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = collation_entry.collnamespace
      WHERE namespace_entry.nspname = 'public'
        AND collation_entry.collname = ${names.collation}
      UNION ALL
      SELECT 'CONVERSION', conversion_entry.oid, conversion_entry.conowner
      FROM pg_catalog.pg_conversion AS conversion_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = conversion_entry.connamespace
      WHERE namespace_entry.nspname = 'public'
        AND conversion_entry.conname = ${names.conversion}
      UNION ALL
      SELECT 'TEXT_SEARCH_CONFIGURATION', configuration_entry.oid,
        configuration_entry.cfgowner
      FROM pg_catalog.pg_ts_config AS configuration_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = configuration_entry.cfgnamespace
      WHERE namespace_entry.nspname = 'public'
        AND configuration_entry.cfgname = ${names.textSearchConfiguration}
      UNION ALL
      SELECT 'TEXT_SEARCH_DICTIONARY', dictionary_entry.oid,
        dictionary_entry.dictowner
      FROM pg_catalog.pg_ts_dict AS dictionary_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = dictionary_entry.dictnamespace
      WHERE namespace_entry.nspname = 'public'
        AND dictionary_entry.dictname = ${names.textSearchDictionary}
      UNION ALL
      SELECT 'STATISTICS', statistics_entry.oid, statistics_entry.stxowner
      FROM pg_catalog.pg_statistic_ext AS statistics_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = statistics_entry.stxnamespace
      WHERE namespace_entry.nspname = 'public'
        AND statistics_entry.stxname = ${names.statistics}
      UNION ALL
      SELECT 'PUBLICATION', publication_entry.oid,
        publication_entry.pubowner
      FROM pg_catalog.pg_publication AS publication_entry
      WHERE publication_entry.pubname = ${names.publication}
      UNION ALL
      SELECT 'LARGE_OBJECT', large_object.oid, large_object.lomowner
      FROM pg_catalog.pg_largeobject_metadata AS large_object
      WHERE large_object.oid = ${fixture.largeObjectOid}::OID
    ) AS fixture
    ORDER BY fixture.kind COLLATE "C", fixture.object_oid
  `);
}

function practicalOwnershipRowsIdentity(
  rows: readonly PracticalOwnershipFixtureRow[],
): string {
  return rows
    .map(
      (row) =>
        `${row.kind}:${row.objectOid.toString()}:${row.ownerOid.toString()}`,
    )
    .join('|');
}

function practicalOwnershipFixtureNames(
  quote = true,
): PracticalOwnershipFixtureNames {
  const values = {
    collation: `${OWNERSHIP_FIXTURE_PREFIX}_collation`,
    conversion: `${OWNERSHIP_FIXTURE_PREFIX}_conversion`,
    foreignDataWrapper: `${OWNERSHIP_FIXTURE_PREFIX}_fdw`,
    foreignServer: `${OWNERSHIP_FIXTURE_PREFIX}_server`,
    language: `${OWNERSHIP_FIXTURE_PREFIX}_language`,
    publication: `${OWNERSHIP_FIXTURE_PREFIX}_publication`,
    statistics: `${OWNERSHIP_FIXTURE_PREFIX}_statistics`,
    statisticsSource: `${OWNERSHIP_FIXTURE_PREFIX}_statistics_source`,
    textSearchConfiguration: `${OWNERSHIP_FIXTURE_PREFIX}_ts_config`,
    textSearchDictionary: `${OWNERSHIP_FIXTURE_PREFIX}_ts_dict`,
    type: `${OWNERSHIP_FIXTURE_PREFIX}_type`,
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      quote ? quotePgIdentifier(value) : value,
    ]),
  ) as PracticalOwnershipFixtureNames;
}

async function createApplicationAuthoritySurface(
  client: PrismaClient,
): Promise<void> {
  await client.$executeRawUnsafe(
    `CREATE SCHEMA ${quotePgIdentifier(APPLICATION_SCHEMA)}`,
  );
  await client.$executeRawUnsafe('GRANT CREATE ON SCHEMA public TO PUBLIC');
  await client.$executeRawUnsafe(`
    CREATE PROCEDURE public.${quotePgIdentifier(APPLICATION_PROCEDURE)}()
    LANGUAGE SQL
    AS $current186_application_procedure$
      SELECT 1
    $current186_application_procedure$
  `);
  await client.$executeRawUnsafe(`
    CREATE AGGREGATE public.${quotePgIdentifier(APPLICATION_AGGREGATE)}(BIGINT) (
      SFUNC = pg_catalog.int8pl,
      STYPE = BIGINT,
      INITCOND = '0',
      PARALLEL = SAFE
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE FUNCTION public.${quotePgIdentifier(APPLICATION_WINDOW)}()
    RETURNS BIGINT
    AS 'window_row_number'
    LANGUAGE internal
    IMMUTABLE
    PARALLEL SAFE
    WINDOW
  `);
  for (const signature of [
    `public.${quotePgIdentifier(APPLICATION_PROCEDURE)}()`,
    `public.${quotePgIdentifier(APPLICATION_AGGREGATE)}(BIGINT)`,
    `public.${quotePgIdentifier(APPLICATION_WINDOW)}()`,
  ]) {
    await client.$executeRawUnsafe(
      `GRANT EXECUTE ON ROUTINE ${signature} TO PUBLIC`,
    );
  }
}

async function createPostApplyUserRoutine(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`
    CREATE FUNCTION public.${quotePgIdentifier(APPLICATION_POST_APPLY_FUNCTION)}()
    RETURNS INTEGER
    LANGUAGE SQL
    IMMUTABLE
    PARALLEL SAFE
    AS $current186_post_apply_user_function$
      SELECT 7
    $current186_post_apply_user_function$
  `);
}

async function dropPostApplyUserRoutine(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    `DROP FUNCTION public.${quotePgIdentifier(APPLICATION_POST_APPLY_FUNCTION)}()`,
  );
}

async function replaceApplicationProcedure(
  client: PrismaClient,
  value: 1 | 2,
): Promise<void> {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE PROCEDURE public.${quotePgIdentifier(APPLICATION_PROCEDURE)}()
    LANGUAGE SQL
    AS $current186_application_procedure$
      SELECT ${value}
    $current186_application_procedure$
  `);
}

async function readProtectedAclSurface(
  client: PrismaClient,
): Promise<ProtectedAclSurfaceSnapshot> {
  const relations = await client.$queryRaw<
    ProtectedAclSurfaceSnapshot['relations']
  >(Prisma.sql`
    SELECT
      pg_catalog.format(
        '%I."%s"',
        namespace_entry.nspname,
        pg_catalog.replace(relation_entry.relname, '"', '""')
      ) AS "relationIdentity",
      relation_entry.oid::BIGINT AS "relationOid",
      relation_entry.relowner::BIGINT AS "ownerOid",
      relation_entry.relacl IS NULL AS "relationAclIsNull",
      privilege.grantor::BIGINT AS "grantorOid",
      privilege.grantee::BIGINT AS "granteeOid",
      privilege.privilege_type AS privilege,
      privilege.is_grantable AS "isGrantable"
    FROM pg_catalog.pg_class AS relation_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = relation_entry.relnamespace
    LEFT JOIN LATERAL (
      SELECT expanded.*
      FROM pg_catalog.unnest(relation_entry.relacl) AS acl_entry(acl_item)
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_entry.acl_item]::ACLITEM[]
      ) AS expanded
    ) AS privilege ON TRUE
    WHERE namespace_entry.nspname = 'public'
      AND relation_entry.relkind IN ('r', 'p')
      AND relation_entry.relname IN (${Prisma.join(PROTECTED_RELATION_NAMES)})
    ORDER BY relation_entry.relname COLLATE "C",
      privilege.grantor NULLS FIRST,
      privilege.grantee NULLS FIRST,
      privilege.privilege_type COLLATE "C" NULLS FIRST,
      privilege.is_grantable NULLS FIRST
  `);
  const columns = await client.$queryRaw<
    ProtectedAclSurfaceSnapshot['columns']
  >(Prisma.sql`
    SELECT
      pg_catalog.format(
        '%I."%s"',
        namespace_entry.nspname,
        pg_catalog.replace(relation_entry.relname, '"', '""')
      ) AS "relationIdentity",
      relation_entry.oid::BIGINT AS "relationOid",
      attribute_entry.attnum::INTEGER AS "columnNumber",
      attribute_entry.attname AS "columnName",
      attribute_entry.attacl IS NULL AS "columnAclIsNull",
      privilege.grantor::BIGINT AS "grantorOid",
      privilege.grantee::BIGINT AS "granteeOid",
      privilege.privilege_type AS privilege,
      privilege.is_grantable AS "isGrantable"
    FROM pg_catalog.pg_class AS relation_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = relation_entry.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute_entry
      ON attribute_entry.attrelid = relation_entry.oid
     AND attribute_entry.attnum > 0
     AND NOT attribute_entry.attisdropped
    LEFT JOIN LATERAL (
      SELECT expanded.*
      FROM pg_catalog.unnest(attribute_entry.attacl) AS acl_entry(acl_item)
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_entry.acl_item]::ACLITEM[]
      ) AS expanded
    ) AS privilege ON TRUE
    WHERE namespace_entry.nspname = 'public'
      AND relation_entry.relkind IN ('r', 'p')
      AND relation_entry.relname IN (${Prisma.join(PROTECTED_RELATION_NAMES)})
    ORDER BY relation_entry.relname COLLATE "C",
      attribute_entry.attnum,
      privilege.grantor NULLS FIRST,
      privilege.grantee NULLS FIRST,
      privilege.privilege_type COLLATE "C" NULLS FIRST,
      privilege.is_grantable NULLS FIRST
  `);
  if (
    new Set(relations.map((entry) => entry.relationIdentity)).size !== 13 ||
    columns.length < 13
  ) {
    throw new Error('CURRENT186 protected ACL surface is incomplete');
  }
  return { columns, relations };
}

function protectedAclSemanticProjection(
  snapshot: ProtectedAclSurfaceSnapshot,
): {
  columns: ProtectedAclSurfaceSnapshot['columns'];
  relations: Array<{
    nonOwnerPrivileges: Array<{
      granteeOid: bigint;
      grantorOid: bigint;
      isGrantable: boolean;
      privilege: string;
    }>;
    ownerOid: bigint;
    relationIdentity: string;
    relationOid: bigint;
  }>;
} {
  const relations = new Map<
    string,
    {
      nonOwnerPrivileges: Array<{
        granteeOid: bigint;
        grantorOid: bigint;
        isGrantable: boolean;
        privilege: string;
      }>;
      ownerOid: bigint;
      relationIdentity: string;
      relationOid: bigint;
    }
  >();
  for (const row of snapshot.relations) {
    let relation = relations.get(row.relationIdentity);
    if (!relation) {
      relation = {
        nonOwnerPrivileges: [],
        ownerOid: row.ownerOid,
        relationIdentity: row.relationIdentity,
        relationOid: row.relationOid,
      };
      relations.set(row.relationIdentity, relation);
    } else if (
      relation.ownerOid !== row.ownerOid ||
      relation.relationOid !== row.relationOid
    ) {
      throw new Error('CURRENT186 protected relation identity is torn');
    }
    if (
      row.granteeOid !== null &&
      row.granteeOid !== row.ownerOid &&
      row.grantorOid !== null &&
      row.isGrantable !== null &&
      row.privilege !== null
    ) {
      relation.nonOwnerPrivileges.push({
        granteeOid: row.granteeOid,
        grantorOid: row.grantorOid,
        isGrantable: row.isGrantable,
        privilege: row.privilege,
      });
    }
  }
  return {
    columns: snapshot.columns,
    relations: [...relations.values()].map((relation) => ({
      ...relation,
      nonOwnerPrivileges: relation.nonOwnerPrivileges.sort((left, right) => {
        const leftKey = `${left.grantorOid}:${left.granteeOid}:${left.privilege}:${left.isGrantable}`;
        const rightKey = `${right.grantorOid}:${right.granteeOid}:${right.privilege}:${right.isGrantable}`;
        return leftKey.localeCompare(rightKey, 'en');
      }),
    })),
  };
}

function assertAppliedProtectedAclSurface(
  snapshot: ProtectedAclSurfaceSnapshot,
  roleOids: { databaseOwnerOid: number; schemaOwnerOid: number },
): void {
  const ownerByRelation = new Map(
    snapshot.relations.map((entry) => [entry.relationIdentity, entry.ownerOid]),
  );
  expect(ownerByRelation.size).toBe(13);
  for (const relationName of SCHEMA_OWNER_RELATION_NAMES) {
    expect(ownerByRelation.get(`public."${relationName}"`)).toBe(
      BigInt(roleOids.schemaOwnerOid),
    );
  }
  for (const relationName of DATABASE_OWNER_RELATION_NAMES) {
    expect(ownerByRelation.get(`public."${relationName}"`)).toBe(
      BigInt(roleOids.databaseOwnerOid),
    );
  }
  const explicitColumnAuthorities = snapshot.columns.filter(
    (entry) => entry.granteeOid !== null,
  );
  expect(
    explicitColumnAuthorities.filter((entry) => entry.granteeOid === 0n),
  ).toEqual([]);
  const schemaOwnerAuthorities = explicitColumnAuthorities.filter(
    (entry) => entry.granteeOid === BigInt(roleOids.schemaOwnerOid),
  );
  expect(schemaOwnerAuthorities).toHaveLength(39);
  expect(
    schemaOwnerAuthorities.every(
      (entry) =>
        entry.grantorOid === BigInt(roleOids.databaseOwnerOid) &&
        entry.isGrantable === false &&
        new Set(['SELECT', 'UPDATE']).has(entry.privilege ?? ''),
    ),
  ).toBe(true);
  expect(explicitColumnAuthorities).toEqual(schemaOwnerAuthorities);
}

async function readApplicationAuthoritySurface(
  client: PrismaClient,
  workerRoleOid: number,
): Promise<ApplicationAuthoritySurfaceSnapshot> {
  const schemas = await client.$queryRaw<
    ApplicationAuthoritySurfaceSnapshot['schemas']
  >(Prisma.sql`
    SELECT
      namespace_entry.nspname AS name,
      COALESCE(
        pg_catalog.array_agg(
          privilege.privilege_type || ':' || privilege.is_grantable::TEXT
          ORDER BY privilege.privilege_type COLLATE "C",
            privilege.is_grantable
        ) FILTER (WHERE privilege.grantee = 0::OID),
        ARRAY[]::TEXT[]
      ) AS "publicPrivileges"
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        namespace_entry.nspacl,
        pg_catalog.acldefault('n', namespace_entry.nspowner)
      )
    ) AS privilege
    WHERE namespace_entry.nspname IN (${Prisma.join([
      APPLICATION_SCHEMA,
      'public',
    ])})
    GROUP BY namespace_entry.nspname
    ORDER BY namespace_entry.nspname COLLATE "C"
  `);
  const routines = await client.$queryRaw<
    ApplicationAuthoritySurfaceSnapshot['routines']
  >(Prisma.sql`
    SELECT
      routine_entry.prokind::TEXT AS kind,
      routine_entry.proname AS name,
      routine_entry.oid::BIGINT AS oid,
      EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            routine_entry.proacl,
            pg_catalog.acldefault('f', routine_entry.proowner)
          )
        ) AS privilege
        WHERE privilege.grantee = 0::OID
          AND privilege.privilege_type = 'EXECUTE'
      ) AS "publicExecute",
      pg_catalog.has_function_privilege(
        ${workerRoleOid}::OID,
        routine_entry.oid,
        'EXECUTE'
      ) AS "workerExecute"
    FROM pg_catalog.pg_proc AS routine_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = routine_entry.pronamespace
    WHERE namespace_entry.nspname = 'public'
      AND routine_entry.proname IN (${Prisma.join(APPLICATION_ROUTINE_NAMES)})
    ORDER BY routine_entry.proname COLLATE "C"
  `);
  if (schemas.length !== 2 || routines.length !== 3) {
    throw new Error('CURRENT186 application authority surface is incomplete');
  }
  return { routines, schemas };
}

async function readPublicSchemaOwner(
  client: PrismaClient,
): Promise<PublicSchemaOwner> {
  const [owner] = await client.$queryRaw<PublicSchemaOwner[]>(Prisma.sql`
    SELECT owner_role.rolname AS name, owner_role.oid::BIGINT AS oid
    FROM pg_catalog.pg_namespace AS namespace_entry
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = namespace_entry.nspowner
    WHERE namespace_entry.nspname = 'public'
  `);
  if (!owner) throw new Error('CURRENT186 public schema owner is unavailable');
  return owner;
}

async function readSchemaOwnerApplicationSupportAclCount(
  client: PrismaClient,
  schemaOwnerRoleOid: number,
): Promise<bigint> {
  const [row] = await client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT pg_catalog.count(*)::BIGINT AS count
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, ARRAY[]::ACLITEM[])
    ) AS privilege
    WHERE namespace_entry.nspname = ${APPLICATION_SCHEMA}
      AND privilege.grantee = ${schemaOwnerRoleOid}::OID
  `);
  if (!row) {
    throw new Error('CURRENT186 schema-owner support ACL count is unavailable');
  }
  return row.count;
}

async function readReplaceableProtectedIndex(
  client: PrismaClient,
): Promise<ReplaceableProtectedIndex> {
  const protectedRelations = [
    'IdentityMailDeliveryEvent',
    'IdentityMailDeliveryTenantEnrollment',
    'IdentityMailDeliveryTenantEnrollmentCommand',
    'IdentityMailDeliveryTenantEnrollmentEvent',
    'IdentityMailDutyRoleAclEpochV1',
    'IdentityMailDutyRoleManifestEvidenceV2',
    'IdentityMailDutyRoleManifestRevocationV2',
    'IdentityMailOutbox',
    '_prisma_migrations',
  ] as const;
  const [index] = await client.$queryRaw<
    Array<{
      definition: string;
      indexName: string;
      indexNamespace: string;
      relationName: string;
      relationNamespace: string;
    }>
  >(Prisma.sql`
    SELECT
      pg_catalog.pg_get_indexdef(index_relation.oid) AS definition,
      index_relation.relname AS "indexName",
      index_namespace.nspname AS "indexNamespace",
      protected_relation.relname AS "relationName",
      relation_namespace.nspname AS "relationNamespace"
    FROM pg_catalog.pg_index AS index_entry
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_entry.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_class AS protected_relation
      ON protected_relation.oid = index_entry.indrelid
    JOIN pg_catalog.pg_namespace AS relation_namespace
      ON relation_namespace.oid = protected_relation.relnamespace
    LEFT JOIN pg_catalog.pg_constraint AS constraint_entry
      ON constraint_entry.conindid = index_entry.indexrelid
    WHERE relation_namespace.nspname = 'public'
      AND protected_relation.relname IN (${Prisma.join(protectedRelations)})
      AND constraint_entry.oid IS NULL
      AND index_entry.indisvalid
      AND index_entry.indisready
    ORDER BY protected_relation.relname COLLATE "C",
      index_relation.relname COLLATE "C"
    LIMIT 1
  `);
  if (!index || index.definition.length === 0) {
    throw new Error('CURRENT186 replaceable protected index is unavailable');
  }
  return {
    definition: index.definition,
    identity: `${quotePgIdentifier(index.indexNamespace)}.${quotePgIdentifier(index.indexName)}`,
    name: index.indexName,
    relationIdentity: `${quotePgIdentifier(index.relationNamespace)}.${quotePgIdentifier(index.relationName)}`,
  };
}

function exactCreateRoleSql(roleName: string, canLogin: boolean): string {
  assertExactRoleName(roleName);
  return `CREATE ROLE "${roleName}" ${canLogin ? 'LOGIN' : 'NOLOGIN'} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1`;
}

async function readExactRoleIdentity(
  client: PrismaClient,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
): Promise<RoleIdentity> {
  assertExactRoleName(roleName);
  const [role] = await client.$queryRaw<Array<{ name: string; oid: bigint }>>(
    Prisma.sql`
      SELECT role_entry.rolname AS name, role_entry.oid::BIGINT AS oid
      FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.rolname = ${roleName}
    `,
  );
  if (!role || role.name !== roleName || role.oid > 4_294_967_295n) {
    throw new Error('Exact CURRENT186 role identity is unavailable');
  }
  return { name: roleName, oid: Number(role.oid) };
}

async function readRolePasswordIsNull(
  client: PrismaClient,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
): Promise<boolean> {
  assertExactRoleName(roleName);
  const [role] = await client.$queryRaw<Array<{ passwordIsNull: boolean }>>(
    Prisma.sql`
      SELECT role_entry.rolpassword IS NULL AS "passwordIsNull"
      FROM pg_catalog.pg_authid AS role_entry
      WHERE role_entry.rolname = ${roleName}
    `,
  );
  if (!role) throw new Error('CURRENT186 role password state is unavailable');
  return role.passwordIsNull;
}

async function readExactRoleContainmentState(
  client: PrismaClient,
  databaseOid: bigint,
): Promise<ExactRoleContainmentState[]> {
  if (databaseOid < 1n || databaseOid > 4_294_967_295n) {
    throw new Error('CURRENT186 containment database OID is invalid');
  }
  return client.$queryRaw<ExactRoleContainmentState[]>(Prisma.sql`
    SELECT
      role_entry.rolname AS name,
      role_entry.rolcanlogin AS "canLogin",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = role_entry.oid
           OR membership.roleid = role_entry.oid
      ) AS "membershipCount",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_db_role_setting AS setting
        WHERE setting.setrole = role_entry.oid
          AND setting.setdatabase = 0::OID
      ) AS "globalSettingCount",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_db_role_setting AS setting
        WHERE setting.setrole = role_entry.oid
          AND setting.setdatabase = ${databaseOid}::OID
      ) AS "databaseSettingCount"
    FROM pg_catalog.pg_roles AS role_entry
    WHERE role_entry.rolname IN (${Prisma.join(EXACT_ROLE_NAMES)})
    ORDER BY role_entry.rolname COLLATE "C"
  `);
}

function expectedExactRoleContainmentState(
  state: Omit<ExactRoleContainmentState, 'name'>,
): ExactRoleContainmentState[] {
  return [...EXACT_ROLE_NAMES].sort().map((name) => ({ ...state, name }));
}

async function expectExactRoleOids(
  client: PrismaClient,
  roles: readonly RoleIdentity[],
): Promise<void> {
  for (const role of roles) {
    expect(await readExactRoleIdentity(client, role.name)).toEqual(role);
  }
}

function roleOid(
  roles: readonly RoleIdentity[],
  roleName: (typeof EXACT_ROLE_NAMES)[number],
): number {
  const role = roles.find((candidate) => candidate.name === roleName);
  if (!role) throw new Error('Expected CURRENT186 role OID is missing');
  return role.oid;
}

async function assertRoleSafeToDrop(
  client: PrismaClient,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
  expectedOid: number,
): Promise<void> {
  assertExactRoleName(roleName);
  const [safety] = await client.$queryRaw<
    Array<{
      dependencyCount: bigint;
      membershipCount: bigint;
      oid: bigint;
      sessionCount: bigint;
    }>
  >(Prisma.sql`
    SELECT
      role_entry.oid::BIGINT AS oid,
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_stat_activity AS activity
        WHERE activity.usename = role_entry.rolname
      ) AS "sessionCount",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = role_entry.oid
           OR membership.roleid = role_entry.oid
      ) AS "membershipCount",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_shdepend AS dependency
        WHERE dependency.refclassid = 'pg_catalog.pg_authid'::REGCLASS
          AND dependency.refobjid = role_entry.oid
      ) AS "dependencyCount"
    FROM pg_catalog.pg_roles AS role_entry
    WHERE role_entry.rolname = ${roleName}
  `);
  expect(safety).toEqual({
    dependencyCount: 0n,
    membershipCount: 0n,
    oid: BigInt(expectedOid),
    sessionCount: 0n,
  });
}

async function dropCapturedExactRoles(
  client: PrismaClient,
  roles: readonly RoleIdentity[],
): Promise<void> {
  for (const role of [...roles].reverse()) {
    await assertRoleSafeToDrop(client, role.name, role.oid);
    await client.$executeRawUnsafe(`DROP ROLE "${role.name}"`);
  }
}

function assertExactRoleName(
  value: string,
): asserts value is (typeof EXACT_ROLE_NAMES)[number] {
  if (!(EXACT_ROLE_NAMES as readonly string[]).includes(value)) {
    throw new Error('Refusing unsafe CURRENT186 exact-role operation');
  }
}

async function assertRuntimePrivilegeBoundary(
  databaseUrl: string,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
  allowedRoutineSignatures: readonly string[],
): Promise<void> {
  await withSessionAuthorization(databaseUrl, roleName, async (client) => {
    const [snapshot] = await client.$queryRaw<PrivilegeSnapshot[]>(Prisma.sql`
      SELECT
        SESSION_USER AS "sessionUser",
        CURRENT_USER AS "currentUser",
        pg_catalog.has_database_privilege(
          CURRENT_USER,
          pg_catalog.current_database(),
          'CONNECT'
        ) AS "canConnect",
        pg_catalog.has_database_privilege(
          CURRENT_USER,
          pg_catalog.current_database(),
          'CREATE'
        ) AS "canCreateDatabaseObjects",
        pg_catalog.has_database_privilege(
          CURRENT_USER,
          pg_catalog.current_database(),
          'TEMPORARY'
        ) AS "canTemporary",
        pg_catalog.has_schema_privilege(
          CURRENT_USER,
          'public',
          'CREATE'
        ) AS "canCreateSchemaObjects",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND pg_catalog.has_table_privilege(
              CURRENT_USER,
              relation.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
        ) AS "relationPrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_attribute AS attribute
          JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
            AND pg_catalog.has_column_privilege(
              CURRENT_USER,
              relation.oid,
              attribute.attnum,
              'SELECT,INSERT,UPDATE,REFERENCES'
            )
        ) AS "columnPrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_class AS sequence
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = sequence.relnamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND sequence.relkind = 'S'
            AND pg_catalog.has_sequence_privilege(
              CURRENT_USER,
              sequence.oid,
              'USAGE,SELECT,UPDATE'
            )
        ) AS "sequencePrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_type AS type_entry
          CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS acl
          WHERE acl.grantee = (
              SELECT role_entry.oid
              FROM pg_catalog.pg_roles AS role_entry
              WHERE role_entry.rolname = CURRENT_USER
            )
            AND acl.privilege_type = 'USAGE'
        ) AS "directTypeAclCount",
        (
          SELECT pg_catalog.array_agg(routine.oid::BIGINT ORDER BY routine.oid)
          FROM pg_catalog.pg_proc AS routine
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND routine.prokind IN ('f', 'p', 'a', 'w')
            AND pg_catalog.has_function_privilege(
              CURRENT_USER,
              routine.oid,
              'EXECUTE'
            )
        ) AS "executableRoutineOids"
    `);
    if (!snapshot) throw new Error('Runtime privilege snapshot is unavailable');
    expect(snapshot.sessionUser).toBe(roleName);
    expect(snapshot.currentUser).toBe(roleName);
    expect(snapshot).toMatchObject({
      canConnect: true,
      canCreateDatabaseObjects: false,
      canCreateSchemaObjects: false,
      canTemporary: false,
      columnPrivilegeCount: 0n,
      directTypeAclCount: 0n,
      relationPrivilegeCount: 0n,
      sequencePrivilegeCount: 0n,
    });
    const allowedOids = await resolveRoutineOids(
      client,
      allowedRoutineSignatures,
    );
    expect(snapshot.executableRoutineOids ?? []).toEqual(allowedOids);
  });
}

async function withSessionAuthorization<T>(
  databaseUrl: string,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
  callback: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  assertExactRoleName(roleName);
  const client = prismaFor(singleConnectionUrl(databaseUrl));
  await client.$connect();
  let authorizationChanged = false;
  try {
    await client.$executeRawUnsafe(`SET SESSION AUTHORIZATION "${roleName}"`);
    authorizationChanged = true;
    const [identity] = await client.$queryRaw<
      Array<{ currentUser: string; sessionUser: string }>
    >(Prisma.sql`
      SELECT CURRENT_USER AS "currentUser", SESSION_USER AS "sessionUser"
    `);
    expect(identity).toEqual({ currentUser: roleName, sessionUser: roleName });
    return await callback(client);
  } finally {
    if (authorizationChanged) {
      await client.$executeRawUnsafe('RESET SESSION AUTHORIZATION');
    }
    await client.$disconnect();
  }
}

async function createSessionAuthorizationClient(
  databaseUrl: string,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
): Promise<PrismaClient> {
  assertExactRoleName(roleName);
  const client = prismaFor(singleConnectionUrl(databaseUrl));
  await client.$connect();
  try {
    await client.$executeRawUnsafe(`SET SESSION AUTHORIZATION "${roleName}"`);
    const [identity] = await client.$queryRaw<
      Array<{ currentUser: string; sessionUser: string }>
    >(Prisma.sql`
      SELECT CURRENT_USER AS "currentUser", SESSION_USER AS "sessionUser"
    `);
    expect(identity).toEqual({ currentUser: roleName, sessionUser: roleName });
    return client;
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
}

async function resetAndDisconnect(client: PrismaClient): Promise<void> {
  try {
    await client.$executeRawUnsafe('RESET SESSION AUTHORIZATION');
  } finally {
    await client.$disconnect();
  }
}

async function setDriverTransactionGuards(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`);
  await transaction.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
}

async function queryDriverInTransaction(
  transaction: Prisma.TransactionClient,
  evidence: DriverEvidence,
): Promise<Record<string, unknown>> {
  const [row] = await transaction.$queryRaw<
    Array<{ receipt: Prisma.JsonValue }>
  >(Prisma.sql`
    SELECT public."identity_mail_tenant_enrollment_drive_command_v2"(
      ${evidence.tenantId}::TEXT,
      ${evidence.commandId}::TEXT,
      ${evidence.authorizationEnvelopeDigest}::TEXT,
      ${evidence.manifestPayloadDigest}::TEXT
    ) AS receipt
  `);
  if (!row) throw new Error('CURRENT186 driver returned no receipt');
  return requireRecord(row.receipt, 'CURRENT186 driver receipt');
}

async function driveCommand(
  client: PrismaClient,
  evidence: DriverEvidence,
  isolationLevel: Prisma.TransactionIsolationLevel = Prisma
    .TransactionIsolationLevel.ReadCommitted,
): Promise<Record<string, unknown>> {
  return client.$transaction(
    async (transaction) => {
      await setDriverTransactionGuards(transaction);
      return queryDriverInTransaction(transaction, evidence);
    },
    {
      isolationLevel,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

async function driveAsCoordinator(
  databaseUrl: string,
  evidence: DriverEvidence,
): Promise<Record<string, unknown>> {
  return withSessionAuthorization(
    databaseUrl,
    COORDINATOR_ROLE,
    async (client) => driveCommand(client, evidence),
  );
}

async function reapAsWorker(
  databaseUrl: string,
  fixture: DriverTenant,
): Promise<number> {
  return withSessionAuthorization(databaseUrl, WORKER_ROLE, async (client) =>
    client.$transaction(
      async (transaction) => {
        await setDriverTransactionGuards(transaction);
        const [row] = await transaction.$queryRaw<
          Array<{ receipt: Prisma.JsonValue }>
        >(Prisma.sql`
          SELECT public."identity_initial_owner_mail_reap_v2"(
            ${fixture.tenantId}::TEXT,
            ${fixture.providerAuthorityDigest}::TEXT,
            ${fixtureDigest(`current186-worker-${fixture.tenantId}`)}::TEXT,
            100::INTEGER
          ) AS receipt
        `);
        const receipt = requireRecord(
          row?.receipt,
          'CURRENT186 worker reap receipt',
        );
        if (!Number.isSafeInteger(receipt.processed)) {
          throw new Error('CURRENT186 worker reap count is invalid');
        }
        return receipt.processed as number;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 30_000,
      },
    ),
  );
}

async function queryJsonReceiptTransaction(
  client: PrismaClient,
  query: Prisma.Sql,
  label: string,
): Promise<Record<string, unknown>> {
  return client.$transaction(
    async (transaction) => {
      await setDriverTransactionGuards(transaction);
      const [row] =
        await transaction.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
          query,
        );
      return requireRecord(row?.receipt, label);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

async function exerciseWorkerDeliveryLifecycle(
  databaseUrl: string,
  fixture: DriverTenant,
): Promise<WorkerDeliveryLifecycle> {
  const leaseOwnerDigest = fixtureDigest(
    `current186-lease-owner-${fixture.outboxId}`,
  );
  const leaseTokenDigest = fixtureDigest(
    `current186-lease-token-${fixture.outboxId}`,
  );
  const providerAttemptKey = randomUUID();
  const messageIdDigest = fixtureDigest(
    `current186-message-id-${fixture.outboxId}`,
  );
  const terminalAckDigest = fixtureDigest(
    `current186-terminal-ack-${fixture.outboxId}`,
  );
  const evidenceDigest = fixtureDigest(
    `current186-reconcile-evidence-${fixture.outboxId}`,
  );
  const actorDigest = fixtureDigest(
    `current186-reconcile-actor-${fixture.outboxId}`,
  );
  if (leaseOwnerDigest === leaseTokenDigest || evidenceDigest === actorDigest) {
    throw new Error('CURRENT186 lifecycle fixture digests are not independent');
  }

  return withSessionAuthorization(databaseUrl, WORKER_ROLE, async (worker) => {
    const claim = await queryJsonReceiptTransaction(
      worker,
      Prisma.sql`
        SELECT public."identity_initial_owner_mail_claim_v2"(
          ${fixture.tenantId}::TEXT,
          ${leaseOwnerDigest}::TEXT,
          ${leaseTokenDigest}::TEXT,
          ${fixture.providerAuthorityDigest}::TEXT
        ) AS receipt
      `,
      'CURRENT186 worker claim receipt',
    );
    const providerMarkQuery = Prisma.sql`
      SELECT public."identity_initial_owner_mail_provider_mark_v2"(
        ${fixture.tenantId}::TEXT,
        ${fixture.outboxId}::TEXT,
        1::INTEGER,
        ${leaseOwnerDigest}::TEXT,
        ${leaseTokenDigest}::TEXT,
        ${providerAttemptKey}::TEXT,
        ${fixture.providerAuthorityDigest}::TEXT,
        ${messageIdDigest}::TEXT
      ) AS receipt
    `;
    const providerMark = await queryJsonReceiptTransaction(
      worker,
      providerMarkQuery,
      'CURRENT186 worker provider-mark receipt',
    );
    const providerMarkReplay = await queryJsonReceiptTransaction(
      worker,
      providerMarkQuery,
      'CURRENT186 worker provider-mark replay receipt',
    );
    const completeQuery = Prisma.sql`
      SELECT public."identity_initial_owner_mail_complete_v2"(
        ${fixture.tenantId}::TEXT,
        ${fixture.outboxId}::TEXT,
        1::INTEGER,
        ${leaseOwnerDigest}::TEXT,
        ${leaseTokenDigest}::TEXT,
        ${fixture.providerAuthorityDigest}::TEXT,
        'PROVIDER_AMBIGUOUS'::TEXT,
        NULL::TEXT,
        ${terminalAckDigest}::TEXT
      ) AS receipt
    `;
    const complete = await queryJsonReceiptTransaction(
      worker,
      completeQuery,
      'CURRENT186 worker completion receipt',
    );
    const completeReplay = await queryJsonReceiptTransaction(
      worker,
      completeQuery,
      'CURRENT186 worker completion replay receipt',
    );
    return {
      actorDigest,
      claim,
      complete,
      completeReplay,
      evidenceDigest,
      leaseOwnerDigest,
      leaseTokenDigest,
      providerMark,
      providerMarkReplay,
    };
  });
}

async function reconcileDeliveryLifecycle(
  client: PrismaClient,
  fixture: DriverTenant,
  lifecycle: WorkerDeliveryLifecycle,
  resolution: 'DEAD' | 'SENT',
): Promise<Record<string, unknown>> {
  const transitionRevision = lifecycle.complete.transitionRevision;
  if (
    typeof transitionRevision !== 'number' ||
    !Number.isSafeInteger(transitionRevision) ||
    transitionRevision < 1
  ) {
    throw new Error(
      'CURRENT186 lifecycle completion transition revision is invalid',
    );
  }
  return queryJsonReceiptTransaction(
    client,
    Prisma.sql`
      SELECT public."identity_initial_owner_mail_reconcile_v2"(
        ${fixture.tenantId}::TEXT,
        ${fixture.outboxId}::TEXT,
        ${transitionRevision}::BIGINT,
        ${resolution}::TEXT,
        ${lifecycle.evidenceDigest}::TEXT,
        ${lifecycle.actorDigest}::TEXT
      ) AS receipt
    `,
    'CURRENT186 owner reconciliation receipt',
  );
}

async function readBackendPid(client: PrismaClient): Promise<number> {
  const [row] = await client.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
    SELECT pg_catalog.pg_backend_pid()::INTEGER AS pid
  `);
  if (!row || !Number.isInteger(row.pid) || row.pid < 1) {
    throw new Error('CURRENT186 backend PID is unavailable');
  }
  return row.pid;
}

async function waitForAdvisoryWait(
  observer: PrismaClient,
  pid: number,
  earlyOutcome?: Promise<
    | { status: 'fulfilled'; value: unknown }
    | { reason: unknown; status: 'rejected' }
  >,
): Promise<{
  query: string;
  state: string;
  waitEvent: string | null;
  waitEventType: string | null;
}> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [row] = await observer.$queryRaw<
      Array<{
        query: string;
        state: string;
        waitEvent: string | null;
        waitEventType: string | null;
      }>
    >(Prisma.sql`
      SELECT
        activity.query,
        activity.state,
        activity.wait_event AS "waitEvent",
        activity.wait_event_type AS "waitEventType"
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${pid}
    `);
    if (row?.waitEventType === 'Lock' && row.waitEvent === 'advisory') {
      return row;
    }
    if (earlyOutcome) {
      const signal = await Promise.race([
        earlyOutcome.then((outcome) => ({ kind: 'outcome' as const, outcome })),
        new Promise<{ kind: 'delay' }>((resolveDelay) =>
          setTimeout(() => resolveDelay({ kind: 'delay' }), 25),
        ),
      ]);
      if (signal.kind === 'outcome') {
        throw new Error(
          `CURRENT186 waiter completed before exposing an advisory lock wait: ${JSON.stringify(
            promiseOutcomeDiagnostic(signal.outcome, 0),
          )}`,
        );
      }
    } else {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
  }
  throw new Error('CURRENT186 waiter did not expose an advisory lock wait');
}

async function waitForBackendActivity(
  observer: PrismaClient,
  pid: number,
  queryPattern: string,
  expectedUserName: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await observer.$queryRaw<
      Array<{ query: string; state: string; userName: string }>
    >(Prisma.sql`
      SELECT
        activity.query,
        activity.state,
        activity.usename AS "userName"
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${pid}
    `);
    if (
      activity?.state === 'active' &&
      activity.query.includes(queryPattern) &&
      activity.userName === expectedUserName
    ) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error('CURRENT186 runtime backend did not become active');
}

async function waitForBackendExit(
  observer: PrismaClient,
  pid: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [activity] = await observer.$queryRaw<Array<{ present: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_stat_activity AS activity
          WHERE activity.pid = ${pid}
        ) AS present
      `,
    );
    if (activity?.present === false) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error('CURRENT186 terminated runtime backend remained visible');
}

async function terminateBackendIfPresent(
  observer: PrismaClient,
  pid: number,
): Promise<void> {
  await observer.$queryRaw(Prisma.sql`
    SELECT pg_catalog.pg_terminate_backend(activity.pid)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.pid = ${pid}
      AND activity.pid <> pg_catalog.pg_backend_pid()
  `);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolveValue) => {
    resolvePromise = resolveValue;
  });
  if (!resolvePromise) throw new Error('CURRENT186 deferred is unavailable');
  return { promise, resolve: resolvePromise };
}

async function captureOutcome<T>(
  operation: Promise<T>,
): Promise<
  { status: 'fulfilled'; value: T } | { reason: unknown; status: 'rejected' }
> {
  try {
    return { status: 'fulfilled', value: await operation };
  } catch (reason) {
    return { reason, status: 'rejected' };
  }
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

async function resolveRoutineOids(
  client: PrismaClient,
  signatures: readonly string[],
): Promise<bigint[]> {
  const result: bigint[] = [];
  for (const signature of signatures) {
    const [row] = await client.$queryRaw<Array<{ oid: bigint }>>(
      Prisma.sql`
        SELECT pg_catalog.to_regprocedure(${signature})::OID::BIGINT AS oid
      `,
    );
    if (!row?.oid) throw new Error('Allowed routine OID is unavailable');
    result.push(row.oid);
  }
  return result.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

async function prepareDriverTenant(input: {
  admin: PrismaClient;
  assertDeploymentSessionDenied?: boolean;
  coordinatorRoleOid: number;
  databaseName: string;
  databaseOid: number;
  databaseUrl: string;
  evidenceProvenance: EvidenceProvenance;
  grantsProjection: unknown;
  marker: MarkerFixture;
  reuseDisable?: boolean;
  status: 'HOLD' | 'PENDING';
  validForMs?: number;
  workerRoleOid: number;
}): Promise<DriverTenant> {
  if (input.grantsProjection === undefined) {
    throw new Error('CURRENT186 live grants projection is unavailable');
  }
  const tenantId = randomUUID();
  await ensureDriverTenant(input.admin, tenantId);
  const common = {
    actualContextDigest: input.marker.actualContextDigest,
    coordinatorRoleName: COORDINATOR_ROLE,
    coordinatorRoleOid: input.coordinatorRoleOid,
    databaseIdentityDigest: input.marker.databaseIdentityDigest,
    databaseName: input.databaseName,
    databaseOid: input.databaseOid,
    deploymentMarkerDigest: input.marker.payloadDigest,
    deploymentMarkerId: input.marker.id,
    grantsProjection: input.grantsProjection,
    tenantId,
    workerRoleName: WORKER_ROLE,
    workerRoleOid: input.workerRoleOid,
  };
  const enable = buildEvidenceFixture({
    ...common,
    commandId: randomUUID(),
    manifestId: randomUUID(),
    requestId: randomUUID(),
    scenario: 'ENABLE_ABSENT',
    validForMs: 30_000,
  });
  await importEvidenceFixture(input.admin, enable, input.evidenceProvenance);
  if (input.assertDeploymentSessionDenied) {
    const beforeDeniedCall = await readDriverTenantStateDigest(
      input.admin,
      tenantId,
    );
    await expectSqlStateAndMessage(
      driveCommand(input.admin, driverEvidence(enable)),
      '42501',
      /Identity-mail enrollment driver live duty-role binding drifted/u,
    );
    expect(await readDriverTenantStateDigest(input.admin, tenantId)).toBe(
      beforeDeniedCall,
    );
  }
  const enabled = await driveAsCoordinator(
    input.databaseUrl,
    driverEvidence(enable),
  );
  expect(enabled).toMatchObject({
    decision: 'COMPLETED',
    phase: 'FINALIZE',
    state: 'ACTIVE',
    stateRevision: 1,
  });

  const outboxId = await insertDriverOutbox(
    input.admin,
    tenantId,
    input.status,
  );
  const disable = buildEvidenceFixture({
    ...common,
    commandId: randomUUID(),
    manifestId: randomUUID(),
    requestId: randomUUID(),
    ...(input.reuseDisable
      ? { reuseCommandId: randomUUID(), reuseRequestId: randomUUID() }
      : {}),
    scenario: 'DISABLE_ACTIVE',
    validForMs: input.validForMs ?? 30_000,
  });
  await importEvidenceFixture(input.admin, disable, input.evidenceProvenance);
  if (disable.reuse) {
    await importEvidenceFixture(
      input.admin,
      disable.reuse,
      input.evidenceProvenance,
    );
  }
  return {
    disable: driverEvidence(disable),
    outboxId,
    providerAuthorityDigest: '5'.repeat(64),
    ...(disable.reuse ? { reusedDisable: driverEvidence(disable.reuse) } : {}),
    status: input.status,
    tenantId,
  };
}

async function readDriverTenantStateDigest(
  client: PrismaClient,
  tenantId: string,
): Promise<string> {
  const [row] = await client.$queryRaw<Array<{ digest: string }>>(Prisma.sql`
    WITH state_rows(payload) AS (
      SELECT 'TENANT|' || pg_catalog.to_jsonb(tenant_row)::TEXT
      FROM public."Tenant" AS tenant_row
      WHERE tenant_row."id" = ${tenantId}

      UNION ALL
      SELECT 'ENROLLMENT|' || pg_catalog.to_jsonb(enrollment_row)::TEXT
      FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment_row
      WHERE enrollment_row."tenantId" = ${tenantId}

      UNION ALL
      SELECT 'COMMAND|' || pg_catalog.to_jsonb(command_row)::TEXT
      FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command_row
      WHERE command_row."tenantId" = ${tenantId}

      UNION ALL
      SELECT 'EVENT|' || pg_catalog.to_jsonb(event_row)::TEXT
      FROM public."IdentityMailDeliveryTenantEnrollmentEvent" AS event_row
      WHERE event_row."tenantId" = ${tenantId}

      UNION ALL
      SELECT 'OUTBOX|' || pg_catalog.to_jsonb(outbox_row)::TEXT
      FROM public."IdentityMailOutbox" AS outbox_row
      WHERE outbox_row."tenantId" = ${tenantId}

      UNION ALL
      SELECT 'MANIFEST|' || pg_catalog.to_jsonb(manifest_row)::TEXT
      FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest_row
      JOIN public."IdentityMailDeliveryTenantEnrollmentCommand" AS command_row
        ON command_row."id" = manifest_row."importedCommandId"
      WHERE command_row."tenantId" = ${tenantId}

      UNION ALL
      SELECT 'ACL_EPOCH|' || pg_catalog.to_jsonb(epoch_row)::TEXT
      FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch_row
    )
    SELECT pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          COALESCE(
            pg_catalog.string_agg(
              state_rows.payload,
              E'\\n'
              ORDER BY state_rows.payload COLLATE "C"
            ),
            ''
          ),
          'UTF8'
        )
      ),
      'hex'
    ) AS digest
    FROM state_rows
  `);
  if (!row || !/^[0-9a-f]{64}$/u.test(row.digest)) {
    throw new Error('CURRENT186 driver state digest is unavailable');
  }
  return row.digest;
}

function buildEvidenceFixture(input: {
  actualContextDigest: string;
  commandId: string;
  coordinatorRoleName: string;
  coordinatorRoleOid: number;
  databaseIdentityDigest: string;
  databaseName: string;
  databaseOid: number;
  deploymentMarkerDigest: string;
  deploymentMarkerId: string;
  grantsProjection: unknown;
  manifestId: string;
  requestId: string;
  reuseCommandId?: string;
  reuseRequestId?: string;
  scenario: EvidenceScenario;
  tenantId: string;
  validForMs: number;
  workerRoleName: string;
  workerRoleOid: number;
}): EvidenceFixture {
  const repositoryRoot = resolve(__dirname, '../../..');
  const fixtureScript = resolve(
    repositoryRoot,
    'packages/database/scripts/identity-mail-enrollment-evidence-current185-fixture.mjs',
  );
  const output = execFileSync(process.execPath, [fixtureScript], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input: JSON.stringify(input),
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  return requireEvidenceFixture(JSON.parse(output) as unknown);
}

function requireEvidenceFixture(value: unknown): EvidenceFixture {
  const record = requireRecord(value, 'CURRENT186 evidence fixture');
  const bundle = requireRecord(
    record.bundle,
    'CURRENT186 evidence fixture bundle',
  );
  return {
    bundle: {
      authorizationEnvelopeDigest: requireString(
        bundle.authorizationEnvelopeDigest,
      ),
      commandId: requireString(bundle.commandId),
      manifestId: requireString(bundle.manifestId),
      manifestPayloadDigest: requireString(bundle.manifestPayloadDigest),
      requestId: requireString(bundle.requestId),
      tenantId: requireString(bundle.tenantId),
    },
    bundleCanonicalJson: requireString(record.bundleCanonicalJson),
    bundleDigest: requireString(record.bundleDigest),
    expiresAt: requireString(record.expiresAt),
    ...(record.reuse === undefined
      ? {}
      : { reuse: requireEvidenceFixture(record.reuse) }),
  };
}

function driverEvidence(fixture: EvidenceFixture): DriverEvidence {
  return {
    authorizationEnvelopeDigest: fixture.bundle.authorizationEnvelopeDigest,
    commandId: fixture.bundle.commandId,
    expiresAt: fixture.expiresAt,
    manifestPayloadDigest: fixture.bundle.manifestPayloadDigest,
    tenantId: fixture.bundle.tenantId,
  };
}

async function importEvidenceFixture(
  client: PrismaClient,
  fixture: EvidenceFixture,
  provenance: EvidenceProvenance,
): Promise<void> {
  const receipt = await client.$transaction(
    async (transaction) => {
      await setDriverTransactionGuards(transaction);
      const [row] = await transaction.$queryRaw<
        Array<{ receipt: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT public."identity_mail_tenant_enrollment_import_evidence_v2"(
          ${fixture.bundleCanonicalJson}::TEXT,
          ${fixture.bundleDigest}::TEXT
        ) AS receipt
      `);
      return requireRecord(row?.receipt, 'CURRENT186 evidence import');
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
  expect(receipt).toMatchObject({
    authorization: false,
    canMutate: false,
    canSend: false,
    commandId: fixture.bundle.commandId,
    manifestPayloadDigest: fixture.bundle.manifestPayloadDigest,
  });
  recordEvidenceProvenance(provenance, fixture);
}

function recordEvidenceProvenance(
  provenance: EvidenceProvenance,
  fixture: EvidenceFixture,
): void {
  if (
    provenance.commands.some(
      (command) => command.commandId === fixture.bundle.commandId,
    )
  ) {
    throw new Error('CURRENT186 evidence command provenance was duplicated');
  }
  provenance.commands.push({
    authorizationEnvelopeDigest: fixture.bundle.authorizationEnvelopeDigest,
    commandId: fixture.bundle.commandId,
    manifestId: fixture.bundle.manifestId,
    manifestPayloadDigest: fixture.bundle.manifestPayloadDigest,
    requestId: fixture.bundle.requestId,
    tenantId: fixture.bundle.tenantId,
  });

  const existingManifest = provenance.manifests.find(
    (manifest) =>
      manifest.payloadDigest === fixture.bundle.manifestPayloadDigest,
  );
  if (existingManifest) {
    if (existingManifest.manifestId !== fixture.bundle.manifestId) {
      throw new Error(
        'CURRENT186 reused evidence manifest identity drifted for one payload digest',
      );
    }
    return;
  }
  provenance.manifests.push({
    importedCommandId: fixture.bundle.commandId,
    manifestId: fixture.bundle.manifestId,
    payloadDigest: fixture.bundle.manifestPayloadDigest,
  });
}

async function ensureDriverTenant(
  client: PrismaClient,
  tenantId: string,
): Promise<void> {
  const now = new Date();
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public."Tenant" (
      "id", "name", "slug", "status", "customerStage",
      "onboardingStatus", "trialStartsAt", "trialEndsAt",
      "entitlementProfileRevision", "executionRevision",
      "statusChangedAt", "statusReason", "updatedAt"
    ) VALUES (
      ${tenantId}, 'CURRENT186 driver fixture',
      ${`current186-ci-${tenantId.replaceAll('-', '')}`},
      'ACTIVE'::public."TenantLifecycleStatus",
      'PILOT'::public."TenantCustomerStage",
      'OWNER_INVITED'::public."TenantOnboardingStatus",
      ${now}, ${new Date(now.valueOf() + 86_400_000)}, 1, 1, ${now},
      'Disposable CURRENT186 driver fixture', ${now}
    )
  `);
}

async function insertDriverOutbox(
  client: PrismaClient,
  tenantId: string,
  status: 'HOLD' | 'PENDING',
): Promise<string> {
  const suffix = randomUUID();
  const email = `current186-${suffix}@example.test`;
  const inviteId = randomUUID();
  const issueCommandId = randomUUID();
  const outboxId = randomUUID();
  const messageKey = randomUUID();
  const workflowLocator = randomUUID();
  const issueRequestDigest = fixtureDigest(`current186-issue-${suffix}`);
  const tokenHash = fixtureDigest(`current186-token-${suffix}`);
  const now = new Date();
  const expiresAt = new Date(now.valueOf() + 86_400_000);
  const releasedAt = status === 'PENDING' ? now : null;
  await client.$transaction(async (transaction) => {
    // Only disposable business rows are seeded this way. Signed command and
    // manifest evidence always enters through the immutable CURRENT185 RPC.
    await transaction.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."UserInvite" (
        "id", "tenantId", "email", "role", "accessScope",
        "customRoleId", "storeIds", "tokenHash", "expiresAt",
        "acceptedAt", "acceptedByUserId", "createdByUserId", "revokedAt",
        "revokedByUserId", "identityClaimRevision", "createdAt", "updatedAt"
      ) VALUES (
        ${inviteId}, ${tenantId}, ${email}, 'OWNER'::public."UserRole",
        'NETWORK'::public."UserAccessScope", NULL, ARRAY[]::TEXT[],
        ${tokenHash}, ${expiresAt}, NULL, NULL, NULL, NULL, NULL, 2,
        ${now}, ${now}
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical", "claimType", "tenantId", "subjectId",
        "workflowLocator", "revision", "createdAt", "updatedAt"
      ) VALUES (
        ${email}, 'INVITE'::public."IdentityEmailClaimType", ${tenantId},
        ${inviteId}, ${workflowLocator}, 2, ${now}, ${now}
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityOwnerInviteIssueCommand" (
        "id", "tenantId", "action", "requestId", "issueRequestDigest",
        "aadEnvironment", "workflowLocator", "reservationSubjectId",
        "reservationClaimRevision", "inviteId", "outboxId", "messageKey",
        "tokenHash", "tokenDigestVersion", "template", "envelopeVersion",
        "keyVersion", "expiresAt", "claimRevision", "createdAt"
      ) VALUES (
        ${issueCommandId}, ${tenantId}, 'ISSUE_INITIAL_OWNER_INVITE',
        ${randomUUID()}, ${issueRequestDigest}, 'current186-ci',
        ${workflowLocator}, ${workflowLocator}, 1, ${inviteId}, ${outboxId},
        ${messageKey}, ${tokenHash}, 'sha256-v1',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate", 1, 'v1',
        ${expiresAt}, 2, ${now}
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailOutbox" (
        "id", "tenantId", "issueCommandId", "inviteId", "workflowLocator",
        "aadEnvironment", "template", "status", "messageKey",
        "issueRequestDigest", "tokenHash", "tokenDigestVersion",
        "secretCiphertext", "envelopeVersion", "keyVersion", "expiresAt",
        "releasedAt", "attempts", "leaseVersion", "transitionRevision",
        "availableAt", "createdAt", "updatedAt"
      ) VALUES (
        ${outboxId}, ${tenantId}, ${issueCommandId}, ${inviteId},
        ${workflowLocator}, 'current186-ci',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
        ${status}::public."IdentityMailOutboxStatus", ${messageKey},
        ${issueRequestDigest}, ${tokenHash}, 'sha256-v1',
        ${Buffer.alloc(71, 186)}, 1, 'v1', ${expiresAt}, ${releasedAt}, 0, 0,
        ${status === 'PENDING' ? 1n : 0n}, ${releasedAt}, ${now}, ${now}
      )
    `);
  });
  return outboxId;
}

async function revokeManifest(
  client: PrismaClient,
  manifestPayloadDigest: string,
): Promise<void> {
  await client.$transaction(async (transaction) => {
    await setDriverTransactionGuards(transaction);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailDutyRoleManifestRevocationV2" (
        "manifestPayloadDigest", "reasonDigest", "evidenceDigest",
        "revokedAt", "revokedTransactionId"
      ) VALUES (
        ${manifestPayloadDigest},
        ${fixtureDigest(`current186-revocation-reason-${manifestPayloadDigest}`)},
        ${fixtureDigest(`current186-revocation-evidence-${manifestPayloadDigest}`)},
        pg_catalog.clock_timestamp(),
        pg_catalog.pg_current_xact_id()::TEXT
      )
    `);
  });
}

async function waitUntilDatabaseClockAtOrAfter(
  client: PrismaClient,
  isoTimestamp: string,
): Promise<void> {
  const expiresAt = new Date(isoTimestamp);
  const delayMs = expiresAt.valueOf() - Date.now();
  if (!Number.isFinite(delayMs) || delayMs > 35_000) {
    throw new Error('CURRENT186 expiry wait is outside the fixture bound');
  }
  await client.$queryRaw(Prisma.sql`
    SELECT pg_catalog.pg_sleep(
      GREATEST(
        0::DOUBLE PRECISION,
        EXTRACT(
          EPOCH FROM (${expiresAt}::TIMESTAMPTZ - pg_catalog.clock_timestamp())
        )::DOUBLE PRECISION
      )
    )::TEXT AS "sleepResult"
  `);
  const [boundary] = await client.$queryRaw<
    Array<{ equalityIsExpired: boolean; reached: boolean }>
  >(Prisma.sql`
    SELECT
      ${expiresAt}::TIMESTAMPTZ >= ${expiresAt}::TIMESTAMPTZ
        AS "equalityIsExpired",
      pg_catalog.clock_timestamp() >= ${expiresAt}::TIMESTAMPTZ AS reached
  `);
  expect(boundary).toEqual({ equalityIsExpired: true, reached: true });
}

async function insertReleaseMarker(
  client: PrismaClient,
  marker: MarkerFixture,
  coordinatorRoleOid: number,
): Promise<void> {
  const buildProvenanceId = randomUUID();
  const challengeId = randomUUID();
  const deployedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const validUntil = new Date(deployedAt.valueOf() + 60 * 60 * 1000);
  const buildPayloadDigest = fixtureDigest('current186-build-payload');
  const deploymentInstanceDigest = fixtureDigest(
    'current186-deployment-instance',
  );
  const databaseChallengeDigest = fixtureDigest(
    'current186-database-challenge',
  );
  const predecessorMarkerDigest = fixtureDigest(
    'current186-predecessor-marker',
  );
  const signingKeyId = 'current186-ci-release-marker';
  const publicKeyFingerprint = fixtureDigest('current186-release-public-key');
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
    environment: 'current186-ci',
    deploymentInstanceDigest,
    databaseIdentityDigest: marker.databaseIdentityDigest,
    databaseChallengeDigest,
    actualContextDigest: marker.actualContextDigest,
    activationDatabaseRole: COORDINATOR_ROLE,
    coordinatorRoleName: COORDINATOR_ROLE,
    coordinatorRoleOid,
    predecessorMarkerDigest,
    signingKeyId,
    publicKeyFingerprint,
    deployedAtEpochMs: deployedAt.valueOf(),
    validUntilEpochMs: validUntil.valueOf(),
  };
  const payloadJson = JSON.stringify(payload);
  expect(payloadJson).not.toMatch(/(?:@|email|phone|password|secret|token)/iu);
  await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO public."SharedBetaRuntimeReleaseMarker" (
        "id", "buildProvenanceId", "challengeId", "generation",
        "environment", "buildPayloadDigest", "deploymentInstanceDigest",
        "databaseIdentityDigest", "databaseChallengeDigest",
        "actualContextDigest", "schemaHead", "migrationCount",
        "migrationManifestDigest", "activationDatabaseRole",
        "coordinatorRoleName", "coordinatorRoleOid", "predecessorMarkerId",
        "predecessorMarkerDigest", "payload", "payloadDigest",
        "signingKeyId", "publicKeyFingerprint", "signatureBase64url",
        "deployedAt", "validUntil"
      ) VALUES (
        ${marker.id}, ${buildProvenanceId}, ${challengeId}, 1,
        'current186-ci', ${buildPayloadDigest}, ${deploymentInstanceDigest},
        ${marker.databaseIdentityDigest}, ${databaseChallengeDigest},
        ${marker.actualContextDigest}, ${CURRENT186_MIGRATION}, 186,
        ${CURRENT186_MANIFEST_DIGEST}, ${COORDINATOR_ROLE},
        ${COORDINATOR_ROLE}, ${coordinatorRoleOid}, NULL,
        ${predecessorMarkerDigest}, ${payloadJson}::JSONB,
        ${marker.payloadDigest}, ${signingKeyId}, ${publicKeyFingerprint},
        ${'A'.repeat(86)}, ${deployedAt}, ${validUntil}
      )
    `);
  });
}

async function readEpochRows(client: PrismaClient): Promise<EpochRow[]> {
  return client.$queryRaw<EpochRow[]>(Prisma.sql`
    SELECT
      epoch."epoch"::BIGINT AS epoch,
      epoch."operationId",
      epoch."payloadDigest",
      epoch."catalogDigest",
      epoch."exactGrantsDigest",
      epoch."ownerSurfaceDigest",
      epoch."deploymentRoleName",
      epoch."deploymentRoleOid"::BIGINT AS "deploymentRoleOid",
      epoch."applyReceiptDigest",
      epoch."beforeCatalogDigest",
      epoch."planDigest",
      epoch."definitionManifestDigest",
      epoch."reasonCode"
    FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch
    ORDER BY epoch."epoch"
  `);
}

async function readOperationRecoverySnapshots(
  client: PrismaClient,
  operationId: string,
): Promise<OperationRecoverySnapshot[]> {
  return client.$queryRaw<OperationRecoverySnapshot[]>(Prisma.sql`
    SELECT
      epoch."epoch"::BIGINT AS epoch,
      epoch."operationId",
      epoch."beforeCatalogCanonicalJson",
      epoch."payloadCanonicalJson",
      epoch."payloadDigest",
      (
        pg_catalog.date_part('epoch', epoch."recordedAt") * 1000
      )::BIGINT AS "recordedAtEpochMs",
      epoch."recordedTransactionId"::TEXT AS "recordedTransactionId"
    FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch
    WHERE epoch."operationId" = ${operationId}
    ORDER BY epoch."epoch"
  `);
}

async function assertCatalogAndDatabaseDirectDutyAclDigestParity(input: {
  client: PrismaClient;
  coordinatorRoleOid: number;
  definitionManifestDigest: string;
  deploymentRoleOid: number;
  operationId: string;
  schemaOwnerRoleOid: number;
  workerRoleOid: number;
}): Promise<void> {
  const [epoch] = await input.client.$queryRaw<
    Array<{ catalogDigest: string | null }>
  >(Prisma.sql`
    SELECT
      epoch."payloadCanonicalJson"::JSONB ->> 'directDutyAclDigest'
        AS "catalogDigest"
    FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch
    WHERE epoch."operationId" = ${input.operationId}
  `);
  const catalogDigest = requireString(epoch?.catalogDigest);
  expect(catalogDigest).toMatch(/^[0-9a-f]{64}$/u);

  const databaseDigest = await input.client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${quotePgIdentifier(SCHEMA_OWNER_ROLE)}`,
      );
      const [row] = await transaction.$queryRaw<
        Array<{ assertion: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT public."identity_mail_duty_role_live_assert_v1"(
          ${input.deploymentRoleOid}::BIGINT,
          ${input.schemaOwnerRoleOid}::BIGINT,
          ${input.coordinatorRoleOid}::BIGINT,
          ${input.workerRoleOid}::BIGINT,
          'APPLY'::TEXT,
          ${input.definitionManifestDigest}::TEXT
        ) AS assertion
      `);
      return requireString(
        requireRecord(row?.assertion, 'CURRENT186 database live assertion')
          .directDutyAclDigest,
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
  expect(databaseDigest).toBe(catalogDigest);
}

async function assertExactLocalPostgres16(
  client: PrismaClient,
  sourceUrl: URL,
): Promise<void> {
  const [server] = await client.$queryRaw<
    Array<{
      canCreateDatabase: boolean;
      canCreateRole: boolean;
      canSetReplicationRole: boolean;
      dataDirectory: string;
      databaseName: string;
      serverAddress: string;
      serverPort: number;
      versionMajor: number;
    }>
  >(Prisma.sql`
    SELECT
      pg_catalog.current_database() AS "databaseName",
      pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
      pg_catalog.inet_server_port()::INTEGER AS "serverPort",
      pg_catalog.current_setting('data_directory') AS "dataDirectory",
      pg_catalog.current_setting('server_version_num')::INTEGER / 10000
        AS "versionMajor",
      role_entry.rolcreatedb OR role_entry.rolsuper AS "canCreateDatabase",
      role_entry.rolcreaterole OR role_entry.rolsuper AS "canCreateRole",
      role_entry.rolsuper OR pg_catalog.has_parameter_privilege(
        CURRENT_USER,
        'session_replication_role',
        'SET'
      ) AS "canSetReplicationRole"
    FROM pg_catalog.pg_roles AS role_entry
    WHERE role_entry.rolname = CURRENT_USER
  `);
  const expectedPort =
    acceptanceProfile === LOCAL_PINNED_PROFILE
      ? LOCAL_PINNED_PORT
      : GITHUB_ACTIONS_CI_PORT;
  expect(sourceUrl.hostname).toBe(EXPECTED_HOST);
  expect(sourceUrl.port).toBe(expectedPort);
  expect(server).toMatchObject({
    canCreateDatabase: true,
    canCreateRole: true,
    canSetReplicationRole: true,
    databaseName: 'postgres',
    serverPort: Number(expectedPort),
    versionMajor: 16,
  });
  if (acceptanceProfile === LOCAL_PINNED_PROFILE) {
    expect(server?.serverAddress).toBe(EXPECTED_HOST);
    expect(resolve(server?.dataDirectory ?? '')).toBe(EXPECTED_DATA_DIRECTORY);
  } else {
    expect(server?.serverAddress).toMatch(/^(?:[0-9a-f:.]+)$/iu);
    expect(server?.dataDirectory).toMatch(
      /^\/(?:var\/lib\/postgresql|var\/lib\/postgre)/u,
    );
  }
}

async function assertNoPreexistingResidue(client: PrismaClient): Promise<void> {
  const [residue] = await client.$queryRaw<
    Array<{ databaseCount: bigint; roleCount: bigint }>
  >(Prisma.sql`
    SELECT
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_database AS database_entry
        WHERE database_entry.datname LIKE 'lp\_imtec\_%' ESCAPE '\\'
      ) AS "databaseCount",
      (
        SELECT pg_catalog.count(*)::BIGINT
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname LIKE 'lp\_imtec\_%' ESCAPE '\\'
           OR role_entry.rolname IN (${Prisma.join(EXACT_ROLE_NAMES)})
      ) AS "roleCount"
  `);
  expect(residue).toEqual({ databaseCount: 0n, roleCount: 0n });
}

async function assertNoFinalResidue(client: PrismaClient): Promise<void> {
  await assertNoPreexistingResidue(client);
}

function requireApplyReceipt(value: unknown): ApplyReceipt {
  const result = requireRecord(value, 'CURRENT186 apply receipt');
  for (const key of [
    'applyReceiptDigest',
    'beforeCatalogDigest',
    'operationId',
    'planDigest',
    'targetCatalogDigest',
    'targetDefinitionManifestDigest',
    'targetExactGrantsDigest',
    'targetOwnerSurfaceDigest',
  ]) {
    requireString(result[key]);
  }
  if (!Number.isInteger(result.epoch)) {
    throw new Error('CURRENT186 apply receipt epoch is invalid');
  }
  expect(result).toMatchObject(CURRENT186_SCOPE);
  return value as ApplyReceipt;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string value');
  return value;
}

function requireStringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error('Expected string array');
  }
  return value as string[];
}

async function expectControllerReasonCode(
  operation: Promise<unknown>,
  expectedReasonCode: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const reasonCode = requireString(
      requireRecord(error, 'CURRENT186 controller error').reasonCode,
    );
    expect(reasonCode).toMatch(expectedReasonCode);
    return;
  }
  throw new Error('Expected CURRENT186 controller operation to fail');
}

async function expectCurrent186AttestationBlocked(
  operation: Promise<unknown>,
): Promise<void> {
  await expectControllerReasonCode(
    operation,
    /^IDENTITY_MAIL_DUTY_ROLE_(?:CATALOG|DEPLOYMENT)_CURRENT186_/u,
  );
}

async function expectCurrent186AttestationAccepted(
  operation: Promise<unknown>,
): Promise<void> {
  await expect(operation).resolves.toMatchObject({
    ...CURRENT186_SCOPE,
    authorization: false,
    canMutate: false,
    canSend: false,
    decision: 'CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED',
  });
}

function migrationManifestDigest(
  migrations: ReadonlyArray<{ checksum: string; migrationName: string }>,
): string {
  return createHash('sha256')
    .update(
      `${migrations
        .map((migration) => `${migration.migrationName} ${migration.checksum}`)
        .join('\n')}\n`,
      'utf8',
    )
    .digest('hex');
}

async function assertExactCanonicalCurrent180Source(
  client: PrismaClient,
): Promise<void> {
  const migrations = await client.$queryRaw<
    Array<{ checksum: string; migrationName: string }>
  >(Prisma.sql`
    SELECT
      migration."migration_name" AS "migrationName",
      migration."checksum" AS checksum
    FROM public."_prisma_migrations" AS migration
    WHERE migration."finished_at" IS NOT NULL
      AND migration."rolled_back_at" IS NULL
    ORDER BY migration."migration_name" COLLATE "C"
  `);
  expect(migrations).toHaveLength(180);
  expect(migrations.at(-1)).toEqual({
    checksum: CURRENT180_SHA256,
    migrationName: CURRENT180_MIGRATION,
  });
  expect(migrationManifestDigest(migrations)).toBe(CURRENT180_MANIFEST_DIGEST);
}

function current186MigrationSha256(): string {
  return createHash('sha256')
    .update(current186MigrationSource(), 'utf8')
    .digest('hex');
}

function current186MigrationSource(): string {
  return readFileSync(
    resolve(
      __dirname,
      '../../..',
      'packages/database/migration-candidates',
      CURRENT186_MIGRATION,
      'migration.sql',
    ),
    'utf8',
  ).replace(/\r\n?/gu, '\n');
}

function fixtureDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function expectSqlState(
  operation: Promise<unknown>,
  expectedSqlState: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`);
  } catch (error) {
    const actualSqlState = postgresSqlState(error);
    if (actualSqlState !== expectedSqlState) {
      const reason =
        error !== null && typeof error === 'object' && !Array.isArray(error)
          ? (error as Record<string, unknown>)
          : undefined;
      throw new Error(
        `Expected PostgreSQL SQLSTATE ${expectedSqlState}, received ${actualSqlState ?? 'none'}; ` +
          `message=${error instanceof Error ? error.message : String(error)}; ` +
          `reasonCode=${typeof reason?.reasonCode === 'string' ? reason.reasonCode : 'none'}`,
        { cause: error },
      );
    }
    expect(actualSqlState).not.toBe('40P01');
  }
}

async function expectSqlStateAndMessage(
  operation: Promise<unknown>,
  expectedSqlState: string,
  expectedMessage: RegExp,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`);
  } catch (error) {
    expect(postgresSqlState(error)).toBe(expectedSqlState);
    expect(postgresSqlState(error)).not.toBe('40P01');
    expect(error instanceof Error ? error.message : String(error)).toMatch(
      expectedMessage,
    );
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

function promiseOutcomeDiagnostic(
  outcome: PromiseSettledResult<unknown>,
  index: number,
): Record<string, unknown> {
  if (outcome.status === 'fulfilled') {
    const result =
      outcome.value !== null &&
      typeof outcome.value === 'object' &&
      !Array.isArray(outcome.value)
        ? (outcome.value as Record<string, unknown>)
        : undefined;
    return {
      decision: result?.decision,
      epoch: result?.epoch,
      index,
      status: outcome.status,
    };
  }
  const reason =
    outcome.reason !== null &&
    typeof outcome.reason === 'object' &&
    !Array.isArray(outcome.reason)
      ? (outcome.reason as Record<string, unknown>)
      : undefined;
  return {
    index,
    message:
      outcome.reason instanceof Error
        ? outcome.reason.message
        : reason?.message,
    reasonCode: reason?.reasonCode,
    sqlState: postgresSqlState(outcome.reason),
    status: outcome.status,
  };
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

function runtimeRoleDatabaseUrl(
  databaseUrl: string,
  roleName: (typeof EXACT_ROLE_NAMES)[number],
  password: string,
): string {
  assertExactRoleName(roleName);
  const target = new URL(singleConnectionUrl(databaseUrl));
  target.username = roleName;
  target.password = password;
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
    throw new Error('Refusing CURRENT186 diagnostic in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for CURRENT186 diagnostics');
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+|\/+$/gu, ''),
  );
  if (acceptanceProfile === LOCAL_PINNED_PROFILE) {
    if (
      parsed.hostname !== EXPECTED_HOST ||
      parsed.port !== LOCAL_PINNED_PORT ||
      databaseName !== LOCAL_PINNED_SOURCE_DATABASE
    ) {
      throw new Error(
        'CURRENT186 local-pinned diagnostics require the exact isolated PostgreSQL 16 fixture',
      );
    }
  } else if (acceptanceProfile === GITHUB_ACTIONS_CI_PROFILE) {
    if (
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      parsed.hostname !== EXPECTED_HOST ||
      parsed.port !== GITHUB_ACTIONS_CI_PORT ||
      databaseName !== GITHUB_ACTIONS_CI_SOURCE_DATABASE
    ) {
      throw new Error(
        'CURRENT186 github-actions-ci diagnostics require the exact GitHub PostgreSQL 16 service fixture',
      );
    }
  } else {
    throw new Error('CURRENT186 PostgreSQL acceptance profile is invalid');
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing unsafe CURRENT186 disposable database name');
  }
}
