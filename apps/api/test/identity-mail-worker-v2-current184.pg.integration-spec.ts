import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256,
  PrismaIdentityMailWorkerV2CandidateRepository,
} from '../src/identity-mail-worker/identity-mail-worker-v2-candidate.repository';
import { deployIdentityMailCurrent184CandidateStack } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-identity-mail-worker-v2-current184-postgres-e2e';
const integrationEnabled =
  process.env.IDENTITY_MAIL_WORKER_V2_CURRENT184_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;

const DISPOSABLE_DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_imtec_pg_[0-9a-f]{24}$/u;
const TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const TENANT_LOCK_SEED = 180;
const PROVIDER_AUTHORITY_DIGEST = fixtureDigest(
  'current184-provider-authority',
);
const WORKER_RPC_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)',
  'public."identity_initial_owner_mail_claim_v2"(TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_provider_mark_v2"(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_complete_v2"(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_reap_v2"(TEXT, TEXT, TEXT, INTEGER)',
] as const;
const EXPECTED_COLUMNS = [
  { name: 'settlementState', type: 'character varying(16)' },
  { name: 'transitionRequestDigest', type: 'character(64)' },
] as const;
const EXPECTED_ROUTINES = [
  'identity_initial_owner_mail_claim_v2(text,text,text,text)',
  'identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)',
  'identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)',
  'identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)',
  'identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)',
  'identity_initial_owner_mail_reap_v2(text,text,text,integer)',
  'identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)',
  'identity_mail_delivery_event_append_v2()',
  'identity_mail_delivery_worker_assert_v2(text,text)',
] as const;

type ReplayFixture = {
  tenantId: string;
  email: string;
  inviteId: string;
  outboxId: string;
  ciphertext: Buffer;
};

jest.setTimeout(300_000);

describePostgres(
  'Identity-mail worker v2 CURRENT184 PostgreSQL candidate acceptance',
  () => {
    let maintenance: PrismaClient;
    let admin: PrismaClient;
    let workerPrisma: PrismaClient | undefined;
    let sourceDatabaseUrl: URL;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let disposableDatabaseCreated = false;
    let workerRoleName = '';
    let workerRoleCreated = false;

    beforeAll(async () => {
      sourceDatabaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_imtec_${randomUUID().replaceAll('-', '')}_ci`;
      assertDisposableDatabaseName(disposableDatabase);

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
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      disposableDatabaseCreated = true;
      disposableDatabaseUrl = databaseUrlFor(
        sourceDatabaseUrl,
        disposableDatabase,
      );
      deployIdentityMailCurrent184CandidateStack(disposableDatabaseUrl, {
        failureMessage:
          'Failed to deploy CURRENT184 into the disposable identity-mail replay database',
        timeoutMs: 180_000,
      });

      admin = prismaFor(singleConnectionUrl(disposableDatabaseUrl));
      await admin.$connect();
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        await workerPrisma?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
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
      if (maintenance && workerRoleCreated) {
        try {
          assertDisposableRoleName(workerRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${workerRoleName}"`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (maintenance && disposableDatabaseCreated) {
        try {
          const [residue] = await maintenance.$queryRaw<
            Array<{ databaseCount: number }>
          >(Prisma.sql`
            SELECT pg_catalog.count(*)::INTEGER AS "databaseCount"
            FROM pg_catalog.pg_database
            WHERE datname = ${disposableDatabase}
          `);
          if (residue?.databaseCount !== 0) {
            throw new Error(
              'CURRENT184 acceptance cleanup left database residue',
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
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'CURRENT184 PostgreSQL acceptance cleanup failed',
        );
      }
    });

    it('deploys exact CURRENT184 and materializes replay evidence safely', async () => {
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
            WHERE migration_name = ${IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION}
          ) AS checksum
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migration).toEqual({
        migrationCount: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
        migrationHead: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
        checksum: IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256,
      });

      const columns = await admin.$queryRaw<
        Array<{ name: string; type: string; nullable: boolean }>
      >(Prisma.sql`
        SELECT
          attribute.attname AS name,
          pg_catalog.format_type(
            attribute.atttypid,
            attribute.atttypmod
          ) AS type,
          NOT attribute.attnotnull AS nullable
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid =
            pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"')
          AND attribute.attname IN (
            'transitionRequestDigest',
            'settlementState'
          )
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attname COLLATE "C"
      `);
      expect(columns).toEqual(
        EXPECTED_COLUMNS.map((column) => ({ ...column, nullable: true })),
      );

      const [index] = await admin.$queryRaw<
        Array<{
          unique: boolean;
          valid: boolean;
          predicate: string | null;
        }>
      >(Prisma.sql`
        SELECT
          index_entry.indisunique AS unique,
          index_entry.indisvalid AS valid,
          pg_catalog.pg_get_expr(
            index_entry.indpred,
            index_entry.indrelid
          ) AS predicate
        FROM pg_catalog.pg_index AS index_entry
        INNER JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_entry.indexrelid
        WHERE index_relation.relname =
          'identity_mail_delivery_event_transition_request_uidx'
      `);
      expect(index).toEqual({
        unique: true,
        valid: true,
        predicate: '("transitionRequestDigest" IS NOT NULL)',
      });
    });

    it('keeps the complete CURRENT184 worker and helper surface owner-only', async () => {
      const routines = await admin.$queryRaw<
        Array<{
          signature: string;
          securityDefiner: boolean;
          searchPath: string[];
          nonOwnerExecuteCount: number;
        }>
      >(Prisma.sql`
        SELECT
          routine.proname || '(' ||
            pg_catalog.replace(
              pg_catalog.oidvectortypes(routine.proargtypes),
              ', ',
              ','
            ) || ')'
              AS signature,
          routine.prosecdef AS "securityDefiner",
          routine.proconfig AS "searchPath",
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
        WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
          AND routine.proname IN (
            'identity_mail_delivery_event_append_v2',
            'identity_mail_delivery_worker_assert_v2',
            'identity_initial_owner_mail_claim_v2',
            'identity_initial_owner_mail_complete_current183',
            'identity_initial_owner_mail_complete_v2',
            'identity_initial_owner_mail_provider_mark_current183',
            'identity_initial_owner_mail_provider_mark_v2',
            'identity_initial_owner_mail_reap_v2',
            'identity_initial_owner_mail_reconcile_v2'
          )
        ORDER BY signature COLLATE "C"
      `);
      expect(routines.map((routine) => routine.signature)).toEqual(
        EXPECTED_ROUTINES,
      );
      expect(
        routines.every(
          (routine) =>
            routine.securityDefiner ===
              (routine.signature !==
                'identity_mail_delivery_event_append_v2()') &&
            routine.nonOwnerExecuteCount === 0 &&
            JSON.stringify(routine.searchPath) ===
              JSON.stringify(['search_path=pg_catalog']),
        ),
      ).toBe(true);

      const [readiness] = await admin.$queryRaw<
        Array<{
          body: string;
        }>
      >(Prisma.sql`
        SELECT routine.prosrc AS body
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.oid = pg_catalog.to_regprocedure(
          'public."identity_mail_delivery_worker_assert_v2"(text,text)'
        )
      `);
      expect(readiness?.body).toContain('migration_count IS DISTINCT FROM 184');
      expect(readiness?.body).toContain("'authorization', false");
      expect(readiness?.body).toContain("'canSend', false");
    });

    it('replays ACTIVE settlement, hands off expiry and rejects unauthorised DRAINING replay', async () => {
      workerRoleName = `lp_imtec_pg_${randomBytes(12).toString('hex')}`;
      const workerPassword = randomBytes(24).toString('base64url');
      assertDisposableRoleName(workerRoleName);
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${workerRoleName}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${workerPassword}'`,
      );
      workerRoleCreated = true;
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
        throw new Error('Disposable CURRENT184 worker role was not found');
      }
      await assertLeastPrivilegeWorkerRole(admin, workerRoleName, role.roleOid);

      workerPrisma = prismaFor(
        databaseUrlForRole(
          sourceDatabaseUrl,
          disposableDatabase,
          workerRoleName,
          workerPassword,
        ),
      );
      await workerPrisma.$connect();
      const repository = new PrismaIdentityMailWorkerV2CandidateRepository(
        workerPrisma,
      );

      const exact = await createReplayFixture(
        admin,
        'exact',
        workerRoleName,
        role.roleOid,
      );
      const exactLeaseOwnerDigest = fixtureDigest('current184-exact-owner');
      const exactLeaseToken = `current184-exact-token-${randomUUID()}`;
      const exactLeaseTokenDigest = fixtureDigest(exactLeaseToken);
      const claim = await repository.claimOne({
        tenantId: exact.tenantId,
        leaseOwnerDigest: exactLeaseOwnerDigest,
        leaseTokenDigest: exactLeaseTokenDigest,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      });
      expect(claim).toMatchObject({
        tenantId: exact.tenantId,
        outboxId: exact.outboxId,
        inviteId: exact.inviteId,
        transitionRevision: 2,
        leaseVersion: 1n,
      });
      expect(claim?.secretCiphertext).toEqual(exact.ciphertext);

      const providerAttemptKey = randomUUID();
      const messageIdDigest = fixtureDigest('current184-exact-message-id');
      const markerQuery = Prisma.sql`
        SELECT public."identity_initial_owner_mail_provider_mark_v2"(
          ${exact.tenantId}::TEXT,
          ${exact.outboxId}::TEXT,
          1::INTEGER,
          ${exactLeaseOwnerDigest}::TEXT,
          ${exactLeaseTokenDigest}::TEXT,
          ${providerAttemptKey}::TEXT,
          ${PROVIDER_AUTHORITY_DIGEST}::TEXT,
          ${messageIdDigest}::TEXT
        ) AS result
      `;
      const firstMarker = await tenantRpc(
        workerPrisma,
        exact.tenantId,
        markerQuery,
      );
      const replayedMarker = await tenantRpc(
        workerPrisma,
        exact.tenantId,
        markerQuery,
      );
      expect(firstMarker).toEqual(replayedMarker);
      expect(firstMarker).toMatchObject({
        decision: 'MARKED',
        transitionRevision: 3,
      });

      await expectSqlState(
        tenantRpc(
          workerPrisma,
          exact.tenantId,
          Prisma.sql`
            SELECT public."identity_initial_owner_mail_provider_mark_v2"(
              ${exact.tenantId}::TEXT,
              ${exact.outboxId}::TEXT,
              1::INTEGER,
              ${exactLeaseOwnerDigest}::TEXT,
              ${exactLeaseTokenDigest}::TEXT,
              ${providerAttemptKey}::TEXT,
              ${PROVIDER_AUTHORITY_DIGEST}::TEXT,
              ${fixtureDigest('current184-conflicting-message')}::TEXT
            ) AS result
          `,
        ),
        '40001',
      );

      const providerReceiptDigest = fixtureDigest(
        'current184-provider-receipt',
      );
      const terminalAckDigest = fixtureDigest('current184-terminal-ack');
      const completionQuery = Prisma.sql`
        SELECT public."identity_initial_owner_mail_complete_v2"(
          ${exact.tenantId}::TEXT,
          ${exact.outboxId}::TEXT,
          1::INTEGER,
          ${exactLeaseOwnerDigest}::TEXT,
          ${exactLeaseTokenDigest}::TEXT,
          ${PROVIDER_AUTHORITY_DIGEST}::TEXT,
          'PROVIDER_ACCEPTED'::TEXT,
          ${providerReceiptDigest}::TEXT,
          ${terminalAckDigest}::TEXT
        ) AS result
      `;
      const firstCompletion = await tenantRpc(
        workerPrisma,
        exact.tenantId,
        completionQuery,
      );
      const replayedCompletion = await tenantRpc(
        workerPrisma,
        exact.tenantId,
        completionQuery,
      );
      expect(firstCompletion).toEqual(replayedCompletion);
      expect(firstCompletion).toMatchObject({
        decision: 'SENT',
        transitionRevision: 4,
      });

      await admin.$executeRawUnsafe(`
        CREATE FUNCTION pg_temp.current184_event_digest_probe(
          p_event public."IdentityMailDeliveryEvent",
          p_domain TEXT
        )
        RETURNS TEXT
        LANGUAGE SQL
        IMMUTABLE
        SET search_path = pg_catalog
        AS $probe$
          SELECT pg_catalog.encode(
            pg_catalog.sha256(
              pg_catalog.convert_to(
                CASE
                  WHEN p_domain =
                    'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2'
                  THEN pg_catalog.concat_ws(
                    '|', p_domain, p_event."tenantId", p_event."outboxId",
                    p_event."inviteId", p_event."transitionRevision"::TEXT,
                    p_event."leaseVersion"::TEXT,
                    p_event."attemptNumber"::TEXT, p_event."eventType",
                    p_event."fromStatus"::TEXT, p_event."toStatus"::TEXT,
                    COALESCE(p_event."leaseOwnerDigest", '-'),
                    COALESCE(
                      p_event."claimEnrollmentStateRevision"::TEXT, '-'
                    ),
                    COALESCE(p_event."claimPolicyRevision"::TEXT, '-'),
                    COALESCE(p_event."claimProviderAuthorityDigest", '-'),
                    COALESCE(p_event."providerAttemptKey", '-'),
                    COALESCE(p_event."providerAuthorityDigest", '-'),
                    COALESCE(p_event."messageIdDigest", '-'),
                    COALESCE(p_event."providerOutcomeClass", '-'),
                    COALESCE(p_event."providerReceiptDigest", '-'),
                    COALESCE(p_event."terminalAckDigest", '-'),
                    COALESCE(p_event."actorDigest", '-'),
                    COALESCE(p_event."stateReasonCode", '-'),
                    pg_catalog.floor(
                      pg_catalog.date_part('epoch', p_event."eventAt") * 1000
                    )::BIGINT::TEXT,
                    p_event."createdTransactionId"
                  )
                  ELSE pg_catalog.concat_ws(
                    '|', p_domain, p_event."tenantId", p_event."outboxId",
                    p_event."inviteId", p_event."transitionRevision"::TEXT,
                    p_event."leaseVersion"::TEXT,
                    p_event."attemptNumber"::TEXT, p_event."eventType",
                    p_event."fromStatus"::TEXT, p_event."toStatus"::TEXT,
                    COALESCE(p_event."leaseOwnerDigest", '-'),
                    COALESCE(
                      p_event."claimEnrollmentStateRevision"::TEXT, '-'
                    ),
                    COALESCE(p_event."claimPolicyRevision"::TEXT, '-'),
                    COALESCE(p_event."claimProviderAuthorityDigest", '-'),
                    COALESCE(p_event."providerAttemptKey", '-'),
                    COALESCE(p_event."providerAuthorityDigest", '-'),
                    COALESCE(p_event."messageIdDigest", '-'),
                    COALESCE(p_event."providerOutcomeClass", '-'),
                    COALESCE(p_event."providerReceiptDigest", '-'),
                    COALESCE(p_event."terminalAckDigest", '-'),
                    COALESCE(p_event."actorDigest", '-'),
                    COALESCE(p_event."stateReasonCode", '-'),
                    p_event."transitionRequestDigest",
                    p_event."settlementState",
                    pg_catalog.floor(
                      pg_catalog.date_part('epoch', p_event."eventAt") * 1000
                    )::BIGINT::TEXT,
                    p_event."createdTransactionId"
                  )
                END,
                'UTF8'
              )
            ),
            'hex'
          )
        $probe$
      `);

      const [exactEvidence] = await admin.$queryRaw<
        Array<{
          eventCount: number;
          requestCount: number;
          transitionRevision: bigint;
          status: string;
          v2DigestMatches: boolean;
          v3DigestMatches: boolean;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.count(*)::INTEGER AS "eventCount",
          pg_catalog.count(*) FILTER (
            WHERE event."transitionRequestDigest" IS NOT NULL
          )::INTEGER AS "requestCount",
          outbox."transitionRevision" AS "transitionRevision",
          outbox."status"::TEXT AS status,
          pg_catalog.bool_and(
            CASE
              WHEN event."transitionRequestDigest" IS NULL THEN
                event."eventDigest" = pg_temp.current184_event_digest_probe(
                  event,
                  'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2'
                )
              ELSE true
            END
          ) AS "v2DigestMatches",
          pg_catalog.bool_and(
            CASE
              WHEN event."transitionRequestDigest" IS NOT NULL THEN
                event."eventDigest" = pg_temp.current184_event_digest_probe(
                  event,
                  'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V3'
                )
              ELSE true
            END
          ) AS "v3DigestMatches"
        FROM public."IdentityMailOutbox" AS outbox
        INNER JOIN public."IdentityMailDeliveryEvent" AS event
          ON event."tenantId" = outbox."tenantId"
         AND event."outboxId" = outbox."id"
        WHERE outbox."tenantId" = ${exact.tenantId}
          AND outbox."id" = ${exact.outboxId}
        GROUP BY outbox."transitionRevision", outbox."status"
      `);
      expect(exactEvidence).toEqual({
        eventCount: 3,
        requestCount: 2,
        transitionRevision: 4n,
        status: 'SENT',
        v2DigestMatches: true,
        v3DigestMatches: true,
      });

      const handoff = await createReplayFixture(
        admin,
        'handoff',
        workerRoleName,
        role.roleOid,
      );
      const handoffLeaseOwnerDigest = fixtureDigest('current184-handoff-owner');
      const handoffLeaseToken = `current184-handoff-token-${randomUUID()}`;
      const handoffLeaseTokenDigest = fixtureDigest(handoffLeaseToken);
      await repository.claimOne({
        tenantId: handoff.tenantId,
        leaseOwnerDigest: handoffLeaseOwnerDigest,
        leaseTokenDigest: handoffLeaseTokenDigest,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      });
      const handoffProviderAttemptKey = randomUUID();
      const handoffQuery = Prisma.sql`
        SELECT public."identity_initial_owner_mail_provider_mark_v2"(
          ${handoff.tenantId}::TEXT,
          ${handoff.outboxId}::TEXT,
          1::INTEGER,
          ${handoffLeaseOwnerDigest}::TEXT,
          ${handoffLeaseTokenDigest}::TEXT,
          ${handoffProviderAttemptKey}::TEXT,
          ${PROVIDER_AUTHORITY_DIGEST}::TEXT,
          ${fixtureDigest('current184-handoff-message')}::TEXT
        ) AS result
      `;
      await expect(
        tenantRpc(workerPrisma, handoff.tenantId, handoffQuery),
      ).resolves.toMatchObject({ decision: 'MARKED', transitionRevision: 3 });

      await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL session_replication_role = 'replica'`,
        );
        await tx.$executeRaw(Prisma.sql`
          UPDATE public."IdentityMailOutbox" AS target_outbox
          SET
            "providerAttemptedAt" = expiry_window.attempted_at,
            "providerAcknowledgeUntil" =
              expiry_window.attempted_at + INTERVAL '1 second',
            "ciphertextClearedAt" = expiry_window.attempted_at
          FROM (
            SELECT
              pg_catalog.clock_timestamp() - INTERVAL '2 seconds'
                AS attempted_at
          ) AS expiry_window
          WHERE target_outbox."tenantId" = ${handoff.tenantId}
            AND target_outbox."id" = ${handoff.outboxId}
        `);
      });
      const handoffBefore = await readOutboxReplaySnapshot(
        admin,
        handoff.outboxId,
      );
      const handoffEventsBefore = await readDeliveryEventSnapshots(
        admin,
        handoff.tenantId,
        handoff.outboxId,
      );
      const handoffReceipt = await tenantRpc(
        workerPrisma,
        handoff.tenantId,
        handoffQuery,
      );
      expect(handoffReceipt).toMatchObject({
        decision: 'HANDOFF',
        transitionRevision: 3,
        handoffReason: 'MARKER_NOT_REUSABLE',
        durableEvidenceEventId: `${handoff.outboxId}:3`,
      });
      await expect(
        readOutboxReplaySnapshot(admin, handoff.outboxId),
      ).resolves.toEqual(handoffBefore);
      await expect(
        readDeliveryEventSnapshots(admin, handoff.tenantId, handoff.outboxId),
      ).resolves.toEqual(handoffEventsBefore);

      const missingDrainCommandId = randomUUID();
      await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL session_replication_role = 'replica'`,
        );
        await tx.$executeRaw(Prisma.sql`
          WITH transition_window AS MATERIALIZED (
            SELECT pg_catalog.date_trunc(
              'milliseconds',
              pg_catalog.clock_timestamp()
            ) AS transition_at
          )
          UPDATE public."IdentityMailDeliveryTenantEnrollment" AS enrollment
          SET
            "state" = 'DRAINING',
            "enabled" = false,
            "activeCommandId" = ${missingDrainCommandId},
            "stateRevision" = "stateRevision" + 1,
            "stateChangedAt" = transition_window.transition_at,
            "updatedAt" = transition_window.transition_at
          FROM transition_window
          WHERE enrollment."tenantId" = ${handoff.tenantId}
        `);
      });
      const drainingOutboxBefore = await readOutboxReplaySnapshot(
        admin,
        handoff.outboxId,
      );
      const drainingEventsBefore = await readDeliveryEventSnapshots(
        admin,
        handoff.tenantId,
        handoff.outboxId,
      );
      await expectSqlState(
        tenantRpc(workerPrisma, handoff.tenantId, handoffQuery),
        '42501',
      );
      await expect(
        readOutboxReplaySnapshot(admin, handoff.outboxId),
      ).resolves.toEqual(drainingOutboxBefore);
      await expect(
        readDeliveryEventSnapshots(admin, handoff.tenantId, handoff.outboxId),
      ).resolves.toEqual(drainingEventsBefore);
    });
  },
);

async function createReplayFixture(
  admin: PrismaClient,
  scenario: string,
  workerRoleName: string,
  workerRoleOid: bigint,
): Promise<ReplayFixture> {
  const suffix = randomUUID();
  const tenantId = randomUUID();
  const email = `${scenario}-${suffix}@example.test`;
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
  const nowAt = new Date();

  await admin.tenant.create({
    data: {
      id: tenantId,
      name: `CURRENT184 replay ${scenario}`,
      slug: `current184-${scenario}-${suffix}`,
      status: 'ACTIVE',
      customerStage: 'PILOT',
      onboardingStatus: 'OWNER_INVITED',
      trialStartsAt,
      trialEndsAt,
      entitlementProfileRevision: 1,
      executionRevision: 1,
      statusChangedAt: trialStartsAt,
      statusReason: 'Disposable CURRENT184 replay fixture',
    },
  });

  await admin.$transaction(async (tx) => {
    // Owner-only diagnostic seeding is restricted to this disposable clone.
    // Candidate CHECK constraints remain active; only append/dormant guards
    // and fixture foreign-key ordering are bypassed.
    await tx.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."UserInvite" (
        "id", "tenantId", "email", "role", "accessScope",
        "customRoleId", "storeIds", "tokenHash", "expiresAt",
        "acceptedAt", "acceptedByUserId", "createdByUserId",
        "revokedAt", "revokedByUserId", "identityClaimRevision",
        "createdAt", "updatedAt"
      ) VALUES (
        ${inviteId}, ${tenantId}, ${email},
        'OWNER'::public."UserRole",
        'NETWORK'::public."UserAccessScope",
        NULL, ARRAY[]::TEXT[], ${tokenHash}, ${expiresAt},
        NULL, NULL, NULL, NULL, NULL, 2, ${nowAt}, ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical", "claimType", "tenantId", "subjectId",
        "workflowLocator", "revision", "createdAt", "updatedAt"
      ) VALUES (
        ${email}, 'INVITE'::public."IdentityEmailClaimType", ${tenantId},
        ${inviteId}, ${workflowLocator}, 2, ${nowAt}, ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityOwnerInviteIssueCommand" (
        "id", "tenantId", "action", "requestId", "issueRequestDigest",
        "aadEnvironment", "workflowLocator", "reservationSubjectId",
        "reservationClaimRevision", "inviteId", "outboxId", "messageKey",
        "tokenHash", "tokenDigestVersion", "template", "envelopeVersion",
        "keyVersion", "expiresAt", "claimRevision", "createdAt"
      ) VALUES (
        ${issueCommandId}, ${tenantId}, 'ISSUE_INITIAL_OWNER_INVITE',
        ${issueRequestId}, ${issueRequestDigest}, 'current184-diagnostic',
        ${workflowLocator}, ${reservationSubjectId}, 1, ${inviteId},
        ${outboxId}, ${messageKey}, ${tokenHash}, 'sha256-v1',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate", 1, 'v1',
        ${expiresAt}, 2, ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailOutbox" (
        "id", "tenantId", "issueCommandId", "inviteId",
        "workflowLocator", "aadEnvironment", "template", "status",
        "messageKey", "issueRequestDigest", "tokenHash",
        "tokenDigestVersion", "secretCiphertext", "envelopeVersion",
        "keyVersion", "expiresAt", "releasedAt", "attempts",
        "leaseVersion", "transitionRevision", "availableAt",
        "createdAt", "updatedAt"
      ) VALUES (
        ${outboxId}, ${tenantId}, ${issueCommandId}, ${inviteId},
        ${workflowLocator}, 'current184-diagnostic',
        'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
        'PENDING'::public."IdentityMailOutboxStatus", ${messageKey},
        ${issueRequestDigest}, ${tokenHash}, 'sha256-v1', ${ciphertext},
        1, 'v1', ${expiresAt}, ${nowAt}, 0, 0, 1, ${nowAt}, ${nowAt},
        ${nowAt}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
        "tenantId", "workerRoleName", "workerRoleOid", "policyRevision",
        "enabled", "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
        "baseRetrySeconds", "maxRetrySeconds",
        "providerAuthorityDigest", "enabledAt", "disabledAt", "createdAt",
        "updatedAt", "state", "stateRevision", "activeCommandId",
        "lastEventDigest", "currentConfigurationDigest", "stateChangedAt"
      ) VALUES (
        ${tenantId}, ${workerRoleName}, ${workerRoleOid}, 3, true,
        5, 60, 120, 30, 300, ${PROVIDER_AUTHORITY_DIGEST},
        ${trialStartsAt}, NULL, ${trialStartsAt}, ${nowAt}, 'ACTIVE', 7,
        NULL, ${fixtureDigest(`event:${suffix}`)},
        ${fixtureDigest(`configuration:${suffix}`)}, ${nowAt}
      )
    `);
  });

  return { tenantId, email, inviteId, outboxId, ciphertext };
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

  const allowedRoutineValues = Prisma.join(
    WORKER_RPC_SIGNATURES.map((signature) => Prisma.sql`(${signature})`),
  );
  const [surface] = await admin.$queryRaw<
    Array<{
      allowedRoutineCount: number;
      extraRoutineCount: number;
      relationPrivilegeCount: number;
      columnPrivilegeCount: number;
      sequencePrivilegeCount: number;
      membershipCount: number;
      defaultAclCount: number;
      ownedObjectCount: number;
    }>
  >(Prisma.sql`
    WITH allowed_routine AS (
      SELECT pg_catalog.to_regprocedure(signature)::OID AS oid
      FROM (VALUES ${allowedRoutineValues}) AS expected(signature)
    ),
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
        FROM (
          SELECT datdba AS owner_oid FROM pg_catalog.pg_database
          UNION ALL
          SELECT nspowner FROM pg_catalog.pg_namespace
          UNION ALL
          SELECT relowner FROM pg_catalog.pg_class
          UNION ALL
          SELECT proowner FROM pg_catalog.pg_proc
          UNION ALL
          SELECT typowner FROM pg_catalog.pg_type
        ) AS owned(owner_oid)
        WHERE owner_oid = ${roleOid}::OID
      ) AS "ownedObjectCount"
  `);
  expect(surface).toEqual({
    allowedRoutineCount: WORKER_RPC_SIGNATURES.length,
    extraRoutineCount: 0,
    relationPrivilegeCount: 0,
    columnPrivilegeCount: 0,
    sequencePrivilegeCount: 0,
    membershipCount: 0,
    defaultAclCount: 0,
    ownedObjectCount: 0,
  });
}

async function tenantRpc(
  client: PrismaClient,
  tenantId: string,
  query: Prisma.Sql,
): Promise<Prisma.JsonValue> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '25s'`);
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$queryRaw(Prisma.sql`
        WITH tenant_lock AS MATERIALIZED (
          SELECT pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
              ${TENANT_LOCK_DOMAIN} || ${tenantId}::TEXT,
              ${TENANT_LOCK_SEED}
            )
          ) AS acquired
        )
        SELECT ${tenantId}::TEXT AS "tenantId"
        FROM tenant_lock
      `);
      const [row] =
        await tx.$queryRaw<Array<{ result: Prisma.JsonValue }>>(query);
      if (!row) {
        throw new Error('CURRENT184 RPC returned no receipt');
      }
      return row.result;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

async function readOutboxReplaySnapshot(
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
    throw new Error('CURRENT184 outbox snapshot was not found');
  }
  return row.snapshot;
}

async function readDeliveryEventSnapshots(
  client: PrismaClient,
  tenantId: string,
  outboxId: string,
): Promise<Prisma.JsonValue[]> {
  const rows = await client.$queryRaw<
    Array<{ snapshot: Prisma.JsonValue }>
  >(Prisma.sql`
    SELECT pg_catalog.to_jsonb(delivery_event) AS snapshot
    FROM public."IdentityMailDeliveryEvent" AS delivery_event
    WHERE delivery_event."tenantId" = ${tenantId}
      AND delivery_event."outboxId" = ${outboxId}
    ORDER BY delivery_event."transitionRevision"
  `);
  return rows.map((row) => row.snapshot);
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
    throw new Error('Refusing CURRENT184 acceptance in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for CURRENT184 acceptance');
  }
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(host) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing CURRENT184 acceptance outside a local CI/test PostgreSQL database',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe CURRENT184 disposable database name');
  }
}

function assertDisposableRoleName(roleName: string): void {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing an unsafe CURRENT184 disposable role name');
  }
}
