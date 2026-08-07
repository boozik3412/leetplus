import {
  Prisma,
  PrismaClient,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const REQUIRED_CONFIRMATION =
  'run-guest-portal-current190-postgres-lock-freshness';
const integrationEnabled =
  process.env.GUEST_PORTAL_CURRENT190_PG_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const DISPOSABLE_DATABASE_PATTERN = /^lp_guest190_[0-9a-f]{32}_ci$/u;
const ALL_MODULES = [
  TenantModule.GAMIFICATION,
  TenantModule.ASSORTMENT,
  TenantModule.STAFF,
  TenantModule.COMMUNICATIONS,
  TenantModule.USERS_ROLES,
  TenantModule.INTEGRATIONS,
] as const;

type RaceTarget = 'tenant' | 'entitlement' | 'store' | 'guest';

type Fixture = {
  tenantId: string;
  tenantSlug: string;
  storeId: string;
  guestId: string;
  profileId: string;
  sessionId: string;
  jtiDigest: string;
  bindingDigest: string;
};

type AssertReceipt = {
  sessionId: string;
  tenantId: string;
  storeId: string;
  profileId: string;
  guestId: string;
  tokenVersion: number;
  expiresAt: Date;
  executionRevision: number;
  entitlementProfileRevision: number;
};

type RevokeAllReceipt = {
  batchId: string;
  fenceVersion: number;
  batchSequence: number;
  fenceStatus: string;
  revokedCount: number;
  remainingActiveCount: bigint;
  totalRevokedCount: bigint;
  batchCompletedAt: Date;
  replayed: boolean;
};

type MutationKind = 'issue' | 'rotate';

type LockWait = {
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

jest.setTimeout(120_000);

/**
 * CURRENT190 is dormant and noncanonical. This opt-in fixture must run only
 * against an exact local disposable database after applying the candidate.
 * It proves row-lock order and post-wait snapshot freshness; it does not grant
 * application access or enable any public route.
 */
describePostgres('CURRENT190 guest portal PostgreSQL lock freshness', () => {
  let admin: PrismaClient;
  let holder: PrismaClient;
  let waiter: PrismaClient;
  let waiterTwo: PrismaClient;
  let baselineDeadlocks = 0n;
  const fixture = buildFixture();

  beforeAll(async () => {
    const databaseUrl = assertSafeIntegrationDatabase();
    admin = prismaFor(databaseUrl);
    holder = prismaFor(databaseUrl);
    waiter = prismaFor(databaseUrl);
    waiterTwo = prismaFor(databaseUrl);
    await Promise.all([
      admin.$connect(),
      holder.$connect(),
      waiter.$connect(),
      waiterTwo.$connect(),
    ]);

    const [boundary] = await admin.$queryRaw<
      Array<{
        assertBoundary: string | null;
        issueBoundary: string | null;
        revokeAllBoundary: string | null;
        postgresMajor: number;
        superuser: boolean;
      }>
    >(Prisma.sql`
      SELECT
        pg_catalog.to_regprocedure(
          'public.guest_portal_session_assert_current190_v1(text,integer,text,text,text,text,text,text,text)'
        )::TEXT AS "assertBoundary",
        pg_catalog.to_regprocedure(
          'public.guest_portal_session_issue_current190_v1(text,text,text,text,text,text,text,integer)'
        )::TEXT AS "issueBoundary",
        pg_catalog.to_regprocedure(
          'public.guest_portal_sessions_revoke_tenant_current190_v1(text,text,text,text,integer)'
        )::TEXT AS "revokeAllBoundary",
        pg_catalog.current_setting('server_version_num')::INTEGER / 10000
          AS "postgresMajor",
        role.rolsuper AS superuser
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = CURRENT_USER
    `);
    expect(boundary).toEqual({
      assertBoundary:
        'guest_portal_session_assert_current190_v1(text,integer,text,text,text,text,text,text,text)',
      issueBoundary:
        'guest_portal_session_issue_current190_v1(text,text,text,text,text,text,text,integer)',
      revokeAllBoundary:
        'guest_portal_sessions_revoke_tenant_current190_v1(text,text,text,text,integer)',
      postgresMajor: 16,
      superuser: true,
    });

    baselineDeadlocks = await readDeadlocks(admin);
    await createCommittedFixture(admin, fixture);
    await expect(assertSession(admin, fixture)).resolves.toEqual([
      expect.objectContaining({
        sessionId: fixture.sessionId,
        tenantId: fixture.tenantId,
        storeId: fixture.storeId,
        profileId: fixture.profileId,
        guestId: fixture.guestId,
        tokenVersion: 1,
        executionRevision: 1,
        entitlementProfileRevision: 1,
      }),
    ]);
  });

  afterEach(async () => {
    if (!admin) return;
    await restoreAllAdmissionState(admin, fixture);
    await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
  });

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    try {
      if (admin) {
        const finalDeadlocks = await readDeadlocks(admin);
        if (finalDeadlocks !== baselineDeadlocks) {
          throw new Error(
            `CURRENT190 observed PostgreSQL deadlocks: ${baselineDeadlocks} -> ${finalDeadlocks}`,
          );
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (admin) {
        await cleanupFixture(admin, fixture.tenantId);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const client of [admin, holder, waiter, waiterTwo]) {
      try {
        await client?.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'CURRENT190 PostgreSQL fixture cleanup failed',
      );
    }
  });

  it('denies an assertion after waiting for a committed tenant suspension', async () => {
    await runFreshnessRace(
      admin,
      holder,
      waiter,
      fixture,
      'tenant',
      baselineDeadlocks,
    );
  });

  it('denies a WRITE assertion after waiting for a disabled GAMIFICATION write entitlement', async () => {
    await runFreshnessRace(
      admin,
      holder,
      waiter,
      fixture,
      'entitlement',
      baselineDeadlocks,
    );
  });

  it('denies an assertion after waiting for a committed inactive Store', async () => {
    await runFreshnessRace(
      admin,
      holder,
      waiter,
      fixture,
      'store',
      baselineDeadlocks,
    );
  });

  it('denies an assertion after waiting for a committed disabled Guest', async () => {
    await runFreshnessRace(
      admin,
      holder,
      waiter,
      fixture,
      'guest',
      baselineDeadlocks,
    );
  });

  it('waits for an admitted issue, then closes the fence with zero active sessions', async () => {
    await runMutationBeforeFenceRace(
      admin,
      holder,
      waiter,
      'issue',
      baselineDeadlocks,
    );
  });

  it('waits for an admitted rotation, then revokes the fresh target session', async () => {
    await runMutationBeforeFenceRace(
      admin,
      holder,
      waiter,
      'rotate',
      baselineDeadlocks,
    );
  });

  it('makes waiting issue and rotate fail after the revoke-all fence commits', async () => {
    await runFenceBeforeMutationRace(
      admin,
      holder,
      waiter,
      waiterTwo,
      baselineDeadlocks,
    );
  });
});

async function runFreshnessRace(
  admin: PrismaClient,
  holder: PrismaClient,
  waiter: PrismaClient,
  fixture: Fixture,
  target: RaceTarget,
  baselineDeadlocks: bigint,
): Promise<void> {
  await expect(assertSession(admin, fixture)).resolves.toHaveLength(1);

  const holderLocked = deferred<void>();
  const releaseHolder = deferred<void>();
  const waiterPidReady = deferred<number>();
  const startWaiter = deferred<void>();
  let holderPromise: Promise<void> | undefined;
  let waiterOutcomePromise: Promise<Outcome<AssertReceipt[]>> | undefined;

  try {
    holderPromise = holder.$transaction(async (tx) => {
      await holdAndMutate(tx, fixture, target);
      holderLocked.resolve(undefined);
      await releaseHolder.promise;
    }, transactionOptions());
    await Promise.race([
      holderLocked.promise,
      holderPromise.then(
        () => {
          throw new Error(
            `CURRENT190 ${target} holder ended before exposing its row lock`,
          );
        },
        (error: unknown) => {
          throw error;
        },
      ),
    ]);

    waiterOutcomePromise = capture(
      waiter.$transaction(async (tx) => {
        const [pidRow] = await tx.$queryRaw<Array<{ backendPid: number }>>(
          Prisma.sql`
            SELECT pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
          `,
        );
        if (!pidRow || !Number.isInteger(pidRow.backendPid)) {
          throw new Error('CURRENT190 waiter backend PID was unavailable');
        }
        waiterPidReady.resolve(pidRow.backendPid);
        await startWaiter.promise;
        return assertSession(tx, fixture);
      }, transactionOptions()),
    );

    const waiterPid = await Promise.race([
      waiterPidReady.promise,
      waiterOutcomePromise.then((outcome) => {
        if (outcome.status === 'rejected') throw outcome.reason;
        throw new Error(
          `CURRENT190 ${target} waiter ended before exposing its backend PID`,
        );
      }),
    ]);
    startWaiter.resolve(undefined);

    const lockWait = await waitForRowLock(admin, waiterPid);
    expect(lockWait).toMatchObject({
      state: 'active',
      waitEventType: 'Lock',
    });
    expect(lockWait.query).toContain(
      'guest_portal_session_assert_current190_v1',
    );

    releaseHolder.resolve(undefined);
    await holderPromise;
    await expect(committedDenialState(admin, fixture, target)).resolves.toBe(
      true,
    );

    const waiterOutcome = await waiterOutcomePromise;
    expect(waiterOutcome.status).toBe('rejected');
    if (waiterOutcome.status === 'rejected') {
      const state = postgresSqlState(waiterOutcome.reason);
      expect(state).not.toBe('40P01');
      expect(state).toBe('42501');
    }
    await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
  } finally {
    startWaiter.resolve(undefined);
    releaseHolder.resolve(undefined);
    const pending: Promise<unknown>[] = [];
    if (holderPromise) pending.push(holderPromise);
    if (waiterOutcomePromise) pending.push(waiterOutcomePromise);
    await Promise.allSettled(pending);
    await restoreAdmissionState(admin, fixture, target);
  }
}

async function runMutationBeforeFenceRace(
  admin: PrismaClient,
  holder: PrismaClient,
  revoker: PrismaClient,
  kind: MutationKind,
  baselineDeadlocks: bigint,
): Promise<void> {
  const fixture = buildFixture();
  const targetSessionId = randomUUID();
  const targetJtiDigest = randomDigest();
  const targetBindingDigest = randomDigest();
  const rotationRequestDigest = randomDigest();
  const fenceRequestDigest = randomDigest();
  const batchRequestDigest = randomDigest();
  const batchId = randomUUID();
  const replayBatchId = randomUUID();
  const mutationComplete = deferred<void>();
  const releaseMutation = deferred<void>();
  const revokerPidReady = deferred<number>();
  let holderPromise: Promise<void> | undefined;
  let revokeOutcomePromise: Promise<Outcome<RevokeAllReceipt[]>> | undefined;

  await createCommittedFixture(admin, fixture);
  try {
    holderPromise = holder.$transaction(async (tx) => {
      if (kind === 'issue') {
        await issueSession(
          tx,
          fixture,
          targetSessionId,
          targetJtiDigest,
          targetBindingDigest,
        );
      } else {
        await rotateSession(
          tx,
          fixture,
          targetSessionId,
          targetJtiDigest,
          targetBindingDigest,
          rotationRequestDigest,
        );
      }
      mutationComplete.resolve(undefined);
      await releaseMutation.promise;
    }, transactionOptions());

    await Promise.race([
      mutationComplete.promise,
      holderPromise.then(
        () => {
          throw new Error(
            `CURRENT190 ${kind} holder committed before the race was exposed`,
          );
        },
        (error: unknown) => {
          throw error;
        },
      ),
    ]);

    revokeOutcomePromise = capture(
      revoker.$transaction(async (tx) => {
        revokerPidReady.resolve(await backendPid(tx));
        return revokeTenantSessions(
          tx,
          fixture.tenantId,
          fenceRequestDigest,
          batchRequestDigest,
          batchId,
        );
      }, transactionOptions()),
    );
    const revokerPid = await revokerPidReady.promise;
    const lockWait = await waitForRowLock(admin, revokerPid);
    expect(lockWait).toMatchObject({
      state: 'active',
      waitEventType: 'Lock',
    });
    expect(lockWait.query).toContain(
      'guest_portal_sessions_revoke_tenant_current190_v1',
    );

    const releaseAt = Date.now();
    releaseMutation.resolve(undefined);
    await holderPromise;
    const revokeOutcome = await revokeOutcomePromise;
    expect(revokeOutcome.status).toBe('fulfilled');
    if (revokeOutcome.status !== 'fulfilled') throw revokeOutcome.reason;

    const expectedRevokedCount = kind === 'issue' ? 2 : 1;
    expect(revokeOutcome.value).toEqual([
      expect.objectContaining({
        batchId,
        fenceVersion: 1,
        batchSequence: 1,
        fenceStatus: 'CLOSED',
        revokedCount: expectedRevokedCount,
        remainingActiveCount: 0n,
        totalRevokedCount: BigInt(expectedRevokedCount),
        replayed: false,
      }),
    ]);
    expect(
      revokeOutcome.value[0]?.batchCompletedAt.getTime(),
    ).toBeGreaterThanOrEqual(releaseAt);
    await assertClosedFence(
      admin,
      fixture.tenantId,
      fenceRequestDigest,
      batchRequestDigest,
      expectedRevokedCount,
    );

    const replay = await revokeTenantSessions(
      admin,
      fixture.tenantId,
      fenceRequestDigest,
      batchRequestDigest,
      replayBatchId,
    );
    expect(replay).toEqual([
      expect.objectContaining({
        batchId,
        revokedCount: expectedRevokedCount,
        remainingActiveCount: 0n,
        totalRevokedCount: BigInt(expectedRevokedCount),
        replayed: true,
      }),
    ]);
    await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
  } finally {
    releaseMutation.resolve(undefined);
    const pending: Promise<unknown>[] = [];
    if (holderPromise) pending.push(holderPromise);
    if (revokeOutcomePromise) pending.push(revokeOutcomePromise);
    await Promise.allSettled(pending);
    await cleanupFixture(admin, fixture.tenantId);
  }
}

async function runFenceBeforeMutationRace(
  admin: PrismaClient,
  fenceHolder: PrismaClient,
  issueWaiter: PrismaClient,
  rotateWaiter: PrismaClient,
  baselineDeadlocks: bigint,
): Promise<void> {
  const fixture = buildFixture();
  const issueSessionId = randomUUID();
  const rotateSessionId = randomUUID();
  const issueJtiDigest = randomDigest();
  const issueBindingDigest = randomDigest();
  const rotateJtiDigest = randomDigest();
  const rotateBindingDigest = randomDigest();
  const rotationRequestDigest = randomDigest();
  const fenceRequestDigest = randomDigest();
  const batchRequestDigest = randomDigest();
  const batchId = randomUUID();
  const fenceLocked = deferred<void>();
  const executeFence = deferred<void>();
  const issuePidReady = deferred<number>();
  const rotatePidReady = deferred<number>();
  let fencePromise: Promise<RevokeAllReceipt[]> | undefined;
  let issueOutcomePromise: Promise<Outcome<unknown>> | undefined;
  let rotateOutcomePromise: Promise<Outcome<unknown>> | undefined;

  await createCommittedFixture(admin, fixture);
  try {
    fencePromise = fenceHolder.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT tenant."id"
        FROM public."Tenant" AS tenant
        WHERE tenant."id" = ${fixture.tenantId}
        FOR UPDATE
      `);
      expect(locked).toEqual([{ id: fixture.tenantId }]);
      fenceLocked.resolve(undefined);
      await executeFence.promise;
      return revokeTenantSessions(
        tx,
        fixture.tenantId,
        fenceRequestDigest,
        batchRequestDigest,
        batchId,
      );
    }, transactionOptions());
    await fenceLocked.promise;

    issueOutcomePromise = capture(
      issueWaiter.$transaction(async (tx) => {
        issuePidReady.resolve(await backendPid(tx));
        return issueSession(
          tx,
          fixture,
          issueSessionId,
          issueJtiDigest,
          issueBindingDigest,
        );
      }, transactionOptions()),
    );
    rotateOutcomePromise = capture(
      rotateWaiter.$transaction(async (tx) => {
        rotatePidReady.resolve(await backendPid(tx));
        return rotateSession(
          tx,
          fixture,
          rotateSessionId,
          rotateJtiDigest,
          rotateBindingDigest,
          rotationRequestDigest,
        );
      }, transactionOptions()),
    );

    const [issuePid, rotatePid] = await Promise.all([
      issuePidReady.promise,
      rotatePidReady.promise,
    ]);
    const issueWait = await waitForRowLock(admin, issuePid);
    const rotateWait = await waitForRowLock(admin, rotatePid);
    expect(issueWait).toMatchObject({
      state: 'active',
      waitEventType: 'Lock',
    });
    expect(issueWait.query).toContain(
      'guest_portal_session_issue_current190_v1',
    );
    expect(rotateWait).toMatchObject({
      state: 'active',
      waitEventType: 'Lock',
    });
    expect(rotateWait.query).toContain(
      'guest_portal_session_rotate_current190_v1',
    );

    executeFence.resolve(undefined);
    const fenceReceipt = await fencePromise;
    expect(fenceReceipt).toEqual([
      expect.objectContaining({
        batchId,
        fenceStatus: 'CLOSED',
        revokedCount: 1,
        remainingActiveCount: 0n,
        totalRevokedCount: 1n,
        replayed: false,
      }),
    ]);

    const [issueOutcome, rotateOutcome] = await Promise.all([
      issueOutcomePromise,
      rotateOutcomePromise,
    ]);
    for (const outcome of [issueOutcome, rotateOutcome]) {
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') {
        const sqlState = postgresSqlState(outcome.reason);
        expect(sqlState).not.toBe('40P01');
        expect(sqlState).toBe('42501');
      }
    }

    await assertClosedFence(
      admin,
      fixture.tenantId,
      fenceRequestDigest,
      batchRequestDigest,
      1,
    );
    const [targets] = await admin.$queryRaw<
      Array<{ targetRows: number; sourceRevoked: boolean }>
    >(Prisma.sql`
      SELECT
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."GuestPortalSessionV1" AS session
          WHERE session."id" IN (${issueSessionId}, ${rotateSessionId})
        ) AS "targetRows",
        EXISTS (
          SELECT 1
          FROM public."GuestPortalSessionV1" AS session
          WHERE session."id" = ${fixture.sessionId}
            AND session."tenantId" = ${fixture.tenantId}
            AND session."status" = 'REVOKED'
        ) AS "sourceRevoked"
    `);
    expect(targets).toEqual({ targetRows: 0, sourceRevoked: true });
    await expect(readDeadlocks(admin)).resolves.toBe(baselineDeadlocks);
  } finally {
    executeFence.resolve(undefined);
    const pending: Promise<unknown>[] = [];
    if (fencePromise) pending.push(fencePromise);
    if (issueOutcomePromise) pending.push(issueOutcomePromise);
    if (rotateOutcomePromise) pending.push(rotateOutcomePromise);
    await Promise.allSettled(pending);
    await cleanupFixture(admin, fixture.tenantId);
  }
}

async function holdAndMutate(
  tx: Prisma.TransactionClient,
  fixture: Fixture,
  target: RaceTarget,
): Promise<void> {
  let rows: Array<{ id: string }>;
  let changed: number;

  switch (target) {
    case 'tenant':
      rows = await tx.$queryRaw(Prisma.sql`
        SELECT tenant."id"
        FROM public."Tenant" AS tenant
        WHERE tenant."id" = ${fixture.tenantId}
        FOR UPDATE
      `);
      expect(rows).toEqual([{ id: fixture.tenantId }]);
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE public."Tenant"
        SET
          "status" = 'SUSPENDED'::public."TenantLifecycleStatus",
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "id" = ${fixture.tenantId}
      `);
      break;
    case 'entitlement':
      rows = await tx.$queryRaw(Prisma.sql`
        SELECT entitlement."id"
        FROM public."TenantModuleEntitlement" AS entitlement
        WHERE entitlement."tenantId" = ${fixture.tenantId}
          AND entitlement."module" =
            'GAMIFICATION'::public."TenantModule"
        FOR UPDATE
      `);
      expect(rows).toHaveLength(1);
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE public."TenantModuleEntitlement"
        SET
          "writeEnabled" = FALSE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "module" = 'GAMIFICATION'::public."TenantModule"
      `);
      break;
    case 'store':
      rows = await tx.$queryRaw(Prisma.sql`
        SELECT store."id"
        FROM public."Store" AS store
        WHERE store."tenantId" = ${fixture.tenantId}
          AND store."id" = ${fixture.storeId}
        FOR UPDATE
      `);
      expect(rows).toEqual([{ id: fixture.storeId }]);
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE public."Store"
        SET
          "isActive" = FALSE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "id" = ${fixture.storeId}
      `);
      break;
    case 'guest':
      rows = await tx.$queryRaw(Prisma.sql`
        SELECT guest."id"
        FROM public."Guest" AS guest
        WHERE guest."tenantId" = ${fixture.tenantId}
          AND guest."id" = ${fixture.guestId}
        FOR UPDATE
      `);
      expect(rows).toEqual([{ id: fixture.guestId }]);
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE public."Guest"
        SET
          "isDisabled" = TRUE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "id" = ${fixture.guestId}
      `);
      break;
  }

  expect(changed).toBe(1);
}

async function committedDenialState(
  client: PrismaClient,
  fixture: Fixture,
  target: RaceTarget,
): Promise<boolean> {
  switch (target) {
    case 'tenant': {
      const [row] = await client.$queryRaw<Array<{ denied: boolean }>>(
        Prisma.sql`
          SELECT tenant."status" = 'SUSPENDED' AS denied
          FROM public."Tenant" AS tenant
          WHERE tenant."id" = ${fixture.tenantId}
        `,
      );
      return row?.denied === true;
    }
    case 'entitlement': {
      const [row] = await client.$queryRaw<Array<{ denied: boolean }>>(
        Prisma.sql`
          SELECT entitlement."writeEnabled" = FALSE AS denied
          FROM public."TenantModuleEntitlement" AS entitlement
          WHERE entitlement."tenantId" = ${fixture.tenantId}
            AND entitlement."module" =
              'GAMIFICATION'::public."TenantModule"
        `,
      );
      return row?.denied === true;
    }
    case 'store': {
      const [row] = await client.$queryRaw<Array<{ denied: boolean }>>(
        Prisma.sql`
          SELECT store."isActive" = FALSE AS denied
          FROM public."Store" AS store
          WHERE store."tenantId" = ${fixture.tenantId}
            AND store."id" = ${fixture.storeId}
        `,
      );
      return row?.denied === true;
    }
    case 'guest': {
      const [row] = await client.$queryRaw<Array<{ denied: boolean }>>(
        Prisma.sql`
          SELECT guest."isDisabled" = TRUE AS denied
          FROM public."Guest" AS guest
          WHERE guest."tenantId" = ${fixture.tenantId}
            AND guest."id" = ${fixture.guestId}
        `,
      );
      return row?.denied === true;
    }
  }
}

async function restoreAdmissionState(
  client: PrismaClient,
  fixture: Fixture,
  target: RaceTarget,
): Promise<void> {
  switch (target) {
    case 'tenant':
      await client.$executeRaw(Prisma.sql`
        UPDATE public."Tenant"
        SET
          "status" = 'ACTIVE'::public."TenantLifecycleStatus",
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "id" = ${fixture.tenantId}
      `);
      return;
    case 'entitlement':
      await client.$executeRaw(Prisma.sql`
        UPDATE public."TenantModuleEntitlement"
        SET
          "writeEnabled" = TRUE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "module" = 'GAMIFICATION'::public."TenantModule"
      `);
      return;
    case 'store':
      await client.$executeRaw(Prisma.sql`
        UPDATE public."Store"
        SET
          "isActive" = TRUE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "id" = ${fixture.storeId}
      `);
      return;
    case 'guest':
      await client.$executeRaw(Prisma.sql`
        UPDATE public."Guest"
        SET
          "isDisabled" = FALSE,
          "updatedAt" = pg_catalog.clock_timestamp()
        WHERE "tenantId" = ${fixture.tenantId}
          AND "id" = ${fixture.guestId}
      `);
  }
}

async function restoreAllAdmissionState(
  client: PrismaClient,
  fixture: Fixture,
): Promise<void> {
  for (const target of ['tenant', 'entitlement', 'store', 'guest'] as const) {
    await restoreAdmissionState(client, fixture, target);
  }
}

async function assertSession(
  client: PrismaClient | Prisma.TransactionClient,
  fixture: Fixture,
): Promise<AssertReceipt[]> {
  return client.$queryRaw<AssertReceipt[]>(Prisma.sql`
    SELECT *
    FROM public.guest_portal_session_assert_current190_v1(
      ${fixture.sessionId}::TEXT,
      1::INTEGER,
      ${fixture.tenantId}::TEXT,
      ${fixture.storeId}::TEXT,
      ${fixture.profileId}::TEXT,
      ${fixture.guestId}::TEXT,
      ${fixture.jtiDigest}::TEXT,
      ${fixture.bindingDigest}::TEXT,
      'WRITE'::TEXT
    )
  `);
}

async function issueSession(
  client: PrismaClient | Prisma.TransactionClient,
  fixture: Fixture,
  sessionId: string,
  jtiDigest: string,
  bindingDigest: string,
): Promise<unknown> {
  return client.$queryRaw(Prisma.sql`
    SELECT *
    FROM public.guest_portal_session_issue_current190_v1(
      ${sessionId}::TEXT,
      ${fixture.tenantId}::TEXT,
      ${fixture.storeId}::TEXT,
      ${fixture.profileId}::TEXT,
      ${fixture.guestId}::TEXT,
      ${jtiDigest}::TEXT,
      ${bindingDigest}::TEXT,
      3600::INTEGER
    )
  `);
}

async function rotateSession(
  client: PrismaClient | Prisma.TransactionClient,
  fixture: Fixture,
  targetSessionId: string,
  targetJtiDigest: string,
  targetBindingDigest: string,
  rotationRequestDigest: string,
): Promise<unknown> {
  return client.$queryRaw(Prisma.sql`
    SELECT *
    FROM public.guest_portal_session_rotate_current190_v1(
      ${fixture.sessionId}::TEXT,
      1::INTEGER,
      ${fixture.tenantId}::TEXT,
      ${fixture.storeId}::TEXT,
      ${fixture.profileId}::TEXT,
      ${fixture.guestId}::TEXT,
      ${fixture.jtiDigest}::TEXT,
      ${fixture.bindingDigest}::TEXT,
      ${rotationRequestDigest}::TEXT,
      ${targetSessionId}::TEXT,
      ${fixture.tenantId}::TEXT,
      ${fixture.storeId}::TEXT,
      ${fixture.profileId}::TEXT,
      ${fixture.guestId}::TEXT,
      ${targetJtiDigest}::TEXT,
      ${targetBindingDigest}::TEXT,
      3600::INTEGER
    )
  `);
}

async function revokeTenantSessions(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  fenceRequestDigest: string,
  batchRequestDigest: string,
  batchId: string,
): Promise<RevokeAllReceipt[]> {
  return client.$queryRaw<RevokeAllReceipt[]>(Prisma.sql`
    SELECT *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      ${tenantId}::TEXT,
      ${fenceRequestDigest}::TEXT,
      ${batchRequestDigest}::TEXT,
      ${batchId}::TEXT,
      500::INTEGER
    )
  `);
}

async function backendPid(client: Prisma.TransactionClient): Promise<number> {
  const [row] = await client.$queryRaw<Array<{ backendPid: number }>>(
    Prisma.sql`
      SELECT pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
    `,
  );
  if (!row || !Number.isInteger(row.backendPid)) {
    throw new Error('CURRENT190 waiter backend PID was unavailable');
  }
  return row.backendPid;
}

async function assertClosedFence(
  client: PrismaClient,
  tenantId: string,
  fenceRequestDigest: string,
  batchRequestDigest: string,
  expectedRevokedCount: number,
): Promise<void> {
  const [proof] = await client.$queryRaw<
    Array<{
      activeCount: number;
      fenceClosed: boolean;
      batchCount: number;
      receiptRevokedCount: number;
      auditCount: number;
      completeSessionCount: number;
    }>
  >(Prisma.sql`
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalSessionV1" AS session
        WHERE session."tenantId" = ${tenantId}
          AND session."status" = 'ACTIVE'
      ) AS "activeCount",
      EXISTS (
        SELECT 1
        FROM public."GuestPortalTenantSessionFenceV1" AS fence
        WHERE fence."tenantId" = ${tenantId}
          AND fence."requestDigest" = ${fenceRequestDigest}
          AND fence."status" = 'CLOSED'
          AND fence."batchCount" = 1
          AND fence."totalRevokedCount" = ${expectedRevokedCount}::BIGINT
          AND fence."completedAt" IS NOT NULL
      ) AS "fenceClosed",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
        WHERE receipt."tenantId" = ${tenantId}
          AND receipt."batchRequestDigest" = ${batchRequestDigest}
      ) AS "batchCount",
      COALESCE((
        SELECT receipt."revokedCount"
        FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
        WHERE receipt."tenantId" = ${tenantId}
          AND receipt."batchRequestDigest" = ${batchRequestDigest}
      ), -1)::INTEGER AS "receiptRevokedCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalSessionAuditV1" AS audit
        WHERE audit."tenantId" = ${tenantId}
          AND audit."eventType" = 'REVOKED'
          AND audit."requestDigest" = ${batchRequestDigest}
      ) AS "auditCount",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalSessionV1" AS session
        INNER JOIN public."GuestPortalSessionAuditV1" AS audit
          ON audit."tenantId" = session."tenantId"
         AND audit."sessionId" = session."id"
         AND audit."eventType" = 'REVOKED'
         AND audit."requestDigest" = session."revocationRequestDigest"
        WHERE session."tenantId" = ${tenantId}
          AND session."status" = 'REVOKED'
          AND session."revocationRequestDigest" = ${batchRequestDigest}
      ) AS "completeSessionCount"
  `);
  expect(proof).toEqual({
    activeCount: 0,
    fenceClosed: true,
    batchCount: 1,
    receiptRevokedCount: expectedRevokedCount,
    auditCount: expectedRevokedCount,
    completeSessionCount: expectedRevokedCount,
  });
}

async function waitForRowLock(
  client: PrismaClient,
  pid: number,
): Promise<LockWait> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [activity] = await client.$queryRaw<LockWait[]>(Prisma.sql`
      SELECT
        activity.state,
        activity.wait_event_type AS "waitEventType",
        pg_catalog.lower(activity.wait_event) AS "waitEvent",
        activity.query
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid = ${pid}
    `);
    if (activity?.state === 'active' && activity.waitEventType === 'Lock') {
      return activity;
    }
    await delay(25);
  }
  throw new Error(`CURRENT190 backend ${pid} did not expose a row-lock wait`);
}

async function createCommittedFixture(
  client: PrismaClient,
  fixture: Fixture,
): Promise<void> {
  const now = new Date();
  await client.$transaction(async (tx) => {
    await tx.tenant.create({
      data: {
        id: fixture.tenantId,
        name: 'CURRENT190 lock freshness fixture',
        slug: fixture.tenantSlug,
        status: TenantLifecycleStatus.ACTIVE,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.ONBOARDING,
        trialStartsAt: new Date(now.getTime() - 60 * 60 * 1_000),
        trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000),
        entitlementProfileRevision: 1,
        executionRevision: 1,
      },
    });
    await tx.tenantModuleEntitlement.createMany({
      data: ALL_MODULES.map((module) => ({
        id: randomUUID(),
        tenantId: fixture.tenantId,
        module,
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
        profileRevision: 1,
        reason: 'CURRENT190 PostgreSQL lock freshness fixture',
      })),
    });
    await tx.store.create({
      data: {
        id: fixture.storeId,
        tenantId: fixture.tenantId,
        name: 'CURRENT190 Store',
        publicSlug: `current190-store-${fixture.storeId}`,
        isActive: true,
        gamificationEnabled: true,
      },
    });
    await tx.guest.create({
      data: {
        id: fixture.guestId,
        tenantId: fixture.tenantId,
        externalGuestId: `current190-external-${fixture.guestId}`,
        phoneHash:
          'current190-phone-hash-0000000000000000000000000000000000000000',
        isDisabled: false,
      },
    });
    await tx.guestGameProfile.create({
      data: {
        id: fixture.profileId,
        tenantId: fixture.tenantId,
        guestId: fixture.guestId,
        phoneHash:
          'current190-phone-hash-0000000000000000000000000000000000000000',
        status: 'ACTIVE',
      },
    });
  });

  const issued = await client.$queryRaw<
    Array<{ sessionId: string; tokenVersion: number; replayed: boolean }>
  >(Prisma.sql`
    SELECT "sessionId", "tokenVersion", replayed
    FROM public.guest_portal_session_issue_current190_v1(
      ${fixture.sessionId}::TEXT,
      ${fixture.tenantId}::TEXT,
      ${fixture.storeId}::TEXT,
      ${fixture.profileId}::TEXT,
      ${fixture.guestId}::TEXT,
      ${fixture.jtiDigest}::TEXT,
      ${fixture.bindingDigest}::TEXT,
      3600::INTEGER
    )
  `);
  expect(issued).toEqual([
    {
      sessionId: fixture.sessionId,
      tokenVersion: 1,
      replayed: false,
    },
  ]);
}

async function cleanupFixture(
  client: PrismaClient,
  tenantId: string,
): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL session_replication_role = 'replica'`,
    );
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."GuestPortalTenantSessionRevokeBatchV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."GuestPortalTenantSessionFenceV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."GuestPortalSessionAuditV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM public."GuestPortalSessionV1"
      WHERE "tenantId" = ${tenantId}
    `);
    await tx.guestGameProfile.deleteMany({ where: { tenantId } });
    await tx.guest.deleteMany({ where: { tenantId } });
    await tx.store.deleteMany({ where: { tenantId } });
    await tx.tenantModuleEntitlement.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });

  const [residue] = await client.$queryRaw<
    Array<{
      sessionRows: number;
      fenceRows: number;
      batchRows: number;
      tenantRows: number;
    }>
  >(Prisma.sql`
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalSessionV1"
        WHERE "tenantId" = ${tenantId}
      ) AS "sessionRows",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalTenantSessionFenceV1"
        WHERE "tenantId" = ${tenantId}
      ) AS "fenceRows",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."GuestPortalTenantSessionRevokeBatchV1"
        WHERE "tenantId" = ${tenantId}
      ) AS "batchRows",
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."Tenant"
        WHERE "id" = ${tenantId}
      ) AS "tenantRows"
  `);
  if (
    residue?.sessionRows !== 0 ||
    residue.fenceRows !== 0 ||
    residue.batchRows !== 0 ||
    residue.tenantRows !== 0
  ) {
    throw new Error('CURRENT190 PostgreSQL fixture left database residue');
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
  if (!row || typeof row.deadlocks !== 'bigint') {
    throw new Error('CURRENT190 PostgreSQL deadlock counter was unavailable');
  }
  return row.deadlocks;
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
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 30_000,
  } as const;
}

function buildFixture(): Fixture {
  const suffix = randomUUID();
  return {
    tenantId: randomUUID(),
    tenantSlug: `guest-current190-${suffix}`,
    storeId: randomUUID(),
    guestId: randomUUID(),
    profileId: randomUUID(),
    sessionId: randomUUID(),
    jtiDigest: randomDigest(),
    bindingDigest: randomDigest(),
  };
}

function randomDigest(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
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
  target.searchParams.set('pool_timeout', '10');
  target.searchParams.set('socket_timeout', '30');
  return target.toString();
}

function assertSafeIntegrationDatabase(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing CURRENT190 PostgreSQL fixture in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for CURRENT190 PostgreSQL fixture',
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
      'CURRENT190 PostgreSQL fixture requires an exact local disposable database',
    );
  }
  return parsed.toString();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
