import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const REQUIRED_CONFIRMATION = "run-identity-email-claim-boundary-smoke";
const SAFE_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ROLE_PREFIX = "lp_identity_boundary_";

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseSafeCiDatabaseUrl(rawValue) {
  assert.ok(rawValue, "DATABASE_URL is required.");
  const parsed = new URL(rawValue);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL must use PostgreSQL.",
  );
  assert.ok(
    SAFE_LOOPBACK_HOSTS.has(parsed.hostname),
    "Identity boundary smoke is restricted to loopback PostgreSQL.",
  );
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/u,
    "Identity boundary smoke requires a dedicated *_ci database.",
  );
  assert.notEqual(databaseName, "postgres");
  assert.deepEqual([...parsed.searchParams.keys()], ["schema"]);
  assert.equal(parsed.searchParams.get("schema"), "public");
  return { databaseName, parsed };
}

function runtimeDatabaseUrl(sourceUrl, roleName, password) {
  const result = new URL(sourceUrl);
  result.username = roleName;
  result.password = password;
  return result.toString();
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
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      visited.has(candidate)
    ) {
      continue;
    }
    visited.add(candidate);
    for (const property of Reflect.ownKeys(candidate)) {
      try {
        pending.push(candidate[property]);
      } catch {
        // Another nested driver property can still carry the SQLSTATE.
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
  assert.ok(caught, `${label}: PostgreSQL unexpectedly accepted the operation.`);
  assert.ok(
    extractSqlStates(caught).has(expected),
    `${label}: expected SQLSTATE ${expected}; observed ${JSON.stringify([
      ...extractSqlStates(caught),
    ])}.`,
  );
  return caught;
}

async function reserve(runtime, email, tenantId, subjectId) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_reserve_invite_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT)
      ) AS receipt
    `,
    email,
    tenantId,
    subjectId,
  );
  return rows[0]?.receipt;
}

async function assertInvite(
  runtime,
  { email, tenantId, subjectId, expectedRevision },
) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_assert_invite_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS INTEGER)
      ) AS receipt
    `,
    email,
    tenantId,
    subjectId,
    expectedRevision,
  );
  return rows[0]?.receipt;
}

async function transition(
  runtime,
  {
    email,
    tenantId,
    expectedType,
    expectedSubjectId,
    expectedRevision,
    nextType,
    nextSubjectId,
  },
) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_transition_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS TEXT),
        CAST($5 AS INTEGER),
        CAST($6 AS TEXT),
        CAST($7 AS TEXT)
      ) AS receipt
    `,
    email,
    tenantId,
    expectedType,
    expectedSubjectId,
    expectedRevision,
    nextType,
    nextSubjectId,
  );
  return rows[0]?.receipt;
}

async function release(
  runtime,
  { email, tenantId, expectedType, subjectId, expectedRevision },
) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_release_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS TEXT),
        CAST($5 AS INTEGER)
      ) AS receipt
    `,
    email,
    tenantId,
    expectedType,
    subjectId,
    expectedRevision,
  );
  return rows[0]?.receipt;
}

if (
  process.env.IDENTITY_EMAIL_CLAIM_BOUNDARY_SMOKE_CONFIRM !==
  REQUIRED_CONFIRMATION
) {
  throw new Error(
    `Set IDENTITY_EMAIL_CLAIM_BOUNDARY_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run this destructive CI-only fixture.`,
  );
}

assert.notEqual(
  process.env.NODE_ENV,
  "production",
  "Identity boundary smoke is prohibited in production.",
);

const { databaseName, parsed } = parseSafeCiDatabaseUrl(
  process.env.DATABASE_URL,
);
const admin = new PrismaClient({ log: [] });
const suffix = randomBytes(8).toString("hex");
const roleName = `${ROLE_PREFIX}${suffix}`;
const role = quoteIdentifier(roleName);
const password = randomBytes(32).toString("hex");
const tenantAId = randomUUID();
const tenantBId = randomUUID();
const raceSubjectId = randomUUID();
const flowReservationId = randomUUID();
const releaseReservationId = randomUUID();
const revokedReservationId = randomUUID();
const revokedInviteId = randomUUID();
const revokedReplacementReservationId = randomUUID();
const inviteId = randomUUID();
const staleDestinationInviteId = randomUUID();
const userId = randomUUID();
const raceEmail = `race.${suffix}@example.test`;
const flowEmail = `flow.${suffix}@example.test`;
const releaseEmail = `release.${suffix}@example.test`;
const revokedEmail = `revoked.${suffix}@example.test`;
let runtime = null;
let roleCreated = false;

try {
  const [server] = await admin.$queryRaw`
    SELECT
      current_database() AS database_name,
      current_setting('server_version_num')::integer AS server_version_number,
      (
        SELECT rolsuper
        FROM pg_roles
        WHERE rolname = CURRENT_USER
      ) AS is_superuser
  `;
  assert.equal(server.database_name, databaseName);
  assert.equal(Math.floor(server.server_version_number / 10_000), 16);
  assert.equal(server.is_superuser, true);

  await admin.tenant.createMany({
    data: [
      {
        id: tenantAId,
        name: "Identity boundary smoke A",
        slug: `identity-boundary-a-${suffix}`,
        status: "SUSPENDED",
        customerStage: "PILOT",
        onboardingStatus: "PROVISIONING",
      },
      {
        id: tenantBId,
        name: "Identity boundary smoke B",
        slug: `identity-boundary-b-${suffix}`,
        status: "SUSPENDED",
        customerStage: "PILOT",
        onboardingStatus: "PROVISIONING",
      },
    ],
  });

  await admin.$executeRawUnsafe(
    `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  roleCreated = true;
  await admin.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${role}`,
  );
  await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.$executeRawUnsafe(
    `GRANT ALL PRIVILEGES ON TABLE public."IdentityEmailClaim" TO ${role}`,
  );
  await admin.$executeRawUnsafe(
    `REVOKE ALL PRIVILEGES ON TABLE public."IdentityEmailClaim" FROM ${role}`,
  );
  await admin.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."UserInvite", public."User" TO ${role}`,
  );
  for (const signature of [
    'public."identity_email_claim_reserve_invite_v2"(TEXT, TEXT, TEXT)',
    'public."identity_email_claim_assert_invite_v1"(TEXT, TEXT, TEXT, INTEGER)',
    'public."identity_email_claim_transition_v2"(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT)',
    'public."identity_email_claim_release_v2"(TEXT, TEXT, TEXT, TEXT, INTEGER)',
  ]) {
    await admin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION ${signature} FROM ${role}`,
    );
  }

  runtime = new PrismaClient({
    datasources: {
      db: {
        url: runtimeDatabaseUrl(parsed, roleName, password),
      },
    },
    log: [],
  });

  const [catalog] = await admin.$queryRawUnsafe(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE function_object.prosecdef
            AND function_object.provolatile = 'v'
            AND function_object.proconfig @> ARRAY['search_path=pg_catalog']::TEXT[]
        )::integer AS private_definer_count,
        COUNT(*) FILTER (
          WHERE NOT COALESCE(
            (
              SELECT BOOL_OR(
                function_acl.grantee = 0
                AND function_acl.privilege_type = 'EXECUTE'
              )
              FROM pg_catalog.aclexplode(
                COALESCE(
                  function_object.proacl,
                  pg_catalog.acldefault('f', function_object.proowner)
                )
              ) AS function_acl
            ),
            FALSE
          )
        )::integer AS no_public_execute_count
      FROM pg_catalog.pg_proc AS function_object
      JOIN pg_catalog.pg_namespace AS function_schema
        ON function_schema.oid = function_object.pronamespace
      WHERE function_schema.nspname = 'public'
        AND function_object.proname IN (
          'identity_email_claim_reserve_invite_v2',
          'identity_email_claim_assert_invite_v1',
          'identity_email_claim_transition_v2',
          'identity_email_claim_release_v2'
        )
    `,
  );
  assert.deepEqual(catalog, {
    private_definer_count: 4,
    no_public_execute_count: 4,
  });

  const [tableAcl] = await admin.$queryRawUnsafe(
    `
      SELECT
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'SELECT')
          AS can_select,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'INSERT')
          AS can_insert,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'UPDATE')
          AS can_update,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'DELETE')
          AS can_delete,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'TRUNCATE')
          AS can_truncate,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'REFERENCES')
          AS can_reference,
        has_table_privilege($1, 'public."IdentityEmailClaim"', 'TRIGGER')
          AS can_trigger
    `,
    roleName,
  );
  assert.deepEqual(tableAcl, {
    can_select: false,
    can_insert: false,
    can_update: false,
    can_delete: false,
    can_truncate: false,
    can_reference: false,
    can_trigger: false,
  });

  for (const [label, operation] of [
    [
      "direct SELECT",
      () => runtime.$queryRawUnsafe('SELECT * FROM public."IdentityEmailClaim"'),
    ],
    [
      "direct INSERT",
      () =>
        runtime.$executeRawUnsafe(
          `INSERT INTO public."IdentityEmailClaim" (
            "emailCanonical",
            "claimType",
            "tenantId",
            "subjectId"
          ) VALUES (
            'direct.${suffix}@example.test',
            'INVITE'::public."IdentityEmailClaimType",
            '${tenantAId}',
            '${randomUUID()}'
          )`,
        ),
    ],
    [
      "direct UPDATE",
      () =>
        runtime.$executeRawUnsafe(
          'UPDATE public."IdentityEmailClaim" SET "revision" = "revision"',
        ),
    ],
    [
      "direct DELETE",
      () =>
        runtime.$executeRawUnsafe('DELETE FROM public."IdentityEmailClaim"'),
    ],
  ]) {
    await expectSqlState(label, "42501", operation);
  }
  await expectSqlState("direct lock helper", "42501", () =>
    runtime.$queryRawUnsafe(
      `SELECT public."identity_email_claim_lock_v1"(
        'direct-lock.${suffix}@example.test'
      )`,
    ),
  );

  const concurrentReceipts = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      reserve(
        runtime,
        index % 2 === 0 ? `  ${raceEmail.toUpperCase()}  ` : raceEmail,
        tenantAId,
        raceSubjectId,
      ),
    ),
  );
  assert.equal(
    concurrentReceipts.filter((receipt) => receipt.decision === "CREATED")
      .length,
    1,
  );
  assert.equal(
    concurrentReceipts.filter(
      (receipt) => receipt.decision === "ALREADY_RESERVED",
    ).length,
    99,
  );
  for (const receipt of concurrentReceipts) {
    assert.deepEqual(Object.keys(receipt).sort(), [
      "claimType",
      "decision",
      "operation",
      "revision",
      "schemaVersion",
      "subjectId",
      "tenantId",
    ]);
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.operation, "RESERVE_INVITE");
    assert.equal(receipt.claimType, "INVITE");
    assert.equal(receipt.tenantId, tenantAId);
    assert.equal(receipt.subjectId, raceSubjectId);
    assert.equal(receipt.revision, 1);
  }

  const conflictEmail = `  ${raceEmail.toUpperCase()}  `;
  const conflict = await expectSqlState("cross-tenant email", "23505", () =>
    reserve(runtime, conflictEmail, tenantBId, randomUUID()),
  );
  const conflictText = extractErrorText(conflict).toLowerCase();
  assert.equal(conflictText.includes(raceEmail.toLowerCase()), false);
  assert.equal(conflictText.includes(conflictEmail.trim().toLowerCase()), false);

  await expectSqlState("duplicate INVITE subject", "23505", () =>
    reserve(
      runtime,
      `second-subject.${suffix}@example.test`,
      tenantAId,
      raceSubjectId,
    ),
  );

  assert.deepEqual(
    await reserve(runtime, flowEmail, tenantAId, flowReservationId),
    {
      schemaVersion: 2,
      operation: "RESERVE_INVITE",
      decision: "CREATED",
      claimType: "INVITE",
      tenantId: tenantAId,
      subjectId: flowReservationId,
      revision: 1,
    },
  );
  const rebindInput = {
    email: flowEmail,
    tenantId: tenantAId,
    expectedType: "INVITE",
    expectedSubjectId: flowReservationId,
    expectedRevision: 1,
    nextType: "INVITE",
    nextSubjectId: inviteId,
  };
  await runtime.$transaction(async (tx) => {
    assert.deepEqual(
      await assertInvite(tx, {
        email: flowEmail,
        tenantId: tenantAId,
        subjectId: flowReservationId,
        expectedRevision: 1,
      }),
      {
        schemaVersion: 1,
        operation: "ASSERT_INVITE",
        decision: "MATCHED",
        claimType: "INVITE",
        tenantId: tenantAId,
        subjectId: flowReservationId,
        revision: 1,
      },
    );
    await tx.userInvite.create({
      data: {
        id: inviteId,
        tenantId: tenantAId,
        email: flowEmail,
        role: "OWNER",
        accessScope: "NETWORK",
        storeIds: [],
        tokenHash: `identity-boundary-${suffix}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.deepEqual(await transition(tx, rebindInput), {
      schemaVersion: 2,
      operation: "TRANSITION_INVITE",
      decision: "TRANSITIONED",
      claimType: "INVITE",
      tenantId: tenantAId,
      subjectId: inviteId,
      revision: 2,
    });
  });
  assert.deepEqual(await transition(runtime, rebindInput), {
    schemaVersion: 2,
    operation: "TRANSITION_INVITE",
    decision: "ALREADY_TRANSITIONED",
    claimType: "INVITE",
    tenantId: tenantAId,
    subjectId: inviteId,
    revision: 2,
  });
  await expectSqlState("bound INVITE release", "23514", () =>
    release(runtime, {
      email: flowEmail,
      tenantId: tenantAId,
      expectedType: "INVITE",
      subjectId: inviteId,
      expectedRevision: 2,
    }),
  );
  await admin.userInvite.create({
    data: {
      id: staleDestinationInviteId,
      tenantId: tenantAId,
      email: flowEmail,
      role: "MANAGER",
      accessScope: "NETWORK",
      storeIds: [],
      tokenHash: `identity-boundary-stale-${suffix}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await expectSqlState("stale transition", "23514", () =>
    transition(runtime, {
      ...rebindInput,
      expectedSubjectId: randomUUID(),
      nextSubjectId: staleDestinationInviteId,
    }),
  );
  await admin.userInvite.delete({ where: { id: staleDestinationInviteId } });
  await admin.userInvite.delete({ where: { id: inviteId } });
  await expectSqlState("transition replay without destination", "23503", () =>
    transition(runtime, rebindInput),
  );
  const promoteInput = {
    email: flowEmail,
    tenantId: tenantAId,
    expectedType: "INVITE",
    expectedSubjectId: inviteId,
    expectedRevision: 2,
    nextType: "USER",
    nextSubjectId: userId,
  };
  await runtime.$transaction(async (tx) => {
    assert.deepEqual(
      await assertInvite(tx, {
        email: flowEmail,
        tenantId: tenantAId,
        subjectId: inviteId,
        expectedRevision: 2,
      }),
      {
        schemaVersion: 1,
        operation: "ASSERT_INVITE",
        decision: "MATCHED",
        claimType: "INVITE",
        tenantId: tenantAId,
        subjectId: inviteId,
        revision: 2,
      },
    );
    await tx.user.create({
      data: {
        id: userId,
        tenantId: tenantAId,
        email: flowEmail,
        passwordHash: "identity-boundary-smoke-not-a-login",
        role: "OWNER",
        accessScope: "NETWORK",
        isActive: true,
      },
    });
    assert.deepEqual(await transition(tx, promoteInput), {
      schemaVersion: 2,
      operation: "TRANSITION_INVITE",
      decision: "TRANSITIONED",
      claimType: "USER",
      tenantId: tenantAId,
      subjectId: userId,
      revision: 3,
    });
  });
  assert.deepEqual(await transition(runtime, promoteInput), {
    schemaVersion: 2,
    operation: "TRANSITION_INVITE",
    decision: "ALREADY_TRANSITIONED",
    claimType: "USER",
    tenantId: tenantAId,
    subjectId: userId,
    revision: 3,
  });
  await expectSqlState("INVITE versus USER subject collision", "23505", () =>
    reserve(
      runtime,
      `user-subject-collision.${suffix}@example.test`,
      tenantAId,
      userId,
    ),
  );
  await expectSqlState("USER release", "22023", () =>
    release(runtime, {
      email: flowEmail,
      tenantId: tenantAId,
      expectedType: "USER",
      subjectId: userId,
      expectedRevision: 3,
    }),
  );

  await reserve(runtime, releaseEmail, tenantAId, releaseReservationId);
  assert.deepEqual(
    await release(runtime, {
      email: releaseEmail,
      tenantId: tenantAId,
      expectedType: "INVITE",
      subjectId: releaseReservationId,
      expectedRevision: 1,
    }),
    {
      schemaVersion: 2,
      operation: "RELEASE_INVITE",
      decision: "RELEASED",
      tenantId: tenantAId,
      subjectId: releaseReservationId,
      releasedRevision: 1,
    },
  );
  await expectSqlState("missing release replay", "23503", () =>
    release(runtime, {
      email: releaseEmail,
      tenantId: tenantAId,
      expectedType: "INVITE",
      subjectId: releaseReservationId,
      expectedRevision: 1,
    }),
  );

  await reserve(runtime, revokedEmail, tenantAId, revokedReservationId);
  await runtime.$transaction(async (tx) => {
    await tx.userInvite.create({
      data: {
        id: revokedInviteId,
        tenantId: tenantAId,
        email: revokedEmail,
        role: "MANAGER",
        accessScope: "NETWORK",
        storeIds: [],
        tokenHash: `identity-boundary-revoked-${suffix}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    assert.deepEqual(
      await transition(tx, {
        email: revokedEmail,
        tenantId: tenantAId,
        expectedType: "INVITE",
        expectedSubjectId: revokedReservationId,
        expectedRevision: 1,
        nextType: "INVITE",
        nextSubjectId: revokedInviteId,
      }),
      {
        schemaVersion: 2,
        operation: "TRANSITION_INVITE",
        decision: "TRANSITIONED",
        claimType: "INVITE",
        tenantId: tenantAId,
        subjectId: revokedInviteId,
        revision: 2,
      },
    );
    const revokedAt = new Date();
    await tx.userInvite.update({
      where: { id: revokedInviteId },
      data: {
        revokedAt,
        identityClaimRevision: 2,
      },
    });
    assert.deepEqual(
      await release(tx, {
        email: revokedEmail,
        tenantId: tenantAId,
        expectedType: "INVITE",
        subjectId: revokedInviteId,
        expectedRevision: 2,
      }),
      {
        schemaVersion: 2,
        operation: "RELEASE_INVITE",
        decision: "RELEASED",
        tenantId: tenantAId,
        subjectId: revokedInviteId,
        releasedRevision: 2,
      },
    );
  });
  assert.equal(
    (
      await admin.userInvite.findUniqueOrThrow({
        where: { id: revokedInviteId },
      })
    ).revokedAt instanceof Date,
    true,
  );
  assert.deepEqual(
    await reserve(
      runtime,
      revokedEmail,
      tenantAId,
      revokedReplacementReservationId,
    ),
    {
      schemaVersion: 2,
      operation: "RESERVE_INVITE",
      decision: "CREATED",
      claimType: "INVITE",
      tenantId: tenantAId,
      subjectId: revokedReplacementReservationId,
      revision: 1,
    },
  );
  assert.deepEqual(
    await release(runtime, {
      email: revokedEmail,
      tenantId: tenantAId,
      expectedType: "INVITE",
      subjectId: revokedReplacementReservationId,
      expectedRevision: 1,
    }),
    {
      schemaVersion: 2,
      operation: "RELEASE_INVITE",
      decision: "RELEASED",
      tenantId: tenantAId,
      subjectId: revokedReplacementReservationId,
      releasedRevision: 1,
    },
  );

  const finalClaims = await admin.identityEmailClaim.findMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
    orderBy: { emailCanonical: "asc" },
  });
  assert.equal(finalClaims.length, 2);
  assert.equal(
    finalClaims.filter((claim) => claim.claimType === "INVITE").length,
    1,
  );
  assert.equal(
    finalClaims.filter((claim) => claim.claimType === "USER").length,
    1,
  );

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      database: databaseName,
      postgresMajor: 16,
      restrictedRuntimeRole: true,
      directIdentityTablePrivileges: 0,
      publicBoundaryExecute: 0,
      directLockExecute: false,
      concurrentReservations: 100,
      createdReservations: 1,
      replayedReservations: 99,
      transitionReplayVerified: true,
      transitionReplayDestinationChecked: true,
      boundReleaseRejected: true,
      retainedRevokedInviteReleased: true,
      revokedInviteReReserveVerified: true,
      userReleaseRejected: true,
      missingReleaseFailsClosed: true,
      canonicalEmailAbsentFromReceipts: true,
      canonicalEmailAbsentFromConflict: true,
    })}\n`,
  );
} finally {
  let cleanupError = null;
  if (runtime) {
    await runtime.$disconnect().catch((error) => {
      cleanupError ??= error;
    });
  }
  await admin.identityEmailClaim
    .deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
    .catch((error) => {
      cleanupError ??= error;
    });
  await admin.userInvite
    .deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
    .catch((error) => {
      cleanupError ??= error;
    });
  await admin.user
    .deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
    .catch((error) => {
      cleanupError ??= error;
    });
  await admin.tenant
    .deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } })
    .catch((error) => {
      cleanupError ??= error;
    });
  if (roleCreated) {
    await admin.$executeRawUnsafe(`DROP OWNED BY ${role}`).catch((error) => {
      cleanupError ??= error;
    });
    await admin
      .$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`)
      .catch((error) => {
        cleanupError ??= error;
      });
  }
  await admin.$disconnect().catch((error) => {
    cleanupError ??= error;
  });
  if (cleanupError) {
    throw cleanupError;
  }
}
