import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { AuthService } from '../src/auth/auth.service';
import type { EmailVerificationService } from '../src/auth/email-verification.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../src/auth/platform-admin.guard';
import { IdentityEmailClaimService } from '../src/auth/identity-email-claim.service';
import { IdentityMailSecretEnvelopeService } from '../src/auth/identity-mail-secret-envelope.service';
import { InitialOwnerInviteDeliveryGateService } from '../src/auth/initial-owner-invite-delivery-gate.service';
import { PasswordService } from '../src/auth/password.service';
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
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { TenantEntitlementProfileService } from '../src/tenancy/tenant-entitlement-profile.service';
import { TenantExecutionPolicyService } from '../src/tenancy/tenant-execution-policy.service';
import { PrismaIdentityMailWorkerRepository } from '../src/identity-mail-worker/identity-mail-worker.repository';
import { IdentityMailWorkerService } from '../src/identity-mail-worker/identity-mail-worker.service';
import type {
  EnabledIdentityMailWorkerConfig,
  IdentityMailMessage,
  IdentityMailSmtpProvider,
  IdentityMailWorkerSmtpConfig,
} from '../src/identity-mail-worker/identity-mail-worker.types';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION =
  'run-founder-operator-beta-activation-v2-postgres-fixture';
const integrationEnabled =
  process.env.FOUNDER_OPERATOR_BETA_ACTIVATION_V2_PG_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const DISPOSABLE_DATABASE_PATTERN =
  /^lp_founder_beta_v2_pg_test_[0-9a-f]{32}$/u;
const DISPOSABLE_WORKER_ROLE_PATTERN = /^lp_founder_mail_[0-9a-f]{24}$/u;
const RESTORED_COPY_TEMPLATE_PATTERN = /^leetplus_restored_[a-z0-9_]{1,96}$/u;
const RESTORED_COPY_TEMPLATE_ENV =
  'FOUNDER_PILOT_MAIL_PG_RESTORED_COPY_TEMPLATE';
const CURRENT_MIGRATION = '20260819010000_staff_attachment_parent_delete_guard';
const CURRENT_MIGRATION_COUNT = 186;
const RELEASE_SHA = resolveReleaseSha();
const FINGERPRINT_KEY =
  'founder-beta-v2-fixture-fingerprint-key-aaaaaaaaaaaaaaaa';
const WORKER_RPC_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v1"(TEXT)',
  'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)',
] as const;

jest.setTimeout(180_000);

describePostgres(
  'founder-operator beta v2 PostgreSQL activation boundary',
  () => {
    let maintenance: PrismaClient;
    let prisma: PrismaService;
    let activationPrisma: PrismaService;
    let workerPrisma: PrismaClient;
    let workerRepository: PrismaIdentityMailWorkerRepository;
    let activationDatabase: FounderOperatorBetaActivationDatabaseService;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let actor: AuthenticatedUser;
    let config: ConfigService;
    let activationRoleCreated = false;
    let workerRoleCreated = false;
    let workerRoleName = '';
    let workerRoleOid = 0n;
    let workerDatabaseUrl = '';
    let identityMailEncryptionKey = '';

    beforeAll(async () => {
      const sourceUrl = assertSafeIntegrationDatabase();
      const restoredCopyTemplate = restoredCopyTemplateDatabase(sourceUrl);
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

      if (restoredCopyTemplate === null) {
        await maintenance.$executeRawUnsafe(
          `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
        );
        deployCanonicalPrismaMigrations(disposableDatabaseUrl, {
          failureMessage:
            'Unable to deploy canonical migrations for founder beta v2 fixture',
          timeoutMs: 120_000,
        });
      } else {
        const [template] = await maintenance.$queryRaw<
          Array<{
            database_name: string;
            database_oid: bigint;
            other_session_count: number;
          }>
        >(Prisma.sql`
          SELECT
            database.datname AS database_name,
            database.oid::BIGINT AS database_oid,
            (
              SELECT count(*)::int
              FROM pg_catalog.pg_stat_activity AS activity
              WHERE activity.datname = database.datname
                AND activity.pid <> pg_backend_pid()
            ) AS other_session_count
          FROM pg_catalog.pg_database AS database
          WHERE database.datname = ${restoredCopyTemplate}
            AND database.datallowconn
            AND NOT database.datistemplate
        `);
        expect(template).toMatchObject({
          database_name: restoredCopyTemplate,
          other_session_count: 0,
        });
        expect(template?.database_oid).toBeGreaterThan(0n);
        await maintenance.$executeRawUnsafe(
          `CREATE DATABASE "${disposableDatabase}" TEMPLATE "${restoredCopyTemplate}"`,
        );
      }

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
      workerRoleName = `lp_founder_mail_${randomBytes(12).toString('hex')}`;
      assertDisposableWorkerRoleName(workerRoleName);
      const workerRolePassword = randomBytes(24).toString('hex');
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${workerRoleName}" LOGIN PASSWORD '${workerRolePassword}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      workerRoleCreated = true;
      await installLeastPrivilegeWorkerRole(
        prisma,
        disposableDatabase,
        workerRoleName,
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE,
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
      workerDatabaseUrl = databaseUrlForRole(
        disposableDatabaseUrl,
        disposableDatabase,
        workerRoleName,
        workerRolePassword,
      );
      workerPrisma = prismaFor(workerDatabaseUrl);
      await workerPrisma.$connect();
      workerRepository = new PrismaIdentityMailWorkerRepository(workerPrisma);
      const [workerRole] = await prisma.$queryRaw<Array<{ role_oid: bigint }>>(
        Prisma.sql`
          SELECT role.oid::BIGINT AS role_oid
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ${workerRoleName}
        `,
      );
      if (!workerRole) {
        throw new Error('Disposable founder mail worker role was not found');
      }
      workerRoleOid = workerRole.role_oid;

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
      identityMailEncryptionKey = randomBytes(32).toString('base64url');
      const values: Record<string, unknown> = {
        DATABASE_URL: disposableDatabaseUrl,
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: activationUrl.toString(),
        FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
        RELEASE_SHA,
        IDENTITY_MAIL_AAD_ENVIRONMENT: 'ci',
        IDENTITY_MAIL_ENCRYPTION_KEY: identityMailEncryptionKey,
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
      for (const client of [workerPrisma, activationPrisma, prisma]) {
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
          if (workerRoleCreated) {
            assertDisposableWorkerRoleName(workerRoleName);
            await maintenance.$executeRawUnsafe(
              `DROP ROLE "${workerRoleName}"`,
            );
            workerRoleCreated = false;
          }
          const [roleResidue] = await maintenance.$queryRaw<
            Array<{ role_count: number }>
          >(Prisma.sql`
            SELECT count(*)::int AS role_count
            FROM pg_catalog.pg_roles
            WHERE rolname IN (
              ${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE},
              ${workerRoleName}
            )
          `);
          if (roleResidue.role_count !== 0) {
            throw new Error(
              'Disposable founder beta v2 role cleanup left residue',
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
        disposableDatabaseUrl = '';
        disposableDatabase = '';
        workerDatabaseUrl = '';
        workerRoleName = '';
        workerRoleOid = 0n;
        identityMailEncryptionKey = '';
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
      expect(
        Reflect.set(
          ownerInviteLifecycle,
          'reissueFailure',
          safeReissueDatabaseDiagnostic,
        ),
      ).toBe(true);
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

      if (!replacementOutbox.secretCiphertext) {
        throw new Error('Reissued owner invite envelope is unavailable');
      }
      const envelopeService = new IdentityMailSecretEnvelopeService(config);
      const rawInviteToken = envelopeService.openInitialOwnerInviteToken({
        tenantId: provisioned.tenant.id,
        workflowLocator: replacementOutbox.workflowLocator,
        inviteId: replacementOutbox.inviteId,
        outboxId: replacementOutbox.id,
        template: 'INITIAL_OWNER_INVITE',
        messageKey: replacementOutbox.messageKey,
        requestDigest: replacementOutbox.issueRequestDigest,
        recipientEmail: ownerEmail,
        tokenHash: replacementOutbox.tokenHash,
        digestVersion: 'sha256-v1',
        secretCiphertext: Buffer.from(replacementOutbox.secretCiphertext),
        envelopeVersion: 1,
        keyVersion: 'v1',
        aadEnvironment: replacementOutbox.aadEnvironment,
        expiresAt: replacementOutbox.expiresAt,
      });
      const deliveredMessages: IdentityMailMessage[] = [];
      const provider: IdentityMailSmtpProvider = {
        verify: () => Promise.resolve(),
        send: (message) => {
          deliveredMessages.push(message);
          return Promise.resolve({
            outcomeCode: 'SMTP_ACCEPTED',
            receiptDigest: createHash('sha256')
              .update(`founder-current-head:${message.messageId}`)
              .digest('hex'),
          });
        },
        close: () => undefined,
      };
      const smtp: IdentityMailWorkerSmtpConfig = {
        host: 'smtp.current-head.test',
        port: 465,
        tlsMode: 'IMPLICIT_TLS',
        servername: 'smtp.current-head.test',
        username: 'fixture-user',
        password: 'fixture-password',
        from: 'no-reply@leetplus.ru',
        messageIdDomain: 'mail.leetplus.ru',
        connectionTimeoutMs: 3_000,
        greetingTimeoutMs: 3_000,
        socketTimeoutMs: 4_000,
      };
      const workerConfig: EnabledIdentityMailWorkerConfig = {
        enabled: true,
        realSendEnabled: true,
        liveCanaryEnabled: true,
        databaseUrl: workerDatabaseUrl,
        databaseTlsRequired: false,
        databaseConnectTimeoutSeconds: 5,
        databaseSocketTimeoutSeconds: 30,
        expectedDatabase: disposableDatabase,
        expectedRole: workerRoleName,
        expectedMigration: CURRENT_MIGRATION,
        expectedMigrationCount: CURRENT_MIGRATION_COUNT,
        releaseSha: RELEASE_SHA,
        canaryTenantIds: [provisioned.tenant.id],
        publicWebOrigin: 'https://leetplus.ru',
        encryptionKey: identityMailEncryptionKey,
        encryptionKeyVersion: 'v1',
        aadEnvironment: 'ci',
        pollIntervalMs: 1_000,
        leaseMs: 60_000,
        batchSize: 1,
        maxAttempts: 5,
        baseRetryMs: 30_000,
        maxRetryMs: 900_000,
        healthHost: '127.0.0.1',
        healthPort: 19_732,
        smtp,
      };
      const worker = new IdentityMailWorkerService(
        workerConfig,
        workerRepository,
        envelopeService,
        provider,
      );
      const enrollmentUrl = new URL(disposableDatabaseUrl);
      enrollmentUrl.search = '?schema=public';
      const enrollmentEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: enrollmentUrl.toString(),
        FOUNDER_PILOT_MAIL_EXPECTED_DATABASE: disposableDatabase,
        FOUNDER_PILOT_MAIL_TENANT_ID: provisioned.tenant.id,
        FOUNDER_PILOT_MAIL_ENVIRONMENT: 'ci',
        FOUNDER_PILOT_MAIL_RELEASE_SHA: RELEASE_SHA,
        FOUNDER_PILOT_MAIL_WORKER_ROLE: workerRoleName,
        FOUNDER_PILOT_MAIL_EXPECTED_ROLE_OID: workerRoleOid.toString(),
        FOUNDER_PILOT_MAIL_PROVIDER_AUTHORITY_DIGEST:
          worker.providerAuthorityDigest,
        FOUNDER_PILOT_MAIL_OPERATION_ID: randomUUID(),
      };
      const enrollmentPlan = runFounderPilotMailTenantEnrollmentCli(
        'plan',
        enrollmentEnvironment,
      );
      expect(enrollmentPlan).toMatchObject({
        decision: 'READY_TO_APPLY',
        tenantId: provisioned.tenant.id,
        roleName: workerRoleName,
        roleOid: workerRoleOid.toString(),
      });
      expect(enrollmentPlan.requiredConfirmation).toEqual(
        expect.stringMatching(
          /^APPLY FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_V1 /u,
        ),
      );
      const enrollmentApply = runFounderPilotMailTenantEnrollmentCli('apply', {
        ...enrollmentEnvironment,
        FOUNDER_PILOT_MAIL_CONFIRM: String(enrollmentPlan.requiredConfirmation),
      });
      expect(enrollmentApply).toMatchObject({
        decision: 'ACTIVE',
        policyRevision: 1,
        replayed: false,
        reconciledAfterLostResponse: false,
      });

      await worker.assertReady();
      await expect(worker.runOnce()).resolves.toEqual({
        claimed: 1,
        sent: 1,
        retry: 0,
        dead: 0,
        canceled: 0,
        reconciliationRequired: 0,
      });
      expect(deliveredMessages).toHaveLength(1);
      expect(deliveredMessages[0]).toMatchObject({
        to: ownerEmail,
        from: smtp.from,
      });
      expect(deliveredMessages[0]?.text).toContain(
        `https://leetplus.ru/register#invite=${rawInviteToken}`,
      );
      expect(deliveredMessages[0]?.html).toContain(
        `https://leetplus.ru/register#invite=${rawInviteToken}`,
      );

      const password = 'Strong-owner-password-2026!';
      const passwordService = new PasswordService();
      const auth = new AuthService(
        prisma,
        passwordService,
        new JwtService({ secret: randomBytes(32).toString('base64url') }),
        {} as EmailVerificationService,
        config,
        new AccessScopeService(),
        new TenantExecutionPolicyService(),
        identity,
        new InitialOwnerInviteDeliveryGateService(prisma),
      );
      await expect(auth.getInvite(rawInviteToken)).resolves.toMatchObject({
        email: ownerEmail,
        role: 'OWNER',
        scope: 'NETWORK',
        tenant: { slug: tenantSlug },
      });
      const accepted = await auth.acceptInvite(rawInviteToken, {
        email: ownerEmail,
        fullName: 'External owner fixture',
        password,
        confirmPassword: password,
      });
      const [acceptedTenant, acceptedInvite, sentOutbox, owner, ownerClaim] =
        await Promise.all([
          prisma.tenant.findUniqueOrThrow({
            where: { id: provisioned.tenant.id },
          }),
          prisma.userInvite.findUniqueOrThrow({
            where: { id: reissued.inviteId },
          }),
          prisma.identityMailOutbox.findUniqueOrThrow({
            where: { id: reissued.outboxId },
          }),
          prisma.user.findFirstOrThrow({
            where: { tenantId: provisioned.tenant.id, role: 'OWNER' },
          }),
          prisma.identityEmailClaim.findFirstOrThrow({
            where: { tenantId: provisioned.tenant.id },
          }),
        ]);
      const acceptedJson = JSON.stringify(accepted);
      expect({
        responseRole: accepted.user.role,
        responseScope: accepted.user.accessScope,
        responseTenant: accepted.user.tenantId,
        responseContainsToken: acceptedJson.includes(rawInviteToken),
        responseContainsPassword: acceptedJson.includes(password),
        tenantOnboarding: acceptedTenant.onboardingStatus,
        tenantExecutionRevision: acceptedTenant.executionRevision,
        acceptedByOwner: acceptedInvite.acceptedByUserId === owner.id,
        outboxStatus: sentOutbox.status,
        outboxCiphertextCleared: sentOutbox.secretCiphertext === null,
        ownerCount: await prisma.user.count({
          where: { tenantId: provisioned.tenant.id, role: 'OWNER' },
        }),
        ownerRole: owner.role,
        ownerScope: owner.accessScope,
        passwordValid: await passwordService.verify(
          password,
          owner.passwordHash,
        ),
        claimType: ownerClaim.claimType,
        claimSubject: ownerClaim.subjectId,
        acceptAuditCount: await prisma.platformAdminAuditEvent.count({
          where: {
            tenantId: provisioned.tenant.id,
            action: 'TENANT_OWNER_INVITE_ACCEPTED',
          },
        }),
      }).toEqual({
        responseRole: 'OWNER',
        responseScope: 'NETWORK',
        responseTenant: provisioned.tenant.id,
        responseContainsToken: false,
        responseContainsPassword: false,
        tenantOnboarding: 'ONBOARDING',
        tenantExecutionRevision: 2,
        acceptedByOwner: true,
        outboxStatus: 'SENT',
        outboxCiphertextCleared: true,
        ownerCount: 1,
        ownerRole: 'OWNER',
        ownerScope: 'NETWORK',
        passwordValid: true,
        claimType: 'USER',
        claimSubject: owner.id,
        acceptAuditCount: 1,
      });
      await expect(
        ownerInviteLifecycle.status(actor, provisioned.tenant.id),
      ).resolves.toMatchObject({
        tenant: { onboardingStatus: 'ONBOARDING' },
        ownerInvite: {
          id: reissued.inviteId,
          state: 'ACCEPTED',
          deliveryStatus: 'SENT',
        },
        actions: { revokeAllowed: false, reissueRequired: false },
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
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  const restoredCopyTemplate = process.env[RESTORED_COPY_TEMPLATE_ENV]?.trim();
  const restoredCopyMode = restoredCopyTemplate !== undefined;
  if (
    parsed.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    (restoredCopyMode &&
      (parsed.hostname !== '127.0.0.1' ||
        parsed.port === '' ||
        parsed.port === '5432' ||
        !RESTORED_COPY_TEMPLATE_PATTERN.test(databaseName) ||
        restoredCopyTemplate !== databaseName))
  ) {
    throw new Error(
      'Founder beta v2 PG fixture requires an isolated local PostgreSQL URL',
    );
  }
  return raw;
}

function restoredCopyTemplateDatabase(databaseUrl: string): string | null {
  const value = process.env[RESTORED_COPY_TEMPLATE_ENV]?.trim();
  if (value === undefined) return null;
  const databaseName = new URL(databaseUrl).pathname
    .replace(/^\/+|\/+$/gu, '')
    .toLowerCase();
  if (!RESTORED_COPY_TEMPLATE_PATTERN.test(value) || value !== databaseName) {
    throw new Error(
      'Refusing founder beta v2 PG fixture with an unsafe restored-copy template',
    );
  }
  return value;
}

function resolveReleaseSha(): string {
  const value = process.env.CI_RELEASE_SHA;
  if (value === undefined) return 'd'.repeat(40);
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error('CI_RELEASE_SHA must be exact lowercase hexadecimal');
  }
  return value;
}

function safeReissueDatabaseDiagnostic(error: unknown): Error {
  const source = record(error) ? error : {};
  const meta = record(source.meta) ? source.meta : {};
  const sqlState = typeof meta.code === 'string' ? meta.code : 'UNAVAILABLE';
  const primary =
    sqlState === '23502'
      ? 'NOT_NULL_VIOLATION'
      : sqlState === '23514'
        ? 'CHECK_VIOLATION'
        : 'DATABASE_ERROR';
  return new Error(
    [
      'OWNER_INVITE_REISSUE_DATABASE_FAILURE',
      `class=${error instanceof Error ? error.constructor.name : typeof error}`,
      `prismaCode=${typeof source.code === 'string' ? source.code : 'UNAVAILABLE'}`,
      `sqlState=${sqlState}`,
      `primary=${primary}`,
    ].join(' '),
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Unsafe disposable founder beta v2 database name');
  }
}

function assertDisposableWorkerRoleName(roleName: string): void {
  if (!DISPOSABLE_WORKER_ROLE_PATTERN.test(roleName)) {
    throw new Error('Unsafe disposable founder mail worker role name');
  }
}

function databaseUrlFor(databaseUrl: string, databaseName: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function databaseUrlForRole(
  databaseUrl: string,
  databaseName: string,
  roleName: string,
  password: string,
): string {
  assertDisposableDatabaseName(databaseName);
  assertDisposableWorkerRoleName(roleName);
  const parsed = new URL(databaseUrlFor(databaseUrl, databaseName));
  parsed.username = roleName;
  parsed.password = password;
  parsed.searchParams.set('schema', 'public');
  parsed.searchParams.set('connection_limit', '2');
  parsed.searchParams.set('pool_timeout', '5');
  parsed.searchParams.set('connect_timeout', '5');
  parsed.searchParams.set('socket_timeout', '30');
  return parsed.toString();
}

async function installLeastPrivilegeWorkerRole(
  admin: PrismaClient,
  databaseName: string,
  workerRoleName: string,
  activationRoleName: string,
): Promise<void> {
  assertDisposableDatabaseName(databaseName);
  assertDisposableWorkerRoleName(workerRoleName);
  if (activationRoleName !== FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE) {
    throw new Error('Unexpected founder activation role');
  }
  const database = `"${databaseName}"`;
  const workerRole = `"${workerRoleName}"`;
  const activationRole = `"${activationRoleName}"`;
  const statements = [
    `REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    `REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${workerRole}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${workerRole}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${activationRole}`,
    'REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${workerRole}`,
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${workerRole}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${workerRole}`,
    `REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM ${workerRole}`,
    'REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC',
    `GRANT USAGE ON SCHEMA public TO ${workerRole}`,
    ...WORKER_RPC_SIGNATURES.map(
      (signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO ${workerRole}`,
    ),
  ];
  for (const statement of statements) {
    await admin.$executeRawUnsafe(statement);
  }
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

function runFounderPilotMailTenantEnrollmentCli(
  mode: 'apply' | 'check' | 'disable' | 'plan',
  environment: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const script = path.resolve(
    __dirname,
    '../../../packages/database/scripts/founder-pilot-mail-tenant-enrollment.cli.mjs',
  );
  const result = spawnSync(process.execPath, [script, '--mode', mode], {
    encoding: 'utf8',
    env: environment,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const diagnostic =
      result.error?.message || result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `Founder pilot mail tenant enrollment CLI failed: ${diagnostic}`,
    );
  }
  return JSON.parse(result.stdout) as Record<string, unknown>;
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
