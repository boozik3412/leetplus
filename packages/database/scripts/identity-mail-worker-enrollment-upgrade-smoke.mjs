import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  IDENTITY_MAIL_WORKER_FUNCTIONS,
  expectedIdentityMailWorkerEnrollmentConfirmation,
  quoteIdentifier,
} from "./identity-mail-worker-enrollment.mjs";

const REQUIRED_CONFIRMATION =
  "run-identity-mail-worker-enrollment-upgrade-smoke";
const ROLE_PREFIX = "lp_imw_";
const SCHEMA_PREFIX = "lp_imw_fixture_";
const CLI_PATH = fileURLToPath(
  new URL("./identity-mail-worker-enrollment.cli.mjs", import.meta.url),
);

const HELP = `LeetPlus identity-mail worker enrollment PostgreSQL upgrade smoke

Usage:
  node scripts/identity-mail-worker-enrollment-upgrade-smoke.mjs
  node scripts/identity-mail-worker-enrollment-upgrade-smoke.mjs --self-test
  node scripts/identity-mail-worker-enrollment-upgrade-smoke.mjs --help

Required environment:
  NODE_ENV=test
  DATABASE_URL=<loopback PostgreSQL 16 dedicated *_ci database at CURRENT_179>
  IDENTITY_MAIL_WORKER_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}

The smoke creates one disposable LOGIN NOINHERIT role and one disposable
fixture schema. The enrollment command itself must not create either. It
injects table/column/sequence/schema/function ACL drift, applies the exact
five-RPC enrollment, verifies denied direct data access and empty tenant
enrollment, then removes all generated objects.

No SMTP, production root, route, tenant, invite or provider call is used.
`;

function parseSafeDatabaseUrl(raw) {
  assert.equal(typeof raw, "string", "DATABASE_URL is required.");
  const parsed = new URL(raw);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "Smoke requires PostgreSQL.",
  );
  assert.ok(
    parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]",
    "Smoke requires loopback PostgreSQL.",
  );
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/u,
    "Smoke requires a dedicated *_ci database.",
  );
  assert.deepEqual([...parsed.searchParams.keys()], ["schema"]);
  assert.equal(parsed.searchParams.get("schema"), "public");
  assert.equal(parsed.hash, "");
  return { parsed, databaseName };
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function workerUrl(parsed, roleName, password) {
  const target = new URL(parsed);
  target.username = roleName;
  target.password = password;
  return target.toString();
}

function sanitize(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/PASSWORD\s+'[^']*'/giu, "PASSWORD '<redacted>'");
}

function cliEnvironment(rawDatabaseUrl, databaseName, roleName, roleOid) {
  return {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: rawDatabaseUrl,
    IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE: databaseName,
    IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: roleName,
    IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: String(roleOid),
  };
}

function runCli(args, environment) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  });
}

function parseReceipt(result) {
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, sanitize(result.stderr));
  assert.equal(result.stderr, "");
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, true);
  return receipt;
}

function extractSqlState(error) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.meta?.code === "string"
  ) {
    return error.meta.code;
  }
  if (error && typeof error === "object" && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

async function expectSqlState(expected, operation, pattern) {
  await assert.rejects(operation, (error) => {
    assert.equal(extractSqlState(error), expected, sanitize(error));
    if (pattern) assert.match(sanitize(error), pattern);
    return true;
  });
}

async function inspectRoleAcl(admin, roleName) {
  const [row] = await admin.$queryRawUnsafe(
    `
      SELECT
        worker.oid::BIGINT AS role_oid,
        worker.rolcanlogin,
        worker.rolinherit,
        pg_catalog.has_schema_privilege(
          worker.rolname,
          'public',
          'USAGE'
        ) AS public_usage,
        pg_catalog.has_schema_privilege(
          worker.rolname,
          'public',
          'CREATE'
        ) AS public_create,
        pg_catalog.has_database_privilege(
          worker.rolname,
          pg_catalog.current_database(),
          'CREATE'
        ) AS database_create,
        pg_catalog.has_database_privilege(
          worker.rolname,
          pg_catalog.current_database(),
          'TEMPORARY'
        ) AS database_temporary,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS relation_grants,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_attribute AS attribute
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
        ) AS column_grants,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND privilege.privilege_type = 'EXECUTE'
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS function_grants,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."IdentityMailDeliveryTenantEnrollment"
        ) AS enrollment_rows
      FROM pg_catalog.pg_roles AS worker
      WHERE worker.rolname = $1
    `,
    roleName,
  );
  assert.ok(row);
  return {
    roleOid: row.role_oid,
    canLogin: row.rolcanlogin === true,
    inherits: row.rolinherit === true,
    publicUsage: row.public_usage === true,
    publicCreate: row.public_create === true,
    databaseCreate: row.database_create === true,
    databaseTemporary: row.database_temporary === true,
    relationGrants: Number(row.relation_grants),
    columnGrants: Number(row.column_grants),
    functionGrants: Number(row.function_grants),
    enrollmentRows: Number(row.enrollment_rows),
  };
}

async function inspectFunctionAcl(admin, roleName) {
  const rows = [];
  for (const entry of [
    ...IDENTITY_MAIL_WORKER_FUNCTIONS,
    ...IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  ]) {
    const [row] = await admin.$queryRawUnsafe(
      `
        SELECT
          pg_catalog.has_function_privilege(
            $1,
            pg_catalog.to_regprocedure($2),
            'EXECUTE'
          ) AS worker_execute,
          COALESCE((
            SELECT true
            FROM pg_catalog.pg_proc AS routine
            CROSS JOIN LATERAL pg_catalog.aclexplode(
              COALESCE(
                routine.proacl,
                pg_catalog.acldefault('f', routine.proowner)
              )
            ) AS privilege
            WHERE routine.oid = pg_catalog.to_regprocedure($2)
              AND privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
            LIMIT 1
          ), false) AS public_execute
      `,
      roleName,
      entry.catalogSignature,
    );
    rows.push({
      key: entry.key,
      workerExecute: row?.worker_execute === true,
      publicExecute: row?.public_execute === true,
    });
  }
  return rows;
}

async function runSmoke() {
  assert.equal(process.env.NODE_ENV, "test", "Smoke requires NODE_ENV=test.");
  assert.equal(
    process.env.IDENTITY_MAIL_WORKER_ENROLLMENT_SMOKE_CONFIRM,
    REQUIRED_CONFIRMATION,
    `Set IDENTITY_MAIL_WORKER_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );
  const rawDatabaseUrl = process.env.DATABASE_URL;
  const { parsed, databaseName } = parseSafeDatabaseUrl(rawDatabaseUrl);
  const suffix = randomBytes(8).toString("hex");
  const roleName = `${ROLE_PREFIX}${suffix}`;
  const fixtureSchema = `${SCHEMA_PREFIX}${suffix}`;
  const role = quoteIdentifier(roleName);
  const schema = quoteIdentifier(fixtureSchema);
  const password = randomBytes(32).toString("hex");
  const admin = new PrismaClient({ log: [] });
  let worker = null;
  let roleCreated = false;
  let schemaCreated = false;
  let publicDriftGranted = false;
  let databasePublicAuthorityGranted = false;
  let databaseRoleAuthorityGranted = false;

  try {
    const [server] = await admin.$queryRaw`
      SELECT
        pg_catalog.current_database() AS database_name,
        pg_catalog.current_setting('server_version_num')::INTEGER
          AS server_version_number,
        database_owner.rolname = CURRENT_USER AS current_is_database_owner
      FROM pg_catalog.pg_database AS database
      INNER JOIN pg_catalog.pg_roles AS database_owner
        ON database_owner.oid = database.datdba
      WHERE database.datname = pg_catalog.current_database()
    `;
    assert.equal(server.database_name, databaseName);
    assert.equal(Math.floor(server.server_version_number / 10_000), 16);
    assert.equal(server.current_is_database_owner, true);

    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(password)} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    roleCreated = true;
    const [createdRole] = await admin.$queryRawUnsafe(
      `SELECT oid::BIGINT AS oid FROM pg_catalog.pg_roles WHERE rolname = $1`,
      roleName,
    );
    assert.ok(createdRole?.oid);
    const roleOid = createdRole.oid;

    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${role}`,
    );
    const environment = cliEnvironment(
      rawDatabaseUrl,
      databaseName,
      roleName,
      roleOid,
    );

    await admin.$executeRawUnsafe(
      `GRANT CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
        databaseName,
      )} TO PUBLIC`,
    );
    databasePublicAuthorityGranted = true;
    const hostilePublicAuthority = runCli(["--check"], environment);
    assert.notEqual(hostilePublicAuthority.status, 0);
    assert.match(
      hostilePublicAuthority.stderr,
      /IDENTITY_MAIL_WORKER_ENROLLMENT_PRECONDITION_FAILED/u,
    );
    assert.match(hostilePublicAuthority.stderr, /DATABASE_CREATE_PRESENT/u);
    assert.match(
      hostilePublicAuthority.stderr,
      /DATABASE_TEMPORARY_PRESENT/u,
    );
    await admin.$executeRawUnsafe(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
        databaseName,
      )} FROM PUBLIC`,
    );
    databasePublicAuthorityGranted = false;

    await admin.$executeRawUnsafe(
      `GRANT CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
        databaseName,
      )} TO ${role}`,
    );
    databaseRoleAuthorityGranted = true;
    const hostileDirectAuthority = runCli(["--check"], environment);
    assert.notEqual(hostileDirectAuthority.status, 0);
    assert.match(
      hostileDirectAuthority.stderr,
      /IDENTITY_MAIL_WORKER_ENROLLMENT_PRECONDITION_FAILED/u,
    );
    assert.match(hostileDirectAuthority.stderr, /DATABASE_CREATE_PRESENT/u);
    assert.match(
      hostileDirectAuthority.stderr,
      /DATABASE_TEMPORARY_PRESENT/u,
    );
    await admin.$executeRawUnsafe(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
        databaseName,
      )} FROM ${role}`,
    );
    databaseRoleAuthorityGranted = false;

    await admin.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    await admin.$executeRawUnsafe(
      `CREATE TABLE ${schema}."probe" ("id" INTEGER NOT NULL, "payload" TEXT)`,
    );
    await admin.$executeRawUnsafe(`CREATE SEQUENCE ${schema}."probe_seq"`);
    await admin.$executeRawUnsafe(
      `CREATE FUNCTION ${schema}."probe_function"() RETURNS INTEGER LANGUAGE sql AS 'SELECT 1'`,
    );
    await admin.$executeRawUnsafe(
      `REVOKE EXECUTE ON FUNCTION ${schema}."probe_function"() FROM PUBLIC`,
    );
    await admin.$executeRawUnsafe(
      `GRANT CREATE ON SCHEMA ${schema} TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON TABLE ${schema}."probe" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT UPDATE ("payload") ON TABLE ${schema}."probe" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SEQUENCE ${schema}."probe_seq" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${schema}."probe_function"() TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS[7].grantSignature} TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${IDENTITY_MAIL_WORKER_FUNCTIONS[0].grantSignature} TO PUBLIC`,
    );
    publicDriftGranted = true;

    const before = runCli(["--check"], environment);
    assert.notEqual(before.status, 0);
    assert.match(before.stderr, /IDENTITY_MAIL_WORKER_ENROLLMENT_DRIFT/u);
    assert.doesNotMatch(before.stderr, new RegExp(password, "u"));
    assert.doesNotMatch(before.stderr, /postgres(?:ql)?:\/\//iu);

    const apply = parseReceipt(
      runCli(["--apply"], {
        ...environment,
        IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM:
          expectedIdentityMailWorkerEnrollmentConfirmation(
            databaseName,
            roleName,
            roleOid,
          ),
      }),
    );
    assert.equal(apply.decision, "ENROLLED");
    assert.equal(apply.transportPolicy, "LOOPBACK_PLAINTEXT");
    assert.deepEqual(apply.transportEvidence, {
      tlsActive: false,
      tlsVersion: null,
      tlsCipher: null,
    });
    assert.equal(apply.workerRpcCount, 5);
    assert.equal(apply.deniedDeliveryRpcCount, 9);
    assert.equal(apply.tenantEnrollmentCount, 0);
    assert.equal(apply.directRelationPrivilegeCount, 0);
    assert.equal(apply.directColumnPrivilegeCount, 0);
    assert.equal(apply.directSequencePrivilegeCount, 0);
    assert.equal(apply.databaseCreatePrivilege, false);
    assert.equal(apply.databaseTemporaryPrivilege, false);

    const check = parseReceipt(runCli(["--check"], environment));
    assert.equal(check.decision, "COMPLIANT");
    assert.equal(check.changed, false);

    const acl = await inspectRoleAcl(admin, roleName);
    assert.equal(acl.roleOid, roleOid);
    assert.equal(acl.canLogin, true);
    assert.equal(acl.inherits, false);
    assert.equal(acl.publicUsage, true);
    assert.equal(acl.publicCreate, false);
    assert.equal(acl.databaseCreate, false);
    assert.equal(acl.databaseTemporary, false);
    assert.equal(acl.relationGrants, 0);
    assert.equal(acl.columnGrants, 0);
    assert.equal(acl.functionGrants, 5);
    assert.equal(acl.enrollmentRows, 0);

    const functionAcl = await inspectFunctionAcl(admin, roleName);
    assert.deepEqual(
      functionAcl.slice(0, 5).map(({ workerExecute }) => workerExecute),
      [true, true, true, true, true],
    );
    assert.deepEqual(
      functionAcl.slice(5).map(({ workerExecute }) => workerExecute),
      Array(9).fill(false),
    );
    assert.deepEqual(
      functionAcl.map(({ publicExecute }) => publicExecute),
      Array(14).fill(false),
    );

    worker = new PrismaClient({
      datasources: { db: { url: workerUrl(parsed, roleName, password) } },
      log: [],
    });
    await expectSqlState(
      "42501",
      () =>
        worker.$executeRawUnsafe(
          `CREATE TEMP TABLE "identity_mail_worker_temp_probe" ("id" INTEGER)`,
        ),
    );
    await expectSqlState(
      "42501",
      () => worker.$queryRawUnsafe(`SELECT * FROM ${schema}."probe"`),
    );
    await expectSqlState(
      "42501",
      () =>
        worker.$queryRawUnsafe(
          `SELECT public."identity_mail_delivery_worker_assert_v1"($1)`,
          "00000000-0000-4000-8000-000000000000",
        ),
      /not enrolled for tenant/iu,
    );
    await expectSqlState(
      "42501",
      () =>
        worker.$queryRawUnsafe(
          `SELECT public."identity_initial_owner_mail_claim_v1"($1, $2, $3, $4)`,
          "00000000-0000-4000-8000-000000000000",
          "a".repeat(64),
          "b".repeat(64),
          "c".repeat(64),
        ),
      /not enrolled for tenant/iu,
    );
    await expectSqlState(
      "22023",
      () =>
        worker.$queryRawUnsafe(
          `SELECT public."identity_initial_owner_mail_reap_v1"(
             $1::TEXT,
             $2::TEXT,
             $3::TEXT,
             $4::INTEGER
           )`,
          "00000000-0000-4000-8000-000000000000",
          "c".repeat(64),
          "d".repeat(64),
          0,
        ),
      /input is invalid/iu,
    );

    const replay = parseReceipt(
      runCli(["--apply"], {
        ...environment,
        IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM:
          expectedIdentityMailWorkerEnrollmentConfirmation(
            databaseName,
            roleName,
            roleOid,
          ),
      }),
    );
    assert.equal(replay.decision, "ALREADY_ENROLLED");
    assert.equal(replay.changed, false);

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        decision: "SMOKE_PASSED",
        migrationCount: 179,
        workerRpcGrants: 5,
        deniedDeliveryRoutines: 9,
        tenantEnrollmentRows: 0,
        hostileDatabaseAuthorityCases: 2,
        databaseCreatePrivilege: acl.databaseCreate,
        databaseTemporaryPrivilege: acl.databaseTemporary,
        tempTableDeniedSqlState: "42501",
        directRelationPrivileges: 0,
        directColumnPrivileges: 0,
        directSequencePrivileges: 0,
        idempotentReplay: true,
        smtpCalls: 0,
      })}\n`,
    );
  } finally {
    let cleanupError = null;
    if (worker) {
      await worker.$disconnect().catch((error) => {
        cleanupError ??= error;
      });
    }
    if (publicDriftGranted) {
      await admin
        .$executeRawUnsafe(
          `REVOKE ALL PRIVILEGES ON FUNCTION ${IDENTITY_MAIL_WORKER_FUNCTIONS[0].grantSignature} FROM PUBLIC`,
        )
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    if (databaseRoleAuthorityGranted) {
      await admin
        .$executeRawUnsafe(
          `REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
            databaseName,
          )} FROM ${role}`,
        )
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    if (databasePublicAuthorityGranted) {
      await admin
        .$executeRawUnsafe(
          `REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
            databaseName,
          )} FROM PUBLIC`,
        )
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    if (roleCreated) {
      await admin.$executeRawUnsafe(`DROP OWNED BY ${role}`).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (schemaCreated) {
      await admin
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    if (roleCreated) {
      await admin
        .$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`)
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    await admin.$disconnect().catch((error) => {
      cleanupError ??= error;
    });
    if (cleanupError) throw cleanupError;
  }
}

function runSelfTest() {
  const { databaseName } = parseSafeDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(databaseName, "leetplus_ci");
  assert.throws(
    () =>
      parseSafeDatabaseUrl(
        "postgresql://postgres:test@db.internal:5432/leetplus_ci?schema=public",
      ),
    /loopback/u,
  );
  assert.throws(
    () =>
      parseSafeDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
      ),
    /dedicated \*_ci/u,
  );
  process.stdout.write(
    `${JSON.stringify({ ok: true, decision: "SELF_TEST_PASSED" })}\n`,
  );
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(HELP);
} else if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest();
} else if (args.length === 0) {
  runSmoke().catch((error) => {
    process.stderr.write(`${sanitize(error)}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write("Use --help, --self-test, or no arguments.\n");
  process.exitCode = 1;
}
