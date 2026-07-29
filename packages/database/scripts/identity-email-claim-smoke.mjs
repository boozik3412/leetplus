import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const REQUIRED_CONFIRMATION = "run-identity-email-claim-smoke";
const SAFE_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parseSafeCiDatabaseUrl(rawValue) {
  assert.ok(rawValue, "DATABASE_URL is required.");

  const parsed = new URL(rawValue);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL must use PostgreSQL.",
  );
  assert.ok(
    SAFE_LOOPBACK_HOSTS.has(parsed.hostname),
    "Identity claim smoke is restricted to loopback PostgreSQL.",
  );

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/,
    "Identity claim smoke requires a dedicated *_ci database.",
  );
  assert.notEqual(databaseName, "postgres", "System databases are forbidden.");
  assert.deepEqual(
    [...parsed.searchParams.keys()],
    ["schema"],
    "DATABASE_URL may contain only the schema query parameter.",
  );
  assert.equal(
    parsed.searchParams.get("schema"),
    "public",
    "Identity claim smoke requires schema=public.",
  );

  return databaseName;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function extractErrorText(error) {
  const messages = new Set();
  const visited = new Set();
  const pending = [error];
  while (pending.length > 0 && visited.size < 64) {
    const candidate = pending.shift();
    if (typeof candidate === "string") {
      messages.add(candidate);
      continue;
    }
    if (
      candidate === null ||
      (typeof candidate !== "object" &&
        typeof candidate !== "function") ||
      visited.has(candidate)
    ) {
      continue;
    }
    visited.add(candidate);
    for (const property of Reflect.ownKeys(candidate)) {
      try {
        pending.push(candidate[property]);
      } catch {
        // Another nested driver property can still carry the server diagnostic.
      }
    }
  }
  return [...messages].join("\n");
}

function extractSqlStates(error) {
  return new Set(
    [...extractErrorText(error).matchAll(/\b([0-9A-Z]{5})\b/gu)].map(
      (match) => match[1],
    ),
  );
}

async function expectSqlState(label, expected, operation) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught,
    `${label}: PostgreSQL unexpectedly accepted the operation.`,
  );
  assert.ok(
    extractSqlStates(caught).has(expected),
    `${label}: expected SQLSTATE ${expected}; observed ${JSON.stringify([
      ...extractSqlStates(caught),
    ])}.`,
  );
}

async function acquireIdentityLock(client, email) {
  const [locked] = await client.$queryRaw`
    SELECT public."identity_email_claim_lock_v1"(${email})
      AS "emailCanonical"
  `;
  return locked?.emailCanonical;
}

async function waitForAdvisoryWait(prisma, backendPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [state] = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_locks
        WHERE "pid" = ${backendPid}
          AND "locktype" = 'advisory'
          AND NOT "granted"
      ) AS "waiting"
    `;
    if (state?.waiting === true) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

if (
  process.env.IDENTITY_EMAIL_CLAIM_SMOKE_CONFIRM !== REQUIRED_CONFIRMATION
) {
  throw new Error(
    `Set IDENTITY_EMAIL_CLAIM_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run this destructive CI-only fixture.`,
  );
}

const databaseName = parseSafeCiDatabaseUrl(process.env.DATABASE_URL);
const admin = new PrismaClient();
const holderClient = new PrismaClient();
const waiterClient = new PrismaClient();
const suffix = randomUUID();
const tenantAId = `identity-claim-a-${suffix}`;
const tenantBId = `identity-claim-b-${suffix}`;
const subjectAId = randomUUID();
const subjectBId = randomUUID();
const userSubjectId = randomUUID();
const skippedRevisionSubjectId = randomUUID();
const foreignTenantSubjectId = randomUUID();
const backwardInviteSubjectId = randomUUID();
const rawEmail = `  Concurrent.Owner.${suffix}@Example.Test  `;
const canonicalEmail = `concurrent.owner.${suffix}@example.test`;
const holderReady = deferred();
const releaseHolder = deferred();
const waiterStarted = deferred();
let holderPromise = null;
let waiterPromise = null;
let waiterObservedOnAdvisoryLock = false;

try {
  await admin.tenant.createMany({
    data: [
      {
        id: tenantAId,
        name: "Identity claim smoke A",
        slug: `identity-claim-a-${suffix}`,
        status: "SUSPENDED",
        customerStage: "PILOT",
        onboardingStatus: "PROVISIONING",
      },
      {
        id: tenantBId,
        name: "Identity claim smoke B",
        slug: `identity-claim-b-${suffix}`,
        status: "SUSPENDED",
        customerStage: "PILOT",
        onboardingStatus: "PROVISIONING",
      },
    ],
  });

  const [catalog] = await admin.$queryRaw`
    SELECT
      target_function.prosecdef AS "securityDefiner",
      target_function.proconfig @> ARRAY['search_path=pg_catalog']::TEXT[]
        AS "privateSearchPath",
      COALESCE(
        BOOL_OR(
          function_acl.grantee = 0
          AND function_acl.privilege_type = 'EXECUTE'
        ),
        FALSE
      ) AS "publicExecute"
    FROM pg_catalog.pg_proc target_function
    JOIN pg_catalog.pg_namespace target_schema
      ON target_schema.oid = target_function.pronamespace
    LEFT JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        target_function.proacl,
        pg_catalog.acldefault('f', target_function.proowner)
      )
    ) function_acl ON TRUE
    WHERE target_schema.nspname = 'public'
      AND target_function.proname = 'identity_email_claim_lock_v1'
    GROUP BY target_function.oid
  `;
  assert.ok(catalog, "Identity email lock function is missing.");
  assert.equal(catalog.securityDefiner, false);
  assert.equal(catalog.privateSearchPath, true);
  assert.equal(catalog.publicExecute, false);

  const [canonicalized] = await admin.$queryRaw`
    SELECT public."identity_email_claim_lock_v1"(${rawEmail})
      AS "emailCanonical"
  `;
  assert.equal(canonicalized?.emailCanonical, canonicalEmail);

  await expectSqlState("invalid email lock input", "22023", () =>
    admin.$queryRaw`
      SELECT public."identity_email_claim_lock_v1"(${"not-an-email"})
    `,
  );

  await expectSqlState("non-canonical claim", "23514", () =>
    admin.$executeRaw`
      INSERT INTO "IdentityEmailClaim" (
        "emailCanonical",
        "claimType",
        "tenantId",
        "subjectId",
        "revision",
        "updatedAt"
      )
      VALUES (
        ${`Concurrent.Owner.${suffix}@Example.Test`},
        'INVITE'::"IdentityEmailClaimType",
        ${tenantAId},
        ${subjectAId},
        1,
        CURRENT_TIMESTAMP
      )
    `,
  );

  const invalidRevisionEmail = `revision-two.${suffix}@example.test`;
  await expectSqlState("non-initial claim revision", "23514", () =>
    admin.$transaction(async (tx) => {
      assert.equal(
        await acquireIdentityLock(tx, invalidRevisionEmail),
        invalidRevisionEmail,
      );
      await tx.$executeRaw`
        INSERT INTO "IdentityEmailClaim" (
          "emailCanonical",
          "claimType",
          "tenantId",
          "subjectId",
          "revision"
        )
        VALUES (
          ${invalidRevisionEmail},
          'INVITE'::"IdentityEmailClaimType",
          ${tenantAId},
          ${`invalid-revision-${suffix}`},
          2
        )
      `;
    }),
  );

  holderPromise = holderClient.$transaction(
    async (tx) => {
      const [backend] = await tx.$queryRaw`
        SELECT pg_catalog.pg_backend_pid()::INTEGER AS "pid"
      `;
      const [locked] = await tx.$queryRaw`
        SELECT public."identity_email_claim_lock_v1"(${rawEmail})
          AS "emailCanonical"
      `;
      assert.equal(locked?.emailCanonical, canonicalEmail);
      await tx.$executeRaw`
        INSERT INTO "IdentityEmailClaim" (
          "emailCanonical",
          "claimType",
          "tenantId",
          "subjectId",
          "revision",
          "updatedAt"
        )
        VALUES (
          ${canonicalEmail},
          'INVITE'::"IdentityEmailClaimType",
          ${tenantAId},
          ${subjectAId},
          1,
          CURRENT_TIMESTAMP
        )
      `;
      holderReady.resolve(backend.pid);
      await releaseHolder.promise;
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
  void holderPromise.catch((error) => holderReady.reject(error));

  await holderReady.promise;
  waiterPromise = waiterClient.$transaction(
    async (tx) => {
      const [backend] = await tx.$queryRaw`
        SELECT pg_catalog.pg_backend_pid()::INTEGER AS "pid"
      `;
      waiterStarted.resolve(backend.pid);
      const [locked] = await tx.$queryRaw`
        SELECT public."identity_email_claim_lock_v1"(${canonicalEmail.toUpperCase()})
          AS "emailCanonical"
      `;
      assert.equal(locked?.emailCanonical, canonicalEmail);
      await tx.$executeRaw`
        INSERT INTO "IdentityEmailClaim" (
          "emailCanonical",
          "claimType",
          "tenantId",
          "subjectId",
          "revision",
          "updatedAt"
        )
        VALUES (
          ${canonicalEmail},
          'INVITE'::"IdentityEmailClaimType",
          ${tenantBId},
          ${subjectBId},
          1,
          CURRENT_TIMESTAMP
        )
      `;
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
  void waiterPromise.catch((error) => waiterStarted.reject(error));

  const waiterPid = await waiterStarted.promise;
  waiterObservedOnAdvisoryLock = await waitForAdvisoryWait(admin, waiterPid);
  assert.equal(
    waiterObservedOnAdvisoryLock,
    true,
    "The competing canonical spelling did not wait on the shared advisory namespace.",
  );

  releaseHolder.resolve();
  await holderPromise;
  await expectSqlState(
    "cross-tenant duplicate canonical claim",
    "23505",
    () => waiterPromise,
  );

  const claims = await admin.$queryRaw`
    SELECT
      "emailCanonical",
      "claimType"::TEXT AS "claimType",
      "tenantId",
      "subjectId",
      "revision"
    FROM "IdentityEmailClaim"
    WHERE "emailCanonical" = ${canonicalEmail}
  `;
  assert.deepEqual(claims, [
    {
      emailCanonical: canonicalEmail,
      claimType: "INVITE",
      tenantId: tenantAId,
      subjectId: subjectAId,
      revision: 1,
    },
  ]);

  const transitioned = await admin.$transaction(async (tx) => {
    assert.equal(
      await acquireIdentityLock(tx, canonicalEmail),
      canonicalEmail,
    );
    return tx.$queryRaw`
      UPDATE "IdentityEmailClaim"
      SET
        "claimType" = 'USER'::"IdentityEmailClaimType",
        "subjectId" = ${userSubjectId},
        "revision" = 2
      WHERE "emailCanonical" = ${canonicalEmail}
      RETURNING
        "claimType"::TEXT AS "claimType",
        "tenantId",
        "revision"
    `;
  });
  assert.deepEqual(transitioned, [
    {
      claimType: "USER",
      tenantId: tenantAId,
      revision: 2,
    },
  ]);

  await expectSqlState("skipped claim revision", "23514", () =>
    admin.$transaction(async (tx) => {
      await acquireIdentityLock(tx, canonicalEmail);
      await tx.$executeRaw`
        UPDATE "IdentityEmailClaim"
        SET
          "subjectId" = ${skippedRevisionSubjectId},
          "revision" = 4
        WHERE "emailCanonical" = ${canonicalEmail}
      `;
    }),
  );
  await expectSqlState("cross-tenant claim reassignment", "23514", () =>
    admin.$transaction(async (tx) => {
      await acquireIdentityLock(tx, canonicalEmail);
      await tx.$executeRaw`
        UPDATE "IdentityEmailClaim"
        SET
          "tenantId" = ${tenantBId},
          "subjectId" = ${foreignTenantSubjectId},
          "revision" = 3
        WHERE "emailCanonical" = ${canonicalEmail}
      `;
    }),
  );
  await expectSqlState("backward USER to INVITE transition", "23514", () =>
    admin.$transaction(async (tx) => {
      await acquireIdentityLock(tx, canonicalEmail);
      await tx.$executeRaw`
        UPDATE "IdentityEmailClaim"
        SET
          "claimType" = 'INVITE'::"IdentityEmailClaimType",
          "subjectId" = ${backwardInviteSubjectId},
          "revision" = 3
        WHERE "emailCanonical" = ${canonicalEmail}
      `;
    }),
  );
  await expectSqlState("claimed tenant deletion", "23503", () =>
    admin.$executeRaw`
      DELETE FROM "Tenant"
      WHERE "id" = ${tenantAId}
    `,
  );

  const [finalClaim] = await admin.$queryRaw`
    SELECT
      "claimType"::TEXT AS "claimType",
      "tenantId",
      "revision"
    FROM "IdentityEmailClaim"
    WHERE "emailCanonical" = ${canonicalEmail}
  `;
  assert.deepEqual(finalClaim, {
    claimType: "USER",
    tenantId: tenantAId,
    revision: 2,
  });

  console.log(
    JSON.stringify(
      {
        database: databaseName,
        identityEmailClaimEvidence: {
          canonicalizationVerified: true,
          initialRevisionGuardVerified: true,
          globalCollisionRejected: true,
          immutableTenantVerified: true,
          monotonicRevisionVerified: true,
          backwardTransitionRejected: true,
          publicExecuteRevoked: true,
          securityInvokerBoundary: true,
          waiterObservedOnAdvisoryLock,
        },
      },
      null,
      2,
    ),
  );
} finally {
  releaseHolder.resolve();
  try {
    await Promise.allSettled(
      [holderPromise, waiterPromise].filter((promise) => promise !== null),
    );
    await admin.$transaction(async (tx) => {
      const cleanupClaims = await tx.$queryRaw`
        SELECT "emailCanonical"
        FROM "IdentityEmailClaim"
        WHERE "tenantId" IN (${tenantAId}, ${tenantBId})
        ORDER BY "emailCanonical"
      `;
      for (const claim of cleanupClaims) {
        await acquireIdentityLock(tx, claim.emailCanonical);
      }
      await tx.$executeRaw`
        DELETE FROM "IdentityEmailClaim"
        WHERE "tenantId" IN (${tenantAId}, ${tenantBId})
      `;
    });
    await admin.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
  } finally {
    await Promise.allSettled([
      admin.$disconnect(),
      holderClient.$disconnect(),
      waiterClient.$disconnect(),
    ]);
  }
}
