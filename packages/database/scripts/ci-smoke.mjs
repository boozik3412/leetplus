import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';

const prisma = new PrismaClient();

async function verifyTenantExecutionRevisionFence() {
  const suffix = randomUUID();
  const tenantId = `execution-revision-smoke-${suffix}`;
  const tenantSlug = `execution-revision-smoke-${suffix}`;
  const ledgerEntryId = `execution-revision-ledger-${suffix}`;

  try {
    const shell = await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Execution revision smoke',
        slug: tenantSlug,
        status: 'SUSPENDED',
        customerStage: 'PILOT',
        onboardingStatus: 'PROVISIONING',
      },
      select: {
        executionRevision: true,
        trialStartsAt: true,
        trialEndsAt: true,
      },
    });

    if (
      shell.executionRevision !== 0 ||
      shell.trialStartsAt !== null ||
      shell.trialEndsAt !== null
    ) {
      throw new Error(
        'A new suspended external shell did not start at revision 0 without a trial.',
      );
    }

    const renamed = await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: 'Execution revision smoke renamed' },
      select: { executionRevision: true },
    });
    if (renamed.executionRevision !== 0) {
      throw new Error('An unrelated Tenant update advanced executionRevision.');
    }

    const profiled = await prisma.tenant.update({
      where: { id: tenantId },
      data: { entitlementProfileRevision: 1 },
      select: { executionRevision: true },
    });
    if (profiled.executionRevision !== 1) {
      throw new Error(
        'The entitlement profile transition did not advance executionRevision exactly once.',
      );
    }

    let directRevisionMutationRejected = false;
    try {
      await prisma.$executeRaw`
        UPDATE "Tenant"
        SET "executionRevision" = 2
        WHERE "id" = ${tenantId}
      `;
    } catch {
      directRevisionMutationRejected = true;
    }
    if (!directRevisionMutationRejected) {
      throw new Error(
        'A direct mutation of trigger-owned executionRevision was accepted.',
      );
    }

    let triallessActivationRejected = false;
    try {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'ACTIVE',
          onboardingStatus: 'ACTIVE',
        },
      });
    } catch {
      triallessActivationRejected = true;
    }
    if (!triallessActivationRejected) {
      throw new Error(
        'An active external tenant without a finite trial window was accepted.',
      );
    }

    let triallessNonShellRejected = false;
    try {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          onboardingStatus: 'OWNER_INVITED',
        },
      });
    } catch {
      triallessNonShellRejected = true;
    }
    if (!triallessNonShellRejected) {
      throw new Error(
        'A trialless external tenant escaped the exact SUSPENDED/PROVISIONING shell.',
      );
    }

    const trialStartsAt = new Date(Date.now() - 60_000);
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    const activated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'ACTIVE',
        onboardingStatus: 'ACTIVE',
        trialStartsAt,
        trialEndsAt,
      },
      select: {
        executionRevision: true,
        status: true,
        onboardingStatus: true,
      },
    });
    if (
      activated.executionRevision !== 2 ||
      activated.status !== 'ACTIVE' ||
      activated.onboardingStatus !== 'ACTIVE'
    ) {
      throw new Error(
        'A multi-field activation did not advance executionRevision exactly once.',
      );
    }

    const ledgerEntry = await prisma.guestBonusLedgerEntry.create({
      data: {
        id: ledgerEntryId,
        tenantId,
        idempotencyKey: `execution-revision-ledger-${suffix}`,
        amount: 10,
        status: 'PENDING',
      },
      select: {
        attempts: true,
        claimGeneration: true,
        executionRevision: true,
      },
    });
    if (
      ledgerEntry.attempts !== 0 ||
      ledgerEntry.claimGeneration !== 0 ||
      ledgerEntry.executionRevision !== null
    ) {
      throw new Error(
        'A new bonus-ledger row did not start with the fail-closed claim defaults.',
      );
    }

    let invalidLedgerRevisionRejected = false;
    try {
      await prisma.guestBonusLedgerEntry.update({
        where: { id: ledgerEntryId },
        data: { executionRevision: -1 },
      });
    } catch {
      invalidLedgerRevisionRejected = true;
    }
    if (!invalidLedgerRevisionRejected) {
      throw new Error(
        'The database accepted a negative bonus-ledger execution revision.',
      );
    }

    let invalidReportRunRevisionRejected = false;
    try {
      await prisma.reportDigestScheduleRun.create({
        data: {
          tenantId,
          type: 'DAILY',
          scheduledForDate: '2099-01-01',
          executionRevision: -1,
        },
      });
    } catch {
      invalidReportRunRevisionRejected = true;
    }
    if (!invalidReportRunRevisionRejected) {
      throw new Error(
        'The database accepted a negative report-run execution revision.',
      );
    }

    const firstClaims = await prisma.$queryRaw`
      UPDATE "GuestBonusLedgerEntry"
      SET
        "status" = 'PROCESSING',
        "attempts" = "attempts" + 1,
        "claimGeneration" = "claimGeneration" + 1,
        "executionRevision" = ${activated.executionRevision}
      WHERE "id" = ${ledgerEntryId}
        AND "tenantId" = ${tenantId}
        AND "status" = 'PENDING'
      RETURNING
        "attempts",
        "claimGeneration",
        "executionRevision"
    `;
    const [firstClaim] = firstClaims;
    if (
      firstClaim?.attempts !== 1 ||
      firstClaim.claimGeneration !== 1 ||
      firstClaim.executionRevision !== activated.executionRevision
    ) {
      throw new Error(
        'The first bonus-ledger claim did not stamp its monotonic generation and tenant revision.',
      );
    }

    await prisma.guestBonusLedgerEntry.update({
      where: { id: ledgerEntryId },
      data: {
        status: 'PENDING',
        attempts: 0,
        executionRevision: null,
      },
    });
    const secondClaims = await prisma.$queryRaw`
      UPDATE "GuestBonusLedgerEntry"
      SET
        "status" = 'PROCESSING',
        "attempts" = "attempts" + 1,
        "claimGeneration" = "claimGeneration" + 1,
        "executionRevision" = ${activated.executionRevision}
      WHERE "id" = ${ledgerEntryId}
        AND "tenantId" = ${tenantId}
        AND "status" = 'PENDING'
      RETURNING
        "attempts",
        "claimGeneration",
        "executionRevision"
    `;
    const [secondClaim] = secondClaims;
    if (
      secondClaim?.attempts !== 1 ||
      secondClaim.claimGeneration !== 2 ||
      secondClaim.executionRevision !== activated.executionRevision
    ) {
      throw new Error(
        'A re-claim reset the monotonic bonus-ledger generation or lost its tenant revision.',
      );
    }

    const staleWorkerWrite = await prisma.guestBonusLedgerEntry.updateMany({
      where: {
        id: ledgerEntryId,
        tenantId,
        status: 'PROCESSING',
        attempts: firstClaim.attempts,
        claimGeneration: firstClaim.claimGeneration,
        executionRevision: firstClaim.executionRevision,
      },
      data: { status: 'CONFIRMED' },
    });
    if (staleWorkerWrite.count !== 0) {
      throw new Error(
        'A stale bonus-ledger worker crossed the monotonic claim-generation fence.',
      );
    }
  } finally {
    await prisma.guestBonusLedgerEntry.deleteMany({
      where: { id: ledgerEntryId, tenantId },
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
}

try {
  const migrationEntries = await readdir(
    new URL('../prisma/migrations/', import.meta.url),
    { withFileTypes: true },
  );
  const expectedMigrations = migrationEntries
    .filter(
      (entry) =>
        entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  const expectedLatestMigration = expectedMigrations.at(-1);

  if (!expectedLatestMigration) {
    throw new Error('No release migrations were found in the artifact.');
  }

  const [connectivity] = await prisma.$queryRaw`
    SELECT current_database() AS database_name, 1::int AS ok
  `;
  const [migrationSummary] = await prisma.$queryRaw`
    SELECT
      MAX(migration_name) FILTER (
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS latest_migration,
      COUNT(*) FILTER (
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      )::int AS applied_count,
      COUNT(*) FILTER (
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      )::int AS failed_count
    FROM "_prisma_migrations"
  `;

  if (connectivity?.ok !== 1) {
    throw new Error('PostgreSQL connectivity check returned an unexpected result.');
  }

  if (!migrationSummary) {
    throw new Error('Prisma migration summary was not returned.');
  }

  if (migrationSummary.failed_count !== 0) {
    throw new Error(
      `Found ${migrationSummary.failed_count} unfinished Prisma migration(s).`,
    );
  }

  if (migrationSummary.applied_count !== expectedMigrations.length) {
    throw new Error(
      `Expected ${expectedMigrations.length} completed migration(s), found ${migrationSummary.applied_count}.`,
    );
  }

  if (migrationSummary.latest_migration !== expectedLatestMigration) {
    throw new Error(
      `Expected latest migration ${expectedLatestMigration}, found ${migrationSummary.latest_migration ?? 'none'}.`,
    );
  }

  await verifyTenantExecutionRevisionFence();

  console.log(
    `Database smoke passed for ${connectivity.database_name}: ${migrationSummary.applied_count} migrations applied through ${migrationSummary.latest_migration}; Tenant execution revision and bonus-ledger claim-generation fences verified.`,
  );
} finally {
  await prisma.$disconnect();
}
