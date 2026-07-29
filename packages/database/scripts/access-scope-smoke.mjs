import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const REQUIRED_CONFIRMATION = 'run-access-scope-fixtures';

if (process.env.NODE_ENV === 'production') {
  throw new Error('AccessScope smoke fixtures are prohibited in production.');
}

if (process.env.ACCESS_SCOPE_SMOKE_CONFIRM !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `Set ACCESS_SCOPE_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run AccessScope smoke fixtures.`,
  );
}

const prisma = new PrismaClient();
const fixtureId = randomUUID();
const tenantIds = [];
const storeIds = [];
const userIds = [];
const inviteIds = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectConstraintFailure(label, operation, expectedMessage) {
  let error;

  try {
    await operation();
  } catch (caught) {
    error = caught;
  }

  if (!error) {
    throw new Error(`${label}: expected PostgreSQL to reject the operation.`);
  }

  const rendered = String(error);
  if (!rendered.includes(expectedMessage)) {
    throw new Error(
      `${label}: PostgreSQL rejected the operation for an unexpected reason: ${rendered}`,
    );
  }
}

try {
  const accessScopeColumns = await prisma.$queryRaw`
    SELECT
      table_name,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND column_name = 'accessScope'
      AND table_name IN ('User', 'UserInvite')
    ORDER BY table_name
  `;

  assert(
    accessScopeColumns.length === 2,
    'Expected nullable accessScope columns on User and UserInvite.',
  );
  assert(
    accessScopeColumns.every(
      (column) =>
        column.is_nullable === 'YES' && column.column_default === null,
    ),
    'EXPAND columns must remain nullable and must not have a default.',
  );

  const tenantA = await prisma.tenant.create({
    data: {
      name: `AccessScope smoke A ${fixtureId}`,
      slug: `access-scope-smoke-a-${fixtureId}`,
    },
  });
  tenantIds.push(tenantA.id);
  const tenantB = await prisma.tenant.create({
    data: {
      name: `AccessScope smoke B ${fixtureId}`,
      slug: `access-scope-smoke-b-${fixtureId}`,
    },
  });
  tenantIds.push(tenantB.id);

  const storeA = await prisma.store.create({
    data: {
      tenantId: tenantA.id,
      name: `AccessScope smoke A1 ${fixtureId}`,
    },
  });
  storeIds.push(storeA.id);
  const storeB = await prisma.store.create({
    data: {
      tenantId: tenantB.id,
      name: `AccessScope smoke B1 ${fixtureId}`,
    },
  });
  storeIds.push(storeB.id);

  const networkUser = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      email: `access-scope-network-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
      accessScope: 'NETWORK',
    },
  });
  userIds.push(networkUser.id);
  const storesUser = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      email: `access-scope-stores-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
      accessScope: 'STORES',
    },
  });
  userIds.push(storesUser.id);
  const unresolvedUser = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      email: `access-scope-unresolved-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
    },
  });
  userIds.push(unresolvedUser.id);
  const tenantBUser = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      email: `access-scope-tenant-b-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
      accessScope: 'STORES',
    },
  });
  userIds.push(tenantBUser.id);

  // EXPAND intentionally permits STORES[] in storage as a quarantined
  // deny-all state. Strict application readers must reject it until the
  // allow-list has been classified.
  const storesUserAccessCount = await prisma.userStoreAccess.count({
    where: { userId: storesUser.id },
  });
  assert(
    storesUserAccessCount === 0,
    'A STORES user must be allowed to persist with an empty allow-list.',
  );

  // NULL remains compatible with the N-1 writer during EXPAND, but readers
  // must deny it until classification.
  await prisma.userStoreAccess.create({
    data: {
      userId: unresolvedUser.id,
      storeId: storeA.id,
    },
  });

  await expectConstraintFailure(
    'cross-tenant grant',
    () =>
      prisma.userStoreAccess.create({
        data: {
          userId: storesUser.id,
          storeId: storeB.id,
        },
      }),
    'UserStoreAccess must link a user and store from the same tenant',
  );

  await expectConstraintFailure(
    'NETWORK grant',
    () =>
      prisma.userStoreAccess.create({
        data: {
          userId: networkUser.id,
          storeId: storeA.id,
        },
      }),
    'NETWORK users must not have UserStoreAccess rows',
  );

  // Deferred checks permit either statement order inside one transaction and
  // enforce only the final state.
  await prisma.$transaction(async (transaction) => {
    await transaction.userStoreAccess.create({
      data: {
        userId: networkUser.id,
        storeId: storeA.id,
      },
    });
    await transaction.user.update({
      where: { id: networkUser.id },
      data: { accessScope: 'STORES' },
    });
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: networkUser.id },
      data: { accessScope: 'NETWORK' },
    });
    await transaction.userStoreAccess.deleteMany({
      where: { userId: networkUser.id },
    });
  });

  await prisma.userStoreAccess.create({
    data: {
      userId: tenantBUser.id,
      storeId: storeB.id,
    },
  });

  await expectConstraintFailure(
    'store tenant move with grants',
    () =>
      prisma.store.update({
        where: { id: storeB.id },
        data: { tenantId: tenantA.id },
      }),
    'UserStoreAccess must link a user and store from the same tenant',
  );

  const networkInvite = await prisma.userInvite.create({
    data: {
      tenantId: tenantA.id,
      role: 'MANAGER',
      accessScope: 'NETWORK',
      storeIds: [],
      tokenHash: `access-scope-network-${fixtureId}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  inviteIds.push(networkInvite.id);
  const storesDenyAllInvite = await prisma.userInvite.create({
    data: {
      tenantId: tenantA.id,
      role: 'MANAGER',
      accessScope: 'STORES',
      storeIds: [],
      tokenHash: `access-scope-stores-${fixtureId}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  inviteIds.push(storesDenyAllInvite.id);
  const unresolvedInvite = await prisma.userInvite.create({
    data: {
      tenantId: tenantA.id,
      role: 'MANAGER',
      storeIds: [storeA.id],
      tokenHash: `access-scope-unresolved-${fixtureId}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  inviteIds.push(unresolvedInvite.id);

  await expectConstraintFailure(
    'NETWORK invite with stores',
    () =>
      prisma.userInvite.create({
        data: {
          tenantId: tenantA.id,
          role: 'MANAGER',
          accessScope: 'NETWORK',
          storeIds: [storeA.id],
          tokenHash: `access-scope-invalid-network-${fixtureId}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    'UserInvite_network_store_ids_check',
  );

  console.log(
    'AccessScope PostgreSQL smoke passed: nullable EXPAND fields, deny-all STORES, same-tenant grants, NETWORK invariants, deferred transitions, and invite constraints are enforced.',
  );
} finally {
  if (inviteIds.length > 0) {
    await prisma.userInvite.deleteMany({
      where: { id: { in: inviteIds } },
    });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
  if (storeIds.length > 0) {
    await prisma.store.deleteMany({
      where: { id: { in: storeIds } },
    });
  }
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({
      where: { id: { in: tenantIds } },
    });
  }
  await prisma.$disconnect();
}
