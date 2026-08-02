import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const REQUIRED_CONFIRMATION = "run-staff-task-catalog-audit-fixtures";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Staff task catalog audit smoke is prohibited in production.",
  );
}

if (
  process.env.STAFF_TASK_CATALOG_AUDIT_SMOKE_CONFIRM !== REQUIRED_CONFIRMATION
) {
  throw new Error(
    `Set STAFF_TASK_CATALOG_AUDIT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run catalog audit fixtures.`,
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname
  .replace(/^\/+/, "")
  .toLowerCase();
const schemaName =
  parsedDatabaseUrl.searchParams.get("schema")?.toLowerCase() ?? "";
const isLocal = new Set(["127.0.0.1", "localhost", "::1"]).has(
  parsedDatabaseUrl.hostname,
);
const isSafeDatabase = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
const isSafeSchema = /^staff_task_test_[a-z0-9_]+$/.test(schemaName);

if (!isLocal || (!isSafeDatabase && !isSafeSchema)) {
  throw new Error(
    "Refusing to run catalog audit fixtures outside a local CI/test database or isolated test schema.",
  );
}

const prisma = new PrismaClient();
const fixtureId = randomUUID();
let tenantId;
let actorUserId;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectConstraintFailure(label, operation, constraintName) {
  let error;

  try {
    await operation();
  } catch (caught) {
    error = caught;
  }

  if (!error) {
    throw new Error(`${label}: expected PostgreSQL to reject the operation.`);
  }

  if (!String(error).includes(constraintName)) {
    throw new Error(
      `${label}: PostgreSQL rejected the operation for an unexpected reason.`,
    );
  }
}

try {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Catalog audit smoke ${fixtureId}`,
      slug: `catalog-audit-smoke-${fixtureId}`,
    },
  });
  tenantId = tenant.id;

  const actor = await prisma.user.create({
    data: {
      tenantId,
      email: `catalog-audit-smoke-${fixtureId}@invalid.example`,
      passwordHash: "not-a-real-password-hash",
      role: "MANAGER",
      accessScope: "NETWORK",
    },
  });
  actorUserId = actor.id;

  const event = await prisma.staffTaskCatalogAuditEvent.create({
    data: {
      tenantId,
      actorUserId,
      entityKind: "TEMPLATE",
      entityId: `template-${fixtureId}`,
      action: "CREATED",
      effectiveStoreId: null,
      changedFields: ["status", "storeId"],
      afterState: { status: "ACTIVE", storeId: null },
      releaseSha: "a".repeat(40),
    },
  });

  assert(event.entityKind === "TEMPLATE", "Valid audit event was not stored.");
  assert(
    event.changedFields.join(",") === "status,storeId",
    "Audit changed fields were not preserved.",
  );

  await expectConstraintFailure(
    "invalid entity kind",
    () =>
      prisma.staffTaskCatalogAuditEvent.create({
        data: {
          tenantId,
          actorUserId,
          entityKind: "UNSAFE",
          entityId: `template-${fixtureId}`,
          action: "UPDATED",
          changedFields: [],
        },
      }),
    "StaffTaskCatalogAuditEvent_entity_kind_check",
  );

  await expectConstraintFailure(
    "invalid action",
    () =>
      prisma.staffTaskCatalogAuditEvent.create({
        data: {
          tenantId,
          actorUserId,
          entityKind: "TEMPLATE",
          entityId: `template-${fixtureId}`,
          action: "UNSAFE",
          changedFields: [],
        },
      }),
    "StaffTaskCatalogAuditEvent_action_check",
  );

  await prisma.user.delete({ where: { id: actorUserId } });
  actorUserId = undefined;

  const eventWithoutActor = await prisma.staffTaskCatalogAuditEvent.findUnique({
    where: { id: event.id },
    select: { actorUserId: true },
  });
  assert(
    eventWithoutActor?.actorUserId === null,
    "Actor deletion must retain the audit event and clear actorUserId.",
  );

  await prisma.tenant.delete({ where: { id: tenantId } });
  tenantId = undefined;

  const retainedEvents = await prisma.staffTaskCatalogAuditEvent.count({
    where: { id: event.id },
  });
  assert(
    retainedEvents === 0,
    "Tenant deletion must cascade catalog audit events under the current retention contract.",
  );

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      checks: 5,
      schema: schemaName || "public",
    })}\n`,
  );
} finally {
  if (tenantId) {
    await prisma.staffTaskCatalogAuditEvent.deleteMany({ where: { tenantId } });
    if (actorUserId) {
      await prisma.user.deleteMany({ where: { id: actorUserId, tenantId } });
    }
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
}
