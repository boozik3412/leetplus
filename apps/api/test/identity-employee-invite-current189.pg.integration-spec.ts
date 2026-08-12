import {
  Prisma,
  PrismaClient,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import {
  EmployeeInviteDeliveryCoordinator,
  PrismaEmployeeInviteDeliveryDriver,
  type EmployeeInviteDeliveryDriver,
  type EmployeeInviteDeliveryInput,
  type EmployeeInviteDeliveryReceipt,
  type EmployeeInviteRevokeInput,
  type EmployeeInviteRevokeReceipt,
} from '../src/users/employee-invite-delivery-coordinator';
import { EmployeeInviteSecretEnvelope } from '../src/users/employee-invite-secret-envelope';

const REQUIRED_CONFIRMATION =
  'run-identity-employee-invite-current189-postgres-replay';
const integrationEnabled =
  process.env.IDENTITY_EMPLOYEE_INVITE_CURRENT189_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const DISPOSABLE_DATABASE_PATTERN = /^lp_emp189_[0-9a-f]{32}_ci$/u;

type CapturedDeliveryInput = Omit<
  EmployeeInviteDeliveryInput,
  'secretCiphertext'
> & {
  secretCiphertext: Buffer;
};

class CapturingDriver implements EmployeeInviteDeliveryDriver {
  readonly issueInputs: CapturedDeliveryInput[] = [];

  constructor(private readonly delegate: EmployeeInviteDeliveryDriver) {}

  issue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    this.issueInputs.push(copyInput(input));
    return this.delegate.issue(input);
  }

  reissue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    return this.delegate.reissue(input);
  }

  revoke(
    input: EmployeeInviteRevokeInput,
  ): Promise<EmployeeInviteRevokeReceipt> {
    return this.delegate.revoke(input);
  }
}

class CommitThenLoseDriver extends CapturingDriver {
  committedReceipt: EmployeeInviteDeliveryReceipt | null = null;

  override async issue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    const receipt = await super.issue(input);
    this.committedReceipt = receipt;
    throw Object.assign(new Error('database response lost after commit'), {
      code: 'P1001',
    });
  }
}

jest.setTimeout(60_000);

describePostgres(
  'CURRENT189 independent-client PostgreSQL semantic replay',
  () => {
    let firstClient: PrismaClient;
    let secondClient: PrismaClient;
    let observerClient: PrismaClient;
    let databaseUrl = '';
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const storeId = randomUUID();
    const entitlementId = randomUUID();
    const roleOverrideId = randomUUID();
    const tenantSlug = `employee-current189-${tenantId.replaceAll('-', '')}`;
    const actorEmail = `owner-${actorId.replaceAll('-', '')}@integration.invalid`;
    const employeeEmail = `employee-${tenantId.replaceAll('-', '')}@integration.invalid`;
    const providerAuthorityDigest = 'f'.repeat(64);

    beforeAll(async () => {
      databaseUrl = assertSafeIntegrationDatabase();
      firstClient = prismaFor(databaseUrl);
      secondClient = prismaFor(databaseUrl);
      observerClient = prismaFor(databaseUrl);
      await Promise.all([
        firstClient.$connect(),
        secondClient.$connect(),
        observerClient.$connect(),
      ]);

      const [boundary] = await firstClient.$queryRaw<
        Array<{
          current189: string | null;
          postgresMajor: number;
          superuser: boolean;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.to_regprocedure(
            'public."identity_employee_invite_issue_current189_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text,bytea,integer,text,text,timestamp with time zone)'
          )::TEXT AS current189,
          pg_catalog.current_setting('server_version_num')::INTEGER / 10000
            AS "postgresMajor",
          role.rolsuper AS superuser
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = CURRENT_USER
      `);
      expect(boundary).toEqual({
        current189:
          'identity_employee_invite_issue_current189_v1(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text,bytea,integer,text,text,timestamp with time zone)',
        postgresMajor: 16,
        superuser: true,
      });

      await createFixture(firstClient, {
        actorEmail,
        actorId,
        entitlementId,
        roleOverrideId,
        storeId,
        tenantId,
        tenantSlug,
      });
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        if (firstClient) {
          await cleanupFixture(firstClient, tenantId);
          const [residue] = await firstClient.$queryRaw<
            Array<{ candidateRows: number; tenantRows: number }>
          >(Prisma.sql`
            SELECT
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM public."IdentityEmployeeInviteIssueCommandV1"
                WHERE "tenantId" = ${tenantId}
              ) AS "candidateRows",
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM public."Tenant"
                WHERE "id" = ${tenantId}
              ) AS "tenantRows"
          `);
          if (residue?.candidateRows !== 0 || residue.tenantRows !== 0) {
            throw new Error('CURRENT189 replay fixture left database residue');
          }
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await firstClient?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await secondClient?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await observerClient?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'CURRENT189 replay fixture cleanup failed',
        );
      }
    });

    it('replays a committed request from another client despite new random token/ciphertext/UUIDs', async () => {
      const actor = buildActor({
        actorEmail,
        actorId,
        tenantId,
        tenantSlug,
      });
      const requestId = randomUUID();
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1_000);
      const command = {
        requestId,
        email: employeeEmail,
        fullName: 'CURRENT189 Employee',
        role: UserRole.TRAINEE,
        customRoleId: null,
        scope: 'STORES',
        storeIds: [storeId],
        expiresAt: expiresAt.toISOString(),
      };

      const firstDelegate = new PrismaEmployeeInviteDeliveryDriver(firstClient);
      const firstDriver = new CommitThenLoseDriver(firstDelegate);
      const firstCoordinator = buildCoordinator(
        firstClient,
        firstDriver,
        1,
        issuedAt,
      );

      await expect(
        firstCoordinator.issue(actor, command),
      ).rejects.toMatchObject({
        response: {
          reasonCode: 'EMPLOYEE_INVITE_RECONCILIATION_REQUIRED',
        },
      });
      expect(firstDriver.committedReceipt?.decision).toBe('CREATED');

      const secondDelegate = new PrismaEmployeeInviteDeliveryDriver(
        secondClient,
      );
      const secondDriver = new CapturingDriver(secondDelegate);
      const secondCoordinator = buildCoordinator(
        secondClient,
        secondDriver,
        2,
        issuedAt,
      );
      const replayed = await secondCoordinator.issue(actor, command);

      const firstInput = firstDriver.issueInputs[0];
      const secondInput = secondDriver.issueInputs[0];
      if (!firstInput || !secondInput || !firstDriver.committedReceipt) {
        throw new Error('CURRENT189 replay input capture is incomplete');
      }
      expect(replayed).toMatchObject({
        decision: 'REPLAYED',
        replayed: true,
        invite: { id: firstDriver.committedReceipt.inviteId },
      });
      expect(secondInput.requestDigest).toBe(firstInput.requestDigest);
      expect(secondInput.tokenHash).not.toBe(firstInput.tokenHash);
      expect(secondInput.secretCiphertext).not.toEqual(
        firstInput.secretCiphertext,
      );
      expect(secondInput.commandId).not.toBe(firstInput.commandId);
      expect(secondInput.deliveryLocator).not.toBe(firstInput.deliveryLocator);
      expect(secondInput.inviteId).not.toBe(firstInput.inviteId);
      expect(secondInput.outboxId).not.toBe(firstInput.outboxId);
      expect(secondInput.messageKey).not.toBe(firstInput.messageKey);

      const [persisted] = await firstClient.$queryRaw<
        Array<{
          issueCount: number;
          inviteCount: number;
          outboxCount: number;
          storedTokenHash: string;
        }>
      >(Prisma.sql`
        SELECT
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM public."IdentityEmployeeInviteIssueCommandV1"
            WHERE "tenantId" = ${tenantId}
          ) AS "issueCount",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM public."UserInvite"
            WHERE "tenantId" = ${tenantId}
          ) AS "inviteCount",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM public."IdentityEmployeeMailOutboxV1"
            WHERE "tenantId" = ${tenantId}
          ) AS "outboxCount",
          (
            SELECT "tokenHash"
            FROM public."IdentityEmployeeInviteIssueCommandV1"
            WHERE "tenantId" = ${tenantId}
          ) AS "storedTokenHash"
      `);
      expect(persisted).toEqual({
        issueCount: 1,
        inviteCount: 1,
        outboxCount: 1,
        storedTokenHash: firstInput.tokenHash,
      });

      const driftDriver = new CapturingDriver(secondDelegate);
      const driftCoordinator = buildCoordinator(
        secondClient,
        driftDriver,
        3,
        issuedAt,
      );
      await expect(
        driftCoordinator.issue(actor, {
          ...command,
          fullName: 'Changed semantic request',
        }),
      ).rejects.toMatchObject({
        response: { reasonCode: 'EMPLOYEE_INVITE_PRECONDITION_FAILED' },
      });

      const [afterDrift] = await secondClient.$queryRaw<
        Array<{ issueCount: number; outboxCount: number }>
      >(Prisma.sql`
        SELECT
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM public."IdentityEmployeeInviteIssueCommandV1"
            WHERE "tenantId" = ${tenantId}
          ) AS "issueCount",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM public."IdentityEmployeeMailOutboxV1"
            WHERE "tenantId" = ${tenantId}
          ) AS "outboxCount"
      `);
      expect(afterDrift).toEqual({ issueCount: 1, outboxCount: 1 });

      const [piiSurface] = await firstClient.$queryRaw<
        Array<{ recipientDigestColumns: number }>
      >(Prisma.sql`
        SELECT pg_catalog.count(*)::INTEGER AS "recipientDigestColumns"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'IdentityEmployeeInviteIssueCommandV1',
            'IdentityEmployeeMailOutboxV1'
          )
          AND column_name = 'recipientDigest'
      `);
      expect(piiSurface).toEqual({ recipientDigestColumns: 0 });
    });

    it('revalidates tenant, enrollment, and invite expiry after a non-empty advisory-lock wait', async () => {
      await enrollCurrentWorker(firstClient, tenantId, providerAuthorityDigest);
      const actor = buildActor({
        actorEmail,
        actorId,
        tenantId,
        tenantSlug,
      });
      const secondPid = await backendPid(secondClient);

      const suspendedIssue = await runWhileWaitingForTenantLock({
        holderClient: firstClient,
        observerClient,
        tenantId,
        waiterPid: secondPid,
        mutateWhileBlocked: async (tx) => {
          await tx.tenant.update({
            where: { id: tenantId },
            data: {
              status: TenantLifecycleStatus.SUSPENDED,
              updatedAt: new Date(),
            },
          });
        },
        startWaiter: () => {
          const issuedAt = new Date();
          return buildCoordinator(
            secondClient,
            new PrismaEmployeeInviteDeliveryDriver(secondClient),
            4,
            issuedAt,
          ).issue(actor, {
            requestId: randomUUID(),
            email: `suspended-${tenantId.replaceAll('-', '')}@integration.invalid`,
            fullName: 'Suspended tenant employee',
            role: UserRole.TRAINEE,
            customRoleId: null,
            scope: 'STORES',
            storeIds: [storeId],
            expiresAt: new Date(
              issuedAt.getTime() + 7 * 24 * 60 * 60 * 1_000,
            ).toISOString(),
          });
        },
      });
      expect(suspendedIssue.ok).toBe(false);
      if (suspendedIssue.ok) {
        throw new Error('CURRENT189 stale tenant admission was accepted');
      }
      expect(suspendedIssue.error).toMatchObject({
        response: { reasonCode: 'EMPLOYEE_INVITE_PRECONDITION_FAILED' },
      });
      await firstClient.tenant.update({
        where: { id: tenantId },
        data: { status: TenantLifecycleStatus.ACTIVE },
      });

      const expiredTrialIssue = await runWhileWaitingForTenantRowLock({
        holderClient: firstClient,
        observerClient,
        tenantId,
        waiterPid: secondPid,
        mutateWhileBlocked: async (tx) => {
          await tx.$executeRaw(Prisma.sql`
            UPDATE public."Tenant"
            SET
              "trialEndsAt" = pg_catalog.date_trunc(
                'milliseconds',
                pg_catalog.clock_timestamp() + INTERVAL '300 milliseconds'
              ),
              "updatedAt" = pg_catalog.clock_timestamp()
            WHERE "id" = ${tenantId}
          `);
          await tx.$queryRaw(Prisma.sql`
            WITH delay AS MATERIALIZED (
              SELECT pg_catalog.pg_sleep(0.75) AS waited
            )
            SELECT 1::INTEGER AS waited
            FROM delay
          `);
        },
        startWaiter: () => {
          const issuedAt = new Date();
          return buildCoordinator(
            secondClient,
            new PrismaEmployeeInviteDeliveryDriver(secondClient),
            5,
            issuedAt,
          ).issue(actor, {
            requestId: randomUUID(),
            email: `expired-trial-${tenantId.replaceAll('-', '')}@integration.invalid`,
            fullName: 'Expired trial employee',
            role: UserRole.TRAINEE,
            customRoleId: null,
            scope: 'STORES',
            storeIds: [storeId],
            expiresAt: new Date(
              issuedAt.getTime() + 7 * 24 * 60 * 60 * 1_000,
            ).toISOString(),
          });
        },
      });
      expect(expiredTrialIssue.ok).toBe(false);
      if (expiredTrialIssue.ok) {
        throw new Error('CURRENT189 stale tenant row-lock clock was accepted');
      }
      expect(expiredTrialIssue.error).toMatchObject({
        response: { reasonCode: 'EMPLOYEE_INVITE_PRECONDITION_FAILED' },
      });
      await firstClient.tenant.update({
        where: { id: tenantId },
        data: {
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
      });

      const drainingClaim = await runWhileWaitingForTenantLock({
        holderClient: firstClient,
        observerClient,
        tenantId,
        waiterPid: secondPid,
        mutateWhileBlocked: async (tx) => {
          await tx.$executeRaw(Prisma.sql`
            UPDATE public."IdentityEmployeeMailTenantEnrollmentV1"
            SET
              "state" = 'DRAINING',
              "stateRevision" = "stateRevision" + 1,
              "updatedAt" = pg_catalog.clock_timestamp()
            WHERE "tenantId" = ${tenantId}
          `);
        },
        startWaiter: () =>
          claimEmployeeMail(secondClient, {
            leaseOwnerDigest: '8'.repeat(64),
            leaseTokenDigest: '9'.repeat(64),
            providerAuthorityDigest,
            tenantId,
          }),
      });
      expect(drainingClaim.ok).toBe(true);
      if (!drainingClaim.ok) {
        throw new Error('CURRENT189 DRAINING claim did not settle safely');
      }
      expect(drainingClaim.value).toMatchObject({ decision: 'EMPTY' });
      await setEnrollmentState(firstClient, tenantId, 'ACTIVE');

      const [{ inviteId, outboxId }] = await firstClient.$queryRaw<
        Array<{ inviteId: string; outboxId: string }>
      >(Prisma.sql`
        SELECT "inviteId", "outboxId"
        FROM public."IdentityEmployeeInviteIssueCommandV1"
        WHERE "tenantId" = ${tenantId}
        ORDER BY "createdAt", "id"
        LIMIT 1
      `);
      if (!inviteId || !outboxId) {
        throw new Error('CURRENT189 pending replay fixture was not found');
      }

      const expiredClaim = await runWhileWaitingForTenantLock({
        holderClient: firstClient,
        observerClient,
        tenantId,
        waiterPid: secondPid,
        mutateWhileBlocked: async (tx) => {
          await tx.$executeRaw(Prisma.sql`
            UPDATE public."UserInvite"
            SET
              "expiresAt" = pg_catalog.date_trunc(
                'milliseconds',
                pg_catalog.clock_timestamp() + INTERVAL '300 milliseconds'
              ),
              "updatedAt" = pg_catalog.clock_timestamp()
            WHERE "tenantId" = ${tenantId} AND "id" = ${inviteId}
          `);
          await tx.$executeRaw(Prisma.sql`
            UPDATE public."IdentityEmployeeMailOutboxV1"
            SET
              "expiresAt" = pg_catalog.date_trunc(
                'milliseconds',
                pg_catalog.clock_timestamp() + INTERVAL '300 milliseconds'
              ),
              "updatedAt" = pg_catalog.clock_timestamp()
            WHERE "tenantId" = ${tenantId} AND "id" = ${outboxId}
          `);
          await tx.$queryRaw(Prisma.sql`
            WITH delay AS MATERIALIZED (
              SELECT pg_catalog.pg_sleep(0.75) AS waited
            )
            SELECT 1::INTEGER AS waited
            FROM delay
          `);
        },
        startWaiter: () =>
          claimEmployeeMail(secondClient, {
            leaseOwnerDigest: 'a'.repeat(64),
            leaseTokenDigest: 'b'.repeat(64),
            providerAuthorityDigest,
            tenantId,
          }),
      });
      expect(expiredClaim.ok).toBe(true);
      if (!expiredClaim.ok) {
        throw new Error(
          'CURRENT189 expired invite claim did not settle safely',
        );
      }
      expect(expiredClaim.value).toMatchObject({ decision: 'EMPTY' });

      await restoreInviteExpiry(firstClient, tenantId, inviteId, outboxId);
      const [freshState] = await firstClient.$queryRaw<
        Array<{
          enrollmentState: string;
          inviteLive: boolean;
          outboxStatus: string;
          tenantStatus: string;
        }>
      >(Prisma.sql`
        SELECT
          enrollment."state" AS "enrollmentState",
          invite."expiresAt" > pg_catalog.clock_timestamp() AS "inviteLive",
          outbox."status" AS "outboxStatus",
          tenant."status"::TEXT AS "tenantStatus"
        FROM public."Tenant" AS tenant
        INNER JOIN public."IdentityEmployeeMailTenantEnrollmentV1" AS enrollment
          ON enrollment."tenantId" = tenant."id"
        INNER JOIN public."UserInvite" AS invite
          ON invite."tenantId" = tenant."id" AND invite."id" = ${inviteId}
        INNER JOIN public."IdentityEmployeeMailOutboxV1" AS outbox
          ON outbox."tenantId" = invite."tenantId"
         AND outbox."inviteId" = invite."id"
        WHERE tenant."id" = ${tenantId}
      `);
      expect(freshState).toEqual({
        enrollmentState: 'ACTIVE',
        inviteLive: true,
        outboxStatus: 'PENDING',
        tenantStatus: 'ACTIVE',
      });
    });
  },
);

type Settled<T> = { ok: true; value: T } | { error: unknown; ok: false };

type Deferred = {
  promise: Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

async function runWhileWaitingForTenantLock<T>(input: {
  holderClient: PrismaClient;
  mutateWhileBlocked: (tx: Prisma.TransactionClient) => Promise<void>;
  observerClient: PrismaClient;
  startWaiter: () => Promise<T>;
  tenantId: string;
  waiterPid: number;
}): Promise<Settled<T>> {
  const acquired = deferred();
  const release = deferred();
  const holder = input.holderClient
    .$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_catalog.set_config(
            'leetplus.employee_invite_tenant_id', ${input.tenantId}, true
          )
        `);
        await tx.$queryRaw(Prisma.sql`
          WITH tenant_lock AS MATERIALIZED (
            SELECT pg_catalog.pg_advisory_xact_lock(
              pg_catalog.hashtextextended(
                'leetplus:identity-mail-tenant:v1:' || ${input.tenantId},
                180
              )
            ) AS acquired
          )
          SELECT ${input.tenantId}::TEXT AS "tenantId"
          FROM tenant_lock
        `);
        acquired.resolve();
        await release.promise;
        await input.mutateWhileBlocked(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      },
    )
    .catch((error: unknown) => {
      acquired.reject(error);
      throw error;
    });

  await acquired.promise;
  const waiter = settle(input.startWaiter());
  let observationError: unknown;
  try {
    await waitForAdvisoryLock(input.observerClient, input.waiterPid);
  } catch (error) {
    observationError = error;
  } finally {
    release.resolve();
  }
  await holder;
  if (observationError) {
    throw observationError instanceof Error
      ? observationError
      : new Error('CURRENT189 advisory wait observation failed');
  }
  return waiter;
}

async function runWhileWaitingForTenantRowLock<T>(input: {
  holderClient: PrismaClient;
  mutateWhileBlocked: (tx: Prisma.TransactionClient) => Promise<void>;
  observerClient: PrismaClient;
  startWaiter: () => Promise<T>;
  tenantId: string;
  waiterPid: number;
}): Promise<Settled<T>> {
  const acquired = deferred();
  const release = deferred();
  const holder = input.holderClient
    .$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT 1
          FROM public."Tenant"
          WHERE "id" = ${input.tenantId}
          FOR UPDATE
        `);
        acquired.resolve();
        await release.promise;
        await input.mutateWhileBlocked(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      },
    )
    .catch((error: unknown) => {
      acquired.reject(error);
      throw error;
    });

  await acquired.promise;
  const waiter = settle(input.startWaiter());
  let observationError: unknown;
  try {
    await waitForNonAdvisoryRowLock(input.observerClient, input.waiterPid);
  } catch (error) {
    observationError = error;
  } finally {
    release.resolve();
  }
  await holder;
  if (observationError) {
    throw observationError instanceof Error
      ? observationError
      : new Error('CURRENT189 row-lock observation failed');
  }
  return waiter;
}

async function waitForAdvisoryLock(
  observer: PrismaClient,
  waiterPid: number,
): Promise<void> {
  let lastState: {
    waitEvent: string | null;
    waitEventType: string | null;
  } | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [state] = await observer.$queryRaw<
      Array<{ waitEvent: string | null; waitEventType: string | null }>
    >(Prisma.sql`
      SELECT
        activity.wait_event AS "waitEvent",
        activity.wait_event_type AS "waitEventType"
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${waiterPid}
    `);
    lastState = state ?? null;
    if (
      state?.waitEventType === 'Lock' &&
      state.waitEvent?.toLowerCase() === 'advisory'
    ) {
      return;
    }
    await delay(25);
  }
  throw new Error(
    `CURRENT189 waiter did not enter advisory lock wait: ${JSON.stringify(lastState)}`,
  );
}

async function waitForNonAdvisoryRowLock(
  observer: PrismaClient,
  waiterPid: number,
): Promise<void> {
  let lastState: {
    waitEvent: string | null;
    waitEventType: string | null;
  } | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [state] = await observer.$queryRaw<
      Array<{ waitEvent: string | null; waitEventType: string | null }>
    >(Prisma.sql`
      SELECT
        activity.wait_event AS "waitEvent",
        activity.wait_event_type AS "waitEventType"
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${waiterPid}
    `);
    lastState = state ?? null;
    if (
      state?.waitEventType === 'Lock' &&
      state.waitEvent?.toLowerCase() !== 'advisory'
    ) {
      return;
    }
    await delay(25);
  }
  throw new Error(
    `CURRENT189 waiter did not enter a row-lock wait: ${JSON.stringify(lastState)}`,
  );
}

async function backendPid(prisma: PrismaClient): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ pid: number }>>(
    Prisma.sql`SELECT pg_catalog.pg_backend_pid() AS pid`,
  );
  if (!row || !Number.isInteger(row.pid) || row.pid <= 0) {
    throw new Error('CURRENT189 worker backend PID is unavailable');
  }
  return row.pid;
}

async function enrollCurrentWorker(
  prisma: PrismaClient,
  tenantId: string,
  providerAuthorityDigest: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_catalog.set_config(
        'leetplus.employee_invite_tenant_id', ${tenantId}, true
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."IdentityEmployeeMailTenantEnrollmentV1" (
        "tenantId", "workerRoleName", "workerRoleOid", "enabled", "state",
        "stateRevision", "policyRevision", "providerAuthorityDigest",
        "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
        "baseRetrySeconds", "maxRetrySeconds"
      )
      SELECT
        ${tenantId}, session_user, role.oid, TRUE, 'ACTIVE', 1, 1,
        ${providerAuthorityDigest}, 3, 30, 10, 1, 10
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = session_user
    `);
  });
}

async function setEnrollmentState(
  prisma: PrismaClient,
  tenantId: string,
  state: 'ACTIVE' | 'DRAINING',
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_catalog.set_config(
        'leetplus.employee_invite_tenant_id', ${tenantId}, true
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE public."IdentityEmployeeMailTenantEnrollmentV1"
      SET
        "state" = ${state},
        "stateRevision" = "stateRevision" + 1,
        "updatedAt" = pg_catalog.clock_timestamp()
      WHERE "tenantId" = ${tenantId}
    `);
  });
}

async function claimEmployeeMail(
  prisma: PrismaClient,
  input: {
    leaseOwnerDigest: string;
    leaseTokenDigest: string;
    providerAuthorityDigest: string;
    tenantId: string;
  },
): Promise<Record<string, unknown>> {
  const [row] = await prisma.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
    Prisma.sql`
      SELECT public."identity_employee_mail_claim_current189_v1"(
        ${input.tenantId}::TEXT,
        ${input.leaseOwnerDigest}::TEXT,
        ${input.leaseTokenDigest}::TEXT,
        ${input.providerAuthorityDigest}::TEXT
      ) AS receipt
    `,
  );
  if (!row || !isJsonRecord(row.receipt)) {
    throw new Error('CURRENT189 claim returned an invalid receipt');
  }
  return row.receipt;
}

async function restoreInviteExpiry(
  prisma: PrismaClient,
  tenantId: string,
  inviteId: string,
  outboxId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_catalog.set_config(
        'leetplus.employee_invite_tenant_id', ${tenantId}, true
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE public."UserInvite" AS invite
      SET
        "expiresAt" = source."expiresAt",
        "updatedAt" = pg_catalog.clock_timestamp()
      FROM public."IdentityEmployeeInviteIssueCommandV1" AS source
      WHERE invite."tenantId" = ${tenantId}
        AND invite."id" = ${inviteId}
        AND source."tenantId" = invite."tenantId"
        AND source."inviteId" = invite."id"
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE public."IdentityEmployeeMailOutboxV1" AS outbox
      SET
        "expiresAt" = source."expiresAt",
        "updatedAt" = pg_catalog.clock_timestamp()
      FROM public."IdentityEmployeeInviteIssueCommandV1" AS source
      WHERE outbox."tenantId" = ${tenantId}
        AND outbox."id" = ${outboxId}
        AND source."tenantId" = outbox."tenantId"
        AND source."outboxId" = outbox."id"
    `);
  });
}

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ error, ok: false }),
  );
}

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: (reason?: unknown) => rejectPromise?.(reason),
    resolve: () => resolvePromise?.(),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildCoordinator(
  prisma: PrismaClient,
  driver: EmployeeInviteDeliveryDriver,
  randomByte: number,
  now: Date,
): EmployeeInviteDeliveryCoordinator {
  const freshScope = new FreshStoreScopeService(
    prisma as never,
    new AccessScopeService(),
  );
  return new EmployeeInviteDeliveryCoordinator(
    freshScope,
    driver,
    new EmployeeInviteSecretEnvelope(
      {
        encryptionKey: Buffer.alloc(32, 9),
        keyVersion: 'employee-v1',
        aadEnvironment: 'ci',
      },
      (size) => Buffer.alloc(size, randomByte),
    ),
    {
      enabled: true,
      executionMode: 'DORMANT_TEST_ONLY',
      environment: 'ci',
      lostResponseRetries: 0,
    },
    () => new Date(now),
    randomUUID,
  );
}

function buildActor(input: {
  actorEmail: string;
  actorId: string;
  tenantId: string;
  tenantSlug: string;
}): AuthenticatedUser {
  const roleOverride = { permissions: ['manage_users'] };

  return {
    id: input.actorId,
    email: input.actorEmail,
    fullName: 'CURRENT189 Owner',
    role: UserRole.OWNER,
    isActive: true,
    isPlatformAdmin: false,
    tenantId: input.tenantId,
    tenantSlug: input.tenantSlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
    permissions: resolveUserCapabilities({
      role: UserRole.OWNER,
      roleOverride,
    }),
  };
}

async function createFixture(
  prisma: PrismaClient,
  input: {
    actorEmail: string;
    actorId: string;
    entitlementId: string;
    roleOverrideId: string;
    storeId: string;
    tenantId: string;
    tenantSlug: string;
  },
): Promise<void> {
  const now = new Date();
  await prisma.tenant.create({
    data: {
      id: input.tenantId,
      name: 'CURRENT189 independent-client fixture',
      slug: input.tenantSlug,
      status: TenantLifecycleStatus.ACTIVE,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.ACTIVE,
      trialStartsAt: new Date(now.getTime() - 60 * 60 * 1_000),
      trialEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      entitlementProfileRevision: 1,
      executionRevision: 1,
    },
  });
  await prisma.tenantModuleEntitlement.create({
    data: {
      id: input.entitlementId,
      tenantId: input.tenantId,
      module: 'USERS_ROLES',
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: false,
      profileRevision: 1,
      reason: 'CURRENT189 independent-client fixture',
    },
  });
  await prisma.user.create({
    data: {
      id: input.actorId,
      tenantId: input.tenantId,
      email: input.actorEmail,
      passwordHash: 'synthetic-not-a-password',
      fullName: 'CURRENT189 Owner',
      role: UserRole.OWNER,
      accessScope: 'NETWORK',
      isActive: true,
      isPlatformAdmin: false,
      emailVerifiedAt: now,
    },
  });
  await prisma.userRoleOverride.create({
    data: {
      id: input.roleOverrideId,
      tenantId: input.tenantId,
      role: UserRole.OWNER,
      permissions: ['manage_users'],
    },
  });
  await prisma.store.create({
    data: {
      id: input.storeId,
      tenantId: input.tenantId,
      name: 'CURRENT189 Store',
      isActive: true,
    },
  });
}

async function cleanupFixture(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_catalog.set_config(
        'leetplus.employee_invite_tenant_id', ${tenantId}, true
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."IdentityEmployeeMailDeliveryEventV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."IdentityEmployeeInviteRevokeCommandV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."IdentityEmployeeMailOutboxV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."IdentityEmployeeInviteIssueCommandV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."IdentityEmployeeMailTenantEnrollmentV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.identityEmailClaim.deleteMany({ where: { tenantId } });
    await tx.userInvite.deleteMany({ where: { tenantId } });
    await tx.userRoleOverride.deleteMany({ where: { tenantId } });
    await tx.userStoreAccess.deleteMany({
      where: { user: { tenantId } },
    });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.store.deleteMany({ where: { tenantId } });
    await tx.tenantModuleEntitlement.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
}

function copyInput(input: EmployeeInviteDeliveryInput): CapturedDeliveryInput {
  return {
    ...input,
    storeIds: [...input.storeIds],
    secretCiphertext: Buffer.from(input.secretCiphertext),
    expiresAt: new Date(input.expiresAt),
  };
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: singleConnectionUrl(databaseUrl) } },
  });
}

function singleConnectionUrl(databaseUrl: string): string {
  const target = new URL(databaseUrl);
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('connect_timeout', '5');
  target.searchParams.set('socket_timeout', '30');
  return target.toString();
}

function assertSafeIntegrationDatabase(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing CURRENT189 PostgreSQL fixture in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for CURRENT189 PostgreSQL fixture',
    );
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+|\/+$/gu, ''),
  );
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(parsed.hostname) ||
    !DISPOSABLE_DATABASE_PATTERN.test(databaseName)
  ) {
    throw new Error(
      'CURRENT189 PostgreSQL fixture requires an exact local disposable database',
    );
  }
  return parsed.toString();
}
