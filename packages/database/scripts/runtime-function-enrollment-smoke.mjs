import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  APPLICATION_RUNTIME_FUNCTIONS,
  EXCLUDED_ADMISSION_FUNCTIONS,
  EXCLUDED_PENDING_FUNCTIONS,
  EXCLUDED_RUNTIME_RELEASE_FUNCTIONS,
  EXCLUDED_WORKER_FUNCTIONS,
  SEALED_RUNTIME_TABLES,
  SEALED_RUNTIME_TYPES,
  expectedApplyConfirmation,
} from "./runtime-function-enrollment.mjs";

const REQUIRED_CONFIRMATION = "run-runtime-function-enrollment-smoke";
const SAFE_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ROLE_PREFIX = "lp_runtime_acl_smoke_";
const CLI_PATH = fileURLToPath(
  new URL("./runtime-function-enrollment.cli.mjs", import.meta.url),
);
const STRICT_EXCLUDED_FUNCTION_ARGUMENTS = Object.freeze({
  shared_beta_runtime_canonical_json_v1: Object.freeze(["'{}'::jsonb"]),
  shared_beta_runtime_digest_v1: Object.freeze([
    "'runtime-function-enrollment-smoke'::text",
    "'{}'::jsonb",
  ]),
});

const HELP = `LeetPlus runtime function ACL enrollment PostgreSQL smoke

Usage:
  node scripts/runtime-function-enrollment-smoke.mjs
  node scripts/runtime-function-enrollment-smoke.mjs --self-test
  node scripts/runtime-function-enrollment-smoke.mjs --help

Required environment:
  DATABASE_URL
  RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}

Safety:
  - PostgreSQL 16, loopback and a dedicated *_ci database are mandatory.
  - Exact terminal migration 183 and exact completed count 183 are mandatory.
  - Only one generated disposable LOGIN NOINHERIT role is created.
  - Production is prohibited.
  - Deliberate target-role and PUBLIC function/table/column/type ACL drift is
    remediated across all fifty-six exact CURRENT_176 routine contracts.
  - Dedicated activation/coordinator roles are rejected, never enrolled.
  - The generated role and every grant are removed in finally.
`;

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exactColumnList(entry) {
  return entry.columns
    .map((columnName) => quoteIdentifier(columnName))
    .join(", ");
}

function functionNamePattern(entry) {
  const match = /"([^"]+)"\(/u.exec(entry.catalogSignature);
  assert.ok(match, `Invalid function catalog signature: ${entry.key}.`);
  return new RegExp(escapeRegExp(match[1]), "u");
}

function tableNamePattern(entry) {
  const match = /"([^"]+)"$/u.exec(entry.catalogName);
  assert.ok(match, `Invalid table catalog name: ${entry.key}.`);
  return new RegExp(escapeRegExp(match[1]), "u");
}

function callExcludedFunctionBoundary(runtime, entry) {
  const match = /^(.*)\((.*)\)$/u.exec(entry.catalogSignature);
  assert.ok(match, `Invalid function catalog signature: ${entry.key}.`);
  const argumentTypes =
    match[2].length === 0
      ? []
      : match[2].split(",").map((typeName) => typeName.trim());
  const strictArguments = STRICT_EXCLUDED_FUNCTION_ARGUMENTS[entry.key];
  if (strictArguments) {
    assert.equal(
      strictArguments.length,
      argumentTypes.length,
      `${entry.key} strict ACL probe arity`,
    );
  }
  const argumentsSql = (
    strictArguments ?? argumentTypes.map((typeName) => `NULL::${typeName}`)
  ).join(", ");
  return runtime.$queryRawUnsafe(`SELECT ${match[1]}(${argumentsSql})`);
}

function selectSealedTable(runtime, entry) {
  return runtime.$queryRawUnsafe(
    `SELECT COUNT(*)::integer AS row_count FROM ${entry.grantName}`,
  );
}

function parseSafeSmokeDatabaseUrl(rawValue) {
  assert.ok(rawValue, "DATABASE_URL is required.");
  const parsed = new URL(rawValue);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL must use PostgreSQL.",
  );
  assert.ok(
    SAFE_LOOPBACK_HOSTS.has(parsed.hostname),
    "Runtime function enrollment smoke requires loopback PostgreSQL.",
  );
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/u,
    "Runtime function enrollment smoke requires a dedicated *_ci database.",
  );
  assert.notEqual(databaseName, "postgres");
  assert.deepEqual(
    [...parsed.searchParams.keys()],
    ["schema"],
    "DATABASE_URL may contain only schema=public.",
  );
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
        // Other nested driver properties still carry the server diagnostic.
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

function sanitizeErrorText(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/password=[^\s;]+/giu, "password=<redacted>")
    .replace(/\bPASSWORD\s+'[^']*'/giu, "PASSWORD '<redacted>'");
}

async function expectSqlState(expected, operation, messagePattern) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected SQLSTATE ${expected}.`);
  const states = extractSqlStates(caught);
  assert.ok(
    states.has(expected),
    `Expected SQLSTATE ${expected}; observed ${JSON.stringify([...states])}.`,
  );
  assert.match(extractErrorText(caught), messagePattern);
}

function runCli(mode, environment) {
  return spawnSync(process.execPath, [CLI_PATH, `--${mode}`], {
    env: {
      ...process.env,
      ...environment,
    },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
}

function parseCliReceipt(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]);
}

function assertNoSecretLeak(result, secrets) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const secret of secrets) {
    assert.ok(secret);
    assert.doesNotMatch(output, new RegExp(escapeRegExp(secret), "u"));
  }
  assert.doesNotMatch(output, /postgres(?:ql)?:\/\//iu);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function callTransitionKey(runtime) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_delivery_transition_key_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS BIGINT),
        CAST($5 AS INTEGER),
        CAST($6 AS TEXT),
        CAST($7 AS INTEGER),
        CAST($8 AS TEXT),
        CAST($9 AS TEXT),
        CAST($10 AS TEXT),
        CAST($11 AS TEXT)
      ) AS transition_key
    `,
    "tenant-smoke",
    "delivery-smoke",
    "reward-smoke",
    1,
    0,
    "DELIVERY_RETRIED",
    null,
    null,
    null,
    "FAILED",
    "READY",
  );
  return rows[0]?.transition_key;
}

function callRewardDeliveryLock(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_reward_delivery_lock_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT)
      )
    `,
    "",
    "",
  );
}

function callWorkerEventBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_delivery_record_event_v1"(
        CAST($1 AS JSON)
      )
    `,
    "{}",
  );
}

function callPendingIdentityBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_lock_v1"(
        CAST($1 AS TEXT)
      )
    `,
    "pending.identity@example.test",
  );
}

function callIdentityReserveBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_reserve_invite_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT)
      )
    `,
    "reserved.identity@example.test",
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  );
}

function callIdentityAssertBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_assert_invite_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS INTEGER)
      )
    `,
    "assert.identity@example.test",
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    1,
  );
}

function callIdentityLocatorBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_assert_invite_locator_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS INTEGER)
      )
    `,
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    1,
  );
}

function callIdentityTransitionBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_transition_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS TEXT),
        CAST($5 AS INTEGER),
        CAST($6 AS TEXT),
        CAST($7 AS TEXT)
      )
    `,
    "transition.identity@example.test",
    "00000000-0000-4000-8000-000000000001",
    "INVITE",
    "00000000-0000-4000-8000-000000000002",
    1,
    "USER",
    "00000000-0000-4000-8000-000000000003",
  );
}

function callIdentityReleaseBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_email_claim_release_v2"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS TEXT),
        CAST($5 AS INTEGER)
      )
    `,
    "release.identity@example.test",
    "00000000-0000-4000-8000-000000000001",
    "INVITE",
    "00000000-0000-4000-8000-000000000002",
    1,
  );
}

function callIdentityOwnerInviteHoldBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."identity_owner_invite_issue_hold_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS INTEGER),
        CAST($5 AS TEXT),
        CAST($6 AS TEXT),
        CAST($7 AS TEXT),
        CAST($8 AS TEXT),
        CAST($9 AS TEXT),
        CAST($10 AS TEXT),
        CAST($11 AS TEXT),
        CAST($12 AS TEXT),
        CAST($13 AS BYTEA),
        CAST($14 AS TIMESTAMPTZ)
      )
    `,
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    1,
    "00000000-0000-4000-8000-000000000003",
    "a".repeat(64),
    "test",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
    "00000000-0000-4000-8000-000000000007",
    "b".repeat(64),
    Buffer.alloc(71, 1),
    new Date("2099-01-01T00:00:00.000Z"),
  );
}

function selectIdentityClaimTable(runtime) {
  return runtime.$queryRawUnsafe(
    'SELECT COUNT(*)::integer AS claim_count FROM public."IdentityEmailClaim"',
  );
}

function selectIdentityOwnerInviteCommandTable(runtime) {
  return runtime.$queryRawUnsafe(
    'SELECT COUNT(*)::integer AS command_count FROM public."IdentityOwnerInviteIssueCommand"',
  );
}

function selectIdentityMailOutboxTable(runtime) {
  return runtime.$queryRawUnsafe(
    'SELECT COUNT(*)::integer AS outbox_count FROM public."IdentityMailOutbox"',
  );
}

function insertIdentityClaimTable(runtime) {
  return runtime.$executeRawUnsafe(
    `
      INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical",
        "claimType",
        "tenantId",
        "subjectId",
        "revision",
        "updatedAt"
      )
      VALUES (
        'direct.identity@example.test',
        'INVITE'::public."IdentityEmailClaimType",
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        1,
        CURRENT_TIMESTAMP
      )
    `,
  );
}

async function inspectSealedColumnPrivileges(admin, roleName) {
  const totals = {
    columns: 0,
    effective: 0,
    directTarget: 0,
    directPublic: 0,
  };
  for (const entry of SEALED_RUNTIME_TABLES) {
    const [row] = await admin.$queryRawUnsafe(
      `
        WITH relation_object AS (
          SELECT pg_catalog.to_regclass($2) AS oid
        ),
        columns AS (
          SELECT
            attribute.attrelid,
            attribute.attnum,
            attribute.attacl
          FROM relation_object
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = relation_object.oid
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
        ),
        privilege_kinds(privilege_type) AS (
          VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
        )
        SELECT
          (SELECT pg_catalog.count(*)::integer FROM columns)
            AS column_count,
          (
            SELECT pg_catalog.count(*)::integer
            FROM columns
            CROSS JOIN privilege_kinds
            WHERE pg_catalog.has_column_privilege(
              $1,
              columns.attrelid,
              columns.attnum,
              privilege_kinds.privilege_type
            )
          ) AS effective_count,
          (
            SELECT pg_catalog.count(*)::integer
            FROM columns
            CROSS JOIN LATERAL pg_catalog.aclexplode(
              columns.attacl
            ) AS column_acl
            CROSS JOIN pg_catalog.pg_roles AS target_role
            WHERE target_role.rolname = $1
              AND column_acl.grantee = target_role.oid
          ) AS direct_target_count,
          (
            SELECT pg_catalog.count(*)::integer
            FROM columns
            CROSS JOIN LATERAL pg_catalog.aclexplode(
              columns.attacl
            ) AS column_acl
            WHERE column_acl.grantee = 0
          ) AS direct_public_count
      `,
      roleName,
      entry.catalogName,
    );
    assert.equal(
      Number(row?.column_count ?? -1),
      entry.columns.length,
      `${entry.key} exact column manifest`,
    );
    totals.columns += Number(row.column_count);
    totals.effective += Number(row.effective_count);
    totals.directTarget += Number(row.direct_target_count);
    totals.directPublic += Number(row.direct_public_count);
  }
  return totals;
}

async function inspectRuntimeInstanceAnchorPersistence(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `
      SELECT relation.relpersistence::text AS persistence
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'SharedBetaRuntimeInstanceAnchor'
        AND relation.relkind = 'r'
    `,
  );
  return typeof row?.persistence === "string" ? row.persistence : null;
}

async function inspectSealedTypePrivileges(admin, roleName) {
  const totals = {
    types: 0,
    effectiveTarget: 0,
    directTarget: 0,
    directPublic: 0,
  };
  for (const entry of SEALED_RUNTIME_TYPES) {
    const [row] = await admin.$queryRawUnsafe(
      `
        WITH type_object AS (
          SELECT
            catalog_type.oid,
            catalog_type.typowner,
            catalog_type.typacl
          FROM pg_catalog.pg_type AS catalog_type
          WHERE catalog_type.oid = pg_catalog.to_regtype($2)
        )
        SELECT
          (SELECT pg_catalog.count(*)::integer FROM type_object)
            AS type_count,
          pg_catalog.has_type_privilege(
            $1,
            pg_catalog.to_regtype($2),
            'USAGE'
          )::integer AS effective_target_count,
          COALESCE(
            (
              SELECT pg_catalog.count(*)::integer
              FROM type_object
              CROSS JOIN LATERAL pg_catalog.aclexplode(
                COALESCE(
                  type_object.typacl,
                  pg_catalog.acldefault('T', type_object.typowner)
                )
              ) AS type_acl
              CROSS JOIN pg_catalog.pg_roles AS target_role
              WHERE target_role.rolname = $1
                AND type_acl.grantee = target_role.oid
                AND type_acl.privilege_type = 'USAGE'
            ),
            0
          ) AS direct_target_count,
          COALESCE(
            (
              SELECT pg_catalog.count(*)::integer
              FROM type_object
              CROSS JOIN LATERAL pg_catalog.aclexplode(
                COALESCE(
                  type_object.typacl,
                  pg_catalog.acldefault('T', type_object.typowner)
                )
              ) AS type_acl
              WHERE type_acl.grantee = 0
                AND type_acl.privilege_type = 'USAGE'
            ),
            0
          ) AS direct_public_count
      `,
      roleName,
      entry.catalogName,
    );
    assert.equal(Number(row?.type_count ?? -1), 1, entry.key);
    totals.types += Number(row.type_count);
    totals.effectiveTarget += Number(row.effective_target_count);
    totals.directTarget += Number(row.direct_target_count);
    totals.directPublic += Number(row.direct_public_count);
  }
  return totals;
}

async function runSmoke() {
  assert.notEqual(
    process.env.NODE_ENV,
    "production",
    "Runtime function enrollment smoke is prohibited in production.",
  );
  assert.equal(
    process.env.RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM,
    REQUIRED_CONFIRMATION,
    `Set RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );

  const rawDatabaseUrl = process.env.DATABASE_URL;
  const { databaseName, parsed } = parseSafeSmokeDatabaseUrl(rawDatabaseUrl);
  const suffix = randomBytes(8).toString("hex");
  const roleName = `${ROLE_PREFIX}${suffix}`;
  const password = randomBytes(32).toString("hex");
  const role = quoteIdentifier(roleName);
  const admin = new PrismaClient({ log: [] });
  let runtime = null;
  let roleCreated = false;
  let publicDriftGranted = false;

  try {
    const [server] = await admin.$queryRaw`
      SELECT
        current_database() AS database_name,
        current_setting('server_version_num')::integer
          AS server_version_number,
        (
          SELECT rolsuper
          FROM pg_roles
          WHERE rolname = CURRENT_USER
        ) AS is_superuser
    `;
    assert.equal(server.database_name, databaseName);
    assert.equal(Math.floor(server.server_version_number / 10_000), 16);
    assert.equal(
      server.is_superuser,
      true,
      "Disposable smoke requires the CI administrative identity.",
    );

    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    roleCreated = true;
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${role}`,
    );
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    for (const entry of SEALED_RUNTIME_TABLES) {
      await admin.$executeRawUnsafe(
        `GRANT ALL PRIVILEGES ON TABLE ${entry.grantName} TO ${role}`,
      );
    }
    await admin.$executeRawUnsafe(
      `GRANT SELECT ("emailCanonical"), UPDATE ("revision") ON TABLE public."IdentityEmailClaim" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT UPDATE ("status") ON TABLE public."IdentityMailOutbox" TO ${role}`,
    );
    publicDriftGranted = true;
    await admin.$executeRawUnsafe(
      'GRANT SELECT ON TABLE public."IdentityOwnerInviteIssueCommand" TO PUBLIC',
    );
    await admin.$executeRawUnsafe(
      'GRANT SELECT ("requestId") ON TABLE public."IdentityOwnerInviteIssueCommand" TO PUBLIC',
    );
    await admin.$executeRawUnsafe(
      'GRANT UPDATE ("status") ON TABLE public."IdentityMailOutbox" TO PUBLIC',
    );
    for (const entry of SEALED_RUNTIME_TYPES) {
      await admin.$executeRawUnsafe(
        `GRANT USAGE ON TYPE ${entry.grantName} TO ${role}`,
      );
      await admin.$executeRawUnsafe(
        `GRANT USAGE ON TYPE ${entry.grantName} TO PUBLIC`,
      );
    }

    const preEnrollmentColumnAcl = await inspectSealedColumnPrivileges(
      admin,
      roleName,
    );
    assert.equal(preEnrollmentColumnAcl.columns, 291);
    assert.ok(preEnrollmentColumnAcl.effective > 0);
    assert.ok(preEnrollmentColumnAcl.directTarget >= 3);
    assert.ok(preEnrollmentColumnAcl.directPublic >= 2);
    assert.equal(await inspectRuntimeInstanceAnchorPersistence(admin), "u");
    assert.deepEqual(await inspectSealedTypePrivileges(admin, roleName), {
      types: 2,
      effectiveTarget: 2,
      directTarget: 2,
      directPublic: 2,
    });

    const runtimeUrl = runtimeDatabaseUrl(parsed, roleName, password);
    runtime = new PrismaClient({
      datasources: { db: { url: runtimeUrl } },
      log: [],
    });

    for (const entry of APPLICATION_RUNTIME_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_WORKER_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_PENDING_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_ADMISSION_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_RUNTIME_RELEASE_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    const preEnrollmentClaims = await selectIdentityClaimTable(runtime);
    assert.equal(preEnrollmentClaims.length, 1);
    const preEnrollmentCommands =
      await selectIdentityOwnerInviteCommandTable(runtime);
    assert.equal(preEnrollmentCommands.length, 1);
    const preEnrollmentOutbox = await selectIdentityMailOutboxTable(runtime);
    assert.equal(preEnrollmentOutbox.length, 1);
    for (const entry of EXCLUDED_WORKER_FUNCTIONS) {
      await admin.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      );
    }
    for (const entry of EXCLUDED_PENDING_FUNCTIONS) {
      await admin.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      );
    }
    for (const entry of EXCLUDED_ADMISSION_FUNCTIONS) {
      await admin.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      );
    }
    for (const entry of EXCLUDED_RUNTIME_RELEASE_FUNCTIONS) {
      await admin.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      );
    }

    const cliEnvironment = {
      DATABASE_URL: rawDatabaseUrl,
      RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: databaseName,
      RUNTIME_FUNCTION_ENROLLMENT_ROLE: roleName,
    };
    const beforeCheck = runCli("check", cliEnvironment);
    assert.notEqual(beforeCheck.status, 0);
    assert.match(beforeCheck.stderr, /RUNTIME_FUNCTION_ENROLLMENT_DRIFT/u);
    assertNoSecretLeak(beforeCheck, [rawDatabaseUrl, password]);

    const apply = runCli("apply", {
      ...cliEnvironment,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        databaseName,
        roleName,
      ),
    });
    const applyReceipt = parseCliReceipt(apply);
    assert.equal(applyReceipt.decision, "ENROLLED");
    assert.equal(applyReceipt.changed, true);
    assert.equal(
      applyReceipt.postconditions.applicationExecuteCount,
      APPLICATION_RUNTIME_FUNCTIONS.length,
    );
    assert.equal(applyReceipt.postconditions.excludedWorkerExecuteCount, 0);
    assert.equal(applyReceipt.postconditions.excludedPendingExecuteCount, 0);
    assert.equal(applyReceipt.postconditions.excludedAdmissionExecuteCount, 0);
    assert.equal(
      applyReceipt.postconditions.excludedRuntimeReleaseExecuteCount,
      0,
    );
    assert.equal(
      applyReceipt.postconditions.sealedTableWithoutRuntimePrivilegesCount,
      14,
    );
    assert.equal(
      applyReceipt.postconditions.sealedPublicTablePrivilegeCount,
      0,
    );
    assert.equal(applyReceipt.postconditions.sealedColumnCount, 291);
    assert.equal(
      applyReceipt.postconditions.sealedColumnWithoutRuntimePrivilegesCount,
      291,
    );
    assert.equal(
      applyReceipt.postconditions.sealedEffectiveColumnPrivilegeCount,
      0,
    );
    assert.equal(
      applyReceipt.postconditions.sealedDirectColumnPrivilegeCount,
      0,
    );
    assert.equal(
      applyReceipt.postconditions.sealedPublicColumnPrivilegeCount,
      0,
    );
    assert.equal(
      applyReceipt.postconditions.sealedTypeWithoutRuntimeUsageCount,
      2,
    );
    assert.equal(applyReceipt.postconditions.sealedPublicTypeUsageCount, 0);
    assertNoSecretLeak(apply, [rawDatabaseUrl, password]);
    const postEnrollmentColumnAcl = await inspectSealedColumnPrivileges(
      admin,
      roleName,
    );
    assert.deepEqual(postEnrollmentColumnAcl, {
      columns: 291,
      effective: 0,
      directTarget: 0,
      directPublic: 0,
    });
    assert.deepEqual(await inspectSealedTypePrivileges(admin, roleName), {
      types: 2,
      effectiveTarget: 0,
      directTarget: 0,
      directPublic: 0,
    });

    const transitionKey = await callTransitionKey(runtime);
    assert.match(transitionKey, /^v1:[0-9a-f]{64}$/u);
    await expectSqlState(
      "22023",
      () => callRewardDeliveryLock(runtime),
      /requires tenant and reward identifiers/iu,
    );
    await expectSqlState(
      "42501",
      () => callWorkerEventBoundary(runtime),
      /guest_game_delivery_record_event_v1/u,
    );
    await expectSqlState(
      "42501",
      () => callPendingIdentityBoundary(runtime),
      /identity_email_claim_lock_v1/u,
    );
    await expectSqlState(
      "23503",
      () => callIdentityReserveBoundary(runtime),
      /tenant was not found/iu,
    );
    await expectSqlState(
      "23503",
      () => callIdentityAssertBoundary(runtime),
      /claim was not found/iu,
    );
    await expectSqlState(
      "23503",
      () => callIdentityLocatorBoundary(runtime),
      /locator was not found/iu,
    );
    await expectSqlState(
      "23503",
      () => callIdentityTransitionBoundary(runtime),
      /claim was not found/iu,
    );
    await expectSqlState(
      "23503",
      () => callIdentityReleaseBoundary(runtime),
      /claim was not found/iu,
    );
    const sentAssertionRows = await callExcludedFunctionBoundary(
      runtime,
      APPLICATION_RUNTIME_FUNCTIONS.find(
        (entry) => entry.key === "identityInitialOwnerInviteDeliveryAssertSent",
      ),
    );
    assert.equal(Object.values(sentAssertionRows[0])[0], false);
    await expectSqlState(
      "42501",
      () => callIdentityOwnerInviteHoldBoundary(runtime),
      /identity_owner_invite_issue_hold_v1/u,
    );
    for (const entry of EXCLUDED_WORKER_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_PENDING_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_ADMISSION_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of EXCLUDED_RUNTIME_RELEASE_FUNCTIONS) {
      await expectSqlState(
        "42501",
        () => callExcludedFunctionBoundary(runtime, entry),
        functionNamePattern(entry),
      );
    }
    for (const entry of SEALED_RUNTIME_TABLES) {
      await expectSqlState(
        "42501",
        () => selectSealedTable(runtime, entry),
        tableNamePattern(entry),
      );
    }
    await expectSqlState(
      "42501",
      () => insertIdentityClaimTable(runtime),
      /IdentityEmailClaim/u,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ("emailCanonical") ON TABLE public."IdentityEmailClaim" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      'GRANT UPDATE ("status") ON TABLE public."IdentityMailOutbox" TO PUBLIC',
    );
    const isolatedColumnDrift = await inspectSealedColumnPrivileges(
      admin,
      roleName,
    );
    assert.equal(isolatedColumnDrift.columns, 291);
    assert.equal(isolatedColumnDrift.directTarget, 1);
    assert.equal(isolatedColumnDrift.directPublic, 1);
    assert.equal(isolatedColumnDrift.effective, 2);

    const columnDriftCheck = runCli("check", cliEnvironment);
    assert.notEqual(columnDriftCheck.status, 0);
    assert.match(
      columnDriftCheck.stderr,
      /EFFECTIVE_COLUMN_PRIVILEGE_PRESENT/u,
    );
    assert.match(columnDriftCheck.stderr, /PUBLIC_COLUMN_PRIVILEGE_PRESENT/u);
    assertNoSecretLeak(columnDriftCheck, [rawDatabaseUrl, password]);

    const columnRemediation = runCli("apply", {
      ...cliEnvironment,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        databaseName,
        roleName,
      ),
    });
    const columnRemediationReceipt = parseCliReceipt(columnRemediation);
    assert.equal(columnRemediationReceipt.decision, "ENROLLED");
    assert.equal(columnRemediationReceipt.changed, true);
    assert.equal(
      columnRemediationReceipt.postconditions
        .sealedEffectiveColumnPrivilegeCount,
      0,
    );
    assert.equal(
      columnRemediationReceipt.postconditions.sealedDirectColumnPrivilegeCount,
      0,
    );
    assert.equal(
      columnRemediationReceipt.postconditions.sealedPublicColumnPrivilegeCount,
      0,
    );
    assert.deepEqual(await inspectSealedColumnPrivileges(admin, roleName), {
      columns: 291,
      effective: 0,
      directTarget: 0,
      directPublic: 0,
    });
    assertNoSecretLeak(columnRemediation, [rawDatabaseUrl, password]);

    const replay = runCli("apply", {
      ...cliEnvironment,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        databaseName,
        roleName,
      ),
    });
    const replayReceipt = parseCliReceipt(replay);
    assert.equal(replayReceipt.decision, "ALREADY_ENROLLED");
    assert.equal(replayReceipt.changed, false);
    assertNoSecretLeak(replay, [rawDatabaseUrl, password]);

    const afterCheck = runCli("check", cliEnvironment);
    const checkReceipt = parseCliReceipt(afterCheck);
    assert.equal(checkReceipt.decision, "COMPLIANT");
    assert.equal(checkReceipt.changed, false);
    assert.equal(
      checkReceipt.applicationFunctions.length,
      APPLICATION_RUNTIME_FUNCTIONS.length,
    );
    assert.equal(
      checkReceipt.excludedWorkerFunctions.length,
      EXCLUDED_WORKER_FUNCTIONS.length,
    );
    assert.equal(
      checkReceipt.excludedPendingFunctions.length,
      EXCLUDED_PENDING_FUNCTIONS.length,
    );
    assert.equal(
      checkReceipt.excludedAdmissionFunctions.length,
      EXCLUDED_ADMISSION_FUNCTIONS.length,
    );
    assert.equal(
      checkReceipt.excludedRuntimeReleaseFunctions.length,
      EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
    );
    assert.equal(checkReceipt.postconditions.sealedColumnCount, 291);
    assert.equal(
      checkReceipt.postconditions.sealedEffectiveColumnPrivilegeCount,
      0,
    );
    assert.equal(
      checkReceipt.postconditions.sealedDirectColumnPrivilegeCount,
      0,
    );
    assert.equal(
      checkReceipt.postconditions.sealedPublicColumnPrivilegeCount,
      0,
    );
    assert.equal(
      checkReceipt.postconditions.sealedTypeWithoutRuntimeUsageCount,
      2,
    );
    assert.equal(checkReceipt.postconditions.sealedPublicTypeUsageCount, 0);
    assertNoSecretLeak(afterCheck, [rawDatabaseUrl, password]);

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        schemaVersion: 1,
        database: databaseName,
        preEnrollmentPermissionDenials:
          APPLICATION_RUNTIME_FUNCTIONS.length +
          EXCLUDED_WORKER_FUNCTIONS.length +
          EXCLUDED_PENDING_FUNCTIONS.length +
          EXCLUDED_ADMISSION_FUNCTIONS.length +
          EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
        applicationFunctionGrants: APPLICATION_RUNTIME_FUNCTIONS.length,
        excludedWorkerFunctionGrants: 0,
        excludedWorkerFunctionsDenied: EXCLUDED_WORKER_FUNCTIONS.length,
        excludedPendingFunctionGrants: 0,
        excludedPendingFunctionsDenied: EXCLUDED_PENDING_FUNCTIONS.length,
        excludedAdmissionFunctionGrants: 0,
        excludedAdmissionFunctionsDenied: EXCLUDED_ADMISSION_FUNCTIONS.length,
        excludedRuntimeReleaseFunctionGrants: 0,
        excludedRuntimeReleaseFunctionsDenied:
          EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
        sealedTablePrivileges: 0,
        sealedPublicTablePrivileges: 0,
        sealedColumnPrivileges: 0,
        sealedDirectColumnPrivileges: 0,
        sealedPublicColumnPrivileges: 0,
        sealedColumns: 291,
        sealedTables: 14,
        sealedTypeRuntimeUsage: 0,
        sealedPublicTypeUsage: 0,
        sealedTypes: 2,
        isolatedColumnDriftDetected: true,
        isolatedColumnDriftRemediated: true,
        idempotentReplay: true,
        postEnrollmentCheck: "COMPLIANT",
      })}\n`,
    );
  } finally {
    let cleanupError = null;
    if (runtime) {
      await runtime.$disconnect().catch((error) => {
        cleanupError ??= error;
      });
    }
    if (publicDriftGranted) {
      for (const entry of SEALED_RUNTIME_TABLES) {
        await admin
          .$executeRawUnsafe(
            `REVOKE ALL PRIVILEGES ON TABLE ${entry.grantName} FROM PUBLIC`,
          )
          .catch((error) => {
            cleanupError ??= error;
          });
        await admin
          .$executeRawUnsafe(
            `REVOKE ALL PRIVILEGES (${exactColumnList(entry)}) ON TABLE ${entry.grantName} FROM PUBLIC`,
          )
          .catch((error) => {
            cleanupError ??= error;
          });
      }
      for (const entry of SEALED_RUNTIME_TYPES) {
        await admin
          .$executeRawUnsafe(
            `REVOKE ALL PRIVILEGES ON TYPE ${entry.grantName} FROM PUBLIC`,
          )
          .catch((error) => {
            cleanupError ??= error;
          });
      }
    }
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
}

function runSelfTest() {
  const safe = parseSafeSmokeDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  assert.throws(
    () =>
      parseSafeSmokeDatabaseUrl(
        "postgresql://postgres:test@db.internal:5432/leetplus_ci?schema=public",
      ),
    /loopback/u,
  );
  assert.throws(
    () =>
      parseSafeSmokeDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
      ),
    /dedicated \*_ci/u,
  );
  assert.equal(
    escapeRegExp("postgresql://user:p[a]ss"),
    "postgresql://user:p\\[a\\]ss",
  );
  assert.equal(
    sanitizeErrorText("CREATE ROLE test PASSWORD 'secret-value'"),
    "CREATE ROLE test PASSWORD '<redacted>'",
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      decision: "SELF_TEST_PASSED",
    })}\n`,
  );
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(HELP);
} else if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest();
} else if (args.length === 0) {
  runSmoke().catch((error) => {
    process.stderr.write(`${sanitizeErrorText(extractErrorText(error))}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write("Use --help, --self-test, or no arguments.\n");
  process.exitCode = 1;
}
