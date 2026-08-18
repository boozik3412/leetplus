import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../src/auth/platform-admin.guard';
import { IdentityEmailClaimService } from '../src/auth/identity-email-claim.service';
import { FounderOperatorBetaActivationDatabaseService } from '../src/admin/founder-operator-beta-activation.database';
import {
  FounderOperatorBetaActivationService,
  type FounderOperatorBetaActivationResult,
} from '../src/admin/founder-operator-beta-activation.service';
import { FounderOperatorBetaGoService } from '../src/admin/founder-operator-beta-go.service';
import { FounderOwnerInviteLifecycleService } from '../src/admin/founder-owner-invite-lifecycle.service';
import { SharedTenantProvisioningService } from '../src/admin/shared-tenant-provisioning.service';
import { FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE } from '../src/config/environment-validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantEntitlementProfileService } from '../src/tenancy/tenant-entitlement-profile.service';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-founder-operator-beta-activation-v2-postgres-fixture';
const integrationEnabled =
  process.env.FOUNDER_OPERATOR_BETA_ACTIVATION_V2_PG_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const DISPOSABLE_DATABASE_PATTERN =
  /^lp_founder_beta_v2_pg_test_[0-9a-f]{32}$/u;
const RELEASE_SHA = 'd'.repeat(40);
const FINGERPRINT_KEY =
  'founder-beta-v2-fixture-fingerprint-key-aaaaaaaaaaaaaaaa';

jest.setTimeout(180_000);

describePostgres(
  'founder-operator beta v2 PostgreSQL activation boundary',
  () => {
    let maintenance: PrismaClient;
    let prisma: PrismaService;
    let activationPrisma: PrismaService;
    let activationDatabase: FounderOperatorBetaActivationDatabaseService;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let actor: AuthenticatedUser;
    let config: ConfigService;
    let activationRoleCreated = false;

    beforeAll(async () => {
      const sourceUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_founder_beta_v2_pg_test_${randomUUID().replaceAll('-', '')}`;
      assertDisposableDatabaseName(disposableDatabase);
      disposableDatabaseUrl = databaseUrlFor(sourceUrl, disposableDatabase);
      maintenance = prismaFor(databaseUrlFor(sourceUrl, 'postgres'));
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
      deployCanonicalPrismaMigrations(disposableDatabaseUrl, {
        failureMessage:
          'Unable to deploy canonical migrations for founder beta v2 fixture',
        timeoutMs: 120_000,
      });

      prisma = new PrismaService({
        datasources: { db: { url: disposableDatabaseUrl } },
      });
      await prisma.$connect();

      const [existingRole] = await maintenance.$queryRaw<
        Array<{ role_count: number }>
      >(Prisma.sql`
        SELECT count(*)::int AS role_count
        FROM pg_catalog.pg_roles
        WHERE rolname = ${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}
      `);
      expect(existingRole.role_count).toBe(0);
      const activationRolePassword = randomBytes(24).toString('hex');
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}" LOGIN PASSWORD '${activationRolePassword}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      activationRoleCreated = true;
      await maintenance.$executeRawUnsafe(
        `REVOKE CREATE, TEMPORARY ON DATABASE "${disposableDatabase}" FROM PUBLIC`,
      );
      await prisma.$executeRawUnsafe(
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
      );
      await prisma.$executeRawUnsafe(
        `GRANT USAGE ON SCHEMA public TO "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}"`,
      );
      await prisma.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION public."founder_operator_beta_tenant_activate_v2"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE) TO "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}"`,
      );
      const activationUrl = new URL(disposableDatabaseUrl);
      activationUrl.username = FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE;
      activationUrl.password = activationRolePassword;
      activationUrl.search =
        '?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5';
      activationPrisma = new PrismaService({
        datasources: { db: { url: activationUrl.toString() } },
      });
      await activationPrisma.$connect();

      const platformTenantId = randomUUID();
      const actorId = randomUUID();
      await prisma.tenant.create({
        data: {
          id: platformTenantId,
          name: 'Founder beta v2 fixture platform',
          slug: `founder-v2-platform-${platformTenantId}`,
          status: 'ACTIVE',
          customerStage: 'INTERNAL',
          onboardingStatus: 'ACTIVE',
        },
      });
      await prisma.user.create({
        data: {
          id: actorId,
          tenantId: platformTenantId,
          email: `founder-v2-platform-${actorId}@example.test`,
          passwordHash: 'not-a-login-credential',
          role: 'OWNER',
          accessScope: 'NETWORK',
          isPlatformAdmin: true,
        },
      });
      actor = { id: actorId, isPlatformAdmin: true } as AuthenticatedUser;
      const values: Record<string, unknown> = {
        DATABASE_URL: disposableDatabaseUrl,
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: activationUrl.toString(),
        FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
        RELEASE_SHA,
        IDENTITY_MAIL_AAD_ENVIRONMENT: 'ci',
        IDENTITY_MAIL_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
        IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: FINGERPRINT_KEY,
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
      };
      config = { get: (key: string) => values[key] } as ConfigService;
      activationDatabase = new FounderOperatorBetaActivationDatabaseService(
        config,
      );
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        await activationDatabase?.onModuleDestroy();
      } catch (error) {
        cleanupErrors.push(error);
      }
      for (const client of [activationPrisma, prisma]) {
        try {
          await client?.$disconnect();
        } catch (error) {
          cleanupErrors.push(error);
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
              'Disposable founder beta v2 database cleanup left residue',
            );
          }
          if (activationRoleCreated) {
            await maintenance.$executeRawUnsafe(
              `DROP ROLE "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}"`,
            );
            activationRoleCreated = false;
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
        disposableDatabaseUrl = '';
        disposableDatabase = '';
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'Founder beta v2 PostgreSQL fixture cleanup failed',
        );
      }
    });

    it('atomically activates once, replays safely and leaves no plaintext identity in the receipt', async () => {
      const identity = new IdentityEmailClaimService(config);
      const provisioning = new SharedTenantProvisioningService(
        prisma,
        identity,
      );
      const goService = new FounderOperatorBetaGoService(
        prisma,
        provisioning,
        config,
        identity,
      );
      const activation = new FounderOperatorBetaActivationService(
        activationDatabase,
        config,
        provisioning,
      );
      const ownerInviteLifecycle = new FounderOwnerInviteLifecycleService(
        prisma,
        identity,
        config,
      );
      const effectiveSecurityDefiners = await activationPrisma.$queryRaw<
        Array<{ signature: string }>
      >(Prisma.sql`
        SELECT routine.oid::regprocedure::text AS signature
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
          AND routine.prosecdef
          AND pg_catalog.has_function_privilege(
            session_user,
            routine.oid,
            'EXECUTE'
          )
        ORDER BY routine.oid::regprocedure::text COLLATE "C"
      `);
      expect(effectiveSecurityDefiners).toEqual([
        {
          signature:
            'founder_operator_beta_tenant_activate_v2(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
        },
      ]);
      const run = randomUUID();
      const tenantSlug = `founder-v2-${run}`;
      const ownerEmail = `${tenantSlug}@example.test`;
      const shell = {
        confirmation: `PROVISION ${tenantSlug}`,
        requestId: `${run}-shell`,
        reason: 'Provision an isolated founder beta activation fixture',
        supportTicket: 'FOUNDER-V2-PG',
        tenantName: `Fixture ${tenantSlug}`,
        tenantSlug,
        cohortKey: 'founder-beta-v2-fixture',
        supportOwnerUserId: actor.id,
        storeName: 'Founder V2 Fixture Store',
        storeTimeZone: 'Asia/Yekaterinburg',
        ownerEmail,
      };
      const provisioned = await provisioning.provision(actor, shell);
      const now = Date.now();
      const go = await goService.issue(actor, provisioned.tenant.id, {
        shell,
        go: {
          confirmation: `AUTHORIZE BETA ${tenantSlug}`,
          requestId: randomUUID(),
          reason: 'Authorize isolated founder beta activation fixture',
          supportTicket: 'FOUNDER-V2-PG',
          tenantId: provisioned.tenant.id,
          tenantSlug,
          expectedExecutionRevision: 0,
          expectedEntitlementProfileRevision: 1,
          validUntil: new Date(now + 60 * 60 * 1_000).toISOString(),
          singleFounderRiskAcceptance:
            'I ACCEPT SINGLE-FOUNDER BETA OPERATIONAL RISK',
        },
      });
      const activationBody = {
        shell,
        activation: {
          confirmation: `ACTIVATE ${tenantSlug}`,
          requestId: randomUUID(),
          reason: 'Activate isolated founder beta PostgreSQL fixture',
          supportTicket: 'FOUNDER-V2-PG',
          tenantId: provisioned.tenant.id,
          tenantSlug,
          goId: go.goId,
          expectedExecutionRevision: 0,
          expectedEntitlementProfileRevision: 1,
          inviteExpiresAt: new Date(now + 2 * 60 * 60 * 1_000).toISOString(),
        },
      };

      await expect(
        prisma.$queryRaw(Prisma.sql`
          SELECT public."founder_operator_beta_activation_runtime_assert_v1"()
        `),
      ).rejects.toMatchObject({ code: 'P2010' });
      await expect(
        activationPrisma.$queryRaw(Prisma.sql`
          SELECT public."founder_operator_beta_tenant_activate_v2"(
            NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::BYTEA, NULL::TIMESTAMP(3) WITH TIME ZONE
          )
        `),
      ).rejects.toMatchObject({ code: 'P2010' });

      const first = await activateThroughHttp({
        activation,
        actor,
        body: activationBody,
        goService,
        provisioning,
        tenantId: provisioned.tenant.id,
      });
      const replay = await activation.activate(
        actor,
        provisioned.tenant.id,
        activationBody,
      );
      try {
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}" INHERIT`,
        );
        await expect(
          activation.activate(actor, provisioned.tenant.id, activationBody),
        ).rejects.toMatchObject({
          response: {
            reasonCode:
              'FOUNDER_OPERATOR_BETA_ACTIVATION_BOUNDARY_NOT_ENROLLED',
          },
        });
      } finally {
        await maintenance.$executeRawUnsafe(
          `ALTER ROLE "${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}" NOINHERIT`,
        );
      }
      try {
        await prisma.$executeRawUnsafe(
          'GRANT EXECUTE ON FUNCTION public."founder_operator_beta_tenant_activate_v2"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE) TO PUBLIC',
        );
        await expect(
          activation.activate(actor, provisioned.tenant.id, activationBody),
        ).rejects.toMatchObject({
          response: {
            reasonCode:
              'FOUNDER_OPERATOR_BETA_ACTIVATION_BOUNDARY_NOT_ENROLLED',
          },
        });
      } finally {
        await prisma.$executeRawUnsafe(
          'REVOKE ALL ON FUNCTION public."founder_operator_beta_tenant_activate_v2"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE) FROM PUBLIC',
        );
      }
      await expect(
        activation.activate(actor, provisioned.tenant.id, activationBody),
      ).resolves.toMatchObject({ decision: 'REPLAYED' });
      const [tenant, storedGo, command, invite, outbox, releaseEvents, users] =
        await Promise.all([
          prisma.tenant.findUniqueOrThrow({
            where: { id: provisioned.tenant.id },
          }),
          prisma.founderOperatorBetaGo.findUniqueOrThrow({
            where: { id: go.goId },
          }),
          prisma.founderOperatorBetaActivationCommand.findUniqueOrThrow({
            where: { tenantId: provisioned.tenant.id },
          }),
          prisma.userInvite.findFirstOrThrow({
            where: { tenantId: provisioned.tenant.id },
          }),
          prisma.identityMailOutbox.findFirstOrThrow({
            where: { tenantId: provisioned.tenant.id },
          }),
          prisma.identityMailDeliveryEvent.count({
            where: {
              tenantId: provisioned.tenant.id,
              eventType: 'RELEASED',
            },
          }),
          prisma.user.count({ where: { tenantId: provisioned.tenant.id } }),
        ]);
      const trialMilliseconds =
        (tenant.trialEndsAt?.getTime() ?? 0) -
        (tenant.trialStartsAt?.getTime() ?? 0);
      const responseJson = JSON.stringify([first, replay]);

      expect({
        firstDecision: first.decision,
        replayDecision: replay.decision,
        tenantStatus: tenant.status,
        onboardingStatus: tenant.onboardingStatus,
        executionRevision: tenant.executionRevision,
        trialMilliseconds,
        goStateRevision: storedGo.stateRevision,
        goConsumedAtMatches:
          storedGo.consumedAt?.getTime() === command.activatedAt.getTime(),
        activationCount:
          await prisma.founderOperatorBetaActivationCommand.count({
            where: { tenantId: provisioned.tenant.id },
          }),
        inviteRole: invite.role,
        inviteAccessScope: invite.accessScope,
        outboxStatus: outbox.status,
        outboxTransitionRevision: outbox.transitionRevision.toString(),
        outboxReleased:
          outbox.releasedAt?.getTime() === outbox.availableAt?.getTime(),
        releaseEvents,
        users,
        responseContainsOwnerEmail: responseJson.includes(ownerEmail),
        responseContainsSecretMaterial:
          /token|ciphertext|registrationUrl/u.test(responseJson),
      }).toEqual({
        firstDecision: 'ACTIVATED',
        replayDecision: 'REPLAYED',
        tenantStatus: 'ACTIVE',
        onboardingStatus: 'OWNER_INVITED',
        executionRevision: 1,
        trialMilliseconds: 2_592_000_000,
        goStateRevision: 2,
        goConsumedAtMatches: true,
        activationCount: 1,
        inviteRole: 'OWNER',
        inviteAccessScope: 'NETWORK',
        outboxStatus: 'PENDING',
        outboxTransitionRevision: '1',
        outboxReleased: true,
        releaseEvents: 1,
        users: 0,
        responseContainsOwnerEmail: false,
        responseContainsSecretMaterial: false,
      });

      await expect(
        prisma.$executeRaw(Prisma.sql`
          UPDATE public."FounderOperatorBetaActivationCommand"
          SET "action" = 'ATTEMPTED_MUTATION'
          WHERE "id" = ${command.id}
        `),
      ).rejects.toMatchObject({ code: 'P2010' });

      await expect(
        ownerInviteLifecycle.status(actor, provisioned.tenant.id),
      ).resolves.toMatchObject({
        tenant: {
          id: provisioned.tenant.id,
          status: 'ACTIVE',
          onboardingStatus: 'OWNER_INVITED',
        },
        ownerInvite: {
          id: invite.id,
          state: 'ACTIVE',
          deliveryStatus: 'PENDING',
        },
        actions: { revokeAllowed: true, reissueRequired: false },
      });
      const revokeBody = {
        confirmation: `REVOKE OWNER INVITE ${provisioned.tenant.id}`,
        requestId: `${run}-owner-revoke`,
        reason: 'Invalidate the initial owner invite before provider delivery',
        supportTicket: 'FOUNDER-V2-PG-REVOKE',
        expectedInviteId: invite.id,
      };
      const revoked = await ownerInviteLifecycle.revoke(
        actor,
        provisioned.tenant.id,
        revokeBody,
      );
      const revokeReplay = await ownerInviteLifecycle.revoke(
        actor,
        provisioned.tenant.id,
        revokeBody,
      );
      const [
        revokedInvite,
        canceledOutbox,
        claimCount,
        cancelEvents,
        auditCount,
      ] = await Promise.all([
        prisma.userInvite.findUniqueOrThrow({ where: { id: invite.id } }),
        prisma.identityMailOutbox.findUniqueOrThrow({
          where: { id: outbox.id },
        }),
        prisma.identityEmailClaim.count({
          where: { tenantId: provisioned.tenant.id },
        }),
        prisma.identityMailDeliveryEvent.count({
          where: {
            tenantId: provisioned.tenant.id,
            outboxId: outbox.id,
            eventType: 'CANCELED',
          },
        }),
        prisma.platformAdminAuditEvent.count({
          where: {
            tenantId: provisioned.tenant.id,
            action: 'FOUNDER_OWNER_INVITE_REVOKED',
            requestId: revokeBody.requestId,
          },
        }),
      ]);
      const revokeJson = JSON.stringify([revoked, revokeReplay]);
      expect({
        revokedDecision: revoked.decision,
        replayDecision: revokeReplay.decision,
        revokedByActor: revokedInvite.revokedByUserId === actor.id,
        revokedInviteExpired:
          revokedInvite.expiresAt.getTime() ===
          revokedInvite.revokedAt?.getTime(),
        outboxStatus: canceledOutbox.status,
        outboxCiphertextCleared: canceledOutbox.secretCiphertext === null,
        outboxReason: canceledOutbox.stateReasonCode,
        claimCount,
        cancelEvents,
        auditCount,
        responseContainsOwnerEmail: revokeJson.includes(ownerEmail),
      }).toEqual({
        revokedDecision: 'REVOKED',
        replayDecision: 'REPLAYED',
        revokedByActor: true,
        revokedInviteExpired: true,
        outboxStatus: 'CANCELED',
        outboxCiphertextCleared: true,
        outboxReason: 'OWNER_INVITE_REVOKED',
        claimCount: 0,
        cancelEvents: 1,
        auditCount: 1,
        responseContainsOwnerEmail: false,
      });

      const reissueExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1_000,
      ).toISOString();
      const reissueBody = {
        confirmation: `REISSUE OWNER INVITE ${provisioned.tenant.id}`,
        requestId: randomUUID(),
        reason: 'Create a fresh owner credential after atomic revocation',
        supportTicket: 'FOUNDER-V2-PG-REISSUE',
        expectedInviteId: invite.id,
        expiresAt: reissueExpiresAt,
      };
      const reissued = await ownerInviteLifecycle.reissue(
        actor,
        provisioned.tenant.id,
        reissueBody,
      );
      const reissueReplay = await ownerInviteLifecycle.reissue(
        actor,
        provisioned.tenant.id,
        reissueBody,
      );
      const [
        reissueCommand,
        replacementInvite,
        replacementOutbox,
        replacementClaim,
        inviteCount,
        outboxCount,
        issueCount,
        reissueAuditCount,
      ] = await Promise.all([
        prisma.founderOwnerInviteReissueCommand.findUniqueOrThrow({
          where: { id: reissued.commandId },
        }),
        prisma.userInvite.findUniqueOrThrow({
          where: { id: reissued.inviteId },
        }),
        prisma.identityMailOutbox.findUniqueOrThrow({
          where: { id: reissued.outboxId },
        }),
        prisma.identityEmailClaim.findFirstOrThrow({
          where: { tenantId: provisioned.tenant.id },
        }),
        prisma.userInvite.count({ where: { tenantId: provisioned.tenant.id } }),
        prisma.identityMailOutbox.count({
          where: { tenantId: provisioned.tenant.id },
        }),
        prisma.identityOwnerInviteIssueCommand.count({
          where: { tenantId: provisioned.tenant.id },
        }),
        prisma.platformAdminAuditEvent.count({
          where: {
            tenantId: provisioned.tenant.id,
            action: 'FOUNDER_OWNER_INVITE_REISSUED',
            requestId: reissueBody.requestId,
          },
        }),
      ]);
      const reissueJson = JSON.stringify([reissued, reissueReplay]);
      expect({
        decision: reissued.decision,
        replayDecision: reissueReplay.decision,
        sameCommand: reissueReplay.commandId === reissued.commandId,
        sequence: reissueCommand.sequence,
        predecessor: reissueCommand.predecessorInviteId,
        replacementInviteId: replacementInvite.id,
        replacementRole: replacementInvite.role,
        replacementScope: replacementInvite.accessScope,
        replacementRevoked: replacementInvite.revokedAt,
        replacementOutboxStatus: replacementOutbox.status,
        replacementOutboxReleased:
          replacementOutbox.releasedAt?.getTime() ===
          replacementOutbox.availableAt?.getTime(),
        claimSubject: replacementClaim.subjectId,
        claimLocator: replacementClaim.workflowLocator,
        inviteCount,
        outboxCount,
        issueCount,
        reissueAuditCount,
        responseContainsOwnerEmail: reissueJson.includes(ownerEmail),
        responseContainsSecretMaterial:
          /tokenHash|secretCiphertext|registrationUrl/u.test(reissueJson),
      }).toEqual({
        decision: 'REISSUED',
        replayDecision: 'REPLAYED',
        sameCommand: true,
        sequence: 1,
        predecessor: invite.id,
        replacementInviteId: reissued.inviteId,
        replacementRole: 'OWNER',
        replacementScope: 'NETWORK',
        replacementRevoked: null,
        replacementOutboxStatus: 'PENDING',
        replacementOutboxReleased: true,
        claimSubject: reissued.inviteId,
        claimLocator: reissueCommand.workflowLocator,
        inviteCount: 2,
        outboxCount: 2,
        issueCount: 2,
        reissueAuditCount: 1,
        responseContainsOwnerEmail: false,
        responseContainsSecretMaterial: false,
      });
      await expect(
        ownerInviteLifecycle.status(actor, provisioned.tenant.id),
      ).resolves.toMatchObject({
        ownerInvite: {
          id: reissued.inviteId,
          state: 'ACTIVE',
          deliveryStatus: 'PENDING',
        },
        actions: { revokeAllowed: true, reissueRequired: false },
      });
    });
  },
);

function assertSafeIntegrationDatabase(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is required for founder beta v2 PG fixture');
  }
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname)
  ) {
    throw new Error(
      'Founder beta v2 PG fixture requires an isolated local PostgreSQL URL',
    );
  }
  return raw;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Unsafe disposable founder beta v2 database name');
  }
}

function databaseUrlFor(databaseUrl: string, databaseName: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function activateThroughHttp(input: {
  activation: FounderOperatorBetaActivationService;
  actor: AuthenticatedUser;
  body: unknown;
  goService: FounderOperatorBetaGoService;
  provisioning: SharedTenantProvisioningService;
  tenantId: string;
}): Promise<FounderOperatorBetaActivationResult> {
  const moduleFixture = await Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      { provide: AdminService, useValue: {} },
      { provide: TenantEntitlementProfileService, useValue: {} },
      {
        provide: SharedTenantProvisioningService,
        useValue: input.provisioning,
      },
      { provide: FounderOperatorBetaGoService, useValue: input.goService },
      {
        provide: FounderOperatorBetaActivationService,
        useValue: input.activation,
      },
      { provide: FounderOwnerInviteLifecycleService, useValue: {} },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        const httpRequest = context.switchToHttp().getRequest<{
          user?: AuthenticatedUser;
        }>();
        httpRequest.user = input.actor;
        return true;
      },
    })
    .overrideGuard(PlatformAdminGuard)
    .useValue({ canActivate: () => true })
    .compile();
  let app: INestApplication<App> | undefined;
  try {
    app = moduleFixture.createNestApplication<App>();
    await app.init();
    const response = await request(app.getHttpServer())
      .post(`/admin/shared-beta/tenants/${input.tenantId}/activate`)
      .send(input.body)
      .expect(201);
    const body: unknown = response.body;
    expect(body).toMatchObject({
      ok: true,
      contractVersion: 'FOUNDER_OPERATOR_BETA_ACTIVATION_V2',
      decision: 'ACTIVATED',
    });
    return body as FounderOperatorBetaActivationResult;
  } finally {
    await app?.close();
  }
}
