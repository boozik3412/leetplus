import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IDENTITY_MAIL_ENVELOPE_VERSION,
  IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
  type IdentityMailSecretBinding,
  IdentityMailSecretEnvelopeService,
  type OpenIdentityMailInviteTokenInput,
  type SealedIdentityMailInviteToken,
} from '../src/auth/identity-mail-secret-envelope.service';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION = 'run-owner-invite-hold-outbox-postgres-fixture';
const integrationEnabled =
  process.env.IDENTITY_OWNER_INVITE_HOLD_PG_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const AAD_ENVIRONMENT = 'pg-integration';
const DISPOSABLE_DATABASE_PATTERN = /^lp_hold_pg_test_[0-9a-f]{32}$/u;
const RECEIPT_KEYS = [
  'accessScope',
  'claimRevision',
  'claimType',
  'commandId',
  'decision',
  'inviteId',
  'operation',
  'outboxId',
  'outboxStatus',
  'role',
  'schemaVersion',
  'tenantId',
] as const;

type IssueReceipt = {
  schemaVersion: 1;
  operation: 'ISSUE_DORMANT_OWNER_INVITE';
  decision: 'CREATED';
  tenantId: string;
  commandId: string;
  inviteId: string;
  outboxId: string;
  outboxStatus: 'HOLD';
  claimType: 'INVITE';
  claimRevision: 2;
  role: 'OWNER';
  accessScope: 'NETWORK';
};

type IssueInput = {
  workflowLocator: string;
  tenantId: string;
  reservationSubjectId: string;
  expectedClaimRevision: number;
  requestId: string;
  requestDigest: string;
  aadEnvironment: string;
  commandId: string;
  inviteId: string;
  outboxId: string;
  messageKey: string;
  tokenHash: string;
  secretCiphertext: Buffer;
  expiresAt: Date;
};

type EnvelopeInternals = {
  canonicalBinding: (input: IdentityMailSecretBinding) => Omit<
    IdentityMailSecretBinding,
    'expiresAt'
  > & {
    expiresAt: string;
  };
  canonicalAad: (
    input: Omit<IdentityMailSecretBinding, 'expiresAt'> & {
      expiresAt: string;
    },
    tokenHash: string,
    digestVersion: typeof IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
    keyVersion: 'v1',
    envelopeVersion: typeof IDENTITY_MAIL_ENVELOPE_VERSION,
  ) => Buffer;
};

jest.setTimeout(180_000);

describePostgres(
  'initial owner invite HOLD outbox PostgreSQL crypto integration',
  () => {
    let maintenance: PrismaClient;
    let writer: PrismaClient;
    let migrationOwnerReader: PrismaClient;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let encryptionKey = '';

    beforeAll(async () => {
      const databaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_hold_pg_test_${randomUUID().replaceAll('-', '')}`;
      assertDisposableDatabaseName(disposableDatabase);
      const maintenanceUrl = databaseUrlFor(databaseUrl, 'postgres');
      disposableDatabaseUrl = databaseUrlFor(databaseUrl, disposableDatabase);

      maintenance = prismaFor(maintenanceUrl);
      await maintenance.$connect();
      const [server] = await maintenance.$queryRaw<
        Array<{ postgres_major: number; can_create_database: boolean }>
      >(Prisma.sql`
        SELECT
          current_setting('server_version_num')::int / 10000
            AS postgres_major,
          role.rolcreatedb OR role.rolsuper AS can_create_database
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = current_user
      `);
      expect(server).toEqual({
        postgres_major: 16,
        can_create_database: true,
      });

      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      deployMigrations(disposableDatabaseUrl);

      writer = prismaFor(disposableDatabaseUrl);
      migrationOwnerReader = prismaFor(disposableDatabaseUrl);
      await Promise.all([writer.$connect(), migrationOwnerReader.$connect()]);

      const [migrationState] = await migrationOwnerReader.$queryRaw<
        Array<{ migration_count: number; latest_migration: string }>
      >(Prisma.sql`
        SELECT
          count(*)::int AS migration_count,
          max(migration_name) AS latest_migration
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migrationState).toEqual({
        migration_count: 186,
        latest_migration: '20260819010000_staff_attachment_parent_delete_guard',
      });

      encryptionKey = randomBytes(32).toString('base64url');
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      const clientDisconnects = await Promise.allSettled([
        writer?.$disconnect(),
        migrationOwnerReader?.$disconnect(),
      ]);
      for (const disconnect of clientDisconnects) {
        if (disconnect.status === 'rejected') {
          cleanupErrors.push(disconnect.reason);
        }
      }

      try {
        if (maintenance && disposableDatabase) {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
          const [residue] = await maintenance.$queryRaw<
            Array<{ database_count: number }>
          >(Prisma.sql`
            SELECT count(*)::int AS database_count
            FROM pg_catalog.pg_database
            WHERE datname = ${disposableDatabase}
          `);
          if (residue.database_count !== 0) {
            throw new Error(
              'Disposable owner-invite test database cleanup left residue',
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
        encryptionKey = '';
        disposableDatabaseUrl = '';
        disposableDatabase = '';
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'Owner-invite PostgreSQL fixture cleanup failed',
        );
      }
    });

    it('commits seal → one issue RPC → persisted owner read → exact-AAD open without secret-bearing evidence', async () => {
      const suffix = randomUUID();
      const tenantId = randomUUID();
      const reservationSubjectId = randomUUID();
      const workflowLocator = reservationSubjectId;
      const commandId = randomUUID();
      const inviteId = randomUUID();
      const outboxId = randomUUID();
      const messageKey = randomUUID();
      const requestId = randomUUID();
      const requestDigest = randomBytes(32).toString('hex');
      const canonicalEmail = `owner-${suffix}@integration.invalid`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await writer.tenant.create({
        data: {
          id: tenantId,
          name: `Owner invite HOLD PG ${suffix}`,
          slug: `owner-invite-hold-pg-${suffix}`,
          status: 'SUSPENDED',
          customerStage: 'PILOT',
          onboardingStatus: 'PROVISIONING',
        },
      });
      const [reservation] = await writer.$queryRaw<
        Array<{ receipt: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT public."identity_email_claim_reserve_invite_v2"(
          CAST(${canonicalEmail} AS TEXT),
          CAST(${tenantId} AS TEXT),
          CAST(${reservationSubjectId} AS TEXT)
        ) AS receipt
      `);
      expect(reservation?.receipt).toMatchObject({
        schemaVersion: 2,
        operation: 'RESERVE_INVITE',
        decision: 'CREATED',
        tenantId,
        claimType: 'INVITE',
        subjectId: reservationSubjectId,
        revision: 1,
      });
      assertSecretFree(
        'reservation receipt',
        reservation?.receipt,
        canonicalEmail,
      );
      await expect(
        writer.identityEmailClaim.findUniqueOrThrow({
          where: { emailCanonical: canonicalEmail },
        }),
      ).resolves.toMatchObject({
        emailCanonical: canonicalEmail,
        tenantId,
        claimType: 'INVITE',
        subjectId: reservationSubjectId,
        workflowLocator,
        revision: 1,
      });

      const envelopeService = createEnvelopeService(
        encryptionKey,
        AAD_ENVIRONMENT,
      );
      const binding: IdentityMailSecretBinding = {
        tenantId,
        workflowLocator,
        inviteId,
        outboxId,
        template: 'INITIAL_OWNER_INVITE',
        messageKey,
        requestDigest,
        recipientEmail: canonicalEmail,
        expiresAt,
      };
      const sealed = envelopeService.sealInitialOwnerInviteToken(binding);
      expect(sealed).not.toHaveProperty('rawToken');

      const issueInput: IssueInput = {
        workflowLocator,
        tenantId,
        reservationSubjectId,
        expectedClaimRevision: 1,
        requestId,
        requestDigest,
        aadEnvironment: AAD_ENVIRONMENT,
        commandId,
        inviteId,
        outboxId,
        messageKey,
        tokenHash: sealed.tokenHash,
        secretCiphertext: Buffer.from(sealed.secretCiphertext),
        expiresAt,
      };
      const issued = await issueInOneShortTransaction(writer, issueInput);
      expect(issued.issueRpcCalls).toBe(1);
      const receipt = assertExactReceipt(issued.receipt, issueInput);

      const [ownerEvidence, outbox, invite, command, claim, audit] =
        await Promise.all([
          migrationOwnerReader.$queryRaw<
            Array<{
              current_user: string;
              relation_owner: string;
              current_database: string;
            }>
          >(Prisma.sql`
            SELECT
              current_user AS current_user,
              pg_catalog.pg_get_userbyid(relation.relowner)
                AS relation_owner,
              current_database() AS current_database
            FROM pg_catalog.pg_class AS relation
            INNER JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = 'IdentityMailOutbox'
          `),
          migrationOwnerReader.identityMailOutbox.findUniqueOrThrow({
            where: { id: outboxId },
          }),
          migrationOwnerReader.userInvite.findUniqueOrThrow({
            where: { id: inviteId },
          }),
          migrationOwnerReader.identityOwnerInviteIssueCommand.findUniqueOrThrow(
            {
              where: { id: commandId },
            },
          ),
          migrationOwnerReader.identityEmailClaim.findUniqueOrThrow({
            where: { emailCanonical: canonicalEmail },
          }),
          migrationOwnerReader.platformAdminAuditEvent.findUniqueOrThrow({
            where: { id: commandId },
          }),
        ]);

      expect(ownerEvidence).toEqual([
        {
          current_user: ownerEvidence[0]?.current_user,
          relation_owner: ownerEvidence[0]?.current_user,
          current_database: disposableDatabase,
        },
      ]);
      expect(outbox).toMatchObject({
        id: outboxId,
        tenantId,
        issueCommandId: commandId,
        inviteId,
        workflowLocator,
        aadEnvironment: AAD_ENVIRONMENT,
        template: 'INITIAL_OWNER_INVITE',
        status: 'HOLD',
        messageKey,
        issueRequestDigest: requestDigest,
        tokenHash: sealed.tokenHash,
        tokenDigestVersion: 'sha256-v1',
        envelopeVersion: 1,
        keyVersion: 'v1',
        expiresAt,
      });
      expect(Buffer.from(outbox.secretCiphertext)).toEqual(
        sealed.secretCiphertext,
      );
      expect(Buffer.from(outbox.secretCiphertext)).toHaveLength(71);
      expect(invite).toMatchObject({
        id: inviteId,
        tenantId,
        email: canonicalEmail,
        fullName: null,
        role: 'OWNER',
        accessScope: 'NETWORK',
        customRoleId: null,
        storeIds: [],
        tokenHash: sealed.tokenHash,
        expiresAt,
        acceptedAt: null,
        acceptedByUserId: null,
        createdByUserId: null,
        revokedAt: null,
        revokedByUserId: null,
        identityClaimRevision: 2,
      });
      expect(command).toMatchObject({
        id: commandId,
        tenantId,
        requestId,
        issueRequestDigest: requestDigest,
        aadEnvironment: AAD_ENVIRONMENT,
        workflowLocator,
        reservationSubjectId,
        reservationClaimRevision: 1,
        inviteId,
        outboxId,
        messageKey,
        tokenHash: sealed.tokenHash,
        tokenDigestVersion: 'sha256-v1',
        template: 'INITIAL_OWNER_INVITE',
        envelopeVersion: 1,
        keyVersion: 'v1',
        expiresAt,
        claimRevision: 2,
      });
      expect(claim).toMatchObject({
        emailCanonical: canonicalEmail,
        tenantId,
        claimType: 'INVITE',
        subjectId: inviteId,
        workflowLocator,
        revision: 2,
      });

      const persistedOpenInput = persistedEnvelopeInput(outbox, canonicalEmail);
      const rawToken =
        envelopeService.openInitialOwnerInviteToken(persistedOpenInput);
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(
        Buffer.from(outbox.secretCiphertext).includes(
          Buffer.from(rawToken, 'utf8'),
        ),
      ).toBe(false);
      expect(createHash('sha256').update(rawToken).digest('hex')).toBe(
        outbox.tokenHash,
      );
      expect(
        envelopeService.verifyTokenHash(
          rawToken,
          outbox.tokenHash,
          outbox.tokenDigestVersion,
        ),
      ).toBe(true);
      assertExactCanonicalAad(envelopeService, persistedOpenInput);

      const safeLogProjection = {
        event: 'IDENTITY_OWNER_INVITE_HOLD_CREATED',
        schemaVersion: receipt.schemaVersion,
        decision: receipt.decision,
        tenantId: receipt.tenantId,
        commandId: receipt.commandId,
        inviteId: receipt.inviteId,
        outboxId: receipt.outboxId,
        outboxStatus: receipt.outboxStatus,
      };
      expect(audit).toMatchObject({
        id: commandId,
        tenantId,
        actorUserId: null,
        requestId,
        action: 'ISSUE_INITIAL_OWNER_INVITE',
        targetType: 'UserInvite',
        targetId: inviteId,
        reason: null,
        before: null,
        after: receipt,
        metadata: {
          schemaVersion: 1,
          authority: 'IdentityOwnerInviteIssueCommand',
          issueCommandId: commandId,
        },
      });
      for (const [label, projection] of [
        ['issue receipt', receipt],
        ['audit', audit],
        ['safe log projection', safeLogProjection],
      ] as const) {
        assertSecretFree(
          label,
          projection,
          canonicalEmail,
          rawToken,
          sealed.tokenHash,
          sealed.secretCiphertext.toString('hex'),
          sealed.secretCiphertext.toString('base64'),
          requestDigest,
          messageKey,
        );
      }

      const wrongEnvironmentService = createEnvelopeService(
        encryptionKey,
        'other-pg-integration',
      );
      expectInvalidEnvelope(
        () =>
          wrongEnvironmentService.openInitialOwnerInviteToken(
            persistedOpenInput,
          ),
        canonicalEmail,
        rawToken,
        sealed,
      );
      expectInvalidEnvelope(
        () =>
          envelopeService.openInitialOwnerInviteToken({
            ...persistedOpenInput,
            messageKey: randomUUID(),
          }),
        canonicalEmail,
        rawToken,
        sealed,
      );
      for (const changedBinding of [
        { tenantId: randomUUID() },
        { workflowLocator: randomUUID() },
        { inviteId: randomUUID() },
        { outboxId: randomUUID() },
        { requestDigest: randomBytes(32).toString('hex') },
        { tokenHash: randomBytes(32).toString('hex') },
      ] satisfies Array<Partial<OpenIdentityMailInviteTokenInput>>) {
        expectInvalidEnvelope(
          () =>
            envelopeService.openInitialOwnerInviteToken({
              ...persistedOpenInput,
              ...changedBinding,
            }),
          canonicalEmail,
          rawToken,
          sealed,
        );
      }
      expectInvalidEnvelope(
        () =>
          envelopeService.openInitialOwnerInviteToken({
            ...persistedOpenInput,
            secretCiphertext: mutateEnvelopeByte(
              persistedOpenInput.secretCiphertext,
              12,
            ),
          }),
        canonicalEmail,
        rawToken,
        sealed,
      );
      expectInvalidEnvelope(
        () =>
          envelopeService.openInitialOwnerInviteToken({
            ...persistedOpenInput,
            secretCiphertext: mutateEnvelopeByte(
              persistedOpenInput.secretCiphertext,
              persistedOpenInput.secretCiphertext.length - 1,
            ),
          }),
        canonicalEmail,
        rawToken,
        sealed,
      );
    });
  },
);

function createEnvelopeService(
  encryptionKey: string,
  aadEnvironment: string,
): IdentityMailSecretEnvelopeService {
  return new IdentityMailSecretEnvelopeService(
    new ConfigService({
      IDENTITY_MAIL_ENCRYPTION_KEY: encryptionKey,
      IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
      IDENTITY_MAIL_AAD_ENVIRONMENT: aadEnvironment,
    }),
  );
}

async function issueInOneShortTransaction(
  prisma: PrismaClient,
  input: IssueInput,
): Promise<{ receipt: Prisma.JsonValue; issueRpcCalls: number }> {
  let issueRpcCalls = 0;
  const receipt = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`);
      await tx.$executeRaw(Prisma.sql`SET LOCAL statement_timeout = '4s'`);
      issueRpcCalls += 1;
      const [row] = await tx.$queryRaw<
        Array<{ receipt: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT public."identity_owner_invite_issue_hold_v1"(
          CAST(${input.workflowLocator} AS TEXT),
          CAST(${input.tenantId} AS TEXT),
          CAST(${input.reservationSubjectId} AS TEXT),
          CAST(${input.expectedClaimRevision} AS INTEGER),
          CAST(${input.requestId} AS TEXT),
          CAST(${input.requestDigest} AS TEXT),
          CAST(${input.aadEnvironment} AS TEXT),
          CAST(${input.commandId} AS TEXT),
          CAST(${input.inviteId} AS TEXT),
          CAST(${input.outboxId} AS TEXT),
          CAST(${input.messageKey} AS TEXT),
          CAST(${input.tokenHash} AS TEXT),
          CAST(${input.secretCiphertext} AS BYTEA),
          CAST(${input.expiresAt} AS TIMESTAMPTZ)
        ) AS receipt
      `);
      if (!row) {
        throw new Error('Owner invite issue RPC returned no receipt');
      }
      return row.receipt;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 2_000,
      timeout: 5_000,
    },
  );

  if (issueRpcCalls !== 1) {
    throw new Error(
      'Owner invite coordinator must call the issue RPC exactly once',
    );
  }
  return { receipt, issueRpcCalls };
}

function assertExactReceipt(
  value: Prisma.JsonValue,
  input: IssueInput,
): IssueReceipt {
  expect(value).toEqual({
    schemaVersion: 1,
    operation: 'ISSUE_DORMANT_OWNER_INVITE',
    decision: 'CREATED',
    tenantId: input.tenantId,
    commandId: input.commandId,
    inviteId: input.inviteId,
    outboxId: input.outboxId,
    outboxStatus: 'HOLD',
    claimType: 'INVITE',
    claimRevision: 2,
    role: 'OWNER',
    accessScope: 'NETWORK',
  });
  expect(Object.keys(value as Prisma.JsonObject).sort()).toEqual(
    [...RECEIPT_KEYS].sort(),
  );
  return value as IssueReceipt;
}

function persistedEnvelopeInput(
  outbox: Awaited<
    ReturnType<PrismaClient['identityMailOutbox']['findUniqueOrThrow']>
  >,
  recipientEmail: string,
): OpenIdentityMailInviteTokenInput {
  expect(outbox.template).toBe('INITIAL_OWNER_INVITE');
  expect(outbox.tokenDigestVersion).toBe(IDENTITY_MAIL_TOKEN_DIGEST_VERSION);
  expect(outbox.envelopeVersion).toBe(IDENTITY_MAIL_ENVELOPE_VERSION);
  expect(outbox.keyVersion).toBe('v1');

  return {
    tenantId: outbox.tenantId,
    workflowLocator: outbox.workflowLocator,
    inviteId: outbox.inviteId,
    outboxId: outbox.id,
    template: 'INITIAL_OWNER_INVITE',
    messageKey: outbox.messageKey,
    requestDigest: outbox.issueRequestDigest,
    recipientEmail,
    expiresAt: outbox.expiresAt,
    tokenHash: outbox.tokenHash,
    digestVersion: IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
    secretCiphertext: Buffer.from(outbox.secretCiphertext),
    envelopeVersion: IDENTITY_MAIL_ENVELOPE_VERSION,
    keyVersion: 'v1',
    aadEnvironment: outbox.aadEnvironment,
  };
}

function assertExactCanonicalAad(
  service: IdentityMailSecretEnvelopeService,
  input: OpenIdentityMailInviteTokenInput,
) {
  const internals = service as unknown as EnvelopeInternals;
  const canonicalBinding = internals.canonicalBinding(input);
  const aad = internals.canonicalAad(
    canonicalBinding,
    input.tokenHash,
    input.digestVersion,
    input.keyVersion,
    input.envelopeVersion,
  );

  expect(aad.toString('utf8')).toBe(
    JSON.stringify({
      domain: 'leetplus:identity-mail-secret-envelope',
      schemaVersion: 2,
      environment: input.aadEnvironment,
      tenantId: input.tenantId,
      workflowLocator: input.workflowLocator,
      inviteId: input.inviteId,
      outboxId: input.outboxId,
      template: input.template,
      messageKey: input.messageKey,
      requestDigest: input.requestDigest,
      recipientEmail: input.recipientEmail,
      tokenHash: input.tokenHash,
      digestVersion: input.digestVersion,
      expiresAt: input.expiresAt.toISOString(),
      keyVersion: input.keyVersion,
      envelopeVersion: input.envelopeVersion,
    }),
  );
}

function expectInvalidEnvelope(
  operation: () => string,
  canonicalEmail: string,
  rawToken: string,
  sealed: SealedIdentityMailInviteToken,
) {
  try {
    operation();
    throw new Error('Expected identity mail envelope rejection');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const response = (error as ServiceUnavailableException).getResponse();
    expect(response).toEqual({
      message: 'Identity mail secret envelope is invalid',
      reasonCode: 'IDENTITY_MAIL_SECRET_ENVELOPE_INVALID',
    });
    assertSecretFree(
      'envelope rejection',
      response,
      canonicalEmail,
      rawToken,
      sealed.tokenHash,
      sealed.secretCiphertext.toString('hex'),
      sealed.secretCiphertext.toString('base64'),
    );
  }
}

function mutateEnvelopeByte(value: Buffer, offset: number): Buffer {
  const mutated = Buffer.from(value);
  mutated[offset] = (mutated[offset] ?? 0) ^ 0x01;
  return mutated;
}

function assertSecretFree(
  label: string,
  value: unknown,
  ...sensitiveValues: string[]
) {
  const serialized = JSON.stringify(value);
  for (const sensitive of sensitiveValues) {
    expect({
      label,
      sensitiveValuePresent: serialized.includes(sensitive),
    }).toEqual({
      label,
      sensitiveValuePresent: false,
    });
  }
  expect(serialized).not.toMatch(
    /email|tokenHash|ciphertext|messageKey|requestDigest|registrationUrl|encryptionKey/iu,
  );
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

function deployMigrations(databaseUrl: string) {
  deployCanonicalPrismaMigrations(databaseUrl, {
    failureMessage:
      'Failed to deploy migrations into the disposable owner-invite test database',
    timeoutMs: 120_000,
  });
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
    throw new Error(
      'Refusing owner-invite HOLD fixtures when NODE_ENV is production',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for owner-invite HOLD PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const normalizedHostname = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+/u, '').toLowerCase();
  if (
    !localHosts.has(normalizedHostname) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing owner-invite HOLD fixtures outside a local CI/test database',
    );
  }

  return parsed;
}

function assertDisposableDatabaseName(databaseName: string) {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe disposable database name');
  }
}
