import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const REQUIRED_CONFIRMATION = "run-design-partner-runtime-role-smoke";
const SAFE_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ROLE_PREFIX = "lp_dp_runtime_smoke_";
const TABLE_PREFIX = "__dp_runtime_role_smoke_";

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
    "Runtime-role smoke is restricted to a loopback PostgreSQL server.",
  );

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/,
    "Runtime-role smoke requires a dedicated *_ci database.",
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
    "Runtime-role smoke requires schema=public.",
  );

  return { databaseName, parsed };
}

function runtimeDatabaseUrl(sourceUrl, roleName, password) {
  const result = new URL(sourceUrl);
  result.username = roleName;
  result.password = password;
  return result.toString();
}

function sanitizedError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, "<redacted-postgresql-url>")
    .replace(/password=[^\s;]+/gi, "password=<redacted>");
}

async function expectDenied(label, operation, expectedPattern) {
  let caught = null;

  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, `${label}: PostgreSQL unexpectedly allowed the operation.`);
  assert.match(
    sanitizedError(caught),
    expectedPattern,
    `${label}: PostgreSQL rejected the operation for an unexpected reason.`,
  );
}

async function readPublicPrivilegeBaseline(prisma) {
  const [baseline] = await prisma.$queryRaw`
    SELECT
      COALESCE(
        BOOL_OR(
          database_acl.grantee = 0
          AND database_acl.privilege_type = 'CREATE'
        ),
        FALSE
      ) AS public_database_create,
      COALESCE(
        BOOL_OR(
          database_acl.grantee = 0
          AND database_acl.privilege_type = 'TEMPORARY'
        ),
        FALSE
      ) AS public_database_temporary,
      (
        SELECT COALESCE(
          BOOL_OR(
            schema_acl.grantee = 0
            AND schema_acl.privilege_type = 'CREATE'
          ),
          FALSE
        )
        FROM pg_namespace target_schema
        LEFT JOIN LATERAL aclexplode(
          COALESCE(
            target_schema.nspacl,
            acldefault('n', target_schema.nspowner)
          )
        ) schema_acl ON TRUE
        WHERE target_schema.nspname = 'public'
      ) AS public_schema_create
    FROM pg_database target_database
    LEFT JOIN LATERAL aclexplode(
      COALESCE(
        target_database.datacl,
        acldefault('d', target_database.datdba)
      )
    ) database_acl ON TRUE
    WHERE target_database.datname = current_database()
  `;

  assert.ok(baseline, "Could not read the PUBLIC privilege baseline.");
  return baseline;
}

async function restorePublicPrivilegeBaseline(prisma, databaseName, baseline) {
  const database = quoteIdentifier(databaseName);

  if (baseline.public_database_create) {
    await prisma.$executeRawUnsafe(
      `GRANT CREATE ON DATABASE ${database} TO PUBLIC`,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `REVOKE CREATE ON DATABASE ${database} FROM PUBLIC`,
    );
  }

  if (baseline.public_database_temporary) {
    await prisma.$executeRawUnsafe(
      `GRANT TEMPORARY ON DATABASE ${database} TO PUBLIC`,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    );
  }

  if (baseline.public_schema_create) {
    await prisma.$executeRawUnsafe("GRANT CREATE ON SCHEMA public TO PUBLIC");
  } else {
    await prisma.$executeRawUnsafe(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
    );
  }
}

async function assertCatalogContract(prisma, roleName, fixtureTableName) {
  const [role] = await prisma.$queryRaw`
    SELECT
      rolcanlogin,
      rolinherit,
      rolsuper,
      rolcreatedb,
      rolcreaterole,
      rolreplication,
      rolbypassrls
    FROM pg_roles
    WHERE rolname = ${roleName}
  `;

  assert.deepEqual(role, {
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  });

  const [authority] = await prisma.$queryRaw`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM pg_auth_members membership
        JOIN pg_roles target_role
          ON target_role.oid = membership.roleid
        JOIN pg_roles member_role
          ON member_role.oid = membership.member
        WHERE target_role.rolname = ${roleName}
          OR member_role.rolname = ${roleName}
      ) AS membership_count,
      (
        SELECT COUNT(*)::int
        FROM pg_database database_object
        JOIN pg_roles owner_role
          ON owner_role.oid = database_object.datdba
        WHERE owner_role.rolname = ${roleName}
      ) AS owned_database_count,
      (
        SELECT COUNT(*)::int
        FROM pg_namespace schema_object
        JOIN pg_roles owner_role
          ON owner_role.oid = schema_object.nspowner
        WHERE owner_role.rolname = ${roleName}
      ) AS owned_schema_count,
      (
        SELECT COUNT(*)::int
        FROM pg_class relation_object
        JOIN pg_roles owner_role
          ON owner_role.oid = relation_object.relowner
        WHERE owner_role.rolname = ${roleName}
      ) AS owned_relation_count,
      (
        SELECT COUNT(*)::int
        FROM pg_proc function_object
        JOIN pg_roles owner_role
          ON owner_role.oid = function_object.proowner
        WHERE owner_role.rolname = ${roleName}
      ) AS owned_function_count
  `;

  assert.deepEqual(authority, {
    membership_count: 0,
    owned_database_count: 0,
    owned_schema_count: 0,
    owned_relation_count: 0,
    owned_function_count: 0,
  });

  const [effectiveBoundary] = await prisma.$queryRaw`
    SELECT
      has_database_privilege(
        ${roleName},
        current_database(),
        'CONNECT'
      ) AS can_connect,
      has_database_privilege(
        ${roleName},
        current_database(),
        'CREATE'
      ) AS can_create_schema,
      has_database_privilege(
        ${roleName},
        current_database(),
        'TEMPORARY'
      ) AS can_create_temporary_objects,
      has_schema_privilege(
        ${roleName},
        'public',
        'USAGE'
      ) AS can_use_public,
      has_schema_privilege(
        ${roleName},
        'public',
        'CREATE'
      ) AS can_create_in_public
  `;

  assert.deepEqual(effectiveBoundary, {
    can_connect: true,
    can_create_schema: false,
    can_create_temporary_objects: false,
    can_use_public: true,
    can_create_in_public: false,
  });

  const [tableCoverage] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS application_table_count,
      BOOL_AND(
        has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'SELECT'
        )
      ) AS all_select,
      BOOL_AND(
        has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'INSERT'
        )
      ) AS all_insert,
      BOOL_AND(
        has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'UPDATE'
        )
      ) AS all_update,
      BOOL_AND(
        has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'DELETE'
        )
      ) AS all_delete,
      BOOL_OR(
        has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'TRUNCATE'
        )
        OR has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'REFERENCES'
        )
        OR has_table_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'TRIGGER'
        )
      ) AS any_excess_table_privilege
    FROM pg_class relation_object
    JOIN pg_namespace schema_object
      ON schema_object.oid = relation_object.relnamespace
    WHERE schema_object.nspname = 'public'
      AND relation_object.relkind IN ('r', 'p')
      AND relation_object.relname <> '_prisma_migrations'
  `;

  assert.ok(
    tableCoverage.application_table_count > 1,
    "Expected the migrated application schema plus the fixture table.",
  );
  assert.equal(tableCoverage.all_select, true);
  assert.equal(tableCoverage.all_insert, true);
  assert.equal(tableCoverage.all_update, true);
  assert.equal(tableCoverage.all_delete, true);
  assert.equal(tableCoverage.any_excess_table_privilege, false);

  const [migrationBoundary] = await prisma.$queryRaw`
    SELECT
      has_table_privilege(
        ${roleName},
        'public."_prisma_migrations"',
        'SELECT'
      ) AS can_read_migration_history,
      has_table_privilege(
        ${roleName},
        'public."_prisma_migrations"',
        'INSERT'
      ) AS can_insert_migration_history,
      has_table_privilege(
        ${roleName},
        'public."_prisma_migrations"',
        'UPDATE'
      ) AS can_update_migration_history,
      has_table_privilege(
        ${roleName},
        'public."_prisma_migrations"',
        'DELETE'
      ) AS can_delete_migration_history
  `;
  assert.deepEqual(migrationBoundary, {
    can_read_migration_history: true,
    can_insert_migration_history: false,
    can_update_migration_history: false,
    can_delete_migration_history: false,
  });

  const [sequenceCoverage] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS sequence_count,
      BOOL_AND(
        has_sequence_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'USAGE'
        )
      ) AS all_usage,
      BOOL_AND(
        has_sequence_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'SELECT'
        )
      ) AS all_select,
      BOOL_OR(
        has_sequence_privilege(
          ${roleName},
          FORMAT('%I.%I', schema_object.nspname, relation_object.relname),
          'UPDATE'
        )
      ) AS any_update
    FROM pg_class relation_object
    JOIN pg_namespace schema_object
      ON schema_object.oid = relation_object.relnamespace
    WHERE schema_object.nspname = 'public'
      AND relation_object.relkind = 'S'
  `;

  assert.ok(
    sequenceCoverage.sequence_count > 0,
    "Expected a fixture sequence.",
  );
  assert.equal(sequenceCoverage.all_usage, true);
  assert.equal(sequenceCoverage.all_select, true);
  assert.equal(sequenceCoverage.any_update, false);

  const [grantOptions] = await prisma.$queryRaw`
    SELECT (
      EXISTS (
        SELECT 1
        FROM pg_database database_object
        CROSS JOIN LATERAL aclexplode(
          COALESCE(
            database_object.datacl,
            acldefault('d', database_object.datdba)
          )
        ) privilege
        JOIN pg_roles grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE database_object.datname = current_database()
          AND grantee_role.rolname = ${roleName}
          AND privilege.is_grantable
      )
      OR EXISTS (
        SELECT 1
        FROM pg_namespace schema_object
        CROSS JOIN LATERAL aclexplode(
          COALESCE(
            schema_object.nspacl,
            acldefault('n', schema_object.nspowner)
          )
        ) privilege
        JOIN pg_roles grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE schema_object.nspname = 'public'
          AND grantee_role.rolname = ${roleName}
          AND privilege.is_grantable
      )
      OR EXISTS (
        SELECT 1
        FROM pg_class relation_object
        JOIN pg_namespace schema_object
          ON schema_object.oid = relation_object.relnamespace
        CROSS JOIN LATERAL aclexplode(
          COALESCE(
            relation_object.relacl,
            acldefault(
              CASE
                WHEN relation_object.relkind = 'S' THEN 'S'::"char"
                ELSE 'r'::"char"
              END,
              relation_object.relowner
            )
          )
        ) privilege
        JOIN pg_roles grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE schema_object.nspname = 'public'
          AND grantee_role.rolname = ${roleName}
          AND privilege.is_grantable
      )
      OR EXISTS (
        SELECT 1
        FROM pg_proc function_object
        JOIN pg_namespace schema_object
          ON schema_object.oid = function_object.pronamespace
        CROSS JOIN LATERAL aclexplode(
          COALESCE(
            function_object.proacl,
            acldefault('f', function_object.proowner)
          )
        ) privilege
        JOIN pg_roles grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE schema_object.nspname = 'public'
          AND grantee_role.rolname = ${roleName}
          AND privilege.is_grantable
      )
    ) AS has_any_grant_option
  `;
  assert.equal(grantOptions.has_any_grant_option, false);

  const [fixtureOwnership] = await prisma.$queryRaw`
    SELECT owner_role.rolname AS owner_name
    FROM pg_class relation_object
    JOIN pg_namespace schema_object
      ON schema_object.oid = relation_object.relnamespace
    JOIN pg_roles owner_role
      ON owner_role.oid = relation_object.relowner
    WHERE schema_object.nspname = 'public'
      AND relation_object.relname = ${fixtureTableName}
  `;
  assert.ok(fixtureOwnership);
  assert.notEqual(fixtureOwnership.owner_name, roleName);
}

async function exerciseRuntimeDml(runtime, fixtureTableName) {
  const table = `public.${quoteIdentifier(fixtureTableName)}`;
  const migrationRows = await runtime.$queryRawUnsafe(`
    SELECT
      (
        SELECT migration_name
        FROM public."_prisma_migrations"
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        ORDER BY migration_name DESC
        LIMIT 1
      ) AS migration_name,
      COUNT(*) FILTER (
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      )::int AS completed_count,
      COUNT(*) FILTER (
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL
      )::int AS unfinished_count
    FROM public."_prisma_migrations"
  `);
  assert.equal(migrationRows.length, 1);
  assert.equal(typeof migrationRows[0].migration_name, "string");
  assert.ok(migrationRows[0].completed_count > 0);
  assert.equal(migrationRows[0].unfinished_count, 0);
  const insertedRows = await runtime.$queryRawUnsafe(
    `INSERT INTO ${table} (payload) VALUES ('created') RETURNING id, payload`,
  );
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].payload, "created");

  const id = insertedRows[0].id;
  const selectedRows = await runtime.$queryRawUnsafe(
    `SELECT id, payload FROM ${table} WHERE id = $1`,
    id,
  );
  assert.equal(selectedRows.length, 1);
  assert.equal(selectedRows[0].payload, "created");

  const updatedRows = await runtime.$queryRawUnsafe(
    `UPDATE ${table} SET payload = 'updated' WHERE id = $1 RETURNING payload`,
    id,
  );
  assert.equal(updatedRows[0].payload, "updated");

  const deletedRows = await runtime.$queryRawUnsafe(
    `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
    id,
  );
  assert.equal(deletedRows.length, 1);
}

async function exerciseRuntimeDenials(runtime, fixtureTableName) {
  const table = `public.${quoteIdentifier(fixtureTableName)}`;

  await expectDenied(
    "public table CREATE",
    () =>
      runtime.$executeRawUnsafe(
        `CREATE TABLE public.${quoteIdentifier(`${fixtureTableName}_denied`)} (id int)`,
      ),
    /permission denied for schema public/i,
  );
  await expectDenied(
    "temporary table CREATE",
    () =>
      runtime.$executeRawUnsafe(
        `CREATE TEMPORARY TABLE ${quoteIdentifier(`${fixtureTableName}_temp`)} (id int)`,
      ),
    /permission denied to create temporary tables/i,
  );
  await expectDenied(
    "schema CREATE",
    () =>
      runtime.$executeRawUnsafe(
        `CREATE SCHEMA ${quoteIdentifier(`${fixtureTableName}_schema`)}`,
      ),
    /permission denied for database/i,
  );
  await expectDenied(
    "table ALTER",
    () =>
      runtime.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN denied int`),
    /must be owner of table/i,
  );
  await expectDenied(
    "table TRUNCATE",
    () => runtime.$executeRawUnsafe(`TRUNCATE TABLE ${table}`),
    /permission denied for table/i,
  );
  await expectDenied(
    "table DROP",
    () => runtime.$executeRawUnsafe(`DROP TABLE ${table}`),
    /must be owner of table/i,
  );
  await expectDenied(
    "role membership escalation",
    () => runtime.$executeRawUnsafe("SET ROLE postgres"),
    /permission denied to set role/i,
  );
  await expectDenied(
    "role CREATE",
    () =>
      runtime.$executeRawUnsafe(
        `CREATE ROLE ${quoteIdentifier(`${ROLE_PREFIX}denied`)}`,
      ),
    /permission denied to create role/i,
  );
}

async function runSmoke() {
  assert.notEqual(
    process.env.NODE_ENV,
    "production",
    "Runtime-role smoke is prohibited in production.",
  );
  assert.equal(
    process.env.DESIGN_PARTNER_RUNTIME_ROLE_SMOKE_CONFIRM,
    REQUIRED_CONFIRMATION,
    `Set DESIGN_PARTNER_RUNTIME_ROLE_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );

  const { databaseName, parsed } = parseSafeCiDatabaseUrl(
    process.env.DATABASE_URL,
  );
  const suffix = randomBytes(8).toString("hex");
  const roleName = `${ROLE_PREFIX}${suffix}`;
  const fixtureTableName = `${TABLE_PREFIX}${suffix}`;
  const password = randomBytes(32).toString("hex");
  const role = quoteIdentifier(roleName);
  const fixtureTable = `public.${quoteIdentifier(fixtureTableName)}`;
  const database = quoteIdentifier(databaseName);
  const admin = new PrismaClient({ log: [] });
  let runtime = null;
  let roleCreated = false;
  let fixtureCreated = false;
  let baseline = null;

  try {
    const [server] = await admin.$queryRaw`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        current_setting('server_version_num')::int AS server_version_number,
        (
          SELECT rolsuper
          FROM pg_roles
          WHERE rolname = current_user
        ) AS is_superuser
    `;
    assert.equal(server.database_name, databaseName);
    assert.equal(
      Math.floor(server.server_version_number / 10_000),
      16,
      "Runtime-role smoke requires PostgreSQL 16.",
    );
    assert.equal(
      server.is_superuser,
      true,
      "Runtime-role smoke requires the disposable CI administrative identity.",
    );

    baseline = await readPublicPrivilegeBaseline(admin);
    await admin.$executeRawUnsafe(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    );
    await admin.$executeRawUnsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");

    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    roleCreated = true;
    await admin.$executeRawUnsafe(
      `REVOKE ALL ON DATABASE ${database} FROM ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
    );
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);

    await admin.$executeRawUnsafe(
      `CREATE TABLE ${fixtureTable} (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        payload text NOT NULL
      )`,
    );
    fixtureCreated = true;
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON TABLE public."_prisma_migrations" TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    );

    await assertCatalogContract(admin, roleName, fixtureTableName);

    runtime = new PrismaClient({
      datasources: {
        db: {
          url: runtimeDatabaseUrl(parsed, roleName, password),
        },
      },
      log: [],
    });
    await exerciseRuntimeDml(runtime, fixtureTableName);
    await exerciseRuntimeDenials(runtime, fixtureTableName);

    console.log(
      "Design-partner runtime-role smoke passed: isolated login role has exact application DML and read-only migration readiness, with no migration writes, ownership, membership, CREATE, DDL, BYPASSRLS, or grant option.",
    );
  } finally {
    if (runtime) {
      await runtime.$disconnect().catch(() => undefined);
    }

    if (fixtureCreated) {
      await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS ${fixtureTable}`);
    }
    if (roleCreated) {
      await admin.$executeRawUnsafe(`DROP OWNED BY ${role}`);
      await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
    }
    if (baseline) {
      await restorePublicPrivilegeBaseline(admin, databaseName, baseline);
    }
    await admin.$disconnect();
  }
}

function runSelfTest() {
  const safe = parseSafeCiDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  assert.throws(
    () =>
      parseSafeCiDatabaseUrl(
        "postgresql://postgres:test@db.internal:5432/leetplus_ci?schema=public",
      ),
    /loopback/,
  );
  assert.throws(
    () =>
      parseSafeCiDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
      ),
    /dedicated \*_ci database/,
  );
  assert.throws(
    () =>
      parseSafeCiDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public&options=unsafe",
      ),
    /only the schema query parameter/,
  );
  assert.equal(quoteIdentifier('safe"name'), '"safe""name"');
  console.log("Design-partner runtime-role smoke self-test passed.");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  await runSmoke();
}
