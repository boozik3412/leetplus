import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  AssertIdentityMailWorkerReadyInput,
  ClaimedIdentityMailDelivery,
  ClaimIdentityMailDeliveryInput,
  IdentityMailDeliveryLeaseInput,
  IdentityMailPreProviderFailureOutcome,
  IdentityMailProviderAttemptOutcome,
  IdentityMailWorkerRepository,
  MarkIdentityMailFailureInput,
  MarkIdentityMailProviderAttemptInput,
  MarkIdentityMailSentInput,
  ReapIdentityMailDeliveryInput,
} from './identity-mail-worker.types';

const CURRENT_MIGRATION =
  '20260818020000_identity_mail_delivery_current_head_v1' as const;
const CURRENT_MIGRATION_COUNT = 185 as const;
const PRETERMINAL_MIGRATION_MANIFEST_DIGESTS = new Set<string>([
  // Canonical clean install.
  'f269f0878c9940b7ee2619e778e032361acc844364ab876bbe7fcc01e15a9fcd',
  // Exact production-history restored-copy lane: two reviewed comment-only
  // legacy checksums plus the CURRENT179/CURRENT185 history bridges.
  '7a0bb533293e9ddf69d689a1215f3589872d399dccecde5a598bf79175923bcc',
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENTITY_MAIL_TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const IDENTITY_MAIL_TENANT_LOCK_SEED = 180;
const IDENTITY_MAIL_STATEMENT_TIMEOUT = '25s';
const IDENTITY_MAIL_LOCK_TIMEOUT = '5s';
// The protected RPC must start after a possibly blocking tenant-lock statement
// so it observes the lock holder's commit. Read Committed provides that next-
// statement snapshot while the transaction-scoped advisory lock stays held.
const IDENTITY_MAIL_TENANT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 30_000,
} as const;
const SECRET_ENVELOPE_BYTES = 71;
const MAX_LEASE_VERSION = 2_147_483_647n;
const CLAIM_EMPTY_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
] as const;
const CLAIMED_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'outboxId',
  'tenantId',
  'inviteId',
  'workflowLocator',
  'aadEnvironment',
  'template',
  'messageKey',
  'requestDigest',
  'tokenHash',
  'digestVersion',
  'secretCiphertextBase64',
  'envelopeVersion',
  'keyVersion',
  'recipientEmail',
  'expiresAt',
  'attemptNumber',
  'leaseVersion',
  'transitionRevision',
] as const;
const REAP_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'processed',
] as const;
const COMPLETION_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'outboxId',
  'leaseVersion',
  'transitionRevision',
] as const;

type ReadinessRow = {
  databaseName: string;
  sessionRole: string;
  currentRole: string;
  transportTls: boolean;
  transportTlsVersion: string | null;
  transportTlsCipher: string | null;
  effectiveDatabaseCreate: boolean;
  effectiveDatabaseTemporary: boolean;
  roleOid: bigint;
  canLogin: boolean;
  inherits: boolean;
  superuser: boolean;
  createRole: boolean;
  createDatabase: boolean;
  replication: boolean;
  bypassRls: boolean;
  membershipCount: bigint;
  roleSettingCount: bigint;
  ownedObjectCount: bigint;
  publicUsage: boolean;
  publicCreate: boolean;
  effectiveSchemaUsageCount: bigint;
  effectiveSchemaCreateCount: bigint;
  effectiveRelationPrivilegeCount: bigint;
  effectiveColumnPrivilegeCount: bigint;
  effectiveSequencePrivilegeCount: bigint;
  effectiveRoutineExecuteCount: bigint;
  directRoutineExecuteCount: bigint;
  directRoutineGrantOptionCount: bigint;
  publicRoutineExecuteCount: bigint;
  effectiveRoutineSignatures: string[];
};

type RpcRow = {
  result: unknown;
};

type IdentityMailTenantTransactionSettingsRow = {
  isolationLevel: string;
  readOnly: string;
  statementTimeout: string;
  lockTimeout: string;
};

type IdentityMailTenantLockRow = {
  tenantId: string;
  backendPid: number;
};

type IdentityMailWorkerRpcClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

type IdentityMailClaimBinding = {
  readonly tenantId: string;
  readonly inviteId: string;
  readonly leaseVersion: bigint;
  readonly leaseOwnerDigest: string;
  readonly leaseTokenDigest: string;
  readonly providerAuthorityDigest: string;
  readonly transitionRevision: number;
};

const ALLOWED_WORKER_RPC_SIGNATURES = [
  'public.identity_initial_owner_mail_claim_v1(text, text, text, text)',
  'public.identity_initial_owner_mail_complete_v1(text, integer, text, text, text, text, text)',
  'public.identity_initial_owner_mail_provider_mark_v1(text, integer, text, text, text, text, text)',
  'public.identity_initial_owner_mail_reap_v1(text, text, text, integer)',
  'public.identity_mail_delivery_worker_assert_v1(text)',
] as const;

export class IdentityMailWorkerRepositoryError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailWorkerRepositoryError';
  }
}

export class PrismaIdentityMailWorkerRepository implements IdentityMailWorkerRepository {
  private readonly claimBindings = new Map<string, IdentityMailClaimBinding>();

  constructor(private readonly prisma: PrismaClient) {}

  async assertReady(input: AssertIdentityMailWorkerReadyInput): Promise<void> {
    if (
      input.expectedMigration !== CURRENT_MIGRATION ||
      input.expectedMigrationCount !== CURRENT_MIGRATION_COUNT ||
      !RELEASE_SHA_PATTERN.test(input.releaseSha) ||
      !SHA256_PATTERN.test(input.providerAuthorityDigest) ||
      typeof input.databaseTlsRequired !== 'boolean' ||
      input.canaryTenantIds.length === 0 ||
      new Set(input.canaryTenantIds).size !== input.canaryTenantIds.length ||
      input.canaryTenantIds.some((tenantId) => !UUID_PATTERN.test(tenantId)) ||
      !validExpectedPolicy(input.expectedPolicy)
    ) {
      fail('IDENTITY_MAIL_WORKER_RELEASE_CONTRACT_MISMATCH');
    }

    const rows = await this.prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
      SELECT
        pg_catalog.current_database()::TEXT AS "databaseName",
        session_user::TEXT AS "sessionRole",
        current_user::TEXT AS "currentRole",
        COALESCE(
          (
            SELECT transport.ssl
            FROM pg_catalog.pg_stat_ssl AS transport
            WHERE transport.pid = pg_catalog.pg_backend_pid()
          ),
          false
        ) AS "transportTls",
        (
          SELECT transport.version::TEXT
          FROM pg_catalog.pg_stat_ssl AS transport
          WHERE transport.pid = pg_catalog.pg_backend_pid()
        ) AS "transportTlsVersion",
        (
          SELECT transport.cipher::TEXT
          FROM pg_catalog.pg_stat_ssl AS transport
          WHERE transport.pid = pg_catalog.pg_backend_pid()
        ) AS "transportTlsCipher",
        pg_catalog.has_database_privilege(
          session_user,
          pg_catalog.current_database(),
          'CREATE'
        ) AS "effectiveDatabaseCreate",
        pg_catalog.has_database_privilege(
          session_user,
          pg_catalog.current_database(),
          'TEMPORARY'
        ) AS "effectiveDatabaseTemporary",
        worker_role.oid::BIGINT AS "roleOid",
        worker_role.rolcanlogin AS "canLogin",
        worker_role.rolinherit AS "inherits",
        worker_role.rolsuper AS "superuser",
        worker_role.rolcreaterole AS "createRole",
        worker_role.rolcreatedb AS "createDatabase",
        worker_role.rolreplication AS "replication",
        worker_role.rolbypassrls AS "bypassRls",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = worker_role.oid
             OR membership.roleid = worker_role.oid
        ) AS "membershipCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_db_role_setting AS setting
          WHERE setting.setrole = worker_role.oid
        ) AS "roleSettingCount",
        (
          (SELECT pg_catalog.count(*) FROM pg_catalog.pg_database
            WHERE datdba = worker_role.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_namespace
            WHERE nspowner = worker_role.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class
            WHERE relowner = worker_role.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc
            WHERE proowner = worker_role.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type
            WHERE typowner = worker_role.oid)
        )::BIGINT AS "ownedObjectCount",
        pg_catalog.has_schema_privilege(
          session_user,
          'public',
          'USAGE'
        ) AS "publicUsage",
        pg_catalog.has_schema_privilege(
          session_user,
          'public',
          'CREATE'
        ) AS "publicCreate",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_schema_privilege(
              session_user,
              namespace.oid,
              'USAGE'
            )
        ) AS "effectiveSchemaUsageCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_schema_privilege(
              session_user,
              namespace.oid,
              'CREATE'
            )
        ) AS "effectiveSchemaCreateCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN (
            VALUES
              ('SELECT'),
              ('INSERT'),
              ('UPDATE'),
              ('DELETE'),
              ('TRUNCATE'),
              ('REFERENCES'),
              ('TRIGGER')
          ) AS target_privilege(privilege_name)
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND pg_catalog.has_table_privilege(
              session_user,
              relation.oid,
              target_privilege.privilege_name
            )
        ) AS "effectiveRelationPrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_attribute AS attribute
          INNER JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN (
            VALUES
              ('SELECT'),
              ('INSERT'),
              ('UPDATE'),
              ('REFERENCES')
          ) AS target_privilege(privilege_name)
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND attribute.attnum > 0
            AND attribute.attisdropped = false
            AND pg_catalog.has_column_privilege(
              session_user,
              relation.oid,
              attribute.attnum,
              target_privilege.privilege_name
            )
        ) AS "effectiveColumnPrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_class AS sequence
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = sequence.relnamespace
          CROSS JOIN (
            VALUES ('USAGE'), ('SELECT'), ('UPDATE')
          ) AS target_privilege(privilege_name)
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND sequence.relkind = 'S'
            AND pg_catalog.has_sequence_privilege(
              session_user,
              sequence.oid,
              target_privilege.privilege_name
            )
        ) AS "effectiveSequencePrivilegeCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND routine.prokind IN ('f', 'p')
            AND pg_catalog.has_function_privilege(
              session_user,
              routine.oid,
              'EXECUTE'
            )
        ) AS "effectiveRoutineExecuteCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl)
            AS privilege
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND routine.prokind IN ('f', 'p')
            AND privilege.grantee = worker_role.oid
            AND privilege.privilege_type = 'EXECUTE'
        ) AS "directRoutineExecuteCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl)
            AS privilege
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND routine.prokind IN ('f', 'p')
            AND privilege.grantee = worker_role.oid
            AND privilege.privilege_type = 'EXECUTE'
            AND privilege.is_grantable
        ) AS "directRoutineGrantOptionCount",
        (
          SELECT pg_catalog.count(*)::BIGINT
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
              routine.proacl,
              pg_catalog.acldefault('f', routine.proowner)
            )
          ) AS privilege
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND routine.prokind IN ('f', 'p')
            AND privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        ) AS "publicRoutineExecuteCount",
        COALESCE(
          (
            SELECT pg_catalog.array_agg(
              pg_catalog.format(
                '%I.%I(%s)',
                namespace.nspname,
                routine.proname,
                pg_catalog.oidvectortypes(routine.proargtypes)
              )
              ORDER BY
                namespace.nspname,
                routine.proname,
                pg_catalog.oidvectortypes(routine.proargtypes)
            )
            FROM pg_catalog.pg_proc AS routine
            INNER JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname !~ '^pg_'
              AND namespace.nspname <> 'information_schema'
              AND routine.prokind IN ('f', 'p')
              AND pg_catalog.has_function_privilege(
                session_user,
                routine.oid,
                'EXECUTE'
              )
          ),
          ARRAY[]::TEXT[]
        ) AS "effectiveRoutineSignatures"
      FROM pg_catalog.pg_roles AS worker_role
      WHERE worker_role.rolname = session_user
    `);

    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      typeof row.roleOid !== 'bigint' ||
      row.roleOid < 1n ||
      row.databaseName !== input.expectedDatabase ||
      row.sessionRole !== input.expectedRole ||
      row.currentRole !== input.expectedRole ||
      row.effectiveDatabaseCreate !== false ||
      row.effectiveDatabaseTemporary !== false ||
      row.canLogin !== true ||
      row.inherits !== false ||
      row.superuser !== false ||
      row.createRole !== false ||
      row.createDatabase !== false ||
      row.replication !== false ||
      row.bypassRls !== false ||
      row.membershipCount !== 0n ||
      row.roleSettingCount !== 0n ||
      row.ownedObjectCount !== 0n ||
      row.publicUsage !== true ||
      row.publicCreate !== false ||
      row.effectiveSchemaUsageCount !== 1n ||
      row.effectiveSchemaCreateCount !== 0n ||
      row.effectiveRelationPrivilegeCount !== 0n ||
      row.effectiveColumnPrivilegeCount !== 0n ||
      row.effectiveSequencePrivilegeCount !== 0n ||
      row.effectiveRoutineExecuteCount !==
        BigInt(ALLOWED_WORKER_RPC_SIGNATURES.length) ||
      row.directRoutineExecuteCount !==
        BigInt(ALLOWED_WORKER_RPC_SIGNATURES.length) ||
      row.directRoutineGrantOptionCount !== 0n ||
      row.publicRoutineExecuteCount !== 0n ||
      !exactStringArray(
        row.effectiveRoutineSignatures,
        ALLOWED_WORKER_RPC_SIGNATURES,
      )
    ) {
      fail('IDENTITY_MAIL_WORKER_DATABASE_AUTHORITY_MISMATCH');
    }

    const transportDetailsComplete =
      validTransportDetail(row.transportTlsVersion) &&
      validTransportDetail(row.transportTlsCipher);
    const transportDetailsAbsent =
      row.transportTlsVersion === null && row.transportTlsCipher === null;
    if (
      typeof row.transportTls !== 'boolean' ||
      (row.transportTls && !transportDetailsComplete) ||
      (!row.transportTls && !transportDetailsAbsent) ||
      (input.databaseTlsRequired && !row.transportTls)
    ) {
      fail('IDENTITY_MAIL_WORKER_DATABASE_TRANSPORT_MISMATCH');
    }

    for (const tenantId of input.canaryTenantIds) {
      const receipt = await this.tenantRpc(
        tenantId,
        Prisma.sql`
        SELECT public."identity_mail_delivery_worker_assert_v1"(
          ${tenantId}::TEXT
        ) AS result
      `,
      );
      assertReadinessReceipt(receipt, tenantId, input);
    }
  }

  async claimOne(
    input: ClaimIdentityMailDeliveryInput,
  ): Promise<ClaimedIdentityMailDelivery | null> {
    const result = await this.tenantRpc(
      input.tenantId,
      Prisma.sql`
      SELECT public."identity_initial_owner_mail_claim_v1"(
        ${input.tenantId}::TEXT,
        ${input.leaseOwnerDigest}::TEXT,
        ${input.leaseTokenDigest}::TEXT,
        ${input.providerAuthorityDigest}::TEXT
      ) AS result
    `,
    );
    const untrustedRecord = recordValue(result);
    if (untrustedRecord.decision === 'EMPTY') {
      const emptyRecord = exactRecordValue(
        untrustedRecord,
        CLAIM_EMPTY_RECEIPT_KEYS,
        'IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID',
      );
      if (
        emptyRecord.schemaVersion !== 1 ||
        emptyRecord.operation !== 'CLAIM_INITIAL_OWNER_MAIL'
      ) {
        fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
      }
      return null;
    }
    const record = exactRecordValue(
      untrustedRecord,
      CLAIMED_RECEIPT_KEYS,
      'IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID',
    );
    if (
      record.schemaVersion !== 1 ||
      record.operation !== 'CLAIM_INITIAL_OWNER_MAIL' ||
      record.decision !== 'CLAIMED'
    ) {
      fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
    }

    const delivery: ClaimedIdentityMailDelivery = {
      tenantId: stringValue(record.tenantId),
      workflowLocator: stringValue(record.workflowLocator),
      inviteId: stringValue(record.inviteId),
      outboxId: stringValue(record.outboxId),
      template: exactValue(record.template, 'INITIAL_OWNER_INVITE'),
      messageKey: stringValue(record.messageKey),
      requestDigest: stringValue(record.requestDigest),
      tokenHash: stringValue(record.tokenHash),
      digestVersion: exactValue(record.digestVersion, 'sha256-v1'),
      envelopeVersion: exactNumber(record.envelopeVersion, 1),
      keyVersion: exactValue(record.keyVersion, 'v1'),
      aadEnvironment: stringValue(record.aadEnvironment),
      expiresAt: dateValue(record.expiresAt),
      recipientEmail: stringValue(record.recipientEmail),
      leaseVersion: positiveBigInt(record.leaseVersion),
      transitionRevision: positiveInteger(record.transitionRevision),
      attemptNumber: positiveInteger(record.attemptNumber),
      secretCiphertext: base64Buffer(record.secretCiphertextBase64),
    };

    if (
      delivery.tenantId !== input.tenantId ||
      !UUID_PATTERN.test(delivery.tenantId) ||
      !UUID_PATTERN.test(delivery.workflowLocator) ||
      !UUID_PATTERN.test(delivery.inviteId) ||
      !UUID_PATTERN.test(delivery.outboxId) ||
      !UUID_PATTERN.test(delivery.messageKey) ||
      !SHA256_PATTERN.test(delivery.requestDigest) ||
      !SHA256_PATTERN.test(delivery.tokenHash) ||
      delivery.secretCiphertext.length !== SECRET_ENVELOPE_BYTES ||
      delivery.leaseVersion > MAX_LEASE_VERSION
    ) {
      delivery.secretCiphertext.fill(0);
      fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
    }
    this.claimBindings.set(
      delivery.outboxId,
      Object.freeze({
        tenantId: delivery.tenantId,
        inviteId: delivery.inviteId,
        leaseVersion: delivery.leaseVersion,
        leaseOwnerDigest: input.leaseOwnerDigest,
        leaseTokenDigest: input.leaseTokenDigest,
        providerAuthorityDigest: input.providerAuthorityDigest,
        transitionRevision: delivery.transitionRevision,
      }),
    );
    return delivery;
  }

  async reapExpired(input: ReapIdentityMailDeliveryInput): Promise<number> {
    const result = await this.tenantRpc(
      input.tenantId,
      Prisma.sql`
      SELECT public."identity_initial_owner_mail_reap_v1"(
        ${input.tenantId}::TEXT,
        ${input.providerAuthorityDigest}::TEXT,
        ${input.workerActorDigest}::TEXT,
        ${input.batchLimit}::INTEGER
      ) AS result
    `,
    );
    const record = decisionRecord(
      result,
      'REAP_INITIAL_OWNER_MAIL',
      'COMPLETED',
      REAP_RECEIPT_KEYS,
    );
    return nonNegativeInteger(record.processed);
  }

  async markProviderAttempt(
    input: MarkIdentityMailProviderAttemptInput,
  ): Promise<IdentityMailProviderAttemptOutcome> {
    const binding = this.requireClaimBinding(input);
    if (
      binding.inviteId !== input.inviteId ||
      binding.providerAuthorityDigest !== input.providerAuthorityDigest
    ) {
      fail('IDENTITY_MAIL_WORKER_CLAIM_BINDING_MISMATCH');
    }
    const result = await this.tenantRpc(
      binding.tenantId,
      Prisma.sql`
      SELECT public."identity_initial_owner_mail_provider_mark_v1"(
        ${input.outboxId}::TEXT,
        ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
        ${input.leaseOwnerDigest}::TEXT,
        ${digest(input.leaseToken)}::TEXT,
        ${input.providerAttemptKey}::TEXT,
        ${input.providerAuthorityDigest}::TEXT,
        ${digest(input.messageId)}::TEXT
      ) AS result
    `,
    );
    const untrustedRecord = recordValue(result);
    if (untrustedRecord.decision === 'CANCELED') {
      const canceledRecord = exactRecordValue(
        untrustedRecord,
        [
          'schemaVersion',
          'operation',
          'decision',
          'reasonCode',
          'outboxId',
          'tenantId',
          'inviteId',
          'leaseVersion',
          'transitionRevision',
        ],
        'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID',
      );
      assertProviderMarkerResponse(canceledRecord, input);
      if (canceledRecord.reasonCode !== 'NOT_DELIVERABLE') {
        fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
      }
      this.releaseClaimBinding(input.outboxId, binding);
      return 'CANCELED';
    }

    const markedRecord = exactRecordValue(
      untrustedRecord,
      [
        'schemaVersion',
        'operation',
        'decision',
        'reasonCode',
        'outboxId',
        'tenantId',
        'inviteId',
        'leaseVersion',
        'transitionRevision',
        'providerAttemptKey',
      ],
      'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID',
    );
    assertProviderMarkerResponse(markedRecord, input);
    if (
      markedRecord.decision !== 'MARKED' ||
      markedRecord.reasonCode !== null ||
      markedRecord.providerAttemptKey !== input.providerAttemptKey
    ) {
      fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
    }
    this.claimBindings.set(
      input.outboxId,
      Object.freeze({
        ...binding,
        transitionRevision: input.expectedTransitionRevision + 1,
      }),
    );
    return 'MARKED';
  }

  async markSent(input: MarkIdentityMailSentInput): Promise<void> {
    if (
      input.providerOutcomeCode !== 'SMTP_ACCEPTED' ||
      !SHA256_PATTERN.test(input.providerReceiptDigest)
    ) {
      fail('IDENTITY_MAIL_WORKER_PROVIDER_RECEIPT_INVALID');
    }
    const { binding, result } = await this.complete(
      input,
      'PROVIDER_ACCEPTED',
      input.providerReceiptDigest,
      terminalAckDigest(input, input.providerOutcomeCode),
    );
    const record = decisionRecord(
      result,
      'COMPLETE_INITIAL_OWNER_MAIL',
      'SENT',
      COMPLETION_RECEIPT_KEYS,
    );
    assertLeaseResponse(record, input);
    this.releaseClaimBinding(input.outboxId, binding);
  }

  async markPreProviderFailure(
    input: MarkIdentityMailFailureInput,
  ): Promise<IdentityMailPreProviderFailureOutcome> {
    const outcome = permanentPreProviderReason(input.reasonCode)
      ? 'PRE_PROVIDER_DEAD'
      : 'PRE_PROVIDER_RETRY';
    const { binding, result } = await this.complete(input, outcome, null, null);
    const record = exactRecordValue(
      result,
      COMPLETION_RECEIPT_KEYS,
      'IDENTITY_MAIL_WORKER_COMPLETION_RESPONSE_INVALID',
    );
    if (
      record.schemaVersion !== 1 ||
      record.operation !== 'COMPLETE_INITIAL_OWNER_MAIL' ||
      !['RETRY', 'DEAD', 'CANCELED'].includes(
        typeof record.decision === 'string' ? record.decision : '',
      )
    ) {
      fail('IDENTITY_MAIL_WORKER_COMPLETION_RESPONSE_INVALID');
    }
    assertLeaseResponse(record, input);
    if (
      record.decision === 'RETRY' ||
      record.decision === 'DEAD' ||
      record.decision === 'CANCELED'
    ) {
      this.releaseClaimBinding(input.outboxId, binding);
      return record.decision;
    }
    return fail('IDENTITY_MAIL_WORKER_COMPLETION_RESPONSE_INVALID');
  }

  async markReconciliationRequired(
    input: MarkIdentityMailFailureInput,
  ): Promise<void> {
    const { binding, result } = await this.complete(
      input,
      'PROVIDER_AMBIGUOUS',
      null,
      terminalAckDigest(input, input.reasonCode),
    );
    const record = decisionRecord(
      result,
      'COMPLETE_INITIAL_OWNER_MAIL',
      'RECONCILIATION_REQUIRED',
      COMPLETION_RECEIPT_KEYS,
    );
    assertLeaseResponse(record, input);
    this.releaseClaimBinding(input.outboxId, binding);
  }

  async disconnect(): Promise<void> {
    this.claimBindings.clear();
    await this.prisma.$disconnect();
  }

  private async complete(
    input: IdentityMailDeliveryLeaseInput,
    outcomeCode:
      | 'PRE_PROVIDER_RETRY'
      | 'PRE_PROVIDER_DEAD'
      | 'PROVIDER_ACCEPTED'
      | 'PROVIDER_AMBIGUOUS',
    providerReceiptDigest: string | null,
    terminalAck: string | null,
  ): Promise<{ binding: IdentityMailClaimBinding; result: unknown }> {
    const binding = this.requireClaimBinding(input);
    const result = await this.tenantRpc(
      binding.tenantId,
      Prisma.sql`
      SELECT public."identity_initial_owner_mail_complete_v1"(
        ${input.outboxId}::TEXT,
        ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
        ${input.leaseOwnerDigest}::TEXT,
        ${digest(input.leaseToken)}::TEXT,
        ${outcomeCode}::TEXT,
        ${providerReceiptDigest}::TEXT,
        ${terminalAck}::TEXT
      ) AS result
    `,
    );
    return { binding, result };
  }

  private requireClaimBinding(
    input: IdentityMailDeliveryLeaseInput,
  ): IdentityMailClaimBinding {
    if (!UUID_PATTERN.test(input.tenantId)) {
      fail('IDENTITY_MAIL_WORKER_TENANT_ID_INVALID');
    }
    if (!UUID_PATTERN.test(input.outboxId)) {
      fail('IDENTITY_MAIL_WORKER_CLAIM_BINDING_MISMATCH');
    }
    const binding = this.claimBindings.get(input.outboxId);
    if (!binding) {
      fail('IDENTITY_MAIL_WORKER_CLAIM_BINDING_REQUIRED');
    }
    if (
      binding.tenantId !== input.tenantId ||
      binding.leaseVersion !== input.leaseVersion ||
      binding.leaseOwnerDigest !== input.leaseOwnerDigest ||
      binding.leaseTokenDigest !== digest(input.leaseToken) ||
      binding.transitionRevision !== input.expectedTransitionRevision
    ) {
      fail('IDENTITY_MAIL_WORKER_CLAIM_BINDING_MISMATCH');
    }
    return binding;
  }

  private releaseClaimBinding(
    outboxId: string,
    binding: IdentityMailClaimBinding,
  ): void {
    if (this.claimBindings.get(outboxId) === binding) {
      this.claimBindings.delete(outboxId);
    }
  }

  private async tenantRpc(
    tenantId: string,
    query: Prisma.Sql,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(tenantId)) {
      fail('IDENTITY_MAIL_WORKER_TENANT_ID_INVALID');
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const settings = await tx.$queryRaw<
            IdentityMailTenantTransactionSettingsRow[]
          >(Prisma.sql`
            SELECT
              pg_catalog.current_setting('transaction_isolation')
                AS "isolationLevel",
              pg_catalog.current_setting('transaction_read_only') AS "readOnly",
              pg_catalog.set_config(
                'statement_timeout',
                ${IDENTITY_MAIL_STATEMENT_TIMEOUT},
                true
              ) AS "statementTimeout",
              pg_catalog.set_config(
                'lock_timeout',
                ${IDENTITY_MAIL_LOCK_TIMEOUT},
                true
              ) AS "lockTimeout"
          `);
          if (
            settings.length !== 1 ||
            settings[0]?.isolationLevel !== 'read committed' ||
            settings[0]?.readOnly !== 'off' ||
            settings[0]?.statementTimeout !== IDENTITY_MAIL_STATEMENT_TIMEOUT ||
            settings[0]?.lockTimeout !== IDENTITY_MAIL_LOCK_TIMEOUT
          ) {
            fail('IDENTITY_MAIL_WORKER_TENANT_LOCK_PROTOCOL_INVALID');
          }

          // This must remain separate from the RPC below. A single statement
          // takes its snapshot before an advisory-lock wait begins.
          const locks = await tx.$queryRaw<IdentityMailTenantLockRow[]>(
            Prisma.sql`
              WITH tenant_lock AS MATERIALIZED (
                SELECT pg_catalog.pg_advisory_xact_lock(
                  pg_catalog.hashtextextended(
                    ${IDENTITY_MAIL_TENANT_LOCK_DOMAIN} || ${tenantId}::TEXT,
                    ${IDENTITY_MAIL_TENANT_LOCK_SEED}
                  )
                ) AS acquired
              )
              SELECT
                ${tenantId}::TEXT AS "tenantId",
                pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
              FROM tenant_lock
            `,
          );
          if (
            locks.length !== 1 ||
            locks[0]?.tenantId !== tenantId ||
            !Number.isInteger(locks[0]?.backendPid)
          ) {
            fail('IDENTITY_MAIL_WORKER_TENANT_LOCK_PROTOCOL_INVALID');
          }

          return this.rpc(tx, query);
        }, IDENTITY_MAIL_TENANT_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!retryableTenantTransactionError(error)) {
          throw error;
        }
        if (attempt === 1) {
          fail('IDENTITY_MAIL_WORKER_TRANSACTION_RETRY_REQUIRED');
        }
      }
    }
    return fail('IDENTITY_MAIL_WORKER_TRANSACTION_RETRY_REQUIRED');
  }

  private async rpc(
    client: IdentityMailWorkerRpcClient,
    query: Prisma.Sql,
  ): Promise<unknown> {
    const rows = await client.$queryRaw<RpcRow[]>(query);
    if (rows.length !== 1 || !rows[0]) {
      fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
    }
    return rows[0].result;
  }
}

function decisionRecord(
  value: unknown,
  operation: string,
  decision: string,
  exactKeys: readonly string[],
): Record<string, unknown> {
  const record = exactRecordValue(
    value,
    exactKeys,
    'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID',
  );
  if (
    record.schemaVersion !== 1 ||
    record.operation !== operation ||
    record.decision !== decision
  ) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  }
  return record;
}

function assertReadinessReceipt(
  value: unknown,
  tenantId: string,
  input: AssertIdentityMailWorkerReadyInput,
): void {
  const record = exactRecordValue(
    value,
    [
      'schemaVersion',
      'operation',
      'decision',
      'tenantId',
      'migrationHead',
      'migrationCount',
      'preterminalManifestDigest',
      'policyRevision',
      'maxAttempts',
      'leaseSeconds',
      'acknowledgeSeconds',
      'baseRetrySeconds',
      'maxRetrySeconds',
      'providerAuthorityDigest',
    ],
    'IDENTITY_MAIL_WORKER_READINESS_RECEIPT_INVALID',
  );
  if (
    record.schemaVersion !== 1 ||
    record.operation !== 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER' ||
    record.decision !== 'READY' ||
    record.tenantId !== tenantId ||
    record.migrationHead !== input.expectedMigration ||
    record.migrationCount !== input.expectedMigrationCount ||
    typeof record.preterminalManifestDigest !== 'string' ||
    !PRETERMINAL_MIGRATION_MANIFEST_DIGESTS.has(
      record.preterminalManifestDigest,
    ) ||
    !positiveSafeInteger(record.policyRevision) ||
    record.maxAttempts !== input.expectedPolicy.maxAttempts ||
    record.leaseSeconds !== input.expectedPolicy.leaseSeconds ||
    !positiveSafeInteger(record.acknowledgeSeconds) ||
    Number(record.acknowledgeSeconds) <
      input.expectedPolicy.minimumAcknowledgeSeconds ||
    Number(record.acknowledgeSeconds) > 900 ||
    record.baseRetrySeconds !== input.expectedPolicy.baseRetrySeconds ||
    record.maxRetrySeconds !== input.expectedPolicy.maxRetrySeconds ||
    record.providerAuthorityDigest !== input.providerAuthorityDigest
  ) {
    fail('IDENTITY_MAIL_WORKER_READINESS_RECEIPT_INVALID');
  }
}

function validExpectedPolicy(
  value: AssertIdentityMailWorkerReadyInput['expectedPolicy'],
): boolean {
  return (
    positiveSafeInteger(value.maxAttempts) &&
    value.maxAttempts <= 20 &&
    positiveSafeInteger(value.leaseSeconds) &&
    value.leaseSeconds >= 30 &&
    value.leaseSeconds <= 900 &&
    positiveSafeInteger(value.minimumAcknowledgeSeconds) &&
    value.minimumAcknowledgeSeconds >= 10 &&
    value.minimumAcknowledgeSeconds <= 900 &&
    positiveSafeInteger(value.baseRetrySeconds) &&
    value.baseRetrySeconds <= 3_600 &&
    positiveSafeInteger(value.maxRetrySeconds) &&
    value.maxRetrySeconds >= value.baseRetrySeconds &&
    value.maxRetrySeconds <= 86_400
  );
}

function validTransportDetail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value === value.trim()
  );
}

function positiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function exactStringArray(
  actual: unknown,
  expected: readonly string[],
): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (value, index) => typeof value === 'string' && value === expected[index],
    )
  );
}

function exactRecordValue(
  value: unknown,
  expectedKeys: readonly string[],
  reasonCode: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(reasonCode);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    fail(reasonCode);
  }
  return record;
}

function assertLeaseResponse(
  record: Record<string, unknown>,
  input: IdentityMailDeliveryLeaseInput,
): void {
  if (
    record.outboxId !== input.outboxId ||
    record.leaseVersion !== leaseVersionNumber(input.leaseVersion) ||
    record.transitionRevision !== input.expectedTransitionRevision + 1
  ) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  }
}

function assertProviderMarkerResponse(
  record: Record<string, unknown>,
  input: MarkIdentityMailProviderAttemptInput,
): void {
  if (
    record.schemaVersion !== 1 ||
    record.operation !== 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT' ||
    record.outboxId !== input.outboxId ||
    record.tenantId !== input.tenantId ||
    record.inviteId !== input.inviteId ||
    record.leaseVersion !== leaseVersionNumber(input.leaseVersion) ||
    record.transitionRevision !== input.expectedTransitionRevision + 1
  ) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  return typeof value === 'string'
    ? value
    : fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
}

function exactValue<T extends string>(value: unknown, expected: T): T {
  return value === expected
    ? expected
    : fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
}

function exactNumber<T extends number>(value: unknown, expected: T): T {
  return value === expected
    ? expected
    : fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
}

function dateValue(value: unknown): Date {
  if (typeof value !== 'string') {
    return fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  return result;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    return fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return fail('IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  }
  return Number(value);
}

function positiveBigInt(value: unknown): bigint {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d*$/u.test(String(value))
  ) {
    return fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  return BigInt(value);
}

function base64Buffer(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > 128) {
    return fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  const canonical = value.replace(/\s/gu, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(canonical)) {
    fail('IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  }
  return Buffer.from(canonical, 'base64');
}

function leaseVersionNumber(value: bigint): number {
  if (value < 1n || value > MAX_LEASE_VERSION) {
    return fail('IDENTITY_MAIL_WORKER_LEASE_VERSION_INVALID');
  }
  return Number(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function terminalAckDigest(
  input: IdentityMailDeliveryLeaseInput,
  outcome: string,
): string {
  return digest(
    [
      'leetplus:identity-mail-terminal-ack:v1',
      input.tenantId,
      input.outboxId,
      input.leaseVersion.toString(),
      outcome,
    ].join('\n'),
  );
}

function permanentPreProviderReason(reasonCode: string): boolean {
  return (
    reasonCode.endsWith('_INVALID') ||
    reasonCode === 'IDENTITY_MAIL_WORKER_ENTROPY_INVALID' ||
    reasonCode === 'IDENTITY_MAIL_CLAIM_INVALID' ||
    reasonCode === 'IDENTITY_MAIL_WORKER_EMERGENCY_STOP_PRE_PROVIDER'
  );
}

function retryableTenantTransactionError(error: unknown): boolean {
  const errorCode = databaseErrorCode(error);
  const sqlState = databaseSqlState(error);
  return (
    errorCode === 'P2034' ||
    sqlState === '40001' ||
    sqlState === '40P01' ||
    sqlState === '55P03' ||
    sqlState === '57014'
  );
}

function databaseSqlState(error: unknown): string | null {
  if (!recordValueOrNull(error)) {
    return null;
  }
  const errorCode = databaseErrorCode(error);
  if (
    errorCode === 'P2010' &&
    recordValueOrNull(error.meta) &&
    typeof error.meta.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(error.meta.code)
  ) {
    return error.meta.code;
  }
  return errorCode && /^[0-9A-Z]{5}$/u.test(errorCode) ? errorCode : null;
}

function databaseErrorCode(error: unknown): string | null {
  return recordValueOrNull(error) && typeof error.code === 'string'
    ? error.code
    : null;
}

function recordValueOrNull(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reasonCode: string): never {
  throw new IdentityMailWorkerRepositoryError(reasonCode);
}
